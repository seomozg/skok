/**
 * Ориентация кадра: оценка наклона человека и подбор угла поворота.
 *
 * Некоторые камеры (в том числе телефоны, подключённые как веб-камера)
 * отдают ландшафтный буфер, в котором человек лежит на боку. Браузер про
 * этот поворот не знает: в MediaTrackSettings нет поля rotation, а запрос
 * портретного разрешения приводит к обрезке кадра, а не к повороту.
 *
 * Угол определяется по позе: ось «таз → плечи» (или «нос → глаза», если
 * тела не видно) показывает, насколько человек наклонён в кадре. Нужный
 * угол поворота — это угол, при котором ось встаёт вертикально.
 *
 * Все функции чистые и не зависят от DOM.
 */

import { PoseLandmark } from './landmarks';
import type { Landmark } from './poseTypes';

/** Допустимые углы поворота кадра (по часовой стрелке). */
export const ROTATION_ANGLES = [0, 90, 180, 270] as const;

export type RotationAngle = (typeof ROTATION_ANGLES)[number];

/**
 * Порог видимости для оценки ориентации.
 *
 * Намеренно ниже, чем VISIBILITY_THRESHOLD из игровой логики: на кадре,
 * повёрнутом на 90°, MediaPipe видит человека заметно хуже, чем на прямом,
 * а для оценки наклона достаточно грубой позиции точек.
 */
const ORIENTATION_VISIBILITY_THRESHOLD = 0.2;

/**
 * Наклон оси «вверх» относительно вертикали, градусы.
 *
 * 0° — ось смотрит строго вверх, 90° — вправо, 180° — вниз,
 * −90° — влево. Знак совпадает с направлением поворота кадра по
 * часовой стрелке: чтобы вправить ось, кадр нужно повернуть на −tilt.
 */
function tiltOf(dx: number, dy: number): number {
  const degrees = (Math.atan2(dx, -dy) * 180) / Math.PI;
  return Math.round(degrees * 100) / 100;
}

/** Средняя позиция двух точек, если обе достаточно видны. */
function midpoint(
  a: Landmark | undefined,
  b: Landmark | undefined,
): { x: number; y: number } | null {
  if (!a || !b) {
    return null;
  }
  if (a.visibility < ORIENTATION_VISIBILITY_THRESHOLD || b.visibility < ORIENTATION_VISIBILITY_THRESHOLD) {
    return null;
  }
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

/**
 * Наклон тела: ось «таз → плечи» относительно вертикали.
 *
 * @returns угол в градусах или null, если таз или плечи не видны.
 */
export function bodyTilt(landmarks: readonly Landmark[]): number | null {
  const shoulders = midpoint(
    landmarks[PoseLandmark.LEFT_SHOULDER],
    landmarks[PoseLandmark.RIGHT_SHOULDER],
  );
  const hips = midpoint(
    landmarks[PoseLandmark.LEFT_HIP],
    landmarks[PoseLandmark.RIGHT_HIP],
  );
  if (!shoulders || !hips) {
    return null;
  }
  return tiltOf(shoulders.x - hips.x, shoulders.y - hips.y);
}

/**
 * Наклон лица: ось «нос → глаза» относительно вертикали.
 *
 * Нужна как запасной вариант, когда тело не видно (камера близко к
 * человеку и в кадре только лицо).
 *
 * @returns угол в градусах или null, если глаза или нос не видны.
 */
export function faceTilt(landmarks: readonly Landmark[]): number | null {
  const eyes = midpoint(
    landmarks[PoseLandmark.LEFT_EYE],
    landmarks[PoseLandmark.RIGHT_EYE],
  );
  const nose = landmarks[PoseLandmark.NOSE];
  if (!eyes || !nose || nose.visibility < ORIENTATION_VISIBILITY_THRESHOLD) {
    return null;
  }
  return tiltOf(eyes.x - nose.x, eyes.y - nose.y);
}

/** Приводит угол к диапазону 0..360. */
function normalize(angle: number): number {
  return ((angle % 360) + 360) % 360;
}

/** Округляет угол до кратного 90° и приводит к 0..360. */
export function asRotationAngle(angle: number): RotationAngle {
  const snapped = Math.round(angle / 90) * 90;
  return normalize(snapped) as RotationAngle;
}

/**
 * Угол поворота кадра, при котором ось с указанным наклоном встанет
 * вертикально.
 *
 * Например, при наклоне +90° (человек лежит головой вправо) кадр нужно
 * повернуть на −90°, то есть на 270° по часовой стрелке.
 */
export function rotationForTilt(tilt: number): RotationAngle {
  return asRotationAngle(-tilt);
}

/**
 * Выбирает угол поворота по наклонам, измеренным на разных углах.
 *
 * @param tilts — наклон для каждого угла из ROTATION_ANGLES.
 * @returns угол с минимальным отклонением от вертикали или null, если
 *          ни один угол не дал измерения.
 */
export function chooseRotation(tilts: readonly (number | null)[]): RotationAngle | null {
  let best: RotationAngle | null = null;
  let bestDeviation = Infinity;

  tilts.forEach((tilt, index) => {
    if (tilt === null) {
      return;
    }
    const angle = ROTATION_ANGLES[index];
    if (angle === undefined) {
      return;
    }
    const normalized = normalize(tilt);
    const deviation = normalized > 180 ? 360 - normalized : normalized;
    if (deviation < bestDeviation) {
      bestDeviation = deviation;
      best = angle;
    }
  });

  return best;
}
