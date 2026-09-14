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
import { getFirestoreSetting } from "./botCore.js";

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

/**
 * Nhớ tạm hồ sơ quyền trong bộ nhớ của chính function đang chạy.
 *
 * Vì sao cần: MỌI lời gọi /api đều phải tra quyền, mà một lần mở app có 4-5 lời
 * gọi — nghĩa là 4-5 vòng tới Supabase chỉ để hỏi đi hỏi lại "người này là ai".
 * Đó là lý do app vào chậm sau khi siết bảo mật.
 *
 * Chỉ 30 giây để nếu chủ hệ thống vừa duyệt cho ai thì người đó không phải chờ
 * lâu. saveAppUser() ghi đè thẳng vào bộ nhớ này nên thao tác duyệt có hiệu lực
 * ngay trên chính máy chủ vừa xử lý.
 */
const USER_CACHE_MS = 30_000;
const userCache = new Map<string, { user: AppUser | null; at: number }>();

export async function getAppUser(email: string): Promise<AppUser | null> {
  const lower = email.toLowerCase();
  if (lower === SUPER_ADMIN_EMAIL) {
    return { email: lower, role: "super_admin" };
  }

  const hit = userCache.get(lower);
  if (hit && Date.now() - hit.at < USER_CACHE_MS) return hit.user;

  try {
    const r = await fetch(
      `${SB_URL}/rest/v1/settings?key=eq.${encodeURIComponent(userKey(lower))}&select=value`,
      { headers: sbAuth }
    );
    // Lỗi mạng thì KHÔNG nhớ tạm, để lần sau thử lại — nhớ nhầm "không có
    // quyền" sẽ khoá oan người dùng suốt 30 giây.
    if (!r.ok) return null;
    const rows = (await r.json()) as { value: string }[];
    const found =
      rows.length && rows[0].value ? (JSON.parse(rows[0].value) as AppUser) : null;
    userCache.set(lower, { user: found, at: Date.now() });
    return found;
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
    // Ghi đè bộ nhớ tạm để thao tác duyệt có hiệu lực ngay, không phải chờ hết
    // 30 giây.
    if (r.ok) userCache.set(user.email.toLowerCase(), { user, at: Date.now() });
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

/* ------------------------------------------------------------------ *
 * NHẬT KÝ TRUY CẬP API — để phát hiện máy lạ gọi vào
 * ------------------------------------------------------------------ */

export const ACCESS_LOG_KEY = "api_access_log";
/** Tiền tố của dòng đánh dấu "đã báo máy này rồi", xoá cùng nhật ký mỗi ngày. */
const ALERTED_PREFIX = "alerted:";
/** Giữ tối đa ngần này mục, cũ nhất bị loại. Đủ để soi mà không phình bảng. */
const ACCESS_LOG_MAX = 200;
/**
 * Người dùng trình duyệt: mỗi tiến trình chỉ ghi lại một lần trong ngần này.
 * KHÔNG áp dụng cho agent/script — nhóm đó đếm từng lượt, xem recordApiAccess().
 */
const RELOG_AFTER_MS = 30 * 60 * 1000;

export interface AccessEntry {
  who: string;
  kind: "user" | "report-token" | "cron";
  ip: string;
  city?: string;
  country?: string;
  ua?: string;
  count: number;
  firstSeen: string;
  lastSeen: string;
}

/** Đã ghi gần đây trong chính tiến trình này -> khỏi ghi lại, tránh mỗi request
 *  một lượt ghi database. */
const loggedRecently = new Map<string, number>();

const header = (req: IncomingMessage, name: string): string => {
  const v = req.headers[name];
  return (Array.isArray(v) ? v[0] : v) || "";
};

/** Rút gọn user-agent thành thứ người đọc được: "Chrome trên Windows". */
function shortDevice(ua: string): string {
  if (!ua) return "không rõ";
  const os = /Windows/i.test(ua)
    ? "Windows"
    : /Android/i.test(ua)
      ? "Android"
      : /iPhone|iPad/i.test(ua)
        ? "iPhone/iPad"
        : /Mac OS X/i.test(ua)
          ? "macOS"
          : /Linux/i.test(ua)
            ? "Linux"
            : "";
  const app = /PowerShell|WindowsPowerShell/i.test(ua)
    ? "PowerShell"
    : /curl/i.test(ua)
      ? "curl"
      : /Edg\//i.test(ua)
        ? "Edge"
        : /Chrome\//i.test(ua)
          ? "Chrome"
          : /Safari\//i.test(ua)
            ? "Safari"
            : /Firefox\//i.test(ua)
              ? "Firefox"
              : "khác";
  return os ? `${app} trên ${os}` : app;
}

async function readAccessLog(): Promise<Record<string, AccessEntry>> {
  try {
    const r = await fetch(
      `${SB_URL}/rest/v1/settings?key=eq.${encodeURIComponent(ACCESS_LOG_KEY)}&select=value`,
      { headers: sbAuth }
    );
    if (!r.ok) return {};
    const rows = (await r.json()) as { value: string }[];
    if (!rows.length || !rows[0].value) return {};
    const parsed = JSON.parse(rows[0].value);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

/** Danh sách máy đã gọi API trong ngày, mới nhất trước. */
export async function getAccessLog(): Promise<AccessEntry[]> {
  const map = await readAccessLog();
  return Object.values(map).sort((a, b) => (b.lastSeen || "").localeCompare(a.lastSeen || ""));
}

/**
 * Xoá sạch nhật ký. Gọi từ cron 09:00 sau khi đã gửi bản tổng kết — mỗi ngày
 * bắt đầu lại từ trắng, nên bảng settings không phình và "máy mới" luôn có
 * nghĩa là mới trong hôm nay.
 */
export async function clearAccessLog(): Promise<AccessEntry[]> {
  const before = await getAccessLog();
  try {
    await fetch(`${SB_URL}/rest/v1/settings`, {
      method: "POST",
      headers: { ...sbAuth, "Content-Type": "application/json", Prefer: "resolution=merge-duplicates" },
      body: JSON.stringify({ key: ACCESS_LOG_KEY, value: "{}", updatedAt: new Date().toISOString() }),
    });

    // Xoá luôn các dòng đánh dấu "đã báo máy này". Quên bước này thì hôm sau
    // máy cũ vẫn bị coi là đã báo rồi và sẽ KHÔNG báo nữa.
    await fetch(`${SB_URL}/rest/v1/settings?key=like.${encodeURIComponent(ALERTED_PREFIX + "*")}`, {
      method: "DELETE",
      headers: sbAuth,
    });

    loggedRecently.clear();
  } catch {
    /* xoá hụt thì mai xoá tiếp, không đáng làm hỏng báo cáo 09:00 */
  }
  return before;
}

/**
 * Giành quyền báo cho MỘT máy, chống bắn trùng.
 *
 * Vì sao cần: một lần mở app bắn 4-5 lời gọi API song song, mỗi lời gọi chạy
 * trên một tiến trình riêng với bộ nhớ riêng. Cả đám cùng đọc nhật ký, cùng
 * thấy "chưa có máy này", nên cùng kết luận là máy mới và cùng bắn tin — đó là
 * lý do Telegram báo trùng 2-3 lần.
 *
 * Cách chặn: ghi một dòng đánh dấu KHÔNG dùng merge-duplicates. `key` là khoá
 * chính nên tiến trình thứ hai trở đi sẽ đụng trùng khoá và bị từ chối. Chỉ
 * tiến trình ghi thành công mới được gửi tin. Đây là chốt ở tầng database nên
 * đúng kể cả khi các tiến trình chạy song song.
 */
async function gianhQuyenBao(key: string): Promise<boolean> {
  try {
    const r = await fetch(`${SB_URL}/rest/v1/settings`, {
      method: "POST",
      // CỐ Ý không có Prefer: resolution=merge-duplicates — cần nó BÁO LỖI khi trùng.
      headers: { ...sbAuth, "Content-Type": "application/json" },
      body: JSON.stringify({
        key: `${ALERTED_PREFIX}${key}`,
        value: "1",
        updatedAt: new Date().toISOString(),
      }),
    });
    return r.ok; // 201 = mình giành được; 409 = tiến trình khác đã báo rồi
  } catch {
    return false; // không chắc thì thôi không báo, thà sót còn hơn spam
  }
}

/** Gửi cảnh báo Telegram khi thấy máy chưa từng gọi trong ngày. */
async function alertNewMachine(e: AccessEntry): Promise<void> {
  try {
    const [botToken, chatId] = await Promise.all([
      getFirestoreSetting("telegram_bot_token"),
      getFirestoreSetting("telegram_chat_id"),
    ]);
    if (!botToken || !chatId) return;

    const viTri = [e.city, e.country].filter(Boolean).join(", ") || "không rõ";
    const loai =
      e.kind === "report-token" ? "Agent báo cáo (token dịch vụ)" : e.kind === "cron" ? "Hẹn giờ" : "Người dùng";

    const html =
      `<b>🔔 MÁY MỚI GỌI API</b>\n\n` +
      `👤 <b>Ai:</b> ${e.who}\n` +
      `🏷 <b>Loại:</b> ${loai}\n` +
      `🌐 <b>IP:</b> <code>${e.ip}</code>\n` +
      `📍 <b>Vị trí:</b> ${viTri}\n` +
      `💻 <b>Thiết bị:</b> ${e.ua || "không rõ"}\n\n` +
      `<i>Nếu đây không phải nhà hàng hay agent của bạn, vào Cài Đặt Admin thu hồi quyền hoặc đổi REPORT_API_TOKEN.</i>`;

    await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text: html, parse_mode: "HTML" }),
    });
  } catch {
    /* báo hỏng thì kệ, tuyệt đối không được làm chết request của người dùng */
  }
}

