/**
 * Общие функции проб MediaPipe: поворот картинки, сводка по позе, наложение скелета.
 *
 * Используются пробами scripts/probe-canvas.html (фикстура) и
 * scripts/probe-camera.html (живая камера).
 */

/** Связи скелета для отрисовки. */
export const CONNECTIONS = [
  [11, 12], [11, 13], [13, 15], [12, 14], [14, 16],
  [11, 23], [12, 24], [23, 24], [23, 25], [25, 27],
  [24, 26], [26, 28], [27, 31], [28, 32],
];

/** Точки, которые рисуются кружками. */
export const MARKERS = [0, 11, 12, 15, 16, 23, 24, 25, 26];

const round = (value) => Math.round(value * 10000) / 10000;

/**
 * Рисует изображение в canvas с поворотом на угол (по часовой стрелке).
 * Размер canvas меняется местами для 90°/270° — так же, как у кадров
 * камеры, повёрнутых на 90°.
 */
export function drawRotated(image, angleDeg) {
  const swap = angleDeg === 90 || angleDeg === 270;
  const canvas = document.createElement('canvas');
  canvas.width = swap ? image.height : image.width;
  canvas.height = swap ? image.width : image.height;
  const ctx = canvas.getContext('2d');
  ctx.save();
  ctx.translate(canvas.width / 2, canvas.height / 2);
  ctx.rotate((angleDeg * Math.PI) / 180);
  ctx.drawImage(image, -image.width / 2, -image.height / 2);
  ctx.restore();
  return canvas;
}

/** Рисует видеокадр в canvas с поворотом на угол (по часовой стрелке). */
export function drawVideo(video, angleDeg) {
  const swap = angleDeg === 90 || angleDeg === 270;
  const canvas = document.createElement('canvas');
  canvas.width = swap ? video.videoHeight : video.videoWidth;
  canvas.height = swap ? video.videoWidth : video.videoHeight;
  const ctx = canvas.getContext('2d');
  ctx.save();
  ctx.translate(canvas.width / 2, canvas.height / 2);
  ctx.rotate((angleDeg * Math.PI) / 180);
  ctx.drawImage(video, -video.videoWidth / 2, -video.videoHeight / 2, video.videoWidth, video.videoHeight);
  ctx.restore();
  return canvas;
}

/** Сводка по точкам: координаты ключевых суставов и наклон тела. */
export function summarize(landmarks) {
  if (!landmarks || landmarks.length === 0) {
    return { count: 0 };
  }
  const point = (index) => ({
    x: round(landmarks[index].x),
    y: round(landmarks[index].y),
    v: round(landmarks[index].visibility ?? 0),
  });
  const shoulderMid = {
    x: (landmarks[11].x + landmarks[12].x) / 2,
    y: (landmarks[11].y + landmarks[12].y) / 2,
  };
  const hipMid = {
    x: (landmarks[23].x + landmarks[24].x) / 2,
    y: (landmarks[23].y + landmarks[24].y) / 2,
  };
  // Наклон оси «таз → плечи» относительно вертикали:
  // 0° — человек вертикален, ±90° — лежит на боку, 180° — вверх ногами.
  const bodyTilt = round(
    (Math.atan2(shoulderMid.x - hipMid.x, -(shoulderMid.y - hipMid.y)) * 180) / Math.PI,
  );
  // Наклон оси «глаза → нос» относительно вертикали вниз:
  // 0° — лицо смотрит прямо, ±90° — голова наклонена.
  const eyesMid = {
    x: (landmarks[2].x + landmarks[5].x) / 2,
    y: (landmarks[2].y + landmarks[5].y) / 2,
  };
  const faceTilt = round(
    (Math.atan2(landmarks[0].x - eyesMid.x, landmarks[0].y - eyesMid.y) * 180) / Math.PI,
  );
  return {
    count: landmarks.length,
    avgVisibility: round(
      landmarks.reduce((sum, l) => sum + (l.visibility ?? 0), 0) / landmarks.length,
    ),
    bodyTilt,
    faceTilt,
    nose: point(0),
    leftEye: point(2),
    rightEye: point(5),
    leftShoulder: point(11),
    rightShoulder: point(12),
    leftHip: point(23),
    rightHip: point(24),
  };
}

/**
 * Переносит точку из системы координат прямого кадра в систему координат
 * канваса, повёрнутого на угол (по часовой стрелке).
 *
 * Для угла 90°: (x, y) → (1 - y, x); для 180°: (1 - x, 1 - y);
 * для 270°: (y, 1 - x).
 */
export function rotateNormalized(x, y, angleDeg) {
  if (angleDeg === 90) return { x: 1 - y, y: x };
  if (angleDeg === 180) return { x: 1 - x, y: 1 - y };
  if (angleDeg === 270) return { x: y, y: 1 - x };
  return { x, y };
}

/**
 * Среднее расстояние между двумя наборами точек (в нормализованных
 * координатах). Показывает, в какой системе координат вернулись точки.
 */
export function meanDeviation(actual, expected) {
  if (!actual || !expected || actual.length === 0 || expected.length === 0) {
    return null;
  }
  const count = Math.min(actual.length, expected.length);
  let sum = 0;
  for (let index = 0; index < count; index += 1) {
    sum += Math.hypot(actual[index].x - expected[index].x, actual[index].y - expected[index].y);
  }
  return Math.round((sum / count) * 10000) / 10000;
}

/** Накладывает скелет на картинку — видно, совпали ли они. */
export function compose(canvas, landmarks) {
  const ctx = canvas.getContext('2d');
  if (landmarks && landmarks.length > 0) {
    ctx.strokeStyle = '#5eead4';
    ctx.lineWidth = Math.max(3, canvas.width / 200);
    for (const [from, to] of CONNECTIONS) {
      const a = landmarks[from];
      const b = landmarks[to];
      if (!a || !b) continue;
      ctx.beginPath();
      ctx.moveTo(a.x * canvas.width, a.y * canvas.height);
      ctx.lineTo(b.x * canvas.width, b.y * canvas.height);
      ctx.stroke();
    }
    ctx.fillStyle = '#f43f5e';
    for (const index of MARKERS) {
      const p = landmarks[index];
      if (!p) continue;
      ctx.beginPath();
      ctx.arc(p.x * canvas.width, p.y * canvas.height, canvas.width / 90, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  return canvas.toDataURL('image/png');
}
