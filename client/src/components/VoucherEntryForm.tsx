import { useState, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Calendar, Ticket, FileCheck, XCircle, CheckCircle2, AlertCircle, Save } from "lucide-react";

interface VoucherEntryFormProps {
  onSuccess?: () => void;
}

export function VoucherEntryForm({ onSuccess }: VoucherEntryFormProps) {
  const [date, setDate] = useState(() => {
    return new Date().toISOString().split("T")[0];
  });
  const [totalIssued, setTotalIssued] = useState("");
  const [postedBills, setPostedBills] = useState("");
  const [cancelled, setCancelled] = useState("");
  const [isValid, setIsValid] = useState(true);
  const [error, setError] = useState("");

  const { data: existingRecord } = trpc.voucher.getByDate.useQuery(
    { date },
    { enabled: !!date }
  );

  useEffect(() => {
    if (existingRecord) {
      setTotalIssued(existingRecord.totalIssued.toString());
      setPostedBills(existingRecord.postedBills.toString());
      setCancelled(existingRecord.cancelled.toString());
    } else {
      setTotalIssued("");
      setPostedBills("");
      setCancelled("");
    }
  }, [existingRecord]);

  useEffect(() => {
    if (totalIssued && postedBills && cancelled) {
      const total = parseInt(totalIssued) || 0;
      const posted = parseInt(postedBills) || 0;
      const cancel = parseInt(cancelled) || 0;

      if (total === posted + cancel) {
        setIsValid(true);
        setError("");
      } else {
        setIsValid(false);
        setError(
          `Công thức không đúng: ${total} ≠ ${posted} + ${cancel}. (Tổng phát ra phải bằng Hóa đơn + Đã hủy)`
        );
      }
    } else {
      setIsValid(true);
      setError("");
    }
  }, [totalIssued, postedBills, cancelled]);

  const utils = trpc.useUtils();
  const upsertMutation = trpc.voucher.upsert.useMutation({
    onSuccess: () => {
      utils.voucher.getToday.invalidate();
      utils.voucher.getByDate.invalidate();
      utils.voucher.getByDateRange.invalidate();
      onSuccess?.();
    },
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!isValid) {
      toast.error("Vui lòng kiểm tra và sửa lỗi công thức trước khi gửi.");
      return;
    }

    try {
      await upsertMutation.mutateAsync({
        date,
        totalIssued: parseInt(totalIssued),
        postedBills: parseInt(postedBills),
        cancelled: parseInt(cancelled),
      });

      toast.success("Lưu bản ghi voucher thành công!");
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Không thể lưu bản ghi voucher";
      toast.error(message);
    }
  };

  const calculatedRate =
    totalIssued && postedBills && parseInt(totalIssued) > 0
      ? Math.round((parseInt(postedBills) / parseInt(totalIssued)) * 100)
      : null;

  return (
    <Card className="p-6 md:p-8 rounded-xl border border-border/80 bg-card shadow-sm">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6 pb-6 border-b border-border/60">
        <div>
          <h3 className="text-xl font-bold text-foreground flex items-center gap-2">
            <Ticket className="w-5 h-5 text-amber-600 dark:text-amber-400" />
            Nhập Dữ Liệu Voucher Hàng Ngày
          </h3>
          <p className="text-xs text-muted-foreground mt-1">
            Ghi nhận số liệu voucher theo công thức chuẩn: <strong className="text-foreground font-semibold">Tổng phát ra = Hóa đơn ghi nhận + Voucher hủy</strong>
          </p>
        </div>

        {calculatedRate !== null && isValid && (
          <div className="bg-amber-500/10 border border-amber-500/20 px-3.5 py-1.5 rounded-lg flex items-center gap-2 self-start sm:self-center">
            <span className="text-xs font-semibold text-amber-700 dark:text-amber-300">Tỷ lệ sử dụng tính toán:</span>
            <span className="text-sm font-extrabold text-amber-800 dark:text-amber-200">{calculatedRate}%</span>
          </div>
        )}
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Date Selector */}
        <div className="max-w-xs">
          <label className="block text-xs font-bold uppercase tracking-wider text-muted-foreground mb-1.5">
            Ngày Ghi Nhận
          </label>
          <div className="relative">
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-lg bg-background border border-border text-foreground font-medium text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 transition-all"
              required
            />
          </div>
        </div>

        {/* 3 Input Cards Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-900/50 border border-border/80 space-y-2">
            <label className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">
              <Ticket className="w-4 h-4 text-blue-500" />
              Tổng Phát Ra
            </label>
            <input
              type="number"
              value={totalIssued}
              onChange={(e) => setTotalIssued(e.target.value)}
              placeholder="VD: 150"
              className="w-full px-3.5 py-2.5 rounded-lg bg-background border border-border text-foreground font-bold text-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
              min="0"
              required
            />
            <p className="text-[11px] text-muted-foreground">Tổng số lượng voucher đã cấp phát trong ngày</p>
          </div>

          <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-900/50 border border-border/80 space-y-2">
            <label className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">
              <FileCheck className="w-4 h-4 text-emerald-500" />
              Hóa Đơn Ghi Nhận
            </label>
            <input
              type="number"
              value={postedBills}
              onChange={(e) => setPostedBills(e.target.value)}
              placeholder="VD: 140"
              className="w-full px-3.5 py-2.5 rounded-lg bg-background border border-border text-foreground font-bold text-lg focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all"
              min="0"
              required
            />
            <p className="text-[11px] text-muted-foreground">Số lượng voucher đã quy đổi thành hóa đơn thành công</p>
          </div>

          <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-900/50 border border-border/80 space-y-2">
            <label className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">
              <XCircle className="w-4 h-4 text-amber-500" />
              Voucher Đã Hủy
            </label>
            <input
              type="number"
              value={cancelled}
              onChange={(e) => setCancelled(e.target.value)}
              placeholder="VD: 10"
              className="w-full px-3.5 py-2.5 rounded-lg bg-background border border-border text-foreground font-bold text-lg focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 transition-all"
              min="0"
              required
            />
            <p className="text-[11px] text-muted-foreground">Số lượng voucher bị hỏng, thu hồi hoặc hủy bỏ</p>
          </div>
        </div>

        {/* Formula Validation Messages */}
        {error && (
          <div className="p-4 rounded-xl bg-destructive/10 border border-destructive/20 text-destructive text-xs font-medium flex items-center gap-3">
            <AlertCircle className="w-5 h-5 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {isValid && totalIssued && postedBills && cancelled && (
          <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-700 dark:text-emerald-300 text-xs font-medium flex items-center gap-3">
            <CheckCircle2 className="w-5 h-5 shrink-0 text-emerald-600 dark:text-emerald-400" />
            <span>Công thức hoàn toàn hợp lệ ({totalIssued} = {postedBills} + {cancelled}). Sẵn sàng lưu dữ liệu!</span>
          </div>
        )}

        {/* Submit button */}
        <div className="flex justify-end pt-2">
          <Button
            type="submit"
            disabled={!isValid || upsertMutation.isPending}
            className="px-6 py-2.5 rounded-lg bg-amber-600 hover:bg-amber-700 text-white font-semibold text-sm shadow-sm transition-all flex items-center gap-2 disabled:opacity-50"
          >
            <Save className="w-4 h-4" />
            {upsertMutation.isPending ? "Đang lưu bản ghi..." : "Lưu Bản Ghi Voucher"}
          </Button>
        </div>
      </form>
    </Card>
  );
}
