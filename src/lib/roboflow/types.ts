export type RoboflowPrediction = {
  x: number;
  y: number;
  width: number;
  height: number;
  confidence: number;
  class: string;
  class_id: number;
};

export type RoboflowResponse = {
  predictions: RoboflowPrediction[];
  image: { width: number; height: number };
};

export type DetectedItem = {
  name: string;
  category: string;
  confidence: number;
  quantity: number;
};
