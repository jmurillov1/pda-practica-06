// Motor de reglas: recibe lo que ya devuelven `parseArtillery`/`parseJest`
// (o fixtures equivalentes en los tests) y produce una lista de hallazgos
// más un veredicto. No conoce archivos ni HTML — función pura.

/** @typedef {{severity:'info'|'warning'|'critical', title:string, detail:string, metric?:string}} Finding */

function endpointKey(method, url) {
  return `${method} ${url}`;
}

/**
 * Regla 1: tasa de error "real" (excluye los 4xx que config.expectedCodes
 * marca como intencionales) vs. la tasa "bruta" (vusers.failed / creados).
 */
function analyzeErrorRate(artillery, config) {
  const findings = [];
  const excluded = [];
  const unexpected = [];

  for (const [url, codes] of Object.entries(artillery.byEndpointCodesAggregate ?? {})) {
    for (const [code, count] of Object.entries(codes)) {
      if (!code.startsWith('4')) continue;
      // No conocemos el método por separado (Artillery agrupa por URL), así
      // que probamos ambos métodos típicos del catálogo (GET/POST/PUT) contra
      // el mapa de esperados.
      const match = ['GET', 'POST', 'PUT'].map((m) => config.expectedCodes[endpointKey(m, url)]?.[code]).find(Boolean);
      if (match) {
        excluded.push({ url, code, count, reason: match });
      } else {
        unexpected.push({ url, code, count });
      }
    }
  }

  const excludedTotal = excluded.reduce((sum, e) => sum + e.count, 0);
  const unexpectedTotal = unexpected.reduce((sum, e) => sum + e.count, 0);
  const c5xx = artillery.kpis.c5xx ?? 0;
  const errorsTotal = artillery.kpis.errorsTotal ?? 0;
  // La tasa "real" no es solo 4xx inesperados: un 5xx es siempre un fallo del
  // servidor, y un `errors.*` (p.ej. ERR_SOCKET_TIMEOUT) es una petición que
  // ni siquiera llegó a tener un código HTTP — ambos deben contar como fallo.
  const realFailures = unexpectedTotal + c5xx + errorsTotal;
  const rateReal = artillery.kpis.requests > 0 ? (realFailures / artillery.kpis.requests) * 100 : 0;

  findings.push({
    severity: 'info',
    title: 'Los 4xx esperados no cuentan como fallos reales',
    detail:
      (excluded.length > 0
        ? `${excludedTotal} respuestas 4xx vienen de payloads inválidos a propósito (validación Zod / id malformado): ` +
          excluded.map((e) => `${e.count}× ${e.code} en "${e.url}" (${e.reason})`).join('; ') + '. '
        : `No hay 4xx configurados como esperados en config.mjs. `) +
      `Tasa de error bruta: ${artillery.kpis.errorRateBruta.toFixed(2)}%. Tasa de error real (4xx inesperados` +
      `${c5xx > 0 ? ' + 5xx' : ''}${errorsTotal > 0 ? ' + errores de socket' : ''}): ${rateReal.toFixed(2)}%` +
      `${realFailures > 0 ? ` (${unexpectedTotal} 4xx inesperados, ${c5xx} 5xx, ${errorsTotal} errores de socket)` : ''}.`,
    metric: 'http.codes.4xx por endpoint',
  });

  if (unexpected.length > 0) {
    findings.push({
      severity: 'warning',
      title: '4xx inesperados detectados',
      detail: unexpected.map((e) => `${e.count}× ${e.code} en "${e.url}" (no está en config.expectedCodes)`).join('; '),
      metric: 'http.codes.4xx por endpoint',
    });
  }

  return { findings, rateReal };
}

/** Regla 2: comparación de latencia media 2xx vs 4xx. */
function analyzeTwoVsFour(artillery) {
  const mean2xx = artillery.percentiles.twoXX?.mean;
  const mean4xx = artillery.percentiles.fourXX?.mean;
  if (mean2xx == null || mean4xx == null) return [];
  if (mean2xx <= mean4xx) return [];
  return [
    {
      severity: 'info',
      title: 'Las peticiones rechazadas (4xx) responden más rápido que las exitosas (2xx)',
      detail:
        `Media 2xx: ${mean2xx}ms vs. media 4xx: ${mean4xx}ms. Es el comportamiento esperado: ` +
        `la validación de Zod rechaza la petición en el middleware, antes de llegar a la capa de datos (Mongoose), ` +
        `así que el camino de error es estructuralmente más corto.`,
      metric: 'http.response_time.2xx.mean / http.response_time.4xx.mean',
    },
  ];
}

