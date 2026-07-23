import { trpc } from "@/lib/trpc";
import { COOKIE_NAME, UNAUTHED_ERR_MSG } from '@shared/const';
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { httpBatchLink, TRPCClientError } from "@trpc/client";
import { createRoot } from "react-dom/client";
import superjson from "superjson";
import App from "./App";
import { startLogin } from "./const";
import "./index.css";

const queryClient = new QueryClient();

const redirectToLoginIfUnauthorized = (error: unknown) => {
  if (!(error instanceof TRPCClientError)) return;
  if (typeof window === "undefined") return;

  const isUnauthorized = error.message === UNAUTHED_ERR_MSG;

  if (!isUnauthorized) return;

  startLogin();
};

queryClient.getQueryCache().subscribe(event => {
  if (event.type === "updated" && event.action.type === "error") {
    const error = event.query.state.error;
    redirectToLoginIfUnauthorized(error);
    console.error("[API Query Error]", error);
  }
});

queryClient.getMutationCache().subscribe(event => {
  if (event.type === "updated" && event.action.type === "error") {
    const error = event.mutation.state.error;
    redirectToLoginIfUnauthorized(error);
    console.error("[API Mutation Error]", error);
  }
});

const trpcClient = trpc.createClient({
  links: [
    httpBatchLink({
      url: "/api/trpc",
      transformer: superjson,
      headers() {
        // Preview auto-login fallback: when the browser blocks iframe cookies
        // (Safari ITP / private browsing / WebView), the runtime mirrors the
        // session into sessionStorage so we can forward it as a Bearer token.
        // The regular OAuth cookie flow keeps working and takes priority server-side.
        try {
          const raw = sessionStorage.getItem("manus-cookie");
          if (raw) {
            const prefix = `${COOKIE_NAME}=`;
            const pair = raw.split(";").find(s => s.trim().startsWith(prefix));
            const token = pair?.trim().slice(prefix.length);
            if (token) {
              return { Authorization: `Bearer ${token}` };
            }
          }
        } catch {
          // sessionStorage unavailable
        }
        return {};
      },
      async fetch(input, init) {
        const res = await globalThis.fetch(input, {
          ...(init ?? {}),
          credentials: "include",
        });

        if (res.ok) {
          return res;
        }

        const contentType = res.headers.get("content-type") || "";
        if (contentType.includes("application/json")) {
          return res;
        }

        const clone = res.clone();
        const text = await clone.text().catch(() => "");
        console.error("[tRPC non-JSON error response]", res.status, contentType, text.slice(0, 200));

        const mockTrpcErrorResponse = JSON.stringify([
          {
            error: {
              message: `Không thể kết nối đến máy chủ (Mã ${res.status}). Vui lòng thử lại sau.`,
              code: -32603,
              data: {
                json: {
                  code: "INTERNAL_SERVER_ERROR",
                  httpStatus: res.status || 500,
                },
              },
            },
          },
        ]);

        return new Response(mockTrpcErrorResponse, {
          status: res.status || 500,
          headers: { "content-type": "application/json; charset=utf-8" },
        });
      },
    }),
  ],
});

createRoot(document.getElementById("root")!).render(
  <trpc.Provider client={trpcClient} queryClient={queryClient}>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </trpc.Provider>
);
