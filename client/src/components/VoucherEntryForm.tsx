import { useState, useEffect, useRef } from "react";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Ticket, XCircle, CheckCircle2, Save, Beer, Building2, Camera, Image as ImageIcon, Trash2, Eye, FileText, Download } from "lucide-react";
import { useAuth } from "@/_core/hooks/useAuth";
import { getVoucherByDate, upsertVoucher, getLocalDateString } from "@/lib/firestoreService";
import { sendStoredMSTeamsReport } from "@/lib/msTeamsService";
import { uploadBillImage, downloadImage } from "@/lib/imageUtils";
import { ImagePreviewModal } from "./ImagePreviewModal";

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
  const [billNumber, setBillNumber] = useState<string>("");
  const [billImages, setBillImages] = useState<string[]>([]);
  const [previewIndex, setPreviewIndex] = useState<number | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const submittingRef = useRef(false);

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
      const record = await getVoucherByDate(restaurantId, date, false, true);
      if (isMounted) {
        if (record) {
          setPotatoCoupons(record.potatoCoupons?.toString() || "");
          setBeerCoupons(record.beerCoupons?.toString() || "");
          setBakeryCoupons(record.bakeryCoupons?.toString() || "");
          setCancelled(record.cancelled?.toString() || "");
          setBillNumber(record.billNumber || "");
          setBillImages(record.billImages || []);
        } else {
          setPotatoCoupons("");
          setBeerCoupons("");
          setBakeryCoupons("");
          setCancelled("");
          setBillNumber("");
          setBillImages([]);
        }
      }
    }
    loadData();
    return () => {
      isMounted = false;
    };
  }, [restaurantId, date]);

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const uploadingToast = toast.loading(`Đang tải ${files.length} ảnh lên kho...`);
    const newImageUrls: string[] = [];
    for (let i = 0; i < files.length; i++) {
      try {
        const url = await uploadBillImage(files[i], restaurantId, date);
        newImageUrls.push(url);
      } catch (err) {
        console.error("Lỗi tải ảnh lên Storage:", err);
      }
    }
    toast.dismiss(uploadingToast);

    if (newImageUrls.length > 0) {
      setBillImages((prev) => [...prev, ...newImageUrls]);
      toast.success(`Đã tải lên ${newImageUrls.length} ảnh Bill/Vé đối soát!`);
    } else {
      toast.error("Tải ảnh thất bại. Kiểm tra kết nối / cấu hình Storage.");
    }
    e.target.value = "";
  };

  const handleRemoveImage = (indexToRemove: number) => {
    setBillImages((prev) => prev.filter((_, idx) => idx !== indexToRemove));
    toast.info("Đã xóa ảnh được chọn.");
  };

  const potatoNum = parseInt(potatoCoupons) || 0;
  const beerNum = parseInt(beerCoupons) || 0;
  const bakeryNum = parseInt(bakeryCoupons) || 0;
  const cancelledNum = parseInt(cancelled) || 0;

  const postedBillsNum = isMaisonKayser ? bakeryNum : potatoNum + beerNum;
  const totalIssuedNum = isMaisonKayser ? bakeryNum : potatoNum + beerNum + cancelledNum;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (submittingRef.current || isSubmitting) {
      return;
    }

    if (isMaisonKayser) {
      if (!bakeryCoupons) {
        toast.error("Vui lòng nhập số liệu voucher bánh.");
        return;
      }
    } else {
      if (!potatoCoupons && !beerCoupons && !cancelled) {
        toast.error("Vui lòng nhập ít nhất một số liệu coupon.");
        return;
      }
    }

    submittingRef.current = true;
    setIsSubmitting(true);
    try {
      const savedRecord = await upsertVoucher({
        date,
        restaurantId,
        restaurantName,
        potatoCoupons: isMaisonKayser ? 0 : potatoNum,
        beerCoupons: isMaisonKayser ? 0 : beerNum,
        bakeryCoupons: isMaisonKayser ? bakeryNum : 0,
        cancelled: isMaisonKayser ? 0 : cancelledNum,
        postedBills: postedBillsNum,
        totalIssued: totalIssuedNum,
        createdBy: user?.username || "user",
        billNumber: billNumber.trim() || undefined,
        billImages: billImages.length > 0 ? billImages : undefined,
      });
      toast.success(`Đã lưu thành công số liệu ngày ${date} cho ${restaurantName}!`);

      // Trigger automatic MS Teams Report & Analysis send
      // restaurantName là optional trên VoucherRecord; ở đây đã biết chắc tên nhà hàng
      // đang nhập liệu nên dùng luôn làm phương án dự phòng.
      const res = await sendStoredMSTeamsReport({
        ...savedRecord,
        restaurantName: savedRecord.restaurantName ?? restaurantName,
      });
      if (res.success) {
        toast.success("📢 " + res.message);
      } else {
        console.warn("MS Teams send note:", res.message);
      }

      onSuccess?.(date);
    } catch (err: any) {
      toast.error(err.message || "Không thể lưu số liệu voucher.");
    } finally {
      submittingRef.current = false;
      setIsSubmitting(false);
    }
  };

  const calculatedRate =
    totalIssuedNum > 0 ? Math.round((postedBillsNum / totalIssuedNum) * 100) : 0;

  return (
    <Card className="p-4 sm:p-5 rounded-2xl border border-border/80 bg-card shadow-xs space-y-4">
      {/* Form Header */}
      <div className="flex items-center justify-between gap-3 pb-3 border-b border-border/60">
        <h3 className="text-base sm:text-lg font-extrabold text-foreground flex items-center gap-2">
          <Ticket className="w-5 h-5 text-amber-500 shrink-0" />
          <span>Nhập Số Liệu ({restaurantName})</span>
        </h3>

        {totalIssuedNum > 0 && (
          <div className="text-xs font-bold px-2.5 py-1 rounded-lg bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border border-emerald-500/20">
            Đổi số: {calculatedRate}%
          </div>
        )}
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Selection Row: Restaurant & Date */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {isAdmin && (
            <div>
              <label className="block text-xs font-bold text-muted-foreground mb-1">
                Nhà hàng
              </label>
              <select
                value={selectedRestaurantId}
                onChange={(e) => setSelectedRestaurantId(e.target.value)}
                className="w-full h-10 px-3 rounded-xl bg-background border border-border text-foreground font-semibold text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500"
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
            <div className="flex items-center justify-between mb-1">
              <label className="block text-xs font-bold text-muted-foreground">
                Ngày ghi nhận
              </label>
              <button
                type="button"
                onClick={() => setDate(getLocalDateString())}
                className="text-[11px] font-bold text-amber-600 dark:text-amber-400 hover:underline"
              >
                Hôm nay
              </button>
            </div>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-full h-10 px-3 rounded-xl bg-background border border-border text-foreground font-semibold text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500"
              required
            />
          </div>
        </div>

        {/* Numeric Coupon Inputs */}
        {isMaisonKayser ? (
          <div>
            <label className="block text-xs font-bold text-emerald-700 dark:text-emerald-400 mb-1">
              🥐 Voucher Bánh (Maison Kayser)
            </label>
            <input
              type="number"
              value={bakeryCoupons}
              onChange={(e) => setBakeryCoupons(e.target.value)}
              placeholder="0"
              className="w-full h-12 px-3.5 rounded-xl bg-background border border-border text-foreground font-black text-2xl focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
              min="0"
            />
          </div>
        ) : (
          <div className="space-y-2.5">
            <div className="grid grid-cols-3 gap-2.5">
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-xs font-bold text-amber-600 dark:text-amber-400 truncate">
                    🍟 Khoai Tây
                  </label>
                  <span className="text-[10px] font-semibold text-muted-foreground">0.1kg/vé</span>
                </div>
                <input
                  type="number"
                  value={potatoCoupons}
                  onChange={(e) => setPotatoCoupons(e.target.value)}
                  placeholder="0"
                  className="w-full h-11 px-3 rounded-xl bg-background border border-border text-foreground font-extrabold text-lg text-center focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500"
                  min="0"
                />
                <span className="block text-[10px] text-center font-bold text-amber-600 dark:text-amber-400 mt-1">
                  {(potatoNum * 0.1).toFixed(1)} kg | {(potatoNum * 13000).toLocaleString('vi-VN')} đ
                </span>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-xs font-bold text-blue-600 dark:text-blue-400 truncate">
                    🍺 Beer
                  </label>
                  <span className="text-[10px] font-semibold text-muted-foreground">0.5L/vé</span>
                </div>
                <input
                  type="number"
                  value={beerCoupons}
                  onChange={(e) => setBeerCoupons(e.target.value)}
                  placeholder="0"
                  className="w-full h-11 px-3 rounded-xl bg-background border border-border text-foreground font-extrabold text-lg text-center focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                  min="0"
                />
                <span className="block text-[10px] text-center font-bold text-blue-600 dark:text-blue-400 mt-1">
                  {(beerNum * 0.5).toFixed(1)} Lít | {(beerNum * 16000).toLocaleString('vi-VN')} đ
                </span>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-xs font-bold text-red-600 dark:text-red-400 truncate">
                    ❌ Hủy / Rách
                  </label>
                  <span className="text-[10px] font-semibold text-muted-foreground">Hủy</span>
                </div>
                <input
                  type="number"
                  value={cancelled}
                  onChange={(e) => setCancelled(e.target.value)}
                  placeholder="0"
                  className="w-full h-11 px-3 rounded-xl bg-background border border-border text-foreground font-extrabold text-lg text-center focus:outline-none focus:ring-2 focus:ring-red-500/20 focus:border-red-500"
                  min="0"
                />
                <span className="block text-[10px] text-center font-bold text-red-600 dark:text-red-400 mt-1">
                  Phế phẩm
                </span>
              </div>
            </div>

            {/* Product Conversion & Cost Highlight Banner */}
            <div className="p-3 rounded-xl bg-gradient-to-r from-amber-500/10 via-emerald-500/10 to-blue-500/10 border border-emerald-500/30 flex flex-col sm:flex-row items-center justify-between gap-2 text-xs">
              <div className="flex flex-wrap items-center gap-3">
                <div className="flex items-center gap-1.5 font-bold text-blue-700 dark:text-blue-300">
                  <Beer className="w-4 h-4 text-blue-500" />
                  <span>Bia: <strong className="font-black text-blue-600 dark:text-blue-400">{(beerNum * 0.5).toFixed(1)}L</strong> ({(beerNum * 16000).toLocaleString('vi-VN')} đ)</span>
                </div>
                <div className="flex items-center gap-1.5 font-bold text-amber-800 dark:text-amber-300">
                  <Ticket className="w-4 h-4 text-amber-500" />
                  <span>Khoai: <strong className="font-black text-amber-600 dark:text-amber-400">{(potatoNum * 0.1).toFixed(1)}kg</strong> ({(potatoNum * 13000).toLocaleString('vi-VN')} đ)</span>
                </div>
              </div>
              <div className="font-extrabold text-emerald-700 dark:text-emerald-400 bg-emerald-500/20 px-3 py-1 rounded-lg border border-emerald-500/30">
                💰 Tổng Chi Phí: <strong className="text-sm text-emerald-600 dark:text-emerald-300">{(beerNum * 16000 + potatoNum * 13000).toLocaleString('vi-VN')} VNĐ</strong>
              </div>
            </div>
          </div>
        )}

        {/* Compact Bill Code & Attachment Section */}
        <div className="p-3.5 rounded-xl bg-secondary/30 border border-border/70 space-y-2.5">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 items-center">
            {/* Bill Number */}
            <div>
              <label className="block text-[11px] font-bold text-muted-foreground mb-1">
                Mã / Số Bill POS (Tuỳ chọn)
              </label>
              <input
                type="text"
                value={billNumber}
                onChange={(e) => setBillNumber(e.target.value)}
                placeholder="Ví dụ: BILL-001"
                className="w-full h-9 px-3 rounded-lg bg-background border border-border text-foreground font-medium text-xs focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500"
              />
            </div>

            {/* Direct Camera / Image Upload */}
            <div>
              <label className="block text-[11px] font-bold text-muted-foreground mb-1">
                Đính kèm / Chụp ảnh Bill
              </label>
              <label className="cursor-pointer block">
                <input
                  type="file"
                  accept="image/*"
                  multiple
                  onChange={handleImageUpload}
                  className="hidden"
                />
                <div className="flex items-center justify-center gap-2 h-9 px-3 rounded-lg bg-amber-500 text-black font-extrabold text-xs hover:bg-amber-600 transition-all shadow-xs">
                  <Camera className="w-4 h-4" />
                  <span>{billImages.length > 0 ? `Thêm ảnh (${billImages.length})` : "Chụp / Tải ảnh Bill"}</span>
                </div>
              </label>
            </div>
          </div>

          {/* Uploaded Thumbnails Row */}
          {billImages.length > 0 && (
            <div className="flex items-center gap-2 overflow-x-auto pt-1">
              {billImages.map((imgUrl, idx) => (
                <div
                  key={idx}
                  className="relative group w-12 h-12 rounded-lg overflow-hidden border border-border shrink-0 bg-background"
                >
                  <img src={imgUrl} alt="" className="w-full h-full object-cover" />
                  <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-1">
                    <button
                      type="button"
                      onClick={() => setPreviewIndex(idx)}
                      className="p-1 rounded bg-white/20 text-white hover:bg-white/40"
                    >
                      <Eye className="w-3 h-3" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleRemoveImage(idx)}
                      className="p-1 rounded bg-red-500 text-white hover:bg-red-600"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Compact Footer Action Bar */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-1">
          <div className="flex items-center gap-4 text-xs font-semibold text-muted-foreground">
            <span>Tổng coupon: <strong className="text-amber-600 dark:text-amber-400 font-extrabold text-sm">{totalIssuedNum}</strong></span>
            <span>Hóa đơn: <strong className="text-emerald-600 dark:text-emerald-400 font-extrabold text-sm">{postedBillsNum}</strong></span>
          </div>

          <Button
            type="submit"
            disabled={isSubmitting}
            className="w-full sm:w-auto h-11 px-6 rounded-xl bg-amber-500 hover:bg-amber-600 active:scale-[0.98] text-black font-extrabold text-sm shadow-md shadow-amber-500/20 transition-all flex items-center justify-center gap-2"
          >
            <Save className="w-4 h-4" />
            <span>{isSubmitting ? "Đang lưu..." : "Lưu Số Liệu"}</span>
          </Button>
        </div>
      </form>

      {/* Lightbox / Preview Modal */}
      {previewIndex !== null && billImages.length > 0 && (
        <ImagePreviewModal
          isOpen={previewIndex !== null}
          onClose={() => setPreviewIndex(null)}
          images={billImages}
          initialIndex={previewIndex}
          billNumber={billNumber}
          title={`Ảnh Bill / POS (${restaurantName} - Ngày ${date})`}
        />
      )}
    </Card>
  );
}