/** Regla 3: outliers por intervalo y endpoint (max > 10 × p99 del mismo bucket). */
function analyzeOutliers(artillery) {
  const findings = [];
  for (const period of artillery.periods ?? []) {
    for (const [url, rt] of Object.entries(period.byEndpointResponseTime ?? {})) {
      if (rt.max == null || rt.p99 == null || rt.p99 <= 0) continue;
      if (rt.max > 10 * rt.p99) {
        findings.push({
          severity: 'warning',
          title: 'Outlier de latencia detectado',
          detail:
            `En el intervalo #${period.n} (period ${period.period}, fase ${period.fase}), el endpoint "${url}" tuvo ` +
            `una petición de ${rt.max}ms mientras el p99 de ese mismo intervalo era ${rt.p99}ms (más de 10×). ` +
            `Probablemente un evento puntual (GC, I/O bloqueante) y no una tendencia — revisa "Evolución por intervalo" ` +
            `para confirmar que no se repite.`,
          metric: `byEndpointResponseTime["${url}"].max / p99 (intervalo #${period.n})`,
        });
      }
    }
  }
  return findings;
}

/** Regla 4: payload creciente sin paginación. */
function analyzePayloadGrowth(artillery) {
  const periods = artillery.periods ?? [];
  if (periods.length < 3) return [];
  let increasing = 0;
  for (let i = 1; i < periods.length; i++) {
    if (periods[i].bytes > periods[i - 1].bytes) increasing++;
    else increasing = 0;
    if (increasing >= 2) break; // 3 puntos seguidos = 2 incrementos seguidos
  }
  if (increasing < 2) return [];
  const totalMB = (artillery.kpis.bytes / 1024 / 1024).toFixed(1);
  return [
    {
      severity: 'warning',
      title: 'El payload descargado crece en cada intervalo sin techo',
      detail:
        `Los bytes descargados por intervalo suben de forma sostenida (total de la corrida: ${totalMB} MB). ` +
        `El listado (GET /api/v1/empleados) no tiene paginación: cada POST nuevo agranda la respuesta del siguiente GET. ` +
        `Recomendación: agregar paginación (limit/offset o cursor) o al menos un límite máximo de resultados.`,
      metric: 'http.downloaded_bytes por intervalo',
    },
  ];
}

/** Regla 5: consistencia requests vs responses por intervalo (informativo, no error). */
function analyzeRequestResponseConsistency(artillery) {
  const mismatches = (artillery.periods ?? []).filter((p) => p.requests !== p.responses);
  if (mismatches.length === 0) return [];

  const aggDiff = artillery.kpis.requests - artillery.kpis.responses;
  const errorsTotal = artillery.kpis.errorsTotal ?? 0;
  const detailList = mismatches
    .map((p) => `intervalo #${p.n} (period ${p.period}): ${p.requests} requests vs ${p.responses} responses`)
    .join('; ');

  if (aggDiff === 0) {
    return [
      {
        severity: 'info',
        title: 'requests y responses no cuadran en algunos intervalos',
        detail:
          detailList +
          '. Se compensa entre ventanas: al final de la corrida el total agregado sí cuadra (una respuesta cruzó el corte de la ventana de ~10s en la que se contó su request).',
        metric: 'http.requests vs http.responses por intervalo',
      },
    ];
  }

  if (aggDiff === errorsTotal) {
    const errorList = Object.entries(artillery.kpis.errors ?? {}).map(([name, count]) => `${count}× ${name}`).join(', ');
    return [
      {
        severity: 'info',
        title: 'requests y responses no cuadran, pero la diferencia la explican errores de socket',
        detail:
          detailList +
          `. El total agregado difiere en ${aggDiff}, exactamente los errores de socket de la corrida (${errorList}): ` +
          `esas peticiones nunca llegaron a tener una respuesta HTTP que contar.`,
        metric: 'http.requests vs http.responses por intervalo',
      },
    ];
  }

  return [
    {
      severity: 'warning',
      title: 'requests y responses no cuadran y la diferencia no está explicada',
      detail:
        detailList +
        `. El total agregado difiere en ${aggDiff} y no coincide con los errores de socket registrados (${errorsTotal}) — esto sí ameritaría revisión.`,
      metric: 'http.requests vs http.responses por intervalo',
    },
  ];
}

