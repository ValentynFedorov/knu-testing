"use client";

import { useEffect, useRef } from "react";
import { logIntegrityEvent } from "@/lib/api";

const COOLDOWN_MS = 15000; // 15s between speech events
const SPEECH_THRESHOLD = 30; // volume level to consider as speech (0-128)
const SPEECH_MIN_DURATION_MS = 2000; // minimum duration of speech to log
const CHECK_INTERVAL_MS = 200; // how often to check audio levels

/**
 * Monitors audio levels from the existing media stream to detect speech.
 * Uses AudioContext analyser to measure volume — works offline without Google servers.
 * Falls back gracefully if Web Audio API is not available.
 *
 * Accepts the mediaStream from the parent (camera+mic stream from getUserMedia).
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

  // Keep refs in sync
  useEffect(() => {
    attemptIdRef.current = attemptId;
    questionIdRef.current = attemptQuestionId;
  }, [attemptId, attemptQuestionId]);

  // Audio level monitoring via existing mediaStream
  useEffect(() => {
    if (!active || !attemptId || !mediaStream) return;

    // Check if stream has audio tracks
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
        // Calculate average volume level
        let sum = 0;
        for (let i = 0; i < dataArray.length; i++) {
          sum += dataArray[i];
        }
        const avg = sum / dataArray.length;

        if (avg > SPEECH_THRESHOLD) {
          // Sound detected
          if (speechStartRef.current === null) {
            speechStartRef.current = Date.now();
          }
        } else {
          // Silence — check if previous speech was long enough to log
          if (speechStartRef.current !== null) {
            const duration = Date.now() - speechStartRef.current;
            if (duration >= SPEECH_MIN_DURATION_MS) {
              const now = Date.now();
              if (now - lastLoggedRef.current > COOLDOWN_MS) {
                lastLoggedRef.current = now;
                console.log(`[SpeechMonitor] Speech detected: ${Math.round(duration / 1000)}s`);
                logIntegrityEvent({
                  attemptId: attemptIdRef.current!,
                  attemptQuestionId: questionIdRef.current ?? undefined,
                  type: "SUSPICIOUS_SPEECH",
                  startedAt: new Date(speechStartRef.current).toISOString(),
                  endedAt: new Date().toISOString(),
                  metadata: {
                    durationMs: duration,
                    durationSec: Math.round(duration / 1000),
                    reason: `Speech detected for ${Math.round(duration / 1000)} seconds`,
                  },
                }).catch(console.error);
              }
            }
            speechStartRef.current = null;
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
