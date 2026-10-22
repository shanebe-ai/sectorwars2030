module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src'],
  testMatch: ['**/__tests__/**/*.test.ts', '**/?(*.)+(spec|test).ts'],
  transform: {
    '^.+\\.ts$': 'ts-jest',
  },
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.d.ts',
    '!src/index.ts',
    '!src/db/migrate.ts',
    '!src/db/seed.ts',
  ],
  moduleFileExtensions: ['ts', 'js', 'json'],
  // Point the suite at a dedicated test database (see globalSetup.ts):
  // a locally running dev server must never share a database with tests.
  globalSetup: '<rootDir>/src/__tests__/globalSetup.ts',
  verbose: true,
  testTimeout: 30000,
  // Run suites sequentially: they share one database and parallel workers
  // step on each other's data.
  maxWorkers: 1,
};


