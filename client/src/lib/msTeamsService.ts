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

  const isMaisonKayser =
    (record.bakeryCoupons && record.bakeryCoupons > 0) ||
    record.restaurantName.toLowerCase().includes("maison");

  const analysis = generateAnalysisText(record);

  const facts = [
    { name: "🏢 Nhà hàng:", value: record.restaurantName },
    { name: "📅 Ngày báo cáo:", value: record.date },
  ];

  if (isMaisonKayser) {
    facts.push({ name: "🥐 Voucher Bánh (Maison Kayser):", value: `${record.bakeryCoupons || 0} voucher` });
  } else {
    facts.push(
      { name: "🍟 Coupon Khoai Tây:", value: `${record.potatoCoupons || 0} coupon` },
      { name: "🍺 Coupon Bia:", value: `${record.beerCoupons || 0} coupon` }
    );
  }

  facts.push(
    { name: "❌ Coupon Hủy:", value: `${record.cancelled} coupon` },
    { name: "🧾 Đã Thu Về (Đăng Bill):", value: `${record.postedBills} coupon` },
    { name: "📋 Tổng Phát Hành:", value: `${record.totalIssued} coupon` },
    { name: "📈 Tỷ Lệ Quy Đổi KPI:", value: `**${record.utilizationRate}%**` },
    { name: "👤 Người Nhập:", value: record.createdBy || "Hệ thống" }
  );

  const payload = {
    "@type": "MessageCard",
    "@context": "http://schema.org/extensions",
    "themeColor": record.utilizationRate >= 80 ? "10B981" : record.utilizationRate >= 50 ? "F59E0B" : "EF4444",
    "summary": `Báo Cáo Voucher ${record.restaurantName} - ${record.date}`,
    "sections": [
      {
        "activityTitle": `📊 BÁO CÁO PHÂN TÍCH VOUCHER (${record.restaurantName.toUpperCase()})`,
        "activitySubtitle": `Ngày: ${record.date} | Hệ Thống Quản Lý Voucher`,
        "facts": facts,
        "markdown": true
      },
      {
        "activityTitle": "💡 ĐÁNH GIÁ & PHÂN TÍCH TỰ ĐỘNG",
        "text": analysis,
        "markdown": true
      }
    ]
  };

  try {
    const res = await fetch(webhookUrl.trim(), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    if (res.ok || res.status === 200 || res.status === 202) {
      return { success: true, message: "Đã gửi báo cáo & phân tích tự động lên MS Teams thành công!" };
    }
  } catch (err) {
    console.warn("Direct fetch CORS check, attempting fallback send...", err);
  }

  // Fallback mode for endpoints that do not supply client CORS headers
  try {
    await fetch(webhookUrl.trim(), {
      method: "POST",
      mode: "no-cors",
      headers: {
        "Content-Type": "text/plain",
      },
      body: JSON.stringify(payload),
    });
    return { success: true, message: "Đã phát lệnh gửi báo cáo đến kênh MS Teams!" };
  } catch (fallbackErr: any) {
    console.error("Fallback fetch error:", fallbackErr);
    return {
      success: false,
      message: "Lỗi kết nối gửi MS Teams Webhook: " + (fallbackErr.message || "Không xác định"),
    };
  }
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
