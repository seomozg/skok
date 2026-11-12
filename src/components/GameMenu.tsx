import { GAME_MODULES } from '../games';

export interface GameMenuProps {
  onSelect: (gameId: string) => void;
  disabled?: boolean;
}

/** Экран выбора мини-игры. */
export function GameMenu({ onSelect, disabled = false }: GameMenuProps) {
  return (
    <div className="menu">
      <h1 className="menu__title">Skok</h1>
      <p className="menu__subtitle">Выберите игру и включите камеру</p>
      <ul className="menu__list">
        {GAME_MODULES.map((game) => (
          <li key={game.id}>
            <button
              type="button"
              className="button button--game"
              disabled={disabled}
              onClick={() => onSelect(game.id)}
            >
              <span className="button__title">{game.title}</span>
              <span className="button__description">{game.description}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
