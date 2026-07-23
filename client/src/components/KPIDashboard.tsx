import { trpc } from "@/lib/trpc";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Ticket, FileCheck, XCircle, Percent, ArrowUpRight, Beer } from "lucide-react";

interface KPIDashboardProps {
  refreshTrigger?: number;
}

export function KPIDashboard({ refreshTrigger }: KPIDashboardProps) {
  const { data: todayRecord, isLoading } = trpc.voucher.getToday.useQuery(
    undefined,
    {
      refetchInterval: 30000,
    }
  );

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        {[1, 2, 3, 4].map((i) => (
          <Card key={i} className="p-6 rounded-xl border border-border bg-card">
            <Skeleton className="h-4 w-28 mb-4" />
            <Skeleton className="h-8 w-20 mb-2" />
            <Skeleton className="h-3 w-36" />
          </Card>
        ))}
      </div>
    );
  }

  const potato = todayRecord?.potatoCoupons ?? Math.round((todayRecord?.postedBills ?? 0) / 2);
  const beer = todayRecord?.beerCoupons ?? ((todayRecord?.postedBills ?? 0) - potato);
  const cancelled = todayRecord?.cancelled ?? 0;
  const total = todayRecord?.totalIssued ?? 0;
  const rate = todayRecord?.utilizationRate ?? 0;

  const stats = [
    {
      label: "COUPON KHOAI TÂY",
      value: potato,
      unit: "Coupon khoai tây",
      icon: Ticket,
      iconBg: "bg-amber-500/10 text-amber-600 dark:text-amber-400 dark:bg-amber-500/20",
      accentBorder: "border-l-4 border-l-amber-500",
      badge: "Khoai tây",
      emoji: "🍟",
    },
    {
      label: "COUPON BEER",
      value: beer,
      unit: "Coupon bia",
      icon: Beer,
      iconBg: "bg-blue-500/10 text-blue-600 dark:text-blue-400 dark:bg-blue-500/20",
      accentBorder: "border-l-4 border-l-blue-500",
      badge: "Đồ uống",
      emoji: "🍺",
    },
    {
      label: "COUPON HỦY",
      value: cancelled,
      unit: "Coupon bị hủy",
      icon: XCircle,
      iconBg: "bg-red-500/10 text-red-600 dark:text-red-400 dark:bg-red-500/20",
      accentBorder: "border-l-4 border-l-red-500",
      badge: "Đã hủy",
      emoji: "❌",
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
      emoji: "📊",
    },
  ];

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
      {stats.map((stat) => {
        const Icon = stat.icon;
        return (
          <Card
            key={stat.label}
            className={`p-6 rounded-xl border border-border/70 bg-card shadow-sm hover:shadow-md transition-all duration-200 ${stat.accentBorder}`}
          >
            <div className="flex items-center justify-between mb-4">
              <span className="text-xs font-bold tracking-wider text-muted-foreground uppercase">
                {stat.label}
              </span>
              <div className={`p-2.5 rounded-lg ${stat.iconBg}`}>
                <Icon className="w-5 h-5" />
              </div>
            </div>

            <div className="flex items-baseline justify-between mb-2">
              <span className="text-3xl font-extrabold tracking-tight text-foreground">
                {stat.value}
              </span>
              <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-secondary text-secondary-foreground border border-border/50">
                {stat.badge}
              </span>
            </div>

            {stat.isRate ? (
              <div className="space-y-1.5 mt-3">
                <div className="w-full bg-secondary h-2 rounded-full overflow-hidden">
                  <div
                    className="bg-purple-600 dark:bg-purple-500 h-full rounded-full transition-all duration-500"
                    style={{ width: `${Math.min(100, Math.max(0, rate))}%` }}
                  />
                </div>
                <p className="text-[11px] text-muted-foreground font-medium text-right">
                  {stat.unit}
                </p>
              </div>
            ) : (
              <p className="text-xs text-muted-foreground font-medium mt-1">
                {stat.unit}
              </p>
            )}
          </Card>
        );
      })}
    </div>
  );
}
