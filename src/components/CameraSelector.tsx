import type { CameraDevice } from '../core/camera/cameraService';

export interface CameraSelectorProps {
  devices: CameraDevice[];
  selectedDeviceId: string | null;
  onSelect: (deviceId: string) => void;
  disabled?: boolean;
}

/**
 * Выбор видеокамеры.
 *
 * Список устройств доступен только после того, как браузер выдал
 * разрешение на доступ к камере (иначе подписи скрыты системой).
 */
export function CameraSelector({
  devices,
  selectedDeviceId,
  onSelect,
  disabled = false,
}: CameraSelectorProps) {
  if (devices.length === 0) {
    return null;
  }
  return (
    <label className="camera-selector">
      <span className="camera-selector__label">Камера</span>
      <select
        className="camera-selector__select"
        value={selectedDeviceId ?? ''}
        disabled={disabled}
        onChange={(event) => onSelect(event.target.value)}
      >
        {devices.map((device) => (
          <option key={device.deviceId} value={device.deviceId}>
            {device.label}
          </option>
        ))}
      </select>
    </label>
  );
}
