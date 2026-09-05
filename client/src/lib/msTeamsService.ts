import { checkUnupdatedRestaurants } from "./firestoreService";
import { authFetchJson } from "./authFetch";
import {
  formatPercent,
  formatPp,
  TREND_LABEL,
  type RestaurantCancelReport,
} from "./cancellationAnalyzer";

export function getPublicAppUrl(): string {
  if (typeof window !== "undefined" && window.location && window.location.origin) {
    return window.location.origin.replace("ais-dev-", "ais-pre-");
  }
  return "https://beer-voucher-tracker.vercel.app";
}

export function getExpertAssessmentText(record: {
  restaurantName: string;
  potatoCoupons?: number;
  beerCoupons?: number;
  bakeryCoupons?: number;
  postedBills: number;
  utilizationRate: number;
}): string {
  const rate = record.utilizationRate || 0;
  const isMaisonKayser =
    (record.bakeryCoupons && record.bakeryCoupons > 0) ||
    record.restaurantName.toLowerCase().includes("maison");

  if (isMaisonKayser) {
    const bakery = record.bakeryCoupons || record.postedBills || 0;
    return `🥐 **PHÂN TÍCH NHU CẦU & XU HƯỚNG (MAISON KAYSER):**\n\n` +
      `• **Hành vi & Nhu cầu:** Nhà hàng Maison Kayser đạt tỷ lệ quy đổi **${rate}%** với **${bakery.toLocaleString("vi-VN")}** voucher bánh đã thu hồi. Nhu cầu tiêu thụ các dòng bánh ngọt/bánh mì tại điểm bán duy trì rất ổn định.\n\n` +
      `• **Khuyến nghị vận hành:** Mức độ thu hút tốt. Khuyến nghị Bếp Bánh chủ động chuẩn bị nguyên liệu tươi trong ngày cho các ca dịch vụ tiếp theo.`;
  }

  const potato = record.potatoCoupons || 0;
  const beer = record.beerCoupons || 0;
  const beerLiters = (beer * 0.5).toFixed(1);
  const potatoKg = (potato * 0.1).toFixed(1);
  const beerCost = beer * 16000;
  const potatoCost = potato * 13000;
  const totalCost = beerCost + potatoCost;
  const totalCoupons = (beer + potato) || 1;
  const beerPct = Math.round((beer / totalCoupons) * 100);
  const potatoPct = 100 - beerPct;

  const trendStatus = rate >= 80 ? "Xuất sắc" : rate >= 50 ? "Khá tốt" : "Cần tăng cường";

  return `✨ **PHÂN TÍCH NHU CẦU & XU HƯỚNG CHUYÊN GIA:**\n\n` +
    `• **Hành vi khách hàng:** Khách có xu hướng tiêu dùng theo **Combo Bia & Khoai** kết hợp (**${beerPct}%** Bia / **${potatoPct}%** Khoai). Đây là gói ưu đãi "mồi câu" xuất sắc giúp thu hút khách dùng bữa.\n\n` +
    `• **Sản lượng & Chi phí:** Tiêu thụ thực tế đạt **${beerLiters} Lít Bia** (${beerCost.toLocaleString("vi-VN")} VNĐ) & **${potatoKg} kg Khoai** (${potatoCost.toLocaleString("vi-VN")} VNĐ). Tổng chi phí quy đổi đạt **${totalCost.toLocaleString("vi-VN")} VNĐ**.\n\n` +
    `• **Đánh giá xu hướng:** Tỷ lệ chuyển đổi **${rate}%** (${trendStatus}). Khuyến nghị Bếp & Bar chủ động chuẩn bị kho lạnh (0.5L/vé bia & 0.1kg/vé khoai) cho các khung giờ cao điểm tiếp theo.`;
}

