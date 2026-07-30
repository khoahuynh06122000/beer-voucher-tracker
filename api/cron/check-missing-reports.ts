/**
 * GET /api/cron/check-missing-reports — Vercel Serverless Function.
 * Trả về Adaptive Card JSON trạng thái thiếu báo cáo (cho Power Automate / cron).
 */
import type { IncomingMessage, ServerResponse } from "node:http";
import { getLiveMissingStatus } from "../../server/botCore.js";

export default async function handler(_req: IncomingMessage, res: ServerResponse) {
  res.setHeader("Content-Type", "application/json");
  try {
    const card = await getLiveMissingStatus();
    res.writeHead(200);
    res.end(JSON.stringify(card));
  } catch (e: any) {
    res.writeHead(500);
    res.end(JSON.stringify({ error: e?.message || String(e) }));
  }
}
