import { describe, expect, it } from 'vitest';
import {
  PoseLandmark,
  SKELETON_CONNECTIONS,
  filterReliable,
  getLandmark,
  isReliable,
  mirrorFrame,
  mirrorX,
  toCanvasPoint,
} from './landmarks';
import type { Landmark, PoseFrame } from './poseTypes';

const landmark = (x: number, y: number, visibility = 1): Landmark => ({
  x,
  y,
  z: 0,
  visibility,
});

const frame = (landmarks: Landmark[]): PoseFrame => ({
  landmarks,
  timestamp: 0,
  empty: landmarks.length === 0,
});

describe('mirrorX', () => {
  it('инвертирует X относительно центра кадра', () => {
    expect(mirrorX({ x: 0.2, y: 0.5 }).x).toBeCloseTo(0.8, 6);
    expect(mirrorX({ x: 0.5, y: 0.5 }).x).toBeCloseTo(0.5, 6);
  });

  it('не меняет Y', () => {
    expect(mirrorX({ x: 0.2, y: 0.7 }).y).toBeCloseTo(0.7, 6);
  });
});

describe('mirrorFrame', () => {
  it('зеркалит все точки кадра', () => {
    const mirrored = mirrorFrame(frame([landmark(0.1, 0.2), landmark(0.9, 0.4)]));
    expect(mirrored.landmarks[0]?.x).toBeCloseTo(0.9, 6);
    expect(mirrored.landmarks[1]?.x).toBeCloseTo(0.1, 6);
  });

  it('возвращает пустой кадр без изменений', () => {
    const empty: PoseFrame = { landmarks: [], timestamp: 5, empty: true };
    expect(mirrorFrame(empty)).toBe(empty);
  });
});

describe('toCanvasPoint', () => {
  it('переводит нормализованные координаты в пиксели', () => {
    const result = toCanvasPoint({ x: 0.5, y: 0.25 }, 800, 600, false);
    expect(result).toEqual({ x: 400, y: 150 });
  });

  it('зеркалит X по умолчанию', () => {
    const result = toCanvasPoint({ x: 0.25, y: 0.5 }, 800, 600);
    expect(result.x).toBeCloseTo(600, 6);
  });
});

describe('isReliable / getLandmark / filterReliable', () => {
  it('считает точку надёжной при достаточной видимости', () => {
    expect(isReliable(landmark(0.5, 0.5, 0.9))).toBe(true);
  });

  it('считает точку ненадёжной при низкой видимости', () => {
    expect(isReliable(landmark(0.5, 0.5, 0.2))).toBe(false);
  });

  it('не находит точку за пределами массива', () => {
    expect(getLandmark([], 5)).toBeUndefined();
  });

  it('обнуляет видимость ненадёжных точек при фильтрации', () => {
    const filtered = filterReliable([landmark(0.5, 0.5, 0.9), landmark(0.1, 0.1, 0.1)]);
    expect(filtered[0]?.visibility).toBe(0.9);
    expect(filtered[1]?.visibility).toBe(0);
  });
});

describe('константы скелета', () => {
  it('все индексы в пределах 33 точек', () => {
    for (const [from, to] of SKELETON_CONNECTIONS) {
      expect(from).toBeGreaterThanOrEqual(0);
      expect(from).toBeLessThan(33);
      expect(to).toBeGreaterThanOrEqual(0);
      expect(to).toBeLessThan(33);
    }
  });

  it('индексы кистей совпадают с документацией MediaPipe', () => {
    expect(PoseLandmark.LEFT_WRIST).toBe(15);
    expect(PoseLandmark.RIGHT_WRIST).toBe(16);
    expect(PoseLandmark.LEFT_KNEE).toBe(25);
    expect(PoseLandmark.RIGHT_ANKLE).toBe(28);
  });
});
