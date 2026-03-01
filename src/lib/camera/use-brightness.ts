"use client";

import { useCallback, useEffect, useRef, useState } from "react";

const SAMPLE_WIDTH = 64;
const SAMPLE_HEIGHT = 48;
const DELTA_THRESHOLD = 40; // out of 255 — ~16% swing counts as drastic
const COOLDOWN_MS = 30000;

export function useBrightness(
  videoRef: React.RefObject<HTMLVideoElement | null>,
  enabled: boolean,
  onTrigger: () => void
) {
  const [luminance, setLuminance] = useState(0);
  const [triggered, setTriggered] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const ctxRef = useRef<CanvasRenderingContext2D | null>(null);
  const prevLumRef = useRef<number | null>(null);
  const cooldownUntilRef = useRef(0);

  const sampleLuminance = useCallback(() => {
    const video = videoRef.current;
    if (!video || video.readyState < 2) return 0;

    if (!canvasRef.current) {
      canvasRef.current = document.createElement("canvas");
      canvasRef.current.width = SAMPLE_WIDTH;
      canvasRef.current.height = SAMPLE_HEIGHT;
      ctxRef.current = canvasRef.current.getContext("2d", {
        willReadFrequently: true,
      });
    }

    const ctx = ctxRef.current;
    if (!ctx) return 0;

    ctx.drawImage(video, 0, 0, SAMPLE_WIDTH, SAMPLE_HEIGHT);
    const imageData = ctx.getImageData(0, 0, SAMPLE_WIDTH, SAMPLE_HEIGHT);
    const data = imageData.data;

    let sum = 0;
    const pixelCount = data.length / 4;
    for (let i = 0; i < data.length; i += 4) {
      // Perceived luminance: 0.299R + 0.587G + 0.114B
      sum += 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
    }

    return sum / pixelCount;
  }, [videoRef]);

  useEffect(() => {
    if (!enabled) {
      prevLumRef.current = null;
      return;
    }

    const interval = setInterval(() => {
      const lum = sampleLuminance();
      setLuminance(Math.round(lum));

      const now = Date.now();
      const prev = prevLumRef.current;
      prevLumRef.current = lum;

      if (prev === null) return; // need at least one prior sample to diff

      if (now < cooldownUntilRef.current) return;

      const delta = Math.abs(lum - prev);
      if (delta >= DELTA_THRESHOLD) {
        setTriggered(true);
        onTrigger();
        cooldownUntilRef.current = now + COOLDOWN_MS;
        setTimeout(() => setTriggered(false), 2000);
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [enabled, sampleLuminance, onTrigger]);

  return { luminance, triggered };
}
