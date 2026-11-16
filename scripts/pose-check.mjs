/**
 * Проверка распознавания позы на реальном человеке в браузере.
 *
 * Идея: в headless Chrome подменяем камеру на canvas, в который
 * нарисован человек с фотографии (public/fixtures/person.jpg).
 * MediaPipe работает с настоящими кадрами настоящего человека,
 * а скрипт читает результат детекции через window.__skokDiagnostics.
 *
 * Проверяет:
 *  - MediaPipe находит человека и 33 точки;
 *  - точки имеют разумную видимость;
 *  - углы коленей считаются в физиологическом диапазоне;
 *  - кисти определены (нужны для игры «СпайдерМэн»).
 *
 * Запуск: node scripts/pose-check.mjs
 * Требуется запущенный продакшн-сервер: SMOKE_URL=http://localhost:4173/
 */
import { execFileSync, spawn } from 'node:child_process';
import { existsSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

const CHROME_CANDIDATES = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
];

const APP_URL = process.env.SMOKE_URL ?? 'http://localhost:4173/?debug=1';
const PORT = Number(process.env.SMOKE_PORT ?? 9335);
const PROFILE_DIR = join(tmpdir(), `skok-pose-check-${process.pid}`);

const chromePath = CHROME_CANDIDATES.find((path) => existsSync(path));
if (!chromePath) {
  console.error('Не найден Chrome/Edge.');
  process.exit(2);
}

const chrome = spawn(chromePath, [
  '--headless=new',
  `--remote-debugging-port=${PORT}`,
  '--no-sandbox',
  '--disable-gpu',
  '--use-fake-ui-for-media-stream',
  '--autoplay-policy=no-user-gesture-required',
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
    const output = execFileSync(
      'powershell.exe',
      [
        '-NoProfile',
        '-Command',
        `Get-CimInstance Win32_Process -Filter "Name='chrome.exe' or Name='msedge.exe'" | Where-Object { $_.CommandLine -like '*${PROFILE_DIR}*' } | Select-Object -ExpandProperty ProcessId`,
      ],
      { encoding: 'utf8' },
    );
    for (const pid of output.split(/\s+/).filter(Boolean)) {
      execFileSync('taskkill.exe', ['/F', '/T', '/PID', pid], { stdio: 'ignore' });
    }
  } catch {
    /* дочерние процессы завершатся сами */
  }
  try {
    rmSync(PROFILE_DIR, { recursive: true, force: true, maxRetries: 3 });
  } catch {
    /* не критично */
  }
}

class CdpSession {
  constructor(ws) {
    this.ws = ws;
    this.id = 0;
    this.pending = new Map();
    this.events = [];
    ws.addEventListener('message', (event) => {
      const message = JSON.parse(event.data);
      if (message.id && this.pending.has(message.id)) {
        const { resolve, reject } = this.pending.get(message.id);
        this.pending.delete(message.id);
        if (message.error) {
          reject(new Error(message.error.message));
        } else {
          resolve(message.result);
        }
      } else if (message.method) {
        this.events.push(message);
      }
    });
  }

  send(method, params = {}, sessionId) {
    this.id += 1;
    const id = this.id;
    const payload = { id, method, params };
    if (sessionId) {
      payload.sessionId = sessionId;
    }
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify(payload));
    });
  }
}

async function connect(url) {
  const ws = new WebSocket(url);
  await new Promise((resolve, reject) => {
    ws.addEventListener('open', resolve, { once: true });
    ws.addEventListener('error', reject, { once: true });
  });
  return ws;
}

async function waitForDevtools() {
  for (let i = 0; i < 60; i += 1) {
    try {
      const response = await fetch(`http://127.0.0.1:${PORT}/json/version`);
      if (response.ok) {
        return await response.json();
      }
    } catch {
      /* ещё не поднялся */
    }
    await delay(500);
  }
  throw new Error('DevTools не поднялся');
}

