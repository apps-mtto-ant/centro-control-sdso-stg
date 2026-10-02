import { api } from './api.js';

let idToken = null;
let role = 'LECTOR';
let email = '';
let initialized = false;
let listener = () => {};

function publish() {
  const state = { role, email, authenticated: Boolean(idToken) };
  listener(state);
  window.dispatchEvent(new CustomEvent('sdso:auth', { detail: state }));
  const signedIn = Boolean(idToken);
  const dashboardButton = document.getElementById('googleSignIn');
  if (dashboardButton) dashboardButton.hidden = signedIn;
}

function setStatus(message) {
  ['editorAuthStatus', 'authGateStatus'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.textContent = message;
  });
}

async function acceptCredential(response) {
  setStatus('Validando acceso…');
  try {
    const result = await api.authenticate(response.credential);
    if (!result?.ok || !result.data?.role) throw new Error(result?.error?.message || 'No se pudo validar el acceso.');
    idToken = response.credential;
    role = result.data.role;
    email = result.data.email || '';
    setStatus(role === 'EDITOR' ? `Sesión de supervisión · ${email}` : `Sesión de consulta · ${email}`);
    publish();
    window.dispatchEvent(new CustomEvent('sdso:toast', { detail: role === 'EDITOR' ? 'Acceso de edición habilitado.' : 'Acceso de consulta habilitado.' }));
  } catch (error) {
    idToken = null;
    role = 'LECTOR';
    email = '';
    setStatus(error.message || 'Acceso rechazado.');
    publish();
  }
}

export const auth = Object.freeze({
  get role() { return role; },
  get token() { return idToken; },
  get signedIn() { return Boolean(idToken); },
  can(action) { return action === 'consultar' || (action === 'editar' && role === 'EDITOR' && Boolean(idToken)); },
  async refreshNovedades() {
    if (!idToken) return null;
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
    const render = () => {
      if (!globalThis.google?.accounts?.id) return;
      globalThis.google.accounts.id.initialize({
        client_id: config.googleClientId,
        callback: acceptCredential,
        auto_select: false,
        cancel_on_tap_outside: true
      });
      hosts.forEach(host => {
        host.hidden = Boolean(idToken);
        globalThis.google.accounts.id.renderButton(host, { theme: 'outline', size: 'large', text: 'signin_with', shape: 'rectangular', width: 260 });
      });
      setStatus('Inicia sesión con tu cuenta autorizada para registrar datos.');
    };
    if (globalThis.google?.accounts?.id) render();
    else {
      hosts.forEach(host => { host.hidden = true; });
      setStatus('Cargando inicio de sesión…');
      const script = document.createElement('script');
      script.src = 'https://accounts.google.com/gsi/client';
      script.async = true;
      script.onload = () => { render(); hosts.forEach(host => { host.hidden = false; }); };
      script.onerror = () => setStatus('No se pudo cargar el inicio de sesión.');
      document.head.append(script);
    }
    publish();
  },
  signOut() {
    idToken = null;
    role = 'LECTOR';
    email = '';
    globalThis.google?.accounts?.id?.disableAutoSelect?.();
    setStatus('Sesión cerrada.');
    publish();
  }
});
