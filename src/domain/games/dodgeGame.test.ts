import { describe, expect, it } from 'vitest';
import { DodgeGame, bodyTilt } from './dodgeGame';
import { PoseLandmark } from '../pose/landmarks';
import type { Landmark, PoseFrame } from '../pose/poseTypes';

/**
 * Кадр с корпусом, наклонённым на угол degrees.
 *
 * Точки задаются так, чтобы ось «таз → плечи» давала нужный наклон:
 * плечи смещены вправо на синус угла.
 */
function frameWithTilt(degrees: number): PoseFrame {
  const landmarks: Landmark[] = new Array(33).fill(null).map(() => ({
    x: 0.5,
    y: 0.5,
    z: 0,
    visibility: 0,
  }));

  const radians = (degrees * Math.PI) / 180;
  const dx = Math.sin(radians);
  const dy = -Math.cos(radians);

  // Таз в (0.5, 0.6), плечи — на расстоянии 0.2 в направлении (dx, dy).
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

  return { landmarks, timestamp: 0, empty: false };
}

/** Кадр без человека. */
function emptyFrame(): PoseFrame {
  return { landmarks: [], timestamp: 0, empty: true };
}

describe('bodyTilt', () => {
  it('для прямого корпуса даёт 0°', () => {
    expect(bodyTilt(frameWithTilt(0))).toBe(0);
  });

  it('различает наклон влево и вправо', () => {
    expect(bodyTilt(frameWithTilt(20))).toBe(20);
    expect(bodyTilt(frameWithTilt(-20))).toBe(-20);
  });

  it('возвращает null, если корпус не видно', () => {
    expect(bodyTilt(emptyFrame())).toBeNull();
  });
});

describe('DodgeGame', () => {
  it('начинает раунд с калибровкой и тремя жизнями', () => {
    const game = new DodgeGame();
    const state = game.createState();
    game.start(state);

    expect(state.status).toBe('running');
    expect(state.calibrating).toBe(true);
    expect(state.lives).toBe(3);
    expect(state.score).toBe(0);
    expect(game.isReady(state)).toBe(false);
  });

  it('после калибровки запоминает опорный наклон', () => {
    const game = new DodgeGame({ calibrationFrames: 3 });
    const state = game.createState();
    game.start(state);

    for (let i = 0; i < 3; i += 1) {
      game.applyFrame(state, frameWithTilt(10));
    }

    expect(state.calibrating).toBe(false);
    expect(state.referenceTilt).toBe(10);
    expect(game.isReady(state)).toBe(true);
  });

  it('наклон вправо сдвигает игрока вправо', () => {
    const game = new DodgeGame({ calibrationFrames: 2, maxTiltDegrees: 30 });
    const state = game.createState();
    game.start(state);

    for (let i = 0; i < 2; i += 1) {
      game.applyFrame(state, frameWithTilt(0));
    }
    const center = state.playerX;

    game.applyFrame(state, frameWithTilt(30));

    expect(state.playerX).toBeGreaterThan(center);
  });

  it('наклон влево сдвигает игрока влево', () => {
    const game = new DodgeGame({ calibrationFrames: 2, maxTiltDegrees: 30 });
    const state = game.createState();
    game.start(state);

    for (let i = 0; i < 2; i += 1) {
      game.applyFrame(state, frameWithTilt(0));
    }
    const center = state.playerX;

    game.applyFrame(state, frameWithTilt(-30));

    expect(state.playerX).toBeLessThan(center);
  });

  it('не даёт игроку выйти за края экрана', () => {
    const game = new DodgeGame({ calibrationFrames: 1, maxTiltDegrees: 30 });
    const state = game.createState();
    game.start(state);
    game.applyFrame(state, frameWithTilt(0));

    game.applyFrame(state, frameWithTilt(90));

    expect(state.playerX).toBeLessThanOrEqual(0.92);
    expect(state.playerX).toBeGreaterThanOrEqual(0.08);
  });

  it('предмет, попавший в игрока, отнимает жизнь', () => {
    const game = new DodgeGame({ calibrationFrames: 1, random: () => 0.5 });
    const state = game.createState();
    game.start(state);
    game.applyFrame(state, frameWithTilt(0));

    // Предмет прямо над игроком, дошёл до полосы.
    state.objects = [{ id: 99, x: state.playerX, y: 0.93, speed: 0.3 }];

    game.advance(state, 100);

    expect(state.lives).toBe(2);
    // Предмет, в который попали, исчез — в списке остались только
    // те, что ещё не дошли до полосы.
    expect(state.objects.some((object) => object.id === 99)).toBe(false);
  });

  it('предмет, прошедший мимо, засчитывается в счёт', () => {
    const game = new DodgeGame({ calibrationFrames: 1, random: () => 0.5 });
    const state = game.createState();
    game.start(state);
    game.applyFrame(state, frameWithTilt(0));

    // Предмет далеко от игрока и дошёл до полосы.
    state.objects = [{ id: 1, x: 0.1, y: 0.93, speed: 0.3 }];

    game.advance(state, 100);

    expect(state.score).toBe(1);
    expect(state.dodged).toBe(1);
    expect(state.lives).toBe(3);
  });

  it('заканчивает раунд, когда жизни кончились', () => {
    const game = new DodgeGame({ calibrationFrames: 1, random: () => 0.5 });
    const state = game.createState();
    game.start(state);
    game.applyFrame(state, frameWithTilt(0));

    for (let i = 0; i < 3; i += 1) {
      state.objects = [{ id: i, x: state.playerX, y: 0.93, speed: 0.3 }];
      game.advance(state, 100);
    }

    expect(state.lives).toBe(0);
    expect(state.status).toBe('finished');
  });

  it('завершает раунд по истечении времени', () => {
    const game = new DodgeGame({ durationMs: 500 });
    const state = game.createState();
    game.start(state);

    game.advance(state, 600);

    expect(state.status).toBe('finished');
    expect(state.elapsedMs).toBe(500);
  });

  it('во время калибровки предметы не падают', () => {
    const game = new DodgeGame({ calibrationFrames: 5, random: () => 0.5 });
    const state = game.createState();
    game.start(state);

    game.advance(state, 1000);

    expect(state.objects).toHaveLength(0);
  });

  it('после калибровки предметы начинают падать', () => {
    const game = new DodgeGame({ calibrationFrames: 1, random: () => 0.5 });
    const state = game.createState();
    game.start(state);
    game.applyFrame(state, frameWithTilt(0));

    game.advance(state, 100);

    expect(state.objects.length).toBeGreaterThan(0);
  });

  it('перезапускает раунд с нуля', () => {
    const game = new DodgeGame({ calibrationFrames: 1 });
    const state = game.createState();
    game.start(state);
    game.applyFrame(state, frameWithTilt(0));
    game.advance(state, 100);
    expect(state.objects.length).toBeGreaterThan(0);

    game.start(state);

    expect(state.score).toBe(0);
    expect(state.lives).toBe(3);
    expect(state.objects).toHaveLength(0);
    expect(state.calibrating).toBe(true);
  });
});
