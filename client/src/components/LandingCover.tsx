import { useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { startLogin } from "@/const";
import {
  Beer,
  Sparkles,
  ArrowRight,
  ShieldCheck,
  CheckCircle2,
  TrendingUp,
  FileCheck,
  Bell,
  BarChart3,
  ChevronDown,
} from "lucide-react";

export function LandingCover() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // Canvas particle effect with realistic rising beer carbonation bubbles & effervescence
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let animationFrameId: number;
    let bubbles: Array<{
      x: number;
      y: number;
      speedY: number;
      radius: number;
      opacity: number;
      wobbleSpeed: number;
      wobbleAmplitude: number;
      phase: number;
      isGolden: boolean;
    }> = [];

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
      initBubbles();
    };

    const initBubbles = () => {
      bubbles = [];
      // Higher density for rich beer effervescence
      const count = Math.floor((canvas.width * canvas.height) / 8000);

      for (let i = 0; i < count; i++) {
        bubbles.push(createBubble(Math.random() * canvas.height));
      }
    };

    const createBubble = (startY?: number) => {
      const radius = Math.random() < 0.85 ? Math.random() * 2.5 + 1 : Math.random() * 5 + 2.5;
      const speedY = (Math.random() * 1.2 + 0.6) * (radius > 3 ? 1.3 : 1.0);
      return {
        x: Math.random() * canvas.width,
        y: startY !== undefined ? startY : canvas.height + Math.random() * 40,
        speedY,
        radius,
        opacity: Math.random() * 0.6 + 0.25,
        wobbleSpeed: Math.random() * 0.05 + 0.01,
        wobbleAmplitude: Math.random() * 1.2 + 0.3,
        phase: Math.random() * Math.PI * 2,
        isGolden: Math.random() < 0.4,
      };
    };

    let tick = 0;
    const render = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      tick++;

      for (let i = 0; i < bubbles.length; i++) {
        const b = bubbles[i];
        b.y -= b.speedY;
        b.phase += b.wobbleSpeed;
        b.x += Math.sin(b.phase) * b.wobbleAmplitude * 0.5;

        // Reset bubble when reaching top
        if (b.y < -10) {
          bubbles[i] = createBubble();
        }

        ctx.beginPath();
        ctx.arc(b.x, b.y, b.radius, 0, Math.PI * 2);

        if (b.isGolden) {
          // Amber golden carbonation bubble
          ctx.fillStyle = `rgba(245, 158, 11, ${b.opacity * 0.8})`;
          ctx.strokeStyle = `rgba(251, 191, 36, ${b.opacity})`;
        } else {
          // Translucent white beer foam bubble
          ctx.fillStyle = `rgba(255, 255, 255, ${b.opacity * 0.5})`;
          ctx.strokeStyle = `rgba(255, 255, 255, ${b.opacity * 0.9})`;
        }

        ctx.lineWidth = 0.8;
        ctx.fill();
        ctx.stroke();

        // Shiny reflection dot inside larger bubbles
        if (b.radius > 2.5) {
          ctx.beginPath();
          ctx.arc(b.x - b.radius * 0.3, b.y - b.radius * 0.3, b.radius * 0.25, 0, Math.PI * 2);
          ctx.fillStyle = `rgba(255, 255, 255, ${b.opacity * 0.9})`;
          ctx.fill();
        }
      }

      animationFrameId = requestAnimationFrame(render);
    };

    resize();
    window.addEventListener("resize", resize);
    render();

    return () => {
      window.removeEventListener("resize", resize);
      cancelAnimationFrame(animationFrameId);
    };
  }, []);

  return (
    <div className="relative min-h-screen bg-[#07080a] text-white selection:bg-amber-500 selection:text-black overflow-x-hidden font-sans">
      {/* Dynamic Background Canvas */}
      <canvas
        ref={canvasRef}
        className="fixed inset-0 w-full h-full pointer-events-none z-10 opacity-70"
      />

      {/* Radial Gradient Glows */}
      <div className="fixed top-[-10%] left-1/2 -translate-x-1/2 w-[800px] h-[500px] bg-gradient-to-b from-amber-500/15 via-amber-600/5 to-transparent blur-[120px] pointer-events-none z-0" />
      <div className="fixed bottom-[-10%] left-[-10%] w-[600px] h-[600px] bg-amber-600/10 blur-[150px] pointer-events-none z-0" />

      {/* Header */}
      <header className="fixed top-0 left-0 right-0 z-50 backdrop-blur-md bg-black/40 border-b border-white/10 transition-all">
        <div className="container max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-gradient-to-br from-amber-400 to-amber-600 text-black font-bold shadow-lg shadow-amber-500/20">
              <Beer className="w-5 h-5" />
            </div>
            <div>
              <span className="font-extrabold text-lg tracking-tight text-white block leading-none">
                BEER VOUCHER
              </span>
              <span className="text-[10px] uppercase font-bold tracking-widest text-amber-400/90">
                Analytics Platform
              </span>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <Button
              onClick={() => startLogin()}
              className="bg-amber-500 hover:bg-amber-400 text-black font-extrabold text-xs uppercase tracking-wider px-5 py-2.5 rounded-lg shadow-lg shadow-amber-500/25 transition-all hover:scale-105"
            >
              Đăng Nhập
            </Button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="relative z-20 pt-32 pb-20">
        {/* Hero Section */}
        <section className="container max-w-5xl mx-auto px-6 text-center pt-12 pb-20 flex flex-col items-center">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs font-semibold mb-8 backdrop-blur-md animate-fade-in">
            <Sparkles className="w-3.5 h-3.5 text-amber-400" />
            Nền Tảng Quản Lý Voucher Chuyên Nghiệp
          </div>

          <h1 className="text-4xl sm:text-6xl md:text-7xl font-extrabold text-white tracking-tight leading-[1.1] mb-8 max-w-4xl">
            Tối ưu hóa quản lý{" "}
            <span className="relative inline-block text-amber-400">
              voucher bia
              <span className="absolute bottom-1 left-0 w-full h-[6px] bg-amber-500/40 rounded-full -z-10" />
            </span>{" "}
            thời gian thực.
          </h1>

          <p className="text-lg sm:text-xl text-gray-300 max-w-2xl mx-auto leading-relaxed mb-10 font-normal">
            Giải pháp thông minh giúp ghi nhận chính xác chỉ số phát hành, kiểm tra công thức tự động, phân tích xu hướng quy đổi và báo cáo qua MS Teams.
          </p>

          <div className="flex flex-col sm:flex-row items-center gap-4 justify-center w-full max-w-md mb-16">
            <Button
              onClick={() => startLogin()}
              size="lg"
              className="w-full sm:w-auto bg-amber-500 hover:bg-amber-400 text-black font-extrabold text-sm px-8 py-6 rounded-xl shadow-xl shadow-amber-500/20 transition-all hover:scale-105 flex items-center justify-center gap-2"
            >
              Đăng Nhập Hệ Thống
              <ArrowRight className="w-5 h-5" />
            </Button>

            <div className="flex items-center gap-2 px-4 py-3 rounded-xl bg-white/5 border border-white/10 backdrop-blur-md font-mono text-xs text-gray-300">
              <span className="text-amber-400">&gt;</span>
              <code>POST /api/vouchers/daily</code>
            </div>
          </div>

          <div className="animate-bounce pt-4 text-gray-500">
            <ChevronDown className="w-6 h-6" />
          </div>
        </section>

        {/* Feature Cards Grid (Inspired by Veldara Cards layout) */}
        <section className="container max-w-6xl mx-auto px-6 py-12">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <div className="group p-8 rounded-2xl bg-gradient-to-b from-white/10 to-white/5 border border-white/10 hover:border-amber-500/40 backdrop-blur-xl transition-all duration-300 hover:-translate-y-1">
              <div className="p-3.5 rounded-xl bg-amber-500/10 text-amber-400 w-fit mb-6 border border-amber-500/20 group-hover:bg-amber-500 group-hover:text-black transition-all">
                <FileCheck className="w-6 h-6" />
              </div>
              <h3 className="text-xl font-bold text-white mb-3">
                Công Thức Tự Động
              </h3>
              <p className="text-sm text-gray-400 leading-relaxed">
                Hệ thống tự động xác thực công thức nghiêm ngặt: <strong className="text-gray-200">Tổng phát = Hóa đơn ghi nhận + Voucher hủy</strong> nhằm ngăn chặn sai lệch số liệu.
              </p>
            </div>

            <div className="group p-8 rounded-2xl bg-gradient-to-b from-white/10 to-white/5 border border-white/10 hover:border-amber-500/40 backdrop-blur-xl transition-all duration-300 hover:-translate-y-1">
              <div className="p-3.5 rounded-xl bg-amber-500/10 text-amber-400 w-fit mb-6 border border-amber-500/20 group-hover:bg-amber-500 group-hover:text-black transition-all">
                <BarChart3 className="w-6 h-6" />
              </div>
              <h3 className="text-xl font-bold text-white mb-3">
                Biểu Đồ & Tỷ Lệ Sử Dụng
              </h3>
              <p className="text-sm text-gray-400 leading-relaxed">
                Trực quan hóa tỷ lệ quy đổi voucher theo ngày, tuần, tháng với biểu đồ tương tác Recharts hiện đại, giúp dễ dàng dự báo nhu cầu tiêu thụ.
              </p>
            </div>

            <div className="group p-8 rounded-2xl bg-gradient-to-b from-white/10 to-white/5 border border-white/10 hover:border-amber-500/40 backdrop-blur-xl transition-all duration-300 hover:-translate-y-1">
              <div className="p-3.5 rounded-xl bg-amber-500/10 text-amber-400 w-fit mb-6 border border-amber-500/20 group-hover:bg-amber-500 group-hover:text-black transition-all">
                <Bell className="w-6 h-6" />
              </div>
              <h3 className="text-xl font-bold text-white mb-3">
                Tự Động Báo Cáo MS Teams
              </h3>
              <p className="text-sm text-gray-400 leading-relaxed">
                Tích hợp Incoming Webhook tự động gửi thẻ báo cáo tổng hợp chỉ số phát hành trực tiếp tới kênh MS Teams doanh nghiệp mỗi ngày lúc 8:00 AM UTC.
              </p>
            </div>
          </div>
        </section>

        {/* Highlight Banner Section */}
        <section className="container max-w-5xl mx-auto px-6 py-16">
          <div className="p-10 md:p-14 rounded-3xl bg-gradient-to-r from-amber-500/20 via-amber-600/10 to-transparent border border-amber-500/30 backdrop-blur-2xl text-center md:text-left flex flex-col md:flex-row items-center justify-between gap-8">
            <div className="space-y-3 max-w-xl">
              <p className="text-xs font-bold uppercase tracking-widest text-amber-400">
                Sẵn sàng trải nghiệm
              </p>
              <h2 className="text-2xl sm:text-3xl font-extrabold text-white">
                Bắt đầu theo dõi và tối ưu hóa hiệu quả voucher bia ngay hôm nay.
              </h2>
            </div>
            <Button
              onClick={() => startLogin()}
              size="lg"
              className="bg-amber-500 hover:bg-amber-400 text-black font-extrabold text-sm px-8 py-6 rounded-xl shadow-xl shadow-amber-500/20 transition-all shrink-0"
            >
              Truy Cập Ngay
            </Button>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="relative z-20 border-t border-white/10 bg-black/60 py-8 text-center text-xs text-gray-500">
        <div className="container max-w-7xl mx-auto px-6 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <Beer className="w-4 h-4 text-amber-500" />
            <span className="font-bold text-gray-300">Beer Voucher Tracker</span>
          </div>
          <p>© 2026 Beer Voucher Analytics System. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
}
