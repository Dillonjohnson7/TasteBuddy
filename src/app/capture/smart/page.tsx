"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useCamera } from "@/lib/camera/use-camera";
import { useMotion } from "@/lib/camera/use-motion";
import { useWakeLock } from "@/lib/camera/use-wake-lock";
import { extractFrames } from "@/lib/camera/frame-extractor";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/utils/cn";
import type { DetectedItem } from "@/lib/roboflow/types";

type CaptureState =
  | "IDLE"
  | "MONITORING"
  | "CAPTURING"
  | "UPLOADING"
  | "DONE"
  | "ERROR";

const SESSION_KEY = "tastebuddy_session_id";

export default function SmartCapturePage() {
  const { videoRef, status: camStatus, error: camError, start, stop } = useCamera();
  const wakeLock = useWakeLock();
  const [state, setState] = useState<CaptureState>("IDLE");
  const [lastResult, setLastResult] = useState<string | null>(null);
  const [lastDirection, setLastDirection] = useState<"add" | "remove" | null>(null);
  const [scanError, setScanError] = useState<string | null>(null);
  const [detectedItems, setDetectedItems] = useState<DetectedItem[]>([]);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const monitoringRef = useRef(false);
  const isScanningRef = useRef(false);
  const [justLocked, setJustLocked] = useState(false);
  const lockedFramesRef = useRef<string[] | null>(null);

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
      .catch(() => {});
  }, []);

  const runScan = useCallback(
    async (direction: "add" | "remove") => {
      const video = videoRef.current;
      if (!video || !sessionId) return;
      if (isScanningRef.current) return;

      isScanningRef.current = true;
      setLastDirection(direction);
      setState("CAPTURING");
      setScanError(null);
      setDetectedItems([]);

      try {
        const frames = lockedFramesRef.current ?? (await extractFrames(video, 3));
        setState("UPLOADING");

        const endpoint = direction === "add" ? "/api/scan/add" : "/api/scan/remove";
        const body =
          direction === "add"
            ? { frames, session_id: sessionId, seen_items: [] }
            : { frames, session_id: sessionId };

        const res = await fetch(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
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
              const items = msg.items as DetectedItem[];
              setDetectedItems(items);
              const verb = direction === "add" ? "Added" : "Removed";
              setLastResult(`${verb} ${items.length} item${items.length !== 1 ? "s" : ""}`);
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
    },
    [videoRef, sessionId]
  );

  const handleGesture = useCallback(
    (direction: "add" | "remove") => {
      if (state !== "MONITORING") return;
      runScan(direction);
    },
    [state, runScan]
  );

  const { directionPct, isScanning, liveItems, phase } = useMotion(
    videoRef,
    state === "MONITORING",
    handleGesture
  );

  // Trigger ping animation when first locking on
  useEffect(() => {
    if (phase !== "detecting_motion") return;
    setJustLocked(true);
    const t = setTimeout(() => setJustLocked(false), 700);
    return () => clearTimeout(t);
  }, [phase]);

  // Capture frames at lock-in time so runScan uses the correct item
  useEffect(() => {
    if (phase === "detecting_motion") {
      if (videoRef.current) {
        extractFrames(videoRef.current, 3).then((frames) => {
          lockedFramesRef.current = frames;
        });
      }
    } else {
      lockedFramesRef.current = null;
    }
  }, [phase, videoRef]);

  async function handleStart() {
    await start();
    await wakeLock.request();
    monitoringRef.current = true;
    setState("MONITORING");
  }

  function handleStop() {
    monitoringRef.current = false;
    stop();
    wakeLock.release();
    setState("IDLE");
    setLastResult(null);
    setScanError(null);
    setDetectedItems([]);
    setLastDirection(null);
  }

  if (!sessionId) {
    return (
      <main className="flex min-h-[calc(100vh-3.5rem)] items-center justify-center bg-black">
        <p className="text-sm text-zinc-500">Starting session…</p>
      </main>
    );
  }

  const monitoringLabel =
    phase === "detecting_object" ? "Looking for items…" : "Swipe to add → or ← remove";

  const stateLabel: Record<CaptureState, string> = {
    IDLE: "Camera off",
    MONITORING: monitoringLabel,
    CAPTURING: "Capturing frames…",
    UPLOADING: "Analyzing…",
    DONE: lastResult ?? "Scan complete",
    ERROR: scanError ?? "Error occurred",
  };

  const stateColor: Record<CaptureState, string> = {
    IDLE: "bg-zinc-500",
    MONITORING: phase === "detecting_object" ? "bg-blue-500" : "bg-emerald-500",
    CAPTURING: "bg-blue-400",
    UPLOADING: "bg-blue-400",
    DONE: lastDirection === "add" ? "bg-emerald-500" : "bg-orange-500",
    ERROR: "bg-red-500",
  };

  const showItems =
    detectedItems.length > 0 && (state === "UPLOADING" || state === "DONE");

  const showMeter = state === "MONITORING" && phase === "detecting_motion";
  const meterPulsing = Math.abs(directionPct) > 50;

  return (
    <main className="flex min-h-[calc(100vh-3.5rem)] flex-col bg-black">
      {/* Mode label */}
      <div className="absolute left-1/2 top-4 z-10 -translate-x-1/2">
        <span className="rounded-full bg-blue-600/90 px-4 py-1 text-sm font-semibold text-white backdrop-blur-sm">
          Smart Scan
        </span>
      </div>

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
        <div className="absolute left-4 top-14 flex flex-col gap-2">
          <div className="flex items-center gap-2 rounded-lg bg-black/60 px-3 py-2 backdrop-blur-sm">
            <div className="relative flex h-2.5 w-2.5 items-center justify-center">
              {/* Ping ring on lock-on */}
              {justLocked && (
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
              )}
              <div
                className={cn(
                  "relative h-2.5 w-2.5 rounded-full",
                  stateColor[state],
                  // Pulse only when searching; locked = steady
                  ((state === "MONITORING" && phase === "detecting_object") || state === "UPLOADING") && "animate-pulse"
                )}
              />
            </div>
            <span className="text-sm font-medium text-white">{stateLabel[state]}</span>
          </div>

          {/* Scanning badge — only in detecting_object */}
          {state === "MONITORING" && phase === "detecting_object" && isScanning && (
            <div className="rounded-lg bg-black/60 px-3 py-2 backdrop-blur-sm">
              <span className="text-xs text-blue-300">Scanning…</span>
            </div>
          )}

          {/* Locked-on indicator — only in detecting_motion */}
          {state === "MONITORING" && phase === "detecting_motion" && (
            <div className="rounded-lg bg-emerald-900/60 border border-emerald-500/50 px-3 py-2 backdrop-blur-sm">
              <span className="text-xs font-semibold text-emerald-300">Locked on — swipe item</span>
            </div>
          )}

          {state === "MONITORING" && phase === "detecting_motion" && liveItems.length > 0 && (
            <div className="rounded-lg bg-black/60 px-3 py-2 backdrop-blur-sm">
              <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-zinc-400">
                Detected
              </p>
              <div className="flex flex-wrap gap-1">
                {liveItems.map((item) => (
                  <span
                    key={item.name}
                    className="rounded-full bg-emerald-700/80 px-2 py-0.5 text-xs font-medium text-emerald-100"
                  >
                    {item.name} ({Math.round(item.confidence * 100)}%)
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Direction meter */}
        {showMeter && (
          <div
            className={cn(
              "absolute bottom-4 left-4 right-4 rounded-xl bg-black/70 p-3 backdrop-blur-sm border-2 transition-colors",
              meterPulsing
                ? directionPct > 0
                  ? "border-emerald-400 animate-pulse"
                  : "border-orange-400 animate-pulse"
                : "border-transparent"
            )}
          >
            <div className="mb-2 flex items-center justify-between text-xs font-medium">
              <span className="text-orange-400">← REMOVE</span>
              <span className="text-zinc-300">
                {directionPct !== 0
                  ? `${Math.abs(Math.round(directionPct))}% ${directionPct > 0 ? "→" : "←"}`
                  : "—"}
              </span>
              <span className="text-emerald-400">ADD →</span>
            </div>
            <div className="relative h-3 overflow-hidden rounded-full bg-zinc-700">
              {/* Center divider */}
              <div className="absolute bottom-0 left-1/2 top-0 w-px -translate-x-1/2 bg-zinc-500" />
              {/* Directional fill */}
              {directionPct > 0 ? (
                <div
                  className="absolute bottom-0 left-1/2 top-0 rounded-r-full bg-emerald-500 transition-all duration-150"
                  style={{ width: `${Math.abs(directionPct) / 2}%` }}
                />
              ) : directionPct < 0 ? (
                <div
                  className="absolute bottom-0 right-1/2 top-0 rounded-l-full bg-orange-500 transition-all duration-150"
                  style={{ width: `${Math.abs(directionPct) / 2}%` }}
                />
              ) : null}
            </div>
          </div>
        )}

        {/* Scan result overlay */}
        {showItems && (
          <div className="absolute bottom-4 left-4 max-h-48 w-56 overflow-y-auto rounded-lg bg-black/70 p-3 backdrop-blur-sm">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-400">
              {lastDirection === "add" ? "Added" : "Removed"}
            </p>
            <div className="flex flex-wrap gap-1.5">
              {detectedItems.map((item) => (
                <span
                  key={item.name}
                  className={cn(
                    "rounded-full px-2.5 py-0.5 text-xs font-medium",
                    lastDirection === "add"
                      ? "bg-emerald-700/80 text-emerald-100"
                      : "bg-orange-700/80 text-orange-100"
                  )}
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
            {camStatus === "requesting" ? "Starting camera…" : "Start Smart Scan"}
          </Button>
        </div>
      ) : (
        <div className="flex items-center justify-center gap-4 border-t border-zinc-800 bg-zinc-950 p-4">
          <Button variant="secondary" onClick={handleStop}>
            Stop
          </Button>
          <Button
            onClick={() => runScan("add")}
            disabled={state === "CAPTURING" || state === "UPLOADING"}
            className="flex-1"
          >
            {state === "CAPTURING" || state === "UPLOADING" ? "Scanning…" : "Manual Add"}
          </Button>
          <Button
            onClick={() => runScan("remove")}
            disabled={state === "CAPTURING" || state === "UPLOADING"}
            variant="secondary"
            className="flex-1"
          >
            Manual Remove
          </Button>
        </div>
      )}
    </main>
  );
}
