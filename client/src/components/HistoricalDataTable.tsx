import { useState, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { History, RefreshCw, Download } from "lucide-react";
import { useAuth } from "@/_core/hooks/useAuth";
import { getVouchersByDateRange, VoucherRecord } from "@/lib/firestoreService";
import { toast } from "sonner";

export function HistoricalDataTable() {
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

  const loadData = async () => {
    setIsLoading(true);
    try {
      const data = await getVouchersByDateRange(restaurantId, startDate, endDate);
      setRecords(data);
    } catch (e) {
      console.error("Error loading historical data:", e);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [restaurantId, startDate, endDate]);

  const handleSetLastDays = (days: number) => {
    const end = new Date();
    const start = new Date();
    start.setDate(start.getDate() - days);
    setStartDate(start.toISOString().split("T")[0]);
    setEndDate(end.toISOString().split("T")[0]);
  };

  const handleExportCSV = () => {
    if (!records || records.length === 0) {
      toast.error("Không có dữ liệu để xuất file CSV!");
      return;
    }

    const headers = [
      "Ngay",
      "Nha Hang",
      "Khoai Tay",
      "Coupon Beer",
      "Coupon Huy",
      "Tong Coupon",
      "Ty Le Quy Doi (%)",
    ];

    const rows = records.map((r) => {
      const potato = r.potatoCoupons ?? Math.round(r.postedBills / 2);
      const beer = r.beerCoupons ?? (r.postedBills - potato);
      return [
        r.date,
        `"${r.restaurantName || r.restaurantId}"`,
        potato,
        beer,
        r.cancelled,
        r.totalIssued,
        `${r.utilizationRate}%`,
      ].join(",");
    });

    const csvContent = "data:text/csv;charset=utf-8,\uFEFF" + [headers.join(","), ...rows].join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `bao_cao_voucher_${startDate}_den_${endDate}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success("Đã tải xuống báo cáo CSV thành công!");
  };

  return (
    <Card className="p-6 md:p-8 rounded-xl border border-border/80 bg-card shadow-sm space-y-6">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-6 border-b border-border/60">
        <div>
          <h3 className="text-xl font-bold text-foreground flex items-center gap-2">
            <History className="w-5 h-5 text-amber-600 dark:text-amber-400" />
            Lịch Sử Ghi Nhận Voucher
          </h3>
          <p className="text-xs text-muted-foreground mt-1">
            Tra cứu toàn bộ lịch sử voucher đã ghi nhận theo khoảng thời gian tùy chỉnh trên Firestore
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <Button
            onClick={() => handleSetLastDays(7)}
            variant="outline"
            size="sm"
            className="text-xs font-semibold rounded-lg"
          >
            7 ngày
          </Button>
          <Button
            onClick={() => handleSetLastDays(14)}
            variant="outline"
            size="sm"
            className="text-xs font-semibold rounded-lg"
          >
            14 ngày
          </Button>
          <Button
            onClick={() => handleSetLastDays(30)}
            variant="outline"
            size="sm"
            className="text-xs font-semibold rounded-lg"
          >
            30 ngày
          </Button>
          <Button
            onClick={handleExportCSV}
            variant="outline"
            size="sm"
            className="text-xs font-semibold gap-1.5 rounded-lg border-amber-500/30 text-amber-700 dark:text-amber-300 hover:bg-amber-500/10"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Xuất CSV</span>
          </Button>
          <Button
            onClick={loadData}
            variant="ghost"
            size="sm"
            className="text-xs rounded-lg text-muted-foreground hover:text-foreground"
          >
            <RefreshCw className="w-3.5 h-3.5" />
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 max-w-lg gap-4">
        <div>
          <label className="block text-xs font-bold uppercase tracking-wider text-muted-foreground mb-1">
            Từ ngày
          </label>
          <input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="w-full px-3.5 py-2 rounded-lg bg-background border border-border text-foreground font-medium text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500"
          />
        </div>
        <div>
          <label className="block text-xs font-bold uppercase tracking-wider text-muted-foreground mb-1">
            Đến ngày
          </label>
          <input
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            className="w-full px-3.5 py-2 rounded-lg bg-background border border-border text-foreground font-medium text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500"
          />
        </div>
      </div>

      <div className="rounded-lg border border-border/70 overflow-hidden">
        <Table>
          <TableHeader className="bg-slate-50 dark:bg-slate-900/50">
            <TableRow className="border-b border-border/70">
              <TableHead className="py-3 px-4 text-xs font-bold uppercase tracking-wider text-muted-foreground">
                Ngày
              </TableHead>
              {user?.role === "admin" && (
                <TableHead className="py-3 px-4 text-xs font-bold uppercase tracking-wider text-muted-foreground">
                  Nhà Hàng
                </TableHead>
              )}
              <TableHead className="py-3 px-4 text-right text-xs font-bold uppercase tracking-wider text-muted-foreground">
                🍟 Khoai Tây
              </TableHead>
              <TableHead className="py-3 px-4 text-right text-xs font-bold uppercase tracking-wider text-muted-foreground">
                🍺 Coupon Beer
              </TableHead>
              <TableHead className="py-3 px-4 text-right text-xs font-bold uppercase tracking-wider text-muted-foreground">
                ❌ Coupon Hủy
              </TableHead>
              <TableHead className="py-3 px-4 text-right text-xs font-bold uppercase tracking-wider text-amber-600 dark:text-amber-400">
                📊 Tổng Coupon
              </TableHead>
              <TableHead className="py-3 px-4 text-right text-xs font-bold uppercase tracking-wider text-muted-foreground">
                Tỷ lệ quy đổi
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <>
                {[1, 2, 3, 4, 5].map((i) => (
                  <TableRow key={i} className="border-b border-border/50">
                    <TableCell className="py-3 px-4">
                      <Skeleton className="h-4 w-24" />
                    </TableCell>
                    {user?.role === "admin" && (
                      <TableCell className="py-3 px-4">
                        <Skeleton className="h-4 w-20" />
                      </TableCell>
                    )}
                    <TableCell className="py-3 px-4 text-right">
                      <Skeleton className="h-4 w-12 ml-auto" />
                    </TableCell>
                    <TableCell className="py-3 px-4 text-right">
                      <Skeleton className="h-4 w-12 ml-auto" />
                    </TableCell>
                    <TableCell className="py-3 px-4 text-right">
                      <Skeleton className="h-4 w-12 ml-auto" />
                    </TableCell>
                    <TableCell className="py-3 px-4 text-right">
                      <Skeleton className="h-4 w-12 ml-auto" />
                    </TableCell>
                    <TableCell className="py-3 px-4 text-right">
                      <Skeleton className="h-4 w-12 ml-auto" />
                    </TableCell>
                  </TableRow>
                ))}
              </>
            ) : records && records.length > 0 ? (
              records.map((record, idx) => {
                const rate = record.utilizationRate;
                const potato = record.potatoCoupons ?? Math.round(record.postedBills / 2);
                const beer = record.beerCoupons ?? (record.postedBills - potato);

                return (
                  <TableRow
                    key={record.id || `${record.restaurantId}_${record.date}_${idx}`}
                    className="border-b border-border/50 hover:bg-slate-50/80 dark:hover:bg-slate-900/40 transition-colors"
                  >
                    <TableCell className="py-3.5 px-4 font-semibold text-sm text-foreground">
                      {record.date}
                    </TableCell>
                    {user?.role === "admin" && (
                      <TableCell className="py-3.5 px-4 text-xs font-bold text-amber-600">
                        {record.restaurantName || record.restaurantId}
                      </TableCell>
                    )}
                    <TableCell className="py-3.5 px-4 text-right font-medium text-sm text-amber-700 dark:text-amber-300">
                      {potato.toLocaleString()}
                    </TableCell>
                    <TableCell className="py-3.5 px-4 text-right font-medium text-sm text-blue-600 dark:text-blue-400">
                      {beer.toLocaleString()}
                    </TableCell>
                    <TableCell className="py-3.5 px-4 text-right font-medium text-sm text-red-600 dark:text-red-400">
                      {record.cancelled.toLocaleString()}
                    </TableCell>
                    <TableCell className="py-3.5 px-4 text-right font-extrabold text-sm text-amber-600 dark:text-amber-400">
                      {record.totalIssued.toLocaleString()}
                    </TableCell>
                    <TableCell className="py-3.5 px-4 text-right">
                      <span
                        className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold ${
                          rate >= 80
                            ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                            : rate >= 50
                            ? "bg-purple-500/10 text-purple-700 dark:text-purple-300"
                            : "bg-amber-500/10 text-amber-700 dark:text-amber-300"
                        }`}
                      >
                        {rate}%
                      </span>
                    </TableCell>
                  </TableRow>
                );
              })
            ) : (
              <TableRow>
                <TableCell
                  colSpan={user?.role === "admin" ? 7 : 6}
                  className="py-12 px-4 text-center text-muted-foreground text-sm"
                >
                  Không có dữ liệu trong khoảng thời gian đã chọn.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </Card>
  );
}
