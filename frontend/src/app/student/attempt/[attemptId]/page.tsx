"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  BackendAttempt,
  BackendAttemptQuestion,
  finishAttempt,
  getAttempt,
  logIntegrityEvent,
  submitAnswers,
} from "@/lib/api";
import LatexText from "@/lib/LatexText";
import { usePhoneDetection } from "@/hooks/usePhoneDetection";
import { useSpeechMonitor } from "@/hooks/useSpeechMonitor";
import dynamic from "next/dynamic";

const CodeEditor = dynamic(() => import("@/components/CodeEditor"), {
  ssr: false,
  loading: () => (
    <div className="h-[300px] animate-pulse rounded-lg bg-zinc-800" />
  ),
});

function resolveMediaUrl(url?: string | null) {
  if (!url) return null;
  if (url.startsWith("http://") || url.startsWith("https://") || url.startsWith("data:")) {
    return url;
  }
  const base = process.env.NEXT_PUBLIC_BACKEND_URL || "";
  return `${base}${url}`;
}

function useFullscreen(attemptId: string | null, onExit: () => void) {
  useEffect(() => {
    if (!attemptId) return;

    function handleChange() {
      const isFullscreen = !!document.fullscreenElement;
      const now = new Date().toISOString();
      if (!isFullscreen) {
        // Log fullscreen exit event
        logIntegrityEvent({
          attemptId: attemptId!,
          type: "FULLSCREEN_EXIT",
          startedAt: now,
          metadata: { reason: "fullscreenchange" },
        }).catch(console.error);
        onExit();
      }
    }

    document.addEventListener("fullscreenchange", handleChange);
    return () => document.removeEventListener("fullscreenchange", handleChange);
  }, [attemptId, onExit]);
}

interface GapQuestionViewProps {
  text: string;
  gapSchema: { gaps?: { id: string; mode: "TEXT" | "SELECT"; options?: string[] }[] } | null;
  value: unknown;
  onChange: (value: unknown) => void;
}

function GapQuestionView({ text, gapSchema, value, onChange }: GapQuestionViewProps) {
  const gaps = Array.isArray(gapSchema?.gaps) ? gapSchema!.gaps! : [];
  const gapMap = new Map(gaps.map((g) => [g.id, g]));
  const current = Array.isArray((value as any)?.gaps)
    ? ((value as any).gaps as { id: string; value: string }[])
    : [];

  function getValue(id: string) {
    const found = current.find((g) => g.id === id);
    return found ? found.value : "";
  }

  function updateGap(id: string, nextValue: string) {
    const nextMap = new Map(current.map((g) => [g.id, g.value]));
    nextMap.set(id, nextValue);
    const next = gaps.map((g) => ({ id: g.id, value: nextMap.get(g.id) ?? "" }));
    onChange({ gaps: next });
  }

  const parts: Array<React.ReactNode> = [];
  const regex = /\[\[(.+?)\]\]/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text)) !== null) {
    const [full, gapId] = match;
    const start = match.index;
    const end = start + full.length;
    const before = text.slice(lastIndex, start);
    if (before) {
      parts.push(
        <span key={`${start}-text`} className="inline-block align-middle">
          <LatexText text={before} className="inline-block" />
        </span>,
      );
    }
    const gap = gapMap.get(gapId);
    if (gap) {
      parts.push(
        <span key={`${start}-gap`} className="mx-1 inline-block align-middle">
          {gap.mode === "SELECT" ? (
            <select
              value={getValue(gapId)}
              onChange={(e) => updateGap(gapId, e.target.value)}
              className="rounded-md border border-zinc-300 bg-white px-2 py-1 text-xs text-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
            >
              <option value="">...</option>
              {(gap.options ?? []).map((opt) => (
                <option key={opt} value={opt}>
                  {opt}
                </option>
              ))}
            </select>
          ) : (
            <input
              type="text"
              value={getValue(gapId)}
              onChange={(e) => updateGap(gapId, e.target.value)}
              className="w-28 rounded-md border border-zinc-300 bg-white px-2 py-1 text-xs text-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
              placeholder="..."
            />
          )}
        </span>,
      );
    } else {
      parts.push(
        <span key={`${start}-unknown`} className="text-red-500">
          {gapId}
        </span>,
      );
    }
    lastIndex = end;
  }
  const tail = text.slice(lastIndex);
  if (tail) {
    parts.push(
      <span key="tail" className="inline-block align-middle">
        <LatexText text={tail} className="inline-block" />
      </span>,
    );
  }

  return <div className="text-sm text-zinc-900 dark:text-zinc-50">{parts}</div>;
}

function useFocusTracking(attemptId: string | null) {
  useEffect(() => {
    if (!attemptId) return;

    let blurStart: string | null = null;

    function handleVisibility() {
      const nowIso = new Date().toISOString();
      if (document.visibilityState === "hidden") {
        blurStart = nowIso;
      } else if (document.visibilityState === "visible" && blurStart) {
        logIntegrityEvent({
          attemptId: attemptId!,
          type: "TAB_BLUR",
          startedAt: blurStart,
          endedAt: nowIso,
          metadata: { from: "hidden", to: "visible" },
        }).catch(console.error);
        blurStart = null;
      }
    }

    document.addEventListener("visibilitychange", handleVisibility);
    return () => document.removeEventListener("visibilitychange", handleVisibility);
  }, [attemptId]);
}

