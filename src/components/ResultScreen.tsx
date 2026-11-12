export interface ResultScreenProps {
  gameTitle: string;
  score: number;
  onRestart: () => void;
  onMenu: () => void;
}

/** Экран результатов после окончания раунда. */
export function ResultScreen({ gameTitle, score, onRestart, onMenu }: ResultScreenProps) {
  return (
    <div className="result">
      <h2 className="result__title">Раунд завершён</h2>
      <p className="result__game">{gameTitle}</p>
      <p className="result__score">Счёт: {score}</p>
      <div className="result__actions">
        <button type="button" className="button" onClick={onRestart}>
          Ещё раз
        </button>
        <button type="button" className="button button--ghost" onClick={onMenu}>
          В меню
        </button>
      </div>
    </div>
  );
}
