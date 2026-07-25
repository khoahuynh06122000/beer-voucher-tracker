import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Download, ChevronLeft, ChevronRight, Eye, Camera } from "lucide-react";
import { downloadImage } from "@/lib/imageUtils";

interface ImagePreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  images: string[];
  initialIndex?: number;
  title?: string;
  billNumber?: string;
  onUploadMore?: (e: React.ChangeEvent<HTMLInputElement>) => void;
}

export function ImagePreviewModal({
  isOpen,
  onClose,
  images,
  initialIndex = 0,
  title = "Ảnh Bill & Vé Đối Soát",
  billNumber,
  onUploadMore,
}: ImagePreviewModalProps) {
  const [currentIndex, setCurrentIndex] = useState(initialIndex);

  if (!images || images.length === 0) return null;

  const currentImage = images[currentIndex] || images[0];

  const handlePrev = () => {
    setCurrentIndex((prev) => (prev > 0 ? prev - 1 : images.length - 1));
  };

  const handleNext = () => {
    setCurrentIndex((prev) => (prev < images.length - 1 ? prev + 1 : 0));
  };

  const handleDownloadCurrent = () => {
    const fileName = billNumber
      ? `bill_${billNumber}_anh_${currentIndex + 1}.jpg`
      : `anh_bill_doi_soat_${currentIndex + 1}.jpg`;
    downloadImage(currentImage, fileName);
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-4xl p-0 overflow-hidden bg-background border border-border rounded-2xl shadow-2xl">
        <DialogHeader className="p-4 border-b border-border/80 flex flex-row items-center justify-between gap-2 flex-wrap sm:flex-nowrap">
          <div>
            <DialogTitle className="text-base font-extrabold flex items-center gap-2">
              <Eye className="w-5 h-5 text-amber-500" />
              <span>{title}</span>
              <span className="text-xs px-2.5 py-0.5 rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-400 font-bold border border-amber-500/20">
                {currentIndex + 1} / {images.length}
              </span>
            </DialogTitle>
            {billNumber && (
              <p className="text-xs text-muted-foreground font-medium mt-0.5">
                Mã Bill / POS: <strong className="text-foreground">{billNumber}</strong>
              </p>
            )}
          </div>

          <div className="flex items-center gap-2">
            {onUploadMore && (
              <label className="cursor-pointer">
                <input
                  type="file"
                  accept="image/*"
                  multiple
                  onChange={onUploadMore}
                  className="hidden"
                />
                <div className="flex items-center gap-1.5 px-3 h-9 rounded-xl bg-amber-500/10 text-amber-700 dark:text-amber-300 border border-amber-500/20 font-bold text-xs hover:bg-amber-500/20 transition-all">
                  <Camera className="w-4 h-4 text-amber-500" />
                  <span>Bổ sung ảnh</span>
                </div>
              </label>
            )}

            <Button
              onClick={handleDownloadCurrent}
              variant="default"
              size="sm"
              className="bg-amber-500 hover:bg-amber-600 text-black font-extrabold gap-1.5 rounded-xl text-xs h-9 shadow-md shadow-amber-500/20"
            >
              <Download className="w-4 h-4" />
              <span>Tải Về</span>
            </Button>
          </div>
        </DialogHeader>

        {/* Main Image View */}
        <div className="relative min-h-[350px] max-h-[70vh] bg-black/90 flex items-center justify-center p-4 overflow-hidden">
          <img
            src={currentImage}
            alt={`Ảnh Bill ${currentIndex + 1}`}
            className="max-h-[65vh] max-w-full object-contain rounded-lg shadow-lg"
          />

          {images.length > 1 && (
            <>
              <button
                onClick={handlePrev}
                className="absolute left-3 top-1/2 -translate-y-1/2 p-2 rounded-full bg-black/60 text-white hover:bg-black/80 transition-all border border-white/20"
                title="Ảnh trước"
              >
                <ChevronLeft className="w-6 h-6" />
              </button>
              <button
                onClick={handleNext}
                className="absolute right-3 top-1/2 -translate-y-1/2 p-2 rounded-full bg-black/60 text-white hover:bg-black/80 transition-all border border-white/20"
                title="Ảnh kế tiếp"
              >
                <ChevronRight className="w-6 h-6" />
              </button>
            </>
          )}
        </div>

        {/* Thumbnail Selector Bar if multiple images */}
        {images.length > 1 && (
          <div className="p-3 bg-secondary/30 border-t border-border flex items-center gap-2 overflow-x-auto justify-center">
            {images.map((img, idx) => (
              <button
                key={idx}
                onClick={() => setCurrentIndex(idx)}
                className={`relative w-14 h-14 rounded-lg overflow-hidden border-2 transition-all ${
                  idx === currentIndex
                    ? "border-amber-500 scale-105 shadow-md"
                    : "border-transparent opacity-60 hover:opacity-100"
                }`}
              >
                <img src={img} alt="" className="w-full h-full object-cover" />
              </button>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
