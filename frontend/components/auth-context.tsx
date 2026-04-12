"use client";

import { createContext, useContext, useEffect, useState } from "react";

import { getCurrentUser } from "@/lib/api";

export type UserRole = "student" | "teacher" | "admin";

type RawSessionUser = {
  id?: number;
  username?: string;
  role?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  profile_image_path?: string | null;
  must_change_password?: boolean;
};

type AuthUser = {
  id: number;
  username: string;
  role: UserRole;
  displayName: string;
  profileImagePath: string | null;
  mustChangePassword: boolean;
};

type SessionState = AuthUser & {
  loading: boolean;
};

type AuthState = SessionState & {
  login: (username: string, password: string) => Promise<AuthUser>;
  logout: () => Promise<void>;
  clearMustChangePassword: () => void;
};

type LoginResponse = {
  token?: string;
  detail?: string;
  user?: RawSessionUser;
};

function toAuthUser(user?: RawSessionUser): AuthUser {
  const username = user?.username?.trim() || "Guest";
  const displayName =
    [user?.first_name?.trim(), user?.last_name?.trim()].filter(Boolean).join(" ").trim() || username;

  return {
    id: typeof user?.id === "number" ? user.id : 0,
    username,
    role:
      user?.role === "admin" ? "admin" : user?.role === "teacher" ? "teacher" : "student",
    displayName,
    profileImagePath: user?.profile_image_path ?? null,
    mustChangePassword: Boolean(user?.must_change_password),
  };
}

function isGuestUser(user: AuthUser): boolean {
  return user.id === 0 || user.username === "Guest";
}

const AuthContext = createContext<AuthState>({
  id: 0,
  username: "Guest",
  role: "student",
  displayName: "Guest",
  profileImagePath: null,
  mustChangePassword: false,
  loading: true,
  login: async () => GUEST_USER,
  logout: async () => {},
  clearMustChangePassword: () => {},
});

const GUEST_USER: AuthUser = {
  id: 0,
  username: "Guest",
  role: "student",
  displayName: "Guest",
  profileImagePath: null,
  mustChangePassword: false,
};

const GUEST_STATE: SessionState = {
  ...GUEST_USER,
  loading: false,
};

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<SessionState>({ ...GUEST_USER, loading: true });

  function persistAuthenticatedUser(token: string, user?: RawSessionUser): AuthUser {
    window.localStorage.setItem("auth_token", token);
    const nextUser = toAuthUser(user);
    window.localStorage.setItem("auth_username", nextUser.displayName);
    setState({
      ...nextUser,
      loading: false,
    });
    return nextUser;
  }

  useEffect(() => {
    let cancelled = false;

    async function loadSession() {
      try {
        const response = await fetch("/api/auth/me", { cache: "no-store" });
        if (!response.ok) {
          throw new Error("Unable to resolve current user");
        }

        const data = (await response.json()) as RawSessionUser;
        const nextUser = toAuthUser(data);
        if (!cancelled && !isGuestUser(nextUser)) {
          window.localStorage.setItem("auth_username", nextUser.displayName);
          setState({
            ...nextUser,
            loading: false,
          });
          return;
        }
      } catch {
        // Fall back to the stored token when the cookie session is unavailable.
      }

      const token = window.localStorage.getItem("auth_token")?.trim();
      if (token) {
        try {
          const user = await getCurrentUser(token);
          const nextUser = toAuthUser(user);
          if (!cancelled) {
            window.localStorage.setItem("auth_username", nextUser.displayName);
            setState({
              ...nextUser,
              loading: false,
            });
          }
          return;
        } catch {
          window.localStorage.removeItem("auth_token");
          window.localStorage.removeItem("auth_username");
        }
      }

      if (!cancelled) {
        setState(GUEST_STATE);
      }
    }

    void loadSession();
    return () => {
      cancelled = true;
    };
  }, []);

  async function login(username: string, password: string): Promise<AuthUser> {
    const response = await fetch("/api/auth/login", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ username, password }),
    });

    const data = (await response.json().catch(() => ({}))) as LoginResponse;

    if (!response.ok) {
      throw new Error(data.detail ?? "Unable to sign in.");
    }

    if (!data.token) {
      throw new Error("Login succeeded but no session token was returned.");
    }

    return persistAuthenticatedUser(data.token, data.user);
  }

  async function logout() {
    try {
      await fetch("/api/auth/logout", {
        method: "POST",
      });
    } finally {
      window.localStorage.removeItem("auth_token");
      window.localStorage.removeItem("auth_username");
      setState({
        ...GUEST_STATE,
      });
    }
  }

  function clearMustChangePassword() {
    setState((previous) => ({
      ...previous,
      mustChangePassword: false,
    }));
  }

  return (
    <AuthContext.Provider value={{ ...state, login, logout, clearMustChangePassword }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
