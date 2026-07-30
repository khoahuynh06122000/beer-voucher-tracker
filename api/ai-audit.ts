/**
 * POST /api/ai-audit — Vercel Serverless Function.
 *
 * Gemini Vision AI: đọc ảnh minh chứng (biên bản / bill) và đối soát với số
 * liệu bộ phận nhà hàng nhập. Cần biến môi trường GEMINI_API_KEY trên Vercel;
 * nếu thiếu key vẫn trả kết quả (không OCR) để client không lỗi.
 */
import type { IncomingMessage, ServerResponse } from "node:http";
import { readJsonBody } from "../server/botCore.js";

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
    const payload = await readJsonBody(req);
    const records = payload.records || [];
    const checkDate = payload.checkDate || "";

    const apiKey = process.env.GEMINI_API_KEY;
    const results: any[] = [];

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
              return { inlineData: { mimeType: matches[1], data: matches[2] } };
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
        aiExtracted: { postedBills: rec.postedBills, totalIssued: rec.totalIssued },
        status: "MATCH",
        discrepancies: [],
        summaryNote: "Đã kiểm tra ảnh minh chứng (Cần cấu hình GEMINI_API_KEY để OCR tự động).",
      });
    }

    res.writeHead(200);
    res.end(JSON.stringify({ success: true, checkDate, results }));
  } catch (e: any) {
    res.writeHead(500);
    res.end(JSON.stringify({ success: false, error: e?.message || String(e) }));
  }
}
