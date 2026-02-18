
import { defineConfig } from 'vite'

export default defineConfig({
    plugins: [],
    base: '/ANTIGRAVITY/', // Cambiado a relativo para evitar errores con el nombre del repositorio (mayúsculas/minúsculas)
    build: {
        outDir: 'dist',
        rollupOptions: {
            input: {
                main: 'index.html',
            }
        }
    }
})
