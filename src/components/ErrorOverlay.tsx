export interface ErrorOverlayProps {
  message: string;
  onRetry?: () => void;
}

/** Понятное сообщение об ошибке (камера, модель и т.п.). */
export function ErrorOverlay({ message, onRetry }: ErrorOverlayProps) {
  return (
    <div className="error" role="alert">
      <p className="error__message">{message}</p>
      {onRetry && (
        <button type="button" className="button" onClick={onRetry}>
          Попробовать снова
        </button>
      )}
    </div>
  );
}
