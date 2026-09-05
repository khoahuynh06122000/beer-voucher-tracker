/**
 * POST /api/telegram/send — proxy gửi tin nhắn Telegram.
 * Body: { message }
 *
 * BẮT BUỘC đăng nhập. Bot token & chat id lấy từ BIẾN MÔI TRƯỜNG của server,
 * KHÔNG nhận từ client nữa.
 *
 * Trước đây endpoint nhận thẳng { botToken, chatId } do người gọi gửi lên và
 * không kiểm tra đăng nhập — tức là một trạm chuyển tiếp miễn phí: người lạ gọi
 * được, và client phải tải bot token về trình duyệt mới gọi được (ai mở tab
 * Network cũng đọc thấy token).
 */
import type { IncomingMessage, ServerResponse } from "node:http";
import { readJsonBody } from "../../server/botCore.js";
import { applyCors, requireAuth } from "../../server/authGuard.js";

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  applyCors(req, res);

  if (req.method === "OPTIONS") {
    res.writeHead(200);
    res.end(JSON.stringify({ ok: true }));
    return;
  }
  if (req.method !== "POST") {
    res.writeHead(405);
    res.end(JSON.stringify({ success: false, message: "Method Not Allowed" }));
    return;
  }

  const who = await requireAuth(req, res, "any");
  if (!who) return;

  const botToken = (process.env.TELEGRAM_BOT_TOKEN || "").trim();
  const chatId = (process.env.TELEGRAM_CHAT_ID || "").trim();
  if (!botToken || !chatId) {
    res.writeHead(500);
    res.end(
      JSON.stringify({
        success: false,
        message: "Server chưa cấu hình TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID trong biến môi trường Vercel.",
      })
    );
    return;
  }

  try {
    const { message } = await readJsonBody(req);
    if (!message) {
      res.writeHead(400);
      res.end(JSON.stringify({ success: false, message: "Thiếu nội dung tin nhắn." }));
      return;
    }

    const resp = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text: message,
        parse_mode: "HTML",
        disable_web_page_preview: false,
      }),
    });
    const data = await resp.json().catch(() => ({}));

    if (resp.ok && data.ok) {
      res.writeHead(200);
      res.end(JSON.stringify({ success: true, message: "Gửi tin nhắn Telegram thành công!" }));
    } else {
      res.writeHead(400);
      res.end(JSON.stringify({ success: false, message: data.description || "Lỗi Telegram API" }));
    }
  } catch (e: any) {
    res.writeHead(500);
    res.end(JSON.stringify({ success: false, message: e?.message || String(e) }));
  }
}
