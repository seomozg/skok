/**
 * Абстракция доступа к камере (Single Responsibility + Dependency Inversion).
 *
 * Реализация в браузере — BrowserCameraService.
 * Реализация для мобильного приложения (Capacitor) может подменять
 * только этот слой, не затрагивая игры и рендер.
 */

export interface CameraConstraints {
  facingMode?: 'user' | 'environment';
  width?: number;
  height?: number;
  /** Конкретное устройство (deviceId). Если задано — используется вместо facingMode. */
  deviceId?: string;
}

export interface CameraStream {
  /** Готовый к воспроизведению видеопоток. */
  readonly stream: MediaStream;
  /** Соотношение сторон потока (для расчёта letterbox-области). */
  readonly aspectRatio: number;
}

export interface CameraService {
  /** Запрашивает доступ и возвращает поток. Бросает CameraError при отказе. */
  start(constraints?: CameraConstraints): Promise<CameraStream>;
  /** Освобождает ресурсы камеры. Идемпотентно. */
  stop(): void;
  /** true, если камера активна. */
  isActive(): boolean;
  /** Перечисляет доступные видеокамеры. */
  listDevices(): Promise<CameraDevice[]>;
}

/** Описание видеокамеры, доступной системе. */
export interface CameraDevice {
  deviceId: string;
  label: string;
  /** true, если это камера, смотрящая на пользователя (фронтальная). */
  isFrontFacing: boolean;
}

export type CameraErrorKind =
  | 'permission-denied'
  | 'not-found'
  | 'not-readable'
  | 'insecure-context'
  | 'unsupported'
  | 'unknown';

export class CameraError extends Error {
  constructor(
    readonly kind: CameraErrorKind,
    message: string,
    readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'CameraError';
  }
}

/** Понятные сообщения для пользователя. */
export function describeCameraError(error: unknown): string {
  if (error instanceof CameraError) {
    switch (error.kind) {
      case 'permission-denied':
        return 'Доступ к камере запрещён. Разрешите использование камеры в настройках браузера и попробуйте снова.';
      case 'not-found':
        return 'Камера не найдена. Подключите камеру и обновите страницу.';
      case 'not-readable':
        return 'Камера занята другим приложением или другой вкладкой. Закройте лишние вкладки Skok и другие приложения, использующие камеру, затем нажмите «Попробовать снова».';
      case 'insecure-context':
        return 'Камера доступна только по HTTPS (или на localhost).';
      case 'unsupported':
        return 'Браузер не поддерживает доступ к камере.';
      default:
        return 'Не удалось включить камеру. Попробуйте снова.';
    }
  }
  return 'Не удалось включить камеру. Попробуйте снова.';
}
