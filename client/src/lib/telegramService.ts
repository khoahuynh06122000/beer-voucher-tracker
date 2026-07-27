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
      return {
        success: false,
        message: `Lỗi Telegram API: ${data.description || "Không thể gửi tin nhắn"}`,
      };
    }
  } catch (error: any) {
    return {
      success: false,
      message: `Lỗi kết nối Telegram: ${error.message || "Kiểm tra mạng hoặc Bot Token"}`,
    };
  }
}
