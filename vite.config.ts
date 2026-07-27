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
              url: "https://ais-dev-bwzcf2gu5c624hioouglz7-321266207795.asia-east1.run.app"
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

      // GET/POST /api/cron/trigger-09am: Triggers live check & sends 09:00 AM missing report to MS Teams
      server.middlewares.use("/api/cron/trigger-09am", async (req, res) => {
        try {
          const card = await getLiveMissingStatus();
          let sentSuccess = false;
          let message = "";

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
                    message = "Đã kích hoạt và gửi báo cáo tiến độ 9:00 AM thành công lên kênh MS Teams!";
                    break;
                  }
                } catch (e: any) {
                  message = "Lỗi khi gửi webhook: " + e.message;
                }
              }
            } else {
              message = "Chưa cấu hình Webhook URL MS Teams trong Cài đặt Admin.";
            }
          } else {
            message = "Không thể lấy cấu hình Webhook từ Firestore.";
          }

          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ success: sentSuccess, message, card }));
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
                                    text: "TỶ LỆ PHÁT HÀNH KPI",
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
                              { type: "TextBlock", text: "Phát Hành", size: "Small", isSubtle: true },
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
                        url: "https://ais-dev-bwzcf2gu5c624hioouglz7-321266207795.asia-east1.run.app"
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
                    { name: "🧾 Đã Thu Về (Đăng Bill):", value: `**${postedBills}** phiếu` },
                    { name: "📋 Tổng Phát Hành:", value: `**${totalIssued}** phiếu` },
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
                    { "os": "default", "uri": "https://ais-dev-bwzcf2gu5c624hioouglz7-321266207795.asia-east1.run.app" }
                  ]
                }
              ]
            };

            // Format 3: Simple Text Fallback
            const simpleTextPayload = {
              text: `📊 BÁO CÁO PHÂN TÍCH VOUCHER (${record.restaurantName.toUpperCase()})\n📅 Ngày: ${record.date}\n\n` +
                `📈 Tỷ lệ KPI: ${progressBar} ${rate}%\n` +
                `🧾 Thu Về: ${postedBills} | 📋 Phát Hành: ${totalIssued} | ❌ Hủy: ${cancelled}\n` +
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
