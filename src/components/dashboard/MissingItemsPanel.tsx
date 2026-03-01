"use client";

import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import type { FridgeItem } from "@/lib/supabase/types";

export function MissingItemsPanel({ items }: { items: FridgeItem[] }) {
  if (items.length === 0) return null;

  return (
    <Card className="border-amber-200 bg-amber-50 dark:border-amber-800/50 dark:bg-amber-950/20">
      <h2 className="mb-3 text-sm font-semibold text-amber-800 dark:text-amber-300">
        Missing Items ({items.length})
      </h2>
      <div className="flex flex-wrap gap-2">
        {items.map((item) => (
          <Badge key={item.id} category={item.category}>
            <span className="capitalize">{item.name}</span>
          </Badge>
        ))}
      </div>
    </Card>
  );
}
