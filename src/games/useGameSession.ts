import { useCallback, useEffect, useRef, useState } from 'react';
import type { GameLoop } from '../core/engine/gameLoop';
import type { BaseGameState, GameModule } from '../domain/games/gameModule';
import type { PoseFrame } from '../domain/pose/poseTypes';

export interface GameSession<TState extends BaseGameState = BaseGameState> {
  state: TState;
  /** Запустить раунд (сбрасывает состояние). */
  start(): void;
  /** Завершить раунд досрочно. */
  stop(): void;
}

/**
 * Связывает модуль игры с игровым циклом: подписка на позы, таймер, обновление React-состояния.
 *
 * React-обёртка над чистой игровой логикой: сама логика не знает о React.
 */
export function useGameSession<TState extends BaseGameState>(
  game: GameModule<TState>,
  loopRef: React.MutableRefObject<GameLoop | null>,
): GameSession<TState> {
  const stateRef = useRef<TState>(game.createState());
  const [state, setState] = useState<TState>(stateRef.current);
  const lastTickRef = useRef<number>(0);

  // Подписка на кадры с позой.
  useEffect(() => {
    const loop = loopRef.current;
    if (!loop) {
      return;
    }
    const unsubscribe = loop.on('pose', (frame: PoseFrame) => {
      game.applyFrame(stateRef.current, frame);
    });
    return unsubscribe;
  }, [game, loopRef]);

  // Таймер игры: отдельный rAF, независимый от детекции.
  useEffect(() => {
    let rafId = 0;
    let previous = performance.now();

    const tick = (now: number) => {
      const delta = Math.min(now - previous, 250);
      previous = now;
      game.advance(stateRef.current, delta);
      setState({ ...stateRef.current });
      rafId = requestAnimationFrame(tick);
    };

    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [game]);

  const start = useCallback(() => {
    const fresh = game.createState();
    if ('start' in game && typeof game.start === 'function') {
      (game as unknown as { start(state: TState): void }).start(fresh);
    }
    stateRef.current = fresh;
    lastTickRef.current = performance.now();
    setState({ ...fresh });
  }, [game]);

  const stop = useCallback(() => {
    stateRef.current.status = 'finished';
    setState({ ...stateRef.current });
  }, []);

  return { state, start, stop };
}
