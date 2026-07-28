import { useState, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  ComposedChart,
  Bar,
  Line,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  BarChart,
} from "recharts";
import { Skeleton } from "@/components/ui/skeleton";
import {
  BarChart3,
  TrendingUp,
  Ticket,
  FileCheck,
  Percent,
  Building2,
  XCircle,
  Award,
  Filter,
  PieChart as PieChartIcon,
  Calendar,
  Sparkles,
  Activity,
  Flame,
  CheckCircle2,
  AlertTriangle,
} from "lucide-react";
import { useAuth } from "@/_core/hooks/useAuth";
import { useTheme } from "@/contexts/ThemeContext";
import { getVouchersByDateRange, VoucherRecord, getLocalDateString } from "@/lib/firestoreService";

const RESTAURANTS = [
  { id: "all", name: "Tất Cả Nhà Hàng" },
  { id: "lehoibia", name: "Lễ Hội Bia" },
  { id: "1901", name: "Nhà Hàng 1901" },
  { id: "beerplaza", name: "Beer Plaza" },
  { id: "maisonkayser", name: "Maison Kayser" },
];

interface AnalyticsChartsProps {
  startDate?: string;
  endDate?: string;
  selectedRestaurant?: string;
  onStartDateChange?: (date: string) => void;
  onEndDateChange?: (date: string) => void;
  onRestaurantChange?: (restId: string) => void;
}

