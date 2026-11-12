import { FilesetResolver, PoseLandmarker } from '@mediapipe/tasks-vision';
import { emptyPoseFrame, type PoseDetector } from './poseDetector';
import type { Landmark, PoseFrame } from '../../domain/pose/poseTypes';

export interface MediaPipePoseDetectorOptions {
  /** Путь к .task файлу модели (локальный или CDN). */
  modelAssetPath?: string;
  /** Путь к каталогу с wasm-файлами MediaPipe. */
  wasmPath?: string;
  /** Использовать GPU-делегат (fallback на CPU при ошибке). */
  useGpu?: boolean;
}

const DEFAULT_MODEL_PATH = '/models/pose_landmarker_lite.task';
const DEFAULT_WASM_PATH = '/mediapipe/wasm';

/**
 * Детектор поз на базе MediaPipe Pose Landmarker.
 *
 * Ресурсы по умолчанию берутся локально (public/models, public/mediapipe),
 * чтобы приложение полностью работало офлайн и не отправляло ничего наружу.
 */
export class MediaPipePoseDetector implements PoseDetector {
  private landmarker: PoseLandmarker | null = null;
  private initPromise: Promise<void> | null = null;

  constructor(private readonly options: MediaPipePoseDetectorOptions = {}) {}

  isReady(): boolean {
    return this.landmarker !== null;
  }

  initialize(): Promise<void> {
    if (this.initPromise) {
      return this.initPromise;
    }
    this.initPromise = this.createLandmarker();
    return this.initPromise;
  }

  detect(source: HTMLVideoElement, timestampMs: number): PoseFrame {
    const landmarker = this.landmarker;
    if (!landmarker) {
      return emptyPoseFrame(timestampMs);
    }
    const result = landmarker.detectForVideo(source, timestampMs);
    const raw = result.landmarks?.[0];
    if (!raw || raw.length === 0) {
      return emptyPoseFrame(timestampMs);
    }
    const landmarks: Landmark[] = raw.map((point) => ({
      x: point.x,
      y: point.y,
      z: point.z ?? 0,
      visibility: point.visibility ?? 1,
    }));
    return { landmarks, timestamp: timestampMs, empty: false };
  }

  close(): void {
    this.landmarker?.close();
    this.landmarker = null;
    this.initPromise = null;
  }

  private async createLandmarker(): Promise<void> {
    const vision = await FilesetResolver.forVisionTasks(
      this.options.wasmPath ?? DEFAULT_WASM_PATH,
    );
    const baseOptions = {
      modelAssetPath: this.options.modelAssetPath ?? DEFAULT_MODEL_PATH,
    };

    try {
      this.landmarker = await PoseLandmarker.createFromOptions(vision, {
        baseOptions: { ...baseOptions, delegate: 'GPU' },
        runningMode: 'VIDEO',
        numPoses: 1,
        minPoseDetectionConfidence: 0.5,
        minPosePresenceConfidence: 0.5,
        minTrackingConfidence: 0.5,
      });
    } catch (error) {
      // GPU-делегат недоступен (старый мобильный/браузер) — пробуем CPU.
      if (this.options.useGpu === false) {
        throw error;
      }
      this.landmarker = await PoseLandmarker.createFromOptions(vision, {
        baseOptions: { ...baseOptions, delegate: 'CPU' },
        runningMode: 'VIDEO',
        numPoses: 1,
      });
    }
  }
}
