"use client";

import { Card } from "@/components/ui/Card";
import type { ScanLogEntry } from "@/lib/supabase/types";

function formatTimestamp(dateStr: string) {
  return new Date(dateStr).toLocaleString();
}

export function ScanHistoryLog({ entries }: { entries: ScanLogEntry[] }) {
  if (entries.length === 0) {
    return (
      <Card>
        <h2 className="mb-2 text-sm font-semibold text-zinc-900 dark:text-zinc-100">
          Scan History
        </h2>
        <p className="text-sm text-zinc-400 dark:text-zinc-500">
          No scans yet
        </p>
      </Card>
    );
  }

  return (
    <Card>
      <h2 className="mb-3 text-sm font-semibold text-zinc-900 dark:text-zinc-100">
        Scan History
      </h2>
      <div className="space-y-2">
        {entries.map((entry) => (
          <div
            key={entry.id}
            className="flex items-center justify-between rounded-lg bg-zinc-50 px-3 py-2 text-sm dark:bg-zinc-800/50"
          >
            <span className="text-zinc-600 dark:text-zinc-400">
              {formatTimestamp(entry.created_at)}
            </span>
            <div className="flex gap-4 text-xs text-zinc-500 dark:text-zinc-400">
              <span>{entry.frame_count} frames</span>
              <span>{entry.items_detected} items</span>
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}
