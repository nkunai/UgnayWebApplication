"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { getTeacherDashboard, type TeacherSectionSummary } from "@/lib/api";

export default function TeacherDashboardPage() {
  const [sections, setSections] = useState<TeacherSectionSummary[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getTeacherDashboard().then(setSections).catch((requestError: Error) => setError(requestError.message));
  }, []);

  return (
    <section className="space-y-6">
      <div className="panel">
        <p className="text-xs font-semibold uppercase tracking-[0.3em] text-brandBlue">Teacher LMS</p>
        <h2 className="mt-3 text-3xl font-bold title-gradient">Assigned Sections</h2>
        <p className="mt-2 text-sm text-slate-700">
          Build modules, monitor students, and upload certificate templates for your sections.
        </p>
      </div>

      {error ? <p className="rounded-xl border border-brandRed/35 bg-brandRedLight px-4 py-3 text-sm text-brandRed">{error}</p> : null}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <div className="panel panel-lively">
          <p className="text-xs uppercase tracking-[0.22em] label-accent">Sections</p>
          <p className="mt-3 text-4xl font-black text-brandBlue">{sections.length}</p>
        </div>
        <div className="panel panel-lively">
          <p className="text-xs uppercase tracking-[0.22em] label-accent">Students</p>
          <p className="mt-3 text-4xl font-black text-brandGreen">
            {sections.reduce((total, section) => total + section.section.student_count, 0)}
          </p>
        </div>
        <div className="panel panel-lively">
          <p className="text-xs uppercase tracking-[0.22em] label-accent">Published Modules</p>
          <p className="mt-3 text-4xl font-black text-accentWarm">
            {sections.reduce((total, section) => total + section.published_module_count, 0)}
          </p>
        </div>
        <div className="panel panel-lively">
          <p className="text-xs uppercase tracking-[0.22em] label-accent">Draft Modules</p>
          <p className="mt-3 text-4xl font-black text-brandRed">
            {sections.reduce((total, section) => total + section.draft_module_count, 0)}
          </p>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        {sections.map((entry) => (
          <article className="panel panel-lively" key={entry.section.id}>
            <p className="text-xs uppercase tracking-[0.22em] text-slate-500">{entry.section.code}</p>
            <h3 className="mt-2 text-2xl font-bold text-slate-900">{entry.section.name}</h3>
            <p className="mt-2 text-sm text-slate-700">{entry.section.description || "No section description yet."}</p>
            <div className="mt-4 grid gap-3 md:grid-cols-3">
              <div className="rounded-xl bg-brandOffWhite px-3 py-3 text-sm text-slate-800">
                <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Students</p>
                <p className="mt-2 font-semibold">{entry.section.student_count}</p>
              </div>
              <div className="rounded-xl bg-brandOffWhite px-3 py-3 text-sm text-slate-800">
                <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Published</p>
                <p className="mt-2 font-semibold">{entry.published_module_count}</p>
              </div>
              <div className="rounded-xl bg-brandOffWhite px-3 py-3 text-sm text-slate-800">
                <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Certificate</p>
                <p className="mt-2 font-semibold capitalize">{entry.pending_certificate_status ?? "none"}</p>
              </div>
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              <Link className="rounded-lg bg-brandBlue px-4 py-2 text-sm font-semibold text-white" href={`/teacher/sections?section=${entry.section.id}`}>
                Open Section Builder
              </Link>
              <Link className="rounded-lg border border-brandBorder bg-white px-4 py-2 text-sm font-semibold text-brandBlue" href={`/teacher/reports?studentSection=${entry.section.id}`}>
                View Reports
              </Link>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
