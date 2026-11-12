import { useEffect, useRef } from 'react';

export interface CameraStageProps {
  canvasRef: React.MutableRefObject<HTMLCanvasElement | null>;
  /** true, когда поток камеры активен. */
  active: boolean;
  /** Сообщение-подсказка поверх сцены. */
  overlay?: string | null;
}
/**
 * Сцена: видимый <canvas> (вывод) поверх скрытого <video> (источник кадров).
 *
 * Сам <video> живёт в App и существует всегда — иначе поток камеры
 * пришлось бы пересоздавать при каждом переходе между экранами.
 */
export function CameraStage({ canvasRef, active, overlay }: CameraStageProps) {
  const wrapperRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const wrapper = wrapperRef.current;
    const canvas = canvasRef.current;
    if (!wrapper || !canvas) {
      return;
    }
    const resize = () => {
      const rect = wrapper.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.max(1, Math.round(rect.width * dpr));
      canvas.height = Math.max(1, Math.round(rect.height * dpr));
      canvas.style.width = `${rect.width}px`;
      canvas.style.height = `${rect.height}px`;
    };
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(wrapper);
    return () => observer.disconnect();
  }, [canvasRef]);

  return (
    <div className="stage" ref={wrapperRef}>
      <canvas ref={canvasRef} className="stage__canvas" />
      {!active && <div className="stage__overlay">{overlay ?? 'Камера выключена'}</div>}
    </div>
  );
}
