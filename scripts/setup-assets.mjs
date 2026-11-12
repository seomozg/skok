/**
 * Подготовка офлайн-ресурсов MediaPipe:
 *  - копирование wasm-файлов из node_modules в public/mediapipe/wasm;
 *  - скачивание модели позы в public/models (если ещё не скачана).
 *
 * Запускается автоматически после npm install (postinstall).
 * Результат не коммитится в git — см. .gitignore.
 */
import { createWriteStream } from 'node:fs';
import { cp, mkdir, stat } from 'node:fs/promises';
import { pipeline } from 'node:stream/promises';
import { Readable } from 'node:stream';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));

const WASM_SOURCE = join(root, 'node_modules', '@mediapipe', 'tasks-vision', 'wasm');
const WASM_TARGET = join(root, 'public', 'mediapipe', 'wasm');
const MODELS_TARGET = join(root, 'public', 'models');

const MODEL = {
  name: 'pose_landmarker_lite.task',
  url:
    'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task',
};

async function exists(path) {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

async function copyWasm() {
  if (!(await exists(WASM_SOURCE))) {
    console.warn('[assets] @mediapipe/tasks-vision не найден — пропускаем wasm.');
    return;
  }
  await mkdir(WASM_TARGET, { recursive: true });
  await cp(WASM_SOURCE, WASM_TARGET, { recursive: true });
  console.log('[assets] wasm-файлы MediaPipe скопированы в public/mediapipe/wasm');
}

async function downloadModel() {
  await mkdir(MODELS_TARGET, { recursive: true });
  const target = join(MODELS_TARGET, MODEL.name);
  if (await exists(target)) {
    console.log('[assets] модель уже скачана');
    return;
  }
  console.log(`[assets] скачиваем ${MODEL.name}…`);
  const response = await fetch(MODEL.url);
  if (!response.ok) {
    throw new Error(`Не удалось скачать модель: HTTP ${response.status}`);
  }
  await pipeline(Readable.fromWeb(response.body), createWriteStream(target));
  console.log('[assets] модель сохранена в public/models');
}

await copyWasm();
await downloadModel();
