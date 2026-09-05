/**
 * Lớp xác thực dùng chung cho MỌI endpoint /api.
 *
 * Bối cảnh: trước đây /api/db mở toang, ai cũng GET được bảng settings (chứa
 * telegram_bot_token, ms_teams_webhook) và POST ghi đè số liệu voucher. Từ nay
 * mọi endpoint đụng dữ liệu đều phải đi qua đây.
 *
 * Cách hoạt động: client đăng nhập Google (Firebase Auth) rồi gửi kèm
 * `Authorization: Bearer <idToken>`. Server xác minh chữ ký token bằng khoá công
 * khai của Google (jose + JWKS), KHÔNG cần firebase-admin và không cần service
 * account key. Token giả hoặc hết hạn sẽ bị chặn ngay.
 *
 * Phân quyền lưu trong bảng `settings` dạng key = "user:<email>" để khỏi phải
 * tạo bảng mới (tạo bảng cần vào dashboard Supabase).
 */
import type { IncomingMessage, ServerResponse } from "node:http";
import { createRemoteJWKSet, jwtVerify } from "jose";

const FB_PROJECT_ID = process.env.FIREBASE_PROJECT_ID || "gen-lang-client-0780471401";

/** Email luôn có quyền cao nhất, không thể bị xoá quyền qua giao diện. */
export const SUPER_ADMIN_EMAIL = (process.env.SUPER_ADMIN_EMAIL || "khoa.huynh.06.12.2000@gmail.com").toLowerCase();

const SB_URL = process.env.SUPABASE_URL || "https://fuqxhhtpdwujupjjwbzi.supabase.co";
const SB_KEY = process.env.SUPABASE_KEY || "";
const sbAuth = { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` };

/**
 * Giá trị đặc biệt khi người dùng xin quyền xem TOÀN hệ thống (kế toán, Ban
 * Quản Lý) thay vì một nhà hàng cụ thể. Chỉ là NGUYỆN VỌNG — vẫn phải chủ hệ
 * thống duyệt mới có quyền thật.
 */
export const ADMIN_REQUEST = "admin";
export const ADMIN_REQUEST_LABEL = "Ban Quản Lý (xem toàn hệ thống)";

/** Danh sách nhà hàng hợp lệ — dùng để chặn người dùng tự bịa restaurantId. */
export const RESTAURANTS: { id: string; name: string }[] = [
  { id: "lehoibia", name: "Lê Hội Bia" },
  { id: "1901", name: "Nhà Hàng 1901" },
  { id: "beerplaza", name: "Beer Plaza" },
  { id: "maisonkayser", name: "Maison Kayser" },
];

export type AppRole = "super_admin" | "admin" | "restaurant" | "pending";

export interface AppUser {
  email: string;
  role: AppRole;
  /** Nhà hàng đã được duyệt cho phép xem. Rỗng khi còn pending. */
  restaurantId?: string;
  /** Nhà hàng người dùng TỰ CHỌN khi đăng ký, chờ duyệt. */
  requestedRestaurantId?: string;
  displayName?: string;
  firstLoginAt?: string;
  lastLoginAt?: string;
  approvedBy?: string;
  approvedAt?: string;
}

const JWKS = createRemoteJWKSet(
  new URL("https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com")
);

function bearerToken(req: IncomingMessage): string {
  const h = req.headers["authorization"] || req.headers["Authorization" as any];
  const raw = Array.isArray(h) ? h[0] : h;
  if (!raw || !raw.startsWith("Bearer ")) return "";
  return raw.slice(7).trim();
}

/** Xác minh Firebase ID token. Trả về email đã chuẩn hoá, hoặc null nếu không hợp lệ. */
export async function verifyIdToken(
  req: IncomingMessage
): Promise<{ email: string; name?: string } | null> {
  const token = bearerToken(req);
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, JWKS, {
      issuer: `https://securetoken.google.com/${FB_PROJECT_ID}`,
      audience: FB_PROJECT_ID,
    });
    const email = String((payload as any).email || "").toLowerCase();
    // Bắt buộc email đã được Google xác minh — tránh token của provider tự khai email.
    if (!email || (payload as any).email_verified === false) return null;
    return { email, name: (payload as any).name ? String((payload as any).name) : undefined };
  } catch {
    return null;
  }
}

const userKey = (email: string) => `user:${email.toLowerCase()}`;

export async function getAppUser(email: string): Promise<AppUser | null> {
  const lower = email.toLowerCase();
  if (lower === SUPER_ADMIN_EMAIL) {
    return { email: lower, role: "super_admin" };
  }
  try {
    const r = await fetch(
      `${SB_URL}/rest/v1/settings?key=eq.${encodeURIComponent(userKey(lower))}&select=value`,
      { headers: sbAuth }
    );
    if (!r.ok) return null;
    const rows = (await r.json()) as { value: string }[];
    if (!rows.length || !rows[0].value) return null;
    return JSON.parse(rows[0].value) as AppUser;
  } catch {
    return null;
  }
}