export function generateAnalysisText(record: {
  restaurantName: string;
  date: string;
  potatoCoupons?: number;
  beerCoupons?: number;
  bakeryCoupons?: number;
  cancelled: number;
  postedBills: number;
  totalIssued: number;
  utilizationRate: number;
}): string {
  const assessment = getExpertAssessmentText(record);
  return `${assessment}\n\n**Chi Tiết Số Liệu Tổng Quan:**\n• **Tổng Voucher Thu Về:** ${record.totalIssued} phiếu (= Quy đổi: ${record.postedBills} + Hủy: ${record.cancelled})\n• **Voucher Quy Đổi:** ${record.postedBills} phiếu\n• **Hủy bỏ:** ${record.cancelled} phiếu`;
}

export async function sendStoredMSTeamsReport(record: {
  restaurantName: string;
  date: string;
  potatoCoupons?: number;
  beerCoupons?: number;
  bakeryCoupons?: number;
  cancelled: number;
  postedBills: number;
  totalIssued: number;
  utilizationRate: number;
  createdBy?: string;
}) {
  // Webhook nằm ở biến môi trường MS_TEAMS_WEBHOOK trên server; client chỉ gửi
  // dữ liệu báo cáo, không bao giờ nhìn thấy URL webhook.
  try {
    const data = await authFetchJson<{ success: boolean; message?: string }>("/api/send-msteams", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ record }),
    });
    return {
      success: Boolean(data.success),
      message: data.message || (data.success ? "Đã gửi báo cáo lên MS Teams!" : "Không gửi được."),
    };
  } catch (error: any) {
    console.error("Failed to send stored MS Teams report:", error);
    return { success: false, message: error?.message || "Lỗi gửi webhook MS Teams" };
  }
}

const CANCEL_DATE = (iso: string) => {
  const [, m, d] = iso.split("-");
  return `${d}/${m}`;
};

/** Thẻ MS Teams cho báo cáo biến động vé hủy 3 ngày. */
export function getCancellationAdaptiveCard(reports: RestaurantCancelReport[], timeStr: string) {
  const severe = reports.filter((r) => r.severity === "nghiem_trong");
  const warn = reports.filter((r) => r.severity === "canh_bao");

  const headline =
    severe.length > 0
      ? `🔴 ${severe.length} nhà hàng cần xử lý ngay, ${warn.length} nhà hàng cần theo dõi.`
      : warn.length > 0
        ? `🟠 ${warn.length} nhà hàng cần theo dõi, không có trường hợp nghiêm trọng.`
        : "🟢 Tỷ lệ hủy của tất cả nhà hàng đang ổn định.";

  const blocks = reports.map((r) => {
    const style =
      r.severity === "nghiem_trong" ? "attention" : r.severity === "canh_bao" ? "warning" : "good";

    const chuoi =
      r.days.length > 0
        ? [...r.days]
            .reverse()
            .map((d) => `${CANCEL_DATE(d.date)}: **${formatPercent(d.rate)}**`)
            .join("  →  ")
        : "chưa có dữ liệu";

    const lines = [`📉 ${chuoi}`];
    if (r.days.length >= 2) {
      lines.push(`Chênh so với trung bình 2 ngày trước: **${formatPp(r.deltaPp)}**`);
    }
    if (r.driverText) lines.push(`\n${r.driverText}`);
    if (r.checklist.length > 0) {
      lines.push(`\n**Cần ${r.restaurantName} giải trình:**`);
      lines.push(r.checklist.map((c) => `• ${c}`).join("\n"));
    }

    return {
      type: "Container",
      style,
      items: [
        {
          type: "TextBlock",
          text: `${r.restaurantName} — ${TREND_LABEL[r.trend].toUpperCase()}`,
          weight: "Bolder",
          wrap: true,
        },
        { type: "TextBlock", text: lines.join("\n\n"), wrap: true },
      ],
    };
  });

  return {
    $schema: "http://adaptivecards.io/schemas/adaptive-card.json",
    type: "AdaptiveCard",
    version: "1.2",
    body: [
      {
        type: "TextBlock",
        size: "Large",
        weight: "Bolder",
        text: "❌ BIẾN ĐỘNG VÉ HỦY — 3 NGÀY GẦN NHẤT",
        color: severe.length > 0 ? "Attention" : warn.length > 0 ? "Warning" : "Good",
        wrap: true,
      },
      {
        type: "TextBlock",
        text: `🕒 **Gửi lúc:** ${timeStr}  |  Tỷ lệ hủy = vé hủy / tổng phát hành`,
        isSubtle: true,
        wrap: true,
      },
      {
        type: "TextBlock",
        text: headline,
        weight: "Bolder",
        wrap: true,
      },
      ...blocks,
      {
        type: "TextBlock",
        text:
          "_Tỷ lệ hủy tăng có hai nguồn khác nhau: khách bỏ vé nhiều hơn thật, hoặc tổng phát hành giảm làm mẫu số co lại. Đây là dấu hiệu để yêu cầu giải trình, chưa phải kết luận._",
        isSubtle: true,
        wrap: true,
      },
    ],
    actions: [
      {
        type: "Action.OpenUrl",
        title: "🌐 Mở báo cáo đầy đủ",
        url: getPublicAppUrl(),
      },
    ],
  };
}

