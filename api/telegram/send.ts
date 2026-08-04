/**
 * POST /api/telegram/send — Vercel Serverless Function.
 * Proxy gửi tin nhắn Telegram (server gọi api.telegram.org) để tránh browser bị
 * chặn/CORS ("Failed to fetch") khi gọi thẳng Telegram từ trình duyệt (hay gặp ở VN).
 * Body: { botToken, chatId, message }
 */
import type { IncomingMessage, ServerResponse } from "node:http";
import { readJsonBody } from "../../server/botCore.js";

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Content-Type", "application/json");

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

  try {
    const { botToken, chatId, message } = await readJsonBody(req);
    if (!botToken || !chatId || !message) {
      res.writeHead(400);
      res.end(JSON.stringify({ success: false, message: "Thiếu botToken, chatId hoặc message" }));
      return;
    }

    const resp = await fetch(`https://api.telegram.org/bot${String(botToken).trim()}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: String(chatId).trim(),
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
