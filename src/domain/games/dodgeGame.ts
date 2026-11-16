import { PoseLandmark, isReliable } from '../pose/landmarks';
import type { Landmark, PoseFrame } from '../pose/poseTypes';
import type { BaseGameState, GameModule } from './gameModule';

/** Падающий предмет. */
export interface FallingObject {
  id: number;
  /** Горизонтальная позиция в нормализованных координатах 0..1. */
  x: number;
  /** Текущая вертикальная позиция: 0 — верх экрана, 1 — низ. */
  y: number;
  /** Скорость падения (доля экрана в секунду). */
  speed: number;
}

export interface DodgeGameState extends BaseGameState {
  /** Текущий наклон корпуса в градусах: <0 — влево, >0 — вправо. */
  tilt: number;
  /** Горизонтальная позиция игрока: 0 — левый край, 1 — правый. */
  playerX: number;
  /** Оставшиеся жизни. */
  lives: number;
  /** Сколько предметов благополучно долетело до низа. */
  dodged: number;
  /** Падающие предметы. */
  objects: FallingObject[];
  /** Опорный наклон в момент калибровки. */
  referenceTilt: number;
  /** Опорная позиция игрока в момент калибровки. */
  referenceX: number;
  /** Кадры, накопленные для калибровки. */
  calibrationSamples: number[];
  /** true, пока идёт калибровка. */
  calibrating: boolean;
  /** Сколько осталось до следующего предмета, мс. */
  nextSpawnIn: number;
  /** Идентификатор следующего предмета. */
  nextObjectId: number;
}

export interface DodgeGameOptions {
  durationMs?: number;
  lives?: number;
  /** Сколько кадров усреднять для калибровки. */
  calibrationFrames?: number;
  /** Генератор псевдослучайных чисел (для детерминированных тестов). */
  random?: () => number;
  /** Максимальный наклон, при котором игрок у края экрана. */
  maxTiltDegrees?: number;
}

const DEFAULT_DURATION_MS = 30_000;
const DEFAULT_LIVES = 3;
const DEFAULT_CALIBRATION_FRAMES = 20;
const DEFAULT_MAX_TILT = 30;

/** Насколько предмет «широк» для попадания (в нормализованных единицах). */
export const DODGE_HIT_RADIUS = 0.09;

/** Высота, на которой предмет пересекает полосу игрока. */
export const PLAYER_LINE = 0.94;

/** Скорость падения в начале раунда. */
const START_SPEED = 0.25;

/** Насколько скорость растёт к концу раунда. */
const SPEED_GROWTH = 0.55;

/** Интервал между предметами в начале раунда, мс. */
const START_INTERVAL = 1400;

/** Интервал между предметами в конце раунда, мс. */
const END_INTERVAL = 700;

/**
 * Игра «Уклонение»: уходи от падающих предметов, наклоняясь корпусом.
 *
 * Наклон корпуса задаёт горизонтальную позицию игрока: наклонился
 * влево — сдвинулся влево. Предметы падают сверху, нужно пропустить
 * каждый мимо. Столкновение отнимает жизнь, предмет, долетевший до
 * низа экрана, засчитывается в счёт.
 */
export class DodgeGame implements GameModule<DodgeGameState> {
  readonly id = 'dodge';
  readonly title = 'Уклонение';
  readonly description = 'Уклоняйся корпусом от падающих предметов';

  private readonly durationMs: number;
  private readonly lives: number;
  private readonly calibrationFrames: number;
  private readonly random: () => number;
  private readonly maxTilt: number;

  constructor(options: DodgeGameOptions = {}) {
    this.durationMs = options.durationMs ?? DEFAULT_DURATION_MS;
    this.lives = options.lives ?? DEFAULT_LIVES;
    this.calibrationFrames = options.calibrationFrames ?? DEFAULT_CALIBRATION_FRAMES;
    this.random = options.random ?? Math.random;
    this.maxTilt = options.maxTiltDegrees ?? DEFAULT_MAX_TILT;
  }