/**
 * Ghi nhận một máy vừa gọi API.
 *
 * Cố ý KHÔNG ghi mỗi request: một lần mở app có 4-5 lời gọi, ghi hết thì vừa
 * chậm vừa tốn băng thông — đúng thứ vừa phải sửa. Mỗi máy chỉ ghi lại nhiều
 * nhất 30 phút một lần trên mỗi tiến trình máy chủ.
 *
 * Số đếm chỉ mang tính tham khảo: nhiều tiến trình cùng cập nhật một dòng nên
 * có thể hụt vài lượt. Mục đích là PHÁT HIỆN MÁY LẠ, không phải đếm chính xác.
 */
export async function recordApiAccess(
  req: IncomingMessage,
  who: string,
  kind: AccessEntry["kind"]
): Promise<void> {
  try {
    const ip = (header(req, "x-forwarded-for").split(",")[0] || "").trim() || "không rõ";
    const key = `${who}|${ip}`;

    // Agent/script: ĐẾM TỪNG LƯỢT, không bỏ sót. Chúng gọi thưa và không ai
    // ngồi chờ màn hình nên thêm một vòng ghi không ảnh hưởng gì.
    //
    // Người dùng trình duyệt: vẫn chặn 30 phút. Một lần mở app có 4-5 lời gọi,
    // ghi hết là cộng thêm 8-10 vòng mạng ngay trên đường vào — đúng thứ đã làm
    // app chậm và vừa phải sửa. Với họ, biết "có mặt hôm nay" là đủ.
    const demTungLuot = kind === "report-token";

    if (!demTungLuot) {
      const last = loggedRecently.get(key);
      if (last && Date.now() - last < RELOG_AFTER_MS) return;
      loggedRecently.set(key, Date.now());
    }

    const now = new Date().toISOString();
    const map = await readAccessLog();
    const prev = map[key];
    // Chưa từng thấy trong ngày -> đây là máy mới, phải báo ngay.
    const laMayMoi = !prev;

    map[key] = {
      who,
      kind,
      ip,
      city: header(req, "x-vercel-ip-city") ? decodeURIComponent(header(req, "x-vercel-ip-city")) : prev?.city,
      country: header(req, "x-vercel-ip-country") || prev?.country,
      ua: shortDevice(header(req, "user-agent")),
      count: (prev?.count || 0) + 1,
      firstSeen: prev?.firstSeen || now,
      lastSeen: now,
    };

    // Quá nhiều mục thì bỏ những máy lâu không gọi.
    const all = Object.entries(map).sort((a, b) => (b[1].lastSeen || "").localeCompare(a[1].lastSeen || ""));
    const trimmed = Object.fromEntries(all.slice(0, ACCESS_LOG_MAX));

    await fetch(`${SB_URL}/rest/v1/settings`, {
      method: "POST",
      headers: { ...sbAuth, "Content-Type": "application/json", Prefer: "resolution=merge-duplicates" },
      body: JSON.stringify({ key: ACCESS_LOG_KEY, value: JSON.stringify(trimmed), updatedAt: now }),
    });

    if (laMayMoi && (await gianhQuyenBao(key))) await alertNewMachine(map[key]);
  } catch {
    /* ghi log hỏng thì kệ, tuyệt đối không được làm chết request của người dùng */
  }
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

  await recordApiAccess(req, user.email, "user");

  return { email: user.email, role: user.role, restaurantId: user.restaurantId };
}

/**
 * Token cho script/agent lấy số liệu về làm báo cáo (không phải người dùng
 * ngồi trước trình duyệt nên không đăng nhập Google được).
 *
 * Đặt ở biến môi trường REPORT_API_TOKEN trên Vercel. Ràng buộc cố ý:
 *   - CHỈ dùng cho GET, không bao giờ ghi được dữ liệu
 *   - CHỈ bảng vouchers; bảng settings vẫn chặn tuyệt đối vì chứa bot token và
 *     webhook Teams
 *   - Yêu cầu tối thiểu 24 ký tự để lỡ ai đặt token ngắn/rỗng thì cửa vẫn đóng
 *
 * Muốn thu hồi thì đổi giá trị biến môi trường, token cũ chết ngay.
 * TUYỆT ĐỐI không nhúng token này vào mã client — làm vậy là công khai nó.
 */
export function isReportToken(req: IncomingMessage): boolean {
  const expected = (process.env.REPORT_API_TOKEN || "").trim();
  if (expected.length < 24) return false;
  return bearerToken(req) === expected;
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
