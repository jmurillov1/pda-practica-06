// Arma el HTML final a partir de lo que devuelven `parseArtillery`,
// `parseJest` y `analyze`. Función pura: recibe datos, devuelve un string.

import { coverageThreshold } from './config.mjs';

// Catálogo estático de los pasos del escenario de Artillery. Se mantiene a
// mano (no se parsea el YAML) porque el flujo es pequeño y fijo; si cambias
// stress-test.yml, actualiza esta lista para que siga documentando lo mismo
// que realmente corre.
const ARTILLERY_CASES = [
  { id: 'B1', tipo: 'bueno', metodo: 'POST', url: '/api/v1/empleados', esperado: 201, desc: 'Alta de empleado con los 4 campos válidos (nombre, cargo, departamento, sueldo positivo). Captura el id para reusarlo en los siguientes pasos.' },
  { id: 'B2', tipo: 'bueno', metodo: 'GET', url: '/api/v1/empleados', esperado: 200, desc: 'Lista completa de empleados: confirma que el que se acaba de crear es visible.' },
  { id: 'B3', tipo: 'bueno', metodo: 'GET', url: '/api/v1/empleados/{id}', esperado: 200, desc: 'Consulta por el id capturado en B1: lectura individual de un recurso que sí existe.' },
  { id: 'B4', tipo: 'bueno', metodo: 'PUT', url: '/api/v1/empleados/{id}', esperado: 200, desc: 'Actualización parcial válida (solo cambia el sueldo) sobre el mismo id.' },
  { id: 'M1', tipo: 'malo', metodo: 'POST', url: '/api/v1/empleados', esperado: 400, desc: 'Sueldo negativo y nombre de 2 caracteres: Zod debe rechazarlo antes de tocar Mongo.' },
  { id: 'M2', tipo: 'malo', metodo: 'GET', url: '/api/v1/empleados/no-es-un-id', esperado: 400, desc: 'Id que no tiene forma de ObjectId (24 hex): lo rechaza idParamSchema.' },
  { id: 'M3', tipo: 'malo', metodo: 'POST', url: '/api/v1/empleados', esperado: 400, desc: 'Falta el campo obligatorio "departamento": createEmployeeSchema exige los 4 campos.' },
  { id: 'M4', tipo: 'malo', metodo: 'PUT', url: '/api/v1/empleados/{id}', esperado: 400, desc: 'Body vacío ({}) en un update: updateEmployeeSchema exige al menos un campo para actualizar.' },
];

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const STYLE = `
  :root { --bg:#fff; --fg:#1a1a1a; --muted:#6b7280; --card:#f7f7f8; --border:#e5e7eb; --ok:#16a34a; --okbg:#f0fdf4; --warn:#dc2626; --warnbg:#fef2f2; --crit:#b91c1c; --info:#2563eb; --accent:#2563eb; }
  @media (prefers-color-scheme: dark) {
    :root { --bg:#15161a; --fg:#eaeaea; --muted:#9ca3af; --card:#1e2025; --border:#2c2e33; --okbg:#0f2417; --warnbg:#2b1414; --accent:#60a5fa; --info:#60a5fa; }
  }
  * { box-sizing: border-box; }
  body { margin:0; padding:24px 16px 56px; background:var(--bg); color:var(--fg); font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif; line-height:1.5; }
  main { max-width: 860px; margin: 0 auto; }
  h1 { font-size: 1.35rem; margin-bottom: 4px; }
  .subtitle { color: var(--muted); font-size: 0.88rem; margin-bottom: 8px; }
  .meta { color: var(--muted); font-size: 0.78rem; margin-bottom: 20px; }
  .badge-extra { display:inline-block; font-size:0.7rem; text-transform:uppercase; letter-spacing:0.04em; color:var(--muted); border:1px solid var(--border); border-radius:6px; padding:2px 8px; margin-bottom:12px; }
  section { margin-bottom: 28px; }
  h2 { font-size: 1.02rem; margin-bottom: 10px; }
  h3 { font-size: 0.88rem; color: var(--muted); margin: 16px 0 8px; }
  p.lead { color: var(--muted); font-size: 0.88rem; }
  .kpis { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 12px; }
  .kpi { background: var(--card); border: 1px solid var(--border); border-radius: 10px; padding: 14px 16px; }
  .kpi .label { font-size: 0.72rem; color: var(--muted); text-transform: uppercase; }
  .kpi .value { font-size: 1.4rem; font-weight: 600; margin-top: 3px; }
  .kpi .value.ok { color: var(--ok); }
  .kpi .value.warn { color: var(--warn); }
  .kpi .explain { font-size: 0.76rem; color: var(--muted); margin-top: 6px; }
  .checks { display: flex; flex-direction: column; gap: 8px; }
  .check { border-radius: 10px; padding: 12px 14px; font-size: 0.86rem; border: 1px solid var(--border); }
  .check.pass { color: var(--ok); border-color: var(--ok); background: var(--okbg); }
  .check.fail { color: var(--warn); border-color: var(--warn); background: var(--warnbg); }
  .check b { display:block; margin-bottom:2px; }
  .check .desc { font-weight: 400; color: inherit; opacity: 0.85; font-size: 0.8rem; }
  .card { background: var(--card); border: 1px solid var(--border); border-radius: 12px; padding: 16px; }
  svg { width: 100%; height: auto; display: block; }
  .legend { font-size: 0.78rem; color: var(--muted); margin-top: 6px; }
  table { width: 100%; border-collapse: collapse; font-size: 0.83rem; background: var(--card); border: 1px solid var(--border); border-radius: 10px; overflow: hidden; }
  th, td { text-align: right; padding: 7px 10px; border-bottom: 1px solid var(--border); }
  th:first-child, td:first-child, th:nth-child(2), td:nth-child(2) { text-align: left; }
  th { color: var(--muted); font-weight: 500; }
  tr:last-child td { border-bottom: none; }
  .desc-cell { color: var(--muted); font-size: 0.78rem; text-align: left !important; }
  .fase-cal { color: var(--accent); }
  .fase-sat { color: var(--warn); }
  .fase-dren { color: var(--muted); opacity: 0.75; }
  .tipo-bueno { color: var(--ok); font-weight: 600; }
  .tipo-malo { color: var(--warn); font-weight: 600; }
  .estado-passed { color: var(--ok); }
  .estado-failed { color: var(--warn); font-weight: 600; }
  .summary-line { display: flex; gap: 16px; flex-wrap: wrap; font-size: 0.85rem; color: var(--muted); margin-bottom: 12px; }
  .summary-line b { color: var(--fg); }
  .verdict { border-radius: 14px; padding: 20px; font-size: 1rem; margin-bottom: 24px; }
  .verdict.pass { background: var(--okbg); border: 1px solid var(--ok); color: var(--ok); }
  .verdict.fail { background: var(--warnbg); border: 1px solid var(--warn); color: var(--warn); }
  .verdict h2 { color: inherit; margin: 0 0 6px; }
  .verdict ul { margin: 8px 0 0; padding-left: 18px; font-size: 0.85rem; }
  .finding { border-left: 4px solid var(--border); padding: 10px 14px; border-radius: 6px; background: var(--card); margin-bottom: 10px; }
  .finding.info { border-left-color: var(--info); }
  .finding.warning { border-left-color: var(--warn); }
  .finding.critical { border-left-color: var(--crit); background: var(--warnbg); }
  .finding .sev { font-size: 0.68rem; text-transform: uppercase; letter-spacing: 0.03em; color: var(--muted); }
  .finding h4 { margin: 2px 0 4px; font-size: 0.92rem; }
  .finding p { margin: 0; font-size: 0.85rem; color: var(--muted); }
  .finding .metric { font-size: 0.72rem; color: var(--muted); margin-top: 6px; font-style: italic; }
  .cov-bar-track { background: var(--border); border-radius: 6px; height: 8px; overflow: hidden; margin-top: 6px; }
  .cov-bar-fill { height: 100%; background: var(--ok); }
  .cov-bar-fill.low { background: var(--warn); }
  .matrix-cell-ok { color: var(--ok); }
  .matrix-cell-gap { color: var(--warn); font-weight: 600; }
  details.raw { background: var(--card); border: 1px solid var(--border); border-radius: 10px; padding: 12px 16px; }
  details.raw summary { cursor: pointer; font-size: 0.88rem; }
  details.raw pre { max-height: 400px; overflow: auto; font-size: 0.72rem; }
  dl.glossary { display: grid; grid-template-columns: max-content 1fr; gap: 6px 16px; font-size: 0.85rem; }
  dl.glossary dt { font-weight: 600; }
  dl.glossary dd { margin: 0; color: var(--muted); }
  footer { color: var(--muted); font-size: 0.75rem; margin-top: 24px; }
  code { background: var(--card); border: 1px solid var(--border); border-radius: 4px; padding: 1px 5px; font-size: 0.85em; }
`;

