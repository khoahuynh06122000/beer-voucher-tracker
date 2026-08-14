import { useEffect, useMemo, useState } from "react";
import { ChevronDown, ChevronUp, MinusCircle, TrendingDown, TrendingUp, XCircle } from "lucide-react";
import { getVouchersByDateRange, getLocalDateString } from "@/lib/firestoreService";
import {
  analyzeCancellations,
  cancellationStartDate,
  formatPercent,
  formatPp,
  TREND_LABEL,
  type CancelSeverity,
  type RestaurantCancelReport,
} from "@/lib/cancellationAnalyzer";

// Maison Kayser bị analyzeCancellations loại tự động (không nhập vé hủy), nên
// vẫn liệt kê đủ ở đây để danh sách khớp với các màn hình khác.
const RESTAURANTS = [
  { id: "lehoibia", name: "Lê Hội Bia" },
  { id: "1901", name: "Nhà Hàng 1901" },
  { id: "beerplaza", name: "Beer Plaza" },
  { id: "maisonkayser", name: "Maison Kayser" },
];

const formatDate = (iso: string) => {
  const [, m, d] = iso.split("-");
  return `${d}/${m}`;
};

const SEVERITY_STYLE: Record<CancelSeverity, string> = {
  nghiem_trong: "bg-red-500/15 text-red-600 dark:text-red-400",
  canh_bao: "bg-amber-500/15 text-amber-700 dark:text-amber-400",
  binh_thuong: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400",
  khong_ap_dung: "bg-muted text-muted-foreground",
};

function TrendIcon({ r }: { r: RestaurantCancelReport }) {
  if (r.trend === "thieu_du_lieu" || r.trend === "on_dinh")
    return <MinusCircle className="w-4 h-4 text-muted-foreground shrink-0" />;
  if (r.trend === "cai_thien") return <TrendingDown className="w-4 h-4 text-emerald-500 shrink-0" />;
  // Hủy rơi về sát 0: vẫn là mũi tên xuống nhưng màu cảnh báo, không phải tin tốt.
  if (r.trend === "giam_dang_ngo") return <TrendingDown className="w-4 h-4 text-amber-500 shrink-0" />;
  return (
    <TrendingUp
      className={`w-4 h-4 shrink-0 ${r.severity === "nghiem_trong" ? "text-red-500" : "text-amber-500"}`}
    />
  );
}

interface Props {
  refreshTrigger?: number;
}

