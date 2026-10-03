import { api } from './api.js';
import { deleteDataset, deleteMeta, getMeta, setMeta } from './db.js';

const OFFLINE_MARKER_KEY = 'auth:offlineSession';
const OFFLINE_TTL_MS = 12 * 60 * 60 * 1000;
const DASHBOARD_CACHE_PREFIX = 'dashboardCompresores:';

let idToken = null;
let role = 'LECTOR';
let email = '';
let userKey = '';
let offlineOnly = false;
let initialized = false;
let listener = () => {};

function publish() {
  const authorized = Boolean(idToken) || offlineOnly;
  const state = { role, email, authenticated: Boolean(idToken), offline: offlineOnly, authorized };
  listener(state);
  window.dispatchEvent(new CustomEvent('sdso:auth', { detail: state }));
  ['googleSignIn', 'googleSignInGate'].forEach(id => {
    const button = document.getElementById(id);
    if (button) button.hidden = authorized;
  });
}

function setStatus(message) {
  ['editorAuthStatus', 'authGateStatus'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.textContent = message;
  });
}

function digestEmail(address) {
  if (!address || !globalThis.crypto?.subtle || typeof TextEncoder !== 'function') return Promise.resolve('');
  const bytes = new TextEncoder().encode(String(address).trim().toLowerCase());
  return globalThis.crypto.subtle.digest('SHA-256', bytes).then(hash =>
    [...new Uint8Array(hash)].map(byte => byte.toString(16).padStart(2, '0')).join('')
  ).catch(() => '');
}

function markerIsFresh(marker, lastSync) {
  const syncedAt = Date.parse(lastSync || '');
  const age = Date.now() - syncedAt;
  return Boolean(marker?.userKey && Number.isFinite(age) && age >= 0 && age <= OFFLINE_TTL_MS);
}

async function restoreOfflineAccess() {
  if (navigator.onLine) return false;
  try {
    const marker = await getMeta(OFFLINE_MARKER_KEY);
    const cached = await getMeta('lastSyncAt');
    if (!markerIsFresh(marker, cached)) return false;
    offlineOnly = true;
    idToken = null;
    role = 'LECTOR';
    email = '';
    userKey = marker.userKey;
    setStatus(`Modo sin conexión · solo lectura · última sincronización ${cached || 'no disponible'}.`);
    publish();
    return true;
  } catch (error) {
    console.warn('No fue posible restaurar el acceso offline', error);
    return false;
  }
}

async function purgeLocalSession(key) {
  const syncKey = globalThis.SDSO_CONFIG?.lastSyncKey;
  try { if (syncKey) localStorage.removeItem(syncKey); } catch {}
  const tasks = [deleteMeta('lastSyncAt')];
  if (key) tasks.push(deleteDataset(`${DASHBOARD_CACHE_PREFIX}${key}`));
  tasks.push((async () => {
    const marker = await getMeta(OFFLINE_MARKER_KEY);
    if (!key || marker?.userKey === key) await deleteMeta(OFFLINE_MARKER_KEY);
  })());
  const results = await Promise.allSettled(tasks);
  results.filter(result => result.status === 'rejected').forEach(result => console.warn('No fue posible purgar por completo la caché local', result.reason));
}

