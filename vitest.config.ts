import { defineConfig } from 'vitest/config'

export default defineConfig({
  // pliki testowe dzielą jeden emulator Firestore — nie mogą działać równolegle
  test: { include: ['tests/**/*.test.ts'], environment: 'node', testTimeout: 20000, fileParallelism: false },
})
