import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Ticket, XCircle, Percent, Beer, Calendar } from "lucide-react";
import { useAuth } from "@/_core/hooks/useAuth";
import { getVoucherByDate, getLocalDateString, VoucherRecord } from "@/lib/firestoreService";

interface KPIDashboardProps {
  refreshTrigger?: number;
  selectedDate?: string;
  onDateChange?: (date: string) => void;
}

export function KPIDashboard({ refreshTrigger, selectedDate, onDateChange }: KPIDashboardProps) {
  const { user } = useAuth();
  const [todayRecord, setTodayRecord] = useState<VoucherRecord | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const targetDate = selectedDate || getLocalDateString();
  const isAdmin = user?.role === "admin";
  const restaurantId = user?.username || user?.id || "lehoibia";

  useEffect(() => {
    let isMounted = true;
    async function fetchKPI() {
      setIsLoading(true);
      if (restaurantId) {
        const record = await getVoucherByDate(restaurantId, targetDate, isAdmin);
        if (isMounted) setTodayRecord(record);
      }
      if (isMounted) setIsLoading(false);
    }
    fetchKPI();
    return () => {
      isMounted = false;
    };
  }, [restaurantId, targetDate, isAdmin, refreshTrigger]);

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

  const isMaisonKayserUser = restaurantId === "maisonkayser" || bakery > 0;

  const stats = isMaisonKayserUser
    ? [
        {
          label: "VOUCHER BÁNH",
          value: bakery,
          unit: "Voucher bánh thu về",
          icon: Ticket,
          iconBg: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 dark:bg-emerald-500/20",
          accentBorder: "border-l-4 border-l-emerald-500",
          badge: "Maison Kayser",
        },
        {
          label: "KHOAI TÂY & BIA",
          value: potato + beer,
          unit: "Coupon bia & khoai tây",
          icon: Beer,
          iconBg: "bg-amber-500/10 text-amber-600 dark:text-amber-400 dark:bg-amber-500/20",
          accentBorder: "border-l-4 border-l-amber-500",
          badge: "Đồ ăn / Đồ uống",
        },
        {
          label: "COUPON HỦY",
          value: cancelled,
          unit: "Coupon bị hủy",
          icon: XCircle,
          iconBg: "bg-red-500/10 text-red-600 dark:text-red-400 dark:bg-red-500/20",
          accentBorder: "border-l-4 border-l-red-500",
          badge: "Đã hủy",
        },
        {
          label: "TỔNG VOUCHER",
          value: total,
          unit: `Tỷ lệ quy đổi ${rate}%`,
          icon: Percent,
          iconBg: "bg-amber-500/10 text-amber-600 dark:text-amber-400 dark:bg-amber-500/20",
          accentBorder: "border-l-4 border-l-amber-500",
          badge: `${rate}% Quy đổi`,
          isRate: true,
        },
      ]
    : [
        {
          label: "COUPON KHOAI TÂY",
          value: potato,
          unit: "Coupon khoai tây",
          icon: Ticket,
          iconBg: "bg-amber-500/10 text-amber-600 dark:text-amber-400 dark:bg-amber-500/20",
          accentBorder: "border-l-4 border-l-amber-500",
          badge: "Khoai tây",
        },
        {
          label: "COUPON BEER",
          value: beer,
          unit: "Coupon bia",
          icon: Beer,
          iconBg: "bg-blue-500/10 text-blue-600 dark:text-blue-400 dark:bg-blue-500/20",
          accentBorder: "border-l-4 border-l-blue-500",
          badge: "Đồ uống",
        },
        {
          label: "COUPON HỦY",
          value: cancelled,
          unit: "Coupon bị hủy",
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

  return (
    <div className="space-y-3">
      {/* Date bar badge */}
      <div className="flex items-center justify-between text-xs text-muted-foreground bg-secondary/40 border border-border/50 px-3.5 py-1.5 rounded-lg">
        <div className="flex items-center gap-2">
          <Calendar className="w-3.5 h-3.5 text-amber-500" />
          <span>
            Đang hiển thị số liệu ngày: <strong className="text-foreground">{targetDate}</strong>
          </span>
          {isAdmin && (
            <span className="px-2 py-0.5 rounded bg-amber-500/20 text-amber-700 dark:text-amber-300 font-bold text-[10px] uppercase">
              Tổng Tất Cả Nhà Hàng
            </span>
          )}
        </div>
        {onDateChange && (
          <div className="flex items-center gap-2">
            <span className="hidden sm:inline">Đổi ngày:</span>
            <input
              type="date"
              value={targetDate}
              onChange={(e) => onDateChange(e.target.value)}
              className="px-2 py-0.5 text-xs rounded bg-background border border-border text-foreground font-semibold"
            />
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-5">
        {stats.map((stat) => {
          const Icon = stat.icon;
          return (
            <Card
              key={stat.label}
              className={`p-3.5 sm:p-5 rounded-2xl border border-border/70 bg-card shadow-sm hover:shadow-md transition-all duration-200 ${stat.accentBorder}`}
            >
              <div className="flex items-center justify-between mb-2.5">
                <span className="text-[10px] sm:text-xs font-black tracking-wider text-muted-foreground uppercase truncate">
                  {stat.label}
                </span>
                <div className={`p-2 rounded-xl shrink-0 ${stat.iconBg}`}>
                  <Icon className="w-4 h-4 sm:w-5 sm:h-5" />
                </div>
              </div>

              <div className="flex items-baseline justify-between mb-1">
                <span className="text-2xl sm:text-3xl font-black tracking-tight text-foreground">
                  {stat.value.toLocaleString("vi-VN")}
                </span>
                <span className="text-[9px] sm:text-xs font-bold px-1.5 py-0.5 rounded-full bg-secondary text-secondary-foreground border border-border/50 truncate max-w-[80px] sm:max-w-none">
                  {stat.badge}
                </span>
              </div>

              {stat.isRate ? (
                <div className="space-y-1 mt-2">
                  <div className="w-full bg-secondary h-1.5 rounded-full overflow-hidden">
                    <div
                      className="bg-emerald-500 h-full rounded-full transition-all duration-500"
                      style={{ width: `${Math.min(100, Math.max(0, rate))}%` }}
                    />
                  </div>
                  <p className="text-[10px] sm:text-[11px] text-muted-foreground font-medium text-right truncate">
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
    </div>
  );
}

