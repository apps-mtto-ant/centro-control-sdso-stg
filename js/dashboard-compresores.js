import { api } from './api.js';
import { getDataset, putDataset } from './db.js';
import { markSuccessfulSync } from './offline.js';

const KEY = 'dashboardCompresores';
const $ = s => document.querySelector(s);
let snapshot = null;
let source = 'none';
let storedAt = null;

const clean = v => v == null || v === '' ? '—' : String(v);
const norm = v => clean(v).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();

function stamp(v) {
  if (!v) return 'Sin actualización';
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? clean(v) : new Intl.DateTimeFormat('es-CL',{dateStyle:'short',timeStyle:'short'}).format(d);
}

function setSource() {
  const el = $('#dashboardSource');
  if (!el) return;
  el.dataset.state = source;
  el.textContent = source === 'network' ? 'Datos en línea' :
    source === 'cache' ? `Caché local · ${stamp(storedAt)}` : 'Sin datos disponibles';
}

function options(select, values, label) {
  if (!select) return;
  const current = select.value;
  select.replaceChildren();
  const first = document.createElement('option');
  first.value = '';
  first.textContent = label;
  select.append(first);
  [...new Set(values.filter(Boolean))].sort((a,b)=>String(a).localeCompare(String(b),'es')).forEach(v=>{
    const o=document.createElement('option'); o.value=v; o.textContent=v; select.append(o);
  });
  if ([...select.options].some(o=>o.value===current)) select.value=current;
}

function distribution(selector, obj, area=false) {
  const root=$(selector); if (!root) return;
  root.replaceChildren();
  Object.entries(obj || {}).sort((a,b)=>area ? a[0].localeCompare(b[0],'es') : b[1]-a[1]).forEach(([name,value])=>{
    const row=document.createElement('div'); row.className='distribution-row';
    const a=document.createElement('span'); a.textContent=name;
    const b=document.createElement('strong');
    b.textContent=area ? `${value.total} eq. · ${value.disponibles} disp. · ${value.indisponibles} indis.` : String(value);
    row.append(a,b); root.append(row);
  });
}

function sapClass(v) {
  const n=norm(v);
  if (n.includes('confirmado')) return 'status-ok';
  if (n.includes('error')) return 'status-error';
  return 'status-pending';
}

function renderSummary() {
  const r=snapshot?.resumen || {};
  [['#kpiTotal',r.totalEquipos],['#kpiDisponibles',r.disponibles],['#kpiIndisponibles',r.indisponibles],['#kpiSinEstado',r.sinEstado],['#kpiNovedades',r.novedadesAbiertas]]
    .forEach(([s,v])=>{const el=$(s); if(el) el.textContent=clean(v,'0')==='—'?'0':clean(v);});
  const upd=$('#dashboardLastUpdate');
  if (upd) upd.textContent=r.ultimaActualizacion ? `Última actualización operacional: ${stamp(r.ultimaActualizacion)}` : 'Sin actualización operacional registrada';
  distribution('#areaDistribution',snapshot?.porArea,true);
  distribution('#modelDistribution',snapshot?.porModelo,false);
  distribution('#sapDistribution',snapshot?.validacionSAP,false);
}

function blob(item) {
  const m=item.maestro||{}, e=item.estadoActual||{};
  return norm([item.equipoId,m.numeroEquipoSAP,m.tag,m.modelo,m.modeloSAP,m.numeroSerie,m.denominacion,m.areaOperacional,m.ubicacionFisica,e.estado,e.subestado,e.disponibilidad,e.ubicacionActual].join(' '));
}

function filtered() {
  const q=norm($('#dashboardSearch')?.value||'');
  const area=$('#dashboardAreaFilter')?.value||'';
  const model=$('#dashboardModelFilter')?.value||'';
  const sap=$('#dashboardSapFilter')?.value||'';
  return (snapshot?.equipos||[]).filter(item=>{
    const m=item.maestro||{};
    return (!q||blob(item).includes(q)) && (!area||m.areaOperacional===area) && (!model||m.modelo===model) && (!sap||m.estadoValidacionSAP===sap);
  });
}

function cell(row,value,cls='') {
  const td=document.createElement('td'); if(cls) td.className=cls; td.textContent=clean(value); row.append(td);
}

