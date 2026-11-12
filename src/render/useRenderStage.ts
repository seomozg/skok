import { useEffect, type MutableRefObject } from 'react';
import type { PoseFrame } from '../domain/pose/poseTypes';
import { drawSkeleton } from './skeletonRenderer';
import { drawGameLayer } from './gameRenderer';

export interface RenderStageOptions {
  canvasRef: MutableRefObject<HTMLCanvasElement | null>;
  videoRef: MutableRefObject<HTMLVideoElement | null>;
  /** Последний кадр с позой (в «зеркальной» системе координат). */
  frameRef: MutableRefObject<PoseFrame | null>;
  /** Идентификатор активной игры для отрисовки игрового слоя. */
  gameIdRef: MutableRefObject<string | null>;
  /** Состояние активной игры. */
  gameStateRef: MutableRefObject<unknown>;
  showSkeleton: boolean;
}

/**
 * Единая точка отрисовки на canvas: видео (зеркально) → скелет → игровые объекты.
 *
 * Отдельный rAF, независимый от игрового цикла: рендер никогда не блокирует
 * детекцию позы.
 */
export function useRenderStage(options: RenderStageOptions): void {
  const {
    canvasRef,
    videoRef,
    frameRef,
    gameIdRef,
    gameStateRef,
    showSkeleton,
  } = options;

  useEffect(() => {
    let rafId = 0;

    const draw = () => {
      const canvas = canvasRef.current;
      const video = videoRef.current;
      if (canvas && video) {
        const ctx = canvas.getContext('2d');
        if (ctx) {
          const { width, height } = canvas;
          ctx.clearRect(0, 0, width, height);

          // Видео отражается по X — «как в зеркале».
          ctx.save();
          ctx.translate(width, 0);
          ctx.scale(-1, 1);
          ctx.drawImage(video, 0, 0, width, height);
          ctx.restore();

          const frame = frameRef.current;
          if (frame && !frame.empty) {
            if (showSkeleton) {
              drawSkeleton(ctx, frame, width, height);
            }
            const gameId = gameIdRef.current;
            if (gameId) {
              drawGameLayer(ctx, gameId, gameStateRef.current, width, height);
            }
          }
        }
      }
      rafId = requestAnimationFrame(draw);
    };

    rafId = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(rafId);
  }, [canvasRef, videoRef, frameRef, gameIdRef, gameStateRef, showSkeleton]);
}
