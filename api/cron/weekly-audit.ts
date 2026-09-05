/**
 * GET/POST /api/cron/weekly-audit — Vercel Serverless Function.
 *
 * Đối soát phòng ngừa hàng tuần: AI rà số liệu 7 ngày gần nhất, chọn 1 ngày
 * nghi ngờ sai số nhất, chạy Gemini soi ảnh ngày đó, rồi gửi báo cáo về Telegram.
 *
 * Lịch tự động chạy vào THỨ 2 được kích hoạt từ /api/cron/trigger-09am (để không
 * vượt giới hạn 2 cron của Vercel Hobby). Endpoint này cũng cho phép chạy TAY
 * bất cứ lúc nào để kiểm thử.
 */
import type { IncomingMessage, ServerResponse } from "node:http";
import { requireCronOrAdmin } from "../../server/authGuard.js";
import { runWeeklyPreventiveAudit } from "../../server/botCore.js";

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  res.setHeader("Content-Type", "application/json");
  if (!(await requireCronOrAdmin(req, res))) return;

  try {
    // ?dryRun=1 -> chạy đủ logic nhưng KHÔNG gửi Telegram (để kiểm thử an toàn)
    const url = new URL(req.url || "", `http://${req.headers.host || "localhost"}`);
    const dryRun = url.searchParams.get("dryRun") === "1" || url.searchParams.get("test") === "1";

    const r = await runWeeklyPreventiveAudit({ send: !dryRun });
    res.writeHead(200);
    res.end(JSON.stringify({
      success: true,
      dryRun,
      chosenDate: r.chosenDate,
      reason: r.reason,
      telegramSent: r.sent,
      summary: r.results.map((x) => ({ restaurant: x.restaurantName, status: x.status })),
    }));
  } catch (e: any) {
    res.writeHead(500);
    res.end(JSON.stringify({ success: false, error: e?.message || String(e) }));
  }
}
