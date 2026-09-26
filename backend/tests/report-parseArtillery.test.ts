import { describe, expect, it } from 'vitest';
// @ts-expect-error - módulo .mjs sin tipos; se prueba tal cual se usa en producción.
import { parseArtillery } from '../scripts/report/parseArtillery.mjs';

const yml = `
config:
  target: "http://localhost:3000"
  phases:
    - duration: 20
      arrivalRate: 5
      name: "1. Calentamiento"
    - duration: 30
      arrivalRate: 15
      rampTo: 50
      name: "2. Saturación"
  ensure:
    thresholds:
      - "http.response_time.p99": 200
    maxErrorRate: 1
`;

function makeRawPeriod(period: number, counters: Record<string, number>, summaries: Record<string, unknown> = {}) {
  return { period, counters, summaries };
}

describe('parseArtillery (fases, errores de socket)', () => {
  it('clasifica un intervalo posterior al fin de las fases como Saturación si aún drena backlog (responses > requests, volumen sostenido)', () => {
    const raw = {
      aggregate: { counters: {}, summaries: {}, rates: {} },
      intermediate: [
        makeRawPeriod(0, { 'http.requests': 1000 }, { 'http.response_time': { p99: 1000 } }),
        // +56s: fin de fases a los 50s, pero el volumen de requests se mantiene (1802 vs 1000 previo)
        makeRawPeriod(56000, { 'http.requests': 1802, 'http.responses': 2147 }, { 'http.response_time': { p99: 8024.5 } }),
      ],
    };

    const parsed = parseArtillery(raw, yml);

    expect(parsed.periods[1].fase).toBe('Saturación');
  });

  it('clasifica como Drenaje un intervalo posterior al fin de las fases cuyo volumen cae a menos de la mitad del anterior', () => {
    const raw = {
      aggregate: { counters: {}, summaries: {}, rates: {} },
      intermediate: [
        makeRawPeriod(0, { 'http.requests': 1802 }, { 'http.response_time': { p99: 8024.5 } }),
        // +66s: volumen cae de 1802 a 670 (< 50%)
        makeRawPeriod(66000, { 'http.requests': 670, 'http.responses': 670 }, { 'http.response_time': { p99: 3 } }),
      ],
    };

    const parsed = parseArtillery(raw, yml);

    expect(parsed.periods[1].fase).toBe('Drenaje');
  });

  it('extrae los contadores errors.* y su total, en el agregado y por intervalo', () => {
    const raw = {
      aggregate: {
        counters: { 'errors.ERR_SOCKET_TIMEOUT': 2, 'vusers.created': 10 },
        summaries: {},
        rates: {},
      },
      intermediate: [makeRawPeriod(0, { 'errors.ERR_SOCKET_TIMEOUT': 2 })],
    };

    const parsed = parseArtillery(raw, yml);

    expect(parsed.kpis.errors).toEqual({ ERR_SOCKET_TIMEOUT: 2 });
    expect(parsed.kpis.errorsTotal).toBe(2);
    expect(parsed.periods[0].errors).toEqual({ ERR_SOCKET_TIMEOUT: 2 });
    expect(parsed.periods[0].errorsTotal).toBe(2);
  });
});
