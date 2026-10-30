// Genera dist-single/index.html: el juego completo en un único archivo HTML (sin servidor).
import { readFileSync, writeFileSync, mkdirSync, readdirSync } from 'node:fs';
const dir = 'dist/assets';
let html = readFileSync('dist/index.html', 'utf8');
for (const f of readdirSync(dir)) {
  const code = readFileSync(`${dir}/${f}`, 'utf8');
  if (f.endsWith('.js')) {
    html = html.replace(new RegExp(`<script type="module" crossorigin src="./assets/${f}"></script>`), () => '');
    html = html.replace('</body>', () => `<script type="module">${code}</script>\n</body>`);
  } else if (f.endsWith('.css')) {
    html = html.replace(new RegExp(`<link rel="stylesheet" crossorigin href="./assets/${f}">`), () => `<style>${code}</style>`);
  }
}
// Modelos GLB incrustados como data URL (el juego los busca en window.__GLB).
const glbDir = 'public/models/dinosaurs';
const glb = {};
for (const f of readdirSync(glbDir)) if (f.endsWith('.glb')) glb[f.replace('.glb', '')] = 'data:model/gltf-binary;base64,' + readFileSync(`${glbDir}/${f}`).toString('base64');
// Dinosaurios con esqueleto de Quaternius (CC0), con prefijo q_.
for (const f of ['t-rex.glb', 'triceratops.glb', 'stegosaurus.glb', 'apatosaurus.glb']) glb['q_' + f.replace('.glb', '')] = 'data:model/gltf-binary;base64,' + readFileSync(`public/models/quaternius/${f}`).toString('base64');
html = html.replace('</head>', () => `<script>window.__GLB=${JSON.stringify(glb)};</script>\n</head>`);
mkdirSync('dist-single', { recursive: true });
writeFileSync('dist-single/index.html', html);
console.log('dist-single/index.html', (html.length / 1024).toFixed(0), 'KB');