function renderVerdict(verdict) {
  const ok = verdict.status === 'PASA';
  return `
  <div class="verdict ${ok ? 'pass' : 'fail'}">
    <h2>${ok ? '✅ VEREDICTO: PASA' : '❌ VEREDICTO: FALLA'}</h2>
    <p>
      p99: <b>${verdict.p99 ?? '—'}ms</b> (umbral del <code>ensure</code>: ${verdict.slaP99}ms) ·
      maxErrorRate: <b>${verdict.errorRateBruta.toFixed(2)}%</b> (umbral: ${verdict.slaMaxErrorRate}%)
    </p>
    ${verdict.reasons.length > 0 ? `<ul>${verdict.reasons.map((r) => `<li>${esc(r)}</li>`).join('')}</ul>` : '<p>Mismos umbrales que el bloque <code>ensure</code> de stress-test.yml — este veredicto siempre coincide con los "Checks:" que imprime la consola de <code>artillery run</code>.</p>'}
    <p style="font-size:0.8rem; opacity:0.85; margin-bottom:0;">Tasa de error <b>real</b> (4xx inesperados + 5xx + errores de socket, excluyendo los 4xx intencionales del catálogo): ${verdict.rateReal.toFixed(2)}% — ver el detalle en "Hallazgos y recomendaciones".</p>
  </div>`;
}

