// ===========================================================================
// DATA LAYER — SUPABASE (Postgres REST / PostgREST)
// Trước đây dùng Firestore (bị giới hạn quota free-tier). Đã chuyển sang Supabase
// (free, không giới hạn theo ngày). Giữ NGUYÊN tên hàm + kiểu trả về để các
// component không phải sửa. Cột DB đặt camelCase (quoted) trùng field app.
// ===========================================================================

import { authFetch } from "./authFetch";

// Gọi QUA SERVER PROXY /api/db (Vercel gọi Supabase) — tránh browser bị chặn/treo
// khi gọi thẳng supabase.co ở mạng VN.
// authFetch tự gắn Firebase ID token; /api/db từ chối request không có token.
async function sbGet(path: string): Promise<any[]> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20000);
    const resp = await authFetch(`/api/db?q=${encodeURIComponent(path)}`, {
      signal: controller.signal,
    }).finally(() => clearTimeout(timeout));
    if (!resp.ok) {
      console.error("DB GET không ok:", resp.status, await resp.text().catch(() => ""));
      return [];
    }
    const data = await resp.json();
    return Array.isArray(data) ? data : [];
  } catch (e) {
    console.error("DB GET error:", e);
    return [];
  }
}

async function sbUpsert(table: string, row: Record<string, any>): Promise<void> {
  const resp = await authFetch(`/api/db?table=${encodeURIComponent(table)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(row),
  });
  if (!resp.ok) {
    const t = await resp.text().catch(() => "");
    throw new Error(`DB upsert ${table} lỗi ${resp.status}: ${t.slice(0, 200)}`);
  }
}

export interface UserProfile {
  uid: string;
  username: string;
  role: "restaurant" | "admin";
  restaurantName: string;
  email: string;
  createdAt?: string;
}

export interface VoucherRecord {
  id?: string;
  date: string;
  restaurantId: string;
  restaurantName?: string;
  potatoCoupons: number;
  beerCoupons: number;
  bakeryCoupons?: number;
  cancelled: number;
  postedBills: number;
  totalIssued: number;
  utilizationRate: number;
  billNumber?: string;
  billImages?: string[];
  updatedAt?: string;
  createdBy?: string;
}

// Preset user map for auto-seeding
export const PRESET_USERS: Record<string, Omit<UserProfile, "uid">> = {
  lehoibia: { username: "lehoibia", role: "restaurant", restaurantName: "Lê Hội Bia", email: "lehoibia@beervoucher.app" },
  "1901": { username: "1901", role: "restaurant", restaurantName: "Nhà Hàng 1901", email: "1901@beervoucher.app" },
  beerplaza: { username: "beerplaza", role: "restaurant", restaurantName: "Beer Plaza", email: "beerplaza@beervoucher.app" },
  maisonkayser: { username: "maisonkayser", role: "restaurant", restaurantName: "Maison Kayser", email: "maisonkayser@beervoucher.app" },
  admin: { username: "admin", role: "admin", restaurantName: "Ban Quản Lý", email: "admin@beervoucher.app" },
};

/** Trả hồ sơ user từ preset (không cần bảng users). */
export async function getUserProfile(uid: string, email?: string): Promise<UserProfile> {
  let matchedKey = "admin";
  if (email) matchedKey = email.split("@")[0].toLowerCase();

  const preset = PRESET_USERS[matchedKey] || {
    username: email ? email.split("@")[0] : "user",
    role: matchedKey === "admin" ? "admin" : "restaurant",
    restaurantName: matchedKey === "admin" ? "Ban Quản Lý" : `Nhà Hàng ${email ? email.split("@")[0] : "Lê Hội Bia"}`,
    email: email || "",
  };

  return { uid, ...preset, email: email || preset.email, createdAt: new Date().toISOString() };
}

function cleanUndefinedFields<T extends Record<string, any>>(obj: T): Partial<T> {
  const newObj: any = {};
  Object.keys(obj).forEach((key) => {
    if (obj[key] !== undefined) newObj[key] = obj[key];
  });
  return newObj;
}

export async function createUserProfile(uid: string, profile: Omit<UserProfile, "uid">): Promise<UserProfile> {
  return { uid, ...profile, createdAt: new Date().toISOString() };
}

/** Get local date string in YYYY-MM-DD format based on client local timezone */
export function getLocalDateString(d: Date = new Date()): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/** Chuẩn hoá 1 row Supabase -> VoucherRecord (điền default potato/beer nếu thiếu). */
function normalizeRow(data: any): VoucherRecord {
  const potato = data.potatoCoupons ?? Math.round((data.postedBills || 0) / 2);
  const beer = data.beerCoupons ?? ((data.postedBills || 0) - potato);
  return {
    ...data,
    billImages: Array.isArray(data.billImages) ? data.billImages : [],
    potatoCoupons: potato,
    beerCoupons: beer,
  } as VoucherRecord;
}

/**
 * Get voucher for a specific restaurant and date.
 * If isAdmin or restaurantId === 'all', aggregates across all restaurants for that date.
 */
export async function getVoucherByDate(
  restaurantId: string,
  date: string,
  isAdmin: boolean = false,
  includeImages: boolean = false
): Promise<VoucherRecord | null> {
  try {
    const sel = includeImages ? "*" : LIGHT_COLS;
    if (isAdmin || restaurantId === "all") {
      const rows = await sbGet(`vouchers?date=eq.${encodeURIComponent(date)}&select=${sel}`);
      if (rows.length === 0) return null;

      let totalPotato = 0, totalBeer = 0, totalCancelled = 0, totalPostedBills = 0, totalIssued = 0;
      const allBillImages: string[] = [];
      const allBillNumbers: string[] = [];

      rows.forEach((data: any) => {
        const potato = data.potatoCoupons ?? Math.round((data.postedBills || 0) / 2);
        const beer = data.beerCoupons ?? ((data.postedBills || 0) - potato);
        totalPotato += potato;
        totalBeer += beer;
        totalCancelled += data.cancelled || 0;
        totalPostedBills += data.postedBills || (potato + beer);
        totalIssued += data.totalIssued || (potato + beer + (data.cancelled || 0));
        if (Array.isArray(data.billImages)) allBillImages.push(...data.billImages);
        if (data.billNumber) allBillNumbers.push(`${data.restaurantName || data.restaurantId}: ${data.billNumber}`);
      });

      const rate = totalIssued > 0 ? Math.round((totalPostedBills / totalIssued) * 100) : 0;
      return {
        id: `all_${date}`,
        date,
        restaurantId: "all",
        restaurantName: "Tất Cả Nhà Hàng",
        potatoCoupons: totalPotato,
        beerCoupons: totalBeer,
        cancelled: totalCancelled,
        postedBills: totalPostedBills,
        totalIssued,
        utilizationRate: rate,
        billNumber: allBillNumbers.length > 0 ? allBillNumbers.join("; ") : undefined,
        billImages: allBillImages.length > 0 ? allBillImages : undefined,
      };
    }

    const docId = `${restaurantId}_${date}`;
    const rows = await sbGet(`vouchers?id=eq.${encodeURIComponent(docId)}&select=${sel}`);
    if (rows.length > 0) return normalizeRow(rows[0]);

    // Fallback query by restaurantId + date
    const rows2 = await sbGet(`vouchers?restaurantId=eq.${encodeURIComponent(restaurantId)}&date=eq.${encodeURIComponent(date)}&select=${sel}`);
    if (rows2.length > 0) return normalizeRow(rows2[0]);

    return null;
  } catch (error) {
    console.error("Error getting voucher by date:", error);
    return null;
  }
}

export async function getTodayVoucher(restaurantId: string, isAdmin: boolean = false): Promise<VoucherRecord | null> {
  return getVoucherByDate(restaurantId, getLocalDateString(), isAdmin);
}

// Cột nhẹ (KHÔNG kèm billImages base64) cho các query danh sách/KPI/chart -> nhanh.
const LIGHT_COLS =
  "id,date,restaurantId,restaurantName,potatoCoupons,beerCoupons,bakeryCoupons,cancelled,postedBills,totalIssued,utilizationRate,billNumber,updatedAt,createdBy";

export async function getVouchersByDateRange(
  restaurantId: string | null,
  startDate: string,
  endDate: string,
  includeImages: boolean = false
): Promise<VoucherRecord[]> {
  try {
    const select = includeImages ? "*" : LIGHT_COLS;
    const rows = await sbGet(
      `vouchers?date=gte.${encodeURIComponent(startDate)}&date=lte.${encodeURIComponent(endDate)}&select=${select}`
    );
    const results: VoucherRecord[] = [];
    rows.forEach((data: any) => {
      if (!restaurantId || restaurantId === "all" || data.restaurantId === restaurantId) {
        results.push(normalizeRow(data));
      }
    });
    return results.sort((a, b) => b.date.localeCompare(a.date));
  } catch (error) {
    console.error("Error getting vouchers by date range:", error);
    return [];
  }
}

export async function getAggregatedVoucherByDateRange(
  restaurantId: string | null,
  startDate: string,
  endDate: string,
  includeImages: boolean = false
): Promise<VoucherRecord | null> {
  const records = await getVouchersByDateRange(restaurantId, startDate, endDate, includeImages);
  if (!records || records.length === 0) return null;

  let totalPotato = 0, totalBeer = 0, totalBakery = 0, totalCancelled = 0, totalPostedBills = 0, totalIssued = 0;
  const allBillImages: string[] = [];
  const allBillNumbers: string[] = [];

  records.forEach((data) => {
    const potato = data.potatoCoupons ?? Math.round((data.postedBills || 0) / 2);
    const beer = data.beerCoupons ?? ((data.postedBills || 0) - potato);
    const bakery = data.bakeryCoupons ?? 0;
    const cancelled = data.cancelled || 0;
    const posted = data.postedBills || (potato + beer + bakery);
    const issued = data.totalIssued || (potato + beer + bakery + cancelled);

    totalPotato += potato;
    totalBeer += beer;
    totalBakery += bakery;
    totalCancelled += cancelled;
    totalPostedBills += posted;
    totalIssued += issued;

    if (Array.isArray(data.billImages)) allBillImages.push(...data.billImages);
    if (data.billNumber) allBillNumbers.push(`${data.restaurantName || data.restaurantId} (${data.date}): ${data.billNumber}`);
  });

  const rate = totalIssued > 0 ? Math.round((totalPostedBills / totalIssued) * 100) : 0;
  return {
    id: `aggregate_${startDate}_${endDate}`,
    date: startDate === endDate ? startDate : `${startDate} → ${endDate}`,
    restaurantId: restaurantId || "all",
    restaurantName: !restaurantId || restaurantId === "all" ? "Tất Cả Nhà Hàng" : restaurantId,
    potatoCoupons: totalPotato,
    beerCoupons: totalBeer,
    bakeryCoupons: totalBakery,
    cancelled: totalCancelled,
    postedBills: totalPostedBills,
    totalIssued: totalIssued,
    utilizationRate: rate,
    billNumber: allBillNumbers.length > 0 ? allBillNumbers.join("; ") : undefined,
    billImages: allBillImages.length > 0 ? allBillImages : undefined,
  };
}

/** Upsert (create or update) a voucher record */
export async function upsertVoucher(data: {
  date: string;
  restaurantId: string;
  restaurantName?: string;
  potatoCoupons: number;
  beerCoupons: number;
  bakeryCoupons?: number;
  cancelled: number;
  postedBills: number;
  totalIssued: number;
  createdBy: string;
  billNumber?: string;
  billImages?: string[];
}): Promise<VoucherRecord> {
  const docId = `${data.restaurantId}_${data.date}`;
  const utilizationRate = data.totalIssued > 0 ? Math.round((data.postedBills / data.totalIssued) * 100) : 0;

  const record: VoucherRecord = { id: docId, ...data, utilizationRate, updatedAt: new Date().toISOString() };
  const cleaned = cleanUndefinedFields(record) as Record<string, any>;
  await sbUpsert("vouchers", cleaned);

  // ĐỌC LẠI XÁC NHẬN đã lưu thật vào Supabase — tránh báo "lưu thành công" giả
  // (trước đây nếu ghi hụt âm thầm, app vẫn hiện thành công & gửi card khiến tưởng đã nhập).
  const verify = await sbGet(`vouchers?id=eq.${encodeURIComponent(docId)}&select=id`);
  if (!verify || verify.length === 0) {
    throw new Error(
      "Lưu THẤT BẠI: đã gửi nhưng đọc lại KHÔNG thấy dữ liệu trong kho (Supabase). " +
        "Kiểm tra mạng và bấm Lưu lại — KHÔNG được coi là đã nhập cho tới khi báo thành công."
    );
  }
  return { ...(cleaned as VoucherRecord), id: docId };
}

/**
 * Chỉ lấy ảnh bill của MỘT bản ghi, gọi khi người dùng bấm xem.
 *
 * Vì sao cần: ảnh bill cũ được lưu thẳng dạng base64 trong cột `billImages`,
 * chiếm 14 MB / 28 MB cả bảng, có dòng nặng tới 892 kB. Tab "Lịch Sử" trước đây
 * tải 30 ngày KÈM ảnh nên mỗi lần mở kéo về hàng chục MB — đó là thứ đã đốt hết
 * 5 GB egress/tháng của gói Supabase Free. Nay bảng tải nhẹ, ảnh lấy khi cần.
 */
export async function getVoucherImages(id: string): Promise<string[]> {
  try {
    const rows = await sbGet(`vouchers?id=eq.${encodeURIComponent(id)}&select=billImages`);
    return rows.length > 0 && Array.isArray(rows[0].billImages) ? rows[0].billImages : [];
  } catch (e) {
    console.error("Không tải được ảnh bill:", e);
    return [];
  }
}

/** Append new bill images to an existing voucher record */
export async function appendBillImagesToVoucher(
  restaurantId: string,
  date: string,
  newImages: string[],
  billNumber?: string
): Promise<VoucherRecord> {
  const docId = `${restaurantId}_${date}`;
  const rows = await sbGet(`vouchers?id=eq.${encodeURIComponent(docId)}&select=*`);
  const current: Partial<VoucherRecord> = rows.length > 0 ? rows[0] : {};
  const existingImages: string[] = Array.isArray(current.billImages) ? current.billImages : [];

  const updated: Record<string, any> = {
    id: docId,
    restaurantId,
    date,
    billImages: [...existingImages, ...newImages],
    updatedAt: new Date().toISOString(),
  };
  if (billNumber) updated.billNumber = billNumber;

  await sbUpsert("vouchers", updated);
  return { ...current, ...updated, id: docId } as VoucherRecord;
}

/** Settings CRUD (MS Teams Webhook, Telegram token, ...) */
export async function getSetting(key: string): Promise<string | null> {
  try {
    const rows = await sbGet(`settings?key=eq.${encodeURIComponent(key)}&select=value`);
    return rows.length > 0 ? (rows[0].value ?? null) : null;
  } catch (error) {
    console.error("Error fetching setting:", error);
    return null;
  }
}

export async function setSetting(key: string, value: string): Promise<void> {
  await sbUpsert("settings", { key, value, updatedAt: new Date().toISOString() });
}

export interface RestaurantStatus {
  restaurantId: string;
  restaurantName: string;
  hasUpdated: boolean;
  postedBills?: number;
  totalIssued?: number;
  utilizationRate?: number;
  hasImageProof?: boolean;
  imageCount?: number;
  billNumber?: string;
  updatedAt?: string;
}

/** Check which restaurants have missing reports for a target date (defaults to yesterday) */
export async function checkUnupdatedRestaurants(checkDate?: string): Promise<{
  checkDate: string;
  missing: RestaurantStatus[];
  updated: RestaurantStatus[];
  totalRestaurants: number;
}> {
  let dateToQuery = checkDate;
  if (!dateToQuery) {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    dateToQuery = getLocalDateString(yesterday);
  }

  const restaurantKeys = Object.keys(PRESET_USERS).filter((k) => k !== "admin");
  const missing: RestaurantStatus[] = [];
  const updated: RestaurantStatus[] = [];

  // 1 QUERY duy nhất cho cả ngày (thay vì 4 call tuần tự) -> nhanh hơn nhiều
  const rows = await getVouchersByDateRange(null, dateToQuery, dateToQuery, true);
  const byRest: Record<string, VoucherRecord> = {};
  for (const r of rows) byRest[r.restaurantId] = r;

  for (const key of restaurantKeys) {
    const preset = PRESET_USERS[key];
    const record = byRest[key];
    if (record && record.updatedAt) {
      const imageCount = Array.isArray(record.billImages) ? record.billImages.length : 0;
      updated.push({
        restaurantId: key,
        restaurantName: preset.restaurantName,
        hasUpdated: true,
        postedBills: record.postedBills ?? 0,
        totalIssued: record.totalIssued ?? 0,
        utilizationRate: record.utilizationRate ?? 0,
        hasImageProof: imageCount > 0,
        imageCount,
        billNumber: record.billNumber,
        updatedAt: record.updatedAt,
      });
    } else {
      missing.push({ restaurantId: key, restaurantName: preset.restaurantName, hasUpdated: false });
    }
  }

  return { checkDate: dateToQuery, missing, updated, totalRestaurants: restaurantKeys.length };
}
