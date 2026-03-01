import type { RoboflowResponse } from "@/lib/roboflow/types";

const LOCAL_MODEL_URL = process.env.LOCAL_MODEL_URL ?? "http://localhost:8000";

export async function detectItems(
  base64Frame: string
): Promise<RoboflowResponse> {
  const response = await fetch(`${LOCAL_MODEL_URL}/detect`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ base64_image: base64Frame }),
  });
  if (!response.ok) throw new Error(`Local model error: ${response.status}`);
  return response.json() as Promise<RoboflowResponse>;
}
