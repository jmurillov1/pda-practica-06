// Historial de corridas de stress:report. Funciones puras (sin fs): reciben
// el resultado de `analyze()` + metadatos de la corrida y devuelven la
// entrada de manifiesto a persistir, o el HTML del índice a partir de todas
// las entradas guardadas. El orquestador (generate-stress-report.mjs) es
// quien lee/escribe manifest.json y los archivos en docs/historial/.

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/**
 * @param {{ timestamp: string, folder: string, artillery: object, analysis: object }} input
 * @returns entrada lista para agregar a manifest.json
 */
export function buildHistoryEntry({ timestamp, folder, artillery, analysis }) {
  const { verdict, rateReal } = analysis;
  return {
    timestamp,
    folder,
    verdict: verdict.status,
    reasons: verdict.reasons,
    p99: verdict.p99 ?? null,
    slaP99: verdict.slaP99,
    errorRateBruta: verdict.errorRateBruta,
    rateReal,
    requests: artillery.kpis.requests,
    completed: artillery.kpis.completed,
    target: artillery.meta.target ?? null,
  };
}

/** @param {object[]} entries - manifest.json completo (todas las corridas guardadas). */
export function renderHistoryIndex(entries) {
  const rows = [...entries]
    .sort((a, b) => (a.timestamp < b.timestamp ? 1 : -1))
    .map((e) => {
      const ok = e.verdict === 'PASA';
      return `<tr>
        <td>${esc(e.timestamp)}</td>
        <td class="${ok ? 'ok' : 'warn'}">${ok ? '✅ PASA' : '❌ FALLA'}</td>
        <td>${e.p99 ?? '—'}ms <span class="muted">(sla ${e.slaP99}ms)</span></td>
        <td>${e.errorRateBruta.toFixed(2)}%</td>
        <td>${e.rateReal.toFixed(2)}%</td>
        <td>${e.completed}/${e.requests}</td>
        <td><a href="./${esc(e.folder)}/reporte.html">ver reporte</a></td>
      </tr>`;
    })
    .join('');

  return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Historial de corridas de stress-test</title>
<style>
  :root { --bg:#fff; --fg:#1a1a1a; --muted:#6b7280; --card:#f7f7f8; --border:#e5e7eb; --ok:#16a34a; --warn:#dc2626; --accent:#2563eb; }
  @media (prefers-color-scheme: dark) {
    :root { --bg:#15161a; --fg:#eaeaea; --muted:#9ca3af; --card:#1e2025; --border:#2c2e33; --accent:#60a5fa; }
  }
  * { box-sizing: border-box; }
  body { margin:0; padding:24px 16px 56px; background:var(--bg); color:var(--fg); font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif; line-height:1.5; }
  main { max-width: 960px; margin: 0 auto; }
  h1 { font-size: 1.3rem; margin-bottom: 6px; }
  p.lead { color: var(--muted); font-size: 0.88rem; margin-bottom: 20px; }
  table { width: 100%; border-collapse: collapse; font-size: 0.83rem; background: var(--card); border: 1px solid var(--border); border-radius: 10px; overflow: hidden; }
  th, td { text-align: left; padding: 8px 10px; border-bottom: 1px solid var(--border); }
  th { color: var(--muted); font-weight: 500; }
  tr:last-child td { border-bottom: none; }
  .ok { color: var(--ok); font-weight: 600; }
  .warn { color: var(--warn); font-weight: 600; }
  .muted { color: var(--muted); }
  a { color: var(--accent); }
</style>
</head>
<body>
<main>
  <h1>Historial de corridas de stress-test</h1>
  <p class="lead">Cada fila es una corrida de <code>pnpm stress:report</code>, guardada automáticamente por fecha y hora. El reporte y el JSON crudo de cada corrida quedan en su propia carpeta.</p>
  <table>
    <thead><tr><th>Fecha</th><th>Veredicto</th><th>p99</th><th>Error bruto</th><th>Error real</th><th>Completados/Requests</th><th></th></tr></thead>
    <tbody>${rows || '<tr><td colspan="7">Todavía no hay corridas guardadas.</td></tr>'}</tbody>
  </table>
</main>
</body>
</html>`;
}
