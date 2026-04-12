"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

const STUDENT_NAV_ITEMS = [
  { href: "/dashboard", label: "Dashboard", short: "D" },
  { href: "/modules", label: "Modules", short: "M" },
  { href: "/lab", label: "Free Signing Gesture", short: "F" }
] as const;

const TEACHER_NAV_ITEMS = [
  { href: "/teacher", label: "Dashboard", short: "D" },
  { href: "/teacher/sections", label: "Sections", short: "S" },
  { href: "/teacher/reports", label: "Reports", short: "R" },
  { href: "/teacher/lab", label: "Lab", short: "L" }
] as const;

const ADMIN_NAV_ITEMS = [
  { href: "/admin", label: "Dashboard", short: "D" },
  { href: "/admin/accounts", label: "Accounts", short: "A" },
  { href: "/admin/sections", label: "Sections", short: "S" },
  { href: "/admin/reports", label: "Reports", short: "R" }
] as const;

export function AppNav({ role }: { role: "student" | "teacher" | "admin" }) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const navItems =
    role === "admin" ? ADMIN_NAV_ITEMS : role === "teacher" ? TEACHER_NAV_ITEMS : STUDENT_NAV_ITEMS;
  const dailyGoal =
    role === "admin"
      ? "Create accounts, organize sections, and monitor system activity."
      : role === "teacher"
      ? "Publish section modules, check reports, and guide learners in the signing lab."
      : "Practice at least one module and one gesture set.";

  return (
    <>
      <div className="sticky top-0 z-30 flex items-center justify-between border-b border-brandBorder bg-white/95 px-4 py-3 md:hidden">
        <button
          className="rounded-lg border border-brandBlue/25 bg-white px-3 py-1 text-xs font-semibold text-brandBlue shadow-sm transition hover:-translate-y-0.5 hover:bg-brandBlueLight"
          onClick={() => setMobileOpen(true)}
          type="button"
        >
          Menu
        </button>
        <div className="flex items-center gap-2">
          <Image
            alt="FSL Learning Hub logo"
            className="h-8 w-8 rounded-full border border-brandBorder object-cover"
            height={32}
            src="/brand/logo.png"
            width={32}
          />
          <div className="leading-tight">
            <p className="text-[15px] font-black uppercase tracking-[0.18em] text-brandBlue">UGNAY LEARNING HUB</p>
            <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-900">BASIC FSL COURSE</p>
            <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-900">HAND AND HEART</p>
          </div>
        </div>
      </div>

      {mobileOpen ? (
        <button
          aria-label="Close sidebar overlay"
          className="fixed inset-0 z-30 bg-brandNavy/30 backdrop-blur-[1px] md:hidden"
          onClick={() => setMobileOpen(false)}
          type="button"
        />
      ) : null}

      <aside
        className={`fixed left-0 top-0 z-40 h-screen -translate-x-full transition-all duration-300 md:sticky md:top-0 md:translate-x-0 ${
          collapsed ? "md:w-20" : "md:w-72"
        } ${mobileOpen ? "translate-x-0 w-72" : "w-72"}`}
      >
        <div className="flex h-full flex-col border-r border-brandBorder bg-gradient-to-b from-white via-brandMutedSurface/55 to-white backdrop-blur">
          <div className="flex items-center gap-3 border-b border-brandBorder p-4">
            <Image
              alt="FSL Learning Hub logo"
              className="h-10 w-10 rounded-full border border-brandBorder object-cover shadow-sm"
              height={40}
              src="/brand/logo.png"
              width={40}
            />
            {!collapsed ? (
              <div className="min-w-0 md:block">
                <h1 className="text-base leading-tight font-black uppercase tracking-[0.12em] text-brandBlue whitespace-normal break-words">
                  UGNAY LEARNING HUB
                </h1>
                <p className="text-[12px] font-semibold uppercase tracking-[0.08em] text-slate-900">BASIC FSL COURSE</p>
                <p className="text-[12px] font-semibold uppercase tracking-[0.08em] text-slate-900">HAND AND HEART</p>
              </div>
            ) : null}

            <button
              className="ml-auto hidden rounded-lg border border-brandBlue/25 bg-white px-2 py-1 text-xs font-semibold text-brandBlue shadow-sm transition hover:-translate-y-0.5 hover:bg-brandBlueLight md:block"
              onClick={() => setCollapsed((value) => !value)}
              type="button"
            >
              {collapsed ? ">" : "<"}
            </button>

            <button
              className="ml-auto rounded-lg border border-brandBlue/25 bg-white px-2 py-1 text-xs font-semibold text-brandBlue shadow-sm transition hover:bg-brandBlueLight md:hidden"
              onClick={() => setMobileOpen(false)}
              type="button"
            >
              X
            </button>
          </div>

          <nav className="flex-1 space-y-2 p-3">
            {navItems.map((item) => {
              const active =
                item.href === "/teacher"
                  ? pathname === item.href
                  : pathname === item.href || pathname.startsWith(`${item.href}/`);
              return (
                <Link
                  key={item.href}
                  className={`group relative flex items-center gap-3 overflow-hidden rounded-xl border px-3 py-2 text-sm font-semibold transition ${
                    active
                      ? "border-brandBlue bg-brandBlueLight text-brandBlue shadow-soft"
                      : "border-brandBorder text-slate-700 hover:-translate-y-0.5 hover:border-brandBlue/30 hover:bg-brandBlueLight/50"
                  }`}
                  href={item.href}
                  onClick={() => setMobileOpen(false)}
                >
                  {active ? <span className="absolute inset-y-0 left-0 w-1 rounded-r-full bg-brandBlue" /> : null}
                  <span className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-current text-xs transition group-hover:scale-105">
                    {item.short}
                  </span>
                  {!collapsed ? <span className="truncate">{item.label}</span> : null}
                </Link>
              );
            })}
          </nav>

          {!collapsed ? (
            <div className="mx-3 mb-3 rounded-xl border border-brandYellow/35 bg-brandYellowLight p-3">
              <p className="text-[11px] uppercase tracking-wide text-[#9a7800]">Daily Goal</p>
              <p className="mt-1 text-xs font-semibold text-slate-800">{dailyGoal}</p>
            </div>
          ) : null}
        </div>
      </aside>
    </>
  );
}
