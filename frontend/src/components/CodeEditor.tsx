"use client";

import CodeMirror from "@uiw/react-codemirror";
import { oneDark } from "@codemirror/theme-one-dark";
import { javascript } from "@codemirror/lang-javascript";
import { python } from "@codemirror/lang-python";
import { java } from "@codemirror/lang-java";
import { cpp } from "@codemirror/lang-cpp";
import { useMemo } from "react";

const LANGUAGE_EXTENSIONS: Record<string, () => ReturnType<typeof javascript>> = {
  javascript,
  typescript: () => javascript({ typescript: true }),
  python,
  java,
  cpp,
  c: cpp,
};

export const SUPPORTED_LANGUAGES = [
  { value: "python", label: "Python" },
  { value: "javascript", label: "JavaScript" },
  { value: "typescript", label: "TypeScript" },
  { value: "java", label: "Java" },
  { value: "cpp", label: "C++" },
  { value: "c", label: "C" },
];

interface CodeEditorProps {
  value: string;
  onChange: (value: string) => void;
  language?: string;
  readOnly?: boolean;
  height?: string;
}

export default function CodeEditor({
  value,
  onChange,
  language = "python",
  readOnly = false,
  height = "300px",
}: CodeEditorProps) {
  const extensions = useMemo(() => {
    const langFn = LANGUAGE_EXTENSIONS[language];
    return langFn ? [langFn()] : [];
  }, [language]);

  return (
    <CodeMirror
      value={value}
      onChange={onChange}
      extensions={extensions}
      theme={oneDark}
      readOnly={readOnly}
      height={height}
      basicSetup={{
        lineNumbers: true,
        foldGutter: true,
        bracketMatching: true,
        autocompletion: false,
        indentOnInput: true,
      }}
      className="overflow-hidden rounded-lg border border-zinc-700 text-sm"
    />
  );
}
