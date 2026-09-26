#!/usr/bin/env node
// EXTRA (no forma parte de los entregables que pide la guía): orquesta el
// motor de análisis (scripts/report/*) para convertir el JSON de Artillery
// (+ opcionalmente Jest y la cobertura) en un único reporte HTML detallado.
//
// La lógica vive en scripts/report/ (parseArtillery, parseJest, analyze,
// render) como funciones puras y testeadas (ver tests/report-analyze.test.ts);
// este archivo solo lee argv, llama a esas funciones y escribe el resultado.
//
// Uso: node scripts/generate-stress-report.mjs [artillery.json] [historial-dir] [stress-test.yml] [jest.json] [coverage-summary.json]
//
// No hay un reporte "latest" suelto: cada corrida vive únicamente en su
// propia carpeta dentro de [historial-dir]/<fecha-hora>/ (por defecto
// docs/historial/), con reporte.html + una copia de los insumos crudos
// (artillery-report.json y, si existen, jest-results.json y
// coverage-summary.json) para poder re-analizarla más adelante.
// docs/historial/index.html lista todas las corridas guardadas.

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { parseArtillery } from './report/parseArtillery.mjs';
import { parseJest } from './report/parseJest.mjs';
import { analyze } from './report/analyze.mjs';
import { render } from './report/render.mjs';
import { expectedCodes, eventLoopBottlenecks } from './report/config.mjs';
import { buildHistoryEntry, renderHistoryIndex } from './report/history.mjs';

const artilleryPath = resolve(process.argv[2] ?? 'artillery-report.json');
const historyRoot = resolve(process.argv[3] ?? '../docs/historial');
const configPath = resolve(process.argv[4] ?? 'stress-test.yml');
const jestPath = resolve(process.argv[5] ?? 'jest-results.json');
const coveragePath = resolve(process.argv[6] ?? 'coverage/coverage-summary.json');

const readJsonIfExists = (path) => (existsSync(path) ? JSON.parse(readFileSync(path, 'utf-8')) : null);

const rawArtillery = JSON.parse(readFileSync(artilleryPath, 'utf-8'));
const ymlText = existsSync(configPath) ? readFileSync(configPath, 'utf-8') : null;
const rawJest = readJsonIfExists(jestPath);
const rawCoverage = readJsonIfExists(coveragePath);

const artillery = parseArtillery(rawArtillery, ymlText);
const jest = parseJest(rawJest, rawCoverage);
const analysis = analyze({ artillery, jest, config: { expectedCodes, eventLoopBottlenecks } });

const html = render({ artillery, jest, analysis, rawArtillery, rawJest });

console.log(`Veredicto: ${analysis.verdict.status}${analysis.verdict.reasons.length ? ' (' + analysis.verdict.reasons.join('; ') + ')' : ''}`);

// Historial: cada corrida en su propia carpeta, nombrada por fecha/hora.
const timestamp = new Date().toISOString();
const folderName = timestamp.replace(/[:.]/g, '-');
const runDir = join(historyRoot, folderName);
mkdirSync(runDir, { recursive: true });

writeFileSync(join(runDir, 'reporte.html'), html, 'utf-8');
writeFileSync(join(runDir, 'artillery-report.json'), JSON.stringify(rawArtillery), 'utf-8');
if (rawJest != null) writeFileSync(join(runDir, 'jest-results.json'), JSON.stringify(rawJest), 'utf-8');
if (rawCoverage != null) writeFileSync(join(runDir, 'coverage-summary.json'), JSON.stringify(rawCoverage), 'utf-8');

const manifestPath = join(historyRoot, 'manifest.json');
const manifest = existsSync(manifestPath) ? JSON.parse(readFileSync(manifestPath, 'utf-8')) : [];
manifest.push(buildHistoryEntry({ timestamp, folder: folderName, artillery, analysis }));
writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), 'utf-8');
writeFileSync(join(historyRoot, 'index.html'), renderHistoryIndex(manifest), 'utf-8');

console.log(`Reporte guardado en: ${runDir}`);
console.log(`Índice del historial: ${join(historyRoot, 'index.html')}`);
