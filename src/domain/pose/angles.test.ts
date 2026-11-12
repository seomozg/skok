import { describe, expect, it } from 'vitest';
import { angleBetween, kneeAngle, shoulderAngle } from './angles';

const point = (x: number, y: number) => ({ x, y });

describe('angleBetween', () => {
  it('возвращает 90° для перпендикулярных векторов', () => {
    const angle = angleBetween(point(1, 0), point(0, 0), point(0, 1));
    expect(angle).toBeCloseTo(90, 6);
  });

  it('возвращает 180° для разнонаправленных векторов', () => {
    const angle = angleBetween(point(1, 0), point(0, 0), point(-1, 0));
    expect(angle).toBeCloseTo(180, 6);
  });

  it('возвращает 0° для совпадающих направлений', () => {
    const angle = angleBetween(point(1, 0), point(0, 0), point(2, 0));
    expect(angle).toBeCloseTo(0, 6);
  });

  it('возвращает 0° для вырожденных точек (нулевой вектор)', () => {
    const angle = angleBetween(point(0, 0), point(0, 0), point(1, 1));
    expect(angle).toBe(0);
  });

  it('устойчив к порядку аргументов a и c', () => {
    const a = angleBetween(point(1, 0), point(0, 0), point(0, 1));
    const b = angleBetween(point(0, 1), point(0, 0), point(1, 0));
    expect(a).toBeCloseTo(b, 6);
  });
});

describe('kneeAngle', () => {
  it('измеряет угол в коленном суставе', () => {
    // Прямая нога: бедро (0,0), колено (0,1), лодыжка (0,2) → 180°.
    const angle = kneeAngle(point(0, 0), point(0, 1), point(0, 2));
    expect(angle).toBeCloseTo(180, 6);
  });

  it('учитывает сгиб ноги', () => {
    const angle = kneeAngle(point(0, 0), point(0, 1), point(1, 1));
    expect(angle).toBeCloseTo(90, 6);
  });
});

describe('shoulderAngle', () => {
  it('измеряет угол в плечевом суставе', () => {
    const angle = shoulderAngle(point(0, 1), point(0, 0), point(1, 0));
    expect(angle).toBeCloseTo(90, 6);
  });
});
