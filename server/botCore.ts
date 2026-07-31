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
  // Giờ VN (UTC+7): shift epoch +7h rồi đọc bằng getUTC* để ra đúng giờ Việt Nam
  // dù server Vercel chạy ở UTC. Trước đây in giờ UTC nên nhìn tưởng chạy lúc 2h sáng.
  const now = new Date(Date.now() + 7 * 3600 * 1000);
  let targetDateStr = dateStr;
  if (!targetDateStr) {
    const yesterday = new Date(now.getTime() - 86400000);
    const y = yesterday.getUTCFullYear();
    const m = String(yesterday.getUTCMonth() + 1).padStart(2, "0");
    const d = String(yesterday.getUTCDate()).padStart(2, "0");
    targetDateStr = `${y}-${m}-${d}`;
  }

  const dateParts = targetDateStr.split("-");
  const formattedCheckDate = `${dateParts[2]}/${dateParts[1]}/${dateParts[0]}`;
  const timeStr = `${now.getUTCHours().toString().padStart(2, "0")}:${now.getUTCMinutes().toString().padStart(2, "0")}:${now.getUTCSeconds().toString().padStart(2, "0")} ${now.getUTCDate()}/${now.getUTCMonth() + 1}/${now.getUTCFullYear()} (giờ VN)`;

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

// Prompt quy trình 3 BƯỚC: đọc HẾT thông tin (in + viết tay) -> TỰ SOÁT nội bộ
// chứng từ -> CHỐT số đáng tin. Gemini chỉ đọc & soát, còn phép ÷2 và so với app
// do code tự tính (không lệ thuộc AI đọc chữ tay).
const GEMINI_EXTRACT_PROMPT = `Bạn là KIỂM SOÁT VIÊN đọc chứng từ voucher bia nhà hàng. Ảnh có thể gồm HÓA ĐƠN IN (máy in, liệt kê số ly từng loại bia) và/hoặc BIÊN BẢN GHI NHẬN SỰ VIỆC (viết tay). Làm ĐÚNG 3 bước:

MÔ HÌNH 2 NGUỒN (nhớ kỹ):
- HÓA ĐƠN IN = phần ĐÃ QUY ĐỔI: cho biết SỐ LY BIA (mỗi ly 250ml), SỐ PHẦN KHOAI TÂY (mỗi phần 0.1kg), và SỐ BÁNH (Maison Kayser).
- BIÊN BẢN GIAO NHẬN (viết tay) = nơi ghi TỔNG VÉ ("voucher nhận được X phiếu") và VÉ HỦY/THỪA.
- QUAN TRỌNG: Nếu ảnh KHÔNG có hóa đơn in, thì số lượng ĐÃ QUY ĐỔI (bia/khoai/bánh) thường được ghi NGAY trên biên bản (vd: "phát ra 2622 cái bánh, gồm Croissant 1041, Pain au chocolat 888, Raisin danish 693"). Khi đó hãy lấy số đã quy đổi từ biên bản.

BƯỚC 1 — ĐỌC HẾT: Trích TẤT CẢ thông tin, CẢ phần in LẪN viết tay:
- Hóa đơn IN (hóa đơn nhiệt): MỖI dòng có 1 SỐ đứng ngay cạnh tên món = SỐ LƯỢNG (vd "296 GOLDEN BRIDGE 25" = 296 ly Golden; "40 HELIOS 250ML" = 40 ly Helios; dòng khoai tây = số phần khoai). Lấy CHÍNH số này. TUYỆT ĐỐI BỎ QUA cột "QTY"/"PRICE"/"Net Total"/"TOTAL" nếu bằng 0 — đó là hóa đơn voucher/FOC (giá 0), KHÔNG phải số lượng = 0.
- Biên bản giao nhận VIẾT TAY: số "vé / CP / voucher / phiếu"; TỔNG VÉ; VÉ HỦY / vé thừa; ngày. Đọc chữ số thật cẩn thận (dễ nhầm 6↔0, 1↔7, thêm/thiếu chữ số).

BƯỚC 2 — TỰ SOÁT NỘI BỘ: đối chiếu phần IN với phần viết tay. Nếu cùng 1 món mà số in khác số viết tay (vd Helios in 40 nhưng tay ghi 210) → ghi rõ vào "internalNotes".

BƯỚC 3 — CHỐT SỐ ĐÁNG TIN: ƯU TIÊN HÓA ĐƠN IN cho số ly bia/khoai; lấy tổng vé & vé hủy từ biên bản giao nhận. Tự đánh giá độ tin cậy.

Chỉ trả về DUY NHẤT 1 JSON hợp lệ, KHÔNG bọc markdown:
{
  "hoaDonIn": [{"ten": string, "soLy": number}],   // các dòng bia trên hóa đơn IN, [] nếu không có
  "vietTay": [{"ten": string, "soLy": number}],     // các dòng bia viết tay, [] nếu không có
  "tongLyBiaIn": number|null,                        // tổng ly bia từ hóa đơn IN
  "tongLyBiaTay": number|null,                       // tổng ly bia từ viết tay
  "tongLyBia": number|null,                          // số ly bia ĐÃ QUY ĐỔI đáng tin nhất (ưu tiên hóa đơn IN; nếu không có hóa đơn in thì lấy từ biên bản)
  "khoaiQty": number|null,                           // số phần khoai đã quy đổi (hóa đơn IN, hoặc biên bản nếu không có hóa đơn in); null/0 nếu không có
  "banhQty": number|null,                            // số bánh đã quy đổi/phát ra (Maison; hóa đơn IN hoặc biên bản, vd "phát ra 2622 cái bánh"); null/0 nếu không có
  "soVeCP": number|null,                             // số vé/CP viết tay (null nếu không chắc)
  "tongVe": number|null,                             // TỔNG VÉ trên biên bản (vd "voucher nhận được 2622 phiếu"); null nếu biên bản không ghi
  "veHuy": number|null,                              // VÉ HỦY đọc trên BIÊN BẢN GIAO NHẬN (null nếu không ghi)
  "ngay": string|null,
  "internalNotes": [string],                         // các điểm KHÔNG nhất quán trong chứng từ
  "confidence": "cao"|"trung binh"|"thap",
  "note": string
}`;

