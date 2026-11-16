import type { DodgeGameState } from '../domain/games/dodgeGame';
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
    case 'dodge':
      drawDodgeLayer(ctx, state as DodgeGameState, width, height);
      break;
    default:
      break;
  }
  ctx.restore();
}

/**
 * Рисует «Уклонение»: падающие предметы и игрока внизу.
 */
function drawDodgeLayer(
  ctx: CanvasRenderingContext2D,
  state: DodgeGameState,
  width: number,
  height: number,
): void {
  // Полоса игрока внизу экрана.
  const playerWidth = width * 0.16;
  const playerHeight = Math.max(10, height * 0.02);
  const playerX = state.playerX * width - playerWidth / 2;
  const playerY = height * 0.94 - playerHeight;

  ctx.fillStyle = 'rgba(94, 234, 212, 0.25)';
  ctx.strokeStyle = '#5eead4';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.roundRect(playerX, playerY, playerWidth, playerHeight, playerHeight / 2);
  ctx.fill();
  ctx.stroke();

  // Падающие предметы.
  for (const object of state.objects) {
    const cx = object.x * width;
    const cy = object.y * height;
    const r = Math.max(8, width * 0.028);

    ctx.fillStyle = '#f43f5e';
    ctx.strokeStyle = '#fecdd3';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }

  // Жизни — в левом верхнем углу игрового поля.
  const lifeR = Math.max(6, width * 0.018);
  for (let i = 0; i < state.lives; i += 1) {
    ctx.fillStyle = '#f43f5e';
    ctx.beginPath();
    ctx.arc(lifeR * 1.6 + i * lifeR * 2.6, lifeR * 1.6, lifeR, 0, Math.PI * 2);
    ctx.fill();
  }

  if (state.calibrating) {
    ctx.fillStyle = '#e2e8f0';
    ctx.font = `${Math.round(height * 0.035)}px system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillText('Встаньте ровно для калибровки…', width / 2, height * 0.9);
  }
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
