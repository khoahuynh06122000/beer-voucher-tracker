import { useEffect, useState, useMemo } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Ticket,
  XCircle,
  Percent,
  Beer,
  Calendar,
  FileText,
  TrendingUp,
  TrendingDown,
  Minus,
  Building2,
  Sparkles,
  BarChart2,
  ArrowUpRight,
  ArrowDownRight,
  ChevronRight,
} from "lucide-react";
import { useAuth } from "@/_core/hooks/useAuth";
import {
  getAggregatedVoucherByDateRange,
  getVouchersByDateRange,
  getLocalDateString,
  VoucherRecord,
} from "@/lib/firestoreService";

interface KPIDashboardProps {
  refreshTrigger?: number;
  selectedDate?: string;
  onDateChange?: (date: string) => void;
  startDate?: string;
  endDate?: string;
  selectedRestaurant?: string;
  onStartDateChange?: (date: string) => void;
  onEndDateChange?: (date: string) => void;
  onRestaurantChange?: (restId: string) => void;
}

const RESTAURANT_OPTIONS = [
  { id: "all", name: "Tất Cả Nhà Hàng (Tổng Hợp)" },
  { id: "lehoibia", name: "Lễ Hội Bia" },
  { id: "1901", name: "Nhà Hàng 1901" },
  { id: "beerplaza", name: "Beer Plaza" },
  { id: "maisonkayser", name: "Maison Kayser" },
];

const RESTAURANT_META: Record<
  string,
  { name: string; color: string; badgeBg: string; textCol: string; borderCol: string }
> = {
  lehoibia: {
    name: "Lễ Hội Bia",
    color: "from-amber-500 to-amber-600",
    badgeBg: "bg-amber-500/10",
    textCol: "text-amber-600 dark:text-amber-400",
    borderCol: "border-amber-500/30",
  },
  "1901": {
    name: "Nhà Hàng 1901",
    color: "from-orange-500 to-amber-500",
    badgeBg: "bg-orange-500/10",
    textCol: "text-orange-600 dark:text-orange-400",
    borderCol: "border-orange-500/30",
  },
  beerplaza: {
    name: "Beer Plaza",
    color: "from-blue-500 to-indigo-600",
    badgeBg: "bg-blue-500/10",
    textCol: "text-blue-600 dark:text-blue-400",
    borderCol: "border-blue-500/30",
  },
  maisonkayser: {
    name: "Maison Kayser",
    color: "from-emerald-500 to-teal-600",
    badgeBg: "bg-emerald-500/10",
    textCol: "text-emerald-600 dark:text-emerald-400",
    borderCol: "border-emerald-500/30",
  },
};

