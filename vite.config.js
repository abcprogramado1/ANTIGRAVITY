
import { defineConfig } from 'vite'

// Note: This project is Vanilla JS, so we do not include the React plugin.
// If you migrate to React later, uncomment the import below and add react() to plugins.
// import react from '@vitejs/plugin-react'

export default defineConfig({
    plugins: [], // react() removed
    base: '/ANTIGRAVITY/', // Importante: Esto permite que los archivos carguen desde la subcarpeta de GitHub
    build: {
        outDir: 'dist',
        rollupOptions: {
            input: {
                main: 'index.html',
            }
        }
    }
})
