import type { PoseFrame } from '../../domain/pose/poseTypes';
import { kneeAngle } from '../../domain/pose/angles';
import { PoseLandmark, isReliable } from '../../domain/pose/landmarks';
import type { GameLoop } from '../engine/gameLoop';

export interface PoseDiagnostics {
  /** Количество найденных точек. */
  pointCount: number;
  /** Видимость точек (средняя по всем). */
  averageVisibility: number;
  /** Угол колена левой ноги в градусах (null, если нога не видна). */
  leftKneeAngle: number | null;
  /** Угол колена правой ноги в градусах. */
  rightKneeAngle: number | null;
  /**
   * Средний угол колена по надёжным ногам — тот же, что использует игра.
   * null, если ни одна нога не видна достаточно хорошо.
   */
  averageKneeAngle: number | null;
  /** Сколько ног видно надёжно (0, 1 или 2). */
  reliableLegs: number;
  /**
   * Видимость точек ног: таз, колено, лодыжка — по каждой ноге.
   * Показывает, ноги ли не попали в кадр или попали, но видны плохо.
   */
  legVisibility: {
    leftHip: number;
    leftKnee: number;
    leftAnkle: number;
    rightHip: number;
    rightKnee: number;
    rightAnkle: number;
  };
  /** Позиция левой кисти в нормализованных координатах. */
  leftWrist: { x: number; y: number } | null;
  /** Позиция правой кисти. */
  rightWrist: { x: number; y: number } | null;
  /** Сколько кадров обработано с момента подключения. */
  frames: number;
  /** true, если человек найден в кадре. */
  personDetected: boolean;
  /** Применённый угол поворота кадра (по часовой стрелке). */
  rotation: number;
  /**
   * Состояние активной игры: фаза, счёт и пороги.
   * Позволяет понять, почему приседания не засчитываются.
   */
  game: {
    phase: string | null;
    score: number | null;
    currentAngle: number | null;
    referenceAngle: number | null;
    downThreshold: number | null;
    upThreshold: number | null;
  } | null;
}

declare global {
  interface Window {
    __skokDiagnostics?: PoseDiagnostics;
  }
}

/**
 * Диагностика детекции позы в браузере.
 *
 * Включается только при явном флаге `?debug=1` в адресе страницы —
 * в обычном режиме приложение ничего не публикует наружу.
 *
 * @param loop — игровой цикл, источник кадров с позой.
 * @param gameStateRef — состояние активной игры; нужно, чтобы видеть
 *        фазу и пороги: без них непонятно, почему не засчитывается счёт.
 */
