"use client";

import { useEffect, useRef } from "react";
import { logIntegrityEvent } from "@/lib/api";

const COOLDOWN_MS = 15000; // 15s between speech events
const SPEECH_THRESHOLD = 15; // volume level to consider as speech (0-128)
const SPEECH_MIN_DURATION_MS = 1500; // minimum duration of speech to log
const CHECK_INTERVAL_MS = 200; // how often to check audio levels
const DEBUG_LOG_INTERVAL_MS = 5000; // log volume diagnostics every 5s
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
 * - AudioContext analyser measures volume (offline-friendly).
 * - Web Speech API (SpeechRecognition) transcribes spoken words in parallel.
 *
 * Web Speech API requires Chrome/Edge and an internet connection (uses Google's STT).
 * If unavailable or denied, the volume analyser still logs SUSPICIOUS_SPEECH events
 * without a transcript.
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
    let consecutiveErrors = 0;

    function start() {
      if (stopped) return;
      try {
        recognition = new SpeechRecognitionCtor();
        recognition.continuous = true;
        recognition.interimResults = true; // get partial results too
        recognition.maxAlternatives = 1;
        recognition.lang = currentLang;

        recognition.onstart = () => {
          console.log(`[SpeechMonitor] Recognition started (lang=${currentLang})`);
          consecutiveErrors = 0;
        };

        recognition.onspeechstart = () => {
          console.log("[SpeechMonitor] speechstart event");
        };

        recognition.onsoundstart = () => {
          console.log("[SpeechMonitor] soundstart event");
        };

        recognition.onresult = (event: any) => {
          for (let i = event.resultIndex; i < event.results.length; i++) {
            const result = event.results[i];
            const alt = result[0];
            if (!alt) continue;
            const text = (alt.transcript || "").trim();
            if (!text) continue;
            // Only push final results to avoid duplicates from interim
            if (!result.isFinal) {
              console.log(`[SpeechMonitor] interim: "${text}"`);
              continue;
            }
            console.log(`[SpeechMonitor] FINAL: "${text}" (conf=${alt.confidence})`);
            transcriptBufferRef.current.push({
              text,
              confidence: typeof alt.confidence === "number" ? alt.confidence : 0,
              timestamp: Date.now(),
            });
            const cutoff = Date.now() - TRANSCRIPT_WINDOW_MS;
            transcriptBufferRef.current = transcriptBufferRef.current.filter(
              (e) => e.timestamp >= cutoff,
            );
          }
        };

        recognition.onerror = (event: any) => {
          console.warn("[SpeechMonitor] Recognition error:", event.error);
          consecutiveErrors++;
          if (event.error === "language-not-supported" && currentLang !== FALLBACK_LANG) {
            currentLang = FALLBACK_LANG;
          }
          // not-allowed and service-not-allowed cannot be recovered automatically
          if (event.error === "not-allowed" || event.error === "service-not-allowed") {
            console.error(
              "[SpeechMonitor] Permission denied or service blocked. Transcription disabled.",
            );
            stopped = true;
          }
        };

        recognition.onend = () => {
          if (stopped) return;
          // Throttle restart if we keep erroring
          const delay = consecutiveErrors > 3 ? 5000 : 500;
          restartTimer = setTimeout(start, delay);
        };

        recognition.start();
      } catch (err) {
        console.warn("[SpeechMonitor] Failed to start recognition:", err);
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
          recognition.onstart = null;
          recognition.onspeechstart = null;
          recognition.onsoundstart = null;
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
    console.log(
      `[SpeechMonitor] Starting volume analyser (audio tracks: ${audioTracks.length}, ` +
        `enabled: ${audioTracks[0]?.enabled}, label: "${audioTracks[0]?.label}")`,
    );

    let stopped = false;
    let audioContext: AudioContext | null = null;
    let analyser: AnalyserNode | null = null;
    let intervalId: ReturnType<typeof setInterval> | null = null;
    let lastDebugLog = 0;
    let maxAvgSeen = 0;

    try {
      audioContext = new AudioContext();
      // Modern browsers create AudioContext in suspended state — must resume.
      // Even though we're inside a useEffect started by a button click handler,
      // some browsers still gate this.
      if (audioContext.state === "suspended") {
        audioContext.resume().then(
          () => console.log("[SpeechMonitor] AudioContext resumed"),
          (err) => console.warn("[SpeechMonitor] AudioContext resume failed:", err),
        );
      }

      const source = audioContext.createMediaStreamSource(mediaStream);
      analyser = audioContext.createAnalyser();
      analyser.fftSize = 512;
      analyser.smoothingTimeConstant = 0.3;
      source.connect(analyser);

      const dataArray = new Uint8Array(analyser.frequencyBinCount);

      intervalId = setInterval(() => {
        if (stopped || !analyser || !audioContext) return;
        if (audioContext.state === "suspended") {
          audioContext.resume().catch(() => {});
        }

        analyser.getByteFrequencyData(dataArray);
        let sum = 0;
        for (let i = 0; i < dataArray.length; i++) sum += dataArray[i];
        const avg = sum / dataArray.length;
        if (avg > maxAvgSeen) maxAvgSeen = avg;

        // Periodic diagnostic logging so we can debug levels
        const now = Date.now();
        if (now - lastDebugLog > DEBUG_LOG_INTERVAL_MS) {
          lastDebugLog = now;
          console.log(
            `[SpeechMonitor] avgVolume=${avg.toFixed(1)} max=${maxAvgSeen.toFixed(1)} ` +
              `threshold=${SPEECH_THRESHOLD} ctxState=${audioContext.state}`,
          );
        }

        if (avg > SPEECH_THRESHOLD) {
          if (speechStartRef.current === null) {
            speechStartRef.current = now;
          }
        } else if (speechStartRef.current !== null) {
          const startedAt = speechStartRef.current;
          const duration = now - startedAt;
          speechStartRef.current = null;

          if (duration >= SPEECH_MIN_DURATION_MS) {
            if (now - lastLoggedRef.current > COOLDOWN_MS) {
              lastLoggedRef.current = now;

              const windowStart = startedAt - 1000;
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
                  (transcript ? ` — "${transcript}"` : " (no transcript)"),
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
