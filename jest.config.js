/** @type {import('jest').Config} */
module.exports = {
    projects: [
        {
            displayName: 'unit',
            testMatch: ['<rootDir>/tests/unit/**/*.test.ts'],
            preset: 'ts-jest',
            testEnvironment: 'node',
            transform: {
                '^.+\\.tsx?$': ['ts-jest', { tsconfig: 'tsconfig.json' }]
            }
        },
        {
            displayName: 'integration',
            testMatch: ['<rootDir>/tests/integration/**/*.test.ts'],
            preset: 'ts-jest',
            testEnvironment: 'node',
            transform: {
                '^.+\\.tsx?$': ['ts-jest', { tsconfig: 'tsconfig.json' }]
            }
        },
        {
            displayName: 'e2e',
            testMatch: ['<rootDir>/tests/e2e/**/*.e2e.test.ts'],
            preset: 'ts-jest',
            testEnvironment: 'node',
            transform: {
                '^.+\\.tsx?$': ['ts-jest', { tsconfig: 'tsconfig.json' }]
            },
            globalSetup: '<rootDir>/tests/e2e/setup.ts',
            globalTeardown: '<rootDir>/tests/e2e/teardown.ts'
        }
    ],
    collectCoverageFrom: [
        'src/**/*.ts',
        '!src/index.ts'
    ],
    coverageReporters: ['text', 'lcov']
};
