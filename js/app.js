import { initOfflineLayer, getLastSyncLabel } from './offline.js';
import { initLocalDb } from './db.js';
import { initDashboardCompresores, loadDashboardCompresores } from './dashboard-compresores.js';
import { api } from './api.js';
import { auth } from './auth.js';

const APP_CONFIG = globalThis.SDSO_CONFIG;
const titles = Object.freeze({
  inicio: 'Inicio',
  compresores: 'Compresores',
  'centro-informe': 'Centro Informe',
  apps: 'Aplicaciones SDSO',
  dashboard: 'Dashboard',
  'dashboard-compresores': 'Dashboard Compresores',
  powerbi: 'Power BI',
  informes: 'Informes / herramientas'
});

let deferredInstallPrompt = null;
let drawerWasOpen = false;
const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

function svgIcon(name) {
  const icons = {
    inicio: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 11.5 12 4l9 7.5v8a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/></svg>',
    compresores: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="7" width="12" height="10" rx="2"/><path d="M16 10h3l2 2v3h-5M7 10h6M7 14h4"/><circle cx="8" cy="18.5" r="1.5"/><circle cx="17" cy="18.5" r="1.5"/></svg>',
    informe: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 3h9l3 3v15H6z"/><path d="M9 10h6M9 14h6M9 18h4"/></svg>',
    apps: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="4" width="6" height="6"/><rect x="14" y="4" width="6" height="6"/><rect x="4" y="14" width="6" height="6"/><rect x="14" y="14" width="6" height="6"/></svg>',
    dashboard: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="4" width="7" height="7" rx="1"/><rect x="13" y="4" width="7" height="4" rx="1"/><rect x="13" y="10" width="7" height="10" rx="1"/><rect x="4" y="13" width="7" height="7" rx="1"/></svg>',
    powerbi: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="11" width="3" height="8"/><rect x="10.5" y="7" width="3" height="12"/><rect x="16" y="4" width="3" height="15"/></svg>',
    tools: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14.5 6.5a4 4 0 0 0 4.8 5.8l-7.9 7.9-3.6-3.6 7.9-7.9a4 4 0 0 0-1.2-2.2z"/></svg>'
  };
  return icons[name] || '';
}

function showToast(message) {
  const toast = $('#toast');
  toast.textContent = message;
  toast.classList.add('is-visible');
  window.clearTimeout(showToast.timer);
  showToast.timer = window.setTimeout(() => toast.classList.remove('is-visible'), 2600);
}

