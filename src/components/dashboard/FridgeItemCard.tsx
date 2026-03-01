"use client";

import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import type { FridgeItem } from "@/lib/supabase/types";
import { cn } from "@/lib/utils/cn";

function formatTime(dateStr: string) {
  const d = new Date(dateStr);
  const now = new Date();
  const diff = now.getTime() - d.getTime();
  const mins = Math.floor(diff / 60000);
  const hours = Math.floor(mins / 60);
  const days = Math.floor(hours / 24);

  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  if (hours < 24) return `${hours}h ago`;
  return `${days}d ago`;
}

export function FridgeItemCard({ item }: { item: FridgeItem }) {
  return (
    <Card
      className={cn(
        "flex flex-col gap-2 transition-opacity",
        !item.is_present && "opacity-50"
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <h3 className="text-sm font-semibold capitalize text-zinc-900 dark:text-zinc-100">
          {item.name}
        </h3>
        <Badge category={item.category}>{item.category}</Badge>
      </div>

      <div className="flex items-center gap-3 text-xs text-zinc-500 dark:text-zinc-400">
        <span>Qty: {item.quantity}</span>
        <span>{Math.round(item.confidence * 100)}% conf</span>
      </div>

      <div className="mt-auto flex items-center justify-between text-xs text-zinc-400 dark:text-zinc-500">
        <span>Last seen: {formatTime(item.last_seen)}</span>
        {!item.is_present && (
          <span className="font-medium text-amber-600 dark:text-amber-400">
            Missing
          </span>
        )}
      </div>
    </Card>
  );
}
