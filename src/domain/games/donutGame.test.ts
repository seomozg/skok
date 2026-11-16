import { describe, expect, it } from 'vitest';
import { DonutGame, bodyTilt } from './donutGame';
import { PoseLandmark } from '../pose/landmarks';
import type { Landmark, PoseFrame } from '../pose/poseTypes';

/**
 * Кадр с корпусом, наклонённым на угол degrees, и носом в точке noseX.
 */
function frameWith(degrees: number, noseX = 0.5): PoseFrame {
  const landmarks: Landmark[] = new Array(33).fill(null).map(() => ({
    x: 0.5,
    y: 0.5,
    z: 0,
    visibility: 0,
  }));

  const radians = (degrees * Math.PI) / 180;
  const dx = Math.sin(radians);
  const dy = -Math.cos(radians);

  landmarks[PoseLandmark.LEFT_HIP] = { x: 0.45, y: 0.6, z: 0, visibility: 1 };
  landmarks[PoseLandmark.RIGHT_HIP] = { x: 0.55, y: 0.6, z: 0, visibility: 1 };
  landmarks[PoseLandmark.LEFT_SHOULDER] = {
    x: 0.5 + dx * 0.2 - 0.05,
    y: 0.6 + dy * 0.2,
    z: 0,
    visibility: 1,
  };
  landmarks[PoseLandmark.RIGHT_SHOULDER] = {
    x: 0.5 + dx * 0.2 + 0.05,
    y: 0.6 + dy * 0.2,
    z: 0,
    visibility: 1,
  };
  landmarks[PoseLandmark.NOSE] = { x: noseX, y: 0.25, z: 0, visibility: 1 };

  return { landmarks, timestamp: 0, empty: false };
}

/** Кадр без человека. */
function emptyFrame(): PoseFrame {
  return { landmarks: [], timestamp: 0, empty: true };
}

describe('bodyTilt', () => {
  it('для прямого корпуса даёт 0°', () => {
    expect(bodyTilt(frameWith(0))).toBe(0);
  });

  it('различает наклон влево и вправо', () => {
    expect(bodyTilt(frameWith(20))).toBe(20);
    expect(bodyTilt(frameWith(-20))).toBe(-20);
  });

  it('возвращает null, если корпус не видно', () => {
    expect(bodyTilt(emptyFrame())).toBeNull();
  });
});