function currentSectionFromHash() {
  const raw = location.hash.replace(/^#\/?/, '');
  return titles[raw] ? raw : 'inicio';
}

function setDrawer(open, { restoreFocus = true } = {}) {
  const sidebar = $('#sidebar');
  const overlay = $('#drawerOverlay');
  const toggle = $('#menuToggle');
  const mobile = window.matchMedia('(max-width: 820px)').matches;

  sidebar.classList.toggle('is-open', open);
  overlay.hidden = !open;
  toggle.setAttribute('aria-expanded', String(open));
  sidebar.inert = mobile ? !open : false;

  if (!mobile) return;

  if (open) {
    drawerWasOpen = true;
    const firstLink = $('.nav-item', sidebar);
    const focusFirstLink = () => {
      if (!sidebar.classList.contains('is-open') || !firstLink) return;
      firstLink.focus();
    };
    const onTransitionEnd = event => {
      if (event.target !== sidebar || event.propertyName !== 'transform') return;
      sidebar.removeEventListener('transitionend', onTransitionEnd);
      focusFirstLink();
    };
    sidebar.addEventListener('transitionend', onTransitionEnd);
    window.setTimeout(() => {
      sidebar.removeEventListener('transitionend', onTransitionEnd);
      focusFirstLink();
    }, 260);
  } else if (drawerWasOpen && restoreFocus) {
    drawerWasOpen = false;
    toggle.focus();
  } else if (!open) {
    drawerWasOpen = false;
  }
}

function renderSection(section) {
  if (!auth.hasAccess) { $('#authGate').hidden = false; $('#appShell').hidden = true; return; }
  $('#authGate').hidden = true;
  $('#appShell').hidden = false;
  if (!titles[section]) section = 'inicio';
  $$('.view').forEach(view => view.classList.toggle('is-visible', view.dataset.view === section));
  const navSection = section === 'dashboard-compresores' ? 'dashboard' : section;
  $$('.nav-item').forEach(link => {
    const active = link.dataset.section === navSection;
    link.classList.toggle('is-active', active);
    if (active) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  });
  $('#pageTitle').textContent = titles[section];
  const topbarStatus = $('.topbar-status');
  if (topbarStatus) topbarStatus.hidden = section === 'inicio';
  const refreshButton = $('#refreshButton');
  if (refreshButton) refreshButton.hidden = section === 'inicio';
  if (section === 'dashboard-compresores') void loadDashboardCompresores();
  setDrawer(false, { restoreFocus: false });
  window.scrollTo(0, 0);
  $('#content').focus({ preventScroll: true });
}

function updateConnectivity() {
  const online = navigator.onLine;
  $$('.connection-badge').forEach(badge => { badge.dataset.state = online ? 'online' : 'offline'; });
  $$('.connection-text').forEach(el => { el.textContent = online ? 'EN LÍNEA' : 'SIN CONEXIÓN'; });
  $('#heroConnection').textContent = online ? 'En línea' : 'Sin conexión';
  const sync = getLastSyncLabel();
  $$('.last-sync').forEach(el => { el.textContent = sync; });
  $('#heroSync').textContent = sync === 'Sin sincronizar' ? sync : `Última sincronización: ${sync}`;
}

function isSafeHttps(url) {
  if (!url) return false;
  try { return new URL(url).protocol === 'https:'; } catch { return false; }
}

function configureExternalLink(anchor, linkConfig, pendingLabel = 'URL pendiente') {
  anchor.replaceChildren();
  if (isSafeHttps(linkConfig?.url)) {
    anchor.href = linkConfig.url;
    anchor.target = '_blank';
    anchor.rel = 'noopener noreferrer';
    anchor.textContent = 'Abrir ↗';
    anchor.classList.remove('is-disabled');
    anchor.removeAttribute('aria-disabled');
    anchor.removeAttribute('tabindex');
  } else {
    anchor.removeAttribute('href');
    anchor.removeAttribute('target');
    anchor.removeAttribute('rel');
    anchor.textContent = pendingLabel;
    anchor.classList.add('is-disabled');
    anchor.setAttribute('aria-disabled', 'true');
    anchor.setAttribute('tabindex', '-1');
  }
}

function configureExternalLinks() {
  const compressors = APP_CONFIG.links.compressors;
  const report = APP_CONFIG.links.turnReport;
  configureExternalLink($('#compressorsExternalLink'), compressors);
  $('#compressorsExternalLink').textContent = isSafeHttps(compressors.url) ? 'Abrir App Compresores ↗' : 'URL pendiente';
  configureExternalLink($('#turnReportExternalLink'), report);
  $('#turnReportExternalLink').textContent = isSafeHttps(report.url) ? 'Abrir Centro Informe ↗' : 'URL pendiente';
  $('#centroInformeHint').hidden = isSafeHttps(report.url);
}

function appendResourceCard(root, resource, badgeText) {
  const article = document.createElement('article');
  article.className = 'resource-card';

  const badge = document.createElement('span');
  badge.className = 'badge';
  badge.textContent = badgeText;

  const title = document.createElement('h3');
  title.textContent = resource.name || 'Recurso';

  const description = document.createElement('p');
  description.textContent = resource.description || '';

  const action = document.createElement('a');
  action.className = 'primary-btn';
  configureExternalLink(action, resource);

  article.append(badge, title, description, action);
  root.append(article);
}

function renderResourceCollection(rootSelector, resources, { badgeText, emptyTitle, emptyText }) {
  const root = $(rootSelector);
  root.replaceChildren();

  if (!resources.length) {
    const empty = document.createElement('div');
    empty.className = 'empty-state resource-empty';
    const title = document.createElement('strong');
    title.textContent = emptyTitle;
    const description = document.createElement('p');
    description.textContent = emptyText;
    empty.append(title, description);
    root.append(empty);
    return;
  }

  resources.forEach(resource => appendResourceCard(root, resource, badgeText));
}

function renderCatalogs() {
  const seen = new Set();
  const apps = APP_CONFIG.catalogs.apps
    .map(id => {
      if (seen.has(id)) console.warn(`Aplicación duplicada en catalogs.apps: ${id}`);
      seen.add(id);
      const item = APP_CONFIG.links[id];
      if (!item) console.warn(`Aplicación desconocida en catalogs.apps: ${id}`);
      return item;
    })
    .filter(Boolean);

  renderResourceCollection('#appsCatalog', apps, {
    badgeText: 'APP SDSO',
    emptyTitle: 'Sin aplicaciones configuradas',
    emptyText: 'Los accesos se administran desde js/config.js.'
  });

  renderResourceCollection('#powerbiCatalog', APP_CONFIG.catalogs.powerbi, {
    badgeText: 'POWER BI',
    emptyTitle: 'Sin enlaces configurados todavía',
    emptyText: 'Los accesos Power BI se incorporarán desde js/config.js sin modificar el HTML.'
  });

  renderResourceCollection('#toolsCatalog', APP_CONFIG.catalogs.tools, {
    badgeText: 'RECURSO',
    emptyTitle: 'Sin recursos configurados todavía',
    emptyText: 'Los informes y herramientas se incorporarán desde js/config.js sin modificar el HTML.'
  });
}

function decorateIcons() {
  const map = {
    inicio: 'inicio', apps: 'apps', dashboard: 'dashboard', powerbi: 'powerbi', informes: 'tools'
  };
  $$('.nav-item').forEach(item => {
    const target = $('.nav-icon', item);
    target.innerHTML = svgIcon(map[item.dataset.section]);
  });
  $$('[data-module-icon]').forEach(el => { el.innerHTML = svgIcon(el.dataset.moduleIcon); });
}

async function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;

  const hadController = Boolean(navigator.serviceWorker.controller);
  let reloaded = false;

  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hadController || reloaded) return;
    reloaded = true;
    location.reload();
  });

  try {
    await navigator.serviceWorker.register('./service-worker.js', { scope: './', updateViaCache: 'none' });
  } catch (error) {
    console.error('No fue posible registrar el Service Worker:', error);
  }
}

