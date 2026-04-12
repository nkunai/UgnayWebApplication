"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import {
  getModules,
  getStudentCertificateDownloadStatus,
  ModuleItem,
  StudentCertificateDownloadStatus,
} from "@/lib/api";
import {
  getCertificateProgressMessage,
  getCertificateStatusValue,
  getCertificateTemplateLabel,
  getCertificateTone,
  getHomeCertificateStatusLabel,
  getStudentCoreProgramMetrics,
} from "@/lib/student-certificate-ui";

function formatPercent(value: number | null | undefined, digits = 0) {
  if (value === null || value === undefined) {
    return "--";
  }
  return `${value.toFixed(digits)}%`;
}

function progressTone(percent: number) {
  if (percent >= 100) {
    return "bg-brandGreen";
  }
  if (percent > 0) {
    return "bg-brandYellow";
  }
  return "bg-brandRed";
}

export function StudentHome() {
  const [modules, setModules] = useState<ModuleItem[]>([]);
  const [certificate, setCertificate] = useState<StudentCertificateDownloadStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    async function loadData() {
      setLoading(true);
      setError(null);

      const [modulesResult, certificateResult] = await Promise.allSettled([
        getModules(),
        getStudentCertificateDownloadStatus(),
      ]);

      const errors: string[] = [];

      if (modulesResult.status === "fulfilled") {
        setModules(modulesResult.value);
      } else {
        errors.push(
          modulesResult.reason instanceof Error
            ? modulesResult.reason.message
            : "Unable to load student modules."
        );
      }

      if (certificateResult.status === "fulfilled") {
        setCertificate(certificateResult.value);
      } else {
        errors.push(
          certificateResult.reason instanceof Error
            ? certificateResult.reason.message
            : "Unable to load certificate progress."
        );
      }

      setError(errors.length ? errors.join(" ") : null);
      setLoading(false);
    }

    void loadData();
  }, []);

  const { programTarget, liveCoreSessions, completedCoreSessions, averageBestScore } =
    getStudentCoreProgramMetrics(modules);

  const nextCoreModule = useMemo(
    () =>
      modules.find(
        (module) => module.module_kind === "system" && module.progress_percent < 100
      ) ??
      modules.find((module) => module.module_kind === "system") ??
      modules[0] ??
      null,
    [modules]
  );

  const recentModules = useMemo(() => modules.slice(0, 3), [modules]);

  return (
    <section className="space-y-6">
      <div className="panel panel-lively">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="max-w-3xl">
            <p className="text-xs font-semibold uppercase tracking-[0.35em] text-brandBlue">
              Student Dashboard
            </p>
            <h2 className="mt-3 text-3xl font-black tracking-tight text-slate-900 md:text-4xl">
              Stay on pace with the 12-week FSL program.
            </h2>
            <p className="mt-3 text-sm leading-relaxed text-slate-700">
              Plan for one session each week, with up to 2 hours for lessons, practice, and
              assessment. Certificates are issued only after you finish the 12 required sessions,
              keep a passing average, and receive teacher approval.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <Link
              className="rounded-lg bg-brandBlue px-4 py-2 text-xs font-semibold text-white transition hover:bg-brandBlue/90"
              href="/modules"
            >
              Open Modules
            </Link>
            <Link
              className="rounded-lg bg-brandYellow px-4 py-2 text-xs font-semibold text-brandNavy transition hover:bg-brandYellow/90"
              href="/gesture-tester"
            >
              Open Gesture Tester
            </Link>
            {nextCoreModule ? (
              <Link
                className="rounded-lg border border-brandBorder bg-white px-4 py-2 text-xs font-semibold text-slate-900 transition hover:bg-brandBlueLight"
                href={`/modules/${nextCoreModule.id}`}
              >
                Continue Next Session
              </Link>
            ) : null}
          </div>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <div className="panel">
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-accentWarm">
            Program Target
          </p>
          <p className="teacher-panel-value mt-3 text-4xl font-black">{programTarget}</p>
          <p className="teacher-panel-copy mt-2 text-sm">Required weekly sessions for certificate review.</p>
        </div>
        <div className="panel">
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-brandBlue">
            Live Core Sessions
          </p>
          <p className="teacher-panel-value mt-3 text-4xl font-black">{liveCoreSessions}</p>
          <p className="teacher-panel-copy mt-2 text-sm">Core sessions currently available to take.</p>
        </div>
        <div className="panel">
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-brandGreen">
            Completed
          </p>
          <p className="teacher-panel-value mt-3 text-4xl font-black">{completedCoreSessions}</p>
          <p className="teacher-panel-copy mt-2 text-sm">Required sessions already finished and saved.</p>
        </div>
        <div className="panel">
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-accent">
            Average Best
          </p>
          <p className="teacher-panel-value mt-3 text-4xl font-black">
            {formatPercent(averageBestScore)}
          </p>
          <p className="teacher-panel-copy mt-2 text-sm">Certificate passing average stays at 65%.</p>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.1fr,0.9fr]">
        <div className="panel space-y-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.35em] text-brandBlue">
                Certificate Progress
              </p>
              <h3 className="teacher-panel-heading mt-2 text-2xl font-black">
                Completion and certificate availability
              </h3>
            </div>
            <span
              className={`inline-flex rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] ${getCertificateTone(
                certificate
              )}`}
            >
              {getHomeCertificateStatusLabel(certificate)}
            </span>
          </div>

          <div className="rounded-[24px] border border-black/10 bg-black/5 px-4 py-4">
            <p className="text-sm leading-relaxed text-slate-700">
              {getCertificateProgressMessage(certificate)}
            </p>
          </div>
        </div>

        <div className="panel space-y-4">
          <p className="text-xs font-semibold uppercase tracking-[0.35em] text-accentWarm">
            Session Guide
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-2xl border border-black/10 bg-black/5 px-4 py-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500">
                Weekly Plan
              </p>
              <p className="mt-2 text-sm font-semibold text-slate-900">1 module session each week</p>
            </div>
            <div className="rounded-2xl border border-black/10 bg-black/5 px-4 py-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500">
                Time Guide
              </p>
              <p className="mt-2 text-sm font-semibold text-slate-900">Up to 2 hours per session</p>
            </div>
            <div className="rounded-2xl border border-black/10 bg-black/5 px-4 py-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500">
                Certificate Status
              </p>
              <p className="mt-2 text-sm font-semibold text-slate-900">
                {getCertificateStatusValue(certificate)}
              </p>
            </div>
            <div className="rounded-2xl border border-black/10 bg-black/5 px-4 py-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500">
                Certificate Template
              </p>
              <p className="mt-2 text-sm font-semibold text-slate-900">
                {getCertificateTemplateLabel(certificate)}
              </p>
            </div>
          </div>
        </div>
      </div>

      {loading ? <p className="text-sm text-muted">Loading dashboard progress...</p> : null}

      <div className="grid gap-4 md:grid-cols-3">
        {recentModules.map((module) => (
          <Link className="block h-full" href={`/modules/${module.id}`} key={module.id}>
            <article className="panel panel-lively flex h-full flex-col">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
                {module.module_kind === "system" ? `Session ${module.order_index}` : "Teacher Module"}
              </p>
              <h3 className="mt-2 text-2xl font-black text-slate-900">
                {module.title.replace(/^Module \d+:\s*/i, "")}
              </h3>
              <p className="mt-2 text-sm text-slate-600">
                {module.module_kind === "system"
                  ? "Core session progress saved for teacher review."
                  : "Teacher-published practice module."}
              </p>
              <div className="mt-auto pt-4">
                <div className="h-2 overflow-hidden rounded-full bg-white/80">
                  <div
                    className={`h-full rounded-full transition-[width] duration-500 ${progressTone(module.progress_percent)}`}
                    style={{ width: `${Math.max(module.progress_percent, 6)}%` }}
                  />
                </div>
                <div className="mt-3 flex items-center justify-between gap-3 text-sm">
                  <p className="font-semibold text-slate-900">Progress {module.progress_percent}%</p>
                  <p className="text-slate-600">{formatPercent(module.assessment_score)}</p>
                </div>
              </div>
            </article>
          </Link>
        ))}
      </div>

      {error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3">
          <p className="text-sm text-red-700">Error: {error}</p>
        </div>
      ) : null}
    </section>
  );
}
