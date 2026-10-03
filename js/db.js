const CONFIG = globalThis.SDSO_CONFIG;
const DB_NAME = CONFIG?.dbName || 'centro-control-sdso';
const DB_VERSION = 1;
const DEFAULT_OPEN_TIMEOUT_MS = 3000;
const DEFAULT_IO_TIMEOUT_MS = 1500;
const STORES = Object.freeze({
  datasets: 'datasets',
  meta: 'meta',
  outbox: 'outbox'
});

let dbPromise = null;

function openDatabase() {
  if (!('indexedDB' in globalThis)) return Promise.resolve(null);
  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORES.datasets)) db.createObjectStore(STORES.datasets);
      if (!db.objectStoreNames.contains(STORES.meta)) db.createObjectStore(STORES.meta);
      if (!db.objectStoreNames.contains(STORES.outbox)) {
        db.createObjectStore(STORES.outbox, { keyPath: 'id', autoIncrement: true });
      }
    };

    request.onblocked = () => reject(new Error('IndexedDB bloqueada por otra pestaña o versión abierta'));
    request.onsuccess = () => {
      const db = request.result;
      db.onversionchange = () => {
        db.close();
        dbPromise = null;
      };
      db.onclose = () => { dbPromise = null; };
      resolve(db);
    };
    request.onerror = () => reject(request.error || new Error('No fue posible abrir IndexedDB'));
  }).catch(error => {
    dbPromise = null;
    throw error;
  });

  return dbPromise;
}

function withTimeout(promise, timeoutMs, label) {
  let timer;
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(`${label} excedió ${timeoutMs} ms`)), timeoutMs);
    })
  ]).finally(() => clearTimeout(timer));
}

function transactionDone(tx) {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve(true);
    tx.onabort = () => reject(tx.error || new Error('Transacción IndexedDB abortada'));
    tx.onerror = () => reject(tx.error || new Error('Error de transacción IndexedDB'));
  });
}

function requestToPromise(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('Error de IndexedDB'));
  });
}

export async function initLocalDb(timeoutMs = DEFAULT_OPEN_TIMEOUT_MS) {
  try {
    return await withTimeout(openDatabase(), timeoutMs, 'Inicialización IndexedDB');
  } catch (error) {
    dbPromise = null;
    console.warn('IndexedDB no disponible; el Centro seguirá operando sin persistencia estructurada.', error);
    return null;
  }
}

export async function putDataset(key, value, timeoutMs = DEFAULT_IO_TIMEOUT_MS) {
  try {
    const db = await withTimeout(openDatabase(), timeoutMs, 'Apertura IndexedDB');
    if (!db) return false;
    const tx = db.transaction(STORES.datasets, 'readwrite');
    tx.objectStore(STORES.datasets).put({ value, storedAt: new Date().toISOString() }, key);
    await withTimeout(transactionDone(tx), timeoutMs, 'Escritura IndexedDB');
    return true;
  } catch (error) {
    dbPromise = null;
    throw error;
  }
}

export async function getDataset(key, timeoutMs = DEFAULT_IO_TIMEOUT_MS) {
  try {
    const db = await withTimeout(openDatabase(), timeoutMs, 'Apertura IndexedDB');
    if (!db) return null;
    const tx = db.transaction(STORES.datasets, 'readonly');
    return (await withTimeout(
      requestToPromise(tx.objectStore(STORES.datasets).get(key)),
      timeoutMs,
      'Lectura IndexedDB'
    )) || null;
  } catch (error) {
    dbPromise = null;
    throw error;
  }
}

export async function deleteDataset(key, timeoutMs = DEFAULT_IO_TIMEOUT_MS) {
  try {
    const db = await withTimeout(openDatabase(), timeoutMs, 'Apertura IndexedDB');
    if (!db) return false;
    const tx = db.transaction(STORES.datasets, 'readwrite');
    tx.objectStore(STORES.datasets).delete(key);
    await withTimeout(transactionDone(tx), timeoutMs, 'Eliminación IndexedDB');
    return true;
  } catch (error) {
    dbPromise = null;
    throw error;
  }
}

export async function setMeta(key, value) {
  const db = await openDatabase();
  if (!db) return false;
  const tx = db.transaction(STORES.meta, 'readwrite');
  tx.objectStore(STORES.meta).put(value, key);
  await transactionDone(tx);
  return true;
}

export async function getMeta(key) {
  const db = await openDatabase();
  if (!db) return null;
  const tx = db.transaction(STORES.meta, 'readonly');
  return (await requestToPromise(tx.objectStore(STORES.meta).get(key))) ?? null;
}

export async function deleteMeta(key) {
  const db = await openDatabase();
  if (!db) return false;
  const tx = db.transaction(STORES.meta, 'readwrite');
  tx.objectStore(STORES.meta).delete(key);
  await transactionDone(tx);
  return true;
}

export const localDb = Object.freeze({
  name: DB_NAME,
  version: DB_VERSION,
  stores: STORES
});
