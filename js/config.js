(function (root) {
  'use strict';

  const freezeList = items => Object.freeze(items.map(item => Object.freeze(item)));

  root.SDSO_CONFIG = Object.freeze({
    version: '0.2.0-dev-r4',
    environment: 'staging',
    cachePrefix: 'stg-centro-control-sdso-',
    dbName: 'centro-control-sdso-stg',
    lastSyncKey: 'sdso-stg:lastSync',
    backendUrl: '',

    links: Object.freeze({
      compressors: Object.freeze({
        id: 'compressors',
        name: 'App Compresores',
        description: 'Aplicación operacional de Compresores vigente.',
        url: 'https://mmorenorissi.github.io/checklist-compresores/'
      }),
      turnReport: Object.freeze({
        id: 'turnReport',
        name: 'Centro Informe Fin de Turno',
        description: 'Aplicación vigente para informe y consolidación del turno.',
        url: 'https://apps-mtto-ant.github.io/Centro-Informes-Turno/'
      }),
      polines: Object.freeze({
        id: 'polines',
        name: 'Inspección de Polines',
        description: 'Aplicación desarrollada desde SdSO para inspección y gestión de polines.',
        url: 'https://apps-mtto-ant.github.io/inspeccion-polines/'
      }),
      clima: Object.freeze({
        id: 'clima',
        name: 'Mantención Clima ANT',
        description: 'Aplicación vigente para gestión de mantención de equipos de climatización.',
        url: 'https://mmorenorissi.github.io/mantencion-clima-ant/'
      }),
      puentes: Object.freeze({
        id: 'puentes',
        name: 'Puentes Grúa y Polipastos ANT',
        description: 'Aplicación vigente para gestión de puentes grúa y polipastos.',
        url: 'https://mmorenorissi.github.io/mantencion-puentes-y-polipastos-ant/'
      })
    }),

    catalogs: Object.freeze({
      apps: Object.freeze(['compressors', 'turnReport', 'clima', 'puentes', 'polines']),
      powerbi: freezeList([]),
      tools: freezeList([])
    })
  });
})(globalThis);
