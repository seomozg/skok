import { describe, expect, it } from 'vitest';
import { CameraError, describeCameraError } from './cameraService';

describe('describeCameraError', () => {
  it('объясняет отказ в доступе', () => {
    const message = describeCameraError(new CameraError('permission-denied', 'x'));
    expect(message).toMatch(/запрещён/i);
  });

  it('объясняет отсутствие камеры', () => {
    const message = describeCameraError(new CameraError('not-found', 'x'));
    expect(message).toMatch(/не найдена/i);
  });

  it('объясняет занятую камеру и предлагает повторить', () => {
    const message = describeCameraError(new CameraError('not-readable', 'x'));
    expect(message).toMatch(/занята/i);
    expect(message).toMatch(/Попробовать снова/i);
  });

  it('объясняет небезопасный контекст', () => {
    const message = describeCameraError(new CameraError('insecure-context', 'x'));
    expect(message).toMatch(/HTTPS/i);
  });

  it('для неизвестной ошибки даёт общий текст', () => {
    const message = describeCameraError(new Error('что-то'));
    expect(message.length).toBeGreaterThan(0);
    expect(message).not.toContain('undefined');
  });
});
