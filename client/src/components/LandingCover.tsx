import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { trpc } from "@/lib/trpc";
import { COOKIE_NAME } from "@shared/const";
import beerFoamBg from "@/assets/beer_foam_bg.jpg";
import {
  Beer,
  Sparkles,
  ArrowRight,
  ShieldCheck,
  CheckCircle2,
  FileCheck,
  Bell,
  BarChart3,
  ChevronDown,
  UserCheck,
  User,
  X,
  Lock,
  Loader2,
  Check,
  UserPlus,
  KeyRound,
  AlertCircle,
} from "lucide-react";

export function LandingCover() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [loginUsername, setLoginUsername] = useState("");
  const [loginPassword, setLoginPassword] = useState("");

  const [authError, setAuthError] = useState<string | null>(null);
  const [isLoggingIn, setIsLoggingIn] = useState(false);

  const utils = trpc.useUtils();

  const loginCredentialsMutation = trpc.auth.loginWithCredentials.useMutation({
    onSuccess: async (data) => {
      if (data?.token) {
        try {
          sessionStorage.setItem("manus-cookie", `${COOKIE_NAME}=${data.token}`);
          document.cookie = `${COOKIE_NAME}=${data.token}; Path=/; max-age=31536000; SameSite=None; Secure`;
        } catch (e) {
          console.error("Token storage error:", e);
        }
      }
      await utils.auth.me.invalidate();
      await utils.auth.me.refetch();
      setIsLoggingIn(false);
    },
    onError: (err) => {
      let msg = err.message || "Tên tài khoản hoặc mật khẩu không chính xác.";
      if (
        msg.includes("Unable to transform") ||
        msg.includes("Unexpected token") ||
        msg.includes("is not valid JSON")
      ) {
        msg = "Không thể kết nối đến hệ thống máy chủ API. Vui lòng kiểm tra lại dịch vụ backend.";
      }
      setAuthError(msg);
      setIsLoggingIn(false);
    },
  });

  const loginAsMutation = trpc.auth.loginAs.useMutation({
    onSuccess: async (data) => {
      if (data?.token) {
        try {
          sessionStorage.setItem("manus-cookie", `${COOKIE_NAME}=${data.token}`);
          document.cookie = `${COOKIE_NAME}=${data.token}; Path=/; max-age=31536000; SameSite=None; Secure`;
        } catch (e) {
          console.error("Token storage error:", e);
        }
      }
      await utils.auth.me.invalidate();
      await utils.auth.me.refetch();
      setIsLoggingIn(false);
    },
    onError: (err) => {
      let msg = err.message || "Đăng nhập nhanh thất bại.";
      if (
        msg.includes("Unable to transform") ||
        msg.includes("Unexpected token") ||
        msg.includes("is not valid JSON")
      ) {
        msg = "Không thể kết nối đến hệ thống máy chủ API. Vui lòng kiểm tra lại dịch vụ backend.";
      }
      setAuthError(msg);
      setIsLoggingIn(false);
    },
  });

  const handleLoginWithCreds = async (u: string, p: string) => {
    setAuthError(null);
    if (!u.trim() || !p) return;

    setIsLoggingIn(true);
    try {
      await loginCredentialsMutation.mutateAsync({
        emailOrUsername: u.trim(),
        password: p,
      });
    } catch {
      // Handled in onError
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    await handleLoginWithCreds(loginUsername, loginPassword);
  };

  const handleQuickLogin = async (name: string, role: "admin" | "user") => {
    setAuthError(null);
    setIsLoggingIn(true);
    try {
      await loginAsMutation.mutateAsync({ name, role });
    } catch {
      setIsLoggingIn(false);
    }
  };

  // Canvas effect with realistic rising draft beer effervescence & creamy foam head
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let animationFrameId: number;

    // Nucleation sites (columns where carbonation streams originate)
    let nucleationSites: number[] = [];

    // Micro-bubbles rising in streams
    let streamBubbles: Array<{
      columnX: number;
      x: number;
      y: number;
      speedY: number;
      radius: number;
      opacity: number;
      phase: number;
      wobbleSpeed: number;
      wobbleAmp: number;
      isAmber: boolean;
    }> = [];

    // Ambient floating bubbles
    let ambientBubbles: Array<{
      x: number;
      y: number;
      speedY: number;
      radius: number;
      opacity: number;
      phase: number;
      wobbleSpeed: number;
      wobbleAmp: number;
      isAmber: boolean;
    }> = [];

    // Top foam head particles
    let foamHeadParticles: Array<{
      x: number;
      y: number;
      radius: number;
      alpha: number;
      phase: number;
    }> = [];

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
      initBeerEffect();
    };

    const initBeerEffect = () => {
      // Create 16-24 nucleation columns across the width
      const numColumns = Math.floor(canvas.width / 75) + 6;
      nucleationSites = [];
      for (let i = 0; i < numColumns; i++) {
        nucleationSites.push(Math.random() * canvas.width);
      }

      // Stream micro-bubbles
      streamBubbles = [];
      const streamCount = Math.floor((canvas.width * canvas.height) / 5000);
      for (let i = 0; i < streamCount; i++) {
        const colX = nucleationSites[Math.floor(Math.random() * nucleationSites.length)];
        streamBubbles.push(createStreamBubble(colX, Math.random() * canvas.height));
      }

      // Ambient bubbles
      ambientBubbles = [];
      const ambientCount = Math.floor((canvas.width * canvas.height) / 9000);
      for (let i = 0; i < ambientCount; i++) {
        ambientBubbles.push(createAmbientBubble(Math.random() * canvas.height));
      }

      // Creamy foam particles at top
      foamHeadParticles = [];
      const foamCount = Math.floor(canvas.width / 12) + 20;
      for (let i = 0; i < foamCount; i++) {
        foamHeadParticles.push({
          x: Math.random() * (canvas.width + 40) - 20,
          y: Math.random() * 25 + 5,
          radius: Math.random() * 18 + 12,
          alpha: Math.random() * 0.4 + 0.5,
          phase: Math.random() * Math.PI * 2,
        });
      }
    };

    const createStreamBubble = (colX: number, startY?: number) => {
      const radius = Math.random() < 0.85 ? Math.random() * 1.8 + 0.6 : Math.random() * 3.5 + 1.8;
      const speedY = (Math.random() * 1.6 + 0.9) * (radius > 2.5 ? 1.2 : 1.0);
      return {
        columnX: colX,
        x: colX + (Math.random() - 0.5) * 8,
        y: startY !== undefined ? startY : canvas.height + Math.random() * 40,
        speedY,
        radius,
        opacity: Math.random() * 0.7 + 0.3,
        phase: Math.random() * Math.PI * 2,
        wobbleSpeed: Math.random() * 0.08 + 0.02,
        wobbleAmp: Math.random() * 1.2 + 0.3,
        isAmber: Math.random() < 0.6,
      };
    };

    const createAmbientBubble = (startY?: number) => {
      const radius = Math.random() * 2.5 + 0.8;
      const speedY = Math.random() * 1.1 + 0.5;
      return {
        x: Math.random() * canvas.width,
        y: startY !== undefined ? startY : canvas.height + Math.random() * 40,
        speedY,
        radius,
        opacity: Math.random() * 0.6 + 0.2,
        phase: Math.random() * Math.PI * 2,
        wobbleSpeed: Math.random() * 0.04 + 0.01,
        wobbleAmp: Math.random() * 2.0 + 0.5,
        isAmber: Math.random() < 0.5,
      };
    };

    let tick = 0;

    const render = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      tick += 0.03;

      // 1. Draw Creamy Foam Head Layer at the top (Undulating Beer Foam)
      ctx.save();
      for (const f of foamHeadParticles) {
        const waveY = f.y + Math.sin(tick + f.phase) * 3;
        const grad = ctx.createRadialGradient(
          f.x, waveY, 0,
          f.x, waveY, f.radius
        );
        grad.addColorStop(0, `rgba(255, 253, 245, ${f.alpha})`);
        grad.addColorStop(0.7, `rgba(254, 243, 199, ${f.alpha * 0.75})`);
        grad.addColorStop(1, "rgba(245, 158, 11, 0)");

        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(f.x, waveY, f.radius, 0, Math.PI * 2);
        ctx.fill();
      }

      // Continuous Foam Bottom Contour Line
      ctx.beginPath();
      ctx.moveTo(0, 0);
      for (let x = 0; x <= canvas.width; x += 30) {
        const foamY = 18 + Math.sin(x * 0.015 + tick) * 6 + Math.cos(x * 0.03 - tick * 0.5) * 4;
        ctx.lineTo(x, foamY);
      }
      ctx.lineTo(canvas.width, 0);
      ctx.closePath();
      ctx.fillStyle = "rgba(255, 251, 235, 0.25)";
      ctx.fill();
      ctx.restore();

      // Helper to render soft glowing micro-bubbles
      const drawBeerBubble = (b: {
        x: number;
        y: number;
        radius: number;
        opacity: number;
        isAmber: boolean;
      }) => {
        ctx.beginPath();
        ctx.arc(b.x, b.y, b.radius, 0, Math.PI * 2);

        if (b.radius < 1.8) {
          // Micro-carbonation dot with glowing aura
          ctx.fillStyle = b.isAmber
            ? `rgba(251, 191, 36, ${b.opacity})`
            : `rgba(255, 255, 255, ${b.opacity * 0.9})`;
          ctx.fill();
        } else {
          // Medium carbonation bubble with soft radial glow (no harsh dark outlines)
          const radGrad = ctx.createRadialGradient(
            b.x - b.radius * 0.3, b.y - b.radius * 0.3, 0,
            b.x, b.y, b.radius
          );

          if (b.isAmber) {
            radGrad.addColorStop(0, `rgba(255, 251, 235, ${b.opacity * 0.95})`);
            radGrad.addColorStop(0.5, `rgba(245, 158, 11, ${b.opacity * 0.7})`);
            radGrad.addColorStop(1, `rgba(217, 119, 6, ${b.opacity * 0.2})`);
          } else {
            radGrad.addColorStop(0, `rgba(255, 255, 255, ${b.opacity * 0.95})`);
            radGrad.addColorStop(0.6, `rgba(254, 243, 199, ${b.opacity * 0.6})`);
            radGrad.addColorStop(1, `rgba(255, 255, 255, 0.1)`);
          }

          ctx.fillStyle = radGrad;
          ctx.fill();

          // Soft highlight sheen dot
          ctx.beginPath();
          ctx.arc(b.x - b.radius * 0.35, b.y - b.radius * 0.35, b.radius * 0.3, 0, Math.PI * 2);
          ctx.fillStyle = `rgba(255, 255, 255, ${b.opacity * 0.8})`;
          ctx.fill();
        }
      };

      // 2. Render Nucleation Stream Bubbles
      for (let i = 0; i < streamBubbles.length; i++) {
        const b = streamBubbles[i];
        b.y -= b.speedY;
        b.phase += b.wobbleSpeed;
        b.x = b.columnX + Math.sin(b.phase) * b.wobbleAmp;

        // Reset when reaching the top foam layer
        if (b.y < 35) {
          const colX = nucleationSites[Math.floor(Math.random() * nucleationSites.length)];
          streamBubbles[i] = createStreamBubble(colX);
        }

        drawBeerBubble(b);
      }

      // 3. Render Ambient Bubbles
      for (let i = 0; i < ambientBubbles.length; i++) {
        const b = ambientBubbles[i];
        b.y -= b.speedY;
        b.phase += b.wobbleSpeed;
        b.x += Math.sin(b.phase) * 0.4;

        if (b.y < 35) {
          ambientBubbles[i] = createAmbientBubble();
        }

        drawBeerBubble(b);
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
      {/* Photorealistic Beer Foam & Golden Draft Background */}
      <div className="fixed inset-0 z-0 pointer-events-none overflow-hidden">
        <img
          src={beerFoamBg}
          alt="Draft Beer Foam Background"
          referrerPolicy="no-referrer"
          className="w-full h-full object-cover object-top opacity-40 scale-105 filter contrast-125 saturate-125"
        />
        <div className="absolute inset-0 bg-gradient-to-b from-black/70 via-black/60 to-[#07080a]/95" />
      </div>

      {/* Dynamic Beer Carbonation Canvas Overlay */}
      <canvas
        ref={canvasRef}
        className="fixed inset-0 w-full h-full pointer-events-none z-10 opacity-90"
      />

      {/* Golden Draft Amber Glow Effects */}
      <div className="fixed top-[-10%] left-1/2 -translate-x-1/2 w-[900px] h-[550px] bg-gradient-to-b from-amber-500/20 via-amber-600/10 to-transparent blur-[140px] pointer-events-none z-0" />
      <div className="fixed bottom-[-10%] left-[-10%] w-[700px] h-[700px] bg-amber-600/15 blur-[160px] pointer-events-none z-0" />

      {/* Top Beer Foam Crown Line */}
      <div className="fixed top-0 left-0 right-0 h-1.5 bg-gradient-to-r from-amber-300 via-yellow-100 to-amber-400 z-50 shadow-[0_0_15px_rgba(251,191,36,0.8)]" />

      {/* Header */}
      <header className="fixed top-1.5 left-0 right-0 z-50 backdrop-blur-md bg-black/50 border-b border-white/10 transition-all">
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
              onClick={() => setShowLoginModal(true)}
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
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs font-semibold mb-8 backdrop-blur-md">
            <Sparkles className="w-3.5 h-3.5 text-amber-400 animate-pulse" />
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
              onClick={() => setShowLoginModal(true)}
              size="lg"
              className="w-full sm:w-auto bg-amber-500 hover:bg-amber-400 text-black font-extrabold text-sm px-8 py-6 rounded-xl shadow-xl shadow-amber-500/25 transition-all hover:scale-105 flex items-center justify-center gap-2"
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

        {/* Feature Cards Grid */}
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
              onClick={() => setShowLoginModal(true)}
              size="lg"
              className="bg-amber-500 hover:bg-amber-400 text-black font-extrabold text-sm px-8 py-6 rounded-xl shadow-xl shadow-amber-500/20 transition-all shrink-0"
            >
              Truy Cập Ngay
            </Button>
          </div>
        </section>
      </main>

      {/* User Auth Modal Dialog */}
      {showLoginModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fade-in">
          <div className="relative w-full max-w-md p-6 sm:p-8 rounded-3xl bg-[#0f1117] border border-amber-500/30 shadow-2xl shadow-amber-500/10 text-white overflow-hidden">
            {/* Modal Header */}
            <div className="flex items-center justify-between pb-5 border-b border-white/10">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-xl bg-amber-500/20 border border-amber-500/30 text-amber-400">
                  <Beer className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-lg font-extrabold text-white leading-tight">
                    Đăng Nhập Hệ Thống
                  </h3>
                  <p className="text-xs text-gray-400">
                    Nhập tài khoản nhà hàng được cấp để tiếp tục
                  </p>
                </div>
              </div>

              <button
                onClick={() => {
                  setShowLoginModal(false);
                  setAuthError(null);
                }}
                className="p-2 text-gray-400 hover:text-white rounded-full hover:bg-white/10 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Error Banner */}
            {authError && (
              <div className="mt-4 p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-300 text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 text-red-400" />
                <span>{authError}</span>
              </div>
            )}

            {/* Modal Body Content */}
            <div className="pt-4 space-y-4">
              {/* Quick preset account chips */}
              <div className="p-3 rounded-2xl bg-amber-500/10 border border-amber-500/20 space-y-2">
                <p className="text-[11px] font-bold text-amber-400 uppercase tracking-wider">
                  Chọn Nhanh Tài Khoản Nhà Hàng
                </p>
                <div className="grid grid-cols-2 gap-1.5 text-xs">
                  {[
                    { u: "lehoibia", p: "123", l: "🍺 Lễ Hội Bia" },
                    { u: "1901", p: "123", l: "🍷 Nhà Hàng 1901" },
                    { u: "beerplaza", p: "123", l: "🏰 Beer Plaza" },
                    { u: "admin", p: "123", l: "🏢 Ban Quản Lý" },
                  ].map((acc) => (
                    <button
                      key={acc.u}
                      type="button"
                      onClick={() => {
                        setLoginUsername(acc.u);
                        setLoginPassword(acc.p);
                        handleLoginWithCreds(acc.u, acc.p);
                      }}
                      className="p-2 rounded-lg bg-black/40 border border-white/10 hover:border-amber-400 text-left transition-all group"
                    >
                      <div className="font-bold text-gray-200 group-hover:text-amber-300 truncate">
                        {acc.l}
                      </div>
                      <div className="text-[10px] text-gray-400 font-mono">
                        User: {acc.u}
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              <form onSubmit={handleLogin} className="space-y-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-gray-300">
                    Tên Đăng Nhập
                  </label>
                  <div className="relative">
                    <User className="absolute left-3.5 top-3 w-4 h-4 text-gray-400" />
                    <Input
                      type="text"
                      placeholder="Nhập tên đăng nhập (ví dụ: lehoibia)..."
                      value={loginUsername}
                      onChange={(e) => setLoginUsername(e.target.value)}
                      className="pl-10 bg-white/5 border-white/10 text-white placeholder:text-gray-500 focus:border-amber-400 focus:ring-amber-400"
                      required
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-gray-300">
                    Mật Khẩu
                  </label>
                  <div className="relative">
                    <Lock className="absolute left-3.5 top-3 w-4 h-4 text-gray-400" />
                    <Input
                      type="password"
                      placeholder="Nhập mật khẩu..."
                      value={loginPassword}
                      onChange={(e) => setLoginPassword(e.target.value)}
                      className="pl-10 bg-white/5 border-white/10 text-white placeholder:text-gray-500 focus:border-amber-400 focus:ring-amber-400"
                      required
                    />
                  </div>
                </div>

                <Button
                  type="submit"
                  disabled={isLoggingIn || !loginUsername.trim() || !loginPassword}
                  className="w-full mt-2 bg-amber-500 hover:bg-amber-400 text-black font-extrabold text-sm py-5 rounded-xl shadow-lg shadow-amber-500/20 transition-all flex items-center justify-center gap-2"
                >
                  {isLoggingIn ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Đang đăng nhập...
                    </>
                  ) : (
                    <>
                      Đăng Nhập Ngay
                      <ArrowRight className="w-4 h-4" />
                    </>
                  )}
                </Button>
              </form>
            </div>
          </div>
        </div>
      )}

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

