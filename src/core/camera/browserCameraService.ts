import {
  CameraError,
  type CameraConstraints,
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

    const mediaConstraints: MediaStreamConstraints = {
      video: {
        facingMode: constraints.facingMode ?? 'user',
        width: { ideal: constraints.width ?? 1280 },
        height: { ideal: constraints.height ?? 720 },
      },
      audio: false,
    };

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia(mediaConstraints);
    } catch (error) {
      throw this.toCameraError(error);
    }

    this.stream = stream;
    return this.toCameraStream(stream);
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
