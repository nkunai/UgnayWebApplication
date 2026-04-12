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
  getCatalogCertificateStatusLabel,
  getCertificateProgressMessage,
  getCertificateStatusValue,
  getCertificateTemplateLabel,
  getCertificateTone,
  getStudentCoreProgramMetrics,
} from "@/lib/student-certificate-ui";

const CARD_THEMES = [
  {
    shellBg: "linear-gradient(145deg, #FFF8D6 0%, #fffdf1 100%)",
    overlayBg:
      "radial-gradient(circle at 92% 8%, rgba(212,168,0,0.13), transparent 40%), radial-gradient(circle at 0% 100%, rgba(46,68,168,0.06), transparent 44%)",
    mediaBg: "linear-gradient(145deg, #fff4bb 0%, #fffdf2 100%)",
    borderColor: "#E2E2EA",
    chipClass: "border-brandYellow/35 bg-brandYellow/15 text-[#8d6f00]",
  },
  {
    shellBg: "linear-gradient(145deg, #E8ECF8 0%, #f8f9fd 100%)",
    overlayBg:
      "radial-gradient(circle at 92% 8%, rgba(46,68,168,0.14), transparent 40%), radial-gradient(circle at 0% 100%, rgba(42,140,63,0.06), transparent 42%)",
    mediaBg: "linear-gradient(145deg, #dfe5f9 0%, #f6f8fe 100%)",
    borderColor: "#E2E2EA",
    chipClass: "border-brandBlue/30 bg-brandBlue/12 text-brandBlue",
  },
  {
    shellBg: "linear-gradient(145deg, #FDE8E8 0%, #fff8f8 100%)",
    overlayBg:
      "radial-gradient(circle at 92% 8%, rgba(204,40,40,0.13), transparent 40%), radial-gradient(circle at 0% 100%, rgba(212,168,0,0.06), transparent 42%)",
    mediaBg: "linear-gradient(145deg, #f9d9d9 0%, #fff5f5 100%)",
    borderColor: "#E2E2EA",
    chipClass: "border-brandRed/30 bg-brandRed/12 text-brandRed",
  },
  {
    shellBg: "linear-gradient(145deg, #E8F5EB 0%, #f8fcf9 100%)",
    overlayBg:
      "radial-gradient(circle at 92% 8%, rgba(42,140,63,0.13), transparent 40%), radial-gradient(circle at 0% 100%, rgba(46,68,168,0.06), transparent 42%)",
    mediaBg: "linear-gradient(145deg, #dff1e4 0%, #f7fcf8 100%)",
    borderColor: "#E2E2EA",
    chipClass: "border-brandGreen/30 bg-brandGreen/12 text-brandGreen",
  },
] as const;

const MODULE_CARD_MEDIA_BY_ORDER: Record<
  number,
  {
    type: "image" | "text";
    value: string;
    textClass?: string;
  }
> = {
  1: { type: "image", value: "/module-assets/cards/module-1.png" },
  2: { type: "text", value: "Numbers", textClass: "text-brandBlue" },
  3: { type: "text", value: "Hello", textClass: "text-brandRed" },
  4: { type: "image", value: "/module-assets/cards/module-4.jpg" },
  5: { type: "image", value: "/module-assets/cards/module-5.jpg" },
  6: { type: "image", value: "/module-assets/cards/module-6.jpg" },
  7: { type: "image", value: "/module-assets/cards/module-7.png" },
  8: { type: "image", value: "/module-assets/cards/module-8.png" },
};

function cardTheme(module: ModuleItem) {
  return CARD_THEMES[(module.order_index - 1) % CARD_THEMES.length];
}

