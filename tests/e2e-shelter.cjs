// Prueba automática de la Etapa 2: hojas, refugio, descanso y ciclo de día y noche.
// Uso: npm run dev  (en otra terminal)  y luego  node tests/e2e-shelter.cjs [url]
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

async function open(dir) {
  const ctx = await chromium.launchPersistentContext(dir, { args: ARGS, viewport: { width: 1280, height: 760 } });
  const page = ctx.pages()[0] || await ctx.newPage();
  page.errors = [];
  page.on('pageerror', (e) => page.errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') page.errors.push(m.text().slice(0, 200)); });
  await page.goto(URL);
  await page.evaluate(() => localStorage.setItem('jurassic-lost-settings-v1', JSON.stringify({ quality: 'low' })));
  await page.reload();
  await page.waitForSelector('#menu-buttons:not(.hidden)', { timeout: 120000 });
  return { ctx, page };
}

async function startAndSkipIntro(page, button) {
  await page.click(button);
  await page.waitForFunction(() => window.game.playing === true || !document.getElementById('intro').classList.contains('hidden'), null, { timeout: 60000 });
  await page.waitForTimeout(500);
  if (await page.isVisible('#intro-skip')) await page.evaluate(() => document.getElementById('intro-skip').click());
  await page.waitForFunction(() => window.game.playing === true, null, { timeout: 60000 });
  await page.waitForTimeout(1200);
}

async function collect(page, type, n) {
  for (let i = 0; i < n; i++) {
    await page.evaluate((type) => {
      const g = window.game;
      const all = g.collectibles.pickups.filter((p) => p.available && p.type === type);
      const pp = g.player.position;
      all.sort((a, b) => Math.hypot(a.pos.x - pp.x, a.pos.z - pp.z) - Math.hypot(b.pos.x - pp.x, b.pos.z - pp.z));
      const p = all[0];
      g.player.spawn(p.pos.x + 0.6, p.pos.z + 0.6);
      g.cam.snap();
    }, type);
    await page.waitForFunction(() => window.game.focus && window.game.player.grounded, null, { timeout: 15000 });
    await page.evaluate(() => window.game.input.press('interact'));
    await page.waitForFunction(() => !window.game.player.model.busy && !window.game.input.pressed.has('interact'), null, { timeout: 15000 });
  }
}

// Pone la hora del mundo (h en horas, día 1 = hoy).
const setHour = (page, h) => page.evaluate((h) => {
  const g = window.game, s = g.session.save.world;
  const cycle = (hh) => { const d = (((hh - 6) % 24) + 24) % 24; return d < 14 ? (d / 14) * 0.7 : 0.7 + ((d - 14) / 10) * 0.3; };
  const day = Math.floor((s.gameTime + cycle(8) * 1200) / 1200);
  s.gameTime = day * 1200 + cycle(h) * 1200 - cycle(8) * 1200;
  g.updateTimeOfDay(true);
}, h);

(async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'jl-shelter-'));
  let { ctx, page } = await open(dir);
  await page.click('#btn-new');
  await page.waitForSelector('#menu-creator:not(.hidden)');
  await page.fill('#cr-name', 'Refugio_Max');
  await page.click('#cr-confirm');
  await page.waitForTimeout(400);
  await startAndSkipIntro(page, '#cr-start');

  // 1. Reloj: la partida empieza de día a las 8:00.
  const clock0 = await page.textContent('#clock');
  check('El reloj empieza el día 1 por la mañana', /Día 1 · 0[89]:/.test(clock0), clock0);

  // 2. Hojas grandes: nuevo recurso que se recoge con E.
  await collect(page, 'leaves', 6);
  let inv = await page.evaluate(() => window.game.inventory.toJSON());
  check('Recoge hojas grandes', inv.leaves === 6, JSON.stringify(inv));
  const mats = await page.textContent('#materials');
  check('Los materiales en pantalla muestran fibra y hojas', mats.includes('🌿') && mats.includes('🍃'), mats);

  // 3. Misión 2. (Atajo de prueba: se marcan como hechos los objetivos de la misión 1 y se dan madera y fibra.)
  await page.evaluate(() => {
    const g = window.game;
    for (const [id, v] of [['explore', 15], ['wood', 5], ['stone', 5], ['water', 1], ['dino', 1]]) g.objectives.set(id, v);
    g.inventory.add('wood', 10); g.inventory.add('fiber', 4);
    for (const id of ['wood', 'fiber', 'leaves']) g.objectives.setItem(id, g.inventory.get(id));
  });
  const title = await page.textContent('#objective h3');
  check('Empieza la misión "Un lugar seguro"', title.includes('Un lugar seguro'), title);
  const done3 = await page.evaluate(() => window.game.objectives.list.filter((o) => o.done).map((o) => o.id));
  check('Los materiales reunidos cuentan para la misión', ['shelter_wood', 'shelter_leaves', 'shelter_fiber'].every((x) => done3.includes(x)), done3.join(','));

  // 4. Construir: menú 🛠 → Construir → vista previa → E.
  await page.evaluate(() => { const g = window.game; g.player.spawn(6, -6); g.cam.yaw = 0; g.cam.snap(); });
  await page.waitForTimeout(600);
  await page.evaluate(() => window.game.input.press('craft'));
  await page.waitForSelector('#craft:not(.hidden) button[data-b="0"]:not([disabled])', { timeout: 5000 });
  await page.screenshot({ path: `${SHOTS}/s1-menu-construir.png` });
  await page.click('#craft button[data-b="0"]');
  await page.waitForTimeout(400);
  let placing = await page.evaluate(() => window.game.buildings.placing);
  check('El botón Construir abre la vista previa', placing);
  // Gira la cámara hasta encontrar un sitio válido.
  let valid = false;
  for (let i = 0; i < 16 && !valid; i++) {
    await page.evaluate((i) => { window.game.cam.yaw = (i / 16) * Math.PI * 2; }, i);
    await page.waitForTimeout(250);
    valid = await page.evaluate(() => window.game.buildings.valid);
  }
  check('La vista previa encuentra un sitio llano', valid);
  await page.screenshot({ path: `${SHOTS}/s2-vista-previa.png` });
  const prompt = await page.textContent('#prompt');
  check('Indica cómo colocar el refugio', prompt.includes('Colocar el refugio'), prompt);
  await page.evaluate(() => window.game.input.press('interact'));
  await page.waitForTimeout(1500);
  inv = await page.evaluate(() => window.game.inventory.toJSON());
  check('Gasta 10 madera, 6 hojas y 4 fibra', inv.wood === 0 && inv.leaves === 0 && inv.fiber === 0, JSON.stringify(inv));
  const animating = await page.evaluate(() => window.game.player.model.building);
  check('El personaje hace la animación de construir', animating);
  await page.screenshot({ path: `${SHOTS}/s3-construyendo.png` });
  await page.waitForFunction(() => window.game.buildings.shelters[0]?.built, null, { timeout: 120000 });
  await page.waitForTimeout(500);
  const built = await page.evaluate(() => window.game.objectives.missions[1].list.find((o) => o.id === 'build_shelter').done);
  check('El refugio se termina y cumple el objetivo', built);
  // Vista del refugio terminado de día.
  await page.evaluate(() => { const g = window.game, s = g.buildings.shelters[0], p = s.position, r = s.root.rotation.y;
    g.player.spawn(p.x + Math.sin(r) * 6 + Math.cos(r) * 2, p.z + Math.cos(r) * 6 - Math.sin(r) * 2); g.cam.yaw = r + 0.3; g.cam.snap(); });
  await page.waitForTimeout(900);
  await page.screenshot({ path: `${SHOTS}/s4-refugio-dia.png` });

  // 5. Atardecer y noche.
  await setHour(page, 18.6);
  await page.waitForTimeout(600);
  await page.screenshot({ path: `${SHOTS}/s5-atardecer.png` });
  await setHour(page, 23);
  await page.waitForTimeout(800);
  const night = await page.evaluate(() => ({ n: window.game.worldClock.night, d: window.game.env.daylight, clock: document.getElementById('clock').textContent }));
  check('De noche el reloj muestra la luna y baja la luz', night.n && night.d < 0.05 && night.clock.includes('🌙'), JSON.stringify(night));
  await page.screenshot({ path: `${SHOTS}/s6-noche.png` });

  // 6. Dentro del refugio los dinosaurios no te ven; dormir hasta el amanecer.
  await page.evaluate(() => { const g = window.game, s = g.buildings.shelters[0], p = s.inside(); g.player.spawn(p.x, p.z); g.cam.snap(); g.survival.energy = 20; g.survival.health = 40; });
  await page.waitForTimeout(800);
  const inside = await page.evaluate(() => !!window.game.buildings.insideShelter(window.game.player.position));
  check('Detecta que el jugador está dentro del refugio', inside);
  const sleepPrompt = await page.textContent('#prompt');
  check('Ofrece dormir hasta el amanecer', sleepPrompt.includes('Dormir hasta el amanecer'), sleepPrompt);
  // Un alosaurio cerca no te detecta dentro del refugio.
  const safe = await page.evaluate(async () => {
    const g = window.game, d = g.dinos.find((x) => x.cfg.reaction === 'hunt' && x.cfg.name !== 'Tiranosaurio') || g.dinos.find((x) => x.cfg.reaction === 'hunt');
    const p = g.player.position;
    d.position.set(p.x + 8, d.position.y, p.z + 8);
    d.state = 'idle'; d.timer = 0;
    await new Promise((r) => setTimeout(r, 1500));
    return { name: d.cfg.name, state: d.state };
  });
  check('Un depredador cercano no te ve dentro del refugio', !['alert', 'hunt', 'charge'].includes(safe.state), JSON.stringify(safe));
  // (La visita nocturna del depredador tiene su propia prueba: aquí se da por vivida.)
  await page.evaluate(() => window.game.story.state.flags.push('night_visit'));
  await page.evaluate(() => window.game.input.press('interact'));
  await page.waitForTimeout(800);
  await page.screenshot({ path: `${SHOTS}/s7-durmiendo.png` });
  await page.waitForFunction(() => !window.game.resting, null, { timeout: 10000 });
  await page.waitForTimeout(500);
  const woke = await page.evaluate(() => ({ clock: document.getElementById('clock').textContent, e: window.game.survival.energy, h: window.game.survival.health, obj: window.game.objectives.missions[1].list.find((o) => o.id === 'sleep').done }));
  check('Despierta al amanecer del día 2', /Día 2 · 06:/.test(woke.clock), woke.clock);
  check('Dormir recupera energía y salud', woke.e === 100 && woke.h >= 89, JSON.stringify(woke));
  check('Completa la misión "Un lugar seguro"', woke.obj && (await page.evaluate(() => window.game.objectives.completedMissions().includes('refugio'))));
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${SHOTS}/s8-amanecer.png` });

  // 7. Desmayo: despiertas en el refugio.
  await page.evaluate(() => { const g = window.game; g.player.spawn(40, -30); g.cam.snap(); g.survival.health = 0; });
  await page.waitForTimeout(2500);
  const back = await page.evaluate(() => { const g = window.game, s = g.buildings.shelters[0]; return Math.hypot(g.player.position.x - s.position.x, g.player.position.z - s.position.z); });
  check('Tras desmayarte despiertas en tu refugio', back < 3, back.toFixed(1) + ' m');

  // 8. Guardado: cerrar y volver a abrir el navegador.
  await page.evaluate(() => window.game.setPaused(true));
  await page.waitForTimeout(800);
  const before = await page.evaluate(() => ({ t: window.game.gameTime, n: window.game.buildings.shelters.length, p: window.game.buildings.shelters[0].data.pos }));
  await ctx.close();
  ({ ctx, page } = await open(dir));
  await startAndSkipIntro(page, '#btn-continue >> visible=true');
  const after = await page.evaluate(() => ({ t: window.game.gameTime, n: window.game.buildings.shelters.length, p: window.game.buildings.shelters[0]?.data.pos, built: window.game.buildings.shelters[0]?.built, title: document.querySelector('#objective h3').textContent, clock: document.getElementById('clock').textContent }));
  check('Recupera el refugio guardado', after.n === 1 && after.built && Math.hypot(after.p[0] - before.p[0], after.p[2] - before.p[2]) < 0.01, JSON.stringify(after));
  check('Recupera la hora del mundo', Math.abs(after.t - before.t) < 3 && after.clock.includes('Día 2'), `${before.t.toFixed(0)} → ${after.t.toFixed(0)} · ${after.clock}`);
  check('Recupera las misiones completadas (sigue con «Algo ronda en la noche»)', after.title.includes('Algo ronda en la noche'), after.title);
  check('Sin errores en la consola', page.errors.length === 0, page.errors.slice(0, 3).join(' | '));
  await ctx.close();

  const ok = results.filter((r) => r.ok).length;
  console.log(`\n${ok}/${results.length} pruebas superadas. Capturas en ${SHOTS}`);
  process.exit(ok === results.length ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1); });
