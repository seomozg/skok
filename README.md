# Skok — браузерный клон Active Arcade

Веб-приложение (и мобильное приложение на его основе), где движения тела перед камерой
являются игровым вводом: приложение распознаёт позу и превращает её в очки.
Никаких джойстиков и носимых устройств.

- **Распознавание позы:** MediaPipe Pose Landmarker (33 точки), локальные wasm + модель → полный офлайн.
- **Рендер:** HTML5 Canvas 2D (видео + скелет + игровые объекты).
- **Стек:** React 18 + TypeScript (strict) + Vite, без серверной части.
- **Приватность:** видео не покидает устройство; кадры никуда не отправляются.
- **Дистрибуция:** PWA в браузере + нативное Android-приложение (Capacitor).

Исходное техническое задание: [`docs/technical-spec.md`](docs/technical-spec.md).

---

## Быстрый старт

```bash
npm install          # postinstall подготовит локальные wasm + модель MediaPipe
npm run dev          # http://localhost:5173 (доступен в локальной сети для телефона)
```

> Камера требует защищённого контекста: `localhost` или HTTPS.
> При первом запуске браузер спросит разрешение на доступ к камере.

### Команды

| Команда | Назначение |
|---|---|
| `npm run dev` | Dev-сервер Vite с hot reload |
| `npm run build` | Типизация + продакшн-сборка в `dist/` |
| `npm run preview` | Локальный просмотр продакшн-сборки |
| `npm run test` | Юнит-тесты (Vitest) |
| `npm run test:watch` | Тесты в watch-режиме |
| `npm run typecheck` | Проверка типов |
| `npm run lint` | ESLint |
| `npm run assets` | Скачать/обновить локальные ресурсы MediaPipe |
| `npm run smoke` | Smoke-тест в headless Chrome (нужен запущенный `npm run preview`) |

---

### Ключевые решения

- **Dependency Inversion.** Игры зависят от абстракции `GameModule`, детектор — от абстракции
  `PoseDetector`. Добавление новой детекции позы или новой мини-игры не требует правок
  в существующем коде (Open/Closed).
- **Зеркалирование — в одном месте.** Координаты MediaPipe инвертируются по X ровно один раз,
  в `GameLoop` (`mirrorFrame`). Видео рисуется зеркально в `useRenderStage`, а игры и рендер
  скелета работают в единой «зеркальной» системе координат.
- **Чистая игровая логика.** `ReactionGame` и `SquatGame` не знают о React, canvas и камере:
  они получают `PoseFrame` и двигают собственное состояние. Поэтому покрыты обычными
  юнит-тестами.
- **Рендер отделён от детекции.** Отрисовка идёт в отдельном `requestAnimationFrame`,
  детекция — в своём цикле с дедупликацией по `video.currentTime` (кадр обрабатывается
  только когда он реально сменился).
- **Калибровка приседаний.** Абсолютные углы из ТЗ (90°/160°) зависят от телосложения и ракурса.
  При старте раунда приложение усредняет угол колена в исходной стойке и строит пороги
  относительно него: вниз — −40°, назад — −15° (гистерезис исключает двойной счёт).
- **Офлайн.** wasm-файлы и `.task`-модель лежат в `public/` и копируются в пакет приложения.
  Внешних запросов во время игры нет.

### Мини-игры

| Игра | Механика | Длительность |
|---|---|---|
| **Реакция** | Попадание любой кистью в появляющуюся мишень | 30 с |
| **Приседания** | Калибровка стойки, затем подсчёт циклов «вниз–вверх» по углу колена | 60 с |

---

## Тестирование

```bash
npm run test
```

Юнит-тесты (Vitest, окружение Node, без DOM):

- `src/domain/pose/angles.test.ts` — расчёт углов, вырожденные случаи;
- `src/domain/pose/calibration.test.ts` — пороги и гистерезис калибровки;
- `src/domain/pose/landmarks.test.ts` — зеркалирование, перевод в пиксели, видимость точек;
- `src/domain/games/reactionGame.test.ts` — попадания, промахи, таймер;
- `src/domain/games/squatGame.test.ts` — цикл приседания, отсутствие двойного счёта;
- `src/core/engine/eventBus.test.ts` — шина событий.

