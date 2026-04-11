"use client";

import { useEffect, useRef } from "react";
import { logIntegrityEvent } from "@/lib/api";

const DETECTION_INTERVAL_MS = 3000; // check every 3 seconds
const COOLDOWN_MS = 30000; // don't spam events — 30s cooldown between logs

/**
 * Captures frames from a video stream and runs COCO-SSD object detection
 * to detect "cell phone" objects. Logs PHONE_DETECTED integrity events.
 */
export function usePhoneDetection(
  mediaStream: MediaStream | null,
  attemptId: string | null,
  attemptQuestionId: string | null,
) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const modelRef = useRef<any>(null);
  const lastLoggedRef = useRef<number>(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!mediaStream || !attemptId) return;

    let cancelled = false;

    async function init() {
      // Dynamically import to avoid SSR issues and reduce initial bundle
      const tf = await import("@tensorflow/tfjs");
      await tf.ready();
      const cocoSsd = await import("@tensorflow-models/coco-ssd");

      if (cancelled) return;

      const model = await cocoSsd.load({ base: "lite_mobilenet_v2" });
      if (cancelled) return;
      modelRef.current = model;

      // Create hidden video element for frame capture
      const video = document.createElement("video");
      video.srcObject = mediaStream;
      video.muted = true;
      video.playsInline = true;
      video.width = 320;
      video.height = 240;
      await video.play();
      videoRef.current = video;

      // Canvas for frame snapshots
      const canvas = document.createElement("canvas");
      canvas.width = 320;
      canvas.height = 240;
      canvasRef.current = canvas;

      // Start detection loop
      intervalRef.current = setInterval(() => detect(), DETECTION_INTERVAL_MS);
    }

    async function detect() {
      const model = modelRef.current;
      const video = videoRef.current;
      if (!model || !video || video.readyState < 2) return;

      try {
        const predictions = await model.detect(video);
        const phones = predictions.filter(
          (p: any) => p.class === "cell phone" && p.score >= 0.4,
        );

        if (phones.length > 0) {
          const now = Date.now();
          if (now - lastLoggedRef.current > COOLDOWN_MS) {
            lastLoggedRef.current = now;
            const best = phones.reduce((a: any, b: any) =>
              a.score > b.score ? a : b,
            );

            // Capture frame as JPEG
            let frame: string | undefined;
            const canvas = canvasRef.current;
            if (canvas && video) {
              const ctx = canvas.getContext("2d");
              if (ctx) {
                ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
                frame = canvas.toDataURL("image/jpeg", 0.5);
              }
            }

            logIntegrityEvent({
              attemptId: attemptId!,
              attemptQuestionId: attemptQuestionId ?? undefined,
              type: "PHONE_DETECTED",
              startedAt: new Date().toISOString(),
              metadata: {
                confidence: Math.round(best.score * 100),
                bbox: best.bbox,
                frame,
              },
            }).catch(console.error);
          }
        }
      } catch (err) {
        console.error("Phone detection error:", err);
      }
    }

    init().catch(console.error);

    return () => {
      cancelled = true;
      if (intervalRef.current) clearInterval(intervalRef.current);
      if (videoRef.current) {
        videoRef.current.pause();
        videoRef.current.srcObject = null;
        videoRef.current = null;
      }
      modelRef.current = null;
    };
  }, [mediaStream, attemptId, attemptQuestionId]);
}