function usePasteDetection(attemptId: string | null, activeQuestionId: string | null) {
  useEffect(() => {
    if (!attemptId) return;

    function handlePaste(e: ClipboardEvent) {
      const nowIso = new Date().toISOString();
      const text = e.clipboardData?.getData("text") ?? "";
      // Log paste event
      logIntegrityEvent({
        attemptId: attemptId!,
        attemptQuestionId: activeQuestionId ?? undefined,
        type: "PASTE",
        startedAt: nowIso,
        metadata: { length: text.length },
      }).catch(console.error);
      // Block paste
      e.preventDefault();
    }

    document.addEventListener("paste", handlePaste as any);
    return () => document.removeEventListener("paste", handlePaste as any);
  }, [attemptId, activeQuestionId]);
}

// Prevent copy, cut, right-click, and keyboard shortcuts
function useAntiCheatControls(attemptId: string | null, activeQuestionId: string | null) {
  useEffect(() => {
    if (!attemptId) return;

    // Disable right-click context menu
    function handleContextMenu(e: MouseEvent) {
      e.preventDefault();
      return false;
    }

    // Disable copy
    function handleCopy(e: ClipboardEvent) {
      e.preventDefault();
      return false;
    }

    // Disable cut
    function handleCut(e: ClipboardEvent) {
      e.preventDefault();
      return false;
    }

    // Disable text selection via keyboard shortcuts and other cheating shortcuts
    function handleKeyDown(e: KeyboardEvent) {
      // Ctrl+A (select all), Ctrl+C (copy), Ctrl+V (paste), Ctrl+X (cut)
      // Ctrl+P (print), Ctrl+S (save), Ctrl+U (view source)
      // F12 (dev tools), Ctrl+Shift+I (dev tools), Ctrl+Shift+J (console)
      const blockedCtrlKeys = ["a", "c", "v", "x", "p", "s", "u"];
      const blockedCtrlShiftKeys = ["i", "j", "c"];

      // Спроба вийти з повноекранного режиму через Escape
      if (e.key === "Escape" && document.fullscreenElement) {
        e.preventDefault();
        return false;
      }

      // Detect PrintScreen key (best-effort, не всі браузери/ОС його дають)
      if (e.key === "PrintScreen") {
        const nowIso = new Date().toISOString();
        logIntegrityEvent({
          attemptId: attemptId!,
          attemptQuestionId: activeQuestionId ?? undefined,
          type: "SCREENSHOT",
          startedAt: nowIso,
          metadata: { key: "PrintScreen" },
        }).catch(console.error);
        // заблокувати стандартну поведінку, якщо можливо
        e.preventDefault();
        return false;
      }

      if (e.key === "F12") {
        e.preventDefault();
        return false;
      }

      if (e.ctrlKey && blockedCtrlKeys.includes(e.key.toLowerCase())) {
        e.preventDefault();
        return false;
      }

      if (e.ctrlKey && e.shiftKey && blockedCtrlShiftKeys.includes(e.key.toLowerCase())) {
        e.preventDefault();
        return false;
      }
    }

    // Disable drag start (prevent dragging text/images)
    function handleDragStart(e: DragEvent) {
      e.preventDefault();
      return false;
    }

    // Disable text selection
    function handleSelectStart(e: Event) {
      // Allow selection in textareas and inputs
      const target = e.target as HTMLElement;
      if (target.tagName === "TEXTAREA" || target.tagName === "INPUT") {
        return true;
      }
      e.preventDefault();
      return false;
    }

    document.addEventListener("contextmenu", handleContextMenu);
    document.addEventListener("copy", handleCopy as any);
    document.addEventListener("cut", handleCut as any);
    document.addEventListener("keydown", handleKeyDown);
    document.addEventListener("dragstart", handleDragStart);
    document.addEventListener("selectstart", handleSelectStart);

    // CSS to disable text selection
    document.body.style.userSelect = "none";
    document.body.style.webkitUserSelect = "none";

    return () => {
      document.removeEventListener("contextmenu", handleContextMenu);
      document.removeEventListener("copy", handleCopy as any);
      document.removeEventListener("cut", handleCut as any);
      document.removeEventListener("keydown", handleKeyDown);
      document.removeEventListener("dragstart", handleDragStart);
      document.removeEventListener("selectstart", handleSelectStart);
      document.body.style.userSelect = "";
      document.body.style.webkitUserSelect = "";
    };
  }, [attemptId, activeQuestionId]);
}

