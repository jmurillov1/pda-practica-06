// Configuración del motor de análisis del reporte de estrés.
// Sin lógica: solo datos que `analyze.mjs` consulta.

// Qué combinaciones `${método} ${url}` (la `url` tal como Artillery la agrupa,
// es decir, la plantilla literal del YAML, no la url resuelta) producen 4xx a
// propósito, y por qué. Cualquier 4xx que NO aparezca aquí para su endpoint se
// trata como inesperado en el cálculo de la tasa de error "real".
//
// Ojo: Artillery agrupa `plugins.metrics-by-endpoint` por URL, no por método.
// La URL "/api/v1/empleados/{{ employeeId }}" recibe tanto el GET (caso bueno
// B3, espera 200) como el PUT (caso malo M4, espera 400) del mismo escenario;
// el 400 esperado en esa URL viene del PUT, pero analyze.mjs prueba las
// claves GET/POST/PUT contra este mapa (no conoce el método real), así que
// basta con documentarlo bajo PUT, que es el método que de verdad lo produce.
export const expectedCodes = {
  'POST /api/v1/empleados': {
    400: 'Zod rechaza payload corrupto o incompleto (casos M1/M3 del catálogo de stress-test.yml).',
  },
  'GET /api/v1/empleados/no-es-un-id': {
    400: 'idParamSchema rechaza un id sin forma de ObjectId (caso M2).',
  },
  'PUT /api/v1/empleados/{{ employeeId }}': {
    400: 'updateEmployeeSchema rechaza el body vacío del caso M4 (Artillery agrupa esta URL junto con el GET B3, que espera 200).',
  },
};

// El veredicto PASA/FALLA de `analyze.mjs` NO usa un umbral separado acá: usa
// directamente el `ensure` de stress-test.yml (leído por parseArtillery.mjs
// en artillery.sla), para que el reporte nunca pueda contradecir los
// "Checks:" que ya imprime la consola de `artillery run`. Ver `buildVerdict`
// en analyze.mjs — solo cae a 200ms/1% por defecto si el YAML no se pudo leer.

// Umbral visual de cobertura de código (Parte 2 del pedido).
export const coverageThreshold = 80; // %

// Candidatos técnicos a cuellos de botella síncronos del Event Loop de
// Node.js. `analyze.mjs` los cita textualmente cuando detecta (o descarta)
// degradación de p99 durante la fase de saturación — es la misma lista que
// antes vivía fija en docs/informe-practica-04.md, ahora reutilizable.
export const eventLoopBottlenecks = [
  'morgan("dev") en app.ts escribe en stdout en cada request (solo se desactiva con NODE_ENV=test).',
  'JSON.parse/JSON.stringify del body parser y de las respuestas: operaciones síncronas que escalan con el tamaño del payload.',
  'schema.safeParse(...) de Zod en validation.middleware.ts: validación síncrona de CPU en cada request.',
  'El pool de conexiones de Mongoose tiene un tamaño finito; si el tráfico lo supera, las operaciones se encolan.',
  'helmet() añade cabeceras en cada respuesta; costo marginal pero también síncrono.',
];
