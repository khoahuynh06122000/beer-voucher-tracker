/**
 * Phiên đăng nhập + quản lý tài khoản.
 *
 *   POST /api/session                  -> đổi Firebase ID token lấy hồ sơ quyền
 *   GET  /api/session?admin=users      -> danh sách tài khoản (chỉ chủ hệ thống)
 *   POST /api/session?admin=users      -> duyệt / từ chối / thu hồi (chỉ chủ hệ thống)
 *
 * ⚠️ VÌ SAO GỘP CHUNG MỘT FILE: gói Vercel Hobby chỉ cho **12 Serverless
 * Function** mỗi deployment, và dự án đang dùng đúng 12. Tách phần quản lý tài
 * khoản ra file riêng là thành 13 -> build xong nhưng CHẾT ở bước "Deploying
 * outputs" mà Build Logs không hề báo lỗi (rất khó lần ra).
 * Muốn thêm endpoint mới thì phải bỏ bớt một cái khác, hoặc lên gói Pro.
 *
 * Luồng đăng nhập:
 *   1. Email chưa từng vào  -> tạo bản ghi "pending", trả danh sách nhà hàng để
 *      người dùng chọn xin quyền. CHƯA thấy dữ liệu gì.
 *   2. Email đang chờ duyệt -> trả pending kèm nhà hàng họ đã xin.
 *   3. Email đã được duyệt  -> trả vai trò + nhà hàng được xem.
 *
 * Bảo mật: vai trò LUÔN đọc từ server, không bao giờ tin field client gửi lên.
 * Client chỉ được phép nói "tôi muốn xin vào nhà hàng X".
 */
import type { IncomingMessage, ServerResponse } from "node:http";
import { readJsonBody } from "../server/botCore.js";
import {
  applyCors,
  requireAuth,
  getAppUser,
  saveAppUser,
  listAppUsers,
  verifyIdToken,
  RESTAURANTS,
  ADMIN_REQUEST,
  ADMIN_REQUEST_LABEL,
  SUPER_ADMIN_EMAIL,
  type AppRole,
  type AppUser,
} from "../server/authGuard.js";

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  applyCors(req, res);
  if (req.method === "OPTIONS") {
    res.writeHead(200);
    res.end("{}");
    return;
  }

  const url = new URL(req.url || "", `http://${req.headers.host || "localhost"}`);
  if (url.searchParams.get("admin") === "users") {
    return handleUsers(req, res);
  }

  if (req.method !== "POST") {
    res.writeHead(405);
    res.end(JSON.stringify({ success: false, message: "Method Not Allowed" }));
    return;
  }

  const token = await verifyIdToken(req);
  if (!token) {
    res.writeHead(401);
    res.end(JSON.stringify({ success: false, message: "Token không hợp lệ hoặc đã hết hạn." }));
    return;
  }

  const now = new Date().toISOString();
  let body: any = {};
  try {
    body = (await readJsonBody(req)) || {};
  } catch {
    body = {};
  }

  const requested = String(body.requestRestaurantId || "").trim();
  // Ngoài 4 nhà hàng, còn cho xin quyền xem toàn hệ thống (kế toán / Ban Quản Lý).
  const validRequested =
    requested === ADMIN_REQUEST || RESTAURANTS.some((r) => r.id === requested) ? requested : "";

  let user = await getAppUser(token.email);

  if (!user) {
    // Lần đầu đăng nhập: ghi nhận để chủ hệ thống thấy mà duyệt.
    user = {
      email: token.email,
      role: token.email === SUPER_ADMIN_EMAIL ? "super_admin" : "pending",
      displayName: token.name,
      requestedRestaurantId: validRequested || undefined,
      firstLoginAt: now,
      lastLoginAt: now,
    } as AppUser;
    if (user.role !== "super_admin") await saveAppUser(user);
  } else {
    user.lastLoginAt = now;
    if (token.name && !user.displayName) user.displayName = token.name;
    // Cho phép đổi nguyện vọng khi còn đang chờ duyệt (chọn nhầm thì chọn lại).
    if (user.role === "pending" && validRequested) user.requestedRestaurantId = validRequested;
    if (user.role !== "super_admin") await saveAppUser(user);
  }

  const restaurantName =
    RESTAURANTS.find((r) => r.id === user!.restaurantId)?.name ||
    (user!.role === "super_admin" || user!.role === "admin" ? "Ban Quản Lý" : "");

  res.writeHead(200);
  res.end(
    JSON.stringify({
      success: true,
      user: {
        email: user.email,
        role: user.role,
        restaurantId: user.restaurantId || null,
        restaurantName,
        requestedRestaurantId: user.requestedRestaurantId || null,
        displayName: user.displayName || null,
      },
      restaurants: RESTAURANTS,
    })
  );
}