function renderExecutiveSummary(a) {
  return `
  <section>
    <h2>Resumen ejecutivo</h2>
    <p class="lead">Los datos crudos de esta corrida, sin interpretar todavía — la interpretación va en "Hallazgos y recomendaciones".</p>
    <div class="kpis">
      <div class="kpi"><div class="label">VUs creados / completados</div><div class="value">${a.kpis.created} / ${a.kpis.completed}</div></div>
      <div class="kpi"><div class="label">Requests</div><div class="value">${a.kpis.requests}</div></div>
      <div class="kpi"><div class="label">Duración</div><div class="value">${a.meta.totalDurationSec ?? '—'}s</div></div>
      <div class="kpi"><div class="label">Pico de tasa</div><div class="value">${Math.max(0, ...a.periods.map((p) => p.rate))}/s</div></div>
      <div class="kpi"><div class="label">p50 / p95 / p99</div><div class="value">${a.percentiles.all.p50 ?? '—'} / ${a.percentiles.all.p95 ?? '—'} / ${a.percentiles.all.p99 ?? '—'} ms</div></div>
    </div>
  </section>`;
}

function renderJestSection(jest) {
  if (!jest) {
    return `
  <section>
    <h2>1. Análisis de Aislamiento (Evidencia Jest)</h2>
    <p class="lead">No disponible: no se encontró <code>jest-results.json</code>. Genera este reporte con <code>pnpm stress:report</code> (corre <code>test:unit:report</code> automáticamente).</p>
  </section>`;
  }

  const matrixRows = Object.entries(jest.matrix)
    .map(([op, { bueno, malo }]) => {
      const cell = (n) => (n > 0 ? `<span class="matrix-cell-ok">${n}</span>` : `<span class="matrix-cell-gap">0 (hueco)</span>`);
      return `<tr><td>${op}</td><td>${cell(bueno)}</td><td>${cell(malo)}</td></tr>`;
    })
    .join('');

  const coverageRows = jest.coverage
    ? Object.entries(jest.coverage)
        .map(([k, pct]) => {
          const low = pct < coverageThreshold;
          return `
        <div>
          <div class="summary-line" style="margin-bottom:2px;"><span>${k}</span><span>${pct}%</span></div>
          <div class="cov-bar-track"><div class="cov-bar-fill${low ? ' low' : ''}" style="width:${pct}%"></div></div>
        </div>`;
        })
        .join('')
    : '<p class="lead">No disponible: no se encontró coverage-summary.json. Corre con --coverage --coverageReporters=json-summary.</p>';

  return `
  <section>
    <h2>1. Análisis de Aislamiento (Evidencia Jest) — Mantenibilidad y Capacidad de prueba</h2>
    <p class="lead">
      Cada fila prueba el controlador (<code>employee.controller.ts</code>) con el repositorio mockeado
      (<code>jest.fn()</code>), sin Mongo ni Docker de por medio. Los casos <span class="tipo-bueno">buenos</span>
      verifican la respuesta HTTP cuando el repositorio responde con éxito; los <span class="tipo-malo">malos</span>
      verifican que el controlador deja pasar el error (404 de negocio o excepción de infraestructura) para que lo
      maneje <code>errorMiddleware</code>, en vez de tragárselo o responder con datos falsos.
    </p>
    <div class="summary-line">
      <span>Total: <b>${jest.totals.total}</b></span>
      <span>Pasaron: <b class="estado-passed">${jest.totals.passed}</b></span>
      <span>Fallaron: <b class="${jest.totals.failed > 0 ? 'estado-failed' : 'estado-passed'}">${jest.totals.failed}</b></span>
      <span>Resultado global: <b class="${jest.totals.success ? 'estado-passed' : 'estado-failed'}">${jest.totals.success ? 'PASS' : 'FAIL'}</b></span>
    </div>
    <div class="check ${jest.totals.success ? 'pass' : 'fail'}" style="margin-bottom:16px;">
      <b>${jest.totals.success ? '✔ pnpm test finaliza en verde' : '✘ pnpm test NO finalizó en verde'}</b>
      <span class="desc">Equivalente al <code>npm run test</code> que pide la guía — ${jest.totals.passed}/${jest.totals.total} casos pasaron.</span>
    </div>

    <div class="card" style="border-left: 4px solid var(--info);">
      <h3 style="margin-top:0;">Pregunta de control</h3>
      <p style="font-style: italic; margin-bottom: 10px;">¿Por qué el uso del patrón de Inversión de Dependencias permite realizar la prueba unitaria del controlador sin necesidad de inicializar un contenedor Docker o instancia de MongoDB local?</p>
      <p style="margin: 0; font-size: 0.88rem;">
        El controlador (<code>employee.controller.ts</code>) no depende de Mongoose ni de una implementación concreta:
        su fábrica <code>createEmployeeController(repo: EmployeeRepository)</code> recibe la <b>abstracción</b>
        <code>EmployeeRepository</code>, no la clase <code>MongooseEmployeeRepository</code>. Quién decide la
        implementación concreta es <code>container.ts</code>, en el borde de la aplicación (composition root), no el
        controlador. Gracias a esa inversión de dependencias (DIP), el test unitario construye un objeto plano que
        implementa el mismo contrato (con <code>jest.fn()</code>) y se lo pasa al controlador — que no distingue ese
        doble de prueba de un repositorio real, porque solo conoce la interfaz. Por eso no hace falta levantar Mongo,
        Docker ni ninguna infraestructura: el test corre en memoria, en milisegundos, y verifica solo la lógica del
        controlador (armar la respuesta HTTP correcta), no el acceso a datos.
      </p>
    </div>

    <table>
      <thead><tr><th>Grupo</th><th>Caso</th><th>Tipo</th><th>Estado</th><th>Duración</th></tr></thead>
      <tbody>
        ${jest.cases
          .map(
            (t) =>
              `<tr><td>${esc(t.grupo)}</td><td>${esc(t.titulo)}</td><td class="tipo-${t.tipo}">${t.tipo === 'bueno' ? 'Bueno' : 'Malo'}</td><td class="estado-${t.estado}">${t.estado === 'passed' ? '✔ Pasó' : '✘ Falló'}</td><td>${t.duracionMs}ms</td></tr>`,
          )
          .join('')}
      </tbody>
    </table>

    <h3>Matriz de cobertura funcional (operación × tipo de caso)</h3>
    <table>
      <thead><tr><th>Operación</th><th>Bueno</th><th>Malo</th></tr></thead>
      <tbody>${matrixRows}</tbody>
    </table>

    <h3>Cobertura de código (umbral visual: ${coverageThreshold}%)</h3>
    <div class="card">${coverageRows}</div>
  </section>`;
}

