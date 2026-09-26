/** @type {import('jest').Config} */
export default {
  preset: 'ts-jest/presets/default-esm',
  testEnvironment: 'node',
  verbose: true,
  clearMocks: true,
  testMatch: ['<rootDir>/src/**/*.spec.ts'],
  transform: {
    '^.+\\.tsx?$': ['ts-jest', { useESM: true, tsconfig: 'tsconfig.jest.json' }],
  },
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1',
  },
  // Cobertura (solo se activa con --coverage, ej. `pnpm test:unit:report`):
  // acotada al controlador porque es lo único que ejercitan estos specs.
  collectCoverageFrom: ['src/controllers/**/*.ts'],
  coverageProvider: 'v8', // evita el problema de babel-plugin-istanbul con ts-jest
};