export default function AttemptPage() {
  const params = useParams<{ attemptId: string }>();
  const router = useRouter();
  const attemptId = params.attemptId;

  const [attempt, setAttempt] = useState<BackendAttempt | null>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, unknown>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [finishing, setFinishing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [globalRemaining, setGlobalRemaining] = useState<number | null>(null);
  const [questionRemaining, setQuestionRemaining] = useState<number | null>(null);

  const [hasStarted, setHasStarted] = useState(false);
  // Locked (timed-out) questions by attemptQuestionId
  const [lockedQuestions, setLockedQuestions] = useState<Record<string, boolean>>({});

  // Per-question time tracking
  const timePerQuestion = useRef<Record<string, number>>({});
  const questionEnteredAt = useRef<number | null>(null);

  // Media / consent state
  const [consentChecked, setConsentChecked] = useState(false);
  const [mediaStream, setMediaStream] = useState<MediaStream | null>(null);
  const [mediaError, setMediaError] = useState<string | null>(null);
  const [hasCameraDevice, setHasCameraDevice] = useState<boolean | null>(null);

  // Fullscreen enforcement state
  const [fullscreenLost, setFullscreenLost] = useState(false);

  const currentQuestion: BackendAttemptQuestion | undefined = useMemo(
    () => attempt?.questions[currentIndex],
    [attempt, currentIndex],
  );

  const isExam = attempt?.testMode !== "TRAINING";

  useFullscreen(hasStarted && isExam ? attemptId ?? null : null, () => {
    // коли fullscreen втрачено під час тесту — блокуємо інтерфейс, поки користувач не повернеться
    if (isExam) setFullscreenLost(true);
  });
  useFocusTracking(hasStarted && isExam ? attemptId ?? null : null);
  usePasteDetection(hasStarted && isExam ? attemptId ?? null : null, currentQuestion?.id ?? null);
  useAntiCheatControls(hasStarted && isExam ? attemptId ?? null : null, currentQuestion?.id ?? null);

  // Proctoring: phone detection via camera + speech monitoring via mic
  usePhoneDetection(
    hasStarted && isExam ? mediaStream : null,
    attemptId ?? null,
    currentQuestion?.id ?? null,
  );
  useSpeechMonitor(
    hasStarted && isExam,
    attemptId ?? null,
    currentQuestion?.id ?? null,
  );

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        setLoading(true);
        const a = await getAttempt(attemptId);
        if (!cancelled) {
          setAttempt(a);
          if (a.totalTimeSec) {
            setGlobalRemaining(a.totalTimeSec);
          }
          // Do not start timers yet, wait for user to click "Start"
        }
      } catch (err) {
        console.error(err);
        if (!cancelled) {
          setError("Не вдалося завантажити спробу тесту");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [attemptId]);

  // Detect if a physical camera is available
  useEffect(() => {
    async function checkCamera() {
      try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        const hasCamera = devices.some((d) => d.kind === "videoinput");
        setHasCameraDevice(hasCamera);
        if (!hasCamera) {
          // Auto-check consent since camera step will be skipped
          setConsentChecked(true);
        }
      } catch {
        setHasCameraDevice(false);
        setConsentChecked(true);
      }
    }
    checkCamera();
  }, []);

  async function requestMediaPermissions() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: true,
      });
      setMediaStream(stream);
      setMediaError(null);
      return stream;
    } catch (err: any) {
      console.error("Failed to get media permissions", err);
      // If camera is physically unavailable or busy, skip the step
      if (err?.name === "NotReadableError" || err?.name === "NotFoundError") {
        setMediaError(null);
        return null;
      }
      setMediaError(
        "Потрібен доступ до камери та мікрофона для проходження тесту.",
      );
      throw err;
    }
  }

  function renderImmediateFeedback() {
    if (!attempt?.showCorrectAnswersImmediately || isExam) return null;
    if (!currentQuestion) return null;
    const q = currentQuestion.question as any;
    const value = currentValue as any;
    if (!value) return null;

    let title = "Перевірка відповіді";
    let isCorrect: boolean | null = null;
    let details: React.ReactNode = null;

    if (q.type === "SINGLE_CHOICE") {
      const selected = value?.selectedOptionIds?.[0];
      const correct = q.options?.find((o: any) => o.isCorrect);
      isCorrect = selected && correct ? selected === correct.id : false;
      const correctImageSrc = resolveMediaUrl(correct?.imageUrl);
      details = correct ? (
        <div className="space-y-1">
          {correctImageSrc && (
            <img
              src={correctImageSrc}
              alt="correct option"
              className="max-h-32 w-auto rounded-md border border-blue-200 dark:border-blue-900/40"
            />
          )}
          <div>
            Правильна відповідь: <strong>{correct.label}.</strong>{" "}
            <LatexText text={correct.value} className="inline-block align-middle" />
          </div>
        </div>
      ) : null;
    } else if (q.type === "MULTIPLE_CHOICE") {
      const selected = new Set((value?.selectedOptionIds ?? []) as string[]);
      const correctOptions = (q.options ?? []).filter((o: any) => o.isCorrect);
      const correctIds = correctOptions.map((o: any) => o.id);
      isCorrect =
        correctIds.length === selected.size &&
        correctIds.every((id: string) => selected.has(id));
      details = (
        <div>
          Правильні відповіді:
          <ul className="ml-4 list-disc space-y-1">
            {correctOptions.map((o: any) => (
              <li key={o.id}>
                {o.imageUrl && (
                  <img
                    src={resolveMediaUrl(o.imageUrl) ?? undefined}
                    alt="correct option"
                    className="mb-1 max-h-32 w-auto rounded-md border border-blue-200 dark:border-blue-900/40"
                  />
                )}
                <strong>{o.label}.</strong>{" "}
                <LatexText text={o.value} className="inline-block align-middle" />
              </li>
            ))}
          </ul>
        </div>
      );
    } else if (q.type === "MATCHING") {
      const schema = q.matchingSchema as Record<string, string> | null;
      const pairs = Array.isArray(value?.pairs)
        ? (value.pairs as { left: string; right: string | null }[])
        : [];
      const givenMap = new Map(pairs.map((p) => [p.left, p.right ?? null]));
      const entries = schema ? Object.entries(schema) : [];
      const correctCount = entries.filter(
        ([left, right]) => (givenMap.get(left) ?? null) === right,
      ).length;
      isCorrect = entries.length > 0 ? correctCount === entries.length : null;
      details = schema ? (
        <div>
          Правильні пари:
          <ul className="ml-4 list-disc">
            {entries.map(([left, right]) => (
              <li key={left}>
                {left} → {right}
              </li>
            ))}
          </ul>
        </div>
      ) : null;
    } else if (q.type === "OPEN_TEXT") {
      const expected = Array.isArray(q.gradingConfig?.expectedAnswers)
        ? q.gradingConfig.expectedAnswers
        : [];
      details =
        expected.length > 0 ? (
          <div>
            Прийнятні відповіді:
            <ul className="ml-4 list-disc">
              {expected.map((ans: string, idx: number) => (
                <li key={idx}>
                  <LatexText text={ans} className="inline-block align-middle" />
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <div>Автоматична перевірка не налаштована.</div>
        );
    } else if (q.type === "GAP_TEXT") {
      const gaps = Array.isArray(q.gapSchema?.gaps) ? q.gapSchema.gaps : [];
      details = gaps.length ? (
        <div>
          Правильні відповіді для пропусків:
          <ul className="ml-4 list-disc">
            {gaps.map((g: any) => (
              <li key={g.id}>
                {g.id}: {(g.correctAnswers ?? []).join(", ")}
              </li>
            ))}
          </ul>
        </div>
      ) : null;
    }

    return (
      <div className="mt-3 rounded-lg border border-blue-200 bg-blue-50 p-3 text-xs text-blue-900 dark:border-blue-900/40 dark:bg-blue-900/20 dark:text-blue-100">
        <div className="mb-1 font-semibold">
          {title}
          {isCorrect !== null && (
            <span className="ml-2">
              {isCorrect ? "✅ Правильно" : "❌ Неправильно"}
            </span>
          )}
        </div>
        {details}
      </div>
    );
  }

  async function startTest() {
    if (!attempt) return;
    if (isExam) {
      if (hasCameraDevice && !consentChecked) {
        setError("Поставте позначку згоди на використання камери та мікрофона.");
        return;
      }

      // Only request camera/mic if a physical camera is present
      if (hasCameraDevice) {
        try {
          if (!mediaStream) {
            await requestMediaPermissions();
          }
        } catch {
          // Якщо немає доступу до медіа — не стартуємо тест
          return;
        }
      }

      // Request fullscreen (жест користувача — клік по кнопці)
      try {
        if (!document.fullscreenElement) {
          await document.documentElement.requestFullscreen();
        }
        setFullscreenLost(false);
      } catch (err) {
        console.error("Error attempting to enable fullscreen:", err);
        setError("Не вдалося увімкнути повноекранний режим. Дозвольте fullscreen у браузері.");
        return;
      }
    }

    setHasStarted(true);
    questionEnteredAt.current = Date.now();
    // Initialize question timer
    const first = attempt.questions[0];
    setQuestionRemaining(first?.perQuestionTimeSec ?? null);
  }

  // Global and per-question timers (client-side approximation)
  useEffect(() => {
    if (!attempt || !hasStarted || fullscreenLost) return;

    const interval = setInterval(() => {
      setGlobalRemaining((prev) => (prev !== null && prev > 0 ? prev - 1 : prev));
      setQuestionRemaining((prev) => (prev !== null && prev > 0 ? prev - 1 : prev));
    }, 1000);

    return () => clearInterval(interval);
  }, [attempt, hasStarted, fullscreenLost]);

  // When global timer hits 0 — auto-submit the attempt
  useEffect(() => {
    if (globalRemaining !== 0 || !hasStarted || finishing || !attempt) return;
    setFinishing(true);
    (async () => {
      try {
        if (currentQuestion) {
          const payload = answers[currentQuestion.id];
          if (payload !== undefined) {
            await submitAnswers(attemptId, [
              { attemptQuestionId: currentQuestion.id, answerPayload: payload },
            ]).catch(console.error);
          }
        }
        await finishAttempt(attemptId);
        if (attempt.showResultToStudent) {
          router.push(`/student/finished?attemptId=${attemptId}`);
        } else {
          router.push("/student/finished");
        }
      } catch (err) {
        console.error(err);
        setError("Час вийшов. Не вдалося завершити тест.");
        setFinishing(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [globalRemaining]);

  // When per-question timer hits 0, lock поточне питання і перейти далі
  useEffect(() => {
    if (questionRemaining === 0 && currentQuestion && !lockedQuestions[currentQuestion.id]) {
      setLockedQuestions((prev) => ({ ...prev, [currentQuestion.id]: true }));
      handleNext();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [questionRemaining, currentQuestion?.id]);

  function handleLocalAnswerChange(value: unknown) {
    if (!currentQuestion) return;
    setAnswers((prev) => ({ ...prev, [currentQuestion.id]: value }));
  }

  function flushQuestionTime() {
    if (questionEnteredAt.current == null || !currentQuestion) return;
    const elapsed = Math.round((Date.now() - questionEnteredAt.current) / 1000);
    const qId = currentQuestion.id;
    timePerQuestion.current[qId] = (timePerQuestion.current[qId] ?? 0) + elapsed;
    questionEnteredAt.current = Date.now();
  }

  async function persistCurrentAnswer() {
    if (!currentQuestion) return;
    const payload = answers[currentQuestion.id];
    if (payload === undefined) return;
    setSaving(true);
    try {
      await submitAnswers(attemptId, [
        {
          attemptQuestionId: currentQuestion.id,
          answerPayload: payload,
        },
      ]);
    } catch (err) {
      console.error(err);
      setError("Не вдалося зберегти відповідь");
    } finally {
      setSaving(false);
    }
  }

  function findNextIndex(direction: 1 | -1, fromIndex: number): number {
    if (!attempt) return fromIndex;
    const qs = attempt.questions;
    let i = fromIndex;
    while (true) {
      i += direction;
      if (i < 0 || i >= qs.length) return fromIndex;
      const aq = qs[i];
      if (!lockedQuestions[aq.id]) return i;
    }
  }

  async function handleNext() {
    flushQuestionTime();
    await persistCurrentAnswer();
    setError(null);
    if (!attempt) return;
    const nextIndex = findNextIndex(1, currentIndex);
    if (nextIndex === currentIndex) return;
    setCurrentIndex(nextIndex);
    questionEnteredAt.current = Date.now();
    const nextQ = attempt.questions[nextIndex];
    setQuestionRemaining(nextQ?.perQuestionTimeSec ?? null);
  }

  async function handlePrev() {
    if (!attempt || !allowBack) return;
    flushQuestionTime();
    await persistCurrentAnswer();
    const prevIndex = findNextIndex(-1, currentIndex);
    if (prevIndex === currentIndex) return;
    setCurrentIndex(prevIndex);
    questionEnteredAt.current = Date.now();
    const prevQ = attempt.questions[prevIndex];
    setQuestionRemaining(prevQ?.perQuestionTimeSec ?? null);
  }

  async function handleFinish() {
    const isLast = currentIndex === (attempt?.questions.length ?? 0) - 1;
    if (isLast) {
      const ok = window.confirm(
        "Ви на останньому питанні. Після завершення повернутися до тесту буде неможливо. Завершити?",
      );
      if (!ok) return;
    }
    setFinishing(true);
    try {
      flushQuestionTime();
      await persistCurrentAnswer();
      await finishAttempt(attemptId, timePerQuestion.current);
      if (attempt?.showResultToStudent) {
        router.push(`/student/finished?attemptId=${attemptId}`);
      } else {
        router.push("/student/finished");
      }
    } catch (err) {
      console.error(err);
      setError("Не вдалося завершити тест");
    } finally {
      setFinishing(false);
    }
  }

  if (loading || !attempt) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-50 dark:bg-black">
        <p className="text-sm text-zinc-600 dark:text-zinc-300">
          Завантаження тесту...
        </p>
      </div>
    );
  }

  const totalQuestions = attempt.questions.length;
  const progress = `${currentIndex + 1} / ${totalQuestions}`;

  const totalTimeSec = attempt.totalTimeSec ?? null;
  const totalTimeMinutes = totalTimeSec ? Math.floor(totalTimeSec / 60) : null;
  const totalTimeRemainderSec = totalTimeSec ? totalTimeSec % 60 : null;

  if (!hasStarted) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-6 bg-zinc-50 p-4 dark:bg-black">
        <div className="w-full max-w-md space-y-4 rounded-2xl bg-white p-8 shadow-lg dark:bg-zinc-900">
          <h1 className="text-center text-2xl font-bold text-zinc-900 dark:text-zinc-50">
            Готові розпочати?
          </h1>
          <div className="space-y-2 text-sm text-zinc-600 dark:text-zinc-400">
            <p>Перед початком тесту зверніть увагу:</p>
            <ul className="list-disc pl-5 space-y-1">
              <li>Тест відкриється у повноекранному режимі.</li>
              <li>
                Вихід з повного екрану, перемикання вкладок або копіювання тексту
                буде зафіксовано як порушення.
              </li>
              {totalTimeSec && (
                <li>
                  На весь тест відведено {" "}
                  <strong>
                    {totalTimeMinutes} хв
                    {totalTimeRemainderSec ? ` ${totalTimeRemainderSec} с` : ""}
                  </strong>
                  .
                </li>
              )}
              <li>Деякі питання можуть мати окремий ліміт часу.</li>
              {isExam && hasCameraDevice && (
                <li>
                  Під час тесту буде ввімкнено камеру та мікрофон; відео і голос
                  можуть бути записані для запобігання недобросовісному
                  проходженню.
                </li>
              )}
            </ul>
          </div>
          {isExam && hasCameraDevice && (
            <div className="space-y-2 rounded-xl bg-zinc-50 p-3 text-xs text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
              <label className="flex items-start gap-2">
                <input
                  type="checkbox"
                  checked={consentChecked}
                  onChange={(e) => setConsentChecked(e.target.checked)}
                  className="mt-0.5 h-4 w-4"
                />
                <span>
                  Я надаю згоду на використання камери та мікрофона під час
                  проходження тесту.
                </span>
              </label>
              {mediaError && (
                <p className="text-xs text-red-500" role="alert">
                  {mediaError}
                </p>
              )}
            </div>
          )}
          <button
            onClick={startTest}
            disabled={isExam && hasCameraDevice === true && !consentChecked}
            className="w-full rounded-xl bg-blue-600 px-6 py-3 text-base font-semibold text-white shadow-md transition hover:bg-blue-700 active:scale-[0.98] disabled:cursor-not-allowed disabled:bg-blue-400"
          >
            Розпочати тест
          </button>
        </div>
      </div>
    );
  }

  const currentValue =
    (currentQuestion && answers[currentQuestion.id]) ?? undefined;
  const isLastQuestion = currentIndex === totalQuestions - 1;

  const allowBack = attempt?.allowBackNavigation ?? false;
  const canGoPrev = allowBack && findNextIndex(-1, currentIndex) !== currentIndex;
  const canGoNext = attempt && findNextIndex(1, currentIndex) !== currentIndex;

  return (
    <div className="flex min-h-screen bg-zinc-50 font-sans dark:bg-black">
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-4 p-4 py-6">
        {fullscreenLost && isExam && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80">
            <div className="w-full max-w-md space-y-4 rounded-2xl bg-white p-6 text-center shadow-xl dark:bg-zinc-900">
              <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">
                Поверніться у повноекранний режим
              </h2>
              <p className="text-sm text-zinc-600 dark:text-zinc-300">
                Вихід з fullscreen зафіксовано як порушення. Щоб продовжити
                тест, увімкніть повноекранний режим знову.
              </p>
              <button
                type="button"
                onClick={async () => {
                  try {
                    await document.documentElement.requestFullscreen();
                    setFullscreenLost(false);
                  } catch (err) {
                    console.error("Failed to re-enter fullscreen:", err);
                  }
                }}
                className="w-full rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-blue-700"
              >
                Увімкнути fullscreen і продовжити
              </button>
            </div>
          </div>
        )}
        <header className="flex items-center justify-between rounded-xl bg-white px-4 py-3 shadow-sm dark:bg-zinc-900">
          <div>
            <p className="text-xs uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
              Студентський тест
            </p>
            <p className="text-sm font-medium text-zinc-900 dark:text-zinc-50">
              Спроба #{attempt.id.slice(0, 8)}
            </p>
          </div>
          <div className="flex items-center gap-4 text-xs font-medium text-zinc-800 dark:text-zinc-100">
            {attempt.totalTimeSec && (
              <div className="flex items-center gap-1 rounded-full bg-blue-50 px-3 py-1 text-blue-700 dark:bg-blue-900/40 dark:text-blue-200">
                <span>Залишилось: {globalRemaining ?? attempt.totalTimeSec}s</span>
              </div>
            )}
            {questionRemaining !== null && (
              <div className="flex items-center gap-1 rounded-full bg-amber-50 px-3 py-1 text-amber-700 dark:bg-amber-900/40 dark:text-amber-200">
                <span>Питання: {questionRemaining}s</span>
              </div>
            )}
            <div className="flex items-center gap-1 rounded-full bg-zinc-100 px-3 py-1 dark:bg-zinc-800">
              <span>Питання {progress}</span>
            </div>
          </div>
        </header>

        <main className="flex-1 rounded-xl bg-white p-4 shadow-sm dark:bg-zinc-900">
          {error && (
            <p className="mb-3 text-sm text-red-500" role="alert">
              {error}
            </p>
          )}
          {currentQuestion && (
            <QuestionView
              question={currentQuestion}
              value={currentValue}
              onChange={handleLocalAnswerChange}
            />
          )}
          {renderImmediateFeedback()}
        </main>

        <footer className="flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={handlePrev}
            disabled={!canGoPrev}
            className="rounded-lg px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-40 dark:text-zinc-200 dark:hover:bg-zinc-800"
          >
            Назад
          </button>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleNext}
              disabled={!canGoNext}
              className="rounded-lg bg-zinc-100 px-4 py-2 text-sm font-medium text-zinc-800 hover:bg-zinc-200 disabled:cursor-not-allowed disabled:opacity-40 dark:bg-zinc-800 dark:text-zinc-100 dark:hover:bg-zinc-700"
            >
              Далі
            </button>
            {isLastQuestion && (
              <span className="text-[11px] text-amber-600 dark:text-amber-300">
                Останнє питання
              </span>
            )}
            <button
              type="button"
              onClick={handleFinish}
              disabled={finishing}
              className="rounded-lg bg-green-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-green-700 disabled:cursor-not-allowed disabled:bg-green-400"
            >
              {finishing ? "Завершення..." : "Завершити тест"}
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
}

interface QuestionViewProps {
  question: BackendAttemptQuestion;
  value: unknown;
  onChange: (value: unknown) => void;
}

function QuestionView({ question, value, onChange }: QuestionViewProps) {
  const q = question.question;
  const questionImageSrc = resolveMediaUrl(q.imageUrl);

  const matchingSchema: Record<string, string> | null =
    q.type === "MATCHING" && (q as any).matchingSchema
      ? ((q as any).matchingSchema as Record<string, string>)
      : null;

  return (
    <div className="space-y-4">
      <div>
        <p className="mb-1 text-xs font-medium uppercase tracking-wide text-blue-600">
          {q.type}
        </p>
        {questionImageSrc && (
          <img
            src={questionImageSrc}
            alt="question"
            className="mb-2 max-h-64 w-auto rounded-md border border-zinc-200 dark:border-zinc-700"
          />
        )}
        <LatexText
          text={q.text}
          className="text-sm text-zinc-900 dark:text-zinc-50 whitespace-pre-wrap"
        />
      </div>
      {q.type === "SINGLE_CHOICE" && (
        <div className="space-y-2">
          {q.options.map((opt) => {
            const optionImageSrc = resolveMediaUrl(opt.imageUrl);
            return (
              <label
                key={opt.id}
                className="flex cursor-pointer items-start gap-2 rounded-lg border border-zinc-200 px-3 py-2 text-sm hover:bg-zinc-50 dark:border-zinc-700 dark:hover:bg-zinc-800"
              >
                <input
                  type="radio"
                  name={question.id}
                  className="mt-1 h-4 w-4"
                  checked={(value as any)?.selectedOptionIds?.[0] === opt.id}
                  onChange={() => onChange({ selectedOptionIds: [opt.id] })}
                />
                <div className="space-y-1 text-zinc-800 dark:text-zinc-100">
                  {optionImageSrc && (
                    <img
                      src={optionImageSrc}
                      alt="option"
                      className="max-h-40 w-auto rounded-md border border-zinc-200 dark:border-zinc-700"
                    />
                  )}
                  <span>
                    <span className="font-medium">{opt.label}.</span>{" "}
                    <LatexText text={opt.value} className="inline-block align-middle" />
                  </span>
                </div>
              </label>
            );
          })}
        </div>
      )}
      {q.type === "MULTIPLE_CHOICE" && (
        <div className="space-y-2">
          {q.options.map((opt) => {
            const selected = new Set(
              ((value as any)?.selectedOptionIds || []) as string[],
            );
            return (
              <label
                key={opt.id}
                className="flex cursor-pointer items-start gap-2 rounded-lg border border-zinc-200 px-3 py-2 text-sm hover:bg-zinc-50 dark:border-zinc-700 dark:hover:bg-zinc-800"
              >
                <input
                  type="checkbox"
                  className="mt-1 h-4 w-4"
                  checked={selected.has(opt.id)}
                  onChange={(e) => {
                    const next = new Set(selected);
                    if (e.target.checked) next.add(opt.id);
                    else next.delete(opt.id);
                    onChange({ selectedOptionIds: Array.from(next) });
                  }}
                />
                <div className="space-y-1 text-zinc-800 dark:text-zinc-100">
                  {resolveMediaUrl(opt.imageUrl) && (
                    <img
                      src={resolveMediaUrl(opt.imageUrl) ?? undefined}
                      alt="option"
                      className="max-h-40 w-auto rounded-md border border-zinc-200 dark:border-zinc-700"
                    />
                  )}
                  <span>
                    <span className="font-medium">{opt.label}.</span>{" "}
                    <LatexText text={opt.value} className="inline-block align-middle" />
                  </span>
                </div>
              </label>
            );
          })}
        </div>
      )}
      {q.type === "OPEN_TEXT" && (() => {
        const gradingConfig = (q as any).gradingConfig;
        const format = gradingConfig?.format as
          | "SHORT_TEXT"
          | "LONG_TEXT"
          | "NUMBER"
          | "CODE"
          | undefined;
        if (format === "CODE") {
          return (
            <CodeWithTerminal
              code={(value as any)?.text ?? ""}
              onCodeChange={(text) => onChange({ text })}
              language={gradingConfig?.language ?? "python"}
            />
          );
        }
        if (format === "SHORT_TEXT" || format === "NUMBER") {
          return (
            <input
              type={format === "NUMBER" ? "number" : "text"}
              className="w-full rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm text-zinc-900 outline-none ring-0 transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-50 dark:focus:border-blue-400 dark:focus:ring-blue-900/40"
              value={(value as any)?.text ?? ""}
              onChange={(e) => onChange({ text: e.target.value })}
              placeholder="Ваша відповідь"
            />
          );
        }
        return (
          <textarea
            className="min-h-[120px] w-full rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm text-zinc-900 outline-none ring-0 transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-50 dark:focus:border-blue-400 dark:focus:ring-blue-900/40"
            value={(value as any)?.text ?? ""}
            onChange={(e) => onChange({ text: e.target.value })}
            placeholder="Ваша відповідь"
          />
        );
      })()}
      {q.type === "MATCHING" && matchingSchema && (
        <div className="space-y-3">
          <p className="mb-1 text-xs text-zinc-500 dark:text-zinc-400">
            Для кожного елемента зліва оберіть відповідний елемент справа.
          </p>
          <MatchingQuestionView
            matchingSchema={matchingSchema}
            value={value}
            onChange={onChange}
          />
        </div>
      )}
      {q.type === "GAP_TEXT" && (
        <GapQuestionView
          text={q.text}
          gapSchema={(q as any).gapSchema}
          value={value}
          onChange={onChange}
        />
      )}
    </div>
  );
}

interface MatchingQuestionViewProps {
  matchingSchema: Record<string, string>;
  value: unknown;
  onChange: (value: unknown) => void;
}

// ── Code editor with built-in terminal ──

function CodeWithTerminal({
  code,
  onCodeChange,
  language,
}: {
  code: string;
  onCodeChange: (text: string) => void;
  language: string;
}) {
  const [output, setOutput] = useState<{
    stdout: string;
    stderr: string;
    exitCode: number;
    timedOut: boolean;
  } | null>(null);
  const [running, setRunning] = useState(false);
  const [stdin, setStdin] = useState("");
  const [showStdin, setShowStdin] = useState(false);

  async function handleRun() {
    setRunning(true);
    setOutput(null);
    try {
      const res = await fetch("/api/student/code/execute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code, language, stdin: stdin || undefined }),
      });
      const data = await res.json();
      setOutput({
        stdout: data.stdout ?? "",
        stderr: data.stderr ?? data.message ?? "",
        exitCode: data.exitCode ?? (res.ok ? 0 : 1),
        timedOut: data.timedOut ?? false,
      });
    } catch {
      setOutput({
        stdout: "",
        stderr: "Не вдалося з'єднатися з сервером виконання коду",
        exitCode: 1,
        timedOut: false,
      });
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="space-y-2">
      <CodeEditor
        value={code}
        onChange={onCodeChange}
        language={language}
        height="300px"
      />
      {/* Controls */}
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={handleRun}
          disabled={running || !code.trim()}
          className="flex items-center gap-1.5 rounded-lg bg-green-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-green-700 disabled:bg-green-400 disabled:cursor-not-allowed"
        >
          {running ? (
            <>
              <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-white border-t-transparent" />
              Виконання...
            </>
          ) : (
            <>
              <svg className="h-3.5 w-3.5" fill="currentColor" viewBox="0 0 16 16">
                <path d="M6.271 2.147a.5.5 0 0 1 .798 0l5 6.5a.5.5 0 0 1-.399.803H1.67a.5.5 0 0 1-.399-.803l5-6.5z" transform="rotate(90 8 8)" />
              </svg>
              Запустити
            </>
          )}
        </button>
        <button
          type="button"
          onClick={() => setShowStdin(!showStdin)}
          className={`rounded-lg px-3 py-1.5 text-xs font-medium transition ${
            showStdin
              ? "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400"
              : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-700"
          }`}
        >
          stdin
        </button>
        {output && (
          <span className={`ml-auto text-[10px] font-mono ${
            output.exitCode === 0
              ? "text-green-600 dark:text-green-400"
              : "text-red-500 dark:text-red-400"
          }`}>
            exit: {output.exitCode}{output.timedOut ? " (timeout)" : ""}
          </span>
        )}
      </div>
      {/* Stdin input */}
      {showStdin && (
        <textarea
          value={stdin}
          onChange={(e) => setStdin(e.target.value)}
          placeholder="Введіть вхідні дані (stdin)..."
          className="w-full rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 font-mono text-xs text-zinc-900 outline-none focus:border-blue-500 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-50"
          rows={2}
        />
      )}
      {/* Terminal output */}
      {output && (
        <div className="rounded-lg bg-zinc-900 p-3 font-mono text-xs text-zinc-100 max-h-[200px] overflow-y-auto">
          <div className="mb-1 flex items-center gap-2 text-[10px] text-zinc-500">
            <span className="inline-block h-2 w-2 rounded-full bg-green-500" />
            Термінал
          </div>
          {output.stdout && (
            <pre className="whitespace-pre-wrap text-green-300">{output.stdout}</pre>
          )}
          {output.stderr && (
            <pre className="whitespace-pre-wrap text-red-400">{output.stderr}</pre>
          )}
          {!output.stdout && !output.stderr && (
            <span className="text-zinc-500">(порожній вивід)</span>
          )}
        </div>
      )}
    </div>
  );
}

function MatchingQuestionView({
  matchingSchema,
  value,
  onChange,
}: MatchingQuestionViewProps) {
  const leftItems = Object.keys(matchingSchema);
  const rightItems = Array.from(new Set(Object.values(matchingSchema)));

  const currentPairs: { left: string; right: string | null }[] =
    (value as any)?.pairs && Array.isArray((value as any).pairs)
      ? ((value as any).pairs as { left: string; right: string | null }[])
      : [];

  function getRightFor(left: string): string | "" {
    const found = currentPairs.find((p) => p.left === left);
    return found && found.right ? found.right : "";
  }

  function handleChange(left: string, right: string | "") {
    const targetRight = right || null;
    const byLeft = new Map<string, string | null>();
    for (const l of leftItems) {
      byLeft.set(l, null);
    }
    for (const p of currentPairs) {
      if (byLeft.has(p.left) && p.right) {
        byLeft.set(p.left, p.right);
      }
    }
    byLeft.set(left, targetRight);

    const nextPairs = leftItems.map((l) => ({
      left: l,
      right: byLeft.get(l) ?? null,
    }));

    onChange({ pairs: nextPairs });
  }

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <div className="space-y-2">
        <p className="text-xs font-medium text-zinc-700 dark:text-zinc-200">
          Ліва частина
        </p>
        {leftItems.map((left) => {
          const usedRights = new Set(
            currentPairs
              .filter((p) => p.left !== left && p.right)
              .map((p) => p.right as string),
          );
          return (
            <div
              key={left}
              className="flex items-center justify-between gap-2 rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-xs dark:border-zinc-700 dark:bg-zinc-800"
            >
              <span className="text-zinc-800 dark:text-zinc-50">{left}</span>
              <select
                value={getRightFor(left)}
                onChange={(e) => handleChange(left, e.target.value as string)}
                className="w-32 rounded-md border border-zinc-300 bg-white px-2 py-1 text-[11px] text-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
              >
                <option value="">Не вибрано</option>
                {rightItems.map((right) => (
                  <option
                    key={right}
                    value={right}
                    disabled={usedRights.has(right)}
                  >
                    {right}
                  </option>
                ))}
              </select>
            </div>
          );
        })}
      </div>
      <div className="space-y-2">
        <p className="text-xs font-medium text-zinc-700 dark:text-zinc-200">
          Права частина (усі можливі варіанти)
        </p>
        <ul className="space-y-1 text-xs text-zinc-700 dark:text-zinc-200">
          {rightItems.map((r) => (
            <li key={r} className="rounded-md bg-zinc-50 px-3 py-1 dark:bg-zinc-800">
              {r}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
