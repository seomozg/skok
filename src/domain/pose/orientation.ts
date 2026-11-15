/**
 * Угол поворота кадра.
 *
 * Некоторые камеры отдают кадр в не той ориентации, в которой человек
 * находится в кадре: буфер остаётся ландшафтным, а содержимое лежит
 * на боку. Браузер про такой поворот не знает — в MediaTrackSettings нет
 * поля rotation.
 *
 * Угол задаётся вручную (кнопка «Повернуть») и кратен 90°, потому что
 * камера поворачивает картинку только на прямые углы.
 *
 * Все функции чистые и не зависят от DOM.
 */

/** Допустимые углы поворота кадра (по часовой стрелке). */
export const ROTATION_ANGLES = [0, 90, 180, 270] as const;

export type RotationAngle = (typeof ROTATION_ANGLES)[number];

/**
 * Приводит угол к кратному 90° и к диапазону 0..360.
 */
export function asRotationAngle(angle: number): RotationAngle {
  const snapped = Math.round(angle / 90) * 90;
  return (((snapped % 360) + 360) % 360) as RotationAngle;
}
