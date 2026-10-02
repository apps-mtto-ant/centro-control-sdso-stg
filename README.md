# Centro de Control SDSO — v0.2.0-dev-r4

Versión de desarrollo de la etapa v0.2 del Centro de Control web/PWA de Minera Antucoya · Servicios de Soporte a la Operación.

> Rama de trabajo: `develop-v0.2`. La versión estable publicada permanece en `main` (`v0.1.2`).

## Alcance v0.2.0-dev-r4

- Mantiene navegación principal modular y diseño corporativo responsive.
- Mantiene App Compresores y Centro Informe como aplicaciones externas dentro de `Aplicaciones SDSO`.
- Catálogo actual: App Compresores, Centro Informes de Turno, Mantención Clima ANT, Puentes Grúa y Polipastos ANT e Inspección de Polines.
- Navegación lateral simplificada: Inicio, Aplicaciones SDSO, Dashboard, Power BI e Informes / herramientas.
- Se eliminan de la barra lateral los accesos redundantes a Compresores y Centro Informe; permanecen disponibles en Aplicaciones SDSO.
- Mejora resiliencia PWA ante red degradada y respuestas HTTP 5xx.
- Mejora experiencia móvil y accesibilidad del drawer.
- Parametriza Aplicaciones, Power BI e Informes/Herramientas desde `js/config.js`.
- Inicializa una capa IndexedDB sin activar todavía edición offline productiva.
- Prepara el contrato de `api.js` sin conectar todavía Apps Script.

## Aislamiento de desarrollo / producción

Esta entrega usa identificadores de **staging** para que una eventual publicación de desarrollo bajo el mismo origen no elimine ni modifique almacenamiento de producción:

```text
environment: staging
cachePrefix: stg-centro-control-sdso-
dbName: centro-control-sdso-stg
lastSyncKey: sdso-stg:lastSync
```

Antes del merge `develop-v0.2 → main` deben restaurarse los identificadores de producción:

```text
environment: production
cachePrefix: centro-control-sdso-
dbName: centro-control-sdso
lastSyncKey: sdso:lastSync
```

Además la versión debe cambiar de `0.2.0-dev-r4` a `0.2.0`.

## Estructura

```text
/
├── index.html
├── manifest.webmanifest
├── service-worker.js
├── README.md
├── CHANGELOG.md
├── css/
│   └── app.css
├── js/
│   ├── config.js
│   ├── app.js
│   ├── api.js
│   ├── offline.js
│   ├── db.js
│   └── auth.js
├── dashboards/
│   └── .gitkeep
├── modules/
│   └── .gitkeep
└── assets/
    └── icons/
```

## Configuración

La configuración compartida vive en `js/config.js`.

- `version`: versión de desarrollo y del caché PWA.
- `environment`: entorno actual (`staging` en esta entrega).
- `cachePrefix`, `dbName`, `lastSyncKey`: identificadores aislados por entorno.
- `backendUrl`: permanece vacío hasta la etapa de Apps Script.
- `links`: aplicaciones externas validadas/configuradas.
- `catalogs.apps`: orden de las aplicaciones mostradas.
- `catalogs.powerbi`: enlaces Power BI validados.
- `catalogs.tools`: informes y herramientas validados.

Solo se aceptan enlaces externos `https:`.

## IndexedDB

`js/db.js` crea la base local definida por `config.dbName` con tres stores iniciales:

- `datasets`: datos estructurados cacheados en futuras sincronizaciones.
- `meta`: metadatos de sincronización/configuración.
- `outbox`: cola futura para cambios pendientes de sincronización.

La apertura tiene timeout para no bloquear el arranque ni el registro del Service Worker. Se manejan estados `blocked` y `versionchange`. En esta dev no se habilita todavía edición offline.

## Contrato API preparado

`js/api.js` expone:

- `health()`
- `getConfig()`
- `getEquipos()`
- `getDashboard(name)`
- `sync()`

`health()` solo verifica disponibilidad. **No registra una sincronización exitosa.** `sync()` todavía representa el endpoint futuro; la fecha de última sincronización se actualizará únicamente después de descargar y persistir datos reales.

Los errores de backend se normalizan como `ApiError` con código y mensaje, en vez de propagar errores crudos del navegador.

## Estado offline

- El Service Worker se registra sin esperar a IndexedDB.
- N2 usa caché válida ante respuestas 5xx.
- N3 usa caché inmediata durante una ventana de red degradada; al expirar la ventana vuelve a probar la red.
- El indicador visual online/offline sigue basado en `navigator.onLine` en esta dev.
- Los estados `SINCRONIZANDO` y `CAMBIOS PENDIENTES` se completarán antes de cerrar v0.2.

## Prueba local

No abrir `index.html` mediante `file://`, porque usa módulos ES y Service Worker. Desde la raíz usar un servidor HTTP local, por ejemplo:

```bash
python -m http.server 8080
```

Luego abrir `http://localhost:8080/`.

## Flujo GitHub

1. Mantener `main` como versión estable publicada.
2. Subir esta entrega únicamente a `develop-v0.2` después de auditoría.
3. Auditar y probar la rama de desarrollo.
4. Validar los cinco enlaces externos y el Service Worker de Polines.
5. Corregir cualquier regresión.
6. Preparar valores productivos y versión `0.2.0`.
7. Hacer Pull Request `develop-v0.2` → `main` solo cuando v0.2 sea aprobada.

## Publicación en GitHub Pages

La versión productiva se publica desde `main` mediante GitHub Pages. La rama `develop-v0.2` no debe reemplazar la fuente de Pages de producción. Si se crea un sitio de staging bajo el mismo origen `apps-mtto-ant.github.io`, debe conservar los identificadores `*-stg-*` definidos en esta entrega.

## Regla de despliegue PWA

Todo cambio de HTML, CSS, JS, manifest o recursos del app shell debe incrementar `version` en `js/config.js`. El Service Worker usa ese valor para crear un nuevo caché y elimina únicamente cachés anteriores cuyo nombre comienza con el `cachePrefix` del entorno actual.
