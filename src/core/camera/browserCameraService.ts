import {
  CameraError,
  type CameraConstraints,
  type CameraDevice,
  type CameraService,
  type CameraStream,
} from './cameraService';

/**
 * Реализация CameraService поверх navigator.mediaDevices.getUserMedia.
 * Единственное место в приложении, которое знает о браузерном API камеры.
 */
export class BrowserCameraService implements CameraService {
  private stream: MediaStream | null = null;

  isActive(): boolean {
    return this.stream !== null;
  }

  async start(constraints: CameraConstraints = {}): Promise<CameraStream> {
    if (!navigator.mediaDevices?.getUserMedia) {
      throw new CameraError('unsupported', 'getUserMedia не поддерживается');
    }
    if (!window.isSecureContext) {
      throw new CameraError('insecure-context', 'Небезопасный контекст');
    }

    // Если камера уже запущена — переиспользуем поток.
    if (this.stream) {
      return this.toCameraStream(this.stream);
    }

    const video: MediaTrackConstraints = {
      width: { ideal: constraints.width ?? 1280 },
      height: { ideal: constraints.height ?? 720 },
    };
    if (constraints.deviceId) {
      video.deviceId = { exact: constraints.deviceId };
    } else {
      video.facingMode = constraints.facingMode ?? 'user';
    }

    try {
      this.stream = await navigator.mediaDevices.getUserMedia({ video, audio: false });
    } catch (error) {
      // Выбранная камера занята — пробуем другие доступные устройства.
      const fallback = await this.startWithFallbackDevice(video, error);
      if (fallback) {
        this.stream = fallback;
      } else {
        throw this.toCameraError(error);
      }
    }

    return this.toCameraStream(this.stream);
  }

  /**
   * Перебирает остальные камеры, если основная недоступна.
   * Возвращает поток первой устройства, которое удалось открыть.
   */
  private async startWithFallbackDevice(
    video: MediaTrackConstraints,
    originalError: unknown,
  ): Promise<MediaStream | null> {
    // deviceId с exact нельзя переиспользовать для другого устройства.
    const requestedId =
      typeof video.deviceId === 'object' && !Array.isArray(video.deviceId)
        ? video.deviceId.exact
        : undefined;
    const devices = await this.listDevices();

    for (const device of devices) {
      if (device.deviceId === requestedId) {
        continue;
      }
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { ...video, deviceId: { exact: device.deviceId }, facingMode: undefined },
          audio: false,
        });
        return stream;
      } catch {
        /* это устройство тоже занято — пробуем следующее */
      }
    }

    // Устройств нет или все заняты — возвращаем исходную ошибку.
    void originalError;
    return null;
  }

  async listDevices(): Promise<CameraDevice[]> {
    if (!navigator.mediaDevices?.enumerateDevices) {
      return [];
    }
    const devices = await navigator.mediaDevices.enumerateDevices();
    return devices
      .filter((device) => device.kind === 'videoinput')
      .map((device, index) => ({
        deviceId: device.deviceId,
        label: device.label || `Камера ${index + 1}`,
        isFrontFacing: /front|user|face|фронт/i.test(device.label),
      }));
  }

  stop(): void {
    if (!this.stream) {
      return;
    }
    for (const track of this.stream.getTracks()) {
      track.stop();
    }
    this.stream = null;
  }

  private toCameraStream(stream: MediaStream): CameraStream {
    const settings = stream.getVideoTracks()[0]?.getSettings();
    const width = settings?.width ?? 1280;
    const height = settings?.height ?? 720;
    return { stream, aspectRatio: height === 0 ? 16 / 9 : width / height };
  }

  private toCameraError(error: unknown): CameraError {
    if (error instanceof CameraError) {
      return error;
    }
    const name = (error as { name?: string })?.name;
    switch (name) {
      case 'NotAllowedError':
      case 'SecurityError':
        return new CameraError('permission-denied', 'Доступ к камере запрещён', error);
      case 'NotFoundError':
      case 'DevicesNotFoundError':
        return new CameraError('not-found', 'Камера не найдена', error);
      case 'NotReadableError':
      case 'TrackStartError':
        return new CameraError('not-readable', 'Камера занята', error);
      default:
        return new CameraError('unknown', 'Неизвестная ошибка камеры', error);
    }
  }
}
