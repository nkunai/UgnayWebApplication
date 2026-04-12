"use client";

import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { useSearchParams } from "next/navigation";

import {
  getAlphabetModelStatus,
  getNumbersModelStatus,
  getWordsModelStatus,
  LabPrediction,
  NumbersCategory,
  RecognitionMode,
  WordsCategory,
  predictNumbersFromFrames,
  predictSignFromImage,
  predictWordsFromFrames,
} from "@/lib/api";

type SigningLabVariant = "student" | "teacher";

type SigningLabProps = {
  variant?: SigningLabVariant;
  preferredMode?: RecognitionMode;
  preferredNumbersCategory?: NumbersCategory;
  preferredWordsCategory?: WordsCategory;
};

type CaptureOptions = {
  maxWidth?: number;
  maxHeight?: number;
  jpegQuality?: number;
  cropToGuideBox?: boolean;
};

const GUIDE_BOX_RATIO = 0.56;
const GUIDE_BOX_WARNING = "Please sign inside the box. Anything outside the box will not be analyzed.";
const RECOGNIZED_INPUT_NAV_KEYS = new Set([
  "ArrowLeft",
  "ArrowRight",
  "ArrowUp",
  "ArrowDown",
  "Home",
  "End",
  "Tab",
  "Shift",
  "Control",
  "Alt",
  "Meta",
  "Escape",
]);

const NUMBER_CATEGORY_VALUES: NumbersCategory[] = [
  "0-10",
  "11-20",
  "21-30",
  "31-40",
  "41-50",
  "51-60",
  "61-70",
  "71-80",
  "81-90",
  "91-100",
];

const WORD_CATEGORY_VALUES: WordsCategory[] = [
  "greeting",
  "responses",
  "date",
  "family",
  "relationship",
  "color",
];

function parseRecognitionMode(value: string | null): RecognitionMode | null {
  return value === "alphabet" || value === "numbers" || value === "words" ? value : null;
}

function parseNumbersCategoryParam(value: string | null): NumbersCategory | null {
  if (!value) {
    return null;
  }
  const normalized = value.trim().toLowerCase();
  if (normalized === "1-10") {
    return "0-10";
  }
  return NUMBER_CATEGORY_VALUES.includes(normalized as NumbersCategory)
    ? (normalized as NumbersCategory)
    : null;
}

function parseWordsCategoryParam(value: string | null): WordsCategory | null {
  if (!value) {
    return null;
  }
  const normalized = value.trim().toLowerCase();
  const aliases: Record<string, WordsCategory> = {
    greetings: "greeting",
    response: "responses",
    responses: "responses",
    days: "date",
    dates: "date",
    relationships: "relationship",
    people: "relationship",
    colors: "color",
  };
  const candidate = aliases[normalized] ?? normalized;
  return WORD_CATEGORY_VALUES.includes(candidate as WordsCategory)
    ? (candidate as WordsCategory)
    : null;
}

