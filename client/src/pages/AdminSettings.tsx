import { useState, useEffect } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { toast } from "sonner";
import {
  Beer,
  ArrowLeft,
  Settings,
  Link2,
  Bell,
  Save,
  Send,
  AlertTriangle,
  Copy,
  Check,
  Clock,
  BookOpen,
  FileSpreadsheet,
  Download,
  Calendar,
  Filter,
  Bot,
  Sparkles,
  MessageSquare,
  Scan,
  CheckCircle2,
  AlertCircle
} from "lucide-react";
import {
  getSetting,
  setSetting,
  getLocalDateString,
  checkUnupdatedRestaurants,
  getVouchersByDateRange,
  RestaurantStatus
} from "@/lib/firestoreService";
import { sendMSTeamsReport, sendMissingReportAlert, getMissingReportAdaptiveCard } from "@/lib/msTeamsService";
import { getTelegramSettings, saveTelegramSettings, sendTelegramMessage, registerTelegramWebhook, pollTelegramMessages } from "@/lib/telegramService";
import { runAIAuditForDate, formatTelegramAIAuditReport, AIAuditResult } from "@/lib/aiAuditAgent";

import beerFoamBg from "@/assets/beer_foam_bg.jpg";

const RESTAURANT_OPTIONS = [
  { id: "all", name: "Tất Cả Nhà Hàng" },
  { id: "lehoibia", name: "Lễ Hội Bia" },
  { id: "1901", name: "Nhà Hàng 1901" },
  { id: "beerplaza", name: "Beer Plaza" },
  { id: "maisonkayser", name: "Maison Kayser" },
];

