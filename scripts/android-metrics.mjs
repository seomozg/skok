/**
 * Снимает метрики позы с живого приложения на Android-устройстве.
 *
 * Подключается к WebView через CDP (adb forward + /json) и читает
 * window.__skokDiagnostics — диагностику, которую приложение публикует
 * при запуске с флагом ?debug=1.
 *
 * Использование:
 *   node scripts/android-metrics.mjs [seconds]
 */
const SECONDS = Number(process.argv[2] ?? 20);
const CDP_PORT = Number(process.env.CDP_PORT ?? 9222);

async function findPage() {
  const res = await fetch(`http://localhost:${CDP_PORT}/json`);
  const pages = await res.json();
  return pages.find((p) => p.type === 'page' && p.webSocketDebuggerUrl);
}

async function main() {
  const page = await findPage();
  if (!page) {
    console.error('Страница WebView не найдена: проверьте, что приложение запущено');
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

  console.log(`Собираю метрики ${SECONDS} с...`);
  const samples = [];
  const deadline = Date.now() + SECONDS * 1000;

  while (Date.now() < deadline) {
    const diag = await evaluate(
      'window.__skokDiagnostics ? JSON.stringify(window.__skokDiagnostics) : null',
    );
    if (diag) {
      samples.push(JSON.parse(diag));
    }
    await new Promise((r) => setTimeout(r, 250));
  }

  if (samples.length === 0) {
    console.error(
      'Диагностика недоступна: приложение должно быть запущено с флагом ?debug=1.',
    );
    process.exit(1);
  }

  const angles = samples
    .map((s) => s.currentAngle)
    .filter((a) => typeof a === 'number' && a > 0);
  const withPerson = samples.filter((s) => s.personDetected);

  console.log(`кадров с диагностикой: ${samples.length}, человек найден в ${withPerson.length}`);
  if (angles.length === 0) {
    console.log('Углы недоступны — скелет не найден или точки ненадёжны.');
    console.log(JSON.stringify(samples[samples.length - 1], null, 2));
    ws.close();
    process.exit(0);
  }

  const sorted = [...angles].sort((a, b) => a - b);
  const min = sorted[0];
  const max = sorted[sorted.length - 1];
  const avg = angles.reduce((s, a) => s + a, 0) / angles.length;

  console.log(`угол колена: min=${min.toFixed(1)}° max=${max.toFixed(1)}° средний=${avg.toFixed(1)}°`);
  console.log(`размах: ${(max - min).toFixed(1)}°`);
  console.log('порог «вниз» = reference - 40°, порог «вверх» = reference - 15°');

  ws.close();
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