async function main() {
  const version = await waitForDevtools();
  const browserWs = await connect(version.webSocketDebuggerUrl);
  const browser = new CdpSession(browserWs);

  const { targetId } = await browser.send('Target.createTarget', { url: APP_URL });
  const { sessionId } = await browser.send('Target.attachToTarget', {
    targetId,
    flatten: true,
  });
  const session = new CdpSession(browserWs);
  await session.send('Runtime.enable', {}, sessionId);
  await session.send('Page.enable', {}, sessionId);

  await browser.send('Browser.grantPermissions', {
    origin: new URL(APP_URL).origin,
    permissions: ['videoCapture'],
  });

  // Подменяем камеру на canvas с фотографией человека:
  // MediaPipe получает настоящие кадры настоящего человека.
  await session.send(
    'Page.addScriptToEvaluateOnNewDocument',
    {
      source: `
        (() => {
          const canvas = document.createElement('canvas');
          canvas.width = 640;
          canvas.height = 480;
          const ctx = canvas.getContext('2d');
          const image = new Image();
          image.src = '/fixtures/person.jpg';
          image.onload = () => {
            // Вписываем фото в кадр 4:3, сохраняя пропорции.
            const scale = Math.min(canvas.width / image.width, canvas.height / image.height);
            const w = image.width * scale;
            const h = image.height * scale;
            ctx.drawImage(image, (canvas.width - w) / 2, (canvas.height - h) / 2, w, h);
          };
          const stream = canvas.captureStream(30);
          navigator.mediaDevices.getUserMedia = async () => stream;
        })();
      `,
    },
    sessionId,
  );

  await session.send('Page.reload', { ignoreCache: true }, sessionId);
  await delay(4000);

  const evaluate = async (expression) => {
    const result = await session.send(
      'Runtime.evaluate',
      { expression, returnByValue: true, awaitPromise: true },
      sessionId,
    );
    if (result.exceptionDetails) {
      throw new Error(result.exceptionDetails.text ?? 'Ошибка выражения');
    }
    return result.result.value;
  };

  await evaluate("document.querySelector('.button--game')?.click()");
  await delay(15000);

  const diagnostics = await evaluate('window.__skokDiagnostics ?? null');
  console.log('диагностика детекции:', JSON.stringify(diagnostics, null, 2));

  const app = await evaluate(`(() => ({
    hud: document.querySelector('.hud__title')?.textContent ?? null,
    fps: document.querySelector('.hud__fps')?.textContent ?? null,
    error: document.querySelector('.error__message')?.textContent ?? null,
  }))()`);
  console.log('приложение:', JSON.stringify(app));

  // Проверяем, что скелет действительно нарисован на canvas:
  // ищем пиксели цвета скелета (#5eead4) среди непрозрачных.
  const skeletonPixels = await evaluate(`(() => {
    const canvas = document.querySelector('canvas');
    if (!canvas) return -1;
    const ctx = canvas.getContext('2d');
    const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    let count = 0;
    for (let i = 0; i < data.length; i += 4) {
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      if (g > 200 && r < 140 && b > 170 && b < 240) {
        count += 1;
      }
    }
    return count;
  })()`);
  console.log('пикселей скелета на canvas:', skeletonPixels);

  // Скриншот игрового экрана — визуальное подтверждение.
  const screenshot = await session.send(
    'Page.captureScreenshot',
    { format: 'png', captureBeyondViewport: false },
    sessionId,
  );
  if (screenshot?.data) {
    const shotPath = join(process.cwd(), '.tmp-pose-screenshot.png');
    writeFileSync(shotPath, Buffer.from(screenshot.data, 'base64'));
    console.log('скриншот:', shotPath);
  }

  browserWs.close();

  const checks = [];
  const add = (name, passed, detail) => {
    checks.push({ name, passed, detail });
    console.log(`${passed ? 'OK  ' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
  };

  add('человек обнаружен', diagnostics?.personDetected === true);
  add('найдено 33 точки', diagnostics?.pointCount === 33, `получено ${diagnostics?.pointCount}`);
  add(
    'видимость точек > 0.5',
    typeof diagnostics?.averageVisibility === 'number' && diagnostics.averageVisibility > 0.5,
    `средняя видимость ${diagnostics?.averageVisibility?.toFixed(2)}`,
  );
  add(
    'угол левого колена в диапазоне 60..200°',
    typeof diagnostics?.leftKneeAngle === 'number' &&
      diagnostics.leftKneeAngle > 60 &&
      diagnostics.leftKneeAngle < 200,
    `${diagnostics?.leftKneeAngle?.toFixed(1)}°`,
  );
  add(
    'угол правого колена в диапазоне 60..200°',
    typeof diagnostics?.rightKneeAngle === 'number' &&
      diagnostics.rightKneeAngle > 60 &&
      diagnostics.rightKneeAngle < 200,
    `${diagnostics?.rightKneeAngle?.toFixed(1)}°`,
  );
  add('левая кисть определена', diagnostics?.leftWrist !== null);
  add('правая кисть определена', diagnostics?.rightWrist !== null);
  add('обработано кадров > 10', diagnostics?.frames > 10, `${diagnostics?.frames} кадров`);
  add(
    'скелет нарисован на canvas',
    skeletonPixels > 200,
    `${skeletonPixels} пикселей цвета скелета`,
  );

  const failed = checks.filter((check) => !check.passed);
  console.log(failed.length === 0 ? '\nPOSE CHECK OK' : '\nPOSE CHECK FAILED');
  cleanup();
  process.exit(failed.length === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error(error);
  cleanup();
  process.exit(1);
});
