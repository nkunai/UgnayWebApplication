"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { getStudentDashboard, type StudentCourse } from "@/lib/api";

export default function StudentDashboardPage() {
  const [course, setCourse] = useState<StudentCourse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getStudentDashboard().then(setCourse).catch((requestError: Error) => setError(requestError.message));
  }, []);

  const completedModules = useMemo(
    () => (course?.modules ?? []).filter((module) => module.status === "completed").length,
    [course]
  );

  return (
    <section className="space-y-6">
      <div className="panel">
        <p className="text-xs font-semibold uppercase tracking-[0.3em] text-brandBlue">Student LMS</p>
        <h2 className="mt-3 text-3xl font-bold title-gradient">Learning Dashboard</h2>
        <p className="mt-2 text-sm text-slate-700">
          Follow the module order. Finish each reading or assessment before moving to the next item.
        </p>
      </div>

      {error ? <p className="rounded-xl border border-brandRed/35 bg-brandRedLight px-4 py-3 text-sm text-brandRed">{error}</p> : null}

      <div className="grid gap-4 md:grid-cols-3">
        <div className="panel panel-lively">
          <p className="text-xs uppercase tracking-[0.22em] label-accent">Section</p>
          <p className="mt-3 text-2xl font-black text-brandBlue">{course?.section?.name ?? "Not assigned"}</p>
        </div>
        <div className="panel panel-lively">
          <p className="text-xs uppercase tracking-[0.22em] label-accent">Completed Modules</p>
          <p className="mt-3 text-4xl font-black text-brandGreen">{completedModules}</p>
        </div>
        <div className="panel panel-lively">
          <p className="text-xs uppercase tracking-[0.22em] label-accent">Total Modules</p>
          <p className="mt-3 text-4xl font-black text-accentWarm">{course?.modules.length ?? 0}</p>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        {(course?.modules ?? []).map((module) => (
          <article className="panel panel-lively" key={module.id}>
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs uppercase tracking-[0.22em] text-slate-500">Module {module.order_index}</p>
                <h3 className="mt-2 text-xl font-bold text-slate-900">{module.title}</h3>
                <p className="mt-2 text-sm text-slate-700">{module.description}</p>
              </div>
              <span className={`rounded-full px-3 py-1 text-xs font-semibold ${module.is_locked ? "bg-brandRedLight text-brandRed" : "bg-brandGreenLight text-brandGreen"}`}>
                {module.is_locked ? "Locked" : module.status.replaceAll("_", " ")}
              </span>
            </div>
            <div className="mt-4 rounded-full bg-brandMutedSurface">
              <div className="h-3 rounded-full bg-brandBlue transition-all" style={{ width: `${module.progress_percent}%` }} />
            </div>
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <p className="text-sm text-slate-700">{module.progress_percent}% complete</p>
              <Link className={`ml-auto rounded-lg px-4 py-2 text-sm font-semibold ${module.is_locked ? "cursor-not-allowed bg-brandMutedSurface text-slate-500" : "bg-brandBlue text-white"}`} href={module.is_locked ? "#" : `/modules/${module.id}`}>
                Open Module
              </Link>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
