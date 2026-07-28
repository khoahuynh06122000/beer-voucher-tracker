import { useEffect } from "react";
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
import { pollTelegramMessages } from "./lib/telegramService";

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
  // Global background listener to trigger Telegram polling heartbeat
  useEffect(() => {
    // Initial trigger
    pollTelegramMessages().catch(() => {});

    // Repeat poll every 4 seconds to guarantee Telegram commands are processed immediately
    const interval = setInterval(() => {
      pollTelegramMessages().catch(() => {});
    }, 4000);

    return () => clearInterval(interval);
  }, []);

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
