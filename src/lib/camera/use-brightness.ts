"use client";

import { useCallback, useEffect, useRef, useState } from "react";

const SAMPLE_WIDTH = 64;
const SAMPLE_HEIGHT = 48;
const BRIGHTNESS_THRESHOLD = 80; // out of 255
const SUSTAIN_MS = 500;
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
  const brightSinceRef = useRef<number | null>(null);
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
    if (!enabled) return;

    const interval = setInterval(() => {
      const lum = sampleLuminance();
      setLuminance(Math.round(lum));

      const now = Date.now();
      if (now < cooldownUntilRef.current) {
        brightSinceRef.current = null;
        return;
      }

      if (lum >= BRIGHTNESS_THRESHOLD) {
        if (!brightSinceRef.current) {
          brightSinceRef.current = now;
        } else if (now - brightSinceRef.current >= SUSTAIN_MS) {
          setTriggered(true);
          onTrigger();
          brightSinceRef.current = null;
          cooldownUntilRef.current = now + COOLDOWN_MS;

          setTimeout(() => setTriggered(false), 2000);
        }
      } else {
        brightSinceRef.current = null;
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [enabled, sampleLuminance, onTrigger]);

  return { luminance, triggered };
}
