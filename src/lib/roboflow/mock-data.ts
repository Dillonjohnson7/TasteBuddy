import type { RoboflowPrediction } from "./types";

const MOCK_ITEMS: Array<{ class: string; class_id: number }> = [
  { class: "milk", class_id: 1 },
  { class: "eggs", class_id: 2 },
  { class: "lettuce", class_id: 3 },
  { class: "cheese", class_id: 4 },
  { class: "butter", class_id: 5 },
  { class: "yogurt", class_id: 6 },
  { class: "apple", class_id: 7 },
  { class: "orange juice", class_id: 8 },
  { class: "ketchup", class_id: 9 },
  { class: "leftover pizza", class_id: 10 },
  { class: "chicken breast", class_id: 11 },
  { class: "beer", class_id: 12 },
  { class: "tomato", class_id: 13 },
  { class: "carrot", class_id: 14 },
  { class: "soda", class_id: 15 },
];

function randomBetween(min: number, max: number) {
  return Math.random() * (max - min) + min;
}

export function generateMockPredictions(): RoboflowPrediction[] {
  // Pick 4–8 random items per frame
  const count = Math.floor(randomBetween(4, 9));
  const shuffled = [...MOCK_ITEMS].sort(() => Math.random() - 0.5);
  const selected = shuffled.slice(0, count);

  return selected.map((item) => ({
    x: randomBetween(50, 600),
    y: randomBetween(50, 400),
    width: randomBetween(40, 150),
    height: randomBetween(40, 150),
    confidence: randomBetween(0.45, 0.98),
    class: item.class,
    class_id: item.class_id,
  }));
}
