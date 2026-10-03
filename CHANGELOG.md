# CHANGELOG — Centro de Control SDSO

# v0.4.0 — desarrollo

- Dashboard Compresores reestructurado en vistas operacionales para resumen, áreas, disponibilidad, horómetros, novedades, maestro, SAP y fin de turno.
- Formularios de supervisión previstos para estado vigente, lecturas y novedades; escritura requiere sesión validada por Apps Script y lista de editores.
- Fuente del horómetro vigente definida como última lectura del historial.
- Conciliación SAP calculada desde MAESTRO_EQUIPOS. Se agregan validación/idempotencia de registros y respuesta pública reducida.
- Captura de vista activa e informe fin de turno con alternativa de impresión/PDF.
- No habilitar formularios hasta desplegar y validar el backend y el Sheet de staging.
- AUTH12: `NO APLICA` se elimina de los selectores y de las vistas/KPI. En legado, un estado reconocido es autoridad y su disponibilidad se normaliza al valor canónico derivado; solo estados no reconocidos se muestran como **Sin estado**. `HISTORIAL_ESTADO` permanece inmutable.
- AUTH12 rc6: `ALLOWED_EMAILS` es obligatoria en todos los modos; `EDITOR_EMAILS` debe ser subconjunto de la allowlist.
- AUTH12 rc6: corregido bloqueo de render del frontend (`querySelectorAll` para controles `data-list`), normalización defensiva de snapshots heredados/caché y versión PWA `0.4.0-stg-auth12c`.
- AUTH12 rc6: smoke principal actualizada a la matriz cerrada con pruebas conductuales de combinaciones cruzadas, datos heredados y encabezado no clave de `HISTORIAL_ESTADO`.
- AUTH12 rc7: modelo operacional ampliado a seis estados. Disponibilidad pasa a ser derivada y no editable: `OPERATIVO`/`STAND BY` → `DISPONIBLE`; `FUERA DE SERVICIO`/`OVERHAUL`/`MANTENCION`/`FALLA` → `NO DISPONIBLE`. Backend ignora disponibilidad enviada por el cliente y persiste el valor derivado; `INDISPONIBLE` queda solo como legado normalizado en lectura.
- AUTH12 auth12j: corregidos flujo offline/reconexión PWA, ocultamiento de edición y cierre de sesión sin red, conservación segura de identidad visual offline y retorno online sin recarga forzada.
- AUTH12 resiliencia: timeout HTTP del frontend ampliado de 12 s a 30 s manteniendo reintentos idempotentes con el mismo requestId.
- AUTH12 smoke: corregida expectativa de conteo legado, agregada verificación de disponibilidad derivada en HISTORIAL_ESTADO y cobertura de legado contradictorio.
- Pre-release: se agrega chequeo automático para impedir merge/release con marcadores de configuración staging.
- Pre-release: el guard cubre además la URL del backend STG, la versión `-stg-`, la cabecera del service worker y los indicadores visibles `STAGING`; se ejecuta automáticamente en Pull Request hacia `main`.
- AUTH12 smoke: se agregan tres casos de legado contradictorio adicionales (`FUERA DE SERVICIO + DISPONIBLE`, `OPERATIVO + NO APLICA`, `OVERHAUL + vacío`).
- Documentación: README y scope incorporan contrato de operación offline (12 h, solo lectura, identidad visual local, revalidación Google y timeout/reintentos).

## v0.3.0 — candidata

### Dashboard Compresores
- Primer dashboard nativo conectado a Google Apps Script + Google Sheets.
- 31 equipos activos con KPIs, distribución por área/modelo, conciliación SAP, tabla, búsqueda y filtros.
- Catálogo de dashboards separado de la vista específica de Compresores: `#/dashboard` → catálogo, `#/dashboard-compresores` → dashboard.

