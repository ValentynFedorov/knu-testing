"use client";

import { useEffect, useRef } from "react";
import { logIntegrityEvent } from "@/lib/api";

const COOLDOWN_MS = 15000; // 15s between speech events
const SPEECH_THRESHOLD = 30; // volume level to consider as speech (0-128)
const SPEECH_MIN_DURATION_MS = 2000; // minimum duration of speech to log
const CHECK_INTERVAL_MS = 200; // how often to check audio levels
const TRANSCRIPT_WINDOW_MS = 30_000; // keep transcripts from last 30s
const SPEECH_LANG = "uk-UA"; // Ukrainian
const FALLBACK_LANG = "en-US";

interface TranscriptEntry {
  text: string;
  confidence: number;
  timestamp: number;
}

/**
 * Monitors audio levels from the existing media stream to detect speech.
 * - AudioContext analyser measures volume to detect when speech occurs (offline-friendly).
 * - Web Speech API (SpeechRecognition) transcribes spoken words in parallel.
 *   Transcribed text from the last TRANSCRIPT_WINDOW_MS is attached to integrity events.
 *
 * Both run together: volume detection triggers events; recognition fills in the words.
 *
 * Web Speech API requires Chrome/Edge and an internet connection (uses Google's STT
 * servers under the hood). If unavailable, the hook still logs SUSPICIOUS_SPEECH
 * events from the volume analyser without a transcript.
 */
