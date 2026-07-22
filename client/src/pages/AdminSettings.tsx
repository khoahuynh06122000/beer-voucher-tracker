import { useState, useEffect } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { toast } from "sonner";
import { Beer, ArrowLeft, Settings, Link2, Bell, CheckCircle2, Save, HelpCircle } from "lucide-react";

export default function AdminSettings() {
  const { user, loading, isAuthenticated } = useAuth();
  const [, setLocation] = useLocation();
  const [webhookUrl, setWebhookUrl] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  const { data: settingData, isLoading: isLoadingSetting } =
    trpc.settings.get.useQuery({ key: "ms_teams_webhook" });

  const setSettingMutation = trpc.settings.set.useMutation();

  useEffect(() => {
    if (settingData?.value) {
      setWebhookUrl(settingData.value);
    }
  }, [settingData]);

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center space-y-3">
          <div className="p-3 rounded-2xl bg-amber-500/10 text-amber-600 inline-block animate-pulse">
            <Beer className="w-8 h-8" />
          </div>
          <p className="text-sm font-semibold text-muted-foreground">Đang tải cài đặt...</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated || user?.role !== "admin") {
    return (
      <div className="min-h-screen bg-background flex flex-col justify-center items-center p-4">
        <Card className="p-8 max-w-md w-full text-center space-y-4 rounded-xl border border-border">
          <div className="p-3 bg-destructive/10 text-destructive rounded-full w-fit mx-auto">
            <Settings className="w-6 h-6" />
          </div>
          <h2 className="text-xl font-bold text-foreground">Không Có Quyền Truy Cập</h2>
          <p className="text-xs text-muted-foreground">
            Bạn cần tài khoản quản trị viên (Admin) để thiết lập tích hợp báo cáo MS Teams.
          </p>
          <Button
            onClick={() => setLocation("/")}
            className="w-full bg-amber-600 hover:bg-amber-700 text-white font-semibold text-sm rounded-lg"
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
      await setSettingMutation.mutateAsync({
        key: "ms_teams_webhook",
        value: webhookUrl,
      });
      toast.success("Lưu URL MS Teams Webhook thành công!");
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Không thể lưu cài đặt";
      toast.error(message);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <header className="border-b border-border/80 bg-card/90 backdrop-blur sticky top-0 z-50">
        <div className="container py-3.5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
              <Beer className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-base font-bold text-foreground leading-none">Cài Đặt Quản Trị Hệ Thống</h1>
              <p className="text-xs text-muted-foreground mt-0.5">MS Teams Integration Settings</p>
            </div>
          </div>

          <Button
            onClick={() => setLocation("/")}
            variant="outline"
            size="sm"
            className="text-xs font-semibold gap-1.5 rounded-lg"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            Quay Lại Trang Chủ
          </Button>
        </div>
      </header>

      {/* Main Container */}
      <main className="container py-10 flex-1 max-w-3xl">
        <Card className="p-6 md:p-8 rounded-xl border border-border/80 bg-card shadow-sm space-y-8">
          <div className="flex items-start gap-4 pb-6 border-b border-border/60">
            <div className="p-3 rounded-xl bg-blue-500/10 text-blue-600 dark:text-blue-400 shrink-0">
              <Link2 className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-foreground">Tích Hợp MS Teams Webhook</h2>
              <p className="text-xs text-muted-foreground mt-1">
                Cấu hình webhook để tự động nhận thẻ báo cáo hiệu suất voucher mỗi ngày lúc 8:00 AM UTC.
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

            {/* Instruction Panel */}
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
                {isSaving ? "Đang lưu cài đặt..." : "Lưu Cấu Hình Webhook"}
              </Button>
            </div>
          </form>

          {/* Automation summary */}
          <div className="pt-6 border-t border-border/60 space-y-3">
            <h3 className="text-xs font-bold uppercase tracking-wider text-foreground flex items-center gap-2">
              <Bell className="w-4 h-4 text-purple-600" />
              Quy Trình Gửi Báo Cáo Tự Động
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs text-muted-foreground">
              <div className="p-3 rounded-lg bg-background border border-border/60 flex items-start gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
                <span>Tự động kích hoạt lúc <strong>8:00 AM UTC</strong> mỗi ngày.</span>
              </div>
              <div className="p-3 rounded-lg bg-background border border-border/60 flex items-start gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
                <span>Tổng hợp số liệu chính xác của ngày hôm trước.</span>
              </div>
              <div className="p-3 rounded-lg bg-background border border-border/60 flex items-start gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
                <span>Định dạng thẻ màu trực quan đẹp mắt trên MS Teams.</span>
              </div>
              <div className="p-3 rounded-lg bg-background border border-border/60 flex items-start gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
                <span>Cung cấp link truy cập nhanh về ứng dụng web.</span>
              </div>
            </div>
          </div>
        </Card>
      </main>

      {/* Footer */}
      <footer className="border-t border-border bg-card/50 py-6 text-center text-xs text-muted-foreground">
        Hệ Thống Quản Lý Voucher Bia © 2026. Tất cả quyền được bảo lưu.
      </footer>
    </div>
  );
}
