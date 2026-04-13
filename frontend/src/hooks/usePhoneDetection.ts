"use client";

import { useEffect, useRef } from "react";
import { logIntegrityEvent } from "@/lib/api";

const DETECTION_INTERVAL_MS = 3000;
const COOLDOWN_MS = 30000;
const MODEL_INPUT_SIZE = 640;
const PHONE_CLASS_ID = 67; // COCO class 67 = "cell phone"
const CONFIDENCE_THRESHOLD = 0.35;
const NMS_IOU_THRESHOLD = 0.45;

/**
 * YOLOv8n ONNX-based phone detection.
 * Loads /yolov8n.onnx via ONNX Runtime Web, runs inference on webcam frames,
 * and logs PHONE_DETECTED integrity events with captured frames.
 */
export function usePhoneDetection(
  mediaStream: MediaStream | null,
  attemptId: string | null,
  attemptQuestionId: string | null,
) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const sessionRef = useRef<any>(null);
  const lastLoggedRef = useRef<number>(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!mediaStream || !attemptId) return;

    let cancelled = false;

    async function init() {
      try {
        console.log("[PhoneDetection] Loading ONNX Runtime...");
        const ort = await import("onnxruntime-web");

        // Point WASM files to public/ copies
        ort.env.wasm.wasmPaths = "/";
        ort.env.wasm.numThreads = 1;

        if (cancelled) return;

        console.log("[PhoneDetection] Creating inference session for YOLOv8n...");
        const session = await ort.InferenceSession.create("/yolov8n.onnx", {
          executionProviders: ["wasm"],
        });

        console.log("[PhoneDetection] Model input names:", session.inputNames);
        console.log("[PhoneDetection] Model output names:", session.outputNames);

      if (cancelled) return;
      sessionRef.current = session;
      console.log("[PhoneDetection] YOLOv8n loaded, starting detection loop");

      // Hidden video element for frame capture
      const video = document.createElement("video");
      video.srcObject = mediaStream;
      video.muted = true;
      video.playsInline = true;
      video.width = 320;
      video.height = 240;
      await video.play();
      videoRef.current = video;

      // Canvas for preprocessing and frame snapshots
      const canvas = document.createElement("canvas");
      canvas.width = MODEL_INPUT_SIZE;
      canvas.height = MODEL_INPUT_SIZE;
      canvasRef.current = canvas;

      intervalRef.current = setInterval(() => detect(ort), DETECTION_INTERVAL_MS);
      } catch (err) {
        console.error("[PhoneDetection] Failed to initialize:", err);
      }
    }

    async function detect(ort: any) {
      const session = sessionRef.current;
      const video = videoRef.current;
      const canvas = canvasRef.current;
      if (!session || !video || !canvas || video.readyState < 2) return;

      try {
        const ctx = canvas.getContext("2d")!;

        // Draw video frame resized to 640x640 (letterbox not needed for detection)
        ctx.drawImage(video, 0, 0, MODEL_INPUT_SIZE, MODEL_INPUT_SIZE);
        const imageData = ctx.getImageData(0, 0, MODEL_INPUT_SIZE, MODEL_INPUT_SIZE);

        // Preprocess: RGBA -> RGB, normalize 0-1, NCHW layout
        const input = preprocessImage(imageData);
        const tensor = new ort.Tensor("float32", input, [1, 3, MODEL_INPUT_SIZE, MODEL_INPUT_SIZE]);

        // Run inference (use dynamic input name for safety)
        const inputName = session.inputNames[0];
        const results = await session.run({ [inputName]: tensor });

        // YOLOv8 output: [1, 84, 8400]
        const output = results[Object.keys(results)[0]];
        const detections = postprocess(output.data as Float32Array, output.dims);

        // Filter for phones
        const phones = detections.filter(
          (d) => d.classId === PHONE_CLASS_ID && d.confidence >= CONFIDENCE_THRESHOLD,
        );

        if (phones.length > 0) {
          const now = Date.now();
          if (now - lastLoggedRef.current > COOLDOWN_MS) {
            lastLoggedRef.current = now;
            const best = phones.reduce((a, b) => (a.confidence > b.confidence ? a : b));

            // Capture frame as JPEG from original video (not the 640x640 version)
            let frame: string | undefined;
            const snapCanvas = document.createElement("canvas");
            snapCanvas.width = 320;
            snapCanvas.height = 240;
            const snapCtx = snapCanvas.getContext("2d");
            if (snapCtx) {
              snapCtx.drawImage(video, 0, 0, 320, 240);
              frame = snapCanvas.toDataURL("image/jpeg", 0.5);
            }

            console.log(
              `[PhoneDetection] Phone detected! confidence=${Math.round(best.confidence * 100)}%`,
            );

            logIntegrityEvent({
              attemptId: attemptId!,
              attemptQuestionId: attemptQuestionId ?? undefined,
              type: "PHONE_DETECTED",
              startedAt: new Date().toISOString(),
              metadata: {
                confidence: Math.round(best.confidence * 100),
                model: "yolov8n",
                bbox: [best.x, best.y, best.w, best.h],
                frame,
              },
            }).catch(console.error);
          }
        }
      } catch (err) {
        console.error("[PhoneDetection] Detection error:", err);
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
      sessionRef.current = null;
    };
  }, [mediaStream, attemptId, attemptQuestionId]);
}

