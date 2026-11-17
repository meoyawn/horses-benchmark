import { build, context } from 'esbuild';
import { parseArgs } from 'node:util';

const { values } = parseArgs({ options: { serve: { type: 'boolean' }, port: { type: 'string', default: '5186' } } });
const options = {
  entryPoints: { index: 'index.html', 'assets/horse': 'src/main.js' },
  loader: { '.html': 'copy' },
  bundle: true,
  format: 'esm',
  minify: !values.serve,
  sourcemap: values.serve === true,
  outdir: values.serve ? '.dev' : 'dist',
  logLevel: 'info',
};

if (values.serve) {
  const dev = await context(options);
  await dev.watch();
  const host = '127.0.0.1';
  const { port } = await dev.serve({ host, port: Number(values.port), servedir: options.outdir });
  console.log('Equine Atlas is ready at http://' + host + ':' + port + '/');
} else {
  await build(options);
}
