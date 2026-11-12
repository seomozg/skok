import { describe, expect, it } from 'vitest';
import { ReactionGame, isInside } from './reactionGame';
import { PoseLandmark } from '../pose/landmarks';
import type { Landmark, PoseFrame } from '../pose/poseTypes';

function makeFrame(points: Partial<Record<number, { x: number; y: number }>>): PoseFrame {
  const landmarks: Landmark[] = new Array(33).fill(null).map(() => ({
    x: 0.5,
    y: 0.5,
    z: 0,
    visibility: 0,
  }));
  for (const [index, point] of Object.entries(points)) {
    landmarks[Number(index)] = {
      x: point?.x ?? 0.5,
      y: point?.y ?? 0.5,
      z: 0,
      visibility: 1,
    };
  }
  return { landmarks, timestamp: 0, empty: false };
}

describe('ReactionGame', () => {
  it('начинает раунд с мишенью и нулевым счётом', () => {
    const game = new ReactionGame({ random: () => 0.5 });
    const state = game.createState();
    game.start(state);
    expect(state.status).toBe('running');
    expect(state.score).toBe(0);
    expect(state.target).not.toBeNull();
  });

  it('засчитывает попадание кистью в мишень', () => {
    const game = new ReactionGame({ random: () => 0.5 });
    const state = game.createState();
    game.start(state);
    const target = state.target!;

    game.applyFrame(
      state,
      makeFrame({ [PoseLandmark.LEFT_WRIST]: { x: target.x, y: target.y } }),
    );

    expect(state.score).toBe(1);
    expect(state.hits).toBe(1);
  });

  it('не засчитывает промах', () => {
    const game = new ReactionGame({ random: () => 0.5 });
    const state = game.createState();
    game.start(state);
    const target = state.target!;

    game.applyFrame(
      state,
      makeFrame({
        [PoseLandmark.LEFT_WRIST]: { x: target.x + 0.3, y: target.y + 0.3 },
      }),
    );

    expect(state.score).toBe(0);
  });

  it('не засчитывает попадание ненадёжной кистью', () => {
    const game = new ReactionGame({ random: () => 0.5 });
    const state = game.createState();
    game.start(state);
    const target = state.target!;

    const frame = makeFrame({
      [PoseLandmark.LEFT_WRIST]: { x: target.x, y: target.y },
    });
    frame.landmarks[PoseLandmark.LEFT_WRIST]!.visibility = 0.1;

    game.applyFrame(state, frame);
    expect(state.score).toBe(0);
  });

  it('учитывает попадание любой кистью', () => {
    const game = new ReactionGame({ random: () => 0.5 });
    const state = game.createState();
    game.start(state);
    const target = state.target!;

    game.applyFrame(
      state,
      makeFrame({ [PoseLandmark.RIGHT_WRIST]: { x: target.x, y: target.y } }),
    );

    expect(state.score).toBe(1);
  });

  it('после попадания появляется новая мишень', () => {
    const game = new ReactionGame({ random: () => 0.5 });
    const state = game.createState();
    game.start(state);
    const first = state.target!.id;

    game.applyFrame(
      state,
      makeFrame({ [PoseLandmark.LEFT_WRIST]: { x: state.target!.x, y: state.target!.y } }),
    );

    expect(state.target!.id).not.toBe(first);
  });

  it('завершает раунд по истечении времени', () => {
    const game = new ReactionGame({ durationMs: 1000 });
    const state = game.createState();
    game.start(state);

    game.advance(state, 999);
    expect(state.status).toBe('running');

    game.advance(state, 2);
    expect(state.status).toBe('finished');
    expect(state.elapsedMs).toBe(1000);
    expect(state.target).toBeNull();
  });

  it('не обрабатывает кадры вне активного раунда', () => {
    const game = new ReactionGame({ random: () => 0.5 });
    const state = game.createState();
    const frame = makeFrame({ [PoseLandmark.LEFT_WRIST]: { x: 0.5, y: 0.5 } });

    game.applyFrame(state, frame);
    expect(state.score).toBe(0);
  });
});

describe('isInside', () => {
  it('включает границу круга', () => {
    const target = { id: 1, x: 0.5, y: 0.5, radius: 0.1 };
    expect(isInside({ x: 0.6, y: 0.5 }, target)).toBe(true);
  });

  it('исключает точки вне круга', () => {
    const target = { id: 1, x: 0.5, y: 0.5, radius: 0.1 };
    expect(isInside({ x: 0.65, y: 0.5 }, target)).toBe(false);
  });
});
