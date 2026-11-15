import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { defineConfig, type Plugin } from 'vite';

/** После сборки пишет dist/sw.js со списком всех файлов игры: после первой загрузки она работает без интернета. */
function serviceWorker(): Plugin {
  return {
    name: 'gorodok-sw',
    apply: 'build',
    closeBundle() {
      const dist = 'dist';
      const files: string[] = [];
      const walk = (dir: string) => { for (const f of readdirSync(dir)) { const p = join(dir, f); if (statSync(p).isDirectory()) walk(p); else files.push(relative(dist, p).split('\\').join('/')); } };
      walk(dist);
      const list = files.filter((f) => f !== 'sw.js' && !f.endsWith('.map')).sort();
      const hash = createHash('sha256');
      for (const f of list) hash.update(f).update(readFileSync(join(dist, f)));
      const urls = ['./', ...list.filter((f) => f !== 'index.html').map((f) => './' + f)];
      const sw = readFileSync('src/sw-template.js', 'utf8').replace('__VERSION__', hash.digest('hex').slice(0, 12)).replace('__FILES__', JSON.stringify(urls));
      writeFileSync(join(dist, 'sw.js'), sw);
    },
  };
}

// base './' — сборку можно положить в любую папку на HTTPS-хостинге.
export default defineConfig({
  base: './',
  plugins: [serviceWorker()],
  // папки с голосами девочек и мальчиков подключаются сами, как только появляются в public/assets/voice
  define: { __VOICE_SETS__: JSON.stringify(['girl', 'boy'].filter((g) => existsSync(`public/assets/voice/${g}`))) },
  build: { target: 'es2020', chunkSizeWarningLimit: 900 },
  server: { host: '127.0.0.1', port: 5173 },
  test: { include: ['tests/unit/**/*.test.ts'] },
} as never);
