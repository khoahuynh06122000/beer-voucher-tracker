/**
 * GET/POST /api/cron/trigger-09am — Vercel Serverless Function.
 *
 * Quét trạng thái thiếu báo cáo và gửi cảnh báo lên MS Teams + Telegram.
 * Dùng cho:
 *   - Nút "Gửi báo cáo 09:00" trong AdminSettings
 *   - Vercel Cron (khai báo trong vercel.json) chạy mỗi sáng
 */
import type { IncomingMessage, ServerResponse } from "node:http";
import { getLiveMissingStatus, getFirestoreSetting, runWeeklyPreventiveAudit } from "../../server/botCore.js";

export default async function handler(_req: IncomingMessage, res: ServerResponse) {
  res.setHeader("Content-Type", "application/json");
  try {
    const card = await getLiveMissingStatus();
    let sentSuccess = false;
    const messageList: string[] = [];

    // 1. Gửi MS Teams nếu đã cấu hình
    const webhookUrl = await getFirestoreSetting("ms_teams_webhook");
    if (webhookUrl && webhookUrl.trim()) {
      const teamsWrappedPayload = {
        type: "message",
        attachments: [{ contentType: "application/vnd.microsoft.card.adaptive", contentUrl: null, content: card }],
      };
      const isPowerAutomate =
        webhookUrl.includes("logic.azure.com") ||
        webhookUrl.includes("powerautomate") ||
        webhookUrl.includes("powerplatform") ||
        webhookUrl.includes("flow.microsoft.com");

      const payloadsToTry = isPowerAutomate ? [card, teamsWrappedPayload] : [teamsWrappedPayload, card];
      for (const payload of payloadsToTry) {
        try {
          const resp = await fetch(webhookUrl.trim(), {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          });
          if (resp.ok || resp.status === 200 || resp.status === 202) {
            sentSuccess = true;
            messageList.push("MS Teams: Gửi thành công");
            break;
          }
        } catch (e: any) {
          messageList.push("MS Teams Lỗi: " + e.message);
        }
      }
    }

    // 2. Gửi Telegram nếu đã cấu hình
    try {
      const [botToken, chatId] = await Promise.all([
        getFirestoreSetting("telegram_bot_token"),
        getFirestoreSetting("telegram_chat_id"),
      ]);

      if (botToken && chatId) {
        const checkDateStr = new Date(Date.now() - 86400000).toISOString().split("T")[0];
        let tgHtml = `<b>🤖 BÁO CÁO TIẾN ĐỘ VOUCHER (09:00 AM)</b>\n`;
        tgHtml += `📅 <b>Ngày kiểm tra:</b> ${checkDateStr}\n\n`;
        tgHtml += `📊 <i>Nội dung tổng hợp tự động từ hệ thống.</i>\n`;
        tgHtml += `\n🌐 <a href="https://beer-voucher-tracker.vercel.app">Mở Live Dashboard</a>`;

        const tgRes = await fetch(`https://api.telegram.org/bot${botToken.trim()}/sendMessage`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ chat_id: chatId.trim(), text: tgHtml, parse_mode: "HTML" }),
        });
        const tgData = await tgRes.json();
        if (tgRes.ok && tgData.ok) {
          sentSuccess = true;
          messageList.push("Telegram Bot: Gửi thành công");
        } else {
          messageList.push("Telegram Lỗi: " + (tgData.description || "Không thể gửi"));
        }
      }
    } catch (tgErr: any) {
      console.error("Lỗi gửi Telegram tự động:", tgErr);
    }

    // 3. THỨ 2 hàng tuần: chạy thêm ĐỐI SOÁT PHÒNG NGỪA (AI chọn ngày nghi ngờ + Gemini soi ảnh)
    // Giờ VN (UTC+7); getUTCDay(): 0=CN, 1=Thứ 2. Gộp vào cron ngày để không vượt giới hạn cron của Hobby.
    let weekly: any = null;
    try {
      const vnDay = new Date(Date.now() + 7 * 3600 * 1000).getUTCDay();
      if (vnDay === 1) {
        const r = await runWeeklyPreventiveAudit();
        weekly = { chosenDate: r.chosenDate, reason: r.reason, telegramSent: r.sent };
        messageList.push(`Weekly Audit: soi ngày ${r.chosenDate}${r.sent ? " (đã gửi Telegram)" : ""}`);
        if (r.sent) sentSuccess = true;
      }
    } catch (wErr: any) {
      console.error("Lỗi weekly preventive audit:", wErr);
      messageList.push("Weekly Audit lỗi: " + (wErr?.message || String(wErr)));
    }

    const finalMessage = messageList.length > 0 ? messageList.join(" | ") : "Chưa cấu hình kênh nhận thông báo.";
    res.writeHead(200);
    res.end(JSON.stringify({ success: sentSuccess, message: finalMessage, card, weekly }));
  } catch (e: any) {
    res.writeHead(500);
    res.end(JSON.stringify({ success: false, error: e?.message || String(e) }));
  }
}
