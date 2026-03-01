"use client";

import { useEffect, useRef, useState } from "react";
import QRCode from "qrcode";

interface PairingQRProps {
  sessionId: string;
}

export function PairingQR({ sessionId }: PairingQRProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [url, setUrl] = useState("");

  useEffect(() => {
    const captureUrl = `${window.location.origin}/capture?s=${sessionId}`;
    setUrl(captureUrl);

    if (canvasRef.current) {
      QRCode.toCanvas(canvasRef.current, captureUrl, {
        width: 200,
        margin: 2,
        color: { dark: "#18181b", light: "#ffffff" },
      });
    }
  }, [sessionId]);

  return (
    <div className="flex flex-col items-center gap-3 rounded-xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900">
      <h2 className="text-sm font-medium text-zinc-600 dark:text-zinc-400">
        Scan to link your phone
      </h2>
      <canvas ref={canvasRef} className="rounded-lg" />
      <p className="max-w-[200px] truncate text-xs text-zinc-400 dark:text-zinc-500">
        {url}
      </p>
    </div>
  );
}