function renderArtillerySection(a) {
  const phasesTable = a.phases.length
    ? `<table>
        <thead><tr><th>Fase</th><th>Duración</th><th>Tasa de llegada</th></tr></thead>
        <tbody>
          ${a.phases.map((p) => `<tr><td>${esc(p.name || '—')}</td><td>${p.duration}s</td><td>${p.arrivalRate}${p.rampTo ? ` → ${p.rampTo}` : ''} VU/s</td></tr>`).join('')}
        </tbody>
      </table>`
    : '<p class="lead">No se encontró stress-test.yml para leer la configuración de fases.</p>';

  const percentileRow = (label, value, desc) => `<tr><td>${label}</td><td>${value ?? '—'} ms</td><td class="desc-cell">${desc}</td></tr>`;
  const rt = a.percentiles.all;

  // --- Gráficas SVG inline (sin dependencias externas) ---
  const chartW = 720, chartH = 200, padL = 44, padB = 26, padT = 10;
  const innerW = chartW - padL - 16, innerH = chartH - padT - padB;
  const rows = a.periods;
  const xFor = (i) => padL + (rows.length <= 1 ? 0 : (i / (rows.length - 1)) * innerW);

  const maxP99Axis = Math.max(200, ...rows.map((r) => r.p99));
  const yForP99 = (v) => padT + innerH - (v / maxP99Axis) * innerH;
  const p99Points = rows.map((r, i) => `${xFor(i)},${yForP99(r.p99)}`).join(' ');
  const slaY = yForP99(a.sla.p99 ?? 200);

  const maxRateAxis = Math.max(1, ...rows.map((r) => r.rate));
  const yForRate = (v) => padT + innerH - (v / maxRateAxis) * innerH;
  const ratePoints = rows.map((r, i) => `${xFor(i)},${yForRate(r.rate)}`).join(' ');

  const maxReqAxis = Math.max(1, ...rows.map((r) => r.requests));
  const barW = rows.length > 0 ? innerW / rows.length / 2.4 : 0;
  const stackedBars = rows
    .map((r, i) => {
      const x = xFor(i);
      const h2xx = ((r.c200 + r.c201) / maxReqAxis) * innerH;
      const h4xx = (r.c400 / maxReqAxis) * innerH;
      const y2xx = padT + innerH - h2xx;
      const y4xx = padT + innerH - h4xx;
      return `
        <rect x="${x - barW - 1}" y="${y2xx}" width="${barW}" height="${h2xx}" fill="var(--ok)" opacity="0.85"><title>Intervalo ${r.n}: ${r.c200 + r.c201} × 2xx</title></rect>
        <rect x="${x + 1}" y="${y4xx}" width="${barW}" height="${h4xx}" fill="var(--warn)" opacity="0.85"><title>Intervalo ${r.n}: ${r.c400} × 4xx</title></rect>`;
    })
    .join('');

  const catalogTable = `
    <table>
      <thead><tr><th>#</th><th>Tipo</th><th>Método</th><th>Endpoint</th><th>Código esperado</th><th>Qué valida</th></tr></thead>
      <tbody>
        ${ARTILLERY_CASES.map((cs) => `<tr><td>${cs.id}</td><td class="tipo-${cs.tipo}">${cs.tipo === 'bueno' ? 'Bueno' : 'Malo'}</td><td>${cs.metodo}</td><td>${cs.url}</td><td>${cs.esperado}</td><td class="desc-cell">${cs.desc}</td></tr>`).join('')}
      </tbody>
    </table>`;

  return `
  <section>
    <h2>2. Análisis del Percentil 99 (p99) y Rendimiento Colectivo (Evidencia Artillery)</h2>
    <p class="lead">
      Cada usuario virtual (VU) ejecuta 8 pasos seguidos contra <code>/api/v1/empleados</code>: 4 casos
      <span class="tipo-bueno">buenos</span> (deben aceptarse) y 4 casos <span class="tipo-malo">malos</span>
      (deben rechazarse con <code>400</code>), en ese orden.
    </p>
    <h3>Catálogo de casos por VU</h3>
    ${catalogTable}
    <p class="lead" style="font-size:0.78rem;">
      Artillery agrupa sus contadores por endpoint, no por caso individual: por cada VU completado se esperan
      1×<code>201</code> (B1), 3×<code>200</code> (B2+B3+B4) y 4×<code>400</code> (M1–M4).
    </p>

    <h3>Fases de carga configuradas</h3>
    <p class="lead" style="margin-top:-4px;">
      Primero un tráfico bajo y constante (<span class="fase-cal">Calentamiento</span>) y luego una rampa creciente
      (<span class="fase-sat">Saturación</span>) para forzar el límite. Los intervalos posteriores al fin de las fases
      configuradas (<span class="fase-dren">Drenaje</span>) son conexiones residuales, no carga generada activamente,
      y se excluyen del análisis de tendencia del p99.
    </p>
    ${phasesTable}

    <h3>Números clave</h3>
    <div class="kpis">
      <div class="kpi"><div class="label">201 / 200 / 400</div><div class="value">${a.kpis.c201} / ${a.kpis.c200} / ${a.kpis.c400}</div></div>
      <div class="kpi"><div class="label">Requests / Responses</div><div class="value">${a.kpis.requests} / ${a.kpis.responses}</div></div>
      <div class="kpi"><div class="label">Tasa promedio</div><div class="value">${a.kpis.avgRate}/s</div><div class="explain">${(a.kpis.bytes / 1024 / 1024).toFixed(1)} MB descargados en total.</div></div>
    </div>

    <h3>Distribución completa de latencia</h3>
    <table>
      <thead><tr><th>Percentil</th><th>Latencia</th><th>Significado</th></tr></thead>
      <tbody>
        ${percentileRow('min', rt.min, 'La petición más rápida registrada.')}
        ${percentileRow('p50 (mediana)', rt.p50 ?? rt.median, 'La mitad de las peticiones respondió más rápido que esto.')}
        ${percentileRow('p75', rt.p75, '3 de cada 4 peticiones respondieron más rápido que esto.')}
        ${percentileRow('p90', rt.p90, '9 de cada 10 peticiones respondieron más rápido que esto.')}
        ${percentileRow('p95', rt.p95, 'Solo el 5% de las peticiones fue más lento que esto.')}
        ${percentileRow('p99', rt.p99, 'Solo el 1% de las peticiones fue más lento.')}
        ${percentileRow('p99.9', rt.p999, 'La cola más extrema: 1 de cada 1000 peticiones.')}
        ${percentileRow('max', rt.max, 'La petición más lenta de toda la prueba.')}
      </tbody>
    </table>

    <h3>Latencia p99 y tasa de llegada en el tiempo</h3>
    <div class="card">
      <svg viewBox="0 0 ${chartW} ${chartH}" role="img" aria-label="p99 por intervalo">
        <line x1="${padL}" y1="${slaY}" x2="${chartW - 16}" y2="${slaY}" stroke="var(--warn)" stroke-dasharray="4 4" stroke-width="1" />
        <text x="${chartW - 16}" y="${slaY - 4}" text-anchor="end" font-size="10" fill="var(--warn)">SLA ${a.sla.p99 ?? 200}ms</text>
        <line x1="${padL}" y1="${padT}" x2="${padL}" y2="${padT + innerH}" stroke="var(--border)" />
        <line x1="${padL}" y1="${padT + innerH}" x2="${chartW - 16}" y2="${padT + innerH}" stroke="var(--border)" />
        <polyline points="${p99Points}" fill="none" stroke="var(--accent)" stroke-width="2" />
        ${rows.map((r, i) => `<circle cx="${xFor(i)}" cy="${yForP99(r.p99)}" r="3" fill="var(--accent)"><title>Intervalo ${r.n}: p99=${r.p99}ms</title></circle>`).join('')}
      </svg>
      <div class="legend">Línea azul: p99 por intervalo. Línea roja punteada: umbral del SLA (${a.sla.p99 ?? 200}ms).</div>
    </div>
    <div class="card" style="margin-top:12px;">
      <svg viewBox="0 0 ${chartW} ${chartH}" role="img" aria-label="tasa de llegada por intervalo">
        <line x1="${padL}" y1="${padT}" x2="${padL}" y2="${padT + innerH}" stroke="var(--border)" />
        <line x1="${padL}" y1="${padT + innerH}" x2="${chartW - 16}" y2="${padT + innerH}" stroke="var(--border)" />
        <polyline points="${ratePoints}" fill="none" stroke="var(--ok)" stroke-width="2" />
        ${rows.map((r, i) => `<circle cx="${xFor(i)}" cy="${yForRate(r.rate)}" r="3" fill="var(--ok)"><title>Intervalo ${r.n}: ${r.rate} req/s</title></circle>`).join('')}
      </svg>
      <div class="legend">Tasa de llegada (req/s) por intervalo — el pico marca el punto más exigente de la fase de saturación.</div>
    </div>
    <div class="card" style="margin-top:12px;">
      <svg viewBox="0 0 ${chartW} ${chartH}" role="img" aria-label="2xx vs 4xx por intervalo">
        <line x1="${padL}" y1="${padT}" x2="${padL}" y2="${padT + innerH}" stroke="var(--border)" />
        <line x1="${padL}" y1="${padT + innerH}" x2="${chartW - 16}" y2="${padT + innerH}" stroke="var(--border)" />
        ${stackedBars}
      </svg>
      <div class="legend"><span style="color:var(--ok)">■</span> 2xx &nbsp; <span style="color:var(--warn)">■</span> 4xx, por intervalo.</div>
    </div>

    <h3>Evolución por intervalo</h3>
    <table>
      <thead><tr><th>#</th><th>Fase</th><th>Requests</th><th>Tasa</th><th>201</th><th>400</th><th>Fallidos</th><th>media (ms)</th><th>p99 (ms)</th></tr></thead>
      <tbody>
        ${rows.map((r) => `<tr><td>${r.n}</td><td class="${r.fase === 'Calentamiento' ? 'fase-cal' : r.fase === 'Drenaje' ? 'fase-dren' : 'fase-sat'}">${r.fase}</td><td>${r.requests}</td><td>${r.rate}/s</td><td>${r.c201}</td><td>${r.c400}</td><td>${r.failed}</td><td>${r.mean}</td><td>${r.p99}</td></tr>`).join('')}
      </tbody>
    </table>
  </section>`;
}

