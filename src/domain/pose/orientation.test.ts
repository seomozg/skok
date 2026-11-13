import { describe, expect, it } from 'vitest';
import {
  ROTATION_ANGLES,
  asRotationAngle,
  bodyTilt,
  chooseRotation,
  faceTilt,
  rotationForTilt,
} from './orientation';
import { PoseLandmark } from './landmarks';
import type { Landmark } from './poseTypes';

function landmark(x: number, y: number, visibility = 1): Landmark {
  return { x, y, z: 0, visibility };
}

/** Кадр без человека: точки невидимы. */
function blank(): Landmark[] {
  return new Array(33).fill(null).map(() => landmark(0.5, 0.5, 0));
}

/** Человек стоит вертикально: таз ниже плеч, нос ниже глаз. */
function standing(): Landmark[] {
  const points = blank();
  points[PoseLandmark.NOSE] = landmark(0.5, 0.28);
  points[PoseLandmark.LEFT_EYE] = landmark(0.45, 0.24);
  points[PoseLandmark.RIGHT_EYE] = landmark(0.55, 0.24);
  points[PoseLandmark.LEFT_SHOULDER] = landmark(0.4, 0.35);
  points[PoseLandmark.RIGHT_SHOULDER] = landmark(0.6, 0.35);
  points[PoseLandmark.LEFT_HIP] = landmark(0.45, 0.65);
  points[PoseLandmark.RIGHT_HIP] = landmark(0.55, 0.65);
  points[PoseLandmark.LEFT_KNEE] = landmark(0.45, 0.8);
  points[PoseLandmark.RIGHT_KNEE] = landmark(0.55, 0.8);
  return points;
}

/**
 * Поворачивает все точки вокруг центра кадра на угол (по часовой стрелке).
 */
function rotatePoints(points: Landmark[], degrees: number): Landmark[] {
  const radians = (degrees * Math.PI) / 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  return points.map((point) => {
    const dx = point.x - 0.5;
    const dy = point.y - 0.5;
    return {
      ...point,
      x: 0.5 + dx * cos - dy * sin,
      y: 0.5 + dx * sin + dy * cos,
    };
  });
}

describe('bodyTilt', () => {
  it('для вертикального человека даёт 0°', () => {
    expect(bodyTilt(standing())).toBe(0);
  });

  it('для человека, лежащего головой вправо, даёт +90°', () => {
    // Поворот на 90° по часовой стрелке уводит верх кадра вправо.
    expect(bodyTilt(rotatePoints(standing(), 90))).toBe(90);
  });

  it('для человека, лежащего головой влево, даёт −90°', () => {
    expect(bodyTilt(rotatePoints(standing(), 270))).toBe(-90);
  });

  it('для перевёрнутого человека даёт 180°', () => {
    expect(Math.abs(bodyTilt(rotatePoints(standing(), 180))!)).toBe(180);
  });

  it('возвращает null, если точки не видны', () => {
    expect(bodyTilt(blank())).toBeNull();
  });

  it('работает при низкой видимости точек', () => {
    const points = standing();
    points[PoseLandmark.LEFT_SHOULDER] = landmark(0.4, 0.35, 0.3);
    points[PoseLandmark.RIGHT_SHOULDER] = landmark(0.6, 0.35, 0.3);
    expect(bodyTilt(points)).toBe(0);
  });
});

describe('faceTilt', () => {
  it('для прямого лица даёт 0°', () => {
    expect(faceTilt(standing())).toBe(0);
  });

  it('возвращает null, если глаза не видны', () => {
    const points = standing();
    points[PoseLandmark.LEFT_EYE] = landmark(0.45, 0.24, 0);
    points[PoseLandmark.RIGHT_EYE] = landmark(0.55, 0.24, 0);
    expect(faceTilt(points)).toBeNull();
  });
});

describe('rotationForTilt', () => {
  it('для наклона +90° даёт поворот 270°', () => {
    expect(rotationForTilt(90)).toBe(270);
  });

  it('для наклона −90° даёт поворот 90°', () => {
    expect(rotationForTilt(-90)).toBe(90);
  });

  it('для наклона 0° даёт поворот 0°', () => {
    expect(rotationForTilt(0)).toBe(0);
  });

  it('для наклона 180° даёт поворот 180°', () => {
    expect(rotationForTilt(180)).toBe(180);
  });
});

describe('asRotationAngle', () => {
  it('округляет до кратного 90°', () => {
    expect(asRotationAngle(87)).toBe(90);
    expect(asRotationAngle(-87)).toBe(270);
    expect(asRotationAngle(44)).toBe(0);
  });
});

describe('chooseRotation', () => {
  it('выбирает угол с минимальным отклонением от вертикали', () => {
    // Реальные измерения на камере: 0° → 92°, 90° → 165°, 180° → −86°, 270° → 12°.
    expect(chooseRotation([92, 165, -86, 12])).toBe(270);
  });

  it('возвращает null, если ни одного измерения нет', () => {
    expect(chooseRotation([null, null, null, null])).toBeNull();
  });

  it('игнорирует углы без измерений', () => {
    expect(chooseRotation([null, null, null, 5])).toBe(270);
  });
});

describe('ROTATION_ANGLES', () => {
  it('содержит четыре допустимых угла', () => {
    expect(ROTATION_ANGLES).toEqual([0, 90, 180, 270]);
  });
});
