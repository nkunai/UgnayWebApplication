"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { FormEvent, useEffect, useMemo, useState } from "react";

import {
  completeReadableItem,
  getStudentCertificateDownloadStatus,
  getStudentCourse,
  resolveUploadsBase,
  submitStudentItem,
  type StudentCertificateDownloadStatus,
  type StudentCourse,
  type StudentCourseItem,
  type StudentCourseModule
} from "@/lib/api";

const CONTENT_ITEM_TYPES = new Set([
  "readable",
  "video_resource",
  "document_resource",
  "interactive_resource",
  "external_link_resource"
]);

export default function StudentModulePlayerPage() {
  const params = useParams<{ moduleId: string }>();
  const [course, setCourse] = useState<StudentCourse | null>(null);
  const [certificateStatus, setCertificateStatus] = useState<StudentCertificateDownloadStatus | null>(null);
  const [answerByItem, setAnswerByItem] = useState<Record<number, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function refresh() {
    const [courseData, certificateData] = await Promise.all([
      getStudentCourse(),
      getStudentCertificateDownloadStatus()
    ]);
    setCourse(courseData);
    setCertificateStatus(certificateData);
  }

  useEffect(() => {
    void refresh().catch((requestError: Error) => setError(requestError.message));
  }, []);

  const moduleId = Number(params.moduleId);
  const currentModule = useMemo(
    () => course?.modules.find((module) => module.id === moduleId) ?? null,
    [course, moduleId]
  );
  const currentItem = useMemo(
    () => currentModule?.items.find((item) => !item.is_locked && item.status !== "completed") ?? currentModule?.items[0] ?? null,
    [currentModule]
  );

  async function onCompleteReadable(item: StudentCourseItem) {
    try {
      await completeReadableItem(item.id, 30);
      setMessage("Reading completed. The next item is now available.");
      await refresh();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Unable to complete item.");
    }
  }

  async function onSubmitItem(event: FormEvent<HTMLFormElement>, item: StudentCourseItem) {
    event.preventDefault();
    try {
      await submitStudentItem(item.id, {
        response_text: answerByItem[item.id] ?? "",
        duration_seconds: 60,
        score_percent: item.item_type === "signing_lab_assessment" ? 100 : undefined,
        extra_payload: { helper: "student-module-player" }
      });
      setMessage("Answer saved. Continue to the next item.");
      await refresh();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Unable to submit item.");
    }
  }

  function renderItem(item: StudentCourseItem) {
    if (CONTENT_ITEM_TYPES.has(item.item_type)) {
      const resourcePath = typeof item.config.resource_file_path === "string" ? item.config.resource_file_path : "";
      const resourceUrl = typeof item.config.resource_url === "string" ? item.config.resource_url : "";
      const resolvedResourceUrl = resourcePath ? `${resolveUploadsBase()}/${resourcePath}` : resourceUrl;
      return (
        <div className="space-y-4">
          <p className="rounded-xl bg-brandOffWhite px-4 py-4 text-sm leading-7 text-slate-700">
            {item.content_text || "No reading content yet."}
          </p>
          {resolvedResourceUrl ? (
            <a
              className="inline-flex rounded-lg border border-brandBorder bg-white px-4 py-2 text-sm font-semibold text-brandBlue transition hover:bg-brandBlueLight"
              href={resolvedResourceUrl}
              rel="noreferrer"
              target="_blank"
            >
              Open Resource
            </a>
          ) : null}
          <button className="rounded-lg bg-brandBlue px-4 py-2 text-sm font-semibold text-white" onClick={() => void onCompleteReadable(item)} type="button">
            Mark as Complete
          </button>
        </div>
      );
    }

    const question =
      (item.config.question as string | undefined) ||
      (item.config.helper_text as string | undefined) ||
      item.instructions ||
      "Answer this activity.";
    const choices = Array.isArray(item.config.choices) ? (item.config.choices as string[]) : [];

    return (
      <form className="space-y-4" onSubmit={(event) => void onSubmitItem(event, item)}>
        <p className="rounded-xl bg-brandOffWhite px-4 py-4 text-sm leading-7 text-slate-700">{question}</p>
        {item.item_type === "multiple_choice_assessment" && choices.length > 0 ? (
          <div className="grid gap-2">
            {choices.map((choice) => (
              <button
                className={`rounded-xl border px-4 py-3 text-left text-sm font-semibold ${answerByItem[item.id] === choice ? "border-brandBlue bg-brandBlueLight text-brandBlue" : "border-brandBorder bg-white text-slate-700"}`}
                key={choice}
                onClick={() => setAnswerByItem((current) => ({ ...current, [item.id]: choice }))}
                type="button"
              >
                {choice}
              </button>
            ))}
          </div>
        ) : (
          <input
            className="w-full rounded-lg border border-brandBorder bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-brandBlue"
            onChange={(event) => setAnswerByItem((current) => ({ ...current, [item.id]: event.target.value }))}
            placeholder={
              item.item_type === "signing_lab_assessment"
                ? "Type the sign result after checking your camera practice."
                : "Type your answer here."
            }
            value={answerByItem[item.id] ?? ""}
          />
        )}
        {item.item_type === "signing_lab_assessment" ? (
          <p className="rounded-xl border border-brandYellow/35 bg-brandYellowLight px-4 py-3 text-sm text-slate-800">
            Open the free signing lab in another tab if you need help checking your sign, then return here and submit the result.
          </p>
        ) : null}
        <button className="rounded-lg bg-brandBlue px-4 py-2 text-sm font-semibold text-white" type="submit">
          Submit Answer
        </button>
      </form>
    );
  }

  return (
    <section className="space-y-6">
      <div className="panel">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.3em] text-brandBlue">Student LMS</p>
            <h2 className="mt-3 text-3xl font-bold title-gradient">{currentModule?.title ?? "Module Player"}</h2>
            <p className="mt-2 text-sm text-slate-700">
              Finish each item in order. Locked items open automatically after you complete the current one.
            </p>
          </div>
          <Link className="rounded-lg border border-brandBorder bg-white px-4 py-2 text-sm font-semibold text-brandBlue" href="/modules">
            Back to Modules
          </Link>
        </div>
      </div>

      {error ? <p className="rounded-xl border border-brandRed/35 bg-brandRedLight px-4 py-3 text-sm text-brandRed">{error}</p> : null}
      {message ? <p className="rounded-xl border border-brandGreen/35 bg-brandGreenLight px-4 py-3 text-sm text-slate-800">{message}</p> : null}

      {currentModule ? (
        <div className="grid gap-4 xl:grid-cols-[0.36fr_0.64fr]">
          <aside className="panel">
            <p className="text-xs font-semibold uppercase tracking-[0.24em] label-accent">Course Flow</p>
            <div className="mt-4 space-y-3">
              {(course?.modules ?? []).map((module) => (
                <div className={`rounded-2xl border p-3 ${module.id === currentModule.id ? "border-brandBlue bg-brandBlueLight/60" : "border-brandBorder bg-white"}`} key={module.id}>
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Module {module.order_index}</p>
                      <p className="mt-1 font-semibold text-slate-900">{module.title}</p>
                    </div>
                    <span className={`rounded-full px-2 py-1 text-[11px] font-semibold ${module.is_locked ? "bg-brandRedLight text-brandRed" : "bg-brandGreenLight text-brandGreen"}`}>
                      {module.is_locked ? "Locked" : `${module.progress_percent}%`}
                    </span>
                  </div>
                  {module.id === currentModule.id ? (
                    <div className="mt-3 space-y-2">
                      {module.items.map((item) => (
                        <div className={`rounded-xl border px-3 py-2 text-sm ${item.is_locked ? "border-brandBorder bg-brandMutedSurface text-slate-500" : item.status === "completed" ? "border-brandGreen/30 bg-brandGreenLight text-slate-800" : "border-brandBlue/25 bg-white text-slate-800"}`} key={item.id}>
                          <div className="flex items-center justify-between gap-3">
                            <span>{item.order_index}. {item.title}</span>
                            <span className="text-xs uppercase tracking-[0.15em]">
                              {item.is_locked ? "Locked" : item.status}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          </aside>

          <div className="panel">
            {currentItem ? (
              <>
                <p className="text-xs font-semibold uppercase tracking-[0.24em] label-accent">
                  Item {currentItem.order_index} - {currentItem.item_type.replaceAll("_", " ")}
                </p>
                <h3 className="mt-2 text-2xl font-bold text-slate-900">{currentItem.title}</h3>
                <p className="mt-2 text-sm text-slate-700">
                  {currentItem.instructions || "Complete this item to unlock the next part of the module."}
                </p>
                <div className="mt-6">{renderItem(currentItem)}</div>
              </>
            ) : (
              <p className="text-sm text-slate-700">No available learning item.</p>
            )}

            {certificateStatus?.eligible ? (
              <div className="mt-6 rounded-2xl border border-brandGreen/30 bg-brandGreenLight px-4 py-4 text-sm text-slate-800">
                Certificate requirements are complete. Open the profile or download route to get your certificate.
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </section>
  );
}
