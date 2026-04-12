"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { ReactNode, useEffect, useMemo, useRef, useState } from "react";

import { useAuth } from "@/components/auth-context";
import { AppNav } from "@/components/nav";
import { SiteFooter } from "@/components/site-footer";
import { resolveUploadsBase } from "@/lib/api";

function isPublicRoute(pathname: string): boolean {
  return pathname === "/" || pathname.startsWith("/register");
}

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { displayName, id, loading, logout, mustChangePassword, profileImagePath, role } = useAuth();
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const userMenuRef = useRef<HTMLDivElement | null>(null);

  const publicRoute = useMemo(() => isPublicRoute(pathname), [pathname]);
  const homeHref = role === "admin" ? "/admin" : role === "teacher" ? "/teacher" : "/dashboard";
  const headerGreeting =
    role === "admin" ? (
      <>
        Welcome, Admin <span className="text-brandBlue">{displayName}</span>
      </>
    ) : role === "teacher" ? (
      <>
        Welcome, Teacher <span className="text-brandBlue">{displayName}</span>
      </>
    ) : (
      <>
        Welcome, <span className="text-brandBlue">{displayName}</span>
      </>
    );
  const profileImageUrl = useMemo(() => {
    if (!profileImagePath) {
      return null;
    }
    const uploadBase = resolveUploadsBase();
    return `${uploadBase}/${profileImagePath}`;
  }, [profileImagePath]);

  useEffect(() => {
    if (loading) {
      return;
    }
    if (publicRoute) {
      if (pathname === "/" && id !== 0) {
        router.replace(homeHref);
      }
      return;
    }
    if (id === 0) {
      router.replace("/");
      return;
    }
    if (mustChangePassword && pathname !== "/profile") {
      router.replace("/profile?forcePasswordChange=1");
    }
  }, [homeHref, id, loading, mustChangePassword, pathname, publicRoute, router]);

  useEffect(() => {
    setUserMenuOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!userMenuOpen) {
      return;
    }

    function handleOutsideClick(event: MouseEvent) {
      if (!userMenuRef.current) {
        return;
      }
      if (!userMenuRef.current.contains(event.target as Node)) {
        setUserMenuOpen(false);
      }
    }

    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setUserMenuOpen(false);
      }
    }

    window.addEventListener("mousedown", handleOutsideClick);
    window.addEventListener("keydown", handleEscape);

    return () => {
      window.removeEventListener("mousedown", handleOutsideClick);
      window.removeEventListener("keydown", handleEscape);
    };
  }, [userMenuOpen]);

  if (
    (!publicRoute && loading) ||
    (publicRoute && pathname === "/" && id !== 0) ||
    (!publicRoute && id === 0) ||
    (!publicRoute && mustChangePassword && pathname !== "/profile")
  ) {
    return <div className="min-h-screen bg-grid" />;
  }

  if (publicRoute) {
    return (
      <div className="min-h-screen bg-grid">
        <header className="sticky top-0 z-[120] overflow-visible border-b border-brandBorder bg-white/95 px-4 py-3 backdrop-blur-md md:px-8">
          <div className="mx-auto flex w-full max-w-6xl items-center gap-3 overflow-visible">
            <Image
              alt="Hand & Heart"
              className="h-10 w-10 rounded-full"
              height={40}
              src="/brand/logo.png"
              width={40}
            />
            <div>
              <p className="text-xl font-bold text-slate-900 md:text-2xl">FSL Learning Hub</p>
              <p className="text-sm text-muted">Hand &amp; Heart LMS Portal</p>
            </div>
          </div>
        </header>

        <main className="mx-auto w-full max-w-3xl px-4 py-6 md:px-8 md:py-8">
          <div className="page-transition-enter" key={pathname}>
            {children}
          </div>
        </main>
        <SiteFooter variant="bar" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-grid md:flex">
      <AppNav role={role} />

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-[var(--teacher-shell-mobile-nav-offset)] z-[120] overflow-visible border-b border-brandBorder bg-white/95 px-4 py-3 backdrop-blur-md md:top-0 md:px-8">
          <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-3 overflow-visible">
            <div className="flex items-center gap-3">
              <button
                className="inline-flex h-9 items-center rounded-lg border border-brandBorder bg-brandMutedSurface px-3 text-sm font-semibold text-brandBlue transition hover:bg-brandBlueLight"
                onClick={() => {
                  if (window.history.length > 1) {
                    router.back();
                    return;
                  }
                  router.push(homeHref);
                }}
                type="button"
              >
                Back
              </button>

              <div className="text-sm font-semibold text-slate-700">
                {headerGreeting}
              </div>
            </div>

            <div className="relative overflow-visible" ref={userMenuRef}>
              <button
                aria-expanded={userMenuOpen}
                aria-haspopup="menu"
                className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-brandBorder bg-white transition hover:bg-brandBlueLight"
                onClick={() => setUserMenuOpen((open) => !open)}
                type="button"
              >
                {profileImageUrl ? (
                  <img
                    alt="Profile"
                    className="h-9 w-9 rounded-full object-cover"
                    src={profileImageUrl}
                  />
                ) : (
                  <span className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-brandBlue text-sm font-bold text-white">
                    {displayName.charAt(0).toUpperCase()}
                  </span>
                )}
              </button>

              {userMenuOpen ? (
                <div className="absolute right-0 z-[200] mt-2 w-44 rounded-xl border border-brandBorder bg-white p-1 shadow-lg">
                  <Link
                    className="block rounded-lg px-3 py-2 text-sm font-semibold text-brandBlue transition hover:bg-brandBlueLight"
                    href="/profile"
                    onClick={() => setUserMenuOpen(false)}
                  >
                    Profile
                  </Link>
                  <button
                    className="mt-1 w-full rounded-lg bg-brandRed px-3 py-2 text-left text-sm font-semibold text-white transition hover:bg-brandRed/90"
                    onClick={() => {
                      void logout().finally(() => {
                        router.replace("/");
                      });
                    }}
                    type="button"
                  >
                    Log Out
                  </button>
                </div>
              ) : null}
            </div>
          </div>
        </header>

        <main className="relative z-0 w-full flex-1 px-4 py-6 md:px-8 md:py-8">
          <div className="mx-auto w-full max-w-6xl space-y-4">
            <div className="page-transition-enter" key={pathname}>
              {children}
            </div>
          </div>
        </main>

        <SiteFooter />
      </div>
    </div>
  );
}
