import { env } from './config/env.js';
import { connectDatabase, disconnectDatabase } from './config/database.js';
import { createDependencies } from './container.js';
import { createApp } from './app.js';

const start = async (): Promise<void> => {
  await connectDatabase();
  console.log('🔄 Conexión exitosa a MongoDB');

  const app = createApp(createDependencies());
  const server = app.listen(env.PORT, () => {
    console.log(`Servidor escuchando en el puerto ${env.PORT}`);
  });

  const shutdown = (signal: string): void => {
    console.log(`\n${signal} recibido, cerrando servidor...`);
    server.close(() => {
      void disconnectDatabase().finally(() => process.exit(0));
    });
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
};

start().catch((error: unknown) => {
  console.error('❌ Error crítico al iniciar la aplicación:', error);
  process.exit(1);
});
