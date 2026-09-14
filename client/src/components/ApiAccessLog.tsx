/**
 * Nhật ký máy gọi API — chỉ chủ hệ thống thấy.
 *
 * Mục đích: soi xem có máy lạ nào đang lấy dữ liệu không. Mỗi máy hiện một
 * dòng gồm ai gọi, địa chỉ IP, vị trí, thiết bị và lần gọi gần nhất.
 *
 * Số lượt chỉ mang tính tham khảo — nhiều tiến trình máy chủ cùng cập nhật một
 * dòng nên có thể hụt vài lượt. Mục đích là PHÁT HIỆN MÁY LẠ chứ không phải
 * đếm chính xác.
 */
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Bot, Globe, Loader2, Monitor, ShieldQuestion } from "lucide-react";
import { authFetchJson } from "@/lib/authFetch";

interface AccessEntry {
  who: string;
  kind: "user" | "report-token" | "cron";
  ip: string;
  city?: string;
  country?: string;
  ua?: string;
  count: number;
  firstSeen: string;
  lastSeen: string;
}

const KIND_LABEL: Record<AccessEntry["kind"], string> = {
  user: "Người dùng",
  "report-token": "Agent báo cáo",
  cron: "Hẹn giờ",
};

const fmt = (iso?: string) => {
  if (!iso) return "—";
  const d = new Date(iso);
  const p = (n: number) => n.toString().padStart(2, "0");
  return `${p(d.getDate())}/${p(d.getMonth() + 1)} ${p(d.getHours())}:${p(d.getMinutes())}`;
};

export function ApiAccessLog() {
  const [entries, setEntries] = useState<AccessEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [forbidden, setForbidden] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const data = await authFetchJson<{ entries: AccessEntry[] }>("/api/session?admin=log");
      setEntries(data.entries || []);
      setForbidden(false);
    } catch (e: any) {
      if (String(e?.message || "").includes("chủ hệ thống")) setForbidden(true);
      else toast.error(e?.message || "Không tải được nhật ký truy cập.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  if (forbidden) return null;

  return (
    <div className="rounded-2xl border border-border/60 bg-card/60 overflow-hidden">
      <div className="p-4 border-b border-border/60 flex items-center gap-3 flex-wrap">
        <div className="p-2 rounded-xl bg-blue-500/15 text-blue-600 dark:text-blue-400 shrink-0">
          <ShieldQuestion className="w-5 h-5" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-black text-foreground">
            Máy đang gọi API
            <span className="ml-2 px-2 py-0.5 rounded-md bg-muted text-muted-foreground text-[10px] font-extrabold uppercase">
              {entries.length} máy
            </span>
          </p>
          <p className="text-xs text-muted-foreground">
            Nhật ký của HÔM NAY. Máy mới xuất hiện sẽ được báo ngay về Telegram, và toàn bộ danh sách này bị xoá sau báo cáo 09:00 sáng mai.
          </p>
        </div>
        <button
          onClick={load}
          disabled={loading}
          className="text-[11px] font-bold px-2.5 py-1.5 rounded-lg border border-border hover:bg-muted text-muted-foreground hover:text-foreground transition-colors disabled:opacity-60"
        >
          {loading ? "Đang tải…" : "Tải lại"}
        </button>
      </div>

      {loading && entries.length === 0 ? (
        <p className="p-4 text-sm text-muted-foreground flex items-center gap-2">
          <Loader2 className="w-4 h-4 animate-spin" /> Đang tải…
        </p>
      ) : entries.length === 0 ? (
        <p className="p-4 text-sm text-muted-foreground">
          Hôm nay chưa có máy nào gọi API, hoặc nhật ký vừa được xoá sau báo cáo 09:00.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[11px] uppercase text-muted-foreground bg-muted/40">
                <th className="px-4 py-2 font-bold">Ai gọi</th>
                <th className="px-4 py-2 font-bold">Loại</th>
                <th className="px-4 py-2 font-bold">Địa chỉ IP</th>
                <th className="px-4 py-2 font-bold">Vị trí</th>
                <th className="px-4 py-2 font-bold">Thiết bị</th>
                <th className="px-4 py-2 font-bold text-right">Lượt</th>
                <th className="px-4 py-2 font-bold">Gần nhất</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((e) => (
                <tr key={`${e.who}|${e.ip}`} className="border-t border-border/50 hover:bg-muted/30">
                  <td className="px-4 py-2.5 font-bold whitespace-nowrap">
                    <span className="inline-flex items-center gap-1.5">
                      {e.kind === "report-token" ? (
                        <Bot className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                      ) : (
                        <Monitor className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                      )}
                      {e.who}
                    </span>
                  </td>
                  <td className="px-4 py-2.5">
                    <span className="px-2 py-0.5 rounded-md text-[10px] font-extrabold uppercase bg-muted text-muted-foreground whitespace-nowrap">
                      {KIND_LABEL[e.kind] || e.kind}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 font-mono text-xs whitespace-nowrap">{e.ip}</td>
                  <td className="px-4 py-2.5 text-xs text-muted-foreground whitespace-nowrap">
                    {e.city || e.country ? (
                      <span className="inline-flex items-center gap-1">
                        <Globe className="w-3 h-3 shrink-0" />
                        {[e.city, e.country].filter(Boolean).join(", ")}
                      </span>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-xs text-muted-foreground whitespace-nowrap">
                    {e.ua || "—"}
                  </td>
                  <td className="px-4 py-2.5 text-right font-mono">{e.count}</td>
                  <td className="px-4 py-2.5 text-xs text-muted-foreground whitespace-nowrap">
                    {fmt(e.lastSeen)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="px-4 py-3 text-[11px] text-muted-foreground border-t border-border/50">
        Máy mới xuất hiện được bắn ngay về Telegram nên anh không cần ngồi canh bảng này. Nhật ký tự xoá mỗi sáng sau báo cáo 09:00. Cột "Lượt" của <strong>agent báo cáo là số thật, đếm từng lượt gọi</strong>. Với người dùng trình duyệt thì chỉ ghi lại nhiều nhất 30 phút một lần để không làm chậm app, nên con số đó mang tính tham khảo.
      </p>
    </div>
  );
}
