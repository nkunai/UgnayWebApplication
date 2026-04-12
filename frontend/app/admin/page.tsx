"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { getAdminDashboard, type AdminDashboard } from "@/lib/api";

export default function AdminDashboardPage() {
  const [dashboard, setDashboard] = useState<AdminDashboard | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getAdminDashboard().then(setDashboard).catch((requestError: Error) => setError(requestError.message));
  }, []);

  return (
    <section className="space-y-6">
      <div className="panel">
        <p className="text-xs font-semibold uppercase tracking-[0.3em] text-brandBlue">Admin LMS</p>
        <h2 className="mt-3 text-3xl font-bold title-gradient">System Overview</h2>
        <p className="mt-2 text-sm text-slate-700">
          Create accounts, manage sections, and monitor system activity.
        </p>
      </div>

      {error ? <p className="rounded-xl border border-brandRed/35 bg-brandRedLight px-4 py-3 text-sm text-brandRed">{error}</p> : null}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {[
          { label: "Students", value: dashboard?.total_students ?? 0, tone: "text-brandBlue" },
          { label: "Teachers", value: dashboard?.total_teachers ?? 0, tone: "text-brandGreen" },
          { label: "Sections", value: dashboard?.total_sections ?? 0, tone: "text-accentWarm" },
          { label: "Active Sections", value: dashboard?.active_sections ?? 0, tone: "text-brandBlue" }
        ].map((card) => (
          <div key={card.label} className="panel panel-lively">
            <p className="text-xs font-semibold uppercase tracking-[0.25em] label-accent">{card.label}</p>
            <p className={`mt-3 text-4xl font-black ${card.tone}`}>{card.value}</p>
          </div>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
        <div className="panel">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.25em] label-accent">Recent Accounts</p>
              <h3 className="mt-2 text-xl font-bold text-slate-900">Latest users in the LMS</h3>
            </div>
            <Link className="rounded-lg bg-brandBlue px-4 py-2 text-sm font-semibold text-white" href="/admin/accounts">
              Manage Accounts
            </Link>
          </div>

          <div className="mt-4 overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-brandBorder text-left text-xs uppercase tracking-[0.2em] text-slate-500">
                  <th className="px-2 py-3">Username</th>
                  <th className="px-2 py-3">Role</th>
                  <th className="px-2 py-3">Created</th>
                </tr>
              </thead>
              <tbody>
                {(dashboard?.recent_accounts ?? []).map((user) => (
                  <tr className="border-b border-brandBorder/70" key={user.id}>
                    <td className="px-2 py-3 font-semibold text-slate-900">{user.username}</td>
                    <td className="px-2 py-3 capitalize text-slate-700">{user.role}</td>
                    <td className="px-2 py-3 text-slate-600">{new Date(user.created_at).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="panel">
          <p className="text-xs font-semibold uppercase tracking-[0.25em] label-accent">Quick Actions</p>
          <div className="mt-4 grid gap-3">
            <Link className="rounded-xl border border-brandBorder bg-white px-4 py-4 font-semibold text-brandBlue transition hover:bg-brandBlueLight" href="/admin/accounts">
              Bulk create student and teacher accounts
            </Link>
            <Link className="rounded-xl border border-brandBorder bg-white px-4 py-4 font-semibold text-brandBlue transition hover:bg-brandBlueLight" href="/admin/sections">
              Create sections and assign students
            </Link>
            <Link className="rounded-xl border border-brandBorder bg-white px-4 py-4 font-semibold text-brandBlue transition hover:bg-brandBlueLight" href="/admin/reports">
              View login activity and system audit logs
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
