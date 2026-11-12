/**
 * Минимальная шина событий — связь между игровым циклом и подписчиками.
 *
 * Вынесена в отдельный модуль, чтобы игровой цикл не зависел от React
 * и мог тестироваться в изоляции.
 */

export type Unsubscribe = () => void;

export class EventBus<Events extends Record<string, unknown>> {
  private readonly handlers = new Map<keyof Events, Set<(payload: never) => void>>();

  on<K extends keyof Events>(event: K, handler: (payload: Events[K]) => void): Unsubscribe {
    let set = this.handlers.get(event);
    if (!set) {
      set = new Set();
      this.handlers.set(event, set);
    }
    set.add(handler as (payload: never) => void);
    return () => {
      set?.delete(handler as (payload: never) => void);
    };
  }

  emit<K extends keyof Events>(event: K, payload: Events[K]): void {
    const set = this.handlers.get(event);
    if (!set) {
      return;
    }
    for (const handler of [...set]) {
      (handler as (p: Events[K]) => void)(payload);
    }
  }

  clear(): void {
    this.handlers.clear();
  }
}
