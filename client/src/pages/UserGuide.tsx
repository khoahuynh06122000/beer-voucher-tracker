import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useLocation } from "wouter";
import {
  Beer,
  ArrowLeft,
  Printer,
  FileText,
  CheckCircle2,
  Clock,
  Send,
  AlertTriangle,
  HelpCircle,
  Smartphone,
  ShieldCheck,
  Zap,
  Users
} from "lucide-react";

export default function UserGuide() {
  const [, setLocation] = useLocation();
  const [copiedLink, setCopiedLink] = useState(false);

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="min-h-screen bg-[#07090e] text-gray-100 py-8 px-4 sm:px-6 lg:px-8 print:bg-white print:text-black print:p-0">
      {/* Top Header - Hidden on Print */}
      <div className="max-w-5xl mx-auto mb-8 flex flex-col sm:flex-row items-center justify-between gap-4 print:hidden">
        <Button
          onClick={() => setLocation("/")}
          variant="outline"
          className="border-white/20 text-gray-300 hover:bg-white/10 flex items-center gap-2"
        >
          <ArrowLeft className="w-4 h-4" /> Quay Về Trang Chủ
        </Button>

        <div className="flex items-center gap-3">
          <Button
            onClick={handlePrint}
            className="bg-amber-500 hover:bg-amber-400 text-black font-extrabold px-6 py-2.5 rounded-xl flex items-center gap-2 shadow-lg shadow-amber-500/20"
          >
            <Printer className="w-4 h-4" /> In / Tải Xuất File PDF Hướng Dẫn
          </Button>
        </div>
      </div>

      {/* Main Printable Document */}
      <div className="max-w-5xl mx-auto bg-[#0f111a] border border-amber-500/30 rounded-3xl p-6 sm:p-10 shadow-2xl space-y-10 print:border-none print:shadow-none print:p-0 print:bg-white print:text-black">
        
        {/* Document Header */}
        <div className="border-b border-amber-500/20 pb-8 text-center sm:text-left flex flex-col sm:flex-row items-center justify-between gap-6 print:border-b-2 print:border-black">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-amber-500/10 border border-amber-500/30 text-amber-400 text-xs font-bold uppercase tracking-wider print:border-black print:text-black">
              <Beer className="w-4 h-4" /> SUN WORLD BA NA HILLS - TÀI LIỆU HƯỚNG DẪN SỬ DỤNG
            </div>
            <h1 className="text-2xl sm:text-3xl font-black text-white tracking-tight print:text-black">
              CẨM NANG HƯỚNG DẪN QUẢN LÝ & BÁO CÁO VOUCHER BEER
            </h1>
            <p className="text-sm text-gray-400 print:text-gray-700">
              Dành cho Thu Ngân, Quản Lý Nhà Hàng & Bộ Phận Kế Toán
            </p>
          </div>

          <div className="text-right text-xs text-gray-400 space-y-1 border-l sm:border-amber-500/20 sm:pl-6 print:border-black print:text-black">
            <div><strong>Phiên bản:</strong> 2.0 (Tự Động Nhắc Nhở MS Teams)</div>
            <div><strong>Ngày phát hành:</strong> 25/07/2026</div>
            <div><strong>Áp dụng:</strong> Cụm Nhà Hàng Beer Ba Na Hills</div>
          </div>
        </div>

        {/* Section 1: Dành cho Thu ngân / Quản lý nhà hàng */}
        <section className="space-y-4">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-amber-500/20 text-amber-400 font-extrabold text-sm print:bg-gray-200 print:text-black">
              BƯỚC 1
            </div>
            <h2 className="text-xl font-bold text-amber-300 flex items-center gap-2 print:text-black">
              <Users className="w-5 h-5" /> Hướng Dẫn Dành Cho Nhà Hàng: Nhập Số Liệu Hàng Ngày
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card className="p-5 bg-black/40 border-white/10 rounded-2xl space-y-3 print:bg-gray-50 print:border-gray-300">
              <div className="flex items-center gap-2 text-amber-400 font-bold text-sm print:text-black">
                <span className="w-6 h-6 rounded-full bg-amber-500/20 flex items-center justify-center text-xs">1</span>
                Đăng Nhập Tài Khoản
              </div>
              <p className="text-xs text-gray-300 print:text-gray-800 leading-relaxed">
                Mở ứng dụng, chọn tài khoản Nhà hàng của bạn (ví dụ: <strong>Lê Hội Bia, Nhà Hàng 1901, Beer Plaza, Maison Kayser</strong>) và chọn nút <strong>Đăng Nhập</strong>.
              </p>
            </Card>

            <Card className="p-5 bg-black/40 border-white/10 rounded-2xl space-y-3 print:bg-gray-50 print:border-gray-300">
              <div className="flex items-center gap-2 text-amber-400 font-bold text-sm print:text-black">
                <span className="w-6 h-6 rounded-full bg-amber-500/20 flex items-center justify-center text-xs">2</span>
                Nhập Số Liệu Voucher
              </div>
              <p className="text-xs text-gray-300 print:text-gray-800 leading-relaxed">
                Chuyển qua thẻ <strong>"Nhập Số Liệu Mới"</strong>. Điền chính xác số lượng Bill đã đóng mấu, Voucher phát ra, Voucher khoai tây, bia, bánh mì...
              </p>
            </Card>

            <Card className="p-5 bg-black/40 border-white/10 rounded-2xl space-y-3 print:bg-gray-50 print:border-gray-300">
              <div className="flex items-center gap-2 text-amber-400 font-bold text-sm print:text-black">
                <span className="w-6 h-6 rounded-full bg-amber-500/20 flex items-center justify-center text-xs">3</span>
                Lưu & Gửi Báo Cáo
              </div>
              <p className="text-xs text-gray-300 print:text-gray-800 leading-relaxed">
                Nhấn <strong>"Lưu Dữ Liệu"</strong>. Bạn cũng có thể bấm <strong>"Gửi Báo Cáo Ngay Qua MS Teams"</strong> để gửi thẻ báo cáo đẹp mắt vào nhóm chat.
              </p>
            </Card>
          </div>
        </section>

        {/* Section 2: Tính năng cảnh báo tự động 9:00 AM */}
        <section className="space-y-4 pt-4 border-t border-white/10 print:border-gray-300">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-red-500/20 text-red-400 font-extrabold text-sm print:bg-gray-200 print:text-black">
              BƯỚC 2
            </div>
            <h2 className="text-xl font-bold text-red-400 flex items-center gap-2 print:text-black">
              <Clock className="w-5 h-5" /> Cơ Chế Cảnh Báo Tự Động 9:00 Sáng (Không Cần Thao Tác)
            </h2>
          </div>

          <div className="p-5 rounded-2xl bg-red-950/20 border border-red-500/30 space-y-3 print:bg-gray-50 print:border-gray-300">
            <div className="flex items-center gap-2 text-sm font-bold text-red-300 print:text-black">
              <AlertTriangle className="w-5 h-5 text-red-400" />
              Cách Thức Hệ Thống Nhắc Nhở Tự Động
            </div>
            <p className="text-xs text-gray-300 print:text-gray-800 leading-relaxed">
              Đúng <strong>9:00 sáng mỗi ngày</strong>, máy chủ Cloud sẽ tự động rà soát dữ liệu kiểm kê của ngày hôm trước. Nếu bất kỳ nhà hàng nào chưa cập nhật số liệu, hệ thống sẽ tự động gửi một <strong>Thẻ Cảnh Báo Khẩn màu đỏ</strong> trực tiếp vào kênh MS Teams <em>"PHỐI HỢP KẾ TOÁN - CỤM BEER"</em>.
            </p>
            <div className="p-4 rounded-xl bg-black/50 border border-white/10 text-xs text-amber-300 space-y-1 print:bg-white print:text-black print:border-gray-400">
              <div className="font-bold flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                Ví dụ mẫu thông báo trên MS Teams lúc 09:00:00:
              </div>
              <div className="pl-6 text-gray-300 print:text-gray-800 italic">
                ⚠️ <strong>CẢNH BÁO LỆCH CẬP NHẬT KIỂM KÊ — 09:00:00 25/07/2026</strong><br/>
                🔴 <strong>KHẨN (2 nhà hàng chưa gửi số liệu ngày 24/07/2026):</strong><br/>
                • <strong>Maison Kayser</strong>: CHƯA cập nhật lần nào<br/>
                • <strong>Lê Hội Bia</strong>: CHƯA cập nhật lần nào<br/>
                🟢 <strong>ĐÃ CẬP NHẬT HOÀN TẤT (2/4 nhà hàng):</strong><br/>
                • <strong>Beer Plaza</strong>: Đã cập nhật (120 phiếu)<br/>
                • <strong>Nhà Hàng 1901</strong>: Đã cập nhật (85 phiếu)
              </div>
            </div>
          </div>
        </section>

        {/* Section 3: Dành cho Admin / Kế Toán - Cấu hình */}
        <section className="space-y-4 pt-4 border-t border-white/10 print:border-gray-300">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-emerald-500/20 text-emerald-400 font-extrabold text-sm print:bg-gray-200 print:text-black">
              BƯỚC 3
            </div>
            <h2 className="text-xl font-bold text-emerald-400 flex items-center gap-2 print:text-black">
              <ShieldCheck className="w-5 h-5" /> Hướng Dẫn Cho Ban Quản Lý / Kế Toán
            </h2>
          </div>

          <div className="space-y-3 text-xs text-gray-300 print:text-gray-800 leading-relaxed">
            <div className="p-4 rounded-xl bg-black/40 border border-white/10 space-y-2 print:bg-gray-50 print:border-gray-300">
              <div className="font-bold text-white print:text-black flex items-center gap-2">
                <Send className="w-4 h-4 text-amber-400" />
                1. Cách kiểm tra thủ công & Gửi cảnh báo tức thì:
              </div>
              <p>
                Đăng nhập tài khoản <strong>Ban Quản Lý (Admin)</strong> &rarr; Vào <strong>Cài Đặt Admin</strong> &rarr; Nhìn xuống mục <strong>"Cảnh Báo Chưa Cập Nhật Số Liệu Ngày"</strong>. Tại đây bạn sẽ thấy danh sách nhà hàng nào chưa nộp số liệu và có nút bấm <em>"Gửi Cảnh Báo Nhắc Nhở Ngay Qua MS Teams"</em> nếu cần giục gấp.
              </p>
            </div>

            <div className="p-4 rounded-xl bg-black/40 border border-white/10 space-y-2 print:bg-gray-50 print:border-gray-300">
              <div className="font-bold text-white print:text-black flex items-center gap-2">
                <Zap className="w-4 h-4 text-emerald-400" />
                2. Liên kết với Power Automate (Tùy chọn nâng cao):
              </div>
              <p>
                Nếu muốn dùng lịch trình của Power Automate, bạn chỉ cần tạo hành động HTTP gọi URL sau lúc 9:00 AM:
              </p>
              <code className="block p-2 rounded bg-black/60 font-mono text-[11px] text-amber-300 border border-amber-500/20 print:bg-gray-200 print:text-black">
                GET https://ais-dev-bwzcf2gu5c624hioouglz7-321266207795.asia-east1.run.app/api/cron/check-missing-reports
              </code>
            </div>
          </div>
        </section>

        {/* Section 4: FAQ */}
        <section className="space-y-4 pt-4 border-t border-white/10 print:border-gray-300">
          <h2 className="text-lg font-bold text-amber-300 flex items-center gap-2 print:text-black">
            <HelpCircle className="w-5 h-5" /> Câu Hỏi Thường Gặp (FAQ)
          </h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
            <div className="p-4 rounded-xl bg-black/30 border border-white/10 space-y-1.5 print:bg-gray-50 print:border-gray-300">
              <div className="font-bold text-amber-300 print:text-black">
                Q: Bắt buộc phải nhập số liệu trước mấy giờ?
              </div>
              <p className="text-gray-300 print:text-gray-800">
                Thu ngân/Quản lý nên nhập số liệu cuối ngày hoặc trước <strong>08:55 sáng ngày hôm sau</strong> để tránh bị hệ thống ghi nhận thiếu và gửi cảnh báo đỏ lên nhóm MS Teams lúc 9:00.
              </p>
            </div>

            <div className="p-4 rounded-xl bg-black/30 border border-white/10 space-y-1.5 print:bg-gray-50 print:border-gray-300">
              <div className="font-bold text-amber-300 print:text-black">
                Q: Nếu nhập sai số lượng thì có sửa được không?
              </div>
              <p className="text-gray-300 print:text-gray-800">
                Hoàn toàn được! Bạn chỉ cần chọn lại Ngày đó trong form nhập, điền lại số lượng chuẩn và bấm <strong>"Lưu Dữ Liệu"</strong>. Hệ thống sẽ ghi đè bản ghi mới nhất.
              </p>
            </div>

            <div className="p-4 rounded-xl bg-black/30 border border-white/10 space-y-1.5 print:bg-gray-50 print:border-gray-300">
              <div className="font-bold text-amber-300 print:text-black">
                Q: Có cần bật máy tính hay treo trình duyệt lúc 9h không?
              </div>
              <p className="text-gray-300 print:text-gray-800">
                Không cần! Máy chủ Cloud Firestore hoạt động 24/7 tự động chạy nhiệm vụ lúc 9:00 sáng mỗi ngày.
              </p>
            </div>

            <div className="p-4 rounded-xl bg-black/30 border border-white/10 space-y-1.5 print:bg-gray-50 print:border-gray-300">
              <div className="font-bold text-amber-300 print:text-black">
                Q: Khi nào Kế Toán xem được báo cáo tổng hợp?
              </div>
              <p className="text-gray-300 print:text-gray-800">
                Ngay khi bất kỳ nhà hàng nào bấm Lưu, Kế toán và Admin có thể xem được dữ liệu thời gian thực trên Bảng Phân Tích & Xuất File Excel bất kỳ lúc nào.
              </p>
            </div>
          </div>
        </section>

        {/* Document Footer */}
        <div className="pt-6 border-t border-white/10 text-center text-xs text-gray-500 space-y-1 print:border-black print:text-black">
          <p className="font-bold text-gray-400 print:text-black">
            SUN WORLD BA NA HILLS — HỆ THỐNG QUẢN LÝ VOUCHER BEER BÀ NÀ
          </p>
          <p>Mọi thắc mắc kỹ thuật vui lòng liên hệ Ban Quản Lý hoặc Kế Toán Cụm Beer.</p>
        </div>

      </div>
    </div>
  );
}
