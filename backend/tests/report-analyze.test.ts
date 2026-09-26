import { describe, expect, it } from 'vitest';
// @ts-expect-error - módulo .mjs sin tipos; se prueba tal cual se usa en producción.
import { analyze } from '../scripts/report/analyze.mjs';

// Config mínima y local (no se importa scripts/report/config.mjs) para que
// estos tests no dependan de cómo evolucione la configuración real del reporte.
const baseConfig = {
  expectedCodes: {},
  eventLoopBottlenecks: ['Candidato de prueba A', 'Candidato de prueba B'],
};

const makePeriod = (overrides: Record<string, unknown> = {}) => ({
  n: 1,
  period: 0,
  elapsedSec: 0,
  fase: 'Calentamiento',
  requests: 0,
  responses: 0,
  c201: 0,
  c200: 0,
  c400: 0,
  failed: 0,
  rate: 0,
  p99: 0,
  mean: 0,
  bytes: 0,
  c5xx: 0,
  errors: {},
  errorsTotal: 0,
  byEndpointCodes: {},
  byEndpointResponseTime: {},
  ...overrides,
});

const makeArtillery = (overrides: Record<string, unknown> = {}) => ({
  meta: { runId: null, target: 'http://localhost:3000', totalDurationSec: 10 },
  kpis: {
    created: 10,
    completed: 10,
    failed: 0,
    c201: 10,
    c200: 0,
    c400: 0,
    c5xx: 0,
    requests: 10,
    responses: 10,
    bytes: 0,
    avgRate: 1,
    errorRateBruta: 0,
    errors: {},
    errorsTotal: 0,
  },
  percentiles: {
    all: { min: 0, p50: 1, p75: 1, p90: 1, p95: 1, p99: 1, p999: 1, max: 1, mean: 1 },
    twoXX: { mean: 1 },
    fourXX: { mean: 1 },
  },
  phases: [],
  sla: { p99: 200, maxErrorRate: 1 },
  periods: [makePeriod()],
  byEndpointCodesAggregate: {},
  byEndpointResponseTimeAggregate: {},
  ...overrides,
});

