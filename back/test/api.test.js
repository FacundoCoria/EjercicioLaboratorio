import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const dir = mkdtempSync(join(tmpdir(), 'lab-'));
process.env.DB_PATH = join(dir, 'test.db');
process.env.JWT_SECRET = 'test-secret';

const { default: app } = await import('../server.js');

let server, base;
const manana = new Date(Date.now() + 86400000).toISOString().slice(0, 10);

before(() => new Promise((ok) => { server = app.listen(0, () => { base = `http://localhost:${server.address().port}`; ok(); }); }));
after(() => { server.close(); rmSync(dir, { recursive: true, force: true }); });

async function login(nombre, password) {
  const r = await fetch(`${base}/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ nombre, password }),
  });
  return r.headers.get('set-cookie')?.split(';')[0] ?? null;
}

async function call(cookie, method, path, body) {
  const r = await fetch(base + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: r.status, data: await r.json().catch(() => ({})) };
}

test('sin sesión no se accede y un login inválido da 401', async () => {
  assert.equal((await fetch(`${base}/health`)).status, 200);
  assert.equal(await login('ana', 'mala'), null);
  assert.equal((await call(null, 'GET', '/equipos')).status, 401);
});

test('tomar y devolver: un equipo en uso no se toma ni se reserva, y solo lo devuelve quien lo tomó o el encargado', async () => {
  const ana = await login('ana', 'ana123');
  const luis = await login('luis', 'luis123');
  const enc = await login('encargado', 'admin123');

  assert.equal((await call(ana, 'POST', '/equipos/1/tomar')).status, 200);
  assert.equal((await call(luis, 'POST', '/equipos/1/tomar')).status, 409);
  assert.equal((await call(luis, 'POST', '/equipos/1/reservar', { fecha: manana })).status, 409);
  assert.equal((await call(luis, 'POST', '/equipos/1/devolver')).status, 403);
  assert.equal((await call(enc, 'POST', '/equipos/1/devolver')).status, 200);
});

test('reservas y permisos: no hay dos reservas en la misma fecha y solo el encargado da de alta equipos', async () => {
  const ana = await login('ana', 'ana123');
  const luis = await login('luis', 'luis123');
  const enc = await login('encargado', 'admin123');

  assert.equal((await call(ana, 'POST', '/equipos/4/reservar', { fecha: manana })).status, 201);
  assert.equal((await call(luis, 'POST', '/equipos/4/reservar', { fecha: manana })).status, 409);

  const nuevo = { nombre: 'Soldador', tipo: 'Herramienta', ubicacion: 'Mesa 3' };
  assert.equal((await call(ana, 'POST', '/equipos', nuevo)).status, 403);
  assert.equal((await call(enc, 'POST', '/equipos', nuevo)).status, 201);
});
