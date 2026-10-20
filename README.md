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

## Despliegue en Kubernetes
Los manifiestos están en `k8s/`. El secreto real no se versiona: `k8s/secret.yaml` está en `.gitignore`
(hay una plantilla en `k8s/secret.yaml.example`). Se crea así:

    kubectl create secret generic lab-inventario -n <namespace> \
      --from-literal=JWT_SECRET=$(openssl rand -hex 32)
    kubectl apply -n <namespace> -f k8s/

## Credenciales de acceso al cluster
El archivo `team4.kubeconfig` es una credencial: guardarlo FUERA del repo (por ejemplo `~/.kube/`)
y usarlo con `export KUBECONFIG=~/.kube/team4.kubeconfig`. Está ignorado por git y por Docker
(`*.kubeconfig`), pero no lo copies a esta carpeta de todos modos.
