import { useState } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import { useTheme } from "@/contexts/ThemeContext";
import { Button } from "@/components/ui/button";
import { VoucherEntryForm } from "@/components/VoucherEntryForm";
import { KPIDashboard } from "@/components/KPIDashboard";
import { HistoricalDataTable } from "@/components/HistoricalDataTable";
import { AnalyticsCharts } from "@/components/AnalyticsCharts";
import { useLocation } from "wouter";
import beerFoamBg from "@/assets/beer_foam_bg.jpg";
import { getLocalDateString } from "@/lib/firestoreService";
import {
  Beer,
  LayoutDashboard,
  PlusCircle,
  History,
  Settings,
  LogOut,
  ShieldCheck,
  Sparkles,
  BarChart3,
  Sun,
  Moon,
  BookOpen,
} from "lucide-react";

import { LandingCover } from "@/components/LandingCover";

export default function Home() {
  const { user, loading, isAuthenticated, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const [, setLocation] = useLocation();
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [selectedDate, setSelectedDate] = useState(() => getLocalDateString());

  const isAdmin = user?.role === "admin";

  const [activeTab, setActiveTab] = useState<"dashboard" | "entry" | "analytics" | "history">(
    isAdmin ? "analytics" : "dashboard"
  );

  const handleFormSuccess = (savedDate?: string) => {
    setRefreshTrigger((t) => t + 1);
    if (savedDate) {
      setSelectedDate(savedDate);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0a0c10] text-white flex items-center justify-center">
        <div className="text-center space-y-4">
          <div className="p-4 rounded-2xl bg-amber-500/20 border border-amber-500/30 text-amber-400 inline-block animate-bounce shadow-xl shadow-amber-500/20">
            <Beer className="w-10 h-10" />
          </div>
          <p className="text-sm font-semibold text-amber-300 tracking-wide uppercase">
            Đang Tải Hệ Thống Cloud Firestore...
          </p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <LandingCover />;
  }

  // Tabs navigation config for Admin vs Non-Admin
  const navTabs = isAdmin
    ? [
        { id: "analytics", label: "Phân Tích Báo Cáo Toàn Diện", icon: BarChart3 },
        { id: "dashboard", label: "Tổng Quan KPI Hôm Nay", icon: LayoutDashboard },
        { id: "history", label: "Lịch Sử Tất Cả Nhà Hàng", icon: History },
      ]
    : [
        { id: "dashboard", label: "Bảng Điều Khiển KPI", icon: LayoutDashboard },
        { id: "entry", label: "Nhập Số Liệu Mới", icon: PlusCircle },
        { id: "history", label: "Lịch Sử Dữ Liệu", icon: History },
      ];

  return (
    <div className="relative min-h-screen bg-background text-foreground flex flex-col overflow-x-hidden">
      {/* Background Subtle Beer Texture */}
      <div
        className="fixed inset-0 bg-cover bg-center pointer-events-none opacity-[0.03] dark:opacity-10 z-0"
        style={{ backgroundImage: `url(${beerFoamBg})` }}
      />

      {/* Top Glassmorphism Navigation Header */}
      <header className="relative z-50 border-b border-border/60 bg-background/95 backdrop-blur-md sticky top-0 shadow-sm">
        <div className="container py-3 flex items-center justify-between">
          {/* Logo & Title */}
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20 flex items-center justify-center">
              <Beer className="w-6 h-6 fill-amber-500/20 text-amber-600 dark:text-amber-400" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-base font-extrabold text-foreground tracking-tight leading-none">
                  Sun World Ba Na Hills
                </h1>
                <span className="px-2 py-0.5 rounded-full bg-amber-500/10 border border-amber-500/20 text-amber-700 dark:text-amber-300 text-[10px] font-bold uppercase tracking-wider">
                  Beer Voucher System
                </span>
              </div>
              <span className="text-[11px] font-medium text-muted-foreground flex items-center gap-1.5 mt-0.5">
                <span className="w-2 h-2 rounded-full bg-emerald-500" />
                <span>
                  {isAdmin ? "Hệ thống Báo cáo Quản trị Admin" : "Đã kết nối dữ liệu nhà hàng"}
                </span>
              </span>
            </div>
          </div>

          {/* User & Actions */}
          <div className="flex items-center gap-2.5">
            <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-xl bg-secondary/80 border border-border/60 text-xs font-semibold">
              <ShieldCheck className="w-4 h-4 text-amber-600 dark:text-amber-400" />
              <span>{user?.name || "Người dùng"}</span>
              {isAdmin && (
                <span className="px-2 py-0.5 text-[10px] uppercase font-bold bg-amber-500/20 border border-amber-500/30 text-amber-700 dark:text-amber-300 rounded-md">
                  Admin Quản Lý
                </span>
              )}
            </div>

            {toggleTheme && (
              <Button
                onClick={toggleTheme}
                variant="ghost"
                size="sm"
                className="p-2 h-9 w-9 rounded-xl border border-border/60 hover:bg-secondary text-muted-foreground hover:text-foreground"
                title="Đổi giao diện Sáng / Tối"
              >
                {theme === "dark" ? <Sun className="w-4 h-4 text-amber-400" /> : <Moon className="w-4 h-4 text-amber-600" />}
              </Button>
            )}

            <Button
              onClick={() => setLocation("/guide")}
              variant="outline"
              size="sm"
              className="text-xs font-bold gap-1.5 rounded-xl border-emerald-500/30 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-500/10"
              title="Xem Hướng Dẫn Sử Dụng & Xuất File PDF"
            >
              <BookOpen className="w-3.5 h-3.5 text-emerald-500" />
              <span className="hidden md:inline">Hướng Dẫn / In PDF</span>
            </Button>

            {isAdmin && (
              <Button
                onClick={() => setLocation("/admin")}
                variant="outline"
                size="sm"
                className="text-xs font-bold gap-1.5 rounded-xl border-amber-500/30 text-amber-700 dark:text-amber-300 hover:bg-amber-500/10"
              >
                <Settings className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Cài Đặt Admin</span>
              </Button>
            )}

            <Button
              onClick={() => logout()}
              variant="ghost"
              size="sm"
              className="text-xs font-semibold gap-1.5 rounded-xl text-muted-foreground hover:text-red-600 hover:bg-red-500/10"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Thoát</span>
            </Button>
          </div>
        </div>

        {/* Dashboard Navigation Tabs */}
        <div className="border-t border-border/40 bg-secondary/30 backdrop-blur-md">
          <div className="container flex items-center gap-2 overflow-x-auto py-1.5">
            {navTabs.map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id as any)}
                  className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all whitespace-nowrap ${
                    isActive
                      ? "bg-amber-500 text-white shadow-sm"
                      : "text-muted-foreground hover:text-foreground hover:bg-secondary/80"
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  <span>{tab.label}</span>
                </button>
              );
            })}
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="relative z-10 container py-8 flex-1 space-y-8">
        {/* Admin Comprehensive Analytics View */}
        {activeTab === "analytics" && (
          <div className="space-y-8">
            <section className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-1.5 h-6 rounded-full bg-amber-500" />
                  <div>
                    <h2 className="text-2xl font-bold text-foreground tracking-tight flex items-center gap-2">
                      <span>Báo Cáo Hiệu Suất Voucher Toàn Diện</span>
                      <Sparkles className="w-4 h-4 text-amber-500" />
                    </h2>
                    <p className="text-xs text-muted-foreground">
                      Phân tích tổng quan chỉ số quy đổi, so sánh hiệu suất giữa các nhà hàng
                    </p>
                  </div>
                </div>
              </div>
              <KPIDashboard
                refreshTrigger={refreshTrigger}
                selectedDate={selectedDate}
                onDateChange={setSelectedDate}
              />
            </section>

            <section className="space-y-4">
              <AnalyticsCharts />
            </section>

            <section className="space-y-4">
              <div className="flex items-center gap-2">
                <div className="w-1.5 h-6 rounded-full bg-amber-500" />
                <h2 className="text-2xl font-bold text-foreground tracking-tight">
                  Bảng Chi Tiết Lịch Sử Tất Cả Nhà Hàng
                </h2>
              </div>
              <HistoricalDataTable />
            </section>
          </div>
        )}

        {/* Regular Dashboard View */}
        {activeTab === "dashboard" && (
          <div className="space-y-8">
            <section className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-1.5 h-6 rounded-full bg-amber-500" />
                  <div>
                    <h2 className="text-2xl font-bold text-foreground tracking-tight flex items-center gap-2">
                      <span>Hiệu Suất Hôm Nay</span>
                      <Sparkles className="w-4 h-4 text-amber-500" />
                    </h2>
                    <p className="text-xs text-muted-foreground">
                      Thống kê chỉ số phát hành voucher trên Cloud Firestore
                    </p>
                  </div>
                </div>
              </div>
              <KPIDashboard
                refreshTrigger={refreshTrigger}
                selectedDate={selectedDate}
                onDateChange={setSelectedDate}
              />
            </section>

            {/* ONLY render entry form if user is NOT admin */}
            {!isAdmin && (
              <section className="space-y-4">
                <div className="flex items-center gap-2">
                  <div className="w-1.5 h-6 rounded-full bg-amber-500" />
                  <h2 className="text-xl font-bold text-foreground tracking-tight">
                    Nhập Liệu Phiếu Voucher
                  </h2>
                </div>
                <VoucherEntryForm onSuccess={handleFormSuccess} />
              </section>
            )}

            {isAdmin && (
              <section className="space-y-4">
                <AnalyticsCharts />
              </section>
            )}

            <section className="space-y-4">
              <div className="flex items-center gap-2">
                <div className="w-1.5 h-6 rounded-full bg-amber-500" />
                <h2 className="text-2xl font-bold text-foreground tracking-tight">
                  Bảng Báo Cáo Lịch Sử
                </h2>
              </div>
              <HistoricalDataTable />
            </section>
          </div>
        )}

        {/* Entry Form Tab (Non-Admin only) */}
        {activeTab === "entry" && !isAdmin && (
          <div className="max-w-4xl mx-auto space-y-6">
            <section>
              <VoucherEntryForm onSuccess={handleFormSuccess} />
            </section>
            <section>
              <KPIDashboard
                refreshTrigger={refreshTrigger}
                selectedDate={selectedDate}
                onDateChange={setSelectedDate}
              />
            </section>
          </div>
        )}

        {/* History Tab */}
        {activeTab === "history" && (
          <div className="space-y-6">
            <HistoricalDataTable />
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="relative z-10 border-t border-border/60 bg-card py-6 text-center text-xs text-muted-foreground">
        <div className="flex items-center justify-center gap-2 mb-1 text-amber-600 dark:text-amber-400 font-semibold">
          <Beer className="w-4 h-4" />
          <span>Sun World Ba Na Hills • Beer Voucher Tracker</span>
        </div>
        <p>© 2026 Sun World Ba Na Hills • Lễ Hội Bia Sun KraftBeer Real-Time Cloud Engine</p>
      </footer>
    </div>
  );
}


