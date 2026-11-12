import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { detectPlatform } from './core/platform/platform';
import './styles/global.css';

const container = document.getElementById('root');
if (!container) {
  throw new Error('Не найден корневой элемент #root');
}

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

const platform = detectPlatform();

// PWA: регистрация service worker только в вебе.
// В нативном приложении (Capacitor) ресурсы и так лежат внутри пакета,
// а service worker мешал бы обновлению assets.
if (platform.kind === 'web' && 'serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch(() => {
      // Офлайн-режим недоступен — приложение всё равно работает.
    });
  });
}
