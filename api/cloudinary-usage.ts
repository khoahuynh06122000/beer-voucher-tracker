/**
 * GET /api/cloudinary-usage — trả mức dùng kho ảnh Cloudinary (để cảnh báo sắp đầy).
 * Dùng API Key + Secret (Basic auth). SECRET để ở env CLOUDINARY_API_SECRET (bí mật,
 * KHÔNG commit). Key/cloud có thể hardcode (bán công khai) hoặc override qua env.
 */
import type { IncomingMessage, ServerResponse } from "node:http";
import { applyCors, requireAuth } from "../server/authGuard.js";

const CLOUD = process.env.CLOUDINARY_CLOUD_NAME || "zjtjeyqd";
const AKEY = process.env.CLOUDINARY_API_KEY || "256774734751537";
const ASEC = process.env.CLOUDINARY_API_SECRET || "";
const FREE_LIMIT_GB = 25; // gói free Cloudinary ~25GB / 25 credits

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  applyCors(req, res);
  const who = await requireAuth(req, res, "admin");
  if (!who) return;


  if (!ASEC) {
    res.writeHead(200);
    res.end(JSON.stringify({ configured: false, message: "Chưa cấu hình CLOUDINARY_API_SECRET trên server." }));
    return;
  }

  try {
    const auth = Buffer.from(`${AKEY}:${ASEC}`).toString("base64");
    const r = await fetch(`https://api.cloudinary.com/v1_1/${CLOUD}/usage`, {
      headers: { Authorization: `Basic ${auth}` },
    });
    if (!r.ok) {
      const t = await r.text();
      res.writeHead(200);
      res.end(JSON.stringify({ configured: true, ok: false, message: `Cloudinary ${r.status}: ${t.slice(0, 150)}` }));
      return;
    }
    const d = await r.json();

    const storageBytes = Number(d?.storage?.usage || 0);
    const storageGB = storageBytes / (1024 * 1024 * 1024);
    // Cloudinary free tính theo credits; ưu tiên % credits nếu có, else theo storage/25GB
    const creditsUsed = Number(d?.credits?.usage ?? 0);
    const creditsLimit = Number(d?.credits?.limit ?? FREE_LIMIT_GB);
    const percent =
      creditsLimit > 0 && d?.credits
        ? Math.round((creditsUsed / creditsLimit) * 100)
        : Math.round((storageGB / FREE_LIMIT_GB) * 100);

    res.writeHead(200);
    res.end(JSON.stringify({
      configured: true,
      ok: true,
      plan: d?.plan || "Free",
      storageGB: Number(storageGB.toFixed(3)),
      limitGB: FREE_LIMIT_GB,
      creditsUsed,
      creditsLimit,
      percent,
      resources: d?.resources ?? null,
    }));
  } catch (e: any) {
    res.writeHead(200);
    res.end(JSON.stringify({ configured: true, ok: false, message: e?.message || String(e) }));
  }
}