function renderFindings(findings) {
  const order = { critical: 0, warning: 1, info: 2 };
  const sorted = [...findings].sort((a, b) => order[a.severity] - order[b.severity]);
  const label = { info: 'Info', warning: 'Advertencia', critical: 'Crítico' };
  return `
  <section>
    <h2>Hallazgos y recomendaciones</h2>
    ${sorted
      .map(
        (f) => `
      <div class="finding ${f.severity}">
        <div class="sev">${label[f.severity]}</div>
        <h4>${esc(f.title)}</h4>
        <p>${esc(f.detail)}</p>
        ${f.metric ? `<div class="metric">Métrica: ${esc(f.metric)}</div>` : ''}
      </div>`,
      )
      .join('')}
  </section>`;
}

function renderGlossary() {
  return `
  <section>
    <h2>Glosario</h2>
    <dl class="glossary">
      <dt>VU</dt><dd>Usuario virtual: una sesión simulada que ejecuta el escenario completo de principio a fin.</dd>
      <dt>p50 / p95 / p99</dt><dd>Percentiles de latencia: "p99 = 26ms" significa que el 99% de las peticiones respondió en 26ms o menos.</dd>
      <dt>request rate</dt><dd>Peticiones HTTP por segundo que Artillery disparó en ese momento.</dd>
      <dt>2xx / 4xx</dt><dd>Familias de código HTTP: 2xx = éxito, 4xx = error del cliente (aquí, casi todos intencionales por diseño del escenario).</dd>
    </dl>
  </section>`;
}

