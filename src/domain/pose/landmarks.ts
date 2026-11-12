import type { Landmark, Point2D, PoseFrame } from './poseTypes';

/** Индексы ключевых точек MediaPipe Pose (33 точки). */
export const PoseLandmark = {
  NOSE: 0,
  LEFT_EYE_INNER: 1,
  LEFT_EYE: 2,
  LEFT_EYE_OUTER: 3,
  RIGHT_EYE_INNER: 4,
  RIGHT_EYE: 5,
  RIGHT_EYE_OUTER: 6,
  LEFT_EAR: 7,
  RIGHT_EAR: 8,
  MOUTH_LEFT: 9,
  MOUTH_RIGHT: 10,
  LEFT_SHOULDER: 11,
  RIGHT_SHOULDER: 12,
  LEFT_ELBOW: 13,
  RIGHT_ELBOW: 14,
  LEFT_WRIST: 15,
  RIGHT_WRIST: 16,
  LEFT_PINKY: 17,
  RIGHT_PINKY: 18,
  LEFT_INDEX: 19,
  RIGHT_INDEX: 20,
  LEFT_THUMB: 21,
  RIGHT_THUMB: 22,
  LEFT_HIP: 23,
  RIGHT_HIP: 24,
  LEFT_KNEE: 25,
  RIGHT_KNEE: 26,
  LEFT_ANKLE: 27,
  RIGHT_ANKLE: 28,
  LEFT_HEEL: 29,
  RIGHT_HEEL: 30,
  LEFT_FOOT_INDEX: 31,
  RIGHT_FOOT_INDEX: 32,
} as const;

export type PoseLandmarkIndex = (typeof PoseLandmark)[keyof typeof PoseLandmark];

/** Точки ниже этой видимости считаются ненадёжными. */
export const VISIBILITY_THRESHOLD = 0.5;

/**
 * Связи скелета для отрисовки: [индекс начала, индекс конца].
 */
export const SKELETON_CONNECTIONS: ReadonlyArray<readonly [number, number]> = [
  [PoseLandmark.LEFT_SHOULDER, PoseLandmark.RIGHT_SHOULDER],
  [PoseLandmark.LEFT_SHOULDER, PoseLandmark.LEFT_ELBOW],
  [PoseLandmark.LEFT_ELBOW, PoseLandmark.LEFT_WRIST],
  [PoseLandmark.RIGHT_SHOULDER, PoseLandmark.RIGHT_ELBOW],
  [PoseLandmark.RIGHT_ELBOW, PoseLandmark.RIGHT_WRIST],
  [PoseLandmark.LEFT_SHOULDER, PoseLandmark.LEFT_HIP],
  [PoseLandmark.RIGHT_SHOULDER, PoseLandmark.RIGHT_HIP],
  [PoseLandmark.LEFT_HIP, PoseLandmark.RIGHT_HIP],
  [PoseLandmark.LEFT_HIP, PoseLandmark.LEFT_KNEE],
  [PoseLandmark.LEFT_KNEE, PoseLandmark.LEFT_ANKLE],
  [PoseLandmark.RIGHT_HIP, PoseLandmark.RIGHT_KNEE],
  [PoseLandmark.RIGHT_KNEE, PoseLandmark.RIGHT_ANKLE],
  [PoseLandmark.LEFT_ANKLE, PoseLandmark.LEFT_FOOT_INDEX],
  [PoseLandmark.RIGHT_ANKLE, PoseLandmark.RIGHT_FOOT_INDEX],
  [PoseLandmark.LEFT_ANKLE, PoseLandmark.LEFT_HEEL],
  [PoseLandmark.RIGHT_ANKLE, PoseLandmark.RIGHT_HEEL],
];

/** Точки, которые рисуются точками поверх скелета. */
export const SKELETON_POINTS: readonly number[] = [
  PoseLandmark.NOSE,
  PoseLandmark.LEFT_EYE,
  PoseLandmark.RIGHT_EYE,
  PoseLandmark.LEFT_EAR,
  PoseLandmark.RIGHT_EAR,
  PoseLandmark.LEFT_SHOULDER,
  PoseLandmark.RIGHT_SHOULDER,
  PoseLandmark.LEFT_ELBOW,
  PoseLandmark.RIGHT_ELBOW,
  PoseLandmark.LEFT_WRIST,
  PoseLandmark.RIGHT_WRIST,
  PoseLandmark.LEFT_HIP,
  PoseLandmark.RIGHT_HIP,
  PoseLandmark.LEFT_KNEE,
  PoseLandmark.RIGHT_KNEE,
  PoseLandmark.LEFT_ANKLE,
  PoseLandmark.RIGHT_ANKLE,
  PoseLandmark.LEFT_FOOT_INDEX,
  PoseLandmark.RIGHT_FOOT_INDEX,
];

/**
 * Инвертирует X для зеркального отображения.
 * Видео с фронтальной камеры показывается «как в зеркале», поэтому
 * все нормализованные координаты, с которыми работает приложение,
 * приводятся к «зеркальному» виду ровно один раз — здесь.
 */
export function mirrorX<T extends Point2D>(point: T): T {
  return { ...point, x: 1 - point.x };
}

/** Возвращает точку по индексу или undefined, если индекс выходит за границы. */
export function getLandmark(
  landmarks: readonly Landmark[],
  index: number,
): Landmark | undefined {
  return landmarks[index];
}

/** true, если точка существует и достаточно видна. */
export function isReliable(point: Landmark | undefined): point is Landmark {
  return point !== undefined && point.visibility >= VISIBILITY_THRESHOLD;
}

/**
 * Переводит нормализованную точку в пиксели канваса.
 * @param mirrored — применять ли зеркалирование по X.
 */
export function toCanvasPoint(
  point: Point2D,
  width: number,
  height: number,
  mirrored = true,
): Point2D {
  const x = mirrored ? 1 - point.x : point.x;
  return { x: x * width, y: point.y * height };
}

/**
 * Зеркалирует весь кадр по X.
 * Применяется ровно один раз — в игровом цикле, — чтобы все потребители
 * работали в единой «зеркальной» системе координат.
 */
export function mirrorFrame(frame: PoseFrame): PoseFrame {
  if (frame.empty) {
    return frame;
  }
  return {
    ...frame,
    landmarks: frame.landmarks.map((point) => ({ ...point, x: 1 - point.x })),
  };
}

/**
 * Убирает из кадра ненадёжные точки (visibility ниже порога).
 * Остальные точки сохраняют исходные индексы.
 */
export function filterReliable(landmarks: readonly Landmark[]): Landmark[] {
  return landmarks.map((point) =>
    point.visibility >= VISIBILITY_THRESHOLD ? point : { ...point, visibility: 0 },
  );
}
