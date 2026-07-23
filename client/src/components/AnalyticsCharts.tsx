import { useState, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import { Skeleton } from "@/components/ui/skeleton";
import { BarChart3, TrendingUp, Ticket, FileCheck, Percent } from "lucide-react";
import { useAuth } from "@/_core/hooks/useAuth";
import { getVouchersByDateRange, VoucherRecord } from "@/lib/firestoreService";

export function AnalyticsCharts() {
  const { user } = useAuth();
  const [startDate, setStartDate] = useState<string>(() => {
    const date = new Date();
    date.setDate(date.getDate() - 30);
    return date.toISOString().split("T")[0];
  });

  const [endDate, setEndDate] = useState<string>(
    new Date().toISOString().split("T")[0]
  );

  const [records, setRecords] = useState<VoucherRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const restaurantId = user?.role === "admin" ? "all" : (user?.username || user?.id || "lehoibia");

  useEffect(() => {
    let isMounted = true;
    async function loadData() {
      setIsLoading(true);
      try {
        const data = await getVouchersByDateRange(restaurantId, startDate, endDate);
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
  }, [restaurantId, startDate, endDate]);

  const handleSetLastDays = (days: number) => {
    const end = new Date();
    const start = new Date();
    start.setDate(start.getDate() - days);
    setStartDate(start.toISOString().split("T")[0]);
    setEndDate(end.toISOString().split("T")[0]);
  };

  const chartData = records
    ? [...records]
        .map((record) => ({
          date: record.date,
          totalIssued: record.totalIssued,
          postedBills: record.postedBills,
          cancelled: record.cancelled,
          utilizationRate: record.utilizationRate,
        }))
        .reverse()
    : [];

  const stats = {
    avgUtilization:
      chartData.length > 0
        ? Math.round(
            chartData.reduce((sum, d) => sum + d.utilizationRate, 0) /
              chartData.length
          )
        : 0,
    totalIssued: chartData.reduce((sum, d) => sum + d.totalIssued, 0),
    totalPosted: chartData.reduce((sum, d) => sum + d.postedBills, 0),
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
        <Card className="p-6 rounded-xl border border-border/80 bg-card shadow-sm">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
              Sử Dụng Trung Bình
            </span>
            <div className="p-2 rounded-lg bg-purple-500/10 text-purple-600 dark:text-purple-400">
              <Percent className="w-4 h-4" />
            </div>
          </div>
          <div className="text-3xl font-extrabold text-foreground">
            {stats.avgUtilization}%
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            Trung bình toàn bộ giai đoạn
          </p>
        </Card>

        <Card className="p-6 rounded-xl border border-border/80 bg-card shadow-sm">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
              Tổng Phát Ra
            </span>
            <div className="p-2 rounded-lg bg-blue-500/10 text-blue-600 dark:text-blue-400">
              <Ticket className="w-4 h-4" />
            </div>
          </div>
          <div className="text-3xl font-extrabold text-foreground">
            {stats.totalIssued.toLocaleString()}
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            Tổng cộng số voucher đã phát
          </p>
        </Card>

        <Card className="p-6 rounded-xl border border-border/80 bg-card shadow-sm">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
              Tổng Hóa Đơn Quy Đổi
            </span>
            <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
              <FileCheck className="w-4 h-4" />
            </div>
          </div>
          <div className="text-3xl font-extrabold text-foreground">
            {stats.totalPosted.toLocaleString()}
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            Tổng cộng hóa đơn đã ghi nhận
          </p>
        </Card>
      </div>

      <Card className="p-5 rounded-xl border border-border/80 bg-card shadow-sm">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground mr-1">Lọc nhanh:</span>
            <Button
              onClick={() => handleSetLastDays(7)}
              variant="outline"
              size="sm"
              className="text-xs font-semibold rounded-lg"
            >
              7 ngày qua
            </Button>
            <Button
              onClick={() => handleSetLastDays(14)}
              variant="outline"
              size="sm"
              className="text-xs font-semibold rounded-lg"
            >
              14 ngày qua
            </Button>
            <Button
              onClick={() => handleSetLastDays(30)}
              variant="outline"
              size="sm"
              className="text-xs font-semibold rounded-lg"
            >
              30 ngày qua
            </Button>
            <Button
              onClick={() => handleSetLastDays(90)}
              variant="outline"
              size="sm"
              className="text-xs font-semibold rounded-lg"
            >
              90 ngày qua
            </Button>
          </div>

          <div className="flex items-center gap-3 w-full sm:w-auto">
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="px-3 py-1.5 rounded-lg bg-background border border-border text-xs font-medium text-foreground focus:outline-none focus:ring-2 focus:ring-amber-500/20"
            />
            <span className="text-xs text-muted-foreground font-semibold">đến</span>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="px-3 py-1.5 rounded-lg bg-background border border-border text-xs font-medium text-foreground focus:outline-none focus:ring-2 focus:ring-amber-500/20"
            />
          </div>
        </div>
      </Card>

      {isLoading ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card className="p-6 rounded-xl border border-border/80 bg-card h-80">
            <Skeleton className="h-full w-full" />
          </Card>
          <Card className="p-6 rounded-xl border border-border/80 bg-card h-80">
            <Skeleton className="h-full w-full" />
          </Card>
        </div>
      ) : chartData.length > 0 ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card className="p-6 rounded-xl border border-border/80 bg-card shadow-sm">
            <div className="flex items-center justify-between mb-6">
              <h4 className="font-bold text-foreground flex items-center gap-2">
                <BarChart3 className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                Phân Bổ Voucher Theo Ngày
              </h4>
            </div>
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
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
                <Bar dataKey="postedBills" fill="#10b981" radius={[4, 4, 0, 0]} name="Hóa đơn ghi nhận" />
                <Bar dataKey="cancelled" fill="#f97316" radius={[4, 4, 0, 0]} name="Đã hủy" />
              </BarChart>
            </ResponsiveContainer>
          </Card>

          <Card className="p-6 rounded-xl border border-border/80 bg-card shadow-sm">
            <div className="flex items-center justify-between mb-6">
              <h4 className="font-bold text-foreground flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-purple-600 dark:text-purple-400" />
                Xu Hướng Tỷ Lệ Sử Dụng (%)
              </h4>
            </div>
            <ResponsiveContainer width="100%" height={280}>
              <LineChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} opacity={0.15} />
                <XAxis dataKey="date" tick={{ fontSize: 11 }} tickLine={false} />
                <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} tickLine={false} />
                <Tooltip
                  formatter={(value) => [`${value}%`, "Tỷ lệ sử dụng"]}
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
                  name="Tỷ lệ sử dụng %"
                  strokeWidth={2.5}
                  dot={{ r: 4, fill: "#a855f7" }}
                  activeDot={{ r: 6 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </Card>
        </div>
      ) : (
        <Card className="p-12 text-center text-muted-foreground rounded-xl border border-border">
          Không có dữ liệu trong khoảng thời gian đã chọn.
        </Card>
      )}
    </div>
  );
}
