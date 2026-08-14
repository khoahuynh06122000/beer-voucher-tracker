/**
 * Phân tích biến động TỶ LỆ VÉ HỦY theo 3 ngày gần nhất, cho cả 4 nhà hàng.
 *
 * Vì sao tách khỏi anomalyDetector: anomalyDetector trả lời "số liệu có bị nhập
 * thiếu không" (so trung vị 14 ngày, chỉ liệt kê ngày bất thường). Còn ở đây trả
 * lời "khách hủy nhiều hơn hay ít hơn mấy hôm trước" — luôn hiện đủ 4 nhà hàng
 * kể cả khi bình thường, để anh nhìn một phát biết nhà hàng nào đang xấu đi.
 *
 * Định nghĩa (bám đúng cách VoucherEntryForm tính):
 *   totalIssued = potatoCoupons + beerCoupons + cancelled
 *   postedBills = potatoCoupons + beerCoupons        (vé đổi thật)
 *   => tỷ lệ hủy = cancelled / totalIssued = 100% − tỷ lệ đổi
 *
 * Maison Kayser bị LOẠI khỏi báo cáo này: form chỉ nhập voucher bánh, cancelled
 * luôn ghi 0. Nếu để vào bảng thì sẽ hiện "hủy 0%" và bị đọc nhầm thành nhà hàng
 * hoàn hảo nhất. Không có dữ liệu thì không đưa vào, chứ không hiện số giả.
 *
 * So sánh dùng ĐIỂM PHẦN TRĂM (pp), không dùng % tương đối: 10% -> 20% là +10pp.
 * Nói "tăng 100%" trong trường hợp này gây hiểu nhầm về độ lớn thật.
 */

import type { VoucherRecord } from "./firestoreService";

/** Nhà hàng không nhập ô "vé hủy" -> loại khỏi báo cáo, không hiện 0% giả. */
export const NO_CANCEL_TRACKING = new Set(["maisonkayser"]);

/** Mức hủy tuyệt đối coi là cao, bất kể tăng hay giảm. */
export const HIGH_RATE = 0.25;
/** Ngưỡng biến động tính bằng điểm phần trăm so với trung bình 2 ngày trước. */
export const RISE_MILD = 0.05;
export const RISE_STRONG = 0.1;
export const RISE_SPIKE = 0.15;
/** Tỷ lệ hủy thấp tới mức này thì nghi là ngừng nhập, không phải hết hủy. */
export const NEAR_ZERO = 0.03;
/** Ngày có tổng phát hành quá nhỏ thì tỷ lệ nhiễu, không kết luận. */
export const MIN_ISSUED_FOR_RATE = 20;

export type CancelTrend =
  | "thieu_du_lieu"
  | "giam_dang_ngo"
  | "cai_thien"
  | "on_dinh"
  | "tang_nhe"
  | "tang_manh"
  | "tang_dot_bien";

export type CancelSeverity = "khong_ap_dung" | "binh_thuong" | "canh_bao" | "nghiem_trong";

/** Tỷ lệ hủy tăng là do khách hủy nhiều thật, hay do tổng phát hành co lại? */
export type CancelDriver =
  | "huy_that_tang"
  | "mau_so_co_lai"
  | "ca_hai"
  | "huy_giam_manh"
  | "khong_ro";

export interface DayCancel {
  date: string;
  totalIssued: number;
  cancelled: number;
  posted: number;
  /** 0..1 */
  rate: number;
}

export interface RestaurantCancelReport {
  restaurantId: string;
  restaurantName: string;
  /** Tối đa 3 ngày gần nhất CÓ dữ liệu, mới nhất đứng trước. */
  days: DayCancel[];
  latest: DayCancel | null;
  /** Trung bình tỷ lệ hủy 2 ngày trước đó (0..1). */
  prevAvgRate: number;
  /** Chênh lệch điểm phần trăm: rate mới nhất − prevAvgRate. Dương = xấu đi. */
  deltaPp: number;
  trend: CancelTrend;
  severity: CancelSeverity;
  driver: CancelDriver;
  /** Câu giải thích tỷ lệ hủy đến từ đâu, kèm số cụ thể. */
  driverText: string;
  /** Câu tóm tắt hiển thị ở dòng chính. */
  message: string;
  /** Việc cần nhà hàng kiểm tra/giải trình. Rỗng khi bình thường. */
  checklist: string[];
}

const RATE = (d: DayCancel) => d.rate;

function avg(nums: number[]): number {
  if (nums.length === 0) return 0;
  return nums.reduce((s, n) => s + n, 0) / nums.length;
}

export const formatPercent = (rate: number) => `${Math.round(rate * 1000) / 10}%`;
export const formatPp = (pp: number) => `${pp >= 0 ? "+" : "−"}${Math.abs(Math.round(pp * 1000) / 10)}pp`;

export const TREND_LABEL: Record<CancelTrend, string> = {
  thieu_du_lieu: "Chưa đủ dữ liệu",
  giam_dang_ngo: "Giảm đáng ngờ",
  cai_thien: "Cải thiện",
  on_dinh: "Ổn định",
  tang_nhe: "Tăng nhẹ",
  tang_manh: "Tăng mạnh",
  tang_dot_bien: "Tăng đột biến",
};

