import { describe, expect, it } from 'vitest';
import { ROTATION_ANGLES, asRotationAngle } from './orientation';

describe('asRotationAngle', () => {
  it('округляет до кратного 90°', () => {
    expect(asRotationAngle(87)).toBe(90);
    expect(asRotationAngle(44)).toBe(0);
    expect(asRotationAngle(135)).toBe(180);
  });

  it('приводит отрицательные углы к диапазону 0..360', () => {
    expect(asRotationAngle(-87)).toBe(270);
    expect(asRotationAngle(-180)).toBe(180);
  });

  it('оставляет углы больше 360 в допустимом диапазоне', () => {
    expect(asRotationAngle(450)).toBe(90);
    expect(asRotationAngle(360)).toBe(0);
  });
});

describe('ROTATION_ANGLES', () => {
  it('содержит четыре допустимых угла', () => {
    expect(ROTATION_ANGLES).toEqual([0, 90, 180, 270]);
  });
});
