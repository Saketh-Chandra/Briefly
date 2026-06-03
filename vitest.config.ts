import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'

export default defineConfig({
  test: {
    projects: [
      // ── Lane 1 (main-side pure unit) + Lane 3 (main-process contract) ────────
      {
        test: {
          name: 'main',
          include: ['src/main/**/*.test.ts'],
          environment: 'node',
          globals: true,
          pool: 'forks' // native modules (better-sqlite3) require forks pool
        }
      },
      // ── Lane 1 (renderer-side pure unit) + Lane 2 (renderer component) ───────
      {
        plugins: [react()],
        resolve: {
          alias: {
            '@': resolve(__dirname, 'src/renderer/src'),
            '@renderer': resolve(__dirname, 'src/renderer/src')
          }
        },
        test: {
          name: 'renderer',
          include: ['src/renderer/src/**/*.test.{ts,tsx}'],
          environment: 'jsdom',
          globals: true,
          setupFiles: ['src/test/setup-renderer.ts']
        }
      }
    ]
  }
})
