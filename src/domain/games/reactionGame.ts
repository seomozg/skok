import { PoseLandmark, isReliable } from '../pose/landmarks';
import type { PoseFrame } from '../pose/poseTypes';
import type { BaseGameState, GameModule } from './gameModule';

export interface Target {
  id: number;
  /** Нормализованные координаты 0..1 (в системе «зеркального» вида). */
  x: number;
  y: number;
  /** Радиус в нормализованных единицах. */
  radius: number;
}

export interface ReactionGameState extends BaseGameState {
  target: Target | null;
  nextTargetId: number;
  /** Момент появления текущей мишени (ms). */
  targetSpawnedAt: number;
  /** Всего поражено мишеней — для статистики. */
  hits: number;
}

export interface ReactionGameOptions {
  durationMs?: number;
  targetRadius?: number;
  /** Генератор псевдослучайных чисел (для детерминированных тестов). */
  random?: () => number;
}

const DEFAULT_DURATION_MS = 30_000;
const DEFAULT_RADIUS = 0.07;

/** Границы безопасной зоны, чтобы мишень не уходила под HUD. */
const MARGIN = 0.12;

/**
 * Игра «Reaction»: попадай кистью в появляющиеся мишени.
 *
 * Попадание засчитывается, когда любая из кистей (левый или правый запястье)
 * оказывается внутри круга мишени.
 */
export class ReactionGame implements GameModule<ReactionGameState> {
  readonly id = 'reaction';
  readonly title = 'СпайдерМэн';
  readonly description = 'Попадай кистью в мишень как можно быстрее';

  private readonly durationMs: number;
  private readonly radius: number;
  private readonly random: () => number;

  constructor(options: ReactionGameOptions = {}) {
    this.durationMs = options.durationMs ?? DEFAULT_DURATION_MS;
    this.radius = options.targetRadius ?? DEFAULT_RADIUS;
    this.random = options.random ?? Math.random;
  }

  createState(): ReactionGameState {
    return {
      score: 0,
      durationMs: this.durationMs,
      elapsedMs: 0,
      status: 'idle',
      target: null,
      nextTargetId: 1,
      targetSpawnedAt: 0,
      hits: 0,
    };
  }

  applyFrame(state: ReactionGameState, frame: PoseFrame): void {
    if (state.status !== 'running' || !state.target || frame.empty) {
      return;
    }
    const wrists = [
      frame.landmarks[PoseLandmark.LEFT_WRIST],
      frame.landmarks[PoseLandmark.RIGHT_WRIST],
    ];
    const hit = wrists.some((wrist) => isReliable(wrist) && isInside(wrist, state.target!));
    if (!hit) {
      return;
    }
    state.score += 1;
    state.hits += 1;
    state.target = this.spawnTarget(state);
    state.targetSpawnedAt = frame.timestamp;
  }

  advance(state: ReactionGameState, deltaMs: number): void {
    if (state.status !== 'running') {
      return;
    }
    state.elapsedMs += deltaMs;
    if (state.elapsedMs >= state.durationMs) {
      state.elapsedMs = state.durationMs;
      state.status = 'finished';
      state.target = null;
      return;
    }
    // Первая мишень появляется в начале раунда.
    if (!state.target) {
      state.target = this.spawnTarget(state);
      state.targetSpawnedAt = state.elapsedMs;
    }
  }

  /** Стартует раунд: счёт обнуляется, появляется первая мишень. */
  start(state: ReactionGameState): void {
    state.status = 'running';
    state.elapsedMs = 0;
    state.score = 0;
    state.hits = 0;
    state.target = this.spawnTarget(state);
    state.targetSpawnedAt = 0;
  }

  private spawnTarget(state: ReactionGameState): Target {
    const id = state.nextTargetId;
    state.nextTargetId += 1;
    return {
      id,
      x: MARGIN + this.random() * (1 - 2 * MARGIN),
      y: MARGIN + this.random() * (1 - 2 * MARGIN),
      radius: this.radius,
    };
  }
}

/** Проверка попадания точки в круг (в нормализованных координатах). */
export function isInside(point: { x: number; y: number }, target: Target): boolean {
  return Math.hypot(point.x - target.x, point.y - target.y) <= target.radius;
}
