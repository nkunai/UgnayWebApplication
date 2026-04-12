"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { useAuth } from "@/components/auth-context";

type DemoRole = "teacher" | "student";

const DEMO_ACCOUNTS: Record<DemoRole, { username: string; password: string; label: string }> = {
  teacher: {
    username: "teacher_demo",
    password: "teacher123",
    label: "Use Teacher Demo",
  },
  student: {
    username: "student_demo",
    password: "student123",
    label: "Use Student Demo",
  },
};

export function AuthSwitcher({ collapsed = false }: { collapsed?: boolean }) {
  const router = useRouter();
  const { loading, login, logout, role, username } = useAuth();
  const [pendingRole, setPendingRole] = useState<DemoRole | null>(null);
  const [signingOut, setSigningOut] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleDemoLogin(nextRole: DemoRole) {
    setError(null);
    setPendingRole(nextRole);

    try {
      const account = DEMO_ACCOUNTS[nextRole];
      await login(account.username, account.password);
      router.push(nextRole === "teacher" ? "/teacher" : "/dashboard");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to switch account.");
    } finally {
      setPendingRole(null);
    }
  }

  async function handleLogout() {
    setError(null);
    setSigningOut(true);

    try {
      await logout();
      router.push("/dashboard");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to sign out.");
    } finally {
      setSigningOut(false);
    }
  }

  if (collapsed) {
    return (
      <div className="grid gap-2">
        <button
          aria-label="Switch to teacher demo"
          className="rounded-lg border border-brandWhite/20 px-2 py-2 text-xs font-semibold text-brandWhite hover:bg-white/10"
          disabled={loading || signingOut || pendingRole !== null}
          onClick={() => void handleDemoLogin("teacher")}
          type="button"
        >
          T
        </button>
        <button
          aria-label="Switch to student demo"
          className="rounded-lg border border-brandWhite/20 px-2 py-2 text-xs font-semibold text-brandWhite hover:bg-white/10"
          disabled={loading || signingOut || pendingRole !== null}
          onClick={() => void handleDemoLogin("student")}
          type="button"
        >
          S
        </button>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-brandWhite/15 bg-black/20 p-3">
      <p className="text-[11px] uppercase tracking-[0.25em] text-muted">Access</p>
      <p className="mt-2 text-sm font-semibold text-brandWhite">
        {loading ? "Resolving session..." : username}
      </p>
      <p className="mt-1 text-xs text-muted">
        {loading
          ? "Checking saved session"
          : role === "teacher"
            ? "Teacher workspace unlocked"
            : username === "Guest"
              ? "Guest student mode"
              : "Student workspace unlocked"}
      </p>

      <div className="mt-3 grid gap-2">
        {(["teacher", "student"] as const).map((nextRole) => (
          <button
            key={nextRole}
            className={`rounded-xl px-3 py-2 text-xs font-semibold transition ${
              nextRole === "teacher"
                ? "bg-accent text-white hover:bg-accent/90"
                : "bg-accentWarm text-black hover:bg-accentWarm/90"
            }`}
            disabled={loading || signingOut || pendingRole !== null}
            onClick={() => void handleDemoLogin(nextRole)}
            type="button"
          >
            {pendingRole === nextRole ? "Switching..." : DEMO_ACCOUNTS[nextRole].label}
          </button>
        ))}

        <button
          className="rounded-xl border border-brandWhite/20 px-3 py-2 text-xs font-semibold text-brandWhite transition hover:bg-white/10"
          disabled={loading || signingOut || username === "Guest"}
          onClick={() => void handleLogout()}
          type="button"
        >
          {signingOut ? "Signing out..." : "Sign Out"}
        </button>
      </div>

      <p className="mt-3 text-[11px] leading-relaxed text-muted">
        Demo accounts: <span className="text-brandWhite">teacher_demo / teacher123</span> and{" "}
        <span className="text-brandWhite">student_demo / student123</span>.
      </p>

      {error ? <p className="mt-2 text-xs text-red-300">{error}</p> : null}
    </div>
  );
}
