import {
  SKELETON_CONNECTIONS,
  SKELETON_POINTS,
  VISIBILITY_THRESHOLD,
} from '../domain/pose/landmarks';
import type { PoseFrame } from '../domain/pose/poseTypes';

export interface SkeletonStyle {
  lineColor: string;
  lineWidth: number;
  pointColor: string;
  pointRadius: number;
  /** Цвет точек с низкой видимостью. */
  dimColor: string;
}

export const DEFAULT_SKELETON_STYLE: SkeletonStyle = {
  lineColor: '#5eead4',
  lineWidth: 4,
  pointColor: '#f8fafc',
  pointRadius: 4,
  dimColor: '#334155',
};

/**
 * Рисует скелет поверх видео.
 *
 * Координаты кадра уже «зеркальные» (см. GameLoop), поэтому здесь
 * дополнительного зеркалирования не требуется.
 */
export function drawSkeleton(
  ctx: CanvasRenderingContext2D,
  frame: PoseFrame,
  width: number,
  height: number,
  style: SkeletonStyle = DEFAULT_SKELETON_STYLE,
): void {
  if (frame.empty || frame.landmarks.length === 0) {
    return;
  }

  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  for (const [from, to] of SKELETON_CONNECTIONS) {
    const a = frame.landmarks[from];
    const b = frame.landmarks[to];
    if (!a || !b) {
      continue;
    }
    const visible =
      a.visibility >= VISIBILITY_THRESHOLD && b.visibility >= VISIBILITY_THRESHOLD;
    ctx.strokeStyle = visible ? style.lineColor : style.dimColor;
    ctx.lineWidth = style.lineWidth;
    ctx.beginPath();
    ctx.moveTo(a.x * width, a.y * height);
    ctx.lineTo(b.x * width, b.y * height);
    ctx.stroke();
  }

  for (const index of SKELETON_POINTS) {
    const point = frame.landmarks[index];
    if (!point) {
      continue;
    }
    const visible = point.visibility >= VISIBILITY_THRESHOLD;
    ctx.fillStyle = visible ? style.pointColor : style.dimColor;
    ctx.beginPath();
    ctx.arc(point.x * width, point.y * height, style.pointRadius, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.restore();
}
