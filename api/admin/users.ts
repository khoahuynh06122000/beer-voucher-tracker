/**
 * Quản lý người dùng — chỉ chủ hệ thống (SUPER_ADMIN_EMAIL) gọi được.
 *
 * GET  /api/admin/users            -> danh sách mọi email đã từng đăng nhập,
 *                                     kèm nhà hàng họ xin vào và trạng thái.
 * POST /api/admin/users            -> duyệt / đổi quyền / khoá.
 *      body: { email, action: "approve"|"reject"|"revoke", restaurantId?, role? }
 *
 * "approve"  : cấp quyền xem dữ liệu một nhà hàng (hoặc quyền admin).
 * "reject"   : từ chối, giữ lại bản ghi để biết ai đã từng xin.
 * "revoke"   : thu hồi quyền của người đã duyệt, đưa về pending.
 */
import type { IncomingMessage, ServerResponse } from "node:http";
import { readJsonBody } from "../../server/botCore.js";
import {
  applyCors,
  requireAuth,
  getAppUser,
  saveAppUser,
  listAppUsers,
  RESTAURANTS,
  SUPER_ADMIN_EMAIL,
  type AppRole,
} from "../../server/authGuard.js";

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  applyCors(req, res);
  if (req.method === "OPTIONS") {
    res.writeHead(200);
    res.end("{}");
    return;
  }

  const who = await requireAuth(req, res, "super_admin");
  if (!who) return;

  if (req.method === "GET") {
    const users = await listAppUsers();
    const decorated = users
      .map((u) => ({
        ...u,
        restaurantName: RESTAURANTS.find((r) => r.id === u.restaurantId)?.name || null,
        requestedRestaurantName: RESTAURANTS.find((r) => r.id === u.requestedRestaurantId)?.name || null,
      }))
      // Người đang chờ duyệt lên đầu để không bị bỏ sót.
      .sort((a, b) => {
        const pa = a.role === "pending" ? 0 : 1;
        const pb = b.role === "pending" ? 0 : 1;
        if (pa !== pb) return pa - pb;
        return (b.lastLoginAt || "").localeCompare(a.lastLoginAt || "");
      });

    res.writeHead(200);
    res.end(JSON.stringify({ success: true, users: decorated, restaurants: RESTAURANTS, superAdmin: SUPER_ADMIN_EMAIL }));
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
      // Nếu không chỉ định thì lấy đúng nhà hàng người dùng đã xin.
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
      JSON.stringify({
        success: ok,
        message: ok ? "Đã cập nhật quyền." : "Không lưu được, thử lại.",
        user,
      })
    );
    return;
  }

  res.writeHead(405);
  res.end(JSON.stringify({ success: false, message: "Method Not Allowed" }));
}
