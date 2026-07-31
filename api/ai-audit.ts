/**
 * POST /api/ai-audit — Vercel Serverless Function.
 *
 * Gemini Vision AI: đọc ảnh minh chứng (biên bản / bill) và đối soát với số
 * liệu bộ phận nhập. Dùng CHUNG logic auditOneVoucher trong botCore (Gemini
 * trích số -> code tính bia÷2 -> đối chiếu 3 bên) để bot Telegram và nút
 * "Soi Ảnh" luôn cho kết quả nhất quán. Cần GEMINI_API_KEY trên Vercel.
 */
import type { IncomingMessage, ServerResponse } from "node:http";
import { readJsonBody, auditOneVoucher, getOpenRouterKey, type VoucherRec } from "../server/botCore.js";

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

    const results = await Promise.all(
      records.map(async (rec: any) => {
        const vr: VoucherRec = {
          restaurantId: rec.restaurantId,
          restaurantName: rec.restaurantName || rec.restaurantId,
          date: rec.date,
          postedBills: rec.postedBills || 0,
          totalIssued: rec.totalIssued || 0,
          beerCoupons: rec.beerCoupons || 0,
          potatoCoupons: rec.potatoCoupons || 0,
          bakeryCoupons: rec.bakeryCoupons || 0,
          cancelled: rec.cancelled || 0,
          billImages: rec.billImages || [],
          billNumber: rec.billNumber,
        };
        const r = await auditOneVoucher(vr);
        return { ...r, hasImages: r.imageCount > 0 };
      }),
    );

    res.writeHead(200);
    res.end(JSON.stringify({
      success: true,
      checkDate,
      envKeyPresent: !!process.env.GEMINI_API_KEY,
      orKeyPresent: !!getOpenRouterKey(),
      orModel: process.env.OPENROUTER_MODEL || "google/gemini-2.0-flash-exp:free",
      results,
    }));
  } catch (e: any) {
    res.writeHead(500);
    res.end(JSON.stringify({ success: false, error: e?.message || String(e) }));
  }
}
