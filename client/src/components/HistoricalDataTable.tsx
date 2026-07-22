import { useState } from "react";
import { trpc } from "@/lib/trpc";
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
import { History, Calendar, Download, RefreshCw } from "lucide-react";

export function HistoricalDataTable() {
  const [startDate, setStartDate] = useState<string>(() => {
    const date = new Date();
    date.setDate(date.getDate() - 30);
    return date.toISOString().split("T")[0];
  });

  const [endDate, setEndDate] = useState<string>(
    new Date().toISOString().split("T")[0]
  );

  const { data: records, isLoading, refetch } = trpc.voucher.getByDateRange.useQuery(
    { startDate, endDate },
    {
      enabled: !!startDate && !!endDate,
    }
  );

  const handleSetLastDays = (days: number) => {
    const end = new Date();
    const start = new Date();
    start.setDate(start.getDate() - days);
    setStartDate(start.toISOString().split("T")[0]);
    setEndDate(end.toISOString().split("T")[0]);
  };

  return (
    <Card className="p-6 md:p-8 rounded-xl border border-border/80 bg-card shadow-sm">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 mb-6 pb-6 border-b border-border/60">
        <div>
          <h3 className="text-xl font-bold text-foreground flex items-center gap-2">
            <History className="w-5 h-5 text-amber-600 dark:text-amber-400" />
            Lịch Sử Ghi Nhận Voucher
          </h3>
          <p className="text-xs text-muted-foreground mt-1">
            Tra cứu toàn bộ lịch sử voucher đã ghi nhận theo khoảng thời gian tùy chỉnh
          </p>
        </div>

        {/* Quick Range Presets */}
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
            onClick={() => refetch()}
            variant="ghost"
            size="sm"
            className="text-xs rounded-lg text-muted-foreground hover:text-foreground"
          >
            <RefreshCw className="w-3.5 h-3.5" />
          </Button>
        </div>
      </div>

      {/* Date Pickers */}
      <div className="grid grid-cols-1 sm:grid-cols-2 max-w-lg gap-4 mb-6">
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

      {/* Table */}
      <div className="rounded-lg border border-border/70 overflow-hidden">
        <Table>
          <TableHeader className="bg-slate-50 dark:bg-slate-900/50">
            <TableRow className="border-b border-border/70">
              <TableHead className="py-3 px-4 text-xs font-bold uppercase tracking-wider text-muted-foreground">
                Ngày
              </TableHead>
              <TableHead className="py-3 px-4 text-right text-xs font-bold uppercase tracking-wider text-muted-foreground">
                Tổng phát ra
              </TableHead>
              <TableHead className="py-3 px-4 text-right text-xs font-bold uppercase tracking-wider text-muted-foreground">
                Hóa đơn ghi nhận
              </TableHead>
              <TableHead className="py-3 px-4 text-right text-xs font-bold uppercase tracking-wider text-muted-foreground">
                Voucher hủy
              </TableHead>
              <TableHead className="py-3 px-4 text-right text-xs font-bold uppercase tracking-wider text-muted-foreground">
                Tỷ lệ sử dụng
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
              records.map((record) => {
                const rate = record.utilizationRate;
                return (
                  <TableRow
                    key={record.id}
                    className="border-b border-border/50 hover:bg-slate-50/80 dark:hover:bg-slate-900/40 transition-colors"
                  >
                    <TableCell className="py-3.5 px-4 font-semibold text-sm text-foreground">
                      {record.date}
                    </TableCell>
                    <TableCell className="py-3.5 px-4 text-right font-medium text-sm text-foreground">
                      {record.totalIssued.toLocaleString()}
                    </TableCell>
                    <TableCell className="py-3.5 px-4 text-right font-semibold text-sm text-emerald-600 dark:text-emerald-400">
                      {record.postedBills.toLocaleString()}
                    </TableCell>
                    <TableCell className="py-3.5 px-4 text-right font-medium text-sm text-amber-600 dark:text-amber-400">
                      {record.cancelled.toLocaleString()}
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
                  colSpan={5}
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