export function KPIDashboard({
  refreshTrigger,
  selectedDate,
  onDateChange,
  startDate: propStartDate,
  endDate: propEndDate,
  selectedRestaurant: propSelectedRestaurant,
  onStartDateChange,
  onEndDateChange,
  onRestaurantChange,
}: KPIDashboardProps) {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const userRestaurantId = user?.username || user?.id || "lehoibia";

  const [internalRestId, setInternalRestId] = useState<string>(() => {
    return isAdmin ? "all" : userRestaurantId;
  });

  const [internalStartDate, setInternalStartDate] = useState<string>(() => {
    const d = new Date();
    d.setDate(d.getDate() - 7);
    return getLocalDateString(d);
  });

  const [internalEndDate, setInternalEndDate] = useState<string>(() => getLocalDateString());

  const startDate = propStartDate ?? internalStartDate;
  const endDate = propEndDate ?? internalEndDate;
  const selectedRestId = propSelectedRestaurant ?? internalRestId;

  const handleUpdateStartDate = (val: string) => {
    setInternalStartDate(val);
    if (onStartDateChange) onStartDateChange(val);
  };

  const handleUpdateEndDate = (val: string) => {
    setInternalEndDate(val);
    if (onEndDateChange) onEndDateChange(val);
  };

  const handleUpdateRestId = (val: string) => {
    setInternalRestId(val);
    if (onRestaurantChange) onRestaurantChange(val);
  };

  const handleSetLastDays = (days: number) => {
    const end = new Date();
    const start = new Date();
    start.setDate(start.getDate() - days);
    const startStr = getLocalDateString(start);
    const endStr = getLocalDateString(end);
    handleUpdateStartDate(startStr);
    handleUpdateEndDate(endStr);
  };

  useEffect(() => {
    if (!isAdmin) {
      handleUpdateRestId(userRestaurantId);
    }
  }, [user, isAdmin, userRestaurantId]);

  const [todayRecord, setTodayRecord] = useState<VoucherRecord | null>(null);
  const [allRecords, setAllRecords] = useState<VoucherRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;
    async function fetchKPI() {
      setIsLoading(true);
      const [record, records] = await Promise.all([
        getAggregatedVoucherByDateRange(selectedRestId, startDate, endDate),
        getVouchersByDateRange("all", startDate, endDate),
      ]);
      if (isMounted) {
        setTodayRecord(record);
        setAllRecords(records);
        setIsLoading(false);
      }
    }
    fetchKPI();
    return () => {
      isMounted = false;
    };
  }, [selectedRestId, startDate, endDate, refreshTrigger]);

  // Process Department Fluctuation Data
  const departmentFluctuations = useMemo(() => {
    const filtered =
      selectedRestId === "all"
        ? allRecords
        : allRecords.filter((r) => r.restaurantId === selectedRestId);

    // Group records by restaurantId
    const deptMap: Record<string, VoucherRecord[]> = {
      lehoibia: [],
      "1901": [],
      beerplaza: [],
      maisonkayser: [],
    };

    filtered.forEach((rec) => {
      if (deptMap[rec.restaurantId]) {
        deptMap[rec.restaurantId].push(rec);
      }
    });

    const deptSummaries = Object.entries(deptMap).map(([deptId, recs]) => {
      // Sort ascending by date for chronological trend calculation
      const sorted = [...recs].sort((a, b) => a.date.localeCompare(b.date));

      let totalIssued = 0;
      let totalPosted = 0;
      let totalCancelled = 0;
      let peakRecord: VoucherRecord | null = null;
      let offPeakRecord: VoucherRecord | null = null;

      const dailyWithFluctuation = sorted.map((r, idx) => {
        const potato = r.potatoCoupons ?? Math.round((r.postedBills || 0) / 2);
        const beer = r.beerCoupons ?? ((r.postedBills || 0) - potato);
        const bakery = r.bakeryCoupons ?? 0;
        const cancelled = r.cancelled || 0;
        const posted = r.postedBills || (potato + beer + bakery);
        const issued = r.totalIssued || (potato + beer + bakery + cancelled);
        const rate = issued > 0 ? Math.round((posted / issued) * 100) : 0;

        totalIssued += issued;
        totalPosted += posted;
        totalCancelled += cancelled;

        if (!peakRecord || issued > (peakRecord.totalIssued || 0)) {
          peakRecord = { ...r, totalIssued: issued };
        }
        if (!offPeakRecord || issued < (offPeakRecord.totalIssued || Infinity)) {
          offPeakRecord = { ...r, totalIssued: issued };
        }

        // Calculate day-over-day difference
        let diff = 0;
        let pctChange = 0;
        if (idx > 0) {
          const prevRecord = sorted[idx - 1];
          const prevPotato = prevRecord.potatoCoupons ?? Math.round((prevRecord.postedBills || 0) / 2);
          const prevBeer = prevRecord.beerCoupons ?? ((prevRecord.postedBills || 0) - prevPotato);
          const prevBakery = prevRecord.bakeryCoupons ?? 0;
          const prevCancelled = prevRecord.cancelled || 0;
          const prevIssued =
            prevRecord.totalIssued || (prevPotato + prevBeer + prevBakery + prevCancelled);

          diff = issued - prevIssued;
          if (prevIssued > 0) {
            pctChange = Math.round((diff / prevIssued) * 100);
          } else if (issued > 0) {
            pctChange = 100;
          }
        }

        return {
          id: r.id || `${deptId}_${r.date}`,
          date: r.date,
          restaurantId: deptId,
          restaurantName: RESTAURANT_META[deptId]?.name || r.restaurantName || deptId,
          issued,
          posted,
          cancelled,
          rate,
          diff,
          pctChange,
          isFirstDay: idx === 0,
        };
      });

      const avgDaily = sorted.length > 0 ? Math.round(totalIssued / sorted.length) : 0;
      const overallRate = totalIssued > 0 ? Math.round((totalPosted / totalIssued) * 100) : 0;

      // Overall growth across the 7 days (first vs last day)
      let periodGrowth = 0;
      if (dailyWithFluctuation.length >= 2) {
        const firstIssued = dailyWithFluctuation[0].issued;
        const lastIssued = dailyWithFluctuation[dailyWithFluctuation.length - 1].issued;
        if (firstIssued > 0) {
          periodGrowth = Math.round(((lastIssued - firstIssued) / firstIssued) * 100);
        }
      }

      return {
        deptId,
        meta: RESTAURANT_META[deptId] || {
          name: deptId,
          color: "from-amber-500 to-amber-600",
          badgeBg: "bg-amber-500/10",
          textCol: "text-amber-600",
          borderCol: "border-amber-500/30",
        },
        totalIssued,
        totalPosted,
        totalCancelled,
        avgDaily,
        overallRate,
        periodGrowth,
        peakRecord,
        offPeakRecord,
        dailyList: dailyWithFluctuation.reverse(), // desc for display
      };
    });

    // Flatten all daily records desc by date for table view
    const allDailyFlat = deptSummaries
      .flatMap((d) => d.dailyList)
      .sort((a, b) => b.date.localeCompare(a.date));

    return { deptSummaries, allDailyFlat };
  }, [allRecords, selectedRestId]);

  if (isLoading) {
    return (
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-5">
        {[1, 2, 3, 4].map((i) => (
          <Card key={i} className="p-4 sm:p-6 rounded-xl border border-border bg-card">
            <Skeleton className="h-4 w-20 sm:w-28 mb-3" />
            <Skeleton className="h-7 w-16 sm:w-20 mb-2" />
            <Skeleton className="h-3 w-24 sm:w-36" />
          </Card>
        ))}
      </div>
    );
  }

  const potato = todayRecord?.potatoCoupons ?? 0;
  const beer = todayRecord?.beerCoupons ?? 0;
  const bakery = todayRecord?.bakeryCoupons ?? 0;
  const cancelled = todayRecord?.cancelled ?? 0;
  const total = todayRecord?.totalIssued ?? 0;
  const rate = todayRecord?.utilizationRate ?? 0;

  const isMaisonKayser = selectedRestId === "maisonkayser" || todayRecord?.restaurantId === "maisonkayser";

  let stats;

  if (isMaisonKayser) {
    stats = [
      {
        label: "VOUCHER BÁNH",
        value: bakery,
        unit: "Voucher bánh phát hành & thu về",
        icon: Ticket,
        iconBg: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 dark:bg-emerald-500/20",
        accentBorder: "border-l-4 border-l-emerald-500",
        badge: "Maison Kayser",
      },
      {
        label: "GHI NHẬN HÓA ĐƠN",
        value: todayRecord?.postedBills ?? bakery,
        unit: "Hóa đơn POS ghi nhận thành công",
        icon: Ticket,
        iconBg: "bg-blue-500/10 text-blue-600 dark:text-blue-400 dark:bg-blue-500/20",
        accentBorder: "border-l-4 border-l-blue-500",
        badge: "Đã quy đổi",
      },
      {
        label: "TỶ LỆ QUY ĐỔI",
        value: `${rate}%`,
        unit: "Hiệu suất quy đổi voucher bánh",
        icon: Percent,
        iconBg: "bg-purple-500/10 text-purple-600 dark:text-purple-400 dark:bg-purple-500/20",
        accentBorder: "border-l-4 border-l-purple-500",
        badge: "100% Quy đổi",
      },
      {
        label: "TỔNG VOUCHER BÁNH",
        value: total,
        unit: `Tỷ lệ quy đổi ${rate}%`,
        icon: Percent,
        iconBg: "bg-amber-500/10 text-amber-600 dark:text-amber-400 dark:bg-amber-500/20",
        accentBorder: "border-l-4 border-l-amber-500",
        badge: `${rate}% Quy đổi`,
        isRate: true,
      },
    ];
  } else if (isAdmin) {
    stats = [
      {
        label: "COUPON KHOAI TÂY & BIA",
        value: potato + beer,
        unit: "Coupon khoai tây & bia toàn nhà hàng",
        icon: Beer,
        iconBg: "bg-amber-500/10 text-amber-600 dark:text-amber-400 dark:bg-amber-500/20",
        accentBorder: "border-l-4 border-l-amber-500",
        badge: "Đồ ăn / Đồ uống",
      },
      {
        label: "VOUCHER BÁNH (MK)",
        value: bakery,
        unit: "Voucher bánh Maison Kayser",
        icon: Ticket,
        iconBg: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 dark:bg-emerald-500/20",
        accentBorder: "border-l-4 border-l-emerald-500",
        badge: "Maison Kayser",
      },
      {
        label: "COUPON HỦY",
        value: cancelled,
        unit: "Coupon rách, hỏng, hủy",
        icon: XCircle,
        iconBg: "bg-red-500/10 text-red-600 dark:text-red-400 dark:bg-red-500/20",
        accentBorder: "border-l-4 border-l-red-500",
        badge: "Đã hủy",
      },
      {
        label: "TỔNG TẤT CẢ VOUCHER",
        value: total,
        unit: `Tỷ lệ quy đổi ${rate}%`,
        icon: Percent,
        iconBg: "bg-amber-500/10 text-amber-600 dark:text-amber-400 dark:bg-amber-500/20",
        accentBorder: "border-l-4 border-l-amber-500",
        badge: `${rate}% Quy đổi`,
        isRate: true,
      },
    ];
  } else {
    stats = [
      {
        label: "COUPON KHOAI TÂY",
        value: potato,
        unit: "Coupon khoai tây thu về",
        icon: Ticket,
        iconBg: "bg-amber-500/10 text-amber-600 dark:text-amber-400 dark:bg-amber-500/20",
        accentBorder: "border-l-4 border-l-amber-500",
        badge: "Khoai tây",
      },
      {
        label: "COUPON BEER",
        value: beer,
        unit: "Coupon bia thu về",
        icon: Beer,
        iconBg: "bg-blue-500/10 text-blue-600 dark:text-blue-400 dark:bg-blue-500/20",
        accentBorder: "border-l-4 border-l-blue-500",
        badge: "Đồ uống",
      },
      {
        label: "COUPON HỦY",
        value: cancelled,
        unit: "Coupon rách, hỏng, hủy",
        icon: XCircle,
        iconBg: "bg-red-500/10 text-red-600 dark:text-red-400 dark:bg-red-500/20",
        accentBorder: "border-l-4 border-l-red-500",
        badge: "Đã hủy",
      },
      {
        label: "TỔNG COUPON",
        value: total,
        unit: `Tỷ lệ quy đổi ${rate}%`,
        icon: Percent,
        iconBg: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 dark:bg-emerald-500/20",
        accentBorder: "border-l-4 border-l-emerald-500",
        badge: `${rate}% Quy đổi`,
        isRate: true,
      },
    ];
  }

  return (
    <div className="space-y-6">
      {/* Date Range & Restaurant Filter Bar */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 text-xs text-muted-foreground bg-amber-500/10 dark:bg-amber-500/10 border border-amber-500/20 p-3 sm:px-4 sm:py-2.5 rounded-2xl shadow-xs">
        {/* Left Section: Info badge & Restaurant filter */}
        <div className="flex flex-wrap items-center gap-2.5">
          <div className="flex items-center gap-1.5">
            <Calendar className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
            <span>
              Thống kê:{" "}
              <strong className="text-foreground font-extrabold">
                {startDate === endDate ? startDate : `${startDate} → ${endDate}`}
              </strong>
            </span>
          </div>

          <div className="flex items-center gap-1.5 border-l border-amber-500/30 pl-2.5">
            <span className="font-semibold text-foreground">Bộ phận / Nhà hàng:</span>
            {isAdmin ? (
              <select
                value={selectedRestId}
                onChange={(e) => handleUpdateRestId(e.target.value)}
                className="px-2.5 py-1 rounded-xl bg-background border border-amber-500/30 text-foreground font-extrabold shadow-xs text-xs outline-none focus:ring-2 focus:ring-amber-500/40 cursor-pointer"
              >
                {RESTAURANT_OPTIONS.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
              </select>
            ) : (
              <span className="px-2.5 py-1 rounded-xl bg-amber-500/20 text-amber-800 dark:text-amber-300 font-extrabold text-xs">
                {RESTAURANT_OPTIONS.find((r) => r.id === userRestaurantId)?.name || userRestaurantId}
              </span>
            )}
          </div>
        </div>

        {/* Right Section: Quick Presets & Date Range Pickers */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Quick Presets */}
          <div className="flex items-center gap-1 bg-background/80 dark:bg-card/80 border border-amber-500/30 p-0.5 rounded-xl">
            <button
              type="button"
              onClick={() => handleSetLastDays(7)}
              className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all cursor-pointer ${
                startDate === getLocalDateString(new Date(Date.now() - 7 * 86400000))
                  ? "bg-amber-500 text-white shadow-xs"
                  : "text-amber-700 dark:text-amber-300 hover:bg-amber-500/20"
              }`}
            >
              7 ngày (Mặc định)
            </button>
            <button
              type="button"
              onClick={() => handleSetLastDays(14)}
              className="px-2 py-1 rounded-lg text-[11px] font-bold text-muted-foreground hover:text-foreground hover:bg-amber-500/10 transition-all cursor-pointer"
            >
              14 ngày
            </button>
            <button
              type="button"
              onClick={() => handleSetLastDays(30)}
              className="px-2 py-1 rounded-lg text-[11px] font-bold text-muted-foreground hover:text-foreground hover:bg-amber-500/10 transition-all cursor-pointer"
            >
              30 ngày
            </button>
            <button
              type="button"
              onClick={() => handleSetLastDays(90)}
              className="px-2 py-1 rounded-lg text-[11px] font-bold text-muted-foreground hover:text-foreground hover:bg-amber-500/10 transition-all cursor-pointer"
            >
              90 ngày
            </button>
          </div>

          {/* Date range pickers */}
          <div className="flex items-center gap-1.5 shrink-0">
            <span className="font-semibold text-foreground">Từ:</span>
            <input
              type="date"
              value={startDate}
              onChange={(e) => {
                handleUpdateStartDate(e.target.value);
                if (onDateChange) onDateChange(e.target.value);
              }}
              className="px-2 py-1 text-xs rounded-xl bg-background border border-amber-500/30 text-foreground font-bold shadow-xs focus:ring-2 focus:ring-amber-500/30 outline-none cursor-pointer"
            />
            <span className="font-semibold text-foreground">Đến:</span>
            <input
              type="date"
              value={endDate}
              onChange={(e) => {
                handleUpdateEndDate(e.target.value);
              }}
              className="px-2 py-1 text-xs rounded-xl bg-background border border-amber-500/30 text-foreground font-bold shadow-xs focus:ring-2 focus:ring-amber-500/30 outline-none cursor-pointer"
            />
          </div>
        </div>
      </div>

      {/* 4 Core Summary KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-5">
        {stats.map((stat) => {
          const Icon = stat.icon;
          return (
            <Card
              key={stat.label}
              className="relative overflow-hidden p-4 sm:p-5 rounded-2xl border border-border/80 bg-gradient-to-b from-card via-card to-amber-500/[0.02] shadow-[0_4px_20px_-4px_rgba(217,119,6,0.06)] dark:shadow-[0_4px_20px_-4px_rgba(0,0,0,0.4)] hover:shadow-lg hover:border-amber-500/30 transition-all duration-300 group"
            >
              <div
                className={`absolute top-0 left-0 right-0 h-1 ${stat.accentBorder.replace(
                  "border-l-4 border-l-",
                  "bg-"
                )}`}
              />

              <div className="flex items-center justify-between mb-3">
                <span className="text-[10px] sm:text-xs font-black tracking-wider text-muted-foreground uppercase truncate">
                  {stat.label}
                </span>
                <div
                  className={`p-2 sm:p-2.5 rounded-xl shrink-0 group-hover:scale-110 transition-transform ${stat.iconBg}`}
                >
                  <Icon className="w-4 h-4 sm:w-5 sm:h-5" />
                </div>
              </div>

              <div className="flex items-baseline justify-between mb-1.5">
                <span className="text-2xl sm:text-3.5xl font-black tracking-tight text-foreground">
                  {stat.value.toLocaleString("vi-VN")}
                </span>
                <span className="text-[9px] sm:text-xs font-extrabold px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-800 dark:text-amber-300 border border-amber-500/20 truncate max-w-[90px] sm:max-w-none">
                  {stat.badge}
                </span>
              </div>

              {stat.isRate ? (
                <div className="space-y-1.5 mt-2">
                  <div className="w-full bg-secondary h-2 rounded-full overflow-hidden p-0.5 border border-border/50">
                    <div
                      className="bg-gradient-to-r from-emerald-500 to-teal-400 h-full rounded-full transition-all duration-500 shadow-xs"
                      style={{ width: `${Math.min(100, Math.max(0, rate))}%` }}
                    />
                  </div>
                  <p className="text-[10px] sm:text-[11px] text-muted-foreground font-semibold text-right truncate">
                    {stat.unit}
                  </p>
                </div>
              ) : (
                <p className="text-[10px] sm:text-xs text-muted-foreground font-medium mt-1 truncate">
                  {stat.unit}
                </p>
              )}
            </Card>
          );
        })}
      </div>

      {/* Department Trend & Daily Fluctuation Cards Section */}
      <div className="space-y-4 pt-2">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-border/60 pb-3">
          <div className="flex items-center gap-2">
            <Building2 className="w-5 h-5 text-amber-500" />
            <div>
              <h3 className="text-base sm:text-lg font-black text-foreground tracking-tight">
                Phân Tích Biến Động Theo Ngày Của Các Bộ Phận
              </h3>
              <p className="text-xs text-muted-foreground">
                So sánh số liệu phát hành, quy đổi và tỷ lệ tăng/giảm qua từng ngày (7 ngày gần nhất)
              </p>
            </div>
          </div>
          <span className="text-[11px] font-extrabold text-amber-800 dark:text-amber-300 bg-amber-500/10 border border-amber-500/20 px-3 py-1 rounded-full self-start sm:self-auto">
            {departmentFluctuations.deptSummaries.length} Bộ Phận Hoạt Động
          </span>
        </div>

        {/* 4 Department Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {departmentFluctuations.deptSummaries.map((dept) => {
            const hasData = dept.totalIssued > 0;
            return (
              <Card
                key={dept.deptId}
                className={`p-4 rounded-2xl border ${dept.meta.borderCol} bg-card hover:shadow-md transition-all space-y-3 relative overflow-hidden`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div
                      className={`w-3 h-3 rounded-full bg-gradient-to-r ${dept.meta.color}`}
                    />
                    <h4 className="font-extrabold text-sm text-foreground">
                      {dept.meta.name}
                    </h4>
                  </div>
                  {hasData && (
                    <span
                      className={`text-[10px] font-extrabold px-2 py-0.5 rounded-full flex items-center gap-0.5 ${
                        dept.periodGrowth > 0
                          ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
                          : dept.periodGrowth < 0
                          ? "bg-red-500/15 text-red-600 dark:text-red-400"
                          : "bg-muted text-muted-foreground"
                      }`}
                    >
                      {dept.periodGrowth > 0 ? (
                        <TrendingUp className="w-3 h-3" />
                      ) : dept.periodGrowth < 0 ? (
                        <TrendingDown className="w-3 h-3" />
                      ) : (
                        <Minus className="w-3 h-3" />
                      )}
                      {dept.periodGrowth > 0 ? `+${dept.periodGrowth}%` : `${dept.periodGrowth}%`}
                    </span>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-2 pt-1">
                  <div className="p-2 rounded-xl bg-background border border-border/60">
                    <span className="text-[10px] text-muted-foreground font-semibold block">
                      Tổng Phát Ra (7D)
                    </span>
                    <span className="text-base font-black text-foreground">
                      {dept.totalIssued.toLocaleString("vi-VN")}
                    </span>
                  </div>
                  <div className="p-2 rounded-xl bg-background border border-border/60">
                    <span className="text-[10px] text-muted-foreground font-semibold block">
                      TB / Ngày
                    </span>
                    <span className="text-base font-black text-amber-600 dark:text-amber-400">
                      {dept.avgDaily.toLocaleString("vi-VN")}
                    </span>
                  </div>
                </div>

                <div className="space-y-1.5 text-xs">
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-muted-foreground">Tỷ Lệ Quy Đổi:</span>
                    <span className="font-extrabold text-foreground">{dept.overallRate}%</span>
                  </div>
                  {dept.peakRecord && (
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="text-muted-foreground">Ngày Cao Điểm:</span>
                      <span className="font-bold text-emerald-600 dark:text-emerald-400">
                        {dept.peakRecord.date} ({dept.peakRecord.totalIssued?.toLocaleString("vi-VN")})
                      </span>
                    </div>
                  )}
                </div>
              </Card>
            );
          })}
        </div>

        {/* Daily Fluctuation Timeline Table */}
        <Card className="p-4 sm:p-5 rounded-2xl border border-border/80 bg-card shadow-xs space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2">
            <div>
              <h4 className="text-sm font-extrabold text-foreground flex items-center gap-2">
                <BarChart2 className="w-4 h-4 text-amber-500" />
                <span>Chi Tiết Biến Động Số Vé Phát Ra Theo Ngày &amp; Bộ Phận</span>
              </h4>
              <p className="text-[11px] text-muted-foreground">
                So sánh số phát hành và biến động % tăng/giảm so với ngày liền trước
              </p>
            </div>
          </div>

          <div className="overflow-x-auto rounded-xl border border-border/80">
            <table className="w-full text-xs text-left">
              <thead className="bg-muted/60 text-muted-foreground uppercase text-[10px] font-extrabold tracking-wider border-b border-border">
                <tr>
                  <th className="px-3.5 py-2.5">Ngày</th>
                  <th className="px-3.5 py-2.5">Bộ Phận / Nhà Hàng</th>
                  <th className="px-3.5 py-2.5 text-right">Tổng Phát Ra</th>
                  <th className="px-3.5 py-2.5 text-right">Đã Quy Đổi</th>
                  <th className="px-3.5 py-2.5 text-right">Hủy</th>
                  <th className="px-3.5 py-2.5 text-center">Tỷ Lệ Quy Đổi</th>
                  <th className="px-3.5 py-2.5 text-right">Biến Động So Với Ngày Trước</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60 font-semibold">
                {departmentFluctuations.allDailyFlat.length > 0 ? (
                  departmentFluctuations.allDailyFlat.map((item) => {
                    const meta = RESTAURANT_META[item.restaurantId] || {
                      name: item.restaurantName,
                      textCol: "text-foreground",
                    };
                    return (
                      <tr
                        key={`${item.restaurantId}_${item.date}`}
                        className="hover:bg-amber-500/5 transition-colors"
                      >
                        <td className="px-3.5 py-2.5 font-bold text-foreground whitespace-nowrap">
                          {item.date}
                        </td>
                        <td className="px-3.5 py-2.5 whitespace-nowrap">
                          <span
                            className={`font-extrabold ${meta.textCol}`}
                          >
                            {meta.name}
                          </span>
                        </td>
                        <td className="px-3.5 py-2.5 text-right font-black text-foreground">
                          {item.issued.toLocaleString("vi-VN")}
                        </td>
                        <td className="px-3.5 py-2.5 text-right text-blue-600 dark:text-blue-400 font-bold">
                          {item.posted.toLocaleString("vi-VN")}
                        </td>
                        <td className="px-3.5 py-2.5 text-right text-red-500 font-bold">
                          {item.cancelled.toLocaleString("vi-VN")}
                        </td>
                        <td className="px-3.5 py-2.5 text-center">
                          <span className="px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 text-[11px] font-extrabold border border-emerald-500/20">
                            {item.rate}%
                          </span>
                        </td>
                        <td className="px-3.5 py-2.5 text-right whitespace-nowrap">
                          {item.isFirstDay ? (
                            <span className="text-[11px] text-muted-foreground font-normal">
                              Mốc bắt đầu
                            </span>
                          ) : item.diff > 0 ? (
                            <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400 font-black bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded-lg text-[11px]">
                              <ArrowUpRight className="w-3.5 h-3.5" />
                              +{item.diff.toLocaleString("vi-VN")} (+{item.pctChange}%)
                            </span>
                          ) : item.diff < 0 ? (
                            <span className="inline-flex items-center gap-1 text-red-600 dark:text-red-400 font-black bg-red-500/10 border border-red-500/20 px-2 py-0.5 rounded-lg text-[11px]">
                              <ArrowDownRight className="w-3.5 h-3.5" />
                              {item.diff.toLocaleString("vi-VN")} ({item.pctChange}%)
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-muted-foreground font-bold bg-muted px-2 py-0.5 rounded-lg text-[11px]">
                              <Minus className="w-3 h-3" /> 0% (Không đổi)
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })
                ) : (
                  <tr>
                    <td colSpan={7} className="px-4 py-8 text-center text-muted-foreground">
                      Chưa có dữ liệu ghi nhận trong khoảng thời gian đã chọn.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
    </div>
  );
}


