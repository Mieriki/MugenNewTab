import { defineConfig } from 'vitest/config';
import viteConfig from './vite.config';

export default defineConfig({
    ...viteConfig,
    test: {
        environment: 'jsdom',
        globals: true,
        alias: {
            '@': '/src'
        },
        exclude: ['node_modules', 'dist', 'tests/**'],
        passWithNoTests: true
    }
});
