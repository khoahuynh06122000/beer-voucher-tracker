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
  PieChart as PieChartIcon,
  Sun,
  Moon,
  DollarSign,
} from "lucide-react";
import {
  ResponsiveContainer,
  ComposedChart,
  BarChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from "recharts";
import { useAuth } from "@/_core/hooks/useAuth";
import { useTheme } from "@/contexts/ThemeContext";
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
  const { theme, toggleTheme } = useTheme();
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

    // Time-series chart dataset for Recharts (Sorted Ascending by Date)
    const uniqueDates = Array.from(new Set(allDailyFlat.map((d) => d.date))).sort();
    const timeSeriesChartData = uniqueDates.map((date) => {
      const dayRecords = allDailyFlat.filter((r) => r.date === date);
      const row: Record<string, any> = { date };
      let dayTotalIssued = 0;
      let dayTotalPosted = 0;

      deptSummaries.forEach((dept) => {
        const found = dayRecords.find((r) => r.restaurantId === dept.deptId);
        const issued = found ? found.issued : 0;
        const posted = found ? found.posted : 0;
        row[dept.meta.name] = issued;
        dayTotalIssued += issued;
        dayTotalPosted += posted;
      });

      row["Tổng Phát Ra"] = dayTotalIssued;
      row["Đã Quy Đổi"] = dayTotalPosted;
      return row;
    });

    // Department Comparison chart dataset
    const departmentChartData = deptSummaries.map((dept) => ({
      name: dept.meta.name,
      "Tổng Phát Ra": dept.totalIssued,
      "Đã Quy Đổi": dept.totalPosted,
      "Hủy / Thất Thoát": dept.totalCancelled,
      "Tỷ Lệ Quy Đổi": dept.overallRate,
    }));

    return { deptSummaries, allDailyFlat, timeSeriesChartData, departmentChartData };
  }, [allRecords, selectedRestId]);

  const userDept = useMemo(() => {
    return (
      departmentFluctuations.deptSummaries.find((d) => d.deptId === userRestaurantId) ||
      departmentFluctuations.deptSummaries[0]
    );
  }, [departmentFluctuations, userRestaurantId]);

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
        unit: `~ ${(beer * 0.5).toFixed(1)}L Bia & ${(potato * 0.1).toFixed(1)}kg Khoai`,
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
        unit: `~ ${(potato * 0.1).toFixed(1)} kg khoai tây (0.1kg/vé)`,
        icon: Ticket,
        iconBg: "bg-amber-500/10 text-amber-600 dark:text-amber-400 dark:bg-amber-500/20",
        accentBorder: "border-l-4 border-l-amber-500",
        badge: `${(potato * 0.1).toFixed(1)} kg`,
      },
      {
        label: "COUPON BEER",
        value: beer,
        unit: `~ ${(beer * 0.5).toFixed(1)} Lít bia tươi (500ml/vé)`,
        icon: Beer,
        iconBg: "bg-blue-500/10 text-blue-600 dark:text-blue-400 dark:bg-blue-500/20",
        accentBorder: "border-l-4 border-l-blue-500",
        badge: `${(beer * 0.5).toFixed(1)} Lít`,
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

          {/* Date range pickers & Theme Toggle */}
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

            {toggleTheme && (
              <button
                type="button"
                onClick={toggleTheme}
                className="ml-1 p-1.5 px-2.5 rounded-xl bg-card border border-amber-500/30 text-amber-700 dark:text-amber-300 hover:bg-amber-500/10 transition-all flex items-center gap-1.5 text-xs font-extrabold cursor-pointer shadow-xs"
                title={theme === "dark" ? "Chuyển sang Giao diện Sáng (Eye-care Light)" : "Chuyển sang Giao diện Tối (Dịu mắt Slate Dark)"}
              >
                {theme === "dark" ? (
                  <>
                    <Sun className="w-3.5 h-3.5 text-amber-400" />
                    <span className="hidden sm:inline">Chế Độ Sáng</span>
                  </>
                ) : (
                  <>
                    <Moon className="w-3.5 h-3.5 text-slate-700" />
                    <span className="hidden sm:inline">Chế Độ Tối</span>
                  </>
                )}
              </button>
            )}
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

      {/* Product Volume Conversion & Cost Highlight Cards (Sản Lượng & Chi Phí Quy Đổi) */}
      {!isMaisonKayser && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 sm:gap-4">
          {/* Beer Volume & Cost Conversion Card */}
          <Card className="p-4 sm:p-5 rounded-2xl border border-blue-500/30 bg-gradient-to-br from-blue-500/10 via-card to-background shadow-xs relative overflow-hidden">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-xl bg-blue-500/20 text-blue-600 dark:text-blue-400">
                  <Beer className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="text-xs sm:text-sm font-black text-foreground">SẢN LƯỢNG & CHI PHÍ BIA</h4>
                  <p className="text-[11px] text-muted-foreground font-semibold">500ml/vé (0.5L) | 32.000 VNĐ/Lít</p>
                </div>
              </div>
              <span className="text-xs font-black px-2.5 py-1 rounded-xl bg-blue-500/20 text-blue-700 dark:text-blue-300 border border-blue-500/30">
                16.000 đ / vé
              </span>
            </div>

            <div className="flex items-baseline gap-3 mt-3">
              <span className="text-2xl sm:text-3xl font-black text-blue-600 dark:text-blue-400 tracking-tight">
                {(beer * 0.5).toLocaleString("vi-VN", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} <span className="text-base font-bold">Lít</span>
              </span>
              <span className="text-xs text-muted-foreground font-medium">
                ({beer.toLocaleString("vi-VN")} vé)
              </span>
            </div>

            <div className="mt-3 pt-2.5 border-t border-blue-500/20 flex items-center justify-between text-xs text-muted-foreground">
              <span>Chi phí quy đổi bia:</span>
              <span className="font-extrabold text-blue-600 dark:text-blue-400 text-sm">
                {(beer * 16000).toLocaleString("vi-VN")} VNĐ
              </span>
            </div>
          </Card>

          {/* Potato Weight & Cost Conversion Card */}
          <Card className="p-4 sm:p-5 rounded-2xl border border-amber-500/30 bg-gradient-to-br from-amber-500/10 via-card to-background shadow-xs relative overflow-hidden">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-xl bg-amber-500/20 text-amber-600 dark:text-amber-400">
                  <Ticket className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="text-xs sm:text-sm font-black text-foreground">KHỐI LƯỢNG & CHI PHÍ KHOAI</h4>
                  <p className="text-[11px] text-muted-foreground font-semibold">0.1kg/vé | 13.000 VNĐ/phần</p>
                </div>
              </div>
              <span className="text-xs font-black px-2.5 py-1 rounded-xl bg-amber-500/20 text-amber-800 dark:text-amber-300 border border-amber-500/30">
                13.000 đ / vé
              </span>
            </div>

            <div className="flex items-baseline gap-3 mt-3">
              <span className="text-2xl sm:text-3xl font-black text-amber-600 dark:text-amber-400 tracking-tight">
                {(potato * 0.1).toLocaleString("vi-VN", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} <span className="text-base font-bold">kg</span>
              </span>
              <span className="text-xs text-muted-foreground font-medium">
                ({potato.toLocaleString("vi-VN")} vé)
              </span>
            </div>

            <div className="mt-3 pt-2.5 border-t border-amber-500/20 flex items-center justify-between text-xs text-muted-foreground">
              <span>Chi phí quy đổi khoai:</span>
              <span className="font-extrabold text-amber-600 dark:text-amber-400 text-sm">
                {(potato * 13000).toLocaleString("vi-VN")} VNĐ
              </span>
            </div>
          </Card>

          {/* Total Cost Summary Card */}
          <Card className="p-4 sm:p-5 rounded-2xl border border-emerald-500/30 bg-gradient-to-br from-emerald-500/10 via-card to-background shadow-xs relative overflow-hidden">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-xl bg-emerald-500/20 text-emerald-600 dark:text-emerald-400">
                  <DollarSign className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="text-xs sm:text-sm font-black text-foreground">TỔNG CHI PHÍ VOUCHER</h4>
                  <p className="text-[11px] text-muted-foreground font-semibold">Bia (16.000đ/vé) + Khoai (13.000đ/vé)</p>
                </div>
              </div>
              <span className="text-xs font-black px-2.5 py-1 rounded-xl bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30">
                Tạm tính
              </span>
            </div>

            <div className="flex items-baseline gap-3 mt-3">
              <span className="text-2xl sm:text-3xl font-black text-emerald-600 dark:text-emerald-400 tracking-tight">
                {(beer * 16000 + potato * 13000).toLocaleString("vi-VN")} <span className="text-base font-bold">VNĐ</span>
              </span>
            </div>

            <div className="mt-3 pt-2.5 border-t border-emerald-500/20 flex items-center justify-between text-xs text-muted-foreground">
              <span>Phân bổ chi phí:</span>
              <span className="font-extrabold text-foreground text-[11px]">
                🍺 {(beer * 16000).toLocaleString("vi-VN")}đ | 🍟 {(potato * 13000).toLocaleString("vi-VN")}đ
              </span>
            </div>
          </Card>
        </div>
      )}

      {/* Section for BP User (Department User) - Separate report for their own restaurant */}
      {!isAdmin && userDept && (
        <div className="space-y-5 pt-2">
          {/* Section Header */}
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 border-b border-border/60 pb-3">
            <div className="flex items-center gap-2.5">
              <div className="p-2 rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
                <BarChart2 className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base sm:text-lg font-black text-foreground tracking-tight flex items-center gap-2">
                  <span>Báo Cáo Voucher Nhà Hàng - {userDept.meta.name}</span>
                  <Sparkles className="w-4 h-4 text-amber-500" />
                </h3>
                <p className="text-xs text-muted-foreground">
                  Số liệu phát hành, lượt khách sử dụng voucher và tiến độ theo từng ngày của {userDept.meta.name}
                </p>
              </div>
            </div>
            <span className="text-[11px] font-extrabold text-amber-800 dark:text-amber-300 bg-amber-500/10 border border-amber-500/20 px-3 py-1.5 rounded-xl self-start md:self-auto shrink-0">
              {userDept.dailyList.length} Ngày Hoạt Động Trong Kỳ
            </span>
          </div>

          {/* Side-by-Side Grid: Chart on Left (7 cols), Simple Analysis on Right (5 cols) */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
            {/* Chart: Diễn Biến Phát Hành & Quy Đổi Hàng Ngày */}
            <Card className="lg:col-span-7 p-4 sm:p-5 rounded-2xl border border-border/80 bg-card shadow-xs flex flex-col justify-between">
              <div className="border-b border-border/60 pb-2.5">
                <h4 className="text-sm font-extrabold text-foreground flex items-center gap-2">
                  <BarChart2 className="w-4 h-4 text-amber-500" />
                  <span>Biểu Đồ Quy Đổi &amp; Phát Hành - {userDept.meta.name}</span>
                </h4>
                <p className="text-[11px] text-muted-foreground">
                  Cột vàng: Phát ra | Cột xanh: Khách đã đổi | Đường xanh lá: Tỷ lệ (%)
                </p>
              </div>

              <div className="h-[280px] w-full pt-3">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart
                    data={userDept.dailyList}
                    margin={{ top: 10, right: 10, left: -15, bottom: 0 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                    <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                    <YAxis yAxisId="left" tick={{ fontSize: 11 }} />
                    <YAxis
                      yAxisId="right"
                      orientation="right"
                      domain={[0, 100]}
                      tick={{ fontSize: 11 }}
                      unit="%"
                    />
                    <Tooltip
                      cursor={{ fill: theme === "dark" ? "rgba(255, 255, 255, 0.08)" : "rgba(0, 0, 0, 0.05)" }}
                      contentStyle={{
                        backgroundColor: theme === "dark" ? "#1e293b" : "#ffffff",
                        borderColor: theme === "dark" ? "#334155" : "#e2e8f0",
                        borderRadius: "12px",
                        color: theme === "dark" ? "#f8fafc" : "#0f172a",
                        fontSize: "12px",
                        boxShadow: "0 10px 15px -3px rgba(0, 0, 0, 0.3)",
                      }}
                      itemStyle={{
                        color: theme === "dark" ? "#f8fafc" : "#0f172a",
                        fontSize: "12px",
                      }}
                      labelStyle={{
                        color: theme === "dark" ? "#f8fafc" : "#0f172a",
                        fontWeight: "bold",
                        marginBottom: "4px",
                      }}
                    />
                    <Legend wrapperStyle={{ fontSize: "11px", paddingTop: "8px" }} />
                    <Bar yAxisId="left" dataKey="issued" fill="#f59e0b" radius={[4, 4, 0, 0]} name="Tổng phát ra" />
                    <Bar yAxisId="left" dataKey="posted" fill="#3b82f6" radius={[4, 4, 0, 0]} name="Đã quy đổi" />
                    <Line yAxisId="right" type="monotone" dataKey="rate" stroke="#10b981" strokeWidth={2.5} name="Tỷ lệ quy đổi %" dot={{ r: 4 }} />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            </Card>

            {/* Executive Analysis & Quick Metrics Card */}
            <Card className="lg:col-span-5 p-4 sm:p-5 rounded-2xl border border-amber-500/30 bg-card shadow-xs flex flex-col justify-between space-y-4">
              <div className="space-y-3">
                <div className="flex items-center gap-2 border-b border-border/60 pb-2.5">
                  <Sparkles className="w-4 h-4 text-amber-500" />
                  <h4 className="text-sm font-extrabold text-foreground">
                    Tóm Tắt &amp; Nhận Định
                  </h4>
                </div>

                <div className="grid grid-cols-3 gap-2 text-xs">
                  <div className="p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-center">
                    <div className="text-[11px] text-muted-foreground font-medium">Tổng Phát Hành</div>
                    <div className="text-base font-black text-amber-600 dark:text-amber-400 mt-0.5">
                      {userDept.totalIssued.toLocaleString("vi-VN")}
                    </div>
                  </div>
                  <div className="p-2.5 rounded-xl bg-blue-500/10 border border-blue-500/20 text-center">
                    <div className="text-[11px] text-muted-foreground font-medium">Đã Quy Đổi</div>
                    <div className="text-base font-black text-blue-600 dark:text-blue-400 mt-0.5">
                      {userDept.totalPosted.toLocaleString("vi-VN")}
                    </div>
                  </div>
                  <div className="p-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-center">
                    <div className="text-[11px] text-muted-foreground font-medium">Tỷ Lệ Quy Đổi</div>
                    <div className="text-base font-black text-emerald-600 dark:text-emerald-400 mt-0.5">
                      {userDept.overallRate}%
                    </div>
                  </div>
                </div>

                <div className="p-3 rounded-xl bg-muted/60 text-xs text-foreground space-y-2">
                  <div className="font-extrabold text-amber-600 dark:text-amber-400 flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                    <span>Nhận định đánh giá ({userDept.meta.name}):</span>
                  </div>
                  {userDept.overallRate >= 60 ? (
                    <p className="leading-relaxed font-medium">
                      Nhà hàng đạt tỷ lệ sử dụng voucher cao (<strong className="text-emerald-600 dark:text-emerald-400">{userDept.overallRate}%</strong>). Khối lượng voucher phát hành thu hút khách hàng đến quy đổi hiệu quả.
                    </p>
                  ) : userDept.overallRate >= 30 ? (
                    <p className="leading-relaxed font-medium">
                      Nhà hàng ghi nhận tỷ lệ quy đổi <strong className="text-amber-600 dark:text-amber-400">{userDept.overallRate}%</strong>. Đơn vị cần duy trì tư vấn ưu đãi cho khách hàng tại điểm phục vụ.
                    </p>
                  ) : (
                    <p className="leading-relaxed font-medium">
                      Tỷ lệ quy đổi hiện đạt <strong className="text-orange-600 dark:text-orange-400">{userDept.overallRate}%</strong>. Đơn vị cần tăng cường giới thiệu chương trình voucher trực tiếp đến khách hàng.
                    </p>
                  )}
                </div>
              </div>

              <div className="p-3 rounded-xl bg-amber-500/5 border border-amber-500/15 text-[11px] text-muted-foreground flex items-center justify-between">
                <span>Trạng thái ghi nhận số liệu</span>
                <span className="font-bold text-foreground">{userDept.meta.name}</span>
              </div>
            </Card>
          </div>

          {/* Table: Bảng Nhật Ký Hoạt Động Hàng Ngày */}
          <Card className="p-4 sm:p-5 rounded-2xl border border-border/80 bg-card shadow-xs space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-border/60 pb-3">
              <div>
                <h4 className="text-sm sm:text-base font-extrabold text-foreground flex items-center gap-2">
                  <Calendar className="w-4 h-4 text-amber-500" />
                  <span>Nhật Ký Số Liệu Hàng Ngày ({userDept.meta.name})</span>
                </h4>
                <p className="text-[11px] text-muted-foreground">
                  Số lượng voucher phát ra, đã đổi và mức độ tăng/giảm so với ngày trước đó
                </p>
              </div>
            </div>

            <div className="overflow-x-auto rounded-xl border border-border/80">
              <table className="w-full text-xs text-left">
                <thead className="bg-muted/70 text-muted-foreground uppercase text-[10px] font-extrabold tracking-wider border-b border-border">
                  <tr>
                    <th className="px-4 py-3">Ngày</th>
                    <th className="px-3 py-3 text-right">Phát Hành</th>
                    <th className="px-3 py-3 text-right">Khách Đã Đổi</th>
                    <th className="px-3 py-3 text-right">Chưa Dùng / Đã Hủy</th>
                    <th className="px-3 py-3 text-center">Tỷ Lệ Đổi</th>
                    <th className="px-4 py-3 text-right">So Với Ngày Trước</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/70 font-semibold">
                  {userDept.dailyList.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-4 py-6 text-center text-muted-foreground">
                        Chưa có dữ liệu phát hành trong khoảng thời gian này.
                      </td>
                    </tr>
                  ) : (
                    userDept.dailyList.map((rec) => (
                      <tr key={rec.date} className="hover:bg-amber-500/5 transition-colors">
                        <td className="px-4 py-3 font-extrabold text-foreground">{rec.date}</td>
                        <td className="px-3 py-3 text-right font-black text-amber-600 dark:text-amber-400">
                          {rec.issued.toLocaleString("vi-VN")}
                        </td>
                        <td className="px-3 py-3 text-right font-bold text-blue-600 dark:text-blue-400">
                          {rec.posted.toLocaleString("vi-VN")}
                        </td>
                        <td className="px-3 py-3 text-right text-muted-foreground font-medium">
                          {rec.cancelled.toLocaleString("vi-VN")}
                        </td>
                        <td className="px-3 py-3 text-center">
                          <span className="px-2 py-0.5 rounded-md bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 font-extrabold text-xs">
                            {rec.rate}%
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right font-extrabold">
                          {rec.isFirstDay ? (
                            <span className="text-muted-foreground/60 text-[11px]">- (Ngày đầu)</span>
                          ) : rec.diff > 0 ? (
                            <span className="text-emerald-600 dark:text-emerald-400 inline-flex items-center gap-1">
                              <TrendingUp className="w-3.5 h-3.5" /> +{rec.diff.toLocaleString("vi-VN")} (+{rec.pctChange}%)
                            </span>
                          ) : rec.diff < 0 ? (
                            <span className="text-red-600 dark:text-red-400 inline-flex items-center gap-1">
                              <TrendingDown className="w-3.5 h-3.5" /> {rec.diff.toLocaleString("vi-VN")} ({rec.pctChange}%)
                            </span>
                          ) : (
                            <span className="text-muted-foreground inline-flex items-center gap-1">
                              <Minus className="w-3.5 h-3.5" /> 0 (0%)
                            </span>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      )}

      {/* Multi-Department Section ONLY for ADMIN */}
      {isAdmin && (
        <div className="space-y-5 pt-2">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 border-b border-border/60 pb-3">
            <div className="flex items-center gap-2.5">
              <div className="p-2 rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
                <BarChart2 className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base sm:text-lg font-black text-foreground tracking-tight flex items-center gap-2">
                  <span>Báo Cáo Biến Động Vận Hành &amp; Quy Đổi Voucher (FP&amp;A Standard)</span>
                  <Sparkles className="w-4 h-4 text-amber-500" />
                </h3>
                <p className="text-xs text-muted-foreground">
                  Phân tích Ma trận Chuỗi Thời Gian (Time-Series Matrix) &amp; Biến động Ngày-qua-Ngày (DoD Variance)
                </p>
              </div>
            </div>
            <span className="text-[11px] font-extrabold text-amber-800 dark:text-amber-300 bg-amber-500/10 border border-amber-500/20 px-3 py-1.5 rounded-xl self-start md:self-auto shrink-0">
              {departmentFluctuations.deptSummaries.length} Bộ Phận Trong Kỳ
            </span>
          </div>

        {/* FP&A Executive Commentary & Key Insight Highlights */}
        <Card className="p-4 sm:p-5 rounded-2xl border border-amber-500/30 bg-gradient-to-br from-amber-500/[0.04] via-card to-card shadow-xs space-y-3">
          <div className="flex items-center gap-2 text-xs font-black text-amber-800 dark:text-amber-300 uppercase tracking-wider">
            <Sparkles className="w-4 h-4 text-amber-500" />
            <span>Đánh Giá Báo Cáo Điều Hành FP&amp;A (Executive Highlights)</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
            <div className="p-3 rounded-xl bg-background border border-border/70 space-y-1">
              <span className="font-extrabold text-amber-600 dark:text-amber-400 block text-[11px]">
                1. Động Lực Khối Lượng (Volume Driver)
              </span>
              <p className="text-muted-foreground text-[11px] leading-relaxed">
                {(() => {
                  const sortedDepts = [...departmentFluctuations.deptSummaries].sort(
                    (a, b) => b.totalIssued - a.totalIssued
                  );
                  if (sortedDepts.length === 0) return "Chưa có dữ liệu trong kỳ.";
                  const topDept = sortedDepts[0];
                  return `${topDept.meta.name} đóng góp khối lượng phát hành lớn nhất với ${topDept.totalIssued.toLocaleString("vi-VN")} vé (trung bình ${topDept.avgDaily.toLocaleString("vi-VN")} vé/ngày).`;
                })()}
              </p>
            </div>

            <div className="p-3 rounded-xl bg-background border border-border/70 space-y-1">
              <span className="font-extrabold text-emerald-600 dark:text-emerald-400 block text-[11px]">
                2. Hiệu Quả Quy Đổi (Redemption Rate)
              </span>
              <p className="text-muted-foreground text-[11px] leading-relaxed">
                {(() => {
                  const sortedRate = [...departmentFluctuations.deptSummaries].sort(
                    (a, b) => b.overallRate - a.overallRate
                  );
                  if (sortedRate.length === 0) return "Chưa có dữ liệu trong kỳ.";
                  const bestRate = sortedRate[0];
                  return `${bestRate.meta.name} dẫn đầu tỷ lệ chuyển đổi đạt ${bestRate.overallRate}% (thực thu ${bestRate.totalPosted.toLocaleString("vi-VN")} hóa đơn). Tỷ lệ thất thoát/hủy toàn bộ phận duy trì thấp.`;
                })()}
              </p>
            </div>

            <div className="p-3 rounded-xl bg-background border border-border/70 space-y-1">
              <span className="font-extrabold text-blue-600 dark:text-blue-400 block text-[11px]">
                3. Xu Hướng Biến Động DoD (Day-over-Day Trend)
              </span>
              <p className="text-muted-foreground text-[11px] leading-relaxed">
                {(() => {
                  const latestDate = departmentFluctuations.allDailyFlat[0]?.date || "";
                  const latestItems = departmentFluctuations.allDailyFlat.filter(
                    (i) => i.date === latestDate && !i.isFirstDay
                  );
                  if (latestItems.length === 0)
                    return "Số liệu ổn định qua các ngày khảo sát.";
                  const maxDrop = [...latestItems].sort((a, b) => a.diff - b.diff)[0];
                  const maxUp = [...latestItems].sort((a, b) => b.diff - a.diff)[0];
                  if (maxDrop && maxDrop.diff < 0) {
                    return `Ngày ${latestDate}: ${maxDrop.restaurantName} điều chỉnh giảm ${Math.abs(maxDrop.diff).toLocaleString("vi-VN")} vé (${maxDrop.pctChange}%) so với ngày trước.`;
                  }
                  if (maxUp && maxUp.diff > 0) {
                    return `Ngày ${latestDate}: ${maxUp.restaurantName} tăng trưởng +${maxUp.diff.toLocaleString("vi-VN")} vé (+${maxUp.pctChange}%) so với ngày trước.`;
                  }
                  return `Ngày ${latestDate}: Biến động phát hành ở mức cân bằng giữa các nhà hàng.`;
                })()}
              </p>
            </div>
          </div>
        </Card>

        {/* 4 Department Overview Metric Cards */}
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
                      className={`w-3.5 h-3.5 rounded-full bg-gradient-to-r ${dept.meta.color}`}
                    />
                    <h4 className="font-extrabold text-sm text-foreground">
                      {dept.meta.name}
                    </h4>
                  </div>
                  {hasData && (
                    <span
                      className={`text-[10px] font-extrabold px-2.5 py-0.5 rounded-full flex items-center gap-1 ${
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
                  <div className="p-2.5 rounded-xl bg-background border border-border/60">
                    <span className="text-[10px] text-muted-foreground font-semibold block">
                      Tổng Phát Ra
                    </span>
                    <span className="text-base font-black text-foreground">
                      {dept.totalIssued.toLocaleString("vi-VN")}
                    </span>
                  </div>
                  <div className="p-2.5 rounded-xl bg-background border border-border/60">
                    <span className="text-[10px] text-muted-foreground font-semibold block">
                      Đã Quy Đổi
                    </span>
                    <span className="text-base font-black text-blue-600 dark:text-blue-400">
                      {dept.totalPosted.toLocaleString("vi-VN")}
                    </span>
                  </div>
                </div>

                <div className="space-y-1.5 text-xs pt-1 border-t border-border/50">
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-muted-foreground font-medium">Tỷ Lệ Quy Đổi:</span>
                    <span className="font-extrabold text-foreground">{dept.overallRate}%</span>
                  </div>
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-muted-foreground font-medium">Trung Bình Ngày:</span>
                    <span className="font-bold text-amber-600 dark:text-amber-400">
                      {dept.avgDaily.toLocaleString("vi-VN")} vé/ngày
                    </span>
                  </div>
                  {dept.peakRecord && (
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="text-muted-foreground font-medium">Đỉnh Phát Hành:</span>
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

        {/* Primary FP&A Pivot Matrix Table (Chuỗi Thời Gian Theo Nhà Hàng) */}
        <Card className="p-4 sm:p-5 rounded-2xl border border-border/80 bg-card shadow-xs space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-border/60 pb-3">
            <div>
              <h4 className="text-sm sm:text-base font-extrabold text-foreground flex items-center gap-2">
                <BarChart2 className="w-4 h-4 text-amber-500" />
                <span>Bảng Ma Trận Khối Lượng Phát Hành &amp; Quy Đổi Theo Nhà Hàng (FP&amp;A Time-Series Matrix)</span>
              </h4>
              <p className="text-[11px] text-muted-foreground">
                Mỗi bộ phận được nhóm riêng theo dòng, các cột thể hiện chuỗi thời gian ngày thực hiện
              </p>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-bold text-muted-foreground bg-amber-500/10 text-amber-700 dark:text-amber-300 px-3 py-1 rounded-lg border border-amber-500/20">
                Đơn vị: Vé / Coupon
              </span>
            </div>
          </div>

          {/* Pivot Table Rendering */}
          <div className="overflow-x-auto rounded-xl border border-border/80">
            {(() => {
              // Extract all unique dates sorted ascending
              const uniqueDates = Array.from(
                new Set(departmentFluctuations.allDailyFlat.map((d) => d.date))
              ).sort();

              return (
                <table className="w-full text-xs text-left">
                  <thead className="bg-muted/70 text-muted-foreground uppercase text-[10px] font-extrabold tracking-wider border-b border-border">
                    <tr>
                      <th className="px-4 py-3 min-w-[150px]">Bộ Phận / Nhà Hàng</th>
                      <th className="px-3 py-3 min-w-[90px]">Chỉ Số FP&amp;A</th>
                      {uniqueDates.map((date) => (
                        <th key={date} className="px-3 py-3 text-right min-w-[95px]">
                          {date}
                        </th>
                      ))}
                      <th className="px-3.5 py-3 text-right min-w-[110px] bg-amber-500/10 text-amber-800 dark:text-amber-300">
                        Tổng Trong Kỳ
                      </th>
                      <th className="px-3.5 py-3 text-center min-w-[110px] bg-amber-500/10 text-amber-800 dark:text-amber-300">
                        Hiệu Suất TB
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/70 font-semibold">
                    {departmentFluctuations.deptSummaries.map((dept) => {
                      // Map date to record
                      const dateMap: Record<string, (typeof departmentFluctuations.allDailyFlat)[0]> = {};
                      dept.dailyList.forEach((item) => {
                        dateMap[item.date] = item;
                      });

                      return (
                        <tr
                          key={dept.deptId}
                          className="hover:bg-amber-500/5 transition-colors group"
                        >
                          <td className="px-4 py-3 font-extrabold text-foreground align-middle border-r border-border/50">
                            <div className="flex items-center gap-2">
                              <div
                                className={`w-2.5 h-2.5 rounded-full bg-gradient-to-r ${dept.meta.color}`}
                              />
                              <span className={dept.meta.textCol}>{dept.meta.name}</span>
                            </div>
                          </td>

                          <td className="px-3 py-3 font-bold text-muted-foreground align-middle border-r border-border/50 space-y-1 text-[11px]">
                            <div className="text-foreground font-extrabold">Phát Hành</div>
                            <div className="text-blue-600 dark:text-blue-400">Đã Quy Đổi</div>
                            <div className="text-emerald-600 dark:text-emerald-400">% Chuyển Đổi</div>
                          </td>

                          {uniqueDates.map((date) => {
                            const rec = dateMap[date];
                            if (!rec) {
                              return (
                                <td
                                  key={date}
                                  className="px-3 py-3 text-right text-muted-foreground/40 align-middle border-r border-border/30 text-[11px]"
                                >
                                  -
                                </td>
                              );
                            }

                            return (
                              <td
                                key={date}
                                className="px-3 py-3 text-right align-middle border-r border-border/30 space-y-1 text-[11px]"
                              >
                                <div className="font-black text-foreground">
                                  {rec.issued.toLocaleString("vi-VN")}
                                </div>
                                <div className="font-bold text-blue-600 dark:text-blue-400">
                                  {rec.posted.toLocaleString("vi-VN")}
                                </div>
                                <div>
                                  <span className="px-1.5 py-0.5 rounded-md bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 font-extrabold text-[10px]">
                                    {rec.rate}%
                                  </span>
                                </div>
                              </td>
                            );
                          })}

                          <td className="px-3.5 py-3 text-right align-middle bg-amber-500/[0.03] border-r border-border/50 space-y-1 text-[11px]">
                            <div className="font-black text-foreground text-xs">
                              {dept.totalIssued.toLocaleString("vi-VN")}
                            </div>
                            <div className="font-bold text-blue-600 dark:text-blue-400">
                              {dept.totalPosted.toLocaleString("vi-VN")}
                            </div>
                            <div className="text-muted-foreground text-[10px]">
                              Thất thoát: {dept.totalCancelled.toLocaleString("vi-VN")}
                            </div>
                          </td>

                          <td className="px-3.5 py-3 text-center align-middle bg-amber-500/[0.03] space-y-1">
                            <span className="inline-block px-2.5 py-1 rounded-lg bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 font-black text-xs border border-emerald-500/30">
                              {dept.overallRate}%
                            </span>
                            <div className="text-[10px] text-muted-foreground font-semibold">
                              TB {dept.avgDaily.toLocaleString("vi-VN")}/ngày
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              );
            })()}
          </div>
        </Card>

        {/* Visual Charts Complementing the FP&A Time-Series Matrix */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Chart 1: Daily Issuance Volume Trend */}
          <Card className="p-4 sm:p-5 rounded-2xl border border-border/80 bg-card shadow-xs space-y-3">
            <div className="flex items-center justify-between border-b border-border/60 pb-2.5">
              <div>
                <h4 className="text-sm font-extrabold text-foreground flex items-center gap-2">
                  <BarChart2 className="w-4 h-4 text-amber-500" />
                  <span>Diễn Biến Phát Hành Theo Ngày Của Các Bộ Phận</span>
                </h4>
                <p className="text-[11px] text-muted-foreground">
                  Trực quan hóa khối lượng vé phát hành từng ngày giúp nhận diện xu hướng &amp; peak day
                </p>
              </div>
            </div>

            <div className="h-[280px] w-full pt-2">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={departmentFluctuations.timeSeriesChartData}
                  margin={{ top: 10, right: 10, left: -15, bottom: 0 }}
                >
                  <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                  <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip
                    cursor={{ fill: theme === "dark" ? "rgba(255, 255, 255, 0.08)" : "rgba(0, 0, 0, 0.05)" }}
                    contentStyle={{
                      backgroundColor: theme === "dark" ? "#1e293b" : "#ffffff",
                      borderColor: theme === "dark" ? "#334155" : "#e2e8f0",
                      borderRadius: "12px",
                      color: theme === "dark" ? "#f8fafc" : "#0f172a",
                      fontSize: "12px",
                      boxShadow: "0 10px 15px -3px rgba(0, 0, 0, 0.3)",
                    }}
                    itemStyle={{
                      color: theme === "dark" ? "#f8fafc" : "#0f172a",
                      fontSize: "12px",
                    }}
                    labelStyle={{
                      color: theme === "dark" ? "#f8fafc" : "#0f172a",
                      fontWeight: "bold",
                      marginBottom: "4px",
                    }}
                  />
                  <Legend wrapperStyle={{ fontSize: "11px", paddingTop: "8px" }} />
                  <Bar dataKey="Lễ Hội Bia" fill="#f59e0b" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="Nhà Hàng 1901" fill="#f97316" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="Beer Plaza" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="Maison Kayser" fill="#10b981" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Card>

          {/* Chart 2: Department Efficiency & Conversion Comparison */}
          <Card className="p-4 sm:p-5 rounded-2xl border border-border/80 bg-card shadow-xs space-y-3">
            <div className="flex items-center justify-between border-b border-border/60 pb-2.5">
              <div>
                <h4 className="text-sm font-extrabold text-foreground flex items-center gap-2">
                  <PieChartIcon className="w-4 h-4 text-blue-500" />
                  <span>So Sánh Tỷ Lệ Quy Đổi Thực Thu vs Phát Hành</span>
                </h4>
                <p className="text-[11px] text-muted-foreground">
                  So sánh khối lượng phát hành, quy đổi và % hiệu suất chuyển đổi của từng nhà hàng
                </p>
              </div>
            </div>

            <div className="h-[280px] w-full pt-2">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart
                  data={departmentFluctuations.departmentChartData}
                  margin={{ top: 10, right: 10, left: -15, bottom: 0 }}
                >
                  <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                  <YAxis yAxisId="left" tick={{ fontSize: 11 }} />
                  <YAxis
                    yAxisId="right"
                    orientation="right"
                    domain={[0, 100]}
                    tick={{ fontSize: 11 }}
                    unit="%"
                  />
                  <Tooltip
                    cursor={{ fill: theme === "dark" ? "rgba(255, 255, 255, 0.08)" : "rgba(0, 0, 0, 0.05)" }}
                    contentStyle={{
                      backgroundColor: theme === "dark" ? "#1e293b" : "#ffffff",
                      borderColor: theme === "dark" ? "#334155" : "#e2e8f0",
                      borderRadius: "12px",
                      color: theme === "dark" ? "#f8fafc" : "#0f172a",
                      fontSize: "12px",
                      boxShadow: "0 10px 15px -3px rgba(0, 0, 0, 0.3)",
                    }}
                    itemStyle={{
                      color: theme === "dark" ? "#f8fafc" : "#0f172a",
                      fontSize: "12px",
                    }}
                    labelStyle={{
                      color: theme === "dark" ? "#f8fafc" : "#0f172a",
                      fontWeight: "bold",
                      marginBottom: "4px",
                    }}
                  />
                  <Legend wrapperStyle={{ fontSize: "11px", paddingTop: "8px" }} />
                  <Bar yAxisId="left" dataKey="Tổng Phát Ra" fill="#94a3b8" radius={[4, 4, 0, 0]} />
                  <Bar yAxisId="left" dataKey="Đã Quy Đổi" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                  <Line
                    yAxisId="right"
                    type="monotone"
                    dataKey="Tỷ Lệ Quy Đổi"
                    stroke="#10b981"
                    strokeWidth={3}
                    dot={{ r: 5 }}
                  />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </Card>
        </div>
      </div>
    )}
  </div>
);
}


