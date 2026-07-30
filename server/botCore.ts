/**
 * botCore.ts — Logic lõi dùng chung cho Telegram Bot & báo cáo kiểm kê voucher.
 *
 * Đây là NGUỒN DUY NHẤT (single source of truth) cho:
 *  - getLiveMissingStatus(): dựng Adaptive Card trạng thái thiếu báo cáo
 *  - processTelegramMessageCommand(): xử lý & trả lời lệnh chat Telegram
 *
 * Module này KHÔNG phụ thuộc Vite hay bất kỳ runtime nào — chỉ dùng `fetch`
 * toàn cục (Node 18+). Vì vậy nó chạy được ở CẢ HAI nơi:
 *   1. Vite dev server (vite.config.ts, chế độ polling — chỉ dùng khi dev local)
 *   2. Vercel Serverless Functions (api/telegram/*, chế độ webhook — production)
 */

import type { IncomingMessage } from "node:http";

// LƯU Ý: đây là các giá trị CÔNG KHAI lấy từ web config (firebase-applet-config.json),
// KHÔNG phải secret. Điểm mấu chốt từng gây lỗi CONSUMER_INVALID:
//  - projectId thật là "peak-jigsaw-h8gvj" (không phải chuỗi ai-studio-... — đó là DATABASE id)
//  - Firestore dùng NAMED database, không phải "(default)"
//  - REST bắt buộc kèm ?key=<apiKey> để hợp lệ ở tầng API consumer.
export const FIREBASE_PROJECT_ID = process.env.FIREBASE_PROJECT_ID || "peak-jigsaw-h8gvj";
export const FIRESTORE_DATABASE_ID =
  process.env.FIRESTORE_DATABASE_ID ||
  "ai-studio-beervoucher-cd7e66ad-a681-4c93-a133-30df0862fdee";
export const FIREBASE_API_KEY =
  process.env.FIREBASE_API_KEY || "AIzaSyA2J7pChKraAovbslqBL4xB5fn0JU-UsNs";

export const LIVE_DASHBOARD_URL =
  "https://ais-pre-bwzcf2gu5c624hioouglz7-321266207795.asia-east1.run.app";

export const RESTAURANTS = [
  { id: "lehoibia", name: "Lê Hội Bia" },
  { id: "nhahang1901", name: "Nhà Hàng 1901" },
  { id: "beerplaza", name: "Beer Plaza" },
  { id: "maisonkayser", name: "Maison Kayser" },
];

const firestoreDocUrl = (path: string) =>
  `https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT_ID}/databases/${FIRESTORE_DATABASE_ID}/documents/${path}?key=${FIREBASE_API_KEY}`;

/** Đọc 1 giá trị chuỗi từ collection `settings` (settings/{key}.value). */
export async function getFirestoreSetting(key: string): Promise<string> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 6000);
    const resp = await fetch(firestoreDocUrl(`settings/${key}`), {
      signal: controller.signal,
    }).finally(() => clearTimeout(timeout));
    if (!resp.ok) return "";
    const data = await resp.json();
    return (data.fields?.value?.stringValue || "").trim();
  } catch {
    return "";
  }
}

/** Lấy Telegram Bot Token đã lưu trong Firestore. */
export function getTelegramBotToken(): Promise<string> {
  return getFirestoreSetting("telegram_bot_token");
}

/**
 * Đọc JSON body từ request (tương thích cả Vercel đã parse sẵn `req.body`
 * lẫn Node stream thô). Trả về {} nếu rỗng/không hợp lệ.
 */
export function readJsonBody(req: IncomingMessage): Promise<any> {
  const preParsed = (req as any).body;
  if (preParsed && typeof preParsed === "object") {
    return Promise.resolve(preParsed);
  }
  if (typeof preParsed === "string") {
    try {
      return Promise.resolve(JSON.parse(preParsed || "{}"));
    } catch {
      return Promise.resolve({});
    }
  }
  return new Promise((resolve) => {
    let body = "";
    req.on("data", (chunk) => (body += chunk.toString()));
    req.on("end", () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch {
        resolve({});
      }
    });
    req.on("error", () => resolve({}));
  });
}