export default function AdminSettings() {
  const { user, loading, isAuthenticated } = useAuth();
  const [, setLocation] = useLocation();
  const [webhookUrl, setWebhookUrl] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [isSendingAlert, setIsSendingAlert] = useState(false);
  const [isLoadingSetting, setIsLoadingSetting] = useState(true);
  const [copiedJson, setCopiedJson] = useState(false);

  // Telegram State
  const [telegramBotToken, setTelegramBotToken] = useState("");
  const [telegramChatId, setTelegramChatId] = useState("");
  const [isSavingTelegram, setIsSavingTelegram] = useState(false);
  const [isTestingTelegram, setIsTestingTelegram] = useState(false);

  // AI Audit Agent State
  const [isRunningAIAudit, setIsRunningAIAudit] = useState(false);
  const [aiAuditResults, setAIAuditResults] = useState<AIAuditResult[] | null>(null);
  const [isSendingTelegramReport, setIsSendingTelegramReport] = useState(false);

  // Missing status state
  const [targetCheckDate, setTargetCheckDate] = useState<string>(() => {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    return getLocalDateString(yesterday);
  });
  const [statusCheck, setStatusCheck] = useState<{
    checkDate: string;
    missing: RestaurantStatus[];
    updated: RestaurantStatus[];
    totalRestaurants: number;
  } | null>(null);
  const [isCheckingStatus, setIsCheckingStatus] = useState(false);

  // Comprehensive Export State
  const [exportStartDate, setExportStartDate] = useState<string>(() => {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    return d.toISOString().split("T")[0];
  });
  const [exportEndDate, setExportEndDate] = useState<string>(
    new Date().toISOString().split("T")[0]
  );
  const [exportRestaurant, setExportRestaurant] = useState<string>("all");
  const [isExporting, setIsExporting] = useState(false);

  useEffect(() => {
    let isMounted = true;
    async function loadData() {
      setIsLoadingSetting(true);
      const val = await getSetting("ms_teams_webhook");
      const tg = await getTelegramSettings();
      if (isMounted) {
        if (val) setWebhookUrl(val);
        setTelegramBotToken(tg.botToken);
        setTelegramChatId(tg.chatId);
        setIsLoadingSetting(false);
      }

      // Check yesterday status
      setIsCheckingStatus(true);
      try {
        const res = await checkUnupdatedRestaurants();
        if (isMounted) {
          setStatusCheck(res);
        }
      } catch (e) {
        console.error("Failed to check status:", e);
      } finally {
        if (isMounted) setIsCheckingStatus(false);
      }
    }
    loadData();
    return () => {
      isMounted = false;
    };
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0a0c10] text-white flex items-center justify-center">
        <div className="text-center space-y-3">
          <div className="p-3 rounded-2xl bg-amber-500/20 text-amber-400 inline-block animate-bounce">
            <Beer className="w-8 h-8" />
          </div>
          <p className="text-sm font-semibold text-amber-300">Đang tải cài đặt...</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated || user?.role !== "admin") {
    return (
      <div className="min-h-screen bg-[#07090e] text-white flex flex-col justify-center items-center p-4">
        <Card className="p-8 max-w-md w-full text-center space-y-4 rounded-3xl border border-amber-500/30 bg-[#0d0f17]/90 backdrop-blur-md shadow-2xl">
          <div className="p-3 bg-red-500/20 text-red-400 rounded-2xl w-fit mx-auto border border-red-500/30">
            <Settings className="w-6 h-6" />
          </div>
          <h2 className="text-xl font-extrabold text-white">Không Có Quyền Truy Cập</h2>
          <p className="text-xs text-gray-400">
            Bạn cần tài khoản quản trị viên (Admin) để thiết lập hệ thống.
          </p>
          <Button
            onClick={() => setLocation("/")}
            className="w-full bg-amber-500 hover:bg-amber-400 text-black font-extrabold text-sm rounded-xl py-5 shadow-lg shadow-amber-500/20"
          >
            Về Bảng Điều Khiển
          </Button>
        </Card>
      </div>
    );
  }

  const handleSave = async () => {
    if (!webhookUrl.trim()) {
      toast.error("Vui lòng nhập URL Webhook");
      return;
    }

    try {
      new URL(webhookUrl);
    } catch {
      toast.error("Định dạng URL không hợp lệ");
      return;
    }

    setIsSaving(true);
    try {
      await setSetting("ms_teams_webhook", webhookUrl.trim());
      toast.success("Lưu URL MS Teams Webhook thành công vào Firestore!");
    } catch (err: any) {
      toast.error(err?.message || "Không thể lưu cài đặt");
    } finally {
      setIsSaving(false);
    }
  };

  const handleSaveTelegram = async () => {
    if (!telegramBotToken.trim() || !telegramChatId.trim()) {
      toast.error("Vui lòng nhập đầy đủ Telegram Bot Token và Chat ID");
      return;
    }
    setIsSavingTelegram(true);
    try {
      await saveTelegramSettings(telegramBotToken, telegramChatId);
      const webhookRes = await registerTelegramWebhook(telegramBotToken);
      if (webhookRes.success) {
        toast.success("Lưu cấu hình & Kích hoạt Telegram Webhook thành công! Bot đã sẵn sàng nhận lệnh chat đối soát.");
      } else {
        toast.success("Lưu cấu hình Telegram thành công! (Lưu ý Webhook: " + webhookRes.message + ")");
      }
    } catch (err: any) {
      toast.error("Lỗi khi lưu Telegram: " + err.message);
    } finally {
      setIsSavingTelegram(false);
    }
  };

  const handleActivateWebhook = async () => {
    if (!telegramBotToken.trim()) {
      toast.error("Vui lòng nhập Telegram Bot Token trước!");
      return;
    }
    setIsSavingTelegram(true);
    try {
      const res = await registerTelegramWebhook(telegramBotToken);
      if (res.success) {
        toast.success("🎉 " + res.message);
      } else {
        toast.error("Lỗi Webhook: " + res.message);
      }
    } catch (err: any) {
      toast.error("Lỗi kích hoạt Webhook: " + err.message);
    } finally {
      setIsSavingTelegram(false);
    }
  };

  const handlePollTelegram = async () => {
    try {
      const res = await pollTelegramMessages();
      if (res.success) {
        if ((res.processedCount || 0) > 0) {
          toast.success(`🤖 Bot vừa xử lý và trả lời ${res.processedCount} tin nhắn mới từ Telegram!`);
        } else {
          toast.info("Bot đang tự động lắng nghe (Không có tin nhắn mới chưa xử lý).");
        }
      } else {
        toast.error("Lỗi kiểm tra tin nhắn: " + (res.message || "Lỗi không xác định"));
      }
    } catch (err: any) {
      toast.error("Lỗi kiểm tra: " + err.message);
    }
  };

  const handleTestTelegramSend = async () => {
    if (!telegramBotToken.trim() || !telegramChatId.trim()) {
      toast.error("Vui lòng nhập Bot Token và Chat ID để thử nghiệm");
      return;
    }
    setIsTestingTelegram(true);
    try {
      const msg = `<b>🤖 KHẢO SÁT THỬ NGHIỆM TELEGRAM BOT</b>\n\n🟢 Bot đã kết nối thành công với Hệ Thống Quản Lý Voucher Bia!\n⏰ Thời gian thử: ${new Date().toLocaleString("vi-VN")}\n\n<i>Sẵn sàng tự động gửi báo cáo đối soát AI 09:00 AM hàng ngày.</i>`;
      const res = await sendTelegramMessage(msg, telegramBotToken, telegramChatId);
      if (res.success) {
        toast.success("🎉 " + res.message);
      } else {
        toast.error(res.message);
      }
    } catch (err: any) {
      toast.error("Lỗi gửi thử Telegram: " + err.message);
    } finally {
      setIsTestingTelegram(false);
    }
  };

  const setDatePreset = (daysAgo: number) => {
    const d = new Date();
    d.setDate(d.getDate() - daysAgo);
    const dateStr = d.toISOString().split("T")[0];
    setTargetCheckDate(dateStr);
  };

  const handleToggleManualStatus = (restaurantId: string) => {
    if (!aiAuditResults) return;
    setAIAuditResults((prev) => {
      if (!prev) return null;
      return prev.map((item) => {
        if (item.restaurantId === restaurantId) {
          const nextStatus = item.status === "MATCH" ? "MISMATCH" : "MATCH";
          return {
            ...item,
            status: nextStatus,
            summaryNote:
              nextStatus === "MATCH"
                ? "Đã xác nhận khớp thủ công bởi Admin."
                : "Đánh dấu sai lệch bởi Admin.",
            discrepancies:
              nextStatus === "MATCH"
                ? []
                : ["⚠️ Admin đánh dấu nghi vấn cần kiểm tra lại."],
          };
        }
        return item;
      });
    });
    toast.info("Đã cập nhật trạng thái đối soát thủ công!");
  };

  const handleRunAIAudit = async () => {
    setIsRunningAIAudit(true);
    try {
      const records = await getVouchersByDateRange("all", targetCheckDate, targetCheckDate);
      if (!records || records.length === 0) {
        toast.info(`Không có dữ liệu báo cáo voucher cho ngày ${targetCheckDate}!`);
        setAIAuditResults([]);
        return;
      }
      const auditRes = await runAIAuditForDate(targetCheckDate, records);
      setAIAuditResults(auditRes);
      toast.success(`🤖 AI Gemini đã hoàn tất soi & đối soát ${records.length} báo cáo!`);
    } catch (err: any) {
      toast.error("Lỗi khi chạy AI Audit: " + err.message);
    } finally {
      setIsRunningAIAudit(false);
    }
  };

  const handleSendTelegramAIAudit = async () => {
    if (!aiAuditResults || aiAuditResults.length === 0) {
      toast.error("Vui lòng nhấn 'Chạy AI Soi Ảnh' trước khi gửi báo cáo Telegram!");
      return;
    }
    setIsSendingTelegramReport(true);
    try {
      const missingNames = statusCheck?.missing.map((m) => m.restaurantName) || [];
      const reportText = formatTelegramAIAuditReport(targetCheckDate, aiAuditResults, missingNames);
      const res = await sendTelegramMessage(reportText, telegramBotToken, telegramChatId);
      if (res.success) {
        toast.success("📲 " + res.message);
      } else {
        toast.error(res.message);
      }
    } catch (err: any) {
      toast.error("Lỗi khi gửi báo cáo Telegram: " + err.message);
    } finally {
      setIsSendingTelegramReport(false);
    }
  };

  const handleTestSend = async () => {
    if (!webhookUrl.trim()) {
      toast.error("Vui lòng nhập URL Webhook để thử nghiệm");
      return;
    }

    setIsTesting(true);
    try {
      const today = getLocalDateString();
      const testRecord = {
        restaurantName: "Lễ Hội Bia (Thử Nghiệm)",
        date: today,
        potatoCoupons: 45,
        beerCoupons: 85,
        cancelled: 3,
        postedBills: 130,
        totalIssued: 133,
        utilizationRate: 98,
        createdBy: user?.name || "Admin Test",
      };

      const result = await sendMSTeamsReport(webhookUrl.trim(), testRecord);
      if (result.success) {
        toast.success("🎉 " + result.message);
      } else {
        toast.error(result.message);
      }
    } catch (err: any) {
      toast.error("Lỗi khi gửi báo cáo thử nghiệm: " + err.message);
    } finally {
      setIsTesting(false);
    }
  };

  const handleSendMissingAlert = async () => {
    if (!webhookUrl.trim()) {
      toast.error("Vui lòng nhập và lưu Webhook URL MS Teams trước!");
      return;
    }

    setIsSendingAlert(true);
    try {
      const result = await sendMissingReportAlert(webhookUrl.trim(), targetCheckDate);
      if (result.success) {
        toast.success("🔔 " + result.message);
      } else {
        toast.error(result.message);
      }
    } catch (err: any) {
      toast.error("Lỗi gửi cảnh báo: " + err.message);
    } finally {
      setIsSendingAlert(false);
    }
  };

  const handleTrigger09amCron = async () => {
    setIsSendingAlert(true);
    try {
      const res = await fetch("/api/cron/trigger-09am", { method: "POST" });
      const text = await res.text();
      let data: any = null;
      try {
        data = text ? JSON.parse(text) : null;
      } catch {
        data = null;
      }

      if (data && data.success) {
        toast.success("⚡ " + data.message);
        const newStatus = await checkUnupdatedRestaurants(targetCheckDate);
        setStatusCheck(newStatus);
      } else if (data && data.message) {
        toast.error("Không thể kích hoạt: " + data.message);
      } else {
        const result = await sendMissingReportAlert(webhookUrl.trim(), targetCheckDate);
        if (result.success) {
          toast.success("⚡ " + result.message);
          const newStatus = await checkUnupdatedRestaurants(targetCheckDate);
          setStatusCheck(newStatus);
        } else {
          toast.error("Không thể kích hoạt: " + result.message);
        }
      }
    } catch (err: any) {
      try {
        const result = await sendMissingReportAlert(webhookUrl.trim(), targetCheckDate);
        if (result.success) {
          toast.success("⚡ " + result.message);
          const newStatus = await checkUnupdatedRestaurants(targetCheckDate);
          setStatusCheck(newStatus);
        } else {
          toast.error("Lỗi kích hoạt: " + result.message);
        }
      } catch (fallbackErr: any) {
        toast.error("Lỗi kích hoạt 9:00 AM: " + err.message);
      }
    } finally {
      setIsSendingAlert(false);
    }
  };

  const handleCopyCardSchema = () => {
    if (!statusCheck) return;
    const now = new Date();
    const timeStr = `${now.getHours().toString().padStart(2, "0")}:${now.getMinutes().toString().padStart(2, "0")}:${now.getSeconds().toString().padStart(2, "0")} ${now.getDate()}/${now.getMonth() + 1}/${now.getFullYear()}`;
    const card = getMissingReportAdaptiveCard(statusCheck, timeStr);
    navigator.clipboard.writeText(JSON.stringify(card, null, 2));
    setCopiedJson(true);
    toast.success("📋 Đã sao chép cấu trúc Thẻ Thích Nghi JSON!");
    setTimeout(() => setCopiedJson(false), 3000);
  };

  const handleExportExcel = async () => {
    setIsExporting(true);
    try {
      const data = await getVouchersByDateRange(exportRestaurant, exportStartDate, exportEndDate);
      if (!data || data.length === 0) {
        toast.error("Không tìm thấy dữ liệu báo cáo trong khoảng thời gian đã chọn!");
        setIsExporting(false);
        return;
      }

      const headers = [
        "STT",
        "Ngày",
        "Tên Nhà Hàng",
        "Phiếu Thu Về (Đăng Bill)",
        "Tổng Phát Hành",
        "Tỷ Lệ Quy Đổi (%)",
        "Coupon Hủy",
        "Voucher Bánh (Maison Kayser)",
        "Số lượng bia xuất",
        "Số lượng Khoai Tây xuất",
        "Mã Bill / POS",
        "Số Lượng Ảnh Bill",
        "Trạng Thái Ảnh Minh Chứng",
        "Người Nhập",
        "Thời Gian Cập Nhật"
      ];

      const escapeCsv = (val: any) => {
        if (val === null || val === undefined) return '""';
        const str = String(val).replace(/"/g, '""');
        return `"${str}"`;
      };

      const rows = data.map((rec, index) => {
        const imgCount = rec.billImages ? rec.billImages.length : 0;
        const hasImg = imgCount > 0 ? `Đã có ${imgCount} ảnh` : "Chưa đính kèm ảnh";
        return [
          index + 1,
          rec.date,
          rec.restaurantName,
          rec.postedBills || 0,
          rec.totalIssued || 0,
          `${rec.utilizationRate || 0}%`,
          rec.cancelled || 0,
          rec.bakeryCoupons || 0,
          rec.beerCoupons || 0,
          rec.potatoCoupons || 0,
          rec.billNumber || "",
          imgCount,
          hasImg,
          rec.createdBy || "Chưa rõ",
          rec.updatedAt ? new Date(rec.updatedAt).toLocaleString("vi-VN") : ""
        ].map(escapeCsv).join(",");
      });

      const csvContent = "\uFEFF" + [headers.map(escapeCsv).join(","), ...rows].join("\n");
      const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.setAttribute("download", `Bao_Cao_Phan_Tich_Voucher_${exportStartDate}_den_${exportEndDate}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      toast.success(`🎉 Tải về thành công ${data.length} dòng báo cáo Excel (.csv)!`);
    } catch (err: any) {
      toast.error("Lỗi khi xuất báo cáo Excel: " + err.message);
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="relative min-h-screen bg-[#07090e] text-gray-100 flex flex-col overflow-x-hidden">
      {/* Background Cinematic Beer Foam Texture */}
      <div
        className="fixed inset-0 bg-cover bg-center pointer-events-none opacity-15 mix-blend-overlay z-0"
        style={{ backgroundImage: `url(${beerFoamBg})` }}
      />

      {/* Ambient Radial Golden Glow */}
      <div className="fixed inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-amber-950/40 via-[#0a0c12]/95 to-[#06070a] pointer-events-none z-0" />

      <header className="relative z-50 border-b border-amber-500/20 bg-[#0c0e15]/90 backdrop-blur-md sticky top-0 shadow-xl">
        <div className="container py-3.5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-amber-500/20 text-amber-400 border border-amber-500/40 shadow-lg shadow-amber-500/10">
              <Beer className="w-6 h-6 fill-amber-400 text-amber-400" />
            </div>
            <div>
              <h1 className="text-base font-extrabold text-white leading-none">Cài Đặt Quản Trị Hệ Thống</h1>
              <p className="text-xs text-amber-300/80 mt-0.5 font-medium">Báo Cáo MS Teams & Xuất Dữ Liệu Excel</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button
              onClick={() => setLocation("/guide")}
              variant="outline"
              size="sm"
              className="text-xs font-bold gap-1.5 rounded-xl border-emerald-500/30 text-emerald-300 bg-emerald-500/10 hover:bg-emerald-500/20"
            >
              <BookOpen className="w-3.5 h-3.5 text-emerald-400" />
              Xem Hướng Dẫn
            </Button>

            <Button
              onClick={() => setLocation("/")}
              variant="outline"
              size="sm"
              className="text-xs font-bold gap-1.5 rounded-xl border-amber-500/30 bg-amber-500/10 text-amber-300 hover:bg-amber-500/20"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              Quay Lại Trang Chủ
            </Button>
          </div>
        </div>
      </header>

      <main className="relative z-10 container py-8 flex-1 max-w-3xl space-y-6">

        {/* SECTION 1: XUẤT BÁO CÁO EXCEL TOÀN DIỆN */}
        <Card className="p-6 md:p-7 rounded-3xl border border-emerald-500/30 bg-[#0d0f17]/90 backdrop-blur-md shadow-2xl space-y-5 text-white">
          <div className="flex items-start gap-4 pb-4 border-b border-white/10">
            <div className="p-3 rounded-2xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 shrink-0">
              <FileSpreadsheet className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-lg font-black text-white flex items-center gap-2">
                <span>Phân Tích & Xuất Báo Cáo Excel Toàn Diện</span>
                <span className="text-[10px] font-bold px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                  File .XLSX / .CSV
                </span>
              </h2>
              <p className="text-xs text-gray-400 mt-0.5">
                Tải toàn bộ số liệu báo cáo voucher, số lượng bill, tỷ lệ quy đổi và đối soát ảnh minh chứng về máy tính.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-[11px] font-bold text-gray-400 mb-1 flex items-center gap-1">
                <Calendar className="w-3.5 h-3.5 text-emerald-400" />
                Từ Ngày:
              </label>
              <input
                type="date"
                value={exportStartDate}
                onChange={(e) => setExportStartDate(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-black/50 border border-white/15 text-white text-xs font-semibold focus:outline-none focus:border-emerald-500"
              />
            </div>

            <div>
              <label className="block text-[11px] font-bold text-gray-400 mb-1 flex items-center gap-1">
                <Calendar className="w-3.5 h-3.5 text-emerald-400" />
                Đến Ngày:
              </label>
              <input
                type="date"
                value={exportEndDate}
                onChange={(e) => setExportEndDate(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-black/50 border border-white/15 text-white text-xs font-semibold focus:outline-none focus:border-emerald-500"
              />
            </div>

            <div>
              <label className="block text-[11px] font-bold text-gray-400 mb-1 flex items-center gap-1">
                <Filter className="w-3.5 h-3.5 text-emerald-400" />
                Nhà Hàng:
              </label>
              <select
                value={exportRestaurant}
                onChange={(e) => setExportRestaurant(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-black/50 border border-white/15 text-white text-xs font-semibold focus:outline-none focus:border-emerald-500"
              >
                {RESTAURANT_OPTIONS.map((r) => (
                  <option key={r.id} value={r.id} className="bg-slate-900 text-white">
                    {r.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="pt-1 flex justify-end">
            <Button
              type="button"
              onClick={handleExportExcel}
              disabled={isExporting}
              className="w-full sm:w-auto px-6 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-black text-xs shadow-lg shadow-emerald-600/20 flex items-center justify-center gap-2 transition-all disabled:opacity-50"
            >
              <Download className="w-4 h-4" />
              {isExporting ? "Đang xuất báo cáo..." : "Tải Báo Cáo Excel Về Máy"}
            </Button>
          </div>
        </Card>

        {/* SECTION 2: TÍCH HỢP MS TEAMS WEBHOOK */}
        <Card className="p-6 md:p-7 rounded-3xl border border-amber-500/30 bg-[#0d0f17]/90 backdrop-blur-md shadow-2xl space-y-5 text-white">
          <div className="flex items-start gap-4 pb-4 border-b border-white/10">
            <div className="p-3 rounded-2xl bg-blue-500/20 text-blue-400 border border-blue-500/30 shrink-0">
              <Link2 className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-lg font-black text-white">Tích Hợp MS Teams Webhook</h2>
              <p className="text-xs text-gray-400 mt-0.5">
                Đường dẫn webhook nhận thẻ báo cáo hiệu suất tự động hàng ngày.
              </p>
            </div>
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSave();
            }}
            className="space-y-4"
          >
            <div className="space-y-1.5">
              <label className="block text-[11px] font-bold uppercase tracking-wider text-gray-400">
                MS Teams Incoming Webhook URL
              </label>
              <input
                type="url"
                value={webhookUrl}
                onChange={(e) => setWebhookUrl(e.target.value)}
                placeholder="https://outlook.webhook.office.com/webhookb2/..."
                className="w-full px-4 py-2.5 rounded-xl bg-black/50 border border-white/15 text-white font-mono text-xs focus:outline-none focus:border-amber-500 transition-all"
                disabled={isLoadingSetting}
              />
            </div>

            <div className="flex flex-col sm:flex-row items-center justify-end gap-3 pt-1">
              <Button
                type="button"
                onClick={handleTestSend}
                disabled={isTesting || isSaving || isLoadingSetting}
                variant="outline"
                className="w-full sm:w-auto px-4 py-2 rounded-xl border-blue-500/40 text-blue-300 hover:bg-blue-500/10 font-bold text-xs transition-all flex items-center justify-center gap-2"
              >
                <Send className="w-3.5 h-3.5 text-blue-400" />
                {isTesting ? "Đang gửi..." : "Thử Gửi Mẫu"}
              </Button>

              <Button
                type="submit"
                disabled={isSaving || isTesting || isLoadingSetting}
                className="w-full sm:w-auto px-5 py-2 rounded-xl bg-amber-600 hover:bg-amber-500 text-white font-bold text-xs shadow-md transition-all flex items-center justify-center gap-2 disabled:opacity-50"
              >
                <Save className="w-3.5 h-3.5" />
                {isSaving ? "Đang lưu..." : "Lưu Cấu Hình Webhook"}
              </Button>
            </div>
          </form>
        </Card>

        {/* SECTION 2B: TÍCH HỢP TELEGRAM BOT & BÁO CÁO TỰ ĐỘNG 09:00 AM */}
        <Card className="p-6 md:p-7 rounded-3xl border border-sky-500/30 bg-[#0d0f17]/90 backdrop-blur-md shadow-2xl space-y-5 text-white">
          <div className="flex items-start gap-4 pb-4 border-b border-white/10">
            <div className="p-3 rounded-2xl bg-sky-500/20 text-sky-400 border border-sky-500/30 shrink-0">
              <MessageSquare className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-lg font-black text-white flex items-center gap-2">
                <span>Tích Hợp Telegram Bot Báo Cáo 09:00 AM</span>
                <span className="text-[10px] font-bold px-2.5 py-0.5 rounded-full bg-sky-500/20 text-sky-300 border border-sky-500/30">
                  Telegram API
                </span>
              </h2>
              <p className="text-xs text-gray-400 mt-0.5">
                Nhập Telegram Bot Token & Chat ID (Kênh / Nhóm) để nhận báo cáo đối soát AI tự động mỗi sáng lúc 09:00 AM.
              </p>
            </div>
          </div>

          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="block text-[11px] font-bold uppercase tracking-wider text-gray-400">
                  Telegram Bot Token
                </label>
                <input
                  type="text"
                  value={telegramBotToken}
                  onChange={(e) => setTelegramBotToken(e.target.value)}
                  placeholder="Ví dụ: 123456789:ABCdefGHIjklMNO..."
                  className="w-full px-4 py-2.5 rounded-xl bg-black/50 border border-white/15 text-white font-mono text-xs focus:outline-none focus:border-sky-500 transition-all"
                />
              </div>

              <div className="space-y-1.5">
                <label className="block text-[11px] font-bold uppercase tracking-wider text-gray-400">
                  Telegram Chat ID / Group ID
                </label>
                <input
                  type="text"
                  value={telegramChatId}
                  onChange={(e) => setTelegramChatId(e.target.value)}
                  placeholder="Ví dụ: -100192837465 hoặc @my_channel"
                  className="w-full px-4 py-2.5 rounded-xl bg-black/50 border border-white/15 text-white font-mono text-xs focus:outline-none focus:border-sky-500 transition-all"
                />
              </div>
            </div>

            {/* Quick Telegram Bot Creation Guide */}
            <div className="p-3.5 rounded-2xl bg-sky-950/40 border border-sky-500/20 text-xs space-y-2">
              <div className="font-bold text-sky-300 flex items-center gap-1.5">
                <span>📖 Hướng dẫn nhanh tạo Telegram Bot (Chỉ mất 2 phút):</span>
              </div>
              <ol className="list-decimal list-inside space-y-1 text-gray-300 text-[11px] leading-relaxed">
                <li>
                  <b>Tạo Bot (Lấy Token):</b> Mở Telegram, tìm <b>@BotFather</b> → Gửi lệnh <code>/newbot</code> → Đặt tên & Username → Sao chép dãy <b>API Token</b> dán vào ô Token trên.
                </li>
                <li>
                  <b>Lấy Chat ID:</b>
                  <span className="block ml-3 text-gray-400">
                    • <i>Cá nhân:</i> Tìm <b>@userinfobot</b> trên Telegram → Gửi tin nhắn bất kỳ → Copy dãy <code>Id</code>.
                    <br />
                    • <i>Nhóm Telegram:</i> Thêm Bot của bạn vào Nhóm → Thêm <b>@raw_data_bot</b> vào nhóm để lấy <code>chat.id</code> (ví dụ: <code>-100192837465</code>).
                  </span>
                </li>
                <li className="text-amber-300 font-bold pt-1">
                  <b>Khắc phục lỗi "chat not found":</b> Bắt buộc phải mở khung chat với Bot vừa tạo trên Telegram và bấm nút <code className="bg-amber-500/20 px-1 py-0.5 rounded text-amber-200">/start</code> (Bắt đầu) trước 1 lần!
                </li>
                <li className="text-emerald-300 font-bold pt-1">
                  <b>💬 Nhắn tin trực tiếp với Bot:</b> Nhắn cho Bot bất kỳ câu lệnh nào như <i>"đối soát ngày 2026-07-26"</i>, <i>"đối soát 26/07"</i>, <i>"đối soát hôm qua"</i> hoặc <i>"đối soát hôm nay"</i>. Bot sẽ tự động trả kết quả đối soát về khung chat cho bạn!
                </li>
              </ol>
            </div>

            <div className="flex flex-col sm:flex-row items-center justify-end gap-3 pt-1">
              <Button
                type="button"
                onClick={handleActivateWebhook}
                disabled={isSavingTelegram}
                variant="outline"
                className="w-full sm:w-auto px-4 py-2 rounded-xl border-purple-500/50 bg-purple-950/30 text-purple-300 hover:bg-purple-900/50 font-bold text-xs transition-all flex items-center justify-center gap-2"
              >
                <Bot className="w-3.5 h-3.5 text-purple-400" />
                ⚡ Kích Hoạt Lắng Nghe
              </Button>

              <Button
                type="button"
                onClick={handlePollTelegram}
                variant="outline"
                className="w-full sm:w-auto px-4 py-2 rounded-xl border-emerald-500/50 bg-emerald-950/30 text-emerald-300 hover:bg-emerald-900/50 font-bold text-xs transition-all flex items-center justify-center gap-2"
              >
                <Scan className="w-3.5 h-3.5 text-emerald-400" />
                🔍 Quét Tin Nhắn Ngay
              </Button>

              <Button
                type="button"
                onClick={handleTestTelegramSend}
                disabled={isTestingTelegram || isSavingTelegram}
                variant="outline"
                className="w-full sm:w-auto px-4 py-2 rounded-xl border-sky-500/40 text-sky-300 hover:bg-sky-500/10 font-bold text-xs transition-all flex items-center justify-center gap-2"
              >
                <Send className="w-3.5 h-3.5 text-sky-400" />
                {isTestingTelegram ? "Đang gửi..." : "Gửi Thử Telegram"}
              </Button>

              <Button
                type="button"
                onClick={handleSaveTelegram}
                disabled={isSavingTelegram || isTestingTelegram}
                className="w-full sm:w-auto px-5 py-2 rounded-xl bg-sky-600 hover:bg-sky-500 text-white font-bold text-xs shadow-md transition-all flex items-center justify-center gap-2 disabled:opacity-50"
              >
                <Save className="w-3.5 h-3.5" />
                {isSavingTelegram ? "Đang lưu..." : "Lưu Cấu Hình Telegram"}
              </Button>
            </div>
          </div>
        </Card>

        {/* SECTION 2C: AI AUDIT AGENT — SO SÁNH ẢNH BIÊN BẢN VỚI SỐ LIỆU BP NHẬP */}
        <Card className="p-6 md:p-7 rounded-3xl border border-purple-500/30 bg-[#0d0f17]/90 backdrop-blur-md shadow-2xl space-y-5 text-white">
          <div className="flex items-start justify-between pb-4 border-b border-white/10">
            <div className="flex items-start gap-4">
              <div className="p-3 rounded-2xl bg-purple-500/20 text-purple-400 border border-purple-500/30 shrink-0">
                <Bot className="w-6 h-6" />
              </div>
              <div>
                <h2 className="text-lg font-black text-white flex items-center gap-2">
                  <span>AI Audit Agent — So Sánh Ảnh với Data Nhập</span>
                  <span className="text-[10px] font-bold px-2.5 py-0.5 rounded-full bg-purple-500/20 text-purple-300 border border-purple-500/30 flex items-center gap-1">
                    <Sparkles className="w-3 h-3 text-purple-400" /> Gemini Vision
                  </span>
                </h2>
                <p className="text-xs text-gray-400 mt-0.5">
                  AI đọc chữ viết tay/chữ in trên Biên bản & Bill để đối soát tự động với số liệu bộ phận khai báo.
                </p>
              </div>
            </div>
          </div>

          <div className="space-y-4">
            {/* Date selection bar & Quick presets */}
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 p-4 rounded-2xl bg-purple-950/20 border border-purple-500/20">
              <div className="flex flex-wrap items-center gap-2">
                <Calendar className="w-4 h-4 text-purple-400 shrink-0" />
                <span className="text-xs font-bold text-purple-200 shrink-0">Ngày Chọn Đối Soát:</span>
                <input
                  type="date"
                  value={targetCheckDate}
                  onChange={(e) => setTargetCheckDate(e.target.value)}
                  className="px-3 py-1.5 rounded-xl bg-black/60 border border-purple-500/40 text-purple-200 font-bold text-xs focus:outline-none focus:border-purple-400 cursor-pointer"
                />

                {/* Quick Date Presets */}
                <div className="flex items-center gap-1 ml-1">
                  <button
                    type="button"
                    onClick={() => setDatePreset(0)}
                    className="px-2.5 py-1 rounded-lg bg-purple-900/40 hover:bg-purple-800/60 border border-purple-500/30 text-purple-300 font-medium text-[11px] transition-all"
                  >
                    Hôm nay
                  </button>
                  <button
                    type="button"
                    onClick={() => setDatePreset(1)}
                    className="px-2.5 py-1 rounded-lg bg-purple-900/40 hover:bg-purple-800/60 border border-purple-500/30 text-purple-300 font-medium text-[11px] transition-all"
                  >
                    Hôm qua
                  </button>
                  <button
                    type="button"
                    onClick={() => setDatePreset(2)}
                    className="px-2.5 py-1 rounded-lg bg-purple-900/40 hover:bg-purple-800/60 border border-purple-500/30 text-purple-300 font-medium text-[11px] transition-all"
                  >
                    2 ngày trước
                  </button>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  onClick={handleRunAIAudit}
                  disabled={isRunningAIAudit}
                  className="px-4 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-extrabold text-xs shadow-lg shadow-purple-600/30 flex items-center gap-2 transition-all disabled:opacity-50"
                >
                  <Scan className="w-4 h-4" />
                  {isRunningAIAudit ? "AI Đang Soi Ảnh..." : "🔍 Chạy Đối Soát AI Tại Chỗ"}
                </Button>

                {aiAuditResults && (
                  <Button
                    type="button"
                    onClick={handleSendTelegramAIAudit}
                    disabled={isSendingTelegramReport}
                    className="px-4 py-2 rounded-xl bg-sky-600 hover:bg-sky-500 text-white font-extrabold text-xs shadow-lg shadow-sky-600/30 flex items-center gap-2 transition-all disabled:opacity-50"
                  >
                    <Send className="w-4 h-4" />
                    {isSendingTelegramReport ? "Đang gửi..." : "📲 Báo Cáo Telegram"}
                  </Button>
                )}
              </div>
            </div>

            {/* AI Audit Findings Display */}
            {aiAuditResults && (
              <div className="space-y-3 pt-2">
                <div className="flex items-center justify-between text-xs font-bold px-1">
                  <span className="text-purple-300">Kết quả đối soát AI Gemini Vision ({targetCheckDate}):</span>
                  <span className="text-gray-400">Tổng số: {aiAuditResults.length} nhà hàng</span>
                </div>

                {aiAuditResults.length === 0 ? (
                  <div className="p-4 rounded-xl bg-black/40 border border-white/10 text-center text-xs text-gray-400">
                    Chưa tìm thấy báo cáo voucher nào cho ngày đã chọn.
                  </div>
                ) : (
                  <div className="space-y-3">
                    {aiAuditResults.map((item) => (
                      <div
                        key={item.restaurantId}
                        className={`p-4 rounded-2xl border transition-all ${
                          item.status === "MATCH"
                            ? "bg-emerald-950/20 border-emerald-500/30"
                            : item.status === "MISMATCH"
                            ? "bg-red-950/30 border-red-500/40"
                            : "bg-amber-950/20 border-amber-500/30"
                        }`}
                      >
                        <div className="flex items-center justify-between border-b border-white/10 pb-2.5 mb-2.5">
                          <div className="flex items-center gap-2">
                            {item.status === "MATCH" ? (
                              <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                            ) : item.status === "MISMATCH" ? (
                              <AlertCircle className="w-5 h-5 text-red-400 animate-pulse" />
                            ) : (
                              <AlertTriangle className="w-5 h-5 text-amber-400" />
                            )}
                            <span className="font-extrabold text-sm text-white">{item.restaurantName}</span>
                          </div>

                          <div className="flex items-center gap-2">
                            <span
                              className={`text-[10px] font-black px-2.5 py-1 rounded-lg border ${
                                item.status === "MATCH"
                                  ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/30"
                                  : item.status === "MISMATCH"
                                  ? "bg-red-500/20 text-red-300 border-red-500/30"
                                  : "bg-amber-500/20 text-amber-300 border-amber-500/30"
                              }`}
                            >
                              {item.status === "MATCH"
                                ? "🟢 KHỚP 100%"
                                : item.status === "MISMATCH"
                                ? "🚨 PHÁT HIỆN SAI LỆCH"
                                : "⚠️ THIẾU ẢNH MINH CHỨNG"}
                            </span>

                            <button
                              type="button"
                              onClick={() => handleToggleManualStatus(item.restaurantId)}
                              title="Chuyển đổi trạng thái Khớp / Sai Lệch thủ công"
                              className="px-2.5 py-1 rounded-lg bg-white/10 hover:bg-white/20 border border-white/20 text-white text-[10px] font-bold transition-all"
                            >
                              🔄 Đổi Trạng Thái
                            </button>
                          </div>
                        </div>

                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs mb-2">
                          <div className="p-2 rounded-xl bg-black/40 border border-white/5">
                            <span className="text-[10px] text-gray-400 block font-medium">Phiếu Thu Về (BP)</span>
                            <span className="font-black text-amber-300">{item.dataEntered.postedBills}</span>
                          </div>

                          <div className="p-2 rounded-xl bg-black/40 border border-white/5">
                            <span className="text-[10px] text-gray-400 block font-medium">AI Đọc Trên Ảnh</span>
                            <span className="font-black text-purple-300">
                              {item.aiExtracted.postedBills !== undefined && item.aiExtracted.postedBills !== null
                                ? item.aiExtracted.postedBills
                                : "Chưa bóc tách"}
                            </span>
                          </div>

                          <div className="p-2 rounded-xl bg-black/40 border border-white/5">
                            <span className="text-[10px] text-gray-400 block font-medium">Tổng Phát Hành (BP)</span>
                            <span className="font-black text-amber-300">{item.dataEntered.totalIssued}</span>
                          </div>

                          <div className="p-2 rounded-xl bg-black/40 border border-white/5">
                            <span className="text-[10px] text-gray-400 block font-medium">AI Đọc Phát Hành</span>
                            <span className="font-black text-purple-300">
                              {item.aiExtracted.totalIssued !== undefined && item.aiExtracted.totalIssued !== null
                                ? item.aiExtracted.totalIssued
                                : "Chưa bóc tách"}
                            </span>
                          </div>
                        </div>

                        {item.discrepancies.length > 0 && (
                          <div className="mt-2 p-2.5 rounded-xl bg-red-500/10 border border-red-500/20 text-xs text-red-300 space-y-1">
                            {item.discrepancies.map((disc, idx) => (
                              <div key={idx} className="flex items-center gap-1.5 font-semibold">
                                <span>🚨</span> <span>{disc}</span>
                              </div>
                            ))}
                          </div>
                        )}

                        <p className="text-[11px] text-gray-400 italic mt-2">
                          📝 {item.summaryNote}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </Card>

        {/* SECTION 3: CẢNH BÁO CHƯA CẬP NHẬT SỐ LIỆU NGÀY */}
        <Card className="p-6 md:p-7 rounded-3xl border border-amber-500/30 bg-[#0d0f17]/90 backdrop-blur-md shadow-2xl space-y-5 text-white">
          <div className="flex items-start justify-between pb-4 border-b border-white/10">
            <div className="flex items-start gap-4">
              <div className="p-3 rounded-2xl bg-amber-500/20 text-amber-400 border border-amber-500/30 shrink-0">
                <AlertTriangle className="w-6 h-6" />
              </div>
              <div>
                <h2 className="text-lg font-black text-white flex flex-wrap items-center gap-2">
                  <span>Cảnh Báo Nhập Liệu & Ảnh Bill</span>
                  <span className="text-[10px] font-bold px-2.5 py-0.5 rounded-full bg-red-500/20 text-red-400 border border-red-500/30">
                    Tự động 9:00 Sáng
                  </span>
                </h2>
                <p className="text-xs text-gray-400 mt-0.5">
                  Theo dõi các nhà hàng chưa báo cáo hoặc thiếu ảnh minh chứng.
                </p>
              </div>
            </div>
          </div>

          {/* Status Live Preview */}
          <div className="p-4 rounded-2xl bg-[#08090f] border border-white/10 space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-white/5 pb-3">
              <div className="flex items-center gap-2">
                <Calendar className="w-4 h-4 text-amber-400" />
                <span className="text-xs font-bold uppercase tracking-wider text-amber-300">Chọn Ngày Kiểm Tra:</span>
                <input
                  type="date"
                  value={targetCheckDate}
                  onChange={async (e) => {
                    const newDate = e.target.value;
                    setTargetCheckDate(newDate);
                    if (newDate) {
                      setIsCheckingStatus(true);
                      try {
                        const res = await checkUnupdatedRestaurants(newDate);
                        setStatusCheck(res);
                      } catch (err) {
                        console.error("Lỗi kiểm tra ngày:", err);
                      } finally {
                        setIsCheckingStatus(false);
                      }
                    }
                  }}
                  className="px-3 py-1.5 rounded-xl bg-black/60 border border-amber-500/40 text-amber-200 font-bold text-xs focus:outline-none focus:border-amber-400 cursor-pointer"
                />
              </div>

              <Button
                onClick={async () => {
                  setIsCheckingStatus(true);
                  const res = await checkUnupdatedRestaurants(targetCheckDate);
                  setStatusCheck(res);
                  setIsCheckingStatus(false);
                  toast.success(`Đã cập nhật dữ liệu ngày ${targetCheckDate}!`);
                }}
                disabled={isCheckingStatus}
                variant="ghost"
                size="sm"
                className="text-xs text-gray-300 hover:text-white bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl h-8 px-3"
              >
                {isCheckingStatus ? "Đang quét..." : "🔄 Làm mới dữ liệu"}
              </Button>
            </div>

            {/* List breakdown */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {/* Missing list */}
              <div className="p-3.5 rounded-xl bg-red-950/30 border border-red-500/20 space-y-1.5">
                <div className="text-xs font-bold text-red-400 flex items-center justify-between">
                  <span>🔴 Chưa Cập Nhật ({statusCheck?.missing.length || 0})</span>
                  <span className="text-[10px] px-2 py-0.5 rounded bg-red-500/20 font-semibold">Cần Nhắc Nhở</span>
                </div>
                {statusCheck?.missing.length === 0 ? (
                  <p className="text-xs text-emerald-400 italic">🟢 Tất cả đã cập nhật đầy đủ!</p>
                ) : (
                  <ul className="text-xs text-gray-300 space-y-1 list-disc list-inside">
                    {statusCheck?.missing.map((m) => (
                      <li key={m.restaurantId} className="font-semibold text-red-300">
                        {m.restaurantName}: <span className="text-red-400/80 font-normal">Chưa gửi báo cáo</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              {/* Updated list */}
              <div className="p-3.5 rounded-xl bg-emerald-950/30 border border-emerald-500/20 space-y-1.5">
                <div className="text-xs font-bold text-emerald-400 flex items-center justify-between">
                  <span>🟢 Đã Cập Nhật ({statusCheck?.updated.length || 0})</span>
                  <span className="text-[10px] px-2 py-0.5 rounded bg-emerald-500/20 font-semibold">Hoàn Tất</span>
                </div>
                {statusCheck?.updated.length === 0 ? (
                  <p className="text-xs text-amber-400/80 italic">Chưa có nhà hàng nào cập nhật.</p>
                ) : (
                  <ul className="text-xs text-gray-300 space-y-1 list-disc list-inside">
                    {statusCheck?.updated.map((u) => (
                      <li key={u.restaurantId} className="font-semibold text-emerald-300">
                        {u.restaurantName}: <span className="text-emerald-400/80 font-normal">{u.postedBills} phiếu</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>

            {/* Action buttons */}
            <div className="flex flex-col sm:flex-row items-center justify-between gap-2.5 pt-1">
              <Button
                type="button"
                onClick={handleCopyCardSchema}
                variant="outline"
                className="w-full sm:w-auto px-3.5 py-2 rounded-xl border-white/20 text-gray-300 hover:bg-white/10 text-xs font-semibold flex items-center justify-center gap-1.5"
              >
                {copiedJson ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                {copiedJson ? "Đã Sao Chép JSON" : "📋 Copy Thẻ JSON"}
              </Button>

              <Button
                type="button"
                onClick={handleTrigger09amCron}
                disabled={isSendingAlert || !webhookUrl}
                className="w-full sm:w-auto px-4 py-2 rounded-xl bg-amber-600 hover:bg-amber-500 text-white font-extrabold text-xs shadow-md flex items-center justify-center gap-1.5 disabled:opacity-50"
              >
                <Clock className="w-3.5 h-3.5" />
                {isSendingAlert ? "Đang gửi..." : "⚡ Kích Hoạt Báo Cáo 9h Sáng"}
              </Button>

              <Button
                type="button"
                onClick={handleSendMissingAlert}
                disabled={isSendingAlert || !webhookUrl}
                className="w-full sm:w-auto px-4 py-2 rounded-xl bg-red-600 hover:bg-red-500 text-white font-extrabold text-xs shadow-md flex items-center justify-center gap-1.5 disabled:opacity-50"
              >
                <Bell className="w-3.5 h-3.5" />
                {isSendingAlert ? "Đang gửi..." : "🔔 Gửi Cảnh Báo Ngay"}
              </Button>
            </div>
          </div>
        </Card>

      </main>

      <footer className="border-t border-border bg-card/50 py-5 text-center text-xs text-muted-foreground">
        Hệ Thống Quản Lý Voucher Bia © 2026. Tất cả quyền được bảo lưu.
      </footer>
    </div>
  );
}