export function useSpeechMonitor(
  active: boolean,
  attemptId: string | null,
  attemptQuestionId: string | null,
  mediaStream?: MediaStream | null,
) {
  const lastLoggedRef = useRef<number>(0);
  const attemptIdRef = useRef(attemptId);
  const questionIdRef = useRef(attemptQuestionId);
  const speechStartRef = useRef<number | null>(null);
  const transcriptBufferRef = useRef<TranscriptEntry[]>([]);

  // Keep refs in sync
  useEffect(() => {
    attemptIdRef.current = attemptId;
    questionIdRef.current = attemptQuestionId;
  }, [attemptId, attemptQuestionId]);

  // ----- Web Speech API: continuous transcription -----
  useEffect(() => {
    if (!active || !attemptId) return;
    if (typeof window === "undefined") return;

    const SpeechRecognitionCtor =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognitionCtor) {
      console.warn("[SpeechMonitor] Web Speech API not supported in this browser");
      return;
    }

    let stopped = false;
    let recognition: any = null;
    let restartTimer: ReturnType<typeof setTimeout> | null = null;
    let currentLang = SPEECH_LANG;

    function start() {
      if (stopped) return;
      try {
        recognition = new SpeechRecognitionCtor();
        recognition.continuous = true;
        recognition.interimResults = false;
        recognition.maxAlternatives = 1;
        recognition.lang = currentLang;

        recognition.onresult = (event: any) => {
          for (let i = event.resultIndex; i < event.results.length; i++) {
            const result = event.results[i];
            if (!result.isFinal) continue;
            const alt = result[0];
            if (!alt) continue;
            const text = (alt.transcript || "").trim();
            if (!text) continue;
            transcriptBufferRef.current.push({
              text,
              confidence: typeof alt.confidence === "number" ? alt.confidence : 0,
              timestamp: Date.now(),
            });
            // Trim old entries
            const cutoff = Date.now() - TRANSCRIPT_WINDOW_MS;
            transcriptBufferRef.current = transcriptBufferRef.current.filter(
              (e) => e.timestamp >= cutoff,
            );
          }
        };

        recognition.onerror = (event: any) => {
          console.warn("[SpeechMonitor] Recognition error:", event.error);
          // Fallback to English if language not supported
          if (event.error === "language-not-supported" && currentLang !== FALLBACK_LANG) {
            currentLang = FALLBACK_LANG;
          }
        };

        recognition.onend = () => {
          if (stopped) return;
          // Auto-restart on disconnect (Chrome limits each session)
          restartTimer = setTimeout(start, 500);
        };

        recognition.start();
        console.log(`[SpeechMonitor] Recognition started (lang=${currentLang})`);
      } catch (err) {
        console.warn("[SpeechMonitor] Failed to start recognition:", err);
        // Retry after delay
        if (!stopped) {
          restartTimer = setTimeout(start, 2000);
        }
      }
    }

    start();

    return () => {
      stopped = true;
      if (restartTimer) clearTimeout(restartTimer);
      if (recognition) {
        try {
          recognition.onend = null;
          recognition.onresult = null;
          recognition.onerror = null;
          recognition.stop();
        } catch {
          // ignore
        }
      }
      transcriptBufferRef.current = [];
      console.log("[SpeechMonitor] Recognition stopped");
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, attemptId]);

  // ----- AudioContext: volume-based speech detection -----
  useEffect(() => {
    if (!active || !attemptId || !mediaStream) return;

    const audioTracks = mediaStream.getAudioTracks();
    if (audioTracks.length === 0) {
      console.warn("[SpeechMonitor] No audio tracks in media stream");
      return;
    }

    console.log("[SpeechMonitor] Starting audio level monitoring");

    let stopped = false;
    let audioContext: AudioContext | null = null;
    let analyser: AnalyserNode | null = null;
    let intervalId: ReturnType<typeof setInterval> | null = null;

    try {
      audioContext = new AudioContext();
      const source = audioContext.createMediaStreamSource(mediaStream);
      analyser = audioContext.createAnalyser();
      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0.5;
      source.connect(analyser);

      const dataArray = new Uint8Array(analyser.frequencyBinCount);

      intervalId = setInterval(() => {
        if (stopped || !analyser) return;

        analyser.getByteFrequencyData(dataArray);
        let sum = 0;
        for (let i = 0; i < dataArray.length; i++) {
          sum += dataArray[i];
        }
        const avg = sum / dataArray.length;

        if (avg > SPEECH_THRESHOLD) {
          if (speechStartRef.current === null) {
            speechStartRef.current = Date.now();
          }
        } else {
          if (speechStartRef.current !== null) {
            const startedAt = speechStartRef.current;
            const duration = Date.now() - startedAt;
            speechStartRef.current = null;

            if (duration >= SPEECH_MIN_DURATION_MS) {
              const now = Date.now();
              if (now - lastLoggedRef.current > COOLDOWN_MS) {
                lastLoggedRef.current = now;

                // Collect transcript fragments overlapping the speech window
                const windowStart = startedAt - 1000; // small grace window
                const fragments = transcriptBufferRef.current.filter(
                  (e) => e.timestamp >= windowStart,
                );
                const transcript = fragments.map((e) => e.text).join(" ").trim();
                const avgConfidence =
                  fragments.length > 0
                    ? Math.round(
                        (fragments.reduce((s, e) => s + (e.confidence || 0), 0) /
                          fragments.length) *
                          100,
                      )
                    : null;

                console.log(
                  `[SpeechMonitor] Speech detected: ${Math.round(duration / 1000)}s` +
                    (transcript ? ` — "${transcript}"` : ""),
                );

                logIntegrityEvent({
                  attemptId: attemptIdRef.current!,
                  attemptQuestionId: questionIdRef.current ?? undefined,
                  type: "SUSPICIOUS_SPEECH",
                  startedAt: new Date(startedAt).toISOString(),
                  endedAt: new Date().toISOString(),
                  metadata: {
                    durationMs: duration,
                    durationSec: Math.round(duration / 1000),
                    transcript: transcript || undefined,
                    confidence: avgConfidence,
                    reason: transcript
                      ? `Виявлено мовлення (${Math.round(duration / 1000)}с)`
                      : `Звук протягом ${Math.round(duration / 1000)}с`,
                  },
                }).catch(console.error);
              }
            }
          }
        }
      }, CHECK_INTERVAL_MS);

      console.log("[SpeechMonitor] Audio monitoring active");
    } catch (err) {
      console.error("[SpeechMonitor] Failed to set up audio monitoring:", err);
    }

    return () => {
      stopped = true;
      if (intervalId) clearInterval(intervalId);
      if (audioContext && audioContext.state !== "closed") {
        audioContext.close().catch(() => {});
      }
      speechStartRef.current = null;
      console.log("[SpeechMonitor] Stopped audio monitoring");
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, attemptId, mediaStream]);
}
