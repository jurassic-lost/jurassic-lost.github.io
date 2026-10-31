// Prueba automática del combate: todos los dinosaurios atacan al verte, se les puede vencer
// (más golpes cuanto más grandes) y sueltan carne que da vida.
// Uso: npm run dev  (en otra terminal)  y luego  node tests/e2e-combat.cjs [url]
const { chromium } = require('playwright');
const fs = require('fs');
const os = require('os');
const path = require('path');

const URL = process.argv[2] || 'http://localhost:5173/';
const SHOTS = process.env.SHOTS || path.join(os.tmpdir(), 'jl-shots');
fs.mkdirSync(SHOTS, { recursive: true });
const ARGS = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'];
const results = [];
const check = (name, ok, extra = '') => { results.push({ name, ok }); console.log(`${ok ? 'OK  ' : 'FALLA'} ${name}${extra ? ' — ' + extra : ''}`); };

(async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'jl-combat-'));
  const ctx = await chromium.launchPersistentContext(dir, { args: ARGS, viewport: { width: 1280, height: 760 } });
  const page = ctx.pages()[0] || await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 200)); });
  await page.goto(URL);
  await page.evaluate(() => localStorage.setItem('jurassic-lost-settings-v1', JSON.stringify({ quality: 'low' })));
  await page.reload();
  await page.waitForSelector('#menu-buttons:not(.hidden)', { timeout: 120000 });
  await page.click('#btn-new');
  await page.fill('#cr-name', 'Rex_Lucha');
  await page.click('#cr-start');
  await page.waitForFunction(() => !document.getElementById('intro').classList.contains('hidden') || window.game.playing === true, null, { timeout: 60000 });
  await page.waitForTimeout(500);
  if (await page.isVisible('#intro-skip')) await page.evaluate(() => document.getElementById('intro-skip').click());
  await page.waitForFunction(() => window.game.playing === true, null, { timeout: 60000 });
  await page.waitForTimeout(1000);

  // 1. Cada especie reacciona a su manera.
  const react = (name, dist, waitFor) => page.evaluate(async ([name, dist, waitFor]) => {
    const g = window.game, d = g.dinos.find((x) => x.cfg.name === name);
    g.player.spawn(d.position.x + dist, d.position.z + dist * 0.3);
    g.cam.snap();
    d.state = 'idle'; d.timer = 3;
    const seq = [];
    const t0 = performance.now();
    while (performance.now() - t0 < 25000 && !waitFor.includes(d.state)) {
      if (seq[seq.length - 1] !== d.state) seq.push(d.state);
      await new Promise((r) => setTimeout(r, 100));
    }
    seq.push(d.state);
    return seq;
  }, [name, dist, waitFor]);
  const tri = await react('Triceratops', 8, ['warn', 'hunt']);
  check('El triceratops primero te advierte (bufa y pisotea)', tri[tri.length - 1] === 'warn', tri.join('→'));
  const tri2 = await page.evaluate(async () => {
    const d = window.game.dinos.find((x) => x.cfg.name === 'Triceratops');
    d.timer = 0; // se acaba el aviso y sigues ahí
    await new Promise((r) => setTimeout(r, 1500));
    return d.state;
  });
  check('Si no te alejas, el triceratops embiste', tri2 === 'hunt', tri2);
  const igu = await react('Iguanodonte', 12, ['avoid', 'warn', 'hunt']);
  check('El iguanodonte da la alarma y huye', igu[igu.length - 1] === 'avoid', igu.join('→'));
  const pred = await page.evaluate(() => window.game.dinos.find((x) => x.cfg.temper === 'stalker').cfg.name);
  const st = await react(pred, 16, ['stalk', 'hunt']);
  check(`El ${pred.toLowerCase()} te acecha antes de atacar`, st[st.length - 1] === 'stalk', st.join('→'));
  await page.evaluate(() => { for (const d of window.game.dinos) { if (d.state !== 'down') { d.state = 'idle'; d.timer = 5; } } window.game.player.spawn(0, 0); });

  // 2. Golpes necesarios según el tamaño (con el garrote, 12 de daño).
  const hits = await page.evaluate(() => {
    const g = window.game, out = {};
    for (const name of ['Compsognathus', 'Iguanodonte', 'Triceratops', 'Tiranosaurio']) {
      const d = g.dinos.find((x) => x.cfg.name === name);
      out[name] = Math.ceil(d.cfg.hp / 12);
    }
    return out;
  });
  check('Los grandes necesitan más golpes', hits.Compsognathus < hits.Iguanodonte && hits.Iguanodonte < hits.Triceratops && hits.Triceratops < hits.Tiranosaurio, JSON.stringify(hits));

  // 3. Vencer a un iguanodonte a golpes: cae y suelta carne.
  const fight = await page.evaluate(async () => {
    const g = window.game, d = g.dinos.find((x) => x.cfg.name === 'Iguanodonte');
    let n = 0;
    while (!d.down && n < 50) { g.hitDino(d, 12); n++; }
    const bar = document.querySelector('#target b').textContent;
    await new Promise((r) => setTimeout(r, 1500));
    return { down: d.down, golpes: n, carne: g.meat.list.length, bar };
  });
  check('Vencer a un iguanodonte con el garrote', fight.down && fight.golpes === 5, JSON.stringify(fight));
  check('Suelta carne al caer', fight.carne >= 2, `${fight.carne} trozos`);
  check('Barra de vida del dinosaurio en pantalla', /Iguanodonte/.test(fight.bar), fight.bar);

  // 4. Comer carne recupera vida.
  const eat = await page.evaluate(async () => {
    const g = window.game, m = g.meat.list[0];
    g.survival.health = 40;
    g.player.spawn(m.pos.x + 0.5, m.pos.z + 0.3);
    g.cam.snap();
    const t0 = performance.now();
    while (performance.now() - t0 < 20000 && !(g.player.grounded && g.meatFocus)) await new Promise((r) => setTimeout(r, 200));
    const before = g.meat.list.length;
    g.input.press('interact');
    const t1 = performance.now();
    while (performance.now() - t1 < 20000 && g.meat.list.length === before) await new Promise((r) => setTimeout(r, 200));
    return { health: Math.round(g.survival.health), left: g.meat.list.length, before };
  });
  check('Comer carne da vida', eat.health >= 60 && eat.left === eat.before - 1, JSON.stringify(eat));
  await page.screenshot({ path: `${SHOTS}/12-carne.png` });

  // 5. El tiranosaurio también se puede vencer.
  const rex = await page.evaluate(() => {
    const g = window.game, d = g.dinos.find((x) => x.cfg.name === 'Tiranosaurio');
    let n = 0;
    while (!d.down && n < 100) { g.hitDino(d, 22); n++; }
    return { down: d.down, golpesLanza: n };
  });
  check('El tiranosaurio se puede vencer (muchos golpes)', rex.down && rex.golpesLanza >= 10, JSON.stringify(rex));

  check('Sin errores de JavaScript', errors.length === 0, errors.slice(0, 3).join(' | '));
  await ctx.close();
  const failed = results.filter((r) => !r.ok).length;
  console.log(`\n${results.length - failed}/${results.length} comprobaciones correctas. Capturas en ${SHOTS}`);
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
