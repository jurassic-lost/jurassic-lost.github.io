// Prueba automática de la trama de terror (capítulo 1): mensajes, noche, visita del
// depredador al refugio, huellas, la pieza CRONOS-047, el rastro y el guardado.
// Uso: npm run dev  (en otra terminal)  y luego  node tests/e2e-story.cjs [url]
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

const setHour = (page, h) => page.evaluate((h) => {
  const g = window.game, s = g.session.save.world;
  const cycle = (hh) => { const d = (((hh - 6) % 24) + 24) % 24; return d < 14 ? (d / 14) * 0.7 : 0.7 + ((d - 14) / 10) * 0.3; };
  const day = Math.floor((s.gameTime + cycle(8) * 1200) / 1200);
  s.gameTime = day * 1200 + cycle(h) * 1200 - cycle(8) * 1200;
  g.updateTimeOfDay(true);
}, h);

// Avanza la historia más deprisa que el juego real (el navegador de prueba va a ~2 fps).
const runStory = (page, seconds, until) => page.evaluate(async ([seconds, until]) => {
  const g = window.game;
  for (let t = 0; t < seconds; t += 0.05) {
    g.story.update(0.05, 1, !!g.buildings.insideShelter(g.player.position));
    if (until && g.story.phase === until) break;
    if (Math.round(t * 20) % 40 === 0) await new Promise((r) => setTimeout(r, 0));
  }
  return g.story.phase;
}, [seconds, until]);

