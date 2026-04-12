"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";

import {
  archiveTeacherAccount,
  bulkImportAccounts,
  getAdminSections,
  getAdminUsers,
  reactivateUser,
  resendCredentials,
  type AdminUser,
  type BulkAccountImportJob,
  type LmsSection
} from "@/lib/api";

const HAND_AND_HEART = "HAND AND HEART";

type ImportRole = "student" | "teacher";
type AccountRoleFilter = "all" | "student" | "teacher" | "admin";

function parseRows(source: string, defaultSectionId: number | null, role: ImportRole) {
  return source
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [email = "", first_name = "", last_name = "", company_name = ""] = line
        .split(",")
        .map((part) => part.trim());
      return {
        email,
        first_name: first_name || undefined,
        last_name: last_name || undefined,
        company_name:
          role === "teacher" ? HAND_AND_HEART : (company_name || undefined),
        section_id: role === "student" ? defaultSectionId : null,
      };
    })
    .filter((row) => row.email);
}

function resolveCompanyName(user: AdminUser): string {
  if (user.role === "teacher" || user.role === "admin") {
    return HAND_AND_HEART;
  }
  return user.company_name?.trim() || "-";
}

export default function AdminAccountsPage() {
  const [importRole, setImportRole] = useState<ImportRole>("student");
  const [rawRows, setRawRows] = useState("");
  const [sections, setSections] = useState<LmsSection[]>([]);
  const [defaultSectionId, setDefaultSectionId] = useState<string>("");
  const [batchSize, setBatchSize] = useState(25);
  const [result, setResult] = useState<BulkAccountImportJob | null>(null);
  const [allUsers, setAllUsers] = useState<AdminUser[]>([]);
  const [accountRoleFilter, setAccountRoleFilter] = useState<AccountRoleFilter>("all");
  const [search, setSearch] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const parsedRows = useMemo(
    () => parseRows(rawRows, defaultSectionId ? Number(defaultSectionId) : null, importRole),
    [defaultSectionId, importRole, rawRows]
  );

  async function refreshUsers() {
    const data = await getAdminUsers(undefined, { includeArchived: true });
    setAllUsers(data);
  }

  useEffect(() => {
    getAdminSections().then(setSections).catch(() => undefined);
    void refreshUsers();
  }, []);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    setMessage(null);
    try {
      const response = await bulkImportAccounts({
        role: importRole,
        batch_size: batchSize,
        accounts: parsedRows,
      });
      setResult(response);
      setRawRows("");
      setMessage("Accounts created successfully.");
      await refreshUsers();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Unable to import accounts.");
    } finally {
      setSubmitting(false);
    }
  }

  const filteredUsers = useMemo(() => {
    const term = search.trim().toLowerCase();
    return allUsers.filter((user) => {
      const roleOk = accountRoleFilter === "all" || user.role === accountRoleFilter;
      if (!roleOk) {
        return false;
      }
      if (!term) {
        return true;
      }
      const haystack = [
        user.username,
        user.email ?? "",
        user.first_name ?? "",
        user.last_name ?? "",
        resolveCompanyName(user),
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(term);
    });
  }, [accountRoleFilter, allUsers, search]);

  const activeUsers = useMemo(
    () => filteredUsers.filter((user) => !user.archived_at),
    [filteredUsers]
  );
  const archivedUsers = useMemo(
    () => filteredUsers.filter((user) => Boolean(user.archived_at)),
    [filteredUsers]
  );

  return (
    <section className="space-y-6">
      <div className="panel">
        <p className="text-xs font-semibold uppercase tracking-[0.3em] text-brandBlue">Admin LMS</p>
        <h2 className="mt-3 text-3xl font-bold title-gradient">Bulk Account Creation</h2>
        <p className="mt-2 text-sm text-slate-700">
          Paste one account per line using this format: <code>email,first name,last name,company name</code>.
        </p>
      </div>

      <form className="panel space-y-4" onSubmit={onSubmit}>
        <div className="grid gap-4 md:grid-cols-3">
          <label className="text-sm font-semibold text-slate-800">
            Import Role
            <select
              className="mt-1 w-full rounded-lg border border-brandBorder bg-white px-3 py-2"
              onChange={(event) => setImportRole(event.target.value as ImportRole)}
              value={importRole}
            >
              <option value="student">Student</option>
              <option value="teacher">Teacher</option>
            </select>
          </label>

          {importRole === "student" ? (
            <label className="text-sm font-semibold text-slate-800">
              Default Section
              <select
                className="mt-1 w-full rounded-lg border border-brandBorder bg-white px-3 py-2"
                onChange={(event) => setDefaultSectionId(event.target.value)}
                value={defaultSectionId}
              >
                <option value="">No default section</option>
                {sections.map((section) => (
                  <option key={section.id} value={section.id}>
                    {section.name}
                  </option>
                ))}
              </select>
            </label>
          ) : (
            <div className="rounded-xl border border-brandBorder bg-brandOffWhite px-4 py-3 text-sm text-slate-700">
              Teacher company is fixed to <span className="font-bold">{HAND_AND_HEART}</span>.
            </div>
          )}

          <div className="rounded-xl border border-brandBorder bg-brandBlueLight px-4 py-3 text-sm text-slate-700">
            Parsed rows: <span className="font-bold text-brandBlue">{parsedRows.length}</span>
          </div>
          <label className="text-sm font-semibold text-slate-800">
            Email Batch Size
            <input
              className="mt-1 w-full rounded-lg border border-brandBorder bg-white px-3 py-2"
              max={100}
              min={1}
              onChange={(event) => setBatchSize(Number(event.target.value) || 25)}
              type="number"
              value={batchSize}
            />
          </label>
        </div>

        <label className="block text-sm font-semibold text-slate-800">
          Accounts
          <textarea
            className="mt-1 min-h-52 w-full rounded-xl border border-brandBorder bg-white px-3 py-3 text-sm text-slate-900 outline-none transition focus:border-brandBlue"
            onChange={(event) => setRawRows(event.target.value)}
            placeholder={"student1@school.edu,Juan,Dela Cruz,ABC Company\nstudent2@school.edu,Ana,Santos,ABC Company"}
            value={rawRows}
          />
        </label>

        <button
          className="rounded-lg bg-brandBlue px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
          disabled={submitting || parsedRows.length === 0}
          type="submit"
        >
          {submitting ? "Creating Accounts..." : "Create Accounts and Send Credentials"}
        </button>

        {error ? (
          <p className="rounded-lg border border-brandRed/35 bg-brandRedLight px-3 py-2 text-sm text-brandRed">
            {error}
          </p>
        ) : null}
        {message ? (
          <p className="rounded-lg border border-brandGreen/35 bg-brandGreenLight px-3 py-2 text-sm text-brandGreen">
            {message}
          </p>
        ) : null}
      </form>

      {result ? (
        <div className="panel">
          <p className="text-xs font-semibold uppercase tracking-[0.25em] text-brandGreen">Import Summary</p>
          <p className="mt-3 text-sm text-slate-700">
            Processed {result.processed_count} accounts. Sent {result.sent_count} emails and skipped{" "}
            {result.skipped_count}.
          </p>
          <div className="mt-4 overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-brandBorder text-left text-xs uppercase tracking-[0.2em] text-slate-500">
                  <th className="px-2 py-3">Email</th>
                  <th className="px-2 py-3">Username</th>
                  <th className="px-2 py-3">Temp Password</th>
                  <th className="px-2 py-3">Delivery</th>
                </tr>
              </thead>
              <tbody>
                {result.results.map((row) => (
                  <tr className="border-b border-brandBorder/70" key={row.email}>
                    <td className="px-2 py-3">{row.email}</td>
                    <td className="px-2 py-3 font-semibold">{row.username}</td>
                    <td className="px-2 py-3 font-mono text-xs">{row.temporary_password}</td>
                    <td className="px-2 py-3 capitalize">{row.delivery_status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      <div className="panel">
        <div className="grid gap-4 md:grid-cols-2">
          <label className="text-sm font-semibold text-slate-800">
            Account Role Filter
            <select
              className="mt-1 w-full rounded-lg border border-brandBorder bg-white px-3 py-2"
              onChange={(event) => setAccountRoleFilter(event.target.value as AccountRoleFilter)}
              value={accountRoleFilter}
            >
              <option value="all">All Accounts</option>
              <option value="student">Students</option>
              <option value="teacher">Teachers</option>
              <option value="admin">Admins</option>
            </select>
          </label>
          <label className="text-sm font-semibold text-slate-800">
            Search Account
            <input
              className="mt-1 w-full rounded-lg border border-brandBorder bg-white px-3 py-2"
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search username, name, email, or company"
              type="text"
              value={search}
            />
          </label>
        </div>
      </div>

      <div className="panel">
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs font-semibold uppercase tracking-[0.25em] label-accent">All Active Accounts</p>
          <span className="rounded-full border border-brandBorder bg-white px-3 py-1 text-xs font-semibold text-slate-700">
            {activeUsers.length} accounts
          </span>
        </div>
        <div className="mt-4 overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-brandBorder text-left text-xs uppercase tracking-[0.2em] text-slate-500">
                <th className="px-2 py-3">Username</th>
                <th className="px-2 py-3">Role</th>
                <th className="px-2 py-3">Email</th>
                <th className="px-2 py-3">First Name</th>
                <th className="px-2 py-3">Last Name</th>
                <th className="px-2 py-3">Company</th>
                <th className="px-2 py-3">Status</th>
                <th className="px-2 py-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {activeUsers.map((user) => (
                <tr className="border-b border-brandBorder/70" key={user.id}>
                  <td className="px-2 py-3 font-semibold">{user.username}</td>
                  <td className="px-2 py-3 capitalize">{user.role}</td>
                  <td className="px-2 py-3">{user.email ?? "-"}</td>
                  <td className="px-2 py-3">{user.first_name ?? "-"}</td>
                  <td className="px-2 py-3">{user.last_name ?? "-"}</td>
                  <td className="px-2 py-3">{resolveCompanyName(user)}</td>
                  <td className="px-2 py-3">
                    {user.must_change_password ? "Password change required" : "Active"}
                  </td>
                  <td className="px-2 py-3">
                    <div className="flex flex-wrap gap-2">
                      {user.role !== "admin" ? (
                        <button
                          className="rounded-lg border border-brandBorder bg-white px-3 py-2 text-xs font-semibold text-brandBlue transition hover:bg-brandBlueLight"
                          onClick={() => void resendCredentials(user.id).then(() => refreshUsers())}
                          type="button"
                        >
                          Reset & Resend
                        </button>
                      ) : null}
                      {user.role === "teacher" ? (
                        <button
                          className="rounded-lg border border-brandRed/35 bg-brandRedLight px-3 py-2 text-xs font-semibold text-brandRed transition hover:bg-brandRed/20"
                          onClick={() => void archiveTeacherAccount(user.id).then(() => refreshUsers())}
                          type="button"
                        >
                          Archive Teacher
                        </button>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))}
              {activeUsers.length === 0 ? (
                <tr>
                  <td className="px-2 py-4 text-sm text-slate-500" colSpan={8}>
                    No active accounts found for this filter.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>

      <div className="panel">
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs font-semibold uppercase tracking-[0.25em] label-accent">Archived Accounts</p>
          <span className="rounded-full border border-brandBorder bg-white px-3 py-1 text-xs font-semibold text-slate-700">
            {archivedUsers.length} archived
          </span>
        </div>
        <div className="mt-4 overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-brandBorder text-left text-xs uppercase tracking-[0.2em] text-slate-500">
                <th className="px-2 py-3">Username</th>
                <th className="px-2 py-3">Role</th>
                <th className="px-2 py-3">Email</th>
                <th className="px-2 py-3">Company</th>
                <th className="px-2 py-3">Archived At</th>
                <th className="px-2 py-3">Action</th>
              </tr>
            </thead>
            <tbody>
              {archivedUsers.map((user) => (
                <tr className="border-b border-brandBorder/70" key={user.id}>
                  <td className="px-2 py-3 font-semibold">{user.username}</td>
                  <td className="px-2 py-3 capitalize">{user.role}</td>
                  <td className="px-2 py-3">{user.email ?? "-"}</td>
                  <td className="px-2 py-3">{resolveCompanyName(user)}</td>
                  <td className="px-2 py-3">{user.archived_at ? new Date(user.archived_at).toLocaleString() : "-"}</td>
                  <td className="px-2 py-3">
                    {user.role !== "admin" ? (
                      <button
                        className="rounded-lg border border-brandGreen/35 bg-brandGreenLight px-3 py-2 text-xs font-semibold text-brandGreen transition hover:bg-brandGreen/20"
                        onClick={() => void reactivateUser(user.id).then(() => refreshUsers())}
                        type="button"
                      >
                        Unarchive Account
                      </button>
                    ) : (
                      <span className="text-xs text-slate-500">Not allowed</span>
                    )}
                  </td>
                </tr>
              ))}
              {archivedUsers.length === 0 ? (
                <tr>
                  <td className="px-2 py-4 text-sm text-slate-500" colSpan={6}>
                    No archived accounts found for this filter.
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