describe('DonutGame', () => {
  it('начинает раунд с калибровкой и тремя жизнями', () => {
    const game = new DonutGame();
    const state = game.createState();
    game.start(state);

    expect(state.status).toBe('running');
    expect(state.calibrating).toBe(true);
    expect(state.lives).toBe(3);
    expect(state.score).toBe(0);
    expect(game.isReady(state)).toBe(false);
  });

  it('после калибровки запоминает опорный наклон и положение рта', () => {
    const game = new DonutGame({ calibrationFrames: 3 });
    const state = game.createState();
    game.start(state);

    for (let i = 0; i < 3; i += 1) {
      game.applyFrame(state, frameWith(10, 0.4));
    }

    expect(state.calibrating).toBe(false);
    expect(state.referenceTilt).toBe(10);
    expect(state.referenceMouthX).toBe(0.4);
    expect(game.isReady(state)).toBe(true);
  });

  it('наклон вправо сдвигает рот вправо', () => {
    const game = new DonutGame({ calibrationFrames: 2, maxTiltDegrees: 30 });
    const state = game.createState();
    game.start(state);

    for (let i = 0; i < 2; i += 1) {
      game.applyFrame(state, frameWith(0, 0.5));
    }
    const center = state.mouthX;

    game.applyFrame(state, frameWith(30, 0.5));

    expect(state.mouthX).toBeGreaterThan(center);
  });

  it('наклон влево сдвигает рот влево', () => {
    const game = new DonutGame({ calibrationFrames: 2, maxTiltDegrees: 30 });
    const state = game.createState();
    game.start(state);

    for (let i = 0; i < 2; i += 1) {
      game.applyFrame(state, frameWith(0, 0.5));
    }
    const center = state.mouthX;

    game.applyFrame(state, frameWith(-30, 0.5));

    expect(state.mouthX).toBeLessThan(center);
  });

  it('рот не выходит за края экрана', () => {
    const game = new DonutGame({ calibrationFrames: 1, maxTiltDegrees: 30 });
    const state = game.createState();
    game.start(state);
    game.applyFrame(state, frameWith(0, 0.5));

    game.applyFrame(state, frameWith(90, 0.5));

    expect(state.mouthX).toBeLessThanOrEqual(0.9);
    expect(state.mouthX).toBeGreaterThanOrEqual(0.1);
  });

  it('высота рта берётся из позы', () => {
    const game = new DonutGame({ calibrationFrames: 1 });
    const state = game.createState();
    game.start(state);

    game.applyFrame(state, frameWith(0, 0.5));

    expect(state.mouthY).toBe(0.25);
  });

  it('пончик, пойманный ртом, засчитывается в счёт', () => {
    const game = new DonutGame({ calibrationFrames: 1 });
    const state = game.createState();
    game.start(state);
    game.applyFrame(state, frameWith(0, 0.5));

    // Пончик прямо над ртом и дошёл до его уровня.
    state.donuts = [{ id: 99, x: state.mouthX, y: 0.25, speed: 0.3, side: 1 }];

    game.advance(state, 100);

    expect(state.caught).toBe(1);
    expect(state.score).toBe(1);
    expect(state.lives).toBe(3);
  });

  it('пончик, пролетевший мимо рта, отнимает жизнь', () => {
    const game = new DonutGame({ calibrationFrames: 1 });
    const state = game.createState();
    game.start(state);
    game.applyFrame(state, frameWith(0, 0.5));

    state.donuts = [{ id: 99, x: 0.05, y: 0.25, speed: 0.3, side: -1 }];

    game.advance(state, 100);

    expect(state.missed).toBe(1);
    expect(state.lives).toBe(2);
    expect(state.score).toBe(0);
  });

  it('заканчивает раунд, когда жизни кончились', () => {
    const game = new DonutGame({ calibrationFrames: 1 });
    const state = game.createState();
    game.start(state);
    game.applyFrame(state, frameWith(0, 0.5));

    for (let i = 0; i < 3; i += 1) {
      state.donuts = [{ id: i, x: 0.05, y: 0.25, speed: 0.3, side: -1 }];
      game.advance(state, 100);
    }

    expect(state.lives).toBe(0);
    expect(state.status).toBe('finished');
  });

  it('пончики приходят по очереди: сначала справа, потом слева', () => {
    const game = new DonutGame({ calibrationFrames: 1 });
    const state = game.createState();
    game.start(state);
    game.applyFrame(state, frameWith(0, 0.5));

    game.advance(state, 100);
    const first = state.donuts[state.donuts.length - 1]!;
    expect(first.side).toBe(1);
    expect(first.x).toBeGreaterThan(state.mouthX);

    state.nextSpawnIn = 0;
    game.advance(state, 100);
    const second = state.donuts[state.donuts.length - 1]!;
    expect(second.side).toBe(-1);
    expect(second.x).toBeLessThan(state.mouthX);
  });

  it('завершает раунд по истечении времени', () => {
    const game = new DonutGame({ durationMs: 500 });
    const state = game.createState();
    game.start(state);

    game.advance(state, 600);

    expect(state.status).toBe('finished');
    expect(state.elapsedMs).toBe(500);
  });

  it('во время калибровки пончики не падают', () => {
    const game = new DonutGame({ calibrationFrames: 5 });
    const state = game.createState();
    game.start(state);

    game.advance(state, 1000);

    expect(state.donuts).toHaveLength(0);
  });

  it('перезапускает раунд с нуля', () => {
    const game = new DonutGame({ calibrationFrames: 1 });
    const state = game.createState();
    game.start(state);
    game.applyFrame(state, frameWith(0, 0.5));
    game.advance(state, 100);
    expect(state.donuts.length).toBeGreaterThan(0);

    game.start(state);

    expect(state.score).toBe(0);
    expect(state.lives).toBe(3);
    expect(state.donuts).toHaveLength(0);
    expect(state.calibrating).toBe(true);
    expect(state.nextSide).toBe(1);
  });
});
