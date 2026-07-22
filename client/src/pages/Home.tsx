import { useState } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { VoucherEntryForm } from "@/components/VoucherEntryForm";
import { KPIDashboard } from "@/components/KPIDashboard";
import { HistoricalDataTable } from "@/components/HistoricalDataTable";
import { AnalyticsCharts } from "@/components/AnalyticsCharts";
import { startLogin } from "@/const";
import { useLocation } from "wouter";
import {
  Beer,
  LayoutDashboard,
  PlusCircle,
  BarChart3,
  History,
  Settings,
  LogOut,
  ShieldCheck,
  CheckCircle2,
  Sparkles,
  ArrowRight,
} from "lucide-react";

import { LandingCover } from "@/components/LandingCover";

export default function Home() {
  const { user, loading, isAuthenticated, logout } = useAuth();
  const [, setLocation] = useLocation();
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [activeTab, setActiveTab] = useState<"dashboard" | "entry" | "analytics" | "history">("dashboard");

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center space-y-3">
          <div className="p-3 rounded-2xl bg-amber-500/10 text-amber-600 dark:text-amber-400 inline-block animate-pulse">
            <Beer className="w-8 h-8" />
          </div>
          <p className="text-sm font-semibold text-muted-foreground">Đang tải hệ thống...</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <LandingCover />;
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Top Navigation Header */}
      <header className="border-b border-border/80 bg-card/90 backdrop-blur sticky top-0 z-50">
        <div className="container py-3.5 flex items-center justify-between">
          {/* Logo & Title */}
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
              <Beer className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-base font-bold text-foreground leading-none">Quản Lý Voucher Bia</h1>
              <span className="text-[11px] font-medium text-emerald-600 dark:text-emerald-400 flex items-center gap-1 mt-0.5">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                Đang kết nối hệ thống
              </span>
            </div>
          </div>

          {/* User & Actions */}
          <div className="flex items-center gap-3">
            <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-lg bg-secondary text-secondary-foreground text-xs font-semibold">
              <ShieldCheck className="w-4 h-4 text-amber-600 dark:text-amber-400" />
              <span>{user?.name || "Người dùng"}</span>
              {user?.role === "admin" && (
                <span className="ml-1 px-1.5 py-0.2 text-[10px] uppercase font-bold bg-amber-500/20 text-amber-700 dark:text-amber-300 rounded">
                  Admin
                </span>
              )}
            </div>

            {user?.role === "admin" && (
              <Button
                onClick={() => setLocation("/admin")}
                variant="outline"
                size="sm"
                className="text-xs font-semibold gap-1.5 rounded-lg"
              >
                <Settings className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Cài Đặt Admin</span>
              </Button>
            )}

            <Button
              onClick={() => logout()}
              variant="ghost"
              size="sm"
              className="text-xs font-semibold gap-1.5 rounded-lg text-muted-foreground hover:text-foreground"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Đăng Xuất</span>
            </Button>
          </div>
        </div>

        {/* Dashboard Navigation Tabs */}
        <div className="border-t border-border/50 bg-slate-50/50 dark:bg-slate-900/30">
          <div className="container flex items-center gap-1 overflow-x-auto py-1.5">
            <button
              onClick={() => setActiveTab("dashboard")}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition-all whitespace-nowrap ${
                activeTab === "dashboard"
                  ? "bg-amber-600 text-white shadow-sm"
                  : "text-muted-foreground hover:text-foreground hover:bg-card"
              }`}
            >
              <LayoutDashboard className="w-4 h-4" />
              Bảng Điều Khiển KPI
            </button>

            <button
              onClick={() => setActiveTab("entry")}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition-all whitespace-nowrap ${
                activeTab === "entry"
                  ? "bg-amber-600 text-white shadow-sm"
                  : "text-muted-foreground hover:text-foreground hover:bg-card"
              }`}
            >
              <PlusCircle className="w-4 h-4" />
              Nhập Số Liệu
            </button>

            <button
              onClick={() => setActiveTab("analytics")}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition-all whitespace-nowrap ${
                activeTab === "analytics"
                  ? "bg-amber-600 text-white shadow-sm"
                  : "text-muted-foreground hover:text-foreground hover:bg-card"
              }`}
            >
              <BarChart3 className="w-4 h-4" />
              Phân Tích Biểu Đồ
            </button>

            <button
              onClick={() => setActiveTab("history")}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition-all whitespace-nowrap ${
                activeTab === "history"
                  ? "bg-amber-600 text-white shadow-sm"
                  : "text-muted-foreground hover:text-foreground hover:bg-card"
              }`}
            >
              <History className="w-4 h-4" />
              Lịch Sử Dữ Liệu
            </button>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="container py-8 flex-1 space-y-8">
        {/* Tab 1: Dashboard View (Main overview: Form + KPI + Analytics + Table) */}
        {activeTab === "dashboard" && (
          <div className="space-y-8">
            <section>
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h2 className="text-2xl font-extrabold text-foreground tracking-tight">Hiệu Suất Hôm Nay</h2>
                  <p className="text-xs text-muted-foreground">Thống kê chỉ số hoạt động voucher theo thời gian thực</p>
                </div>
              </div>
              <KPIDashboard refreshTrigger={refreshTrigger} />
            </section>

            <section>
              <VoucherEntryForm onSuccess={() => setRefreshTrigger((t) => t + 1)} />
            </section>

            <section>
              <div className="mb-4">
                <h2 className="text-2xl font-extrabold text-foreground tracking-tight">Phân Tích & Biểu Đồ</h2>
                <p className="text-xs text-muted-foreground">Xu hướng phát hành và tỷ lệ quy đổi voucher</p>
              </div>
              <AnalyticsCharts />
            </section>

            <section>
              <HistoricalDataTable />
            </section>
          </div>
        )}

        {/* Tab 2: Entry Form Only */}
        {activeTab === "entry" && (
          <div className="max-w-4xl mx-auto space-y-6">
            <section>
              <VoucherEntryForm onSuccess={() => setRefreshTrigger((t) => t + 1)} />
            </section>
            <section>
              <KPIDashboard refreshTrigger={refreshTrigger} />
            </section>
          </div>
        )}

        {/* Tab 3: Analytics Only */}
        {activeTab === "analytics" && (
          <div className="space-y-6">
            <AnalyticsCharts />
          </div>
        )}

        {/* Tab 4: History Only */}
        {activeTab === "history" && (
          <div className="space-y-6">
            <HistoricalDataTable />
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-border bg-card/50 py-6 text-center text-xs text-muted-foreground">
        Hệ Thống Quản Lý Voucher Bia © 2026. Tất cả quyền được bảo lưu.
      </footer>
    </div>
  );
}
