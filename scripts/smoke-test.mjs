/**
 * Smoke-тест в headless Chrome через CDP.
 *
 * Запускает собранное приложение с фейковой камерой (--use-fake-device-for-media-stream),
 * нажимает кнопку первой игры и проверяет, что:
 *  - приложение отрендерилось без ошибок;
 *  - камера и модель MediaPipe инициализировались;
 *  - игровой экран и HUD появились, таймер идёт.
 *
 * Запуск: node scripts/smoke-test.mjs
 */
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { setTimeout as delay } from 'node:timers/promises';

const CHROME_CANDIDATES = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
];

const APP_URL = process.env.SMOKE_URL ?? 'http://localhost:4173/';
const PORT = 9333;

const chromePath = CHROME_CANDIDATES.find((path) => existsSync(path));
if (!chromePath) {
  console.error('Не найден Chrome/Edge для smoke-теста.');
  process.exit(2);
}

const chrome = spawn(chromePath, [
  '--headless=new',
  `--remote-debugging-port=${PORT}`,
  '--no-sandbox',
  '--disable-gpu',
  '--use-fake-device-for-media-stream',
  '--use-fake-ui-for-media-stream',
  '--autoplay-policy=no-user-gesture-required',
  '--user-data-dir=.tmp-chrome-profile',
  'about:blank',
]);

chrome.stderr.on('data', () => {});

async function waitForDevtools() {
  for (let i = 0; i < 60; i += 1) {
    try {
      const response = await fetch(`http://127.0.0.1:${PORT}/json/version`);
      if (response.ok) {
        return await response.json();
      }
    } catch {
      /* сервер ещё не поднялся */
    }
    await delay(500);
  }
  throw new Error('DevTools не поднялся');
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

async function main() {
  const version = await waitForDevtools();
  // Подключаемся к браузеру (browser-level), чтобы иметь домен Browser.*
  // и подключиться к вкладке через плоскую сессию.
  const browserWs = await connect(version.webSocketDebuggerUrl);
  const browser = new CdpSession(browserWs);

  const { targetId } = await browser.send('Target.createTarget', { url: APP_URL });
  const { sessionId } = await browser.send('Target.attachToTarget', {
    targetId,
    flatten: true,
  });

  const session = new CdpSession(browserWs);
  await session.send('Runtime.enable', {}, sessionId);
  await session.send('Log.enable', {}, sessionId);
  await session.send('Page.enable', {}, sessionId);

  // Подменяем камеру на синтетический видеопоток с canvas:
  // fake-device в headless Chrome на этой машине не стартует (NotReadableError),
  // а нам важно проверить конвейер камера → MediaPipe → игра → рендер.
  await session.send(
    'Page.addScriptToEvaluateOnNewDocument',
    {
      source: `
        (() => {
          const canvas = document.createElement('canvas');
          canvas.width = 640;
          canvas.height = 480;
          const ctx = canvas.getContext('2d');
          let frame = 0;
          const draw = () => {
            frame += 1;
            ctx.fillStyle = '#123456';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            ctx.fillStyle = '#5eead4';
            ctx.beginPath();
            ctx.arc(canvas.width / 2, canvas.height / 2, 40 + (frame % 30), 0, Math.PI * 2);
            ctx.fill();
            requestAnimationFrame(draw);
          };
          draw();
          const fakeStream = canvas.captureStream(30);
          const fakeTracks = fakeStream.getVideoTracks();
          navigator.mediaDevices.getUserMedia = async () => fakeStream;
          Object.defineProperty(navigator.mediaDevices, 'enumerateDevices', {
            value: async () => fakeTracks.map((track) => ({
              kind: 'videoinput',
              label: 'Synthetic Camera',
              deviceId: 'fake',
              groupId: 'fake',
              toJSON: () => ({}),
            })),
          });
        })();
      `,
    },
    sessionId,
  );

  // Явно выдаём разрешение на камеру для origin приложения:
  // headless Chrome игнорирует --use-fake-ui-for-media-stream.
  try {
    await browser.send('Browser.grantPermissions', {
      origin: new URL(APP_URL).origin,
      permissions: ['videoCapture'],
    });
  } catch (error) {
    console.log('grantPermissions недоступно:', error.message);
  }

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

  // Диагностика доступа к камере: точный код ошибки getUserMedia.
  const cameraProbe = await evaluate(`(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true });
      const track = stream.getVideoTracks()[0];
      const settings = track ? track.getSettings() : null;
      stream.getTracks().forEach((t) => t.stop());
      return { ok: true, settings };
    } catch (error) {
      return { ok: false, name: error.name, message: error.message };
    }
  })()`);
  console.log('getUserMedia:', JSON.stringify(cameraProbe));

  const menuTitle = await evaluate("document.querySelector('.menu__title')?.textContent ?? ''");
  console.log('меню:', JSON.stringify(menuTitle));

  const gameButtons = await evaluate("document.querySelectorAll('.button--game').length");
  console.log('кнопок игр:', gameButtons);

  await evaluate("document.querySelector('.button--game')?.click()");
  await delay(20000);

  const state = await evaluate(`(() => ({
    hud: document.querySelector('.hud__title')?.textContent ?? null,
    score: document.querySelector('.hud__score')?.textContent ?? null,
    timer: document.querySelector('.hud__timer')?.textContent ?? null,
    fps: document.querySelector('.hud__fps')?.textContent ?? null,
    canvas: (() => { const c = document.querySelector('canvas'); return c ? { w: c.width, h: c.height } : null; })(),
    error: document.querySelector('.error__message')?.textContent ?? null,
  }))()`);
  console.log('состояние:', JSON.stringify(state));

  // Вторая игра (Приседания): проверяем калибровку и подсказку.
  await evaluate("document.querySelector('.button--ghost')?.click()");
  await delay(1500);
  await evaluate("[...document.querySelectorAll('.button--game')][1]?.click()");
  await delay(12000);

  const squatState = await evaluate(`(() => ({
    hud: document.querySelector('.hud__title')?.textContent ?? null,
    hint: document.querySelector('.hud__hint')?.textContent ?? null,
    timer: document.querySelector('.hud__timer')?.textContent ?? null,
    error: document.querySelector('.error__message')?.textContent ?? null,
  }))()`);
  console.log('приседания:', JSON.stringify(squatState));

  const consoleErrors = session.events
    .filter((event) => event.method === 'Runtime.consoleAPICalled' && event.params?.type === 'error')
    .map((event) => event.params.args.map((arg) => arg.value ?? arg.description).join(' '));
  const exceptions = session.events
    .filter((event) => event.method === 'Runtime.exceptionThrown')
    .map((event) => event.params?.exceptionDetails?.text ?? 'exception');

  console.log('ошибки консоли:', consoleErrors.length ? consoleErrors : 'нет');
  console.log('исключения:', exceptions.length ? exceptions : 'нет');

  browserWs.close();

  const ok =
    state.hud !== null &&
    state.error === null &&
    squatState.hud !== null &&
    squatState.error === null &&
    exceptions.length === 0;
  console.log(ok ? 'SMOKE OK' : 'SMOKE FAILED');
  chrome.kill();
  process.exit(ok ? 0 : 1);
}

main().catch((error) => {
  console.error(error);
  chrome.kill();
  process.exit(1);
});