export function CancellationReport({ refreshTrigger = 0 }: Props) {
  const [reports, setReports] = useState<RestaurantCancelReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [openId, setOpenId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const today = getLocalDateString();
        const records = await getVouchersByDateRange(null, cancellationStartDate(today), today);
        if (!cancelled) setReports(analyzeCancellations(records, RESTAURANTS));
      } catch (e) {
        console.error("Không phân tích được tỷ lệ hủy:", e);
        if (!cancelled) setReports([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [refreshTrigger]);

  const alertCount = useMemo(
    () => reports.filter((r) => r.severity === "nghiem_trong" || r.severity === "canh_bao").length,
    [reports]
  );
  const severeCount = useMemo(() => reports.filter((r) => r.severity === "nghiem_trong").length, [reports]);

  if (loading) {
    return (
      <div className="rounded-2xl border border-border/60 bg-card/60 p-4 text-sm text-muted-foreground">
        Đang phân tích tỷ lệ vé hủy…
      </div>
    );
  }

  if (reports.length === 0) return null;

  return (
    <div className="rounded-2xl border border-border/60 bg-card/60 overflow-hidden">
      <div className="p-4 border-b border-border/60 flex items-center gap-3">
        <div
          className={`p-2 rounded-xl shrink-0 ${
            severeCount > 0
              ? "bg-red-500/15 text-red-600 dark:text-red-400"
              : alertCount > 0
                ? "bg-amber-500/15 text-amber-700 dark:text-amber-400"
                : "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400"
          }`}
        >
          <XCircle className="w-5 h-5" />
        </div>
        <div>
          <p className="text-sm font-black text-foreground">
            Biến động vé hủy — {reports.length} nhà hàng
            {severeCount > 0 && (
              <span className="ml-2 px-2 py-0.5 rounded-md bg-red-500/15 text-red-600 dark:text-red-400 text-[10px] font-extrabold uppercase">
                {severeCount} nghiêm trọng
              </span>
            )}
          </p>
          <p className="text-xs text-muted-foreground">
            Tỷ lệ hủy = vé hủy / tổng phát hành. Ngày mới nhất so với trung bình 2 ngày liền trước, tính
            bằng điểm phần trăm (pp).
          </p>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-[11px] uppercase text-muted-foreground bg-muted/40">
              <th className="px-4 py-2 font-bold">Nhà hàng</th>
              <th className="px-4 py-2 font-bold">3 ngày gần nhất (cũ → mới)</th>
              <th className="px-4 py-2 font-bold text-right">Hiện tại</th>
              <th className="px-4 py-2 font-bold text-right">Chênh</th>
              <th className="px-4 py-2 font-bold">Biến động</th>
              <th className="px-4 py-2 font-bold w-8" />
            </tr>
          </thead>
          <tbody>
            {reports.map((r) => {
              const isOpen = openId === r.restaurantId;
              const hasDetail = r.days.length > 0;
              return [
                <tr
                  key={r.restaurantId}
                  className={`border-t border-border/50 ${hasDetail ? "hover:bg-muted/30 cursor-pointer" : ""}`}
                  onClick={() => hasDetail && setOpenId(isOpen ? null : r.restaurantId)}
                >
                  <td className="px-4 py-2.5 font-bold whitespace-nowrap">{r.restaurantName}</td>
                  <td className="px-4 py-2.5 font-mono text-xs text-muted-foreground whitespace-nowrap">
                    {r.days.length > 0
                      ? [...r.days]
                          .reverse()
                          .map((d) => `${formatDate(d.date)} ${formatPercent(d.rate)}`)
                          .join("  →  ")
                      : "—"}
                  </td>
                  <td className="px-4 py-2.5 text-right font-mono font-bold whitespace-nowrap">
                    {r.latest ? formatPercent(r.latest.rate) : "—"}
                  </td>
                  <td
                    className={`px-4 py-2.5 text-right font-mono font-bold whitespace-nowrap ${
                      r.trend === "cai_thien"
                        ? "text-emerald-600 dark:text-emerald-400"
                        : r.severity === "nghiem_trong" || r.severity === "canh_bao"
                          ? "text-red-600 dark:text-red-400"
                          : "text-muted-foreground"
                    }`}
                  >
                    {r.days.length >= 2 ? formatPp(r.deltaPp) : "—"}
                  </td>
                  <td className="px-4 py-2.5">
                    <span className="inline-flex items-center gap-1.5">
                      <TrendIcon r={r} />
                      <span
                        className={`px-2 py-0.5 rounded-md text-[10px] font-extrabold uppercase whitespace-nowrap ${
                          SEVERITY_STYLE[r.severity]
                        }`}
                      >
                        {TREND_LABEL[r.trend]}
                      </span>
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-muted-foreground">
                    {hasDetail &&
                      (isOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />)}
                  </td>
                </tr>,

                isOpen && (
                  <tr key={`${r.restaurantId}_detail`} className="border-t border-border/30 bg-muted/20">
                    <td colSpan={6} className="px-4 py-3 space-y-3">
                      <div>
                        <p className="text-[11px] uppercase font-bold text-muted-foreground mb-1">
                          Mức hủy hiện tại đến từ đâu
                        </p>
                        <p className="text-xs text-foreground">{r.driverText || r.message}</p>
                      </div>

                      {r.days.length > 0 && (
                        <div className="overflow-x-auto">
                          <table className="text-xs font-mono">
                            <thead>
                              <tr className="text-muted-foreground">
                                <th className="pr-6 py-1 text-left font-bold">Ngày</th>
                                <th className="pr-6 py-1 text-right font-bold">Phát hành</th>
                                <th className="pr-6 py-1 text-right font-bold">Đổi thật</th>
                                <th className="pr-6 py-1 text-right font-bold">Hủy</th>
                                <th className="py-1 text-right font-bold">Tỷ lệ hủy</th>
                              </tr>
                            </thead>
                            <tbody>
                              {[...r.days].reverse().map((d) => (
                                <tr key={d.date}>
                                  <td className="pr-6 py-1">{formatDate(d.date)}</td>
                                  <td className="pr-6 py-1 text-right">
                                    {d.totalIssued.toLocaleString("vi-VN")}
                                  </td>
                                  <td className="pr-6 py-1 text-right">{d.posted.toLocaleString("vi-VN")}</td>
                                  <td className="pr-6 py-1 text-right text-red-600 dark:text-red-400">
                                    {d.cancelled.toLocaleString("vi-VN")}
                                  </td>
                                  <td className="py-1 text-right font-bold">{formatPercent(d.rate)}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}

                      {r.checklist.length > 0 && (
                        <div>
                          <p className="text-[11px] uppercase font-bold text-amber-700 dark:text-amber-400 mb-1">
                            Yêu cầu {r.restaurantName} giải trình
                          </p>
                          <ul className="text-xs text-foreground space-y-1 list-disc pl-4">
                            {r.checklist.map((c) => (
                              <li key={c}>{c}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </td>
                  </tr>
                ),
              ];
            })}
          </tbody>
        </table>
      </div>

      <p className="px-4 py-3 text-[11px] text-muted-foreground border-t border-border/50">
        Tỷ lệ hủy tăng có hai nguồn khác hẳn nhau: khách bỏ vé nhiều hơn thật, hoặc tổng phát hành giảm làm
        mẫu số co lại. Bảng đã tách sẵn hai trường hợp này — bấm vào từng nhà hàng để xem. Đây là dấu hiệu
        để yêu cầu giải trình, chưa phải kết luận.
      </p>
    </div>
  );
}
