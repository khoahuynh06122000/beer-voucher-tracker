import { getSetting, checkUnupdatedRestaurants } from "./firestoreService";
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

const lastSentCache = new Map<string, number>();

export async function sendMSTeamsReport(
  webhookUrl: string,
  record: {
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
    billNumber?: string;
    billImages?: string[];
  }
): Promise<{ success: boolean; message: string }> {
  if (!webhookUrl || !webhookUrl.trim()) {
    return { success: false, message: "Chưa cấu hình URL MS Teams Webhook trong cài đặt Admin." };
  }

  // Deduplication check: Do not send duplicate report for same restaurant and date within 15 seconds
  const cacheKey = `${record.restaurantName}_${record.date}`;
  const now = Date.now();
  const lastTime = lastSentCache.get(cacheKey) || 0;
  if (now - lastTime < 15000) {
    console.log("[MS TEAMS] Duplicate report suppressed for:", cacheKey);
    return { success: true, message: "Đã gửi báo cáo & phân tích tự động lên MS Teams thành công!" };
  }
  lastSentCache.set(cacheKey, now);

  // Primary: Send via server-side proxy endpoint to bypass browser CORS & try multiple Teams schemas
  try {
    const proxyRes = await fetch("/api/send-msteams", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ webhookUrl: webhookUrl.trim(), record }),
    });

    const data = await proxyRes.json();
    if (proxyRes.ok && data.success) {
      return { success: true, message: data.message || "Đã gửi báo cáo & phân tích tự động lên MS Teams thành công!" };
    } else if (data.message) {
      // Return server-reported message directly
      return { success: false, message: data.message };
    }
  } catch (serverErr) {
    console.warn("Server proxy send attempted, fallback to direct fetch:", serverErr);
  }

  // Fallback: Client direct fetch if server endpoint is not reachable
  const isMaisonKayser =
    (record.bakeryCoupons && record.bakeryCoupons > 0) ||
    record.restaurantName.toLowerCase().includes("maison");

  const rate = record.utilizationRate || 0;
  const totalIssued = record.totalIssued || 0;
  const postedBills = record.postedBills || 0;
  const cancelled = record.cancelled || 0;
  const potato = record.potatoCoupons || 0;
  const beer = record.beerCoupons || 0;
  const bakery = record.bakeryCoupons || 0;

  const imgCount = (record.billImages && Array.isArray(record.billImages)) ? record.billImages.length : 0;
  const hasImageProof = imgCount > 0;
  const billNoText = record.billNumber ? ` (Mã bill: #${record.billNumber})` : "";

  const filledCount = Math.min(10, Math.max(0, Math.round(rate / 10)));
  const emptyCount = 10 - filledCount;
  const progressBar = "█".repeat(filledCount) + "░".repeat(emptyCount);

  let badgeText = "👍 HIỆU SUẤT KHÁ TỐT";
  let badgeColor = "Warning";
  if (rate >= 80) {
    badgeText = "🔥 HIỆU SUẤT XUẤT SẮC";
    badgeColor = "Good";
  } else if (rate < 50) {
    badgeText = "⚠️ CẦN CẢI THIỆN";
    badgeColor = "Attention";
  }

  const assessment = getExpertAssessmentText(record);

  const adaptiveCardContent = {
    $schema: "http://adaptivecards.io/schemas/adaptive-card.json",
    type: "AdaptiveCard",
    version: "1.2",
    body: [
      {
        type: "TextBlock",
        size: "ExtraLarge",
        weight: "Bolder",
        text: `📊 DASHBOARD VOUCHER — ${record.restaurantName.toUpperCase()}`,
        color: rate >= 80 ? "Good" : rate >= 50 ? "Warning" : "Attention",
        wrap: true
      },
      {
        type: "TextBlock",
        text: `📅 **Ngày:** ${record.date}  |  👤 **Người báo cáo:** ${record.createdBy || "Hệ thống"}`,
        isSubtle: true,
        wrap: true
      },
      {
        type: "Container",
        style: "emphasis",
        items: [
          {
            type: "TextBlock",
            text: `TỶ LỆ KPI: ${progressBar}  ${rate}% (${badgeText})`,
            weight: "Bolder",
            color: badgeColor,
            wrap: true
          }
        ]
      },
      {
        type: "ColumnSet",
        columns: [
          {
            type: "Column",
            width: "1",
            items: [
              { type: "TextBlock", text: "Tổng Thu Về", size: "Small", isSubtle: true },
              { type: "TextBlock", text: `${totalIssued}`, size: "Large", weight: "Bolder" }
            ]
          },
          {
            type: "Column",
            width: "1",
            items: [
              { type: "TextBlock", text: "Thu Về (Bill)", size: "Small", isSubtle: true },
              { type: "TextBlock", text: `${postedBills}`, size: "Large", weight: "Bolder", color: "Good" }
            ]
          },
          {
            type: "Column",
            width: "1",
            items: [
              { type: "TextBlock", text: "Hủy Bỏ", size: "Small", isSubtle: true },
              { type: "TextBlock", text: `${cancelled}`, size: "Large", weight: "Bolder", color: "Attention" }
            ]
          }
        ]
      },
      {
        type: "Container",
        style: hasImageProof ? "good" : "attention",
        items: [
          {
            type: "TextBlock",
            text: hasImageProof
              ? `🖼️ **ẢNH MINH CHỨNG BILL:** 📸 Đã đính kèm **${imgCount}** hình ảnh${billNoText}`
              : `🖼️ **ẢNH MINH CHỨNG BILL:** ⚠️ Chưa đính kèm hình ảnh minh chứng bill${billNoText}`,
            weight: "Bolder",
            color: hasImageProof ? "Good" : "Attention",
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
            text: "💡 ĐÁNH GIÁ & PHÂN TÍCH TỰ ĐỘNG",
            weight: "Bolder"
          },
          {
            type: "TextBlock",
            text: assessment,
            wrap: true
          }
        ]
      }
    ],
    actions: [
      {
        type: "Action.OpenUrl",
        title: "🌐 Mở Live Dashboard Báo Cáo",
        url: getPublicAppUrl()
      }
    ]
  };

  const adaptiveCardPayload = {
    type: "message",
    attachments: [
      {
        contentType: "application/vnd.microsoft.card.adaptive",
        contentUrl: null,
        content: adaptiveCardContent
      }
    ]
  };

  const messageCardPayload = {
    "@type": "MessageCard",
    "@context": "http://schema.org/extensions",
    "themeColor": rate >= 80 ? "10B981" : rate >= 50 ? "F59E0B" : "EF4444",
    "summary": `Dashboard Voucher ${record.restaurantName} - ${record.date}`,
    "sections": [
      {
        "activityTitle": `📊 DASHBOARD BÁO CÁO VOUCHER — ${record.restaurantName.toUpperCase()}`,
        "activitySubtitle": `📅 Ngày: **${record.date}**  |  👤 Người báo cáo: **${record.createdBy || "Hệ thống"}**`,
        "facts": [
          { name: "📈 Tỷ Lệ KPI:", value: `${progressBar}  **${rate}%** (${badgeText})` },
          { name: "📥 Tổng Voucher Thu Về:", value: `**${totalIssued}** phiếu *(Quy đổi: ${postedBills}, Hủy: ${cancelled})*` },
          { name: "🧾 Voucher Quy Đổi (Đăng Bill):", value: `**${postedBills}** phiếu` },
          { name: "❌ Coupon Hủy Bỏ:", value: `**${cancelled}** phiếu` },
          {
            name: "🖼️ Ảnh Minh Chứng Bill:",
            value: hasImageProof
              ? `📸 **Đã đính kèm ${imgCount} ảnh**${billNoText}`
              : `⚠️ **Chưa đính kèm ảnh minh chứng**`
          },
          ...(isMaisonKayser
            ? [{ name: "🥐 Voucher Bánh:", value: `**${bakery}** chiếc` }]
            : [
                { name: "🍟 Coupon Khoai Tây:", value: `**${potato}** phiếu (~ **${(potato * 0.1).toFixed(1)} kg** | **${(potato * 13000).toLocaleString('vi-VN')} VNĐ**)` },
                { name: "🍺 Coupon Bia:", value: `**${beer}** phiếu (~ **${(beer * 0.5).toFixed(1)} Lít** | **${(beer * 16000).toLocaleString('vi-VN')} VNĐ**)` },
                { name: "⚡ Quy Đổi Sản Lượng:", value: `🍺 **${(beer * 0.5).toFixed(1)} Lít Bia** | 🍟 **${(potato * 0.1).toFixed(1)} kg Khoai**` },
                { name: "💰 Tổng Chi Phí Voucher:", value: `💵 **${(beer * 16000 + potato * 13000).toLocaleString('vi-VN')} VNĐ**` },
              ]),
        ],
        "markdown": true
      },
      {
        "title": "💡 ĐÁNH GIÁ & PHÂN TÍCH TỰ ĐỘNG",
        "text": assessment,
        "markdown": true
      }
    ],
    "potentialAction": [
      {
        "@type": "OpenUri",
        "name": "🌐 Mở Live Dashboard Báo Cáo",
        "targets": [
          { "os": "default", "uri": getPublicAppUrl() }
        ]
      }
    ]
  };

  const url = webhookUrl.trim();
  const isPowerAutomate =
    url.includes("logic.azure.com") ||
    url.includes("powerautomate") ||
    url.includes("powerplatform") ||
    url.includes("flow.microsoft.com");

  const payloadsToTry = isPowerAutomate
    ? [adaptiveCardContent, adaptiveCardPayload]
    : [messageCardPayload, adaptiveCardContent, adaptiveCardPayload];

  for (const payload of payloadsToTry) {
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (res.ok || res.status === 200 || res.status === 202) {
        return { success: true, message: "Đã gửi báo cáo & phân tích tự động lên MS Teams thành công!" };
      }
    } catch (err: any) {
      console.warn("Direct fetch error:", err);
    }
  }

  return { success: false, message: "Không thể gửi báo cáo lên MS Teams. Vui lòng kiểm tra lại URL Webhook." };
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
  try {
    const webhookUrl = await getSetting("ms_teams_webhook");
    if (!webhookUrl) {
      console.log("No MS Teams webhook URL found in Firestore settings.");
      return { success: false, message: "Chưa cài đặt Webhook MS Teams trong Admin Settings." };
    }
    return await sendMSTeamsReport(webhookUrl, record);
  } catch (error: any) {
    console.error("Failed to send stored MS Teams report:", error);
    return { success: false, message: error.message || "Lỗi gửi webhook MS Teams" };
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
  customWebhookUrl?: string
): Promise<{ success: boolean; message: string }> {
  if (reports.length === 0) {
    return { success: false, message: "Chưa có dữ liệu vé hủy để gửi." };
  }

  let webhookUrl = customWebhookUrl;
  if (!webhookUrl) {
    webhookUrl = (await getSetting("ms_teams_webhook")) || "";
  }
  if (!webhookUrl || !webhookUrl.trim()) {
    return { success: false, message: "Chưa cấu hình Webhook MS Teams trong Cài Đặt Admin!" };
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

  const url = webhookUrl.trim();
  const isPowerAutomate =
    url.includes("logic.azure.com") ||
    url.includes("powerautomate") ||
    url.includes("powerplatform") ||
    url.includes("flow.microsoft.com");

  const payloadsToTry = isPowerAutomate
    ? [adaptiveCardContent, adaptiveCardPayload]
    : [adaptiveCardPayload, adaptiveCardContent];

  for (const payload of payloadsToTry) {
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (res.ok || res.status === 200 || res.status === 202) {
        return { success: true, message: "Đã gửi báo cáo vé hủy lên MS Teams thành công!" };
      }
    } catch (err: any) {
      console.warn("Direct fetch error:", err);
    }
  }

  // Fallback qua proxy server khi trình duyệt bị CORS chặn
  try {
    const proxyRes = await fetch("/api/send-msteams", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ webhookUrl: url, customPayload: adaptiveCardContent }),
    });
    const proxyData = await proxyRes.json();
    if (proxyRes.ok && proxyData.success) {
      return { success: true, message: "Đã gửi báo cáo vé hủy lên MS Teams qua Server Proxy!" };
    }
    if (proxyData?.message) return { success: false, message: proxyData.message };
  } catch (err: any) {
    console.error("Proxy error:", err);
  }

  return { success: false, message: "Không gửi được lên MS Teams. Kiểm tra lại Webhook URL." };
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
export async function sendMissingReportAlert(
  customWebhookUrl?: string,
  checkDate?: string
): Promise<{ success: boolean; message: string; data?: any }> {
  let webhookUrl = customWebhookUrl;
  if (!webhookUrl) {
    webhookUrl = (await getSetting("ms_teams_webhook")) || "";
  }

  if (!webhookUrl || !webhookUrl.trim()) {
    return { success: false, message: "Chưa cấu hình Webhook URL MS Teams trong Cài Đặt Admin!" };
  }

  const status = await checkUnupdatedRestaurants(checkDate);
  const now = new Date();
  const timeStr = `${now.getHours().toString().padStart(2, "0")}:${now.getMinutes().toString().padStart(2, "0")}:${now.getSeconds().toString().padStart(2, "0")} ${now.getDate()}/${now.getMonth() + 1}/${now.getFullYear()}`;

  const adaptiveCardContent = getMissingReportAdaptiveCard(status, timeStr);

  const adaptiveCardPayload = {
    type: "message",
    attachments: [
      {
        contentType: "application/vnd.microsoft.card.adaptive",
        contentUrl: null,
        content: adaptiveCardContent
      }
    ]
  };

  const url = webhookUrl.trim();
  const isPowerAutomate =
    url.includes("logic.azure.com") ||
    url.includes("powerautomate") ||
    url.includes("powerplatform") ||
    url.includes("flow.microsoft.com");

  const payloadsToTry = isPowerAutomate
    ? [adaptiveCardContent, adaptiveCardPayload]
    : [adaptiveCardPayload, adaptiveCardContent];

  for (const payload of payloadsToTry) {
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (res.ok || res.status === 200 || res.status === 202) {
        return {
          success: true,
          message: `Đã gửi cảnh báo ${status.missing.length} nhà hàng chưa cập nhật lên MS Teams thành công!`
        };
      }
    } catch (err: any) {
      console.warn("Direct fetch error:", err);
    }
  }

  // Fallback via backend proxy route
  try {
    const proxyRes = await fetch("/api/send-msteams", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        webhookUrl: url,
        customPayload: adaptiveCardContent
      }),
    });
    const proxyData = await proxyRes.json();
    if (proxyRes.ok && proxyData.success) {
      return { success: true, message: `Đã gửi cảnh báo MS Teams thành công qua Server Proxy!` };
    }
  } catch (err: any) {
    console.error("Proxy error:", err);
  }

  return { success: false, message: "Không thể gửi cảnh báo lên MS Teams. Vui lòng kiểm tra lại Webhook URL." };
}

