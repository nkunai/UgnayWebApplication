"use client";

import { ReactNode, useEffect, useMemo, useState } from "react";

import { TeacherActivityAttempt, TeacherStudent, TeacherStudentModuleProgress } from "@/lib/api";

type TeacherStudentReviewPanelsProps = {
  student: TeacherStudent | null;
  attempts: TeacherActivityAttempt[];
  activityTitle?: string;
  containerClassName: string;
  leftColumnClassName?: string;
  modulePanelClassName: string;
  activityPanelClassName: string;
  leadingContent?: ReactNode;
};

type ActivityAttemptGroup = {
  key: string;
  attempts: TeacherActivityAttempt[];
  latestAttempt: TeacherActivityAttempt;
};

function joinClasses(...values: Array<string | undefined>) {
  return values.filter(Boolean).join(" ");
}

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

function getActivityGroupKey(attempt: TeacherActivityAttempt) {
  if (attempt.activity_id) {
    return `activity:${attempt.activity_id}`;
  }
  return `activity-key:${attempt.activity_key}`;
}

function getActivityCountLabel(count: number) {
  if (count === 0) {
    return "No saved activities";
  }
  return `${count} ${count === 1 ? "activity" : "activities"}`;
}

function getSubmissionCountLabel(count: number) {
  return `${count} ${count === 1 ? "submission" : "submissions"}`;
}

function getDefaultSelectedModuleId(
  moduleProgress: TeacherStudentModuleProgress[],
  groupsByModule: Map<number, ActivityAttemptGroup[]>
) {
  const firstWithAttempts = moduleProgress.find(
    (item) => (groupsByModule.get(item.module_id)?.length ?? 0) > 0
  );
  return firstWithAttempts?.module_id ?? moduleProgress[0]?.module_id ?? null;
}

function AttemptItems({
  attempt,
  compact = false,
}: {
  attempt: TeacherActivityAttempt;
  compact?: boolean;
}) {
  const blockClassName = compact
    ? "rounded-xl border border-white/10 bg-black/20 p-3"
    : "rounded-2xl border border-white/10 bg-black/25 p-4";

  return (
    <>
      {attempt.improvement_areas.length ? (
        <div className={joinClasses("mt-4 border border-white/10 bg-black/25 p-4", compact ? "rounded-xl" : "rounded-2xl")}>
          <p className="text-xs font-semibold uppercase tracking-[0.25em] text-brandBlue">
            Improvement Areas
          </p>
          <p className="teacher-card-copy mt-2 text-sm">{attempt.improvement_areas.join(", ")}</p>
        </div>
      ) : null}

      <div className="mt-4 space-y-3">
        {attempt.items.map((item) => (
          <div key={item.id} className={blockClassName}>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <p className="teacher-card-title text-sm font-semibold">{item.prompt ?? item.item_key}</p>
              <span className="rounded-full border border-white/15 bg-black/20 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-900">
                {item.is_correct === true
                  ? "Correct"
                  : item.is_correct === false
                    ? "Needs review"
                    : "Ungraded"}
              </span>
            </div>
            <p className="teacher-card-copy mt-3 text-sm">
              Expected: {item.expected_answer ?? "Not provided"}
            </p>
            <p className="teacher-card-copy mt-1 text-sm">
              Student answer: {item.student_answer ?? "No answer"}
            </p>
            <p className="teacher-card-meta mt-2 text-xs">
              Confidence{" "}
              {item.confidence !== null
                ? `${(item.confidence * 100).toFixed(1)}%`
                : "Not captured"}
            </p>
          </div>
        ))}
      </div>
    </>
  );
}

function AttemptHistoryCard({
  attempt,
  index,
}: {
  attempt: TeacherActivityAttempt;
  index: number;
}) {
  return (
    <details className="rounded-xl border border-white/10 bg-black/20 p-4">
      <summary className="cursor-pointer list-none">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="teacher-card-title text-sm font-black">Previous Submission {index + 1}</p>
            <p className="teacher-card-meta mt-1 text-xs">
              Submitted {formatDateTime(attempt.submitted_at)}
            </p>
          </div>
          <div className="text-right">
            <p className="teacher-card-title text-sm font-black">
              {formatPercent(attempt.score_percent, 2)}
            </p>
            <p className="teacher-card-meta mt-1 text-xs">
              {attempt.right_count}/{attempt.total_items} correct
            </p>
          </div>
        </div>
      </summary>

      <AttemptItems attempt={attempt} compact />
    </details>
  );
}

