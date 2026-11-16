/**
 * Кот-мотиватор для игры «Приседания».
 *
 * Кот сидит на голове игрока и бьёт лапой в тот момент, когда игрок
 * встаёт из приседа. Это чисто декоративный элемент: на счёт, пороги и
 * фазы он никак не влияет.
 *
 * Кот рисуется примитивами canvas, а не картинкой: так он масштабируется
 * под любой экран, не требует файла в APK и бьёт точно в момент,
 * когда засчитано приседание.
 */

export type CatPhase = 'idle' | 'hit' | 'recover';

export interface CatAnimation {
  phase: CatPhase;
  /** Момент начала текущей фазы (performance.now). */
  startedAt: number;
}

/** Длительность удара лапой, мс. */
export const CAT_HIT_DURATION = 700;

/** Длительность отскока после удара, мс. */
export const CAT_RECOVER_DURATION = 400;

/** Создаёт состояние анимации кота. */
export function createCatAnimation(): CatAnimation {
  return { phase: 'idle', startedAt: 0 };
}

/** Запускает удар лапой. */
export function triggerCatHit(animation: CatAnimation, now: number): void {
  animation.phase = 'hit';
  animation.startedAt = now;
}

/**
 * Переводит анимацию в следующую фазу по прошедшему времени.
 *
 * @returns текущая фаза.
 */
export function updateCatAnimation(
  animation: CatAnimation,
  now: number,
): CatPhase {
  const elapsed = now - animation.startedAt;
  if (animation.phase === 'hit' && elapsed >= CAT_HIT_DURATION) {
    animation.phase = 'recover';
    animation.startedAt = now;
  } else if (animation.phase === 'recover' && elapsed >= CAT_RECOVER_DURATION) {
    animation.phase = 'idle';
    animation.startedAt = now;
  }
  return animation.phase;
}

/**
 * Прогресс удара: 0 — бита поднята, 1 — бита внизу.
 *
 * В фазе отскока бита возвращается наверх: прогресс убывает.
 */
export function hitProgress(animation: CatAnimation, now: number): number {
  if (animation.phase === 'hit') {
    const t = (now - animation.startedAt) / CAT_HIT_DURATION;
    // Быстрый удар вниз и чуть более медленный возврат.
    return t < 0.45 ? t / 0.45 : 1 - (t - 0.45) / 0.55;
  }
  if (animation.phase === 'recover') {
    const t = (now - animation.startedAt) / CAT_RECOVER_DURATION;
    return 1 - Math.min(1, t);
  }
  return 0;
}

export interface CatDrawOptions {
  /** Позиция кота в пикселях (центр головы кота). */
  x: number;
  y: number;
  /** Размер кота в пикселях (ширина тела). */
  size: number;
  /** Текущая фаза анимации. */
  phase: CatPhase;
  /** Прогресс удара 0..1. */
  progress: number;
}


const FUR = '#fbbf24';
const FUR_DARK = '#d97706';
const EAR_INNER = '#fde68a';
const BAT = '#d6a15f';
const BAT_DARK = '#8b5a2b';

/**
 * Рисует кота в указанной позиции.
 */
