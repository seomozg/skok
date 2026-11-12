import type { PoseFrame } from '../../domain/pose/poseTypes';

/**
 * Абстракция детектора позы.
 *
 * Игры и рендер зависят только от этого интерфейса, а не от MediaPipe.
 * Это позволяет подменить реализацию (например, MoveNet) без изменения
 * остального приложения (Open/Closed + Dependency Inversion).
 */
export interface PoseDetector {
  /** Загружает модель. Вызывается один раз перед первым detect(). */
  initialize(): Promise<void>;
  /** Определяет позу на кадре видео. */
  detect(source: HTMLVideoElement, timestampMs: number): PoseFrame;
  /** true, если модель готова к работе. */
  isReady(): boolean;
  /** Освобождает ресурсы. */
  close(): void;
}

/** Пустой кадр — человек не найден. */
export function emptyPoseFrame(timestampMs: number): PoseFrame {
  return { landmarks: [], timestamp: timestampMs, empty: true };
}
