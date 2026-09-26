// Convierte el JSON crudo de `artillery run --output` (+ el texto de
// stress-test.yml, para las fases/SLA) en un objeto estructurado y ya
// calculado. Función pura: no lee ni escribe archivos.

const ENDPOINT_RT_PREFIX = 'plugins.metrics-by-endpoint.response_time.';
const ENDPOINT_CODE_RE = /^plugins\.metrics-by-endpoint\.(.+)\.codes\.(\d+)$/;

/** Extrae, de un objeto `counters` de Artillery, los códigos por endpoint. */
function byEndpointCodes(counters) {
  const out = {};
  for (const [key, value] of Object.entries(counters ?? {})) {
    const m = ENDPOINT_CODE_RE.exec(key);
    if (!m) continue;
    const [, url, code] = m;
    out[url] ??= {};
    out[url][code] = value;
  }
  return out;
}

/** Extrae, de un objeto `summaries` de Artillery, la latencia por endpoint. */
function byEndpointResponseTime(summaries) {
  const out = {};
  for (const [key, value] of Object.entries(summaries ?? {})) {
    if (!key.startsWith(ENDPOINT_RT_PREFIX)) continue;
    const url = key.slice(ENDPOINT_RT_PREFIX.length);
    out[url] = value;
  }
  return out;
}

/**
 * Extrae, de un objeto `counters` de Artillery, los contadores `errors.*`
 * (p.ej. `errors.ERR_SOCKET_TIMEOUT`): fallos de socket/conexión que no
 * generan una respuesta HTTP (por eso no aparecen en `http.codes.*`) pero sí
 * explican los VUs fallidos y el desfase requests vs. responses.
 */
function pickErrors(counters) {
  const errors = {};
  let total = 0;
  for (const [key, value] of Object.entries(counters ?? {})) {
    if (!key.startsWith('errors.')) continue;
    const name = key.slice('errors.'.length);
    errors[name] = value;
    total += value;
  }
  return { errors, errorsTotal: total };
}

/** Suma los `http.codes.5xx` agregados. */
function sum5xx(counters) {
  let total = 0;
  for (const [key, value] of Object.entries(counters ?? {})) {
    const m = /^http\.codes\.(5\d\d)$/.exec(key);
    if (m) total += value;
  }
  return total;
}

