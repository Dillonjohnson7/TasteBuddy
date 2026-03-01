import { createClient } from "@/lib/supabase/server";
import { DashboardShell } from "@/components/dashboard/DashboardShell";
import type { FridgeItem, ScanLogEntry } from "@/lib/supabase/types";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const supabase = await createClient();

  const [itemsRes, scansRes] = await Promise.all([
    supabase
      .from("fridge_items")
      .select("*")
      .order("last_seen", { ascending: false }),
    supabase
      .from("scan_log")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(20),
  ]);

  const items = (itemsRes.data ?? []) as FridgeItem[];
  const scans = (scansRes.data ?? []) as ScanLogEntry[];

  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <DashboardShell initialItems={items} initialScans={scans} />
    </main>
  );
}
