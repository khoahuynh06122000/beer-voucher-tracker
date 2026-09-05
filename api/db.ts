/**
 * GET  /api/db?q=vouchers...        -> proxy đọc Supabase
 * POST /api/db?table=vouchers       -> upsert
 *
 * BẮT BUỘC đăng nhập: gửi kèm `Authorization: Bearer <Firebase ID token>`.
 *
 * Trước đây endpoint này mở toang, CORS "*", không kiểm tra gì. Bất kỳ ai cũng
 * GET được bảng `settings` (chứa telegram_bot_token, ms_teams_webhook) và POST
 * ghi đè số liệu voucher của mọi nhà hàng. Nay:
 *   - Phải có token hợp lệ và đã được duyệt.
 *   - Bảng `settings` KHÔNG còn truy cập được qua đây dù có token — bí mật hệ
 *     thống chuyển sang biến môi trường, không nằm trong bảng dữ liệu nữa.
 *   - Tài khoản nhà hàng chỉ đọc/ghi được đúng restaurantId của mình; admin xem
 *     toàn hệ thống.
 */
import type { IncomingMessage, ServerResponse } from "node:http";
import { readJsonBody } from "../server/botCore.js";
import { applyCors, requireAuth } from "../server/authGuard.js";

const SB_URL = process.env.SUPABASE_URL || "https://fuqxhhtpdwujupjjwbzi.supabase.co";
const SB_KEY = process.env.SUPABASE_KEY || "";
const sbAuth = { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` };

/** Chỉ còn đúng bảng vouchers. settings bị loại hoàn toàn. */
const ALLOWED_Q = /^vouchers(\?|$)/;

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  applyCors(req, res);

  if (req.method === "OPTIONS") {
    res.writeHead(200);
    res.end("{}");
    return;
  }

  if (!SB_KEY) {
    res.writeHead(500);
    res.end(JSON.stringify({ error: "Server chưa cấu hình SUPABASE_KEY." }));
    return;
  }

  const who = await requireAuth(req, res, "any");
  if (!who) return;

  const isAdmin = who.role === "admin" || who.role === "super_admin";
  const url = new URL(req.url || "", `http://${req.headers.host || "localhost"}`);

  try {
    if (req.method === "GET") {
      const q = url.searchParams.get("q") || "";
      if (!ALLOWED_Q.test(q)) {
        res.writeHead(400);
        res.end(JSON.stringify({ error: "Chỉ được truy vấn bảng vouchers." }));
        return;
      }

      // Tài khoản nhà hàng: ép thêm điều kiện restaurantId, không cho xem nhà
      // hàng khác kể cả khi tự sửa query trên trình duyệt.
      let finalQ = q;
      if (!isAdmin) {
        if (!who.restaurantId) {
          res.writeHead(403);
          res.end(JSON.stringify({ error: "Tài khoản chưa được gán nhà hàng." }));
          return;
        }
        finalQ += (finalQ.includes("?") ? "&" : "?") + `restaurantId=eq.${encodeURIComponent(who.restaurantId)}`;
      }

      const r = await fetch(`${SB_URL}/rest/v1/${finalQ}`, { headers: sbAuth });
      const text = await r.text();
      res.writeHead(r.ok ? 200 : r.status);
      res.end(text || "[]");
      return;
    }

    if (req.method === "POST") {
      const table = url.searchParams.get("table") || "";
      if (table !== "vouchers") {
        res.writeHead(400);
        res.end(JSON.stringify({ error: "Chỉ được ghi bảng vouchers." }));
        return;
      }

      const body = await readJsonBody(req);
      const rows = Array.isArray(body) ? body : [body];

      // Nhà hàng chỉ được ghi dữ liệu của chính mình.
      if (!isAdmin) {
        for (const row of rows) {
          if (!row || row.restaurantId !== who.restaurantId) {
            res.writeHead(403);
            res.end(JSON.stringify({ error: "Không được ghi số liệu của nhà hàng khác." }));
            return;
          }
        }
      }

      const r = await fetch(`${SB_URL}/rest/v1/${table}`, {
        method: "POST",
        headers: { ...sbAuth, "Content-Type": "application/json", Prefer: "resolution=merge-duplicates" },
        body: JSON.stringify(body),
      });
      const text = await r.text();
      res.writeHead(r.ok ? 200 : r.status);
      res.end(text || "[]");
      return;
    }

    res.writeHead(405);
    res.end(JSON.stringify({ error: "Method Not Allowed" }));
  } catch (e: any) {
    res.writeHead(500);
    res.end(JSON.stringify({ error: e?.message || String(e) }));
  }
}