/** Nhánh ?admin=users — quản lý tài khoản, chỉ chủ hệ thống gọi được. */
async function handleUsers(req: IncomingMessage, res: ServerResponse) {
  const who = await requireAuth(req, res, "super_admin");
  if (!who) return;

  if (req.method === "GET") {
    const users = await listAppUsers();
    const decorated = users
      .map((u) => ({
        ...u,
        restaurantName: RESTAURANTS.find((r) => r.id === u.restaurantId)?.name || null,
        requestedRestaurantName:
          u.requestedRestaurantId === ADMIN_REQUEST
            ? ADMIN_REQUEST_LABEL
            : RESTAURANTS.find((r) => r.id === u.requestedRestaurantId)?.name || null,
      }))
      // Người đang chờ duyệt lên đầu để không bị bỏ sót.
      .sort((a, b) => {
        const pa = a.role === "pending" ? 0 : 1;
        const pb = b.role === "pending" ? 0 : 1;
        if (pa !== pb) return pa - pb;
        return (b.lastLoginAt || "").localeCompare(a.lastLoginAt || "");
      });

    res.writeHead(200);
    res.end(
      JSON.stringify({ success: true, users: decorated, restaurants: RESTAURANTS, superAdmin: SUPER_ADMIN_EMAIL })
    );
    return;
  }

  if (req.method === "POST") {
    let body: any;
    try {
      body = (await readJsonBody(req)) || {};
    } catch {
      res.writeHead(400);
      res.end(JSON.stringify({ success: false, message: "Body không hợp lệ." }));
      return;
    }

    const email = String(body.email || "").toLowerCase().trim();
    const action = String(body.action || "");

    if (!email) {
      res.writeHead(400);
      res.end(JSON.stringify({ success: false, message: "Thiếu email." }));
      return;
    }
    if (email === SUPER_ADMIN_EMAIL) {
      res.writeHead(400);
      res.end(JSON.stringify({ success: false, message: "Không thể đổi quyền của chính chủ hệ thống." }));
      return;
    }

    const user = await getAppUser(email);
    if (!user) {
      res.writeHead(404);
      res.end(JSON.stringify({ success: false, message: "Không tìm thấy email này." }));
      return;
    }

    const now = new Date().toISOString();

    if (action === "approve") {
      const role: AppRole = body.role === "admin" ? "admin" : "restaurant";
      // Không chỉ định thì lấy đúng nhà hàng người dùng đã xin.
      const restaurantId = String(body.restaurantId || user.requestedRestaurantId || "");
      if (role === "restaurant" && !RESTAURANTS.some((r) => r.id === restaurantId)) {
        res.writeHead(400);
        res.end(JSON.stringify({ success: false, message: "Phải chọn nhà hàng hợp lệ khi duyệt." }));
        return;
      }
      user.role = role;
      user.restaurantId = role === "admin" ? undefined : restaurantId;
      user.approvedBy = who.email;
      user.approvedAt = now;
    } else if (action === "reject" || action === "revoke") {
      user.role = "pending";
      user.restaurantId = undefined;
      user.approvedBy = who.email;
      user.approvedAt = now;
    } else {
      res.writeHead(400);
      res.end(JSON.stringify({ success: false, message: "Hành động không hợp lệ." }));
      return;
    }

    const ok = await saveAppUser(user);
    res.writeHead(ok ? 200 : 500);
    res.end(
      JSON.stringify({ success: ok, message: ok ? "Đã cập nhật quyền." : "Không lưu được, thử lại.", user })
    );
    return;
  }

  res.writeHead(405);
  res.end(JSON.stringify({ success: false, message: "Method Not Allowed" }));
}
