"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import {
  TeacherActivityAttempt,
  TeacherStudent,
  getTeacherStudent,
  getTeacherStudentActivityAttempts,
} from "@/lib/api";
import { TeacherStudentReviewPanels } from "@/components/teacher/student-review-panels";

function formatDateTime(value: string | null | undefined) {
  if (!value) return "No activity yet";
  try {
    return new Intl.DateTimeFormat("en-PH", { dateStyle: "medium", timeStyle: "short" }).format(
      new Date(value)
    );
  } catch {
    return value;
  }
}

function formatPercent(value: number | null | undefined, digits = 1) {
  if (value === null || value === undefined) return "No data";
  return `${value.toFixed(digits)}%`;
}

export default function TeacherStudentDetailPage() {
  const params = useParams<{ studentId: string }>();
  const studentId = Number(params.studentId);

  const [student, setStudent] = useState<TeacherStudent | null>(null);
  const [attempts, setAttempts] = useState<TeacherActivityAttempt[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (Number.isNaN(studentId)) {
      setError("Invalid student id.");
      return;
    }

    setLoading(true);
    setError(null);
    Promise.all([getTeacherStudent(studentId), getTeacherStudentActivityAttempts(studentId)])
      .then(([studentResponse, attemptsResponse]) => {
        setStudent(studentResponse);
        setAttempts(attemptsResponse);
      })
      .catch((requestError: Error) => setError(requestError.message))
      .finally(() => setLoading(false));
  }, [studentId]);

  const attemptSummary = useMemo(() => {
    if (!attempts.length) {
      return { average: 0, latestAt: null as string | null, modulesTouched: 0 };
    }

    const modulesTouched = new Set(attempts.map((attempt) => attempt.module_id)).size;
    return {
      average: attempts.reduce((total, attempt) => total + attempt.score_percent, 0) / attempts.length,
      latestAt: attempts[0]?.submitted_at ?? null,
      modulesTouched,
    };
  }, [attempts]);

  return (
    <section className="space-y-6">
      <div className="panel teacher-sticky-panel overflow-hidden">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-3xl">
            <p className="text-xs font-semibold uppercase tracking-[0.35em] text-accentWarm">
              Student Detail
            </p>
            <h2 className="teacher-panel-heading mt-3 text-4xl font-black tracking-tight">
              {student?.full_name ?? "Student profile"}
            </h2>
            <p className="teacher-panel-copy mt-3 text-sm leading-relaxed">
              Review student information, batch placement, module progress, and item-by-item
              answers from saved activity attempts.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <Link
              className="teacher-card-ghost-button rounded-full border px-4 py-2 text-xs font-semibold transition hover:bg-white/10"
              href="/teacher/classes"
            >
              Back to Enrollments
            </Link>
            <Link
              className="rounded-full bg-brandBlue px-4 py-2 text-xs font-semibold text-white"
              href="/teacher/progress"
            >
              Back to Progress
            </Link>
          </div>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <div className="panel">
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-accent">Batch</p>
          <p className="teacher-panel-value mt-3 text-2xl font-black">
            {student?.batch?.name ?? "Unassigned"}
          </p>
        </div>
        <div className="panel">
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-brandBlue">Attempts</p>
          <p className="teacher-panel-value mt-3 text-4xl font-black">{attempts.length}</p>
        </div>
        <div className="panel">
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-brandGreen">Average</p>
          <p className="teacher-panel-value mt-3 text-4xl font-black">
            {formatPercent(attemptSummary.average, 2)}
          </p>
        </div>
        <div className="panel">
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-accentWarm">Latest</p>
          <p className="teacher-panel-value mt-3 text-sm font-black">
            {formatDateTime(attemptSummary.latestAt)}
          </p>
        </div>
      </div>

      {loading ? (
        <div className="panel">
          <p className="teacher-panel-copy text-sm">Loading student detail...</p>
        </div>
      ) : null}

      <TeacherStudentReviewPanels
        activityPanelClassName="panel"
        attempts={attempts}
        containerClassName="grid gap-4 xl:grid-cols-[0.88fr,1.12fr]"
        leadingContent={
          <div className="panel">
            <p className="text-xs font-semibold uppercase tracking-[0.35em] text-brandGreen">
              Student Information
            </p>
            <div className="teacher-card-copy mt-4 space-y-3 text-sm">
              <p><span className="teacher-card-title font-semibold">Username:</span> {student?.username ?? "Not set"}</p>
              <p><span className="teacher-card-title font-semibold">Email:</span> {student?.email ?? "Not provided"}</p>
              <p><span className="teacher-card-title font-semibold">Phone:</span> {student?.phone_number ?? "Not provided"}</p>
              <p><span className="teacher-card-title font-semibold">Birth date:</span> {student?.birth_date ?? "Not provided"}</p>
              <p><span className="teacher-card-title font-semibold">Address:</span> {student?.address ?? "Not provided"}</p>
              <p><span className="teacher-card-title font-semibold">Enrollment status:</span> {student?.enrollment_status ?? "Not set"}</p>
            </div>
          </div>
        }
        leftColumnClassName="space-y-4"
        modulePanelClassName="panel"
        student={student}
      />

      {error ? (
        <div className="panel">
          <p className="text-sm text-red-700">Error: {error}</p>
        </div>
      ) : null}
    </section>
  );
}
