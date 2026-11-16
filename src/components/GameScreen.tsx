import { useCallback, useEffect, useMemo, useRef } from 'react';
import { HUD } from './HUD';
import { CameraStage } from './CameraStage';
import { ResultScreen } from './ResultScreen';
import type { GameLoop } from '../core/engine/gameLoop';
import type { FrameSource } from '../core/camera/frameSource';
import { findGameById, NOOP_GAME } from '../games';
import { useGameSession } from '../games/useGameSession';
import { useRenderStage } from '../render/useRenderStage';
import type { PoseFrame } from '../domain/pose/poseTypes';

export interface GameScreenProps {
  gameId: string;
  loopRef: React.MutableRefObject<GameLoop | null>;
  canvasRef: React.MutableRefObject<HTMLCanvasElement | null>;
  /** Источник кадров: повёрнутая картинка, которую видят детектор и рендер. */
  frameSourceRef: React.MutableRefObject<FrameSource | null>;
  /** Публикуется наружу, чтобы App мог рисовать игровой слой. */
  gameStateRef: React.MutableRefObject<unknown>;
  fps: number | null;
  showSkeleton: boolean;
  onExit: () => void;
}

/**
 * Экран активной игры: HUD, сцена и игровой слой.
 *
 * Знание о конкретной игре скрыто здесь — App знает только идентификатор.
 */
export function GameScreen({
  gameId,
  loopRef,
  canvasRef,
  frameSourceRef,
  gameStateRef,
  fps,
  showSkeleton,
  onExit,
}: GameScreenProps) {
  const game = useMemo(() => findGameById(gameId) ?? NOOP_GAME, [gameId]);
  const session = useGameSession(game, loopRef);
  const { start } = session;

  const frameRef = useRef<PoseFrame | null>(null);
  const gameIdRef = useRef<string | null>(gameId);

  gameIdRef.current = gameId;
  gameStateRef.current = session.state;

  // Запуск раунда при появлении экрана.
  useEffect(() => {
    start();
  }, [start]);

  // Синхронизируем последний кадр из игрового цикла.
  useEffect(() => {
    const loop = loopRef.current;
    if (!loop) {
      return;
    }
    return loop.on('pose', (frame: PoseFrame) => {
      frameRef.current = frame;
    });
  }, [loopRef]);

  useRenderStage({
    canvasRef,
    frameSourceRef,
    frameRef,
    gameIdRef,
    gameStateRef,
    showSkeleton,
  });

  if (!game) {
    return null;
  }

  const timeLeftMs = Math.max(0, session.state.durationMs - session.state.elapsedMs);
  const hint =
    gameId === 'squat' &&
    (session.state as { phase?: string }).phase === 'calibrating'
      ? 'Встаньте ровно — идёт калибровка'
      : gameId === 'dodge' &&
          (session.state as { calibrating?: boolean }).calibrating
        ? 'Встаньте ровно — идёт калибровка'
        : null;

  /** Ручной поворот картинки: запасной вариант к автоопределению ориентации. */
  const rotate = useCallback(() => {
    void loopRef.current?.rotateBy(90);
  }, [loopRef]);

  if (session.state.status === 'finished') {
    return (
      <ResultScreen
        gameTitle={game.title}
        score={session.state.score}
        onRestart={start}
        onMenu={onExit}
      />
    );
  }

  return (
    <div className="game-screen">
      <CameraStage canvasRef={canvasRef} active />
      <HUD
        title={game.title}
        score={session.state.score}
        timeLeftMs={timeLeftMs}
        fps={fps}
        hint={hint}
        onRotate={rotate}
        onStop={onExit}
      />
    </div>
  );
}