/** Regla 6: duración de sesión (aclaración, no es latencia de servidor). */
function analyzeSessionLength() {
  return [
    {
      severity: 'info',
      title: 'La duración de sesión no es latencia de servidor',
      detail:
        'vusers.session_length mide cuánto tarda un VU en completar TODO su flujo, incluyendo los `think` entre ' +
        'pasos del escenario. Con 8 pasos y `think: 1` entre la mayoría, la mayor parte de esos ~7s por VU es ' +
        'tiempo de espera simulado, no tiempo de respuesta real del servidor (eso ya lo mide http.response_time).',
      metric: 'vusers.session_length',
    },
  ];
}

/** Regresión lineal simple por mínimos cuadrados. Devuelve pendiente, intercepto y R². */
function linreg(xs, ys) {
  const n = xs.length;
  const meanX = xs.reduce((s, x) => s + x, 0) / n;
  const meanY = ys.reduce((s, y) => s + y, 0) / n;
  let num = 0, den = 0;
  for (let i = 0; i < n; i++) {
    num += (xs[i] - meanX) * (ys[i] - meanY);
    den += (xs[i] - meanX) ** 2;
  }
  const slope = den === 0 ? 0 : num / den;
  const intercept = meanY - slope * meanX;
  let ssRes = 0, ssTot = 0;
  for (let i = 0; i < n; i++) {
    const pred = intercept + slope * xs[i];
    ssRes += (ys[i] - pred) ** 2;
    ssTot += (ys[i] - meanY) ** 2;
  }
  const r2 = ssTot === 0 ? (ssRes === 0 ? 1 : 0) : 1 - ssRes / ssTot;
  return { slope, intercept, r2 };
}

/** Regla 7: tendencia del p99 durante la fase de Saturación (PDF: ¿lineal o exponencial?). */
function analyzeP99Trend(artillery, config) {
  const allPeriods = artillery.periods ?? [];
  const drainedCount = allPeriods.filter((p) => p.fase === 'Drenaje').length;
  const drainNote =
    drainedCount > 0
      ? ` (se excluyeron ${drainedCount} intervalo(s) de "Drenaje": tráfico posterior al fin de las fases configuradas, no forma parte de la Saturación)`
      : '';
  const points = allPeriods.filter((p) => p.fase === 'Saturación' && p.p99 > 0).map((p) => ({ x: p.n, p99: p.p99 }));

  if (points.length < 3) {
    return [
      {
        severity: 'info',
        title: 'Fase de saturación con muy pocos intervalos para clasificar tendencia',
        detail: `Solo hay ${points.length} intervalo(s) con p99 > 0 en la fase de Saturación; hacen falta al menos 3 para distinguir una tendencia lineal de una exponencial de forma confiable.`,
        metric: 'periods[].p99 (fase Saturación)',
      },
    ];
  }

  const xs = points.map((p) => p.x);
  const p99s = points.map((p) => p.p99);
  const regLinear = linreg(xs, p99s);
  const regExp = linreg(xs, p99s.map(Math.log));

  const bottleneckList = config.eventLoopBottlenecks.map((b, i) => `${i + 1}) ${b}`).join(' ');
  const seriePoints = points.map((p) => `#${p.x}=${p.p99}ms`).join(', ') + drainNote;

  let patron;
  if (regLinear.slope <= 0 && regExp.slope <= 0) {
    patron = 'estable';
  } else if (regExp.slope > 0 && regExp.r2 > regLinear.r2 + 0.05) {
    patron = 'exponencial';
  } else if (regLinear.slope > 0 && regLinear.r2 >= 0.4) {
    patron = 'lineal';
  } else {
    patron = 'sin patrón claro';
  }

  if (patron === 'estable') {
    return [
      {
        severity: 'info',
        title: 'El p99 no muestra degradación durante la fase de saturación',
        detail:
          `Serie de p99 por intervalo: ${seriePoints}. La pendiente del ajuste lineal es ${regLinear.slope.toFixed(2)}ms/intervalo (no creciente), ` +
          `así que no hay evidencia de que el servidor se esté acercando a un límite con esta carga. Los primeros sospechosos si el ` +
          `\`arrivalRate\`/\`rampTo\` de stress-test.yml subiera serían: ${bottleneckList}`,
        metric: 'periods[].p99 (fase Saturación) — regresión lineal',
      },
    ];
  }

  if (patron === 'sin patrón claro') {
    return [
      {
        severity: 'info',
        title: 'El p99 varía en la fase de saturación sin un patrón lineal/exponencial claro',
        detail:
          `Serie de p99 por intervalo: ${seriePoints}. Ni el ajuste lineal (R²=${regLinear.r2.toFixed(2)}) ni el exponencial ` +
          `(R²=${regExp.r2.toFixed(2)}) explican bien la variación — probablemente hay ruido (outliers puntuales, GC) más que ` +
          `una tendencia sostenida. Revisa "Outlier de latencia detectado" arriba si aparece.`,
        metric: 'periods[].p99 (fase Saturación) — regresión lineal y exponencial',
      },
    ];
  }

  const r2 = patron === 'exponencial' ? regExp.r2 : regLinear.r2;
  return [
    {
      severity: 'warning',
      title: `El p99 crece de forma ${patron} durante la fase de saturación`,
      detail:
        `Serie de p99 por intervalo: ${seriePoints} (ajuste ${patron}, R²=${r2.toFixed(2)}). ` +
        `${patron === 'lineal'
          ? 'Un crecimiento lineal indica degradación proporcional al tráfico: un recurso finito se satura al mismo ritmo que sube la carga.'
          : 'Un crecimiento exponencial indica que algún recurso alcanzó su límite duro y las peticiones se están encolando sin drenarse al mismo ritmo en que llegan.'
        } Cuellos de botella síncronos candidatos en el Event Loop: ${bottleneckList}`,
      metric: 'periods[].p99 (fase Saturación) — regresión ' + (patron === 'exponencial' ? 'exponencial' : 'lineal'),
    },
  ];
}

