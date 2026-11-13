import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ErrorOverlay } from './components/ErrorOverlay';
import { GameMenu } from './components/GameMenu';
import { GameScreen } from './components/GameScreen';
import { CameraSelector } from './components/CameraSelector';
import { BrowserCameraService } from './core/camera/browserCameraService';
import { FrameSource } from './core/camera/frameSource';
import { describeCameraError, type CameraDevice } from './core/camera/cameraService';
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
  // Источник кадров: в нём картинка поворачивается в единственном месте.
  const frameSourceRef = useRef<FrameSource | null>(null);

  const [phase, setPhase] = useState<AppPhase>('menu');
  const [gameId, setGameId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fps, setFps] = useState<number | null>(null);
  const [showSkeleton, setShowSkeleton] = useState(true);
  const [devices, setDevices] = useState<CameraDevice[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string | null>(null);

  // Платформа влияет на подсказки (ориентация, установка как PWA).
  const platform = useMemo(() => detectPlatform(), []);
  const orientationHint = platform.orientationHint();

  // Состояние активной игры публикуется из GameScreen для рендера.
  const gameStateRef = useRef<unknown>(null);

  // Последняя выбранная игра — для повторной попытки после ошибки камеры.
  const lastGameIdRef = useRef<string | null>(null);

  // Создаём сервисы один раз за жизненный цикл приложения.
  if (!cameraRef.current) {
    cameraRef.current = new BrowserCameraService();
  }
  if (!detectorRef.current) {
    detectorRef.current = new MediaPipePoseDetector();
  }
  if (!frameSourceRef.current) {
    frameSourceRef.current = new FrameSource();
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
    lastGameIdRef.current = selectedGameId;

    const video = videoRef.current;
    const camera = cameraRef.current;
    const detector = detectorRef.current;
    if (!video || !camera || !detector) {
      setError('Внутренняя ошибка инициализации.');
      setPhase('menu');
      return;
    }

    try {
      // Перед повторным запуском освобождаем предыдущий поток:
      // иначе камера остаётся занятой самой собой (NotReadableError).
      camera.stop();
      loopRef.current?.stop();

      const cameraStream = await camera.start(
        selectedDeviceId
          ? { deviceId: selectedDeviceId }
          : { facingMode: 'user' },
      );
      video.srcObject = cameraStream.stream;
      await video.play();

      // После первого успешного запуска браузер раскрывает список камер —
      // теперь пользователь может выбрать другое устройство.
      const available = await camera.listDevices();
      setDevices(available);
      const activeTrack = cameraStream.stream.getVideoTracks()[0];
      const activeDeviceId = activeTrack?.getSettings().deviceId ?? null;
      setSelectedDeviceId(activeDeviceId);

      await detector.initialize();

      const frameSource = frameSourceRef.current;
      if (!frameSource) {
        setError('Внутренняя ошибка инициализации.');
        setPhase('menu');
        return;
      }

      const loop = new GameLoop(detector, { frameSource });
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
  }, [selectedDeviceId]);

  /** Повторная попытка: заново открывает камеру и запускает выбранную игру. */
  const retry = useCallback(() => {
    if (lastGameIdRef.current) {
      void startGame(lastGameIdRef.current);
    } else {
      setError(null);
    }
  }, [startGame]);

  /** Переключение камеры: освобождаем текущую и открываем выбранную. */
  const selectDevice = useCallback(
    async (deviceId: string) => {
      setSelectedDeviceId(deviceId);
      if (lastGameIdRef.current) {
        await startGame(lastGameIdRef.current);
      }
    },
    [startGame],
  );

  const exitToMenu = useCallback(() => {
    stopEverything();
  }, [stopEverything]);

  return (
    <main className="app">
      {/* Скрытый источник кадров: живёт всё время жизни приложения,
          чтобы поток камеры не приходилось пересоздавать. */}
      <video ref={videoRef} className="app__video" playsInline muted autoPlay />

      {phase === 'game' && gameId ? (
        <>
          <GameScreen
            key={gameId}
            gameId={gameId}
            loopRef={loopRef}
            canvasRef={canvasRef}
            frameSourceRef={frameSourceRef}
            gameStateRef={gameStateRef}
            fps={fps}
            showSkeleton={showSkeleton}
            onExit={exitToMenu}
          />
          <CameraSelector
            devices={devices}
            selectedDeviceId={selectedDeviceId}
            onSelect={(deviceId) => void selectDevice(deviceId)}
          />
        </>
      ) : (
        <>
          <GameMenu onSelect={startGame} disabled={phase === 'loading'} />
          {phase === 'loading' && <p className="app__loading">Запускаем камеру и модель…</p>}
          {error && <ErrorOverlay message={error} onRetry={retry} />}
          <CameraSelector
            devices={devices}
            selectedDeviceId={selectedDeviceId}
            onSelect={(deviceId) => void selectDevice(deviceId)}
            disabled={phase === 'loading'}
          />
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