describe('analyze (motor de reglas del reporte de estrés)', () => {
  it('detecta un outlier cuando max > 10 × p99 en el mismo intervalo/endpoint', () => {
    const artillery = makeArtillery({
      periods: [
        makePeriod({ n: 1, p99: 20 }),
        makePeriod({
          n: 2,
          period: 999,
          fase: 'Saturación',
          byEndpointResponseTime: {
            '/api/v1/empleados': { min: 0, max: 500, p99: 20, mean: 5, count: 10 },
          },
        }),
      ],
    });

    const { findings } = analyze({ artillery, jest: null, config: baseConfig });

    const outlier = findings.find((f: { title: string }) => f.title === 'Outlier de latencia detectado');
    expect(outlier).toBeDefined();
    expect(outlier?.detail).toContain('#2');
    expect(outlier?.detail).toContain('/api/v1/empleados');
    expect(outlier?.detail).toContain('500ms');
  });

  it('separa 4xx esperados (configurados) de 4xx inesperados en la tasa de error real', () => {
    const artillery = makeArtillery({
      kpis: {
        created: 100,
        completed: 100,
        failed: 0,
        c201: 0,
        c200: 0,
        c400: 20,
        requests: 200,
        responses: 200,
        bytes: 0,
        avgRate: 10,
        errorRateBruta: 0,
      },
      byEndpointCodesAggregate: {
        '/api/v1/conocido': { '400': 15 },
        '/api/v1/no-configurado': { '400': 5 },
      },
    });
    const config = {
      expectedCodes: { 'POST /api/v1/conocido': { 400: 'Rechazo intencional documentado.' } },
    };

    const { findings, rateReal } = analyze({ artillery, jest: null, config });

    // Solo el endpoint no configurado cuenta como error real: 5 / 200 = 2.5%
    expect(rateReal).toBeCloseTo(2.5, 5);

    const unexpected = findings.find((f: { title: string }) => f.title === '4xx inesperados detectados');
    expect(unexpected).toBeDefined();
    expect(unexpected?.detail).toContain('/api/v1/no-configurado');
    expect(unexpected?.detail).not.toContain('/api/v1/conocido');

    const info = findings.find((f: { title: string }) => f.title === 'Los 4xx esperados no cuentan como fallos reales');
    expect(info?.detail).toContain('/api/v1/conocido');
  });

  it('detecta payload creciente sin techo en al menos 3 intervalos seguidos', () => {
    const artillery = makeArtillery({
      periods: [
        makePeriod({ n: 1, bytes: 1000 }),
        makePeriod({ n: 2, bytes: 2000 }),
        makePeriod({ n: 3, bytes: 4000 }),
        makePeriod({ n: 4, bytes: 500 }),
      ],
    });

    const { findings } = analyze({ artillery, jest: null, config: baseConfig });

    const growth = findings.find((f: { title: string }) => f.title === 'El payload descargado crece en cada intervalo sin techo');
    expect(growth).toBeDefined();
    expect(growth?.detail).toContain('paginación');
  });

  it('no lanza excepción y calcula el veredicto igual cuando no hay datos de Jest', () => {
    const artillery = makeArtillery();

    const result = analyze({ artillery, jest: null, config: baseConfig });

    expect(result.jestAvailable).toBe(false);
    expect(result.verdict.status).toBe('PASA');
    expect(result.verdict.reasons).toEqual([]);
    expect(Array.isArray(result.findings)).toBe(true);
  });

  it('clasifica el p99 como creciendo linealmente en la fase de saturación', () => {
    const artillery = makeArtillery({
      periods: [
        makePeriod({ n: 1, fase: 'Saturación', p99: 50 }),
        makePeriod({ n: 2, fase: 'Saturación', p99: 100 }),
        makePeriod({ n: 3, fase: 'Saturación', p99: 150 }),
        makePeriod({ n: 4, fase: 'Saturación', p99: 200 }),
      ],
    });

    const { findings } = analyze({ artillery, jest: null, config: baseConfig });

    const trend = findings.find((f: { title: string }) => f.title.includes('crece de forma'));
    expect(trend).toBeDefined();
    expect(trend?.title).toContain('lineal');
    expect(trend?.detail).toContain('Candidato de prueba A');
  });

  it('clasifica el p99 como creciendo exponencialmente en la fase de saturación', () => {
    const artillery = makeArtillery({
      periods: [
        makePeriod({ n: 1, fase: 'Saturación', p99: 10 }),
        makePeriod({ n: 2, fase: 'Saturación', p99: 20 }),
        makePeriod({ n: 3, fase: 'Saturación', p99: 45 }),
        makePeriod({ n: 4, fase: 'Saturación', p99: 95 }),
      ],
    });

    const { findings } = analyze({ artillery, jest: null, config: baseConfig });

    const trend = findings.find((f: { title: string }) => f.title.includes('crece de forma'));
    expect(trend).toBeDefined();
    expect(trend?.title).toContain('exponencial');
  });

  it('no marca degradación cuando el p99 no crece (tendencia plana o decreciente) en la fase de saturación', () => {
    const artillery = makeArtillery({
      periods: [
        makePeriod({ n: 1, fase: 'Saturación', p99: 20 }),
        makePeriod({ n: 2, fase: 'Saturación', p99: 15 }),
        makePeriod({ n: 3, fase: 'Saturación', p99: 18 }),
        makePeriod({ n: 4, fase: 'Saturación', p99: 12 }),
      ],
    });

    const { findings } = analyze({ artillery, jest: null, config: baseConfig });

    const noDegradation = findings.find((f: { title: string }) => f.title === 'El p99 no muestra degradación durante la fase de saturación');
    expect(noDegradation).toBeDefined();
    const growthWarning = findings.find((f: { title: string }) => f.title.includes('crece de forma'));
    expect(growthWarning).toBeUndefined();
  });

  it('detecta cuando el contador de rechazos NO coincide con el tráfico corrupto inyectado', () => {
    const artillery = makeArtillery({
      kpis: {
        created: 10,
        completed: 10,
        failed: 0,
        c201: 10,
        c200: 30,
        c400: 35, // debería ser 40 (10 × 4)
        requests: 80,
        responses: 80,
        bytes: 0,
        avgRate: 1,
        errorRateBruta: 0,
      },
    });

    const { findings } = analyze({ artillery, jest: null, config: baseConfig });

    const mismatch = findings.find((f: { title: string }) => f.title === 'El contador de rechazos NO coincide con el tráfico corrupto inyectado');
    expect(mismatch).toBeDefined();
    expect(mismatch?.detail).toContain('40×400');
    expect(mismatch?.detail).toContain('35×400');
  });

  it('explica por VUs fallidos el desajuste entre creados y completados (no lo marca como corrupción)', () => {
    // Caso real: 1075 creados, 1073 completados, 2 fallidos por ERR_SOCKET_TIMEOUT.
    const artillery = makeArtillery({
      kpis: {
        created: 1075,
        completed: 1073,
        failed: 2,
        c201: 1075,
        c200: 3219,
        c400: 4292,
        c5xx: 0,
        requests: 8588,
        responses: 8586,
        bytes: 0,
        avgRate: 10,
        errorRateBruta: (2 / 1075) * 100,
        errors: { ERR_SOCKET_TIMEOUT: 2 },
        errorsTotal: 2,
      },
    });

    const { findings } = analyze({ artillery, jest: null, config: baseConfig });

    const explained = findings.find((f: { title: string }) =>
      f.title === 'El contador no coincide con "completed", pero la diferencia la explican los VUs fallidos',
    );
    expect(explained).toBeDefined();
    expect(explained?.severity).toBe('info');
    expect(explained?.detail).toContain('error de socket');

    const mismatchWarning = findings.find((f: { title: string }) => f.title === 'El contador de rechazos NO coincide con el tráfico corrupto inyectado');
    expect(mismatchWarning).toBeUndefined();
  });

  it('marca warning si el endpoint de id inválido devuelve algo distinto de 400 (payload corrupto colado)', () => {
    const artillery = makeArtillery({
      kpis: {
        created: 1075,
        completed: 1073,
        failed: 2,
        c201: 1075,
        c200: 3219,
        c400: 4292,
        c5xx: 0,
        requests: 8588,
        responses: 8586,
        bytes: 0,
        avgRate: 10,
        errorRateBruta: (2 / 1075) * 100,
        errors: { ERR_SOCKET_TIMEOUT: 2 },
        errorsTotal: 2,
      },
      byEndpointCodesAggregate: {
        '/api/v1/empleados/no-es-un-id': { '400': 1072, '200': 1 },
      },
    });

    const { findings } = analyze({ artillery, jest: null, config: baseConfig });

    const mismatchWarning = findings.find((f: { title: string }) => f.title === 'El contador de rechazos NO coincide con el tráfico corrupto inyectado');
    expect(mismatchWarning).toBeDefined();
  });

  it('marca info cuando requests/responses no cuadran pero la diferencia coincide con errores de socket', () => {
    const artillery = makeArtillery({
      kpis: {
        created: 10, completed: 10, failed: 1, c201: 10, c200: 0, c400: 0, c5xx: 0,
        requests: 20, responses: 19, bytes: 0, avgRate: 1, errorRateBruta: 0,
        errors: { ERR_SOCKET_TIMEOUT: 1 }, errorsTotal: 1,
      },
      periods: [makePeriod({ n: 1, requests: 20, responses: 19 })],
    });

    const { findings } = analyze({ artillery, jest: null, config: baseConfig });

    const info = findings.find((f: { title: string }) => f.title === 'requests y responses no cuadran, pero la diferencia la explican errores de socket');
    expect(info).toBeDefined();
    expect(info?.severity).toBe('info');

    const warning = findings.find((f: { title: string }) => f.title === 'requests y responses no cuadran y la diferencia no está explicada');
    expect(warning).toBeUndefined();
  });

  it('marca warning cuando requests/responses no cuadran y la diferencia no está explicada por errores de socket', () => {
    const artillery = makeArtillery({
      kpis: {
        created: 10, completed: 10, failed: 0, c201: 10, c200: 0, c400: 0, c5xx: 0,
        requests: 20, responses: 15, bytes: 0, avgRate: 1, errorRateBruta: 0,
        errors: {}, errorsTotal: 0,
      },
      periods: [makePeriod({ n: 1, requests: 20, responses: 15 })],
    });

    const { findings } = analyze({ artillery, jest: null, config: baseConfig });

    const warning = findings.find((f: { title: string }) => f.title === 'requests y responses no cuadran y la diferencia no está explicada');
    expect(warning).toBeDefined();
    expect(warning?.severity).toBe('warning');
  });

  it('la tasa de error real incluye 5xx y errores de socket, no solo 4xx inesperados', () => {
    const artillery = makeArtillery({
      kpis: {
        created: 100, completed: 100, failed: 1, c201: 0, c200: 0, c400: 0, c5xx: 2,
        requests: 200, responses: 199, bytes: 0, avgRate: 10, errorRateBruta: 1,
        errors: { ERR_SOCKET_TIMEOUT: 1 }, errorsTotal: 1,
      },
    });

    const { rateReal } = analyze({ artillery, jest: null, config: baseConfig });

    // 0 4xx inesperados + 2 5xx + 1 error de socket = 3 / 200 = 1.5%
    expect(rateReal).toBeCloseTo(1.5, 5);
  });

  it('reporta un hallazgo dedicado cuando hay errores de socket', () => {
    const artillery = makeArtillery({
      kpis: {
        created: 10, completed: 9, failed: 1, c201: 9, c200: 0, c400: 0, c5xx: 0,
        requests: 10, responses: 9, bytes: 0, avgRate: 1, errorRateBruta: 10,
        errors: { ERR_SOCKET_TIMEOUT: 1 }, errorsTotal: 1,
      },
      periods: [makePeriod({ n: 1, errors: { ERR_SOCKET_TIMEOUT: 1 }, errorsTotal: 1 })],
    });

    const { findings } = analyze({ artillery, jest: null, config: baseConfig });

    const socketErrors = findings.find((f: { title: string }) => f.title === 'Errores de socket durante la prueba');
    expect(socketErrors).toBeDefined();
    expect(socketErrors?.detail).toContain('ERR_SOCKET_TIMEOUT');
    expect(socketErrors?.detail).toContain('#1');
  });

  it('excluye del análisis de tendencia del p99 el intervalo marcado como Drenaje (analyze.mjs no reclasifica, confía en parseArtillery)', () => {
    const artillery = makeArtillery({
      periods: [
        makePeriod({ n: 1, fase: 'Saturación', p99: 1000 }),
        makePeriod({ n: 2, fase: 'Saturación', p99: 3000 }),
        makePeriod({ n: 3, fase: 'Saturación', p99: 6000 }),
        makePeriod({ n: 4, fase: 'Saturación', p99: 8000 }),
        makePeriod({ n: 5, fase: 'Drenaje', p99: 3 }),
      ],
    });

    const { findings } = analyze({ artillery, jest: null, config: baseConfig });

    const trend = findings.find((f: { title: string }) => f.title.includes('crece de forma'));
    expect(trend).toBeDefined();
    expect(trend?.detail).not.toContain('#5=3ms');
    expect(trend?.detail).toContain('Drenaje');
  });

  it('el veredicto usa el ensure de stress-test.yml (artillery.sla), no un umbral separado', () => {
    // p99 = 300ms: pasaría contra el umbral viejo hardcodeado (500ms), pero debe
    // fallar contra el sla real del YAML (200ms) — este es el bug que se reportó.
    const artillery = makeArtillery({
      percentiles: {
        all: { min: 0, p50: 1, p75: 1, p90: 1, p95: 1, p99: 300, p999: 1, max: 1, mean: 1 },
        twoXX: { mean: 1 },
        fourXX: { mean: 1 },
      },
      sla: { p99: 200, maxErrorRate: 1 },
    });

    const { verdict } = analyze({ artillery, jest: null, config: baseConfig });

    expect(verdict.status).toBe('FALLA');
    expect(verdict.slaP99).toBe(200);
    expect(verdict.reasons.join(' ')).toContain('umbral del ensure (200ms)');
  });

  it('cae a 200ms/1% por defecto si no se pudo leer el sla del YAML', () => {
    const artillery = makeArtillery({ sla: { p99: null, maxErrorRate: null } });

    const { verdict } = analyze({ artillery, jest: null, config: baseConfig });

    expect(verdict.slaP99).toBe(200);
    expect(verdict.slaMaxErrorRate).toBe(1);
  });
});
