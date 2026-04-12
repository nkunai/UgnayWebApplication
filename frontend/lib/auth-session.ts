import { NextResponse } from "next/server";

import { fetchWithApiFallback, getApiBase, getApiBaseCandidates } from "@/lib/api-base";

export type SessionRole = "student" | "teacher" | "admin";

type RawUser = {
  id?: number;
  username?: string;
  role?: string;
  must_change_password?: boolean;
};

type RawAuthResponse = {
  token?: string;
  user?: RawUser;
  detail?: string;
};

const SESSION_COOKIE = "fsl_token";
const LEGACY_ROLE_COOKIE = "fsl_role";
const LEGACY_USERNAME_COOKIE = "fsl_username";

const SESSION_COOKIE_OPTIONS = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/",
  maxAge: 60 * 60 * 24,
};

export type SessionUser = {
  id: number;
  username: string;
  role: SessionRole;
  must_change_password: boolean;
};

export function guestSessionUser(): SessionUser {
  return {
    id: 0,
    username: "Guest",
    role: "student",
    must_change_password: false,
  };
}

export function normalizeSessionUser(user: RawUser | undefined): SessionUser {
  const role =
    user?.role === "admin" ? "admin" : user?.role === "teacher" ? "teacher" : "student";
  return {
    id: typeof user?.id === "number" ? user.id : 0,
    username: user?.username?.trim() || "Guest",
    role,
    must_change_password: Boolean(user?.must_change_password),
  };
}

export async function fetchBackendUser(token: string): Promise<SessionUser | null> {
  try {
    const { response } = await fetchWithApiFallback("/auth/me", {
      cache: "no-store",
      headers: {
        Authorization: `Bearer ${token}`,
      },
    }, {
      attempts: 1,
      retryDelayMs: 0,
    });

    if (!response.ok) {
      return null;
    }

    const data = (await response.json()) as RawUser;
    return normalizeSessionUser(data);
  } catch {
    return null;
  }
}

export async function loginAgainstBackend(
  username: string,
  password: string
): Promise<
  | { ok: true; token: string; user: SessionUser }
  | { ok: false; status: number; detail: string }
> {
  return requestAuthFromBackend("/auth/login", { username, password }, "Unable to sign in.");
}

async function requestAuthFromBackend(
  path: string,
  payload: object,
  fallbackDetail: string
): Promise<
  | { ok: true; token: string; user: SessionUser }
  | { ok: false; status: number; detail: string }
> {
  try {
    const { response } = await fetchWithApiFallback(path, {
      method: "POST",
      cache: "no-store",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    const data = (await response.json().catch(() => ({}))) as RawAuthResponse;

    if (!response.ok) {
      return {
        ok: false,
        status: response.status,
        detail: data.detail ?? fallbackDetail,
      };
    }

    if (!data.token) {
      return {
        ok: false,
        status: 502,
        detail: "Backend login succeeded but did not return a session token.",
      };
    }

    return {
      ok: true,
      token: data.token,
      user: normalizeSessionUser(data.user),
    };
  } catch {
    const apiBases = getApiBaseCandidates(getApiBase()).join(" or ");
    return {
      ok: false,
      status: 502,
      detail: `Unable to reach backend API at ${apiBases}.`,
    };
  }
}

export function setSessionCookies(response: NextResponse, token: string) {
  response.cookies.set(SESSION_COOKIE, token, SESSION_COOKIE_OPTIONS);
  response.cookies.delete(LEGACY_ROLE_COOKIE);
  response.cookies.delete(LEGACY_USERNAME_COOKIE);
}

export function clearSessionCookies(response: NextResponse) {
  response.cookies.delete(SESSION_COOKIE);
  response.cookies.delete(LEGACY_ROLE_COOKIE);
  response.cookies.delete(LEGACY_USERNAME_COOKIE);
}