/** Convert RGBA ImageData to Float32Array in NCHW format, normalized 0-1 */
function preprocessImage(imageData: ImageData): Float32Array {
  const { data, width, height } = imageData;
  const size = width * height;
  const float32 = new Float32Array(3 * size);

  for (let i = 0; i < size; i++) {
    const srcIdx = i * 4;
    float32[i] = data[srcIdx] / 255.0;             // R channel
    float32[size + i] = data[srcIdx + 1] / 255.0;   // G channel
    float32[2 * size + i] = data[srcIdx + 2] / 255.0; // B channel
  }

  return float32;
}

interface Detection {
  x: number;
  y: number;
  w: number;
  h: number;
  confidence: number;
  classId: number;
}

/** Parse YOLOv8 output [1, 84, 8400] -> filtered detections with NMS */
function postprocess(data: Float32Array, dims: number[]): Detection[] {
  const numClasses = dims[1] - 4; // 80 classes
  const numBoxes = dims[2]; // 8400

  const candidates: Detection[] = [];

  for (let i = 0; i < numBoxes; i++) {
    // Find best class
    let maxScore = 0;
    let maxClassId = 0;
    for (let c = 0; c < numClasses; c++) {
      const score = data[(4 + c) * numBoxes + i];
      if (score > maxScore) {
        maxScore = score;
        maxClassId = c;
      }
    }

    if (maxScore < CONFIDENCE_THRESHOLD) continue;

    // Only keep cell phone detections to save computation
    if (maxClassId !== PHONE_CLASS_ID) continue;

    const cx = data[0 * numBoxes + i];
    const cy = data[1 * numBoxes + i];
    const w = data[2 * numBoxes + i];
    const h = data[3 * numBoxes + i];

    candidates.push({
      x: cx - w / 2,
      y: cy - h / 2,
      w,
      h,
      confidence: maxScore,
      classId: maxClassId,
    });
  }

  // Apply NMS
  return nms(candidates, NMS_IOU_THRESHOLD);
}

/** Non-Maximum Suppression */
function nms(detections: Detection[], iouThreshold: number): Detection[] {
  if (detections.length === 0) return [];

  // Sort by confidence descending
  detections.sort((a, b) => b.confidence - a.confidence);

  const kept: Detection[] = [];

  for (const det of detections) {
    let dominated = false;
    for (const k of kept) {
      if (iou(det, k) > iouThreshold) {
        dominated = true;
        break;
      }
    }
    if (!dominated) kept.push(det);
  }

  return kept;
}

/** Intersection over Union for two boxes */
function iou(a: Detection, b: Detection): number {
  const x1 = Math.max(a.x, b.x);
  const y1 = Math.max(a.y, b.y);
  const x2 = Math.min(a.x + a.w, b.x + b.w);
  const y2 = Math.min(a.y + a.h, b.y + b.h);

  const intersection = Math.max(0, x2 - x1) * Math.max(0, y2 - y1);
  const areaA = a.w * a.h;
  const areaB = b.w * b.h;
  const union = areaA + areaB - intersection;

  return union > 0 ? intersection / union : 0;
}
