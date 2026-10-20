import { Toaster } from "@/components/ui/sonner";
import { RequireAuth } from "@/components/RequireAuth";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React, { StrictMode, useEffect, lazy, Suspense } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Route, Routes, useLocation } from "react-router";
import "./index.css";

// Vly editor tooling (element picker, screenshots, route sync with the
// editor iframe) answers postMessage requests from any parent window, so it
// is loaded only by the dev server and never shipped in production builds.
const VlyToolbar = import.meta.env.DEV
  ? lazy(() =>
      import("../vly-toolbar-readonly.tsx").then((m) => ({ default: m.VlyToolbar })),
    )
  : null;

// Lazy load route components for better code splitting
const Landing = lazy(() => import("./pages/Landing.tsx"));
const AuthPage = lazy(() => import("./pages/Auth.tsx"));
const Chat = lazy(() => import("./pages/Chat.tsx"));
const Assistants = lazy(() => import("./pages/Assistants.tsx"));
const Documents = lazy(() => import("./pages/Documents.tsx"));
const Analytics = lazy(() => import("./pages/Analytics.tsx"));
const Settings = lazy(() => import("./pages/Settings.tsx"));
const Admin = lazy(() => import("./pages/Admin.tsx"));
const NotFound = lazy(() => import("./pages/NotFound.tsx"));

// Simple loading fallback for route transitions
function RouteLoading() {
  return (
    <div className="flex h-dvh items-center justify-center bg-background">
      <div className="flex flex-col items-center gap-3">
        <div className="flex size-10 items-center justify-center rounded-xl bg-gradient-to-br from-violet-500 to-cyan-400 font-display text-sm font-black text-white">
          N
        </div>
        <div className="animate-pulse text-sm text-muted-foreground">Loading…</div>
      </div>
    </div>
  );
}

/** Silent error boundary — if VlyToolbar crashes it renders nothing instead of
 *  crashing the whole app (e.g. hook errors in WebContainer environment). */
class ToolbarErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean }
> {
  state = { hasError: false };
  static getDerivedStateFromError() {
    return { hasError: true };
  }
  componentDidCatch(err: Error) {
    console.warn("[VlyToolbar] Caught error, toolbar disabled:", err.message);
  }
  render() {
    return this.state.hasError ? null : this.props.children;
  }
}

/** Hard guard so runtime errors never leave the preview as a blank page. */
class RootErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean; message: string; stack: string }
> {
  state = { hasError: false, message: "", stack: "" };
  static getDerivedStateFromError(error: Error) {
    return {
      hasError: true,
      message: error.message || "Unknown runtime error",
      stack: error.stack || "",
    };
  }
  componentDidCatch(err: Error) {
    console.error("[WebContainer preview] Root crash:", err);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="flex min-h-screen items-center justify-center bg-background p-6 text-foreground">
          <div className="max-w-lg text-center">
            <p className="text-sm font-semibold">Preview runtime error</p>
            <p className="mt-2 break-words text-xs text-muted-foreground">
              {import.meta.env.DEV
                ? this.state.message
                : "An unexpected error occurred. Please reload the page."}
            </p>
            {import.meta.env.DEV && this.state.stack && (
              <pre className="mt-3 max-h-40 overflow-auto rounded border border-border/60 p-2 text-left text-[10px] leading-4 text-muted-foreground/80">
                {this.state.stack}
              </pre>
            )}
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 15_000,
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

function RouteSyncer() {
  const location = useLocation();
  useEffect(() => {
    window.parent.postMessage(
      { type: "iframe-route-change", path: location.pathname },
      "*",
    );
  }, [location.pathname]);

  useEffect(() => {
    function handleMessage(event: MessageEvent) {
      if (event.data?.type === "navigate") {
        if (event.data.direction === "back") window.history.back();
        if (event.data.direction === "forward") window.history.forward();
      }
    }
    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, []);

  return null;
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <RootErrorBoundary>
      {VlyToolbar && (
        <ToolbarErrorBoundary>
          <Suspense fallback={null}>
            <VlyToolbar />
          </Suspense>
        </ToolbarErrorBoundary>
      )}
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          {import.meta.env.DEV && <RouteSyncer />}
          <Suspense fallback={<RouteLoading />}>
            <Routes>
              <Route path="/" element={<Landing />} />
              <Route
                path="/auth"
                element={<AuthPage redirectAfterAuth="/dashboard" />}
              />
              <Route
                path="/dashboard"
                element={
                  <RequireAuth>
                    <Chat />
                  </RequireAuth>
                }
              />
              <Route
                path="/dashboard/c/:conversationId"
                element={
                  <RequireAuth>
                    <Chat />
                  </RequireAuth>
                }
              />
              <Route
                path="/app/assistants"
                element={
                  <RequireAuth>
                    <Assistants />
                  </RequireAuth>
                }
              />
              <Route
                path="/app/documents"
                element={
                  <RequireAuth>
                    <Documents />
                  </RequireAuth>
                }
              />
              <Route
                path="/app/analytics"
                element={
                  <RequireAuth>
                    <Analytics />
                  </RequireAuth>
                }
              />
              <Route
                path="/app/settings"
                element={
                  <RequireAuth>
                    <Settings />
                  </RequireAuth>
                }
              />
              <Route
                path="/app/admin"
                element={
                  <RequireAuth>
                    <Admin />
                  </RequireAuth>
                }
              />
              <Route path="*" element={<NotFound />} />
            </Routes>
          </Suspense>
        </BrowserRouter>
        <Toaster />
      </QueryClientProvider>
    </RootErrorBoundary>
  </StrictMode>,
);
