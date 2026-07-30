/**
 * POST /api/telegram/webhook — Vercel Serverless Function.
 *
 * Telegram đẩy (push) mọi tin nhắn/lệnh về đây theo cơ chế Webhook.
 * Đây là "chiều về" của bot, thay cho vòng lặp polling (không sống được
 * trên môi trường serverless như Vercel).
 *
 * Đăng ký webhook bằng cách gọi /api/telegram/set-webhook (tự động chạy
 * khi Admin lưu Bot Token trong Cài Đặt).
 */
import type { IncomingMessage, ServerResponse } from "node:http";
import {
  getTelegramBotToken,
  processTelegramMessageCommand,
  readJsonBody,
} from "../../server/botCore.js";

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  res.setHeader("Content-Type", "application/json");

  if (req.method === "OPTIONS") {
    res.writeHead(200);
    res.end(JSON.stringify({ ok: true }));
    return;
  }

  try {
    const update = await readJsonBody(req);

    // Rút nội dung tin nhắn từ mọi loại update Telegram có thể gửi
    let textContent = "";
    let chatId: number | string | null = null;

    const msg =
      update.message ||
      update.edited_message ||
      update.channel_post ||
      update.edited_channel_post;

    if (msg) {
      textContent = msg.text || msg.caption || "";
      chatId = msg.chat?.id ?? null;
    } else if (update.callback_query) {
      textContent = update.callback_query.data || "";
      chatId =
        update.callback_query.message?.chat?.id ??
        update.callback_query.from?.id ??
        null;
    }

    // Luôn trả 200 để Telegram không retry, kể cả khi không có gì để xử lý
    if (!textContent || chatId == null) {
      res.writeHead(200);
      res.end(JSON.stringify({ ok: true, skipped: true }));
      return;
    }

    const botToken = await getTelegramBotToken();
    if (!botToken) {
      res.writeHead(200);
      res.end(JSON.stringify({ ok: true, error: "Chưa cấu hình Telegram Bot Token" }));
      return;
    }

    // Phải await xong (đã gửi reply) TRƯỚC khi kết thúc response, vì hàm
    // serverless có thể bị đóng băng ngay khi response gửi đi.
    await processTelegramMessageCommand(textContent, chatId, botToken);

    res.writeHead(200);
    res.end(JSON.stringify({ ok: true, processed: true }));
  } catch (err: any) {
    console.error("[TELEGRAM WEBHOOK ERR]", err);
    // Vẫn trả 200 để Telegram không dồn retry
    res.writeHead(200);
    res.end(JSON.stringify({ ok: true, error: err?.message || String(err) }));
  }
}
