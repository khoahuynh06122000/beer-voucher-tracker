import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
import { isBlockedHost, renderBlockedScreen } from "./lib/hostGuard";

// Vào từ link cũ (AI Studio / Cloud Run / Firebase Hosting) -> chặn, KHÔNG mount app.
if (isBlockedHost()) {
  renderBlockedScreen();
} else {
  createRoot(document.getElementById("root")!).render(<App />);
}
