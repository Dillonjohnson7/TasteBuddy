import { NextRequest, NextResponse } from "next/server";
import { detectItems as detectRoboflow } from "@/lib/roboflow/client";
import { detectItems as detectLocal } from "@/lib/local-model/client";
import type { RoboflowPrediction, DetectedItem } from "@/lib/roboflow/types";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { Database } from "@/lib/supabase/types";

const detectItems =
  process.env.USE_LOCAL_MODEL === "true" ? detectLocal : detectRoboflow;

const CONFIDENCE_THRESHOLD = 0.4;

const CATEGORY_MAP: Record<string, string> = {
  // Dairy
  milk: "dairy",
  cheese: "dairy",
  butter: "dairy",
  yogurt: "dairy",
  eggs: "dairy",
  "sour cream": "dairy",
  // Produce
  lettuce: "produce",
  apple: "produce",
  tomato: "produce",
  carrot: "produce",
  orange: "produce",
  banana: "produce",
  lemon: "produce",
  lime: "produce",
  mango: "produce",
  melon: "produce",
  watermelon: "produce",
  pear: "produce",
  pineapple: "produce",
  plum: "produce",
  grapefruit: "produce",
  avocado: "produce",
  peach: "produce",
  kiwi: "produce",
  papaya: "produce",
  "passion fruit": "produce",
  pomegranate: "produce",
  asparagus: "produce",
  aubergine: "produce",
  cabbage: "produce",
  cucumber: "produce",
  garlic: "produce",
  ginger: "produce",
  leek: "produce",
  mushroom: "produce",
  onion: "produce",
  potato: "produce",
  "sweet potato": "produce",
  "bell pepper": "produce",
  beet: "produce",
  zucchini: "produce",
  // Beverages
  "orange juice": "beverage",
  "apple juice": "beverage",
  "grapefruit juice": "beverage",
  soda: "beverage",
  beer: "beverage",
  // Condiments / other
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
  try {
    const body = await request.json();
    const frames: string[] = body.frames;

    if (!frames || !Array.isArray(frames) || frames.length === 0) {
      return NextResponse.json(
        { error: "Request must include a non-empty 'frames' array" },
        { status: 400 }
      );
    }

    // Run detection on all frames concurrently
    const responses = await Promise.all(
      frames.map((frame) => detectItems(frame))
    );

    // Collect all predictions
    const allPredictions = responses.flatMap((r) => r.predictions);

    // Aggregate and deduplicate
    const detectedItems = aggregatePredictions(allPredictions);

    // Set up Supabase client
    const cookieStore = await cookies();
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

    // Mark all current items as not present first
    await supabase
      .from("fridge_items")
      .update({ is_present: false })
      .eq("is_present", true);

    // Upsert detected items — use select+update/insert pattern
    // since the unique index is on lower(name)
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

    // Log the scan
    await supabase.from("scan_log").insert({
      frame_count: frames.length,
      items_detected: detectedItems.length,
      raw_response: { predictions: allPredictions, items: detectedItems },
    });

    return NextResponse.json({
      success: true,
      items: detectedItems,
      frameCount: frames.length,
      totalPredictions: allPredictions.length,
    });
  } catch (error) {
    console.error("Scan error:", error);
    return NextResponse.json(
      { error: "Failed to process scan" },
      { status: 500 }
    );
  }
}
