# CHANGELOG — Centro de Control SDSO

## v0.2.0-dev-r4

### Ajustes r4
- Corrige N-1: el prefijo de caché de staging pasa a `stg-centro-control-sdso-`, evitando que el prefijo productivo pueda coincidir con él.
- Navegación lateral simplificada: Inicio, Aplicaciones SDSO, Dashboard, Power BI e Informes / herramientas.
- Se retiran Compresores y Centro Informe de la barra lateral por redundancia; siguen disponibles dentro de Aplicaciones SDSO y mediante sus rutas internas.
- Se agrega sección principal Dashboard, dejando preparado el acceso al futuro Dashboard Compresores y siguientes dashboards SDSO.
- La etiqueta de versión del HTML queda genérica y es completada desde `js/config.js`.


Cuarta entrega de desarrollo de la etapa v0.2. Se mantiene fuera de `main` hasta completar auditoría y validación operacional.

### Correcciones de auditoría r2
- **I-1:** el Service Worker se registra inmediatamente y ya no depende de que IndexedDB responda. La inicialización de IndexedDB ocurre en segundo plano con timeout de 3 s.
- IndexedDB incorpora manejo de `onblocked`, `onversionchange`, reintento después de un fallo y confirmación de escrituras al completar la transacción.
- **I-2:** al abrir el drawer móvil, el foco se mueve al primer enlace después de la transición; al cerrar vuelve al botón de menú.
- **I-3:** la entrega de desarrollo usa identificadores aislados de producción:
  - caché `stg-centro-control-sdso-*`;
  - IndexedDB `centro-control-sdso-stg`;
  - última sincronización `sdso-stg:lastSync`.
  Antes del merge a `main` estos identificadores deben volver a los valores productivos.
- **M-1:** N3 responde inmediatamente desde caché durante la ventana de red degradada sin bloquear la pantalla; la red vuelve a probarse al expirar la ventana de degradación.
- **M-4:** `api.js` normaliza errores mediante `ApiError` con códigos (`TIMEOUT`, `NETWORK_ERROR`, `HTTP_ERROR`, etc.).
- **M-5:** `auth.can('consultar')` devuelve `true` para el rol provisional LECTOR; la autorización real seguirá siendo backend-side.
- **M-7:** se emiten advertencias de consola ante ids desconocidos o duplicados en `catalogs.apps`.
- **M-8:** el cambio de sección usa `window.scrollTo(0, 0)` por compatibilidad.

### PWA / offline ya incorporado en v0.2
- **N2:** si la red responde HTTP 5xx y existe una copia válida en caché, el Service Worker entrega la copia cacheada.
- **N3:** si ya se detectó red degradada, una nueva navegación usa `index.html` cacheado inmediatamente sin bloquear la pantalla; la red vuelve a probarse al expirar la ventana temporal.
- `js/db.js` mantiene la base IndexedDB inicial con stores `datasets`, `meta` y `outbox` para evolución posterior.

### Interfaz y configuración modular
- Topbar móvil compacta y texto de sincronización legible.
- Scroll al inicio al cambiar de sección y gestión de foco del drawer.
- Icono específico de Compresores.
- Aplicaciones SDSO, Power BI e Informes/Herramientas se renderizan desde `js/config.js`.
- Catálogo actual: App Compresores, Centro Informes de Turno, Mantención Clima ANT, Puentes Grúa y Polipastos ANT e Inspección de Polines.
- Power BI y herramientas permanecen vacíos hasta contar con URLs validadas.

### Pendiente de validación antes del merge
- Mario debe confirmar los cinco enlaces del catálogo.
- Claude debe revisar el `service-worker.js` de Polines por convivencia en `apps-mtto-ant.github.io`.
- El indicador de conectividad sigue basado en `navigator.onLine`; estados `SINCRONIZANDO` y `CAMBIOS PENDIENTES` se completarán antes de cerrar v0.2.
- Antes de mergear a `main`: cambiar `version` a `0.2.0`, `environment` a producción y restaurar los identificadores productivos de caché, IndexedDB y `lastSync`.

## v0.1.2

- Corrección C3 residual: Service Worker registrado con `updateViaCache: 'none'` y revalidación del shell con `cache: 'no-cache'`.
- Corrección N1: detección temporal de red degradada para evitar timeouts acumulados en recursos cacheados.
- Protección de `localStorage` ante almacenamiento bloqueado.
- URL real del Centro Informe Fin de Turno incorporada.
- Textos y documentación actualizados.

## v0.1.1

- Corrección de sincronización ficticia.
- Aislamiento de cachés respecto de otras PWA del mismo origen.
- Navegación por hash con historial.
- Catálogo seguro sin `innerHTML` para datos configurables.
- Indicador online/offline visible en móvil.
- Manifest, accesibilidad y documentación reforzados.
