/**
 * Gửi tin / điều khiển bot Telegram — qua server, client không giữ bí mật.
 *
 * Trước đây getTelegramSettings() tải bot token về trình duyệt rồi gửi kèm mỗi
 * lần gọi, nghĩa là ai mở tab Network cũng đọc thấy token của bot. Nay token nằm
 * ở biến môi trường TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID trên Vercel và chỉ
 * server đọc được; client chỉ gửi nội dung tin nhắn.
 */
import { authFetch, authFetchJson } from "./authFetch";

export async function sendTelegramMessage(text: string): Promise<{ success: boolean; message: string }> {
  try {
    const data = await authFetchJson<{ success: boolean; message?: string }>("/api/telegram/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: text }),
    });
    return {
      success: Boolean(data.success),
      message: data.message || (data.success ? "Gửi báo cáo qua Telegram thành công!" : "Không gửi được."),
    };
  } catch (err: any) {
    return { success: false, message: err?.message || "Lỗi kết nối khi gửi Telegram." };
  }
}

/** Đăng ký webhook cho bot. Chỉ admin gọi được (server tự chặn). */
export async function registerTelegramWebhook(): Promise<{ success: boolean; message: string }> {
  try {
    const webhookUrl = window.location.origin + "/api/telegram/webhook";
    const data = await authFetchJson<{ success: boolean; message?: string }>(
      "/api/telegram/set-webhook?webhookUrl=" + encodeURIComponent(webhookUrl)
    );
    return {
      success: Boolean(data.success),
      message: data.message || (data.success ? "Đã kích hoạt Lệnh Chat Telegram!" : "Lỗi kích hoạt Bot"),
    };
  } catch (err: any) {
    return { success: false, message: err?.message || "Lỗi kết nối Server Bot." };
  }
}

/** Xem trạng thái webhook của bot (nút "Kiểm tra tin nhắn" trong AdminSettings). */
export async function pollTelegramMessages(): Promise<{
  success: boolean;
  processedCount?: number;
  message?: string;
}> {
  try {
    const res = await authFetch("/api/telegram/poll");
    const contentType = res.headers.get("content-type") || "";
    if (!res.ok || !contentType.includes("application/json")) {
      return { success: false, message: `Lỗi kết nối Server (HTTP ${res.status})` };
    }
    const data = await res.json();
    return {
      success: data.success,
      processedCount: data.processedCount || 0,
      message: data.message,
    };
  } catch (err: any) {
    return { success: false, message: err?.message || "Lỗi kết nối." };
  }
}
