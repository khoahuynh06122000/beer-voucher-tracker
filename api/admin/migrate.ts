/**
 * GET /api/admin/migrate?key=SECRET&from=YYYY-MM-DD&to=YYYY-MM-DD
 * Migrate 1 lần dữ liệu voucher CŨ từ Firestore -> Supabase.
 * Quét theo (nhà hàng x ngày) trong khoảng [from,to] vì rules Firestore không cho list.
 * Có guard ?key= để tránh gọi bừa. Xong migrate thì XÓA file này.
 */
import type { IncomingMessage, ServerResponse } from "node:http";

const MIGRATE_SECRET = process.env.MIGRATE_SECRET || "mgr_2026_x9k2p7";

const FB_PROJECT = "peak-jigsaw-h8gvj";
const FB_DB = "ai-studio-beervoucher-cd7e66ad-a681-4c93-a133-30df0862fdee";
const FB_KEY = "AIzaSyA2J7pChKraAovbslqBL4xB5fn0JU-UsNs";
const fbDoc = (path: string) =>
  `https://firestore.googleapis.com/v1/projects/${FB_PROJECT}/databases/${FB_DB}/documents/${path}?key=${FB_KEY}`;

const SB_URL = process.env.SUPABASE_URL || "https://fuqxhhtpdwujupjjwbzi.supabase.co";
const SB_KEY = process.env.SUPABASE_KEY || "sb_publishable_jtVF84t5gSxGDuUJb32Tuw_Rs-2sqmK";
const sbHeaders = { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`, "Content-Type": "application/json" };

const RESTAURANTS = [
  { id: "lehoibia", name: "Lê Hội Bia" },
  { id: "nhahang1901", name: "Nhà Hàng 1901" },
  { id: "beerplaza", name: "Beer Plaza" },
  { id: "maisonkayser", name: "Maison Kayser" },
];

const num = (x: any): number => Number(x?.integerValue || x?.doubleValue || 0);
const str = (x: any): string | undefined => x?.stringValue;

function datesBetween(from: string, to: string): string[] {
  const out: string[] = [];
  const start = new Date(from + "T00:00:00Z").getTime();
  const end = new Date(to + "T00:00:00Z").getTime();
  for (let t = start; t <= end; t += 86400000) {
    out.push(new Date(t).toISOString().split("T")[0]);
  }
  return out;
}

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  res.setHeader("Content-Type", "application/json");
  const url = new URL(req.url || "", `http://${req.headers.host || "localhost"}`);
  if (url.searchParams.get("key") !== MIGRATE_SECRET) {
    res.writeHead(403);
    res.end(JSON.stringify({ success: false, message: "Sai key" }));
    return;
  }

  const from = url.searchParams.get("from") || "2026-06-01";
  const to = url.searchParams.get("to") || new Date().toISOString().split("T")[0];
  const dates = datesBetween(from, to);

  let migrated = 0;
  let checked = 0;
  const migratedIds: string[] = [];
  const errors: string[] = [];

  for (const date of dates) {
    for (const r of RESTAURANTS) {
      const id = `${r.id}_${date}`;
      checked++;
      try {
        const resp = await fetch(fbDoc(`vouchers/${id}`));
        if (!resp.ok) continue; // 404 = không có -> bỏ qua
        const data = await resp.json();
        const f = data.fields;
        if (!f) continue;

        const imgs = (f.billImages?.arrayValue?.values || [])
          .map((v: any) => v?.stringValue)
          .filter((s: any) => typeof s === "string" && s.length > 0);

        const row: Record<string, any> = {
          id,
          date,
          restaurantId: r.id,
          restaurantName: str(f.restaurantName) || r.name,
          potatoCoupons: num(f.potatoCoupons),
          beerCoupons: num(f.beerCoupons),
          bakeryCoupons: num(f.bakeryCoupons),
          cancelled: num(f.cancelled),
          postedBills: num(f.postedBills),
          totalIssued: num(f.totalIssued),
          utilizationRate: num(f.utilizationRate),
          billNumber: str(f.billNumber) || null,
          billImages: imgs,
          updatedAt: str(f.updatedAt) || new Date().toISOString(),
          createdBy: str(f.createdBy) || null,
        };

        const up = await fetch(`${SB_URL}/rest/v1/vouchers`, {
          method: "POST",
          headers: { ...sbHeaders, Prefer: "resolution=merge-duplicates" },
          body: JSON.stringify(row),
        });
        if (up.ok) {
          migrated++;
          migratedIds.push(id);
        } else {
          errors.push(`${id}: SB ${up.status} ${(await up.text()).slice(0, 80)}`);
        }
      } catch (e: any) {
        errors.push(`${id}: ${e?.message || String(e)}`);
      }
    }
  }

  res.writeHead(200);
  res.end(JSON.stringify({
    success: true,
    range: `${from} → ${to}`,
    checked,
    migrated,
    migratedIds,
    errors: errors.slice(0, 20),
  }));
}
