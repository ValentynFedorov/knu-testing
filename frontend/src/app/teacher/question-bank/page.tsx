"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import type { ClipboardEvent as ReactClipboardEvent } from "react";
import { signIn } from "next-auth/react";
import LatexText from "@/lib/LatexText";

type QuestionType =
  | "SINGLE_CHOICE"
  | "MULTIPLE_CHOICE"
  | "OPEN_TEXT"
  | "MATCHING"
  | "GAP_TEXT";

type OpenTextFormat = "SHORT_TEXT" | "LONG_TEXT" | "NUMBER" | "CODE";
type TextMatchMode = "EXACT" | "CASE_INSENSITIVE" | "CONTAINS" | "REGEX";

interface GapItem {
  id: string;
  mode: "TEXT" | "SELECT";
  options: string;
  correctAnswers: string;
  matchingMode: TextMatchMode;
}

interface QuestionOption {
  id?: string;
  label: string;
  value: string;
  isCorrect: boolean;
  orderIndex: number;
  imageUrl?: string;
}

interface Question {
  id: string;
  type: QuestionType;
  text: string;
  imageUrl?: string | null;
  weight: number;
  perQuestionTimeSec?: number | null;
  matchingSchema?: Record<string, string> | null;
  gapSchema?: Record<string, any> | null;
  gradingConfig?: Record<string, any> | null;
  options?: QuestionOption[];
}

interface QuestionGroup {
  id: string;
  name: string;
  description?: string | null;
}

const QUESTION_TYPE_LABELS: Record<QuestionType, string> = {
  SINGLE_CHOICE: "Одна відповідь",
  MULTIPLE_CHOICE: "Множинний вибір",
  OPEN_TEXT: "Відкрита відповідь",
  MATCHING: "Відповідність",
  GAP_TEXT: "Пропуски в тексті",
};

