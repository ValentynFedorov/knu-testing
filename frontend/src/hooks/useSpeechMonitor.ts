"use client";

import { useEffect, useRef } from "react";
import { logIntegrityEvent } from "@/lib/api";

const COOLDOWN_MS = 20000; // 20s between speech events
const RESTART_DELAY_MS = 300; // delay before restarting recognition

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
  const activeRef = useRef(active);
  const attemptIdRef = useRef(attemptId);
  const questionIdRef = useRef(attemptQuestionId);

  // Keep refs in sync so callbacks use latest values
  useEffect(() => {
    activeRef.current = active;
    attemptIdRef.current = attemptId;
    questionIdRef.current = attemptQuestionId;
  }, [active, attemptId, attemptQuestionId]);

  useEffect(() => {
    if (!active || !attemptId) return;

    const SpeechRecognition =
      (window as any).SpeechRecognition ||
      (window as any).webkitSpeechRecognition;

    if (!SpeechRecognition) {
      console.warn("[SpeechMonitor] Web Speech API not supported in this browser");
      return;
    }

    let stopped = false;

    function createAndStart() {
      if (stopped) return;

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
          console.log("[SpeechMonitor] Transcript:", transcript, "confidence:", Math.round(confidence * 100) + "%");
          const analysis = isSuspicious(transcript);

          if (analysis.suspicious) {
            const now = Date.now();
            if (now - lastLoggedRef.current > COOLDOWN_MS) {
              lastLoggedRef.current = now;
              logIntegrityEvent({
                attemptId: attemptIdRef.current!,
                attemptQuestionId: questionIdRef.current ?? undefined,
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
        const err = event.error;
        if (err === "no-speech" || err === "aborted") {
          // Normal — silence or tab switch, will auto-restart via onend
          return;
        }
        if (err === "not-allowed") {
          console.warn("[SpeechMonitor] Microphone permission denied for Speech API");
          return;
        }
        if (err === "network") {
          console.warn("[SpeechMonitor] Network error — Speech API requires internet connection");
          return;
        }
        console.error("[SpeechMonitor] Speech recognition error:", err);
      };

      recognition.onend = () => {
        // Auto-restart if still active (Chrome stops continuous recognition periodically)
        if (!stopped && activeRef.current) {
          setTimeout(() => {
            if (!stopped && activeRef.current) {
              createAndStart();
            }
          }, RESTART_DELAY_MS);
        }
      };

      try {
        recognition.start();
        console.log("[SpeechMonitor] Started speech recognition (uk-UA)");
      } catch (err) {
        console.error("[SpeechMonitor] Failed to start:", err);
        // Retry after delay
        if (!stopped) {
          setTimeout(() => createAndStart(), 2000);
        }
      }
    }

    // Request microphone permission first, then start speech recognition
    // This ensures the permission prompt appears
    navigator.mediaDevices
      .getUserMedia({ audio: true })
      .then((stream) => {
        // Stop the stream — we just needed the permission
        stream.getTracks().forEach((t) => t.stop());
        console.log("[SpeechMonitor] Microphone permission granted");
        createAndStart();
      })
      .catch((err) => {
        console.warn("[SpeechMonitor] Microphone permission denied, trying Speech API anyway:", err);
        // Try anyway — some browsers allow SpeechRecognition without getUserMedia
        createAndStart();
      });

    return () => {
      stopped = true;
      if (recognitionRef.current) {
        try {
          recognitionRef.current.stop();
        } catch {
          // ignore
        }
        recognitionRef.current = null;
      }
    };
    // Only re-create when active or attemptId changes — not on every questionId change
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, attemptId]);
}
