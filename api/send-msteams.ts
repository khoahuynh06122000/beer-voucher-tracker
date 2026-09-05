/**
 * POST /api/send-msteams — Vercel Serverless Function.
 *
 * Proxy gửi báo cáo lên MS Teams Webhook (né CORS trình duyệt + thử nhiều
 * schema Adaptive Card / MessageCard / Power Automate). Nhận:
 *   { record }        -> tự dựng dashboard card từ record
 *   { customPayload } -> gửi thẳng payload tuỳ ý
 *
 * BẮT BUỘC đăng nhập. URL webhook do SERVER tự tra (biến môi trường
 * MS_TEAMS_WEBHOOK, không có thì lấy cấu hình đã lưu trong bảng settings) —
 * KHÔNG nhận từ client nữa.
 *
 * Trước đây người gọi tự truyền webhookUrl và không cần đăng nhập — nghĩa là
 * bất kỳ ai trên internet cũng bắt được server này POST dữ liệu tuỳ ý tới BẤT KỲ
 * URL nào họ muốn, và webhook của bộ phận thì lộ ra trình duyệt.
 */
import type { IncomingMessage, ServerResponse } from "node:http";
import { readJsonBody, LIVE_DASHBOARD_URL, getFirestoreSetting } from "../server/botCore.js";
import { applyCors, requireAuth } from "../server/authGuard.js";

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  applyCors(req, res);

  if (req.method === "OPTIONS") {
    res.writeHead(200);
    res.end(JSON.stringify({ ok: true }));
    return;
  }
  if (req.method !== "POST") {
    res.writeHead(405);
    res.end(JSON.stringify({ success: false, message: "Method Not Allowed" }));
    return;
  }

  const who = await requireAuth(req, res, "any");
  if (!who) return;

  // Ưu tiên biến môi trường, không có thì dùng webhook đã lưu sẵn trong bảng
  // settings — webhook Teams đang chạy không phải cấu hình lại.
  const webhookUrl = await getFirestoreSetting("ms_teams_webhook");
  if (!webhookUrl) {
    res.writeHead(500);
    res.end(JSON.stringify({ success: false, message: "Server chưa có webhook MS Teams." }));
    return;
  }

  try {
    const { record, customPayload } = await readJsonBody(req);
    if (!record && !customPayload) {
      res.writeHead(400);
      res.end(JSON.stringify({ success: false, message: "Thiếu dữ liệu báo cáo" }));
      return;
    }

    if (customPayload) {
      const url = webhookUrl.trim();
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(customPayload),
      });
      if (response.ok || response.status === 200 || response.status === 202) {
        res.writeHead(200);
        res.end(JSON.stringify({ success: true, message: "Đã gửi qua server proxy thành công" }));
      } else {
        const errText = await response.text();
        res.writeHead(500);
        res.end(JSON.stringify({ success: false, message: `Lỗi Webhook (${response.status}): ${errText}` }));
      }
      return;
    }

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
    const billNoText = record.billNumber ? ` (Mã Bill: #${record.billNumber})` : "";

    const filledCount = Math.min(10, Math.max(0, Math.round(rate / 10)));
    const emptyCount = 10 - filledCount;
    const progressBar = "█".repeat(filledCount) + "░".repeat(emptyCount);

    let performanceAssessment = "";
    let badgeText = "";
    let badgeColor = "Good";

    if (rate >= 80) {
      badgeText = "🔥 HIỆU SUẤT XUẤT SẮC";
      badgeColor = "Good";
    } else if (rate >= 50) {
      badgeText = "👍 HIỆU SUẤT KHÁ TỐT";
      badgeColor = "Warning";
    } else {
      badgeText = "⚠️ CẦN CẢI THIỆN";
      badgeColor = "Attention";
    }

    if (isMaisonKayser) {
      const bakeryVal = bakery || postedBills || 0;
      performanceAssessment = `🥐 **PHÂN TÍCH NHU CẦU & XU HƯỚNG (MAISON KAYSER):**\n\n` +
        `• **Hành vi & Nhu cầu:** Nhà hàng Maison Kayser đạt tỷ lệ quy đổi **${rate}%** với **${bakeryVal.toLocaleString("vi-VN")}** voucher bánh đã thu hồi. Nhu cầu tiêu thụ các dòng bánh ngọt/bánh mì tại điểm bán duy trì rất ổn định.\n\n` +
        `• **Khuyến nghị vận hành:** Mức độ thu hút tốt. Khuyến nghị Bếp Bánh chủ động chuẩn bị nguyên liệu tươi trong ngày cho các ca dịch vụ tiếp theo.`;
    } else {
      const beerLiters = (beer * 0.5).toFixed(1);
      const potatoKg = (potato * 0.1).toFixed(1);
      const beerCost = beer * 16000;
      const potatoCost = potato * 13000;
      const totalCost = beerCost + potatoCost;
      const totalCoupons = (beer + potato) || 1;
      const beerPct = Math.round((beer / totalCoupons) * 100);
      const potatoPct = 100 - beerPct;

      const trendStatus = rate >= 80 ? "Xuất sắc" : rate >= 50 ? "Khá tốt" : "Cần tăng cường";

      performanceAssessment = `✨ **PHÂN TÍCH NHU CẦU & XU HƯỚNG CHUYÊN GIA:**\n\n` +
        `• **Hành vi khách hàng:** Khách có xu hướng tiêu dùng theo **Combo Bia & Khoai** kết hợp (**${beerPct}%** Bia / **${potatoPct}%** Khoai). Đây là gói ưu đãi "mồi câu" xuất sắc giúp thu hút khách dùng bữa.\n\n` +
        `• **Sản lượng & Chi phí:** Tiêu thụ thực tế đạt **${beerLiters} Lít Bia** (${beerCost.toLocaleString("vi-VN")} VNĐ) & **${potatoKg} kg Khoai** (${potatoCost.toLocaleString("vi-VN")} VNĐ). Tổng chi phí quy đổi đạt **${totalCost.toLocaleString("vi-VN")} VNĐ**.\n\n` +
        `• **Đánh giá xu hướng:** Tỷ lệ chuyển đổi **${rate}%** (${trendStatus}). Khuyến nghị Bếp & Bar chủ động chuẩn bị kho lạnh (0.5L/vé bia & 0.1kg/vé khoai) cho các khung giờ cao điểm tiếp theo.`;
    }

    // Format 1: Modern Visual Dashboard Adaptive Card
    const adaptiveCardPayload = {
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
                color: rate >= 80 ? "Good" : rate >= 50 ? "Warning" : "Attention",
                wrap: true,
              },
              {
                type: "TextBlock",
                text: `📅 **Ngày:** ${record.date}  |  👤 **Người báo cáo:** ${record.createdBy || "Hệ thống"}`,
                isSubtle: true,
                spacing: "None",
              },
              {
                type: "Container",
                style: "emphasis",
                spacing: "Medium",
                items: [
                  {
                    type: "ColumnSet",
                    columns: [
                      {
                        type: "Column",
                        width: "stretch",
                        items: [
                          { type: "TextBlock", text: "TỶ LỆ QUY ĐỔI KPI", size: "Small", weight: "Bolder", isSubtle: true },
                          {
                            type: "TextBlock",
                            text: `${progressBar}  ${rate}%`,
                            size: "Medium",
                            weight: "Bolder",
                            color: rate >= 80 ? "Good" : rate >= 50 ? "Warning" : "Attention",
                          },
                        ],
                      },
                      {
                        type: "Column",
                        width: "auto",
                        items: [
                          { type: "TextBlock", text: badgeText, weight: "Bolder", color: badgeColor, size: "Small" },
                        ],
                      },
                    ],
                  },
                ],
              },
              { type: "TextBlock", text: "📈 CHI TIẾT SỐ LIỆU TỔNG QUAN", weight: "Bolder", size: "Medium", spacing: "Medium" },
              {
                type: "ColumnSet",
                columns: [
                  {
                    type: "Column",
                    width: "1",
                    items: [
                      { type: "TextBlock", text: "Tổng Thu Về", size: "Small", isSubtle: true },
                      { type: "TextBlock", text: `${totalIssued}`, size: "Large", weight: "Bolder" },
                    ],
                  },
                  {
                    type: "Column",
                    width: "1",
                    items: [
                      { type: "TextBlock", text: "Thu Về (Bill)", size: "Small", isSubtle: true },
                      { type: "TextBlock", text: `${postedBills}`, size: "Large", weight: "Bolder", color: "Good" },
                    ],
                  },
                  {
                    type: "Column",
                    width: "1",
                    items: [
                      { type: "TextBlock", text: "Hủy Bỏ", size: "Small", isSubtle: true },
                      { type: "TextBlock", text: `${cancelled}`, size: "Large", weight: "Bolder", color: "Attention" },
                    ],
                  },
                ],
              },
              {
                type: "Container",
                separator: true,
                spacing: "Medium",
                items: [
                  { type: "TextBlock", text: "📦 PHÂN LOẠI CHI TIẾT VOUCHER", weight: "Bolder", size: "Small", isSubtle: true },
                  isMaisonKayser
                    ? {
                        type: "ColumnSet",
                        columns: [
                          {
                            type: "Column",
                            width: "1",
                            items: [
                              { type: "TextBlock", text: "🥐 Voucher Bánh (Maison Kayser)", size: "Small" },
                              { type: "TextBlock", text: `**${bakery}** chiếc`, size: "Medium", weight: "Bolder" },
                            ],
                          },
                        ],
                      }
                    : {
                        type: "ColumnSet",
                        columns: [
                          {
                            type: "Column",
                            width: "1",
                            items: [
                              { type: "TextBlock", text: "🍟 Coupon Khoai Tây", size: "Small" },
                              { type: "TextBlock", text: `**${potato}** phiếu`, size: "Medium", weight: "Bolder", color: "Warning" },
                            ],
                          },
                          {
                            type: "Column",
                            width: "1",
                            items: [
                              { type: "TextBlock", text: "🍺 Coupon Bia", size: "Small" },
                              { type: "TextBlock", text: `**${beer}** phiếu`, size: "Medium", weight: "Bolder", color: "Accent" },
                            ],
                          },
                        ],
                      },
                ],
              },
              {
                type: "Container",
                style: hasImageProof ? "good" : "attention",
                spacing: "Medium",
                items: [
                  { type: "TextBlock", text: "🖼️ TÌNH TRẠNG ÁNH MINH CHỨNG BILL", weight: "Bolder", size: "Small", isSubtle: true },
                  {
                    type: "TextBlock",
                    text: hasImageProof
                      ? `📸 **ĐÃ ĐÍNH KÈM ${imgCount} ÁNH MINH CHỨNG**${billNoText}`
                      : `⚠️ **CHƯA ĐÍNH KÈM ÁNH MINH CHỨNG BILL**${billNoText}`,
                    weight: "Bolder",
                    color: hasImageProof ? "Good" : "Attention",
                    wrap: true,
                  },
                ],
              },
              {
                type: "Container",
                style: "emphasis",
                spacing: "Medium",
                items: [
                  { type: "TextBlock", text: "💡 ĐÁNH GIÁ & PHÂN TÍCH TỰ ĐỘNG", weight: "Bolder", size: "Medium" },
                  { type: "TextBlock", text: performanceAssessment, wrap: true },
                ],
              },
            ],
            actions: [
              { type: "Action.OpenUrl", title: "🌐 Mở Live Dashboard Báo Cáo", url: LIVE_DASHBOARD_URL },
            ],
          },
        },
      ],
    };

    // Format 2: Rich MessageCard with Visual Progress Bar
    const messageCardPayload = {
      "@type": "MessageCard",
      "@context": "http://schema.org/extensions",
      themeColor: rate >= 80 ? "10B981" : rate >= 50 ? "F59E0B" : "EF4444",
      summary: `Dashboard Voucher ${record.restaurantName} - ${record.date}`,
      sections: [
        {
          activityTitle: `📊 BÁO CÁO PHÂN TÍCH VOUCHER (${record.restaurantName.toUpperCase()})`,
          activitySubtitle: `📅 Ngày: ${record.date} | 👤 Người báo cáo: ${record.createdBy || "Hệ thống"}`,
          facts: [
            { name: "📈 Tỷ Lệ Quy Đổi KPI:", value: `${progressBar} **${rate}%**` },
            { name: "📥 Tổng Voucher Thu Về:", value: `**${totalIssued}** phiếu *(Quy đổi: ${postedBills}, Hủy: ${cancelled})*` },
            { name: "🧾 Voucher Quy Đổi (Đăng Bill):", value: `**${postedBills}** phiếu` },
            { name: "❌ Coupon Hủy:", value: `**${cancelled}** phiếu` },
            {
              name: "🖼️ Ảnh Minh Chứng Bill:",
              value: hasImageProof
                ? `📸 **Đã có ${imgCount} ảnh minh chứng**${billNoText}`
                : `⚠️ **Chưa có ảnh minh chứng**`,
            },
            ...(isMaisonKayser
              ? [{ name: "🥐 Voucher Bánh:", value: `**${bakery}** chiếc` }]
              : [
                  { name: "🍟 Coupon Khoai Tây:", value: `**${potato}** phiếu` },
                  { name: "🍺 Coupon Bia:", value: `**${beer}** phiếu` },
                ]),
          ],
          markdown: true,
        },
        {
          activityTitle: "💡 ĐÁNH GIÁ & PHÂN TÍCH TỰ ĐỘNG",
          text: `${badgeText}\n\n${performanceAssessment}`,
          markdown: true,
        },
      ],
      potentialAction: [
        {
          "@type": "OpenUri",
          name: "🌐 Mở Dashboard Trực Tuyến",
          targets: [{ os: "default", uri: LIVE_DASHBOARD_URL }],
        },
      ],
    };

    // Format 3: Simple Text Fallback
    const simpleTextPayload = {
      text: `📊 BÁO CÁO PHÂN TÍCH VOUCHER (${record.restaurantName.toUpperCase()})\n📅 Ngày: ${record.date}\n\n` +
        `📈 Tỷ lệ KPI: ${progressBar} ${rate}%\n` +
        `📥 Tổng Thu Về: ${totalIssued} (Quy đổi: ${postedBills}, Hủy: ${cancelled})\n` +
        (isMaisonKayser ? `🥐 Voucher Bánh: ${bakery}\n` : `🍟 Khoai Tây: ${potato} | 🍺 Bia: ${beer}\n`) +
        `\n💡 PHÂN TÍCH TỰ ĐỘNG:\n${badgeText}\n${performanceAssessment}`,
    };

    const url = webhookUrl.trim();
    const isPowerAutomate =
      url.includes("logic.azure.com") ||
      url.includes("powerautomate") ||
      url.includes("powerplatform") ||
      url.includes("flow.microsoft.com");

    const directAdaptiveCardPayload = adaptiveCardPayload.attachments[0].content;

    const payloadsToTry = isPowerAutomate
      ? [directAdaptiveCardPayload, adaptiveCardPayload, simpleTextPayload]
      : [messageCardPayload, directAdaptiveCardPayload, adaptiveCardPayload, simpleTextPayload];

    let lastError = "";
    let success = false;

    for (const payload of payloadsToTry) {
      try {
        const response = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        if (response.ok || response.status === 200 || response.status === 202) {
          success = true;
          break;
        } else {
          lastError = `HTTP ${response.status}: ${await response.text()}`;
        }
      } catch (e: any) {
        lastError = e.message || String(e);
      }
    }

    if (success) {
      res.writeHead(200);
      res.end(JSON.stringify({ success: true, message: "Đã gửi báo cáo & phân tích lên nhóm MS Teams thành công!" }));
    } else {
      res.writeHead(400);
      res.end(JSON.stringify({ success: false, message: "MS Teams Webhook phản hồi: " + lastError }));
    }
  } catch (err: any) {
    res.writeHead(500);
    res.end(JSON.stringify({ success: false, message: "Lỗi xử lý gửi MS Teams: " + (err?.message || String(err)) }));
  }
}