/** Lee `target`, fases y umbrales del `ensure` desde el texto de stress-test.yml (regex, sin dependencia de un parser YAML). */
function parseYaml(ymlText) {
  if (!ymlText) return { target: null, phases: [], sla: { p99: null, maxErrorRate: null } };
  const target = ymlText.match(/target:\s*"?([^"\n]+)"?/)?.[1]?.trim() ?? null;
  const phaseBlocks = ymlText.split(/^\s*-\s+duration:/m).slice(1);
  const phases = phaseBlocks.map((block) => {
    const duration = Number(block.match(/^\s*(\d+)/)?.[1] ?? 0);
    const arrivalRate = Number(block.match(/arrivalRate:\s*(\d+)/)?.[1] ?? 0);
    const rampTo = block.match(/rampTo:\s*(\d+)/)?.[1];
    const name = block.match(/name:\s*"([^"]+)"/)?.[1] ?? '';
    return { duration, arrivalRate, rampTo: rampTo ? Number(rampTo) : null, name };
  });
  const sla = {
    p99: Number(ymlText.match(/http\.response_time\.p99["']?:\s*(\d+)/)?.[1]) || null,
    maxErrorRate: Number(ymlText.match(/maxErrorRate:\s*(\d+)/)?.[1]) || null,
  };
  return { target, phases, sla };
}

/**
 * @param {object} rawJson - el JSON completo devuelto por `artillery run --output`.
 * @param {string|null} ymlText - contenido de stress-test.yml (opcional).
 */
export function parseArtillery(rawJson, ymlText = null) {
  const agg = rawJson.aggregate;
  const periodsRaw = rawJson.intermediate ?? [];
  const { target, phases, sla } = parseYaml(ymlText);
  const warmupDuration = phases[0]?.duration ?? 20;
  // Fin de la carga configurada (todas las fases de stress-test.yml): pasado
  // este punto, el tráfico que sigue llegando es "drenaje" (conexiones que
  // Artillery ya no está generando activamente), no parte de la Saturación.
  const loadEndDuration = phases.length > 0 ? phases.reduce((sum, p) => sum + p.duration, 0) : 50;

  const c = agg.counters ?? {};
  const rt = agg.summaries?.['http.response_time'] ?? {};
  const rt2xx = agg.summaries?.['http.response_time.2xx'] ?? {};
  const rt4xx = agg.summaries?.['http.response_time.4xx'] ?? {};
  const { errors, errorsTotal } = pickErrors(c);

  const kpis = {
    created: c['vusers.created'] ?? 0,
    completed: c['vusers.completed'] ?? 0,
    failed: c['vusers.failed'] ?? 0,
    c201: c['http.codes.201'] ?? 0,
    c200: c['http.codes.200'] ?? 0,
    c400: c['http.codes.400'] ?? 0,
    c5xx: sum5xx(c),
    requests: c['http.requests'] ?? 0,
    responses: c['http.responses'] ?? 0,
    bytes: c['http.downloaded_bytes'] ?? 0,
    avgRate: agg.rates?.['http.request_rate'] ?? 0,
    errors,
    errorsTotal,
  };
  kpis.errorRateBruta = kpis.created > 0 ? (kpis.failed / kpis.created) * 100 : 0;

  const meta = {
    runId: rawJson.testId ?? null,
    target,
    totalDurationSec:
      agg.lastMetricAt && agg.firstMetricAt
        ? Math.round((agg.lastMetricAt - agg.firstMetricAt) / 1000)
        : null,
  };

  const start = agg.firstMetricAt ?? periodsRaw[0]?.period ?? 0;
  const periods = periodsRaw.map((p, i) => {
    const pc = p.counters ?? {};
    const prt = p.summaries?.['http.response_time'] ?? {};
    const elapsedSec = Math.round((Number(p.period) - Number(start)) / 1000);
    const requests = pc['http.requests'] ?? 0;
    // No basta con "elapsedSec pasó el fin de las fases": Artillery sigue
    // reportando intervalos mientras drena el backlog acumulado por el
    // rampTo, y ese backlog es precisamente la degradación que queremos medir
    // (más peticiones respondidas que recibidas en la ventana, p99 alto). Un
    // intervalo solo es "Drenaje" (ruido de cola, no carga real) cuando,
    // además de estar después del fin de las fases, su volumen de peticiones
    // se desploma frente al intervalo anterior (menos de la mitad): ahí sí ya
    // no queda tráfico activo que drenar, solo conexiones residuales.
    const prevRequests = i > 0 ? (periodsRaw[i - 1].counters?.['http.requests'] ?? 0) : Infinity;
    const isDrainNoise = elapsedSec > loadEndDuration && requests < prevRequests * 0.5;
    const fase = elapsedSec <= warmupDuration ? 'Calentamiento' : isDrainNoise ? 'Drenaje' : 'Saturación';
    const { errors: periodErrors, errorsTotal: periodErrorsTotal } = pickErrors(pc);
    return {
      n: i + 1,
      period: p.period,
      elapsedSec,
      fase,
      requests,
      responses: pc['http.responses'] ?? 0,
      c201: pc['http.codes.201'] ?? 0,
      c200: pc['http.codes.200'] ?? 0,
      c400: pc['http.codes.400'] ?? 0,
      c5xx: sum5xx(pc),
      failed: pc['vusers.failed'] ?? 0,
      rate: p.rates?.['http.request_rate'] ?? p['http.request_rate'] ?? 0,
      p99: prt.p99 ?? 0,
      mean: prt.mean ?? 0,
      bytes: pc['http.downloaded_bytes'] ?? 0,
      errors: periodErrors,
      errorsTotal: periodErrorsTotal,
      byEndpointCodes: byEndpointCodes(pc),
      byEndpointResponseTime: byEndpointResponseTime(p.summaries),
    };
  });

  return {
    meta,
    kpis,
    percentiles: { all: rt, twoXX: rt2xx, fourXX: rt4xx },
    phases,
    sla,
    periods,
    byEndpointCodesAggregate: byEndpointCodes(c),
    byEndpointResponseTimeAggregate: byEndpointResponseTime(agg.summaries),
  };
}
