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
            const { webhookUrl, record } = JSON.parse(body);
            if (!webhookUrl || !record) {
              res.writeHead(400, { "Content-Type": "application/json" });
              res.end(JSON.stringify({ success: false, message: "Thiếu URL webhook hoặc dữ liệu báo cáo" }));
              return;
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
              performanceAssessment = `Tỷ lệ quy đổi đạt **${rate}%**, lượng khách sử dụng voucher rất cao. Quy trình tư vấn & phục vụ tại nhà hàng đạt hiệu quả tối ưu.`;
            } else if (rate >= 50) {
              badgeText = "👍 HIỆU SUẤT KHÁ TỐT";
              badgeColor = "Warning";
              performanceAssessment = `Tỷ lệ quy đổi đạt **${rate}%**, lưu lượng khách sử dụng voucher diễn ra ổn định. Duy trì khuyến khích khách dùng voucher.`;
            } else {
              badgeText = "⚠️ CẦN CẢI THIỆN";
              badgeColor = "Attention";
              performanceAssessment = `Tỷ lệ quy đổi đạt **${rate}%**, chưa đạt mức tối ưu. Khuyến nghị nhân viên chủ động nhắc khách về ưu đãi voucher.`;
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
            const payloadsToTry = [adaptiveCardPayload, messageCardPayload, simpleTextPayload];

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
