/**
 * GET  /api/db?q=<postgrest-path>     -> proxy đọc Supabase (server gọi, tránh browser bị chặn)
 * POST /api/db?table=vouchers|settings -> upsert (merge-duplicates)
 * Client gọi endpoint này thay vì gọi thẳng supabase.co (hay bị treo ở mạng VN).
 * Chỉ cho phép bảng vouchers/settings.
 */
import type { IncomingMessage, ServerResponse } from "node:http";
import { readJsonBody } from "../server/botCore.js";

const SB_URL = process.env.SUPABASE_URL || "https://fuqxhhtpdwujupjjwbzi.supabase.co";
const SB_KEY = process.env.SUPABASE_KEY || "sb_publishable_jtVF84t5gSxGDuUJb32Tuw_Rs-2sqmK";
const sbAuth = { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` };
const ALLOWED_Q = /^(vouchers|settings)(\?|$)/;

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Content-Type", "application/json");

  if (req.method === "OPTIONS") {
    res.writeHead(200);
    res.end("{}");
    return;
  }

  const url = new URL(req.url || "", `http://${req.headers.host || "localhost"}`);

  try {
    if (req.method === "GET") {
      const q = url.searchParams.get("q") || "";
      if (!ALLOWED_Q.test(q)) {
        res.writeHead(400);
        res.end(JSON.stringify({ error: "query không hợp lệ" }));
        return;
      }
      const r = await fetch(`${SB_URL}/rest/v1/${q}`, { headers: sbAuth });
      const text = await r.text();
      res.writeHead(r.ok ? 200 : r.status);
      res.end(text || "[]");
      return;
    }

    if (req.method === "POST") {
      const table = url.searchParams.get("table") || "";
      if (table !== "vouchers" && table !== "settings") {
        res.writeHead(400);
        res.end(JSON.stringify({ error: "table không hợp lệ" }));
        return;
      }
      const body = await readJsonBody(req);
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