/** Regla 8b: errores de socket/conexión (no generan código HTTP, hoy no aparecían en ningún hallazgo). */
function analyzeSocketErrors(artillery) {
  const errorsTotal = artillery.kpis.errorsTotal ?? 0;
  if (errorsTotal === 0) return [];
  const errorList = Object.entries(artillery.kpis.errors ?? {}).map(([name, count]) => `${count}× ${name}`).join(', ');
  const affectedPeriods = (artillery.periods ?? []).filter((p) => (p.errorsTotal ?? 0) > 0);
  const periodList = affectedPeriods.map((p) => `#${p.n} (${p.errorsTotal})`).join(', ');
  return [
    {
      severity: 'warning',
      title: 'Errores de socket durante la prueba',
      detail:
        `${errorsTotal} petición(es) no llegaron a completarse a nivel de socket: ${errorList}. ` +
        `Ocurrieron en el/los intervalo(s): ${periodList || 'no identificado(s) por intervalo'}. ` +
        `Estos VUs cuentan como \`vusers.failed\` y explican los desajustes entre \`http.requests\`/\`http.responses\` ` +
        `y entre los contadores de códigos y \`vusers.completed\` que se ven en otros hallazgos.`,
      metric: 'http.errors.* (ERR_SOCKET_TIMEOUT, etc.)',
    },
  ];
}

