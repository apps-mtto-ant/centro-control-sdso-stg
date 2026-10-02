import { api } from './api.js';
import { getDataset, putDataset } from './db.js';
import { markSuccessfulSync } from './offline.js';
import { auth } from './auth.js';

const KEY = 'dashboardCompresores';
const $ = s => document.querySelector(s);
const $$ = (s, root = document) => [...root.querySelectorAll(s)];
let snapshot = null;
let novedades = null;
let source = 'none';
let storedAt = null;
let initialized = false;
let loading = null;
let activeTab = 'resumen';

const clean = v => v == null || v === '' ? '—' : String(v);
const nrm = v => (v == null ? '' : String(v)).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
const modelKey = v => (v == null ? '' : String(v)).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase().replace(/[^A-Z0-9]/g,'');
const safeArray = x => Array.isArray(x) ? x : [];
const equipment = () => safeArray(snapshot?.equipos).filter(x => nrm(x?.maestro?.activo || 'si') === 'si');
const hourmeter = item => item?.ultimaLecturaHorometro?.horometro ?? item?.estadoActual?.horometroActual;

function stamp(v) {
  if (!v) return 'Sin actualización';
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? clean(v) : new Intl.DateTimeFormat('es-CL',{dateStyle:'short',timeStyle:'short'}).format(d);
}
function localDateTime() {
  const d = new Date(Date.now() - new Date().getTimezoneOffset() * 60000);
  return d.toISOString().slice(0,16);
}
function setSource() {
  const el = $('#dashboardSource'); if (!el) return;
  el.dataset.state = source;
  el.textContent = source === 'network' ? 'Datos en línea' : source === 'cache' ? `Caché local · ${stamp(storedAt)}` : source === 'error' ? 'Error de carga' : 'Sin datos disponibles';
}
function text(tag, value, cls='') {
  const el = document.createElement(tag); if (cls) el.className = cls; el.textContent = clean(value); return el;
}
function cell(row, value, cls='') { const td=text('td',value,cls); row.append(td); }
function distribution(root, entries, formatter = v => v) {
  if (!root) return; root.replaceChildren();
  const rows = Object.entries(entries || {}).sort((a,b)=>String(a[0]).localeCompare(String(b[0]),'es'));
  if (!rows.length) { root.append(text('p','Sin registros disponibles.','empty-inline')); return; }
  rows.forEach(([name,value])=>{ const row=document.createElement('div'); row.className='distribution-row'; row.append(text('span',name),text('strong',formatter(value))); root.append(row); });
}
function barList(root, rows, valueKey, labelKey = 'name', percent = false) {
  if (!root) return; root.replaceChildren();
  if (!rows.length) { root.append(text('p','Sin datos suficientes para mostrar este gráfico.','empty-inline')); return; }
  const max=Math.max(1,...rows.map(x=>Number(x[valueKey])||0));
  rows.forEach(item=>{
    const row=document.createElement('div'); row.className='chart-bar-row';
    row.append(text('span',item[labelKey],'chart-bar-label'));
    const track=document.createElement('div'); track.className='chart-bar-track';
    const fill=document.createElement('span'); fill.className='chart-bar-fill';
    const value=Number(item[valueKey])||0; fill.style.width=`${Math.max(value > 0 ? 2 : 0,Math.min(100,value/max*100))}%`; track.append(fill);
    row.append(track,text('strong',percent?`${Math.round(value)}%`:value,'chart-bar-value')); root.append(row);
  });
}
function areaStats(items) {
  const out={};
  items.forEach(item=>{
    const area=item.maestro?.areaOperacional || 'SIN ÁREA';
    const s=out[area] ||= {total:0,disponibles:0,indisponibles:0,sinEstado:0,novedades:0,equipos:[]};
    s.total++; s.equipos.push(item); s.novedades += Number(item.novedadesAbiertas)||0;
    const d=nrm(item.estadoActual?.disponibilidad);
    if(d==='disponible')s.disponibles++; else if(d==='indisponible')s.indisponibles++; else s.sinEstado++;
  });
  return out;
}
function statusCounts(items) {
  const count={disponibles:0,indisponibles:0,sinEstado:0};
  items.forEach(x=>{const s=nrm(x.estadoActual?.disponibilidad);if(s==='disponible')count.disponibles++;else if(s==='indisponible')count.indisponibles++;else count.sinEstado++;});
  return count;
}
function renderKpis() {
  const items=equipment(), kpiItems=items.filter(x=>nrm(x.maestro?.aplicaKpi)==='si');
  const basis=kpiItems.length?kpiItems:items, s=statusCounts(basis);
  [['#kpiTotal',basis.length],['#kpiDisponibles',s.disponibles],['#kpiIndisponibles',s.indisponibles],['#kpiSinEstado',s.sinEstado],['#kpiNovedades',snapshot?.resumen?.novedadesAbiertas ?? items.reduce((a,x)=>a+(Number(x.novedadesAbiertas)||0),0)]]
    .forEach(([sel,val])=>{const el=$(sel);if(el)el.textContent=String(val??0);});
  const update=$('#dashboardLastUpdate'); if(update)update.textContent=snapshot?.resumen?.ultimaActualizacion?`Última actualización operacional: ${stamp(snapshot.resumen.ultimaActualizacion)}`:'Sin actualización operacional registrada';
  const fleet=[{name:'Disponibles',v:s.disponibles},{name:'Indisponibles',v:s.indisponibles},{name:'Sin estado',v:s.sinEstado}];
  barList($('#fleetChart'),fleet,'v','name');
  const byArea=areaStats(items);
  barList($('#availabilityMiniChart'),Object.entries(byArea).map(([name,a])=>({name,v:a.total-a.sinEstado?100*a.disponibles/(a.total-a.sinEstado):0})).sort((a,b)=>a.name.localeCompare(b.name,'es')),'v','name',true);
  const novTypes={}; safeArray(novedades).filter(n=>nrm(n.estado)!=='cerrada').forEach(n=>{const key=n.tipo||'SIN TIPO';novTypes[key]=(novTypes[key]||0)+1;});
  barList($('#noveltyMiniChart'),Object.entries(novTypes).map(([name,v])=>({name,v})),'v');
}
function createAreaCard(name, area, compact=false) {
  const card=document.createElement('article'); card.className='area-card';
  const head=document.createElement('div'); head.className='area-card-head'; head.append(text('h4',name),text('span',`${area.total} equipos`,'area-total')); card.append(head);
  const metrics=document.createElement('div'); metrics.className='area-metrics';
  [['Disponibles',area.disponibles,'ok'],['Indisponibles',area.indisponibles,'bad'],['Sin estado',area.sinEstado,'pending']].forEach(([label,value,cls])=>{const m=document.createElement('div');m.className=`area-metric ${cls}`;m.append(text('strong',value),text('span',label));metrics.append(m);});
  card.append(metrics);
  if (!compact) {
    const list=document.createElement('div');list.className='area-equipment-list';
    area.equipos.sort((a,b)=>a.equipoId.localeCompare(b.equipoId,'es')).forEach(item=>{const row=document.createElement('div');row.className='area-equipment-row';const state=item.estadoActual?.disponibilidad||item.estadoActual?.estado||'Sin estado';row.append(text('strong',`${item.equipoId} · ${item.maestro?.denominacion||item.maestro?.modelo||''}`),text('span',state));list.append(row);});
    card.append(list);
  }
  return card;
}
function renderAreas() {
  const stats=areaStats(equipment());
  [['#areaSummary',true],['#areaBoard',false]].forEach(([sel,compact])=>{const root=$(sel);if(!root)return;root.replaceChildren();const keys=Object.keys(stats).sort((a,b)=>a.localeCompare(b,'es'));if(!keys.length)root.append(text('p','Sin equipos disponibles.','empty-inline'));keys.forEach(k=>root.append(createAreaCard(k,stats[k],compact)));});
  const root=$('#availabilityChart');if(root){const data=Object.entries(stats).map(([name,a])=>({name,v:a.total>a.sinEstado?100*a.disponibles/(a.total-a.sinEstado):0}));barList(root,data,'v','name',true);}
  const stateChart=$('#areaStatusChart');if(stateChart){stateChart.replaceChildren();const rows=Object.entries(stats).sort((a,b)=>a[0].localeCompare(b[0],'es'));if(!rows.length)stateChart.append(text('p','Sin datos suficientes para mostrar este gráfico.','empty-inline'));rows.forEach(([name,a])=>{const line=document.createElement('div');line.className='area-status-row';line.append(text('span',name,'chart-bar-label'));[['Disponibles',a.disponibles,'ok'],['Indisponibles',a.indisponibles,'bad'],['Sin estado',a.sinEstado,'pending']].forEach(([label,value,kind])=>{const metric=document.createElement('span');metric.className=`area-status-count ${kind}`;metric.title=label;metric.textContent=`${label}: ${value}`;line.append(metric);});stateChart.append(line);});}
  const total=equipment().filter(x=>nrm(x.maestro?.aplicaKpi)==='si').length || equipment().length;
  const state=statusCounts(equipment().filter(x=>nrm(x.maestro?.aplicaKpi)==='si').length?equipment().filter(x=>nrm(x.maestro?.aplicaKpi)==='si'):equipment());
  const known=state.disponibles+state.indisponibles; $('#availabilityRate').textContent=known?`${Math.round(state.disponibles/known*100)}%`:'—';
  $('#availabilityBase').textContent=String(known);$('#availabilityMissing').textContent=String(state.sinEstado); void total;
}
function renderCritical() {
  const rows=equipment().filter(x=>nrm(x.maestro?.esCritico)==='si');
  const s=statusCounts(rows);$('#criticalTotal').textContent=String(rows.length);$('#criticalAvailable').textContent=String(s.disponibles);$('#criticalUnavailable').textContent=String(s.indisponibles);$('#criticalUnknown').textContent=String(s.sinEstado);
  const note=$('#criticalSourceNote');note.textContent=rows.length?'La criticidad proviene del campo esCritico en MAESTRO_EQUIPOS.':"No hay equipos marcados como críticos en el maestro. No se infiere criticidad desde estado, modelo ni aplicaKpi.";
  const openIds=new Set(safeArray(novedades).filter(n=>nrm(n.estado)!=='cerrada').map(n=>n.equipoId));barList($('#criticalStatusChart'),[{name:'Con novedad abierta',v:rows.filter(x=>openIds.has(x.equipoId)).length},{name:'Sin novedad abierta',v:rows.filter(x=>!openIds.has(x.equipoId)).length}],'v');
  const root=$('#criticalList');root.replaceChildren();rows.forEach(x=>{const area=x.maestro?.areaOperacional||'SIN ÁREA';const card=createAreaCard(`${x.equipoId} · ${x.maestro?.denominacion||x.maestro?.modelo||'Equipo'}`,{total:1,disponibles:nrm(x.estadoActual?.disponibilidad)==='disponible'?1:0,indisponibles:nrm(x.estadoActual?.disponibilidad)==='indisponible'?1:0,sinEstado:['disponible','indisponible'].includes(nrm(x.estadoActual?.disponibilidad))?0:1,equipos:[x]});card.classList.add('critical-card');card.prepend(text('span',area,'area-total'));root.append(card);});
}
function renderFilters() {
  const items=equipment();
  const sets=[['#dashboardAreaFilter',items.map(x=>x.maestro?.areaOperacional),'Todas las áreas'],['#dashboardModelFilter',items.map(x=>x.maestro?.modelo),'Todos los modelos'],['#dashboardSapFilter',items.map(x=>x.maestro?.estadoValidacionSAP),'Toda validación SAP']];
  sets.forEach(([sel,values,placeholder])=>{const el=$(sel);if(!el)return;const current=el.value;el.replaceChildren(new Option(placeholder,''));[...new Set(values.filter(Boolean))].sort((a,b)=>String(a).localeCompare(String(b),'es')).forEach(v=>el.add(new Option(v,v)));if([...el.options].some(o=>o.value===current))el.value=current;});
  $$('.equipment-select').forEach(el=>{const current=el.value;el.replaceChildren(new Option('Selecciona un equipo',''));items.slice().sort((a,b)=>a.equipoId.localeCompare(b.equipoId,'es')).forEach(x=>el.add(new Option(`${x.equipoId} · ${x.maestro?.denominacion||x.maestro?.modelo||'Equipo'}`,x.equipoId)));if([...el.options].some(o=>o.value===current))el.value=current;});
  $$('[data-list]').forEach(el=>{const list=snapshot?.listas?.[el.dataset.list]||[];const current=el.value;el.replaceChildren(new Option('Selecciona una opción',''));list.forEach(v=>el.add(new Option(v,v)));if([...el.options].some(o=>o.value===current))el.value=current;});
}
function matches(item) {
  const q=nrm($('#dashboardSearch')?.value||''),area=$('#dashboardAreaFilter')?.value||'',model=$('#dashboardModelFilter')?.value||'',sap=$('#dashboardSapFilter')?.value||'';
  const m=item.maestro||{};const all=nrm([item.equipoId,m.numeroEquipoSAP,m.tag,m.modelo,m.modeloSAP,m.denominacion,m.areaOperacional].join(' '));
  return (!q||all.includes(q))&&(!area||m.areaOperacional===area)&&(!model||modelKey(m.modelo)===modelKey(model))&&(!sap||m.estadoValidacionSAP===sap);
}
function renderTable() {
  const body=$('#equipmentTableBody');if(!body)return;body.replaceChildren();const rows=equipment().filter(matches);
  $('#equipmentResultCount').textContent=`${rows.length} de ${equipment().length} equipos activos`;
  rows.forEach(item=>{const m=item.maestro||{},e=item.estadoActual||{},tr=document.createElement('tr');cell(tr,item.equipoId,'cell-strong');cell(tr,m.numeroEquipoSAP);cell(tr,m.areaOperacional);cell(tr,m.modelo,'cell-strong');cell(tr,m.denominacion);cell(tr,e.estado||'Sin estado');cell(tr,e.disponibilidad);cell(tr,hourmeter(item));const sap=text('td',m.estadoValidacionSAP||'SIN ESTADO');sap.className=`sap-cell ${nrm(m.estadoValidacionSAP).includes('error')?'status-error':nrm(m.estadoValidacionSAP).includes('confirmado')?'status-ok':'status-pending'}`;tr.append(sap);body.append(tr);});
  if(!rows.length){const tr=document.createElement('tr'),td=text('td','No hay equipos que coincidan con los filtros.','table-empty');td.colSpan=9;tr.append(td);body.append(tr);}
}
function renderHorometers() {
  const body=$('#horometerTableBody');if(!body)return;body.replaceChildren();
  equipment().slice().sort((a,b)=>a.equipoId.localeCompare(b.equipoId,'es')).forEach(item=>{const reading=item.ultimaLecturaHorometro||null,tr=document.createElement('tr');cell(tr,item.equipoId,'cell-strong');cell(tr,item.maestro?.areaOperacional);cell(tr,reading?.horometro);cell(tr,stamp(reading?.fechaHora));cell(tr,stamp(item.estadoActual?.fechaHoraActualizacion));body.append(tr);});
  if(!equipment().length)body.append(text('td','Sin equipos disponibles.','table-empty'));
}
function sapState(item) {if(nrm(item.maestro?.activo)==='no')return'inactivo';const s=nrm(item.maestro?.estadoValidacionSAP);if(s.includes('confirmado'))return'confirmado';if(s.includes('error'))return'error';return'pendiente';}
function renderSap() {
  const totals={confirmado:0,pendiente:0,error:0,inactivo:0};
  safeArray(snapshot?.conciliacionSAP?.equipos||snapshot?.equipos).forEach(x=>totals[sapState(x)]++);
  $('#sapConfirmed').textContent=String(totals.confirmado);$('#sapPending').textContent=String(totals.pendiente);$('#sapError').textContent=String(totals.error);$('#sapInactive').textContent=String(totals.inactivo);
  distribution($('#sapReconciliationRows'),{'Activos en maestro':snapshot?.conciliacionSAP?.activos??equipment().length,'Claves SAP duplicadas':snapshot?.conciliacionSAP?.duplicadosSAP?.length??0,'Equipos sin clave SAP':snapshot?.conciliacionSAP?.sinSAP??0,'Modelos SAP distintos tras normalizar':snapshot?.conciliacionSAP?.modeloNoEquivalente?.length??0},v=>String(v));
}
function renderShift() {
  const items=equipment(), s=statusCounts(items);$('#turnTotal').textContent=String(items.length);$('#turnAvailable').textContent=String(s.disponibles);$('#turnUnavailable').textContent=String(s.indisponibles);$('#turnUnknown').textContent=String(s.sinEstado);
  $('#turnReportDate').textContent=`Informe generado ${new Intl.DateTimeFormat('es-CL',{dateStyle:'full',timeStyle:'short'}).format(new Date())}`;
  const body=$('#turnAreaBody');body.replaceChildren();Object.entries(areaStats(items)).sort((a,b)=>a[0].localeCompare(b[0],'es')).forEach(([name,a])=>{const tr=document.createElement('tr');[name,a.total,a.disponibles,a.indisponibles,a.sinEstado,a.novedades].forEach(v=>cell(tr,v));body.append(tr);});
  const root=$('#turnNoveltySummary');root.replaceChildren();if(!auth.signedIn){root.append(text('p','Inicia sesión con una cuenta autorizada para consultar el detalle de las novedades.','empty-inline'));return;}safeArray(novedades).filter(n=>nrm(n.estado)!=='cerrada').forEach(n=>root.append(noveltyCard(n,false)));if(!root.children.length)root.append(text('p','No hay novedades abiertas registradas.','empty-inline'));
}
function noveltyCard(n, allowClose=true) {
  const card=document.createElement('article');card.className='novelty-card';const head=document.createElement('div');head.className='novelty-card-head';head.append(text('strong',`${n.equipoId||'Equipo'} · ${n.tipo||'Novedad'}`),text('span',`${n.criticidad||'Sin criticidad'} · ${stamp(n.fechaHora)}`,'novelty-meta'));card.append(head);card.append(text('p',n.descripcion||'Sin descripción.','novelty-description'));
  const eq=equipment().find(x=>x.equipoId===n.equipoId);if(eq)card.append(text('small',eq.maestro?.areaOperacional||''));
  if(allowClose&&auth.can('editar')&&n.novedadId){const b=text('button','Cerrar novedad','icon-btn novelty-close');b.type='button';b.dataset.closeNovelty=n.novedadId;card.append(b);}return card;
}
function renderNovedades() {
  const root=$('#noveltyList');if(!root)return;root.replaceChildren();
  if(!auth.signedIn){root.append(text('p','Inicia sesión con una cuenta autorizada para consultar el detalle de las novedades.','empty-inline'));return;}
  safeArray(novedades).filter(n=>nrm(n.estado)!=='cerrada').forEach(n=>root.append(noveltyCard(n,true)));
  if(!root.children.length)root.append(text('p','No hay novedades abiertas registradas.','empty-inline'));
}
function render() {
  if(!snapshot)return;renderKpis();renderAreas();renderCritical();renderFilters();renderTable();renderHorometers();renderSap();renderShift();setSource();
  $$('input[type="datetime-local"]',document).forEach(el=>{if(!el.value)el.value=localDateTime();});
  const isEditor=auth.can('editar');$$('[data-editor-only]').forEach(el=>el.hidden=!isEditor);$('#signOutButton').hidden=!auth.signedIn;
  renderNovedades();
}
function isValidSnapshot(data) {return Boolean(data&&data.resumen&&Array.isArray(data.equipos)&&data.porArea&&data.porModelo&&data.validacionSAP);}
async function fromCache() {
  try {const cached=await getDataset(KEY);if(!cached?.value?.data)return false;if(source==='network')return true;snapshot=cached.value.data;source='cache';storedAt=cached.storedAt||cached.value.storedAt||null;render();return true;}
  catch(error){console.warn('Caché Compresores no disponible',error);return false;}
}
async function refreshNovedades() {
  if(!auth.signedIn){novedades=null;renderNovedades();return;}
  const response=await auth.refreshNovedades();if(!response?.ok||!Array.isArray(response.data?.novedades))throw new Error(response?.error?.message||'No fue posible cargar novedades.');
  novedades=response.data.novedades;render();
}
async function fromNetwork(cacheReady) {
  const response=await api.getDashboardCompresores();if(!response?.ok||!isValidSnapshot(response.data))throw new Error(response?.error?.message||'La respuesta del backend no cumple el esquema esperado.');
  if(response.data.equipos.length===0){try{await cacheReady;}catch{}if(snapshot?.equipos?.length)throw new Error('El backend devolvió cero equipos; se conserva la última caché válida.');}
  snapshot=response.data;source='network';storedAt=new Date().toISOString();render();
  try{const saved=await putDataset(KEY,{data:response.data,serverTime:response.serverTime||null,apiVersion:response.apiVersion||null,storedAt});if(saved){markSuccessfulSync(response.serverTime?new Date(response.serverTime):new Date());window.dispatchEvent(new CustomEvent('sdso:sync'));}}
  catch(error){console.warn('No se actualizó la caché offline',error);}
}
async function load(force=false) {
  if(loading)return loading;
  if(snapshot&&!force&&source==='network')return true;
  loading=(async()=>{
    const btn=$('#dashboardRefresh');if(btn){btn.disabled=true;btn.textContent='Sincronizando…';}
    const cachedPromise=fromCache();const networkPromise=navigator.onLine&&api.configured?fromNetwork(cachedPromise):null;const cached=await cachedPromise;
    if(networkPromise){try{await networkPromise;if(force)window.dispatchEvent(new CustomEvent('sdso:toast',{detail:'Dashboard Compresores actualizado.'}));}
      catch(error){console.warn('Actualización del dashboard rechazada:',error);if(!cached&&source!=='network'){source='error';setSource();}window.dispatchEvent(new CustomEvent('sdso:toast',{detail:cached?`No se pudo actualizar; se conserva la caché. ${error.message}`:`No se pudo cargar el dashboard. ${error.message}`}));}}
    else if(!cached){source='error';setSource();}
    if(btn){btn.disabled=false;btn.textContent='Actualizar datos';}return Boolean(snapshot);
  })().finally(()=>{loading=null;});
  return loading;
}
function setTab(name) {
  activeTab=name;$$('.dashboard-tab').forEach(b=>{const active=b.dataset.tab===name;b.classList.toggle('is-active',active);b.setAttribute('aria-selected',String(active));});
  $$('.dashboard-tab-panel').forEach(p=>{const active=p.dataset.panel===name;p.classList.toggle('is-active',active);p.hidden=!active;});
  if(name==='novedades'&&auth.signedIn)void refreshNovedades().catch(e=>window.dispatchEvent(new CustomEvent('sdso:toast',{detail:e.message})));
}
async function capture(tabName=activeTab) {
  const panel=$(`[data-panel="${tabName}"]`);if(!panel)return;
  if(typeof globalThis.html2canvas!=='function'){window.print();return;}
  const button=tabName==='turno'?$('#captureTurnReport'):$('#captureActiveTab');const original=button?.textContent;if(button){button.disabled=true;button.textContent='Preparando captura…';}
  try {
    const canvas=await globalThis.html2canvas(panel,{backgroundColor:'#ffffff',scale:Math.min(2,globalThis.devicePixelRatio||2),useCORS:true,logging:false,windowWidth:Math.max(panel.scrollWidth,document.documentElement.clientWidth),onclone:doc=>{doc.querySelectorAll('.dashboard-tab-panel:not(.is-active)').forEach(x=>x.style.display='none');}});
    const blob=await new Promise((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(new Error('No se pudo crear la imagen.')),'image/png'));
    const filename=`compresores-${tabName}-${new Date().toISOString().slice(0,10)}.png`;
    if(navigator.clipboard?.write&&globalThis.ClipboardItem){try{await navigator.clipboard.write([new ClipboardItem({'image/png':blob})]);window.dispatchEvent(new CustomEvent('sdso:toast',{detail:'Captura copiada al portapapeles.'}));return;}catch{}}
    const file=new File([blob],filename,{type:'image/png'});
    if(navigator.canShare?.({files:[file]})&&navigator.share){await navigator.share({files:[file],title:'Informe Compresores'});return;}
    const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=filename;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);
    window.dispatchEvent(new CustomEvent('sdso:toast',{detail:'Captura descargada.'}));
  } catch(error){window.dispatchEvent(new CustomEvent('sdso:toast',{detail:`No se pudo generar la captura: ${error.message}`}));}
  finally{if(button){button.disabled=false;button.textContent=original;}}
}
async function submitForm(form, method, success) {
  const msg=form.querySelector('.form-message');if(!navigator.onLine){msg.textContent='Conéctate a internet para enviar este registro.';return;}
  if(!auth.can('editar')||!auth.token){msg.textContent='Inicia sesión con una cuenta de supervisión autorizada.';return;}
  const button=form.querySelector('[type="submit"]');button.disabled=true;msg.textContent='Guardando…';
  const data=Object.fromEntries(new FormData(form).entries());
  if(data.fechaHora)data.fechaHora=new Date(data.fechaHora).toISOString();
  if(data.horometro)data.horometro=Number(data.horometro);
  const fingerprint=JSON.stringify(data);if(form.dataset.requestFingerprint!==fingerprint){form.dataset.requestFingerprint=fingerprint;form.dataset.requestId=crypto.randomUUID();}data.requestId=form.dataset.requestId;
  try{const result=await method(auth.token,data);if(!result?.ok)throw new Error(result?.error?.message||'El registro fue rechazado.');delete form.dataset.requestFingerprint;delete form.dataset.requestId;msg.textContent=success;form.reset();form.querySelectorAll('input[type="datetime-local"]').forEach(el=>el.value=localDateTime());await load(true);if(auth.signedIn)await refreshNovedades();}
  catch(error){msg.textContent=error.message||'No fue posible guardar el registro.';}
  finally{button.disabled=false;}
}
function bindForm(id,method,message) {const form=$(`#${id}`);form?.addEventListener('submit',event=>{event.preventDefault();if(form.reportValidity())void submitForm(form,method,message);});}
export function initDashboardCompresores() {
  if(initialized)return;initialized=true;
  $$('.dashboard-tab').forEach(button=>button.addEventListener('click',()=>setTab(button.dataset.tab)));
  ['dashboardSearch','dashboardAreaFilter','dashboardModelFilter','dashboardSapFilter'].forEach(id=>{const el=document.getElementById(id);el?.addEventListener(id==='dashboardSearch'?'input':'change',renderTable);});
  $('#dashboardClearFilters')?.addEventListener('click',()=>{['dashboardSearch','dashboardAreaFilter','dashboardModelFilter','dashboardSapFilter'].forEach(id=>{const el=document.getElementById(id);if(el)el.value='';});renderTable();});
  $('#dashboardRefresh')?.addEventListener('click',()=>void load(true));$('#captureActiveTab')?.addEventListener('click',()=>void capture());$('#captureTurnReport')?.addEventListener('click',()=>void capture('turno'));$('#printTurnReport')?.addEventListener('click',()=>window.print());
  $('#refreshNovedades')?.addEventListener('click',()=>void refreshNovedades().catch(e=>window.dispatchEvent(new CustomEvent('sdso:toast',{detail:e.message}))));
  $('#signOutButton')?.addEventListener('click',()=>auth.signOut());
  $('#noveltyList')?.addEventListener('click',event=>{const id=event.target.closest('[data-close-novelty]')?.dataset.closeNovelty;if(!id)return;if(!auth.can('editar'))return;void closeNovelty(id);});
  bindForm('statusForm',api.saveEstado,'Estado actualizado.');bindForm('horometerForm',api.saveHorometro,'Lectura de horómetro registrada.');bindForm('noveltyForm',api.saveNovedad,'Novedad registrada.');
  auth.init(()=>{if(snapshot)render();if(auth.signedIn)void refreshNovedades().catch(e=>console.warn(e));else{novedades=null;renderNovedades();}});
}
async function closeNovelty(novedadId) {
  if(!navigator.onLine){window.dispatchEvent(new CustomEvent('sdso:toast',{detail:'Conéctate a internet para cerrar la novedad.'}));return;}
  const observacionCierre=prompt('Observación de cierre (opcional):')||'';
  try{const result=await api.closeNovedad(auth.token,{novedadId,observacionCierre,requestId:crypto.randomUUID()});if(!result?.ok)throw new Error(result?.error?.message||'No fue posible cerrar la novedad.');await refreshNovedades();await load(true);}
  catch(error){window.dispatchEvent(new CustomEvent('sdso:toast',{detail:error.message}));}
}
export function loadDashboardCompresores(force=false){return load(force);}