/** Gửi báo cáo biến động vé hủy lên MS Teams. */
export async function sendCancellationReport(
  reports: RestaurantCancelReport[],

): Promise<{ success: boolean; message: string }> {
  if (reports.length === 0) {
    return { success: false, message: "Chưa có dữ liệu vé hủy để gửi." };
  }

  const now = new Date();
  const pad = (n: number) => n.toString().padStart(2, "0");
  const timeStr = `${pad(now.getHours())}:${pad(now.getMinutes())} ${pad(now.getDate())}/${pad(
    now.getMonth() + 1
  )}/${now.getFullYear()}`;

  const adaptiveCardContent = getCancellationAdaptiveCard(reports, timeStr);
  const adaptiveCardPayload = {
    type: "message",
    attachments: [
      {
        contentType: "application/vnd.microsoft.card.adaptive",
        contentUrl: null,
        content: adaptiveCardContent,
      },
    ],
  };

  // Chỉ còn MỘT đường: qua server. Bỏ nhánh gọi thẳng webhook từ trình duyệt vì
  // muốn gọi thẳng thì client phải biết URL webhook — đúng thứ cần giấu.
  try {
    const data = await authFetchJson<{ success: boolean; message?: string }>("/api/send-msteams", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ customPayload: adaptiveCardContent }),
    });
    return {
      success: Boolean(data.success),
      message: data.message || (data.success ? "Đã gửi báo cáo vé hủy lên MS Teams!" : "Không gửi được."),
    };
  } catch (err: any) {
    return { success: false, message: err?.message || "Không gửi được lên MS Teams." };
  }
}

/**
 * Generate Adaptive Card object for missing report alert
 */
