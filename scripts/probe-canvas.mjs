/**
 * Проба: принимает ли MediaPipe Pose Landmarker источник-канвас.
 *
 * Это ключевое допущение архитектуры поворота кадра: если MediaPipe умеет
 * детектировать на <canvas>, то картинку можно повернуть ОДИН раз в
 * offscreen-канвас и отдавать детектору и рендеру один и тот же объект.
 * Тогда скелет совпадает с картинкой по построению.
 *
 * Проба также выясняет:
 *  - как MediaPipe ведёт себя со встроенным rotationDegrees;
 *  - в какой системе координат приходят точки (в системе повёрнутого
 *    канваса или исходного).
 *
 * Запуск: node scripts/probe-canvas.mjs
 *   node scripts/probe-camera.mjs   — та же механика, но другая страница
 *
 * Страница выбирается переменной окружения PROBE_PAGE (по умолчанию
 * scripts/probe-canvas.html). Результат печатается в консоль, картинки
 * сохраняются как .tmp-probe-<имя>.png.
 */
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { extname, join, normalize } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

const CHROME_CANDIDATES = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
];

const PAGE_PORT = Number(process.env.PROBE_PORT ?? 9346);
const CDP_PORT = Number(process.env.PROBE_CDP_PORT ?? 9347);
// Страница пробы: --page=probe-rotate.html (по умолчанию probe-canvas.html).
const pageArgument = process.argv.find((argument) => argument.startsWith('--page='));
const PROBE_PAGE = pageArgument
  ? pageArgument.slice('--page='.length)
  : (process.env.PROBE_PAGE ?? 'probe-canvas.html');
const PROBE_QUERY = process.env.PROBE_QUERY ?? '';
const ROOT = process.cwd();

const chromePath = CHROME_CANDIDATES.find((path) => existsSync(path));
if (!chromePath) {
  console.error('Не найден Chrome/Edge.');
  process.exit(2);
}

/**
 * Раздаёт пробную страницу и локальные ресурсы MediaPipe.
 */
function startServer() {
  const server = createServer((request, response) => {
    const url = new URL(request.url ?? '/', 'http://localhost');
    let filePath;

    if (url.pathname === '/' || url.pathname === '/index.html') {
      filePath = join(ROOT, 'scripts', PROBE_PAGE);
    } else if (url.pathname === '/probe-lib.js') {
      filePath = join(ROOT, 'scripts', 'probe-lib.js');
    } else if (url.pathname === '/vision_bundle.mjs') {
      filePath = join(ROOT, 'node_modules', '@mediapipe', 'tasks-vision', 'vision_bundle.mjs');
    } else if (url.pathname.startsWith('/wasm/')) {
      filePath = join(ROOT, 'public', 'mediapipe', 'wasm', url.pathname.slice('/wasm/'.length));
    } else if (url.pathname.startsWith('/models/')) {
      filePath = join(ROOT, 'public', 'models', url.pathname.slice('/models/'.length));
    } else if (url.pathname.startsWith('/fixtures/')) {
      filePath = join(ROOT, 'public', 'fixtures', url.pathname.slice('/fixtures/'.length));
    } else {
      response.writeHead(404).end('not found');
      return;
    }

    try {
      const body = readFileSync(normalize(filePath));
      const types = {
        '.html': 'text/html; charset=utf-8',
        '.mjs': 'text/javascript; charset=utf-8',
        '.js': 'text/javascript; charset=utf-8',
        '.wasm': 'application/wasm',
        '.task': 'application/octet-stream',
        '.jpg': 'image/jpeg',
      };
      response.writeHead(200, {
        'Content-Type': types[extname(filePath)] ?? 'application/octet-stream',
      });
      response.end(body);
    } catch {
      response.writeHead(404).end('not found');
    }
  });

  return new Promise((resolve) => {
    server.listen(PAGE_PORT, () => resolve(server));
  });
}


class CdpSession {
  constructor(ws) {
    this.ws = ws;
    this.id = 0;
    this.pending = new Map();
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

function connect(url) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url);
    ws.addEventListener('open', () => resolve(ws));
    ws.addEventListener('error', reject);
  });
}

async function main() {
  const server = await startServer();
  const chrome = spawn(
    chromePath,
    [
      '--headless=new',
      `--remote-debugging-port=${CDP_PORT}`,
      '--no-sandbox',
      '--disable-gpu',
      // Авто-разрешение на камеру: реальное устройство подхватывается,
      // подмена потока не включается.
      '--use-fake-ui-for-media-stream',
      '--autoplay-policy=no-user-gesture-required',
      `--user-data-dir=${join(process.env.TEMP ?? '.', `skok-probe-${process.pid}`)}`,
      'about:blank',
    ],
    { stdio: 'ignore' },
  );

  try {
    let version = null;
    for (let attempt = 0; attempt < 40 && !version; attempt += 1) {
      await delay(250);
      try {
        version = await (await fetch(`http://127.0.0.1:${CDP_PORT}/json/version`)).json();
      } catch {
        /* Chrome ещё поднимается */
      }
    }
    if (!version) {
      throw new Error('Chrome не запустился');
    }

    const browserWs = await connect(version.webSocketDebuggerUrl);
    const browser = new CdpSession(browserWs);

    const { targetId } = await browser.send('Target.createTarget', {
      url: `http://127.0.0.1:${PAGE_PORT}/${PROBE_QUERY}`,
    });
    const { sessionId } = await browser.send('Target.attachToTarget', {
      targetId,
      flatten: true,
    });

    const pageErrors = [];
    browser.ws.addEventListener('message', (event) => {
      const message = JSON.parse(event.data);
      if (message.method === 'Runtime.exceptionThrown') {
        pageErrors.push(message.params?.exceptionDetails?.text ?? 'exception');
      }
    });

    await browser.send('Runtime.enable', {}, sessionId);

    let probe = null;
    for (let attempt = 0; attempt < 120 && !probe; attempt += 1) {
      await delay(500);
      const evaluated = await browser.send(
        'Runtime.evaluate',
        { expression: 'window.__probeResult ?? null', returnByValue: true },
        sessionId,
      );
      probe = evaluated.result?.value ?? null;
    }

    browserWs.close();
    server.close();

    if (!probe) {
      console.error('Проба не вернула результат.');
      console.error('Ошибки страницы:', pageErrors);
      process.exit(1);
    }

    console.log('=== РЕЗУЛЬТАТ ПРОБЫ ===');
    for (const step of probe.steps ?? []) {
      console.log(`\n--- ${step.name} ---`);
      console.log(JSON.stringify(step, null, 2));
    }

    for (const image of probe.images ?? []) {
      const path = join(process.cwd(), `.tmp-probe-${image.name}.png`);
      writeFileSync(path, Buffer.from(image.data.split(',')[1], 'base64'));
      console.log('картинка:', path);
    }
    if (!probe.ok) {
      console.error('\nПроба провалилась:', probe.error);
      process.exit(1);
    }
  } finally {
    chrome.kill();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
