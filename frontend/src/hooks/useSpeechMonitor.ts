"use client";

import { useEffect, useRef } from "react";
import { logIntegrityEvent } from "@/lib/api";

const COOLDOWN_MS = 20000; // 20s between speech events

// Ukrainian question / command patterns that suggest querying an assistant
const SUSPICIOUS_PATTERNS = [
  // Question words
  /\b(як|що|чому|де|коли|який|яка|яке|які|скільки|хто|чий|звідки|навіщо)\b/i,
  // Command patterns (hey siri / ok google style)
  /\b(окей гугл|привіт сірі|алекса|гей|допоможи|підкажи|розкажи|поясни|знайди)\b/i,
  // "What is..." / "How to..." patterns
  /\b(що таке|як зробити|як написати|як вирішити|яка відповідь|яка формула)\b/i,
];

function isSuspicious(text: string): { suspicious: boolean; reason: string } {
  const trimmed = text.trim().toLowerCase();
  if (trimmed.length < 5) return { suspicious: false, reason: "" };

  for (const pattern of SUSPICIOUS_PATTERNS) {
    if (pattern.test(trimmed)) {
      return {
        suspicious: true,
        reason: `Detected query pattern: "${trimmed.slice(0, 80)}"`,
      };
    }
  }

  // Long coherent speech (>15 words) during exam is suspicious regardless
  const wordCount = trimmed.split(/\s+/).length;
  if (wordCount > 15) {
    return {
      suspicious: true,
      reason: `Extended speech detected (${wordCount} words): "${trimmed.slice(0, 80)}"`,
    };
  }

  return { suspicious: false, reason: "" };
}

/**
 * Uses the Web Speech API to continuously transcribe speech in Ukrainian.
 * Analyzes transcribed text for suspicious patterns (queries, commands, conversation).
 * Logs SUSPICIOUS_SPEECH integrity events.
 */
export function useSpeechMonitor(
  active: boolean,
  attemptId: string | null,
  attemptQuestionId: string | null,
) {
  const lastLoggedRef = useRef<number>(0);
  const recognitionRef = useRef<any>(null);

  useEffect(() => {
    if (!active || !attemptId) return;

    const SpeechRecognition =
      (window as any).SpeechRecognition ||
      (window as any).webkitSpeechRecognition;

    if (!SpeechRecognition) {
      console.warn("Web Speech API not supported in this browser");
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.lang = "uk-UA";
    recognition.continuous = true;
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;
    recognitionRef.current = recognition;

    recognition.onresult = (event: any) => {
      for (let i = event.resultIndex; i < event.results.length; i++) {
        if (!event.results[i].isFinal) continue;

        const transcript = event.results[i][0].transcript;
        const confidence = event.results[i][0].confidence;
        const analysis = isSuspicious(transcript);

        if (analysis.suspicious) {
          const now = Date.now();
          if (now - lastLoggedRef.current > COOLDOWN_MS) {
            lastLoggedRef.current = now;
            logIntegrityEvent({
              attemptId: attemptId!,
              attemptQuestionId: attemptQuestionId ?? undefined,
              type: "SUSPICIOUS_SPEECH",
              startedAt: new Date().toISOString(),
              metadata: {
                transcript: transcript.slice(0, 200),
                confidence: Math.round(confidence * 100),
                reason: analysis.reason,
              },
            }).catch(console.error);
          }
        }
      }
    };

    recognition.onerror = (event: any) => {
      // "no-speech" is normal — just means silence, restart
      if (event.error === "no-speech" || event.error === "aborted") return;
      console.error("Speech recognition error:", event.error);
    };

    recognition.onend = () => {
      // Auto-restart if still active
      try {
        if (recognitionRef.current) {
          recognitionRef.current.start();
        }
      } catch {
        // ignore — may throw if already started
      }
    };

    try {
      recognition.start();
    } catch {
      // ignore
    }

    return () => {
      recognitionRef.current = null;
      try {
        recognition.stop();
      } catch {
        // ignore
      }
    };
  }, [active, attemptId, attemptQuestionId]);
}
