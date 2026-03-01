import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { generatePairingCode } from "@/lib/sessions/code";

export async function POST() {
  try {
    const supabase = await createClient();
    const code = generatePairingCode();

    const { data, error } = await supabase
      .from("sessions")
      .insert({ code })
      .select("id, code")
      .single();

    if (error) {
      return NextResponse.json(
        { error: "Failed to create session" },
        { status: 500 }
      );
    }

    return NextResponse.json({ id: data.id, code: data.code });
  } catch {
    return NextResponse.json(
      { error: "Failed to create session" },
      { status: 500 }
    );
  }
}
