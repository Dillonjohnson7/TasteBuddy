"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { RefObject } from "react";

const SUSTAINED_FRAMES = 2;
const GESTURE_COOLDOWN_MS = 5000;
const SCAN_DELAY_MS = 500;

const CLIENT_POLL_MS = 100;
const DIFF_CANVAS_WIDTH = 80;
const PIXEL_DIFF_THRESHOLD = 25;
const CLIENT_BUFFER_SIZE = 4;
const CLIENT_VELOCITY_THRESHOLD = 0.04;
const CLIENT_DIRECTION_SCALE = 250;
const SERVER_FRESHNESS_MS = 1000;

export type LiveItem = { name: string; confidence: number; x: number };

function computeHorizontalVelocity(
  current: Uint8ClampedArray,
  prev: Uint8ClampedArray,
  canvasWidth: number
): number | null {
  let weightedXSum = 0;
  let totalWeight = 0;
  const pixelCount = current.length / 4;

  for (let i = 0; i < pixelCount; i++) {
    const o = i * 4;
    const diff = Math.max(
      Math.abs(current[o] - prev[o]),
      Math.abs(current[o + 1] - prev[o + 1]),
      Math.abs(current[o + 2] - prev[o + 2])
    );
    if (diff > PIXEL_DIFF_THRESHOLD) {
      const xNorm = (i % canvasWidth) / canvasWidth;
      weightedXSum += xNorm * diff;
      totalWeight += diff;
    }
  }

  if (totalWeight === 0) return null;
  return weightedXSum / totalWeight - 0.5; // -0.5 (left) to +0.5 (right)
}