function formatResultTime(value: number | null) {
  if (!value) {
    return "No test run yet.";
  }

  try {
    return new Intl.DateTimeFormat("en-PH", {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(value));
  } catch {
    return "Latest test captured.";
  }
}

function appendAlphabetText(previous: string, token: string) {
  const normalized = token.trim();
  if (!normalized || normalized === "UNSURE" || normalized === "No prediction yet.") {
    return previous;
  }

  if (normalized.toUpperCase() === "SPACE") {
    if (!previous || previous.endsWith(" ")) {
      return previous;
    }
    return `${previous} `;
  }

  return `${previous}${normalized}`;
}

export function SigningLab({
  variant = "student",
  preferredMode,
  preferredNumbersCategory,
  preferredWordsCategory,
}: SigningLabProps) {
  const REPEAT_TOKEN_COOLDOWN_MS = 1400;
  const isTeacherTester = variant === "teacher";
  const searchParams = useSearchParams();

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const predictionInFlightRef = useRef(false);
  const wordsHistoryRef = useRef<LabPrediction[]>([]);
  const predictionRef = useRef("No prediction yet.");
  const recognizedInputRef = useRef<HTMLInputElement | null>(null);
  const blockedTokenRef = useRef<string | null>(null);
  const modeCheckRef = useRef<{ key: string; ready: boolean; message: string } | null>(null);
  const lastAcceptedRef = useRef<{ token: string | null; at: number }>({
    token: null,
    at: 0,
  });

  const [prediction, setPrediction] = useState<string>("No prediction yet.");
  const [confidence, setConfidence] = useState<number | null>(null);
  const [topCandidates, setTopCandidates] = useState<string[]>([]);
  const [mode, setMode] = useState<RecognitionMode>("alphabet");
  const [numbersCategory, setNumbersCategory] = useState<NumbersCategory>("0-10");
  const [wordsCategory, setWordsCategory] = useState<WordsCategory>("greeting");
  const [captureStatus, setCaptureStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [predicting, setPredicting] = useState(false);
  const [warmingModel, setWarmingModel] = useState(false);
  const [modeStatusMessage, setModeStatusMessage] = useState<string | null>(null);
  const [modeReady, setModeReady] = useState<boolean | null>(null);
  const [recognizedInput, setRecognizedInput] = useState("");
  const [lastRecognizedToken, setLastRecognizedToken] = useState<string | null>(null);
  const [blockedTokenAfterClear, setBlockedTokenAfterClear] = useState<string | null>(null);
  const [lastTestedAt, setLastTestedAt] = useState<number | null>(null);
  const [guideBoxWarning, setGuideBoxWarning] = useState<string | null>(null);

  const isSequenceMode = mode === "numbers" || mode === "words";
  const modeParam = searchParams.get("mode");
  const numbersParam = searchParams.get("numbers");
  const wordsParam = searchParams.get("words");

  useEffect(() => {
    predictionRef.current = prediction;
  }, [prediction]);

  useEffect(() => {
    blockedTokenRef.current = blockedTokenAfterClear;
  }, [blockedTokenAfterClear]);

  useEffect(() => {
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
      }
    };
  }, []);

  useEffect(() => {
    setError(null);
    setModeStatusMessage(null);
    setModeReady(null);
    setConfidence(null);
    setTopCandidates([]);
    setPrediction("No prediction yet.");
    setCaptureStatus(null);
    setRecognizedInput("");
    setLastRecognizedToken(null);
    setBlockedTokenAfterClear(null);
    setLastTestedAt(null);
    setGuideBoxWarning(null);
    lastAcceptedRef.current = { token: null, at: 0 };
    wordsHistoryRef.current = [];
  }, [mode, isSequenceMode]);

  useEffect(() => {
    const presetMode = parseRecognitionMode(modeParam);
    if (!presetMode) {
      return;
    }
    setMode(presetMode);
    if (presetMode === "numbers") {
      const presetNumbersCategory = parseNumbersCategoryParam(numbersParam);
      if (presetNumbersCategory) {
        setNumbersCategory(presetNumbersCategory);
      }
    }
    if (presetMode === "words") {
      const presetWordsCategory = parseWordsCategoryParam(wordsParam);
      if (presetWordsCategory) {
        setWordsCategory(presetWordsCategory);
      }
    }
  }, [modeParam, numbersParam, wordsParam]);

  useEffect(() => {
    if (mode !== "words") {
      return;
    }
    wordsHistoryRef.current = [];
    setError(null);
    setConfidence(null);
    setTopCandidates([]);
    setPrediction("No prediction yet.");
    setCaptureStatus(null);
    setRecognizedInput("");
    setLastRecognizedToken(null);
    setBlockedTokenAfterClear(null);
    setLastTestedAt(null);
    setGuideBoxWarning(null);
    lastAcceptedRef.current = { token: null, at: 0 };
  }, [wordsCategory, mode]);

  useEffect(() => {
    if (mode !== "numbers") {
      return;
    }
    setError(null);
    setConfidence(null);
    setTopCandidates([]);
    setPrediction("No prediction yet.");
    setCaptureStatus(null);
    setRecognizedInput("");
    setLastRecognizedToken(null);
    setBlockedTokenAfterClear(null);
    setLastTestedAt(null);
    setGuideBoxWarning(null);
    lastAcceptedRef.current = { token: null, at: 0 };
  }, [numbersCategory, mode]);

  useEffect(() => {
    if (isTeacherTester || mode === "alphabet") {
      return;
    }

    const token = prediction.trim();
    if (!token || token === "No prediction yet." || token === "UNSURE") {
      return;
    }
    if (blockedTokenAfterClear && token === blockedTokenAfterClear) {
      return;
    }
    if (blockedTokenAfterClear && token !== blockedTokenAfterClear) {
      setBlockedTokenAfterClear(null);
    }
    const now = Date.now();
    const lastToken = lastAcceptedRef.current.token;
    const elapsed = now - lastAcceptedRef.current.at;
    if (token === lastToken && elapsed < REPEAT_TOKEN_COOLDOWN_MS) {
      return;
    }
    setRecognizedInput((previous) => (previous ? `${previous} ${token}` : token));
    setLastRecognizedToken(token);
    lastAcceptedRef.current = { token, at: now };
  }, [prediction, lastRecognizedToken, blockedTokenAfterClear, mode, isTeacherTester]);

  function setRecognizedInputWithCaret(nextValue: string, caretPosition: number) {
    setRecognizedInput(nextValue);
    window.requestAnimationFrame(() => {
      const input = recognizedInputRef.current;
      if (!input) {
        return;
      }
      input.focus();
      input.setSelectionRange(caretPosition, caretPosition);
    });
  }

  function handleRecognizedInputKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (mode !== "alphabet") {
      return;
    }

    const input = event.currentTarget;
    const selectionStart = input.selectionStart ?? recognizedInput.length;
    const selectionEnd = input.selectionEnd ?? recognizedInput.length;

    if (event.key === "Backspace") {
      event.preventDefault();
      if (!recognizedInput) {
        return;
      }

      if (selectionEnd > selectionStart) {
        const nextValue =
          recognizedInput.slice(0, selectionStart) + recognizedInput.slice(selectionEnd);
        setRecognizedInputWithCaret(nextValue, selectionStart);
        return;
      }

      if (selectionStart === 0) {
        return;
      }

      const nextCaret = selectionStart - 1;
      const nextValue =
        recognizedInput.slice(0, nextCaret) + recognizedInput.slice(selectionStart);
      setRecognizedInputWithCaret(nextValue, nextCaret);
      return;
    }

    if (event.key === " ") {
      event.preventDefault();
      const nextValue =
        recognizedInput.slice(0, selectionStart) + " " + recognizedInput.slice(selectionEnd);
      setRecognizedInputWithCaret(nextValue, selectionStart + 1);
      return;
    }

    if (RECOGNIZED_INPUT_NAV_KEYS.has(event.key)) {
      return;
    }

    if ((event.ctrlKey || event.metaKey) && ["a", "c", "x"].includes(event.key.toLowerCase())) {
      return;
    }

    event.preventDefault();
  }

  async function startCamera() {
    setError(null);
    modeCheckRef.current = null;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
      setRunning(true);
      await ensureSelectedModeReady({ fromCamera: true });
    } catch {
      setError("Unable to access camera. Check browser permissions.");
    }
  }

  function stopCamera() {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    wordsHistoryRef.current = [];
    setCaptureStatus(null);
    setGuideBoxWarning(null);
    setRunning(false);
  }

  async function toggleCamera() {
    if (running) {
      stopCamera();
      return;
    }
    await startCamera();
  }

  async function captureCurrentFrameAsFile(options?: CaptureOptions): Promise<File | null> {
    if (!videoRef.current || !running) {
      return null;
    }

    const video = videoRef.current;
    const sourceWidth = video.videoWidth || 640;
    const sourceHeight = video.videoHeight || 480;
    if (sourceWidth <= 0 || sourceHeight <= 0) {
      return null;
    }

    const cropToGuideBox = options?.cropToGuideBox ?? true;
    const cropWidth = cropToGuideBox ? Math.round(sourceWidth * GUIDE_BOX_RATIO) : sourceWidth;
    const cropHeight = cropToGuideBox ? Math.round(sourceHeight * GUIDE_BOX_RATIO) : sourceHeight;
    const cropX = cropToGuideBox ? Math.round((sourceWidth - cropWidth) / 2) : 0;
    const cropY = cropToGuideBox ? Math.round((sourceHeight - cropHeight) / 2) : 0;

    const maxWidth = options?.maxWidth ?? cropWidth;
    const maxHeight = options?.maxHeight ?? cropHeight;
    const scale = Math.min(1, maxWidth / cropWidth, maxHeight / cropHeight);
    const height = Math.max(1, Math.round(cropHeight * scale));
    const normalizedWidth = Math.max(1, Math.round(cropWidth * scale));

    const canvas = document.createElement("canvas");
    canvas.width = normalizedWidth;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) {
      return null;
    }

    context.drawImage(
      video,
      cropX,
      cropY,
      cropWidth,
      cropHeight,
      0,
      0,
      normalizedWidth,
      height
    );
    const blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob((value) => resolve(value), "image/jpeg", options?.jpegQuality ?? 0.95);
    });
    if (!blob) {
      return null;
    }
    return new File([blob], "camera-frame.jpg", { type: "image/jpeg" });
  }

  async function captureFrameSequence(
    frameCount: number,
    delayMs: number,
    options?: CaptureOptions
  ): Promise<File[]> {
    const frames: File[] = [];
    for (let index = 0; index < frameCount; index += 1) {
      const frame = await captureCurrentFrameAsFile(options);
      if (frame) {
        frames.push(frame);
      }
      if (index < frameCount - 1) {
        await sleep(delayMs);
      }
    }
    return frames;
  }

  function sleep(milliseconds: number) {
    return new Promise((resolve) => setTimeout(resolve, milliseconds));
  }

  function selectedModeKey() {
    if (mode === "numbers") {
      return `numbers:${numbersCategory}`;
    }
    if (mode === "words") {
      return `words:${wordsCategory}`;
    }
    return "alphabet";
  }

  async function ensureSelectedModeReady(options?: { fromCamera?: boolean }): Promise<boolean> {
    const currentKey = selectedModeKey();
    const cached = modeCheckRef.current;
    if (cached && cached.key === currentKey) {
      setModeReady(cached.ready);
      setModeStatusMessage(cached.message);
      if (!cached.ready) {
        setError(cached.message);
      }
      if (options?.fromCamera) {
        setCaptureStatus(
          cached.ready
            ? cached.message
            : `Camera ready, but ${mode === "numbers" ? "the selected numbers range" : mode} recognition is unavailable.`
        );
      }
      return cached.ready;
    }

    setWarmingModel(true);
    setError(null);

    try {
      if (mode === "alphabet") {
        const status = await getAlphabetModelStatus();
        if (!status.ready) {
          const message =
            "Alphabet recognition is unavailable because the trained model artifact is missing. Run scripts/train_alphabet_model.py to create backend/artifacts/alphabet_model.joblib.";
          modeCheckRef.current = { key: currentKey, ready: false, message };
          setModeReady(false);
          setModeStatusMessage(message);
          setError(message);
          if (options?.fromCamera) {
            setCaptureStatus("Camera ready, but alphabet recognition is unavailable.");
          }
          return false;
        }

        modeCheckRef.current = {
          key: currentKey,
          ready: true,
          message: "Alphabet model loaded and ready.",
        };
        setModeReady(true);
        setModeStatusMessage("Alphabet model loaded and ready.");
        if (options?.fromCamera) {
          setCaptureStatus("Camera ready. Alphabet model warmed.");
        }
        return true;
      }

      if (mode === "numbers") {
        const status = await getNumbersModelStatus();
        const isStaticRange = numbersCategory === "0-10";

        if (isStaticRange && !status.ready) {
          const message =
            "Numbers 1-10 recognition is unavailable because the trained model artifact is missing. Run scripts/train_numbers_model.py to create backend/artifacts/numbers_model.joblib.";
          modeCheckRef.current = { key: currentKey, ready: false, message };
          setModeReady(false);
          setModeStatusMessage(message);
          setError(message);
          if (options?.fromCamera) {
            setCaptureStatus("Camera ready, but numbers 1-10 recognition is unavailable.");
          }
          return false;
        }

        if (!isStaticRange && !status.motion_ready) {
          const message = `Numbers ${numbersCategory} recognition is unavailable because the motion model artifact is missing. Run scripts/train_numbers_motion_model.py to create backend/artifacts/numbers_motion_model.joblib.`;
          modeCheckRef.current = { key: currentKey, ready: false, message };
          setModeReady(false);
          setModeStatusMessage(message);
          setError(message);
          if (options?.fromCamera) {
            setCaptureStatus(
              `Camera ready, but numbers ${numbersCategory} recognition is unavailable.`
            );
          }
          return false;
        }

        const message = isStaticRange
          ? status.ten_motion_ready
            ? "Numbers 1-10 models loaded and ready."
            : "Numbers 1-10 static model loaded. Ten-motion assist is unavailable, but static recognition is ready."
          : `Numbers ${numbersCategory} motion model loaded and ready.`;
        modeCheckRef.current = { key: currentKey, ready: true, message };
        setModeReady(true);
        setModeStatusMessage(message);
        if (options?.fromCamera) {
          setCaptureStatus(
            isStaticRange
              ? "Camera ready. Numbers 1-10 model warmed."
              : `Camera ready. Numbers ${numbersCategory} model warmed.`
          );
        }
        return true;
      }

      const status = await getWordsModelStatus();
      if (!status.ready) {
        const message =
          "Words recognition is unavailable because the trained model artifact is missing. Run scripts/train_words_model.py to create backend/artifacts/words_model.joblib.";
        modeCheckRef.current = { key: currentKey, ready: false, message };
        setModeReady(false);
        setModeStatusMessage(message);
        setError(message);
        if (options?.fromCamera) {
          setCaptureStatus("Camera ready, but words recognition is unavailable.");
        }
        return false;
      }

      modeCheckRef.current = {
        key: currentKey,
        ready: true,
        message: "Words sequence model loaded and ready.",
      };
      setModeReady(true);
      setModeStatusMessage("Words sequence model loaded and ready.");
      if (options?.fromCamera) {
        setCaptureStatus("Camera ready. Words model warmed.");
      }
      return true;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unable to verify model readiness.";
      modeCheckRef.current = { key: currentKey, ready: false, message };
      setModeReady(false);
      setModeStatusMessage(message);
      setError(message);
      return false;
    } finally {
      setWarmingModel(false);
    }
  }

  async function runCaptureCountdown(seconds: number, autoMode: boolean) {
    if (autoMode) {
      setCaptureStatus(
        isTeacherTester
          ? "Live recognition active: keep one gesture centered in view."
          : "Auto capture: hold your gesture in view."
      );
      return;
    }
    for (let remaining = seconds; remaining >= 1; remaining -= 1) {
      setCaptureStatus(`Get ready... ${remaining} (not capturing yet)`);
      await sleep(550);
    }
    setCaptureStatus("Sign now. Capture starts...");
    await sleep(220);
  }

  function chooseStablePrediction(samples: LabPrediction[]): LabPrediction {
    if (samples.length === 1) {
      return samples[0];
    }

    const confidentSamples = samples.filter((sample) => sample.prediction !== "UNSURE");
    const source = confidentSamples.length > 0 ? confidentSamples : samples;

    const byLabel = new Map<
      string,
      { score: number; count: number; bestConfidence: number; sample: LabPrediction }
    >();

    for (const sample of source) {
      const previous = byLabel.get(sample.prediction);
      const weightedScore = sample.confidence + (sample.prediction === "UNSURE" ? 0 : 0.15);
      if (!previous) {
        byLabel.set(sample.prediction, {
          score: weightedScore,
          count: 1,
          bestConfidence: sample.confidence,
          sample,
        });
        continue;
      }

      byLabel.set(sample.prediction, {
        score: previous.score + weightedScore,
        count: previous.count + 1,
        bestConfidence: Math.max(previous.bestConfidence, sample.confidence),
        sample: sample.confidence >= previous.bestConfidence ? sample : previous.sample,
      });
    }

    return [...byLabel.values()].sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      if (b.count !== a.count) return b.count - a.count;
      return b.bestConfidence - a.bestConfidence;
    })[0].sample;
  }

  function chooseStableWordsPrediction(samples: LabPrediction[]): LabPrediction {
    const picked = chooseStablePrediction(samples);
    const matched = samples.filter((sample) => sample.prediction === picked.prediction);
    if (matched.length === 0) {
      return picked;
    }

    const averageConfidence =
      matched.reduce((total, sample) => total + sample.confidence, 0) / matched.length;
    const agreementRatio = matched.length / samples.length;
    const mergedCandidates: string[] = [picked.prediction];
    for (const sample of matched) {
      for (const candidate of sample.top_candidates) {
        if (!mergedCandidates.includes(candidate)) {
          mergedCandidates.push(candidate);
        }
      }
    }

    return {
      prediction: picked.prediction,
      confidence: Math.min(0.99, averageConfidence * 0.78 + agreementRatio * 0.22),
      top_candidates: mergedCandidates.slice(0, 3),
    };
  }

  function markPredictionResult(result: LabPrediction) {
    setPrediction(result.prediction);
    setConfidence(result.confidence);
    setTopCandidates(result.top_candidates);
    setLastTestedAt(Date.now());
  }

  async function runStaticPrediction() {
    if (!running || predictionInFlightRef.current) {
      return;
    }
    if (!(await ensureSelectedModeReady())) {
      return;
    }
    predictionInFlightRef.current = true;
    setError(null);
    setGuideBoxWarning(null);
    setPredicting(true);

    try {
      const attempts = 3;
      const samples: LabPrediction[] = [];
      let noHandInGuideBoxCount = 0;
      for (let index = 0; index < attempts; index += 1) {
        const frame = await captureCurrentFrameAsFile({ cropToGuideBox: true });
        if (!frame) {
          continue;
        }
        try {
          const sample = await predictSignFromImage(frame, mode);
          samples.push(sample);
        } catch (requestError) {
          const message = requestError instanceof Error ? requestError.message : "";
          if (message.toLowerCase().includes("no hand detected")) {
            noHandInGuideBoxCount += 1;
          }
          // Keep trying next frame to improve chance of finding a clear hand.
        }
        if (index < attempts - 1) {
          await sleep(100);
        }
      }

      if (samples.length === 0) {
        if (noHandInGuideBoxCount > 0) {
          setGuideBoxWarning(GUIDE_BOX_WARNING);
          setError("No hand was detected inside the guide box.");
        } else {
          setError("No clear hand was detected. Keep one hand centered and try again.");
        }
        return;
      }

      const result = chooseStablePrediction(samples);
      markPredictionResult(result);
      if (!isTeacherTester && mode === "alphabet") {
        setRecognizedInput((previous) => appendAlphabetText(previous, result.prediction));
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Prediction failed";
      setError(message);
    } finally {
      setPredicting(false);
      predictionInFlightRef.current = false;
    }
  }

  async function runWordsPrediction() {
    if (!running || predictionInFlightRef.current) {
      return;
    }
    if (!(await ensureSelectedModeReady())) {
      return;
    }
    predictionInFlightRef.current = true;
    setError(null);
    setGuideBoxWarning(null);
    setPredicting(true);

    try {
      await runCaptureCountdown(3, false);

      const samples: LabPrediction[] = [];
      const isPhraseHeavyCategory =
        wordsCategory === "greeting" ||
        wordsCategory === "responses" ||
        wordsCategory === "family" ||
        wordsCategory === "relationship";
      const firstPassFrames = isPhraseHeavyCategory ? 18 : 15;
      const firstPassDelay = isPhraseHeavyCategory ? 65 : 55;
      const fallbackPassFrames = isPhraseHeavyCategory ? 14 : 12;
      const fallbackPassDelay = isPhraseHeavyCategory ? 70 : 65;
      const fallbackThreshold = isPhraseHeavyCategory ? 0.68 : 0.62;
      const captureProfile = {
        maxWidth: isPhraseHeavyCategory ? 800 : 720,
        maxHeight: isPhraseHeavyCategory ? 600 : 540,
        jpegQuality: isPhraseHeavyCategory ? 0.9 : 0.86,
      };

      setCaptureStatus("Capturing gesture...");
      const firstPass = await captureFrameSequence(firstPassFrames, firstPassDelay, {
        ...captureProfile,
        cropToGuideBox: true,
      });

      if (firstPass.length < 8) {
        setError("Not enough clear frames. Keep one hand centered and try again.");
        return;
      }

      try {
        const quickSample = await predictWordsFromFrames(firstPass, undefined, wordsCategory);
        samples.push(quickSample);
      } catch {
        // Continue to fallback pass.
      }

      const needsFallbackPass =
        samples.length === 0 ||
        samples[0].prediction === "UNSURE" ||
        samples[0].confidence < fallbackThreshold;

      if (needsFallbackPass) {
        setCaptureStatus("Capturing gesture...");
        await sleep(90);
        const fallbackPass = await captureFrameSequence(fallbackPassFrames, fallbackPassDelay, {
          ...captureProfile,
          cropToGuideBox: true,
        });
        if (fallbackPass.length >= 8) {
          try {
            const fallbackSample = await predictWordsFromFrames(
              fallbackPass,
              undefined,
              wordsCategory
            );
            samples.push(fallbackSample);
          } catch {
            // Keep the quick sample result if fallback call fails.
          }
        }
      }

      setCaptureStatus("Capture complete. You can remove your hand.");
      await sleep(180);

      if (samples.length === 0) {
        setError("Not enough clear frames. Keep one hand centered and try again.");
        return;
      }

      setCaptureStatus("Analyzing captured gesture...");
      const immediateResult = chooseStableWordsPrediction(samples);
      wordsHistoryRef.current = [immediateResult];
      markPredictionResult(immediateResult);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Words prediction failed";
      const normalized = message.toLowerCase();
      if (normalized.includes("no hand detected") || normalized.includes("no clear hand")) {
        setGuideBoxWarning(GUIDE_BOX_WARNING);
        setError("No hand was detected inside the guide box.");
      } else {
        setError(message);
      }
    } finally {
      setPredicting(false);
      window.setTimeout(() => setCaptureStatus(null), 1200);
      predictionInFlightRef.current = false;
    }
  }

  async function runNumbersPrediction() {
    if (!running || predictionInFlightRef.current) {
      return;
    }
    if (!(await ensureSelectedModeReady())) {
      return;
    }
    predictionInFlightRef.current = true;
    setError(null);
    setGuideBoxWarning(null);
    setPredicting(true);

    try {
      const isDynamicRange = numbersCategory !== "0-10";
      const frameCount = isDynamicRange ? 16 : 12;
      const frameDelay = isDynamicRange ? 85 : 90;
      const minimumFrames = isDynamicRange ? 10 : 8;
      const captureProfile = isDynamicRange
        ? {
            maxWidth: 720,
            maxHeight: 540,
            jpegQuality: 0.88,
          }
        : {
            maxWidth: 760,
            maxHeight: 560,
            jpegQuality: 0.9,
          };

      await runCaptureCountdown(3, false);
      setCaptureStatus(isDynamicRange ? "Capturing gesture for 11-100..." : "Capturing gesture...");
      const sequence = await captureFrameSequence(frameCount, frameDelay, captureProfile);
      if (sequence.length < minimumFrames) {
        setError("Not enough clear frames. Keep one hand centered and try again.");
        return;
      }
      setCaptureStatus("Capture complete. You can remove your hand.");
      await sleep(160);
      setCaptureStatus("Analyzing captured gesture...");
      const result = await predictNumbersFromFrames(sequence, undefined, numbersCategory);
      markPredictionResult(result);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Numbers prediction failed";
      const normalized = message.toLowerCase();
      if (normalized.includes("no hand detected") || normalized.includes("no clear hand")) {
        setGuideBoxWarning(GUIDE_BOX_WARNING);
        setError("No hand was detected inside the guide box.");
      } else {
        setError(message);
      }
    } finally {
      setPredicting(false);
      window.setTimeout(() => setCaptureStatus(null), 1200);
      predictionInFlightRef.current = false;
    }
  }

  async function runPrediction() {
    if (mode === "numbers") {
      await runNumbersPrediction();
      return;
    }
    if (mode === "words") {
      await runWordsPrediction();
      return;
    }
    await runStaticPrediction();
  }

  useEffect(() => {
    if (!isTeacherTester || !running || isSequenceMode) {
      return;
    }

    void runPrediction();
    const interval = window.setInterval(() => {
      void runPrediction();
    }, 1200);

    return () => {
      window.clearInterval(interval);
    };
  }, [running, mode, isSequenceMode, wordsCategory, numbersCategory, isTeacherTester]);

  useEffect(() => {
    if (!running || predicting) {
      return;
    }
    void ensureSelectedModeReady({ fromCamera: true });
  }, [running, mode, numbersCategory, wordsCategory, predicting]);

  const sectionTitle = "Free Signing Lab";
  const sectionDescription =
    "Keep your hand inside the guide box, choose the correct range first, and use the manual analyze button when you are ready.";
  const modeLabel = isTeacherTester ? "Recognition Mode" : "What do you want to sign?";
  const actionLabel = "Analyze Sign Now";
  const outputLabel = "Prediction Output";
  const recognizedLabel = mode === "alphabet" ? "Recognized Text" : "Recognized Gesture";
  const recognizedPlaceholder =
    mode === "alphabet"
      ? "Detected letters will build here..."
      : "Recognized gesture/phrase appears here...";
  const idleStatus = isTeacherTester
    ? isSequenceMode
      ? `${mode === "words" ? "Words" : "Numbers"} mode ready`
      : "Alphabet mode ready"
    : isSequenceMode
      ? `${mode === "words" ? "Words" : "Numbers"} manual mode ready`
      : "Alphabet mode ready for manual analysis";
  const activeStatus = isTeacherTester
    ? "Analyzing gesture..."
    : isSequenceMode
      ? "Analyzing gesture sequence..."
      : "Live mode active";

  return (
    <section className="container-fluid px-0">
      {!isTeacherTester ? (
        <div className="card lms-bootstrap-card mb-3">
          <div className="card-body">
            <h2 className="h4 mb-2 fw-semibold text-gradient-brand">{sectionTitle}</h2>
            <p className="mb-0 text-muted">{sectionDescription}</p>
          </div>
        </div>
      ) : null}

      <div className="row g-3">
        <div className="col-lg-8">
          <div className="card lms-bootstrap-card h-100">
            <div className="card-body">
              <div className="position-relative overflow-hidden rounded-4 border border-secondary-subtle bg-dark">
            <video
              autoPlay
                  className="d-block w-100 lms-sign-video"
              muted
              playsInline
              ref={videoRef}
            />
                <div className="pointer-events-none position-absolute top-0 start-0 h-100 w-100 d-flex align-items-center justify-content-center">
                  <div className="lms-guide-box" />
                </div>
              </div>
              <div className="mt-2 d-flex flex-wrap align-items-center gap-2">
                <span className="badge rounded-pill border border-secondary-subtle bg-white text-uppercase fw-semibold text-dark">
                  Sign Here
                </span>
                <span className="badge rounded-pill lms-badge-brand text-uppercase fw-semibold">
                  Keep your hand inside the box
                </span>
              </div>
              {guideBoxWarning ? (
                <div className="alert alert-danger mt-2 mb-0 py-2 px-3 small fw-semibold" role="alert">
                  {guideBoxWarning}
                </div>
              ) : null}
              <div className="mt-3 d-flex flex-wrap align-items-center gap-2">
                <button
                  className={`btn ${running ? "btn-danger" : "btn-brand"} fw-semibold`}
                  onClick={() => {
                    void toggleCamera();
                  }}
                  type="button"
                >
                  {running ? "Stop Camera" : "Start Camera"}
                </button>
                <span className="badge rounded-pill lms-status-pill">
                  {captureStatus ??
                    (predicting ? activeStatus : running ? idleStatus : "Camera is off")}
                </span>
              </div>
            </div>
          </div>
        </div>

        <aside className="col-lg-4">
          <div className="card lms-bootstrap-card h-100">
            <div className="card-body">
              <label className="form-label lms-label" htmlFor="recognition-mode">
                {modeLabel}
              </label>
              <select
                className="form-select"
                id="recognition-mode"
                onChange={(event) => setMode(event.target.value as RecognitionMode)}
                value={mode}
              >
                <option value="alphabet">Alphabet</option>
                <option value="numbers">Numbers</option>
                <option value="words">Words</option>
              </select>

              {mode === "numbers" ? (
                <div className="mt-3">
                  <label className="form-label lms-label" htmlFor="numbers-category">
                    Numbers Range
                  </label>
                  <select
                    className="form-select"
                    id="numbers-category"
                    onChange={(event) => setNumbersCategory(event.target.value as NumbersCategory)}
                    value={numbersCategory}
                  >
                    <option value="0-10">1-10</option>
                    <option value="11-20">11-20</option>
                    <option value="21-30">21-30</option>
                    <option value="31-40">31-40</option>
                    <option value="41-50">41-50</option>
                    <option value="51-60">51-60</option>
                    <option value="61-70">61-70</option>
                    <option value="71-80">71-80</option>
                    <option value="81-90">81-90</option>
                    <option value="91-100">91-100</option>
                  </select>
                  <p className="mt-2 mb-0 small text-secondary">
                    Choose the range first. Example: if you want to sign 11-20, select 11-20 before analyzing.
                  </p>
                </div>
              ) : null}

              {mode === "words" ? (
                <div className="mt-3">
                  <label className="form-label lms-label" htmlFor="words-category">
                    Words Category
                  </label>
                  <select
                    className="form-select"
                    id="words-category"
                    onChange={(event) => setWordsCategory(event.target.value as WordsCategory)}
                    value={wordsCategory}
                  >
                    <option value="greeting">Greeting</option>
                    <option value="responses">Responses</option>
                    <option value="date">Days</option>
                    <option value="family">Family</option>
                    <option value="relationship">People</option>
                    <option value="color">Color</option>
                  </select>
                </div>
              ) : null}

              {!isTeacherTester && mode === "alphabet" ? (
                <div className="alert alert-warning mt-3 mb-0 py-2 px-3 small">
                  Alphabet mode is manual now. Keep one hand inside the focus box, then press Analyze Sign Now.
                </div>
              ) : null}

              {running ? (
                <div className="mt-3 d-flex flex-wrap gap-2">
                  <button
                    className="btn btn-brand fw-semibold"
                    disabled={!running || predicting || warmingModel || modeReady === false}
                    onClick={() => {
                      void runPrediction();
                    }}
                    type="button"
                  >
                    {warmingModel ? "Preparing Model..." : actionLabel}
                  </button>
                </div>
              ) : null}

              {modeStatusMessage ? (
                <div
                  className={`alert mt-3 mb-0 py-2 px-3 small ${
                    modeReady === false ? "alert-danger" : "alert-success"
                  }`}
                  role="status"
                >
                  {modeStatusMessage}
                </div>
              ) : null}

              <p className="lms-label mt-4 mb-1">{outputLabel}</p>
              <p className="display-6 mb-2 fw-bold lms-text-brand">{prediction}</p>
              <p className="mb-1 small text-secondary">
                Confidence: {confidence !== null ? `${Math.round(confidence * 100)}%` : "N/A"}
              </p>
              <p className="mb-0 small text-secondary">
                Top candidates: {topCandidates.length > 0 ? topCandidates.join(" | ") : "N/A"}
              </p>
              {isTeacherTester ? (
                <p className="mt-2 mb-0 small text-secondary">
                  Last result: {formatResultTime(lastTestedAt)}
                </p>
              ) : null}

              {isTeacherTester ? (
                <button
                  className="btn btn-outline-brand btn-sm mt-3"
                  onClick={() => {
                    setPrediction("No prediction yet.");
                    setConfidence(null);
                    setTopCandidates([]);
                    setLastTestedAt(null);
                    setError(null);
                  }}
                  type="button"
                >
                  Clear Result
                </button>
              ) : (
                <>
                  <label className="form-label lms-label mt-4 mb-1">{recognizedLabel}</label>
                  <input
                    autoComplete="off"
                    className="form-control"
                    onChange={() => {}}
                    onKeyDown={handleRecognizedInputKeyDown}
                    onDrop={(event) => event.preventDefault()}
                    onPaste={(event) => event.preventDefault()}
                    placeholder={recognizedPlaceholder}
                    readOnly={mode !== "alphabet"}
                    ref={recognizedInputRef}
                    spellCheck={false}
                    type="text"
                    value={recognizedInput}
                  />
                  {mode === "alphabet" ? (
                    <p className="mt-2 mb-0 small text-secondary">
                      You can use your keyboard Space and Backspace keys to edit this text.
                    </p>
                  ) : null}
                  <button
                    className="btn btn-outline-brand btn-sm mt-2"
                    onClick={() => {
                      const currentToken = prediction.trim();
                      if (
                        currentToken &&
                        currentToken !== "No prediction yet." &&
                        currentToken !== "UNSURE"
                      ) {
                        setBlockedTokenAfterClear(currentToken);
                      } else {
                        setBlockedTokenAfterClear(null);
                      }
                      setRecognizedInput("");
                      setPrediction("No prediction yet.");
                      setConfidence(null);
                      setTopCandidates([]);
                      lastAcceptedRef.current = { token: null, at: 0 };
                      setLastRecognizedToken(null);
                      setLastTestedAt(null);
                    }}
                    type="button"
                  >
                    Clear Input
                  </button>
                </>
              )}
            </div>
          </div>
        </aside>
      </div>

      {error ? (
        <div className="alert alert-danger mt-3 mb-0 py-2 px-3 small" role="alert">
          Error: {error}
        </div>
      ) : null}
    </section>
  );
}
