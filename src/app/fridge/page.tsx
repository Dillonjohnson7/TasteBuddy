"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { FridgeItem } from "@/lib/supabase/types";
import { Badge } from "@/components/ui/Badge";
import { cn } from "@/lib/utils/cn";

const SESSION_KEY = "tastebuddy_session_id";

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function ItemRow({ item }: { item: FridgeItem }) {
  const name = item.name
    .split(" ")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");

  return (
    <div className="flex items-center justify-between rounded-lg border border-zinc-100 bg-white px-4 py-3 dark:border-zinc-800 dark:bg-zinc-900">
      <div className="flex items-center gap-3">
        <span className="font-medium text-zinc-900 dark:text-zinc-100">{name}</span>
        <Badge category={item.category}>{item.category}</Badge>
      </div>
      <div className="flex items-center gap-4 text-sm text-zinc-500 dark:text-zinc-400">
        <span className="tabular-nums font-medium text-zinc-700 dark:text-zinc-300">
          &times;{item.quantity}
        </span>
        <span className="hidden sm:inline">{timeAgo(item.last_seen)}</span>
      </div>
    </div>
  );
}

function Section({
  title,
  items,
  emptyText,
  accentClass,
}: {
  title: string;
  items: FridgeItem[];
  emptyText: string;
  accentClass: string;
}) {
  return (
    <section>
      <h2 className={cn("mb-3 text-base font-semibold", accentClass)}>{title}</h2>
      {items.length === 0 ? (
        <p className="rounded-lg border border-dashed border-zinc-200 p-6 text-center text-sm text-zinc-400 dark:border-zinc-700 dark:text-zinc-500">
          {emptyText}
        </p>
      ) : (
        <div className="flex flex-col gap-2">
          {items.map((item) => (
            <ItemRow key={item.id} item={item} />
          ))}
        </div>
      )}
    </section>
  );
}

export default function FridgePage() {
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [items, setItems] = useState<FridgeItem[]>([]);
  const [loading, setLoading] = useState(true);

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
      .catch(() => setLoading(false));
  }, []);

  const fetchItems = useCallback(async (sid: string) => {
    const supabase = createClient();
    const { data } = await supabase
      .from("fridge_items")
      .select("*")
      .eq("session_id", sid)
      .order("last_seen", { ascending: false });
    setItems((data ?? []) as FridgeItem[]);
    setLoading(false);
  }, []);

  useEffect(() => {
    if (!sessionId) return;
    fetchItems(sessionId);
  }, [sessionId, fetchItems]);

  // Realtime subscription
  useEffect(() => {
    if (!sessionId) return;
    const supabase = createClient();

    const channel = supabase
      .channel("fridge_page_items")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "fridge_items",
          filter: `session_id=eq.${sessionId}`,
        },
        (payload) => {
          if (payload.eventType === "INSERT") {
            setItems((prev) => [payload.new as FridgeItem, ...prev]);
          } else if (payload.eventType === "UPDATE") {
            setItems((prev) =>
              prev.map((item) =>
                item.id === (payload.new as FridgeItem).id
                  ? (payload.new as FridgeItem)
                  : item
              )
            );
          } else if (payload.eventType === "DELETE") {
            setItems((prev) =>
              prev.filter((item) => item.id !== (payload.old as { id: string }).id)
            );
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [sessionId]);

  const present = items
    .filter((i) => i.is_present)
    .sort((a, b) => new Date(b.last_seen).getTime() - new Date(a.last_seen).getTime());

  const absent = items
    .filter((i) => !i.is_present)
    .sort((a, b) => new Date(b.last_seen).getTime() - new Date(a.last_seen).getTime());

  return (
    <main className="mx-auto max-w-2xl px-4 py-8">
      <h1 className="mb-8 text-2xl font-bold text-zinc-900 dark:text-zinc-100">
        My Fridge
      </h1>

      {loading ? (
        <p className="text-sm text-zinc-500">Loading…</p>
      ) : (
        <div className="flex flex-col gap-8">
          <Section
            title="In the Fridge"
            items={present}
            emptyText="No items detected yet. Use Add Items to scan your fridge."
            accentClass="text-emerald-600 dark:text-emerald-400"
          />
          <Section
            title="Not in the Fridge"
            items={absent}
            emptyText="No missing items."
            accentClass="text-zinc-500 dark:text-zinc-400"
          />
        </div>
      )}
    </main>
  );
}
