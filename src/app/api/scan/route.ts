import { NextRequest } from "next/server";
import { detectItems as detectLocal } from "@/lib/local-model/client";
import type { RoboflowPrediction, DetectedItem } from "@/lib/roboflow/types";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { Database } from "@/lib/supabase/types";

const CONFIDENCE_THRESHOLD = 0.4;

const CATEGORY_MAP: Record<string, string> = {
  milk: "dairy",
  cheese: "dairy",
  butter: "dairy",
  yogurt: "dairy",
  eggs: "dairy",
  lettuce: "produce",
  apple: "produce",
  tomato: "produce",
  carrot: "produce",
  "orange juice": "beverage",
  soda: "beverage",
  beer: "beverage",
  ketchup: "condiment",
  "leftover pizza": "leftover",
  "chicken breast": "meat",
};

function classifyCategory(className: string): string {
  return CATEGORY_MAP[className.toLowerCase()] ?? "other";
}

function aggregatePredictions(
  allPredictions: RoboflowPrediction[]
): DetectedItem[] {
  const grouped = new Map<
    string,
    { totalConfidence: number; count: number }
  >();

  for (const pred of allPredictions) {
    if (pred.confidence < CONFIDENCE_THRESHOLD) continue;

    const key = pred.class.toLowerCase();
    const existing = grouped.get(key);
    if (existing) {
      existing.totalConfidence += pred.confidence;
      existing.count += 1;
    } else {
      grouped.set(key, { totalConfidence: pred.confidence, count: 1 });
    }
  }

  return Array.from(grouped.entries()).map(
    ([name, { totalConfidence, count }]) => ({
      name,
      category: classifyCategory(name),
      confidence: totalConfidence / count,
      quantity: count,
    })
  );
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const frames: string[] = body.frames;

  if (!frames || !Array.isArray(frames) || frames.length === 0) {
    return new Response(
      JSON.stringify({ type: "error", message: "Request must include a non-empty 'frames' array" }) + "\n",
      { status: 400, headers: { "Content-Type": "text/plain; charset=utf-8" } }
    );
  }

  const cookieStore = await cookies();

  const stream = new ReadableStream({
    async start(controller) {
      const enc = new TextEncoder();
      const write = (obj: object) =>
        controller.enqueue(enc.encode(JSON.stringify(obj) + "\n"));

      const allPredictions: RoboflowPrediction[] = [];

      try {
        for (let i = 0; i < frames.length; i++) {
          const response = await detectLocal(frames[i]);
          const framePredictions = response.predictions;
          allPredictions.push(...framePredictions);

          const frameItems = aggregatePredictions(framePredictions);
          write({ type: "frame", frameIndex: i, items: frameItems });
        }

        const detectedItems = aggregatePredictions(allPredictions);

        // Save to Supabase
        const supabase = createServerClient<Database>(
          process.env.NEXT_PUBLIC_SUPABASE_URL!,
          process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
          {
            cookies: {
              getAll() {
                return cookieStore.getAll();
              },
              setAll(cookiesToSet) {
                try {
                  cookiesToSet.forEach(({ name, value, options }) =>
                    cookieStore.set(name, value, options)
                  );
                } catch {
                  // ignore in route handler
                }
              },
            },
          }
        );

        const now = new Date().toISOString();

        await supabase
          .from("fridge_items")
          .update({ is_present: false })
          .eq("is_present", true);

        for (const item of detectedItems) {
          const { data: existing } = await supabase
            .from("fridge_items")
            .select("id")
            .ilike("name", item.name)
            .maybeSingle();

          if (existing) {
            await supabase
              .from("fridge_items")
              .update({
                category: item.category,
                quantity: item.quantity,
                confidence: item.confidence,
                is_present: true,
                last_seen: now,
              })
              .eq("id", existing.id);
          } else {
            await supabase.from("fridge_items").insert({
              name: item.name,
              category: item.category,
              quantity: item.quantity,
              confidence: item.confidence,
              is_present: true,
              last_seen: now,
            });
          }
        }

        await supabase.from("scan_log").insert({
          frame_count: frames.length,
          items_detected: detectedItems.length,
          raw_response: { predictions: allPredictions, items: detectedItems },
        });

        write({
          type: "complete",
          items: detectedItems,
          frameCount: frames.length,
          totalPredictions: allPredictions.length,
        });
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Failed to process scan";
        console.error("Scan error:", error);
        write({ type: "error", message });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}
