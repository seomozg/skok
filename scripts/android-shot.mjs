#!/usr/bin/env node
/**
 * Снимает скриншот с подключённого телефона через adb.
 *
 * Использование: node scripts/android-shot.mjs [out.png]
 */
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';

const ADB = process.env.ADB_PATH ?? 'adb';
const out = process.argv[2] ?? '.tmp-android.png';

// exec-out отдаёт «сырой» PNG без подмены \n на \r\n — в отличие от
// adb shell screencap, где вывод проходит через текстовый слой.
const png = execFileSync(ADB, ['exec-out', 'screencap', '-p'], {
  encoding: 'buffer',
  maxBuffer: 64 * 1024 * 1024,
});

if (png.length < 8 || png.subarray(1, 4).toString() !== 'PNG') {
  console.error('adb вернул не PNG');
  process.exit(1);
}

writeFileSync(out, png);
console.log(`снимок сохранён: ${out} (${png.length} байт)`);
