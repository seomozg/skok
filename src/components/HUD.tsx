export interface HUDProps {
  title: string;
  score: number;
  timeLeftMs: number;
  fps: number | null;
  onStop: () => void;
  /** Дополнительная подсказка (например, фаза калибровки). */
  hint?: string | null;
  /** Ручной поворот картинки — запасной вариант, если ориентация определена неверно. */
  onRotate?: () => void;
}

/** Счёт, таймер, FPS и кнопка остановки. */
export function HUD({
  title,
  score,
  timeLeftMs,
  fps,
  onStop,
  hint,
  onRotate,
}: HUDProps) {
  const seconds = Math.max(0, Math.ceil(timeLeftMs / 1000));
  return (
    <header className="hud">
      <div className="hud__row">
        <span className="hud__title">{title}</span>
        {fps !== null && <span className="hud__fps">{fps} FPS</span>}
      </div>
      <div className="hud__row hud__row--main">
        <span className="hud__score" aria-label="Счёт">
          {score}
        </span>
        <span className="hud__timer" aria-label="Оставшееся время">
          {seconds} с
        </span>
      </div>
      {hint && <p className="hud__hint">{hint}</p>}
      <div className="hud__row hud__row--actions">
        {onRotate && (
          <button type="button" className="button button--ghost button--rotate" onClick={onRotate}>
            Повернуть
          </button>
        )}
        <button type="button" className="button button--ghost button--stop" onClick={onStop}>
          Стоп
        </button>
      </div>
    </header>
  );
}
