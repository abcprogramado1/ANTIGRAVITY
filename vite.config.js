
import { defineConfig } from 'vite'

export default defineConfig({
    base: '/ANTIGRAVITY/', // Base path for GitHub Pages deployment
    build: {
        outDir: 'dist',
        rollupOptions: {
            input: {
                main: 'index.html',
            }
        }
    }
})
