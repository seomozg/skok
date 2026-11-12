import { describe, expect, it } from 'vitest';
import {
  DEFAULT_SQUAT_DROP_DEGREES,
  DEFAULT_SQUAT_RISE_DEGREES,
  createSquatCalibration,
  updateReference,
} from './calibration';

describe('createSquatCalibration', () => {
  it('строит пороги относительно опорного угла', () => {
    const calibration = createSquatCalibration(170);
    expect(calibration.referenceAngle).toBe(170);
    expect(calibration.downThreshold).toBeCloseTo(170 - DEFAULT_SQUAT_DROP_DEGREES, 6);
    expect(calibration.upThreshold).toBeCloseTo(170 - DEFAULT_SQUAT_RISE_DEGREES, 6);
  });

  it('гарантирует гистерезис: downThreshold ниже upThreshold', () => {
    const calibration = createSquatCalibration(150);
    expect(calibration.downThreshold).toBeLessThan(calibration.upThreshold);
  });

  it('не допускает схлопывания порогов при недопустимых параметрах', () => {
    const calibration = createSquatCalibration(170, 10, 40);
    expect(calibration.upThreshold).toBeGreaterThan(calibration.downThreshold);
  });

  it('корректно обрабатывает вырожденный reference', () => {
    const calibration = createSquatCalibration(0);
    expect(Number.isFinite(calibration.downThreshold)).toBe(true);
    expect(Number.isFinite(calibration.upThreshold)).toBe(true);
  });
});

describe('updateReference', () => {
  it('пересчитывает пороги под новый опорный угол, сохраняя отклонения', () => {
    const initial = createSquatCalibration(170);
    const updated = updateReference(initial, 150);
    expect(updated.referenceAngle).toBe(150);
    expect(updated.downThreshold).toBeCloseTo(initial.downThreshold - 20, 6);
    expect(updated.upThreshold).toBeCloseTo(initial.upThreshold - 20, 6);
  });
});