function renderRawData(rawArtillery, rawJest) {
  const pretty = (obj) => esc(JSON.stringify(obj ?? null, null, 2));
  return `
  <section>
    <h2>Datos crudos</h2>
    <details class="raw"><summary>JSON agregado de Artillery</summary><pre>${pretty(rawArtillery?.aggregate)}</pre></details>
    <details class="raw" style="margin-top:8px;"><summary>JSON de Jest (totales)</summary><pre>${pretty(
      rawJest ? { numTotalTests: rawJest.numTotalTests, numPassedTests: rawJest.numPassedTests, numFailedTests: rawJest.numFailedTests, success: rawJest.success } : null,
    )}</pre></details>
  </section>`;
}

/**
 * @param {object} input
 * @param {ReturnType<import('./parseArtillery.mjs').parseArtillery>} input.artillery
 * @param {ReturnType<import('./parseJest.mjs').parseJest>} input.jest
 * @param {ReturnType<import('./analyze.mjs').analyze>} input.analysis
 * @param {object} input.rawArtillery - JSON crudo (para la sección de datos colapsables)
 * @param {object|null} input.rawJest - JSON crudo de Jest (para la sección de datos colapsables)
 */
export function render({ artillery, jest, analysis, rawArtillery, rawJest }) {
  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Reporte de pruebas (extra)</title>
<style>${STYLE}</style>
</head>
<body>
<main>
  <span class="badge-extra">Extra — no reemplaza al informe</span>
  <h1>Reporte de pruebas — unitarias (Jest) + estrés (Artillery)</h1>
  <p class="subtitle">Explica y diagnostica los mismos datos que las consolas de <code>jest</code> y <code>artillery run</code>, en vez de solo listarlos.</p>
  <p class="meta">${artillery.meta.target ? `Target: <code>${artillery.meta.target}</code> · ` : ''}${artillery.meta.totalDurationSec ? `Duración: ${artillery.meta.totalDurationSec}s · ` : ''}${artillery.meta.runId ? `Run id: <code>${artillery.meta.runId}</code>` : ''}</p>

  ${renderVerdict(analysis.verdict)}
  ${renderExecutiveSummary(artillery)}
  ${renderJestSection(jest)}
  ${renderArtillerySection(artillery)}
  ${renderFindings(analysis.findings)}
  ${renderGlossary()}
  ${renderRawData(rawArtillery, rawJest)}

  <footer>Generado localmente con <code>scripts/generate-stress-report.mjs</code> (módulos en <code>scripts/report/</code>). No usa Artillery Cloud ni ningún servicio externo.</footer>
</main>
</body>
</html>
`;
}