(async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'jl-story-'));
  let { ctx, page } = await open(dir);
  await page.click('#btn-new');
  await page.waitForSelector('#menu-creator:not(.hidden)');
  await page.fill('#cr-name', 'Noche_Max');
  await page.click('#cr-confirm');
  await page.waitForTimeout(400);
  await page.click('#cr-start');

  // 1. Introducción: mensajes misteriosos en el monitor del cuarto gamer.
  await page.waitForFunction(() => !document.getElementById('intro').classList.contains('hidden'), null, { timeout: 60000 });
  const msgs = new Set();
  const t0 = Date.now();
  while (Date.now() - t0 < 150000 && msgs.size < 3) {
    const m = await page.evaluate(() => document.querySelector('#intro-phone .msg')?.textContent || '');
    if (m) msgs.add(m);
    if (msgs.size === 2) await page.screenshot({ path: `${SHOTS}/t1-mensajes-monitor.png` });
    await page.waitForTimeout(250);
  }
  check('La introducción muestra mensajes misteriosos en el monitor', msgs.size >= 3, [...msgs].join(' / '));
  if (await page.isVisible('#intro-skip')) await page.evaluate(() => document.getElementById('intro-skip').click());
  await page.waitForFunction(() => window.game.playing === true, null, { timeout: 60000 });
  await page.waitForTimeout(1000);

  // 2. Noche más oscura y con niebla cercana.
  const day = await page.evaluate(() => ({ far: window.game.scene.fog.far, hemi: window.game.env.hemi.intensity }));
  await setHour(page, 23);
  await page.waitForTimeout(600);
  const night = await page.evaluate(() => ({ far: window.game.scene.fog.far, hemi: window.game.env.hemi.intensity }));
  check('De noche la niebla se acerca y hay menos luz', night.far < day.far * 0.6 && night.hemi < 0.7, `${JSON.stringify(day)} → ${JSON.stringify(night)}`);
  await page.screenshot({ path: `${SHOTS}/t2-noche.png` });

  // 3. Ambiente nocturno: ojos que brillan, ruidos, silencio de los grillos con un depredador cerca.
  const amb = await page.evaluate(async () => {
    const g = window.game, a = g.story.ambience;
    a.nextEyes = 0; a.nextRustle = 0; a.nextGrowl = 0; a.nextSteps = 0;
    await new Promise((r) => setTimeout(r, 1500));
    const eyes = a.eyes.some((e) => e.life > 0);
    const d = g.dinos.find((x) => x.cfg.temper === 'stalker');
    const back = g.player.position.clone();
    g.player.spawn(d.position.x + 20, d.position.z); // cerca de su territorio
    d.state = 'stalk'; d.timer = 30;
    await new Promise((r) => setTimeout(r, 1500));
    const hushed = g.audio.hushV;
    d.state = 'idle'; d.timer = 20;
    g.player.spawn(back.x, back.z); g.cam.snap();
    await new Promise((r) => setTimeout(r, 1500));
    return { eyes, hushed, nightMul: window.game.constructor && g.dinos[0].constructor.night };
  });
  check('De noche aparecen ojos brillando entre los árboles', amb.eyes, JSON.stringify(amb));
  check('Con un depredador acechando cerca se callan los grillos', amb.hushed === 1, JSON.stringify(amb));
  check('De noche los depredadores perciben más lejos', amb.nightMul > 0.9, JSON.stringify(amb));

  // 4. Refugio y visita nocturna.
  await page.evaluate(() => {
    const g = window.game, b = g.buildings;
    for (const [id, v] of [['explore', 15], ['wood', 5], ['stone', 5], ['water', 1], ['dino', 1]]) g.objectives.set(id, v);
    g.player.spawn(6, -6);
    b.startPlacing();
    for (let i = 0; i < 32 && !b.valid; i++) b.updateGhost(g.player.position, (i / 32) * Math.PI * 2);
    b.import([{ id: 'test', type: 'shelter', pos: [b.ghostPos.x, b.ghostPos.y, b.ghostPos.z], rotation: b.ghostRot, state: 'built', storage: {} }]);
    b.cancelPlacing();
    for (const [id, v] of [['shelter_wood', 10], ['shelter_leaves', 6], ['shelter_fiber', 4], ['build_shelter', 1]]) g.objectives.set(id, v);
    const s = b.shelters[0], p = s.inside();
    g.player.spawn(p.x, p.z); g.cam.snap();
  });
  await setHour(page, 22);
  await page.waitForTimeout(900);
  const prompt = await page.textContent('#prompt');
  check('Dentro del refugio se ofrece dormir', prompt.includes('Dormir hasta el amanecer'), prompt);
  await page.evaluate(() => window.game.input.press('interact'));
  await page.waitForTimeout(400);
  check('Al dormir la primera noche empieza la visita', await page.evaluate(() => window.game.story.visiting));
  let phase = await runStory(page, 10, 'approach');
  const wake = await page.evaluate(() => ({ phase: window.game.story.phase, clock: window.game.worldClock.hour, hush: window.game.audio.hushV, toast: document.getElementById('toasts').textContent }));
  check('Despiertas de madrugada y la selva se queda en silencio', phase === 'approach' && wake.clock < 4 && wake.hush === 1, JSON.stringify(wake));
  phase = await runStory(page, 12);
  const mid = await page.evaluate(() => { const g = window.game, v = g.story.visitor, s = g.buildings.shelters[0]; return { d: Math.hypot(v.position.x - s.position.x, v.position.z - s.position.z), visible: v.rig.root.visible, phase: g.story.phase }; });
  await page.waitForTimeout(700);
  await page.screenshot({ path: `${SHOTS}/t3-se-acerca.png` });
  check('Un gran depredador se acerca al refugio', mid.visible && mid.d < 40, JSON.stringify(mid));
  phase = await runStory(page, 40, 'sniff');
  await page.waitForTimeout(700);
  await page.screenshot({ path: `${SHOTS}/t4-olfatea.png` });
  check('Se detiene a olfatear junto al refugio', phase === 'sniff', phase);
  const hp0 = await page.evaluate(() => window.game.survival.health);
  phase = await runStory(page, 60, 'calm');
  check('Se marcha sin atacar', phase === 'calm' && (await page.evaluate(() => window.game.survival.health)) >= hp0, phase);
  phase = await runStory(page, 15, 'off');
  const dawn = await page.evaluate(() => {
    const g = window.game, st = g.story.state;
    return { phase: g.story.phase, hour: g.worldClock.hour, tracks: st.tracks.length, cronos: !!st.cronos, end: !!st.trailEnd,
      mission: g.objectives.current?.id, done: g.objectives.list.filter((o) => o.done).map((o) => o.id) };
  });
  check('Amanece tras la visita', dawn.phase === 'off' && dawn.hour >= 6 && dawn.hour < 8, JSON.stringify(dawn));
  check('Quedan huellas enormes junto al refugio', dawn.tracks >= 8, `${dawn.tracks} huellas`);
  check('Aparece la pieza CRONOS-047', dawn.cronos);
  check('Empieza la misión «Algo ronda en la noche»', dawn.mission === 'huellas' && dawn.done.includes('night_visit'), JSON.stringify(dawn));

  // 5. Examinar huellas y recoger CRONOS-047.
  await page.evaluate(() => { const g = window.game, [x, z] = g.story.state.tracks[1]; g.player.spawn(x + 1, z + 1); g.cam.snap(); });
  await page.waitForTimeout(2500);
  await page.screenshot({ path: `${SHOTS}/t5-huellas.png` });
  check('Examinar las huellas cumple el objetivo', await page.evaluate(() => window.game.objectives.list.find((o) => o.id === 'tracks').done));
  await page.evaluate(() => { const g = window.game, [x, z] = g.story.state.cronos; g.player.spawn(x + 0.5, z + 0.4); g.cam.yaw = Math.atan2(0.5, 0.4); g.cam.snap(); });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${SHOTS}/t6-pieza.png` });
  const pp = await page.textContent('#prompt');
  check('Se puede recoger la pieza metálica', pp.includes('pieza metálica'), pp);
  await page.waitForFunction(() => {
    const g = window.game;
    if (!g.story.pieceNear(g.player.position)) { const [x, z] = g.story.state.cronos; g.player.spawn(x + 0.3, z + 0.3); }
    return g.story.pieceNear(g.player.position) && !g.player.model.busy;
  }, null, { timeout: 30000, polling: 1000 });
  console.log('   (junto a la pieza:', await page.evaluate(() => { const g = window.game, c = g.story.state.cronos; return Math.hypot(c[0] - g.player.position.x, c[1] - g.player.position.z).toFixed(2) + ' m'; }), ')');
  await page.evaluate(() => window.game.input.press('interact'));
  try { await page.waitForSelector('#story-card:not(.hidden)', { timeout: 15000 }); } catch (e) {
    console.log('DEPURACIÓN', page.errors, await page.evaluate(() => ({ busy: window.game.player.model.busy, pressed: [...window.game.input.pressed], cr: window.game.story.state.cronos, prompt: document.getElementById('prompt').textContent, resting: window.game.resting, focus: !!window.game.focus })));
    throw e;
  }
  await page.screenshot({ path: `${SHOTS}/t7-cronos.png` });
  const card = await page.textContent('#story-card');
  check('Tarjeta de CRONOS-047', card.includes('CRONOS-047'), card.slice(0, 60));
  // (Con el juego a ~2 fps, Playwright no da el botón por «quieto»: se comprueba que es lo
  // que hay bajo el dedo en su centro y se pulsa desde la página.)
  const hit = await page.evaluate(() => {
    const btn = document.querySelector('#story-card button'), r = btn.getBoundingClientRect();
    const el = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
    const top = el === btn;
    btn.click();
    return top;
  });
  check('El botón «Continuar» es lo que se toca en pantalla', hit);
  await page.waitForTimeout(800);
  check('El botón «Continuar» cierra la tarjeta', await page.evaluate(() => document.getElementById('story-card').classList.contains('hidden')));
  const got = await page.evaluate(() => ({ items: window.game.session.save.specialItems, done: window.game.objectives.list.find((o) => o.id === 'cronos').done }));
  check('CRONOS-047 queda guardada como objeto especial', got.items.includes('cronos_047') && got.done, JSON.stringify(got));

  // 6. Seguir el rastro hasta el final.
  await page.evaluate(() => { const g = window.game, [x, z] = g.story.state.trailEnd; g.player.spawn(x + 2, z + 2); g.cam.snap(); });
  await page.waitForFunction(() => window.game.objectives.current?.id === 'kiro', null, { timeout: 20000 }).catch(() => {});
  const trail = await page.evaluate(() => ({ mission: window.game.objectives.current?.id, title: document.querySelector('#objective h3').textContent }));
  check('Al final del rastro empieza la misión hacia Kiro', trail.mission === 'kiro', JSON.stringify(trail));
  await page.screenshot({ path: `${SHOTS}/t8-final-rastro.png` });

  // 7. Guardado: la historia se recupera al volver.
  await page.evaluate(() => window.game.setPaused(true));
  await page.waitForTimeout(1000);
  await ctx.close();
  ({ ctx, page } = await open(dir));
  await page.click('#btn-continue >> visible=true');
  await page.waitForFunction(() => window.game.playing === true, null, { timeout: 60000 });
  await page.waitForTimeout(1200);
  const back = await page.evaluate(() => { const st = window.game.story.state; return { flags: st.flags, tracks: st.tracks.length, prints: window.game.story.prints.count, mission: window.game.objectives.current?.id }; });
  check('La historia se guarda y se recupera', back.flags.includes('night_visit') && back.flags.includes('cronos') && back.tracks === dawn.tracks && back.prints === dawn.tracks && back.mission === 'kiro', JSON.stringify(back));
  check('Sin errores en la consola', page.errors.length === 0, page.errors.slice(0, 3).join(' | '));
  await ctx.close();

  const ok = results.filter((r) => r.ok).length;
  console.log(`\n${ok}/${results.length} pruebas superadas. Capturas en ${SHOTS}`);
  process.exit(ok === results.length ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1); });
