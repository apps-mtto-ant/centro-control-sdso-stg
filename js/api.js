const config = globalThis.SDSO_CONFIG;
const DEFAULT_TIMEOUT_MS = 12000;

export class ApiError extends Error {
  constructor(code, message, details = null) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.details = details;
  }
}

async function fetchWithTimeout(url, options = {}, timeoutMs = DEFAULT_TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } catch (error) {
    if (error?.name === 'AbortError') throw new ApiError('TIMEOUT', 'El backend no respondió dentro del tiempo esperado.');
    throw new ApiError('NETWORK_ERROR', 'No fue posible conectar con el backend.', { cause: String(error?.message || error) });
  } finally {
    window.clearTimeout(timer);
  }
}

function endpoint(action, params = {}) {
  try {
    const url = new URL(config.backendUrl);
    url.searchParams.set('action', action);
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null) url.searchParams.set(key, String(value));
    });
    return url;
  } catch (error) {
    throw new ApiError('INVALID_BACKEND_URL', 'La URL del backend configurada no es válida.', { cause: String(error?.message || error) });
  }
}

async function getJson(action, params = {}) {
  if (!config?.backendUrl) return { ok: false, configured: false };
  const response = await fetchWithTimeout(endpoint(action, params), { cache: 'no-store' });
  if (!response.ok) throw new ApiError('HTTP_ERROR', `Backend respondió HTTP ${response.status}.`, { status: response.status });
  try {
    return await response.json();
  } catch (error) {
    throw new ApiError('INVALID_JSON', 'El backend devolvió una respuesta JSON no válida.', { cause: String(error?.message || error) });
  }
}

export const api = Object.freeze({
  get configured() {
    return Boolean(config?.backendUrl);
  },

  // Confirma disponibilidad del backend. NO representa una sincronización de datos.
  health() {
    return getJson('health');
  },

  getConfig() {
    return getJson('config');
  },

  getEquipos() {
    return getJson('getEquipos');
  },

  getDashboardCompresores() {
    return getJson('getDashboardCompresores');
  },

  getDashboard(name = 'compresores') {
    if (name === 'compresores') return getJson('getDashboardCompresores');
    throw new ApiError('DASHBOARD_NOT_SUPPORTED', `Dashboard no soportado: ${name}`);
  },

  // En esta dev solo define el endpoint. La persistencia real y la marca de sincronización
  // se implementarán cuando exista backend y datasets reales.
  async sync() {
    if (!config?.backendUrl) return { ok: false, configured: false, datasets: null };
    return getJson('sync');
  }
});