interface UpdatedRestaurant {
  name: string;
  postedBills: number;
  imgCount: number;
  billNo?: string;
}

/**
 * Quét Firestore trạng thái cập nhật kiểm kê của 4 nhà hàng cho `dateStr`
 * (mặc định hôm qua) và dựng MS Teams Adaptive Card cảnh báo lệch.
 */
export async function getLiveMissingStatus(dateStr?: string) {
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
  const updated: UpdatedRestaurant[] = [];

  for (const r of RESTAURANTS) {
    const docId = `${r.id}_${targetDateStr}`;
    try {
      const resp = await fetch(firestoreDocUrl(`vouchers/${docId}`));
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

        if (updatedAtVal || postedBillsVal > 0 || totalIssuedVal > 0 || bakeryVal > 0 || beerVal > 0 || potatoVal > 0) {
          updated.push({
            name: r.name,
            postedBills: postedBillsVal || bakeryVal || 1,
            imgCount,
            billNo,
          });
          continue;
        }
      }
      missing.push(r.name);
    } catch {
      missing.push(r.name);
    }
  }

  const missingText = missing.length > 0
    ? missing.map((m) => `• **${m}**: ❌ **CHƯA** cập nhật số liệu (⚠️ Chưa có ảnh minh chứng)`).join("\n\n")
    : "🟢 Tất cả nhà hàng đã gửi báo cáo số liệu & ảnh đầy đủ!";

  const updatedText = updated.length > 0
    ? updated.map((u) => {
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
        wrap: true,
      },
      {
        type: "TextBlock",
        text: `📅 **Ngày kiểm tra:** ${formattedCheckDate}  |  ⏰ **Thời gian quét:** ${timeStr}`,
        isSubtle: true,
        wrap: true,
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
            wrap: true,
          },
          {
            type: "TextBlock",
            text: missingText,
            wrap: true,
          },
        ],
      },
      {
        type: "Container",
        style: "emphasis",
        items: [
          {
            type: "TextBlock",
            text: `🟢 ĐÃ CẬP NHẬT HOÀN TẤT (${updated.length}/${RESTAURANTS.length}):`,
            weight: "Bolder",
            wrap: true,
          },
          {
            type: "TextBlock",
            text: updatedText,
            wrap: true,
          },
        ],
      },
    ],
    actions: [
      {
        type: "Action.OpenUrl",
        title: "🌐 Mở Trang Nhập Báo Cáo Ngay",
        url: LIVE_DASHBOARD_URL,
      },
    ],
  };
}

// ===========================================================================
// AI AUDIT (Gemini Vision): so ảnh minh chứng bộ phận up vs số liệu nhập app
// ===========================================================================

const numField = (f: any): number => Number(f?.integerValue || f?.doubleValue || 0);

export interface VoucherRec {
  restaurantId: string;
  restaurantName: string;
  date: string;
  postedBills: number;
  totalIssued: number;
  beerCoupons: number;
  potatoCoupons: number;
  bakeryCoupons: number;
  cancelled: number;
  billImages: string[];
  billNumber?: string;
}

