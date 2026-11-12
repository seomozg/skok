import type { Point2D } from './poseTypes';

const EPSILON = 1e-6;

/**
 * Угол в градусах при вершине `b` между точками a-b-c.
 *
 * @returns угол в диапазоне 0..180. Для вырожденных точек возвращает 0.
 */
export function angleBetween(a: Point2D, b: Point2D, c: Point2D): number {
  const abX = a.x - b.x;
  const abY = a.y - b.y;
  const cbX = c.x - b.x;
  const cbY = c.y - b.y;

  const dot = abX * cbX + abY * cbY;
  const magAB = Math.hypot(abX, abY);
  const magCB = Math.hypot(cbX, cbY);

  if (magAB < EPSILON || magCB < EPSILON) {
    return 0;
  }

  const cos = dot / (magAB * magCB);
  const clamped = Math.max(-1, Math.min(1, cos));
  return (Math.acos(clamped) * 180) / Math.PI;
}

/**
 * Угол в коленном суставе: бедро — колено — лодыжка.
 */
export function kneeAngle(hip: Point2D, knee: Point2D, ankle: Point2D): number {
  return angleBetween(hip, knee, ankle);
}

/**
 * Угол в плечевом суставе: бедро — плечо — локоть.
 */
export function shoulderAngle(hip: Point2D, shoulder: Point2D, elbow: Point2D): number {
  return angleBetween(hip, shoulder, elbow);
}