export default function QuestionBankPage() {
  const [groups, setGroups] = useState<QuestionGroup[]>([]);
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Group creation
  const [newGroupName, setNewGroupName] = useState("");
  const [newGroupDesc, setNewGroupDesc] = useState("");

  // Question creation modal
  const [showQuestionModal, setShowQuestionModal] = useState(false);
  const [qType, setQType] = useState<QuestionType>("SINGLE_CHOICE");
  const [qText, setQText] = useState("");
  const [qImageUrl, setQImageUrl] = useState<string | null>(null);
  const [qWeight, setQWeight] = useState(1);
  const [qTimeSec, setQTimeSec] = useState<number | undefined>(undefined);
  const [qOptions, setQOptions] = useState<QuestionOption[]>([
    { label: "A", value: "", isCorrect: true, orderIndex: 0, imageUrl: undefined },
    { label: "B", value: "", isCorrect: false, orderIndex: 1, imageUrl: undefined },
  ]);
  // Matching pairs
  const [matchingPairs, setMatchingPairs] = useState<{ left: string; right: string }[]>([
    { left: "", right: "" },
    { left: "", right: "" },
  ]);
  // Open text grading config
  const [openTextFormat, setOpenTextFormat] = useState<OpenTextFormat>("SHORT_TEXT");
  const [codeLanguage, setCodeLanguage] = useState("python");
  const [openTextMatchingMode, setOpenTextMatchingMode] = useState<TextMatchMode>("EXACT");
  const [openTextExpected, setOpenTextExpected] = useState<string[]>([""]);
  // Gap text config
  const [gapItems, setGapItems] = useState<GapItem[]>([
    { id: "gap1", mode: "TEXT", options: "", correctAnswers: "", matchingMode: "EXACT" },
  ]);

  // Editor helpers (insert formula/image)
  const qTextRef = useRef<HTMLTextAreaElement | null>(null);
  const optionRefs = useRef<Array<HTMLTextAreaElement | null>>([]);
  const questionImageInputRef = useRef<HTMLInputElement | null>(null);
  const optionImageInputRef = useRef<HTMLInputElement | null>(null);
  const [optionImageIndex, setOptionImageIndex] = useState<number | null>(null);

  useEffect(() => {
    loadGroups();
  }, []);

  async function loadGroups() {
    try {
      setLoading(true);
      const res = await fetch("/api/teacher/question-groups");
      if (res.status === 401) {
        // Not authenticated: redirect to NextAuth sign-in page
        await signIn(undefined, { callbackUrl: "/teacher/question-bank" });
        return;
      }
      if (!res.ok) throw new Error(await res.text());
      const data = (await res.json()) as QuestionGroup[];
      setGroups(data);
      if (!selectedGroupId && data[0]) {
        setSelectedGroupId(data[0].id);
        await loadQuestions(data[0].id);
      }
    } catch (err) {
      console.error(err);
      setError("Не вдалося завантажити групи питань");
    } finally {
      setLoading(false);
    }
  }

  function handleFormulaPaste(
    e: ReactClipboardEvent<HTMLTextAreaElement>,
    current: string,
    setValue: (next: string) => void,
    ref?: { current: HTMLTextAreaElement | null },
  ) {
    const text = e.clipboardData?.getData("text/plain") ?? "";
    if (!text) return;
    const normalized = normalizeWordMath(text);
    if (normalized !== text) {
      e.preventDefault();
      insertAtCursor(current, normalized, setValue, ref);
    }
  }

  function insertAtCursor(
    current: string,
    insertText: string,
    setValue: (next: string) => void,
    ref?: { current: HTMLTextAreaElement | null },
  ) {
    const el = ref?.current ?? null;
    if (!el) {
      setValue(`${current}${insertText}`);
      return;
    }
    const start = el.selectionStart ?? current.length;
    const end = el.selectionEnd ?? current.length;
    const next = current.slice(0, start) + insertText + current.slice(end);
    setValue(next);
    requestAnimationFrame(() => {
      el.focus();
      const pos = start + insertText.length;
      el.setSelectionRange(pos, pos);
    });
  }

  function insertFormulaIntoQuestion(block = false) {
    const formula = window.prompt("Введіть LaTeX формулу");
    if (!formula) return;
    const wrapped = block ? `\n$$${formula}$$\n` : `$${formula}$`;
    insertAtCursor(qText, wrapped, setQText, qTextRef);
  }

  function insertFormulaIntoOption(index: number, block = false) {
    const formula = window.prompt("Введіть LaTeX формулу");
    if (!formula) return;
    const wrapped = block ? `\n$$${formula}$$\n` : `$${formula}$`;
    const current = qOptions[index]?.value ?? "";
    insertAtCursor(
      current,
      wrapped,
      (next) => {
        const updated = [...qOptions];
        updated[index] = { ...updated[index], value: next };
        setQOptions(updated);
      },
      { current: optionRefs.current[index] },
    );
  }

  function resolveMediaUrl(url?: string | null) {
    if (!url) return null;
    if (url.startsWith("http://") || url.startsWith("https://") || url.startsWith("data:")) {
      return url;
    }
    const base = process.env.NEXT_PUBLIC_BACKEND_URL || "";
    return `${base}${url}`;
  }
  function findMatchingParen(text: string, openIndex: number) {
    let depth = 0;
    for (let i = openIndex; i < text.length; i++) {
      const ch = text[i];
      if (ch === "(") depth += 1;
      else if (ch === ")") depth -= 1;
      if (depth === 0) return i;
    }
    return -1;
  }

  function replaceParenGroups(text: string, marker: "_" | "^") {
    let out = "";
    let i = 0;
    while (i < text.length) {
      if (text[i] === marker && text[i + 1] === "(") {
        const end = findMatchingParen(text, i + 1);
        if (end !== -1) {
          const inner = text.slice(i + 2, end);
          out += `${marker}{${inner}}`;
          i = end + 1;
          continue;
        }
      }
      out += text[i];
      i += 1;
    }
    return out;
  }

  function replaceCommandArgs(text: string, command: string, argCount: 1 | 2) {
    let out = "";
    let i = 0;
    const cmd = `${command}(`;
    while (i < text.length) {
      if (text.startsWith(cmd, i)) {
        const firstStart = i + command.length;
        const firstEnd = findMatchingParen(text, firstStart);
        if (firstEnd === -1) {
          out += text[i];
          i += 1;
          continue;
        }
        const firstArg = text.slice(firstStart + 1, firstEnd);
        if (argCount === 1) {
          out += `${command}{${firstArg}}`;
          i = firstEnd + 1;
          continue;
        }
        let j = firstEnd + 1;
        while (j < text.length && /\s/.test(text[j])) j += 1;
        if (text[j] !== "(") {
          out += text.slice(i, firstEnd + 1);
          i = firstEnd + 1;
          continue;
        }
        const secondEnd = findMatchingParen(text, j);
        if (secondEnd === -1) {
          out += text.slice(i, firstEnd + 1);
          i = firstEnd + 1;
          continue;
        }
        const secondArg = text.slice(j + 1, secondEnd);
        out += `${command}{${firstArg}}{${secondArg}}`;
        i = secondEnd + 1;
        continue;
      }
      out += text[i];
      i += 1;
    }
    return out;
  }

  function normalizeWordMath(input: string) {
    let text = input;
    // Common Unicode math symbols → LaTeX
    text = text
      .replace(/∑/g, "\\sum")
      .replace(/∏/g, "\\prod")
      .replace(/∞/g, "\\infty")
      .replace(/≤/g, "\\le")
      .replace(/≥/g, "\\ge")
      .replace(/≠/g, "\\ne")
      .replace(/×/g, "\\times")
      .replace(/÷/g, "\\div")
      .replace(/±/g, "\\pm");

    // UnicodeMath-style function args
    text = replaceCommandArgs(text, "\\frac", 2);
    text = replaceCommandArgs(text, "\\binom", 2);
    text = replaceCommandArgs(text, "\\sqrt", 1);

    // UnicodeMath subscripts/superscripts: _( ) and ^( )
    text = replaceParenGroups(text, "_");
    text = replaceParenGroups(text, "^");

    return text;
  }

  async function uploadImage(file: File) {
    const formData = new FormData();
    formData.set("file", file);
    const res = await fetch("/api/teacher/media/upload", {
      method: "POST",
      body: formData,
    });
    if (!res.ok) {
      throw new Error(await res.text());
    }
    const data = (await res.json()) as { url?: string };
    if (!data.url) throw new Error("Upload failed");
    return data.url;
  }

  async function handleQuestionImageFile(file: File) {
    try {
      const url = await uploadImage(file);
      setQImageUrl(url);
    } catch (err) {
      console.error(err);
      setError("Не вдалося завантажити зображення");
    }
  }

  async function handleOptionImageFile(index: number, file: File) {
    try {
      const url = await uploadImage(file);
      setQOptions((prev) => {
        const updated = [...prev];
        updated[index] = { ...updated[index], imageUrl: url };
        return updated;
      });
    } catch (err) {
      console.error(err);
      setError("Не вдалося завантажити зображення");
    }
  }

  async function handleImagePaste(
    e: ReactClipboardEvent<HTMLTextAreaElement>,
    onImage: (file: File) => Promise<void>,
  ) {
    const items = e.clipboardData?.items ?? [];
    const fileItem = Array.from(items).find((i) => i.type.startsWith("image/"));
    if (!fileItem) return false;
    const file = fileItem.getAsFile();
    if (!file) return false;
    e.preventDefault();
    await onImage(file);
    return true;
  }

  async function loadQuestions(groupId: string) {
    try {
      setLoading(true);
      const res = await fetch(`/api/teacher/questions?groupId=${groupId}`);
      if (!res.ok) throw new Error(await res.text());
      const data = (await res.json()) as Question[];
      setQuestions(data);
    } catch (err) {
      console.error(err);
      setError("Не вдалося завантажити питання");
    } finally {
      setLoading(false);
    }
  }

  async function deleteQuestion(qId: string) {
    if (!confirm("Видалити питання?")) return;
    try {
      const res = await fetch(`/api/teacher/questions/${qId}/delete`, {
        method: "POST",
      });
      if (!res.ok) throw new Error(await res.text());
      if (selectedGroupId) await loadQuestions(selectedGroupId);
    } catch (err) {
      console.error(err);
      setError("Не вдалося видалити питання");
    }
  }

  async function handleCreateGroup(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!newGroupName.trim()) return;
    try {
      const res = await fetch("/api/teacher/question-groups", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newGroupName.trim(), description: newGroupDesc.trim() || undefined }),
      });
      if (!res.ok) throw new Error(await res.text());
      setNewGroupName("");
      setNewGroupDesc("");
      await loadGroups();
    } catch (err) {
      console.error(err);
      setError("Не вдалося створити групу");
    }
  }

  function resetQuestionForm() {
    setQType("SINGLE_CHOICE");
    setQText("");
    setQImageUrl(null);
    setQWeight(1);
    setQTimeSec(undefined);
    setQOptions([
      { label: "A", value: "", isCorrect: true, orderIndex: 0, imageUrl: undefined },
      { label: "B", value: "", isCorrect: false, orderIndex: 1, imageUrl: undefined },
    ]);
    setMatchingPairs([
      { left: "", right: "" },
      { left: "", right: "" },
    ]);
    setOpenTextFormat("SHORT_TEXT");
    setCodeLanguage("python");
    setOpenTextMatchingMode("EXACT");
    setOpenTextExpected([""]);
    setGapItems([{ id: "gap1", mode: "TEXT", options: "", correctAnswers: "", matchingMode: "EXACT" }]);
  }

  function addOption() {
    const nextLabel = String.fromCharCode(65 + qOptions.length); // A, B, C, ...
    setQOptions([
      ...qOptions,
      { label: nextLabel, value: "", isCorrect: false, orderIndex: qOptions.length, imageUrl: undefined },
    ]);
  }

  function removeOption(idx: number) {
    if (qOptions.length <= 2) return;
    const updated = qOptions.filter((_, i) => i !== idx).map((o, i) => ({
      ...o,
      label: String.fromCharCode(65 + i),
      orderIndex: i,
    }));
    setQOptions(updated);
  }

  function toggleCorrect(idx: number) {
    if (qType === "SINGLE_CHOICE") {
      // Only one correct
      setQOptions(qOptions.map((o, i) => ({ ...o, isCorrect: i === idx })));
    } else {
      // Multiple can be correct
      setQOptions(qOptions.map((o, i) => (i === idx ? { ...o, isCorrect: !o.isCorrect } : o)));
    }
  }

  function addMatchingPair() {
    setMatchingPairs([...matchingPairs, { left: "", right: "" }]);
  }

  function removeMatchingPair(idx: number) {
    if (matchingPairs.length <= 2) return;
    setMatchingPairs(matchingPairs.filter((_, i) => i !== idx));
  }

  function addOpenTextExpected() {
    setOpenTextExpected((prev) => [...prev, ""]);
  }

  function updateOpenTextExpected(index: number, value: string) {
    setOpenTextExpected((prev) => prev.map((v, i) => (i === index ? value : v)));
  }

  function removeOpenTextExpected(index: number) {
    setOpenTextExpected((prev) => prev.filter((_, i) => i !== index));
  }

  function addGapItem() {
    setGapItems((prev) => [
      ...prev,
      {
        id: `gap${prev.length + 1}`,
        mode: "TEXT",
        options: "",
        correctAnswers: "",
        matchingMode: "EXACT",
      },
    ]);
  }

  function updateGapItem(index: number, patch: Partial<GapItem>) {
    setGapItems((prev) => prev.map((g, i) => (i === index ? { ...g, ...patch } : g)));
  }

  function removeGapItem(index: number) {
    if (gapItems.length <= 1) return;
    setGapItems((prev) => prev.filter((_, i) => i !== index));
  }

  async function deleteGroup(groupId: string) {
    if (!confirm("Ви впевнені, що хочете видалити цю групу? Всі питання в ній будуть видалені.")) return;
    try {
      const res = await fetch(`/api/teacher/question-groups/${groupId}/delete`, {
        method: "POST",
      });
      if (!res.ok) throw new Error(await res.text());
      setSelectedGroupId(null);
      setQuestions([]);
      await loadGroups();
    } catch (err) {
      console.error(err);
      setError("Не вдалося видалити групу. Перевірте, чи не використовується вона в тестах.");
    }
  }

  async function handleCreateQuestion(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccessMsg(null);

    if (!selectedGroupId) {
      setError("Оберіть групу для питання");
      return;
    }
    if (!qText.trim() && !qImageUrl) {
      setError("Введіть текст питання або додайте зображення");
      return;
    }

    // Build payload based on type
    const payload: Record<string, unknown> = {
      groupId: selectedGroupId,
      type: qType,
      text: qText.trim(),
      imageUrl: qImageUrl || undefined,
      weight: qWeight,
      perQuestionTimeSec: qTimeSec || undefined,
    };

    if (qType === "SINGLE_CHOICE" || qType === "MULTIPLE_CHOICE") {
      // Validate options
      const filledOptions = qOptions.filter((o) => o.value.trim() || o.imageUrl);
      if (filledOptions.length < 2) {
        setError("Введіть принаймні 2 варіанти відповіді");
        return;
      }
      const hasCorrect = filledOptions.some((o) => o.isCorrect);
      if (!hasCorrect) {
        setError("Позначте хоча б одну правильну відповідь");
        return;
      }
      payload.options = filledOptions.map((o, i) => ({
        label: o.label,
        value: o.value.trim(),
        imageUrl: o.imageUrl || undefined,
        isCorrect: o.isCorrect,
        orderIndex: i,
      }));
    } else if (qType === "MATCHING") {
      // Validate matching pairs
      const filledPairs = matchingPairs.filter((p) => p.left.trim() && p.right.trim());
      if (filledPairs.length < 2) {
        setError("Введіть принаймні 2 пари для відповідності");
        return;
      }
      // Store as JSON schema: { "left1": "right1", ... }
      const schema: Record<string, string> = {};
      filledPairs.forEach((p) => {
        schema[p.left.trim()] = p.right.trim();
      });
      payload.matchingSchema = schema;
    } else if (qType === "OPEN_TEXT") {
      const expectedAnswers = openTextExpected
        .map((v) => v.trim())
        .filter((v) => v.length > 0);
      payload.gradingConfig = {
        format: openTextFormat,
        matchingMode: openTextMatchingMode,
        expectedAnswers,
        ...(openTextFormat === "CODE" ? { language: codeLanguage } : {}),
      };
    } else if (qType === "GAP_TEXT") {
      const gaps = gapItems
        .map((g) => ({
          id: g.id.trim(),
          mode: g.mode,
          options:
            g.mode === "SELECT"
              ? g.options
                  .split(",")
                  .map((v) => v.trim())
                  .filter(Boolean)
              : undefined,
          correctAnswers: g.correctAnswers
            .split(",")
            .map((v) => v.trim())
            .filter(Boolean),
          matchingMode: g.matchingMode,
        }))
        .filter((g) => g.id);

      if (gaps.length === 0) {
        setError("Додайте хоча б один пропуск і правильну відповідь");
        return;
      }

      payload.gapSchema = { gaps };
    }

    try {
      const res = await fetch("/api/teacher/questions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(text);
      }
      setSuccessMsg("Питання створено!");
      resetQuestionForm();
      setShowQuestionModal(false);
      await loadQuestions(selectedGroupId);
    } catch (err) {
      console.error(err);
      setError("Не вдалося створити питання");
    }
  }

  const questionPreviewSrc = resolveMediaUrl(qImageUrl);

  return (
    <div className="space-y-4">
      <header className="mb-2 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-50">
            Банк питань
          </h1>
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            Керуйте групами та питаннями для своїх тестів.
          </p>
        </div>
      </header>

      {error && (
        <p className="text-sm text-red-500" role="alert">
          {error}
        </p>
      )}
      {successMsg && (
        <p className="text-sm text-green-600" role="status">
          {successMsg}
        </p>
      )}

      <div className="grid gap-4 md:grid-cols-[260px,1fr]">
        {/* Sidebar: Groups */}
        <aside className="space-y-4 rounded-xl border border-zinc-200 bg-white p-3 text-sm dark:border-zinc-800 dark:bg-zinc-900">
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
            Групи питань
          </h2>
          <div className="space-y-1">
            {groups.map((g) => (
              <div key={g.id} className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => {
                    setSelectedGroupId(g.id);
                    loadQuestions(g.id);
                  }}
                  className={`flex-1 rounded-lg px-3 py-2 text-left text-sm transition ${
                    selectedGroupId === g.id
                      ? "bg-blue-600 text-white"
                      : "bg-zinc-100 text-zinc-800 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-100 dark:hover:bg-zinc-700"
                  }`}
                >
                  <div className="font-medium">{g.name}</div>
                  {g.description && (
                    <div className="text-xs opacity-80">{g.description}</div>
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => deleteGroup(g.id)}
                  className="rounded-lg p-2 text-zinc-400 hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-900/20"
                  title="Видалити групу"
                >
                  ✕
                </button>
              </div>
            ))}
            {groups.length === 0 && (
              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                Поки що немає жодної групи.
              </p>
            )}
          </div>

          <form onSubmit={handleCreateGroup} className="mt-3 space-y-2 border-t border-zinc-200 pt-3 text-xs dark:border-zinc-800">
            <p className="font-semibold text-zinc-700 dark:text-zinc-200">
              Нова група
            </p>
            <input
              type="text"
              value={newGroupName}
              onChange={(e) => setNewGroupName(e.target.value)}
className="w-full rounded-lg border border-zinc-200 bg-zinc-50 px-2 py-1 text-xs text-zinc-900 outline-none ring-0 focus:border-blue-500 focus:ring-1 focus:ring-blue-200 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-50 dark:focus:border-blue-400 dark:focus:ring-blue-900/40"
              placeholder="Назва групи"
            />
            <input
              type="text"
              value={newGroupDesc}
              onChange={(e) => setNewGroupDesc(e.target.value)}
className="w-full rounded-lg border border-zinc-200 bg-zinc-50 px-2 py-1 text-xs text-zinc-900 outline-none ring-0 focus:border-blue-500 focus:ring-1 focus:ring-blue-200 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-50 dark:focus:border-blue-400 dark:focus:ring-blue-900/40"
              placeholder="Опис (необов'язково)"
            />
            <button
              type="submit"
              className="w-full rounded-lg bg-blue-600 px-2 py-1 text-xs font-semibold text-white hover:bg-blue-700"
            >
              Створити групу
            </button>
          </form>
        </aside>

        {/* Main: Questions */}
        <section className="space-y-3 rounded-xl border border-zinc-200 bg-white p-4 text-sm dark:border-zinc-800 dark:bg-zinc-900">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
              Питання
            </h2>
            <div className="flex items-center gap-2">
              {loading && (
                <p className="text-xs text-zinc-500 dark:text-zinc-400">
                  Завантаження...
                </p>
              )}
              {selectedGroupId && (
                <button
                  type="button"
                  onClick={() => {
                    resetQuestionForm();
                    setShowQuestionModal(true);
                  }}
                  className="rounded-lg bg-green-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-green-700"
                >
                  + Додати питання
                </button>
              )}
            </div>
          </div>

          {selectedGroupId ? (
            <div className="space-y-2">
              {questions.map((q, idx) => {
                const questionImageSrc = resolveMediaUrl(q.imageUrl);
                return (
                  <div
                    key={q.id}
                    className="rounded-lg border border-zinc-200 bg-zinc-50 p-3 text-sm dark:border-zinc-700 dark:bg-zinc-800"
                  >
                    <div className="mb-1 flex items-center justify-between text-xs text-zinc-500 dark:text-zinc-400">
                      <div className="flex gap-2">
                        <span className="font-medium">
                          #{idx + 1} · {QUESTION_TYPE_LABELS[q.type]}
                        </span>
                        <span>Вага: {q.weight}{q.perQuestionTimeSec ? ` · ${q.perQuestionTimeSec}с` : ""}</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => deleteQuestion(q.id)}
                        className="text-zinc-400 hover:text-red-500"
                        title="Видалити питання"
                      >
                        ✕
                      </button>
                    </div>
                    {questionImageSrc && (
                      <img
                        src={questionImageSrc}
                        alt="question"
                        className="mb-2 max-h-48 w-auto rounded-md border border-zinc-200 dark:border-zinc-700"
                      />
                    )}
                    <LatexText
                      text={q.text}
                      className="text-sm text-zinc-900 dark:text-zinc-50 whitespace-pre-wrap mb-2"
                    />
                    {/* Show options for choice questions */}
                    {(q.type === "SINGLE_CHOICE" || q.type === "MULTIPLE_CHOICE") && q.options && (
                      <ul className="ml-2 space-y-1">
                        {q.options.map((opt) => {
                          const optionImageSrc = resolveMediaUrl(opt.imageUrl);
                          return (
                            <li
                              key={opt.id || opt.orderIndex}
                              className={`text-xs flex items-start gap-2 ${
                                opt.isCorrect
                                  ? "text-green-600 dark:text-green-400 font-semibold"
                                  : "text-zinc-600 dark:text-zinc-400"
                              }`}
                            >
                              <span className="w-5 pt-0.5">{opt.label}.</span>
                              <div className="space-y-1">
                                {optionImageSrc && (
                                  <img
                                    src={optionImageSrc}
                                    alt="option"
                                    className="max-h-32 w-auto rounded-md border border-zinc-200 dark:border-zinc-700"
                                  />
                                )}
                                <LatexText text={opt.value} className="text-xs text-inherit" />
                              </div>
                              {opt.isCorrect && <span className="ml-1">✓</span>}
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  {/* Show matching pairs */}
                  {q.type === "MATCHING" && q.matchingSchema && (
                    <div className="mt-1 text-xs">
                      <span className="font-medium text-zinc-500 dark:text-zinc-400">Пари:</span>
                      <ul className="ml-2 mt-1 space-y-0.5">
                        {Object.entries(q.matchingSchema).map(([left, right], i) => (
                          <li key={i} className="text-zinc-700 dark:text-zinc-300">
                            {left} → {right}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  </div>
                );
              })}
              {questions.length === 0 && (
                <p className="text-xs text-zinc-500 dark:text-zinc-400">
                  У цій групі ще немає питань. Натисніть "+ Додати питання", щоб створити.
                </p>
              )}
            </div>
          ) : (
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              Оберіть групу, щоб переглянути питання.
            </p>
          )}
        </section>
      </div>

      {/* Question Creation Modal */}
      {showQuestionModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-xl bg-white p-6 dark:bg-zinc-900">
            <h3 className="mb-4 text-lg font-semibold text-zinc-900 dark:text-zinc-50">
              Нове питання
            </h3>
            <form onSubmit={handleCreateQuestion} className="space-y-4">
              {/* Question type */}
              <div>
                <label className="mb-1 block text-xs font-medium text-zinc-700 dark:text-zinc-300">
                  Тип питання
                </label>
                <select
                  value={qType}
                  onChange={(e) => setQType(e.target.value as QuestionType)}
                  className="w-full rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm text-zinc-900 outline-none focus:border-blue-500 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-50"
                >
                  <option value="SINGLE_CHOICE">Одна відповідь</option>
                  <option value="MULTIPLE_CHOICE">Множинний вибір</option>
                  <option value="OPEN_TEXT">Відкрита відповідь</option>
                  <option value="MATCHING">Відповідність</option>
                  <option value="GAP_TEXT">Пропуски в тексті</option>
                </select>
              </div>

              {/* Question text */}
              <div>
                <label className="mb-1 block text-xs font-medium text-zinc-700 dark:text-zinc-300">
                  Текст питання (підтримує LaTeX: $формула$)
                </label>
                <div className="mb-2 flex flex-wrap items-center gap-2 text-[11px] text-zinc-600 dark:text-zinc-300">
                  <button
                    type="button"
                    onClick={() => insertFormulaIntoQuestion(false)}
                    className="rounded-md border border-zinc-200 px-2 py-1 hover:bg-zinc-50 dark:border-zinc-700 dark:hover:bg-zinc-800"
                  >
                    + Формула
                  </button>
                  <button
                    type="button"
                    onClick={() => insertFormulaIntoQuestion(true)}
                    className="rounded-md border border-zinc-200 px-2 py-1 hover:bg-zinc-50 dark:border-zinc-700 dark:hover:bg-zinc-800"
                  >
                    + Формула (блок)
                  </button>
                  <button
                    type="button"
                    onClick={() => questionImageInputRef.current?.click()}
                    className="rounded-md border border-zinc-200 px-2 py-1 hover:bg-zinc-50 dark:border-zinc-700 dark:hover:bg-zinc-800"
                  >
                    + Зображення
                  </button>
                  <span className="text-[10px] text-zinc-400">
                    (можна вставляти з Word/буфера)
                  </span>
                  <input
                    ref={questionImageInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={async (e) => {
                      const input = e.currentTarget;
                      const file = input?.files?.[0];
                      if (!file) return;
                      try {
                        await handleQuestionImageFile(file);
                      } finally {
                        if (input) input.value = "";
                      }
                    }}
                  />
                </div>
                <textarea
                  value={qText}
                  onChange={(e) => setQText(e.target.value)}
                  ref={qTextRef}
                  onPaste={async (e) => {
                    const handledImage = await handleImagePaste(e, handleQuestionImageFile);
                    if (!handledImage) {
                      handleFormulaPaste(e, qText, setQText, qTextRef);
                    }
                  }}
                  rows={3}
                  className="w-full rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm text-zinc-900 outline-none focus:border-blue-500 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-50"
                  placeholder="Введіть текст питання..."
                />
                {(qText.trim() || questionPreviewSrc) && (
                  <div className="mt-2 rounded-lg bg-zinc-50 p-2 text-xs text-zinc-800 dark:bg-zinc-800 dark:text-zinc-50">
                    <p className="mb-1 font-medium text-zinc-600 dark:text-zinc-300">
                      Попередній перегляд:
                    </p>
                    {questionPreviewSrc && (
                      <div className="mb-2 space-y-1">
                        <img
                          src={questionPreviewSrc}
                          alt="question"
                          className="max-h-64 w-auto rounded-md border border-zinc-200 dark:border-zinc-700"
                        />
                        <button
                          type="button"
                          onClick={() => setQImageUrl(null)}
                          className="text-[11px] text-red-500 hover:text-red-700"
                        >
                          Видалити зображення
                        </button>
                      </div>
                    )}
                    {qText.trim() && (
                      <LatexText
                        text={qText}
                        className="text-sm text-zinc-900 dark:text-zinc-50 whitespace-pre-wrap"
                      />
                    )}
                  </div>
                )}
              </div>

              {/* Weight and time */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="mb-1 block text-xs font-medium text-zinc-700 dark:text-zinc-300">
                    Вага (бали)
                  </label>
                  <input
                    type="number"
                    min={0.5}
                    step={0.5}
                    value={qWeight}
                    onChange={(e) => setQWeight(Number(e.target.value))}
                    className="w-full rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm text-zinc-900 outline-none focus:border-blue-500 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-50"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-zinc-700 dark:text-zinc-300">
                    Ліміт часу (сек, необов&apos;язково)
                  </label>
                  <input
                    type="number"
                    min={0}
                    value={qTimeSec ?? ""}
                    onChange={(e) => setQTimeSec(e.target.value ? Number(e.target.value) : undefined)}
                    className="w-full rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm text-zinc-900 outline-none focus:border-blue-500 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-50"
                    placeholder="Без обмеження"
                  />
                </div>
              </div>

              {/* Options for SINGLE_CHOICE / MULTIPLE_CHOICE */}
              {(qType === "SINGLE_CHOICE" || qType === "MULTIPLE_CHOICE") && (
                <div>
                  <label className="mb-2 block text-xs font-medium text-zinc-700 dark:text-zinc-300">
                    Варіанти відповідей {qType === "MULTIPLE_CHOICE" && "(можна обрати декілька правильних)"}
                  </label>
                  <div className="space-y-2">
                    {qOptions.map((opt, idx) => (
                      <div key={idx} className="flex items-start gap-2">
                        <span className="w-6 pt-2 text-xs font-semibold text-zinc-500 dark:text-zinc-400">
                          {opt.label}.
                        </span>
                        <div className="flex-1 space-y-1">
                          <textarea
                            value={opt.value}
                            onChange={(e) => {
                              const updated = [...qOptions];
                              updated[idx].value = e.target.value;
                              setQOptions(updated);
                            }}
                            ref={(el) => { optionRefs.current[idx] = el; }}
                            onPaste={async (e) => {
                              const handledImage = await handleImagePaste(e, (file) =>
                                handleOptionImageFile(idx, file),
                              );
                              if (!handledImage) {
                                handleFormulaPaste(e, opt.value, (next) => {
                                  const updated = [...qOptions];
                                  updated[idx] = { ...updated[idx], value: next };
                                  setQOptions(updated);
                                }, { current: optionRefs.current[idx] });
                              }
                            }}
                            rows={2}
                            className="w-full rounded-lg border border-zinc-200 bg-zinc-50 px-2 py-1.5 text-sm text-zinc-900 outline-none focus:border-blue-500 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-50"
                            placeholder="Текст варіанту"
                          />
                          <div className="flex flex-wrap items-center gap-2 text-[11px] text-zinc-600 dark:text-zinc-300">
                            <button
                              type="button"
                              onClick={() => insertFormulaIntoOption(idx, false)}
                              className="rounded-md border border-zinc-200 px-2 py-0.5 hover:bg-zinc-50 dark:border-zinc-700 dark:hover:bg-zinc-800"
                            >
                              + Формула
                            </button>
                            <button
                              type="button"
                              onClick={() => insertFormulaIntoOption(idx, true)}
                              className="rounded-md border border-zinc-200 px-2 py-0.5 hover:bg-zinc-50 dark:border-zinc-700 dark:hover:bg-zinc-800"
                            >
                              + Формула (блок)
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setOptionImageIndex(idx);
                                optionImageInputRef.current?.click();
                              }}
                              className="rounded-md border border-zinc-200 px-2 py-0.5 hover:bg-zinc-50 dark:border-zinc-700 dark:hover:bg-zinc-800"
                            >
                              + Зображення
                            </button>
                          </div>
                          {opt.imageUrl && (
                            <div className="mt-1 space-y-1">
                              <img
                                src={resolveMediaUrl(opt.imageUrl) ?? undefined}
                                alt="option"
                                className="max-h-40 w-auto rounded-md border border-zinc-200 dark:border-zinc-700"
                              />
                              <button
                                type="button"
                                onClick={() => {
                                  const updated = [...qOptions];
                                  updated[idx].imageUrl = undefined;
                                  setQOptions(updated);
                                }}
                                className="text-[11px] text-red-500 hover:text-red-700"
                              >
                                Видалити зображення
                              </button>
                            </div>
                          )}
                        </div>
                        <button
                          type="button"
                          onClick={() => toggleCorrect(idx)}
                          className={`rounded px-2 py-1 text-xs font-medium transition ${
                            opt.isCorrect
                              ? "bg-green-600 text-white"
                              : "bg-zinc-200 text-zinc-600 dark:bg-zinc-700 dark:text-zinc-300"
                          }`}
                        >
                          {opt.isCorrect ? "✓ Правильно" : "Неправильно"}
                        </button>
                        {qOptions.length > 2 && (
                          <button
                            type="button"
                            onClick={() => removeOption(idx)}
                            className="text-red-500 hover:text-red-700 text-xs"
                          >
                            ✕
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                  <button
                    type="button"
                    onClick={addOption}
                    className="mt-2 text-xs text-blue-600 hover:underline dark:text-blue-400"
                  >
                    + Додати варіант
                  </button>
                  <input
                    ref={optionImageInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={async (e) => {
                      const input = e.currentTarget;
                      const file = input?.files?.[0];
                      if (file != null && optionImageIndex != null) {
                        try {
                          await handleOptionImageFile(optionImageIndex, file);
                        } finally {
                          setOptionImageIndex(null);
                          if (input) input.value = "";
                        }
                      }
                    }}
                  />
                </div>
              )}

              {/* Gap text */}
              {qType === "GAP_TEXT" && (
                <div className="space-y-2 rounded-lg border border-zinc-200 bg-zinc-50 p-3 text-xs dark:border-zinc-700 dark:bg-zinc-800">
                  <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
                    Використовуйте у тексті маркери виду <code>[[gap1]]</code>, <code>[[gap2]]</code> тощо.
                  </p>
                  <div className="space-y-2">
                    {gapItems.map((gap, idx) => (
                      <div
                        key={idx}
                        className="grid gap-2 rounded-md border border-zinc-200 bg-white p-2 dark:border-zinc-700 dark:bg-zinc-900"
                      >
                        <div className="grid gap-2 md:grid-cols-2">
                          <div>
                            <label className="mb-1 block text-[11px] text-zinc-600 dark:text-zinc-300">
                              ID пропуску
                            </label>
                            <input
                              type="text"
                              value={gap.id}
                              onChange={(e) => updateGapItem(idx, { id: e.target.value })}
                              className="w-full rounded-md border border-zinc-300 bg-white px-2 py-1 text-xs text-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
                              placeholder="gap1"
                            />
                          </div>
                          <div>
                            <label className="mb-1 block text-[11px] text-zinc-600 dark:text-zinc-300">
                              Тип відповіді
                            </label>
                            <select
                              value={gap.mode}
                              onChange={(e) =>
                                updateGapItem(idx, { mode: e.target.value as GapItem["mode"] })
                              }
                              className="w-full rounded-md border border-zinc-300 bg-white px-2 py-1 text-xs text-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
                            >
                              <option value="TEXT">Текст</option>
                              <option value="SELECT">Випадаючий список</option>
                            </select>
                          </div>
                        </div>
                        {gap.mode === "SELECT" && (
                          <div>
                            <label className="mb-1 block text-[11px] text-zinc-600 dark:text-zinc-300">
                              Варіанти (через кому)
                            </label>
                            <input
                              type="text"
                              value={gap.options}
                              onChange={(e) => updateGapItem(idx, { options: e.target.value })}
                              className="w-full rounded-md border border-zinc-300 bg-white px-2 py-1 text-xs text-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
                              placeholder="варіант1, варіант2"
                            />
                          </div>
                        )}
                        <div className="grid gap-2 md:grid-cols-2">
                          <div>
                            <label className="mb-1 block text-[11px] text-zinc-600 dark:text-zinc-300">
                              Правильні відповіді (через кому)
                            </label>
                            <input
                              type="text"
                              value={gap.correctAnswers}
                              onChange={(e) =>
                                updateGapItem(idx, { correctAnswers: e.target.value })
                              }
                              className="w-full rounded-md border border-zinc-300 bg-white px-2 py-1 text-xs text-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
                              placeholder="правильна, ще одна"
                            />
                          </div>
                          <div>
                            <label className="mb-1 block text-[11px] text-zinc-600 dark:text-zinc-300">
                              Режим перевірки
                            </label>
                            <select
                              value={gap.matchingMode}
                              onChange={(e) =>
                                updateGapItem(idx, {
                                  matchingMode: e.target.value as TextMatchMode,
                                })
                              }
                              className="w-full rounded-md border border-zinc-300 bg-white px-2 py-1 text-xs text-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
                            >
                              <option value="EXACT">Точний збіг</option>
                              <option value="CASE_INSENSITIVE">Без урахування регістру</option>
                              <option value="CONTAINS">Містить</option>
                              <option value="REGEX">Регулярний вираз</option>
                            </select>
                          </div>
                        </div>
                        {gapItems.length > 1 && (
                          <button
                            type="button"
                            onClick={() => removeGapItem(idx)}
                            className="self-end text-xs text-red-500 hover:text-red-700"
                          >
                            ✕ Видалити
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                  <button
                    type="button"
                    onClick={addGapItem}
                    className="text-xs text-blue-600 hover:underline dark:text-blue-400"
                  >
                    + Додати пропуск
                  </button>
                </div>
              )}

              {/* Matching pairs */}
              {qType === "MATCHING" && (
                <div>
                  <label className="mb-2 block text-xs font-medium text-zinc-700 dark:text-zinc-300">
                    Пари для відповідності (ліва частина → права частина)
                  </label>
                  <div className="space-y-2">
                    {matchingPairs.map((pair, idx) => (
                      <div key={idx} className="flex items-center gap-2">
                        <input
                          type="text"
                          value={pair.left}
                          onChange={(e) => {
                            const updated = [...matchingPairs];
                            updated[idx].left = e.target.value;
                            setMatchingPairs(updated);
                          }}
                          className="flex-1 rounded-lg border border-zinc-200 bg-zinc-50 px-2 py-1.5 text-sm text-zinc-900 outline-none focus:border-blue-500 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-50"
                          placeholder="Ліва частина"
                        />
                        <span className="text-zinc-400">→</span>
                        <input
                          type="text"
                          value={pair.right}
                          onChange={(e) => {
                            const updated = [...matchingPairs];
                            updated[idx].right = e.target.value;
                            setMatchingPairs(updated);
                          }}
                          className="flex-1 rounded-lg border border-zinc-200 bg-zinc-50 px-2 py-1.5 text-sm text-zinc-900 outline-none focus:border-blue-500 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-50"
                          placeholder="Права частина"
                        />
                        {matchingPairs.length > 2 && (
                          <button
                            type="button"
                            onClick={() => removeMatchingPair(idx)}
                            className="text-red-500 hover:text-red-700 text-xs"
                          >
                            ✕
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                  <button
                    type="button"
                    onClick={addMatchingPair}
                    className="mt-2 text-xs text-blue-600 hover:underline dark:text-blue-400"
                  >
                    + Додати пару
                  </button>
                </div>
              )}

              {/* Open text config */}
              {qType === "OPEN_TEXT" && (
                <div className="space-y-2 rounded-lg border border-zinc-200 bg-zinc-50 p-3 text-xs dark:border-zinc-700 dark:bg-zinc-800">
                  <div className="grid gap-2 md:grid-cols-2">
                    <div>
                      <label className="mb-1 block text-[11px] font-medium text-zinc-600 dark:text-zinc-300">
                        Формат відповіді
                      </label>
                      <select
                        value={openTextFormat}
                        onChange={(e) => setOpenTextFormat(e.target.value as OpenTextFormat)}
                        className="w-full rounded-md border border-zinc-300 bg-white px-2 py-1 text-xs text-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
                      >
                        <option value="SHORT_TEXT">Короткий текст</option>
                        <option value="LONG_TEXT">Довгий текст</option>
                        <option value="NUMBER">Число</option>
                        <option value="CODE">Код</option>
                      </select>
                    </div>
                    {openTextFormat === "CODE" && (
                      <div>
                        <label className="mb-1 block text-[11px] font-medium text-zinc-600 dark:text-zinc-300">
                          Мова програмування
                        </label>
                        <select
                          value={codeLanguage}
                          onChange={(e) => setCodeLanguage(e.target.value)}
                          className="w-full rounded-md border border-zinc-300 bg-white px-2 py-1 text-xs text-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
                        >
                          <option value="python">Python</option>
                          <option value="javascript">JavaScript</option>
                          <option value="typescript">TypeScript</option>
                          <option value="java">Java</option>
                          <option value="cpp">C++</option>
                          <option value="c">C</option>
                        </select>
                      </div>
                    )}
                    {openTextFormat !== "CODE" && (
                      <div>
                        <label className="mb-1 block text-[11px] font-medium text-zinc-600 dark:text-zinc-300">
                          Режим перевірки
                        </label>
                        <select
                          value={openTextMatchingMode}
                          onChange={(e) => setOpenTextMatchingMode(e.target.value as TextMatchMode)}
                          className="w-full rounded-md border border-zinc-300 bg-white px-2 py-1 text-xs text-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
                        >
                          <option value="EXACT">Точний збіг</option>
                          <option value="CASE_INSENSITIVE">Без урахування регістру</option>
                          <option value="CONTAINS">Містить</option>
                          <option value="REGEX">Регулярний вираз</option>
                        </select>
                      </div>
                    )}
                  </div>
                  {openTextFormat !== "CODE" && (
                    <>
                      <div>
                        <label className="mb-1 block text-[11px] font-medium text-zinc-600 dark:text-zinc-300">
                          Правильні відповіді (можна кілька)
                        </label>
                        <div className="space-y-1">
                          {openTextExpected.map((val, idx) => (
                            <div key={idx} className="flex items-center gap-2">
                              <input
                                type="text"
                                value={val}
                                onChange={(e) => updateOpenTextExpected(idx, e.target.value)}
                                className="flex-1 rounded-md border border-zinc-300 bg-white px-2 py-1 text-xs text-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
                                placeholder="Варіант правильної відповіді"
                              />
                              {openTextExpected.length > 1 && (
                                <button
                                  type="button"
                                  onClick={() => removeOpenTextExpected(idx)}
                                  className="text-red-500 hover:text-red-700 text-xs"
                                >
                                  ✕
                                </button>
                              )}
                            </div>
                          ))}
                        </div>
                        <button
                          type="button"
                          onClick={addOpenTextExpected}
                          className="mt-2 text-xs text-blue-600 hover:underline dark:text-blue-400"
                        >
                          + Додати відповідь
                        </button>
                      </div>
                      <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
                        Якщо список правильних відповідей порожній — перевірка буде ручною.
                      </p>
                    </>
                  )}
                  {openTextFormat === "CODE" && (
                    <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
                      Студент отримає редактор коду з підсвіткою синтаксису. Перевірка — ручна.
                    </p>
                  )}
                </div>
              )}

              {/* Actions */}
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowQuestionModal(false)}
                  className="rounded-lg bg-zinc-200 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-300 dark:bg-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-600"
                >
                  Скасувати
                </button>
                <button
                  type="submit"
                  className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
                >
                  Створити питання
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