const entered = (rec: VoucherRec) => ({
  postedBills: rec.postedBills,
  totalIssued: rec.totalIssued,
  beerCoupons: rec.beerCoupons,
  potatoCoupons: rec.potatoCoupons,
  cancelled: rec.cancelled,
});

/**
 * Gọi model Vision để trích số từ ảnh. Thử GEMINI trước (trực tiếp); nếu lỗi hoặc
 * hết lượt (429) thì FALLBACK sang OPENROUTER (OpenAI-compatible). Trả text thô.
 * Cần GEMINI_API_KEY và/hoặc OPENROUTER_API_KEY (+ tùy chọn OPENROUTER_MODEL).
 */
/** Lấy key OpenRouter, chấp nhận vài cách đặt tên biến (tránh lỗi hoa/thường). */
export const getOpenRouterKey = (): string =>
  (process.env.OPENROUTER_API_KEY ||
    process.env.Openrouter_API ||
    process.env.OPENROUTER_KEY ||
    process.env.OPENROUTER_API ||
    "").trim();

async function extractRawFromImages(promptText: string, dataUrls: string[]): Promise<string> {
  const imgs = dataUrls.slice(0, 3);
  let gemErr = "";
  let orErr = "";

  // 1) Gemini trực tiếp
  const geminiKey = process.env.GEMINI_API_KEY;
  if (geminiKey) {
    try {
      const { GoogleGenAI } = await import("@google/genai");
      const ai = new GoogleGenAI({ apiKey: geminiKey });
      const parts = imgs
        .map((u) => {
          const m = u.match(/^data:(image\/[a-zA-Z]+);base64,(.+)$/);
          return m ? { inlineData: { mimeType: m[1], data: m[2] } } : null;
        })
        .filter(Boolean);
      const resp = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: [{ role: "user", parts: [{ text: promptText }, ...(parts as any[])] }],
      });
      const t = (resp.text || "").trim();
      if (t) return t;
      throw new Error("Gemini trả rỗng");
    } catch (e: any) {
      gemErr = e?.message || String(e);
      console.error("[VISION] Gemini lỗi, thử OpenRouter:", gemErr);
    }
  }

  // 2) Fallback OpenRouter (OpenAI-compatible, hỗ trợ data URI ảnh)
  const orKey = getOpenRouterKey();
  if (orKey) {
    try {
      // Mặc định model MIỄN PHÍ có vision của OpenRouter (không cần nạp credit). Đổi bằng env OPENROUTER_MODEL.
      const model = process.env.OPENROUTER_MODEL || "google/gemma-4-31b-it:free";
      const content: any[] = [{ type: "text", text: promptText }];
      for (const u of imgs) content.push({ type: "image_url", image_url: { url: u } });
      const resp = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${orKey}`,
          "Content-Type": "application/json",
          "X-Title": "Beer Voucher Audit",
        },
        body: JSON.stringify({ model, messages: [{ role: "user", content }] }),
      });
      if (!resp.ok) {
        const t = await resp.text();
        throw new Error(`OpenRouter HTTP ${resp.status}: ${t.slice(0, 200)}`);
      }
      const data = await resp.json();
      const t = (data?.choices?.[0]?.message?.content || "").trim();
      if (t) return t;
      throw new Error("OpenRouter trả rỗng");
    } catch (e: any) {
      orErr = e?.message || String(e);
      console.error("[VISION] OpenRouter lỗi:", orErr);
    }
  }

  const parts: string[] = [];
  parts.push(geminiKey ? `Gemini: ${gemErr || "?"}` : "Gemini: (chưa cấu hình)");
  parts.push(getOpenRouterKey() ? `OpenRouter(${process.env.OPENROUTER_MODEL || "google/gemma-4-31b-it:free"}): ${orErr || "?"}` : "OpenRouter: (chưa cấu hình)");
  throw new Error(parts.join(" | "));
}

/**
 * Đối soát 1 record: Vision trích số (ly bia/khoai/bánh, tổng vé, vé hủy) -> code
 * tính vé quy đổi (bia ÷2, khoai/bánh 1:1) và đối chiếu với số bộ phận nhập.
 */
export async function auditOneVoucher(rec: VoucherRec): Promise<AuditResult> {
  const base = {
    restaurantId: rec.restaurantId,
    restaurantName: rec.restaurantName,
    date: rec.date,
    imageCount: rec.billImages.length,
    dataEntered: entered(rec),
    aiExtracted: {} as AuditResult["aiExtracted"],
  };
  if (rec.billImages.length === 0) {
    return { ...base, status: "NO_IMAGES", discrepancies: ["⚠️ Đã nhập số liệu nhưng CHƯA đính kèm ảnh minh chứng."], summaryNote: "Thiếu ảnh để đối soát AI." };
  }
  if (!process.env.GEMINI_API_KEY && !getOpenRouterKey()) {
    return { ...base, status: "NO_KEY", discrepancies: ["⚠️ Server chưa cấu hình GEMINI_API_KEY / OPENROUTER_API_KEY nên chưa soi ảnh được."], summaryNote: "Chưa bật OCR AI trên server." };
  }
  try {
    const dataUrls = rec.billImages.filter((u) => /^data:image\/[a-zA-Z]+;base64,/.test(u));
    if (dataUrls.length === 0) {
      return { ...base, status: "ERROR", discrepancies: ["Ảnh không đúng định dạng base64 để đọc."], summaryNote: "Không đọc được ảnh." };
    }

    const rawText = await extractRawFromImages(GEMINI_EXTRACT_PROMPT, dataUrls);
    const raw = rawText.replace(/```json/g, "").replace(/```/g, "").trim();
    const g = JSON.parse(raw);

    const num = (v: any): number | null => (typeof v === "number" && isFinite(v) ? v : null);
    const tongLyBiaIn = num(g.tongLyBiaIn);
    const tongLyBiaTay = num(g.tongLyBiaTay);
    const biaLy = num(g.tongLyBia) ?? tongLyBiaIn ?? tongLyBiaTay; // số ly bia đã quy đổi (Bills IN)
    const khoaiQty = num(g.khoaiQty);                              // số phần khoai (Bills IN)
    const banhQty = num(g.banhQty);                                // số bánh Maison (Bills IN)
    const bbTongVe = num(g.tongVe);                                // tổng vé (biên bản giao nhận)
    const bbVeHuy = num(g.veHuy);                                  // vé hủy (biên bản giao nhận)
    const internalNotes: string[] = Array.isArray(g.internalNotes)
      ? g.internalNotes.filter((x: any) => typeof x === "string" && x.trim())
      : [];
    const confidence = typeof g.confidence === "string" ? g.confidence : "";

    // Quy đổi VÉ từ hóa đơn IN: BIA 2 ly = 1 vé (÷2); KHOAI và BÁNH (Maison) tỷ lệ 1:1.
    const beerVe = biaLy != null && biaLy > 0 ? Math.round(biaLy / 2) : null;
    const potatoVe = khoaiQty != null && khoaiQty > 0 ? khoaiQty : null;
    const bakeryVe = banhQty != null && banhQty > 0 ? banhQty : null;
    const hasRedeemed = beerVe != null || potatoVe != null || bakeryVe != null;
    const postedExpected = (beerVe ?? 0) + (potatoVe ?? 0) + (bakeryVe ?? 0);

    const disc: string[] = [];
    let status: AuditStatus = "MATCH";
    const mismatch = () => { status = "MISMATCH"; };

    // 1) Vé bia = số ly ÷ 2
    if (beerVe != null) {
      if (beerVe !== rec.beerCoupons) {
        mismatch();
        disc.push(`🍺 Vé bia: hóa đơn IN <b>${biaLy}</b> ly ÷2 = <b>${beerVe}</b> ≠ app nhập <b>${rec.beerCoupons}</b> — chênh ${Math.abs(beerVe - rec.beerCoupons)}.`);
      } else {
        disc.push(`🍺 Vé bia khớp: ${beerVe} (= ${biaLy} ly ÷2).`);
      }
    }

    // 2) Vé khoai = số phần (tỷ lệ 1:1)
    if (potatoVe != null) {
      if (potatoVe !== rec.potatoCoupons) {
        mismatch();
        disc.push(`🍟 Vé khoai: hóa đơn IN <b>${potatoVe}</b> phần (1:1) ≠ app nhập <b>${rec.potatoCoupons}</b>.`);
      } else {
        disc.push(`🍟 Vé khoai khớp: ${potatoVe}.`);
      }
    }

    // 3) Vé bánh (Maison Kayser) = số bánh (tỷ lệ 1:1)
    if (bakeryVe != null) {
      if (bakeryVe !== rec.bakeryCoupons) {
        mismatch();
        disc.push(`🥐 Vé bánh: hóa đơn IN <b>${bakeryVe}</b> (1:1) ≠ app nhập <b>${rec.bakeryCoupons}</b>.`);
      } else {
        disc.push(`🥐 Vé bánh khớp: ${bakeryVe}.`);
      }
    }

    if (!hasRedeemed) disc.push("Không đọc được số lượng bia/khoai/bánh trên hóa đơn IN để tính vé quy đổi.");

    // 4) Tổng vé quy đổi vs postedBills app
    if (hasRedeemed && postedExpected !== rec.postedBills) {
      mismatch();
      disc.push(`🎟️ Tổng vé quy đổi: hóa đơn IN = <b>${postedExpected}</b> ≠ app nhập <b>${rec.postedBills}</b>.`);
    }

    // 4) Tổng vé thu về — nguồn: BIÊN BẢN GIAO NHẬN
    if (bbTongVe != null) {
      if (bbTongVe !== rec.totalIssued) {
        mismatch();
        disc.push(`Σ Tổng vé (biên bản giao nhận) <b>${bbTongVe}</b> ≠ app nhập <b>${rec.totalIssued}</b>.`);
      } else {
        disc.push(`Σ Tổng vé khớp: ${bbTongVe}.`);
      }
    } else {
      disc.push("Σ Chưa đọc được Tổng vé trên biên bản giao nhận để đối chiếu.");
    }

    // 5) Vé hủy — nguồn: BIÊN BẢN GIAO NHẬN
    if (bbVeHuy != null) {
      if (bbVeHuy !== rec.cancelled) {
        mismatch();
        disc.push(`❌ Vé hủy (biên bản giao nhận) <b>${bbVeHuy}</b> ≠ app nhập <b>${rec.cancelled}</b>.`);
      } else {
        disc.push(`❌ Vé hủy khớp: ${bbVeHuy}.`);
      }
    } else {
      disc.push("❌ Chưa đọc được Vé hủy trên biên bản giao nhận để đối chiếu.");
    }

    // Điểm không nhất quán trong chứng từ (Gemini tự soát in vs viết tay)
    for (const n of internalNotes) disc.push(`🔎 ${n}`);
    if (tongLyBiaIn != null && tongLyBiaTay != null && tongLyBiaIn !== tongLyBiaTay && tongLyBiaIn > 0) {
      disc.push(`🔎 Số ly bia: hóa đơn IN ${tongLyBiaIn} vs viết tay ${tongLyBiaTay}; dùng số hóa đơn IN (${biaLy}).`);
    }

    const biaL = biaLy != null ? (biaLy * 0.25).toFixed(1) : "0";
    const khoaiKg = khoaiQty != null ? (khoaiQty * 0.1).toFixed(1) : "0";
    const banhTxt = banhQty != null && banhQty > 0 ? `, bánh ${banhQty} (1:1)` : "";
    const confText = confidence ? ` [tin cậy: ${confidence}]` : "";
    const summaryNote = `Hóa đơn IN (đã quy đổi): bia ${biaLy ?? 0} ly = ${biaL}L, khoai ${khoaiQty ?? 0} phần = ${khoaiKg}kg${banhTxt}. Vé quy đổi ≈ ${postedExpected} (bia ${beerVe ?? 0} + khoai ${potatoVe ?? 0} + bánh ${bakeryVe ?? 0}). App nhập: bia ${rec.beerCoupons}, khoai ${rec.potatoCoupons}, bánh ${rec.bakeryCoupons}, tổng quy đổi ${rec.postedBills}, thu về ${rec.totalIssued}, hủy ${rec.cancelled}.${confText}`;

    return {
      ...base,
      aiExtracted: { postedBills: postedExpected, totalIssued: bbTongVe, beerCoupons: beerVe, potatoCoupons: potatoVe },
      status,
      discrepancies: disc,
      summaryNote,
    };
  } catch (e: any) {
    const msg = e?.message || String(e);
    const is429 = /\b429\b|rate.?limit|quota|RESOURCE_EXHAUSTED|too many requests|requires more credits|402/i.test(msg);
    return {
      ...base,
      status: "ERROR",
      discrepancies: [is429 ? `⏳ Nguồn AI tạm hết lượt / cần credit — thử lại sau. Chi tiết: ${msg}` : `Lỗi OCR AI: ${msg}`],
      summaryNote: is429 ? "Nguồn AI tạm hết lượt, thử lại sau." : "Không đọc được ảnh bằng AI.",
    };
  }
}

/** Chạy đối soát cho 4 nhà hàng của 1 ngày (song song). */
export async function auditDateWithGemini(targetDate: string): Promise<AuditResult[]> {
  const recs = await Promise.all(RESTAURANTS.map((r) => getVoucherRecord(r.id, r.name, targetDate)));
  return Promise.all(
    RESTAURANTS.map(async (r, i): Promise<AuditResult> => {
      const rec = recs[i];
      if (!rec) {
        return {
          restaurantId: r.id,
          restaurantName: r.name,
          date: targetDate,
          imageCount: 0,
          dataEntered: { postedBills: 0, totalIssued: 0, beerCoupons: 0, potatoCoupons: 0, cancelled: 0 },
          aiExtracted: {},
          status: "NO_DATA",
          discrepancies: ["❌ Chưa nhập số liệu / chưa có báo cáo cho ngày này."],
          summaryNote: "Nhà hàng chưa gửi báo cáo.",
        };
      }
      return auditOneVoucher(rec);
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
      html += `   └ ✅ AI soi ${r.imageCount} ảnh — không phát hiện sai lệch:\n`;
      for (const d of r.discrepancies) html += `   └ ${d}\n`;
    } else if (r.status === "MISMATCH") {
      html += `   └ 🚨 AI soi ${r.imageCount} ảnh — CÓ sai lệch:\n`;
      for (const d of r.discrepancies) html += `   └ ${d}\n`;
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

// ===========================================================================
// ĐỐI SOÁT PHÒNG NGỪA HÀNG TUẦN (tự động thứ 2):
// AI rà số liệu 7 ngày -> chọn 1 ngày nghi ngờ sai số nhất -> Gemini soi ảnh
// ngày đó -> gửi báo cáo về Telegram.
// ===========================================================================

const firestoreDocUrlMasked = (path: string, fields: string[]) =>
  `https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT_ID}/databases/${FIRESTORE_DATABASE_ID}/documents/${path}?${fields
    .map((f) => `mask.fieldPaths=${f}`)
    .join("&")}&key=${FIREBASE_API_KEY}`;

/** Thời điểm hiện tại theo giờ VN (UTC+7), đọc bằng getUTC* sẽ ra giờ VN. */
const vnNowDate = (): Date => new Date(Date.now() + 7 * 3600 * 1000);
const toYmd = (d: Date): string =>
  `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;

interface DayRow {
  name: string;
  hasDoc: boolean;
  postedBills: number;
  totalIssued: number;
  beerCoupons: number;
  potatoCoupons: number;
  cancelled: number;
  bakeryCoupons: number;
}
interface DaySummary {
  date: string;
  rows: DayRow[];
}

/** Lấy số liệu (KHÔNG tải ảnh — dùng field mask) cho nhiều ngày. */
async function getWeekSummaries(dates: string[]): Promise<DaySummary[]> {
  const fields = ["postedBills", "totalIssued", "beerCoupons", "potatoCoupons", "cancelled", "bakeryCoupons"];
  return Promise.all(
    dates.map(async (date): Promise<DaySummary> => {
      const rows = await Promise.all(
        RESTAURANTS.map(async (r): Promise<DayRow> => {
          const empty: DayRow = { name: r.name, hasDoc: false, postedBills: 0, totalIssued: 0, beerCoupons: 0, potatoCoupons: 0, cancelled: 0, bakeryCoupons: 0 };
          try {
            const resp = await fetch(firestoreDocUrlMasked(`vouchers/${r.id}_${date}`, fields));
            if (!resp.ok) return empty;
            const data = await resp.json();
            const f = data.fields;
            if (!f) return empty;
            return {
              name: r.name,
              hasDoc: true,
              postedBills: numField(f.postedBills),
              totalIssued: numField(f.totalIssued),
              beerCoupons: numField(f.beerCoupons),
              potatoCoupons: numField(f.potatoCoupons),
              cancelled: numField(f.cancelled),
              bakeryCoupons: numField(f.bakeryCoupons),
            };
          } catch {
            return empty;
          }
        }),
      );
      return { date, rows };
    }),
  );
}

/** Nhờ AI chọn 1 ngày nghi ngờ sai số nhất trong tuần (fallback heuristic). */
async function pickSuspiciousDay(summaries: DaySummary[]): Promise<{ date: string; reason: string }> {
  const withData = summaries.filter((s) => s.rows.some((r) => r.hasDoc));
  if (withData.length === 0) {
    return { date: summaries[summaries.length - 1]?.date || toYmd(vnNowDate()), reason: "Không có dữ liệu nào trong tuần để phân tích." };
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (apiKey) {
    try {
      const { GoogleGenAI } = await import("@google/genai");
      const ai = new GoogleGenAI({ apiKey });
      const table = summaries
        .map(
          (s) =>
            `Ngày ${s.date}:\n` +
            s.rows
              .map(
                (r) =>
                  `  - ${r.name}: quyDoi=${r.postedBills}, tongThuVe=${r.totalIssued}, bia=${r.beerCoupons}, khoai=${r.potatoCoupons}, huy=${r.cancelled}, banh=${r.bakeryCoupons}${r.hasDoc ? "" : " (chưa nhập)"}`,
              )
              .join("\n"),
        )
        .join("\n");
      const prompt = `Bạn là kiểm soát viên nội bộ F&B. Dưới đây là số liệu voucher 7 ngày của các nhà hàng (do bộ phận tự nhập tay). Hãy chọn DUY NHẤT 1 ngày có dấu hiệu NGHI NGỜ SAI SỐ cao nhất, dựa trên bất thường như: số nhảy vọt hoặc tụt bất thường so với các ngày khác, tỷ lệ bia/khoai lệch lạ, Tổng thu về không khớp với Quy đổi cộng Hủy, số liệu tròn trịa đáng ngờ, hoặc thiếu nhất quán.
Chỉ trả về DUY NHẤT 1 JSON hợp lệ, KHÔNG bọc markdown:
{"date":"YYYY-MM-DD","reason":"lý do ngắn gọn 1-2 câu vì sao ngày này đáng soi kỹ"}

${table}`;
      const resp = await ai.models.generateContent({ model: "gemini-2.5-flash", contents: [{ role: "user", parts: [{ text: prompt }] }] });
      const raw = (resp.text || "").replace(/```json/g, "").replace(/```/g, "").trim();
      const parsed = JSON.parse(raw);
      if (parsed.date && summaries.some((s) => s.date === parsed.date)) {
        return { date: parsed.date, reason: parsed.reason || "AI đánh giá ngày này có rủi ro sai số cao nhất." };
      }
    } catch (e) {
      console.error("[pickSuspiciousDay AI err]", e);
    }
  }

  // Fallback heuristic: ngày có chênh lệch |TổngThuVề - (QuyĐổi + Hủy)| lớn nhất
  let best = withData[0];
  let bestScore = -1;
  for (const s of withData) {
    let score = 0;
    for (const r of s.rows) {
      if (!r.hasDoc) continue;
      score += Math.abs(r.totalIssued - (r.postedBills + r.cancelled));
    }
    if (score > bestScore) {
      bestScore = score;
      best = s;
    }
  }
  return { date: best.date, reason: "Chọn theo heuristic: ngày có chênh lệch Tổng thu về so với (Quy đổi + Hủy) lớn nhất (AI text không khả dụng)." };
}

/** Gửi 1 tin nhắn chủ động tới chat Telegram đã cấu hình (telegram_chat_id). */
export async function sendTelegramBroadcast(html: string): Promise<boolean> {
  const [botToken, chatId] = await Promise.all([
    getFirestoreSetting("telegram_bot_token"),
    getFirestoreSetting("telegram_chat_id"),
  ]);
  if (!botToken || !chatId) return false;
  try {
    const resp = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text: html, parse_mode: "HTML", disable_web_page_preview: false }),
    });
    const d = await resp.json().catch(() => ({}));
    if (resp.ok && d.ok) return true;
    await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text: html.replace(/<[^>]+>/g, "") }),
    });
    return true;
  } catch {
    return false;
  }
}

