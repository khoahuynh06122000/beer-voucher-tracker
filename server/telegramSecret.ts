/**
 * Chữ ký bí mật cho webhook Telegram.
 *
 * Telegram cho phép đăng ký webhook kèm `secret_token`; mỗi lần đẩy update nó
 * gửi lại chuỗi đó trong header `X-Telegram-Bot-Api-Secret-Token`. Nhờ vậy
 * server phân biệt được update thật của Telegram với update giả do người lạ tự
 * POST vào — điều bắt buộc vì endpoint webhook phải mở ra internet.
 *
 * Chuỗi bí mật DẪN XUẤT từ chính bot token thay vì thêm một biến môi trường
 * mới, để không phải cấu hình gì thêm: hai phía (lúc đăng ký và lúc nhận) đều
 * tính ra cùng một giá trị. Bot token đổi thì chữ ký tự đổi theo.
 */
import { createHash } from "node:crypto";

/** Cờ trong bảng settings: webhook đã được đăng ký lại kèm secret hay chưa. */
export const WEBHOOK_SECURED_KEY = "telegram_webhook_secured";

/** Telegram chỉ nhận A-Z a-z 0-9 _ - , dài 1-256 ký tự. Hex thoả mãn. */
export function webhookSecretFor(botToken: string): string {
  return createHash("sha256").update("beer-voucher-webhook:" + botToken.trim()).digest("hex");
}