/** Regla 8: verificación explícita 201 vs 400 (el contador de rechazos debe coincidir con el tráfico corrupto inyectado). */
function analyzeCodesMatch(artillery) {
  const { created, completed, failed, c201, c200, c400 } = artillery.kpis;
  if (completed === 0) return [];

  // Señal fuerte de un payload corrupto que sí coló una respuesta 2xx: el
  // endpoint del id malformado (M2) solo puede responder 400 (idParamSchema
  // lo rechaza antes de tocar Mongo); cualquier otro código ahí es un bug.
  const idInvalidCodes = artillery.byEndpointCodesAggregate?.['/api/v1/empleados/no-es-un-id'] ?? {};
  const idInvalidLeaked = Object.keys(idInvalidCodes).some((code) => code !== '400');
  const expected201 = completed;
  const expected200 = completed * 3;
  const expected400 = completed * 4;
  const matches = c201 === expected201 && c200 === expected200 && c400 === expected400;

  if (matches) {
    return [
      {
        severity: 'info',
        title: 'El contador de rechazos de Zod coincide exactamente con el tráfico corrupto inyectado',
        detail:
          `${c400} respuestas 400 = ${completed} VUs completados × 4 casos corruptos por VU (M1–M4). ` +
          `Y ${c201} × 201 + ${c200} × 200 = ${completed} × 1 + ${completed} × 3, exactamente lo que produce cada VU en sus 4 pasos "buenos".`,
        metric: 'http.codes.201 / http.codes.200 / http.codes.400',
      },
    ];
  }

  // Un VU que sufre un error de socket (p.ej. ERR_SOCKET_TIMEOUT) a mitad de
  // su flujo puede haber completado algunos pasos "buenos" antes de fallar:
  // eso empuja c201/c200/c400 por encima de lo que produciría `completed`
  // pero nunca más allá de lo que producirían los `created`. Si la diferencia
  // cabe en ese rango, la explica el propio contador de fallidos, no un
  // payload corrupto que coló una respuesta 2xx.
  const explainedByFailed =
    created - completed === failed &&
    c201 >= expected201 && c201 <= created &&
    c200 >= expected200 && c200 <= created * 3 &&
    c400 >= expected400 && c400 <= created * 4;

  if (explainedByFailed && failed > 0 && !idInvalidLeaked) {
    return [
      {
        severity: 'info',
        title: 'El contador no coincide con "completed", pero la diferencia la explican los VUs fallidos',
        detail:
          `Esperado por VU completado (${completed}): ${expected201}×201, ${expected200}×200, ${expected400}×400. ` +
          `Obtenido: ${c201}×201, ${c200}×200, ${c400}×400. La diferencia (hasta ${created}, el total de VUs creados) ` +
          `la explican los ${failed} VUs marcados como fallidos: alcanzaron a completar algunos de sus pasos "buenos" ` +
          `antes de que un error de socket cortara su flujo (ver "Errores de socket durante la prueba" si aparece), ` +
          `no un payload corrupto que haya colado una respuesta 2xx.`,
        metric: 'http.codes.201 / http.codes.200 / http.codes.400',
      },
    ];
  }

  return [
    {
      severity: 'warning',
      title: 'El contador de rechazos NO coincide con el tráfico corrupto inyectado',
      detail:
        `Esperado por cada VU completado (${completed}): ${expected201}×201, ${expected200}×200, ${expected400}×400. ` +
        `Obtenido: ${c201}×201, ${c200}×200, ${c400}×400. La diferencia sugiere VUs que no completaron todos sus pasos, ` +
        `o payloads corruptos que colaron una respuesta 2xx.`,
      metric: 'http.codes.201 / http.codes.200 / http.codes.400',
    },
  ];
}

/**
 * Veredicto final: usa el MISMO `ensure` que stress-test.yml (artillery.sla),
 * no un umbral aparte — así el veredicto del reporte nunca puede contradecir
 * los "Checks:" que ya imprime la consola de `artillery run`. Si no se pudo
 * leer el YAML (artillery.sla vacío), cae a los valores por defecto del PDF
 * (p99 < 200ms, maxErrorRate < 1%).
 */
function buildVerdict(artillery, rateReal) {
  const reasons = [];
  const p99 = artillery.percentiles.all?.p99;
  const errorRateBruta = artillery.kpis.errorRateBruta;
  const slaP99 = artillery.sla?.p99 ?? 200;
  const slaMaxErrorRate = artillery.sla?.maxErrorRate ?? 1;

  if (p99 != null && p99 >= slaP99) reasons.push(`p99 (${p99}ms) ≥ umbral del ensure (${slaP99}ms)`);
  if (errorRateBruta >= slaMaxErrorRate) reasons.push(`maxErrorRate (${errorRateBruta.toFixed(2)}%) ≥ umbral del ensure (${slaMaxErrorRate}%)`);

  return { status: reasons.length === 0 ? 'PASA' : 'FALLA', reasons, p99, slaP99, errorRateBruta, slaMaxErrorRate, rateReal };
}

/**
 * @param {{artillery: object, jest: object|null, config: {expectedCodes: object}}} input
 */
export function analyze({ artillery, jest, config }) {
  const { findings: errorFindings, rateReal } = analyzeErrorRate(artillery, config);
  const findings = [
    ...analyzeCodesMatch(artillery),
    ...analyzeSocketErrors(artillery),
    ...errorFindings,
    ...analyzeTwoVsFour(artillery),
    ...analyzeP99Trend(artillery, config),
    ...analyzeOutliers(artillery),
    ...analyzePayloadGrowth(artillery),
    ...analyzeRequestResponseConsistency(artillery),
    ...analyzeSessionLength(),
  ];

  const verdict = buildVerdict(artillery, rateReal);

  return { findings, verdict, rateReal, jestAvailable: jest != null };
}
