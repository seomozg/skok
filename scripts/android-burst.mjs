/**
 * Снимает серию скриншотов с телефона, чтобы поймать короткий эффект.
 *
 * Использование:
 *   node scripts/android-burst.mjs [seconds] [intervalMs] [outPrefix]
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';

const ADB = process.env.ADB_PATH ?? 'adb';
const SECONDS = Number(process.argv[2] ?? 10);
const INTERVAL = Number(process.argv[3] ?? 250);
const PREFIX = process.argv[4] ?? '.tmp-android/burst';
const OUT_DIR = PREFIX.slice(0, PREFIX.lastIndexOf('/') || 0);

mkdirSync(OUT_DIR, { recursive: true });

const deadline = Date.now() + SECONDS * 1000;
let index = 0;

while (Date.now() < deadline) {
  try {
    const png = execFileSync(ADB, ['exec-out', 'screencap', '-p'], {
      encoding: 'buffer',
      maxBuffer: 64 * 1024 * 1024,
    });
    if (png.length > 8 && png.subarray(1, 4).toString() === 'PNG') {
      const file = `${PREFIX}-${String(index).padStart(3, '0')}.png`;
      writeFileSync(file, png);
      index += 1;
    }
  } catch {
    /* кадр не удался — пробуем снова */
  }
  await new Promise((r) => setTimeout(r, INTERVAL));
}

console.log(`снято ${index} кадров в ${PREFIX}-*.png`);
