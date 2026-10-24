import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';

for (const [entry, output] of [['commerce-handler', 'commerce-bundle'], ['razorpay-webhook', 'razorpay-webhook-bundle']]) await build({
  absWorkingDir: fileURLToPath(new URL('..', import.meta.url)),
  entryPoints: [`server/${entry}.ts`],
  outfile: `server/${output}.mjs`,
  bundle: true,
  platform: 'node',
  target: 'node24',
  format: 'esm',
  external: ['firebase-admin/*', 'firebase/*'],
});
