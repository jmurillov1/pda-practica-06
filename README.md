# Práctica 06 — Pruebas y estrés de la API de empleados

Proyecto full-stack de gestión de empleados (CRUD) usado como base para practicar
pruebas unitarias, pruebas de integración y pruebas de carga (estrés).

## Estructura

```
backend/    API REST (Express + Mongoose + Zod)
frontend/   Cliente (Angular)
docs/       Documentación de la práctica e historial de reportes de estrés
docker-compose.yaml  MongoDB + Mongo Express + backend en contenedores
```

## Requisitos

- Node.js >= 22
- pnpm
- Docker y Docker Compose (para levantar MongoDB)

## Puesta en marcha

1. Levantar MongoDB (y Mongo Express) con Docker:

   ```bash
   docker compose up -d mongodb mongo-express
   ```

2. Backend:

   ```bash
   cd backend
   cp .env.example .env   # ajustar valores si es necesario
   pnpm install
   pnpm dev
   ```

3. Frontend:

   ```bash
   cd frontend
   pnpm install
   pnpm start
   ```

## Pruebas

Desde `backend/`:

| Comando                  | Descripción                                                      |
| ------------------------ | ----------------------------------------------------------------- |
| `pnpm test:unit`         | Pruebas unitarias (Jest) de controladores.                        |
| `pnpm test:integration`  | Pruebas de integración (Vitest + Supertest) contra la API.        |
| `pnpm test`               | Ejecuta unitarias e integración en secuencia.                     |
| `pnpm stress`             | Prueba de carga con Artillery (`stress-test.yml`).                |
| `pnpm stress:reset-db`    | Limpia la colección `empleados` de la base de datos de estrés.    |
| `pnpm stress:report`      | Corrida completa: resetea la BD, corre unitarias con cobertura, corre Artillery y genera un reporte HTML en `docs/historial/`. |

Cada corrida de `pnpm stress:report` queda registrada en `docs/historial/<fecha-hora>/`
(reporte HTML + insumos crudos) y el índice `docs/historial/index.html` lista todo
el historial de corridas con su veredicto (pasa/falla según el SLA definido en
`stress-test.yml`).
