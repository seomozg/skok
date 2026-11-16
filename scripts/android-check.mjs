/**
 * Автоматическая проверка приложения на Android-устройстве.
 *
 * Управляет приложением через CDP WebView: нажимает кнопки по DOM
 * (а не по координатам экрана), читает состояние HUD и диагностику
 * позы, проверяет logcat и сохраняет скриншоты.
 *
 * Требуется:
 *   adb forward tcp:9222 localabstract:webview_devtools_remote_<pid>
 *
 * Использование:
 *   node scripts/android-check.mjs [--game squat|reaction] [--seconds N]
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';

const ADB = process.env.ADB_PATH ?? 'adb';
const CDP_PORT = Number(process.env.CDP_PORT ?? 9222);
const OUT_DIR = process.env.OUT_DIR ?? '.tmp-android';

function arg(name, fallback) {
  const index = process.argv.indexOf(`--${name}`);
  if (index === -1) {
    return fallback;
  }
  const value = process.argv[index + 1];
  return value && !value.startsWith('--') ? value : fallback;
}

const GAME = arg('game', 'squat');
const SECONDS = Number(arg('seconds', '40'));

/** Результаты проверок: имя, признак успеха и подробности. */
const results = [];

function check(name, ok, detail = '') {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'OK  ' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
}

function adb(args) {
  return execFileSync(ADB, args, { encoding: 'utf8' });
}

async function findPage() {
  const res = await fetch(`http://localhost:${CDP_PORT}/json`);
  const pages = await res.json();
  return pages.find((p) => p.type === 'page' && p.webSocketDebuggerUrl);
}