export function AnalyticsCharts({
  startDate: propStartDate,
  endDate: propEndDate,
  selectedRestaurant: propSelectedRestaurant,
  onStartDateChange,
  onEndDateChange,
  onRestaurantChange,
}: AnalyticsChartsProps = {}) {
  const { user } = useAuth();
  const { theme } = useTheme();
  const isAdmin = user?.role === "admin";

  const [internalRestaurant, setInternalRestaurant] = useState<string>("all");

  const [internalStartDate, setInternalStartDate] = useState<string>(() => {
    const date = new Date();
    date.setDate(date.getDate() - 7);
    return getLocalDateString(date);
  });

  const [internalEndDate, setInternalEndDate] = useState<string>(() => getLocalDateString());

  const startDate = propStartDate ?? internalStartDate;
  const endDate = propEndDate ?? internalEndDate;
  const selectedRestaurant = propSelectedRestaurant ?? internalRestaurant;

  const handleUpdateStartDate = (val: string) => {
    setInternalStartDate(val);
    if (onStartDateChange) onStartDateChange(val);
  };

  const handleUpdateEndDate = (val: string) => {
    setInternalEndDate(val);
    if (onEndDateChange) onEndDateChange(val);
  };

  const handleUpdateRestaurant = (val: string) => {
    setInternalRestaurant(val);
    if (onRestaurantChange) onRestaurantChange(val);
  };

  const [records, setRecords] = useState<VoucherRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;
    async function loadData() {
      setIsLoading(true);
      try {
        const filterRest = isAdmin ? selectedRestaurant : (user?.username || user?.id || "lehoibia");
        const data = await getVouchersByDateRange(filterRest, startDate, endDate);
        if (isMounted) setRecords(data);
      } catch (e) {
        console.error("Error loading analytics data:", e);
      } finally {
        if (isMounted) setIsLoading(false);
      }
    }
    loadData();
    return () => {
      isMounted = false;
    };
  }, [selectedRestaurant, startDate, endDate, isAdmin, user?.username, user?.id]);

  const handleSetLastDays = (days: number) => {
    const end = new Date();
    const start = new Date();
    start.setDate(start.getDate() - days);
    const startStr = getLocalDateString(start);
    const endStr = getLocalDateString(end);
    handleUpdateStartDate(startStr);
    handleUpdateEndDate(endStr);
  };

  // Group daily totals for combined chart
  const dailyDataMap = new Map<string, { date: string; totalIssued: number; postedBills: number; cancelled: number; potato: number; beer: number; bakery: number }>();

  // Group by restaurant for restaurant breakdown comparison
  const restaurantDataMap = new Map<string, { restaurantId: string; name: string; totalIssued: number; postedBills: number; cancelled: number; potato: number; beer: number; bakery: number }>();

  RESTAURANTS.filter((r) => r.id !== "all").forEach((r) => {
    restaurantDataMap.set(r.id, {
      restaurantId: r.id,
      name: r.name,
      totalIssued: 0,
      postedBills: 0,
      cancelled: 0,
      potato: 0,
      beer: 0,
      bakery: 0,
    });
  });

  records.forEach((record) => {
    // Daily map
    const existingDay = dailyDataMap.get(record.date) || {
      date: record.date,
      totalIssued: 0,
      postedBills: 0,
      cancelled: 0,
      potato: 0,
      beer: 0,
      bakery: 0,
    };
    const bakery = record.bakeryCoupons || 0;
    const potato = record.potatoCoupons ?? (bakery > 0 ? 0 : Math.round((record.postedBills || 0) / 2));
    const beer = record.beerCoupons ?? (bakery > 0 ? 0 : ((record.postedBills || 0) - potato));
    const cancelled = record.cancelled || 0;
    const posted = record.postedBills || 0;
    const issued = record.totalIssued || (potato + beer + bakery + cancelled);

    existingDay.totalIssued += issued;
    existingDay.postedBills += posted;
    existingDay.cancelled += cancelled;
    existingDay.potato += potato;
    existingDay.beer += beer;
    existingDay.bakery += bakery;
    dailyDataMap.set(record.date, existingDay);

    // Restaurant map
    const rId = record.restaurantId;
    if (restaurantDataMap.has(rId)) {
      const existingR = restaurantDataMap.get(rId)!;
      existingR.totalIssued += issued;
      existingR.postedBills += posted;
      existingR.cancelled += cancelled;
      existingR.potato += potato;
      existingR.beer += beer;
      existingR.bakery += bakery;
    }
  });

  const dailyChartData = Array.from(dailyDataMap.values())
    .map((d) => ({
      ...d,
      utilizationRate: d.totalIssued > 0 ? Math.round((d.postedBills / d.totalIssued) * 100) : 0,
    }))
    .sort((a, b) => a.date.localeCompare(b.date));

  const restaurantComparisonData = Array.from(restaurantDataMap.values()).map((r) => ({
    ...r,
    utilizationRate: r.totalIssued > 0 ? Math.round((r.postedBills / r.totalIssued) * 100) : 0,
  }));

  // Overall Stats
  const totalIssuedAll = dailyChartData.reduce((sum, d) => sum + d.totalIssued, 0);
  const totalPostedAll = dailyChartData.reduce((sum, d) => sum + d.postedBills, 0);
  const totalCancelledAll = dailyChartData.reduce((sum, d) => sum + d.cancelled, 0);
  const totalPotatoAll = dailyChartData.reduce((sum, d) => sum + d.potato, 0);
  const totalBeerAll = dailyChartData.reduce((sum, d) => sum + d.beer, 0);
  const totalBakeryAll = dailyChartData.reduce((sum, d) => sum + d.bakery, 0);

  const overallUtilizationRate = totalIssuedAll > 0 ? Math.round((totalPostedAll / totalIssuedAll) * 100) : 0;

  // Best performing restaurant
  const topRestaurant = [...restaurantComparisonData].sort((a, b) => b.utilizationRate - a.utilizationRate)[0];

  // Specific Detailed Analysis metrics for Right Panel
  const daysCount = dailyChartData.length || 1;
  const avgIssuedPerDay = Math.round(totalIssuedAll / daysCount);
  const avgPostedPerDay = Math.round(totalPostedAll / daysCount);
  const avgCancelledPerDay = Math.round(totalCancelledAll / daysCount);

  const peakIssuedDay = [...dailyChartData].sort((a, b) => b.totalIssued - a.totalIssued)[0];
  const peakRateDay = [...dailyChartData].sort((a, b) => b.utilizationRate - a.utilizationRate)[0];
  const cancellationRate = totalIssuedAll > 0 ? ((totalCancelledAll / totalIssuedAll) * 100).toFixed(1) : "0";

  const pieCouponData = [
    { name: "Coupon Khoai Tây", value: totalPotatoAll, color: "#f59e0b" },
    { name: "Coupon Beer", value: totalBeerAll, color: "#3b82f6" },
    { name: "Voucher Bánh", value: totalBakeryAll, color: "#10b981" },
    { name: "Coupon Đã Hủy", value: totalCancelledAll, color: "#ef4444" },
  ].filter((d) => d.value > 0);

  return (
    <div className="space-y-6">
      {/* Top Filter Controls Card */}
      <Card className="p-4 sm:p-5 rounded-2xl border border-border/80 bg-card shadow-sm">
        <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4">
          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-amber-600 dark:text-amber-400">
              <Filter className="w-4 h-4 text-amber-500" />
              <span>Thanh Lọc Khoảng Thời Gian:</span>
            </div>

            {isAdmin && (
              <select
                value={selectedRestaurant}
                onChange={(e) => handleUpdateRestaurant(e.target.value)}
                className="px-3 py-1.5 rounded-xl bg-background border border-amber-500/30 text-xs font-bold text-foreground focus:outline-none focus:ring-2 focus:ring-amber-500/30 shadow-xs cursor-pointer"
              >
                {RESTAURANTS.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
              </select>
            )}

            {/* Quick Presets */}
            <div className="flex items-center gap-1 bg-amber-500/10 p-1 rounded-xl border border-amber-500/20">
              <Button
                type="button"
                onClick={() => handleSetLastDays(7)}
                variant="ghost"
                size="sm"
                className={`text-xs font-bold rounded-lg h-7 px-2.5 transition-all ${
                  startDate === getLocalDateString(new Date(Date.now() - 7 * 86400000))
                    ? "bg-amber-500 text-white shadow-xs"
                    : "text-foreground hover:bg-amber-500/20"
                }`}
              >
                7 ngày (Mặc định)
              </Button>
              <Button
                type="button"
                onClick={() => handleSetLastDays(14)}
                variant="ghost"
                size="sm"
                className="text-xs font-semibold rounded-lg h-7 px-2 text-foreground hover:bg-amber-500/20"
              >
                14 ngày
              </Button>
              <Button
                type="button"
                onClick={() => handleSetLastDays(30)}
                variant="ghost"
                size="sm"
                className="text-xs font-semibold rounded-lg h-7 px-2 text-foreground hover:bg-amber-500/20"
              >
                30 ngày
              </Button>
              <Button
                type="button"
                onClick={() => handleSetLastDays(90)}
                variant="ghost"
                size="sm"
                className="text-xs font-semibold rounded-lg h-7 px-2 text-foreground hover:bg-amber-500/20"
              >
                90 ngày
              </Button>
            </div>
          </div>

          {/* Custom Date Range Selectors */}
          <div className="flex items-center gap-2 shrink-0 bg-background/80 border border-border p-1.5 rounded-xl shadow-xs">
            <Calendar className="w-3.5 h-3.5 text-amber-500 ml-1" />
            <span className="text-xs text-muted-foreground font-semibold">Từ:</span>
            <input
              type="date"
              value={startDate}
              onChange={(e) => handleUpdateStartDate(e.target.value)}
              className="px-2 py-1 rounded-lg bg-card border border-border text-xs font-bold text-foreground focus:outline-none focus:ring-2 focus:ring-amber-500/30 cursor-pointer"
            />
            <span className="text-xs text-muted-foreground font-semibold">đến:</span>
            <input
              type="date"
              value={endDate}
              onChange={(e) => handleUpdateEndDate(e.target.value)}
              className="px-2 py-1 rounded-lg bg-card border border-border text-xs font-bold text-foreground focus:outline-none focus:ring-2 focus:ring-amber-500/30 cursor-pointer"
            />
          </div>
        </div>
      </Card>

      {/* KPI Overview Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="p-5 rounded-xl border border-purple-500/30 bg-purple-500/5 shadow-sm">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
              Tỷ Lệ Quy Đổi TB
            </span>
            <div className="p-2 rounded-lg bg-purple-500/10 text-purple-600 dark:text-purple-400">
              <Percent className="w-4 h-4" />
            </div>
          </div>
          <div className="text-3xl font-extrabold text-foreground">{overallUtilizationRate}%</div>
          <p className="text-xs text-muted-foreground mt-1">
            Hiệu suất sử dụng voucher toàn kỳ
          </p>
        </Card>

        <Card className="p-5 rounded-xl border border-blue-500/30 bg-blue-500/5 shadow-sm">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
              Tổng Voucher Phát Hành
            </span>
            <div className="p-2 rounded-lg bg-blue-500/10 text-blue-600 dark:text-blue-400">
              <Ticket className="w-4 h-4" />
            </div>
          </div>
          <div className="text-3xl font-extrabold text-foreground">
            {totalIssuedAll.toLocaleString("vi-VN")}
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            Tổng số lượng voucher BTC / Cổng phát ra
          </p>
        </Card>

        <Card className="p-5 rounded-xl border border-emerald-500/30 bg-emerald-500/5 shadow-sm">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
              Tổng Voucher Thu Về
            </span>
            <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
              <FileCheck className="w-4 h-4" />
            </div>
          </div>
          <div className="text-3xl font-extrabold text-foreground">
            {totalPostedAll.toLocaleString("vi-VN")}
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            ~ {(totalBeerAll * 0.5).toFixed(1)}L Bia & {(totalPotatoAll * 0.1).toFixed(1)}kg Khoai quy đổi
          </p>
        </Card>

        <Card className="p-5 rounded-xl border border-amber-500/30 bg-amber-500/5 shadow-sm">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
              Nhà Hàng Dẫn Đầu
            </span>
            <div className="p-2 rounded-lg bg-amber-500/10 text-amber-600 dark:text-amber-400">
              <Award className="w-4 h-4" />
            </div>
          </div>
          <div className="text-lg font-extrabold text-foreground truncate">
            {topRestaurant ? topRestaurant.name : "N/A"}
          </div>
          <p className="text-xs text-amber-600 dark:text-amber-400 font-bold mt-1">
            {topRestaurant ? `${topRestaurant.utilizationRate}% quy đổi (${topRestaurant.postedBills} HD)` : "Chưa có số liệu"}
          </p>
        </Card>
      </div>

      {/* Product Volume Conversion & Cost Overview Row */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="p-4 rounded-xl border border-blue-500/30 bg-gradient-to-r from-blue-500/10 via-card to-background flex items-center justify-between">
          <div>
            <span className="text-xs font-bold uppercase tracking-wider text-blue-600 dark:text-blue-400">
              🍺 SẢN LƯỢNG & CHI PHÍ BIA
            </span>
            <div className="text-xl sm:text-2xl font-black text-foreground mt-1">
              {(totalBeerAll * 0.5).toLocaleString("vi-VN", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} Lít
            </div>
            <p className="text-[11px] font-bold text-blue-600 dark:text-blue-400 mt-0.5">
              Chi phí: {(totalBeerAll * 16000).toLocaleString("vi-VN")} VNĐ
            </p>
          </div>
          <div className="text-right font-black text-xs text-blue-700 dark:text-blue-300 bg-blue-500/20 px-3 py-1.5 rounded-xl border border-blue-500/30">
            16.000 đ / vé
          </div>
        </Card>

        <Card className="p-4 rounded-xl border border-amber-500/30 bg-gradient-to-r from-amber-500/10 via-card to-background flex items-center justify-between">
          <div>
            <span className="text-xs font-bold uppercase tracking-wider text-amber-600 dark:text-amber-400">
              🍟 KHỐI LƯỢNG & CHI PHÍ KHOAI
            </span>
            <div className="text-xl sm:text-2xl font-black text-foreground mt-1">
              {(totalPotatoAll * 0.1).toLocaleString("vi-VN", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} kg
            </div>
            <p className="text-[11px] font-bold text-amber-600 dark:text-amber-400 mt-0.5">
              Chi phí: {(totalPotatoAll * 13000).toLocaleString("vi-VN")} VNĐ
            </p>
          </div>
          <div className="text-right font-black text-xs text-amber-800 dark:text-amber-300 bg-amber-500/20 px-3 py-1.5 rounded-xl border border-amber-500/30">
            13.000 đ / vé
          </div>
        </Card>

        <Card className="p-4 rounded-xl border border-emerald-500/30 bg-gradient-to-r from-emerald-500/10 via-card to-background flex items-center justify-between">
          <div>
            <span className="text-xs font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
              💰 TỔNG CHI PHÍ VOUCHER
            </span>
            <div className="text-xl sm:text-2xl font-black text-emerald-600 dark:text-emerald-400 mt-1">
              {(totalBeerAll * 16000 + totalPotatoAll * 13000).toLocaleString("vi-VN")} VNĐ
            </div>
            <p className="text-[11px] font-medium text-muted-foreground mt-0.5">
              Bia {(totalBeerAll * 16000).toLocaleString("vi-VN")}đ + Khoai {(totalPotatoAll * 13000).toLocaleString("vi-VN")}đ
            </p>
          </div>
          <div className="text-right font-black text-xs text-emerald-700 dark:text-emerald-300 bg-emerald-500/20 px-3 py-1.5 rounded-xl border border-emerald-500/30">
            Tạm tính
          </div>
        </Card>
      </div>

      {/* Combined Chart (Left) + Detailed Analysis Panel (Right) */}
      {isLoading ? (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <Card className="lg:col-span-7 p-6 rounded-2xl border border-border/80 bg-card h-96">
            <Skeleton className="h-full w-full" />
          </Card>
          <Card className="lg:col-span-5 p-6 rounded-2xl border border-border/80 bg-card h-96">
            <Skeleton className="h-full w-full" />
          </Card>
        </div>
      ) : dailyChartData.length > 0 ? (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* LEFT SIDE: Combined Chart (Issuance, Redemption & Conversion Rate %) */}
          <Card className="lg:col-span-7 p-5 sm:p-6 rounded-2xl border border-border/80 bg-card shadow-sm space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-border/60">
              <div>
                <h4 className="font-extrabold text-base text-foreground flex items-center gap-2">
                  <BarChart3 className="w-5 h-5 text-amber-500" />
                  Báo Cáo Biểu Đồ Tổng Hợp (Phát Hành, Quy Đổi & Xu Hướng %)
                </h4>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Thống kê kết hợp số lượng coupon & đường tỷ lệ quy đổi trong giai đoạn {startDate} → {endDate}
                </p>
              </div>
            </div>

            <ResponsiveContainer width="100%" height={320}>
              <ComposedChart data={dailyChartData} margin={{ top: 15, right: 10, left: -15, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} opacity={0.15} />
                <XAxis dataKey="date" tick={{ fontSize: 11 }} tickLine={false} />
                <YAxis yAxisId="left" tick={{ fontSize: 11 }} tickLine={false} />
                <YAxis
                  yAxisId="right"
                  orientation="right"
                  domain={[0, 100]}
                  unit="%"
                  tick={{ fontSize: 11 }}
                  tickLine={false}
                />
                <Tooltip
                  cursor={{ fill: theme === "dark" ? "rgba(255, 255, 255, 0.08)" : "rgba(0, 0, 0, 0.05)" }}
                  formatter={(value: any, name: any) => {
                    if (name === "Tỷ lệ quy đổi %") return [`${value}%`, name];
                    return [value?.toLocaleString("vi-VN"), name];
                  }}
                  contentStyle={{
                    backgroundColor: theme === "dark" ? "#1e293b" : "#ffffff",
                    borderColor: theme === "dark" ? "#334155" : "#e2e8f0",
                    borderRadius: "10px",
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
                <Legend wrapperStyle={{ fontSize: "12px", paddingTop: "12px" }} />
                <Bar yAxisId="left" dataKey="totalIssued" fill="#3b82f6" radius={[4, 4, 0, 0]} name="Tổng phát ra" />
                <Bar yAxisId="left" dataKey="postedBills" fill="#10b981" radius={[4, 4, 0, 0]} name="Hóa đơn quy đổi" />
                <Bar yAxisId="left" dataKey="cancelled" fill="#ef4444" radius={[4, 4, 0, 0]} name="Đã hủy" />
                <Line
                  yAxisId="right"
                  type="monotone"
                  dataKey="utilizationRate"
                  stroke="#a855f7"
                  name="Tỷ lệ quy đổi %"
                  strokeWidth={3}
                  dot={{ r: 4, fill: "#a855f7", strokeWidth: 2, stroke: "#ffffff" }}
                  activeDot={{ r: 7 }}
                />
              </ComposedChart>
            </ResponsiveContainer>
          </Card>

          {/* RIGHT SIDE: Detailed Analytics Breakdown Panel */}
          <Card className="lg:col-span-5 p-5 sm:p-6 rounded-2xl border border-amber-500/30 bg-gradient-to-br from-card via-card to-amber-500/5 shadow-sm space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-amber-500/20">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400">
                  <Sparkles className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="font-extrabold text-base text-foreground">Phân Tích Chi Tiết Biểu Đồ</h4>
                  <span className="text-xs text-muted-foreground font-medium">
                    Dữ liệu tổng hợp {daysCount} ngày ({startDate} → {endDate})
                  </span>
                </div>
              </div>
            </div>

            {/* Analysis Stats List */}
            <div className="space-y-3.5">
              {/* Daily Average Box */}
              <div className="p-3.5 rounded-xl bg-secondary/50 border border-border/80 space-y-2">
                <div className="flex items-center justify-between text-xs font-bold text-foreground">
                  <span className="flex items-center gap-1.5">
                    <Activity className="w-4 h-4 text-blue-500" />
                    Mức Độ Hoạt Động Trung Bình / Ngày:
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-2 pt-1 text-xs">
                  <div className="bg-background p-2.5 rounded-lg border border-border/60">
                    <span className="text-muted-foreground block text-[11px]">Phát hành TB:</span>
                    <strong className="text-blue-600 dark:text-blue-400 text-sm font-extrabold">
                      {avgIssuedPerDay.toLocaleString()}
                    </strong>{" "}
                    <span className="text-[10px] text-muted-foreground">voucher/ngày</span>
                  </div>
                  <div className="bg-background p-2.5 rounded-lg border border-border/60">
                    <span className="text-muted-foreground block text-[11px]">Quy đổi TB:</span>
                    <strong className="text-emerald-600 dark:text-emerald-400 text-sm font-extrabold">
                      {avgPostedPerDay.toLocaleString()}
                    </strong>{" "}
                    <span className="text-[10px] text-muted-foreground">HĐ/ngày</span>
                  </div>
                </div>
              </div>

              {/* Peak Performance Day Box */}
              <div className="p-3.5 rounded-xl bg-secondary/50 border border-border/80 space-y-2">
                <div className="flex items-center gap-1.5 text-xs font-bold text-foreground">
                  <Flame className="w-4 h-4 text-amber-500" />
                  <span>Ngày Peak Cao Điểm Nhất:</span>
                </div>
                <div className="space-y-1.5 text-xs">
                  {peakIssuedDay && (
                    <div className="flex justify-between items-center bg-background p-2 rounded-lg border border-border/60">
                      <span className="text-muted-foreground">Phát hành nhiều nhất:</span>
                      <div className="text-right">
                        <strong className="text-foreground font-bold">{peakIssuedDay.date}</strong>
                        <span className="ml-1.5 text-blue-600 font-extrabold">({peakIssuedDay.totalIssued.toLocaleString()} vch)</span>
                      </div>
                    </div>
                  )}
                  {peakRateDay && (
                    <div className="flex justify-between items-center bg-background p-2 rounded-lg border border-border/60">
                      <span className="text-muted-foreground">Tỷ lệ quy đổi cao nhất:</span>
                      <div className="text-right">
                        <strong className="text-foreground font-bold">{peakRateDay.date}</strong>
                        <span className="ml-1.5 text-purple-600 dark:text-purple-400 font-extrabold">({peakRateDay.utilizationRate}%)</span>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Quality & Cancellation Assessment Box */}
              <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/30 space-y-2">
                <div className="flex items-center justify-between text-xs font-bold">
                  <span className="flex items-center gap-1.5 text-amber-800 dark:text-amber-300">
                    <CheckCircle2 className="w-4 h-4 text-amber-600" />
                    Đánh Giá Chất Lượng Vận Hành:
                  </span>
                  <span className="px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-800 dark:text-amber-300 text-[10px] font-extrabold">
                    {overallUtilizationRate >= 90 ? "RẤT TỐT" : overallUtilizationRate >= 75 ? "ĐẠT YÊU CẦU" : "CẦN LƯU Ý"}
                  </span>
                </div>
                <p className="text-xs text-foreground/90 leading-relaxed font-medium">
                  {overallUtilizationRate >= 90
                    ? `🔥 Tỷ lệ quy đổi cực kỳ cao (${overallUtilizationRate}%), phản ánh trải nghiệm khách hàng tại nhà hàng đạt hiệu quả vượt trội.`
                    : overallUtilizationRate >= 75
                    ? `✅ Tỷ lệ quy đổi đạt ${overallUtilizationRate}%, lưu lượng khách hàng sử dụng coupon ổn định.`
                    : `⚠️ Tỷ lệ quy đổi hiện ở mức ${overallUtilizationRate}%. Cần rà soát quy trình hướng dẫn nhận coupon tại bàn.`}
                </p>
                <div className="flex items-center justify-between pt-1 border-t border-amber-500/20 text-[11px] text-muted-foreground">
                  <span>Coupon bị hủy / rách:</span>
                  <strong className="text-red-500 font-bold">
                    {totalCancelledAll.toLocaleString()} ({cancellationRate}%)
                  </strong>
                </div>
              </div>
            </div>
          </Card>
        </div>
      ) : (
        <Card className="p-12 text-center text-muted-foreground rounded-2xl border border-border">
          Chưa có số liệu voucher trong khoảng thời gian được chọn.
        </Card>
      )}

      {/* Admin Restaurant Comparison Section */}
      {isAdmin && (
        <Card className="p-6 rounded-2xl border border-border/80 bg-card shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Building2 className="w-5 h-5 text-amber-500" />
              <h3 className="text-base font-extrabold text-foreground">
                So Sánh Hiệu Suất Theo Nhà Hàng ({startDate} đến {endDate})
              </h3>
            </div>
            <span className="text-xs text-muted-foreground font-medium">3 Nhà Hàng Thuộc Ba Na Hills</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {restaurantComparisonData.map((r) => {
              const isTop = topRestaurant?.restaurantId === r.restaurantId && r.postedBills > 0;
              return (
                <div
                  key={r.restaurantId}
                  className={`p-4 rounded-xl border transition-all ${
                    isTop
                      ? "border-amber-500/50 bg-amber-500/10 shadow-sm"
                      : "border-border/70 bg-secondary/30"
                  }`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-bold text-sm text-foreground flex items-center gap-1.5">
                      <span>{r.name}</span>
                      {isTop && <Award className="w-4 h-4 text-amber-500 fill-amber-500/20" />}
                    </span>
                    <span className="text-xs font-extrabold px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-700 dark:text-amber-300">
                      {r.utilizationRate}% Quy Đổi
                    </span>
                  </div>

                  <div className="space-y-1.5 text-xs text-muted-foreground mb-3">
                    <div className="flex justify-between">
                      <span>Tổng phát ra:</span>
                      <strong className="text-foreground">{r.totalIssued.toLocaleString()}</strong>
                    </div>
                    <div className="flex justify-between">
                      <span>Hóa đơn thu về:</span>
                      <strong className="text-emerald-600 dark:text-emerald-400 font-bold">
                        {r.postedBills.toLocaleString()}
                      </strong>
                    </div>
                    <div className="flex justify-between">
                      <span>Voucher bị hủy:</span>
                      <span className="text-red-500 font-medium">{r.cancelled.toLocaleString()}</span>
                    </div>
                  </div>

                  {/* Utilization Progress Bar */}
                  <div className="w-full bg-secondary h-2 rounded-full overflow-hidden">
                    <div
                      className="bg-amber-500 h-full rounded-full transition-all duration-500"
                      style={{ width: `${Math.min(100, Math.max(0, r.utilizationRate))}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      )}

      {/* Secondary Charts: Pie Chart & Restaurant Comparison Bar Chart */}
      {!isLoading && dailyChartData.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Coupon Category Distribution (Pie Chart) */}
          <Card className="p-6 rounded-2xl border border-border/80 bg-card shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <h4 className="font-bold text-foreground flex items-center gap-2">
                <PieChartIcon className="w-4 h-4 text-amber-500" />
                Cơ Cấu Coupon Phát Hành (Khoai Tây vs Beer vs Hủy)
              </h4>
            </div>
            {pieCouponData.length > 0 ? (
              <ResponsiveContainer width="100%" height={260}>
                <PieChart>
                  <Pie
                    data={pieCouponData}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={90}
                    paddingAngle={4}
                    dataKey="value"
                    label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}
                    labelLine={{ stroke: theme === "dark" ? "#cbd5e1" : "#64748b" }}
                  >
                    {pieCouponData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(val: number) => [val.toLocaleString(), "Số lượng"]}
                    contentStyle={{
                      backgroundColor: theme === "dark" ? "#1e293b" : "#ffffff",
                      borderColor: theme === "dark" ? "#334155" : "#e2e8f0",
                      borderRadius: "10px",
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
                    }}
                  />
                  <Legend wrapperStyle={{ fontSize: "12px" }} />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-48 flex items-center justify-center text-xs text-muted-foreground">
                Chưa có số liệu phân loại coupon
              </div>
            )}
          </Card>

          {/* Restaurant Comparison Bar Chart */}
          <Card className="p-6 rounded-2xl border border-border/80 bg-card shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <h4 className="font-bold text-foreground flex items-center gap-2">
                <Building2 className="w-4 h-4 text-amber-500" />
                So Sánh Hóa Đơn Quy Đổi Giữa Các Nhà Hàng
              </h4>
            </div>
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={restaurantComparisonData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} opacity={0.15} />
                <XAxis dataKey="name" tick={{ fontSize: 11 }} tickLine={false} />
                <YAxis tick={{ fontSize: 11 }} tickLine={false} />
                <Tooltip
                  cursor={{ fill: theme === "dark" ? "rgba(255, 255, 255, 0.08)" : "rgba(0, 0, 0, 0.05)" }}
                  contentStyle={{
                    backgroundColor: theme === "dark" ? "#1e293b" : "#ffffff",
                    borderColor: theme === "dark" ? "#334155" : "#e2e8f0",
                    borderRadius: "10px",
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
                <Legend wrapperStyle={{ fontSize: "12px" }} />
                <Bar dataKey="postedBills" fill="#f59e0b" radius={[4, 4, 0, 0]} name="Hóa đơn quy đổi" />
                <Bar dataKey="totalIssued" fill="#3b82f6" radius={[4, 4, 0, 0]} name="Tổng phát ra" />
              </BarChart>
            </ResponsiveContainer>
          </Card>
        </div>
      )}
    </div>
  );
}


