import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import eslintConfigPrettier from 'eslint-config-prettier';

export default tseslint.config(
  {
    ignores: ['dist/**', 'coverage/**', 'node_modules/**'],
  },
  js.configs.recommended,
  {
    files: ['**/*.ts'],
    extends: [...tseslint.configs.recommendedTypeChecked],
    languageOptions: {
      parserOptions: {
        project: './tsconfig.eslint.json',
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/no-misused-promises': ['error', { checksVoidReturn: false }],
      // Implementaciones triviales de interfaces async (p. ej. un repositorio en memoria)
      // no necesitan un `await` real.
      '@typescript-eslint/require-await': 'off',
    },
  },
  {
    // Reto 1 (Desacoplamiento): Mongoose solo puede aparecer en la capa de persistencia.
    // Si alguien vuelve a importarlo en un controlador, ruta, dto, etc., el lint falla.
    files: ['src/**/*.ts'],
    ignores: ['src/config/database.ts', 'src/models/**/*.ts', 'src/repositories/*.mongoose.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: 'mongoose',
              message:
                'Mongoose solo puede importarse en config/database.ts, models/** o repositories/*.mongoose.ts (Reto 1: la capa de Express debe ser agnóstica al ODM).',
            },
          ],
        },
      ],
    },
  },
  {
    // supertest tipa `response.body` como `any`; relajamos las reglas de seguridad de tipos
    // solo en los tests, donde ese acceso es intencional y controlado.
    files: ['tests/**/*.ts'],
    rules: {
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-argument': 'off',
    },
  },
  {
    files: ['src/**/*.ts', 'tests/**/*.ts'],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector: 'Identifier[name=/Empleado/i]',
          message:
            'El código se nombra en inglés: usa Employee. El español queda para atributos, rutas y mensajes.',
        },
        {
          selector: 'TSInterfaceDeclaration[id.name=/^I[A-Z]/]',
          message: 'No uses el prefijo húngaro I en interfaces.',
        },
        {
          selector: 'Property[key.name=/^(campo|mensaje)$/]',
          message: 'El sobre de respuesta usa claves en inglés: field, message.',
        },
      ],
    },
  },
  eslintConfigPrettier,
);
