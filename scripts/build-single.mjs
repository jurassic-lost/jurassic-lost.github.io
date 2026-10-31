// Genera dist-single/index.html: el juego completo en un único archivo HTML (sin servidor).
import { readFileSync, writeFileSync, mkdirSync, readdirSync } from 'node:fs';
const dir = 'dist/assets';
let html = readFileSync('dist/index.html', 'utf8');
// Imágenes y otros recursos: se incrustan como data URL dentro del CSS y el JS.
const MIME = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', svg: 'image/svg+xml' };
const media = readdirSync(dir).filter((f) => MIME[f.split('.').pop()]);
const inlineMedia = (code) => media.reduce((c, f) => c.replace(new RegExp(`(\\./assets/|\\./|/assets/)?${f.replace(/[.]/g, '\\.')}`, 'g'),
  () => `data:${MIME[f.split('.').pop()]};base64,` + readFileSync(`${dir}/${f}`).toString('base64')), code);
for (const f of readdirSync(dir)) {
  if (media.includes(f)) continue;
  const code = inlineMedia(readFileSync(`${dir}/${f}`, 'utf8'));
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
// (El T-rex low-poly no se incrusta: va el realista. Así el archivo cabe en el límite de 16 MB de Claude.)
for (const f of ['triceratops.glb', 'stegosaurus.glb', 'apatosaurus.glb']) glb['q_' + f.replace('.glb', '')] = 'data:model/gltf-binary;base64,' + readFileSync(`public/models/quaternius/${f}`).toString('base64');
glb['q_trex-real'] = 'data:model/gltf-binary;base64,' + readFileSync('public/models/trex/trex.glb').toString('base64');
// Escenario realista de Poly Haven (CC0), con prefijo p_.
// Solo uno de los dos árboles realistas en el archivo único (por tamaño); la app web lleva los dos.
for (const f of ['boulder.glb', 'island_tree.glb']) glb['p_' + f.replace('.glb', '')] = 'data:model/gltf-binary;base64,' + readFileSync(`public/models/props/${f}`).toString('base64');
html = html.replace('</head>', () => `<script>window.__GLB=${JSON.stringify(glb)};</script>\n</head>`);
mkdirSync('dist-single', { recursive: true });
writeFileSync('dist-single/index.html', html);
console.log('dist-single/index.html', (html.length / 1024).toFixed(0), 'KB');
