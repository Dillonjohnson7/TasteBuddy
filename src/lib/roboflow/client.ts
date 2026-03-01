import type { RoboflowResponse } from "./types";
import { generateMockPredictions } from "./mock-data";

const ROBOFLOW_API_KEY = process.env.ROBOFLOW_API_KEY;
const ROBOFLOW_MODEL_ID = process.env.ROBOFLOW_MODEL_ID;
const ROBOFLOW_MODEL_VERSION = process.env.ROBOFLOW_MODEL_VERSION;

function hasRoboflowConfig(): boolean {
  return !!(ROBOFLOW_API_KEY && ROBOFLOW_MODEL_ID && ROBOFLOW_MODEL_VERSION);
}

async function callRoboflowAPI(
  base64Image: string
): Promise<RoboflowResponse> {
  const url = `https://detect.roboflow.com/${ROBOFLOW_MODEL_ID}/${ROBOFLOW_MODEL_VERSION}?api_key=${ROBOFLOW_API_KEY}`;

  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: base64Image,
  });

  if (!response.ok) {
    throw new Error(`Roboflow API error: ${response.status}`);
  }

  return response.json();
}

function generateMockResponse(): RoboflowResponse {
  return {
    predictions: generateMockPredictions(),
    image: { width: 720, height: 480 },
  };
}

export async function detectItems(
  base64Frame: string
): Promise<RoboflowResponse> {
  if (hasRoboflowConfig()) {
    return callRoboflowAPI(base64Frame);
  }

  // Simulate network delay for mock data
  await new Promise((r) => setTimeout(r, 100 + Math.random() * 200));
  return generateMockResponse();
}
