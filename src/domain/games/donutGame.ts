import { PoseLandmark, isReliable } from '../pose/landmarks';
import type { Landmark, PoseFrame } from '../pose/poseTypes';
import type { BaseGameState, GameModule } from './gameModule';

/** Падающий пончик. */
export interface FallingDonut {
  id: number;
  /** Горизонтальная позиция в нормализованных координатах 0..1. */
  x: number;
  /** Текущая вертикальная позиция: 0 — верх экрана, 1 — низ. */
  y: number;
  /** Скорость падения (доля экрана в секунду). */
  speed: number;
  /** С какой стороны пришёл пончик: -1 — слева, 1 — справа. */
  side: -1 | 1;
}

export interface DonutGameState extends BaseGameState {
  /** Текущий наклон корпуса в градусах: <0 — влево, >0 — вправо. */
  tilt: number;
  /** Горизонтальная позиция рта в нормализованных координатах. */
  mouthX: number;
  /** Вертикальная позиция рта в нормализованных координатах. */
  mouthY: number;
  /** Оставшиеся жизни. */
  lives: number;
  /** Сколько пончиков поймано. */
  caught: number;
  /** Сколько пончиков упало мимо. */
  missed: number;
  /** Падающие пончики. */
  donuts: FallingDonut[];
  /** Опорный наклон в момент калибровки. */
  referenceTilt: number;
  /** Опорное горизонтальное положение рта в момент калибровки. */
  referenceMouthX: number;
  /** Кадры, накопленные для калибровки. */
  calibrationSamples: number[];
  /** true, пока идёт калибровка. */
  calibrating: boolean;
  /** Сколько осталось до следующего пончика, мс. */
  nextSpawnIn: number;
  /** Идентификатор следующего пончика. */
  nextDonutId: number;
  /** С какой стороны придёт следующий пончик: -1 — слева, 1 — справа. */
  nextSide: -1 | 1;
}

export interface DonutGameOptions {
  durationMs?: number;
  lives?: number;
  /** Сколько кадров усреднять для калибровки. */
  calibrationFrames?: number;
  /** Максимальный наклон, при котором рот у края экрана. */
  maxTiltDegrees?: number;
}

const DEFAULT_DURATION_MS = 30_000;
const DEFAULT_LIVES = 3;
const DEFAULT_CALIBRATION_FRAMES = 20;
const DEFAULT_MAX_TILT = 30;

/** Радиус, в котором пончик считается пойманным ртом. */
export const DONUT_CATCH_RADIUS = 0.2;

/** Насколько далеко от рта появляется пончик (в долях ширины экрана). */
export const DONUT_SPAWN_OFFSET = 0.3;

/** Скорость падения в начале раунда. */
const START_SPEED = 0.2;

/** Насколько скорость растёт к концу раунда. */
const SPEED_GROWTH = 0.5;

/** Интервал между пончиками в начале раунда, мс. */
const START_INTERVAL = 1500;

/** Интервал между пончиками в конце раунда, мс. */
const END_INTERVAL = 800;

/**
 * Игра «Пончики»: лови пончики ртом.
 *
 * Пончики падают по очереди — сначала слева, потом справа, и так далее.
 * Игрок управляет положением рта наклоном корпуса и должен подставить
 * голову под падающий пончик.
 *
 * Управление остаётся наклоном корпуса: смысл упражнения — в наклонах.
 */
export class DonutGame implements GameModule<DonutGameState> {
  readonly id = 'donuts';
  readonly title = 'Пончики';
  readonly description = 'Лови пончики ртом — наклоняйся влево и вправо';

  private readonly durationMs: number;
  private readonly lives: number;
  private readonly calibrationFrames: number;
  private readonly maxTilt: number;

  constructor(options: DonutGameOptions = {}) {
    this.durationMs = options.durationMs ?? DEFAULT_DURATION_MS;
    this.lives = options.lives ?? DEFAULT_LIVES;
    this.calibrationFrames = options.calibrationFrames ?? DEFAULT_CALIBRATION_FRAMES;
    this.maxTilt = options.maxTiltDegrees ?? DEFAULT_MAX_TILT;
  }

  createState(): DonutGameState {
    return {
      score: 0,
      durationMs: this.durationMs,
      elapsedMs: 0,
      status: 'idle',
      tilt: 0,
      mouthX: 0.5,
      mouthY: 0.3,
      lives: this.lives,
      caught: 0,
      missed: 0,
      donuts: [],
      referenceTilt: 0,
      referenceMouthX: 0.5,
      calibrationSamples: [],
      calibrating: true,
      nextSpawnIn: 0,
      nextDonutId: 1,
      nextSide: 1,
    };
  }

  isReady(state: DonutGameState): boolean {
    return !state.calibrating;
  }

  /** Запускает раунд: счёт и жизни обнуляются, начинается калибровка. */
  start(state: DonutGameState): void {
    state.status = 'running';
    state.elapsedMs = 0;
    state.score = 0;
    state.caught = 0;
    state.missed = 0;
    state.lives = this.lives;
    state.donuts = [];
    state.tilt = 0;
    state.mouthX = 0.5;
    state.mouthY = 0.3;
    state.referenceTilt = 0;
    state.referenceMouthX = 0.5;
    state.calibrationSamples = [];
    state.calibrating = true;
    state.nextSpawnIn = 0;
    state.nextDonutId = 1;
    state.nextSide = 1;
  }


