"use client";

import { ChangeEvent, DragEvent, FormEvent, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";

import {
  createTeacherModuleItem,
  createTeacherSectionModule,
  deleteTeacherModuleItem,
  getTeacherSection,
  getTeacherSectionModules,
  getTeacherSections,
  type NumbersCategory,
  type RecognitionMode,
  resolveUploadsBase,
  updateTeacherModuleItem,
  updateTeacherModule,
  uploadTeacherModuleItemAsset,
  type LmsModuleItem,
  type LmsSection,
  type ModuleAsset,
  type TeacherSectionModule,
  type TeacherSectionSummary,
  type WordsCategory
} from "@/lib/api";

const ITEM_TYPE_OPTIONS = [
  { value: "readable", label: "Resources (text + files)" },
  { value: "multiple_choice_assessment", label: "Multiple Choice" },
  { value: "identification_assessment", label: "Identification" },
  { value: "signing_lab_assessment", label: "Camera Interface" }
] as const;

type BuilderItemType = (typeof ITEM_TYPE_OPTIONS)[number]["value"];

function normalizeBuilderItemType(value: string): BuilderItemType {
  return ITEM_TYPE_OPTIONS.some((entry) => entry.value === value)
    ? (value as BuilderItemType)
    : "readable";
}

const READABLE_ACCEPT = [
  "video/*",
  "image/*",
  ".pdf",
  ".ppt",
  ".pptx",
  ".doc",
  ".docx",
  ".xls",
  ".xlsx",
  ".txt",
  ".zip"
].join(",");

const IDENTIFICATION_PROMPT_ACCEPT = ["image/*", "video/*"].join(",");

const READABLE_PRESENTATION_OPTIONS = [
  { value: "auto", label: "No Selection (Auto)" },
  { value: "cards", label: "Cards Grid" },
  { value: "slideshow", label: "Slideshow" }
] as const;

type ReadablePresentationMode = (typeof READABLE_PRESENTATION_OPTIONS)[number]["value"];

const LAB_MODE_OPTIONS: Array<{ value: RecognitionMode; label: string }> = [
  { value: "alphabet", label: "Alphabets" },
  { value: "numbers", label: "Numbers" },
  { value: "words", label: "Words" }
];

const NUMBER_RANGE_OPTIONS: Array<{ value: NumbersCategory; label: string }> = [
  { value: "0-10", label: "1-10" },
  { value: "11-20", label: "11-20" },
  { value: "21-30", label: "21-30" },
  { value: "31-40", label: "31-40" },
  { value: "41-50", label: "41-50" },
  { value: "51-60", label: "51-60" },
  { value: "61-70", label: "61-70" },
  { value: "71-80", label: "71-80" },
  { value: "81-90", label: "81-90" },
  { value: "91-100", label: "91-100" }
];

const WORD_CATEGORY_OPTIONS: Array<{ value: WordsCategory; label: string }> = [
  { value: "greeting", label: "Greetings" },
  { value: "responses", label: "Responses" },
  { value: "date", label: "Days / Date" },
  { value: "family", label: "Family" },
  { value: "relationship", label: "Relationship / People" },
  { value: "color", label: "Color" }
];

function normalizeWords(value: string): string[] {
  return value
    .split(/[\n,]/g)
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function displayType(value: string): string {
  return value
    .replaceAll("_", " ")
    .replace(/\b\w/g, (match) => match.toUpperCase());
}

function displayItemTypeLabel(value: string): string {
  if (value === "readable") {
    return "Resources";
  }
  return displayType(value);
}

type ReadableUploadEntry = {
  id: string;
  file: File;
  label: string;
};

function buildReadableUploadId(file: File): string {
  return `${file.name}-${file.size}-${file.lastModified}`;
}

function defaultReadableLabel(fileName: string): string {
  const baseName = fileName.replace(/\.[^.]+$/, "").trim();
  return baseName || fileName;
}

function resolveAssetLabel(asset: ModuleAsset): string {
  const savedLabel = typeof asset.label === "string" ? asset.label.trim() : "";
  if (savedLabel) {
    return savedLabel;
  }
  return defaultReadableLabel(asset.resource_file_name);
}

function parseAsset(value: unknown): ModuleAsset | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  const candidate = value as Record<string, unknown>;
  const kind = candidate.resource_kind;
  const fileName = candidate.resource_file_name;
  const filePath = candidate.resource_file_path;
  if (
    (kind === "video" || kind === "image" || kind === "document" || kind === "interactive") &&
    typeof fileName === "string" &&
    typeof filePath === "string"
  ) {
    return {
      resource_kind: kind,
      resource_file_name: fileName,
      resource_file_path: filePath,
      resource_mime_type:
        typeof candidate.resource_mime_type === "string" ? candidate.resource_mime_type : undefined,
      resource_url: typeof candidate.resource_url === "string" ? candidate.resource_url : undefined,
      label: typeof candidate.label === "string" ? candidate.label : undefined
    };
  }
  return null;
}

function getItemAttachments(item: LmsModuleItem): ModuleAsset[] {
  const raw = item.config.attachments;
  if (!Array.isArray(raw)) {
    return [];
  }
  return raw.map((entry) => parseAsset(entry)).filter((entry): entry is ModuleAsset => Boolean(entry));
}

function getPromptMedia(item: LmsModuleItem): ModuleAsset | null {
  return parseAsset(item.config.prompt_media);
}

function parseLabMode(value: unknown): RecognitionMode | null {
  return value === "alphabet" || value === "numbers" || value === "words" ? value : null;
}

function parseNumbersCategory(value: unknown): NumbersCategory | null {
  return NUMBER_RANGE_OPTIONS.some((entry) => entry.value === value)
    ? (value as NumbersCategory)
    : null;
}

function parseWordsCategory(value: unknown): WordsCategory | null {
  return WORD_CATEGORY_OPTIONS.some((entry) => entry.value === value)
    ? (value as WordsCategory)
    : null;
}

function getSigningLabConfig(item: LmsModuleItem): {
  mode: RecognitionMode;
  numbersCategory: NumbersCategory | null;
  wordsCategory: WordsCategory | null;
} | null {
  if (item.item_type !== "signing_lab_assessment") {
    return null;
  }
  const mode = parseLabMode(item.config.lab_mode) ?? "alphabet";
  const numbersCategory = parseNumbersCategory(item.config.numbers_category);
  const wordsCategory = parseWordsCategory(item.config.words_category);
  return { mode, numbersCategory, wordsCategory };
}

function displayNumbersRangeLabel(value: NumbersCategory | null): string {
  if (!value) {
    return "Not set";
  }
  return NUMBER_RANGE_OPTIONS.find((entry) => entry.value === value)?.label ?? value;
}

function displayWordsCategoryLabel(value: WordsCategory | null): string {
  if (!value) {
    return "Not set";
  }
  return WORD_CATEGORY_OPTIONS.find((entry) => entry.value === value)?.label ?? value;
}

function parseReadablePresentationMode(value: unknown): ReadablePresentationMode {
  if (value === "cards" || value === "slideshow") {
    return value;
  }
  return "auto";
}

function readableModeLabel(value: ReadablePresentationMode): string {
  if (value === "slideshow") {
    return "Slideshow";
  }
  if (value === "cards") {
    return "Cards Grid";
  }
  return "No Selection (Auto)";
}

function resolveAssetUrl(asset: ModuleAsset): string {
  if (asset.resource_url && /^https?:\/\//i.test(asset.resource_url)) {
    return asset.resource_url;
  }
  if (asset.resource_url && asset.resource_url.startsWith("/")) {
    return `${resolveUploadsBase()}${asset.resource_url}`;
  }
  const path = asset.resource_file_path.replace(/^\/+/, "");
  return `${resolveUploadsBase()}/${path}`;
}

export default function TeacherSectionsPage() {
  const params = useSearchParams();
  const sectionQuery = params.get("section");

  const [sections, setSections] = useState<TeacherSectionSummary[]>([]);
  const [selectedSectionId, setSelectedSectionId] = useState(sectionQuery ?? "");
  const [selectedSection, setSelectedSection] = useState<LmsSection | null>(null);
  const [modules, setModules] = useState<TeacherSectionModule[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [isSavingItem, setIsSavingItem] = useState(false);
  const [editingItemId, setEditingItemId] = useState<number | null>(null);
  const [deletingItemId, setDeletingItemId] = useState<number | null>(null);
  const [previewItemId, setPreviewItemId] = useState<number | null>(null);
  const [previewSlideIndex, setPreviewSlideIndex] = useState(0);

  const [newModuleTitle, setNewModuleTitle] = useState("");
  const [newModuleDescription, setNewModuleDescription] = useState("");
  const [selectedModuleId, setSelectedModuleId] = useState<string>("");

  const [itemTitle, setItemTitle] = useState("");
  const [itemType, setItemType] = useState<BuilderItemType>("readable");
  const [itemInstructions, setItemInstructions] = useState("");
  const [itemContent, setItemContent] = useState("");
  const [itemQuestion, setItemQuestion] = useState("");
  const [itemAnswer, setItemAnswer] = useState("");
  const [itemAcceptedAnswers, setItemAcceptedAnswers] = useState("");
  const [mcqChoices, setMcqChoices] = useState<string[]>(["", "", "", ""]);
  const [mcqCorrectIndex, setMcqCorrectIndex] = useState(0);
  const [readableFiles, setReadableFiles] = useState<ReadableUploadEntry[]>([]);
  const [isReadableDropActive, setIsReadableDropActive] = useState(false);
  const [readablePresentationMode, setReadablePresentationMode] =
    useState<ReadablePresentationMode>("auto");
  const [identificationPromptFile, setIdentificationPromptFile] = useState<File | null>(null);
  const [signingLabMode, setSigningLabMode] = useState<RecognitionMode>("alphabet");
  const [signingLabNumbersRange, setSigningLabNumbersRange] = useState<NumbersCategory>("0-10");
  const [signingLabWordsCategory, setSigningLabWordsCategory] = useState<WordsCategory>("greeting");

  const selectedModule = useMemo(
    () => modules.find((module) => String(module.id) === selectedModuleId) ?? null,
    [modules, selectedModuleId]
  );
  const editingItem = useMemo(
    () => selectedModule?.items.find((item) => item.id === editingItemId) ?? null,
    [selectedModule, editingItemId]
  );
  const isEditingItem = editingItemId !== null;
  const previewItem = useMemo(
    () => selectedModule?.items.find((item) => item.id === previewItemId) ?? null,
    [selectedModule, previewItemId]
  );
  const existingReadableAttachmentCount = useMemo(() => {
    if (!editingItem || editingItem.item_type !== "readable") {
      return 0;
    }
    return getItemAttachments(editingItem).length;
  }, [editingItem]);

  function appendReadableFiles(files: File[]) {
    if (files.length === 0) {
      return;
    }
    setReadableFiles((current) => {
      const seen = new Set(current.map((entry) => entry.id));
      const merged = [...current];
      for (const file of files) {
        const key = buildReadableUploadId(file);
        if (!seen.has(key)) {
          merged.push({
            id: key,
            file,
            label: defaultReadableLabel(file.name)
          });
          seen.add(key);
        }
      }
      return merged;
    });
  }

  function onReadableFileSelect(event: ChangeEvent<HTMLInputElement>) {
    appendReadableFiles(Array.from(event.target.files ?? []));
    event.target.value = "";
  }

  function onReadableDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    event.stopPropagation();
    setIsReadableDropActive(false);
    appendReadableFiles(Array.from(event.dataTransfer.files ?? []));
  }

  function onReadableDragOver(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    event.stopPropagation();
    setIsReadableDropActive(true);
  }

  function onReadableDragLeave(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    event.stopPropagation();
    setIsReadableDropActive(false);
  }

  function removeReadableFile(index: number) {
    setReadableFiles((current) => current.filter((_, fileIndex) => fileIndex !== index));
  }

  function updateReadableFileLabel(index: number, label: string) {
    setReadableFiles((current) =>
      current.map((entry, entryIndex) =>
        entryIndex === index
          ? {
              ...entry,
              label
            }
          : entry
      )
    );
  }

  function moveReadableFile(index: number, direction: "up" | "down") {
    setReadableFiles((current) => {
      const target = direction === "up" ? index - 1 : index + 1;
      if (target < 0 || target >= current.length) {
        return current;
      }
      const next = [...current];
      const [picked] = next.splice(index, 1);
      next.splice(target, 0, picked);
      return next;
    });
  }

  async function refreshSection(sectionId: string) {
    if (!sectionId) {
      setSelectedSection(null);
      setModules([]);
      setSelectedModuleId("");
      setEditingItemId(null);
      return;
    }
    const [sectionData, moduleData] = await Promise.all([
      getTeacherSection(Number(sectionId)),
      getTeacherSectionModules(Number(sectionId))
    ]);
    setSelectedSection(sectionData);
    setModules(moduleData);
    if (editingItemId !== null) {
      const stillExists = moduleData.some((module) => module.items.some((item) => item.id === editingItemId));
      if (!stillExists) {
        setEditingItemId(null);
      }
    }
    if (previewItemId !== null) {
      const stillExists = moduleData.some((module) => module.items.some((item) => item.id === previewItemId));
      if (!stillExists) {
        closePreview();
      }
    }
    if (moduleData.length === 0) {
      setSelectedModuleId("");
      return;
    }
    if (!moduleData.some((module) => String(module.id) === selectedModuleId)) {
      setSelectedModuleId(String(moduleData[0].id));
    }
  }

  useEffect(() => {
    getTeacherSections()
      .then((data) => {
        setSections(data);
        const initial = sectionQuery || (data[0] ? String(data[0].section.id) : "");
        setSelectedSectionId(initial);
        if (initial) {
          void refreshSection(initial);
        }
      })
      .catch((requestError: Error) => setError(requestError.message));
  }, [sectionQuery]);

  function clearItemBuilder() {
    setItemTitle("");
    setItemInstructions("");
    setItemContent("");
    setItemQuestion("");
    setItemAnswer("");
    setItemAcceptedAnswers("");
    setMcqChoices(["", "", "", ""]);
    setMcqCorrectIndex(0);
    setReadableFiles([]);
    setIsReadableDropActive(false);
    setReadablePresentationMode("auto");
    setIdentificationPromptFile(null);
    setSigningLabMode("alphabet");
    setSigningLabNumbersRange("0-10");
    setSigningLabWordsCategory("greeting");
    setEditingItemId(null);
  }

  function beginEditItem(item: LmsModuleItem) {
    setEditingItemId(item.id);
    setItemType(normalizeBuilderItemType(item.item_type));
    setItemTitle(item.title);
    setItemInstructions(item.instructions ?? "");
    setItemContent(item.content_text ?? "");
    setReadableFiles([]);
    setReadablePresentationMode("auto");
    setIdentificationPromptFile(null);

    if (item.item_type === "readable") {
      setReadablePresentationMode(parseReadablePresentationMode(item.config.presentation_mode));
      setItemQuestion("");
      setItemAnswer("");
      setItemAcceptedAnswers("");
      setMcqChoices(["", "", "", ""]);
      setMcqCorrectIndex(0);
      return;
    }

    if (item.item_type === "multiple_choice_assessment") {
      const rawChoices = Array.isArray(item.config.choices)
        ? (item.config.choices as unknown[]).map((entry) => String(entry))
        : [];
      const choices = rawChoices.length >= 2 ? rawChoices : [...rawChoices, "", ""].slice(0, 4);
      setMcqChoices(choices);
      const correctAnswer = typeof item.config.correct_answer === "string" ? item.config.correct_answer : "";
      setItemQuestion(typeof item.config.question === "string" ? item.config.question : "");
      setItemAnswer(correctAnswer);
      const matchedIndex = choices.findIndex(
        (choice) => choice.trim().toLowerCase() === correctAnswer.trim().toLowerCase()
      );
      setMcqCorrectIndex(matchedIndex >= 0 ? matchedIndex : 0);
      setItemAcceptedAnswers("");
      return;
    }

    if (item.item_type === "identification_assessment") {
      const acceptedAnswers = Array.isArray(item.config.accepted_answers)
        ? (item.config.accepted_answers as unknown[]).map((entry) => String(entry))
        : [];
      setItemQuestion(typeof item.config.question === "string" ? item.config.question : "");
      setItemAnswer(typeof item.config.correct_answer === "string" ? item.config.correct_answer : "");
      setItemAcceptedAnswers(acceptedAnswers.join(", "));
      setMcqChoices(["", "", "", ""]);
      setMcqCorrectIndex(0);
      return;
    }

    if (item.item_type === "signing_lab_assessment") {
      setItemQuestion(typeof item.config.question === "string" ? item.config.question : "");
      setItemAnswer(typeof item.config.expected_answer === "string" ? item.config.expected_answer : "");
      setSigningLabMode(parseLabMode(item.config.lab_mode) ?? "alphabet");
      setSigningLabNumbersRange(parseNumbersCategory(item.config.numbers_category) ?? "0-10");
      setSigningLabWordsCategory(parseWordsCategory(item.config.words_category) ?? "greeting");
      setMcqChoices(["", "", "", ""]);
      setMcqCorrectIndex(0);
      setItemAcceptedAnswers("");
      return;
    }

    setItemQuestion("");
    setItemAnswer("");
    setItemAcceptedAnswers("");
    setMcqChoices(["", "", "", ""]);
    setMcqCorrectIndex(0);
  }

  function openPreview(item: LmsModuleItem) {
    setPreviewItemId(item.id);
    setPreviewSlideIndex(0);
  }

  function closePreview() {
    setPreviewItemId(null);
    setPreviewSlideIndex(0);
  }

  function renderPreviewAsset(asset: ModuleAsset) {
    const url = resolveAssetUrl(asset);
    if (asset.resource_kind === "image") {
      return (
        <div
          className="d-flex align-items-center justify-content-center rounded-3 border border-brandBorder bg-brandOffWhite p-2"
          style={{ minHeight: "220px" }}
        >
          <img
            alt={asset.resource_file_name}
            className="mw-100 rounded-3 object-contain"
            src={url}
            style={{ maxHeight: "320px" }}
          />
        </div>
      );
    }
    if (asset.resource_kind === "video") {
      return <video className="w-100 rounded-3 max-h-80" controls preload="metadata" src={url} />;
    }
    return (
      <a className="btn btn-outline-primary btn-sm" href={url} rel="noreferrer" target="_blank">
        Open {asset.resource_file_name}
      </a>
    );
  }

  function renderItemPreviewBody(item: LmsModuleItem) {
    if (item.item_type === "readable") {
      const attachments = getItemAttachments(item);
      const mode = parseReadablePresentationMode(item.config.presentation_mode);
      const cardVideos = attachments.filter((asset) => asset.resource_kind === "video");
      const cardNonVideos = attachments.filter((asset) => asset.resource_kind !== "video");
      const currentSlide =
        attachments.length > 0
          ? Math.min(Math.max(previewSlideIndex, 0), attachments.length - 1)
          : 0;
      const slideAsset = attachments[currentSlide];
      return (
        <div className="vstack gap-3">
          <p className="mb-0 rounded-3 bg-brandOffWhite px-3 py-3 text-sm text-slate-700">
            {item.content_text || "No readable content yet."}
          </p>
          {attachments.length > 0 && mode !== "slideshow" ? (
            <div className="vstack gap-3">
              {cardVideos.map((asset) => (
                <div className="card border-brandBorder" key={`${asset.resource_file_name}-${asset.resource_file_path}`}>
                  <div className="card-body">
                    {renderPreviewAsset(asset)}
                    <p className="small fw-semibold mt-2 mb-0 text-center">{asset.resource_file_name}</p>
                  </div>
                </div>
              ))}
              <div className="row g-3">
                {cardNonVideos.map((asset) => (
                <div className="col-12 col-md-4" key={`${asset.resource_file_name}-${asset.resource_file_path}`}>
                  <div className="card border-brandBorder h-100">
                    <div className="card-body">
                      {renderPreviewAsset(asset)}
                      <p className="small fw-semibold mt-2 mb-0 text-center">
                        {asset.resource_kind === "image"
                          ? resolveAssetLabel(asset)
                          : asset.resource_file_name}
                      </p>
                    </div>
                  </div>
                </div>
                ))}
              </div>
            </div>
          ) : null}
          {attachments.length > 0 && mode === "slideshow" ? (
            <div className="card border-brandBorder">
              <div className="card-body">
                <div className="d-flex align-items-center justify-content-between mb-2">
                  <span className="small fw-semibold">
                    Slide {currentSlide + 1} of {attachments.length}
                  </span>
                  <div className="btn-group btn-group-sm">
                    <button
                      className="btn btn-outline-secondary"
                      disabled={currentSlide <= 0}
                      onClick={() => setPreviewSlideIndex((current) => Math.max(current - 1, 0))}
                      type="button"
                    >
                      Previous
                    </button>
                    <button
                      className="btn btn-outline-secondary"
                      disabled={currentSlide >= attachments.length - 1}
                      onClick={() =>
                        setPreviewSlideIndex((current) =>
                          Math.min(current + 1, attachments.length - 1)
                        )
                      }
                      type="button"
                    >
                      Next
                    </button>
                  </div>
                </div>
                {slideAsset ? renderPreviewAsset(slideAsset) : null}
              </div>
            </div>
          ) : null}
          {attachments.length === 0 ? (
            <p className="mb-0 small text-slate-600">No attachments yet.</p>
          ) : null}
        </div>
      );
    }

    if (item.item_type === "multiple_choice_assessment") {
      const question = typeof item.config.question === "string" ? item.config.question : "";
      const choices = Array.isArray(item.config.choices)
        ? (item.config.choices as unknown[]).map((entry) => String(entry))
        : [];
      return (
        <div className="vstack gap-2">
          <p className="mb-0 rounded-3 bg-brandOffWhite px-3 py-3 text-sm text-slate-700">
            {question || item.instructions || "No question yet."}
          </p>
          {choices.map((choice, index) => (
            <div className="form-check" key={`${choice}-${index}`}>
              <input className="form-check-input" disabled type="radio" />
              <label className="form-check-label text-sm">{choice}</label>
            </div>
          ))}
        </div>
      );
    }

    if (item.item_type === "identification_assessment") {
      const question = typeof item.config.question === "string" ? item.config.question : "";
      const promptMedia = getPromptMedia(item);
      return (
        <div className="vstack gap-3">
          <p className="mb-0 rounded-3 bg-brandOffWhite px-3 py-3 text-sm text-slate-700">
            {question || item.instructions || "No question yet."}
          </p>
          {promptMedia ? (
            <div className="card border-brandBorder">
              <div className="card-body">
                <p className="small fw-semibold mb-2">{promptMedia.resource_file_name}</p>
                {renderPreviewAsset(promptMedia)}
              </div>
            </div>
          ) : (
            <p className="mb-0 small text-slate-600">No prompt media yet.</p>
          )}
        </div>
      );
    }

    if (item.item_type === "signing_lab_assessment") {
      const config = getSigningLabConfig(item);
      return (
        <div className="vstack gap-2">
          <p className="mb-0 rounded-3 bg-brandOffWhite px-3 py-3 text-sm text-slate-700">
            {(typeof item.config.question === "string" ? item.config.question : "") ||
              item.instructions ||
              "No prompt yet."}
          </p>
          {config ? (
            <div className="small text-slate-700">
              <p className="mb-1">Camera Type: <span className="fw-semibold">{displayType(config.mode)}</span></p>
              {config.mode === "numbers" ? (
                <p className="mb-1">Range: <span className="fw-semibold">{displayNumbersRangeLabel(config.numbersCategory)}</span></p>
              ) : null}
              {config.mode === "words" ? (
                <p className="mb-0">Category: <span className="fw-semibold">{displayWordsCategoryLabel(config.wordsCategory)}</span></p>
              ) : null}
            </div>
          ) : null}
        </div>
      );
    }

    return <p className="mb-0 small text-slate-600">No preview available.</p>;
  }

  async function onCreateModule(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedSectionId) {
      return;
    }
    setError(null);
    setMessage(null);
    try {
      await createTeacherSectionModule(Number(selectedSectionId), {
        title: newModuleTitle,
        description: newModuleDescription
      });
      setNewModuleTitle("");
      setNewModuleDescription("");
      setMessage("Module added.");
      await refreshSection(selectedSectionId);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Unable to create module.");
    }
  }

  async function onSaveItem(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedModuleId) {
      setError("Choose a module first.");
      return;
    }

    setError(null);
    setMessage(null);
    setIsSavingItem(true);

    try {
      let config: Record<string, unknown> = {};

      if (itemType === "multiple_choice_assessment") {
        const choices = mcqChoices.map((choice) => choice.trim()).filter(Boolean);
        if (choices.length < 2) {
          setError("Add at least 2 answer choices.");
          return;
        }
        const selectedAnswer = (mcqChoices[mcqCorrectIndex] || "").trim();
        if (!selectedAnswer) {
          setError("Choose a valid correct answer.");
          return;
        }
        config = {
          question: itemQuestion.trim(),
          choices,
          correct_answer: selectedAnswer
        };
      } else if (itemType === "identification_assessment") {
        const primaryAnswer = itemAnswer.trim();
        if (!primaryAnswer) {
          setError("Add the expected answer for identification.");
          return;
        }
        const acceptedAnswers = Array.from(
          new Set([primaryAnswer, ...normalizeWords(itemAcceptedAnswers)])
        );
        config = {
          question: itemQuestion.trim(),
          correct_answer: primaryAnswer,
          accepted_answers: acceptedAnswers
        };
      } else if (itemType === "signing_lab_assessment") {
        const expectedAnswer = itemAnswer.trim();
        if (!expectedAnswer) {
          setError("Add the expected answer for camera interface assessment.");
          return;
        }
        if (signingLabMode === "numbers" && !signingLabNumbersRange) {
          setError("Choose a numbers range for camera interface assessment.");
          return;
        }
        if (signingLabMode === "words" && !signingLabWordsCategory) {
          setError("Choose a words category for camera interface assessment.");
          return;
        }
        config = {
          question: itemQuestion.trim(),
          expected_answer: expectedAnswer,
          helper_text: "Open the camera interface, analyze your sign, and submit the detected result.",
          lab_mode: signingLabMode,
          numbers_category: signingLabMode === "numbers" ? signingLabNumbersRange : null,
          words_category: signingLabMode === "words" ? signingLabWordsCategory : null
        };
      } else {
        const existingAttachmentCount =
          editingItem && itemType === "readable" ? getItemAttachments(editingItem).length : 0;
        if (!itemContent.trim() && readableFiles.length === 0 && existingAttachmentCount === 0) {
          setError("Add resource text or upload at least one file.");
          return;
        }
        config = {
          presentation_mode:
            readablePresentationMode === "auto" ? null : readablePresentationMode,
          attachments:
            editingItem && itemType === "readable"
              ? (editingItem.config.attachments as unknown[] | undefined) ?? []
              : []
        };
      }

      let updatedModule: TeacherSectionModule;
      let targetItemId: number;
      if (isEditingItem && editingItemId !== null) {
        updatedModule = await updateTeacherModuleItem(editingItemId, {
          title: itemTitle.trim(),
          instructions: itemInstructions.trim() || "",
          content_text: itemType === "readable" ? itemContent.trim() : null,
          config
        });
        targetItemId = editingItemId;
      } else {
        updatedModule = await createTeacherModuleItem(Number(selectedModuleId), {
          title: itemTitle.trim(),
          item_type: itemType,
          content_text: itemType === "readable" ? itemContent.trim() : undefined,
          instructions: itemInstructions.trim() || undefined,
          config
        });
        const createdItem = [...updatedModule.items].sort((a, b) => b.order_index - a.order_index)[0];
        if (!createdItem) {
          throw new Error("Unable to locate the newly created item.");
        }
        targetItemId = createdItem.id;
      }

      if (itemType === "readable" && readableFiles.length > 0) {
        for (const entry of readableFiles) {
          updatedModule = await uploadTeacherModuleItemAsset(targetItemId, {
            file: entry.file,
            usage: "attachment",
            label: entry.label.trim() || undefined
          });
        }
      }
      if (itemType === "identification_assessment" && identificationPromptFile) {
        updatedModule = await uploadTeacherModuleItemAsset(targetItemId, {
          file: identificationPromptFile,
          usage: "prompt"
        });
      }

      setModules((current) =>
        current.map((module) => (module.id === updatedModule.id ? updatedModule : module))
      );
      clearItemBuilder();
      setMessage(isEditingItem ? "Module item updated." : "Module item created.");
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Unable to save module item.");
    } finally {
      setIsSavingItem(false);
    }
  }

  async function onDeleteItem(item: LmsModuleItem) {
    const confirmed = window.confirm(`Delete "${item.title}"? This cannot be undone.`);
    if (!confirmed) {
      return;
    }
    setError(null);
    setMessage(null);
    setDeletingItemId(item.id);
    try {
      const updatedModule = await deleteTeacherModuleItem(item.id);
      setModules((current) =>
        current.map((module) => (module.id === updatedModule.id ? updatedModule : module))
      );
      if (editingItemId === item.id) {
        clearItemBuilder();
      }
      setMessage("Module item deleted.");
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Unable to delete module item.");
    } finally {
      setDeletingItemId(null);
    }
  }

  async function onPublishToggle(module: TeacherSectionModule) {
    setError(null);
    setMessage(null);
    try {
      const updated = await updateTeacherModule(module.id, { is_published: !module.is_published });
      setModules((current) => current.map((entry) => (entry.id === updated.id ? updated : entry)));
      setMessage(updated.is_published ? "Module published." : "Module moved to draft.");
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Unable to update module.");
    }
  }

  return (
    <section className="space-y-4">
      <div className="panel">
        <p className="text-xs fw-semibold text-uppercase tracking-[0.2em] text-brandBlue">Teacher LMS</p>
        <h2 className="mt-2 text-3xl fw-bold title-gradient">Module Builder</h2>
        <p className="mt-2 text-sm text-slate-700">
          Create resource lessons with mixed files in one drop area, then add assessments.
        </p>
      </div>

      {error ? (
        <div className="alert alert-danger mb-0" role="alert">
          {error}
        </div>
      ) : null}
      {message ? (
        <div className="alert alert-success mb-0" role="alert">
          {message}
        </div>
      ) : null}

      <div className="panel">
        <label className="form-label fw-semibold">Choose Section</label>
        <select
          className="form-select"
          onChange={(event) => {
            setSelectedSectionId(event.target.value);
            void refreshSection(event.target.value);
          }}
          value={selectedSectionId}
        >
          <option value="">Choose a section</option>
          {sections.map((entry) => (
            <option key={entry.section.id} value={entry.section.id}>
              {entry.section.name}
            </option>
          ))}
        </select>
      </div>

      {selectedSection ? (
        <>
          <div className="row g-4">
            <div className="col-xl-5">
              <div className="panel h-100">
                <h3 className="h5 fw-bold mb-3">Create Module</h3>
                <form className="vstack gap-3" onSubmit={onCreateModule}>
                  <div>
                    <label className="form-label fw-semibold">Module Title</label>
                    <input
                      className="form-control"
                      onChange={(event) => setNewModuleTitle(event.target.value)}
                      required
                      value={newModuleTitle}
                    />
                  </div>
                  <div>
                    <label className="form-label fw-semibold">Description</label>
                    <textarea
                      className="form-control"
                      onChange={(event) => setNewModuleDescription(event.target.value)}
                      rows={4}
                      value={newModuleDescription}
                    />
                  </div>
                  <button className="btn btn-primary align-self-start" type="submit">
                    Add Module
                  </button>
                </form>
              </div>
            </div>

            <div className="col-xl-7">
              <div className="panel h-100">
                <h3 className="h5 fw-bold mb-3">Modules</h3>
                <div className="vstack gap-3">
                  {modules.map((module) => (
                    <article className="card border-brandBorder shadow-sm" key={module.id}>
                      <div className="card-body">
                        <div className="d-flex flex-wrap justify-content-between gap-3">
                          <div>
                            <p className="mb-1 text-uppercase text-xs tracking-[0.16em] text-slate-500">
                              Module {module.order_index}
                            </p>
                            <h4 className="h6 fw-bold mb-1">{module.title}</h4>
                            <p className="mb-0 text-sm text-slate-700">{module.description}</p>
                          </div>
                          <div className="d-flex gap-2">
                            <button
                              className={`btn btn-sm ${module.is_published ? "btn-outline-danger" : "btn-primary"}`}
                              onClick={() => void onPublishToggle(module)}
                              type="button"
                            >
                              {module.is_published ? "Unpublish" : "Publish"}
                            </button>
                            <button
                              className={`btn btn-sm ${
                                selectedModuleId === String(module.id) ? "btn-info text-white" : "btn-outline-secondary"
                              }`}
                              onClick={() => setSelectedModuleId(String(module.id))}
                              type="button"
                            >
                              Edit Items
                            </button>
                          </div>
                        </div>
                      </div>
                    </article>
                  ))}
                  {modules.length === 0 ? (
                    <p className="mb-0 text-sm text-slate-600">No modules yet. Add your first module.</p>
                  ) : null}
                </div>
              </div>
            </div>
          </div>

          {selectedModule ? (
            <div className="row g-4">
              <div className="col-xl-5">
                <div className="panel h-100">
                  <h3 className="h5 fw-bold mb-3">
                    {isEditingItem ? `Edit Item in ${selectedModule.title}` : `Add Item to ${selectedModule.title}`}
                  </h3>
                  <form className="vstack gap-3" onSubmit={onSaveItem}>
                    <div>
                      <label className="form-label fw-semibold">Item Type</label>
                      <select
                        className="form-select"
                        onChange={(event) => setItemType(event.target.value as BuilderItemType)}
                        disabled={isEditingItem}
                        value={itemType}
                      >
                        {ITEM_TYPE_OPTIONS.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                      {isEditingItem ? (
                        <div className="form-text">Item type cannot be changed while editing. Delete and recreate if needed.</div>
                      ) : null}
                    </div>

                    <div>
                      <label className="form-label fw-semibold">Title</label>
                      <input
                        className="form-control"
                        onChange={(event) => setItemTitle(event.target.value)}
                        required
                        value={itemTitle}
                      />
                    </div>

                    <div>
                      <label className="form-label fw-semibold">Instructions</label>
                      <textarea
                        className="form-control"
                        onChange={(event) => setItemInstructions(event.target.value)}
                        rows={3}
                        value={itemInstructions}
                      />
                    </div>

                    {itemType === "readable" ? (
                      <>
                        <div>
                          <label className="form-label fw-semibold">Introduction / Resource Content</label>
                          <textarea
                            className="form-control"
                            onChange={(event) => setItemContent(event.target.value)}
                            rows={5}
                            value={itemContent}
                          />
                        </div>
                        <div>
                          <label className="form-label fw-semibold">Resource Display Format</label>
                          <select
                            className="form-select"
                            onChange={(event) =>
                              setReadablePresentationMode(event.target.value as ReadablePresentationMode)
                            }
                            value={readablePresentationMode}
                          >
                            {READABLE_PRESENTATION_OPTIONS.map((entry) => (
                              <option key={entry.value} value={entry.value}>
                                {entry.label}
                              </option>
                            ))}
                          </select>
                          <div className="form-text">
                            Leave it on No Selection to auto-layout resources.
                          </div>
                        </div>
                        <div>
                          <label className="form-label fw-semibold">Upload Materials (One Drop Area)</label>
                          <div
                            className={`rounded-3 border p-3 ${
                              isReadableDropActive
                                ? "border-primary bg-brandBlueLight"
                                : "border-brandBorder bg-white"
                            }`}
                            onDragLeave={onReadableDragLeave}
                            onDragOver={onReadableDragOver}
                            onDrop={onReadableDrop}
                          >
                            <p className="mb-2 text-sm fw-semibold text-slate-800">
                              Drag and drop many files here
                            </p>
                            <input
                              accept={READABLE_ACCEPT}
                              className="form-control"
                              multiple
                              onChange={onReadableFileSelect}
                              type="file"
                            />
                            <div className="form-text">
                              Supported: videos, images, PDF, PPT/PPTX, DOC/DOCX, spreadsheets, text, zip.
                            </div>
                            {isEditingItem && existingReadableAttachmentCount > 0 ? (
                              <p className="mb-0 mt-2 small text-slate-700">
                                Existing attachments: <span className="fw-semibold">{existingReadableAttachmentCount}</span>.
                                New uploads will be added after existing files.
                              </p>
                            ) : null}
                          </div>
                          {readableFiles.length > 0 ? (
                            <div className="vstack gap-2 mt-2">
                              {readableFiles.map((entry, index) => (
                                <div
                                  className="d-flex flex-wrap align-items-center justify-content-between gap-2 rounded-2 border border-brandBorder bg-white px-2 py-2"
                                  key={entry.id}
                                >
                                  <div className="flex-grow-1" style={{ minWidth: "260px" }}>
                                    <p className="small text-slate-800 mb-1">
                                      <span className="fw-semibold me-1">{index + 1}.</span>
                                      {entry.file.name}
                                    </p>
                                    <input
                                      className="form-control form-control-sm"
                                      onChange={(event) =>
                                        updateReadableFileLabel(index, event.target.value)
                                      }
                                      placeholder="Card label (example: A)"
                                      type="text"
                                      value={entry.label}
                                    />
                                  </div>
                                  <div className="btn-group btn-group-sm" role="group">
                                    <button
                                      className="btn btn-outline-secondary"
                                      disabled={index === 0}
                                      onClick={() => moveReadableFile(index, "up")}
                                      type="button"
                                    >
                                      Up
                                    </button>
                                    <button
                                      className="btn btn-outline-secondary"
                                      disabled={index === readableFiles.length - 1}
                                      onClick={() => moveReadableFile(index, "down")}
                                      type="button"
                                    >
                                      Down
                                    </button>
                                    <button
                                      className="btn btn-outline-danger"
                                      onClick={() => removeReadableFile(index)}
                                      type="button"
                                    >
                                      Remove
                                    </button>
                                  </div>
                                </div>
                              ))}
                            </div>
                          ) : null}
                        </div>
                      </>
                    ) : null}

                    {itemType === "multiple_choice_assessment" ? (
                      <>
                        <div>
                          <label className="form-label fw-semibold">Question</label>
                          <input
                            className="form-control"
                            onChange={(event) => setItemQuestion(event.target.value)}
                            value={itemQuestion}
                          />
                        </div>
                        <div className="card border-brandBorder">
                          <div className="card-body">
                            <div className="d-flex justify-content-between align-items-center mb-2">
                              <p className="mb-0 fw-semibold">Choices (Google Forms style)</p>
                              <button
                                className="btn btn-outline-primary btn-sm"
                                onClick={() => setMcqChoices((current) => [...current, ""])}
                                type="button"
                              >
                                Add Choice
                              </button>
                            </div>
                            <div className="vstack gap-2">
                              {mcqChoices.map((choice, index) => (
                                <div className="input-group" key={`choice-${index}`}>
                                  <span className="input-group-text">
                                    <input
                                      checked={mcqCorrectIndex === index}
                                      className="form-check-input mt-0"
                                      onChange={() => setMcqCorrectIndex(index)}
                                      title="Correct answer"
                                      type="radio"
                                    />
                                  </span>
                                  <input
                                    className="form-control"
                                    onChange={(event) =>
                                      setMcqChoices((current) =>
                                        current.map((entry, choiceIndex) =>
                                          choiceIndex === index ? event.target.value : entry
                                        )
                                      )
                                    }
                                    placeholder={`Choice ${index + 1}`}
                                    value={choice}
                                  />
                                  <button
                                    className="btn btn-outline-danger"
                                    disabled={mcqChoices.length <= 2}
                                    onClick={() => {
                                      setMcqChoices((current) =>
                                        current.filter((_, choiceIndex) => choiceIndex !== index)
                                      );
                                      setMcqCorrectIndex((current) =>
                                        current >= index && current > 0 ? current - 1 : current
                                      );
                                    }}
                                    type="button"
                                  >
                                    Remove
                                  </button>
                                </div>
                              ))}
                            </div>
                            <p className="mb-0 mt-2 text-xs text-slate-600">
                              Mark one radio button to set the correct answer.
                            </p>
                          </div>
                        </div>
                      </>
                    ) : null}

                    {itemType === "identification_assessment" ? (
                      <>
                        <div>
                          <label className="form-label fw-semibold">Question</label>
                          <input
                            className="form-control"
                            onChange={(event) => setItemQuestion(event.target.value)}
                            placeholder="What gesture is shown?"
                            value={itemQuestion}
                          />
                        </div>
                        <div>
                          <label className="form-label fw-semibold">Correct Answer</label>
                          <input
                            className="form-control"
                            onChange={(event) => setItemAnswer(event.target.value)}
                            placeholder="Example: LETTER B"
                            value={itemAnswer}
                          />
                        </div>
                        <div>
                          <label className="form-label fw-semibold">Accepted Answers (Optional)</label>
                          <textarea
                            className="form-control"
                            onChange={(event) => setItemAcceptedAnswers(event.target.value)}
                            placeholder="Add aliases separated by comma or new line."
                            rows={3}
                            value={itemAcceptedAnswers}
                          />
                        </div>
                        <div>
                          <label className="form-label fw-semibold">Prompt Media (Image or Video)</label>
                          <input
                            accept={IDENTIFICATION_PROMPT_ACCEPT}
                            className="form-control"
                            onChange={(event) => setIdentificationPromptFile(event.target.files?.[0] ?? null)}
                            type="file"
                          />
                          <div className="form-text">
                            Students will guess the sign based on this uploaded image/video.
                          </div>
                        </div>
                      </>
                    ) : null}

                    {itemType === "signing_lab_assessment" ? (
                      <>
                        <div>
                          <label className="form-label fw-semibold">Camera Interface Type</label>
                          <select
                            className="form-select"
                            onChange={(event) => setSigningLabMode(event.target.value as RecognitionMode)}
                            value={signingLabMode}
                          >
                            {LAB_MODE_OPTIONS.map((entry) => (
                              <option key={entry.value} value={entry.value}>
                                {entry.label}
                              </option>
                            ))}
                          </select>
                        </div>
                        {signingLabMode === "numbers" ? (
                          <div>
                            <label className="form-label fw-semibold">Numbers Range</label>
                            <select
                              className="form-select"
                              onChange={(event) =>
                                setSigningLabNumbersRange(event.target.value as NumbersCategory)
                              }
                              value={signingLabNumbersRange}
                            >
                              {NUMBER_RANGE_OPTIONS.map((entry) => (
                                <option key={entry.value} value={entry.value}>
                                  {entry.label}
                                </option>
                              ))}
                            </select>
                            <div className="form-text">
                              Students must choose this range first in the camera interface (example: 11-20).
                            </div>
                          </div>
                        ) : null}
                        {signingLabMode === "words" ? (
                          <div>
                            <label className="form-label fw-semibold">Words Classification</label>
                            <select
                              className="form-select"
                              onChange={(event) =>
                                setSigningLabWordsCategory(event.target.value as WordsCategory)
                              }
                              value={signingLabWordsCategory}
                            >
                              {WORD_CATEGORY_OPTIONS.map((entry) => (
                                <option key={entry.value} value={entry.value}>
                                  {entry.label}
                                </option>
                              ))}
                            </select>
                            <div className="form-text">
                              This uses the same word classifications available in the free signing lab.
                            </div>
                          </div>
                        ) : null}
                        <div>
                          <label className="form-label fw-semibold">Prompt</label>
                          <input
                            className="form-control"
                            onChange={(event) => setItemQuestion(event.target.value)}
                            placeholder="Sign the word shown below."
                            value={itemQuestion}
                          />
                        </div>
                        <div>
                          <label className="form-label fw-semibold">Expected Word / Phrase</label>
                          <input
                            className="form-control"
                            onChange={(event) => setItemAnswer(event.target.value)}
                            placeholder="Example: GOOD MORNING"
                            value={itemAnswer}
                          />
                        </div>
                      </>
                    ) : null}

                    <div className="d-flex flex-wrap gap-2">
                      <button className="btn btn-primary" disabled={isSavingItem} type="submit">
                        {isSavingItem ? "Saving..." : isEditingItem ? "Update Item" : "Add Item"}
                      </button>
                      {isEditingItem ? (
                        <button
                          className="btn btn-outline-secondary"
                          onClick={() => clearItemBuilder()}
                          type="button"
                        >
                          Cancel Edit
                        </button>
                      ) : null}
                    </div>
                  </form>
                </div>
              </div>

              <div className="col-xl-7">
                <div className="panel h-100">
                  <h3 className="h5 fw-bold mb-3">Module Items</h3>
                  <div className="vstack gap-3">
                    {selectedModule.items.map((item) => {
                      const attachments = getItemAttachments(item);
                      const promptMedia = getPromptMedia(item);
                      const signingConfig = getSigningLabConfig(item);
                      return (
                        <article className="card border-brandBorder shadow-sm" key={item.id}>
                          <div className="card-body">
                            <div className="d-flex flex-wrap justify-content-between gap-3">
                              <div>
                                <p className="mb-1 text-uppercase text-xs tracking-[0.16em] text-slate-500">
                                  Topic {item.order_index} - {displayItemTypeLabel(item.item_type)}
                                </p>
                                <h4 className="h6 fw-bold mb-1">{item.title}</h4>
                                <p className="mb-0 text-sm text-slate-700">
                                  {item.instructions || "No instructions yet."}
                                </p>
                              </div>
                              <span className="badge rounded-pill text-bg-light border">
                                {item.is_published ? "Live" : "Draft"}
                              </span>
                            </div>

                            {item.content_text ? (
                              <p className="mt-3 mb-0 rounded-3 bg-brandOffWhite px-3 py-2 text-sm text-slate-700">
                                {item.content_text}
                              </p>
                            ) : null}

                            {attachments.length > 0 ? (
                              <p className="mt-3 mb-0 text-sm text-slate-700">
                                Attachments: <span className="fw-semibold">{attachments.length}</span>
                              </p>
                            ) : null}
                            {item.item_type === "readable" ? (
                              <p className="mt-1 mb-0 text-sm text-slate-700">
                                Format:{" "}
                                <span className="fw-semibold">
                                  {readableModeLabel(parseReadablePresentationMode(item.config.presentation_mode))}
                                </span>
                              </p>
                            ) : null}

                            {promptMedia ? (
                              <p className="mt-2 mb-0 text-sm text-slate-700">
                                Prompt media: <span className="fw-semibold">{promptMedia.resource_file_name}</span>
                              </p>
                            ) : null}
                            {signingConfig ? (
                              <div className="mt-2 text-sm text-slate-700">
                                <p className="mb-1">
                                  Camera type:{" "}
                                  <span className="fw-semibold">{displayType(signingConfig.mode)}</span>
                                </p>
                                {signingConfig.mode === "numbers" ? (
                                  <p className="mb-1">
                                    Numbers range:{" "}
                                    <span className="fw-semibold">
                                      {displayNumbersRangeLabel(signingConfig.numbersCategory)}
                                    </span>
                                  </p>
                                ) : null}
                                {signingConfig.mode === "words" ? (
                                  <p className="mb-0">
                                    Words category:{" "}
                                    <span className="fw-semibold">
                                      {displayWordsCategoryLabel(signingConfig.wordsCategory)}
                                    </span>
                                  </p>
                                ) : null}
                              </div>
                            ) : null}
                            <div className="d-flex flex-wrap gap-2 mt-3">
                              <button
                                className="btn btn-sm btn-outline-secondary"
                                onClick={() => openPreview(item)}
                                type="button"
                              >
                                Preview
                              </button>
                              <button
                                className="btn btn-sm btn-outline-primary"
                                onClick={() => beginEditItem(item)}
                                type="button"
                              >
                                Edit
                              </button>
                              <button
                                className="btn btn-sm btn-outline-danger"
                                disabled={deletingItemId === item.id}
                                onClick={() => void onDeleteItem(item)}
                                type="button"
                              >
                                {deletingItemId === item.id ? "Deleting..." : "Delete"}
                              </button>
                            </div>
                          </div>
                        </article>
                      );
                    })}
                    {selectedModule.items.length === 0 ? (
                      <p className="mb-0 text-sm text-slate-600">No items yet. Add your first item.</p>
                    ) : null}
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="panel">
              <p className="mb-0 text-sm text-slate-700">Choose a module first to start adding readable and assessments.</p>
            </div>
          )}
        </>
      ) : null}

      {previewItem ? (
        <div
          aria-modal="true"
          className="modal fade show d-block"
          role="dialog"
          style={{ backgroundColor: "rgba(15, 23, 42, 0.45)" }}
        >
          <div className="modal-dialog modal-lg modal-dialog-centered">
            <div className="modal-content">
              <div className="modal-header">
                <h5 className="modal-title">
                  Preview: {previewItem.title}
                  <span className="text-muted ms-2 small">({displayItemTypeLabel(previewItem.item_type)})</span>
                </h5>
                <button aria-label="Close" className="btn-close" onClick={closePreview} type="button" />
              </div>
              <div className="modal-body">{renderItemPreviewBody(previewItem)}</div>
              <div className="modal-footer">
                <button className="btn btn-secondary" onClick={closePreview} type="button">
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
