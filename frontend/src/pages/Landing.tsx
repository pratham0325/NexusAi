import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/hooks/use-auth";
import { useTheme } from "@/hooks/use-theme";
import {
  BarChart3,
  Bot,
  FileText,
  MessageSquare,
  Moon,
  Sparkles,
  Zap,
  ArrowRight,
  Cpu,
  ShieldCheck,
  UserX,
  Loader2,
} from "lucide-react";
import { motion } from "framer-motion";
import { Link, useNavigate } from "react-router";
import { useState } from "react";
import { toast } from "sonner";

const FEATURES = [
  {
    icon: MessageSquare,
    title: "Real-time streaming chat",
    description:
      "Token-by-token responses over SSE with edit, regenerate, copy and rating on every message.",
  },
  {
    icon: Cpu,
    title: "Multi-model switching",
    description:
      "GPT-4o, GPT-4.1 and Gemini in one dropdown — with a built-in demo model that needs zero keys.",
  },
  {
    icon: FileText,
    title: "Chat with your documents",
    description:
      "Upload PDF, DOCX, TXT or CSV. We chunk, embed and retrieve the right passages with RAG.",
  },
  {
    icon: Bot,
    title: "Custom assistants",
    description:
      "Give each assistant its own name, emoji, system prompt, temperature and knowledge base.",
  },
  {
    icon: BarChart3,
    title: "Usage analytics",
    description:
      "Track messages, generations and model breakdown over time — for you and platform-wide.",
  },
  {
    icon: ShieldCheck,
    title: "Admin dashboard",
    description:
      "Platform stats and user management for admins, roles and anonymous sessions handled cleanly.",
  },
];

const CHAT_PREVIEW = [
  {
    role: "user" as const,
    text: "Summarize the Q3 roadmap doc and list top risks.",
  },
  {
    role: "assistant" as const,
    text: "Here are the 3 key themes from the roadmap, plus the risks flagged in section 4 — with citations to the exact pages.",
  },
];

