"use client";

import { FridgeItemCard } from "./FridgeItemCard";
import type { FridgeItem } from "@/lib/supabase/types";

export function FridgeItemGrid({ items }: { items: FridgeItem[] }) {
  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-zinc-300 py-16 text-zinc-400 dark:border-zinc-700 dark:text-zinc-500">
        <p className="text-lg font-medium">No items found</p>
        <p className="text-sm">Run a scan to detect fridge items</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {items.map((item) => (
        <FridgeItemCard key={item.id} item={item} />
      ))}
    </div>
  );
}