export function useMotion(
  videoRef: RefObject<HTMLVideoElement | null>,
  enabled: boolean,
  onGesture: (direction: "add" | "remove") => void
) {
  const [directionPct, setDirectionPct] = useState(0);
  const [isScanning, setIsScanning] = useState(false);
  const [liveItems, setLiveItems] = useState<LiveItem[]>([]);

  const sustainedCount = useRef<{ direction: "add" | "remove"; count: number } | null>(null);
  const cooldownUntilRef = useRef(0);
  const activeRef = useRef(false);
  const loopIdRef = useRef(0);
  const onGestureRef = useRef(onGesture);
  const lastDetectedAtRef = useRef(0);

  // Client loop refs
  const clientActiveRef = useRef(false);
  const clientLoopIdRef = useRef(0);
  const prevFrameDataRef = useRef<Uint8ClampedArray | null>(null);
  const clientVelocityBuffer = useRef<number[]>([]);
  const diffCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const diffCtxRef = useRef<CanvasRenderingContext2D | null>(null);

  useEffect(() => {
    onGestureRef.current = onGesture;
  }, [onGesture]);

  const captureFrame = useCallback((): string | null => {
    const video = videoRef.current;
    if (!video || video.readyState < 2) return null;

    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(video, 0, 0);
    return canvas
      .toDataURL("image/jpeg", 0.7)
      .replace(/^data:image\/\w+;base64,/, "");
  }, [videoRef]);

  const capturePixelData = useCallback((): Uint8ClampedArray | null => {
    const video = videoRef.current;
    if (!video || video.readyState < 2) return null;

    if (!diffCanvasRef.current) {
      diffCanvasRef.current = document.createElement("canvas");
      const aspect = video.videoHeight / video.videoWidth;
      diffCanvasRef.current.width = DIFF_CANVAS_WIDTH;
      diffCanvasRef.current.height = Math.round(DIFF_CANVAS_WIDTH * aspect);
      diffCtxRef.current = diffCanvasRef.current.getContext("2d", { willReadFrequently: true });
    }

    const ctx = diffCtxRef.current;
    const canvas = diffCanvasRef.current;
    if (!ctx || !canvas) return null;

    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    return ctx.getImageData(0, 0, canvas.width, canvas.height).data;
  }, [videoRef]);

  // Server loop: identify what object is in frame
  useEffect(() => {
    if (!enabled) {
      activeRef.current = false;
      setLiveItems([]);
      return;
    }

    activeRef.current = true;
    const myId = ++loopIdRef.current;

    async function loop() {
      while (activeRef.current && loopIdRef.current === myId) {
        const frame = captureFrame();
        if (!frame) {
          await new Promise((r) => setTimeout(r, SCAN_DELAY_MS));
          continue;
        }

        setIsScanning(true);
        try {
          const res = await fetch("/api/detect", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ frame }),
          });

          if (!res.ok) {
            await new Promise((r) => setTimeout(r, SCAN_DELAY_MS));
            continue;
          }

          const data = (await res.json()) as {
            predictions: { name: string; x: number; confidence: number }[];
            imageWidth: number;
          };

          const newLiveItems: LiveItem[] = [];
          for (const pred of data.predictions) {
            const normalizedX = pred.x / data.imageWidth;
            newLiveItems.push({ name: pred.name, confidence: pred.confidence, x: normalizedX });
          }

          if (newLiveItems.length > 0) {
            lastDetectedAtRef.current = Date.now();
          }
          setLiveItems(newLiveItems);
        } catch {
          // Silent — keep looping
        } finally {
          setIsScanning(false);
        }

        await new Promise((r) => setTimeout(r, SCAN_DELAY_MS));
      }
    }

    void loop();
  }, [enabled, captureFrame]);

  // Client loop: measure motion direction at 10fps
  useEffect(() => {
    if (!enabled) {
      clientActiveRef.current = false;
      prevFrameDataRef.current = null;
      clientVelocityBuffer.current = [];
      diffCanvasRef.current = null;
      diffCtxRef.current = null;
      return;
    }

    clientActiveRef.current = true;
    prevFrameDataRef.current = null;
    clientVelocityBuffer.current = [];
    const myId = ++clientLoopIdRef.current;

    async function clientLoop() {
      while (clientActiveRef.current && clientLoopIdRef.current === myId) {
        const currentData = capturePixelData();

        if (currentData && prevFrameDataRef.current) {
          const w = diffCanvasRef.current?.width ?? DIFF_CANVAS_WIDTH;
          const raw = computeHorizontalVelocity(currentData, prevFrameDataRef.current, w);

          if (raw !== null) {
            const buf = clientVelocityBuffer.current;
            buf.push(raw);
            if (buf.length > CLIENT_BUFFER_SIZE) buf.shift();

            const smoothed = buf.reduce((a, b) => a + b, 0) / buf.length;
            const pct = Math.max(-100, Math.min(100, smoothed * CLIENT_DIRECTION_SCALE));
            setDirectionPct(pct);

            const now = Date.now();
            const serverFresh = now - lastDetectedAtRef.current < SERVER_FRESHNESS_MS;

            if (serverFresh && now >= cooldownUntilRef.current && Math.abs(smoothed) > CLIENT_VELOCITY_THRESHOLD) {
              const dir: "add" | "remove" = smoothed > 0 ? "add" : "remove";
              if (sustainedCount.current?.direction === dir) {
                sustainedCount.current.count++;
              } else {
                sustainedCount.current = { direction: dir, count: 1 };
              }
              if (sustainedCount.current.count >= SUSTAINED_FRAMES) {
                cooldownUntilRef.current = now + GESTURE_COOLDOWN_MS;
                sustainedCount.current = null;
                clientVelocityBuffer.current = [];
                prevFrameDataRef.current = null;
                onGestureRef.current(dir);
              }
            } else {
              sustainedCount.current = null;
            }
          } else {
            clientVelocityBuffer.current = [];
            sustainedCount.current = null;
            setDirectionPct(0);
          }
        }

        if (currentData) prevFrameDataRef.current = currentData;
        await new Promise((r) => setTimeout(r, CLIENT_POLL_MS));
      }
    }

    void clientLoop();
  }, [enabled, capturePixelData]);

  return { directionPct, isScanning, liveItems };
}
