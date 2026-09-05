/**
 * POST /api/session — đổi Firebase ID token lấy hồ sơ quyền của người dùng.
 *
 * Gọi ngay sau khi đăng nhập Google. Ba trường hợp:
 *   1. Email chưa từng vào  -> tạo bản ghi "pending", trả về danh sách nhà hàng
 *      để người dùng chọn xin quyền. CHƯA thấy dữ liệu gì.
 *   2. Email đang chờ duyệt -> trả về pending kèm nhà hàng họ đã xin.
 *   3. Email đã được duyệt  -> trả về vai trò + nhà hàng được xem.
 *
 * Body tuỳ chọn: { requestRestaurantId } — người dùng chọn nhà hàng muốn xin vào.
 * Ghi lại nguyện vọng đó để chủ hệ thống nhìn thấy khi duyệt.
 *
 * Lưu ý bảo mật: vai trò LUÔN đọc từ server, không bao giờ tin field client gửi
 * lên. Client chỉ được phép nói "tôi muốn xin vào nhà hàng X".
 */
import type { IncomingMessage, ServerResponse } from "node:http";
import { readJsonBody } from "../server/botCore.js";
import {
  applyCors,
  getAppUser,
  saveAppUser,
  verifyIdToken,
  RESTAURANTS,
  SUPER_ADMIN_EMAIL,
  type AppUser,
} from "../server/authGuard.js";

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  applyCors(req, res);
  if (req.method === "OPTIONS") {
    res.writeHead(200);
    res.end("{}");
    return;
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
  const validRequested = RESTAURANTS.some((r) => r.id === requested) ? requested : "";

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
