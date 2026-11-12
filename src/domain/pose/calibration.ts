/**
 * Калибровка приседаний под конкретного пользователя.
 *
 * Абсолютные углы колена из ТЗ (90° / 160°) зависят от телосложения и
 * ракурса камеры. Поэтому за reference берётся угол в момент старта
 * (человек стоит), а пороги задаются как отклонение от него.
 */

/** Насколько нужно согнуть колено относительно reference, чтобы засчитать приседание. */
export const DEFAULT_SQUAT_DROP_DEGREES = 40;

/** Порог возврата в исходное положение (гистерезис). */
export const DEFAULT_SQUAT_RISE_DEGREES = 15;

/** Минимальная разница между порогами — защита от «дребезга» угла. */
export const MIN_HYSTERESIS_GAP = 5;

export interface SquatCalibration {
  /** Угол колена в исходной стойке (градусы). */
  referenceAngle: number;
  /** Угол, ниже которого считается, что человек присел. */
  downThreshold: number;
  /** Угол, выше которого приседание засчитывается. */
  upThreshold: number;
}

/**
 * Создаёт калибровку по опорному углу стойки.
 * Пороги автоматически выравниваются, чтобы сохранить гистерезис.
 */
export function createSquatCalibration(
  referenceAngle: number,
  dropDegrees: number = DEFAULT_SQUAT_DROP_DEGREES,
  riseDegrees: number = DEFAULT_SQUAT_RISE_DEGREES,
): SquatCalibration {
  const drop = Math.max(1, dropDegrees);
  const rise = Math.max(1, Math.min(riseDegrees, drop - MIN_HYSTERESIS_GAP));
  return {
    referenceAngle,
    downThreshold: referenceAngle - drop,
    upThreshold: referenceAngle - rise,
  };
}

/** Обновляет reference-угол калибровки (и пересчитывает пороги). */
export function updateReference(
  calibration: SquatCalibration,
  referenceAngle: number,
  dropDegrees?: number,
  riseDegrees?: number,
): SquatCalibration {
  const drop = dropDegrees ?? calibration.referenceAngle - calibration.downThreshold;
  const rise = riseDegrees ?? calibration.referenceAngle - calibration.upThreshold;
  return createSquatCalibration(referenceAngle, drop, rise);
}
