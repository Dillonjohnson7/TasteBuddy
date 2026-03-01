"use client";

const TARGET_WIDTH = 720;

/**
 * Extracts keyframes as base64 JPEG from a live video element.
 * Captures `count` frames with a short delay between each.
 */
export async function extractFrames(
  video: HTMLVideoElement,
  count: number = 3
): Promise<string[]> {
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Could not create canvas context");

  // Scale to target width while preserving aspect ratio
  const scale = TARGET_WIDTH / video.videoWidth;
  canvas.width = TARGET_WIDTH;
  canvas.height = Math.round(video.videoHeight * scale);

  const frames: string[] = [];
  const delay = 300; // ms between frames

  for (let i = 0; i < count; i++) {
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const dataUrl = canvas.toDataURL("image/jpeg", 0.8);
    // Strip data URL prefix — send raw base64
    frames.push(dataUrl.replace(/^data:image\/\w+;base64,/, ""));

    if (i < count - 1) {
      await new Promise((r) => setTimeout(r, delay));
    }
  }

  return frames;
}
