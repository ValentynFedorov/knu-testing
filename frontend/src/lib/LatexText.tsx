"use client";

import React from "react";
import ReactMarkdown, { defaultUrlTransform } from "react-markdown";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import "katex/dist/katex.min.css";

interface LatexTextProps {
  text: string;
  className?: string;
}

export default function LatexText({ text, className }: LatexTextProps) {
  return (
    <div className={className}>
      <ReactMarkdown
        remarkPlugins={[remarkMath]}
        rehypePlugins={[rehypeKatex]}
        urlTransform={(url) => {
          if (url.startsWith("data:")) return url;
          return defaultUrlTransform(url);
        }}
      >
        {text}
      </ReactMarkdown>
    </div>
  );
}
