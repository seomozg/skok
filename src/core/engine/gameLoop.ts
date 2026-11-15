import type { PoseDetector } from '../pose/poseDetector';
import type { FrameProvider } from '../camera/frameSource';
import type { PoseFrame } from '../../domain/pose/poseTypes';
import { mirrorFrame } from '../../domain/pose/landmarks';
import {
  type RotationAngle,
} from '../../domain/pose/orientation';
import { EventBus } from './eventBus';

export interface GameLoopEvents extends Record<string, unknown> {
  /** Каждый обработанный кадр с позой. */
  pose: PoseFrame;
  /** Обновление счётчика FPS (раз в секунду). */
  fps: { value: number };
  /** Камера/детектор недоступны во время работы. */
  error: { message: string };
  /** Сменился угол поворота кадра. */
  rotation: { value: RotationAngle };
}

export interface GameLoopOptions {
  /** Функция времени (для тестов). */
  now?: () => number;
  /** Источник кадров: поворачивает картинку в едином месте. */
  frameSource: FrameProvider;
}

/**
 * Игровой цикл: захват кадра → детекция позы → рассылка подписчикам.
 *
 * Не знает ни об играх, ни о React — только о детекторе и шине событий.
 */
export class GameLoop {
  private readonly bus = new EventBus<GameLoopEvents>();
  private readonly now: () => number;
  private readonly frameSource: FrameProvider;
  private rafId: number | null = null;
  private lastFrameTimestamp = -1;
  private frameCount = 0;
  private fpsWindowStart = 0;
  private running = false;
  /** Идёт ли обработка кадра: следующий кадр пропускается до её конца. */
  private processing = false;
  /** Последняя отметка времени детекции: должна строго возрастать. */
  private lastDetectionTimestamp = 0;

  constructor(
    private readonly detector: PoseDetector,
    options: GameLoopOptions,
  ) {
    this.now = options.now ?? (() => performance.now());
    this.frameSource = options.frameSource;
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

  /** Текущий угол поворота кадра. */
  get rotation(): RotationAngle {
    return this.frameSource.currentRotation;
  }

  /**
   * Поворачивает кадр на угол вручную и пересоздаёт трекер.
   *
   * Ручной поворот — запасной вариант, если автоматическое определение
   * ориентации ошиблось.
   */
  async rotateBy(delta: number): Promise<void> {
    this.frameSource.rotateBy(delta);
    // Трекер MediaPipe «залипает» на позе из прошлого кадра и перестаёт
    // реагировать на поворот картинки, поэтому после смены угла его нужно
    // пересоздать.
    await this.detector.reset();
    this.bus.emit('rotation', { value: this.frameSource.currentRotation });
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
      // Кадр обрабатывается асинхронно (калибровка ждёт пересоздания
      // трекера), поэтому следующий вызов пропускается, пока предыдущий
      // не закончился: MediaPipe требует строго возрастающих отметок
      // времени и не терпит параллельных вызовов.
      if (!this.processing) {
        this.processing = true;
        void this.processFrame(video).finally(() => {
          this.processing = false;
        });
      }
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

  /**
   * Обрабатывает один кадр видео.
   *
   * Публичный метод нужен тестам: цикл крутится через requestAnimationFrame,
   * которого нет в node-окружении.
   */
  async processFrameForTest(video: HTMLVideoElement): Promise<void> {
    await this.processFrame(video);
  }

  private async processFrame(video: HTMLVideoElement): Promise<void> {
    // Кадр не изменился — детектировать нечего.
    if (video.currentTime === this.lastVideoTime && this.lastFrameTimestamp >= 0) {
      return;
    }
    this.lastVideoTime = video.currentTime;
    this.lastFrameTimestamp = this.now();

    // Картинка поворачивается ровно в одном месте, и уже этот канвас
    // видят и детектор, и рендер — поэтому скелет совпадает с картинкой.
    this.frameSource.capture(video);

    let frame: PoseFrame;
    try {
      frame = this.detector.detect(this.frameSource.element, this.nextTimestamp());
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
    this.updateFps(this.now());
  }

  /**
   * Отметка времени для детекции.
   *
   * MediaPipe требует строго возрастающих отметок времени, поэтому
   * используется отдельный счётчик, а не время кадра.
   */
  private nextTimestamp(): number {
    const timestamp = this.now();
    this.lastDetectionTimestamp = Math.max(timestamp, this.lastDetectionTimestamp + 1);
    return this.lastDetectionTimestamp;
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
