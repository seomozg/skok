import type { PoseDetector } from '../pose/poseDetector';
import type { PoseFrame } from '../../domain/pose/poseTypes';
import { mirrorFrame } from '../../domain/pose/landmarks';
import { EventBus } from './eventBus';

export interface GameLoopEvents extends Record<string, unknown> {
  /** Каждый обработанный кадр с позой. */
  pose: PoseFrame;
  /** Обновление счётчика FPS (раз в секунду). */
  fps: { value: number };
  /** Камера/детектор недоступны во время работы. */
  error: { message: string };
}

export interface GameLoopOptions {
  /** Функция времени (для тестов). */
  now?: () => number;
}

/**
 * Игровой цикл: захват кадра → детекция позы → рассылка подписчикам.
 *
 * Не знает ни об играх, ни о React — только о детекторе и шине событий.
 */
export class GameLoop {
  private readonly bus = new EventBus<GameLoopEvents>();
  private readonly now: () => number;
  private rafId: number | null = null;
  private lastFrameTimestamp = -1;
  private frameCount = 0;
  private fpsWindowStart = 0;
  private running = false;

  constructor(
    private readonly detector: PoseDetector,
    options: GameLoopOptions = {},
  ) {
    this.now = options.now ?? (() => performance.now());
  }

  on<K extends keyof GameLoopEvents>(
    event: K,
    handler: (payload: GameLoopEvents[K]) => void,
  ): () => void {
    return this.bus.on(event, handler);
  }

  isRunning(): boolean {
    return this.running;
  }

  start(video: HTMLVideoElement): void {
    if (this.running) {
      return;
    }
    this.running = true;
    this.fpsWindowStart = this.now();
    this.frameCount = 0;
    this.lastFrameTimestamp = -1;
    this.lastVideoTime = -1;

    // Единый rAF-цикл: детектируем только когда кадр камеры реально сменился
    // (сравниваем currentTime). Это работает и там, где
    // requestVideoFrameCallback недоступен или не срабатывает
    // (например, для скрытого <video> вне области видимости).
    const tick = () => {
      if (!this.running) {
        return;
      }
      this.processFrame(video);
      this.rafId = requestAnimationFrame(tick);
    };

    this.rafId = requestAnimationFrame(tick);
  }

  stop(): void {
    this.running = false;
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
  }

  private processFrame(video: HTMLVideoElement): void {
    const timestamp = this.now();

    // Кадр не изменился — детектировать нечего.
    if (video.currentTime === this.lastVideoTime && this.lastFrameTimestamp >= 0) {
      return;
    }
    this.lastVideoTime = video.currentTime;
    this.lastFrameTimestamp = timestamp;

    let frame: PoseFrame;
    try {
      frame = this.detector.detect(video, timestamp);
    } catch (error) {
      this.bus.emit('error', {
        message: error instanceof Error ? error.message : 'Ошибка распознавания позы',
      });
      return;
    }

    // Единственное место, где применяется зеркалирование по X.
    // Дальше все потребители (рендер, игры) работают в «зеркальной»
    // системе координат и не должны знать о зеркалировании.
    this.bus.emit('pose', mirrorFrame(frame));
    this.updateFps(timestamp);
  }

  private lastVideoTime = -1;

  private updateFps(timestamp: number): void {
    this.frameCount += 1;
    const elapsed = timestamp - this.fpsWindowStart;
    if (elapsed >= 1000) {
      this.bus.emit('fps', { value: Math.round((this.frameCount * 1000) / elapsed) });
      this.frameCount = 0;
      this.fpsWindowStart = timestamp;
    }
  }
}
