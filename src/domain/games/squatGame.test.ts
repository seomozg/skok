import { describe, expect, it } from 'vitest';
import { SquatGame, average } from './squatGame';
import { PoseLandmark } from '../pose/landmarks';
import type { Landmark, PoseFrame } from '../pose/poseTypes';

/**
 * Строит кадр с заданным углом в колене.
 * Точки задаются так, чтобы hip–knee–ankle давали нужный угол.
 */
function frameWithKneeAngle(angleDegrees: number): PoseFrame {
  const landmarks: Landmark[] = new Array(33).fill(null).map(() => ({
    x: 0.5,
    y: 0.5,
    z: 0,
    visibility: 0,
  }));

  // Колено в (0.5, 0.5); бедро строго выше, лодыжка — под углом theta к бедру.
  const theta = angleDegrees * (Math.PI / 180);
  const length = 1;
  const knee = { x: 0.5, y: 0.5 };
  const hip = { x: 0.5, y: 0.5 - length };
  const ankle = {
    x: 0.5 + length * Math.sin(theta),
    y: 0.5 - length * Math.cos(theta),
  };

  landmarks[PoseLandmark.LEFT_HIP] = { ...hip, z: 0, visibility: 1 };
  landmarks[PoseLandmark.LEFT_KNEE] = { ...knee, z: 0, visibility: 1 };
  landmarks[PoseLandmark.LEFT_ANKLE] = { ...ankle, z: 0, visibility: 1 };

  return { landmarks, timestamp: 0, empty: false };
}

describe('SquatGame', () => {
  it('начинает раунд в фазе калибровки', () => {
    const game = new SquatGame();
    const state = game.createState();
    game.start(state);

    expect(state.status).toBe('running');
    expect(state.phase).toBe('calibrating');
    expect(state.calibration).toBeNull();
    expect(game.isReady(state)).toBe(false);
  });

  it('калибруется по накопленным кадрам и переходит в фазу up', () => {
    const game = new SquatGame({ calibrationFrames: 5 });
    const state = game.createState();
    game.start(state);

    for (let i = 0; i < 5; i += 1) {
      game.applyFrame(state, frameWithKneeAngle(170));
    }

    expect(state.calibration).not.toBeNull();
    expect(state.calibration!.referenceAngle).toBeCloseTo(170, 0);
    expect(state.phase).toBe('up');
    expect(game.isReady(state)).toBe(true);
  });

  it('считает одно приседание за цикл вниз-вверх', () => {
    const game = new SquatGame({ calibrationFrames: 1 });
    const state = game.createState();
    game.start(state);

    game.applyFrame(state, frameWithKneeAngle(170)); // калибровка
    expect(state.phase).toBe('up');

    game.applyFrame(state, frameWithKneeAngle(100)); // присели
    expect(state.phase).toBe('down');
    expect(state.score).toBe(0);

    game.applyFrame(state, frameWithKneeAngle(165)); // выпрямились
    expect(state.phase).toBe('up');
    expect(state.score).toBe(1);
  });

  it('не засчитывает двойной счёт при удержании в нижней позиции', () => {
    const game = new SquatGame({ calibrationFrames: 1 });
    const state = game.createState();
    game.start(state);
    game.applyFrame(state, frameWithKneeAngle(170));

    game.applyFrame(state, frameWithKneeAngle(100));
    game.applyFrame(state, frameWithKneeAngle(95));
    game.applyFrame(state, frameWithKneeAngle(90));

    expect(state.score).toBe(0);
  });

  it('гистерезис: лёгкое поднятие не засчитывает повтор', () => {
    const game = new SquatGame({ calibrationFrames: 1 });
    const state = game.createState();
    game.start(state);
    game.applyFrame(state, frameWithKneeAngle(170));

    game.applyFrame(state, frameWithKneeAngle(100)); // вниз
    game.applyFrame(state, frameWithKneeAngle(140)); // выше downThreshold, но ниже upThreshold

    expect(state.phase).toBe('down');
    expect(state.score).toBe(0);
  });

  it('игнорирует кадры без надёжных точек ног', () => {
    const game = new SquatGame({ calibrationFrames: 1 });
    const state = game.createState();
    game.start(state);

    const empty: PoseFrame = { landmarks: [], timestamp: 0, empty: true };
    game.applyFrame(state, empty);

    expect(state.phase).toBe('calibrating');
    expect(state.currentAngle).toBe(0);
  });

  it('завершает раунд по истечении времени', () => {
    const game = new SquatGame({ durationMs: 500 });
    const state = game.createState();
    game.start(state);

    game.advance(state, 600);

    expect(state.status).toBe('finished');
    expect(state.elapsedMs).toBe(500);
  });

  it('перезапускает раунд с нуля', () => {
    const game = new SquatGame({ calibrationFrames: 1 });
    const state = game.createState();
    game.start(state);
    game.applyFrame(state, frameWithKneeAngle(170));
    game.applyFrame(state, frameWithKneeAngle(100));
    game.applyFrame(state, frameWithKneeAngle(170));
    expect(state.score).toBe(1);

    game.start(state);
    expect(state.score).toBe(0);
    expect(state.phase).toBe('calibrating');
    expect(state.calibration).toBeNull();
  });
});

describe('average', () => {
  it('считает среднее арифметическое', () => {
    expect(average([10, 20, 30])).toBe(20);
  });

  it('возвращает 0 для пустого массива', () => {
    expect(average([])).toBe(0);
  });
});