  createState(): DodgeGameState {
    return {
      score: 0,
      durationMs: this.durationMs,
      elapsedMs: 0,
      status: 'idle',
      tilt: 0,
      playerX: 0.5,
      lives: this.lives,
      dodged: 0,
      objects: [],
      referenceTilt: 0,
      referenceX: 0.5,
      calibrationSamples: [],
      calibrating: true,
      nextSpawnIn: 0,
      nextObjectId: 1,
    };
  }

  isReady(state: DodgeGameState): boolean {
    return !state.calibrating;
  }

  /** Запускает раунд: счёт и жизни обнуляются, начинается калибровка. */
  start(state: DodgeGameState): void {
    state.status = 'running';
    state.elapsedMs = 0;
    state.score = 0;
    state.dodged = 0;
    state.lives = this.lives;
    state.objects = [];
    state.tilt = 0;
    state.playerX = 0.5;
    state.referenceTilt = 0;
    state.referenceX = 0.5;
    state.calibrationSamples = [];
    state.calibrating = true;
    state.nextSpawnIn = 0;
    state.nextObjectId = 1;
  }


  applyFrame(state: DodgeGameState, frame: PoseFrame): void {
    if (state.status !== 'running' || frame.empty) {
      return;
    }

    const tilt = bodyTilt(frame);
    if (tilt === null) {
      return;
    }
    state.tilt = tilt;

    if (state.calibrating) {
      state.calibrationSamples.push(tilt);
      if (state.calibrationSamples.length >= this.calibrationFrames) {
        state.referenceTilt = average(state.calibrationSamples);
        state.calibrating = false;
        state.calibrationSamples = [];
      }
      return;
    }

    // Горизонтальная позиция игрока: наклон корпуса от опорного.
    const offset = (tilt - state.referenceTilt) / this.maxTilt;
    state.playerX = clamp(state.referenceX + offset * 0.35, 0.08, 0.92);
  }

  advance(state: DodgeGameState, deltaMs: number): void {
    if (state.status !== 'running') {
      return;
    }
    state.elapsedMs += deltaMs;
    if (state.elapsedMs >= this.durationMs) {
      state.elapsedMs = this.durationMs;
      state.status = 'finished';
      state.objects = [];
      return;
    }

    // Во время калибровки предметы не падают.
    if (state.calibrating) {
      return;
    }

    // Двигаем предметы: скорость задана в долях экрана в секунду.
    for (const object of state.objects) {
      object.y += object.speed * (deltaMs / 1000);
    }

    // Разбираем предметы, пересёкшие полосу игрока.
    const remaining: FallingObject[] = [];
    for (const object of state.objects) {
      if (object.y < PLAYER_LINE) {
        remaining.push(object);
        continue;
      }

      // Предмет пересёк полосу: если он над игроком — это удар,
      // иначе — успешное уклонение.
      if (Math.abs(object.x - state.playerX) <= DODGE_HIT_RADIUS) {
        state.lives -= 1;
        if (state.lives <= 0) {
          state.lives = 0;
          state.status = 'finished';
        }
      } else {
        state.dodged += 1;
        state.score += 1;
      }
    }
    state.objects = remaining;

    // Появился ли новый предмет.
    state.nextSpawnIn -= deltaMs;
    if (state.nextSpawnIn <= 0) {
      state.objects.push(this.spawnObject(state));
      state.nextSpawnIn = this.spawnInterval(state);
    }
  }

  /** Скорость падения с учётом прошедшего времени раунда. */
  private currentSpeed(state: DodgeGameState): number {
    const progress = state.durationMs > 0 ? state.elapsedMs / state.durationMs : 0;
    return START_SPEED + SPEED_GROWTH * progress;
  }

  /** Интервал между предметами: к концу раунда предметы падают чаще. */
  private spawnInterval(state: DodgeGameState): number {
    const progress = state.durationMs > 0 ? state.elapsedMs / state.durationMs : 0;
    return START_INTERVAL + (END_INTERVAL - START_INTERVAL) * progress;
  }

  private spawnObject(state: DodgeGameState): FallingObject {
    const id = state.nextObjectId;
    state.nextObjectId += 1;
    return {
      id,
      x: 0.08 + this.random() * 0.84,
      y: -0.05,
      speed: this.currentSpeed(state),
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
