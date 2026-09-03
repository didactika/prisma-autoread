import { defineConfig } from 'tsup'

export default defineConfig({
  entry: ['src/index.ts', 'src/nest.ts'],
  format: ['cjs', 'esm'],
  dts: true,
  splitting: false,
  sourcemap: false,
  clean: true,
  treeshake: true,
  target: 'es2022',
  tsconfig: 'tsconfig.json',
  // The dependency exposes CommonJS directory entry points, which native Node ESM
  // cannot import. Bundle it so both published formats have valid module resolution.
  noExternal: ['http-response-client'],
})
