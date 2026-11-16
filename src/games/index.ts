import type { GameModule } from '../domain/games/gameModule';
import { DonutGame } from '../domain/games/donutGame';
import { ReactionGame } from '../domain/games/reactionGame';
import { SquatGame } from '../domain/games/squatGame';

/**
 * Заглушка на случай неизвестного идентификатора игры.
 * Позволяет вызывать хуки безусловно (правила React).
 */
export const NOOP_GAME: GameModule<any> = {
  id: 'noop',
  title: 'Нет игры',
  description: '',
  createState: () => ({ score: 0, durationMs: 0, elapsedMs: 0, status: 'idle' }),
  applyFrame: () => undefined,
  advance: () => undefined,
};

/**
 * Реестр мини-игр.
 *
 * Чтобы добавить новую игру, достаточно реализовать GameModule
 * и зарегистрировать её здесь — движок и UI не меняются (Open/Closed).
 */
export const GAME_MODULES: ReadonlyArray<GameModule<any>> = [
  new ReactionGame(),
  new SquatGame(),
  new DonutGame(),
];

/** Находит игру по идентификатору. */
export function findGameById(id: string): GameModule<any> | undefined {
  return GAME_MODULES.find((game) => game.id === id);
}
