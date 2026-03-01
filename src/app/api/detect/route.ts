import { NextRequest, NextResponse } from "next/server";
import { detectItems } from "@/lib/local-model/client";

export async function POST(request: NextRequest) {
  const body = await request.json();
  const frame: string = body.frame;

  if (!frame) {
    return NextResponse.json(
      { error: "Request must include a 'frame' field" },
      { status: 400 }
    );
  }

  try {
    const result = await detectItems(frame);
    return NextResponse.json({
      predictions: result.predictions.map((p) => ({
        name: p.class,
        x: p.x,
        confidence: p.confidence,
      })),
      imageWidth: result.image.width,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Detection failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