/** Đọc 1 record voucher (kèm ảnh base64) của 1 nhà hàng cho 1 ngày. */
export async function getVoucherRecord(
  restaurantId: string,
  restaurantName: string,
  date: string,
): Promise<VoucherRec | null> {
  try {
    const resp = await fetch(firestoreDocUrl(`vouchers/${restaurantId}_${date}`));
    if (!resp.ok) return null;
    const data = await resp.json();
    const f = data.fields;
    if (!f) return null;
    const imgs: string[] = (f.billImages?.arrayValue?.values || [])
      .map((v: any) => v?.stringValue)
      .filter((s: any): s is string => typeof s === "string" && s.length > 0);
    return {
      restaurantId,
      restaurantName,
      date,
      postedBills: numField(f.postedBills),
      totalIssued: numField(f.totalIssued),
      beerCoupons: numField(f.beerCoupons),
      potatoCoupons: numField(f.potatoCoupons),
      bakeryCoupons: numField(f.bakeryCoupons),
      cancelled: numField(f.cancelled),
      billImages: imgs,
      billNumber: f.billNumber?.stringValue,
    };
  } catch {
    return null;
  }
}

export type AuditStatus = "MATCH" | "MISMATCH" | "NO_IMAGES" | "NO_DATA" | "NO_KEY" | "ERROR";

export interface AuditResult {
  restaurantId: string;
  restaurantName: string;
  date: string;
  imageCount: number;
  dataEntered: { postedBills: number; totalIssued: number; beerCoupons: number; potatoCoupons: number; cancelled: number };
  aiExtracted: { postedBills?: number | null; totalIssued?: number | null; beerCoupons?: number | null; potatoCoupons?: number | null };
  status: AuditStatus;
  discrepancies: string[];
  summaryNote: string;
}

const GEMINI_AUDIT_PROMPT = (rec: VoucherRec) => `Bạn là trợ lý AI Soát Xét Báo Cáo Nhà Hàng ("Biên bản ghi nhận sự việc" hoặc Hóa đơn/Bill).
Hãy soi kỹ các ảnh đính kèm và đọc chữ viết tay/chữ in để trích xuất các con số thực tế trên tài liệu:
1. Số phiếu quy đổi / Đăng bill
2. Tổng Voucher Thu Về
3. Số lượng bia (lít / ly / vé)
4. Số lượng khoai tây (phần / kg)

Số liệu bộ phận nhà hàng [${rec.restaurantName}] nhập khai báo là:
- Phiếu quy đổi: ${rec.postedBills}
- Tổng Voucher Thu Về: ${rec.totalIssued}
- Bia xuất: ${rec.beerCoupons}
- Khoai xuất: ${rec.potatoCoupons}

So sánh số liệu đọc trên ảnh với số liệu khai báo.
Chỉ trả về duy nhất 1 JSON hợp lệ, KHÔNG bọc trong markdown block:
{
  "ocrPostedBills": number_hoặc_null,
  "ocrTotalIssued": number_hoặc_null,
  "ocrBeerCoupons": number_hoặc_null,
  "ocrPotatoCoupons": number_hoặc_null,
  "isMatch": true_hoặc_false,
  "discrepancies": ["chi tiết sai lệch nếu có (ví dụ: Ảnh ghi 1116 nhưng khai báo 1142)"],
  "summaryNote": "Tóm tắt ngắn gọn 1 câu"
}`;

const entered = (rec: VoucherRec) => ({
  postedBills: rec.postedBills,
  totalIssued: rec.totalIssued,
  beerCoupons: rec.beerCoupons,
  potatoCoupons: rec.potatoCoupons,
  cancelled: rec.cancelled,
});

