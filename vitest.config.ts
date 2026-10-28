import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  // Bound concurrent workerd/SQLite processes for deterministic CI on small runners.
  test: { maxWorkers: 2, include: ['tests/**/*.test.{ts,tsx}'], environment: 'jsdom' },
})
