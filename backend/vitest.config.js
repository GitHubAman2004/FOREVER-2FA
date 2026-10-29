import { defineConfig } from 'vitest/config'

export default defineConfig({
    test: {
        environment: 'node',
        setupFiles: ['./tests/setup.js'],
        // first run downloads a MongoDB binary, and bcrypt is slow on purpose
        hookTimeout: 120000,
        testTimeout: 30000
    }
})
