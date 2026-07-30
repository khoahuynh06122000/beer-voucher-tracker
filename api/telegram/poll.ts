/**
 * GET/POST /api/telegram/poll — Vercel Serverless Function (tương thích ngược).
 *
 * Trên production (Vercel) bot chạy ở chế độ WEBHOOK real-time nên KHÔNG cần
 * poll thủ công. Endpoint này giữ lại để nút "Kiểm tra tin nhắn" trong
 * AdminSettings không báo lỗi, và trả về thông báo trạng thái rõ ràng.
 *
 * (Tạm thời có nhánh chẩn đoán: nếu import botCore lỗi thì trả JSON mô tả lỗi
 * thay vì để function crash 500 — giúp xác định nguyên nhân trên Vercel.)
 */
import type { IncomingMessage, ServerResponse } from "node:http";

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

  let core: typeof import("../../server/botCore.js");
  try {
    core = await import("../../server/botCore.js");
  } catch (err: any) {
    res.writeHead(200);
    res.end(JSON.stringify({
      success: false,
      diag: "IMPORT_BOTCORE_FAILED",
      error: String(err?.stack || err?.message || err),
    }));
    return;
  }

  try {
    const botToken = await core.getTelegramBotToken();
    let webhookInfo: any = {};
    if (botToken) {
      const infoResp = await fetch(`https://api.telegram.org/bot${botToken}/getWebhookInfo`).catch(() => null);
      if (infoResp) webhookInfo = (await infoResp.json().catch(() => ({}))).result || {};
    }

    const hasWebhook = !!webhookInfo.url;
    res.writeHead(200);
    res.end(JSON.stringify({
      success: true,
      processedCount: 0,
      message: hasWebhook
        ? `✅ Bot đang chạy ở chế độ Webhook real-time (tự nhận & trả lời ngay). Không cần poll thủ công.`
        : `⚠️ Webhook chưa được đăng ký. Hãy bấm "Kích hoạt Bot" hoặc lưu lại Bot Token để đăng ký webhook.`,
      webhookUrl: webhookInfo.url || null,
      pendingUpdates: webhookInfo.pending_update_count ?? 0,
    }));
  } catch (err: any) {
    res.writeHead(200);
    res.end(JSON.stringify({ success: false, diag: "RUNTIME", error: String(err?.stack || err?.message || err) }));
  }
}
