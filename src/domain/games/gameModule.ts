import type { PoseFrame } from '../pose/poseTypes';

/** Статус игровой сессии. */
export type GameStatus = 'idle' | 'running' | 'finished';

/** Общее состояние любой мини-игры. */
export interface BaseGameState {
  score: number;
  /** Длительность раунда в миллисекундах. */
  durationMs: number;
  /** Прошедшее время раунда. */
  elapsedMs: number;
  status: GameStatus;
}

/**
 * Модуль мини-игры.
 *
 * Содержит только игровую логику: не знает о canvas, React и камере.
 * Благодаря этому логика тестируется обычными юнит-тестами.
 */
export interface GameModule<TState extends BaseGameState = BaseGameState> {
  readonly id: string;
  readonly title: string;
  readonly description: string;
  /** Создаёт начальное состояние раунда. */
  createState(): TState;
  /** Обрабатывает очередной кадр с позой (может менять счёт). */
  applyFrame(state: TState, frame: PoseFrame): void;
  /** Продвигает таймер. */
  advance(state: TState, deltaMs: number): void;
  /** Начинает раунд: сбрасывает счёт и переводит игру в рабочее состояние. */
  start?(state: TState): void;
  /** true, если игра готова к запуску (например, нужна калибровка). */
  isReady?(state: TState): boolean;
}
