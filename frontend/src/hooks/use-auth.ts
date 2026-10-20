/**
 * Auth hook for password, guest and optional email-OTP sessions.
 */
import { useCallback, useEffect } from "react";
import { useAuthStore } from "@/store/auth";
import { authApi, type AuthResult } from "@/api";

export function useAuth() {
  const { user, status, init, setUser, signOut: storeSignOut } = useAuthStore();

  useEffect(() => {
    if (status === "loading") {
      void init();
    }
  }, [status, init]);

  const isLoading = status === "loading";
  const isAuthenticated = status === "authenticated";

  /** Email-OTP flow: request a code, then verify it. */
  const signIn = useCallback(
    async (
      provider: "email-otp" | "anonymous",
      formDataOrEmail?: FormData | string,
    ): Promise<AuthResult> => {
      if (provider === "anonymous") {
        const res = await authApi.guest();
        setUser(res.user);
        return res;
      }
      // email-otp: either the email (step 1) or { email, code } (step 2)
      if (typeof formDataOrEmail === "string") {
        return authApi.requestOtp(formDataOrEmail) as unknown as Promise<AuthResult>;
      }
      const email = String(formDataOrEmail?.get("email") ?? "");
      const code = formDataOrEmail?.get("code");
      if (code) {
        const res = await authApi.verifyOtp(email, String(code));
        setUser(res.user);
        return res;
      }
      return authApi.requestOtp(email) as unknown as Promise<AuthResult>;
    },
    [setUser],
  );

  const login = useCallback(
    async (email: string, password: string): Promise<AuthResult> => {
      const res = await authApi.login({ email, password });
      setUser(res.user);
      return res;
    },
    [setUser],
  );

  const register = useCallback(
    async (name: string, email: string, password: string): Promise<AuthResult> => {
      const res = await authApi.register({ name, email, password });
      setUser(res.user);
      return res;
    },
    [setUser],
  );

  const signOut = useCallback(async () => {
    await storeSignOut();
  }, [storeSignOut]);

  return { isLoading, isAuthenticated, user, signIn, login, register, signOut };
}
