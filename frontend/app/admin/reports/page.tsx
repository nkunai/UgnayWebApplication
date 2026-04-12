"use client";

import { useEffect, useMemo, useState } from "react";

import {
  getAdminLoginActivityReport,
  getAdminSystemActivityEvents,
  type LoginActivityReport,
  type SystemActivityEvent
} from "@/lib/api";

type RoleFilter = "all" | "student" | "teacher" | "admin";

function resolveActorCompany(event: SystemActivityEvent): string {
  const company = event.actor_company_name?.trim();
  if (company) {
    return company;
  }
  if (event.actor_role === "teacher" || event.actor_role === "admin") {
    return "HAND AND HEART";
  }
  return "-";
}

export default function AdminReportsPage() {
  const [loginReport, setLoginReport] = useState<LoginActivityReport | null>(null);
  const [activityEvents, setActivityEvents] = useState<SystemActivityEvent[]>([]);
  const [roleFilter, setRoleFilter] = useState<RoleFilter>("all");
  const [companyFilter, setCompanyFilter] = useState<string>("all");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([getAdminLoginActivityReport(200), getAdminSystemActivityEvents(220, "all")])
      .then(([loginData, activityData]) => {
        setLoginReport(loginData);
        setActivityEvents(activityData);
      })
      .catch((requestError: Error) => setError(requestError.message));
  }, []);

  const companyOptions = useMemo(() => {
    const set = new Set<string>();
    for (const event of activityEvents) {
      const company = resolveActorCompany(event);
      if (company !== "-") {
        set.add(company);
      }
    }
    return Array.from(set.values()).sort((a, b) => a.localeCompare(b));
  }, [activityEvents]);

  const filteredLoginEvents = useMemo(() => {
    const rows = loginReport?.events ?? [];
    if (roleFilter === "all") {
      return rows;
    }
    return rows.filter((event) => event.role === roleFilter);
  }, [loginReport, roleFilter]);

  const filteredActivityEvents = useMemo(() => {
    return activityEvents.filter((event) => {
      const roleOk = roleFilter === "all" || event.actor_role === roleFilter;
      if (!roleOk) {
        return false;
      }
      const company = resolveActorCompany(event);
      return companyFilter === "all" || company === companyFilter;
    });
  }, [activityEvents, companyFilter, roleFilter]);

  return (
    <section className="space-y-6">
      <div className="panel">
        <p className="text-xs font-semibold uppercase tracking-[0.3em] text-brandBlue">Admin LMS</p>
        <h2 className="mt-3 text-3xl font-bold title-gradient">Reports and Login Activity</h2>
        <p className="mt-2 text-sm text-slate-700">
          Monitor login sessions and system activity with role and company filters.
        </p>
      </div>

      {error ? (
        <p className="rounded-xl border border-brandRed/35 bg-brandRedLight px-4 py-3 text-sm text-brandRed">
          {error}
        </p>
      ) : null}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <article className="panel panel-lively">
          <p className="text-xs font-semibold uppercase tracking-[0.25em] label-accent">Logins (24h)</p>
          <p className="mt-3 text-4xl font-black text-brandBlue">{loginReport?.total_logins_last_24h ?? 0}</p>
        </article>
        <article className="panel panel-lively">
          <p className="text-xs font-semibold uppercase tracking-[0.25em] label-accent">Active Sessions</p>
          <p className="mt-3 text-4xl font-black text-brandGreen">{loginReport?.active_sessions ?? 0}</p>
        </article>
        <article className="panel panel-lively">
          <p className="text-xs font-semibold uppercase tracking-[0.25em] label-accent">Teacher Logins (24h)</p>
          <p className="mt-3 text-4xl font-black text-accentWarm">
            {loginReport?.logins_last_24h_by_role?.teacher ?? 0}
          </p>
        </article>
        <article className="panel panel-lively">
          <p className="text-xs font-semibold uppercase tracking-[0.25em] label-accent">Student Logins (24h)</p>
          <p className="mt-3 text-4xl font-black text-brandBlue">
            {loginReport?.logins_last_24h_by_role?.student ?? 0}
          </p>
        </article>
      </div>

      <div className="panel">
        <div className="grid gap-4 md:grid-cols-2">
          <label className="text-sm font-semibold text-slate-800">
            Role Filter
            <select
              className="mt-1 w-full rounded-lg border border-brandBorder bg-white px-3 py-2"
              onChange={(event) => setRoleFilter(event.target.value as RoleFilter)}
              value={roleFilter}
            >
              <option value="all">All Roles</option>
              <option value="teacher">Teacher</option>
              <option value="student">Student</option>
              <option value="admin">Admin</option>
            </select>
          </label>
          <label className="text-sm font-semibold text-slate-800">
            Company Filter
            <select
              className="mt-1 w-full rounded-lg border border-brandBorder bg-white px-3 py-2"
              onChange={(event) => setCompanyFilter(event.target.value)}
              value={companyFilter}
            >
              <option value="all">All Companies</option>
              {companyOptions.map((company) => (
                <option key={company} value={company}>
                  {company}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>

      <div className="panel">
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs font-semibold uppercase tracking-[0.25em] label-accent">Recent Login Sessions</p>
          <span className="rounded-full border border-brandBorder bg-white px-3 py-1 text-xs font-semibold text-slate-700">
            {filteredLoginEvents.length} entries
          </span>
        </div>
        <div className="mt-4 overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-brandBorder text-left text-xs uppercase tracking-[0.2em] text-slate-500">
                <th className="px-2 py-3">User</th>
                <th className="px-2 py-3">Role</th>
                <th className="px-2 py-3">Login Time</th>
                <th className="px-2 py-3">Session</th>
              </tr>
            </thead>
            <tbody>
              {filteredLoginEvents.map((event) => (
                <tr className="border-b border-brandBorder/70" key={event.session_id}>
                  <td className="px-2 py-3 font-semibold text-slate-900">{event.username}</td>
                  <td className="px-2 py-3 capitalize text-slate-700">{event.role}</td>
                  <td className="px-2 py-3 text-slate-700">{new Date(event.logged_in_at).toLocaleString()}</td>
                  <td className="px-2 py-3">
                    <span
                      className={`rounded-full px-3 py-1 text-xs font-semibold ${
                        event.is_active
                          ? "bg-brandGreenLight text-brandGreen"
                          : "bg-brandMutedSurface text-slate-600"
                      }`}
                    >
                      {event.is_active ? "Active" : "Expired"}
                    </span>
                  </td>
                </tr>
              ))}
              {filteredLoginEvents.length === 0 ? (
                <tr>
                  <td className="px-2 py-4 text-sm text-slate-500" colSpan={4}>
                    No login entries found for this filter.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>

      <div className="panel">
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs font-semibold uppercase tracking-[0.25em] label-accent">System Activity Trail</p>
          <span className="rounded-full border border-brandBorder bg-white px-3 py-1 text-xs font-semibold text-slate-700">
            {filteredActivityEvents.length} entries
          </span>
        </div>
        <div className="mt-4 overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-brandBorder text-left text-xs uppercase tracking-[0.2em] text-slate-500">
                <th className="px-2 py-3">Time</th>
                <th className="px-2 py-3">Role</th>
                <th className="px-2 py-3">Email</th>
                <th className="px-2 py-3">First Name</th>
                <th className="px-2 py-3">Last Name</th>
                <th className="px-2 py-3">Company</th>
                <th className="px-2 py-3">Action</th>
              </tr>
            </thead>
            <tbody>
              {filteredActivityEvents.map((event) => (
                <tr className="border-b border-brandBorder/70" key={event.id}>
                  <td className="px-2 py-3 text-slate-700">{new Date(event.created_at).toLocaleString()}</td>
                  <td className="px-2 py-3 capitalize text-slate-700">{event.actor_role}</td>
                  <td className="px-2 py-3 text-slate-700">{event.actor_email ?? "-"}</td>
                  <td className="px-2 py-3 text-slate-700">{event.actor_first_name ?? "-"}</td>
                  <td className="px-2 py-3 text-slate-700">{event.actor_last_name ?? "-"}</td>
                  <td className="px-2 py-3 text-slate-700">{resolveActorCompany(event)}</td>
                  <td className="px-2 py-3 font-semibold text-slate-900">
                    {event.action_type.replaceAll("_", " ")}
                  </td>
                </tr>
              ))}
              {filteredActivityEvents.length === 0 ? (
                <tr>
                  <td className="px-2 py-4 text-sm text-slate-500" colSpan={7}>
                    No system activity entries found for this filter.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
