import { useState, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  BarChart,
  Bar,
  LineChart,
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
} from "lucide-react";
import { useAuth } from "@/_core/hooks/useAuth";
import { getVouchersByDateRange, VoucherRecord, getLocalDateString } from "@/lib/firestoreService";

const RESTAURANTS = [
  { id: "all", name: "Tất Cả Nhà Hàng" },
  { id: "lehoibia", name: "Lễ Hội Bia" },
  { id: "1901", name: "Nhà Hàng 1901" },
  { id: "beerplaza", name: "Beer Plaza" },
  { id: "maisonkayser", name: "Maison Kayser" },
];

const COLORS = ["#f59e0b", "#3b82f6", "#10b981", "#ef4444", "#8b5cf6"];

export function AnalyticsCharts() {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";

  const [selectedRestaurant, setSelectedRestaurant] = useState<string>("all");
  const [startDate, setStartDate] = useState<string>(() => {
    const date = new Date();
    date.setDate(date.getDate() - 30);
    return getLocalDateString(date);
  });

  const [endDate, setEndDate] = useState<string>(() => getLocalDateString());

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
    setStartDate(getLocalDateString(start));
    setEndDate(getLocalDateString(end));
  };

  // Group daily totals for bar/line charts
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

    existingDay.totalIssued += record.totalIssued || 0;
    existingDay.postedBills += record.postedBills || 0;
    existingDay.cancelled += record.cancelled || 0;
    existingDay.potato += potato;
    existingDay.beer += beer;
    existingDay.bakery += bakery;
    dailyDataMap.set(record.date, existingDay);

    // Restaurant map
    const rId = record.restaurantId;
    if (restaurantDataMap.has(rId)) {
      const existingR = restaurantDataMap.get(rId)!;
      existingR.totalIssued += record.totalIssued || 0;
      existingR.postedBills += record.postedBills || 0;
      existingR.cancelled += record.cancelled || 0;
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

  const pieCouponData = [
    { name: "Coupon Khoai Tây", value: totalPotatoAll, color: "#f59e0b" },
    { name: "Coupon Beer", value: totalBeerAll, color: "#3b82f6" },
    { name: "Voucher Bánh", value: totalBakeryAll, color: "#10b981" },
    { name: "Coupon Đã Hủy", value: totalCancelledAll, color: "#ef4444" },
  ].filter((d) => d.value > 0);

  return (
    <div className="space-y-6">
      {/* Top Filter Controls Card */}
      <Card className="p-5 rounded-2xl border border-border/80 bg-card shadow-sm">
        <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4">
          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-muted-foreground mr-1">
              <Filter className="w-4 h-4 text-amber-500" />
              <span>Bộ lọc báo cáo:</span>
            </div>

            {isAdmin && (
              <select
                value={selectedRestaurant}
                onChange={(e) => setSelectedRestaurant(e.target.value)}
                className="px-3 py-1.5 rounded-lg bg-background border border-border text-xs font-semibold text-foreground focus:outline-none focus:ring-2 focus:ring-amber-500/20"
              >
                {RESTAURANTS.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
              </select>
            )}

            <div className="flex items-center gap-1.5">
              {[7, 14, 30, 90].map((days) => (
                <Button
                  key={days}
                  onClick={() => handleSetLastDays(days)}
                  variant="outline"
                  size="sm"
                  className="text-xs font-semibold rounded-lg h-8 px-2.5"
                >
                  {days} ngày
                </Button>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-2.5 w-full lg:w-auto">
            <span className="text-xs text-muted-foreground font-semibold">Từ:</span>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="px-3 py-1.5 rounded-lg bg-background border border-border text-xs font-medium text-foreground focus:outline-none focus:ring-2 focus:ring-amber-500/20"
            />
            <span className="text-xs text-muted-foreground font-semibold">đến:</span>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="px-3 py-1.5 rounded-lg bg-background border border-border text-xs font-medium text-foreground focus:outline-none focus:ring-2 focus:ring-amber-500/20"
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
              Tổng Voucher Phát Ra
            </span>
            <div className="p-2 rounded-lg bg-blue-500/10 text-blue-600 dark:text-blue-400">
              <Ticket className="w-4 h-4" />
            </div>
          </div>
          <div className="text-3xl font-extrabold text-foreground">
            {totalIssuedAll.toLocaleString("vi-VN")}
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            Gồm {totalPotatoAll.toLocaleString()} Khoai Tây + {totalBeerAll.toLocaleString()} Beer
          </p>
        </Card>

        <Card className="p-5 rounded-xl border border-emerald-500/30 bg-emerald-500/5 shadow-sm">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
              Đã Thu Về Quy Đổi
            </span>
            <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
              <FileCheck className="w-4 h-4" />
            </div>
          </div>
          <div className="text-3xl font-extrabold text-foreground">
            {totalPostedAll.toLocaleString("vi-VN")}
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            Hóa đơn quy đổi thành công
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

      {/* Main Interactive Charts */}
      {isLoading ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card className="p-6 rounded-xl border border-border/80 bg-card h-80">
            <Skeleton className="h-full w-full" />
          </Card>
          <Card className="p-6 rounded-xl border border-border/80 bg-card h-80">
            <Skeleton className="h-full w-full" />
          </Card>
        </div>
      ) : dailyChartData.length > 0 ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Chart 1: Daily Issuance & Redemption */}
          <Card className="p-6 rounded-xl border border-border/80 bg-card shadow-sm">
            <div className="flex items-center justify-between mb-6">
              <h4 className="font-bold text-foreground flex items-center gap-2">
                <BarChart3 className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                Số Liệu Phát Hành & Quy Đổi Hàng Ngày
              </h4>
            </div>
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={dailyChartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} opacity={0.15} />
                <XAxis dataKey="date" tick={{ fontSize: 11 }} tickLine={false} />
                <YAxis tick={{ fontSize: 11 }} tickLine={false} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "rgba(15, 23, 42, 0.9)",
                    border: "none",
                    borderRadius: "8px",
                    color: "#fff",
                    fontSize: "12px",
                  }}
                />
                <Legend wrapperStyle={{ fontSize: "12px", paddingTop: "10px" }} />
                <Bar dataKey="totalIssued" fill="#3b82f6" radius={[4, 4, 0, 0]} name="Tổng phát ra" />
                <Bar dataKey="postedBills" fill="#10b981" radius={[4, 4, 0, 0]} name="Hóa đơn quy đổi" />
                <Bar dataKey="cancelled" fill="#ef4444" radius={[4, 4, 0, 0]} name="Đã hủy" />
              </BarChart>
            </ResponsiveContainer>
          </Card>

          {/* Chart 2: Utilization Rate Trend */}
          <Card className="p-6 rounded-xl border border-border/80 bg-card shadow-sm">
            <div className="flex items-center justify-between mb-6">
              <h4 className="font-bold text-foreground flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-purple-600 dark:text-purple-400" />
                Xu Hướng Tỷ Lệ Quy Đổi (%)
              </h4>
            </div>
            <ResponsiveContainer width="100%" height={280}>
              <LineChart data={dailyChartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} opacity={0.15} />
                <XAxis dataKey="date" tick={{ fontSize: 11 }} tickLine={false} />
                <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} tickLine={false} />
                <Tooltip
                  formatter={(value) => [`${value}%`, "Tỷ lệ quy đổi"]}
                  contentStyle={{
                    backgroundColor: "rgba(15, 23, 42, 0.9)",
                    border: "none",
                    borderRadius: "8px",
                    color: "#fff",
                    fontSize: "12px",
                  }}
                />
                <Legend wrapperStyle={{ fontSize: "12px", paddingTop: "10px" }} />
                <Line
                  type="monotone"
                  dataKey="utilizationRate"
                  stroke="#a855f7"
                  name="Tỷ lệ quy đổi %"
                  strokeWidth={2.5}
                  dot={{ r: 4, fill: "#a855f7" }}
                  activeDot={{ r: 6 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </Card>

          {/* Chart 3: Coupon Category Distribution (Pie Chart) */}
          <Card className="p-6 rounded-xl border border-border/80 bg-card shadow-sm">
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
                  >
                    {pieCouponData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(val: number) => [val.toLocaleString(), "Số lượng"]}
                    contentStyle={{
                      backgroundColor: "rgba(15, 23, 42, 0.9)",
                      border: "none",
                      borderRadius: "8px",
                      color: "#fff",
                      fontSize: "12px",
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

          {/* Chart 4: Restaurant Comparison Bar Chart */}
          <Card className="p-6 rounded-xl border border-border/80 bg-card shadow-sm">
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
                  contentStyle={{
                    backgroundColor: "rgba(15, 23, 42, 0.9)",
                    border: "none",
                    borderRadius: "8px",
                    color: "#fff",
                    fontSize: "12px",
                  }}
                />
                <Legend wrapperStyle={{ fontSize: "12px" }} />
                <Bar dataKey="postedBills" fill="#f59e0b" radius={[4, 4, 0, 0]} name="Hóa đơn quy đổi" />
                <Bar dataKey="totalIssued" fill="#3b82f6" radius={[4, 4, 0, 0]} name="Tổng phát ra" />
              </BarChart>
            </ResponsiveContainer>
          </Card>
        </div>
      ) : (
        <Card className="p-12 text-center text-muted-foreground rounded-xl border border-border">
          Chưa có số liệu voucher trong khoảng thời gian được chọn.
        </Card>
      )}
    </div>
  );
}