### Offline / resiliencia
- Dataset de Compresores persistido en IndexedDB.
- Fallback a caché local validado con recarga completa sin Internet.
- La consulta de red se inicia sin esperar a IndexedDB.
- Si la persistencia local falla, los datos válidos de red siguen renderizándose.
- No se sustituye una caché válida por un snapshot vacío.
- Timeout de operaciones IndexedDB y recuperación de conexión.
- Recarga única cuando un Service Worker nuevo toma el control para evitar assets antiguos.
- Retry del backend ante fallos transitorios.

### Auditoría
- Reauditoría de cierre: APTO, sin bloqueadores.
- R1/R2 cerrados antes del release: protección contra snapshot vacío con IndexedDB lenta y estado activo del menú Dashboard en la vista Compresores.
- Auditoría integrada: 0 críticos, 4 altos, 13 medios y 10 bajos.
- Correcciones obligatorias frontend A01/A02/A03/A05 incorporadas en candidata r4.
- Pendientes de backend antes del release: validación de encabezados, reducción de metadata en `health` y minimización de campos públicos.

### Datos
- Conciliación validada: 24 CONFIRMADO, 6 PENDIENTE SAP, 1 ERROR MAESTRO SAP.
- EQ01, EQ16 y EQ17 confirmados operacionalmente por Mario.

## v0.2.0 — 2026-10-02

Primera versión estable de la etapa v0.2.

### Navegación y organización
- Navegación lateral simplificada: Inicio, Aplicaciones SDSO, Dashboard, Power BI e Informes / herramientas.
- Compresores y Centro Informe se retiran de la barra lateral por redundancia; permanecen como accesos rápidos en Inicio y dentro de Aplicaciones SDSO.
- Se incorpora la sección principal Dashboard, preparada para la migración progresiva de dashboards SDSO.
- Catálogo de Aplicaciones SDSO: App Compresores, Centro Informes de Turno, Mantención Clima ANT, Puentes Grúa y Polipastos ANT e Inspección de Polines.

### PWA / offline
- El Service Worker se registra sin depender de IndexedDB.
- Fallback a caché ante respuestas HTTP 5xx cuando existe una copia válida.
- Respuesta inmediata desde caché durante ventanas de red degradada para evitar timeouts acumulados.
- Aislamiento seguro entre producción y staging mediante prefijos de caché no solapados.
- Protección del almacenamiento local y apertura offline del app shell.

### IndexedDB y API
- Se incorpora `js/db.js` con stores iniciales `datasets`, `meta` y `outbox`.
- IndexedDB incorpora timeout, `onblocked`, `onversionchange`, reintento tras fallo y confirmación de escrituras al completar la transacción.
- `api.js` normaliza errores mediante `ApiError`.
- `health()` no marca sincronización real.
- `auth.can('consultar')` queda habilitado para el rol provisional LECTOR; la autorización real seguirá validándose backend-side.

### Interfaz y accesibilidad
- Topbar móvil más compacta y texto de sincronización legible.
- Foco correcto del drawer móvil y retorno al botón de menú al cerrar.
- Scroll al inicio al cambiar de sección.
- Iconografía específica para Compresores.
- Aplicaciones, Power BI e Informes/Herramientas se renderizan desde `js/config.js`.

### Entorno productivo
- `version: 0.2.0`
- `environment: production`
- `cachePrefix: centro-control-sdso-`
- `dbName: centro-control-sdso`
- `lastSyncKey: sdso:lastSync`

### Validaciones realizadas
- Cinco enlaces de Aplicaciones SDSO verificados por Mario.
- App shell offline validado en staging y producción.
- Staging verificado sin interferir con el caché offline de producción.
- Polines y Centro Informe actualmente no tienen Service Worker, por lo que no interfieren con el caché del Centro de Control.

### Pendientes de etapas posteriores
- La conectividad visible sigue basada en `navigator.onLine`; los estados `SINCRONIZANDO` y `CAMBIOS PENDIENTES` se activarán cuando exista backend/sincronización y edición offline reales.
- Antes de agregar páginas HTML separadas en `dashboards/` o `modules/`, revisar el fallback de navegación del Service Worker.
- Al migrar Compresores, Clima o Puentes al origen `apps-mtto-ant.github.io`, revisar sus Service Workers antes de publicar.

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