export function TeacherStudentReviewPanels({
  student,
  attempts,
  activityTitle = "Activity Answers",
  containerClassName,
  leftColumnClassName,
  modulePanelClassName,
  activityPanelClassName,
  leadingContent,
}: TeacherStudentReviewPanelsProps) {
  const moduleProgress = student?.module_progress ?? [];

  const groupsByModule = useMemo(() => {
    const progressIds = new Set(moduleProgress.map((item) => item.module_id));
    const groups = new Map<number, Map<string, TeacherActivityAttempt[]>>();

    for (const attempt of attempts) {
      if (!progressIds.has(attempt.module_id)) {
        continue;
      }

      const moduleGroups = groups.get(attempt.module_id) ?? new Map<string, TeacherActivityAttempt[]>();
      const groupKey = getActivityGroupKey(attempt);
      const current = moduleGroups.get(groupKey) ?? [];
      current.push(attempt);
      moduleGroups.set(groupKey, current);
      groups.set(attempt.module_id, moduleGroups);
    }

    return new Map<number, ActivityAttemptGroup[]>(
      [...groups.entries()].map(([moduleId, moduleGroups]) => [
        moduleId,
        [...moduleGroups.entries()]
          .map(([key, groupedAttempts]) => ({
            key,
            attempts: groupedAttempts,
            latestAttempt: groupedAttempts[0],
          }))
          .sort((left, right) => {
            const leftTime = new Date(left.latestAttempt.submitted_at).getTime();
            const rightTime = new Date(right.latestAttempt.submitted_at).getTime();
            if (rightTime !== leftTime) {
              return rightTime - leftTime;
            }
            return right.latestAttempt.id - left.latestAttempt.id;
          }),
      ])
    );
  }, [attempts, moduleProgress]);

  const [selectedModuleId, setSelectedModuleId] = useState<number | null>(() =>
    getDefaultSelectedModuleId(moduleProgress, groupsByModule)
  );

  useEffect(() => {
    if (!moduleProgress.length) {
      setSelectedModuleId(null);
      return;
    }

    const nextDefault = getDefaultSelectedModuleId(moduleProgress, groupsByModule);
    setSelectedModuleId((current) => {
      if (current !== null && moduleProgress.some((item) => item.module_id === current)) {
        return current;
      }
      return nextDefault;
    });
  }, [groupsByModule, moduleProgress]);

  const selectedModule =
    moduleProgress.find((item) => item.module_id === selectedModuleId) ?? null;
  const selectedModuleGroups =
    selectedModuleId === null ? [] : groupsByModule.get(selectedModuleId) ?? [];

  return (
    <div className={containerClassName}>
      <div className={joinClasses(leftColumnClassName)}>
        {leadingContent}

        <div className={modulePanelClassName}>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.35em] text-brandBlue">
                Module Progress
              </p>
              <p className="teacher-card-meta mt-2 text-xs">
                Toggle a module card to focus the related activities and assessments.
              </p>
            </div>
            {moduleProgress.length ? (
              <p className="teacher-card-meta text-xs">
                {moduleProgress.length} module(s) with saved progress
              </p>
            ) : null}
          </div>

          <div className="mt-4 space-y-3">
            {moduleProgress.length ? (
              moduleProgress.map((item) => {
                const isSelected = item.module_id === selectedModuleId;
                const moduleActivityCount = groupsByModule.get(item.module_id)?.length ?? 0;

                return (
                  <button
                    aria-pressed={isSelected}
                    className={joinClasses(
                      "w-full rounded-2xl border p-4 text-left transition",
                      isSelected
                        ? "border-brandBlue/40 bg-brandBlue/10 shadow-sm"
                        : "border-white/10 bg-black/20 hover:border-brandBlue/25 hover:bg-black/25"
                    )}
                    key={item.module_id}
                    onClick={() =>
                      setSelectedModuleId((current) =>
                        current === item.module_id ? null : item.module_id
                      )
                    }
                    type="button"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <p className="teacher-card-title text-sm font-black">{item.module_title}</p>
                        <p className="teacher-card-meta mt-1 text-xs">
                          {getActivityCountLabel(moduleActivityCount)}
                        </p>
                      </div>

                      <div className="flex flex-wrap items-center justify-end gap-2">
                        {isSelected ? (
                          <span className="rounded-full border border-brandBlue/30 bg-brandBlue/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-brandBlue">
                            Selected
                          </span>
                        ) : null}
                        <span className="rounded-full border border-white/15 bg-black/25 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-900">
                          {item.status}
                        </span>
                      </div>
                    </div>

                    <p className="teacher-card-copy mt-3 text-sm">
                      Progress {item.progress_percent}% - assessment{" "}
                      {formatPercent(item.assessment_score, 2)}
                    </p>
                    <p className="teacher-card-meta mt-2 text-xs">
                      Updated {formatDateTime(item.updated_at)}
                    </p>
                  </button>
                );
              })
            ) : (
              <div className="teacher-card-copy rounded-2xl border border-dashed border-white/15 bg-black/20 px-4 py-5 text-sm">
                No module progress has been saved for this student yet.
              </div>
            )}
          </div>
        </div>
      </div>

      <div className={activityPanelClassName}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.35em] text-accentWarm">
              {activityTitle}
            </p>
            <p className="teacher-card-meta mt-2 text-xs">
              {selectedModule
                ? `Showing the latest saved result for each activity in ${selectedModule.module_title}.`
                : moduleProgress.length
                  ? "Select a module card to show its activities and assessments."
                  : "Activity and assessment answers appear only after module progress is available."}
            </p>
          </div>

          <p className="teacher-card-meta text-xs">
            {!moduleProgress.length
              ? "Waiting for module progress"
              : selectedModule
                ? getActivityCountLabel(selectedModuleGroups.length)
                : "No module selected"}
          </p>
        </div>

        <div className="mt-4 space-y-3">
          {!moduleProgress.length ? (
            <div className="teacher-card-copy rounded-2xl border border-dashed border-white/15 bg-black/20 px-4 py-5 text-sm">
              Activity and assessment answers will show here once this student has saved module progress.
            </div>
          ) : !selectedModule ? (
            <div className="teacher-card-copy rounded-2xl border border-dashed border-white/15 bg-black/20 px-4 py-5 text-sm">
              Select a module progress card to load the related activity and assessment answers.
            </div>
          ) : selectedModuleGroups.length ? (
            selectedModuleGroups.map((group) => {
              const latestAttempt = group.latestAttempt;
              const olderAttempts = group.attempts.slice(1);

              return (
                <details
                  key={group.key}
                  className="rounded-2xl border border-white/10 bg-black/20 p-4"
                >
                  <summary className="cursor-pointer list-none">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="teacher-card-title text-sm font-black">
                            {latestAttempt.activity_title}
                          </p>
                          <span className="rounded-full border border-brandBlue/30 bg-brandBlue/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-brandBlue">
                            Latest
                          </span>
                          {group.attempts.length > 1 ? (
                            <span className="rounded-full border border-white/15 bg-black/25 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-900">
                              {getSubmissionCountLabel(group.attempts.length)}
                            </span>
                          ) : null}
                        </div>
                        <p className="teacher-card-meta mt-1 text-xs">
                          {latestAttempt.module_title} - {latestAttempt.activity_type}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="teacher-card-title text-sm font-black">
                          {formatPercent(latestAttempt.score_percent, 2)}
                        </p>
                        <p className="teacher-card-meta mt-1 text-xs">
                          {latestAttempt.right_count}/{latestAttempt.total_items} correct
                        </p>
                      </div>
                    </div>
                    <p className="teacher-card-meta mt-3 text-xs">
                      Submitted {formatDateTime(latestAttempt.submitted_at)}
                    </p>
                  </summary>

                  <AttemptItems attempt={latestAttempt} />

                  {olderAttempts.length ? (
                    <details className="mt-4 rounded-2xl border border-white/10 bg-black/25 p-4">
                      <summary className="cursor-pointer list-none">
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <div>
                            <p className="teacher-card-title text-sm font-black">
                              Submission History
                            </p>
                            <p className="teacher-card-meta mt-1 text-xs">
                              Earlier saved results for this same activity.
                            </p>
                          </div>
                          <span className="rounded-full border border-white/15 bg-black/20 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-900">
                            {olderAttempts.length} older
                          </span>
                        </div>
                      </summary>

                      <div className="mt-4 space-y-3">
                        {olderAttempts.map((attempt, index) => (
                          <AttemptHistoryCard attempt={attempt} index={index} key={attempt.id} />
                        ))}
                      </div>
                    </details>
                  ) : null}
                </details>
              );
            })
          ) : (
            <div className="teacher-card-copy rounded-2xl border border-dashed border-white/15 bg-black/20 px-4 py-5 text-sm">
              No saved activity or assessment answers are available for {selectedModule.module_title} yet.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
