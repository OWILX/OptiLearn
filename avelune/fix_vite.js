const fs = require('fs');
let c = fs.readFileSync('vite.config.ts', 'utf8');

if (!c.includes('cssMinify')) {
  c = c.replace('defineConfig({', "defineConfig({\n  build: {\n    cssMinify: 'esbuild'\n  },");
  fs.writeFileSync('vite.config.ts', c);
  console.log('✅ Successfully injected cssMinify: esbuild');
} else {
  console.log('ℹ️ cssMinify is already configured.');
}
