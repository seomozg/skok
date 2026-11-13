import type { PoseFrame } from '../../domain/pose/poseTypes';
import { kneeAngle } from '../../domain/pose/angles';
import { PoseLandmark } from '../../domain/pose/landmarks';
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
 */
export function attachPoseDiagnostics(loop: GameLoop): () => void {
  const diagnostics: PoseDiagnostics = {
    pointCount: 0,
    averageVisibility: 0,
    leftKneeAngle: null,
    rightKneeAngle: null,
    leftWrist: null,
    rightWrist: null,
    frames: 0,
    personDetected: false,
    rotation: 0,
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
      return;
    }

    diagnostics.pointCount = frame.landmarks.length;
    diagnostics.averageVisibility =
      frame.landmarks.reduce((sum, point) => sum + point.visibility, 0) /
      frame.landmarks.length;

    const leftHip = frame.landmarks[PoseLandmark.LEFT_HIP];
    const leftKnee = frame.landmarks[PoseLandmark.LEFT_KNEE];
    const leftAnkle = frame.landmarks[PoseLandmark.LEFT_ANKLE];
    if (leftHip && leftKnee && leftAnkle) {
      diagnostics.leftKneeAngle = kneeAngle(leftHip, leftKnee, leftAnkle);
    }

    const rightHip = frame.landmarks[PoseLandmark.RIGHT_HIP];
    const rightKnee = frame.landmarks[PoseLandmark.RIGHT_KNEE];
    const rightAnkle = frame.landmarks[PoseLandmark.RIGHT_ANKLE];
    if (rightHip && rightKnee && rightAnkle) {
      diagnostics.rightKneeAngle = kneeAngle(rightHip, rightKnee, rightAnkle);
    }

    const leftWrist = frame.landmarks[PoseLandmark.LEFT_WRIST];
    const rightWrist = frame.landmarks[PoseLandmark.RIGHT_WRIST];
    diagnostics.leftWrist = leftWrist ? { x: leftWrist.x, y: leftWrist.y } : null;
    diagnostics.rightWrist = rightWrist ? { x: rightWrist.x, y: rightWrist.y } : null;
    diagnostics.personDetected = true;
  });

  return () => {
    unsubscribe();
    unsubscribeRotation();
    delete window.__skokDiagnostics;
  };
}
