/**
 * Phát hiện số liệu voucher bất thường.
 *
 * Bối cảnh: 04-07/08/2026 có nhà hàng nhập ở link cũ nên data không về hệ thống,
 * và Beer Plaza 01-03/08 tụt còn 549/352/312 trong khi mọi ngày khác 1000-1800
 * -> nghi nhập thiếu. Cần bắt sớm thay vì đợi cuối tháng chốt sổ mới phát hiện.
 *
 * Nguyên tắc:
 * - So với TRUNG VỊ (median) 14 ngày gần nhất của CHÍNH nhà hàng đó, không so
 *   trung bình — vì một ngày lễ đột biến sẽ kéo lệch trung bình và làm mù cảnh báo.
 * - Mỗi nhà hàng có mặt bằng riêng (Maison Kayser ~2000, Lê Hội Bia ~700) nên
 *   không dùng một ngưỡng tuyệt đối chung.
 * - Đây là cảnh báo để NGƯỜI kiểm tra lại, không phải kết luận sai/đúng.
 */

import type { VoucherRecord } from "./firestoreService";

export const DEFAULT_DROP_THRESHOLD = 0.4; // giảm >40% so với trung vị
export const BASELINE_WINDOW = 14; // số ngày lấy làm nền so sánh
export const MIN_SAMPLE = 5; // dưới 5 ngày lịch sử thì chưa đủ cơ sở để kết luận
const SEVERE_DROP = 0.6; // giảm >60% -> nghiêm trọng

export type AnomalyType = "giam_bat_thuong" | "thieu_bao_cao";
export type AnomalySeverity = "canh_bao" | "nghiem_trong";

export interface Anomaly {
  restaurantId: string;
  restaurantName: string;
  date: string;
  type: AnomalyType;
  severity: AnomalySeverity;
  /** Số thực tế đã nhập (0 nếu là ngày thiếu báo cáo) */
  totalIssued: number;
  /** Trung vị 14 ngày trước đó */
  baseline: number;
  /** % giảm so với trung vị, làm tròn */
  dropPercent: number;
  message: string;
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 === 0 ? (s[mid - 1] + s[mid]) / 2 : s[mid];
}

function addDays(iso: string, n: number): string {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export interface DetectOptions {
  /** Ngưỡng giảm, mặc định 0.4 (40%) */
  dropThreshold?: number;
  /** Chỉ trả về bất thường trong N ngày gần nhất. Mặc định 14. */
  recentDays?: number;
  /** Ngày hôm nay (YYYY-MM-DD) — luôn bỏ qua, vì nhà hàng có thể chưa nhập. */
  today?: string;
}

/**
 * Quét danh sách voucher, trả về các ngày bất thường (mới nhất trước).
 * Records có thể của nhiều nhà hàng, không cần sắp xếp trước.
 */
export function detectAnomalies(records: VoucherRecord[], options: DetectOptions = {}): Anomaly[] {
  const dropThreshold = options.dropThreshold ?? DEFAULT_DROP_THRESHOLD;
  const recentDays = options.recentDays ?? 14;
  const today = options.today ?? new Date().toISOString().slice(0, 10);

  // Gom theo nhà hàng
  const byRestaurant = new Map<string, VoucherRecord[]>();
  for (const r of records) {
    if (!r.restaurantId || !r.date) continue;
    const list = byRestaurant.get(r.restaurantId) || [];
    list.push(r);
    byRestaurant.set(r.restaurantId, list);
  }

  const cutoff = addDays(today, -recentDays);
  const out: Anomaly[] = [];

  for (const [restaurantId, rawList] of byRestaurant) {
    // Bỏ trùng ngày (giữ bản ghi cuối), sắp xếp tăng dần
    const byDate = new Map<string, VoucherRecord>();
    for (const r of rawList) byDate.set(r.date, r);
    const list = [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
    if (list.length === 0) continue;

    const restaurantName = list[list.length - 1].restaurantName || restaurantId;

    // --- 1. Ngày có số nhưng tụt bất thường ---
    for (let i = 0; i < list.length; i++) {
      const cur = list[i];
      if (cur.date < cutoff || cur.date >= today) continue;

      const window = list.slice(Math.max(0, i - BASELINE_WINDOW), i).map((r) => r.totalIssued || 0);
      if (window.length < MIN_SAMPLE) continue;

      const baseline = median(window);
      if (baseline <= 0) continue;

      const value = cur.totalIssued || 0;
      const drop = 1 - value / baseline;
      if (drop <= dropThreshold) continue;

      const dropPercent = Math.round(drop * 100);
      out.push({
        restaurantId,
        restaurantName,
        date: cur.date,
        type: "giam_bat_thuong",
        severity: drop >= SEVERE_DROP ? "nghiem_trong" : "canh_bao",
        totalIssued: value,
        baseline: Math.round(baseline),
        dropPercent,
        message: `Chỉ ${value.toLocaleString("vi-VN")} voucher, thấp hơn ${dropPercent}% so với mức thường ngày (${Math.round(
          baseline
        ).toLocaleString("vi-VN")}). Kiểm tra xem đã nhập đủ chưa.`,
      });
    }

    // --- 2. Ngày trống giữa chừng (đã từng nhập trước và sau, riêng ngày đó mất) ---
    const first = list[0].date;
    const last = list[list.length - 1].date;
    for (let d = addDays(first, 1); d < last; d = addDays(d, 1)) {
      if (byDate.has(d)) continue;
      if (d < cutoff || d >= today) continue;

      const idx = list.findIndex((r) => r.date > d);
      const window = list.slice(Math.max(0, idx - BASELINE_WINDOW), idx).map((r) => r.totalIssued || 0);
      const baseline = window.length >= MIN_SAMPLE ? median(window) : 0;

      out.push({
        restaurantId,
        restaurantName,
        date: d,
        type: "thieu_bao_cao",
        severity: "nghiem_trong",
        totalIssued: 0,
        baseline: Math.round(baseline),
        dropPercent: 100,
        message: baseline
          ? `Không có báo cáo nào, trong khi ngày thường đạt khoảng ${Math.round(baseline).toLocaleString(
              "vi-VN"
            )} voucher. Vui lòng nhập bù.`
          : `Không có báo cáo nào cho ngày này. Vui lòng nhập bù.`,
      });
    }
  }

  return out.sort((a, b) => b.date.localeCompare(a.date) || a.restaurantId.localeCompare(b.restaurantId));
}

/** Khoá ngày bắt đầu cần lấy dữ liệu để đủ nền so sánh. */
export function baselineStartDate(today: string, recentDays = 14): string {
  return addDays(today, -(recentDays + BASELINE_WINDOW + 1));
}
