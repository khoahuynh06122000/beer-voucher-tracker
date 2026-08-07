import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, CalendarX, CheckCircle2, ChevronDown, ChevronUp, ShieldAlert } from "lucide-react";
import { getVouchersByDateRange, getLocalDateString } from "@/lib/firestoreService";
import { detectAnomalies, baselineStartDate, type Anomaly } from "@/lib/anomalyDetector";

const ACK_KEY = "beer_voucher_anomaly_ack";

function loadAcks(): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem(ACK_KEY) || "[]") as string[]);
  } catch {
    return new Set();
  }
}

function saveAck(key: string) {
  const acks = loadAcks();
  acks.add(key);
  localStorage.setItem(ACK_KEY, JSON.stringify([...acks]));
}

const anomalyKey = (a: Anomaly) => `${a.restaurantId}_${a.date}_${a.type}`;

const formatDate = (iso: string) => {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
};

interface Props {
  /** null = xem tất cả nhà hàng (admin). Chuỗi = chỉ nhà hàng đó. */
  restaurantId: string | null;
  /** banner: gọn, cho nhà hàng. panel: bảng đầy đủ, cho admin. */
  variant: "banner" | "panel";
  refreshTrigger?: number;
}

export function AnomalyAlert({ restaurantId, variant, refreshTrigger = 0 }: Props) {
  const [anomalies, setAnomalies] = useState<Anomaly[]>([]);
  const [loading, setLoading] = useState(true);
  const [acks, setAcks] = useState<Set<string>>(() => loadAcks());
  const [expanded, setExpanded] = useState(variant === "panel");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const today = getLocalDateString();
        const records = await getVouchersByDateRange(restaurantId, baselineStartDate(today), today);
        if (!cancelled) setAnomalies(detectAnomalies(records, { today }));
      } catch (e) {
        console.error("Không quét được số liệu bất thường:", e);
        if (!cancelled) setAnomalies([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [restaurantId, refreshTrigger]);

  const visible = useMemo(
    () => (variant === "banner" ? anomalies.filter((a) => !acks.has(anomalyKey(a))) : anomalies),
    [anomalies, acks, variant]
  );

  const acknowledge = (a: Anomaly) => {
    saveAck(anomalyKey(a));
    setAcks(loadAcks());
  };

  if (loading || visible.length === 0) {
    // Panel của admin vẫn hiện trạng thái "sạch" để anh biết là đã quét, không phải lỗi.
    if (variant === "panel" && !loading) {
      return (
        <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/5 p-4 flex items-center gap-3">
          <CheckCircle2 className="w-5 h-5 text-emerald-500 shrink-0" />
          <div>
            <p className="text-sm font-bold text-emerald-700 dark:text-emerald-300">
              Không phát hiện số liệu bất thường trong 14 ngày qua
            </p>
            <p className="text-xs text-muted-foreground">
              Đã đối chiếu từng nhà hàng với trung vị 14 ngày của chính nhà hàng đó.
            </p>
          </div>
        </div>
      );
    }
    return null;
  }

  const severeCount = visible.filter((a) => a.severity === "nghiem_trong").length;

  // ---------- BANNER: nhà hàng thấy ngay khi đăng nhập ----------
  if (variant === "banner") {
    return (
      <div className="rounded-2xl border border-red-500/40 bg-red-500/5 dark:bg-red-500/10 overflow-hidden shadow-sm">
        <button
          onClick={() => setExpanded((v) => !v)}
          className="w-full flex items-center gap-3 p-4 text-left hover:bg-red-500/5 transition-colors"
        >
          <div className="p-2 rounded-xl bg-red-500/15 text-red-600 dark:text-red-400 shrink-0">
            <ShieldAlert className="w-5 h-5" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-black text-red-700 dark:text-red-300">
              Có {visible.length} ngày số liệu cần bạn kiểm tra lại
            </p>
            <p className="text-xs text-muted-foreground">
              Số thấp bất thường hoặc thiếu báo cáo — có thể do nhập nhầm chỗ hoặc nhập thiếu.
            </p>
          </div>
          {expanded ? (
            <ChevronUp className="w-4 h-4 text-muted-foreground shrink-0" />
          ) : (
            <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" />
          )}
        </button>

        {expanded && (
          <div className="px-4 pb-4 space-y-2">
            {visible.map((a) => (
              <div
                key={anomalyKey(a)}
                className="rounded-xl border border-border/60 bg-card/80 p-3 flex items-start gap-3"
              >
                {a.type === "thieu_bao_cao" ? (
                  <CalendarX className="w-4 h-4 text-red-500 mt-0.5 shrink-0" />
                ) : (
                  <AlertTriangle className="w-4 h-4 text-amber-500 mt-0.5 shrink-0" />
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-foreground">
                    Ngày {formatDate(a.date)}
                    <span
                      className={`ml-2 px-2 py-0.5 rounded-md text-[10px] font-extrabold uppercase ${
                        a.severity === "nghiem_trong"
                          ? "bg-red-500/15 text-red-600 dark:text-red-400"
                          : "bg-amber-500/15 text-amber-700 dark:text-amber-400"
                      }`}
                    >
                      {a.type === "thieu_bao_cao" ? "Thiếu báo cáo" : `Giảm ${a.dropPercent}%`}
                    </span>
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">{a.message}</p>
                </div>
                <button
                  onClick={() => acknowledge(a)}
                  className="text-[11px] font-bold px-2.5 py-1.5 rounded-lg border border-border hover:bg-muted text-muted-foreground hover:text-foreground transition-colors shrink-0 active:scale-95"
                  title="Ẩn cảnh báo này nếu số liệu thực tế đúng như vậy"
                >
                  Số đúng, ẩn đi
                </button>
              </div>
            ))}
            <p className="text-[11px] text-muted-foreground pt-1">
              Nếu ngày đó bạn đã nhập ở link cũ thì số sẽ không về hệ thống — vui lòng nhập lại tại đây.
            </p>
          </div>
        )}
      </div>
    );
  }

  // ---------- PANEL: admin rà toàn hệ thống ----------
  return (
    <div className="rounded-2xl border border-red-500/30 bg-card/60 overflow-hidden">
      <div className="p-4 border-b border-border/60 flex items-center gap-3">
        <div className="p-2 rounded-xl bg-red-500/15 text-red-600 dark:text-red-400">
          <ShieldAlert className="w-5 h-5" />
        </div>
        <div>
          <p className="text-sm font-black text-foreground">
            Cảnh báo số liệu bất thường — {visible.length} ngày
            {severeCount > 0 && (
              <span className="ml-2 px-2 py-0.5 rounded-md bg-red-500/15 text-red-600 dark:text-red-400 text-[10px] font-extrabold uppercase">
                {severeCount} nghiêm trọng
              </span>
            )}
          </p>
          <p className="text-xs text-muted-foreground">
            So sánh với trung vị 14 ngày của từng nhà hàng, ngưỡng giảm 40%. Hôm nay không tính.
          </p>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-[11px] uppercase text-muted-foreground bg-muted/40">
              <th className="px-4 py-2 font-bold">Ngày</th>
              <th className="px-4 py-2 font-bold">Nhà hàng</th>
              <th className="px-4 py-2 font-bold text-right">Thực tế</th>
              <th className="px-4 py-2 font-bold text-right">Mức thường ngày</th>
              <th className="px-4 py-2 font-bold text-right">Chênh</th>
              <th className="px-4 py-2 font-bold">Loại</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((a) => (
              <tr key={anomalyKey(a)} className="border-t border-border/50 hover:bg-muted/30">
                <td className="px-4 py-2.5 font-bold whitespace-nowrap">{formatDate(a.date)}</td>
                <td className="px-4 py-2.5">{a.restaurantName}</td>
                <td className="px-4 py-2.5 text-right font-mono font-bold text-red-600 dark:text-red-400">
                  {a.totalIssued.toLocaleString("vi-VN")}
                </td>
                <td className="px-4 py-2.5 text-right font-mono text-muted-foreground">
                  {a.baseline ? a.baseline.toLocaleString("vi-VN") : "—"}
                </td>
                <td className="px-4 py-2.5 text-right font-mono font-bold">-{a.dropPercent}%</td>
                <td className="px-4 py-2.5">
                  <span
                    className={`px-2 py-0.5 rounded-md text-[10px] font-extrabold uppercase whitespace-nowrap ${
                      a.type === "thieu_bao_cao"
                        ? "bg-red-500/15 text-red-600 dark:text-red-400"
                        : "bg-amber-500/15 text-amber-700 dark:text-amber-400"
                    }`}
                  >
                    {a.type === "thieu_bao_cao" ? "Thiếu báo cáo" : "Giảm bất thường"}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="px-4 py-3 text-[11px] text-muted-foreground border-t border-border/50">
        Đây là dấu hiệu để kiểm tra, chưa phải kết luận sai. Nguyên nhân thường gặp: nhà hàng nhập ở
        link cũ, nhập thiếu ca, hoặc ngày đó vắng khách thật.
      </p>
    </div>
  );
}