export async function saveAppUser(user: AppUser): Promise<boolean> {
  try {
    const r = await fetch(`${SB_URL}/rest/v1/settings`, {
      method: "POST",
      headers: { ...sbAuth, "Content-Type": "application/json", Prefer: "resolution=merge-duplicates" },
      body: JSON.stringify({
        key: userKey(user.email),
        value: JSON.stringify(user),
        updatedAt: new Date().toISOString(),
      }),
    });
    return r.ok;
  } catch {
    return false;
  }
}

export async function listAppUsers(): Promise<AppUser[]> {
  try {
    const r = await fetch(`${SB_URL}/rest/v1/settings?key=like.user:*&select=value`, { headers: sbAuth });
    if (!r.ok) return [];
    const rows = (await r.json()) as { value: string }[];
    const out: AppUser[] = [];
    for (const row of rows) {
      try {
        out.push(JSON.parse(row.value));
      } catch {
        /* dòng hỏng thì bỏ qua, không làm sập trang duyệt */
      }
    }
    return out;
  } catch {
    return [];
  }
}

export interface AuthResult {
  email: string;
  role: AppRole;
  restaurantId?: string;
}

function deny(res: ServerResponse, code: number, message: string) {
  res.setHeader("Content-Type", "application/json");
  res.writeHead(code);
  res.end(JSON.stringify({ success: false, message }));
}

/**
 * Chặn cửa endpoint. Trả về thông tin người dùng nếu qua, hoặc null (đã tự ghi
 * lỗi ra response — endpoint chỉ cần `if (!who) return;`).
 *
 * `need`:
 *   - "any": đã đăng nhập VÀ đã được duyệt (pending bị chặn)
 *   - "admin": admin hoặc super_admin
 *   - "super_admin": chỉ mình chủ hệ thống
 */
export async function requireAuth(
  req: IncomingMessage,
  res: ServerResponse,
  need: "any" | "admin" | "super_admin" = "any"
): Promise<AuthResult | null> {
  const token = await verifyIdToken(req);
  if (!token) {
    deny(res, 401, "Chưa đăng nhập hoặc phiên đã hết hạn. Vui lòng đăng nhập lại bằng Google.");
    return null;
  }

  const user = await getAppUser(token.email);
  if (!user || user.role === "pending") {
    deny(res, 403, "Tài khoản chưa được duyệt. Vui lòng chờ quản trị viên cấp quyền.");
    return null;
  }

  const isSuper = user.role === "super_admin";
  const isAdmin = isSuper || user.role === "admin";

  if (need === "super_admin" && !isSuper) {
    deny(res, 403, "Chỉ chủ hệ thống mới được thực hiện thao tác này.");
    return null;
  }
  if (need === "admin" && !isAdmin) {
    deny(res, 403, "Chỉ quản trị viên mới được thực hiện thao tác này.");
    return null;
  }

  return { email: user.email, role: user.role, restaurantId: user.restaurantId };
}

/** Cron của Vercel gửi `Authorization: Bearer $CRON_SECRET`. Chặn người lạ gọi tay. */
export function requireCronSecret(req: IncomingMessage, res: ServerResponse): boolean {
  const secret = process.env.CRON_SECRET || "";
  if (!secret) {
    deny(res, 500, "Chưa cấu hình CRON_SECRET trên server.");
    return false;
  }
  if (bearerToken(req) !== secret) {
    deny(res, 401, "Không có quyền gọi endpoint hẹn giờ.");
    return false;
  }
  return true;
}

/**
 * Endpoint hẹn giờ có HAI người gọi hợp lệ: Vercel Cron (mang CRON_SECRET) và
 * admin bấm tay từ giao diện (mang Firebase token). Chấp nhận cả hai, chặn phần
 * còn lại của internet.
 */
export async function requireCronOrAdmin(req: IncomingMessage, res: ServerResponse): Promise<boolean> {
  const secret = process.env.CRON_SECRET || "";
  if (secret && bearerToken(req) === secret) return true;

  const token = await verifyIdToken(req);
  if (token) {
    const user = await getAppUser(token.email);
    if (user && (user.role === "admin" || user.role === "super_admin")) return true;
  }

  deny(res, 401, "Không có quyền gọi endpoint hẹn giờ.");
  return false;
}

/** Chỉ cho phép trình duyệt từ chính domain app gọi, thay vì mở CORS cho tất cả. */
export function applyCors(req: IncomingMessage, res: ServerResponse) {
  const allowed = (process.env.ALLOWED_ORIGIN || "https://beer-voucher-tracker.vercel.app").split(",");
  const origin = String(req.headers.origin || "");
  if (origin && allowed.includes(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
  }
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.setHeader("Content-Type", "application/json");
}
