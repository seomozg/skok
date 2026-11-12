import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ErrorOverlay } from './components/ErrorOverlay';
import { GameMenu } from './components/GameMenu';
import { GameScreen } from './components/GameScreen';
import { BrowserCameraService } from './core/camera/browserCameraService';
import { describeCameraError } from './core/camera/cameraService';
import { GameLoop } from './core/engine/gameLoop';
import { MediaPipePoseDetector } from './core/pose/mediapipePoseDetector';
import type { PoseDetector } from './core/pose/poseDetector';
import { detectPlatform } from './core/platform/platform';
import { attachPoseDiagnostics } from './core/debug/poseDiagnostics';

type AppPhase = 'menu' | 'loading' | 'game';

export function App() {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const loopRef = useRef<GameLoop | null>(null);

  const cameraRef = useRef<BrowserCameraService | null>(null);
  const detectorRef = useRef<PoseDetector | null>(null);

  const [phase, setPhase] = useState<AppPhase>('menu');
  const [gameId, setGameId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fps, setFps] = useState<number | null>(null);
  const [showSkeleton, setShowSkeleton] = useState(true);

  // Платформа влияет на подсказки (ориентация, установка как PWA).
  const platform = useMemo(() => detectPlatform(), []);
  const orientationHint = platform.orientationHint();

  // Состояние активной игры публикуется из GameScreen для рендера.
  const gameStateRef = useRef<unknown>(null);

  // Создаём сервисы один раз за жизненный цикл приложения.
  if (!cameraRef.current) {
    cameraRef.current = new BrowserCameraService();
  }
  if (!detectorRef.current) {
    detectorRef.current = new MediaPipePoseDetector();
  }

  const stopEverything = useCallback(() => {
    loopRef.current?.stop();
    cameraRef.current?.stop();
    setPhase('menu');
    setGameId(null);
    setFps(null);
  }, []);

  // Остановка камеры при размонтировании / уходе со страницы.
  useEffect(() => {
    const camera = cameraRef.current;
    const handleUnload = () => camera?.stop();
    window.addEventListener('pagehide', handleUnload);
    return () => {
      window.removeEventListener('pagehide', handleUnload);
      camera?.stop();
      detectorRef.current?.close();
    };
  }, []);

  const startGame = useCallback(async (selectedGameId: string) => {
    setError(null);
    setPhase('loading');

    const video = videoRef.current;
    const camera = cameraRef.current;
    const detector = detectorRef.current;
    if (!video || !camera || !detector) {
      setError('Внутренняя ошибка инициализации.');
      setPhase('menu');
      return;
    }

    try {
      const cameraStream = await camera.start({ facingMode: 'user' });
      video.srcObject = cameraStream.stream;
      await video.play();

      await detector.initialize();

      const loop = new GameLoop(detector);
      loop.on('fps', ({ value }) => setFps(value));
      loop.on('error', ({ message }) => {
        setError(`Ошибка распознавания позы: ${message}`);
      });
      loopRef.current = loop;

      // Диагностика детекции — только по явному флагу ?debug=1.
      if (new URLSearchParams(window.location.search).has('debug')) {
        attachPoseDiagnostics(loop);
      }

      loop.start(video);

      setGameId(selectedGameId);
      setPhase('game');
    } catch (caught) {
      camera.stop();
      setError(describeCameraError(caught));
      setPhase('menu');
    }
  }, []);

  const exitToMenu = useCallback(() => {
    stopEverything();
  }, [stopEverything]);

  return (
    <main className="app">
      {/* Скрытый источник кадров: живёт всё время жизни приложения,
          чтобы поток камеры не приходилось пересоздавать. */}
      <video ref={videoRef} className="app__video" playsInline muted autoPlay />

      {phase === 'game' && gameId ? (
        <GameScreen
          key={gameId}
          gameId={gameId}
          loopRef={loopRef}
          videoRef={videoRef}
          canvasRef={canvasRef}
          gameStateRef={gameStateRef}
          fps={fps}
          showSkeleton={showSkeleton}
          onExit={exitToMenu}
        />
      ) : (
        <>
          <GameMenu onSelect={startGame} disabled={phase === 'loading'} />
          {phase === 'loading' && <p className="app__loading">Запускаем камеру и модель…</p>}
          {error && <ErrorOverlay message={error} onRetry={() => setError(null)} />}
          {orientationHint && <p className="app__hint">{orientationHint}</p>}
          <label className="app__toggle">
            <input
              type="checkbox"
              checked={showSkeleton}
              onChange={(event) => setShowSkeleton(event.target.checked)}
            />
            Показывать скелет
          </label>
        </>
      )}
    </main>
  );
}
