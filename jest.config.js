/** @type {import('jest').Config} */
module.exports = {
    projects: [
        {
            displayName: 'unit',
            testMatch: ['<rootDir>/tests/unit/**/*.test.ts'],
            preset: 'ts-jest',
            testEnvironment: 'node',
            transform: {
                '^.+\\.[tj]sx?$': ['ts-jest', { tsconfig: 'tsconfig.test.json' }]
            },
            transformIgnorePatterns: ['node_modules/(?!(http-response-client)/)']
        },
        {
            displayName: 'integration',
            testMatch: ['<rootDir>/tests/integration/**/*.test.ts'],
            preset: 'ts-jest',
            testEnvironment: 'node',
            transform: {
                '^.+\\.[tj]sx?$': ['ts-jest', { tsconfig: 'tsconfig.test.json' }]
            },
            transformIgnorePatterns: ['node_modules/(?!(http-response-client)/)']
        },
        {
            displayName: 'e2e',
            testMatch: ['<rootDir>/tests/e2e/**/*.e2e.test.ts'],
            preset: 'ts-jest',
            testEnvironment: 'node',
            transform: {
                '^.+\\.[tj]sx?$': ['ts-jest', { tsconfig: 'tsconfig.test.json' }]
            },
            transformIgnorePatterns: ['node_modules/(?!(http-response-client)/)'],
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
