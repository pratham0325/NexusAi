/** Global auth/session state managed with Zustand. */

import { create } from "zustand";
import { authApi } from "@/api";
import type { UserWire } from "@/api/types";

interface AuthState {
  user: UserWire | null;
  status: "loading" | "authenticated" | "unauthenticated";
  init: () => Promise<void>;
  setUser: (user: UserWire | null) => void;
  signOut: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  status: "loading",

  /** Boots the session: restores /me, else tries a silent refresh. */
  init: async () => {
    try {
      const { user } = await authApi.me();
      set({ user, status: "authenticated" });
    } catch {
      try {
        const { user } = await authApi.refresh();
        set({ user, status: "authenticated" });
      } catch {
        set({ user: null, status: "unauthenticated" });
      }
    }
  },

  setUser: (user) =>
    set({
      user,
      status: user ? "authenticated" : "unauthenticated",
    }),

  signOut: async () => {
    try {
      await authApi.logout();
    } catch {
      // Even if logout fails, drop the local session.
    }
    set({ user: null, status: "unauthenticated" });
  },
}));
