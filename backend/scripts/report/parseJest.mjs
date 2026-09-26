// Convierte el JSON de `jest --json --outputFile` (y, si existe, el
// `coverage-summary.json` de Istanbul/v8) en un objeto estructurado. Función
// pura: no lee ni escribe archivos; recibe los objetos ya parseados (o
// `null` si no están disponibles).

// Operaciones del controlador que reconoce la matriz de cobertura funcional.
const OPERATIONS = ['list', 'getById', 'create', 'update', 'remove'];

// Los 3 casos originales de la práctica no llevan el prefijo "operación:" en
// el título; se identifican por palabras clave.
function inferOperation(title) {
  const prefixMatch = /^(\w+):/.exec(title);
  if (prefixMatch && OPERATIONS.includes(prefixMatch[1])) return prefixMatch[1];
  if (/lista de empleados/i.test(title)) return 'list';
  if (/crear un empleado/i.test(title)) return 'create';
  if (/empleado no existe/i.test(title)) return 'getById';
  return 'otro';
}

function inferTipo(title) {
  return /404|error|falla|rejects|propaga/i.test(title) ? 'malo' : 'bueno';
}

/**
 * @param {object|null} rawJestJson - salida de `jest --json`.
 * @param {object|null} rawCoverageSummary - `coverage-summary.json` (opcional).
 */
export function parseJest(rawJestJson, rawCoverageSummary = null) {
  if (!rawJestJson) return null;

  const flat = (rawJestJson.testResults ?? []).flatMap((suite) => suite.assertionResults ?? []);
  const cases = flat.map((t) => ({
    grupo: t.ancestorTitles?.[1] ?? 'Casos base de la práctica',
    titulo: t.title,
    estado: t.status,
    duracionMs: t.duration ?? 0,
    tipo: inferTipo(t.title),
    operacion: inferOperation(t.title),
  }));

  const matrix = Object.fromEntries(OPERATIONS.map((op) => [op, { bueno: 0, malo: 0 }]));
  for (const c of cases) {
    if (!matrix[c.operacion]) continue;
    matrix[c.operacion][c.tipo] += 1;
  }

  const totals = {
    total: rawJestJson.numTotalTests ?? cases.length,
    passed: rawJestJson.numPassedTests ?? cases.filter((c) => c.estado === 'passed').length,
    failed: rawJestJson.numFailedTests ?? cases.filter((c) => c.estado === 'failed').length,
    success: rawJestJson.success ?? cases.every((c) => c.estado === 'passed'),
  };

  const coverage = rawCoverageSummary?.total
    ? {
        lines: rawCoverageSummary.total.lines.pct,
        statements: rawCoverageSummary.total.statements.pct,
        functions: rawCoverageSummary.total.functions.pct,
        branches: rawCoverageSummary.total.branches.pct,
      }
    : null;

  return { totals, cases, matrix, coverage };
}
