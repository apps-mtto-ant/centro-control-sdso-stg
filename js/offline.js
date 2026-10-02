const CONFIG = globalThis.SDSO_CONFIG;
const LAST_SYNC_KEY = CONFIG?.lastSyncKey || 'sdso:lastSync';

function pad(value) {
  return String(value).padStart(2, '0');
}

export function markSuccessfulSync(date = new Date()) {
  try {
    localStorage.setItem(LAST_SYNC_KEY, date.toISOString());
  } catch {
    // Si el almacenamiento local está bloqueado, la app continúa sin persistir la fecha.
  }
}

export function getLastSyncLabel() {
  let value = null;
  try {
    value = localStorage.getItem(LAST_SYNC_KEY);
  } catch {
    return 'Sin sincronizar';
  }
  if (!value) return 'Sin sincronizar';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Sin sincronizar';
  return `${pad(date.getDate())}/${pad(date.getMonth() + 1)}/${date.getFullYear()} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function initOfflineLayer() {
  // No se inventa una sincronización. Solo una sincronización real de datos podrá marcarla.
}