function bindEvents() {
  $('#menuToggle').addEventListener('click', () => setDrawer(!$('#sidebar').classList.contains('is-open')));
  $('#drawerOverlay').addEventListener('click', () => setDrawer(false));
  document.addEventListener('keydown', event => { if (event.key === 'Escape') setDrawer(false); });
  window.addEventListener('hashchange', () => renderSection(currentSectionFromHash()));
  window.addEventListener('sdso:auth', event => {
    const authorized = Boolean(event.detail?.authorized && auth.hasAccess);
    $('#authGate').hidden = authorized;
    $('#appShell').hidden = !authorized;
    $('#signOutButton').hidden = !authorized;
    if (authorized) renderSection(currentSectionFromHash());
    else { $('#appShell').hidden = true; }
  });
  window.addEventListener('resize', () => {
    if (!window.matchMedia('(max-width: 820px)').matches) setDrawer(false, { restoreFocus: false });
  });

  $('#refreshButton').addEventListener('click', () => {
    updateConnectivity();
    showToast(navigator.onLine ? 'Conexión disponible' : 'No hay conexión disponible');
  });
  $('#signOutButton').addEventListener('click', () => auth.signOut());
  window.addEventListener('online', () => {
    updateConnectivity();
    showToast('Conexión restablecida');
    if (auth.offline) { window.location.reload(); return; }
    if (auth.signedIn && currentSectionFromHash() === 'dashboard-compresores') void loadDashboardCompresores();
  });
  window.addEventListener('offline', () => { updateConnectivity(); showToast('Centro operando sin conexión'); });
  window.addEventListener('sdso:sync', updateConnectivity);
  window.addEventListener('sdso:toast', event => showToast(event.detail || 'Actualización completada'));

  window.addEventListener('beforeinstallprompt', event => {
    event.preventDefault();
    deferredInstallPrompt = event;
    $('#installButton').hidden = false;
  });
  $('#installButton').addEventListener('click', async () => {
    if (!deferredInstallPrompt) return;
    deferredInstallPrompt.prompt();
    await deferredInstallPrompt.userChoice;
    deferredInstallPrompt = null;
    $('#installButton').hidden = true;
  });
}

async function boot() {
  document.documentElement.dataset.appVersion = APP_CONFIG.version;
  $('#versionLabel').textContent = `VERSIÓN ${APP_CONFIG.version}`;
  decorateIcons();
  configureExternalLinks();
  renderCatalogs();
  bindEvents();
  initOfflineLayer();
  initDashboardCompresores();
  updateConnectivity();
  renderSection(currentSectionFromHash());

  // El modo offline nunca debe depender de IndexedDB: registrar el SW de inmediato.
  void registerServiceWorker();

  // IndexedDB se inicializa en segundo plano y tiene timeout interno; nunca bloquea el arranque.
  void initLocalDb();

  // v0.4 conserva lectura offline; las escrituras dependen de autorización en Apps Script.
  void api;
  void auth;
}

boot();
