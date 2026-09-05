/**
 * POST /api/telegram/send — proxy gửi tin nhắn Telegram.
 * Body: { message }
 *
 * BẮT BUỘC đăng nhập. Bot token & chat id do SERVER tự tra (biến môi trường
 * TELEGRAM_BOT_TOKEN/TELEGRAM_CHAT_ID, không có thì lấy cấu hình đã lưu trong
 * bảng settings) — KHÔNG nhận từ client nữa.
 *
 * Trước đây endpoint nhận thẳng { botToken, chatId } do người gọi gửi lên và
 * không kiểm tra đăng nhập — tức là một trạm chuyển tiếp miễn phí: người lạ gọi
 * được, và client phải tải bot token về trình duyệt mới gọi được (ai mở tab
 * Network cũng đọc thấy token).
 */
import type { IncomingMessage, ServerResponse } from "node:http";
import { readJsonBody, getFirestoreSetting } from "../../server/botCore.js";
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

  // getFirestoreSetting: ưu tiên biến môi trường, không có thì đọc cấu hình đã
  // lưu sẵn trong bảng settings. Nhờ vậy bot Telegram đang chạy KHÔNG phải khai
  // báo lại gì cả — điểm khác biệt là client không còn cầm token nữa.
  const [botToken, chatId] = await Promise.all([
    getFirestoreSetting("telegram_bot_token"),
    getFirestoreSetting("telegram_chat_id"),
  ]);
  if (!botToken || !chatId) {
    res.writeHead(500);
    res.end(
      JSON.stringify({
        success: false,
        message: "Server chưa có Telegram Bot Token / Chat ID.",
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