export function getMissingReportAdaptiveCard(status: {
  checkDate: string;
  missing: Array<{ restaurantId: string; restaurantName: string }>;
  updated: Array<{
    restaurantId: string;
    restaurantName: string;
    postedBills?: number;
    hasImageProof?: boolean;
    imageCount?: number;
    billNumber?: string;
  }>;
  totalRestaurants: number;
}, timeStr: string) {
  const dateParts = status.checkDate.split("-");
  const formattedCheckDate = `${dateParts[2]}/${dateParts[1]}/${dateParts[0]}`;

  const missingListText = status.missing.length > 0
    ? status.missing.map(m => `• **${m.restaurantName}**: ❌ **CHƯA** cập nhật số liệu (⚠️ Chưa có ảnh minh chứng)`).join("\n\n")
    : "🟢 Tất cả nhà hàng đã gửi báo cáo số liệu & ảnh đầy đủ!";

  const updatedListText = status.updated.length > 0
    ? status.updated.map(u => {
        const imgStatus = (u.hasImageProof || (u.imageCount && u.imageCount > 0))
          ? `📸 **Đã có ${u.imageCount || 1} ảnh minh chứng**`
          : `⚠️ **Chưa có ảnh minh chứng**`;
        const billInfo = u.billNumber ? ` (Mã bill: #${u.billNumber})` : "";
        return `• **${u.restaurantName}**: Đã nhập **${u.postedBills || 0}** phiếu${billInfo}\n  └ 🖼️ **Trạng thái ảnh:** ${imgStatus}`;
      }).join("\n\n")
    : "Chưa có nhà hàng nào cập nhật.";

  return {
    $schema: "http://adaptivecards.io/schemas/adaptive-card.json",
    type: "AdaptiveCard",
    version: "1.2",
    body: [
      {
        type: "TextBlock",
        size: "Large",
        weight: "Bolder",
        text: `⚠️ CẢNH BÁO CHƯA CẬP NHẬT BÁO CÁO — ${timeStr}`,
        color: status.missing.length > 0 ? "Attention" : "Good",
        wrap: true
      },
      {
        type: "TextBlock",
        text: `📅 **Ngày kiểm tra:** ${formattedCheckDate}  |  📊 **Tổng nhà hàng:** ${status.totalRestaurants}`,
        isSubtle: true,
        wrap: true
      },
      {
        type: "Container",
        style: status.missing.length > 0 ? "attention" : "good",
        items: [
          {
            type: "TextBlock",
            text: status.missing.length > 0
              ? `🔴 KHẨN (${status.missing.length}/${status.totalRestaurants} nhà hàng chưa gửi số liệu ngày ${formattedCheckDate}):`
              : "🟢 HOÀN THÀNH (100% nhà hàng đã cập nhật):",
            weight: "Bolder",
            color: status.missing.length > 0 ? "Attention" : "Good",
            wrap: true
          },
          {
            type: "TextBlock",
            text: missingListText,
            wrap: true
          }
        ]
      },
      {
        type: "Container",
        style: "emphasis",
        items: [
          {
            type: "TextBlock",
            text: `🟢 ĐÃ CẬP NHẬT (${status.updated.length}/${status.totalRestaurants}):`,
            weight: "Bolder",
            wrap: true
          },
          {
            type: "TextBlock",
            text: updatedListText,
            wrap: true
          }
        ]
      }
    ],
    actions: [
      {
        type: "Action.OpenUrl",
        title: "🌐 Mở Trang Nhập Báo Cáo Ngay",
        url: getPublicAppUrl()
      }
    ]
  };
}

/**
 * Send daily missing report alert to MS Teams / Power Automate
 */
/**
 * Gửi cảnh báo nhà hàng chưa cập nhật báo cáo.
 * Webhook lấy từ biến môi trường phía server, client không cầm URL.
 */
export async function sendMissingReportAlert(
  checkDate?: string
): Promise<{ success: boolean; message: string; data?: any }> {
  const status = await checkUnupdatedRestaurants(checkDate);
  const now = new Date();
  const pad = (n: number) => n.toString().padStart(2, "0");
  const timeStr = `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())} ${now.getDate()}/${now.getMonth() + 1}/${now.getFullYear()}`;

  const adaptiveCardContent = getMissingReportAdaptiveCard(status, timeStr);

  try {
    const data = await authFetchJson<{ success: boolean; message?: string }>("/api/send-msteams", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ customPayload: adaptiveCardContent }),
    });
    return {
      success: Boolean(data.success),
      message: data.success
        ? `Đã gửi cảnh báo ${status.missing.length} nhà hàng chưa cập nhật lên MS Teams!`
        : data.message || "Không gửi được.",
      data: status,
    };
  } catch (err: any) {
    return { success: false, message: err?.message || "Không gửi được cảnh báo lên MS Teams." };
  }
}
