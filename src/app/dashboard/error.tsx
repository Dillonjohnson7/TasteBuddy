"use client";

import { Button } from "@/components/ui/Button";

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className="mx-auto flex max-w-6xl flex-col items-center justify-center px-4 py-16">
      <div className="max-w-md text-center">
        <h2 className="mb-2 text-lg font-semibold text-zinc-900 dark:text-zinc-100">
          Something went wrong
        </h2>
        <p className="mb-6 text-sm text-zinc-500 dark:text-zinc-400">
          {error.message || "Failed to load dashboard data. Check your Supabase connection."}
        </p>
        <Button onClick={reset}>Try again</Button>
      </div>
    </main>
  );
}