/** Chạy Gemini đối soát cho 4 nhà hàng của 1 ngày (song song). */
export async function auditDateWithGemini(targetDate: string): Promise<AuditResult[]> {
  const recs = await Promise.all(
    RESTAURANTS.map((r) => getVoucherRecord(r.id, r.name, targetDate)),
  );
  const apiKey = process.env.GEMINI_API_KEY;

  return Promise.all(
    RESTAURANTS.map(async (r, i): Promise<AuditResult> => {
      const rec = recs[i];
      const skeleton = {
        restaurantId: r.id,
        restaurantName: r.name,
        date: targetDate,
      };
      if (!rec) {
        return {
          ...skeleton,
          imageCount: 0,
          dataEntered: { postedBills: 0, totalIssued: 0, beerCoupons: 0, potatoCoupons: 0, cancelled: 0 },
          aiExtracted: {},
          status: "NO_DATA",
          discrepancies: ["❌ Chưa nhập số liệu / chưa có báo cáo cho ngày này."],
          summaryNote: "Nhà hàng chưa gửi báo cáo.",
        };
      }
      const base = { ...skeleton, imageCount: rec.billImages.length, dataEntered: entered(rec), aiExtracted: {} as AuditResult["aiExtracted"] };
      if (rec.billImages.length === 0) {
        return { ...base, status: "NO_IMAGES", discrepancies: ["⚠️ Đã nhập số liệu nhưng CHƯA đính kèm ảnh minh chứng."], summaryNote: "Thiếu ảnh để đối soát AI." };
      }
      if (!apiKey) {
        return { ...base, status: "NO_KEY", discrepancies: ["⚠️ Server chưa cấu hình GEMINI_API_KEY nên chưa soi ảnh được."], summaryNote: "Chưa bật OCR AI trên server." };
      }
      try {
        const { GoogleGenAI } = await import("@google/genai");
        const ai = new GoogleGenAI({ apiKey });
        const imageParts = rec.billImages
          .slice(0, 3)
          .map((imgUrl) => {
            const m = imgUrl.match(/^data:(image\/[a-zA-Z]+);base64,(.+)$/);
            return m ? { inlineData: { mimeType: m[1], data: m[2] } } : null;
          })
          .filter(Boolean);

        if (imageParts.length === 0) {
          return { ...base, status: "ERROR", discrepancies: ["Ảnh không đúng định dạng base64 để đọc."], summaryNote: "Không đọc được ảnh." };
        }

        const response = await ai.models.generateContent({
          model: "gemini-2.5-flash",
          contents: [{ role: "user", parts: [{ text: GEMINI_AUDIT_PROMPT(rec) }, ...(imageParts as any[])] }],
        });
        let raw = (response.text || "").replace(/```json/g, "").replace(/```/g, "").trim();
        const parsed = JSON.parse(raw);
        const disc: string[] = parsed.discrepancies || [];
        return {
          ...base,
          aiExtracted: {
            postedBills: parsed.ocrPostedBills,
            totalIssued: parsed.ocrTotalIssued,
            beerCoupons: parsed.ocrBeerCoupons,
            potatoCoupons: parsed.ocrPotatoCoupons,
          },
          status: parsed.isMatch ? "MATCH" : (disc.length > 0 ? "MISMATCH" : "MATCH"),
          discrepancies: disc,
          summaryNote: parsed.summaryNote || "Đã đối soát với AI.",
        };
      } catch (e: any) {
        return { ...base, status: "ERROR", discrepancies: [`Lỗi OCR AI: ${e?.message || String(e)}`], summaryNote: "Không đọc được ảnh bằng AI." };
      }
    }),
  );
}

const AUDIT_ICON: Record<AuditStatus, string> = {
  MATCH: "🟢",
  MISMATCH: "🚨",
  NO_IMAGES: "⚠️",
  NO_DATA: "⬜",
  NO_KEY: "🔧",
  ERROR: "❓",
};

