import express from 'express';
import jwt from 'jsonwebtoken';
import { q, checkPassword, hoy } from './db.js';

const SECRET = process.env.JWT_SECRET || 'dev-secret-cambiar';
const PORT = process.env.PORT || 3000;
const ESTADOS = ['disponible', 'en_uso', 'reservado', 'en_reparacion'];

const app = express();
app.use(express.json());
app.use(express.static('public'));

const cookieDe = (req, nombre) =>
  (req.headers.cookie || '').split(';').map((c) => c.trim().split('='))
    .find(([k]) => k === nombre)?.[1];

function auth(req, res, next) {
  try {
    req.user = jwt.verify(cookieDe(req, 'token'), SECRET);
    next();
  } catch {
    res.status(401).json({ error: 'No autenticado' });
  }
}

const soloEncargado = (req, res, next) =>
  req.user.rol === 'encargado' ? next() : res.status(403).json({ error: 'Solo el encargado' });

const falla = (res, code, error) => res.status(code).json({ error });

// Un equipo con reserva para hoy se ve "reservado" si estaba disponible
const conEstado = (e) => ({
  ...e,
  estado: e.estado === 'disponible' && q.hayReservaHoy(e.id) ? 'reservado' : e.estado,
});

app.get('/health', (_req, res) => res.send('ok'));

app.post('/login', (req, res) => {
  const { nombre, password } = req.body || {};
  const u = q.usuarioPorNombre(nombre || '');
  if (!u || !checkPassword(password || '', u.password)) return falla(res, 401, 'Credenciales inválidas');
  const token = jwt.sign({ id: u.id, nombre: u.nombre, rol: u.rol }, SECRET, { expiresIn: '8h' });
  res.setHeader('Set-Cookie', `token=${token}; HttpOnly; Path=/; SameSite=Lax; Max-Age=28800`);
  res.json({ id: u.id, nombre: u.nombre, rol: u.rol });
});

app.post('/logout', (_req, res) => {
  res.setHeader('Set-Cookie', 'token=; HttpOnly; Path=/; Max-Age=0');
  res.json({ ok: true });
});

app.get('/me', auth, (req, res) => res.json(req.user));

app.get('/equipos', auth, (req, res) => {
  res.json(q.buscar(req.query.q || '').map(conEstado));
});

app.post('/equipos', auth, soloEncargado, (req, res) => {
  const { nombre, tipo, ubicacion } = req.body || {};
  if (!nombre || !tipo || !ubicacion) return falla(res, 400, 'Faltan nombre, tipo o ubicación');
  res.status(201).json({ id: Number(q.crearEquipo(nombre, tipo, ubicacion)) });
});

app.patch('/equipos/:id/estado', auth, soloEncargado, (req, res) => {
  const { estado } = req.body || {};
  const e = q.equipo(req.params.id);
  if (!e) return falla(res, 404, 'Equipo no existe');
  if (!ESTADOS.includes(estado)) return falla(res, 400, 'Estado inválido');
  if (e.estado === 'en_uso' && estado !== 'en_uso') q.cerrarUso(e.id);
  q.setEstado(e.id, estado);
  res.json({ ok: true });
});

app.post('/equipos/:id/tomar', auth, (req, res) => {
  const e = q.equipo(req.params.id);
  if (!e) return falla(res, 404, 'Equipo no existe');
  if (e.estado === 'en_uso') return falla(res, 409, 'Ya está en uso');
  if (e.estado === 'en_reparacion') return falla(res, 409, 'Está en reparación');
  const reserva = q.reservaEnFecha(e.id, hoy());
  if (reserva && reserva.usuario_id !== req.user.id) return falla(res, 409, 'Está reservado para hoy por otra persona');
  if (reserva) q.borrarReserva(reserva.id);
  q.abrirUso(e.id, req.user.id);
  q.setEstado(e.id, 'en_uso');
  res.json({ ok: true });
});

app.post('/equipos/:id/devolver', auth, (req, res) => {
  const e = q.equipo(req.params.id);
  if (!e) return falla(res, 404, 'Equipo no existe');
  const uso = q.usoAbierto(e.id);
  if (e.estado !== 'en_uso' || !uso) return falla(res, 409, 'El equipo no está en uso');
  if (uso.usuario_id !== req.user.id && req.user.rol !== 'encargado')
    return falla(res, 403, 'Solo quien lo tomó o el encargado puede devolverlo');
  q.cerrarUso(e.id);
  q.setEstado(e.id, 'disponible');
  res.json({ ok: true });
});

app.post('/equipos/:id/reservar', auth, (req, res) => {
  const { fecha } = req.body || {};
  const e = q.equipo(req.params.id);
  if (!e) return falla(res, 404, 'Equipo no existe');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha || '')) return falla(res, 400, 'Fecha inválida (AAAA-MM-DD)');
  if (fecha < hoy()) return falla(res, 400, 'La fecha ya pasó');
  if (e.estado === 'en_uso' || e.estado === 'en_reparacion')
    return falla(res, 409, 'Un equipo en uso o en reparación no se puede reservar');
  if (q.reservaEnFecha(e.id, fecha)) return falla(res, 409, 'Ya hay una reserva para esa fecha');
  q.crearReserva(e.id, req.user.id, fecha);
  res.status(201).json({ ok: true });
});

app.get('/equipos/:id/historial', auth, (req, res) => {
  if (!q.equipo(req.params.id)) return falla(res, 404, 'Equipo no existe');
  res.json({ historial: q.historial(req.params.id), reservas: q.reservasFuturas(req.params.id) });
});

app.get('/avisos', auth, (req, res) => {
  res.json(q.vencidas(req.user.id, req.user.rol));
});

app.listen(PORT, () => console.log(`Inventario escuchando en :${PORT}`));
