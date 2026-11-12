import { describe, expect, it, vi } from 'vitest';
import { EventBus } from './eventBus';

interface TestEvents extends Record<string, unknown> {
  ping: { value: number };
  pong: string;
}

describe('EventBus', () => {
  it('вызывает подписчика с payload', () => {
    const bus = new EventBus<TestEvents>();
    const handler = vi.fn();
    bus.on('ping', handler);

    bus.emit('ping', { value: 7 });

    expect(handler).toHaveBeenCalledWith({ value: 7 });
  });

  it('не вызывает подписчика после отписки', () => {
    const bus = new EventBus<TestEvents>();
    const handler = vi.fn();
    const unsubscribe = bus.on('ping', handler);

    unsubscribe();
    bus.emit('ping', { value: 1 });

    expect(handler).not.toHaveBeenCalled();
  });

  it('поддерживает несколько подписчиков одного события', () => {
    const bus = new EventBus<TestEvents>();
    const first = vi.fn();
    const second = vi.fn();
    bus.on('pong', first);
    bus.on('pong', second);

    bus.emit('pong', 'x');

    expect(first).toHaveBeenCalledTimes(1);
    expect(second).toHaveBeenCalledTimes(1);
  });

  it('не падает при отсутствии подписчиков', () => {
    const bus = new EventBus<TestEvents>();
    expect(() => bus.emit('ping', { value: 0 })).not.toThrow();
  });

  it('удаляет всех подписчиков по clear()', () => {
    const bus = new EventBus<TestEvents>();
    const handler = vi.fn();
    bus.on('ping', handler);

    bus.clear();
    bus.emit('ping', { value: 1 });

    expect(handler).not.toHaveBeenCalled();
  });
});
