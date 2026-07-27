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
  Filter
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
      if (isMounted) {
        if (val) setWebhookUrl(val);
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

