import { kneeAngle } from '../pose/angles';
import {
  createSquatCalibration,
  type SquatCalibration,
} from '../pose/calibration';
import { PoseLandmark, isReliable } from '../pose/landmarks';
import type { PoseFrame } from '../pose/poseTypes';
import type { BaseGameState, GameModule } from './gameModule';

export type SquatPhase = 'calibrating' | 'up' | 'down';

export interface SquatGameState extends BaseGameState {
  phase: SquatPhase;
  calibration: SquatCalibration | null;
  /** Текущий угол колена в градусах. */
  currentAngle: number;
  /** Угол, усреднённый по обеим ногам. */
  reps: number;
  /** Кадры, накопленные для калибровки. */
  calibrationSamples: number[];
}

export interface SquatGameOptions {
  durationMs?: number;
  /** Сколько кадров усреднять для калибровки. */
  calibrationFrames?: number;
}

const DEFAULT_DURATION_MS = 60_000;
const DEFAULT_CALIBRATION_FRAMES = 20;

/**
 * Игра «Squat»: считает приседания по углу колена.
 *
 * Пороги не фиксированные (90°/160° из ТЗ), а калибруются под пользователя:
 * за reference берётся средний угол в исходной стойке, приседание
 * засчитывается при отклонении вниз и возврате вверх (гистерезис).
 */
export class SquatGame implements GameModule<SquatGameState> {
  readonly id = 'squat';
  readonly title = 'Приседания';
  readonly description = 'Приседай — приложение посчитает повторы';

  private readonly durationMs: number;
  private readonly calibrationFrames: number;

  constructor(options: SquatGameOptions = {}) {
    this.durationMs = options.durationMs ?? DEFAULT_DURATION_MS;
    this.calibrationFrames = options.calibrationFrames ?? DEFAULT_CALIBRATION_FRAMES;
  }

  createState(): SquatGameState {
    return {
      score: 0,
      durationMs: this.durationMs,
      elapsedMs: 0,
      status: 'idle',
      phase: 'calibrating',
      calibration: null,
      currentAngle: 0,
      reps: 0,
      calibrationSamples: [],
    };
  }

  isReady(state: SquatGameState): boolean {
    return state.calibration !== null;
  }

  /** Запускает раунд: обнуляет счёт и переводит игру в режим калибровки. */
  start(state: SquatGameState): void {
    state.status = 'running';
    state.elapsedMs = 0;
    state.score = 0;
    state.reps = 0;
    state.phase = 'calibrating';
    state.calibration = null;
    state.calibrationSamples = [];
  }

  applyFrame(state: SquatGameState, frame: PoseFrame): void {
    if (state.status !== 'running' || frame.empty) {
      return;
    }
    const angle = this.averageKneeAngle(frame);
    if (angle === null) {
      return;
    }
    state.currentAngle = angle;

    if (state.phase === 'calibrating') {
      state.calibrationSamples.push(angle);
      if (state.calibrationSamples.length >= this.calibrationFrames) {
        const reference = average(state.calibrationSamples);
        state.calibration = createSquatCalibration(reference);
        state.phase = 'up';
        state.calibrationSamples = [];
      }
      return;
    }

    const calibration = state.calibration;
    if (!calibration) {
      return;
    }

    // Гистерезис: одно приседание = переход вниз, затем возврат вверх.
    if (state.phase === 'up' && angle < calibration.downThreshold) {
      state.phase = 'down';
    } else if (state.phase === 'down' && angle > calibration.upThreshold) {
      state.phase = 'up';
      state.reps += 1;
      state.score += 1;
    }
  }

  advance(state: SquatGameState, deltaMs: number): void {
    if (state.status !== 'running') {
      return;
    }
    state.elapsedMs += deltaMs;
    if (state.elapsedMs >= state.durationMs) {
      state.elapsedMs = state.durationMs;
      state.status = 'finished';
    }
  }

  /**
   * Средний угол колена по обеим ногам.
   * Возвращает null, если ни одна нога не видна достаточно хорошо.
   */
  private averageKneeAngle(frame: PoseFrame): number | null {
    const left = this.legAngle(
      frame,
      PoseLandmark.LEFT_HIP,
      PoseLandmark.LEFT_KNEE,
      PoseLandmark.LEFT_ANKLE,
    );
    const right = this.legAngle(
      frame,
      PoseLandmark.RIGHT_HIP,
      PoseLandmark.RIGHT_KNEE,
      PoseLandmark.RIGHT_ANKLE,
    );
    if (left === null && right === null) {
      return null;
    }
    if (left === null) {
      return right;
    }
    if (right === null) {
      return left;
    }
    return (left + right) / 2;
  }

  private legAngle(
    frame: PoseFrame,
    hipIndex: number,
    kneeIndex: number,
    ankleIndex: number,
  ): number | null {
    const hip = frame.landmarks[hipIndex];
    const knee = frame.landmarks[kneeIndex];
    const ankle = frame.landmarks[ankleIndex];
    if (!isReliable(hip) || !isReliable(knee) || !isReliable(ankle)) {
      return null;
    }
    return kneeAngle(hip, knee, ankle);
  }
}

/** Среднее арифметическое массива чисел. */
export function average(values: readonly number[]): number {
  if (values.length === 0) {
    return 0;
  }
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}