function classifyTrend(deltaPp: number, latestRate: number): CancelTrend {
  // Phân loại theo ĐÚNG con số hiển thị (làm tròn 0,1pp). Nếu so trực tiếp trên
  // số thực, sai số dấu phẩy động làm 10%->20%->30% ra 0.14999... và bị xếp
  // "tăng mạnh" trong khi bảng vẫn hiện "+15pp" — người đọc thấy mâu thuẫn.
  const d = Math.round(deltaPp * 1000) / 1000;
  if (d >= RISE_SPIKE) return "tang_dot_bien";
  if (d >= RISE_STRONG) return "tang_manh";
  if (d >= RISE_MILD) return "tang_nhe";
  // Rơi mạnh về sát 0 gần như luôn là NGỪNG NHẬP ô vé hủy, chứ không phải một
  // đêm khách hết bỏ vé. Gắn nhãn "cải thiện" ở đây là khen nhầm đúng cái lỗi
  // mà bảng này sinh ra để bắt.
  if (d <= -RISE_STRONG && latestRate <= NEAR_ZERO) return "giam_dang_ngo";
  if (d <= -RISE_MILD) return "cai_thien";
  return "on_dinh";
}

function classifySeverity(trend: CancelTrend, latestRate: number): CancelSeverity {
  if (trend === "tang_dot_bien") return "nghiem_trong";
  if (trend === "tang_manh" && latestRate >= HIGH_RATE) return "nghiem_trong";
  if (latestRate >= 0.4) return "nghiem_trong";
  if (trend === "giam_dang_ngo") return "canh_bao";
  if (trend === "tang_manh" || trend === "tang_nhe" || latestRate >= HIGH_RATE) return "canh_bao";
  return "binh_thuong";
}

/**
 * Tách nguyên nhân tỷ lệ hủy thay đổi: số vé hủy tăng thật, hay tổng phát hành
 * giảm làm mẫu số co lại? Hai cái này dẫn tới hành động khác hẳn nhau nên phải
 * phân biệt, không gộp thành "hủy nhiều".
 */
function analyzeDriver(latest: DayCancel, prev: DayCancel[]): { driver: CancelDriver; driverText: string } {
  const prevCancelled = avg(prev.map((d) => d.cancelled));
  const prevIssued = avg(prev.map((d) => d.totalIssued));

  const cancelChange = prevCancelled > 0 ? latest.cancelled / prevCancelled - 1 : latest.cancelled > 0 ? 1 : 0;
  const issuedChange = prevIssued > 0 ? latest.totalIssued / prevIssued - 1 : 0;

  const cancelUp = cancelChange >= 0.15;
  const cancelDown = cancelChange <= -0.15;
  const issuedDown = issuedChange <= -0.15;

  const soVe = `${latest.cancelled.toLocaleString("vi-VN")} vé hủy / ${latest.totalIssued.toLocaleString(
    "vi-VN"
  )} vé phát hành (2 ngày trước trung bình ${Math.round(prevCancelled).toLocaleString("vi-VN")} / ${Math.round(
    prevIssued
  ).toLocaleString("vi-VN")})`;

  if (cancelUp && issuedDown) {
    return {
      driver: "ca_hai",
      driverText: `Vừa hủy nhiều hơn vừa phát hành ít đi — ${soVe}. Đây là trường hợp xấu nhất: khách giảm mà tỷ lệ bỏ vé lại tăng.`,
    };
  }
  if (cancelUp) {
    return {
      driver: "huy_that_tang",
      driverText: `Số vé hủy tăng thật, không phải do mẫu số — ${soVe}. Tổng phát hành gần như giữ nguyên nên tỷ lệ tăng là do khách bỏ vé nhiều hơn.`,
    };
  }
  if (issuedDown) {
    return {
      driver: "mau_so_co_lai",
      driverText: `Số vé hủy gần như không đổi, nhưng tổng phát hành giảm ${Math.abs(
        Math.round(issuedChange * 100)
      )}% — ${soVe}. Tỷ lệ tăng chủ yếu do mẫu số co lại, chưa hẳn là khách bỏ vé nhiều hơn.`,
    };
  }
  if (cancelDown) {
    return {
      driver: "huy_giam_manh",
      driverText: `Số vé hủy giảm ${Math.abs(Math.round(cancelChange * 100))}% trong khi tổng phát hành gần như giữ nguyên — ${soVe}. Giảm nhanh như vậy thường là do ngừng nhập ô vé hủy, cần xác nhận lại trước khi coi là tín hiệu tốt.`,
    };
  }
  return {
    driver: "khong_ro",
    driverText: `Số vé hủy và tổng phát hành đều không đổi rõ rệt — ${soVe}.`,
  };
}

