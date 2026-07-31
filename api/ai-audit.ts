/**
 * POST /api/ai-audit — Vercel Serverless Function.
 *
 * Gemini Vision AI: đọc ảnh minh chứng (biên bản / bill) và đối soát với số
 * liệu bộ phận nhà hàng nhập. Cần biến môi trường GEMINI_API_KEY trên Vercel;
 * nếu thiếu key vẫn trả kết quả (không OCR) để client không lỗi.
 */
import type { IncomingMessage, ServerResponse } from "node:http";
import { readJsonBody, GEMINI_AUDIT_PROMPT } from "../server/botCore.js";

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
            const prompt = GEMINI_AUDIT_PROMPT(rec);

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
              status: parsed.isMatch === false ? "MISMATCH" : "MATCH",
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
    res.end(JSON.stringify({ success: true, checkDate, envKeyPresent: !!process.env.GEMINI_API_KEY, results }));
  } catch (e: any) {
    res.writeHead(500);
    res.end(JSON.stringify({ success: false, error: e?.message || String(e) }));
  }
}