async function acceptCredential(response) {
  setStatus('Validando acceso…');
  try {
    const result = await api.authenticate(response.credential);
    if (!result?.ok || !result.data?.role) throw new Error(result?.error?.message || 'No se pudo validar el acceso.');
    const nextUserKey = await digestEmail(result.data.email);
    const previousMarker = await getMeta(OFFLINE_MARKER_KEY).catch(() => null);
    if (previousMarker?.userKey && nextUserKey && previousMarker.userKey !== nextUserKey) {
      await deleteDataset(`${DASHBOARD_CACHE_PREFIX}${previousMarker.userKey}`).catch(() => {});
      await deleteMeta('lastSyncAt').catch(() => {});
      const syncKey = globalThis.SDSO_CONFIG?.lastSyncKey;
      if (syncKey) localStorage.removeItem(syncKey);
    }
    idToken = response.credential;
    role = result.data.role;
    email = result.data.email || '';
    userKey = nextUserKey;
    offlineOnly = false;
    if (userKey) await setMeta(OFFLINE_MARKER_KEY, { userKey, authenticatedAt: Date.now() });
    setStatus(role === 'EDITOR' ? `Sesión de supervisión · ${email}` : `Sesión de consulta · ${email}`);
    publish();
    window.dispatchEvent(new CustomEvent('sdso:toast', { detail: role === 'EDITOR' ? 'Acceso de edición habilitado.' : 'Acceso de consulta habilitado.' }));
  } catch (error) {
    idToken = null;
    role = 'LECTOR';
    email = '';
    userKey = '';
    offlineOnly = false;
    setStatus(error.message || 'Acceso rechazado.');
    publish();
  }
}

function startGoogleIdentity(hosts, config) {
  const render = () => {
    if (!globalThis.google?.accounts?.id) return false;
    globalThis.google.accounts.id.initialize({
      client_id: config.googleClientId,
      callback: acceptCredential,
      auto_select: false,
      cancel_on_tap_outside: true
    });
    hosts.forEach(host => {
      host.hidden = false;
      globalThis.google.accounts.id.renderButton(host, { theme: 'outline', size: 'large', text: 'signin_with', shape: 'rectangular', width: 260 });
    });
    setStatus('Inicia sesión con tu cuenta autorizada. El acceso offline será solo de consulta.');
    return true;
  };
  if (render()) return;
  setStatus('Cargando inicio de sesión…');
  const script = document.createElement('script');
  script.src = 'https://accounts.google.com/gsi/client';
  script.async = true;
  script.onload = () => { if (!render()) setStatus('No se pudo inicializar el inicio de sesión.'); };
  script.onerror = () => setStatus('No se pudo cargar el inicio de sesión. Conéctate a internet e inténtalo nuevamente.');
  document.head.append(script);
}

export const auth = Object.freeze({
  get role() { return role; },
  get email() { return email; },
  get token() { return idToken; },
  get userKey() { return userKey; },
  get offline() { return offlineOnly; },
  get signedIn() { return Boolean(idToken); },
  get hasAccess() { return Boolean(idToken) || offlineOnly; },
  can(action) { return action === 'consultar' ? this.hasAccess : action === 'editar' && role === 'EDITOR' && Boolean(idToken) && !offlineOnly; },
  async refreshNovedades() {
    if (!idToken || offlineOnly) return null;
    return api.getNovedades(idToken);
  },
  init(onChange = () => {}) {
    listener = onChange;
    if (initialized) { publish(); return; }
    initialized = true;
    const hosts = ['googleSignIn', 'googleSignInGate'].map(id => document.getElementById(id)).filter(Boolean);
    const config = globalThis.SDSO_CONFIG;
    if (!hosts.length) return;
    if (!config?.googleClientId) {
      hosts.forEach(host => { host.hidden = true; });
      setStatus('Inicio de sesión no está configurado. Contacta al administrador.');
      publish();
      return;
    }
    void (async () => {
      if (await restoreOfflineAccess()) return;
      if (!navigator.onLine) {
        hosts.forEach(host => { host.hidden = true; });
        setStatus('Sin conexión y sin un acceso offline vigente. Conéctate para iniciar sesión.');
        publish();
        return;
      }
      startGoogleIdentity(hosts, config);
      publish();
    })();
  },
  signOut(message = 'Sesión cerrada.') {
    const oldUserKey = userKey;
    idToken = null;
    role = 'LECTOR';
    email = '';
    userKey = '';
    offlineOnly = false;
    globalThis.google?.accounts?.id?.disableAutoSelect?.();
    setStatus(message);
    publish();
    void purgeLocalSession(oldUserKey);
  },
  expireSession() {
    this.signOut('Tu sesión venció. Conéctate e inicia sesión nuevamente.');
  },
  offlineTtlMs: OFFLINE_TTL_MS
});
