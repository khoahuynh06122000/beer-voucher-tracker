import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuthContext } from "@/contexts/AuthContext";
import beerFoamBg from "@/assets/beer_foam_bg.jpg";
import banaHillsBeer from "@/assets/bana_hills_beer.jpg";
import { DraftBeerGlass } from "@/components/DraftBeerGlass";
import {
  Beer,
  Sparkles,
  ArrowRight,
  User,
  X,
  Lock,
  Loader2,
  AlertCircle,
  Flame,
} from "lucide-react";

export function LandingCover() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [showLoginModal, setShowLoginModal] = useState(false);

  const [authError, setAuthError] = useState<string | null>(null);
  const [isLoggingIn, setIsLoggingIn] = useState(false);

  const { loginWithGoogle, error: ctxError } = useAuthContext();

  const handleGoogleLogin = async () => {
    setAuthError(null);
    setIsLoggingIn(true);
    try {
      await loginWithGoogle();
      setShowLoginModal(false);
    } catch (err: any) {
      setAuthError(err?.message || "Đăng nhập Google thất bại.");
    } finally {
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

    let nucleationSites: number[] = [];

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
      const numColumns = Math.floor(canvas.width / 75) + 6;
      nucleationSites = [];
      for (let i = 0; i < numColumns; i++) {
        nucleationSites.push(Math.random() * canvas.width);
      }

      streamBubbles = [];
      const streamCount = Math.floor((canvas.width * canvas.height) / 5000);
      for (let i = 0; i < streamCount; i++) {
        const colX = nucleationSites[Math.floor(Math.random() * nucleationSites.length)];
        streamBubbles.push(createStreamBubble(colX, Math.random() * canvas.height));
      }

      ambientBubbles = [];
      const ambientCount = Math.floor((canvas.width * canvas.height) / 9000);
      for (let i = 0; i < ambientCount; i++) {
        ambientBubbles.push(createAmbientBubble(Math.random() * canvas.height));
      }

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
          ctx.fillStyle = b.isAmber
            ? `rgba(251, 191, 36, ${b.opacity})`
            : `rgba(255, 255, 255, ${b.opacity * 0.9})`;
          ctx.fill();
        } else {
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

          ctx.beginPath();
          ctx.arc(b.x - b.radius * 0.35, b.y - b.radius * 0.35, b.radius * 0.3, 0, Math.PI * 2);
          ctx.fillStyle = `rgba(255, 255, 255, ${b.opacity * 0.8})`;
          ctx.fill();
        }
      };

      for (let i = 0; i < streamBubbles.length; i++) {
        const b = streamBubbles[i];
        b.y -= b.speedY;
        b.phase += b.wobbleSpeed;
        b.x = b.columnX + Math.sin(b.phase) * b.wobbleAmp;

        if (b.y < 35) {
          const colX = nucleationSites[Math.floor(Math.random() * nucleationSites.length)];
          streamBubbles[i] = createStreamBubble(colX);
        }

        drawBeerBubble(b);
      }

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
    <div className="relative min-h-screen flex flex-col justify-between bg-[#06070a] text-white selection:bg-amber-500 selection:text-black overflow-x-hidden font-sans">
      {/* Cinematic Photorealistic Submerged Background Layer */}
      <div className="fixed inset-0 z-0 pointer-events-none overflow-hidden">
        {/* Layer 1: High-resolution Ba Na Hills Beer Festival Photo Backdrop */}
        <img
          src={banaHillsBeer}
          alt="Sun World Ba Na Hills Beer Atmosphere"
          referrerPolicy="no-referrer"
          className="w-full h-full object-cover object-center opacity-65 scale-105 filter contrast-125 saturate-135 brightness-95 transition-transform duration-1000"
        />

        {/* Layer 2: Texture Foam Overlay */}
        <img
          src={beerFoamBg}
          alt="Draft Beer Foam Texture"
          referrerPolicy="no-referrer"
          className="absolute inset-0 w-full h-full object-cover opacity-25 mix-blend-overlay"
        />

        {/* Layer 3: Dark Vignette Gradient Overlays for High Legibility */}
        <div className="absolute inset-0 bg-gradient-to-r from-black/90 via-black/70 to-black/85" />
        <div className="absolute inset-0 bg-radial from-amber-950/30 via-black/80 to-[#040508]" />
        <div className="absolute inset-0 bg-gradient-to-b from-black/80 via-transparent to-[#050609]" />
      </div>

      <canvas
        ref={canvasRef}
        className="fixed inset-0 w-full h-full pointer-events-none z-10 opacity-90"
      />

      <div className="fixed top-[-10%] left-1/2 -translate-x-1/2 w-[900px] h-[550px] bg-gradient-to-b from-amber-500/20 via-amber-600/10 to-transparent blur-[140px] pointer-events-none z-0" />
      <div className="fixed bottom-[-10%] left-[-10%] w-[700px] h-[700px] bg-amber-600/15 blur-[160px] pointer-events-none z-0" />

      <div className="fixed top-0 left-0 right-0 h-1.5 bg-gradient-to-r from-amber-300 via-yellow-100 to-amber-400 z-50 shadow-[0_0_15px_rgba(251,191,36,0.8)]" />

      <header className="fixed top-1.5 left-0 right-0 z-50 backdrop-blur-md bg-black/50 border-b border-white/10 transition-all">
        <div className="container max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-gradient-to-br from-amber-400 to-amber-600 text-black font-bold shadow-lg shadow-amber-500/20">
              <Beer className="w-5 h-5" />
            </div>
            <div>
              <span className="font-extrabold text-lg tracking-tight text-white block leading-none">
                SUN WORLD BA NA HILLS
              </span>
              <span className="text-[10px] uppercase font-bold tracking-widest text-amber-400/90">
                Beer Voucher Cloud System
              </span>
            </div>
          </div>

          {/* Header clean without duplicate top login button */}
        </div>
      </header>

      <main className="relative z-20 pt-28 pb-16 flex-grow flex items-center">
        <section className="container max-w-6xl mx-auto px-6 py-6">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-center">
            {/* Left Content */}
            <div className="lg:col-span-7 text-center lg:text-left flex flex-col items-center lg:items-start">
              <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs font-semibold mb-6 backdrop-blur-md">
                <Sparkles className="w-3.5 h-3.5 text-amber-400 animate-pulse" />
                Lễ Hội Bia Sun World Ba Na Hills • B'Acoustic & Beer Plaza
              </div>

              <h1 className="text-4xl sm:text-6xl font-black tracking-tight leading-[1.15] mb-6">
                <span className="text-white drop-shadow-sm">Quản lý voucher </span>
                <span className="relative inline-block bg-gradient-to-r from-amber-300 via-amber-400 to-yellow-500 bg-clip-text text-transparent drop-shadow-[0_4px_16px_rgba(245,158,11,0.35)]">
                  bia Ba Na Hills
                  <span className="absolute -bottom-1 left-0 w-full h-[4px] bg-gradient-to-r from-amber-500/90 via-amber-400 to-amber-500/20 rounded-full" />
                </span>
                <span className="text-amber-400">.</span>
              </h1>

              <p className="text-base sm:text-lg text-gray-300 max-w-xl leading-relaxed mb-8 font-normal">
                Giải pháp quản lý, ghi nhận và báo cáo hiệu suất quy đổi voucher bia hàng ngày dành cho hệ thống nhà hàng tại Sun World Ba Na Hills.
              </p>

              <div className="flex flex-col sm:flex-row items-center gap-4 justify-center lg:justify-start w-full max-w-md">
                <Button
                  onClick={() => setShowLoginModal(true)}
                  size="lg"
                  className="w-full sm:w-auto bg-amber-500 hover:bg-amber-400 text-black font-extrabold text-sm px-8 py-6 rounded-xl shadow-xl shadow-amber-500/25 transition-all hover:scale-105 flex items-center justify-center gap-2"
                >
                  <Beer className="w-5 h-5 fill-black" />
                  Đăng Nhập Hệ Thống
                  <ArrowRight className="w-5 h-5" />
                </Button>
              </div>
            </div>

            {/* Right Graphic: Floating Transparent Draft Beer Glass */}
            <div className="lg:col-span-5 flex flex-col items-center justify-center relative py-6">
              <div
                className="relative group cursor-pointer flex flex-col items-center justify-center transition-all duration-500 hover:scale-105"
                onClick={() => setShowLoginModal(true)}
              >
                {/* Floating Glass Graphic without background card box */}
                <div className="relative flex items-center justify-center">
                  {/* Subtle golden ambient aura glow behind the glass */}
                  <div className="absolute w-80 h-80 rounded-full bg-amber-500/20 blur-3xl pointer-events-none group-hover:bg-amber-400/30 transition-all duration-500" />
                  
                  <DraftBeerGlass size="xl" showGlow={true} className="relative z-10 transform transition-transform duration-500 group-hover:scale-105" />
                </div>

                {/* Minimal floating caption */}
                <div className="mt-6 inline-flex items-center gap-2 px-4 py-2 rounded-full bg-amber-500/10 border border-amber-500/30 backdrop-blur-md text-amber-300 text-xs font-bold shadow-lg group-hover:bg-amber-500/20 group-hover:border-amber-400 transition-all">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                  <span>Lễ Hội Bia Ba Na Hills • Beer Plaza</span>
                </div>
              </div>
            </div>
          </div>
        </section>
      </main>

      {/* User Auth Modal Dialog with Beer Glass Visual */}
      {showLoginModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md animate-fade-in">
          <div className="relative w-full max-w-2xl rounded-3xl bg-[#0d0f15] border border-amber-500/40 shadow-2xl shadow-amber-500/20 text-white overflow-hidden grid grid-cols-1 md:grid-cols-12">
            
            {/* Left Decorative Column with Transparent Draft Beer Glass */}
            <div className="md:col-span-5 relative p-6 flex flex-col items-center justify-between border-b md:border-b-0 md:border-r border-amber-500/30 overflow-hidden min-h-[320px] bg-gradient-to-b from-amber-500/10 via-amber-950/30 to-black/60">
              <div className="relative z-10 w-full flex items-center justify-between">
                <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-500/20 border border-amber-500/40 text-amber-300 text-[10px] font-extrabold backdrop-blur-md">
                  <Beer className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />
                  <span>Sun KraftBeer</span>
                </div>
              </div>

              <div className="relative z-10 my-auto py-4 flex flex-col items-center justify-center">
                <DraftBeerGlass size="lg" showGlow={true} />
              </div>

              <div className="relative z-10 text-center px-2 py-2">
                <h4 className="text-sm font-black text-amber-300 tracking-wider uppercase">
                  Beer Voucher System
                </h4>
                <p className="text-[11px] text-gray-300 mt-0.5 font-medium">
                  Đăng nhập để xem báo cáo &amp; nhập liệu chỉ số voucher
                </p>
              </div>
            </div>

            {/* Right Form Column */}
            <div className="md:col-span-7 p-6 sm:p-8 flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between pb-4 border-b border-white/10">
                  <div>
                    <h3 className="text-lg font-extrabold text-white leading-tight">
                      Đăng Nhập Tài Khoản
                    </h3>
                    <p className="text-xs text-gray-400 mt-0.5">
                      Chọn nhanh nhà hàng hoặc bộ phận để truy cập
                    </p>
                  </div>

                  <button
                    onClick={() => {
                      setShowLoginModal(false);
                      setAuthError(null);
                    }}
                    className="p-1.5 text-gray-400 hover:text-white rounded-full hover:bg-white/10 transition-colors"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>

                {(authError || ctxError) && (
                  <div className="mt-4 p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-300 text-xs flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 shrink-0 text-red-400" />
                    <span>{authError || ctxError}</span>
                  </div>
                )}

                <div className="pt-6 space-y-4">
                  <button
                    type="button"
                    onClick={handleGoogleLogin}
                    disabled={isLoggingIn}
                    className="w-full flex items-center justify-center gap-3 px-4 py-3.5 rounded-xl bg-white text-gray-800 font-bold text-sm hover:bg-gray-100 transition-colors disabled:opacity-60 disabled:cursor-not-allowed active:scale-[0.99]"
                  >
                    {isLoggingIn ? (
                      <Loader2 className="w-5 h-5 animate-spin text-gray-600" />
                    ) : (
                      <svg className="w-5 h-5 shrink-0" viewBox="0 0 24 24" aria-hidden="true">
                        <path fill="#4285F4" d="M23.5 12.3c0-.8-.1-1.6-.2-2.3H12v4.5h6.5a5.6 5.6 0 0 1-2.4 3.6v3h3.9c2.3-2.1 3.5-5.2 3.5-8.8z" />
                        <path fill="#34A853" d="M12 24c3.2 0 5.9-1.1 7.9-2.9l-3.9-3a7.2 7.2 0 0 1-10.7-3.8h-4v3.1A12 12 0 0 0 12 24z" />
                        <path fill="#FBBC05" d="M5.3 14.3a7.1 7.1 0 0 1 0-4.6v-3.1h-4a12 12 0 0 0 0 10.8l4-3.1z" />
                        <path fill="#EA4335" d="M12 4.8c1.8 0 3.4.6 4.6 1.8l3.4-3.4A12 12 0 0 0 1.3 6.6l4 3.1A7.2 7.2 0 0 1 12 4.8z" />
                      </svg>
                    )}
                    <span>{isLoggingIn ? "Đang đăng nhập…" : "Đăng nhập bằng Google"}</span>
                  </button>

                  <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-[11px] text-amber-200/90 leading-relaxed">
                    Dùng email công ty của bạn. Lần đầu đăng nhập, bạn sẽ chọn nhà hàng
                    muốn xin quyền xem số liệu, sau đó chờ Ban Quản Lý duyệt.
                  </div>
                </div>

              </div>
            </div>

          </div>
        </div>
      )}

      <footer className="relative z-20 border-t border-amber-500/20 bg-black/80 backdrop-blur-md py-5 text-xs text-gray-400 mt-auto">
        <div className="container max-w-7xl mx-auto px-6 flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Beer className="w-4 h-4 text-amber-400 fill-amber-400/20" />
            <span className="font-bold text-amber-300">Sun World Ba Na Hills • Beer Voucher Tracker</span>
          </div>
          <p>© 2026 Sun World Ba Na Hills • Lễ Hội Bia Sun KraftBeer Real-Time Cloud Engine</p>
        </div>
      </footer>
    </div>
  );
}
