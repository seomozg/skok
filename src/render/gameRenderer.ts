import type { ReactionGameState } from '../domain/games/reactionGame';
import type { SquatGameState } from '../domain/games/squatGame';

/**
 * Рисует игровые объекты поверх видео.
 *
 * Рендер ничего не вычисляет из позы — он берёт готовое состояние игры.
 */
export function drawGameLayer(
  ctx: CanvasRenderingContext2D,
  gameId: string,
  state: unknown,
  width: number,
  height: number,
): void {
  ctx.save();
  switch (gameId) {
    case 'reaction':
      drawReactionLayer(ctx, state as ReactionGameState, width, height);
      break;
    case 'squat':
      drawSquatLayer(ctx, state as SquatGameState, width, height);
      break;
    default:
      break;
  }
  ctx.restore();
}

function drawReactionLayer(
  ctx: CanvasRenderingContext2D,
  state: ReactionGameState,
  width: number,
  height: number,
): void {
  const target = state.target;
  if (!target) {
    return;
  }
  const cx = target.x * width;
  const cy = target.y * height;
  const r = target.radius * Math.min(width, height);

  ctx.fillStyle = 'rgba(244, 63, 94, 0.35)';
  ctx.strokeStyle = '#f43f5e';
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = '#fecdd3';
  ctx.beginPath();
  ctx.arc(cx, cy, r * 0.25, 0, Math.PI * 2);
  ctx.fill();
}

function drawSquatLayer(
  ctx: CanvasRenderingContext2D,
  state: SquatGameState,
  height: number,
  width: number,
): void {
  const barHeight = Math.max(14, Math.round(height * 0.03));
  const barWidth = width * 0.6;
  const x = (width - barWidth) / 2;
  const y = height - barHeight * 2.5;

  ctx.fillStyle = 'rgba(15, 23, 42, 0.65)';
  ctx.fillRect(x, y, barWidth, barHeight);

  const calibration = state.calibration;
  const progress = calibration
    ? Math.max(0, Math.min(1, (calibration.upThreshold - state.currentAngle) / Math.max(1, calibration.upThreshold - calibration.downThreshold)))
    : 0;

  ctx.fillStyle = state.phase === 'down' ? '#fbbf24' : '#34d399';
  ctx.fillRect(x, y, barWidth * progress, barHeight);

  if (state.phase === 'calibrating') {
    ctx.fillStyle = '#e2e8f0';
    ctx.font = `${Math.round(height * 0.035)}px system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillText('Встаньте ровно для калибровки…', width / 2, y - barHeight);
  }
}
