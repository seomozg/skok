/**
 * Платформенный слой: скрывает различия веба и мобильного приложения.
 *
 * Сейчас используется только для определения окружения и подсказок,
 * но точка расширения (OCP) позволяет позже добавить native-возможности,
 * не трогая домен и игры.
 */

export type PlatformKind = 'web' | 'android' | 'ios';

export interface Platform {
  readonly kind: PlatformKind;
  /** true, если приложение запущено как PWA (установлено, standalone-режим). */
  readonly isStandalone: boolean;
  /** Подсказка по повороту экрана. */
  orientationHint: () => string | null;
}

/** Определение платформы по User-Agent / Capacitor-контексту. */
export function detectPlatform(): Platform {
  const cap = (globalThis as { Capacitor?: { getPlatform?: () => string } }).Capacitor;
  const capacitorPlatform = cap?.getPlatform?.();

  if (capacitorPlatform === 'android') {
    return { kind: 'android', isStandalone: true, orientationHint: () => null };
  }
  if (capacitorPlatform === 'ios') {
    return { kind: 'ios', isStandalone: true, orientationHint: () => null };
  }

  const isStandalone =
    typeof window !== 'undefined' &&
    (window.matchMedia?.('(display-mode: standalone)').matches ||
      (window.navigator as { standalone?: boolean }).standalone === true);

  const isMobile = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
  const orientationHint = isMobile && !isStandalone
    ? 'Для игры удобнее повернуть телефон вертикально.'
    : null;

  return {
    kind: 'web',
    isStandalone,
    orientationHint: () => orientationHint,
  };
}
