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
    <Card className="p-4 sm:p-6 md:p-8 rounded-2xl border border-border/80 bg-card shadow-sm space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-border/60">
        <div>
          <h3 className="text-lg sm:text-xl font-bold text-foreground flex items-center gap-2">
            <Ticket className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0" />
            <span>Nhập Số Liệu Coupon ({restaurantName})</span>
          </h3>
          <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
            {isMaisonKayser ? (
              <span>
                Maison Kayser: <strong className="text-amber-600 dark:text-amber-400 font-bold">Chỉ phát hành 1 Voucher Bánh (Tổng = Bánh + Hủy)</strong>
              </span>
            ) : (
              <span>
                Công thức: <strong className="text-amber-600 dark:text-amber-400 font-bold">Tổng = Khoai Tây + Beer + Hủy</strong>
              </span>
            )}
          </p>
        </div>

        {totalIssuedNum > 0 && (
          <div className="bg-emerald-500/10 border border-emerald-500/20 px-3 py-1.5 rounded-xl flex items-center gap-2 self-start sm:self-center">
            <span className="text-xs font-semibold text-emerald-700 dark:text-emerald-300">Tỷ lệ quy đổi:</span>
            <span className="text-sm font-black text-emerald-800 dark:text-emerald-200">{calculatedRate}%</span>
          </div>
        )}
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
          {isAdmin && (
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-muted-foreground mb-1.5 flex items-center gap-1.5">
                <Building2 className="w-3.5 h-3.5 text-amber-500" />
                Chọn Nhà Hàng Nhập Liệu (*)
              </label>
              <select
                value={selectedRestaurantId}
                onChange={(e) => setSelectedRestaurantId(e.target.value)}
                className="w-full h-12 px-3.5 rounded-xl bg-background border border-border text-foreground font-semibold text-base focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 transition-all touch-manipulation"
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
            <div className="flex items-center justify-between mb-1.5">
              <label className="block text-xs font-bold uppercase tracking-wider text-muted-foreground">
                Ngày Ghi Nhận Số Liệu (*)
              </label>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setDate(getLocalDateString())}
                  className="text-[11px] font-bold px-2 py-0.5 rounded-md bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20 hover:bg-amber-500/20 active:scale-95 transition-all"
                >
                  Hôm nay
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const y = new Date();
                    y.setDate(y.getDate() - 1);
                    const yStr = `${y.getFullYear()}-${String(y.getMonth() + 1).padStart(2, "0")}-${String(y.getDate()).padStart(2, "0")}`;
                    setDate(yStr);
                  }}
                  className="text-[11px] font-bold px-2 py-0.5 rounded-md bg-secondary text-muted-foreground border border-border hover:bg-secondary/80 active:scale-95 transition-all"
                >
                  Hôm qua
                </button>
              </div>
            </div>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-full h-12 px-3.5 rounded-xl bg-background border border-border text-foreground font-semibold text-base focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 transition-all touch-manipulation"
              required
            />
          </div>
        </div>

        {/* Input Cards Grid with Quick Touch Steppers for Mobile */}
        {isMaisonKayser ? (
          /* Maison Kayser: Bakery Voucher & Cancelled Voucher Only */
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="p-4 sm:p-5 rounded-2xl bg-emerald-500/5 border border-emerald-500/20 space-y-3">
              <label className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-emerald-700 dark:text-emerald-400">
                <span className="text-xl">🥐</span>
                Số Voucher Bánh (Maison Kayser)
              </label>
              <div className="relative flex items-center">
                <input
                  type="number"
                  value={bakeryCoupons}
                  onChange={(e) => setBakeryCoupons(e.target.value)}
                  placeholder="0"
                  className="w-full h-13 px-4 rounded-xl bg-background border border-border text-foreground font-black text-2xl focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all touch-manipulation"
                  min="0"
                />
                {bakeryCoupons && (
                  <button
                    type="button"
                    onClick={() => setBakeryCoupons("")}
                    className="absolute right-3 text-xs font-bold text-muted-foreground hover:text-red-500 px-2 py-1 rounded bg-secondary"
                  >
                    Xóa
                  </button>
                )}
              </div>
              {/* Quick Stepper Buttons for Mobile */}
              <div className="flex items-center gap-1.5 pt-1 overflow-x-auto no-scrollbar">
                {[-10, -1, 1, 5, 10, 50].map((step) => (
                  <button
                    key={step}
                    type="button"
                    onClick={() => {
                      const cur = parseInt(bakeryCoupons) || 0;
                      setBakeryCoupons(Math.max(0, cur + step).toString());
                    }}
                    className={`flex-1 min-w-[42px] h-9 rounded-lg font-bold text-xs transition-all active:scale-95 border ${
                      step < 0
                        ? "bg-red-500/10 text-red-600 border-red-500/20 hover:bg-red-500/20"
                        : "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/20 hover:bg-emerald-500/20"
                    }`}
                  >
                    {step > 0 ? `+${step}` : step}
                  </button>
                ))}
              </div>
              <p className="text-[11px] text-muted-foreground">Số lượng voucher bánh phát hành &amp; thu về trong ngày</p>
            </div>

            <div className="p-4 sm:p-5 rounded-2xl bg-red-500/5 border border-red-500/20 space-y-3">
              <label className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-red-700 dark:text-red-400">
                <XCircle className="w-4 h-4 text-red-500" />
                Số Coupon Hủy
              </label>
              <div className="relative flex items-center">
                <input
                  type="number"
                  value={cancelled}
                  onChange={(e) => setCancelled(e.target.value)}
                  placeholder="0"
                  className="w-full h-13 px-4 rounded-xl bg-background border border-border text-foreground font-black text-2xl focus:outline-none focus:ring-2 focus:ring-red-500/20 focus:border-red-500 transition-all touch-manipulation"
                  min="0"
                />
                {cancelled && (
                  <button
                    type="button"
                    onClick={() => setCancelled("")}
                    className="absolute right-3 text-xs font-bold text-muted-foreground hover:text-red-500 px-2 py-1 rounded bg-secondary"
                  >
                    Xóa
                  </button>
                )}
              </div>
              {/* Quick Stepper Buttons for Mobile */}
              <div className="flex items-center gap-1.5 pt-1 overflow-x-auto no-scrollbar">
                {[-5, -1, 1, 2, 5, 10].map((step) => (
                  <button
                    key={step}
                    type="button"
                    onClick={() => {
                      const cur = parseInt(cancelled) || 0;
                      setCancelled(Math.max(0, cur + step).toString());
                    }}
                    className={`flex-1 min-w-[42px] h-9 rounded-lg font-bold text-xs transition-all active:scale-95 border ${
                      step < 0
                        ? "bg-muted text-muted-foreground border-border hover:bg-secondary"
                        : "bg-red-500/10 text-red-600 border-red-500/20 hover:bg-red-500/20"
                    }`}
                  >
                    {step > 0 ? `+${step}` : step}
                  </button>
                ))}
              </div>
              <p className="text-[11px] text-muted-foreground">Số lượng voucher bị rách, hỏng hoặc hủy bỏ</p>
            </div>
          </div>
        ) : (
          /* Standard Restaurants: Potato, Beer & Cancelled */
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Potato Coupons */}
            <div className="p-4 rounded-2xl bg-amber-500/5 border border-amber-500/20 space-y-2.5">
              <label className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-amber-700 dark:text-amber-400">
                <span className="text-base">🍟</span>
                Số Coupon Khoai Tây
              </label>
              <div className="relative flex items-center">
                <input
                  type="number"
                  value={potatoCoupons}
                  onChange={(e) => setPotatoCoupons(e.target.value)}
                  placeholder="0"
                  className="w-full h-12 px-3.5 rounded-xl bg-background border border-border text-foreground font-black text-xl focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 transition-all touch-manipulation"
                  min="0"
                />
                {potatoCoupons && (
                  <button
                    type="button"
                    onClick={() => setPotatoCoupons("")}
                    className="absolute right-3 text-xs font-bold text-muted-foreground hover:text-red-500 px-2 py-1 rounded bg-secondary"
                  >
                    Xóa
                  </button>
                )}
              </div>
              {/* Stepper Buttons */}
              <div className="flex items-center gap-1 pt-1 overflow-x-auto no-scrollbar">
                {[-10, -1, 1, 5, 10, 50].map((step) => (
                  <button
                    key={step}
                    type="button"
                    onClick={() => {
                      const cur = parseInt(potatoCoupons) || 0;
                      setPotatoCoupons(Math.max(0, cur + step).toString());
                    }}
                    className={`flex-1 min-w-[38px] h-8 rounded-lg font-bold text-xs transition-all active:scale-95 border ${
                      step < 0
                        ? "bg-red-500/10 text-red-600 border-red-500/20"
                        : "bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/20"
                    }`}
                  >
                    {step > 0 ? `+${step}` : step}
                  </button>
                ))}
              </div>
              <p className="text-[11px] text-muted-foreground">Số lượng coupon khoai tây thu về</p>
            </div>

            {/* Beer Coupons */}
            <div className="p-4 rounded-2xl bg-blue-500/5 border border-blue-500/20 space-y-2.5">
              <label className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-blue-700 dark:text-blue-400">
                <Beer className="w-4 h-4 text-blue-500" />
                Số Coupon Beer
              </label>
              <div className="relative flex items-center">
                <input
                  type="number"
                  value={beerCoupons}
                  onChange={(e) => setBeerCoupons(e.target.value)}
                  placeholder="0"
                  className="w-full h-12 px-3.5 rounded-xl bg-background border border-border text-foreground font-black text-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all touch-manipulation"
                  min="0"
                />
                {beerCoupons && (
                  <button
                    type="button"
                    onClick={() => setBeerCoupons("")}
                    className="absolute right-3 text-xs font-bold text-muted-foreground hover:text-red-500 px-2 py-1 rounded bg-secondary"
                  >
                    Xóa
                  </button>
                )}
              </div>
              {/* Stepper Buttons */}
              <div className="flex items-center gap-1 pt-1 overflow-x-auto no-scrollbar">
                {[-10, -1, 1, 5, 10, 50].map((step) => (
                  <button
                    key={step}
                    type="button"
                    onClick={() => {
                      const cur = parseInt(beerCoupons) || 0;
                      setBeerCoupons(Math.max(0, cur + step).toString());
                    }}
                    className={`flex-1 min-w-[38px] h-8 rounded-lg font-bold text-xs transition-all active:scale-95 border ${
                      step < 0
                        ? "bg-red-500/10 text-red-600 border-red-500/20"
                        : "bg-blue-500/10 text-blue-700 dark:text-blue-300 border-blue-500/20"
                    }`}
                  >
                    {step > 0 ? `+${step}` : step}
                  </button>
                ))}
              </div>
              <p className="text-[11px] text-muted-foreground">Số lượng coupon beer thu về</p>
            </div>

            {/* Cancelled Coupons */}
            <div className="p-4 rounded-2xl bg-red-500/5 border border-red-500/20 space-y-2.5">
              <label className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-red-700 dark:text-red-400">
                <XCircle className="w-4 h-4 text-red-500" />
                Số Coupon Hủy
              </label>
              <div className="relative flex items-center">
                <input
                  type="number"
                  value={cancelled}
                  onChange={(e) => setCancelled(e.target.value)}
                  placeholder="0"
                  className="w-full h-12 px-3.5 rounded-xl bg-background border border-border text-foreground font-black text-xl focus:outline-none focus:ring-2 focus:ring-red-500/20 focus:border-red-500 transition-all touch-manipulation"
                  min="0"
                />
                {cancelled && (
                  <button
                    type="button"
                    onClick={() => setCancelled("")}
                    className="absolute right-3 text-xs font-bold text-muted-foreground hover:text-red-500 px-2 py-1 rounded bg-secondary"
                  >
                    Xóa
                  </button>
                )}
              </div>
              {/* Stepper Buttons */}
              <div className="flex items-center gap-1 pt-1 overflow-x-auto no-scrollbar">
                {[-5, -1, 1, 2, 5, 10].map((step) => (
                  <button
                    key={step}
                    type="button"
                    onClick={() => {
                      const cur = parseInt(cancelled) || 0;
                      setCancelled(Math.max(0, cur + step).toString());
                    }}
                    className={`flex-1 min-w-[38px] h-8 rounded-lg font-bold text-xs transition-all active:scale-95 border ${
                      step < 0
                        ? "bg-muted text-muted-foreground border-border"
                        : "bg-red-500/10 text-red-600 border-red-500/20"
                    }`}
                  >
                    {step > 0 ? `+${step}` : step}
                  </button>
                ))}
              </div>
              <p className="text-[11px] text-muted-foreground">Số lượng coupon rách/hỏng/hủy</p>
            </div>
          </div>
        )}

        {/* Calculation Summary Box */}
        <div className="p-4 rounded-2xl bg-gradient-to-r from-amber-500/10 via-amber-500/5 to-transparent border border-amber-500/30 flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="space-y-1 text-center sm:text-left">
            <div className="text-xs font-extrabold uppercase tracking-wider text-amber-600 dark:text-amber-400 flex items-center gap-2 justify-center sm:justify-start">
              <CheckCircle2 className="w-4 h-4 text-amber-500" />
              Tổng Số Coupon Tự Động Tính
            </div>
            <div className="text-xs text-muted-foreground font-medium">
              {isMaisonKayser
                ? `= ${bakeryNum} (Voucher Bánh) + ${cancelledNum} (Hủy)`
                : `= ${potatoNum} (Khoai) + ${beerNum} (Beer) + ${cancelledNum} (Hủy)`}
            </div>
          </div>

          <div className="flex items-center gap-5 text-right">
            <div className="text-center sm:text-right">
              <span className="text-[10px] font-bold text-muted-foreground uppercase block">Tổng Coupon</span>
              <span className="text-2xl font-black text-amber-600 dark:text-amber-400">{totalIssuedNum}</span>
            </div>
            <div className="text-center sm:text-right pl-5 border-l border-border/80">
              <span className="text-[10px] font-bold text-muted-foreground uppercase block">Ghi Nhận Hóa Đơn</span>
              <span className="text-2xl font-black text-emerald-600 dark:text-emerald-400">{postedBillsNum}</span>
            </div>
          </div>
        </div>

        {/* Action Button */}
        <div className="pt-2">
          <Button
            type="submit"
            disabled={isSubmitting}
            className="w-full sm:w-auto h-13 px-8 rounded-xl bg-amber-500 hover:bg-amber-600 active:scale-[0.98] text-black font-extrabold text-base shadow-lg shadow-amber-500/20 transition-all flex items-center justify-center gap-2.5 disabled:opacity-50"
          >
            <Save className="w-5 h-5" />
            {isSubmitting ? "Đang lưu Firestore..." : "Lưu Số Liệu Hôm Nay"}
          </Button>
        </div>
      </form>
    </Card>
  );
}