export function attachPoseDiagnostics(
  loop: GameLoop,
  gameStateRef?: React.MutableRefObject<unknown>,
): () => void {
  const diagnostics: PoseDiagnostics = {
    pointCount: 0,
    averageVisibility: 0,
    leftKneeAngle: null,
    rightKneeAngle: null,
    averageKneeAngle: null,
    reliableLegs: 0,
    legVisibility: {
      leftHip: 0,
      leftKnee: 0,
      leftAnkle: 0,
      rightHip: 0,
      rightKnee: 0,
      rightAnkle: 0,
    },
    leftWrist: null,
    rightWrist: null,
    frames: 0,
    personDetected: false,
    rotation: 0,
    game: null,
  };
  window.__skokDiagnostics = diagnostics;

  // Угол поворота приходит отдельным событием: он меняется один раз.
  const unsubscribeRotation = loop.on('rotation', ({ value }) => {
    diagnostics.rotation = value;
  });
  diagnostics.rotation = loop.rotation;

  const unsubscribe = loop.on('pose', (frame: PoseFrame) => {
    diagnostics.frames += 1;
    if (frame.empty || frame.landmarks.length === 0) {
      diagnostics.personDetected = false;
      diagnostics.pointCount = 0;
      diagnostics.averageVisibility = 0;
      diagnostics.leftKneeAngle = null;
      diagnostics.rightKneeAngle = null;
      diagnostics.averageKneeAngle = null;
      diagnostics.reliableLegs = 0;
      diagnostics.legVisibility = {
        leftHip: 0,
        leftKnee: 0,
        leftAnkle: 0,
        rightHip: 0,
        rightKnee: 0,
        rightAnkle: 0,
      };
      return;
    }

    diagnostics.pointCount = frame.landmarks.length;
    diagnostics.averageVisibility =
      frame.landmarks.reduce((sum, point) => sum + point.visibility, 0) /
      frame.landmarks.length;

    const legAngles: number[] = [];

    const leftHip = frame.landmarks[PoseLandmark.LEFT_HIP];
    const leftKnee = frame.landmarks[PoseLandmark.LEFT_KNEE];
    const leftAnkle = frame.landmarks[PoseLandmark.LEFT_ANKLE];
    if (isReliable(leftHip) && isReliable(leftKnee) && isReliable(leftAnkle)) {
      diagnostics.leftKneeAngle = kneeAngle(leftHip, leftKnee, leftAnkle);
      legAngles.push(diagnostics.leftKneeAngle);
    } else {
      diagnostics.leftKneeAngle = null;
    }

    const rightHip = frame.landmarks[PoseLandmark.RIGHT_HIP];
    const rightKnee = frame.landmarks[PoseLandmark.RIGHT_KNEE];
    const rightAnkle = frame.landmarks[PoseLandmark.RIGHT_ANKLE];
    if (isReliable(rightHip) && isReliable(rightKnee) && isReliable(rightAnkle)) {
      diagnostics.rightKneeAngle = kneeAngle(rightHip, rightKnee, rightAnkle);
      legAngles.push(diagnostics.rightKneeAngle);
    } else {
      diagnostics.rightKneeAngle = null;
    }

    // Тот же угол, что использует игра: средний по надёжным ногам.
    diagnostics.reliableLegs = legAngles.length;
    diagnostics.averageKneeAngle =
      legAngles.length > 0
        ? legAngles.reduce((sum, angle) => sum + angle, 0) / legAngles.length
        : null;

    // Видимость точек ног: нужна, чтобы отличить «ноги не в кадре»
    // от «ноги в кадре, но видны плохо».
    const visibilityOf = (index: number): number =>
      frame.landmarks[index]?.visibility ?? 0;
    diagnostics.legVisibility = {
      leftHip: visibilityOf(PoseLandmark.LEFT_HIP),
      leftKnee: visibilityOf(PoseLandmark.LEFT_KNEE),
      leftAnkle: visibilityOf(PoseLandmark.LEFT_ANKLE),
      rightHip: visibilityOf(PoseLandmark.RIGHT_HIP),
      rightKnee: visibilityOf(PoseLandmark.RIGHT_KNEE),
      rightAnkle: visibilityOf(PoseLandmark.RIGHT_ANKLE),
    };

    const leftWrist = frame.landmarks[PoseLandmark.LEFT_WRIST];
    const rightWrist = frame.landmarks[PoseLandmark.RIGHT_WRIST];
    diagnostics.leftWrist = leftWrist ? { x: leftWrist.x, y: leftWrist.y } : null;
    diagnostics.rightWrist = rightWrist ? { x: rightWrist.x, y: rightWrist.y } : null;
    diagnostics.personDetected = true;

    // Состояние игры: фаза, счёт и пороги. Показывает, почему приседания
    // не засчитываются (например, порог недостижим или фаза «залипла»).
    const gameState = gameStateRef?.current as
      | {
          phase?: string;
          score?: number;
          currentAngle?: number;
          calibration?: {
            referenceAngle?: number;
            downThreshold?: number;
            upThreshold?: number;
          } | null;
        }
      | undefined;
    if (gameState) {
      diagnostics.game = {
        phase: gameState.phase ?? null,
        score: gameState.score ?? null,
        currentAngle: gameState.currentAngle ?? null,
        referenceAngle: gameState.calibration?.referenceAngle ?? null,
        downThreshold: gameState.calibration?.downThreshold ?? null,
        upThreshold: gameState.calibration?.upThreshold ?? null,
      };
    }
  });

  return () => {
    unsubscribe();
    unsubscribeRotation();
    delete window.__skokDiagnostics;
  };
}