async function main() {
  mkdirSync(OUT_DIR, { recursive: true });

  const page = await findPage();
  if (!page) {
    console.error('Страница WebView не найдена. Запустите приложение и выполните:');
    console.error('  adb forward tcp:9222 localabstract:webview_devtools_remote_<pid>');
    process.exit(1);
  }

  const ws = new WebSocket(page.webSocketDebuggerUrl);
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
    const msg = JSON.parse(event.data);
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id);
      pending.delete(msg.id);
      if (msg.error) {
        reject(new Error(msg.error.message));
      } else {
        resolve(msg.result);
      }
    }
  };

  const evaluate = async (expression) => {
    const res = await send('Runtime.evaluate', {
      expression,
      returnByValue: true,
      awaitPromise: true,
    });
    if (res.exceptionDetails) {
      throw new Error(res.exceptionDetails.text ?? 'Ошибка выражения');
    }
    return res.result.value;
  };

  const delay = (ms) => new Promise((r) => setTimeout(r, ms));

  // 1. Включаем диагностику: она публикует метрики позы в window.
  await evaluate("localStorage.setItem('skok.debug', '1')");
  check('диагностика включается', true);

  // 2. Запускаем игру. Кнопки в меню идут в порядке: СпайдерМэн, Приседания.
  // Важно: кликаем сразу нужную кнопку — после первого клика мы уже
  // на игровом экране, и кнопок меню больше нет.
  const gameIndex = GAME === 'squat' ? 1 : 0;
  const started = await evaluate(
    `(() => { const list = [...document.querySelectorAll('.button--game')]; const el = list[${gameIndex}]; if (!el) return false; el.click(); return true; })()`,
  );
  check('игра запущена', started === true);
  await delay(12_000);


  // 3. Состояние HUD после старта.
  const hud = await evaluate(`(() => ({
    title: document.querySelector('.hud__title')?.textContent ?? null,
    fps: document.querySelector('.hud__fps')?.textContent ?? null,
    score: document.querySelector('.hud__score')?.textContent ?? null,
    hint: document.querySelector('.hud__hint')?.textContent ?? null,
    error: document.querySelector('.error__message')?.textContent ?? null,
  }))()`);

  check('HUD показывает игру', hud.title !== null, `title=${hud.title}`);
  check('FPS-счётчик работает', hud.fps !== null, `fps=${hud.fps}`);
  check('ошибок приложения нет', hud.error === null, hud.error ?? '');

  // 4. Ждём и копим метрики позы.
  const samples = [];
  const deadline = Date.now() + SECONDS * 1000;
  while (Date.now() < deadline) {
    const diag = await evaluate(
      'window.__skokDiagnostics ? JSON.stringify(window.__skokDiagnostics) : null',
    );
    if (diag) {
      samples.push(JSON.parse(diag));
    }
    await delay(300);
  }

  const withPerson = samples.filter((s) => s.personDetected);
  check(
    'человек распознан',
    withPerson.length > 0,
    `${withPerson.length}/${samples.length} кадров`,
  );

  const angles = samples
    .map((s) => s.averageKneeAngle)
    .filter((a) => typeof a === 'number' && a > 0);
  let kneeRange = null;
  if (angles.length > 0) {
    const sorted = [...angles].sort((a, b) => a - b);
    const range = sorted[sorted.length - 1] - sorted[0];
    kneeRange = { min: sorted[0], max: sorted[sorted.length - 1] };
    check(
      'угол колена меняется (есть движения)',
      range > 10,
      `размах=${range.toFixed(1)}° min=${sorted[0].toFixed(1)}° max=${sorted[sorted.length - 1].toFixed(1)}°`,
    );
  }

  // Сколько ног видно: если ног мало, угол считается по одной и «дребезжит».
  const legsHistogram = {};
  for (const s of samples) {
    const key = String(s.reliableLegs);
    legsHistogram[key] = (legsHistogram[key] ?? 0) + 1;
  }
  check(
    'ноги видны в большинстве кадров',
    (legsHistogram['2'] ?? 0) > samples.length * 0.5,
    `надёжных ног: ${JSON.stringify(legsHistogram)}`,
  );

  // Видимость точек ног: 0 — ноги не в кадре, ~0.3 — в кадре, но плохо видны.
  const withVisibility = samples.filter((s) => s.personDetected && s.legVisibility);
  if (withVisibility.length > 0) {
    const avg = (key) =>
      withVisibility.reduce((sum, s) => sum + (s.legVisibility[key] ?? 0), 0) /
      withVisibility.length;
    const visibility = {
      leftKnee: avg('leftKnee'),
      leftAnkle: avg('leftAnkle'),
      rightKnee: avg('rightKnee'),
      rightAnkle: avg('rightAnkle'),
    };
    console.log(
      `видимость ног (средняя): колено L=${visibility.leftKnee.toFixed(2)} ` +
        `лодыжка L=${visibility.leftAnkle.toFixed(2)} ` +
        `колено R=${visibility.rightKnee.toFixed(2)} ` +
        `лодыжка R=${visibility.rightAnkle.toFixed(2)}`,
    );
    check(
      'точки ног видны (visibility > 0.5)',
      visibility.leftAnkle > 0.5 || visibility.rightAnkle > 0.5,
      `лодыжка L=${visibility.leftAnkle.toFixed(2)} R=${visibility.rightAnkle.toFixed(2)}`,
    );
  }

  const finalState = await evaluate(`(() => ({
    score: document.querySelector('.hud__score')?.textContent ?? null,
    hint: document.querySelector('.hud__hint')?.textContent ?? null,
    error: document.querySelector('.error__message')?.textContent ?? null,
  }))()`);
  check('счёт отображается', finalState.score !== null, `score=${finalState.score}`);

  // Фазы игры: сколько кадров в каждой. Показывает, «залипает» ли фаза.
  const phaseHistogram = {};
  for (const s of samples) {
    const key = s.game?.phase ?? 'нет данных';
    phaseHistogram[key] = (phaseHistogram[key] ?? 0) + 1;
  }
  console.log(`фазы игры: ${JSON.stringify(phaseHistogram)}`);

  // Пороги: с ними видно, достижим ли порог «вниз» реальным приседанием.
  const withGame = samples.filter((s) => s.game && s.game.referenceAngle !== null);
  if (withGame.length > 0) {
    const last = withGame[withGame.length - 1].game;
    const minAngle = Math.min(...angles);
    console.log(
      `пороги: reference=${last.referenceAngle?.toFixed(1)}° ` +
        `вниз=${last.downThreshold?.toFixed(1)}° ` +
        `вверх=${last.upThreshold?.toFixed(1)}°`,
    );
    console.log(`минимальный наблюдаемый угол: ${minAngle.toFixed(1)}°`);
    check(
      'порог «вниз» достижим',
      last.downThreshold !== null && minAngle <= last.downThreshold,
      `минимум=${minAngle.toFixed(1)}° порог=${last.downThreshold?.toFixed(1)}°`,
    );
  }

  // 5. Скриншот с устройства.
  try {
    const png = execFileSync(ADB, ['exec-out', 'screencap', '-p'], {
      encoding: 'buffer',
      maxBuffer: 64 * 1024 * 1024,
    });
    const file = `${OUT_DIR}/${GAME}.png`;
    writeFileSync(file, png);
    console.log(`скриншот: ${file}`);
  } catch {
    console.log('скриншот не сохранён');
  }

  // 6. logcat: ошибки приложения.
  const log = adb(['logcat', '-d', '-t', '400']);
  const fatal = log
    .split('\n')
    .filter(
      (line) =>
        /AndroidRuntime|FATAL EXCEPTION/.test(line) ||
        /Capacitor\/Console.*(Error|Uncaught)/i.test(line),
    );
  check('в logcat нет ошибок', fatal.length === 0, fatal.slice(0, 3).join(' | '));

  // 7. Метрики — в отчёт.
  const report = {
    game: GAME,
    seconds: SECONDS,
    hud,
    frames: samples.length,
    personFrames: withPerson.length,
    legsHistogram,
    kneeRange,
    final: finalState,
  };
  writeFileSync(`${OUT_DIR}/${GAME}-report.json`, JSON.stringify(report, null, 2));
  console.log(`отчёт: ${OUT_DIR}/${GAME}-report.json`);

  ws.close();

  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} проверок пройдено`);
  process.exit(failed.length === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});

