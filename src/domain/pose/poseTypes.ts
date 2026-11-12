/**
 * Типы данных распознавания позы.
 *
 * Не зависят от конкретной реализации детектора (MediaPipe / MoveNet) —
 * это контракт уровня домена (Dependency Inversion).
 */

/** Точка на нормализованной плоскости изображения: x,y в диапазоне 0..1. */
export interface Point2D {
  x: number;
  y: number;
}

/** Ключевая точка тела MediaPipe (33 точки). */
export interface Landmark extends Point2D {
  /** Глубина относительно таза, меньше — ближе к камере. */
  z: number;
  /** Видимость точки: 0..1. Точки ниже порога считаются ненадёжными. */
  visibility: number;
}

/** Кадр с результатом детекции позы. */
export interface PoseFrame {
  /** 33 точки в нормализованных координатах кадра (без зеркалирования). */
  landmarks: Landmark[];
  /** Метка времени кадра в миллисекундах (performance.now()). */
  timestamp: number;
  /** true — кадр пустой (человек не найден). */
  empty: boolean;
}
