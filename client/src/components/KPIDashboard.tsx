import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Ticket, XCircle, Percent, Beer, Calendar, Camera, Eye, Download, FileText } from "lucide-react";
import { useAuth } from "@/_core/hooks/useAuth";
import { getVoucherByDate, getLocalDateString, VoucherRecord } from "@/lib/firestoreService";
import { ImagePreviewModal } from "./ImagePreviewModal";
import { downloadImage } from "@/lib/imageUtils";

interface KPIDashboardProps {
  refreshTrigger?: number;
  selectedDate?: string;
  onDateChange?: (date: string) => void;
}

export function KPIDashboard({ refreshTrigger, selectedDate, onDateChange }: KPIDashboardProps) {
  const { user } = useAuth();
  const [todayRecord, setTodayRecord] = useState<VoucherRecord | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [previewIndex, setPreviewIndex] = useState<number | null>(null);

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

  const isMaisonKayser = restaurantId === "maisonkayser" || todayRecord?.restaurantId === "maisonkayser";

  let stats;

  if (isMaisonKayser) {
    // Maison Kayser ONLY uses Voucher Bánh (No Potato, Beer, or Cancelled)
    stats = [
      {
        label: "VOUCHER BÁNH",
        value: bakery,
        unit: "Voucher bánh phát hành & thu về",
        icon: Ticket,
        iconBg: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 dark:bg-emerald-500/20",
        accentBorder: "border-l-4 border-l-emerald-500",
        badge: "Maison Kayser",
      },
      {
        label: "GHI NHẬN HÓA ĐƠN",
        value: todayRecord?.postedBills ?? bakery,
        unit: "Hóa đơn POS ghi nhận thành công",
        icon: Ticket,
        iconBg: "bg-blue-500/10 text-blue-600 dark:text-blue-400 dark:bg-blue-500/20",
        accentBorder: "border-l-4 border-l-blue-500",
        badge: "Đã quy đổi",
      },
      {
        label: "TỶ LỆ QUY ĐỔI",
        value: `${rate}%`,
        unit: "Hiệu suất quy đổi voucher bánh",
        icon: Percent,
        iconBg: "bg-purple-500/10 text-purple-600 dark:text-purple-400 dark:bg-purple-500/20",
        accentBorder: "border-l-4 border-l-purple-500",
        badge: "100% Quy đổi",
      },
      {
        label: "TỔNG VOUCHER BÁNH",
        value: total,
        unit: `Tỷ lệ quy đổi ${rate}%`,
        icon: Percent,
        iconBg: "bg-amber-500/10 text-amber-600 dark:text-amber-400 dark:bg-amber-500/20",
        accentBorder: "border-l-4 border-l-amber-500",
        badge: `${rate}% Quy đổi`,
        isRate: true,
      },
    ];
  } else if (isAdmin) {
    // Admin View combining all restaurants
    stats = [
      {
        label: "COUPON KHOAI TÂY & BIA",
        value: potato + beer,
        unit: "Coupon khoai tây & bia toàn nhà hàng",
        icon: Beer,
        iconBg: "bg-amber-500/10 text-amber-600 dark:text-amber-400 dark:bg-amber-500/20",
        accentBorder: "border-l-4 border-l-amber-500",
        badge: "Đồ ăn / Đồ uống",
      },
      {
        label: "VOUCHER BÁNH (MK)",
        value: bakery,
        unit: "Voucher bánh Maison Kayser",
        icon: Ticket,
        iconBg: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 dark:bg-emerald-500/20",
        accentBorder: "border-l-4 border-l-emerald-500",
        badge: "Maison Kayser",
      },
      {
        label: "COUPON HỦY",
        value: cancelled,
        unit: "Coupon rách, hỏng, hủy",
        icon: XCircle,
        iconBg: "bg-red-500/10 text-red-600 dark:text-red-400 dark:bg-red-500/20",
        accentBorder: "border-l-4 border-l-red-500",
        badge: "Đã hủy",
      },
      {
        label: "TỔNG TẤT CẢ VOUCHER",
        value: total,
        unit: `Tỷ lệ quy đổi ${rate}%`,
        icon: Percent,
        iconBg: "bg-amber-500/10 text-amber-600 dark:text-amber-400 dark:bg-amber-500/20",
        accentBorder: "border-l-4 border-l-amber-500",
        badge: `${rate}% Quy đổi`,
        isRate: true,
      },
    ];
  } else {
    // Standard Beer Restaurants (Lễ Hội Bia, Beer Plaza, Craft Beer, Taiga, etc.)
    stats = [
      {
        label: "COUPON KHOAI TÂY",
        value: potato,
        unit: "Coupon khoai tây thu về",
        icon: Ticket,
        iconBg: "bg-amber-500/10 text-amber-600 dark:text-amber-400 dark:bg-amber-500/20",
        accentBorder: "border-l-4 border-l-amber-500",
        badge: "Khoai tây",
      },
      {
        label: "COUPON BEER",
        value: beer,
        unit: "Coupon bia thu về",
        icon: Beer,
        iconBg: "bg-blue-500/10 text-blue-600 dark:text-blue-400 dark:bg-blue-500/20",
        accentBorder: "border-l-4 border-l-blue-500",
        badge: "Đồ uống",
      },
      {
        label: "COUPON HỦY",
        value: cancelled,
        unit: "Coupon rách, hỏng, hủy",
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
  }

  return (
    <div className="space-y-3">
      {/* Date bar badge */}
      <div className="flex items-center justify-between text-xs text-muted-foreground bg-amber-500/10 dark:bg-amber-500/10 border border-amber-500/20 px-4 py-2 rounded-2xl shadow-sm">
        <div className="flex items-center gap-2">
          <Calendar className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
          <span>
            Đang hiển thị số liệu ngày: <strong className="text-foreground font-bold">{targetDate}</strong>
          </span>
          {isAdmin && (
            <span className="px-2 py-0.5 rounded-md bg-amber-500/20 text-amber-800 dark:text-amber-300 font-extrabold text-[10px] uppercase tracking-wide border border-amber-500/30">
              Tổng Tất Cả Nhà Hàng
            </span>
          )}
        </div>
        {onDateChange && (
          <div className="flex items-center gap-2">
            <span className="hidden sm:inline font-semibold">Đổi ngày:</span>
            <input
              type="date"
              value={targetDate}
              onChange={(e) => onDateChange(e.target.value)}
              className="px-2.5 py-1 text-xs rounded-xl bg-background border border-amber-500/30 text-foreground font-bold shadow-xs focus:ring-2 focus:ring-amber-500/30 outline-none"
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
              className="relative overflow-hidden p-4 sm:p-5 rounded-2xl border border-border/80 bg-gradient-to-b from-card via-card to-amber-500/[0.02] shadow-[0_4px_20px_-4px_rgba(217,119,6,0.06)] dark:shadow-[0_4px_20px_-4px_rgba(0,0,0,0.4)] hover:shadow-lg hover:border-amber-500/30 transition-all duration-300 group"
            >
              {/* Subtle colored accent top bar */}
              <div className={`absolute top-0 left-0 right-0 h-1 ${stat.accentBorder.replace('border-l-4 border-l-', 'bg-')}`} />

              <div className="flex items-center justify-between mb-3">
                <span className="text-[10px] sm:text-xs font-black tracking-wider text-muted-foreground uppercase truncate">
                  {stat.label}
                </span>
                <div className={`p-2 sm:p-2.5 rounded-xl shrink-0 group-hover:scale-110 transition-transform ${stat.iconBg}`}>
                  <Icon className="w-4 h-4 sm:w-5 sm:h-5" />
                </div>
              </div>

              <div className="flex items-baseline justify-between mb-1.5">
                <span className="text-2xl sm:text-3.5xl font-black tracking-tight text-foreground">
                  {stat.value.toLocaleString("vi-VN")}
                </span>
                <span className="text-[9px] sm:text-xs font-extrabold px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-800 dark:text-amber-300 border border-amber-500/20 truncate max-w-[90px] sm:max-w-none">
                  {stat.badge}
                </span>
              </div>

              {stat.isRate ? (
                <div className="space-y-1.5 mt-2">
                  <div className="w-full bg-secondary h-2 rounded-full overflow-hidden p-0.5 border border-border/50">
                    <div
                      className="bg-gradient-to-r from-emerald-500 to-teal-400 h-full rounded-full transition-all duration-500 shadow-xs"
                      style={{ width: `${Math.min(100, Math.max(0, rate))}%` }}
                    />
                  </div>
                  <p className="text-[10px] sm:text-[11px] text-muted-foreground font-semibold text-right truncate">
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

      {/* Bill & Voucher Images Section for Selected Date */}
      {todayRecord && ((todayRecord.billImages && todayRecord.billImages.length > 0) || todayRecord.billNumber) && (
        <Card className="p-4 sm:p-5 rounded-2xl border border-border/80 bg-card shadow-xs space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-border/60">
            <div className="flex items-center gap-2">
              <Camera className="w-4 h-4 text-amber-500" />
              <h4 className="text-sm font-extrabold text-foreground">
                Ảnh Bill &amp; Chứng Từ Đối Soát ({targetDate})
              </h4>
            </div>
            {todayRecord.billNumber && (
              <span className="text-xs font-bold text-amber-600 dark:text-amber-400 bg-amber-500/10 px-3 py-1 rounded-full border border-amber-500/20">
                Mã / Số Bill: {todayRecord.billNumber}
              </span>
            )}
          </div>

          {todayRecord.billImages && todayRecord.billImages.length > 0 ? (
            <div className="space-y-2">
              <div className="text-xs font-semibold text-muted-foreground flex items-center justify-between">
                <span>Danh sách ảnh đính kèm ({todayRecord.billImages.length} ảnh):</span>
                <span className="text-[11px] text-amber-600 dark:text-amber-400 font-bold">
                  Nhấp vào ảnh để xem phóng to &amp; tải về
                </span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 gap-3">
                {todayRecord.billImages.map((imgUrl, idx) => (
                  <div
                    key={idx}
                    className="group relative rounded-xl overflow-hidden border border-border/80 bg-background aspect-square shadow-xs flex items-center justify-center cursor-pointer"
                    onClick={() => setPreviewIndex(idx)}
                  >
                    <img
                      src={imgUrl}
                      alt={`Bill ${idx + 1}`}
                      className="w-full h-full object-cover transition-transform group-hover:scale-105"
                    />
                    <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                      <Button
                        size="sm"
                        variant="secondary"
                        className="h-8 w-8 p-0 rounded-full bg-white/20 hover:bg-white/40 text-white"
                        title="Xem ảnh"
                      >
                        <Eye className="w-4 h-4" />
                      </Button>
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={(e) => {
                          e.stopPropagation();
                          downloadImage(imgUrl, `bill_${targetDate}_${idx + 1}.jpg`);
                        }}
                        className="h-8 w-8 p-0 rounded-full bg-amber-500 text-black hover:bg-amber-600"
                        title="Tải về"
                      >
                        <Download className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">Chưa có ảnh bill được tải lên cho ngày này.</p>
          )}
        </Card>
      )}

      {/* Lightbox / Preview Modal for Dashboard */}
      {previewIndex !== null && todayRecord?.billImages && todayRecord.billImages.length > 0 && (
        <ImagePreviewModal
          isOpen={previewIndex !== null}
          onClose={() => setPreviewIndex(null)}
          images={todayRecord.billImages}
          initialIndex={previewIndex}
          billNumber={todayRecord.billNumber}
          title={`Ảnh Bill & Vé Đối Soát - Ngày ${targetDate}`}
        />
      )}
    </div>
  );
}

