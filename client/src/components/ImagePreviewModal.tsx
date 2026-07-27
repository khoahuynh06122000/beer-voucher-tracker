import { useState, useRef } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  Download,
  ChevronLeft,
  ChevronRight,
  Eye,
  Camera,
  ZoomIn,
  ZoomOut,
  RotateCw,
  RotateCcw,
  Maximize2,
  X
} from "lucide-react";
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
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);

  if (!images || images.length === 0) return null;

  const currentImage = images[currentIndex] || images[0];

  const resetTransform = () => {
    setZoom(1);
    setRotation(0);
  };

  const handlePrev = () => {
    resetTransform();
    setCurrentIndex((prev) => (prev > 0 ? prev - 1 : images.length - 1));
  };

  const handleNext = () => {
    resetTransform();
    setCurrentIndex((prev) => (prev < images.length - 1 ? prev + 1 : 0));
  };

  const handleZoomIn = () => {
    setZoom((prev) => Math.min(prev + 0.3, 3.5));
  };

  const handleZoomOut = () => {
    setZoom((prev) => Math.max(prev - 0.3, 0.6));
  };

  const handleRotateRight = () => {
    setRotation((prev) => (prev + 90) % 360);
  };

  const handleRotateLeft = () => {
    setRotation((prev) => (prev - 90 + 360) % 360);
  };

  const handleDownloadCurrent = () => {
    const fileName = billNumber
      ? `bill_${billNumber}_anh_${currentIndex + 1}.jpg`
      : `anh_bill_doi_soat_${currentIndex + 1}.jpg`;
    downloadImage(currentImage, fileName);
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-6xl w-[96vw] h-[92vh] max-h-[92vh] flex flex-col p-0 overflow-hidden bg-[#0a0c12] border border-amber-500/30 text-white rounded-2xl shadow-2xl">
        {/* Header Bar */}
        <DialogHeader className="p-3.5 px-5 bg-[#0f121d] border-b border-amber-500/20 flex flex-row items-center justify-between gap-3 shrink-0 flex-wrap sm:flex-nowrap">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-amber-500/20 text-amber-400 border border-amber-500/30">
              <Eye className="w-5 h-5 text-amber-400" />
            </div>
            <div>
              <DialogTitle className="text-base font-black text-white flex items-center gap-2">
                <span>{title}</span>
                <span className="text-xs px-2.5 py-0.5 rounded-full bg-amber-500/20 text-amber-300 font-bold border border-amber-500/30">
                  {currentIndex + 1} / {images.length}
                </span>
              </DialogTitle>
              {billNumber && (
                <p className="text-xs text-amber-200/80 font-medium mt-0.5">
                  Mã Bill / POS: <strong className="text-amber-400 font-bold">#{billNumber}</strong>
                </p>
              )}
            </div>
          </div>

          {/* Controls toolbar */}
          <div className="flex items-center gap-1.5 flex-wrap">
            {/* Zoom & Rotation Controls */}
            <div className="flex items-center gap-1 bg-black/40 p-1 rounded-xl border border-white/10">
              <Button
                type="button"
                onClick={handleRotateLeft}
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-gray-300 hover:text-white hover:bg-white/10 rounded-lg"
                title="Xoay trái 90°"
              >
                <RotateCcw className="w-4 h-4" />
              </Button>
              <Button
                type="button"
                onClick={handleRotateRight}
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-gray-300 hover:text-white hover:bg-white/10 rounded-lg"
                title="Xoay phải 90°"
              >
                <RotateCw className="w-4 h-4" />
              </Button>

              <div className="w-[1px] h-4 bg-white/20 mx-0.5" />

              <Button
                type="button"
                onClick={handleZoomOut}
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-gray-300 hover:text-white hover:bg-white/10 rounded-lg"
                title="Thu nhỏ (-)"
              >
                <ZoomOut className="w-4 h-4" />
              </Button>

              <span className="text-[11px] font-mono font-bold text-amber-300 min-w-[42px] text-center">
                {Math.round(zoom * 100)}%
              </span>

              <Button
                type="button"
                onClick={handleZoomIn}
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-gray-300 hover:text-white hover:bg-white/10 rounded-lg"
                title="Phóng to (+)"
              >
                <ZoomIn className="w-4 h-4" />
              </Button>

              <div className="w-[1px] h-4 bg-white/20 mx-0.5" />

              {/* Quick HD Zoom Presets */}
              <button
                type="button"
                onClick={() => setZoom(1.8)}
                className={`h-7 px-2 text-[10px] font-black rounded-lg transition-all ${
                  Math.abs(zoom - 1.8) < 0.05
                    ? "bg-amber-500 text-black shadow-md shadow-amber-500/30"
                    : "bg-white/5 hover:bg-white/10 text-amber-300 border border-amber-500/20"
                }`}
                title="Phóng to 180% siêu rõ nét"
              >
                180% HD
              </button>

              <button
                type="button"
                onClick={() => setZoom(2.5)}
                className={`h-7 px-2 text-[10px] font-black rounded-lg transition-all ${
                  Math.abs(zoom - 2.5) < 0.05
                    ? "bg-amber-500 text-black shadow-md shadow-amber-500/30"
                    : "bg-white/5 hover:bg-white/10 text-amber-300 border border-amber-500/20"
                }`}
                title="Phóng to 250% chi tiết"
              >
                250% HD
              </button>

              {(zoom !== 1 || rotation !== 0) && (
                <Button
                  type="button"
                  onClick={resetTransform}
                  variant="ghost"
                  size="sm"
                  className="h-8 px-2 text-[10px] font-bold text-amber-400 hover:bg-amber-500/20 rounded-lg gap-1"
                  title="Đặt lại vừa màn hình"
                >
                  <Maximize2 className="w-3 h-3" />
                  Reset
                </Button>
              )}
            </div>

            {onUploadMore && (
              <label className="cursor-pointer">
                <input
                  type="file"
                  accept="image/*"
                  multiple
                  onChange={onUploadMore}
                  className="hidden"
                />
                <div className="flex items-center gap-1.5 px-3 h-9 rounded-xl bg-amber-500/20 text-amber-300 border border-amber-500/30 font-bold text-xs hover:bg-amber-500/30 transition-all">
                  <Camera className="w-4 h-4 text-amber-400" />
                  <span className="hidden sm:inline">Bổ sung ảnh</span>
                </div>
              </label>
            )}

            <Button
              onClick={handleDownloadCurrent}
              variant="default"
              size="sm"
              className="bg-amber-500 hover:bg-amber-400 text-black font-extrabold gap-1.5 rounded-xl text-xs h-9 shadow-lg shadow-amber-500/20"
            >
              <Download className="w-4 h-4" />
              <span>Tải Về</span>
            </Button>

            <Button
              onClick={onClose}
              variant="ghost"
              size="icon"
              className="h-9 w-9 text-gray-400 hover:text-white hover:bg-white/10 rounded-xl"
            >
              <X className="w-5 h-5" />
            </Button>
          </div>
        </DialogHeader>

        {/* Main Image Viewport */}
        <div className="flex-1 w-full relative bg-[#040508] overflow-auto flex items-center justify-center p-6 select-none">
          <div
            className="transition-transform duration-200 ease-out flex items-center justify-center"
            style={{
              transform: `scale(${zoom}) rotate(${rotation}deg)`,
              transformOrigin: "center center",
            }}
          >
            <img
              src={currentImage}
              alt={`Ảnh Bill ${currentIndex + 1}`}
              className="max-h-[80vh] max-w-full object-contain rounded-xl shadow-2xl border border-white/10 bg-black/40"
              style={{
                imageRendering: "high-quality",
                WebkitBackfaceVisibility: "hidden",
              }}
              draggable={false}
            />
          </div>

          {images.length > 1 && (
            <>
              <button
                onClick={handlePrev}
                className="absolute left-4 top-1/2 -translate-y-1/2 p-3 rounded-2xl bg-black/70 text-white hover:bg-amber-500 hover:text-black transition-all border border-white/20 shadow-xl z-20"
                title="Ảnh trước"
              >
                <ChevronLeft className="w-7 h-7" />
              </button>
              <button
                onClick={handleNext}
                className="absolute right-4 top-1/2 -translate-y-1/2 p-3 rounded-2xl bg-black/70 text-white hover:bg-amber-500 hover:text-black transition-all border border-white/20 shadow-xl z-20"
                title="Ảnh kế tiếp"
              >
                <ChevronRight className="w-7 h-7" />
              </button>
            </>
          )}
        </div>

        {/* Thumbnail Selector Bar if multiple images */}
        {images.length > 1 && (
          <div className="p-2.5 bg-[#0d0f17] border-t border-amber-500/20 flex items-center gap-2 overflow-x-auto justify-center shrink-0">
            {images.map((img, idx) => (
              <button
                key={idx}
                onClick={() => {
                  resetTransform();
                  setCurrentIndex(idx);
                }}
                className={`relative w-16 h-16 rounded-xl overflow-hidden border-2 transition-all shrink-0 ${
                  idx === currentIndex
                    ? "border-amber-400 scale-105 shadow-lg shadow-amber-500/30"
                    : "border-transparent opacity-50 hover:opacity-100"
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

