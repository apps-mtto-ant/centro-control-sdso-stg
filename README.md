# Centro de Control SDSO — v0.4 en desarrollo

> La rama `develop-v0.4` contiene la candidata en desarrollo. Lee [docs/V0.4_SCOPE.md](docs/V0.4_SCOPE.md) y [backend/README.md](backend/README.md). En esta rama la configuración corresponde exclusivamente a staging y contiene su endpoint separado; no debe fusionarse en producción sin reemplazar esa configuración.

Candidata v0.4 del Centro de Control web/PWA de Minera Antucoya · Servicios de Soporte a la Operación. Producción permanece en v0.3.0 y no se modifica durante AUTH12.

## Alcance v0.4

- Mantiene la navegación modular: Inicio, Aplicaciones SDSO, Dashboard, Power BI e Informes / herramientas.
- `#/dashboard` es el catálogo de dashboards SDSO.
- `#/dashboard-compresores` contiene el primer dashboard nativo.
- Dashboard Compresores conectado a Google Apps Script + Google Sheets.
- KPIs, distribución por área/modelo, conciliación SAP, maestro de equipos, búsqueda y filtros.
- Caché estructurada en IndexedDB para consulta offline.
- Service Worker para app shell y operación PWA.
- App Compresores y Centro Informe continúan como aplicaciones externas.

## Arquitectura

```text
GitHub Pages
  → Frontend / PWA
  → Google Apps Script
  → Google Sheets
```

Offline:

```text
Service Worker + Cache Storage + IndexedDB
```

## Backend v0.4

API Apps Script autenticada para consulta operacional y escritura de editores autorizados:

- `health` público para diagnóstico del despliegue;
- `getEquipos` y `getDashboardCompresores` requieren sesión autorizada;
- `getNovedades` requiere sesión autorizada;
- escrituras requieren además pertenecer a `EDITOR_EMAILS`.

`ALLOWED_EMAILS` es obligatoria y enumera exactamente las cuentas habilitadas. `EDITOR_EMAILS` debe ser un subconjunto de esa lista.

## Datos esperados de Compresores

Estado validado al cierre de esta candidata:

- 31 equipos activos
- 24 CONFIRMADO SAP
- 6 PENDIENTE SAP
- 1 ERROR MAESTRO SAP

Regla operacional v0.4: el usuario selecciona únicamente el estado. La disponibilidad es derivada por backend y frontend: `OPERATIVO` y `STAND BY` → `DISPONIBLE`; `FUERA DE SERVICIO`, `OVERHAUL`, `MANTENCION` y `FALLA` → `NO DISPONIBLE`. Para datos heredados, un estado reconocido es la fuente de verdad aunque la disponibilidad almacenada sea contradictoria: la lectura proyecta la disponibilidad canónica derivada sin modificar la fila original. `NO APLICA` no forma parte del modelo; solo estados heredados no reconocidos se proyectan como **Sin estado**. `HISTORIAL_ESTADO` es inmutable: no se corrigen ni eliminan filas históricas.

## Operación offline y reconexión

- El acceso offline es **solo lectura** y usa la última caché válida de Compresores.
- La habilitación offline tiene una vigencia máxima de **12 horas** desde la última sincronización válida.
- La identidad visual del último usuario autorizado (correo/rol) puede conservarse localmente, pero el **Google ID token no se persiste**.
- Edición exige simultáneamente rol `EDITOR`, token válido en memoria y `navigator.onLine = true`; el backend vuelve a validar autorización.
- Si la PWA arranca sin red con una caché vigente, puede abrir el dashboard sin login y sin formularios de edición ni botón `Cerrar sesión`.
- Al recuperar red tras un arranque en frío offline, `Verificar` solicita autenticación Google nuevamente antes de volver al modo online.
- Las llamadas al backend usan timeout de **30 s** y hasta **2 intentos**; las escrituras reutilizan el mismo `requestId` para evitar duplicados.

## IndexedDB

Base configurada por `config.dbName`.

Stores:

- `datasets`
- `meta`
- `outbox`

La consulta online no debe depender de IndexedDB. Si el almacenamiento local falla, el dashboard debe seguir mostrando datos recibidos desde red y avisar que no estarán disponibles offline.

## Entornos

Producción:

```text
environment: production
cachePrefix: centro-control-sdso-
dbName: centro-control-sdso
lastSyncKey: sdso:lastSync
```

Staging usa identificadores separados con prefijo `stg-`.

## Regla de despliegue PWA

Todo release que modifique HTML, CSS, JS, manifest o app shell debe incrementar `version` en `js/config.js`.

Al tomar control un Service Worker nuevo, la app realiza una única recarga controlada para evitar combinaciones de HTML nuevo con assets HTTP antiguos.

## Publicación

Producción:

```text
https://apps-mtto-ant.github.io/centro-control-sdso/
```

Staging:

```text
https://apps-mtto-ant.github.io/centro-control-sdso-stg/
```

## Flujo de liberación

1. Desarrollo en `develop-v0.4`.
2. Sincronización a staging.
3. Pruebas online, offline, actualización PWA y backend.
4. Correcciones de auditoría.
5. Revisión final.
6. Ejecutar `node scripts/pre-release-check.js` después de sustituir toda configuración de staging; el chequeo debe quedar en verde antes del merge.
7. Merge controlado de `develop-v0.4 → main` solo después de aprobación.
8. Validación productiva y tag/release correspondiente.

## Pendiente posterior

- Validación final de PWA instalada en iPhone y operación offline/online.
- Revisión pre-release para sustituir toda configuración específica de staging antes de `main`.
- Paridad funcional progresiva con dashboards históricos donde aún corresponda.
