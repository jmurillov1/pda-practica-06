import 'dotenv/config';
import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  MONGO_URI: z.string().min(1, 'MONGO_URI es obligatoria'),
  CORS_ORIGIN: z.string().default('*'),
});

const result = envSchema.safeParse(process.env);

if (!result.success) {
  console.error('❌ Variables de entorno inválidas:');
  for (const issue of result.error.issues) {
    console.error(`  - ${issue.path.join('.')}: ${issue.message}`);
  }
  process.exit(1);
}

export const env = result.data;