/** Chạy đối soát phòng ngừa tuần: rà 7 ngày -> chọn ngày nghi ngờ -> soi Gemini -> gửi Telegram. */
export async function runWeeklyPreventiveAudit(
  opts: { send?: boolean } = {},
): Promise<{ chosenDate: string; reason: string; sent: boolean; results: AuditResult[] }> {
  const shouldSend = opts.send !== false;
  const base = vnNowDate();
  const dates: string[] = [];
  for (let i = 1; i <= 7; i++) dates.push(toYmd(new Date(base.getTime() - i * 86400000)));

  const summaries = await getWeekSummaries(dates);
  const { date: chosenDate, reason } = await pickSuspiciousDay(summaries);
  const results = await auditDateWithGemini(chosenDate);

  const dp = chosenDate.split("-");
  const formatted = `${dp[2]}/${dp[1]}/${dp[0]}`;
  let html = `<b>🔎 ĐỐI SOÁT PHÒNG NGỪA TUẦN (tự động thứ 2)</b>\n`;
  html += `🤖 AI đã rà 7 ngày gần nhất và chọn ngày <b>${formatted}</b> để soi kỹ bằng Gemini.\n`;
  html += `🧠 <b>Lý do nghi ngờ:</b> <i>${reason}</i>\n\n`;
  html += formatAuditReportHtml(chosenDate, results);

  const sent = shouldSend ? await sendTelegramBroadcast(html) : false;
  return { chosenDate, reason, sent, results };
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
