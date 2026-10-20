const $ = (id) => document.getElementById(id);
const ETQ = { disponible: 'Disponible', en_uso: 'En uso', reservado: 'Reservado', en_reparacion: 'En reparación' };
let yo = null;

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

async function api(url, method = 'GET', body) {
  const r = await fetch(url, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await r.json().catch(() => ({}));
  if (r.status === 401 && url !== '/login') { mostrarLogin(); throw new Error('Sesión expirada'); }
  if (!r.ok) throw new Error(data.error || 'Error');
  return data;
}

function mostrarLogin() {
  yo = null;
  $('app').classList.add('hide');
  $('login').classList.remove('hide');
}

async function iniciar() {
  try { yo = await api('/me'); } catch { return mostrarLogin(); }
  $('login').classList.add('hide');
  $('app').classList.remove('hide');
  $('quien').textContent = `${yo.nombre} (${yo.rol})`;
  $('admin').classList.toggle('hide', yo.rol !== 'encargado');
  cargar();
}

async function cargar() {
  try {
    const [equipos, avisos] = await Promise.all([api('/equipos?q=' + encodeURIComponent($('q').value)), api('/avisos')]);
    $('avisos').innerHTML = avisos.map((a) =>
      `<div class="card aviso">Reserva vencida: <b>${esc(a.equipo)}</b> (${esc(a.usuario)}, ${esc(a.desde)})</div>`).join('');
    $('lista').innerHTML = equipos.map(tarjeta).join('') || '<p class="mut">Sin resultados.</p>';
    pintarMapa(equipos);
  } catch (e) { $('err').textContent = e.message; }
}

function tarjeta(e) {
  const puedeDevolver = e.estado === 'en_uso' && (e.usado_por_id === yo.id || yo.rol === 'encargado');
  const botones = [
    e.estado !== 'en_uso' && e.estado !== 'en_reparacion' ? `<button data-a="tomar" data-id="${e.id}">Tomar</button>` : '',
    puedeDevolver ? `<button data-a="devolver" data-id="${e.id}">Devolver</button>` : '',
    e.estado !== 'en_uso' && e.estado !== 'en_reparacion' ? `<button data-a="reservar" data-id="${e.id}">Reservar</button>` : '',
    `<button data-a="historial" data-id="${e.id}">Historial</button>`,
    yo.rol === 'encargado' ? `<select data-a="estado" data-id="${e.id}">${Object.entries(ETQ).filter(([k]) => k !== 'reservado')
      .map(([k, v]) => `<option value="${k}" ${k === e.estado ? 'selected' : ''}>${v}</option>`).join('')}</select>` : '',
  ].join('');
  return `<div class="card"><div class="eq">
    <div><b>${esc(e.nombre)}</b> <span class="tag ${e.estado}">${ETQ[e.estado]}</span>
      <div class="mut">${esc(e.tipo)} · ${esc(e.ubicacion)}${e.usado_por ? ' · en uso por ' + esc(e.usado_por) : ''}</div></div>
    <div class="row">${botones}</div></div><div id="h-${e.id}" class="mut"></div></div>`;
}

function pintarMapa(equipos) {
  const zonas = {};
  equipos.forEach((e) => (zonas[e.ubicacion] ||= []).push(e));
  $('mapa').innerHTML = Object.entries(zonas).map(([z, es]) =>
    `<div class="zona"><b>${esc(z)}</b>${es.map((e) => `<span class="chip ${e.estado}">${esc(e.nombre)}</span>`).join('')}</div>`).join('');
}

async function accion(a, id, valor) {
  $('err').textContent = '';
  try {
    if (a === 'tomar') await api(`/equipos/${id}/tomar`, 'POST');
    if (a === 'devolver') await api(`/equipos/${id}/devolver`, 'POST');
    if (a === 'estado') await api(`/equipos/${id}/estado`, 'PATCH', { estado: valor });
    if (a === 'reservar') {
      const fecha = prompt('Fecha de la reserva (AAAA-MM-DD):', new Date().toISOString().slice(0, 10));
      if (!fecha) return;
      await api(`/equipos/${id}/reservar`, 'POST', { fecha });
    }
    if (a === 'historial') {
      const { historial, reservas } = await api(`/equipos/${id}/historial`);
      const lin = historial.map((m) => `${m.tipo === 'uso' ? 'Uso' : 'Reserva'}: ${esc(m.usuario)} · ${esc(m.desde.slice(0, 16).replace('T', ' '))}${m.hasta ? ' → ' + esc(m.hasta.slice(0, 16).replace('T', ' ')) : ''}`);
      const futuras = reservas.map((r) => `${esc(r.desde)} (${esc(r.usuario)})`).join(', ');
      $('h-' + id).innerHTML = (lin.join('<br>') || 'Sin historial.') + (futuras ? `<br><b>Reservas próximas:</b> ${futuras}` : '');
      return;
    }
    cargar();
  } catch (e) { $('err').textContent = e.message; cargar(); }
}

$('lista').addEventListener('click', (ev) => {
  const b = ev.target.closest('button[data-a]');
  if (b) accion(b.dataset.a, b.dataset.id);
});
$('lista').addEventListener('change', (ev) => {
  if (ev.target.matches('select[data-a]')) accion('estado', ev.target.dataset.id, ev.target.value);
});

let t;
$('q').addEventListener('input', () => { clearTimeout(t); t = setTimeout(cargar, 250); });

$('f-login').addEventListener('submit', async (ev) => {
  ev.preventDefault();
  try {
    await api('/login', 'POST', { nombre: $('l-nombre').value, password: $('l-pass').value });
    $('l-err').textContent = '';
    iniciar();
  } catch (e) { $('l-err').textContent = e.message; }
});

$('salir').addEventListener('click', async () => { await api('/logout', 'POST'); mostrarLogin(); });

$('f-alta').addEventListener('submit', async (ev) => {
  ev.preventDefault();
  try {
    await api('/equipos', 'POST', { nombre: $('a-nombre').value, tipo: $('a-tipo').value, ubicacion: $('a-ubic').value });
    ev.target.reset();
    cargar();
  } catch (e) { $('err').textContent = e.message; }
});

iniciar();
