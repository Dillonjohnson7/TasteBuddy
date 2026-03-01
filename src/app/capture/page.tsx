"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useCamera } from "@/lib/camera/use-camera";
import { useBrightness } from "@/lib/camera/use-brightness";
import { useWakeLock } from "@/lib/camera/use-wake-lock";
import { extractFrames } from "@/lib/camera/frame-extractor";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/utils/cn";
import type { DetectedItem } from "@/lib/roboflow/types";

type CaptureState =
  | "IDLE"
  | "MONITORING"
  | "TRIGGERED"
  | "CAPTURING"
  | "UPLOADING"
  | "DONE"
  | "ERROR";

const SESSION_KEY = "tastebuddy_session_id";

export default function CapturePage() {
  const { videoRef, status: camStatus, error: camError, start, stop } = useCamera();
  const wakeLock = useWakeLock();
  const [state, setState] = useState<CaptureState>("IDLE");
  const [lastResult, setLastResult] = useState<string | null>(null);
  const [scanError, setScanError] = useState<string | null>(null);
  const [detectedItems, setDetectedItems] = useState<DetectedItem[]>([]);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const monitoringRef = useRef(false);
  const isScanningRef = useRef(false);
  const periodicScanRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const runScanRef = useRef<() => void>(() => {});

  useEffect(() => {
    const stored = localStorage.getItem(SESSION_KEY);
    if (stored) {
      setSessionId(stored);
      return;
    }
    fetch("/api/sessions/create", { method: "POST" })
      .then((r) => r.json())
      .then(({ id }: { id: string }) => {
        localStorage.setItem(SESSION_KEY, id);
        setSessionId(id);
      })
      .catch(() => {
        /* leave sessionId null; error state will show */
      });
  }, []);

  const runScan = useCallback(async () => {
    const video = videoRef.current;
    if (!video || !sessionId) return;
    if (isScanningRef.current) return;

    isScanningRef.current = true;
    setState("CAPTURING");
    setScanError(null);
    setDetectedItems([]);

    try {
      const frames = await extractFrames(video, 3);

      setState("UPLOADING");

      const res = await fetch("/api/scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ frames, session_id: sessionId }),
      });

      if (!res.ok) throw new Error(`Scan failed: ${res.status}`);
      if (!res.body) throw new Error("No response body");

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.trim()) continue;
          const msg = JSON.parse(line);

          if (msg.type === "frame") {
            setDetectedItems((prev) => {
              const merged = new Map(prev.map((i) => [i.name, i]));
              for (const item of msg.items as DetectedItem[]) {
                merged.set(item.name, item);
              }
              return Array.from(merged.values());
            });
          } else if (msg.type === "complete") {
            setDetectedItems(msg.items as DetectedItem[]);
            setLastResult(`Detected ${(msg.items as DetectedItem[]).length} items`);
            setState("DONE");

            setTimeout(() => {
              if (monitoringRef.current) setState("MONITORING");
            }, 3000);
          } else if (msg.type === "error") {
            throw new Error(msg.message);
          }
        }
      }
    } catch (err) {
      setScanError(err instanceof Error ? err.message : "Scan failed");
      setState("ERROR");

      setTimeout(() => {
        if (monitoringRef.current) setState("MONITORING");
      }, 5000);
    } finally {
      isScanningRef.current = false;
    }
  }, [videoRef, sessionId]);

  // Keep a stable ref so the periodic interval always calls the latest runScan
  useEffect(() => {
    runScanRef.current = runScan;
  }, [runScan]);

  const handleBrightnessTrigger = useCallback(() => {
    setState("TRIGGERED");
    setTimeout(() => runScan(), 200);
  }, [runScan]);

  const { luminance, triggered } = useBrightness(
    videoRef,
    state === "MONITORING",
    handleBrightnessTrigger
  );

  async function handleStart() {
    await start();
    await wakeLock.request();
    monitoringRef.current = true;
    setState("MONITORING");

    periodicScanRef.current = setInterval(() => {
      if (monitoringRef.current && !isScanningRef.current) {
        runScanRef.current();
      }
    }, 20000);
  }

  function handleStop() {
    monitoringRef.current = false;
    if (periodicScanRef.current) {
      clearInterval(periodicScanRef.current);
      periodicScanRef.current = null;
    }
    stop();
    wakeLock.release();
    setState("IDLE");
    setLastResult(null);
    setScanError(null);
    setDetectedItems([]);
  }

  if (!sessionId) {
    return (
      <main className="flex min-h-[calc(100vh-3.5rem)] items-center justify-center bg-black">
        <p className="text-sm text-zinc-500">Starting session…</p>
      </main>
    );
  }

  const stateLabel: Record<CaptureState, string> = {
    IDLE: "Camera off",
    MONITORING: "Monitoring brightness...",
    TRIGGERED: "Brightness spike detected!",
    CAPTURING: "Capturing frames...",
    UPLOADING: "Analyzing...",
    DONE: lastResult ?? "Scan complete",
    ERROR: scanError ?? "Error occurred",
  };

  const stateColor: Record<CaptureState, string> = {
    IDLE: "bg-zinc-500",
    MONITORING: "bg-emerald-500",
    TRIGGERED: "bg-yellow-500",
    CAPTURING: "bg-blue-500",
    UPLOADING: "bg-blue-500",
    DONE: "bg-emerald-500",
    ERROR: "bg-red-500",
  };

  const showItems = detectedItems.length > 0 && state !== "IDLE";

  return (
    <main className="flex min-h-[calc(100vh-3.5rem)] flex-col bg-black">
      {/* Video feed */}
      <div className="relative flex-1">
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className="h-full w-full object-cover"
        />

        {/* Status overlay */}
        <div className="absolute left-4 top-4 flex flex-col gap-2">
          <div className="flex items-center gap-2 rounded-lg bg-black/60 px-3 py-2 backdrop-blur-sm">
            <div
              className={cn(
                "h-2.5 w-2.5 rounded-full",
                stateColor[state],
                (state === "MONITORING" || state === "UPLOADING") &&
                  "animate-pulse"
              )}
            />
            <span className="text-sm font-medium text-white">
              {stateLabel[state]}
            </span>
          </div>

          {state === "MONITORING" && (
            <div className="rounded-lg bg-black/60 px-3 py-2 backdrop-blur-sm">
              <div className="flex items-center gap-2">
                <span className="text-xs text-zinc-400">Luminance</span>
                <div className="h-1.5 w-20 overflow-hidden rounded-full bg-zinc-700">
                  <div
                    className={cn(
                      "h-full rounded-full transition-all",
                      luminance >= 80 ? "bg-yellow-400" : "bg-emerald-400"
                    )}
                    style={{ width: `${Math.min((luminance / 255) * 100, 100)}%` }}
                  />
                </div>
                <span className="text-xs tabular-nums text-zinc-300">
                  {luminance}/255
                </span>
              </div>
            </div>
          )}

          {triggered && (
            <div className="animate-pulse rounded-lg bg-yellow-500/20 px-3 py-2 text-sm font-medium text-yellow-300 backdrop-blur-sm">
              Brightness change detected — scanning!
            </div>
          )}
        </div>

        {/* Detected items overlay */}
        {showItems && (
          <div className="absolute bottom-4 left-4 max-h-48 w-56 overflow-y-auto rounded-lg bg-black/70 p-3 backdrop-blur-sm">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-400">
              Detected
            </p>
            <div className="flex flex-wrap gap-1.5">
              {detectedItems.map((item) => (
                <span
                  key={item.name}
                  className="rounded-full bg-emerald-700/80 px-2.5 py-0.5 text-xs font-medium text-emerald-100"
                >
                  {item.name} ({Math.round(item.confidence * 100)}%)
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Camera error */}
        {camError && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/80 p-8">
            <div className="max-w-sm rounded-xl bg-red-950/80 p-6 text-center backdrop-blur-sm">
              <p className="text-sm text-red-300">{camError}</p>
              {camError.includes("permission") && (
                <p className="mt-2 text-xs text-red-400">
                  On iOS, ensure you&apos;re using HTTPS or localhost.
                </p>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Controls */}
      {state === "IDLE" ? (
        <div className="absolute inset-0 flex items-center justify-center">
          <Button
            onClick={handleStart}
            size="lg"
            disabled={camStatus === "requesting"}
          >
            {camStatus === "requesting" ? "Starting camera..." : "Start Monitoring"}
          </Button>
        </div>
      ) : (
        <div className="flex items-center justify-center gap-4 border-t border-zinc-800 bg-zinc-950 p-4">
          <Button variant="secondary" onClick={handleStop}>
            Stop
          </Button>
          <Button
            onClick={() => runScan()}
            disabled={
              state === "CAPTURING" || state === "UPLOADING"
            }
            size="lg"
            className="flex-1"
          >
            {state === "CAPTURING" || state === "UPLOADING"
              ? "Scanning..."
              : "Manual Scan"}
          </Button>
        </div>
      )}
    </main>
  );
}
