# Inventario del laboratorio

Aplicación para saber qué equipos hay en el laboratorio, dónde están, si alguien los está usando y reservarlos.

## Funcionalidades
- **Roles:** `usuario` (busca, toma, devuelve y reserva) y `encargado` (además da de alta equipos y cambia su estado).
- **Equipos** con nombre, tipo, ubicación y estado: `disponible`, `en uso`, `reservado`, `en reparación`.
- **Buscador** por nombre, tipo o ubicación.
- **Tomar y devolver** un equipo, **reservarlo para una fecha** e **historial** de quién lo usó.
- **Mapa del laboratorio** (equipos agrupados por ubicación, coloreados por estado) y **aviso de reservas vencidas**.

### Reglas
- Un equipo en uso o en reparación no se puede reservar.
- Solo quien tomó un equipo puede devolverlo, además del encargado.
- No puede haber dos reservas del mismo equipo para la misma fecha.
- Un equipo con reserva para hoy se muestra como `reservado`; solo quien lo reservó puede tomarlo.
- Dar de alta equipos y cambiar su estado es exclusivo del encargado.

## Arquitectura
Un único servicio: **Node + Express** (API REST + frontend estático) y **SQLite** (`node:sqlite`, requiere Node 24+).
Autenticación con **JWT en cookie** (sin estado en el servidor).

    .
    ├── server.js            # rutas, autenticación y reglas de negocio
    ├── db.js                # todo el acceso a datos (tablas, semilla, consultas)
    ├── public/              # frontend (index.html + app.js)
    ├── Dockerfile
    ├── docker-compose.yml
    ├── k8s/                 # manifiestos de Kubernetes
    └── scripts/abrir-app.sh # abre la app del cluster con port-forward

Tablas: `usuarios`, `equipos` y `movimientos` (los usos y las reservas, que forman el historial).

### API
| Método | Ruta | Quién |
|---|---|---|
| POST | `/login`, `/logout` | todos |
| GET | `/me`, `/avisos` | autenticado |
| GET | `/equipos?q=texto` | autenticado |
| POST | `/equipos` | encargado |
| PATCH | `/equipos/:id/estado` | encargado |
| POST | `/equipos/:id/tomar`, `/devolver`, `/reservar` | autenticado |
| GET | `/equipos/:id/historial` | autenticado |
| GET | `/health` | público |

## Correr en local
    npm install
    npm start          # http://localhost:3000

## Correr con Docker
    docker compose up --build

Los datos viven en el volumen `labdata` (`/data/lab.db`) y se conservan al recrear el contenedor.
`docker compose down -v` borra el volumen y los datos.

### Variables de entorno
| Variable | Por defecto | Uso |
|---|---|---|
| `PORT` | `3000` | puerto del servidor |
| `DB_PATH` | `./lab.db` | ruta del archivo SQLite |
| `JWT_SECRET` | secreto de desarrollo | cambiar siempre en producción |

### Usuarios de prueba (semilla)
`ana` / `ana123` y `luis` / `luis123` (usuario); `encargado` / `admin123` (encargado).
Cambiarlos o borrarlos antes de exponer la app fuera de una demo.

## Kubernetes
Manifiestos en `k8s/`:

| Archivo | Qué hace |
|---|---|
| `deployment.yaml` | la app (1 réplica, estrategia `Recreate`, probes en `/health`) |
| `pvc.yaml` | volumen persistente de 1 Gi montado en `/data` |
| `service.yaml` | Service `ClusterIP` en el puerto 80 |
| `ingress.yaml` | entrada por dominio (`mi-app.reto-ucu.net`) |
| `secret.yaml.example` | plantilla del secreto (el real no se versiona) |

La imagen está en Docker Hub: `rperdomo4/lab-inventario:1.0`, construida para `linux/amd64` (la arquitectura de los nodos).
Para reconstruirla y subirla:

    docker buildx build --platform linux/amd64 -t rperdomo4/lab-inventario:1.0 --push .

### Desplegar
    export KUBECONFIG=ruta/al/team1.kubeconfig
    kubectl create secret generic lab-inventario -n alumno-team1 \
      --from-literal=JWT_SECRET=$(openssl rand -hex 32)
    kubectl apply -n alumno-team1 -f k8s/pvc.yaml -f k8s/deployment.yaml -f k8s/service.yaml
    kubectl rollout status deploy/lab-inventario -n alumno-team1

### Persistencia
La base SQLite vive en un PVC (`local-path`). Sobrevive a reiniciar o borrar el pod y a actualizar la imagen.
Se pierde si se borra el PVC o el namespace, o si cae el nodo donde está el volumen (el almacenamiento es local al nodo).
Como SQLite no admite varias réplicas escribiendo el mismo archivo, el deployment usa `replicas: 1` y `Recreate`.
Para varias réplicas habría que migrar `db.js` a Postgres.

### Abrir la app del cluster
Requisitos: `kubectl` y tu `team1.kubeconfig`.

    ./scripts/abrir-app.sh                         # busca ./team1.kubeconfig o ~/.kube/team1.kubeconfig
    ./scripts/abrir-app.sh ruta/al/team1.kubeconfig

Luego abrir http://localhost:8080 y dejar la terminal abierta mientras se usa.
Variables opcionales: `PORT` (8080) y `NAMESPACE` (el del kubeconfig).

> **Pendiente:** el Ingress (`mi-app.reto-ucu.net`) está creado pero todavía no enruta a la app.
> Falta confirmar el `ingressClassName` del cluster y si ese host corresponde al equipo.
> Cuando funcione, la app se podrá abrir desde el navegador sin kubeconfig ni `port-forward`.

## Seguridad
- El kubeconfig es una **credencial**: no se sube al repo (`*.kubeconfig` está en `.gitignore` y `.dockerignore`) y no se comparte por canales públicos. Guardarlo fuera del proyecto, por ejemplo en `~/.kube/`.
- El `JWT_SECRET` real se crea con `kubectl create secret` y nunca se versiona (`k8s/secret.yaml` está ignorado).
