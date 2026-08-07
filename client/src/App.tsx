import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import { AuthProvider } from "./contexts/AuthContext";
import Home from "./pages/Home";
import AdminSettings from "./pages/AdminSettings";
import UserGuide from "./pages/UserGuide";

function Router() {
  return (
    <Switch>
      <Route path={"/"} component={Home} />
      <Route path={"/admin"} component={AdminSettings} />
      <Route path={"/guide"} component={UserGuide} />
      <Route path={"/404"} component={NotFound} />
      {/* Final fallback route */}
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  // KHÔNG poll Telegram từ client nữa.
  //
  // - Production (Vercel): bot chạy chế độ WEBHOOK real-time. /api/telegram/poll
  //   chỉ trả về trạng thái webhook (processedCount luôn = 0), không xử lý tin
  //   nhắn nào. Gọi định kỳ = đốt invocation Vercel + 2 call api.telegram.org
  //   mỗi lần, đổi lại 0 giá trị.
  // - Dev (vite.config.ts): đã có sẵn vòng lặp getUpdates 3 giây phía server,
  //   nên client gọi thêm cũng thừa.
  //
  // Nếu cần kiểm tra thủ công: nút "Kiểm tra tin nhắn" trong AdminSettings.

  return (
    <ErrorBoundary>
      <AuthProvider>
        <ThemeProvider defaultTheme="dark" switchable={true}>
          <TooltipProvider>
            <Toaster />
            <Router />
          </TooltipProvider>
        </ThemeProvider>
      </AuthProvider>
    </ErrorBoundary>
  );
}

export default App;