function renderTable() {
  const body=$('#equipmentTableBody'); if(!body) return;
  body.replaceChildren();
  const rows=filtered();
  const count=$('#equipmentResultCount');
  if(count) count.textContent=`${rows.length} de ${snapshot?.equipos?.length||0} equipos`;
  rows.forEach(item=>{
    const m=item.maestro||{}, e=item.estadoActual||{};
    const tr=document.createElement('tr');
    cell(tr,item.equipoId,'cell-strong'); cell(tr,m.numeroEquipoSAP); cell(tr,m.areaOperacional); cell(tr,m.modelo,'cell-strong');
    cell(tr,m.denominacion); cell(tr,e.estado||'Sin estado'); cell(tr,e.disponibilidad); cell(tr,e.horometroActual);
    const td=document.createElement('td'), badge=document.createElement('span');
    badge.className=`table-status ${sapClass(m.estadoValidacionSAP)}`; badge.textContent=clean(m.estadoValidacionSAP); td.append(badge); tr.append(td);
    cell(tr,item.novedadesAbiertas||0); body.append(tr);
  });
  if(!rows.length){const tr=document.createElement('tr'),td=document.createElement('td');td.colSpan=10;td.className='table-empty';td.textContent='No hay equipos que coincidan con los filtros.';tr.append(td);body.append(tr);}
}

function render() {
  if(!snapshot) return;
  renderSummary();
  const eq=snapshot.equipos||[];
  options($('#dashboardAreaFilter'),eq.map(x=>x.maestro?.areaOperacional),'Todas las áreas');
  options($('#dashboardModelFilter'),eq.map(x=>x.maestro?.modelo),'Todos los modelos');
  options($('#dashboardSapFilter'),eq.map(x=>x.maestro?.estadoValidacionSAP),'Toda validación SAP');
  renderTable();
  setSource();
}

async function fromCache() {
  try {
    const cached=await getDataset(KEY);
    if(!cached?.value?.data) return false;
    snapshot=cached.value.data; source='cache'; storedAt=cached.storedAt||cached.value.storedAt||null; render(); return true;
  } catch(e) { console.warn('Caché Dashboard Compresores no disponible',e); return false; }
}

async function fromNetwork() {
  const response=await api.getDashboardCompresores();
  if(!response?.ok||!response?.data) throw new Error(response?.error?.message||'Respuesta de backend incompleta');
  snapshot=response.data; source='network'; storedAt=new Date().toISOString();
  await putDataset(KEY,{data:response.data,serverTime:response.serverTime||null,apiVersion:response.apiVersion||null,storedAt});
  markSuccessfulSync(response.serverTime ? new Date(response.serverTime) : new Date());
  window.dispatchEvent(new CustomEvent('sdso:sync'));
  render();
}

async function load(force=false) {
  const btn=$('#dashboardRefresh'); if(btn){btn.disabled=true;btn.textContent='Sincronizando…';}
  const cached=await fromCache();
  if(navigator.onLine&&api.configured){
    try{await fromNetwork();if(force)window.dispatchEvent(new CustomEvent('sdso:toast',{detail:'Dashboard Compresores actualizado'}));}
    catch(e){console.warn(e);if(!cached){source='error';setSource();}window.dispatchEvent(new CustomEvent('sdso:toast',{detail:cached?'Sin backend. Mostrando caché local.':'No fue posible cargar Dashboard Compresores.'}));}
  } else if(!cached){source='error';setSource();}
  if(btn){btn.disabled=false;btn.textContent='Actualizar datos';}
}

export function initDashboardCompresores() {
  ['dashboardSearch','dashboardAreaFilter','dashboardModelFilter','dashboardSapFilter'].forEach(id=>{
    const el=document.getElementById(id); if(el) el.addEventListener(id==='dashboardSearch'?'input':'change',renderTable);
  });
  $('#dashboardClearFilters')?.addEventListener('click',()=>{['dashboardSearch','dashboardAreaFilter','dashboardModelFilter','dashboardSapFilter'].forEach(id=>{const el=document.getElementById(id);if(el)el.value='';});renderTable();});
  $('#dashboardRefresh')?.addEventListener('click',()=>load(true));
  void load(false);
}
