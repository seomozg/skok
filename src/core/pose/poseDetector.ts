import type { PoseFrame } from '../../domain/pose/poseTypes';

/**
 * Источник кадра для детекции.
 *
 * MediaPipe принимает и <video>, и <canvas>. Канвас нужен для единой
 * точки поворота: картинка поворачивается один раз, и уже этот же
 * канвас отдаётся детектору и рендеру — тогда скелет совпадает с
 * картинкой по построению.
 */
export type PoseDetectionSource = HTMLVideoElement | HTMLCanvasElement;

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
  detect(source: PoseDetectionSource, timestampMs: number): PoseFrame;
  /**
   * Пересоздаёт внутреннее состояние трекинга.
   *
   * Нужно при смене угла поворота кадра: трекер MediaPipe «залипает» на
   * позе, найденной в прошлом кадре, и перестаёт следить за человеком.
   */
  reset(): Promise<void>;
  /** true, если модель готова к работе. */
  isReady(): boolean;
  /** Освобождает ресурсы. */
  close(): void;
}

/** Пустой кадр — человек не найден. */
export function emptyPoseFrame(timestampMs: number): PoseFrame {
  return { landmarks: [], timestamp: timestampMs, empty: true };
}
