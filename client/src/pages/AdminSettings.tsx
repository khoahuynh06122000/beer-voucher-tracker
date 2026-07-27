import { useState, useEffect } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { toast } from "sonner";
import { Beer, ArrowLeft, Settings, Link2, Bell, CheckCircle2, Save, HelpCircle, Send, AlertTriangle, Copy, Check, Clock, ShieldAlert, BookOpen } from "lucide-react";
import { getSetting, setSetting, getLocalDateString, checkUnupdatedRestaurants, RestaurantStatus } from "@/lib/firestoreService";
import { sendMSTeamsReport, sendMissingReportAlert, getMissingReportAdaptiveCard } from "@/lib/msTeamsService";

import beerFoamBg from "@/assets/beer_foam_bg.jpg";

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
  const [statusCheck, setStatusCheck] = useState<{
    checkDate: string;
    missing: RestaurantStatus[];
    updated: RestaurantStatus[];
    totalRestaurants: number;
  } | null>(null);
  const [isCheckingStatus, setIsCheckingStatus] = useState(false);

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
            Bạn cần tài khoản quản trị viên (Admin) để thiết lập tích hợp báo cáo MS Teams.
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
      const result = await sendMissingReportAlert(webhookUrl.trim(), statusCheck?.checkDate);
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
        const newStatus = await checkUnupdatedRestaurants();
        setStatusCheck(newStatus);
      } else if (data && data.message) {
        toast.error("Không thể kích hoạt: " + data.message);
      } else {
        // Client fallback using configured webhook
        const result = await sendMissingReportAlert();
        if (result.success) {
          toast.success("⚡ " + result.message);
          const newStatus = await checkUnupdatedRestaurants();
          setStatusCheck(newStatus);
        } else {
          toast.error("Không thể kích hoạt: " + result.message);
        }
      }
    } catch (err: any) {
      try {
        const result = await sendMissingReportAlert();
        if (result.success) {
          toast.success("⚡ " + result.message);
          const newStatus = await checkUnupdatedRestaurants();
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
              <p className="text-xs text-amber-300/80 mt-0.5 font-medium">MS Teams Integration Settings (Firestore)</p>
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
              Xem Hướng Dẫn / In PDF
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

      <main className="relative z-10 container py-10 flex-1 max-w-3xl">
        <Card className="p-6 md:p-8 rounded-3xl border border-amber-500/30 bg-[#0d0f17]/90 backdrop-blur-md shadow-2xl space-y-8 text-white">
          <div className="flex items-start gap-4 pb-6 border-b border-white/10">
            <div className="p-3 rounded-2xl bg-blue-500/20 text-blue-400 border border-blue-500/30 shrink-0">
              <Link2 className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-xl font-black text-white">Tích Hợp MS Teams Webhook</h2>
              <p className="text-xs text-gray-400 mt-1">
                Cấu hình webhook để tự động nhận thẻ báo cáo hiệu suất voucher mỗi ngày.
              </p>
            </div>
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSave();
            }}
            className="space-y-6"
          >
            <div className="space-y-2">
              <label className="block text-xs font-bold uppercase tracking-wider text-muted-foreground">
                MS Teams Incoming Webhook URL
              </label>
              <input
                type="url"
                value={webhookUrl}
                onChange={(e) => setWebhookUrl(e.target.value)}
                placeholder="https://outlook.webhook.office.com/webhookb2/..."
                className="w-full px-4 py-2.5 rounded-lg bg-background border border-border text-foreground font-mono text-xs focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 transition-all"
                disabled={isLoadingSetting}
              />
              <p className="text-[11px] text-muted-foreground">
                Đường dẫn kết nối bảo mật trực tiếp đến kênh thông báo MS Teams của doanh nghiệp.
              </p>
            </div>

            <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-900/50 border border-border/80 space-y-2">
              <h4 className="text-xs font-bold uppercase tracking-wider text-foreground flex items-center gap-1.5">
                <HelpCircle className="w-4 h-4 text-amber-600" />
                Hướng dẫn lấy Webhook URL trên Microsoft Teams:
              </h4>
              <ol className="text-xs text-muted-foreground space-y-1.5 list-decimal list-inside pl-1">
                <li>Mở kênh MS Teams bạn muốn nhận thông báo báo cáo.</li>
                <li>Nhấn vào biểu tượng ba chấm (...) bên cạnh tên kênh và chọn <strong>Connectors</strong> (Đầu nối).</li>
                <li>Tìm kiếm <strong>Incoming Webhook</strong> và chọn <strong>Configure</strong>.</li>
                <li>Đặt tên connector (VD: <em>Beer Voucher Bot</em>), tải logo nếu muốn và nhấn <strong>Create</strong>.</li>
                <li>Sao chép đường dẫn URL được cấp và dán vào ô trên.</li>
              </ol>
            </div>

            <div className="flex flex-col sm:flex-row items-center justify-end gap-3 pt-2">
              <Button
                type="button"
                onClick={handleTestSend}
                disabled={isTesting || isSaving || isLoadingSetting}
                variant="outline"
                className="w-full sm:w-auto px-5 py-2.5 rounded-lg border-blue-500/40 text-blue-400 hover:bg-blue-500/10 font-semibold text-sm transition-all flex items-center justify-center gap-2"
              >
                <Send className="w-4 h-4 text-blue-400" />
                {isTesting ? "Đang gửi thử..." : "Thử Gửi Báo Cáo Mẫu Qua MS Teams"}
              </Button>

              <Button
                type="submit"
                disabled={isSaving || isTesting || isLoadingSetting}
                className="w-full sm:w-auto px-6 py-2.5 rounded-lg bg-amber-600 hover:bg-amber-700 text-white font-semibold text-sm shadow-sm transition-all flex items-center justify-center gap-2 disabled:opacity-50"
              >
                <Save className="w-4 h-4" />
                {isSaving ? "Đang lưu..." : "Lưu Cấu Hình Webhook"}
              </Button>
            </div>
          </form>

          <div className="pt-6 border-t border-border/60 space-y-3">
            <h3 className="text-xs font-bold uppercase tracking-wider text-foreground flex items-center gap-2">
              <Bell className="w-4 h-4 text-purple-600" />
              Lưu Trữ Cấu Hình Báo Cáo
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs text-muted-foreground">
              <div className="p-3 rounded-lg bg-background border border-border/60 flex items-start gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
                <span>Cấu hình được đồng bộ tức thì lên <strong>Firestore Settings</strong>.</span>
              </div>
              <div className="p-3 rounded-lg bg-background border border-border/60 flex items-start gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
                <span>Hoàn toàn không cần máy chủ backend phụ thuộc.</span>
              </div>
            </div>
          </div>
        </Card>

        {/* Card Cảnh Báo Nhà Hàng Chưa Cập Nhật Số Liệu */}
        <Card className="p-6 md:p-8 rounded-3xl border border-amber-500/30 bg-[#0d0f17]/90 backdrop-blur-md shadow-2xl space-y-6 text-white mt-8">
          <div className="flex items-start justify-between pb-6 border-b border-white/10">
            <div className="flex items-start gap-4">
              <div className="p-3 rounded-2xl bg-amber-500/20 text-amber-400 border border-amber-500/30 shrink-0">
                <AlertTriangle className="w-6 h-6" />
              </div>
              <div>
                <h2 className="text-xl font-black text-white flex flex-wrap items-center gap-2">
                  <span>Cảnh Báo Chưa Cập Nhật Số Liệu Ngày</span>
                  <span className="text-[10px] font-bold px-2.5 py-0.5 rounded-full bg-red-500/20 text-red-400 border border-red-500/30">
                    Tự động 9:00 Sáng
                  </span>
                </h2>
                <p className="text-xs text-gray-400 mt-1">
                  Kiểm tra các nhà hàng chưa gửi báo cáo số lượng voucher của ngày trước đó và gửi nhắc nhở trực tiếp lên MS Teams.
                </p>
              </div>
            </div>
          </div>

          {/* Status Live Preview */}
          <div className="p-5 rounded-2xl bg-[#08090f] border border-white/10 space-y-4">
            <div className="flex items-center justify-between border-b border-white/5 pb-3">
              <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-amber-300">
                <Clock className="w-4 h-4 text-amber-400" />
                Trạng thái ngày: {statusCheck?.checkDate || "Đang quét..."}
              </div>
              <Button
                onClick={async () => {
                  setIsCheckingStatus(true);
                  const res = await checkUnupdatedRestaurants();
                  setStatusCheck(res);
                  setIsCheckingStatus(false);
                  toast.success("Đã làm mới dữ liệu kiểm tra!");
                }}
                disabled={isCheckingStatus}
                variant="ghost"
                size="sm"
                className="text-xs text-gray-400 hover:text-white h-7"
              >
                {isCheckingStatus ? "Đang quét..." : "🔄 Làm mới"}
              </Button>
            </div>

            {/* List breakdown */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Missing list */}
              <div className="p-4 rounded-xl bg-red-950/30 border border-red-500/20 space-y-2">
                <div className="text-xs font-bold text-red-400 flex items-center justify-between">
                  <span>🔴 Chưa Cập Nhật ({statusCheck?.missing.length || 0})</span>
                  <span className="text-[10px] px-2 py-0.5 rounded bg-red-500/20 font-semibold">Cần Nhắc Nhở</span>
                </div>
                {statusCheck?.missing.length === 0 ? (
                  <p className="text-xs text-emerald-400 italic">🟢 Tất cả nhà hàng đã cập nhật đầy đủ!</p>
                ) : (
                  <ul className="text-xs text-gray-300 space-y-1.5 list-disc list-inside">
                    {statusCheck?.missing.map((m) => (
                      <li key={m.restaurantId} className="font-semibold text-red-300">
                        {m.restaurantName}: <span className="text-red-400/80 font-normal">Chưa gửi báo cáo</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              {/* Updated list */}
              <div className="p-4 rounded-xl bg-emerald-950/30 border border-emerald-500/20 space-y-2">
                <div className="text-xs font-bold text-emerald-400 flex items-center justify-between">
                  <span>🟢 Đã Cập Nhật ({statusCheck?.updated.length || 0})</span>
                  <span className="text-[10px] px-2 py-0.5 rounded bg-emerald-500/20 font-semibold">Hoàn Tất</span>
                </div>
                {statusCheck?.updated.length === 0 ? (
                  <p className="text-xs text-amber-400/80 italic">Chưa có nhà hàng nào cập nhật.</p>
                ) : (
                  <ul className="text-xs text-gray-300 space-y-1.5 list-disc list-inside">
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
            <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-2">
              <Button
                type="button"
                onClick={handleCopyCardSchema}
                variant="outline"
                className="w-full sm:w-auto px-4 py-2.5 rounded-xl border-white/20 text-gray-300 hover:bg-white/10 text-xs font-semibold flex items-center justify-center gap-2"
              >
                {copiedJson ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                {copiedJson ? "Đã Sao Chép JSON Thẻ" : "📋 Copy Thẻ JSON (Power Automate)"}
              </Button>

              <Button
                type="button"
                onClick={handleTrigger09amCron}
                disabled={isSendingAlert || !webhookUrl}
                className="w-full sm:w-auto px-5 py-2.5 rounded-xl bg-amber-600 hover:bg-amber-500 text-white font-extrabold text-xs shadow-lg shadow-amber-600/20 flex items-center justify-center gap-2 disabled:opacity-50"
              >
                <Clock className="w-4 h-4" />
                {isSendingAlert ? "Đang gửi..." : "⚡ Kích Hoạt Progress Report 9h Sáng Ngay"}
              </Button>

              <Button
                type="button"
                onClick={handleSendMissingAlert}
                disabled={isSendingAlert || !webhookUrl}
                className="w-full sm:w-auto px-5 py-2.5 rounded-xl bg-red-600 hover:bg-red-500 text-white font-extrabold text-xs shadow-lg shadow-red-600/20 flex items-center justify-center gap-2 disabled:opacity-50"
              >
                <Bell className="w-4 h-4" />
                {isSendingAlert ? "Đang gửi..." : "🔔 Gửi Cảnh Báo Nhắc Nhở Ngay"}
              </Button>
            </div>
          </div>

          {/* Guide for Power Automate 9:00 AM Cron */}
          <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/20 space-y-3">
            <h4 className="text-xs font-extrabold text-amber-300 uppercase tracking-wider flex items-center gap-2">
              <Clock className="w-4 h-4 text-amber-400" />
              Cấu Hình Tự Động 9:00 Sáng Trong Power Automate
            </h4>
            <div className="text-xs text-gray-300 space-y-2 leading-relaxed">
              <p>
                Để MS Teams tự động nhận cảnh báo nhà hàng chưa cập nhật số liệu vào đúng <strong>9:00 sáng</strong>:
              </p>
              <ol className="list-decimal list-inside space-y-1.5 pl-1 text-gray-300">
                <li>
                  Trong Power Automate, tạo luồng mới chọn trigger <strong>Lịch trình (Recurrence)</strong>.
                </li>
                <li>
                  Đặt Tần suất: <strong>1 Ngày</strong>, Giờ chạy: <strong>09:00 AM</strong>.
                </li>
                <li>
                  Thêm hành động <strong>HTTP (GET)</strong> gọi đến API ứng dụng:
                  <code className="block mt-1 p-2 rounded bg-black/60 font-mono text-[11px] text-amber-300 border border-amber-500/30 select-all overflow-x-auto">
                    GET https://ais-dev-bwzcf2gu5c624hioouglz7-321266207795.asia-east1.run.app/api/cron/check-missing-reports
                  </code>
                </li>
                <li>
                  Thêm hành động <strong>Đăng thẻ trong một cuộc trò chuyện hoặc kênh</strong> (Post card in a chat or channel) chọn kênh <strong>PHỐI HỢP KẾ TOÁN - CỤM BEER</strong> và dán kết quả <code>Thẻ thích nghi</code> từ bước HTTP vào.
                </li>
              </ol>
            </div>
          </div>
        </Card>

      </main>

      <footer className="border-t border-border bg-card/50 py-6 text-center text-xs text-muted-foreground">
        Hệ Thống Quản Lý Voucher Bia © 2026. Tất cả quyền được bảo lưu.
      </footer>
    </div>
  );
}
