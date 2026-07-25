import { getSetting } from "./firestoreService";

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
  const rate = record.utilizationRate;
  const isMaisonKayser =
    (record.bakeryCoupons && record.bakeryCoupons > 0) ||
    record.restaurantName.toLowerCase().includes("maison");

  let performanceAssessment = "";
  if (rate >= 80) {
    performanceAssessment = `🔥 **Hiệu suất Xuất Sắc!** Tỷ lệ quy đổi đạt **${rate}%**, chứng tỏ mức độ thu hút cao của chương trình voucher và khả năng tư vấn tối ưu tại nhà hàng.`;
  } else if (rate >= 50) {
    performanceAssessment = `👍 **Hiệu suất Khá Tốt.** Tỷ lệ quy đổi đạt **${rate}%**, lưu lượng khách quy đổi voucher diễn ra ổn định.`;
  } else {
    performanceAssessment = `⚠️ **Cần Cải Thiện.** Tỷ lệ quy đổi hiện tại chỉ đạt **${rate}%**, khuyến nghị nhân viên tích cực giới thiệu và hướng dẫn khách hàng sử dụng voucher.`;
  }

  let details = "";
  if (isMaisonKayser) {
    details = `• **Voucher Bánh:** ${record.bakeryCoupons || 0} chiếc\n• **Voucher Hủy:** ${record.cancelled} chiếc`;
  } else {
    details = `• **Coupon Khoai Tây:** ${record.potatoCoupons || 0} phiếu\n• **Coupon Bia:** ${record.beerCoupons || 0} phiếu\n• **Coupon Hủy:** ${record.cancelled} phiếu`;
  }

  return `${performanceAssessment}\n\n**Chi Tiết Số Liệu:**\n${details}\n• **Tổng voucher đã thu hồi (đăng bill):** ${record.postedBills} phiếu\n• **Tổng phát hành:** ${record.totalIssued} phiếu`;
}

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
  }
): Promise<{ success: boolean; message: string }> {
  if (!webhookUrl || !webhookUrl.trim()) {
    return { success: false, message: "Chưa cấu hình URL MS Teams Webhook trong cài đặt Admin." };
  }

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

  const filledCount = Math.min(10, Math.max(0, Math.round(rate / 10)));
  const emptyCount = 10 - filledCount;
  const progressBar = "█".repeat(filledCount) + "░".repeat(emptyCount);

  let badgeText = "👍 HIỆU SUẤT KHÁ TỐT";
  let badgeColor = "Warning";
  let assessment = `Tỷ lệ quy đổi đạt **${rate}%**, lưu lượng khách sử dụng voucher diễn ra ổn định.`;

  if (rate >= 80) {
    badgeText = "🔥 HIỆU SUẤT XUẤT SẮC";
    badgeColor = "Good";
    assessment = `Tỷ lệ quy đổi đạt **${rate}%**, lượng khách sử dụng voucher rất cao. Quy trình tư vấn & phục vụ tại nhà hàng đạt hiệu quả tối ưu.`;
  } else if (rate < 50) {
    badgeText = "⚠️ CẦN CẢI THIỆN";
    badgeColor = "Attention";
    assessment = `Tỷ lệ quy đổi đạt **${rate}%**, chưa đạt mức tối ưu. Khuyến nghị nhân viên chủ động nhắc khách về ưu đãi voucher.`;
  }

  const payload = {
    type: "message",
    attachments: [
      {
        contentType: "application/vnd.microsoft.card.adaptive",
        contentUrl: null,
        content: {
          $schema: "http://adaptivecards.io/schemas/adaptive-card.json",
          type: "AdaptiveCard",
          version: "1.2",
          body: [
            {
              type: "TextBlock",
              size: "ExtraLarge",
              weight: "Bolder",
              text: `📊 DASHBOARD VOUCHER — ${record.restaurantName.toUpperCase()}`,
              color: rate >= 80 ? "Good" : rate >= 50 ? "Warning" : "Attention"
            },
            {
              type: "TextBlock",
              text: `📅 Ngày: ${record.date} | 👤 Người báo cáo: ${record.createdBy || "Hệ thống"}`,
              isSubtle: true
            },
            {
              type: "Container",
              style: "emphasis",
              items: [
                {
                  type: "TextBlock",
                  text: `TỶ LỆ KPI: ${progressBar}  ${rate}%  (${badgeText})`,
                  weight: "Bolder",
                  color: badgeColor
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
                    { type: "TextBlock", text: "Phát Hành", size: "Small", isSubtle: true },
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
              url: "https://ais-dev-bwzcf2gu5c624hioouglz7-321266207795.asia-east1.run.app"
            }
          ]
        }
      }
    ]
  };

  try {
    const res = await fetch(webhookUrl.trim(), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (res.ok || res.status === 200 || res.status === 202) {
      return { success: true, message: "Đã gửi báo cáo & phân tích tự động lên MS Teams thành công!" };
    }
  } catch (err: any) {
    return { success: false, message: "Không thể kết nối trực tiếp đến MS Teams: " + (err.message || String(err)) };
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
