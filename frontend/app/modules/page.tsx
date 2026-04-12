"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { getStudentCourse, type StudentCourse } from "@/lib/api";

export default function StudentModulesPage() {
  const [course, setCourse] = useState<StudentCourse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getStudentCourse().then(setCourse).catch((requestError: Error) => setError(requestError.message));
  }, []);

  return (
    <section className="space-y-6">
      <div className="panel">
        <p className="text-xs font-semibold uppercase tracking-[0.3em] text-brandBlue">Student LMS</p>
        <h2 className="mt-3 text-3xl font-bold title-gradient">Modules</h2>
      </div>

      {error ? <p className="rounded-xl border border-brandRed/35 bg-brandRedLight px-4 py-3 text-sm text-brandRed">{error}</p> : null}

      <div className="grid gap-4 lg:grid-cols-2">
        {(course?.modules ?? []).map((module) => (
          <article className="panel panel-lively" key={module.id}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs uppercase tracking-[0.22em] text-slate-500">Module {module.order_index}</p>
                <h3 className="mt-2 text-xl font-bold text-slate-900">{module.title}</h3>
                <p className="mt-2 text-sm text-slate-700">{module.description}</p>
              </div>
              <span className={`rounded-full px-3 py-1 text-xs font-semibold ${module.is_locked ? "bg-brandRedLight text-brandRed" : "bg-brandBlueLight text-brandBlue"}`}>
                {module.is_locked ? "Locked" : module.status.replaceAll("_", " ")}
              </span>
            </div>
            <div className="mt-4 rounded-full bg-brandMutedSurface">
              <div className="h-3 rounded-full bg-brandBlue" style={{ width: `${module.progress_percent}%` }} />
            </div>
            <div className="mt-4 flex justify-end">
              <Link className={`rounded-lg px-4 py-2 text-sm font-semibold ${module.is_locked ? "pointer-events-none bg-brandMutedSurface text-slate-500" : "bg-brandBlue text-white"}`} href={module.is_locked ? "#" : `/modules/${module.id}`}>
                Continue
              </Link>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
