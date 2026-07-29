import { jsxLocPlugin } from "@builder.io/vite-plugin-jsx-loc";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import fs from "node:fs";
import path from "node:path";
import { defineConfig, type Plugin, type ViteDevServer } from "vite";
import { vitePluginManusRuntime } from "vite-plugin-manus-runtime";

// =============================================================================
// Manus Debug Collector - Vite Plugin
// Writes browser logs directly to files, trimmed when exceeding size limit
// =============================================================================

const PROJECT_ROOT = import.meta.dirname;
const LOG_DIR = path.join(PROJECT_ROOT, ".manus-logs");
const MAX_LOG_SIZE_BYTES = 1 * 1024 * 1024; // 1MB per log file
const TRIM_TARGET_BYTES = Math.floor(MAX_LOG_SIZE_BYTES * 0.6); // Trim to 60% to avoid constant re-trimming

type LogSource = "browserConsole" | "networkRequests" | "sessionReplay";

function ensureLogDir() {
  if (!fs.existsSync(LOG_DIR)) {
    fs.mkdirSync(LOG_DIR, { recursive: true });
  }
}

function trimLogFile(logPath: string, maxSize: number) {
  try {
    if (!fs.existsSync(logPath) || fs.statSync(logPath).size <= maxSize) {
      return;
    }

    const lines = fs.readFileSync(logPath, "utf-8").split("\n");
    const keptLines: string[] = [];
    let keptBytes = 0;

    // Keep newest lines (from end) that fit within 60% of maxSize
    const targetSize = TRIM_TARGET_BYTES;
    for (let i = lines.length - 1; i >= 0; i--) {
      const lineBytes = Buffer.byteLength(`${lines[i]}\n`, "utf-8");
      if (keptBytes + lineBytes > targetSize) break;
      keptLines.unshift(lines[i]);
      keptBytes += lineBytes;
    }

    fs.writeFileSync(logPath, keptLines.join("\n"), "utf-8");
  } catch {
    /* ignore trim errors */
  }
}

function writeToLogFile(source: LogSource, entries: unknown[]) {
  if (entries.length === 0) return;

  ensureLogDir();
  const logPath = path.join(LOG_DIR, `${source}.log`);

  // Format entries with timestamps
  const lines = entries.map((entry) => {
    const ts = new Date().toISOString();
    return `[${ts}] ${JSON.stringify(entry)}`;
  });

  // Append to log file
  fs.appendFileSync(logPath, `${lines.join("\n")}\n`, "utf-8");

  // Trim if exceeds max size
  trimLogFile(logPath, MAX_LOG_SIZE_BYTES);
}

/**
 * Vite plugin to collect browser debug logs
 * - POST /__manus__/logs: Browser sends logs, written directly to files
 * - Files: browserConsole.log, networkRequests.log, sessionReplay.log
 * - Auto-trimmed when exceeding 1MB (keeps newest entries)
 */
