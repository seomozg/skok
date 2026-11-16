import { useEffect, useRef, type MutableRefObject } from 'react';
import type { PoseFrame } from '../domain/pose/poseTypes';
import type { FrameSource } from '../core/camera/frameSource';
import { drawSkeleton } from './skeletonRenderer';
import { drawGameLayer } from './gameRenderer';
import {
  createCatAnimation,
  drawCat,
  hitProgress,
  triggerCatHit,
  updateCatAnimation,
} from './catRenderer';

export interface RenderStageOptions {
  canvasRef: MutableRefObject<HTMLCanvasElement | null>;
  /**
   * Источник кадров.
   *
   * Рендер рисует ровно тот канвас, который видел детектор, поэтому
   * скелет всегда совпадает с картинкой. Угол поворота применён один
   * раз — в источнике кадров.
   */
  frameSourceRef: MutableRefObject<FrameSource | null>;
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
    frameSourceRef,
    frameRef,
    gameIdRef,
    gameStateRef,
    showSkeleton,
  } = options;

  // Последний известный счёт — по нему определяется момент удара кота.
  const lastScoreRef = useRef(0);

  useEffect(() => {
    let rafId = 0;

    // Анимация кота живёт отдельно от React: она идёт по времени, а не
    // по кадрам, поэтому не зависит от FPS.
    const cat = createCatAnimation();

    const draw = () => {
      const canvas = canvasRef.current;
      const frameSource = frameSourceRef.current;
      if (canvas && frameSource) {
        const ctx = canvas.getContext('2d');
        if (ctx) {
          const { width, height } = canvas;
          ctx.clearRect(0, 0, width, height);

          // Видео отражается по X — «как в зеркале».
          ctx.save();
          ctx.translate(width, 0);
          ctx.scale(-1, 1);
          ctx.drawImage(frameSource.element, 0, 0, width, height);
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
            // Кот — только в «Приседаниях», и только когда игрок встал
            // из приседа: рост счёта означает завершённое приседание.
            if (gameId === 'squat') {
              drawCatForSquat(
                ctx,
                gameStateRef.current,
                cat,
                lastScoreRef,
                width,
                height,
              );
            }
          }
        }
      }
      rafId = requestAnimationFrame(draw);
    };

    rafId = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(rafId);
  }, [canvasRef, frameSourceRef, frameRef, gameIdRef, gameStateRef, showSkeleton]);
}

/**
 * Рисует кота в правом верхнем углу и запускает удар, когда засчитано
 * приседание.
 */
function drawCatForSquat(
  ctx: CanvasRenderingContext2D,
  gameState: unknown,
  cat: ReturnType<typeof createCatAnimation>,
  lastScoreRef: { current: number },
  width: number,
  height: number,
): void {
  const state = gameState as { score?: number } | undefined;
  const score = state?.score ?? 0;
  const now = performance.now();

  if (score > lastScoreRef.current) {
    // Игрок встал — кот бьёт лапой.
    triggerCatHit(cat, now);
  }
  lastScoreRef.current = score;

  const phase = updateCatAnimation(cat, now);

  // Кот живёт в правом верхнем углу и не зависит от положения игрока.
  const size = Math.max(96, Math.min(width, height) * 0.34);
  const margin = size * 0.42;

  drawCat(ctx, {
    x: width - margin,
    // Смещаем вниз, чтобы кот не перекрывал таймер в HUD.
    y: margin + size * 0.55,
    size,
    phase,
    progress: hitProgress(cat, now),
  });
}
