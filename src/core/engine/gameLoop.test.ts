import { describe, expect, it } from 'vitest';
import { GameLoop } from './gameLoop';
import type { PoseDetector } from '../pose/poseDetector';
import type { FrameProvider } from '../camera/frameSource';
import { PoseLandmark } from '../../domain/pose/landmarks';
import type { RotationAngle } from '../../domain/pose/orientation';
import type { PoseFrame } from '../../domain/pose/poseTypes';

/** Заглушка детектора: возвращает заранее заданные точки. */
class FakeDetector implements PoseDetector {
  readonly sources: unknown[] = [];
  resets = 0;

  constructor(private readonly frames: PoseFrame[] = []) {}

  async initialize(): Promise<void> {
    /* модель уже «загружена» */
  }

  detect(source: unknown, timestampMs: number): PoseFrame {
    this.sources.push(source);
    const frame = this.frames[this.sources.length - 1];
    return frame ?? { landmarks: [], timestamp: timestampMs, empty: true };
  }

  async reset(): Promise<void> {
    this.resets += 1;
  }

  isReady(): boolean {
    return true;
  }

  close(): void {
    /* ничего не освобождаем */
  }
}

/**
 * Подставной источник кадров.
 *
 * Проверяет, что цикл работает с повёрнутым кадром, и не требует DOM:
 * настоящий FrameSource создаёт canvas, а здесь достаточно объекта-метки.
 */
class FakeFrameProvider implements FrameProvider {
  readonly element = { id: 'fake-canvas' } as unknown as HTMLCanvasElement;
  currentRotation: RotationAngle = 0;
  captures = 0;

  capture(): void {
    this.captures += 1;
  }

  rotateBy(delta: number): void {
    this.currentRotation = (((this.currentRotation + delta) % 360) + 360) % 360 as RotationAngle;
  }
}

/** Кадр с человеком, лежащим на боку: плечи правее таза. */
function sidewaysFrame(timestampMs: number): PoseFrame {
  const landmarks = new Array(33).fill(null).map(() => ({
    x: 0.5,
    y: 0.5,
    z: 0,
    visibility: 1,
  }));
  landmarks[PoseLandmark.LEFT_SHOULDER] = { x: 0.7, y: 0.5, z: 0, visibility: 1 };
  landmarks[PoseLandmark.RIGHT_SHOULDER] = { x: 0.7, y: 0.5, z: 0, visibility: 1 };
  landmarks[PoseLandmark.LEFT_HIP] = { x: 0.3, y: 0.5, z: 0, visibility: 1 };
  landmarks[PoseLandmark.RIGHT_HIP] = { x: 0.3, y: 0.5, z: 0, visibility: 1 };
  return { landmarks, timestamp: timestampMs, empty: false };
}

/** Видео-заглушка: циклу нужны только размеры и отметка времени. */
interface FakeVideo extends HTMLVideoElement {
  advance(): void;
}

function fakeVideo(): FakeVideo {
  let currentTime = 0;
  return {
    videoWidth: 640,
    videoHeight: 480,
    get currentTime() {
      return currentTime;
    },
    advance() {
      currentTime += 1;
    },
  } as unknown as FakeVideo;
}

/**
 * Прогоняет один кадр цикла.
 *
 * Цикл работает через requestAnimationFrame, которого нет в node-окружении,
 * поэтому шаг выполняется напрямую.
 */
async function runFrame(loop: GameLoop, video: FakeVideo): Promise<void> {
  video.advance();
  await loop.processFrameForTest(video);
}

describe('GameLoop: обработка кадра', () => {
  it('детектирует на канвасе источника, а не на <video>', async () => {
    const detector = new FakeDetector([sidewaysFrame(1)]);
    const frames = new FakeFrameProvider();
    const loop = new GameLoop(detector, { frameSource: frames, now: () => 1 });
    const video = fakeVideo();

    await runFrame(loop, video);

    // Детектор всегда получает канвас источника: картинка поворачивается
    // в одном месте, и этот же канвас видит рендер.
    expect(detector.sources).toHaveLength(1);
    expect(detector.sources[0]).toBe(frames.element);
  });

  it('показывает кадр сразу, без ожидания калибровки ориентации', async () => {
    const detector = new FakeDetector([sidewaysFrame(1)]);
    const frames = new FakeFrameProvider();
    const loop = new GameLoop(detector, { frameSource: frames, now: () => 1 });
    const video = fakeVideo();

    const poses: PoseFrame[] = [];
    loop.on('pose', (frame) => poses.push(frame));

    await runFrame(loop, video);

    expect(poses).toHaveLength(1);
  });

  it('не определяет угол поворота сам — он задаётся вручную', async () => {
    const detector = new FakeDetector([sidewaysFrame(1)]);
    const frames = new FakeFrameProvider();
    const loop = new GameLoop(detector, { frameSource: frames, now: () => 1 });
    const video = fakeVideo();

    const rotations: number[] = [];
    loop.on('rotation', ({ value }) => rotations.push(value));

    await runFrame(loop, video);

    // Без нажатия кнопки угол не меняется и событие не приходит.
    expect(rotations).toEqual([]);
    expect(frames.currentRotation).toBe(0);
  });

  it('не пересоздаёт трекер при обычной обработке кадра', async () => {
    const detector = new FakeDetector([sidewaysFrame(1), sidewaysFrame(2)]);
    const frames = new FakeFrameProvider();
    const loop = new GameLoop(detector, { frameSource: frames, now: () => 1 });
    const video = fakeVideo();

    await runFrame(loop, video);
    await runFrame(loop, video);

    // Пересоздание нужно только при смене угла.
    expect(detector.resets).toBe(0);
  });
});

describe('GameLoop: ручной поворот', () => {
  it('поворачивает кадр на заданный угол и пересоздаёт трекер', async () => {
    const detector = new FakeDetector([sidewaysFrame(1)]);
    const frames = new FakeFrameProvider();
    const loop = new GameLoop(detector, { frameSource: frames, now: () => 1 });

    await loop.rotateBy(90);

    expect(frames.currentRotation).toBe(90);
    // Трекер «залипает» на старой позе, поэтому после смены угла
    // его нужно пересоздать.
    expect(detector.resets).toBe(1);
  });

  it('сообщает о новом угле событием', async () => {
    const detector = new FakeDetector([sidewaysFrame(1)]);
    const frames = new FakeFrameProvider();
    const loop = new GameLoop(detector, { frameSource: frames, now: () => 1 });

    const rotations: number[] = [];
    loop.on('rotation', ({ value }) => rotations.push(value));

    await loop.rotateBy(90);
    await loop.rotateBy(90);

    expect(rotations).toEqual([90, 180]);
  });
});