function buildChecklist(driver: CancelDriver, severity: CancelSeverity, latestRate: number): string[] {
  if (severity === "binh_thuong") return [];

  const common = [
    "Đối chiếu lại số vé hủy đã nhập với bill thực tế — có nhập nhầm ô hủy không?",
  ];

  if (driver === "huy_giam_manh") {
    return [
      "Xác nhận nhà hàng có còn nhập ô vé hủy hằng ngày không — hủy về gần 0 thường là bỏ trống ô, không phải hết hủy.",
      "Nếu đúng là không còn vé hủy, ghi lại lý do (đổi quy trình phát vé, đổi ca trực) để lần sau không bị nghi.",
      ...common,
    ];
  }

  if (driver === "mau_so_co_lai") {
    return [
      "Kiểm tra xem có nhập thiếu ca không — tổng phát hành giảm mạnh thường là do sót ca, không phải khách hủy.",
      ...common,
    ];
  }

  const causes = [
    "Ca nào phát sinh hủy nhiều nhất — sáng, trưa hay tối?",
    "Có đoàn khách nào hủy hàng loạt (tour, sự kiện, đặt trước) không?",
    "Bếp/bar có lúc nào hết món, chờ quá lâu khiến khách bỏ vé không?",
    "Vé có bị phát trùng hoặc phát cho khách không đủ điều kiện rồi phải hủy không?",
  ];

  if (latestRate >= 0.4) {
    causes.unshift("Tỷ lệ hủy trên 40% là bất thường ở mức phải giải trình ngay trong ngày.");
  }

  return [...causes, ...common];
}

/**
 * Dựng báo cáo hủy cho các nhà hàng CÓ theo dõi vé hủy. Luôn trả về đủ dòng cho
 * mọi nhà hàng đó, kể cả nhà hàng chưa nhập gì — để không ai lọt khỏi báo cáo
 * chỉ vì thiếu dữ liệu (thiếu dữ liệu tự nó đã là thông tin cần biết).
 */
export function analyzeCancellations(
  records: VoucherRecord[],
  restaurants: { id: string; name: string }[]
): RestaurantCancelReport[] {
  // Dùng object thay Map: tsconfig của dự án đang để target thấp nên duyệt
  // Map/Set bằng spread sẽ lỗi TS2802. Object.keys thì không vướng.
  const byRestaurant: Record<string, Record<string, VoucherRecord>> = {};
  for (const r of records) {
    if (!r.restaurantId || !r.date) continue;
    if (!byRestaurant[r.restaurantId]) byRestaurant[r.restaurantId] = {};
    byRestaurant[r.restaurantId][r.date] = r; // trùng ngày thì giữ bản ghi sau
  }

  return restaurants
    .filter(({ id }) => !NO_CANCEL_TRACKING.has(id))
    .map(({ id, name }) => {
      const base: RestaurantCancelReport = {
        restaurantId: id,
        restaurantName: name,
        days: [],
        latest: null,
        prevAvgRate: 0,
        deltaPp: 0,
        trend: "thieu_du_lieu",
        severity: "khong_ap_dung",
        driver: "khong_ro",
        driverText: "",
        message: "Chưa đủ dữ liệu 3 ngày gần nhất để đánh giá biến động.",
        checklist: [],
      };

      const byDate = byRestaurant[id] || {};
      const dates = Object.keys(byDate).sort((a, b) => b.localeCompare(a));
      const days: DayCancel[] = [];
      for (const d of dates) {
        const rec = byDate[d];
        const totalIssued = rec.totalIssued || 0;
        if (totalIssued < MIN_ISSUED_FOR_RATE) continue; // ngày quá nhỏ, tỷ lệ nhiễu
        const cancelled = rec.cancelled || 0;
        days.push({
          date: d,
          totalIssued,
          cancelled,
          posted: rec.postedBills || totalIssued - cancelled,
          rate: cancelled / totalIssued,
        });
        if (days.length === 3) break;
      }

      if (days.length === 0) return base;

      const latest = days[0];
      const prev = days.slice(1);

      if (prev.length === 0) {
        return {
          ...base,
          days,
          latest,
          message: `Mới có dữ liệu ngày ${latest.date}, tỷ lệ hủy ${formatPercent(
            latest.rate
          )}. Cần thêm ngày trước đó mới so sánh được biến động.`,
        };
      }

      const prevAvgRate = avg(prev.map(RATE));
      const deltaPp = latest.rate - prevAvgRate;
      const trend = classifyTrend(deltaPp, latest.rate);
      const severity = classifySeverity(trend, latest.rate);
      const { driver, driverText } = analyzeDriver(latest, prev);

      const chuoi = days
        .map((d) => formatPercent(d.rate))
        .reverse()
        .join(" → ");

      return {
        restaurantId: id,
        restaurantName: name,
        days,
        latest,
        prevAvgRate,
        deltaPp,
        trend,
        severity,
        driver,
        driverText,
        message: `Tỷ lệ hủy 3 ngày: ${chuoi} (${formatPp(deltaPp)} so với trung bình 2 ngày trước).`,
        checklist: buildChecklist(driver, severity, latest.rate),
      };
    });
}

/** Ngày sớm nhất cần lấy dữ liệu để chắc chắn đủ 3 ngày có số. */
export function cancellationStartDate(today: string, lookbackDays = 10): string {
  const d = new Date(today + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() - lookbackDays);
  return d.toISOString().slice(0, 10);
}