export default function Landing() {
  const { isAuthenticated, isLoading, signIn } = useAuth();
  const { theme, setTheme } = useTheme();
  const navigate = useNavigate();
  const [isGuestLoading, setIsGuestLoading] = useState(false);

  const handleGuestLogin = async () => {
    setIsGuestLoading(true);
    try {
      await signIn("anonymous");
      navigate("/dashboard");
    } catch (err) {
      console.error("Guest login failed:", err);
      toast.error(err instanceof Error ? err.message : "Guest sign-in failed. Please try again.");
      setIsGuestLoading(false);
    }
  };

  return (
    <div className="relative min-h-dvh overflow-x-clip bg-background text-foreground">
      {/* Aurora backdrop */}
      <div className="aurora-bg pointer-events-none absolute inset-0" />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(60rem_30rem_at_50%_-10%,oklch(0.51_0.21_274/0.12),transparent_70%)]" />

      {/* Nav — sticky glass effect */}
      <header className="relative z-10 mx-auto flex w-full max-w-6xl items-center justify-between px-6 py-4">
        {/* Logo */}
        <Link to="/" className="flex items-center gap-2.5 group">
          <div className="flex size-9 items-center justify-center rounded-xl bg-gradient-to-br from-violet-500 to-cyan-400 text-base font-black text-white shadow-lg shadow-primary/25 transition-transform group-hover:scale-105">
            N
          </div>
          <span className="font-display text-xl font-bold tracking-tight">
            Nexus<span className="text-gradient">AI</span>
          </span>
        </Link>

        {/* Center nav links */}
        <nav className="hidden items-center gap-0.5 md:flex">
          <a
            href="#features"
            className="rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            Features
          </a>
          <a
            href="#preview"
            className="rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            Product
          </a>
          <button
            onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
            className="rounded-lg p-2 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            aria-label="Toggle theme"
          >
            <Moon className="size-4" />
          </button>
        </nav>

        {/* Right: Auth action buttons — primary CTAs */}
        <div className="flex items-center gap-2">
          {isLoading ? (
            <div className="h-9 w-40 animate-pulse rounded-xl bg-muted" />
          ) : isAuthenticated ? (
            <Button asChild className="h-9 rounded-xl px-4 text-sm font-semibold shadow-sm">
              <Link to="/dashboard">
                Open Workspace
                <ArrowRight className="ml-1.5 size-3.5" />
              </Link>
            </Button>
          ) : (
            <>
              {/* Sign In — outlined ghost */}
              <Button
                variant="ghost"
                className="h-9 rounded-xl border border-border/60 px-4 text-sm font-semibold hover:border-border hover:bg-accent/70"
                asChild
              >
                <Link to="/auth?mode=login">Sign In</Link>
              </Button>

              {/* Get Started — solid primary with glow */}
              <Button
                className="h-9 rounded-xl px-4 text-sm font-semibold shadow-md shadow-primary/25 hover:shadow-primary/40 transition-shadow"
                asChild
              >
                <Link to="/auth?mode=register">
                  Get Started
                  <ArrowRight className="ml-1.5 size-3.5" />
                </Link>
              </Button>
            </>
          )}
        </div>
      </header>

      {/* Hero */}
      <section className="relative z-10 mx-auto w-full max-w-6xl px-6 pb-16 pt-14 text-center md:pt-24">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
        >
          <Badge
            variant="secondary"
            className="mb-5 gap-1.5 rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-xs font-medium text-primary"
          >
            <Sparkles className="size-3" />
            Your intelligent AI workspace
          </Badge>
          <h1 className="mx-auto max-w-3xl font-display text-4xl font-bold leading-[1.08] tracking-tight md:text-6xl">
            Think, create and build with{" "}
            <span className="text-gradient">one AI workspace</span>
          </h1>
          <p className="mx-auto mt-5 max-w-xl text-base leading-relaxed text-muted-foreground md:text-lg">
            Streaming multi-model chat, document intelligence with RAG, custom
            assistants and usage analytics — in one beautifully fast app.
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <Button size="lg" className="h-12 rounded-xl px-8 text-base font-semibold shadow-lg shadow-primary/25 hover:shadow-primary/40 transition-shadow" asChild>
              <Link to="/auth?mode=register">
                Start for Free
                <ArrowRight className="ml-2 size-4" />
              </Link>
            </Button>
            <Button
              size="lg"
              variant="outline"
              className="h-12 rounded-xl px-7 text-base border-border/80 hover:bg-accent/60"
              asChild
            >
              <a href="#preview">See it in action</a>
            </Button>
          </div>
          <p className="mt-4 text-sm text-muted-foreground">
            No credit card required
            <span className="mx-2 opacity-30">·</span>
            <button
              onClick={handleGuestLogin}
              disabled={isGuestLoading}
              className="inline-flex items-center gap-1 font-medium text-primary hover:underline transition-colors disabled:opacity-60"
            >
              {isGuestLoading ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <UserX className="size-3.5" />
              )}
              Try as Guest
            </button>
          </p>
        </motion.div>

        {/* Product preview */}
        <motion.div
          id="preview"
          initial={{ opacity: 0, y: 32, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.6, delay: 0.15 }}
          className="relative mx-auto mt-14 max-w-3xl"
        >
          <div className="absolute -inset-x-8 -top-8 h-40 bg-gradient-to-b from-primary/15 to-transparent blur-2xl" />
          <div className="relative overflow-hidden rounded-2xl border border-border/70 bg-card shadow-2xl shadow-primary/10">
            {/* window chrome */}
            <div className="flex items-center gap-1.5 border-b border-border/60 bg-muted/40 px-4 py-2.5">
              <span className="size-2.5 rounded-full bg-red-400/80" />
              <span className="size-2.5 rounded-full bg-amber-400/80" />
              <span className="size-2.5 rounded-full bg-emerald-400/80" />
              <span className="ml-3 text-xs font-medium text-muted-foreground">
                nexus.ai / workspace
              </span>
            </div>
            <div className="space-y-4 p-5 md:p-7">
              {CHAT_PREVIEW.map((m, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.5 + i * 0.35 }}
                  className={m.role === "user" ? "flex justify-end" : "flex gap-3"}
                >
                  {m.role === "assistant" && (
                    <div className="flex size-7 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-violet-500/40 to-cyan-400/40 text-[10px] font-bold">
                      N
                    </div>
                  )}
                  <div
                    className={
                      m.role === "user"
                        ? "max-w-[80%] rounded-2xl rounded-tr-md bg-primary px-4 py-2.5 text-sm text-primary-foreground"
                        : "max-w-[80%] rounded-2xl rounded-tl-md border border-border/70 bg-background px-4 py-2.5 text-sm"
                    }
                  >
                    {m.text}
                  </div>
                </motion.div>
              ))}
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 1.3 }}
                className="flex items-center gap-2 rounded-xl border border-border/70 bg-background/60 px-3 py-2.5"
              >
                <Zap className="size-4 text-primary" />
                <span className="flex-1 text-sm text-muted-foreground">
                  Ask Nexus anything…
                </span>
                <span className="flex items-center gap-1">
                  {[0, 1, 2].map((i) => (
                    <span
                      key={i}
                      className="typing-dot size-1.5 rounded-full bg-primary"
                    />
                  ))}
                </span>
              </motion.div>
            </div>
          </div>
        </motion.div>
      </section>

      {/* Features */}
      <section id="features" className="relative z-10 mx-auto w-full max-w-6xl px-6 py-16">
        <div className="text-center">
          <h2 className="font-display text-3xl font-bold tracking-tight md:text-4xl">
            Everything a modern AI product needs
          </h2>
          <p className="mx-auto mt-3 max-w-lg text-muted-foreground">
            Built end-to-end: real backend, real streaming, real retrieval — not
            a mockup.
          </p>
        </div>
        <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((f, i) => (
            <motion.div
              key={f.title}
              initial={{ opacity: 0, y: 16 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-60px" }}
              transition={{ duration: 0.4, delay: i * 0.06 }}
              className="group rounded-2xl border border-border/70 bg-card p-5 transition-all hover:-translate-y-1 hover:border-primary/35 hover:shadow-xl hover:shadow-primary/5"
            >
              <div className="flex size-10 items-center justify-center rounded-xl bg-primary/10 text-primary transition-colors group-hover:bg-primary group-hover:text-primary-foreground">
                <f.icon className="size-5" />
              </div>
              <h3 className="mt-3.5 font-display text-base font-semibold">
                {f.title}
              </h3>
              <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
                {f.description}
              </p>
            </motion.div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="relative z-10 mx-auto w-full max-w-6xl px-6 pb-20">
        <div className="relative overflow-hidden rounded-3xl border border-primary/20 bg-gradient-to-br from-primary/12 via-card to-cyan-400/10 p-10 text-center md:p-14">
          <div className="aurora-bg absolute inset-0 opacity-60" />
          <div className="relative">
            <h2 className="font-display text-3xl font-bold tracking-tight md:text-4xl">
              Ready to meet your new AI workspace?
            </h2>
            <p className="mx-auto mt-3 max-w-md text-muted-foreground">
              Sign in with email or continue as guest — your workspace is ready
              in seconds.
            </p>
            <Button size="lg" className="mt-7 h-12 rounded-xl px-8 text-base" asChild>
              <Link to="/auth">
                Get started free
                <ArrowRight className="ml-2 size-4" />
              </Link>
            </Button>
          </div>
        </div>
      </section>

      <footer className="relative z-10 border-t border-border/60 py-8">
        <div className="mx-auto flex w-full max-w-6xl flex-col items-center justify-between gap-3 px-6 text-sm text-muted-foreground sm:flex-row">
          <span className="font-display font-semibold text-foreground">
            Nexus<span className="text-gradient">AI</span>
          </span>
          <span>Intelligent AI workspace · Built with React, Express & MongoDB</span>
        </div>
      </footer>
    </div>
  );
}