/** Định dạng kết quả audit thành HTML cho Telegram. */
export function formatAuditReportHtml(targetDate: string, results: AuditResult[]): string {
  const dp = targetDate.split("-");
  const formatted = `${dp[2]}/${dp[1]}/${dp[0]}`;
  const match = results.filter((r) => r.status === "MATCH").length;
  const mismatch = results.filter((r) => r.status === "MISMATCH").length;
  const noImg = results.filter((r) => r.status === "NO_IMAGES").length;
  const noData = results.filter((r) => r.status === "NO_DATA").length;
  const noKey = results.some((r) => r.status === "NO_KEY");

  let html = `<b>🤖 ĐỐI SOÁT AI (Gemini soi ảnh vs số nhập)</b>\n`;
  html += `📅 <b>Ngày:</b> ${formatted}  |  ⏱ ${new Date().toLocaleTimeString("vi-VN")}\n`;
  html += `📊 Khớp 🟢${match} | Sai lệch 🚨${mismatch} | Thiếu ảnh ⚠️${noImg} | Chưa nhập ⬜${noData}\n`;
  if (noKey) html += `🔧 <i>Server chưa cấu hình GEMINI_API_KEY — chưa soi được ảnh.</i>\n`;
  html += `\n`;

  for (const r of results) {
    html += `${AUDIT_ICON[r.status]} <b>${r.restaurantName}</b>\n`;
    if (r.status === "NO_DATA") {
      html += `   └ ❌ Chưa nhập số liệu.\n\n`;
      continue;
    }
    html += `   └ BP nhập: Quy đổi <b>${r.dataEntered.postedBills}</b> | Tổng thu về <b>${r.dataEntered.totalIssued}</b> | Bia <b>${r.dataEntered.beerCoupons}</b> | Khoai <b>${r.dataEntered.potatoCoupons}</b>\n`;
    if (r.status === "MATCH") {
      html += `   └ ✅ AI soi ${r.imageCount} ảnh: <b>KHỚP</b> với chứng từ.\n`;
    } else if (r.status === "MISMATCH") {
      html += `   └ 🔍 AI đọc ảnh: Quy đổi <b>${r.aiExtracted.postedBills ?? "?"}</b> | Tổng <b>${r.aiExtracted.totalIssued ?? "?"}</b> | Bia <b>${r.aiExtracted.beerCoupons ?? "?"}</b> | Khoai <b>${r.aiExtracted.potatoCoupons ?? "?"}</b>\n`;
      for (const d of r.discrepancies) html += `   └ 🚨 <b>${d}</b>\n`;
    } else {
      for (const d of r.discrepancies) html += `   └ ${d}\n`;
    }
    html += `\n`;
  }

  if (mismatch > 0) {
    html += `🔴 <b>Có ${mismatch} nhà hàng SAI LỆCH.</b> Nhắn <b>"gửi ms teams"</b> để đẩy báo cáo sai lệch này lên MS Teams.\n`;
  } else if (match > 0 && mismatch === 0) {
    html += `✅ <b>Không phát hiện sai lệch.</b> Không cần gửi báo cáo.\n`;
  }
  html += `\n🌐 <a href="${LIVE_DASHBOARD_URL}">Mở Live Dashboard</a>`;
  return html;
}

/** Dựng MS Teams Adaptive Card từ kết quả audit (nhấn mạnh sai lệch). */
export function buildAuditTeamsCard(targetDate: string, results: AuditResult[]) {
  const dp = targetDate.split("-");
  const formatted = `${dp[2]}/${dp[1]}/${dp[0]}`;
  const mismatch = results.filter((r) => r.status === "MISMATCH");

  const lines = results.map((r) => {
    if (r.status === "MISMATCH") {
      return `🚨 **${r.restaurantName}**: SAI LỆCH — ${r.discrepancies.join("; ") || "xem chi tiết"}`;
    }
    if (r.status === "MATCH") return `🟢 **${r.restaurantName}**: Khớp (${r.imageCount} ảnh)`;
    if (r.status === "NO_IMAGES") return `⚠️ **${r.restaurantName}**: Thiếu ảnh minh chứng`;
    if (r.status === "NO_DATA") return `⬜ **${r.restaurantName}**: Chưa nhập số liệu`;
    if (r.status === "NO_KEY") return `🔧 **${r.restaurantName}**: Chưa bật OCR (thiếu API key)`;
    return `❓ **${r.restaurantName}**: ${r.summaryNote}`;
  });

  return {
    $schema: "http://adaptivecards.io/schemas/adaptive-card.json",
    type: "AdaptiveCard",
    version: "1.2",
    body: [
      {
        type: "TextBlock",
        size: "Large",
        weight: "Bolder",
        text: `🤖 BÁO CÁO ĐỐI SOÁT AI — ${formatted}`,
        color: mismatch.length > 0 ? "Attention" : "Good",
        wrap: true,
      },
      {
        type: "TextBlock",
        text: mismatch.length > 0
          ? `🔴 Phát hiện ${mismatch.length} nhà hàng SAI LỆCH giữa ảnh minh chứng và số liệu nhập.`
          : `🟢 Không phát hiện sai lệch giữa ảnh và số liệu nhập.`,
        weight: "Bolder",
        color: mismatch.length > 0 ? "Attention" : "Good",
        wrap: true,
      },
      { type: "TextBlock", text: lines.join("\n\n"), wrap: true },
    ],
    actions: [
      { type: "Action.OpenUrl", title: "🌐 Mở Live Dashboard", url: LIVE_DASHBOARD_URL },
    ],
  };
}