Ручная проверка на устройстве: FPS-счётчик в HUD, камера включается по кнопке,
после отказа в доступе показывается понятное сообщение.

### Smoke-тест (headless Chrome)

```bash
npm run build
npm run preview          # в отдельном терминале
npm run smoke
```

## Мобильное приложение (Android, Capacitor)

Проект в варианте **C → A**: сначала веб/PWA-версия, затем нативная обёртка.

```bash
npm run cap:sync       # сборка веб-части + копирование в android/
npm run cap:android    # открыть проект в Android Studio
npm run android:apk    # собрать debug-APK через Gradle (нужны JDK 17 и Android SDK)
```

Что уже настроено:

- `capacitor.config.ts`: `appId: com.skok.arcade`, `webDir: dist`,
  `server.hostname: localhost` и `androidScheme: https` — это даёт **secure context**,
  без которого `getUserMedia` в WebView не работает;
- `AndroidManifest.xml`: разрешение `android.permission.CAMERA`, фиксация портретной
  ориентации, камера помечена как необязательная (`uses-feature required="false"`);
- запрос runtime-разрешения на камеру обрабатывает сам Capacitor
  (`BridgeWebChromeClient.onPermissionRequest` → `request.grant(...)`);
- service worker регистрируется только в веб-сборке (`platform.kind === 'web'`).

### Требования для сборки Android

- JDK 17 (Temurin), Android Studio (SDK 34+), переменные `JAVA_HOME` и `ANDROID_HOME`;
- для установки на устройство — USB-отладка на телефоне;
- APK: `android/app/build/outputs/apk/debug/app-debug.apk`.

> Сборку APK на этой машине выполнить не удалось: в окружении нет JDK и Android SDK.
> Веб-часть и конфигурация нативного проекта проверены (`npm run cap:sync` проходит успешно).

### Публикация

- Веб: `dist/` можно выложить на любой статический хостинг (Vercel, Netlify, GitHub Pages).
  Обязателен HTTPS — иначе камера не запустится.
- Android: debug-APK ставится напрямую; для Google Play нужен собственный keystore
  (создание и настройка подписи описаны в официальной документации Capacitor).

---

## Ограничения MVP

- Распознаётся один человек (`numPoses: 1`).
- Только фронтальная камера.
- Нет серверной части, аккаунтов, аналитики и рекламы.
- Fallback-детектор на MoveNet заложен как точка расширения (`PoseDetector`), но в MVP
  используется MediaPipe.

Скрипт `scripts/smoke-test.mjs` поднимает headless Chrome по CDP, подменяет камеру
синтетическим видеопотоком с canvas, запускает обе игры и проверяет, что HUD появился,
таймер идёт, ошибок в консоли нет. Требуется установленный Chrome или Edge.

Последний прогон: обе игры стартуют, FPS-счётчик работает, ошибок и исключений нет.

---

## Архитектура

Слои разделены по ответственности: инфраструктура не знает об играх, игры не знают о
canvas и React, доменная логика — чистые функции без побочных эффектов.

```
src/
├── core/                 # инфраструктура (не знает об играх и UI)
│   ├── camera/           # CameraService (интерфейс) + BrowserCameraService
│   ├── pose/             # PoseDetector (интерфейс) + MediaPipePoseDetector
│   ├── engine/           # gameLoop (цикл кадров), eventBus (шина событий)
│   └── platform/         # определение веба / нативного приложения
├── domain/               # чистая логика, тестируется без браузера
│   ├── pose/             # angles, landmarks, calibration
│   └── games/            # reactionGame, squatGame, контракт GameModule
├── games/                # реестр игр и React-обёртка useGameSession
├── render/               # skeletonRenderer, gameRenderer, useRenderStage
├── components/           # UI: меню, HUD, сцена, результаты, ошибки
└── styles/
```
