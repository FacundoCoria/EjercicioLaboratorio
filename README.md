# Inventario del laboratorio

Node + Express + SQLite (node:sqlite, requiere Node 24+). Un solo servicio: API + frontend estático.

## Correr en local
    npm install
    npm start          # http://localhost:3000

## Correr con Docker
    docker compose up --build

Los datos viven en el volumen `labdata` (`/data/lab.db`).

## Variables de entorno
- PORT (3000)
- DB_PATH (./lab.db)
- JWT_SECRET (cambiar en producción)

## Usuarios de prueba (semilla)
ana / ana123, luis / luis123 (usuario); encargado / admin123 (encargado).
Cambiarlos o borrarlos antes de desplegar.

## Cluster
SQLite exige 1 réplica con estrategia Recreate y un PVC en /data. Para varias réplicas, migrar db.js a Postgres.
