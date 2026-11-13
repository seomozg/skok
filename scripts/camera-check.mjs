/**
 * Проверка работы с камерой в реальном браузере (headless Chrome).
 *
 * Проверяет настоящий путь getUserMedia → <video> → MediaPipe:
 *  - getUserMedia отдаёт живой поток с кадрами;
 *  - <video> реально проигрывает кадры (currentTime растёт);
 *  - детектор MediaPipe отрабатывает без ошибок;
 *  - приложение доходит до игрового экрана, HUD и FPS работают.
 *
 * Запуск: node scripts/camera-check.mjs
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
const PORT = Number(process.env.SMOKE_PORT ?? 9334);
const PROFILE_DIR = join(tmpdir(), `skok-camera-check-${process.pid}`);

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

/**
 * Завершает ТОЛЬКО запущенный нами экземпляр браузера (по PID и пути профиля).
 * Обычный браузер пользователя не затрагивается.
 */
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

  // 1. Настоящий getUserMedia: без подмены API, только реальная камера.
  const camera = await evaluate(`(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true });
      const track = stream.getVideoTracks()[0];
      const settings = track.getSettings();
      const devices = await navigator.mediaDevices.enumerateDevices();
      const probe = document.createElement('video');
      probe.srcObject = stream;
      probe.muted = true;
      await probe.play();
      await new Promise((r) => setTimeout(r, 1000));
      const t1 = probe.currentTime;
      await new Promise((r) => setTimeout(r, 1000));
      const t2 = probe.currentTime;
      stream.getTracks().forEach((t) => t.stop());
      return {
        ok: true,
        label: track.label,
        settings,
        devices: devices.map((d) => ({ kind: d.kind, label: d.label })),
        framesAdvance: t2 > t1,
        currentTime: t2,
      };
    } catch (error) {
      return { ok: false, name: error.name, message: error.message };
    }
  })()`);
  console.log('1) камера:', JSON.stringify(camera));

  // 2. Приложение: запускаем игру и проверяем детектор и HUD.
  await evaluate("document.querySelector('.button--game')?.click()");
  await delay(15000);

  const app = await evaluate(`(() => ({
    hud: document.querySelector('.hud__title')?.textContent ?? null,
    fps: document.querySelector('.hud__fps')?.textContent ?? null,
    timer: document.querySelector('.hud__timer')?.textContent ?? null,
    error: document.querySelector('.error__message')?.textContent ?? null,
    video: (() => { const v = document.querySelector('video'); return v ? { w: v.videoWidth, h: v.videoHeight, t: v.currentTime } : null; })(),
  }))()`);
  console.log('2) приложение:', JSON.stringify(app));

  // 2a. Список камер доступен после запуска (браузер раскрыл подписи).
  const cameraOptions = await evaluate(`(() => {
    const select = document.querySelector('.camera-selector__select');
    if (!select) return { present: false, options: [] };
    return {
      present: true,
      options: [...select.options].map((o) => o.textContent),
      value: select.value,
    };
  })()`);
  console.log('2a) выбор камеры:', JSON.stringify(cameraOptions));

  // 2b. Повторный запуск не должен падать с «камера занята».
  await evaluate("document.querySelector('.button--ghost')?.click()");
  await delay(2000);
  await evaluate("document.querySelector('.button--game')?.click()");
  await delay(10000);
  const restarted = await evaluate(`(() => ({
    hud: document.querySelector('.hud__title')?.textContent ?? null,
    error: document.querySelector('.error__message')?.textContent ?? null,
  }))()`);
  console.log('2b) повторный запуск:', JSON.stringify(restarted));

  // 3. Диагностика детекции на живой камере.
  const diagnostics = await evaluate('window.__skokDiagnostics ?? null');
  console.log('3) детекция:', JSON.stringify(diagnostics));

  // 3a. Исходный кадр камеры БЕЗ обработки — видно истинную ориентацию.
  const rawFrame = await evaluate(`(() => {
    const video = document.querySelector('video');
    if (!video || !video.videoWidth) return null;
    const c = document.createElement('canvas');
    c.width = video.videoWidth;
    c.height = video.videoHeight;
    c.getContext('2d').drawImage(video, 0, 0);
    return c.toDataURL('image/png');
  })()`);
  if (rawFrame) {
    const rawPath = join(process.cwd(), '.tmp-raw-camera.png');
    writeFileSync(rawPath, Buffer.from(rawFrame.split(',')[1], 'base64'));
    console.log('3a) исходный кадр камеры:', rawPath);
  }

  const exceptions = session.events
    .filter((event) => event.method === 'Runtime.exceptionThrown')
    .map((event) => event.params?.exceptionDetails?.text ?? 'exception');
  console.log('4) исключения:', exceptions.length ? exceptions : 'нет');

  // Скриншот живого кадра со скелетом.
  const screenshot = await session.send(
    'Page.captureScreenshot',
    { format: 'png', captureBeyondViewport: false },
    sessionId,
  );
  if (screenshot?.data) {
    const shotPath = join(process.cwd(), '.tmp-camera-screenshot.png');
    writeFileSync(shotPath, Buffer.from(screenshot.data, 'base64'));
    console.log('скриншот:', shotPath);
  }

  browserWs.close();

  const checks = [];
  const add = (name, passed, detail) => {
    checks.push({ name, passed });
    console.log(`${passed ? 'OK  ' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
  };

  add('камера отдаёт поток', camera.ok === true, camera.label);
  add('кадры идут (currentTime растёт)', camera.framesAdvance === true);
  add('игра запущена', app.hud !== null, app.hud ?? '');
  add('FPS-счётчик работает', Boolean(app.fps), app.fps ?? '');
  add('ошибок приложения нет', app.error === null, app.error ?? '');
  add('список камер доступен', cameraOptions.present === true, `${cameraOptions.options.length} шт.`);
  add(
    'повторный запуск без ошибки «камера занята»',
    restarted.hud !== null && restarted.error === null,
    restarted.error ?? restarted.hud ?? '',
  );
  add('исключений нет', exceptions.length === 0);
  if (diagnostics) {
    add(
      'детектор обработал кадры',
      diagnostics.frames > 10,
      `${diagnostics.frames} кадров, человек в кадре: ${diagnostics.personDetected}`,
    );
  }

  const failed = checks.filter((check) => !check.passed);
  console.log(failed.length === 0 ? '\nCAMERA CHECK OK' : '\nCAMERA CHECK FAILED');
  cleanup();
  process.exit(failed.length === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error(error);
  cleanup();
  process.exit(1);
});