  applyFrame(state: DonutGameState, frame: PoseFrame): void {
    if (state.status !== 'running' || frame.empty) {
      return;
    }

    const tilt = bodyTilt(frame);
    if (tilt === null) {
      return;
    }
    state.tilt = tilt;

    // Положение головы из позы: по вертикали рот всегда там, где голова,
    // а по горизонтали им управляет наклон корпуса.
    const nose = frame.landmarks[PoseLandmark.NOSE];
    const noseOk = isReliable(nose);
    if (noseOk) {
      state.mouthY = nose.y;
    }

    if (state.calibrating) {
      state.calibrationSamples.push(tilt);
      // Опорное положение рта — реальная координата носа в начале
      // калибровки: от неё игрок будет отклоняться наклоном.
      if (state.calibrationSamples.length === 1 && noseOk) {
        state.referenceMouthX = nose.x;
      }
      if (state.calibrationSamples.length >= this.calibrationFrames) {
        state.referenceTilt = average(state.calibrationSamples);
        state.calibrating = false;
        state.calibrationSamples = [];
      }
      return;
    }

    // Горизонтальное положение рта задаёт наклон корпуса: наклонился
    // влево — голова (и рот) сместилась влево. Это и есть управление.
    const offset = (tilt - state.referenceTilt) / this.maxTilt;
    state.mouthX = clamp(state.referenceMouthX + offset * 0.3, 0.1, 0.9);
  }

  advance(state: DonutGameState, deltaMs: number): void {
    if (state.status !== 'running') {
      return;
    }
    state.elapsedMs += deltaMs;
    if (state.elapsedMs >= this.durationMs) {
      state.elapsedMs = this.durationMs;
      state.status = 'finished';
      state.donuts = [];
      return;
    }

    // Во время калибровки пончики не падают.
    if (state.calibrating) {
      return;
    }

    // Двигаем пончики: скорость задана в долях экрана в секунду.
    for (const donut of state.donuts) {
      donut.y += donut.speed * (deltaMs / 1000);
    }

    // Разбираем пончики, долетевшие до уровня рта.
    const remaining: FallingDonut[] = [];
    for (const donut of state.donuts) {
      if (donut.y < state.mouthY) {
        remaining.push(donut);
        continue;
      }

      // Пончик дошёл до рта: поймали или промахнулись.
      if (Math.abs(donut.x - state.mouthX) <= DONUT_CATCH_RADIUS) {
        state.caught += 1;
        state.score += 1;
      } else {
        state.missed += 1;
        state.lives -= 1;
        if (state.lives <= 0) {
          state.lives = 0;
          state.status = 'finished';
        }
      }
    }
    state.donuts = remaining;

    // Появился ли новый пончик.
    state.nextSpawnIn -= deltaMs;
    if (state.nextSpawnIn <= 0) {
      state.donuts.push(this.spawnDonut(state));
      state.nextSpawnIn = this.spawnInterval(state);
    }
  }

  /** Скорость падения с учётом прошедшего времени раунда. */
  private currentSpeed(state: DonutGameState): number {
    const progress = state.durationMs > 0 ? state.elapsedMs / state.durationMs : 0;
    return START_SPEED + SPEED_GROWTH * progress;
  }

  /** Интервал между предметами: к концу раунда предметы падают чаще. */
  private spawnInterval(state: DonutGameState): number {
    const progress = state.durationMs > 0 ? state.elapsedMs / state.durationMs : 0;
    return START_INTERVAL + (END_INTERVAL - START_INTERVAL) * progress;
  }

  private spawnDonut(state: DonutGameState): FallingDonut {
    const id = state.nextDonutId;
    state.nextDonutId += 1;

    // Пончики приходят по очереди: сначала справа, потом слева, и так
    // далее. Позиция — относительно рта на момент появления.
    const side = state.nextSide;
    state.nextSide = side === 1 ? -1 : 1;

    const x = clamp(state.mouthX + side * DONUT_SPAWN_OFFSET, 0.05, 0.95);

    return {
      id,
      x,
      y: -0.05,
      speed: this.currentSpeed(state),
      side,
    };
  }
}

/**
 * Наклон корпуса в градусах: ось «таз → плечи» относительно вертикали.
 *
 * @returns угол или null, если корпус не видно.
 */
export function bodyTilt(frame: PoseFrame): number | null {
  const shoulders = midpoint(
    frame.landmarks[PoseLandmark.LEFT_SHOULDER],
    frame.landmarks[PoseLandmark.RIGHT_SHOULDER],
  );
  const hips = midpoint(
    frame.landmarks[PoseLandmark.LEFT_HIP],
    frame.landmarks[PoseLandmark.RIGHT_HIP],
  );
  if (!shoulders || !hips) {
    return null;
  }
  const dx = shoulders.x - hips.x;
  const dy = shoulders.y - hips.y;
  // 0° — строго вверх, положительный — наклон вправо.
  return Math.round((Math.atan2(dx, -dy) * 180) / Math.PI);
}

/** Средняя позиция двух точек, если обе достаточно видны. */
function midpoint(
  a: Landmark | undefined,
  b: Landmark | undefined,
): { x: number; y: number } | null {
  if (!a || !b || !isReliable(a) || !isReliable(b)) {
    return null;
  }
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

/** Ограничивает значение диапазоном. */
function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/** Среднее арифметическое массива чисел. */
export function average(values: readonly number[]): number {
  if (values.length === 0) {
    return 0;
  }
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

