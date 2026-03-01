"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export function useWakeLock() {
  const [active, setActive] = useState(false);
  const lockRef = useRef<WakeLockSentinel | null>(null);

  const request = useCallback(async () => {
    try {
      if ("wakeLock" in navigator) {
        lockRef.current = await navigator.wakeLock.request("screen");
        setActive(true);

        lockRef.current.addEventListener("release", () => {
          setActive(false);
        });
      }
    } catch {
      // Wake Lock not supported or denied
    }
  }, []);

  const release = useCallback(async () => {
    try {
      await lockRef.current?.release();
      lockRef.current = null;
      setActive(false);
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    return () => {
      lockRef.current?.release();
    };
  }, []);

  return { active, request, release };
}
