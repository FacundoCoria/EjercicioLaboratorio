import { DatabaseSync } from 'node:sqlite';
import { scryptSync, randomBytes, timingSafeEqual } from 'node:crypto';

const db = new DatabaseSync(process.env.DB_PATH || './lab.db');
db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');

db.exec(`
CREATE TABLE IF NOT EXISTS usuarios (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nombre TEXT NOT NULL UNIQUE,
  password TEXT NOT NULL,
  rol TEXT NOT NULL CHECK (rol IN ('usuario','encargado'))
);
CREATE TABLE IF NOT EXISTS equipos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nombre TEXT NOT NULL,
  tipo TEXT NOT NULL,
  ubicacion TEXT NOT NULL,
  estado TEXT NOT NULL DEFAULT 'disponible'
    CHECK (estado IN ('disponible','en_uso','reservado','en_reparacion'))
);
CREATE TABLE IF NOT EXISTS movimientos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  equipo_id INTEGER NOT NULL REFERENCES equipos(id),
  usuario_id INTEGER NOT NULL REFERENCES usuarios(id),
  tipo TEXT NOT NULL CHECK (tipo IN ('uso','reserva')),
  desde TEXT NOT NULL,
  hasta TEXT
);
`);

export function hashPassword(pw) {
  const salt = randomBytes(16).toString('hex');
  return `${salt}:${scryptSync(pw, salt, 32).toString('hex')}`;
}

export function checkPassword(pw, stored) {
  const [salt, hash] = stored.split(':');
  return timingSafeEqual(scryptSync(pw, salt, 32), Buffer.from(hash, 'hex'));
}

if (db.prepare('SELECT COUNT(*) AS n FROM usuarios').get().n === 0) {
  const u = db.prepare('INSERT INTO usuarios (nombre, password, rol) VALUES (?,?,?)');
  u.run('ana', hashPassword('ana123'), 'usuario');
  u.run('luis', hashPassword('luis123'), 'usuario');
  u.run('encargado', hashPassword('admin123'), 'encargado');
  const e = db.prepare('INSERT INTO equipos (nombre, tipo, ubicacion) VALUES (?,?,?)');
  e.run('Osciloscopio Rigol', 'Medición', 'Mesa 1');
  e.run('Multímetro Fluke', 'Medición', 'Mesa 1');
  e.run('Fuente de poder 30V', 'Alimentación', 'Mesa 2');
  e.run('Microscopio óptico', 'Óptica', 'Armario A');
  e.run('Impresora 3D', 'Fabricación', 'Armario B');
}

const hoy = () => new Date().toISOString().slice(0, 10);

export const q = {
  buscar(texto) {
    const like = `%${texto}%`;
    return db.prepare(`
      SELECT e.*, u.nombre AS usado_por, m.usuario_id AS usado_por_id
      FROM equipos e
      LEFT JOIN movimientos m ON m.equipo_id = e.id AND m.tipo = 'uso' AND m.hasta IS NULL
      LEFT JOIN usuarios u ON u.id = m.usuario_id
      WHERE e.nombre LIKE ? OR e.tipo LIKE ? OR e.ubicacion LIKE ?
      ORDER BY e.ubicacion, e.nombre`).all(like, like, like);
  },
  equipo: (id) => db.prepare('SELECT * FROM equipos WHERE id = ?').get(id),
  usuarioPorNombre: (n) => db.prepare('SELECT * FROM usuarios WHERE nombre = ?').get(n),
  crearEquipo: (n, t, u) =>
    db.prepare('INSERT INTO equipos (nombre, tipo, ubicacion) VALUES (?,?,?)').run(n, t, u).lastInsertRowid,
  setEstado: (id, estado) => db.prepare('UPDATE equipos SET estado = ? WHERE id = ?').run(estado, id),
  usoAbierto: (eqId) =>
    db.prepare("SELECT * FROM movimientos WHERE equipo_id = ? AND tipo = 'uso' AND hasta IS NULL").get(eqId),
  abrirUso(eqId, uid) {
    db.prepare("INSERT INTO movimientos (equipo_id, usuario_id, tipo, desde) VALUES (?,?, 'uso', ?)")
      .run(eqId, uid, new Date().toISOString());
  },
  cerrarUso(eqId) {
    db.prepare("UPDATE movimientos SET hasta = ? WHERE equipo_id = ? AND tipo = 'uso' AND hasta IS NULL")
      .run(new Date().toISOString(), eqId);
  },
  reservaEnFecha: (eqId, fecha) =>
    db.prepare("SELECT * FROM movimientos WHERE equipo_id = ? AND tipo = 'reserva' AND desde = ?").get(eqId, fecha),
  reservaDe: (eqId, uid, fecha) =>
    db.prepare("SELECT * FROM movimientos WHERE equipo_id = ? AND usuario_id = ? AND tipo = 'reserva' AND desde = ?")
      .get(eqId, uid, fecha),
  crearReserva: (eqId, uid, fecha) =>
    db.prepare("INSERT INTO movimientos (equipo_id, usuario_id, tipo, desde) VALUES (?,?, 'reserva', ?)")
      .run(eqId, uid, fecha),
  borrarReserva: (id) => db.prepare('DELETE FROM movimientos WHERE id = ?').run(id),
  reservasFuturas: (eqId) =>
    db.prepare(`SELECT m.desde, u.nombre AS usuario FROM movimientos m JOIN usuarios u ON u.id = m.usuario_id
      WHERE m.equipo_id = ? AND m.tipo = 'reserva' AND m.desde >= ? ORDER BY m.desde`).all(eqId, hoy()),
  hayReservaHoy: (eqId) => !!q.reservaEnFecha(eqId, hoy()),
  historial: (eqId) =>
    db.prepare(`SELECT m.tipo, m.desde, m.hasta, u.nombre AS usuario FROM movimientos m
      JOIN usuarios u ON u.id = m.usuario_id WHERE m.equipo_id = ? ORDER BY m.id DESC`).all(eqId),
  vencidas: (uid, rol) =>
    db.prepare(`SELECT m.id, m.desde, e.nombre AS equipo, u.nombre AS usuario FROM movimientos m
      JOIN equipos e ON e.id = m.equipo_id JOIN usuarios u ON u.id = m.usuario_id
      WHERE m.tipo = 'reserva' AND m.desde < ? AND (? = 'encargado' OR m.usuario_id = ?)
      ORDER BY m.desde`).all(hoy(), rol, uid),
};

export { hoy };
