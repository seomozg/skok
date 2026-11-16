import { type RotationAngle, asRotationAngle } from '../../domain/pose/orientation';

/**
 * Источник кадров, от которого зависит игровой цикл.
 *
 * Вынесен в интерфейс, чтобы цикл не зависел от конкретной реализации
 * и его можно было тестировать без браузера (Dependency Inversion).
 */
export interface FrameProvider {
  /** Канвас с последним обработанным кадром. */
  readonly element: HTMLCanvasElement;
  /** Текущий угол поворота кадра (по часовой стрелке). */
  readonly currentRotation: RotationAngle;
  /** Копирует кадр видео в канвас с учётом поворота. */
  capture(video: HTMLVideoElement): void;
  /** Добавляет поворот к текущему углу. */
  rotateBy(delta: number): void;
}

/**
 * Источник кадров с поворотом.
 *
 * Единственное место в приложении, где кадр поворачивается: видео
 * копируется в offscreen-канвас под нужным углом, и уже этот канвас
 * отдаётся и детектору позы, и рендеру.
 *
 * Благодаря этому скелет совпадает с картинкой по построению: MediaPipe
 * анализирует ровно те пиксели, которые показываются на экране.
 *
 * Зеркалирование по X здесь НЕ применяется — оно остаётся в рендере и в
 * игровом цикле, как и раньше.
 */
export class FrameSource implements FrameProvider {
  private readonly canvas: HTMLCanvasElement;
  private readonly context: CanvasRenderingContext2D;
  private rotation: RotationAngle = 0;

  constructor() {
    this.canvas = document.createElement('canvas');
    const context = this.canvas.getContext('2d');
    if (!context) {
      throw new Error('Не удалось получить 2D-контекст offscreen-канваса');
    }
    this.context = context;
  }

  /** Канвас с последним обработанным кадром. */
  get element(): HTMLCanvasElement {
    return this.canvas;
  }

  /** Текущий угол поворота кадра (по часовой стрелке). */
  get currentRotation(): RotationAngle {
    return this.rotation;
  }

  /**
   * Добавляет поворот к текущему углу.
   *
   * @param delta — величина поворота в градусах (кратна 90).
   */
  rotateBy(delta: number): void {
    this.rotation = asRotationAngle(this.rotation + delta);
  }

  /**
   * Копирует текущий кадр видео в offscreen-канвас с учётом поворота.
   *
   * Размер канваса совпадает с размером кадра после поворота, поэтому
   * нормализованные координаты точек относятся именно к тому, что видит
   * детектор.
   */
  capture(video: HTMLVideoElement): void {
    const sourceWidth = video.videoWidth;
    const sourceHeight = video.videoHeight;
    if (!sourceWidth || !sourceHeight) {
      return;
    }

    const swapped = this.rotation === 90 || this.rotation === 270;
    const width = swapped ? sourceHeight : sourceWidth;
    const height = swapped ? sourceWidth : sourceHeight;

    if (this.canvas.width !== width || this.canvas.height !== height) {
      this.canvas.width = width;
      this.canvas.height = height;
    }

    const context = this.context;
    context.save();
    context.clearRect(0, 0, width, height);
    context.translate(width / 2, height / 2);
    // В экранных координатах положительный угол — поворот по часовой стрелке.
    context.rotate((this.rotation * Math.PI) / 180);
    context.drawImage(video, -sourceWidth / 2, -sourceHeight / 2, sourceWidth, sourceHeight);
    context.restore();
  }
}
