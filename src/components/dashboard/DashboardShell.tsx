"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { FridgeItem, ScanLogEntry } from "@/lib/supabase/types";
import { FridgeItemGrid } from "./FridgeItemGrid";
import { SearchBar } from "./SearchBar";
import { CategoryFilter } from "./CategoryFilter";
import { MissingItemsPanel } from "./MissingItemsPanel";
import { ScanHistoryLog } from "./ScanHistoryLog";
import { PairingQR } from "./PairingQR";

export function DashboardShell() {
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [items, setItems] = useState<FridgeItem[]>([]);
  const [scans, setScans] = useState<ScanLogEntry[]>([]);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("all");

  // Create session on mount
  useEffect(() => {
    async function initSession() {
      try {
        const res = await fetch("/api/sessions/create", { method: "POST" });
        if (!res.ok) return;
        const data = await res.json();
        setSessionId(data.id);
      } catch {
        // Session creation failed — dashboard will show QR loading state
      }
    }
    initSession();
  }, []);

  // Fetch initial data once session is available
  const fetchData = useCallback(async (sid: string) => {
    const supabase = createClient();

    const [itemsRes, scansRes] = await Promise.all([
      supabase
        .from("fridge_items")
        .select("*")
        .eq("session_id", sid)
        .order("last_seen", { ascending: false }),
      supabase
        .from("scan_log")
        .select("*")
        .eq("session_id", sid)
        .order("created_at", { ascending: false })
        .limit(20),
    ]);

    setItems((itemsRes.data ?? []) as FridgeItem[]);
    setScans((scansRes.data ?? []) as ScanLogEntry[]);
  }, []);

  useEffect(() => {
    if (!sessionId) return;
    fetchData(sessionId);
  }, [sessionId, fetchData]);

  // Realtime subscriptions scoped to session
  useEffect(() => {
    if (!sessionId) return;

    const supabase = createClient();

    const itemsChannel = supabase
      .channel("fridge_items_changes")
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
              prev.filter(
                (item) => item.id !== (payload.old as { id: string }).id
              )
            );
          }
        }
      )
      .subscribe();

    const scansChannel = supabase
      .channel("scan_log_changes")
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "scan_log",
          filter: `session_id=eq.${sessionId}`,
        },
        (payload) => {
          setScans((prev) =>
            [payload.new as ScanLogEntry, ...prev].slice(0, 20)
          );
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(itemsChannel);
      supabase.removeChannel(scansChannel);
    };
  }, [sessionId]);

  const filteredItems = useMemo(() => {
    let result = items;

    if (search) {
      const q = search.toLowerCase();
      result = result.filter((item) => item.name.toLowerCase().includes(q));
    }

    if (category !== "all") {
      result = result.filter((item) => item.category === category);
    }

    // Present items first, then missing
    result.sort((a, b) => {
      if (a.is_present !== b.is_present) return a.is_present ? -1 : 1;
      return new Date(b.last_seen).getTime() - new Date(a.last_seen).getTime();
    });

    return result;
  }, [items, search, category]);

  const missingItems = useMemo(
    () => items.filter((item) => !item.is_present),
    [items]
  );

  const presentCount = items.filter((i) => i.is_present).length;

  return (
    <div className="space-y-6">
      {/* Pairing QR */}
      {sessionId ? (
        <PairingQR sessionId={sessionId} />
      ) : (
        <div className="flex items-center justify-center rounded-xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900">
          <p className="text-sm text-zinc-500">Creating session...</p>
        </div>
      )}

      {/* Stats bar */}
      <div className="flex flex-wrap gap-4 text-sm text-zinc-600 dark:text-zinc-400">
        <span>
          <strong className="text-zinc-900 dark:text-zinc-100">
            {presentCount}
          </strong>{" "}
          items detected
        </span>
        <span>
          <strong className="text-zinc-900 dark:text-zinc-100">
            {missingItems.length}
          </strong>{" "}
          missing
        </span>
        <span>
          <strong className="text-zinc-900 dark:text-zinc-100">
            {scans.length}
          </strong>{" "}
          scans
        </span>
      </div>

      {/* Filters */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <SearchBar value={search} onChange={setSearch} />
        <CategoryFilter activeCategory={category} onChange={setCategory} />
      </div>

      {/* Missing items alert */}
      <MissingItemsPanel items={missingItems} />

      {/* Item grid */}
      <FridgeItemGrid items={filteredItems} />

      {/* Scan history */}
      <ScanHistoryLog entries={scans} />
    </div>
  );
}
