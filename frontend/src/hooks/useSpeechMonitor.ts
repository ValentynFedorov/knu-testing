"use client";

import { useEffect, useRef } from "react";
import { logIntegrityEvent } from "@/lib/api";

const COOLDOWN_MS = 12000;
const SPEECH_THRESHOLD = 15; // average frequency level (0-128) to count as speech
const SPEECH_MIN_DURATION_MS = 1500;
const CHECK_INTERVAL_MS = 200;
const DEBUG_LOG_INTERVAL_MS = 5000;
const TRANSCRIPT_WINDOW_MS = 30_000;
const SPEECH_LANG = "uk-UA";
const FALLBACK_LANG = "en-US";
// Recorder is rotated proactively so the produced WebM file stays bounded.
// On each rotation MediaRecorder.stop() finalizes a fully-playable file.
const ROTATION_INTERVAL_MS = 15_000;
const MAX_AUDIO_BLOB_BYTES = 2_000_000; // safety cap (2 MB)

interface TranscriptEntry {
  text: string;
  confidence: number;
  timestamp: number;
}

/**
 * Records the proctoring mic stream + monitors volume to detect speech.
 *
 * Three subsystems run together:
 * 1. AudioContext analyser: cheap volume monitoring → triggers SUSPICIOUS_SPEECH events.
 * 2. MediaRecorder rolling buffer: keeps the last ~12s of audio chunks. When a
 *    speech event fires we splice the relevant window, base64-encode it, and
 *    attach as `metadata.audioBase64` so the teacher can listen back. The
 *    backend can also auto-transcribe these on the server.
 * 3. Web Speech API (best-effort): if the browser supports it AND can access
 *    the mic separately, we get live transcription too. Often fails on Chrome
 *    when getUserMedia already has the mic — that's why we have (2) as backup.
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
  const recorderMimeRef = useRef<string>("audio/webm");
  // captureBlobRef.current() returns a fully-playable Blob (or null).
  // The recorder effect installs the implementation; the volume-detector
  // effect calls it.
  const captureBlobRef = useRef<(() => Promise<Blob | null>) | null>(null);
  // lastFinalizedBlobRef holds the most recently rotated, complete file
  // — used as fallback if the active recorder hasn't started yet.
  const lastFinalizedBlobRef = useRef<Blob | null>(null);

  useEffect(() => {
    attemptIdRef.current = attemptId;
    questionIdRef.current = attemptQuestionId;
  }, [attemptId, attemptQuestionId]);

  // ----- MediaRecorder with stop/restart pattern -----
  // Each rotation produces a self-contained playable WebM file.
  useEffect(() => {
    if (!active || !attemptId || !mediaStream) return;
    const audioTracks = mediaStream.getAudioTracks();
    if (audioTracks.length === 0) {
      console.warn("[SpeechMonitor] No audio tracks — recorder skipped");
      return;
    }

    const candidates = [
      "audio/webm;codecs=opus",
      "audio/webm",
      "audio/ogg;codecs=opus",
      "audio/mp4",
    ];
    let mime = "";
    for (const c of candidates) {
      if (typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(c)) {
        mime = c;
        break;
      }
    }
    if (!mime) {
      console.warn("[SpeechMonitor] MediaRecorder: no supported audio MIME");
      return;
    }
    recorderMimeRef.current = mime.split(";")[0];
    console.log(`[SpeechMonitor] MediaRecorder mime: ${mime}`);

    let recorder: MediaRecorder | null = null;
    let chunks: Blob[] = [];
    let rotationTimer: ReturnType<typeof setTimeout> | null = null;
    let stopped = false;
    const audioOnly = new MediaStream(audioTracks);

    function startNewRecorder() {
      if (stopped) return;
      try {
        chunks = [];
        recorder = new MediaRecorder(audioOnly, {
          mimeType: mime,
          audioBitsPerSecond: 32_000,
        });
        recorder.ondataavailable = (event: BlobEvent) => {
          if (event.data && event.data.size > 0) chunks.push(event.data);
        };
        recorder.onerror = (e) => {
          console.error("[SpeechMonitor] MediaRecorder error:", e);
        };
        recorder.onstop = () => {
          if (chunks.length > 0) {
            const blob = new Blob(chunks, { type: recorder!.mimeType || mime });
            lastFinalizedBlobRef.current = blob;
          }
        };
        recorder.start(); // no timeslice — chunks come on stop()
        // Schedule rotation
        if (rotationTimer) clearTimeout(rotationTimer);
        rotationTimer = setTimeout(() => {
          rotateRecorder().catch(console.error);
        }, ROTATION_INTERVAL_MS);
      } catch (err) {
        console.error("[SpeechMonitor] Failed to start MediaRecorder:", err);
      }
    }

    function rotateRecorder(): Promise<Blob | null> {
      // Stop the active recorder, wait for onstop, then start a new one.
      // Returns the just-finalized blob.
      return new Promise((resolve) => {
        if (!recorder || recorder.state === "inactive") {
          resolve(lastFinalizedBlobRef.current);
          return;
        }
        if (rotationTimer) {
          clearTimeout(rotationTimer);
          rotationTimer = null;
        }
        const r = recorder;
        const oldOnStop = r.onstop;
        r.onstop = (event: Event) => {
          if (oldOnStop) oldOnStop.call(r, event);
          const blob = lastFinalizedBlobRef.current;
          if (!stopped) startNewRecorder();
          resolve(blob);
        };
        try {
          r.stop();
        } catch (err) {
          console.warn("[SpeechMonitor] stop() failed:", err);
          resolve(null);
        }
      });
    }

    // Expose capture function for the volume detector.
    captureBlobRef.current = rotateRecorder;

    startNewRecorder();
    console.log("[SpeechMonitor] MediaRecorder started (rotation 15s)");

    return () => {
      stopped = true;
      if (rotationTimer) clearTimeout(rotationTimer);
      try {
        if (recorder && recorder.state !== "inactive") recorder.stop();
      } catch {
        // ignore
      }
      captureBlobRef.current = null;
      console.log("[SpeechMonitor] MediaRecorder stopped");
    };
  }, [active, attemptId, mediaStream]);

  // ----- Web Speech API (best-effort transcription) -----
  useEffect(() => {
    if (!active || !attemptId) return;
    if (typeof window === "undefined") return;

    const SpeechRecognitionCtor =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognitionCtor) {
      console.warn("[SpeechMonitor] Web Speech API not supported");
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
        recognition.interimResults = true;
        recognition.maxAlternatives = 1;
        recognition.lang = currentLang;

        recognition.onstart = () => {
          console.log(`[SpeechMonitor] WebSpeech started (lang=${currentLang})`);
          consecutiveErrors = 0;
        };
        recognition.onresult = (event: any) => {
          for (let i = event.resultIndex; i < event.results.length; i++) {
            const result = event.results[i];
            const alt = result[0];
            if (!alt) continue;
            const text = (alt.transcript || "").trim();
            if (!text || !result.isFinal) continue;
            console.log(`[SpeechMonitor] WebSpeech FINAL: "${text}"`);
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
          console.warn("[SpeechMonitor] WebSpeech error:", event.error);
          consecutiveErrors++;
          if (event.error === "language-not-supported" && currentLang !== FALLBACK_LANG) {
            currentLang = FALLBACK_LANG;
          }
          if (event.error === "not-allowed" || event.error === "service-not-allowed") {
            console.error("[SpeechMonitor] WebSpeech permission blocked — transcription disabled");
            stopped = true;
          }
        };
        recognition.onend = () => {
          if (stopped) return;
          const delay = consecutiveErrors > 3 ? 5000 : 500;
          restartTimer = setTimeout(start, delay);
        };
        recognition.start();
      } catch (err) {
        console.warn("[SpeechMonitor] WebSpeech start failed:", err);
        if (!stopped) restartTimer = setTimeout(start, 2000);
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
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, attemptId]);

  // ----- AudioContext volume detector -----
  useEffect(() => {
    if (!active || !attemptId || !mediaStream) return;
    const audioTracks = mediaStream.getAudioTracks();
    if (audioTracks.length === 0) {
      console.warn("[SpeechMonitor] No audio tracks");
      return;
    }
    console.log(
      `[SpeechMonitor] Volume analyser starting (tracks=${audioTracks.length})`,
    );

    let stopped = false;
    let audioContext: AudioContext | null = null;
    let analyser: AnalyserNode | null = null;
    let intervalId: ReturnType<typeof setInterval> | null = null;
    let lastDebugLog = 0;
    let maxAvgSeen = 0;

    try {
      audioContext = new AudioContext();
      if (audioContext.state === "suspended") {
        audioContext.resume().catch(() => {});
      }
      const source = audioContext.createMediaStreamSource(mediaStream);
      analyser = audioContext.createAnalyser();
      analyser.fftSize = 512;
      analyser.smoothingTimeConstant = 0.3;
      source.connect(analyser);
      const dataArray = new Uint8Array(analyser.frequencyBinCount);

      intervalId = setInterval(async () => {
        if (stopped || !analyser || !audioContext) return;
        if (audioContext.state === "suspended") {
          audioContext.resume().catch(() => {});
        }
        analyser.getByteFrequencyData(dataArray);
        let sum = 0;
        for (let i = 0; i < dataArray.length; i++) sum += dataArray[i];
        const avg = sum / dataArray.length;
        if (avg > maxAvgSeen) maxAvgSeen = avg;

        const now = Date.now();
        if (now - lastDebugLog > DEBUG_LOG_INTERVAL_MS) {
          lastDebugLog = now;
          console.log(
            `[SpeechMonitor] avgVol=${avg.toFixed(1)} max=${maxAvgSeen.toFixed(1)} ` +
              `recReady=${captureBlobRef.current !== null}`,
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

          if (
            duration >= SPEECH_MIN_DURATION_MS &&
            now - lastLoggedRef.current > COOLDOWN_MS
          ) {
            lastLoggedRef.current = now;

            // Force-rotate the recorder — the just-finalized blob is a
            // fully-playable WebM/Opus file containing the speech segment.
            let audioBase64: string | undefined;
            let audioMime: string | undefined;
            if (captureBlobRef.current) {
              try {
                const blob = await captureBlobRef.current();
                if (blob && blob.size > 0) {
                  if (blob.size <= MAX_AUDIO_BLOB_BYTES) {
                    audioBase64 = await blobToBase64(blob);
                    audioMime = blob.type || recorderMimeRef.current;
                    console.log(
                      `[SpeechMonitor] Audio clip captured: ${blob.size} bytes ` +
                        `(mime=${audioMime})`,
                    );
                  } else {
                    console.warn(
                      `[SpeechMonitor] Audio clip too large (${blob.size} bytes), skipping`,
                    );
                  }
                }
              } catch (err) {
                console.warn("[SpeechMonitor] Failed to capture audio:", err);
              }
            }

            const sliceStart = startedAt - 1000;
            const fragments = transcriptBufferRef.current.filter(
              (e) => e.timestamp >= sliceStart,
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
              `[SpeechMonitor] Speech ${Math.round(duration / 1000)}s` +
                (transcript ? ` — "${transcript}"` : "") +
                (audioBase64 ? " [audio attached]" : ""),
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
                audioBase64,
                audioMime,
                reason: transcript
                  ? `Виявлено мовлення (${Math.round(duration / 1000)}с)`
                  : `Звук протягом ${Math.round(duration / 1000)}с`,
              },
            }).catch(console.error);
          }
        }
      }, CHECK_INTERVAL_MS);
    } catch (err) {
      console.error("[SpeechMonitor] Volume setup failed:", err);
    }

    return () => {
      stopped = true;
      if (intervalId) clearInterval(intervalId);
      if (audioContext && audioContext.state !== "closed") {
        audioContext.close().catch(() => {});
      }
      speechStartRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, attemptId, mediaStream]);
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = reader.result as string;
      // Strip "data:audio/...;base64,"
      const idx = result.indexOf("base64,");
      resolve(idx >= 0 ? result.slice(idx + 7) : result);
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}
