import { useState, useEffect } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { toast } from "sonner";
import { Beer, ArrowLeft, Settings, Link2, Bell, CheckCircle2, Save, HelpCircle } from "lucide-react";
import { getSetting, setSetting } from "@/lib/firestoreService";

import beerFoamBg from "@/assets/beer_foam_bg.jpg";

export default function AdminSettings() {
  const { user, loading, isAuthenticated } = useAuth();
  const [, setLocation] = useLocation();
  const [webhookUrl, setWebhookUrl] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [isLoadingSetting, setIsLoadingSetting] = useState(true);

  useEffect(() => {
    let isMounted = true;
    async function loadWebhook() {
      setIsLoadingSetting(true);
      const val = await getSetting("ms_teams_webhook");
      if (isMounted) {
        if (val) setWebhookUrl(val);
        setIsLoadingSetting(false);
      }
    }
    loadWebhook();
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

            <div className="flex justify-end">
              <Button
                type="submit"
                disabled={isSaving || isLoadingSetting}
                className="px-6 py-2.5 rounded-lg bg-amber-600 hover:bg-amber-700 text-white font-semibold text-sm shadow-sm transition-all flex items-center gap-2 disabled:opacity-50"
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
      </main>

      <footer className="border-t border-border bg-card/50 py-6 text-center text-xs text-muted-foreground">
        Hệ Thống Quản Lý Voucher Bia © 2026. Tất cả quyền được bảo lưu.
      </footer>
    </div>
  );
}
