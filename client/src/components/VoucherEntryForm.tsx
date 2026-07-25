import { useState, useEffect } from "react";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Ticket, XCircle, CheckCircle2, Save, Beer, Building2 } from "lucide-react";
import { useAuth } from "@/_core/hooks/useAuth";
import { getVoucherByDate, upsertVoucher, getLocalDateString } from "@/lib/firestoreService";
import { sendStoredMSTeamsReport } from "@/lib/msTeamsService";

interface VoucherEntryFormProps {
  onSuccess?: (date?: string) => void;
}

const RESTAURANTS = [
  { id: "lehoibia", name: "Lễ Hội Bia" },
  { id: "1901", name: "Nhà Hàng 1901" },
  { id: "beerplaza", name: "Beer Plaza" },
  { id: "maisonkayser", name: "Maison Kayser" },
];

export function VoucherEntryForm({ onSuccess }: VoucherEntryFormProps) {
  const { user } = useAuth();
  const [date, setDate] = useState(() => getLocalDateString());

  const isAdmin = user?.role === "admin";
  const [selectedRestaurantId, setSelectedRestaurantId] = useState<string>(() => {
    return user?.username && user.username !== "admin" ? user.username : "lehoibia";
  });

  const [potatoCoupons, setPotatoCoupons] = useState<string>("");
  const [beerCoupons, setBeerCoupons] = useState<string>("");
  const [bakeryCoupons, setBakeryCoupons] = useState<string>("");
  const [cancelled, setCancelled] = useState<string>("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const activeRestaurant = RESTAURANTS.find((r) => r.id === selectedRestaurantId) || {
    id: selectedRestaurantId,
    name: user?.restaurantName || user?.name || "Nhà Hàng",
  };

  const restaurantId = activeRestaurant.id;
  const restaurantName = activeRestaurant.name;

  const isMaisonKayser = restaurantId === "maisonkayser";

  useEffect(() => {
    let isMounted = true;
    async function loadData() {
      if (!restaurantId || !date) return;
      const record = await getVoucherByDate(restaurantId, date);
      if (isMounted) {
        if (record) {
          setPotatoCoupons(record.potatoCoupons?.toString() || "");
          setBeerCoupons(record.beerCoupons?.toString() || "");
          setBakeryCoupons(record.bakeryCoupons?.toString() || "");
          setCancelled(record.cancelled?.toString() || "");
        } else {
          setPotatoCoupons("");
          setBeerCoupons("");
          setBakeryCoupons("");
          setCancelled("");
        }
      }
    }
    loadData();
    return () => {
      isMounted = false;
    };
  }, [restaurantId, date]);

  const potatoNum = parseInt(potatoCoupons) || 0;
  const beerNum = parseInt(beerCoupons) || 0;
  const bakeryNum = parseInt(bakeryCoupons) || 0;
  const cancelledNum = parseInt(cancelled) || 0;

  const postedBillsNum = isMaisonKayser ? bakeryNum : potatoNum + beerNum;
  const totalIssuedNum = isMaisonKayser ? bakeryNum + cancelledNum : potatoNum + beerNum + cancelledNum;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (isMaisonKayser) {
      if (!bakeryCoupons && !cancelled) {
        toast.error("Vui lòng nhập số liệu voucher bánh hoặc coupon hủy.");
        return;
      }
    } else {
      if (!potatoCoupons && !beerCoupons && !cancelled) {
        toast.error("Vui lòng nhập ít nhất một số liệu coupon.");
        return;
      }
    }

    setIsSubmitting(true);
    try {
      const savedRecord = await upsertVoucher({
        date,
        restaurantId,
        restaurantName,
        potatoCoupons: isMaisonKayser ? 0 : potatoNum,
        beerCoupons: isMaisonKayser ? 0 : beerNum,
        bakeryCoupons: isMaisonKayser ? bakeryNum : 0,
        cancelled: cancelledNum,
        postedBills: postedBillsNum,
        totalIssued: totalIssuedNum,
        createdBy: user?.username || "user",
      });
      toast.success(`Đã lưu thành công số liệu ngày ${date} cho ${restaurantName}!`);

      // Trigger automatic MS Teams Report & Analysis send
      sendStoredMSTeamsReport(savedRecord).then((res) => {
        if (res.success) {
          toast.success("📢 " + res.message);
        } else {
          console.warn("MS Teams send note:", res.message);
        }
      });

      onSuccess?.(date);
    } catch (err: any) {
      toast.error(err.message || "Không thể lưu số liệu voucher.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const calculatedRate =
    totalIssuedNum > 0 ? Math.round((postedBillsNum / totalIssuedNum) * 100) : 0;

  return (
    <Card className="p-6 md:p-8 rounded-xl border border-border/80 bg-card shadow-sm space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-border/60">
        <div>
          <h3 className="text-xl font-bold text-foreground flex items-center gap-2">
            <Ticket className="w-5 h-5 text-amber-600 dark:text-amber-400" />
            Nhập Số Liệu Coupon ({restaurantName})
          </h3>
          <p className="text-xs text-muted-foreground mt-1">
            {isMaisonKayser ? (
              <span>
                Nhà hàng Maison Kayser: <strong className="text-amber-600 dark:text-amber-400 font-bold">Chỉ phát hành 1 Voucher Bánh (Tổng = Voucher Bánh + Voucher Hủy)</strong>
              </span>
            ) : (
              <span>
                Công thức tự động: <strong className="text-amber-600 dark:text-amber-400 font-bold">Tổng Coupon = Coupon Khoai Tây + Coupon Beer + Coupon Hủy</strong>
              </span>
            )}
          </p>
        </div>

        {totalIssuedNum > 0 && (
          <div className="bg-emerald-500/10 border border-emerald-500/20 px-3.5 py-1.5 rounded-lg flex items-center gap-2 self-start sm:self-center">
            <span className="text-xs font-semibold text-emerald-700 dark:text-emerald-300">Tỷ lệ quy đổi:</span>
            <span className="text-sm font-extrabold text-emerald-800 dark:text-emerald-200">{calculatedRate}%</span>
          </div>
        )}
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-xl">
          {isAdmin && (
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-muted-foreground mb-1.5 flex items-center gap-1.5">
                <Building2 className="w-3.5 h-3.5 text-amber-500" />
                Chọn Nhà Hàng Nhập Liệu (*)
              </label>
              <select
                value={selectedRestaurantId}
                onChange={(e) => setSelectedRestaurantId(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-lg bg-background border border-border text-foreground font-semibold text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 transition-all"
              >
                {RESTAURANTS.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-muted-foreground mb-1.5">
              Ngày Ghi Nhận Số Liệu (*)
            </label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-lg bg-background border border-border text-foreground font-medium text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 transition-all"
              required
            />
          </div>
        </div>

        {/* Input Cards Grid */}
        {isMaisonKayser ? (
          /* Maison Kayser: Bakery Voucher & Cancelled Voucher Only */
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div className="p-5 rounded-xl bg-emerald-500/5 border border-emerald-500/20 space-y-2">
              <label className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-emerald-700 dark:text-emerald-400">
                <span className="text-xl">🥐</span>
                Số Voucher Bánh (Maison Kayser)
              </label>
              <input
                type="number"
                value={bakeryCoupons}
                onChange={(e) => setBakeryCoupons(e.target.value)}
                placeholder="VD: 80"
                className="w-full px-3.5 py-2.5 rounded-lg bg-background border border-border text-foreground font-bold text-xl focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all"
                min="0"
              />
              <p className="text-[11px] text-muted-foreground">Số lượng voucher bánh phát hành &amp; thu về trong ngày</p>
            </div>

            <div className="p-5 rounded-xl bg-red-500/5 border border-red-500/20 space-y-2">
              <label className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-red-700 dark:text-red-400">
                <XCircle className="w-4 h-4 text-red-500" />
                Số Coupon Hủy
              </label>
              <input
                type="number"
                value={cancelled}
                onChange={(e) => setCancelled(e.target.value)}
                placeholder="VD: 2"
                className="w-full px-3.5 py-2.5 rounded-lg bg-background border border-border text-foreground font-bold text-xl focus:outline-none focus:ring-2 focus:ring-red-500/20 focus:border-red-500 transition-all"
                min="0"
              />
              <p className="text-[11px] text-muted-foreground">Số lượng voucher bị rách, hỏng hoặc hủy bỏ</p>
            </div>
          </div>
        ) : (
          /* Standard Restaurants: Potato, Beer & Cancelled */
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            <div className="p-4 rounded-xl bg-amber-500/5 border border-amber-500/20 space-y-2">
              <label className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-amber-700 dark:text-amber-400">
                <span className="text-base">🍟</span>
                Số Coupon Khoai Tây
              </label>
              <input
                type="number"
                value={potatoCoupons}
                onChange={(e) => setPotatoCoupons(e.target.value)}
                placeholder="VD: 50"
                className="w-full px-3.5 py-2.5 rounded-lg bg-background border border-border text-foreground font-bold text-lg focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 transition-all"
                min="0"
              />
              <p className="text-[11px] text-muted-foreground">Số lượng coupon khoai tây nhà hàng thu về</p>
            </div>

            <div className="p-4 rounded-xl bg-blue-500/5 border border-blue-500/20 space-y-2">
              <label className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-blue-700 dark:text-blue-400">
                <Beer className="w-4 h-4 text-blue-500" />
                Số Coupon Beer
              </label>
              <input
                type="number"
                value={beerCoupons}
                onChange={(e) => setBeerCoupons(e.target.value)}
                placeholder="VD: 100"
                className="w-full px-3.5 py-2.5 rounded-lg bg-background border border-border text-foreground font-bold text-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
                min="0"
              />
              <p className="text-[11px] text-muted-foreground">Số lượng coupon beer nhà hàng thu về</p>
            </div>

            <div className="p-4 rounded-xl bg-red-500/5 border border-red-500/20 space-y-2">
              <label className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-red-700 dark:text-red-400">
                <XCircle className="w-4 h-4 text-red-500" />
                Số Coupon Hủy
              </label>
              <input
                type="number"
                value={cancelled}
                onChange={(e) => setCancelled(e.target.value)}
                placeholder="VD: 5"
                className="w-full px-3.5 py-2.5 rounded-lg bg-background border border-border text-foreground font-bold text-lg focus:outline-none focus:ring-2 focus:ring-red-500/20 focus:border-red-500 transition-all"
                min="0"
              />
              <p className="text-[11px] text-muted-foreground">Số lượng coupon bị rách, hỏng hoặc hủy bỏ</p>
            </div>
          </div>
        )}

        <div className="p-4 rounded-2xl bg-gradient-to-r from-amber-500/10 via-amber-500/5 to-transparent border border-amber-500/30 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="space-y-1 text-center sm:text-left">
            <div className="text-xs font-extrabold uppercase tracking-wider text-amber-600 dark:text-amber-400 flex items-center gap-2 justify-center sm:justify-start">
              <CheckCircle2 className="w-4 h-4 text-amber-500" />
              Tổng Số Coupon Tự Động Tính
            </div>
            <div className="text-xs text-muted-foreground font-medium">
              {isMaisonKayser
                ? `= ${bakeryNum} (Voucher Bánh) + ${cancelledNum} (Hủy)`
                : `= ${potatoNum} (Khoai Tây) + ${beerNum} (Beer) + ${cancelledNum} (Hủy)`}
            </div>
          </div>

          <div className="flex items-center gap-4 text-right">
            <div className="text-center sm:text-right">
              <span className="text-xs font-bold text-muted-foreground uppercase block">Tổng Coupon</span>
              <span className="text-2xl font-black text-amber-600 dark:text-amber-400">{totalIssuedNum}</span>
            </div>
            <div className="text-center sm:text-right pl-4 border-l border-border">
              <span className="text-xs font-bold text-muted-foreground uppercase block">Ghi Nhận Hóa Đơn</span>
              <span className="text-2xl font-black text-emerald-600 dark:text-emerald-400">{postedBillsNum}</span>
            </div>
          </div>
        </div>

        <div className="flex justify-end pt-2">
          <Button
            type="submit"
            disabled={isSubmitting}
            className="px-6 py-2.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-bold text-sm shadow-md transition-all flex items-center gap-2 disabled:opacity-50"
          >
            <Save className="w-4 h-4" />
            {isSubmitting ? "Đang lưu Firestore..." : "Lưu Số Liệu Hôm Nay"}
          </Button>
        </div>
      </form>
    </Card>
  );
}
