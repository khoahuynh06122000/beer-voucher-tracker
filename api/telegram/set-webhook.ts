/**
 * GET/POST /api/telegram/set-webhook — Vercel Serverless Function.
 *
 * Đăng ký Telegram Webhook trỏ về /api/telegram/webhook của chính domain này.
 * Được gọi tự động khi Admin lưu Bot Token (AdminSettings) và có thể gọi lại
 * thủ công bằng nút "Kích hoạt Bot".
 *
 * Webhook là mô hình đúng cho serverless: Telegram chủ động đẩy tin về, không
 * cần tiến trình chạy nền 24/7 (khác với polling của bản dev local).
 */
import type { IncomingMessage, ServerResponse } from "node:http";
import { getTelegramBotToken } from "../../server/botCore";

function resolveOrigin(req: IncomingMessage): string {
  const proto =
    (req.headers["x-forwarded-proto"] as string)?.split(",")[0] || "https";
  const host =
    (req.headers["x-forwarded-host"] as string)?.split(",")[0] ||
    (req.headers.host as string) ||
    "";
  return host ? `${proto}://${host}` : "";
}

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

  try {
    const url = new URL(req.url || "", `http://${req.headers.host || "localhost"}`);
    let botToken = (url.searchParams.get("botToken") || "").trim();
    let webhookUrl = (url.searchParams.get("webhookUrl") || "").trim();

    // Cho phép truyền qua body (POST JSON) nếu không có trên query
    if ((!botToken || !webhookUrl) && req.method === "POST") {
      const { readJsonBody } = await import("../../server/botCore");
      const body = await readJsonBody(req);
      botToken = botToken || (body.botToken || "").trim();
      webhookUrl = webhookUrl || (body.webhookUrl || "").trim();
    }

    if (!botToken) {
      botToken = await getTelegramBotToken();
    }
    if (!botToken) {
      res.writeHead(400);
      res.end(JSON.stringify({ success: false, message: "Chưa nhập / cấu hình Bot Token!" }));
      return;
    }

    if (!webhookUrl) {
      const origin = resolveOrigin(req);
      if (!origin) {
        res.writeHead(400);
        res.end(JSON.stringify({ success: false, message: "Không xác định được domain để đăng ký webhook." }));
        return;
      }
      webhookUrl = `${origin}/api/telegram/webhook`;
    }

    // 1) Xóa webhook cũ (nếu có) để tránh xung đột / trạng thái treo
    await fetch(`https://api.telegram.org/bot${botToken}/deleteWebhook?drop_pending_updates=false`).catch(() => {});

    // 2) Đăng ký webhook mới
    const setResp = await fetch(`https://api.telegram.org/bot${botToken}/setWebhook`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        url: webhookUrl,
        allowed_updates: ["message", "edited_message", "channel_post", "callback_query"],
        drop_pending_updates: false,
      }),
    });
    const setData = await setResp.json().catch(() => ({}));

    if (setResp.ok && setData.ok) {
      res.writeHead(200);
      res.end(JSON.stringify({
        success: true,
        message: `Đã kích hoạt Webhook Telegram thành công! Bot sẽ nhận & trả lời lệnh real-time tại ${webhookUrl}`,
        webhookUrl,
      }));
    } else {
      res.writeHead(400);
      res.end(JSON.stringify({
        success: false,
        message: `Lỗi đăng ký Webhook: ${setData.description || "Không rõ"}`,
      }));
    }
  } catch (err: any) {
    res.writeHead(500);
    res.end(JSON.stringify({ success: false, message: "Lỗi Server: " + (err?.message || String(err)) }));
  }
}