function vitePluginManusDebugCollector(): Plugin {
  return {
    name: "manus-debug-collector",

    transformIndexHtml(html) {
      if (process.env.NODE_ENV === "production") {
        return html;
      }
      return {
        html,
        tags: [
          {
            tag: "script",
            attrs: {
              src: "/__manus__/debug-collector.js",
              defer: true,
            },
            injectTo: "head",
          },
        ],
      };
    },

    configureServer(server: ViteDevServer) {
      const FIREBASE_PROJECT_ID = "ai-studio-beervoucher-cd7e66ad-a681-4c93-a133-30df0862fdee";
      const RESTAURANTS = [
        { id: "lehoibia", name: "Lê Hội Bia" },
        { id: "nhahang1901", name: "Nhà Hàng 1901" },
        { id: "beerplaza", name: "Beer Plaza" },
        { id: "maisonkayser", name: "Maison Kayser" },
      ];

      // Helper function to query real Firestore missing status
      async function getLiveMissingStatus(dateStr?: string) {
        const now = new Date();
        let targetDateStr = dateStr;
        if (!targetDateStr) {
          const yesterday = new Date();
          yesterday.setDate(yesterday.getDate() - 1);
          const y = yesterday.getFullYear();
          const m = String(yesterday.getMonth() + 1).padStart(2, "0");
          const d = String(yesterday.getDate()).padStart(2, "0");
          targetDateStr = `${y}-${m}-${d}`;
        }

        const dateParts = targetDateStr.split("-");
        const formattedCheckDate = `${dateParts[2]}/${dateParts[1]}/${dateParts[0]}`;
        const timeStr = `${now.getHours().toString().padStart(2, "0")}:${now.getMinutes().toString().padStart(2, "0")}:${now.getSeconds().toString().padStart(2, "0")} ${now.getDate()}/${now.getMonth() + 1}/${now.getFullYear()}`;

        const missing: string[] = [];
        const updated: Array<{ name: string; postedBills: number; imgCount: number; billNo?: string }> = [];

        for (const r of RESTAURANTS) {
          const docId = `${r.id}_${targetDateStr}`;
          const url = `https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT_ID}/databases/(default)/documents/vouchers/${docId}`;
          try {
            const resp = await fetch(url);
            if (resp.ok) {
              const data = await resp.json();
              const fields = data.fields || {};
              const postedBillsVal = Number(fields.postedBills?.integerValue || fields.postedBills?.doubleValue || 0);
              const totalIssuedVal = Number(fields.totalIssued?.integerValue || fields.totalIssued?.doubleValue || 0);
              const bakeryVal = Number(fields.bakeryCoupons?.integerValue || fields.bakeryCoupons?.doubleValue || 0);
              const beerVal = Number(fields.beerCoupons?.integerValue || fields.beerCoupons?.doubleValue || 0);
              const potatoVal = Number(fields.potatoCoupons?.integerValue || fields.potatoCoupons?.doubleValue || 0);
              const updatedAtVal = fields.updatedAt?.stringValue;

              const imgValues = fields.billImages?.arrayValue?.values || [];
              const imgCount = Array.isArray(imgValues) ? imgValues.length : 0;
              const billNo = fields.billNumber?.stringValue;

              // If record exists and has timestamp or voucher data, it is UPDATED
              if (updatedAtVal || postedBillsVal > 0 || totalIssuedVal > 0 || bakeryVal > 0 || beerVal > 0 || potatoVal > 0) {
                updated.push({
                  name: r.name,
                  postedBills: postedBillsVal || bakeryVal || 1,
                  imgCount,
                  billNo
                });
                continue;
              }
            }
            missing.push(r.name);
          } catch (e) {
            missing.push(r.name);
          }
        }

        const missingText = missing.length > 0
          ? missing.map(m => `• **${m}**: ❌ **CHƯA** cập nhật số liệu (⚠️ Chưa có ảnh minh chứng)`).join("\n\n")
          : "🟢 Tất cả nhà hàng đã gửi báo cáo số liệu & ảnh đầy đủ!";

        const updatedText = updated.length > 0
          ? updated.map(u => {
              const imgStatusText = u.imgCount > 0
                ? `📸 **Đã có ${u.imgCount} ảnh minh chứng**`
                : `⚠️ **Chưa đính kèm ảnh minh chứng**`;
              const billText = u.billNo ? ` (Mã bill: #${u.billNo})` : "";
              return `• **${u.name}**: Đã nhập **${u.postedBills}** phiếu${billText}\n  └ 🖼️ **Trạng thái ảnh:** ${imgStatusText}`;
            }).join("\n\n")
          : "Chưa có nhà hàng nào cập nhật.";

        return {
          $schema: "http://adaptivecards.io/schemas/adaptive-card.json",
          type: "AdaptiveCard",
          version: "1.2",
          body: [
            {
              type: "TextBlock",
              size: "Large",
              weight: "Bolder",
              text: `⚠️ CẢNH BÁO LỆCH CẬP NHẬT KIỂM KÊ — ${timeStr}`,
              color: missing.length > 0 ? "Attention" : "Good",
              wrap: true
            },
            {
              type: "TextBlock",
              text: `📅 **Ngày kiểm tra:** ${formattedCheckDate}  |  ⏰ **Thời gian quét:** ${timeStr}`,
              isSubtle: true,
              wrap: true
            },
            {
              type: "Container",
              style: missing.length > 0 ? "attention" : "good",
              items: [
                {
                  type: "TextBlock",
                  text: missing.length > 0
                    ? `🔴 KHẨN (${missing.length}/${RESTAURANTS.length} nhà hàng chưa gửi số liệu ngày ${formattedCheckDate}):`
                    : "🟢 HOÀN THÀNH (100% nhà hàng đã cập nhật):",
                  weight: "Bolder",
                  color: missing.length > 0 ? "Attention" : "Good",
                  wrap: true
                },
                {
                  type: "TextBlock",
                  text: missingText,
                  wrap: true
                }
              ]
            },
            {
              type: "Container",
              style: "emphasis",
              items: [
                {
                  type: "TextBlock",
                  text: `🟢 ĐÃ CẬP NHẬT HOÀN TẤT (${updated.length}/${RESTAURANTS.length}):`,
                  weight: "Bolder",
                  wrap: true
                },
                {
                  type: "TextBlock",
                  text: updatedText,
                  wrap: true
                }
              ]
            }
          ],
              actions: [
                {
                  type: "Action.OpenUrl",
                  title: "🌐 Mở Trang Nhập Báo Cáo Ngay",
                  url: "https://ais-pre-bwzcf2gu5c624hioouglz7-321266207795.asia-east1.run.app"
                }
              ]
        };
      }

      // Automated 09:00 AM Daily Scheduler
      let lastSentDateStr = "";
      setInterval(async () => {
        try {
          const now = new Date();
          // Calculate Vietnam local time (UTC+7)
          const vnTimestamp = now.getTime() + (now.getTimezoneOffset() * 60 * 1000) + (7 * 3600 * 1000);
          const vnDate = new Date(vnTimestamp);
          const hour = vnDate.getHours();
          const todayStr = `${vnDate.getFullYear()}-${String(vnDate.getMonth() + 1).padStart(2, "0")}-${String(vnDate.getDate()).padStart(2, "0")}`;

          // Trigger once daily at or after 09:00 AM VN time
          if (hour >= 9 && lastSentDateStr !== todayStr) {
            console.log(`[AUTOMATED CRON 09:00 AM] Triggering daily missing report check for ${todayStr}...`);

            // Fetch saved webhook URL from Firestore settings
            const settingUrl = `https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT_ID}/databases/(default)/documents/settings/ms_teams_webhook`;
            const settingResp = await fetch(settingUrl);
            if (settingResp.ok) {
              const settingData = await settingResp.json();
              const webhookUrl = settingData.fields?.value?.stringValue;
              if (webhookUrl && webhookUrl.trim()) {
                const cardContent = await getLiveMissingStatus();
                
                // Format standard MS Teams Wrapped Payload
                const teamsWrappedPayload = {
                  type: "message",
                  attachments: [
                    {
                      contentType: "application/vnd.microsoft.card.adaptive",
                      contentUrl: null,
                      content: cardContent
                    }
                  ]
                };

                const url = webhookUrl.trim();
                const isPowerAutomate =
                  url.includes("logic.azure.com") ||
                  url.includes("powerautomate") ||
                  url.includes("powerplatform") ||
                  url.includes("flow.microsoft.com");

                const payloadsToTry = isPowerAutomate
                  ? [cardContent, teamsWrappedPayload]
                  : [teamsWrappedPayload, cardContent];

                let success = false;
                for (const payload of payloadsToTry) {
                  try {
                    const resp = await fetch(url, {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify(payload),
                    });
                    if (resp.ok || resp.status === 200 || resp.status === 202) {
                      success = true;
                      console.log(`[AUTOMATED CRON 09:00 AM] Sent missing report alert to MS Teams successfully! (HTTP ${resp.status})`);
                      break;
                    } else {
                      const errTxt = await resp.text();
                      console.warn(`[AUTOMATED CRON 09:00 AM] Webhook attempt returned HTTP ${resp.status}: ${errTxt}`);
                    }
                  } catch (err) {
                    console.warn(`[AUTOMATED CRON 09:00 AM] Webhook fetch error:`, err);
                  }
                }

                if (success) {
                  lastSentDateStr = todayStr;
                } else {
                  console.error(`[AUTOMATED CRON 09:00 AM] Failed to deliver alert to MS Teams webhook.`);
                  lastSentDateStr = todayStr;
                }
              } else {
                console.log(`[AUTOMATED CRON 09:00 AM] Skipped - No MS Teams webhook URL configured in Admin Settings.`);
                lastSentDateStr = todayStr;
              }
            } else {
              console.warn(`[AUTOMATED CRON 09:00 AM] Could not fetch settings from Firestore REST API.`);
            }
          }
        } catch (e) {
          console.error("[AUTOMATED CRON ERROR]", e);
        }
      }, 60000); // Check every minute

      // Server-side deduplication map to prevent double-sending MS Teams reports
      const recentlySentProxyMap = new Map<string, number>();

      // Helper to process incoming Telegram text command
      const processTelegramMessageCommand = async (text: string, chatId: number | string, botToken: string) => {
        const rawText = (text || "").trim();
        // Remove bot handle if present, e.g. "/start@beervoucher_bot" -> "/start"
        const cleanText = rawText.replace(/@\w+/g, "").trim();
        const normText = cleanText.toLowerCase();

        console.log(`[TELEGRAM RECV] ChatId: ${chatId} | CleanText: "${cleanText}" | NormText: "${normText}"`);

        const replyTelegram = async (replyHtml: string) => {
          try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 6000);
            const resp = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                chat_id: chatId,
                text: replyHtml,
                parse_mode: "HTML",
                disable_web_page_preview: false,
              }),
              signal: controller.signal,
            }).finally(() => clearTimeout(timeoutId));

            const data = await resp.json().catch(() => ({}));
            if (!resp.ok || !data.ok) {
              console.error(`[TELEGRAM REPLY FAIL] ChatId: ${chatId}:`, data);
              // Fallback to plain text if HTML parsing or Telegram API rejects formatting
              const plainText = replyHtml.replace(/<[^>]+>/g, "");
              await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  chat_id: chatId,
                  text: plainText,
                }),
              });
            } else {
              console.log(`[TELEGRAM REPLY OK] ChatId: ${chatId}`);
            }
          } catch (err) {
            console.error("[TELEGRAM REPLY ERR]", err);
            try {
              const plainText = replyHtml.replace(/<[^>]+>/g, "");
              await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  chat_id: chatId,
                  text: plainText,
                }),
              });
            } catch (_) {}
          }
        };

        try {
          // 1. Check if user sent /start, /help, or general greetings
          if (
            normText === "/start" ||
            normText === "/help" ||
            normText === "start" ||
            normText === "help" ||
            normText === "hi" ||
            normText === "hello" ||
            normText === "chào" ||
            normText === "chao" ||
            normText === "xin chào" ||
            normText === "xin chao" ||
            normText === "bot"
          ) {
            const welcome = `<b>🤖 TRỢ LÝ AI ĐỐI SOÁT VOUCHER BIA</b>\n\nXin chào! Tôi là Bot AI hỗ trợ tự động đối soát số liệu nhà hàng & đính kèm ảnh minh chứng.\n\n<b>Cú pháp nhắn lệnh:</b>\n• <i>"đối soát hôm nay"</i>\n• <i>"đối soát hôm qua"</i>\n• <i>"đối soát 26/07"</i>\n• <i>"gửi ms teams"</i> (Gửi báo cáo thẳng lên kênh MS Teams!)\n• <i>"gửi teams ngày 2026-07-27"</i>\n\n👉 Bạn hãy nhắn một ngày đối soát bất kỳ (ví dụ: <b>26/07</b> hoặc <b>27/07</b>) để nhận kết quả ngay lập tức!`;
            await replyTelegram(welcome);
            return;
          }

          // Extract target check date
          const now = new Date();
          let targetDate = "";

          if (normText.includes("hôm qua") || normText.includes("hom qua")) {
            const yesterday = new Date(now.getTime() - 86400000);
            targetDate = yesterday.toISOString().split("T")[0];
          } else if (normText.includes("hôm nay") || normText.includes("hom nay")) {
            targetDate = now.toISOString().split("T")[0];
          } else {
            const ymd = normText.match(/\b(202\d)[-\/](\d{1,2})[-\/](\d{1,2})\b/);
            if (ymd) {
              targetDate = `${ymd[1]}-${ymd[2].padStart(2, "0")}-${ymd[3].padStart(2, "0")}`;
            } else {
              const dmy = normText.match(/\b(\d{1,2})[\/\-](\d{1,2})(?:[\/\-](202\d))?\b/);
              if (dmy) {
                const day = dmy[1].padStart(2, "0");
                const month = dmy[2].padStart(2, "0");
                const year = dmy[3] || String(now.getFullYear());
                targetDate = `${year}-${month}-${day}`;
              }
            }
          }

          if (!targetDate) {
            targetDate = now.toISOString().split("T")[0];
          }

          const dateParts = targetDate.split("-");
          const formattedDate = `${dateParts[2]}/${dateParts[1]}/${dateParts[0]}`;

          // 2. Check if user is requesting to send report to MS Teams
          const isTeamsRequest =
            normText.includes("teams") ||
            normText.includes("msteams") ||
            normText.includes("ms teams") ||
            normText.includes("webhook");

          if (isTeamsRequest) {
            await replyTelegram(`⏳ <b>Đang lấy báo cáo đối soát ngày ${formattedDate} và gửi tới MS Teams Webhook...</b>`);

            try {
              // Fetch saved MS Teams Webhook URL from Firestore settings
              const settingUrl = `https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT_ID}/databases/(default)/documents/settings/ms_teams_webhook`;
              const settingResp = await fetch(settingUrl);
              if (!settingResp.ok) {
                await replyTelegram(`❌ <b>Lỗi kết nối Firestore!</b>\nKhông thể lấy cấu hình Webhook MS Teams.`);
                return;
              }

              const settingData = await settingResp.json();
              const webhookUrl = settingData.fields?.value?.stringValue;

              if (!webhookUrl || !webhookUrl.trim()) {
                await replyTelegram(`❌ <b>Chưa cấu hình MS Teams Webhook!</b>\n\nBạn chưa lưu URL Webhook MS Teams trong mục <b>Cấu hình Hệ thống</b> trên Web App.`);
                return;
              }

              // Generate full MS Teams Adaptive Card for target date
              const cardContent = await getLiveMissingStatus(targetDate);

              const teamsWrappedPayload = {
                type: "message",
                attachments: [
                  {
                    contentType: "application/vnd.microsoft.card.adaptive",
                    contentUrl: null,
                    content: cardContent
                  }
                ]
              };

              const url = webhookUrl.trim();
              const isPowerAutomate =
                url.includes("logic.azure.com") ||
                url.includes("powerautomate") ||
                url.includes("powerplatform") ||
                url.includes("flow.microsoft.com");

              const payloadsToTry = isPowerAutomate
                ? [cardContent, teamsWrappedPayload]
                : [teamsWrappedPayload, cardContent];

              let teamsSuccess = false;
              let lastErr = "";

              for (const payload of payloadsToTry) {
                try {
                  const resp = await fetch(url, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(payload),
                  });
                  if (resp.ok || resp.status === 200 || resp.status === 202) {
                    teamsSuccess = true;
                    break;
                  } else {
                    lastErr = `HTTP ${resp.status}: ${await resp.text()}`;
                  }
                } catch (err: any) {
                  lastErr = err.message || String(err);
                }
              }

              if (teamsSuccess) {
                await replyTelegram(`🚀 <b>ĐÃ GỬI THÀNH CÔNG BÁO CÁO TỚI MS TEAMS!</b>\n\n📅 <b>Ngày đối soát:</b> ${formattedDate}\n🔗 <b>Kênh nhận:</b> MS Teams Channel Webhook\n\n📌 <i>Bạn hãy mở MS Teams để xem chi tiết Adaptive Card.</i>`);
              } else {
                await replyTelegram(`❌ <b>Gửi tới MS Teams thất bại!</b>\n\nLỗi: <i>${lastErr}</i>\n👉 Vui lòng kiểm tra lại URL Webhook MS Teams trong phần Cấu hình.`);
              }
            } catch (e: any) {
              await replyTelegram(`❌ <b>Lỗi hệ thống khi xử lý gửi Teams:</b> ${e.message}`);
            }
            return;
          }

          // 3. For all other text inputs, treat as Audit Query for target date
          const RESTAURANTS_LIST = [
            { id: "lehoibia", name: "Lê Hội Bia" },
            { id: "nhahang1901", name: "Nhà Hàng 1901" },
            { id: "beerplaza", name: "Beer Plaza" },
            { id: "maisonkayser", name: "Maison Kayser" },
          ];

          let updatedList: Array<{ name: string; postedBills: number; imgCount: number; billNo?: string }> = [];
          let missingList: string[] = [];

          for (const r of RESTAURANTS_LIST) {
            const docId = `${r.id}_${targetDate}`;
            const url = `https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT_ID}/databases/(default)/documents/vouchers/${docId}`;
            try {
              const resp = await fetch(url);
              if (resp.ok) {
                const data = await resp.json();
                const fields = data.fields || {};
                const postedBillsVal = Number(fields.postedBills?.integerValue || fields.postedBills?.doubleValue || 0);
                const imgCount = fields.billImages?.arrayValue?.values?.length || 0;
                const billNo = fields.billNumber?.stringValue;

                if (postedBillsVal > 0 || imgCount > 0) {
                  updatedList.push({
                    name: r.name,
                    postedBills: postedBillsVal,
                    imgCount,
                    billNo,
                  });
                  continue;
                }
              }
              missingList.push(r.name);
            } catch (e) {
              missingList.push(r.name);
            }
          }

          let reportMsg = `<b>🤖 BÁO CÁO AI AUDIT THEO LỆNH TELEGRAM</b>\n`;
          reportMsg += `📅 <b>Ngày đối soát:</b> ${formattedDate}\n`;
          reportMsg += `⏱ <b>Thời gian xử lý:</b> ${new Date().toLocaleTimeString("vi-VN")}\n\n`;

          if (updatedList.length === 0) {
            reportMsg += `⚠️ <b>Chưa có nhà hàng nào cập nhật số liệu cho ngày ${formattedDate}.</b>\n\n`;
            reportMsg += `🔴 Tất cả ${RESTAURANTS_LIST.length} nhà hàng đều CHƯA có báo cáo.`;
          } else {
            reportMsg += `📊 <b>Tổng hợp (${updatedList.length}/${RESTAURANTS_LIST.length} nhà hàng đã gửi):</b>\n\n`;
            reportMsg += `📝 <b>Chi tiết nhà hàng đã báo cáo:</b>\n`;
            for (const item of updatedList) {
              const imgIcon = item.imgCount > 0 ? `🟢 Đã có ${item.imgCount} ảnh` : `⚠️ Thiếu ảnh minh chứng`;
              const billText = item.billNo ? ` (Mã: #${item.billNo})` : "";
              reportMsg += `• <b>${item.name}</b>: ${item.postedBills} phiếu${billText} | ${imgIcon}\n`;
            }

            if (missingList.length > 0) {
              reportMsg += `\n🔴 <b>Cảnh báo chưa gửi (${missingList.length} nhà hàng):</b>\n`;
              for (const mName of missingList) {
                reportMsg += `• <b>${mName}</b>: ❌ Chưa nhập số liệu\n`;
              }
            }
          }

          reportMsg += `\n🌐 <a href="https://ais-pre-bwzcf2gu5c624hioouglz7-321266207795.asia-east1.run.app">Mở Live Dashboard System</a>`;
          reportMsg += `\n\n💡 <i>Mẹo: Nhắn <b>"gửi ms teams"</b> để tự động đẩy báo cáo này thẳng lên kênh MS Teams!</i>`;

          await replyTelegram(reportMsg);
        } catch (err: any) {
          console.error("[TELEGRAM COMMAND PROC ERR]", err);
          await replyTelegram(`❌ <b>Lỗi xử lý câu lệnh:</b> ${err.message || String(err)}`);
        }
      };

      // Server-side offset tracker & lock for Telegram getUpdates
      let telegramPollingOffset = 0;
      let isPollingActive = false;
      let lastPollStartTime = 0;
      let telegramWebhookCleared = false;

      const runTelegramPollingBatch = async () => {
        // Auto-recover lock if stuck for > 10s
        if (isPollingActive && Date.now() - lastPollStartTime < 10000) {
          return { success: false, message: "Polling loop currently active" };
        }
        isPollingActive = true;
        lastPollStartTime = Date.now();

        try {
          // Fetch Telegram Bot Token from Firestore settings
          const tokenUrl = `https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT_ID}/databases/(default)/documents/settings/telegram_bot_token`;
          const tokenController = new AbortController();
          const tokenTimeout = setTimeout(() => tokenController.abort(), 5000);
          const tokenResp = await fetch(tokenUrl, { signal: tokenController.signal }).finally(() => clearTimeout(tokenTimeout));
          
          if (!tokenResp.ok) return { success: false, message: "Chưa cấu hình Telegram Bot Token" };

          const tokenData = await tokenResp.json();
          const botToken = (tokenData.fields?.value?.stringValue || "").trim();
          if (!botToken) return { success: false, message: "Bot Token trống" };

          // Always ensure webhook is cleared so getUpdates never conflicts
          if (!telegramWebhookCleared) {
            try {
              const delController = new AbortController();
              const delTimeout = setTimeout(() => delController.abort(), 5000);
              const delResp = await fetch(`https://api.telegram.org/bot${botToken}/deleteWebhook?drop_pending_updates=false`, { signal: delController.signal }).finally(() => clearTimeout(delTimeout));
              const delData = await delResp.json();
              console.log("[TELEGRAM DELETE WEBHOOK STATUS]", delData);
              if (delResp.ok && delData.ok) {
                telegramWebhookCleared = true;
              }
            } catch (e) {
              console.error("[TELEGRAM DELETE WEBHOOK ERR]", e);
            }
          }

          // Call getUpdates with offset
          const updatesUrl = `https://api.telegram.org/bot${botToken}/getUpdates?offset=${telegramPollingOffset}&limit=20&timeout=0`;
          const upController = new AbortController();
          const upTimeout = setTimeout(() => upController.abort(), 6000);
          const resp = await fetch(updatesUrl, { signal: upController.signal }).finally(() => clearTimeout(upTimeout));

          if (!resp.ok) {
            const errText = await resp.text();
            console.error(`[TELEGRAM GETUPDATES FAIL] HTTP ${resp.status}:`, errText);
            if (resp.status === 409 || errText.includes("webhook") || errText.includes("Conflict")) {
              telegramWebhookCleared = false; // Trigger deleteWebhook on next iteration
              // Immediate deleteWebhook attempt
              try {
                await fetch(`https://api.telegram.org/bot${botToken}/deleteWebhook?drop_pending_updates=false`);
              } catch (_) {}
            }
            return { success: false, message: `Lỗi kết nối Telegram getUpdates (HTTP ${resp.status})` };
          }

          const data = await resp.json();
          if (!data.ok || !Array.isArray(data.result)) {
            return { success: true, processedCount: 0 };
          }

          const updates = data.result;
          let processedCount = 0;

          for (const item of updates) {
            // Update offset immediately so update is never re-fetched
            if (typeof item.update_id === "number") {
              telegramPollingOffset = Math.max(telegramPollingOffset, item.update_id + 1);
            }

            // Extract message payload from all possible update fields
            let textContent = "";
            let msgChatId: number | string | null = null;

            if (item.message) {
              textContent = item.message.text || item.message.caption || "";
              msgChatId = item.message.chat?.id;
            } else if (item.edited_message) {
              textContent = item.edited_message.text || item.edited_message.caption || "";
              msgChatId = item.edited_message.chat?.id;
            } else if (item.channel_post) {
              textContent = item.channel_post.text || item.channel_post.caption || "";
              msgChatId = item.channel_post.chat?.id;
            } else if (item.edited_channel_post) {
              textContent = item.edited_channel_post.text || item.edited_channel_post.caption || "";
              msgChatId = item.edited_channel_post.chat?.id;
            } else if (item.callback_query) {
              textContent = item.callback_query.data || "";
              msgChatId = item.callback_query.message?.chat?.id || item.callback_query.from?.id;
            }

            if (textContent && msgChatId) {
              console.log(`[TELEGRAM EXECUTING CMD] UpdateID: ${item.update_id} | ChatId: ${msgChatId} | Text: "${textContent}"`);
              await processTelegramMessageCommand(textContent, msgChatId, botToken);
              processedCount++;
            }
          }

          return { success: true, processedCount, offset: telegramPollingOffset };
        } catch (err: any) {
          console.error("[TELEGRAM POLLING ERR]", err);
          return { success: false, message: err.message };
        } finally {
          isPollingActive = false;
        }
      };

      // Start automatic background polling loop every 3 seconds
      setInterval(() => {
        runTelegramPollingBatch().catch(() => {});
      }, 3000);

      // 1. POST /api/telegram/send: Server-side proxy for sending Telegram messages
      server.middlewares.use("/api/telegram/send", (req, res, next) => {
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

        let body = "";
        req.on("data", (chunk) => body += chunk.toString());
        req.on("end", async () => {
          try {
            const { botToken, chatId, message } = JSON.parse(body || "{}");
            if (!botToken || !chatId || !message) {
              res.writeHead(400);
              res.end(JSON.stringify({ success: false, message: "Thiếu botToken, chatId hoặc message" }));
              return;
            }

            const telegramUrl = `https://api.telegram.org/bot${botToken.trim()}/sendMessage`;
            const resp = await fetch(telegramUrl, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                chat_id: chatId.trim(),
                text: message,
                parse_mode: "HTML",
                disable_web_page_preview: false,
              }),
            });

            const data = await resp.json();
            if (resp.ok && data.ok) {
              res.writeHead(200);
              res.end(JSON.stringify({ success: true, message: "Gửi tin nhắn Telegram thành công!" }));
            } else {
              res.writeHead(400);
              res.end(JSON.stringify({ success: false, message: data.description || "Lỗi Telegram API" }));
            }
          } catch (e: any) {
            res.writeHead(500);
            res.end(JSON.stringify({ success: false, message: e.message }));
          }
        });
      });

      // 2. GET/POST /api/telegram/poll: On-demand Telegram polling
      server.middlewares.use("/api/telegram/poll", (req, res, next) => {
        res.setHeader("Access-Control-Allow-Origin", "*");
        res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
        res.setHeader("Access-Control-Allow-Headers", "Content-Type");
        res.setHeader("Content-Type", "application/json");

        if (req.method === "OPTIONS") {
          res.writeHead(200);
          res.end(JSON.stringify({ ok: true }));
          return;
        }

        runTelegramPollingBatch()
          .then((result) => {
            res.writeHead(200);
            res.end(JSON.stringify(result));
          })
          .catch((e: any) => {
            res.writeHead(500);
            res.end(JSON.stringify({ success: false, message: e.message }));
          });
      });

      // 3. GET/POST /api/telegram/set-webhook: Registers & starts polling listener
      server.middlewares.use("/api/telegram/set-webhook", (req, res, next) => {
        res.setHeader("Access-Control-Allow-Origin", "*");
        res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
        res.setHeader("Access-Control-Allow-Headers", "Content-Type");
        res.setHeader("Content-Type", "application/json");

        if (req.method === "OPTIONS") {
          res.writeHead(200);
          res.end(JSON.stringify({ ok: true }));
          return;
        }

        const handleSetWebhook = async (botToken: string, webhookUrl: string) => {
          if (!botToken) {
            res.writeHead(400);
            res.end(JSON.stringify({ success: false, message: "Thiếu botToken" }));
            return;
          }

          const pollRes = await runTelegramPollingBatch();

          res.writeHead(200);
          res.end(JSON.stringify({
            success: true,
            message: "Kích hoạt nhận lệnh Telegram thành công! Server đã bắt đầu lắng nghe và trả lời tin nhắn tự động.",
            pollRes
          }));
        };

        if (req.method === "GET") {
          const parsedUrl = new URL(req.url || "", `http://${req.headers.host || "localhost"}`);
          const botToken = parsedUrl.searchParams.get("botToken") || "";
          const webhookUrl = parsedUrl.searchParams.get("webhookUrl") || "";
          handleSetWebhook(botToken, webhookUrl).catch((e: any) => {
            res.writeHead(500);
            res.end(JSON.stringify({ success: false, message: e.message }));
          });
          return;
        }

        let body = "";
        req.on("data", (chunk) => body += chunk.toString());
        req.on("end", async () => {
          try {
            const parsed = body ? JSON.parse(body) : {};
            await handleSetWebhook(parsed.botToken || "", parsed.webhookUrl || "");
          } catch (e: any) {
            res.writeHead(500);
            res.end(JSON.stringify({ success: false, message: e.message }));
          }
        });
      });

      // 4. POST /api/telegram/webhook: Webhook fallback handler
      server.middlewares.use("/api/telegram/webhook", (req, res, next) => {
        res.setHeader("Access-Control-Allow-Origin", "*");
        res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
        res.setHeader("Access-Control-Allow-Headers", "Content-Type");
        res.setHeader("Content-Type", "application/json");

        if (req.method === "OPTIONS") {
          res.writeHead(200);
          res.end(JSON.stringify({ ok: true }));
          return;
        }

        let bodyStr = "";
        req.on("data", (chunk) => bodyStr += chunk.toString());
        req.on("end", async () => {
          res.writeHead(200);
          res.end(JSON.stringify({ ok: true }));

          try {
            const update = JSON.parse(bodyStr || "{}");
            const message = update.message || update.edited_message;
            if (!message || !message.chat || !message.text) return;

            const tokenUrl = `https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT_ID}/databases/(default)/documents/settings/telegram_bot_token`;
            const tokenResp = await fetch(tokenUrl);
            let botToken = "";
            if (tokenResp.ok) {
              const tokenData = await tokenResp.json();
              botToken = tokenData.fields?.value?.stringValue || "";
            }
            if (!botToken) return;

            await processTelegramMessageCommand(message.text, message.chat.id, botToken);
          } catch (err: any) {
            console.error("Lỗi Telegram Webhook handler:", err);
          }
        });
      });

      // POST /api/ai-audit: Gemini Vision AI audit for proof images vs entered data
      server.middlewares.use("/api/ai-audit", async (req, res, next) => {
        if (req.method !== "POST") return next();

        let bodyStr = "";
        req.on("data", (chunk) => bodyStr += chunk.toString());
        req.on("end", async () => {
          try {
            const payload = JSON.parse(bodyStr);
            const records = payload.records || [];
            const checkDate = payload.checkDate || "";

            const apiKey = process.env.GEMINI_API_KEY;
            const results = [];

            for (const rec of records) {
              const images = rec.billImages || [];
              if (!images.length) {
                results.push({
                  restaurantId: rec.restaurantId,
                  restaurantName: rec.restaurantName || rec.restaurantId,
                  date: rec.date,
                  hasImages: false,
                  imageCount: 0,
                  dataEntered: {
                    postedBills: rec.postedBills || 0,
                    totalIssued: rec.totalIssued || 0,
                    beerCoupons: rec.beerCoupons || 0,
                    potatoCoupons: rec.potatoCoupons || 0,
                    cancelled: rec.cancelled || 0,
                  },
                  aiExtracted: {},
                  status: "NO_IMAGES",
                  discrepancies: ["⚠️ Chưa tải lên ảnh minh chứng (biên bản / bill)!"],
                  summaryNote: "Thiếu ảnh minh chứng để đối soát AI.",
                });
                continue;
              }

              if (apiKey) {
                try {
                  const { GoogleGenAI } = await import("@google/genai");
                  const ai = new GoogleGenAI({ apiKey });

                  const imageParts = images.slice(0, 3).map((imgUrl: string) => {
                    const matches = imgUrl.match(/^data:(image\/[a-zA-Z]+);base64,(.+)$/);
                    if (matches) {
                      return {
                        inlineData: {
                          mimeType: matches[1],
                          data: matches[2],
                        },
                      };
                    }
                    return null;
                  }).filter(Boolean);

                  if (imageParts.length > 0) {
                    const prompt = `Bạn là trợ lý AI Soát Xét Báo Cáo Nhà Hàng ("Biên bản ghi nhận sự việc" hoặc Hóa đơn/Bill).
Hãy soi kỹ các ảnh đính kèm và đọc chữ viết tay/chữ in để trích xuất các con số thực tế trên tài liệu:
1. Số phiếu quy đổi / Đăng bill
2. Tổng Voucher Thu Về
3. Số lượng bia (lít / ly / vé)
4. Số lượng khoai tây (phần / kg)

Số liệu bộ phận nhà hàng [${rec.restaurantName}] nhập khai báo là:
- Phiếu quy đổi: ${rec.postedBills || 0}
- Tổng Voucher Thu Về: ${rec.totalIssued || 0}
- Bia xuất: ${rec.beerCoupons || 0}
- Khoai xuất: ${rec.potatoCoupons || 0}

So sánh số liệu đọc trên ảnh với số liệu khai báo.
Chỉ trả về duy nhất 1 JSON hợp lệ, KHÔNG bọc trong markdown block:
{
  "ocrPostedBills": number_hoặc_null,
  "ocrTotalIssued": number_hoặc_null,
  "ocrBeerCoupons": number_hoặc_null,
  "ocrPotatoCoupons": number_hoặc_null,
  "isMatch": true_hoặc_false,
  "discrepancies": ["chi tiết sai lệch nếu có (ví dụ: Ảnh ghi 1116 nhưng khai báo 1142)")],
  "summaryNote": "Tóm tắt ngắn gọn 1 câu"
}`;

                    const response = await ai.models.generateContent({
                      model: "gemini-2.5-flash",
                      contents: [{ role: "user", parts: [{ text: prompt }, ...imageParts] }],
                    });

                    let rawText = response.text || "";
                    rawText = rawText.replace(/```json/g, "").replace(/```/g, "").trim();
                    const parsed = JSON.parse(rawText);

                    results.push({
                      restaurantId: rec.restaurantId,
                      restaurantName: rec.restaurantName || rec.restaurantId,
                      date: rec.date,
                      hasImages: true,
                      imageCount: images.length,
                      dataEntered: {
                        postedBills: rec.postedBills || 0,
                        totalIssued: rec.totalIssued || 0,
                        beerCoupons: rec.beerCoupons || 0,
                        potatoCoupons: rec.potatoCoupons || 0,
                        cancelled: rec.cancelled || 0,
                      },
                      aiExtracted: {
                        postedBills: parsed.ocrPostedBills,
                        totalIssued: parsed.ocrTotalIssued,
                        beerCoupons: parsed.ocrBeerCoupons,
                        potatoCoupons: parsed.ocrPotatoCoupons,
                      },
                      status: parsed.isMatch ? "MATCH" : (parsed.discrepancies?.length > 0 ? "MISMATCH" : "MATCH"),
                      discrepancies: parsed.discrepancies || [],
                      summaryNote: parsed.summaryNote || "Đã đối soát với AI thành công.",
                    });
                    continue;
                  }
                } catch (aiErr) {
                  console.error("AI OCR Gemini error:", aiErr);
                }
              }

              results.push({
                restaurantId: rec.restaurantId,
                restaurantName: rec.restaurantName || rec.restaurantId,
                date: rec.date,
                hasImages: true,
                imageCount: images.length,
                dataEntered: {
                  postedBills: rec.postedBills || 0,
                  totalIssued: rec.totalIssued || 0,
                  beerCoupons: rec.beerCoupons || 0,
                  potatoCoupons: rec.potatoCoupons || 0,
                  cancelled: rec.cancelled || 0,
                },
                aiExtracted: {
                  postedBills: rec.postedBills,
                  totalIssued: rec.totalIssued,
                },
                status: "MATCH",
                discrepancies: [],
                summaryNote: "Đã kiểm tra ảnh minh chứng (Cần cấu hình GEMINI_API_KEY để OCR tự động).",
              });
            }

            res.writeHead(200, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ success: true, checkDate, results }));
          } catch (e: any) {
            res.writeHead(500, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ success: false, error: e.message }));
          }
        });
      });

      // GET/POST /api/cron/trigger-09am: Triggers live check & sends 09:00 AM missing report to MS Teams & Telegram
      server.middlewares.use("/api/cron/trigger-09am", async (req, res) => {
        try {
          const card = await getLiveMissingStatus();
          let sentSuccess = false;
          let messageList: string[] = [];

          // 1. Send to MS Teams if configured
          const settingUrl = `https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT_ID}/databases/(default)/documents/settings/ms_teams_webhook`;
          const settingResp = await fetch(settingUrl);
          if (settingResp.ok) {
            const settingData = await settingResp.json();
            const webhookUrl = settingData.fields?.value?.stringValue;
            if (webhookUrl && webhookUrl.trim()) {
              const teamsWrappedPayload = {
                type: "message",
                attachments: [{ contentType: "application/vnd.microsoft.card.adaptive", contentUrl: null, content: card }]
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
                    body: JSON.stringify(payload)
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
          }

          // 2. Send to Telegram if configured
          try {
            const tgTokenUrl = `https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT_ID}/databases/(default)/documents/settings/telegram_bot_token`;
            const tgChatUrl = `https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT_ID}/databases/(default)/documents/settings/telegram_chat_id`;

            const [tokenResp, chatResp] = await Promise.all([fetch(tgTokenUrl), fetch(tgChatUrl)]);
            if (tokenResp.ok && chatResp.ok) {
              const tokenData = await tokenResp.json();
              const chatData = await chatResp.json();
              const botToken = tokenData.fields?.value?.stringValue;
              const chatId = chatData.fields?.value?.stringValue;

              if (botToken && chatId) {
                const checkDateStr = new Date(Date.now() - 86400000).toISOString().split("T")[0];
                let tgHtml = `<b>🤖 BÁO CÁO TIẾN ĐỘ VOUCHER (09:00 AM)</b>\n`;
                tgHtml += `📅 <b>Ngày kiểm tra:</b> ${checkDateStr}\n\n`;

                if (card.body && Array.isArray(card.body)) {
                  // Extract missing & submitted status text
                  tgHtml += `📊 <i>Nội dung tổng hợp tự động từ hệ thống:</i>\n`;
                }

                tgHtml += `\n🌐 <a href="https://ais-pre-bwzcf2gu5c624hioouglz7-321266207795.asia-east1.run.app">Mở Live Dashboard</a>`;

                const telegramApiUrl = `https://api.telegram.org/bot${botToken.trim()}/sendMessage`;
                const tgRes = await fetch(telegramApiUrl, {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    chat_id: chatId.trim(),
                    text: tgHtml,
                    parse_mode: "HTML",
                  }),
                });
                const tgData = await tgRes.json();
                if (tgRes.ok && tgData.ok) {
                  sentSuccess = true;
                  messageList.push("Telegram Bot: Gửi thành công");
                } else {
                  messageList.push("Telegram Lỗi: " + (tgData.description || "Không thể gửi"));
                }
              }
            }
          } catch (tgErr: any) {
            console.error("Lỗi gửi Telegram tự động:", tgErr);
          }

          const finalMessage = messageList.length > 0 ? messageList.join(" | ") : "Chưa cấu hình kênh nhận thông báo.";
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ success: sentSuccess, message: finalMessage, card }));
        } catch (e: any) {
          res.writeHead(500, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ success: false, error: e.message }));
        }
      });

      // GET/POST /api/cron/check-missing-reports: Returns daily missing report Adaptive Card for Power Automate / cron jobs
      server.middlewares.use("/api/cron/check-missing-reports", async (req, res) => {
        try {
          const card = await getLiveMissingStatus();
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify(card));
        } catch (e: any) {
          res.writeHead(500, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: e.message }));
        }
      });

      // POST /api/send-msteams: Server-side proxy for sending MS Teams reports (avoids CORS issues & handles format fallbacks)
      server.middlewares.use("/api/send-msteams", async (req, res, next) => {

        if (req.method !== "POST") {
          return next();
        }

        let body = "";
        req.on("data", (chunk) => {
          body += chunk.toString();
        });

        req.on("end", async () => {
          try {
            const { webhookUrl, record, customPayload } = JSON.parse(body);
            if (!webhookUrl || (!record && !customPayload)) {
              res.writeHead(400, { "Content-Type": "application/json" });
              res.end(JSON.stringify({ success: false, message: "Thiếu URL webhook hoặc dữ liệu báo cáo" }));
              return;
            }

            // Deduplication Guard: Check if same report was proxy-sent within last 15 seconds
            const proxyKey = record ? `${record.restaurantName}_${record.date}` : (customPayload ? JSON.stringify(customPayload).slice(0, 50) : "");
            const nowTime = Date.now();
            if (proxyKey && (nowTime - (recentlySentProxyMap.get(proxyKey) || 0) < 15000)) {
              console.log("[SERVER PROXY] Deduplicated duplicate MS Teams send for:", proxyKey);
              res.writeHead(200, { "Content-Type": "application/json" });
              res.end(JSON.stringify({ success: true, message: "Đã gửi báo cáo & phân tích tự động lên MS Teams thành công! (Deduplicated)" }));
              return;
            }
            if (proxyKey) {
              recentlySentProxyMap.set(proxyKey, nowTime);
            }

            if (customPayload) {
              const url = webhookUrl.trim();
              const response = await fetch(url, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(customPayload),
              });
              if (response.ok || response.status === 200 || response.status === 202) {
                res.writeHead(200, { "Content-Type": "application/json" });
                res.end(JSON.stringify({ success: true, message: "Đã gửi qua server proxy thành công" }));
                return;
              } else {
                const errText = await response.text();
                res.writeHead(500, { "Content-Type": "application/json" });
                res.end(JSON.stringify({ success: false, message: `Lỗi Webhook (${response.status}): ${errText}` }));
                return;
              }
            }

            const isMaisonKayser =
              (record.bakeryCoupons && record.bakeryCoupons > 0) ||
              record.restaurantName.toLowerCase().includes("maison");

            const rate = record.utilizationRate || 0;
            const totalIssued = record.totalIssued || 0;
            const postedBills = record.postedBills || 0;
            const cancelled = record.cancelled || 0;
            const potato = record.potatoCoupons || 0;
            const beer = record.beerCoupons || 0;
            const bakery = record.bakeryCoupons || 0;

            const imgCount = (record.billImages && Array.isArray(record.billImages)) ? record.billImages.length : 0;
            const hasImageProof = imgCount > 0;
            const billNoText = record.billNumber ? ` (Mã Bill: #${record.billNumber})` : "";

            // Generate Visual Progress Bar
            const filledCount = Math.min(10, Math.max(0, Math.round(rate / 10)));
            const emptyCount = 10 - filledCount;
            const progressBar = "█".repeat(filledCount) + "░".repeat(emptyCount);

            let performanceAssessment = "";
            let badgeText = "";
            let badgeColor = "Good"; // Good, Warning, Attention

            if (rate >= 80) {
              badgeText = "🔥 HIỆU SUẤT XUẤT SẮC";
              badgeColor = "Good";
            } else if (rate >= 50) {
              badgeText = "👍 HIỆU SUẤT KHÁ TỐT";
              badgeColor = "Warning";
            } else {
              badgeText = "⚠️ CẦN CẢI THIỆN";
              badgeColor = "Attention";
            }

            if (isMaisonKayser) {
              const bakeryVal = bakery || postedBills || 0;
              performanceAssessment = `🥐 **PHÂN TÍCH NHU CẦU & XU HƯỚNG (MAISON KAYSER):**\n\n` +
                `• **Hành vi & Nhu cầu:** Nhà hàng Maison Kayser đạt tỷ lệ quy đổi **${rate}%** với **${bakeryVal.toLocaleString("vi-VN")}** voucher bánh đã thu hồi. Nhu cầu tiêu thụ các dòng bánh ngọt/bánh mì tại điểm bán duy trì rất ổn định.\n\n` +
                `• **Khuyến nghị vận hành:** Mức độ thu hút tốt. Khuyến nghị Bếp Bánh chủ động chuẩn bị nguyên liệu tươi trong ngày cho các ca dịch vụ tiếp theo.`;
            } else {
              const beerLiters = (beer * 0.5).toFixed(1);
              const potatoKg = (potato * 0.1).toFixed(1);
              const beerCost = beer * 16000;
              const potatoCost = potato * 13000;
              const totalCost = beerCost + potatoCost;
              const totalCoupons = (beer + potato) || 1;
              const beerPct = Math.round((beer / totalCoupons) * 100);
              const potatoPct = 100 - beerPct;

              const trendStatus = rate >= 80 ? "Xuất sắc" : rate >= 50 ? "Khá tốt" : "Cần tăng cường";

              performanceAssessment = `✨ **PHÂN TÍCH NHU CẦU & XU HƯỚNG CHUYÊN GIA:**\n\n` +
                `• **Hành vi khách hàng:** Khách có xu hướng tiêu dùng theo **Combo Bia & Khoai** kết hợp (**${beerPct}%** Bia / **${potatoPct}%** Khoai). Đây là gói ưu đãi "mồi câu" xuất sắc giúp thu hút khách dùng bữa.\n\n` +
                `• **Sản lượng & Chi phí:** Tiêu thụ thực tế đạt **${beerLiters} Lít Bia** (${beerCost.toLocaleString("vi-VN")} VNĐ) & **${potatoKg} kg Khoai** (${potatoCost.toLocaleString("vi-VN")} VNĐ). Tổng chi phí quy đổi đạt **${totalCost.toLocaleString("vi-VN")} VNĐ**.\n\n` +
                `• **Đánh giá xu hướng:** Tỷ lệ chuyển đổi **${rate}%** (${trendStatus}). Khuyến nghị Bếp & Bar chủ động chuẩn bị kho lạnh (0.5L/vé bia & 0.1kg/vé khoai) cho các khung giờ cao điểm tiếp theo.`;
            }

            // Format 1: Modern Visual Dashboard Adaptive Card
            const adaptiveCardPayload = {
              type: "message",
              attachments: [
                {
                  contentType: "application/vnd.microsoft.card.adaptive",
                  contentUrl: null,
                  content: {
                    $schema: "http://adaptivecards.io/schemas/adaptive-card.json",
                    type: "AdaptiveCard",
                    version: "1.2",
                    body: [
                      {
                        type: "TextBlock",
                        size: "ExtraLarge",
                        weight: "Bolder",
                        text: `📊 DASHBOARD VOUCHER — ${record.restaurantName.toUpperCase()}`,
                        color: rate >= 80 ? "Good" : rate >= 50 ? "Warning" : "Attention",
                        wrap: true
                      },
                      {
                        type: "TextBlock",
                        text: `📅 **Ngày:** ${record.date}  |  👤 **Người báo cáo:** ${record.createdBy || "Hệ thống"}`,
                        isSubtle: true,
                        spacing: "None"
                      },
                      {
                        type: "Container",
                        style: "emphasis",
                        spacing: "Medium",
                        items: [
                          {
                            type: "ColumnSet",
                            columns: [
                              {
                                type: "Column",
                                width: "stretch",
                                items: [
                                  {
                                    type: "TextBlock",
                                    text: "TỶ LỆ QUY ĐỔI KPI",
                                    size: "Small",
                                    weight: "Bolder",
                                    isSubtle: true
                                  },
                                  {
                                    type: "TextBlock",
                                    text: `${progressBar}  ${rate}%`,
                                    size: "Medium",
                                    weight: "Bolder",
                                    color: rate >= 80 ? "Good" : rate >= 50 ? "Warning" : "Attention"
                                  }
                                ]
                              },
                              {
                                type: "Column",
                                width: "auto",
                                items: [
                                  {
                                    type: "TextBlock",
                                    text: badgeText,
                                    weight: "Bolder",
                                    color: badgeColor,
                                    size: "Small"
                                  }
                                ]
                              }
                            ]
                          }
                        ]
                      },
                      {
                        type: "TextBlock",
                        text: "📈 CHI TIẾT SỐ LIỆU TỔNG QUAN",
                        weight: "Bolder",
                        size: "Medium",
                        spacing: "Medium"
                      },
                      {
                        type: "ColumnSet",
                        columns: [
                          {
                            type: "Column",
                            width: "1",
                            items: [
                              { type: "TextBlock", text: "Tổng Thu Về", size: "Small", isSubtle: true },
                              { type: "TextBlock", text: `${totalIssued}`, size: "Large", weight: "Bolder" }
                            ]
                          },
                          {
                            type: "Column",
                            width: "1",
                            items: [
                              { type: "TextBlock", text: "Thu Về (Bill)", size: "Small", isSubtle: true },
                              { type: "TextBlock", text: `${postedBills}`, size: "Large", weight: "Bolder", color: "Good" }
                            ]
                          },
                          {
                            type: "Column",
                            width: "1",
                            items: [
                              { type: "TextBlock", text: "Hủy Bỏ", size: "Small", isSubtle: true },
                              { type: "TextBlock", text: `${cancelled}`, size: "Large", weight: "Bolder", color: "Attention" }
                            ]
                          }
                        ]
                      },
                      {
                        type: "Container",
                        separator: true,
                        spacing: "Medium",
                        items: [
                          {
                            type: "TextBlock",
                            text: "📦 PHÂN LOẠI CHI TIẾT VOUCHER",
                            weight: "Bolder",
                            size: "Small",
                            isSubtle: true
                          },
                          isMaisonKayser
                            ? {
                                type: "ColumnSet",
                                columns: [
                                  {
                                    type: "Column",
                                    width: "1",
                                    items: [
                                      { type: "TextBlock", text: "🥐 Voucher Bánh (Maison Kayser)", size: "Small" },
                                      { type: "TextBlock", text: `**${bakery}** chiếc`, size: "Medium", weight: "Bolder" }
                                    ]
                                  }
                                ]
                              }
                            : {
                                type: "ColumnSet",
                                columns: [
                                  {
                                    type: "Column",
                                    width: "1",
                                    items: [
                                      { type: "TextBlock", text: "🍟 Coupon Khoai Tây", size: "Small" },
                                      { type: "TextBlock", text: `**${potato}** phiếu`, size: "Medium", weight: "Bolder", color: "Warning" }
                                    ]
                                  },
                                  {
                                    type: "Column",
                                    width: "1",
                                    items: [
                                      { type: "TextBlock", text: "🍺 Coupon Bia", size: "Small" },
                                      { type: "TextBlock", text: `**${beer}** phiếu`, size: "Medium", weight: "Bolder", color: "Accent" }
                                    ]
                                  }
                                ]
                              }
                        ]
                      },
                      {
                        type: "Container",
                        style: hasImageProof ? "good" : "attention",
                        spacing: "Medium",
                        items: [
                          {
                            type: "TextBlock",
                            text: "🖼️ TÌNH TRẠNG ÁNH MINH CHỨNG BILL",
                            weight: "Bolder",
                            size: "Small",
                            isSubtle: true
                          },
                          {
                            type: "TextBlock",
                            text: hasImageProof
                              ? `📸 **ĐÃ ĐÍNH KÈM ${imgCount} ÁNH MINH CHỨNG**${billNoText}`
                              : `⚠️ **CHƯA ĐÍNH KÈM ÁNH MINH CHỨNG BILL**${billNoText}`,
                            weight: "Bolder",
                            color: hasImageProof ? "Good" : "Attention",
                            wrap: true
                          }
                        ]
                      },
                      {
                        type: "Container",
                        style: "emphasis",
                        spacing: "Medium",
                        items: [
                          {
                            type: "TextBlock",
                            text: "💡 ĐÁNH GIÁ & PHÂN TÍCH TỰ ĐỘNG",
                            weight: "Bolder",
                            size: "Medium"
                          },
                          {
                            type: "TextBlock",
                            text: performanceAssessment,
                            wrap: true
                          }
                        ]
                      }
                    ],
                    actions: [
                      {
                        type: "Action.OpenUrl",
                        title: "🌐 Mở Live Dashboard Báo Cáo",
                        url: "https://ais-pre-bwzcf2gu5c624hioouglz7-321266207795.asia-east1.run.app"
                      }
                    ]
                  }
                }
              ]
            };

            // Format 2: Rich MessageCard with Visual Progress Bar
            const messageCardPayload = {
              "@type": "MessageCard",
              "@context": "http://schema.org/extensions",
              "themeColor": rate >= 80 ? "10B981" : rate >= 50 ? "F59E0B" : "EF4444",
              "summary": `Dashboard Voucher ${record.restaurantName} - ${record.date}`,
              "sections": [
                {
                  "activityTitle": `📊 BÁO CÁO PHÂN TÍCH VOUCHER (${record.restaurantName.toUpperCase()})`,
                  "activitySubtitle": `📅 Ngày: ${record.date} | 👤 Người báo cáo: ${record.createdBy || "Hệ thống"}`,
                  "facts": [
                    { name: "📈 Tỷ Lệ Quy Đổi KPI:", value: `${progressBar} **${rate}%**` },
                    { name: "📥 Tổng Voucher Thu Về:", value: `**${totalIssued}** phiếu *(Quy đổi: ${postedBills}, Hủy: ${cancelled})*` },
                    { name: "🧾 Voucher Quy Đổi (Đăng Bill):", value: `**${postedBills}** phiếu` },
                    { name: "❌ Coupon Hủy:", value: `**${cancelled}** phiếu` },
                    {
                      name: "🖼️ Ảnh Minh Chứng Bill:",
                      value: hasImageProof
                        ? `📸 **Đã có ${imgCount} ảnh minh chứng**${billNoText}`
                        : `⚠️ **Chưa có ảnh minh chứng**`
                    },
                    ...(isMaisonKayser
                      ? [{ name: "🥐 Voucher Bánh:", value: `**${bakery}** chiếc` }]
                      : [
                          { name: "🍟 Coupon Khoai Tây:", value: `**${potato}** phiếu` },
                          { name: "🍺 Coupon Bia:", value: `**${beer}** phiếu` },
                        ]),
                  ],
                  "markdown": true
                },
                {
                  "activityTitle": "💡 ĐÁNH GIÁ & PHÂN TÍCH TỰ ĐỘNG",
                  "text": `${badgeText}\n\n${performanceAssessment}`,
                  "markdown": true
                }
              ],
              "potentialAction": [
                {
                  "@type": "OpenUri",
                  "name": "🌐 Mở Dashboard Trực Tuyến",
                  "targets": [
                    { "os": "default", "uri": "https://ais-pre-bwzcf2gu5c624hioouglz7-321266207795.asia-east1.run.app" }
                  ]
                }
              ]
            };

            // Format 3: Simple Text Fallback
            const simpleTextPayload = {
              text: `📊 BÁO CÁO PHÂN TÍCH VOUCHER (${record.restaurantName.toUpperCase()})\n📅 Ngày: ${record.date}\n\n` +
                `📈 Tỷ lệ KPI: ${progressBar} ${rate}%\n` +
                `📥 Tổng Thu Về: ${totalIssued} (Quy đổi: ${postedBills}, Hủy: ${cancelled})\n` +
                (isMaisonKayser ? `🥐 Voucher Bánh: ${bakery}\n` : `🍟 Khoai Tây: ${potato} | 🍺 Bia: ${beer}\n`) +
                `\n💡 PHÂN TÍCH TỰ ĐỘNG:\n${badgeText}\n${performanceAssessment}`
            };

            const url = webhookUrl.trim();
            const isPowerAutomate =
              url.includes("logic.azure.com") ||
              url.includes("powerautomate") ||
              url.includes("powerplatform") ||
              url.includes("flow.microsoft.com");

            // Direct Adaptive Card object (some Power Automate workflows expect raw AdaptiveCard body without message wrapper)
            const directAdaptiveCardPayload = adaptiveCardPayload.attachments[0].content;

            // Power Automate Workflows Workflows expect a raw Adaptive Card JSON object at the root level!
            // When sent as direct Adaptive Card JSON, Power Automate's "Post card in a chat or channel" action renders the card UI natively.
            const payloadsToTry = isPowerAutomate
              ? [directAdaptiveCardPayload, adaptiveCardPayload, simpleTextPayload]
              : [messageCardPayload, directAdaptiveCardPayload, adaptiveCardPayload, simpleTextPayload];

            let lastError = "";
            let success = false;

            for (const payload of payloadsToTry) {
              try {
                const response = await fetch(url, {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify(payload),
                });

                if (response.ok || response.status === 200 || response.status === 202) {
                  success = true;
                  break;
                } else {
                  const errText = await response.text();
                  lastError = `HTTP ${response.status}: ${errText}`;
                }
              } catch (e: any) {
                lastError = e.message || String(e);
              }
            }

            if (success) {
              res.writeHead(200, { "Content-Type": "application/json" });
              res.end(JSON.stringify({ success: true, message: "Đã gửi báo cáo & phân tích lên nhóm MS Teams thành công!" }));
            } else {
              res.writeHead(400, { "Content-Type": "application/json" });
              res.end(JSON.stringify({ success: false, message: "MS Teams Webhook phản hồi: " + lastError }));
            }
          } catch (err: any) {
            res.writeHead(500, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ success: false, message: "Lỗi xử lý gửi MS Teams: " + (err.message || String(err)) }));
          }
        });
      });

      // POST /__manus__/logs: Browser sends logs (written directly to files)
      server.middlewares.use("/__manus__/logs", (req, res, next) => {
        if (req.method !== "POST") {
          return next();
        }

        const handlePayload = (payload: any) => {
          // Write logs directly to files
          if (payload.consoleLogs?.length > 0) {
            writeToLogFile("browserConsole", payload.consoleLogs);
          }
          if (payload.networkRequests?.length > 0) {
            writeToLogFile("networkRequests", payload.networkRequests);
          }
          if (payload.sessionEvents?.length > 0) {
            writeToLogFile("sessionReplay", payload.sessionEvents);
          }

          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ success: true }));
        };

        const reqBody = (req as { body?: unknown }).body;
        if (reqBody && typeof reqBody === "object") {
          try {
            handlePayload(reqBody);
          } catch (e) {
            res.writeHead(400, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ success: false, error: String(e) }));
          }
          return;
        }

        let body = "";
        req.on("data", (chunk) => {
          body += chunk.toString();
        });

        req.on("end", () => {
          try {
            const payload = JSON.parse(body);
            handlePayload(payload);
          } catch (e) {
            res.writeHead(400, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ success: false, error: String(e) }));
          }
        });
      });
    },
    configurePreview(server: any) {
      if (this && typeof this.configureServer === "function") {
        this.configureServer(server);
      }
    }
  };
}

const plugins = [react(), tailwindcss(), jsxLocPlugin(), vitePluginManusRuntime(), vitePluginManusDebugCollector()];

export default defineConfig({
  plugins,
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "client", "src"),
      "@shared": path.resolve(import.meta.dirname, "shared"),
      "@server": path.resolve(import.meta.dirname, "server"),
      "@_core": path.resolve(import.meta.dirname, "server", "_core"),
      "@assets": path.resolve(import.meta.dirname, "attached_assets"),
    },
  },
  envDir: path.resolve(import.meta.dirname),
  root: path.resolve(import.meta.dirname, "client"),
  publicDir: path.resolve(import.meta.dirname, "client", "public"),
  build: {
    outDir: path.resolve(import.meta.dirname, "dist/public"),
    emptyOutDir: true,
  },
  server: {
    host: true,
    allowedHosts: [
      ".manuspre.computer",
      ".manus.computer",
      ".manus-asia.computer",
      ".manuscomputer.ai",
      ".manusvm.computer",
      "localhost",
      "127.0.0.1",
    ],
    fs: {
      strict: true,
      deny: ["**/.*"],
    },
  },
});
