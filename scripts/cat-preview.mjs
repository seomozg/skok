/**
 * Рендерит кота в PNG — визуальная проверка рисунка без камеры.
 *
 * Кот рисуется примитивами canvas, поэтому его можно отрисовать в
 * headless Chrome и посмотреть на результат: не нужен ни телефон,
 * ни человек в кадре.
 *
 * Запуск: node scripts/cat-preview.mjs
 */
import { execFileSync, spawn } from 'node:child_process';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

const CHROME_CANDIDATES = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
];

const PORT = Number(process.env.CAT_PORT ?? 9444);
const OUT_DIR = process.env.OUT_DIR ?? '.tmp-cat';
const PROFILE_DIR = join(tmpdir(), `skok-cat-profile-${process.pid}`);
const ROOT = process.cwd();

const chromePath = CHROME_CANDIDATES.find((path) => existsSync(path));
if (!chromePath) {
  console.error('Не найден Chrome/Edge для рендера кота.');
  process.exit(2);
}

mkdirSync(OUT_DIR, { recursive: true });

// 1. Собираем модуль кота в обычный JS, чтобы грузить его в страницу.
const bundlePath = join(ROOT, OUT_DIR, 'cat.bundle.js');
const esbuild = join(ROOT, 'node_modules', '.bin', 'esbuild.cmd');
// На Windows .cmd не запускается через execFileSync без shell.
execFileSync(
  existsSync(esbuild) ? esbuild : 'esbuild',
  [
    'src/render/catRenderer.ts',
    '--bundle',
    '--format=iife',
    '--global-name=SkokCat',
    `--outfile=${bundlePath}`,
  ],
  { stdio: 'inherit', shell: true },
);

writeFileSync(
  join(ROOT, OUT_DIR, 'index.html'),
  `<!doctype html>
<html><head><meta charset="utf-8"><style>
  body { margin: 0; background: #0f1020; color: #f8fafc;
         font: 20px system-ui, sans-serif; }
  .grid { display: grid; grid-template-columns: repeat(2, 450px); gap: 12px; padding: 12px; }
  figure { margin: 0; }
  figcaption { padding: 6px 4px; }
</style></head>
<body>
<div class="grid" id="grid"></div>
<script src="./cat.bundle.js"></script>
<script>
  const grid = document.getElementById('grid');

  function cell(label, phase, progress) {
    const figure = document.createElement('figure');
    const canvas = document.createElement('canvas');
    canvas.width = 450;
    canvas.height = 340;
    const caption = document.createElement('figcaption');
    caption.textContent = label;
    figure.appendChild(canvas);
    figure.appendChild(caption);
    grid.appendChild(figure);

    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#0f1020';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Имитация головы игрока: серый круг, на ней «сидит» кот.
    const headX = 225;
    const headY = 230;
    ctx.fillStyle = '#94a3b8';
    ctx.beginPath();
    ctx.arc(headX, headY, 62, 0, Math.PI * 2);
    ctx.fill();

    const size = 140;
    SkokCat.drawCat(ctx, {
      x: headX,
      y: headY - size * 0.35,
      size,
      phase,
      progress,
    });
  }

  cell('idle (покой)', 'idle', 0);
  cell('hit 0.25 (удар вниз)', 'hit', 0.25);
  cell('hit 0.55 (удар вниз)', 'hit', 0.55);
  cell('recover (отскок)', 'recover', 1);

  window.__ready = true;
</script>
</body></html>`,
);

const chrome = spawn(chromePath, [
  '--headless=new',
  `--remote-debugging-port=${PORT}`,
  '--no-sandbox',
  '--disable-gpu',
  '--hide-scrollbars',
  `--user-data-dir=${PROFILE_DIR}`,
  'about:blank',
]);

chrome.stderr.on('data', () => {});

function cleanup() {
  try {
    chrome.kill();
  } catch {
    /* уже завершён */
  }
  try {
    rmSync(PROFILE_DIR, { recursive: true, force: true, maxRetries: 3 });
  } catch {
    /* профиль мог остаться заблокированным */
  }
}

async function waitForDevtools() {
  for (let i = 0; i < 60; i += 1) {
    try {
      const response = await fetch(`http://127.0.0.1:${PORT}/json/version`);
      if (response.ok) {
        return;
      }
    } catch {
      /* сервер ещё не поднялся */
    }
    await delay(500);
  }
  throw new Error('DevTools не поднялся');
}

async function main() {
  await waitForDevtools();

  const response = await fetch(`http://127.0.0.1:${PORT}/json/new?about:blank`, {
    method: 'PUT',
  });
  const target = await response.json();
  const ws = new WebSocket(target.webSocketDebuggerUrl);

  let nextId = 1;
  const pending = new Map();
  const send = (method, params = {}) =>
    new Promise((resolve, reject) => {
      const id = nextId++;
      pending.set(id, { resolve, reject });
      ws.send(JSON.stringify({ id, method, params }));
    });

  await new Promise((resolve, reject) => {
    ws.onopen = resolve;
    ws.onerror = reject;
  });

  ws.onmessage = (event) => {
    const message = JSON.parse(event.data);
    if (message.id && pending.has(message.id)) {
      const { resolve, reject } = pending.get(message.id);
      pending.delete(message.id);
      if (message.error) {
        reject(new Error(message.error.message));
      } else {
        resolve(message.result);
      }
    }
  };

  const pageUrl = `file:///${join(ROOT, OUT_DIR, 'index.html').replace(/\\/g, '/')}`;
  await send('Page.enable');
  // Задаём размер вьюпорта, чтобы в снимок попали все четыре фазы.
  await send('Emulation.setDeviceMetricsOverride', {
    width: 940,
    height: 780,
    deviceScaleFactor: 1,
    mobile: false,
  });
  await send('Page.navigate', { url: pageUrl });
  await delay(1500);

  const shot = await send('Page.captureScreenshot', { format: 'png' });
  const outFile = join(ROOT, OUT_DIR, 'cat.png');
  writeFileSync(outFile, Buffer.from(shot.data, 'base64'));
  console.log(`Кот отрисован: ${outFile}`);

  ws.close();
}

try {
  await main();
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
} finally {
  cleanup();
}
