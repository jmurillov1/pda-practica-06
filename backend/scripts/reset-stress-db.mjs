#!/usr/bin/env node
// EXTRA: limpia la colección "empleados" antes de correr la prueba de estrés,
// para que el hallazgo de "payload creciente" del reporte HTML no se dispare
// por basura acumulada de corridas anteriores en vez de por el crecimiento
// real dentro de UNA sola corrida.
//
// Guardrail: rechaza correr si la URI no apunta a localhost/127.0.0.1. El
// .env del backend puede apuntar a un Atlas real (producción); este script
// NUNCA debe borrar esa base por accidente, así que ignora .env a propósito
// y usa una URI local fija salvo que se sobreescriba explícitamente.

import mongoose from 'mongoose';

const MONGO_URI =
  process.env.STRESS_MONGO_URI ?? 'mongodb://admin:password123@127.0.0.1:27017/empleados_db_stress?authSource=admin';

if (!/(127\.0\.0\.1|localhost)/.test(MONGO_URI)) {
  console.error(
    `Rechazado: la URI "${MONGO_URI}" no apunta a localhost/127.0.0.1. ` +
      'Este script solo limpia bases LOCALES de prueba, nunca un Atlas/servidor remoto.',
  );
  process.exit(1);
}

await mongoose.connect(MONGO_URI);
const result = await mongoose.connection.collection('empleados').deleteMany({});
console.log(`🧹 Colección "empleados" limpiada (${MONGO_URI.split('@')[1] ?? MONGO_URI}): ${result.deletedCount} documentos eliminados.`);
await mongoose.disconnect();