/**
 * Xử lý 1 câu lệnh chat Telegram và tự trả lời qua Bot API.
 * Hỗ trợ: /start /help, đối soát Gemini theo ngày, và "gửi ms teams".
 */
export async function processTelegramMessageCommand(
  text: string,
  chatId: number | string,
  botToken: string,
): Promise<void> {
  const rawText = (text || "").trim();
  // Bỏ handle bot nếu có, ví dụ "/start@beervoucher_bot" -> "/start"
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
        // Fallback sang plain text nếu Telegram từ chối định dạng HTML
        const plainText = replyHtml.replace(/<[^>]+>/g, "");
        await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ chat_id: chatId, text: plainText }),
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
          body: JSON.stringify({ chat_id: chatId, text: plainText }),
        });
      } catch (_) {}
    }
  };

  try {
    // 1. Lệnh chào / trợ giúp
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

    // Trích ngày cần kiểm tra
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

    // 2. Lệnh gửi báo cáo lên MS Teams
    const isTeamsRequest =
      normText.includes("teams") ||
      normText.includes("msteams") ||
      normText.includes("ms teams") ||
      normText.includes("webhook");

    if (isTeamsRequest) {
      await replyTelegram(`⏳ <b>Đang chạy AI đối soát ngày ${formattedDate} rồi gửi lên MS Teams...</b>`);

      try {
        const webhookUrl = await getFirestoreSetting("ms_teams_webhook");

        if (!webhookUrl || !webhookUrl.trim()) {
          await replyTelegram(`❌ <b>Chưa cấu hình MS Teams Webhook!</b>\n\nBạn chưa lưu URL Webhook MS Teams trong mục <b>Cấu hình Hệ thống</b> trên Web App.`);
          return;
        }

        const auditResults = await auditDateWithGemini(targetDate);
        const cardContent = buildAuditTeamsCard(targetDate, auditResults);

        const teamsWrappedPayload = {
          type: "message",
          attachments: [
            {
              contentType: "application/vnd.microsoft.card.adaptive",
              contentUrl: null,
              content: cardContent,
            },
          ],
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

    // 3. Mặc định: chạy AI Gemini soi ảnh minh chứng vs số liệu nhập cho ngày mục tiêu
    await replyTelegram(`⏳ <b>Đang chạy AI Gemini soi ảnh & đối soát ngày ${formattedDate}...</b>\n<i>(Có thể mất ~10–30 giây tuỳ số ảnh)</i>`);
    const auditResults = await auditDateWithGemini(targetDate);
    await replyTelegram(formatAuditReportHtml(targetDate, auditResults));
  } catch (err: any) {
    console.error("[TELEGRAM COMMAND PROC ERR]", err);
    await replyTelegram(`❌ <b>Lỗi xử lý câu lệnh:</b> ${err.message || String(err)}`);
  }
}
