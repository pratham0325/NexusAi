import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuth } from "@/hooks/use-auth";
import { useQueryClient } from "@tanstack/react-query";
import logo from "@/assets/logo.svg";
import {
  ArrowRight,
  CheckCircle2,
  Eye,
  EyeOff,
  Loader2,
  Lock,
  Mail,
  Sparkles,
  User,
  UserX,
} from "lucide-react";
import { Suspense, useEffect, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";

interface AuthProps {
  redirectAfterAuth?: string;
}

function resolveRedirectAfterAuth(
  returnTo: string | null,
  fallback = "/dashboard",
) {
  if (returnTo?.startsWith("/") && !returnTo.startsWith("//")) {
    return returnTo;
  }
  return fallback;
}

function Auth({ redirectAfterAuth }: AuthProps = {}) {
  const { isLoading: authLoading, isAuthenticated, login, register, signIn, signOut } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const redirect = resolveRedirectAfterAuth(
    searchParams.get("returnTo"),
    redirectAfterAuth,
  );

  // Whether this visit to /auth has a returnTo (user was redirected by RequireAuth)
  const hasReturnTo = Boolean(searchParams.get("returnTo"));
  // Track whether we've already handled the initial session
  const sessionHandledRef = useRef(false);

  // Mode can be: "login" | "register"
  const activeTab = searchParams.get("mode") === "register" ? "register" : "login";
  // Form states - Login
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [showLoginPassword, setShowLoginPassword] = useState(false);

  // Form states - Register
  const [regName, setRegName] = useState("");
  const [regEmail, setRegEmail] = useState("");
  const [regPassword, setRegPassword] = useState("");
  const [regConfirmPassword, setRegConfirmPassword] = useState("");
  const [showRegPassword, setShowRegPassword] = useState(false);
  const [showRegConfirmPassword, setShowRegConfirmPassword] = useState(false);

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /**
   * Core session gate:
   * - If user was redirected here by RequireAuth (has ?returnTo), they should
   *   see the form to sign in — but if already authenticated, redirect them back.
   * - If user explicitly navigated to /auth (e.g. clicked "Sign in" on landing),
   *   sign out any existing session so they see a clean form and can pick
   *   different credentials. This prevents the ghost-login bug.
   */
  useEffect(() => {
    if (authLoading || sessionHandledRef.current) return;
    sessionHandledRef.current = true;

    if (isAuthenticated) {
      if (hasReturnTo) {
        // User was bounced here by RequireAuth — send them to where they wanted to go
        navigate(redirect, { replace: true });
      } else {
        // User explicitly opened /auth while already logged in → sign out first
        void signOut().then(() => queryClient.clear());
      }
    }
  }, [
    authLoading,
    isAuthenticated,
    hasReturnTo,
    navigate,
    redirect,
    signOut,
    queryClient,
  ]);

  const handleTabChange = (value: string) => {
    setError(null);
    const newTab = value as "login" | "register";
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.set("mode", newTab);
        return next;
      },
      { replace: true },
    );
  };

  // 1. Password Login Handler
  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);

    try {
      await login(loginEmail.trim(), loginPassword);
      queryClient.clear();
      navigate(redirect);
    } catch (err: unknown) {
      console.error("Login error:", err);
      const msg =
        (err as { response?: { data?: { error?: { message?: string } } } })
          ?.response?.data?.error?.message ||
        (err as Error).message ||
        "Invalid email or password. Please try again.";
      setError(msg);
    } finally {
      setIsLoading(false);
    }
  };

  // 2. Registration Handler
  const handleRegisterSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (regPassword !== regConfirmPassword) {
      setError("Passwords do not match. Please verify both password fields.");
      return;
    }

    if (regPassword.length < 8) {
      setError("Password must be at least 8 characters long.");
      return;
    }

    setIsLoading(true);

    try {
      await register(regName.trim(), regEmail.trim(), regPassword);
      queryClient.clear();
      navigate(redirect);
    } catch (err: unknown) {
      console.error("Register error:", err);
      const msg =
        (err as { response?: { data?: { error?: { message?: string } } } })
          ?.response?.data?.error?.message ||
        (err as Error).message ||
        "Failed to create account. Please check your details and try again.";
      setError(msg);
    } finally {
      setIsLoading(false);
    }
  };

  // 3. Guest Login Handler
  const handleGuestLogin = async () => {
    setIsLoading(true);
    setError(null);
    try {
      await signIn("anonymous");
      queryClient.clear();
      navigate(redirect);
    } catch (err: unknown) {
      console.error("Guest login error:", err);
      setError("Failed to sign in as guest. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="relative flex h-dvh flex-col items-center justify-center overflow-hidden bg-background px-4 py-3 selection:bg-primary/20">
      {/* Background aurora ambiance */}
      <div className="aurora-bg pointer-events-none absolute inset-0 opacity-70" />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(45rem_25rem_at_50%_15%,oklch(0.51_0.21_274/0.12),transparent_70%)]" />

      {/* Main card container */}
      <div className="relative z-10 max-h-full w-full max-w-[440px]">
        {/* Logo and Brand */}
        <div className="mb-3 flex flex-col items-center text-center [@media(max-height:700px)]:mb-2">
          <Link
            to="/"
            className="group flex items-center gap-3 transition-transform hover:scale-[1.02] active:scale-[0.98]"
          >
            <div className="flex size-10 items-center justify-center rounded-2xl bg-gradient-to-br from-violet-500 via-primary to-cyan-400 p-0.5 shadow-lg shadow-primary/25">
              <div className="flex size-full items-center justify-center rounded-[14px] bg-background/90 backdrop-blur-sm">
                <img
                  src={logo}
                  alt="NexusAI"
                  className="size-6 object-contain transition-transform group-hover:rotate-6"
                />
              </div>
            </div>
            <span className="font-display text-xl font-bold tracking-tight text-foreground">
              Nexus<span className="text-gradient">AI</span>
            </span>
          </Link>
          <p className="mt-1.5 flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground [@media(max-height:700px)]:hidden">
            <Sparkles className="size-3.5 text-primary" />
            Your unified intelligent AI workspace
          </p>
        </div>

        <Card className="border border-border/80 bg-card/90 backdrop-blur-xl shadow-2xl shadow-primary/5 rounded-2xl overflow-hidden">
          <div className="p-4 sm:p-6">
              <Tabs value={activeTab} onValueChange={handleTabChange} className="w-full">
                <TabsList className="mb-4 grid h-10 w-full grid-cols-2 rounded-xl bg-muted/60 p-1">
                  <TabsTrigger
                    value="login"
                    className="rounded-lg text-sm font-semibold data-[state=active]:bg-card data-[state=active]:text-foreground data-[state=active]:shadow-xs transition-all"
                  >
                    Sign In
                  </TabsTrigger>
                  <TabsTrigger
                    value="register"
                    className="rounded-lg text-sm font-semibold data-[state=active]:bg-card data-[state=active]:text-foreground data-[state=active]:shadow-xs transition-all"
                  >
                    Register
                  </TabsTrigger>
                </TabsList>

                {error && (
                  <div className="mb-3 rounded-lg border border-destructive/20 bg-destructive/10 p-2.5 text-xs font-medium leading-relaxed text-destructive">
                    {error}
                  </div>
                )}

                {/* LOGIN TAB */}
                <TabsContent value="login" className="m-0 space-y-3 focus-visible:outline-none">
                  <div className="space-y-1 mb-2">
                    <h2 className="text-xl font-bold tracking-tight text-foreground">Welcome back</h2>
                    <p className="text-xs text-muted-foreground">
                      Sign in with your email and password to access your chats and workspace.
                    </p>
                  </div>

                  <form onSubmit={handleLoginSubmit} className="space-y-3">
                    <div className="space-y-1.5">
                      <Label htmlFor="login-email" className="text-xs font-semibold text-foreground">
                        Email Address
                      </Label>
                      <div className="relative">
                        <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
                        <Input
                          id="login-email"
                          type="email"
                          placeholder="name@company.com"
                          required
                          value={loginEmail}
                          onChange={(e) => setLoginEmail(e.target.value)}
                          disabled={isLoading}
                          className="h-10 rounded-xl bg-background/50 pl-10 pr-3 focus:bg-background"
                        />
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between">
                        <Label htmlFor="login-password" className="text-xs font-semibold text-foreground">
                          Password
                        </Label>
                      </div>
                      <div className="relative">
                        <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
                        <Input
                          id="login-password"
                          type={showLoginPassword ? "text" : "password"}
                          placeholder="Enter your password"
                          required
                          value={loginPassword}
                          onChange={(e) => setLoginPassword(e.target.value)}
                          disabled={isLoading}
                          className="h-10 rounded-xl bg-background/50 pl-10 pr-10 focus:bg-background"
                        />
                        <button
                          type="button"
                          onClick={() => setShowLoginPassword(!showLoginPassword)}
                          className="absolute right-3.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                          aria-label={showLoginPassword ? "Hide password" : "Show password"}
                        >
                          {showLoginPassword ? (
                            <EyeOff className="size-4" />
                          ) : (
                            <Eye className="size-4" />
                          )}
                        </button>
                      </div>
                    </div>

                    <Button
                      type="submit"
                      disabled={isLoading}
                      className="mt-1 h-10 w-full rounded-xl text-sm font-semibold shadow-md shadow-primary/20"
                    >
                      {isLoading ? (
                        <>
                          <Loader2 className="mr-2 size-4 animate-spin" />
                          Signing in...
                        </>
                      ) : (
                        <>
                          Sign In
                          <ArrowRight className="ml-2 size-4" />
                        </>
                      )}
                    </Button>
                  </form>

                  <div className="relative my-3">
                    <div className="absolute inset-0 flex items-center">
                      <span className="w-full border-t border-border/80" />
                    </div>
                    <div className="relative flex justify-center text-[11px] uppercase tracking-wider">
                      <span className="bg-card px-2 text-muted-foreground font-medium">Or continue with</span>
                    </div>
                  </div>

                  {/* Guest sign-in option */}
                  <div>
                    <Button
                      type="button"
                      variant="outline"
                      className="h-9 w-full rounded-xl border-border/80 text-xs font-medium hover:bg-accent/60"
                      onClick={handleGuestLogin}
                      disabled={isLoading}
                    >
                      <UserX className="mr-2 size-4 text-muted-foreground" />
                      Try as Guest (Instant Access)
                    </Button>
                  </div>
                </TabsContent>

                {/* REGISTER TAB */}
                <TabsContent value="register" className="m-0 space-y-3 focus-visible:outline-none">
                  <div className="space-y-1 mb-2">
                    <h2 className="text-xl font-bold tracking-tight text-foreground">Create an account</h2>
                    <p className="text-xs text-muted-foreground">
                      Join NexusAI by filling in your credentials below.
                    </p>
                  </div>

                  <form onSubmit={handleRegisterSubmit} className="space-y-2.5">
                    <div className="space-y-1.5">
                      <Label htmlFor="reg-name" className="text-xs font-semibold text-foreground">
                        Full Name
                      </Label>
                      <div className="relative">
                        <User className="absolute left-3.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
                        <Input
                          id="reg-name"
                          type="text"
                          placeholder="Alex Mercer"
                          required
                          value={regName}
                          onChange={(e) => setRegName(e.target.value)}
                          disabled={isLoading}
                          className="h-10 rounded-xl bg-background/50 pl-10 pr-3 focus:bg-background"
                        />
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      <Label htmlFor="reg-email" className="text-xs font-semibold text-foreground">
                        Email Address
                      </Label>
                      <div className="relative">
                        <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
                        <Input
                          id="reg-email"
                          type="email"
                          placeholder="name@company.com"
                          required
                          value={regEmail}
                          onChange={(e) => setRegEmail(e.target.value)}
                          disabled={isLoading}
                          className="h-10 rounded-xl bg-background/50 pl-10 pr-3 focus:bg-background"
                        />
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      <Label htmlFor="reg-password" className="text-xs font-semibold text-foreground">
                        Password
                      </Label>
                      <div className="relative">
                        <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
                        <Input
                          id="reg-password"
                          type={showRegPassword ? "text" : "password"}
                          placeholder="At least 8 characters"
                          required
                          minLength={8}
                          value={regPassword}
                          onChange={(e) => setRegPassword(e.target.value)}
                          disabled={isLoading}
                          className="h-10 rounded-xl bg-background/50 pl-10 pr-10 focus:bg-background"
                        />
                        <button
                          type="button"
                          onClick={() => setShowRegPassword(!showRegPassword)}
                          className="absolute right-3.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                          aria-label={showRegPassword ? "Hide password" : "Show password"}
                        >
                          {showRegPassword ? (
                            <EyeOff className="size-4" />
                          ) : (
                            <Eye className="size-4" />
                          )}
                        </button>
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      <Label htmlFor="reg-confirm-password" className="text-xs font-semibold text-foreground">
                        Confirm Password
                      </Label>
                      <div className="relative">
                        <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
                        <Input
                          id="reg-confirm-password"
                          type={showRegConfirmPassword ? "text" : "password"}
                          placeholder="Re-enter password"
                          required
                          minLength={8}
                          value={regConfirmPassword}
                          onChange={(e) => setRegConfirmPassword(e.target.value)}
                          disabled={isLoading}
                          className="h-10 rounded-xl bg-background/50 pl-10 pr-10 focus:bg-background"
                        />
                        <button
                          type="button"
                          onClick={() => setShowRegConfirmPassword(!showRegConfirmPassword)}
                          className="absolute right-3.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                          aria-label={showRegConfirmPassword ? "Hide confirm password" : "Show confirm password"}
                        >
                          {showRegConfirmPassword ? (
                            <EyeOff className="size-4" />
                          ) : (
                            <Eye className="size-4" />
                          )}
                        </button>
                      </div>
                      {regConfirmPassword && regPassword && (
                        <p className={`text-[11px] flex items-center gap-1 mt-1 ${regPassword === regConfirmPassword ? "text-emerald-500" : "text-amber-500"}`}>
                          <CheckCircle2 className="size-3" />
                          {regPassword === regConfirmPassword ? "Passwords match" : "Passwords do not match yet"}
                        </p>
                      )}
                    </div>

                    <Button
                      type="submit"
                      disabled={isLoading}
                      className="mt-1 h-10 w-full rounded-xl text-sm font-semibold shadow-md shadow-primary/20"
                    >
                      {isLoading ? (
                        <>
                          <Loader2 className="mr-2 size-4 animate-spin" />
                          Creating Account...
                        </>
                      ) : (
                        <>
                          Create Account
                          <ArrowRight className="ml-2 size-4" />
                        </>
                      )}
                    </Button>
                  </form>

                  <div className="pt-1 text-center">
                    <p className="text-xs text-muted-foreground">
                      Already have an account?{" "}
                      <button
                        type="button"
                        onClick={() => handleTabChange("login")}
                        className="text-primary hover:underline font-semibold"
                      >
                        Sign in here
                      </button>
                    </p>
                  </div>
                </TabsContent>
              </Tabs>
          </div>

          {/* Footer note */}
          <div className="border-t border-border/60 bg-muted/40 px-6 py-2 text-center text-[10px] text-muted-foreground [@media(max-height:700px)]:hidden">
            Protected by end-to-end encrypted sessions & tokens
          </div>
        </Card>

        {/* Back to home */}
        <div className="mt-3 text-center [@media(max-height:700px)]:hidden">
          <Link
            to="/"
            className="text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            ← Back to Homepage
          </Link>
        </div>
      </div>
    </div>
  );
}

export default function AuthPage(props: AuthProps) {
  return (
    <Suspense>
      <Auth {...props} />
    </Suspense>
  );
}