function formatPercent(value: number | null | undefined, digits = 0) {
  if (value === null || value === undefined) {
    return "No score yet";
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

type StudentModulesCatalogProps = {
  detailHrefBase?: string;
};

export function StudentModulesCatalog({
  detailHrefBase = "/modules",
}: StudentModulesCatalogProps) {
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

  return (
    <section className="space-y-6">
      <div className="panel panel-lively overflow-hidden">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="max-w-3xl">
            <p className="text-xs font-semibold uppercase tracking-[0.35em] text-brandBlue">
              Student Modules
            </p>
            <h2 className="mt-3 text-3xl font-black tracking-tight text-slate-900 md:text-4xl">
              Follow the 12-week FSL program one session at a time.
            </h2>
            <p className="mt-3 text-sm leading-relaxed text-slate-700">
              Each core session is planned as a weekly module and may take up to 2 hours. Your
              teacher can review your saved scores and progress, but certificate issuance only
              happens after the full 12-session program is completed, passed, and teacher-approved.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <Link
              className="rounded-lg bg-brandBlue px-4 py-2 text-xs font-semibold text-white transition hover:bg-brandBlue/90"
              href="/dashboard"
            >
              Open Dashboard
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
                href={`${detailHrefBase}/${nextCoreModule.id}`}
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
          <p className="teacher-panel-copy mt-2 text-sm">Core weekly sessions required for certificate review.</p>
        </div>
        <div className="panel">
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-brandBlue">
            Live Now
          </p>
          <p className="teacher-panel-value mt-3 text-4xl font-black">{liveCoreSessions}</p>
          <p className="teacher-panel-copy mt-2 text-sm">Core sessions currently available for students to take.</p>
        </div>
        <div className="panel">
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-brandGreen">
            Completed
          </p>
          <p className="teacher-panel-value mt-3 text-4xl font-black">{completedCoreSessions}</p>
          <p className="teacher-panel-copy mt-2 text-sm">Core sessions you already finished and saved.</p>
        </div>
        <div className="panel">
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-accent">
            Average Best
          </p>
          <p className="teacher-panel-value mt-3 text-4xl font-black">
            {averageBestScore === null ? "--" : formatPercent(averageBestScore)}
          </p>
          <p className="teacher-panel-copy mt-2 text-sm">Certificate passing average stays at 65%.</p>
        </div>
      </div>

      <div className="panel space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.35em] text-brandBlue">
              Certificate Progress
            </p>
            <h3 className="teacher-panel-heading mt-2 text-2xl font-black">
              Progress and certificate availability
            </h3>
            <p className="teacher-panel-copy mt-2 text-sm">
              Teacher-published extra modules may appear below for practice, but certificate review
              is based on the 12 core weekly sessions.
            </p>
          </div>

          <span
            className={`inline-flex rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] ${getCertificateTone(
              certificate
            )}`}
          >
            {getCatalogCertificateStatusLabel(certificate)}
          </span>
        </div>

        <div className="grid gap-4 lg:grid-cols-[1.15fr,0.85fr]">
          <div className="rounded-[24px] border border-black/10 bg-black/5 px-4 py-4">
            <p className="text-sm leading-relaxed text-slate-700">
              {getCertificateProgressMessage(certificate)}
            </p>
          </div>

          <div className="rounded-[24px] border border-black/10 bg-black/5 px-4 py-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-2xl border border-black/10 bg-white px-4 py-3">
                <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500">
                  Weekly Plan
                </p>
                <p className="mt-2 text-sm font-semibold text-slate-900">1 session per week</p>
              </div>
              <div className="rounded-2xl border border-black/10 bg-white px-4 py-3">
                <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500">
                  Session Time
                </p>
                <p className="mt-2 text-sm font-semibold text-slate-900">Up to 2 hours</p>
              </div>
              <div className="rounded-2xl border border-black/10 bg-white px-4 py-3">
                <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500">
                  Certificate Status
                </p>
                <p className="mt-2 text-sm font-semibold text-slate-900">
                  {getCertificateStatusValue(certificate)}
                </p>
              </div>
              <div className="rounded-2xl border border-black/10 bg-white px-4 py-3">
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
      </div>

      {loading ? <p className="text-sm text-muted">Loading student modules...</p> : null}

      <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
        {modules.map((module) => {
          const theme = cardTheme(module);
          const cleanedTitle = module.title.replace(/^Module \d+:\s*/i, "");
          const cardMedia =
            MODULE_CARD_MEDIA_BY_ORDER[module.order_index] ?? {
              type: "text" as const,
              value: `M${module.order_index}`,
              textClass: "text-brandBlue",
            };
          const moduleKindLabel =
            module.module_kind === "system" ? `Session ${module.order_index} of ${programTarget}` : "Teacher Module";
          const moduleMeta =
            module.module_kind === "system"
              ? "Core weekly session"
              : module.owner_teacher?.full_name
                ? `Published by ${module.owner_teacher.full_name}`
                : "Teacher-published session";

          return (
            <Link
              className="block h-full focus-visible:outline-none"
              key={module.id}
              href={`${detailHrefBase}/${module.id}`}
            >
              <article
                className="module-card-live relative flex h-full min-h-[340px] flex-col overflow-hidden rounded-[28px] border-2 p-4 shadow-soft transition duration-300 hover:-translate-y-1.5 hover:shadow-xl"
                style={{ background: theme.shellBg, borderColor: theme.borderColor }}
              >
                <div
                  aria-hidden
                  className="pointer-events-none absolute inset-0 opacity-85"
                  style={{ background: theme.overlayBg }}
                />

                <div
                  className="relative h-52 rounded-[22px] border-2 shadow-inner"
                  style={{ background: theme.mediaBg, borderColor: "rgba(255,255,255,0.75)" }}
                >
                  {cardMedia.type === "image" ? (
                    <img
                      alt={`Module ${module.order_index} preview`}
                      className="h-full w-full rounded-[20px] bg-white object-contain object-center p-2"
                      loading="lazy"
                      src={cardMedia.value}
                    />
                  ) : (
                    <div
                      className={`flex h-full items-center justify-center px-4 text-center text-6xl font-black tracking-tight ${cardMedia.textClass ?? "text-brandBlue"}`}
                    >
                      {cardMedia.value}
                    </div>
                  )}
                </div>

                <div className="relative mt-4 flex items-center justify-between gap-2">
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-700">
                    {moduleKindLabel}
                  </p>
                  <span
                    className={`rounded-full border px-2 py-1 text-[10px] font-bold uppercase tracking-wide ${theme.chipClass}`}
                  >
                    {module.progress_percent >= 100 ? "Completed" : module.progress_percent > 0 ? "In Progress" : "Start"}
                  </span>
                </div>

                <h3 className="relative mt-3 text-3xl font-black leading-tight text-slate-900">
                  Module {module.order_index}: {cleanedTitle}
                </h3>

                <p className="relative mt-2 text-sm leading-relaxed text-slate-700">
                  {module.description}
                </p>

                <div className="relative mt-auto pt-4">
                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs font-semibold uppercase tracking-[0.2em] text-slate-700">
                    <span>{moduleMeta}</span>
                    <span>Up to 2 hrs</span>
                  </div>

                  <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/80">
                    <div
                      className={`h-full rounded-full transition-[width] duration-500 ${progressTone(module.progress_percent)}`}
                      style={{ width: `${Math.max(module.progress_percent, 6)}%` }}
                    />
                  </div>

                  <div className="mt-3 flex items-center justify-between gap-3 text-sm">
                    <p className="font-semibold text-slate-900">
                      Progress {module.progress_percent}%
                    </p>
                    <p className="text-slate-700">{formatPercent(module.assessment_score)}</p>
                  </div>
                </div>
              </article>
            </Link>
          );
        })}
      </div>

      {error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3">
          <p className="text-sm text-red-700">Error: {error}</p>
        </div>
      ) : null}
    </section>
  );
}