export function drawCat(
  ctx: CanvasRenderingContext2D,
  options: CatDrawOptions,
): void {
  const { x, y, size, phase, progress } = options;
  const half = size / 2;

  ctx.save();
  ctx.lineCap = 'round';

  // Дыхание в покое: тело чуть подпрыгивает.
  const breathe = phase === 'idle' ? Math.sin(Date.now() / 320) * size * 0.02 : 0;
  // При отскоке кот слегка отскакивает вверх.
  const recoil = phase === 'recover' ? -size * 0.06 : 0;

  const bodyY = y + half * 0.35 + breathe + recoil;
  const headY = bodyY - half * 0.62;

  // --- Хвост ---
  ctx.strokeStyle = FUR_DARK;
  ctx.lineWidth = Math.max(2, size * 0.09);
  ctx.beginPath();
  ctx.moveTo(x + half * 0.55, bodyY + half * 0.25);
  ctx.quadraticCurveTo(
    x + half * 1.15,
    bodyY + half * 0.05,
    x + half * 0.95,
    bodyY - half * 0.45,
  );
  ctx.stroke();

  // --- Тело ---
  ctx.fillStyle = FUR;
  ctx.beginPath();
  ctx.ellipse(x, bodyY, half * 0.62, half * 0.5, 0, 0, Math.PI * 2);
  ctx.fill();

  // --- Передние лапы ---
  ctx.strokeStyle = FUR;
  ctx.lineWidth = Math.max(2, size * 0.13);
  ctx.beginPath();
  ctx.moveTo(x - half * 0.22, bodyY + half * 0.12);
  ctx.lineTo(x - half * 0.3, bodyY + half * 0.45);
  ctx.moveTo(x + half * 0.22, bodyY + half * 0.12);
  ctx.lineTo(x + half * 0.3, bodyY + half * 0.45);
  ctx.stroke();

  // --- Голова ---
  ctx.fillStyle = FUR;
  ctx.beginPath();
  ctx.arc(x, headY, half * 0.44, 0, Math.PI * 2);
  ctx.fill();

  // --- Уши ---
  ctx.fillStyle = FUR;
  for (const side of [-1, 1]) {
    const earX = x + side * half * 0.28;
    ctx.beginPath();
    ctx.moveTo(earX - half * 0.12, headY - half * 0.26);
    ctx.lineTo(earX, headY - half * 0.62);
    ctx.lineTo(earX + half * 0.12, headY - half * 0.26);
    ctx.closePath();
    ctx.fill();
  }

  // Внутренняя часть ушей.
  ctx.fillStyle = EAR_INNER;
  for (const side of [-1, 1]) {
    const earX = x + side * half * 0.28;
    ctx.beginPath();
    ctx.moveTo(earX - half * 0.05, headY - half * 0.3);
    ctx.lineTo(earX, headY - half * 0.48);
    ctx.lineTo(earX + half * 0.05, headY - half * 0.3);
    ctx.closePath();
    ctx.fill();
  }

  // --- Глаза ---
  if (phase === 'hit') {
    // При ударе глаза прищурены.
    ctx.strokeStyle = '#1f2937';
    ctx.lineWidth = Math.max(1.5, size * 0.05);
    for (const side of [-1, 1]) {
      const eyeX = x + side * half * 0.17;
      ctx.beginPath();
      ctx.moveTo(eyeX - half * 0.08, headY);
      ctx.lineTo(eyeX + half * 0.08, headY);
      ctx.stroke();
    }
  } else {
    ctx.fillStyle = '#1f2937';
    for (const side of [-1, 1]) {
      ctx.beginPath();
      ctx.arc(x + side * half * 0.17, headY, half * 0.07, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // --- Нос ---
  ctx.fillStyle = '#fda4af';
  ctx.beginPath();
  ctx.moveTo(x, headY + half * 0.1);
  ctx.lineTo(x - half * 0.05, headY + half * 0.16);
  ctx.lineTo(x + half * 0.05, headY + half * 0.16);
  ctx.closePath();
  ctx.fill();

  // --- Усы ---
  ctx.strokeStyle = 'rgba(255,255,255,0.75)';
  ctx.lineWidth = Math.max(1, size * 0.02);
  for (const side of [-1, 1]) {
    for (let i = 0; i < 2; i += 1) {
      ctx.beginPath();
      ctx.moveTo(x + side * half * 0.08, headY + half * 0.14);
      ctx.lineTo(x + side * half * 0.42, headY + half * (0.06 + i * 0.12));
      ctx.stroke();
    }
  }

  // --- Бита в лапе ---
  // Кот держит биту в лапе, и мы видим её сбоку — поэтому бита
  // горизонтальная. При ударе кот опускает её сверху вниз.
  const shoulderX = x - half * 0.45;
  const shoulderY = bodyY - half * 0.28;
  const gripX = shoulderX - half * 0.02;
  // Бита поднята над головой и опускается до уровня тела — ход должен
  // быть заметным.
  const raisedY = headY - half * 0.5;
  const loweredY = bodyY + half * 0.75;
  const gripY = raisedY + (loweredY - raisedY) * progress;

  // Бита: горизонтальная палка, которую лапа держит за правый конец.
  const batLength = half * 1.15;
  const batThickness = Math.max(6, size * 0.09);
  const batX = gripX - batLength;

  // След от биты — показывает направление удара.
  if (phase === 'hit' && progress > 0.05 && progress < 0.95) {
    ctx.strokeStyle = 'rgba(146, 64, 14, 0.3)';
    ctx.lineWidth = batThickness;
    ctx.beginPath();
    ctx.moveTo(batX, raisedY);
    ctx.lineTo(batX, loweredY);
    ctx.stroke();
  }

  // Лапа держит биту.
  ctx.strokeStyle = FUR;
  ctx.lineWidth = Math.max(3, size * 0.16);
  ctx.beginPath();
  ctx.moveTo(shoulderX, shoulderY);
  ctx.lineTo(gripX, gripY);
  ctx.stroke();

  // Сама бита.
  ctx.fillStyle = BAT;
  ctx.strokeStyle = BAT_DARK;
  ctx.lineWidth = Math.max(1.5, size * 0.02);
  ctx.beginPath();
  ctx.roundRect(
    batX,
    gripY - batThickness / 2,
    batLength,
    batThickness,
    batThickness / 2,
  );
  ctx.fill();
  ctx.stroke();

  // В момент удара — «звёздочки» у биты: удар должен читаться.
  if (phase === 'hit' && progress > 0.8) {
    const starAlpha = Math.min(1, (progress - 0.8) / 0.2);
    ctx.strokeStyle = `rgba(253, 230, 138, ${starAlpha})`;
    ctx.lineWidth = Math.max(2, size * 0.045);
    for (let i = 0; i < 7; i += 1) {
      const angle = (i / 7) * Math.PI * 2 + progress * 2;
      const r1 = half * 0.3;
      const r2 = half * 0.5;
      ctx.beginPath();
      ctx.moveTo(gripX + Math.cos(angle) * r1, gripY + Math.sin(angle) * r1);
      ctx.lineTo(gripX + Math.cos(angle) * r2, gripY + Math.sin(angle) * r2);
      ctx.stroke();
    }
  }

  ctx.restore();
}
