import { getSetting, setSetting } from "./firestoreService";

export interface TelegramSettings {
  botToken: string;
  chatId: string;
}

export async function getTelegramSettings(): Promise<TelegramSettings> {
  const botToken = (await getSetting("telegram_bot_token")) || "";
  const chatId = (await getSetting("telegram_chat_id")) || "";
  return { botToken, chatId };
}

export async function saveTelegramSettings(botToken: string, chatId: string): Promise<void> {
  await setSetting("telegram_bot_token", botToken.trim());
  await setSetting("telegram_chat_id", chatId.trim());
}

export async function sendTelegramMessage(
  text: string,
  customBotToken?: string,
  customChatId?: string
): Promise<{ success: boolean; message: string }> {
  try {
    let token = customBotToken?.trim();
    let chat = customChatId?.trim();

    if (!token || !chat) {
      const saved = await getTelegramSettings();
      token = token || saved.botToken;
      chat = chat || saved.chatId;
    }

    if (!token || !chat) {
      return {
        success: false,
        message: "Chưa cấu hình Telegram Bot Token hoặc Chat ID trong Cài Đặt Admin.",
      };
    }

    const apiUrl = `https://api.telegram.org/bot${token}/sendMessage`;

    const response = await fetch(apiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chat,
        text,
        parse_mode: "HTML",
        disable_web_page_preview: false,
      }),
    });

    const data = await response.json();

    if (response.ok && data.ok) {
      return { success: true, message: "Gửi báo cáo qua Telegram thành công!" };
    } else {
      const desc = data.description || "Không thể gửi tin nhắn";
      let userFriendlyMsg = `Lỗi Telegram API: ${desc}`;

      if (desc.includes("chat not found")) {
        userFriendlyMsg = `🔴 Lỗi 'chat not found' (Không tìm thấy trò chuyện):\n1. Mở Telegram và tìm đúng Bot của bạn.\n2. Nhấn nút /start (Bắt đầu) để cho phép Bot gửi tin nhắn cho bạn.\n3. Nhập chính xác Chat ID (Lấy từ @userinfobot trên Telegram).`;
      } else if (desc.includes("Unauthorized")) {
        userFriendlyMsg = `🔴 Lỗi 'Unauthorized': Bot Token không đúng! Vui lòng sao chép lại API Token chính xác từ @BotFather.`;
      } else if (desc.includes("bot was blocked")) {
        userFriendlyMsg = `🔴 Lỗi: Bot đã bị bạn chặn trên Telegram. Hãy mở khung chat với Bot và chọn Unblock.`;
      }

      return {
        success: false,
        message: userFriendlyMsg,
      };
    }
  } catch (error: any) {
    return {
      success: false,
      message: `Lỗi kết nối Telegram: ${error.message || "Kiểm tra mạng hoặc Bot Token"}`,
    };
  }
}

export async function registerTelegramWebhook(
  customBotToken?: string
): Promise<{ success: boolean; message: string }> {
  try {
    let token = customBotToken?.trim();
    if (!token) {
      const saved = await getTelegramSettings();
      token = saved.botToken;
    }
    if (!token) {
      return { success: false, message: "Chưa nhập Bot Token!" };
    }

    const currentOrigin = window.location.origin;
    const webhookUrl = `${currentOrigin}/api/telegram/webhook`;

    // Call server endpoint which activates server-side polling engine & deletes blocking webhooks
    const serverUrl = `/api/telegram/set-webhook?botToken=${encodeURIComponent(token)}&webhookUrl=${encodeURIComponent(webhookUrl)}`;
    const res = await fetch(serverUrl);
    if (!res.ok) {
      return { success: false, message: `Lỗi Server HTTP ${res.status}` };
    }

    const data = await res.json();
    return {
      success: data.success,
      message: data.message || (data.success ? "Đã kích hoạt Lệnh Chat Telegram thành công!" : "Lỗi kích hoạt Bot"),
    };
  } catch (err: any) {
    return { success: false, message: "Lỗi kết nối Server Bot: " + err.message };
  }
}

export async function pollTelegramMessages(): Promise<{ success: boolean; processedCount?: number; message?: string }> {
  try {
    const res = await fetch("/api/telegram/poll");
    if (!res.ok) return { success: false, message: "Lỗi kết nối Server" };
    const data = await res.json();
    return {
      success: data.success,
      processedCount: data.processedCount || 0,
      message: data.message,
    };
  } catch (err: any) {
    return { success: false, message: err.message };
  }
}
