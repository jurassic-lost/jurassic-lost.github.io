// Prueba automática del capítulo 2 (Kiro): encontrarlo atrapado en lianas, soltarlo,
// juntar bayas, dárselas, que te siga y avise de depredadores, llevarlo al refugio y el guardado.
// Uso: npm run dev  (en otra terminal)  y luego  node tests/e2e-kiro.cjs [url]
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

// Avanza la historia más deprisa que el juego real (el navegador de prueba va a ~2 fps).
const runStory = (page, seconds) => page.evaluate(async (seconds) => {
  const g = window.game;
  for (let t = 0; t < seconds; t += 0.05) {
    g.story.update(0.05, 0, !!g.buildings.insideShelter(g.player.position));
    if (Math.round(t * 20) % 40 === 0) await new Promise((r) => setTimeout(r, 0));
  }
}, seconds);

const kiroDist = (page) => page.evaluate(() => { const g = window.game, k = g.story.kiro; return k ? Math.hypot(k.position.x - g.player.position.x, k.position.z - g.player.position.z) : -1; });

// Pulsa «interactuar» hasta que el aviso de la pantalla cambie (a ~2 fps a veces hay que insistir).
async function pressUntil(page, done, tries = 6) {
  for (let i = 0; i < tries; i++) {
    await page.evaluate(() => window.game.input.press('interact'));
    await page.waitForTimeout(1500);
    if (await page.evaluate(done)) return true;
  }
  return false;
}

(async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'jl-kiro-'));
  let { ctx, page } = await open(dir);
  await page.click('#btn-new');
  await page.waitForSelector('#menu-creator:not(.hidden)');
  await page.fill('#cr-name', 'Amigo_Kiro');
  await page.click('#cr-confirm');
  await page.waitForTimeout(400);
  await page.click('#cr-start');
  await page.waitForFunction(() => !document.getElementById('intro').classList.contains('hidden'), null, { timeout: 60000 });
  await page.evaluate(() => document.getElementById('intro-skip')?.click());
  await page.waitForFunction(() => window.game.playing === true, null, { timeout: 60000 });
  await page.waitForTimeout(1000);

  // Prepara una partida que ya terminó el capítulo 1: refugio, visita, pieza y rastro.
  const setup = await page.evaluate(() => {
    const g = window.game, b = g.buildings;
    for (const [id, v] of [['explore', 15], ['wood', 5], ['stone', 5], ['water', 1], ['dino', 1]]) g.objectives.set(id, v);
    g.player.spawn(6, -6);
    b.startPlacing();
    for (let i = 0; i < 32 && !b.valid; i++) b.updateGhost(g.player.position, (i / 32) * Math.PI * 2);
    b.import([{ id: 'test', type: 'shelter', pos: [b.ghostPos.x, b.ghostPos.y, b.ghostPos.z], rotation: b.ghostRot, state: 'built', storage: {} }]);
    b.cancelPlacing();
    for (const [id, v] of [['shelter_wood', 10], ['shelter_leaves', 6], ['shelter_fiber', 4], ['build_shelter', 1], ['sleep', 1]]) g.objectives.set(id, v);
    const s = b.shelters[0];
    const st = g.story.state;
    st.flags.push('night_visit', 'tracks_seen', 'cronos');
    st.tracks = [];
    for (let i = 0; i < 12; i++) st.tracks.push([s.position.x + 6 + i * 1.6, s.position.z + 4 + i * 0.4, Math.PI / 2]);
    st.trailEnd = [st.tracks[11][0], st.tracks[11][1]];
    g.story.load(st);
    for (const id of ['night_visit', 'tracks', 'cronos']) g.objectives.set(id, 1);
    g.player.spawn(st.trailEnd[0] + 1, st.trailEnd[1] + 1); g.cam.snap();
    return { mission: g.objectives.current?.id };
  });
  await runStory(page, 1);
  await page.waitForFunction(() => window.game.objectives.current?.id === 'kiro', null, { timeout: 20000 }).catch(() => {});
  const start = await page.evaluate(() => ({ mission: window.game.objectives.current?.id, kiro: !!window.game.story.kiro, mode: window.game.story.kiro?.mode, title: document.querySelector('#objective h3').textContent, list: document.querySelector('#objective ul').textContent }));
  check('Al final del rastro empieza el capítulo 2', start.mission === 'kiro' && start.kiro && start.mode === 'trapped', JSON.stringify(start));
  const marker = await page.evaluate(() => window.game.story.markers().length);
  check('El mapa marca dónde chilla la criatura', marker === 1, `${marker} marcas`);

  // 1. Encontrarlo atrapado.
  await page.evaluate(() => { const g = window.game, k = g.story.kiro.position; g.player.spawn(k.x + 2.2, k.z + 0.6); g.player.facing = Math.atan2(-2.2, -0.6); g.cam.yaw = g.player.facing + Math.PI; g.cam.snap(); });
  await runStory(page, 1);
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${SHOTS}/k1-kiro-atrapado.png` });
  const found = await page.evaluate(() => ({ f: window.game.story.has('kiro_found'), vines: !!window.game.story.kiro.vines, prompt: document.getElementById('prompt').textContent }));
  check('Lo encuentras enredado en lianas', found.f && found.vines, JSON.stringify(found));
  check('Se ofrece soltarlo', found.prompt.includes('Soltar a la criatura'), found.prompt);

  // 2. Soltarlo.
  const freed = await pressUntil(page, () => window.game.story.has('kiro_free'));
  await runStory(page, 3);
  const fr = await page.evaluate(() => ({ mode: window.game.story.kiro.mode, vines: !!window.game.story.kiro.vines }));
  check('Al soltarlo corre a esconderse', freed && fr.mode === 'scared' && !fr.vines, JSON.stringify(fr));
  const d0 = await kiroDist(page);
  check('Asustado, se aleja de ti', d0 > 3, `${d0.toFixed(1)} m`);

  // 3. Juntar 3 bayas (se guardan en vez de comerse).
  const hunger0 = await page.evaluate(() => { window.game.survival.hunger = 40; return 40; });
  let berries = 0;
  for (let n = 0; n < 8 && berries < 3; n++) {
    await page.evaluate(() => {
      const g = window.game, all = g.collectibles.pickups.filter((k) => k.available && k.type === 'berries')
        .sort((a, b) => Math.hypot(a.pos.x - g.player.position.x, a.pos.z - g.player.position.z) - Math.hypot(b.pos.x - g.player.position.x, b.pos.z - g.player.position.z));
      // Si una mata quedó a trasmano (agua, roca), se prueba la siguiente.
      const p = all[(window.__skip = (window.__skip || 0))] || all[0];
      g.player.spawn(p.pos.x + 0.6, p.pos.z + 0.6); g.cam.snap();
    });
    await page.waitForTimeout(2000);
    if (n === 0) check('El aviso dice que guardas la baya para la criatura', (await page.textContent('#prompt')).includes('Guardar la baya'), await page.textContent('#prompt'));
    const before = berries;
    await pressUntil(page, (b) => window.game.objectives.missions.flatMap((m) => m.list).find((o) => o.id === 'kiro_berries').progress > b, 4).catch(() => {});
    berries = await page.evaluate(() => window.game.objectives.missions.flatMap((m) => m.list).find((o) => o.id === 'kiro_berries').progress);
    if (berries === before) await page.evaluate(() => { window.__skip++; });
  }
  const hunger1 = await page.evaluate(() => window.game.survival.hunger);
  check('Recoges 3 bayas para la criatura', berries === 3, `${berries}/3`);
  check('Esas bayas no te las comes tú', hunger1 <= hunger0, `${hunger0} → ${hunger1.toFixed(1)}`);

  // 4. Dárselas: tarjeta con el collar K-1R0.
  await page.evaluate(() => { const g = window.game, k = g.story.kiro.position; g.player.spawn(k.x + 1.8, k.z + 0.5); g.player.facing = Math.atan2(-1.8, -0.5); g.cam.yaw = g.player.facing + Math.PI; g.cam.snap(); });
  await runStory(page, 1);
  await page.waitForTimeout(1500);
  const pf = await page.textContent('#prompt');
  check('Se ofrece darle las bayas', pf.includes('Ofrecerle las bayas'), pf);
  await pressUntil(page, () => !document.getElementById('story-card').classList.contains('hidden'));
  await page.screenshot({ path: `${SHOTS}/k2-tarjeta-kiro.png` });
  const card = await page.textContent('#story-card');
  check('Tarjeta «Un nuevo amigo: Kiro» con el collar K-1R0', card.includes('Kiro') && card.includes('K-1R0'), card.slice(0, 80));
  await page.evaluate(() => document.querySelector('#story-card button').click());
  await page.waitForTimeout(800);
  const fed = await page.evaluate(() => ({ mode: window.game.story.kiro.mode, items: window.game.session.save.specialItems, list: document.querySelector('#objective ul').textContent }));
  check('Kiro se hace tu amigo', fed.mode === 'friend' && fed.items.includes('kiro'), JSON.stringify(fed));

  // 5. Te sigue.
  await page.evaluate(() => { const g = window.game, p = g.player.position; g.player.spawn(p.x + 12, p.z + 3); });
  const far = await kiroDist(page);
  await runStory(page, 8);
  const near = await kiroDist(page);
  check('Kiro te sigue', far > 8 && near < 4, `${far.toFixed(1)} m → ${near.toFixed(1)} m`);
  await page.evaluate(() => { const g = window.game; g.cam.yaw = g.player.facing + Math.PI * 0.75; g.cam.snap(); });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${SHOTS}/k3-kiro-te-sigue.png` });
  const tele = await page.evaluate(() => { const g = window.game, p = g.player.position; g.player.spawn(p.x + 60, p.z); return true; });
  await runStory(page, 0.5);
  const tdist = await kiroDist(page);
  check('Si te alejas mucho, Kiro te alcanza', tele && tdist < 6, `${tdist.toFixed(1)} m`);

  // 6. Avisa de depredadores.
  const warn = await page.evaluate(async () => {
    const g = window.game, d = g.dinos.find((x) => x.cfg.reaction === 'hunt' && !x.down);
    const back = g.player.position.clone();
    g.player.spawn(d.position.x + 20, d.position.z + 5);
    g.story.kiro.catchUp();
    g.hud.toast('');
    for (let i = 0; i < 20; i++) g.story.update(0.05, 0, false);
    await new Promise((r) => setTimeout(r, 300));
    const txt = document.getElementById('toasts').textContent;
    g.player.spawn(back.x, back.z); g.story.kiro.catchUp(); g.cam.snap();
    return { txt: txt.slice(-160), name: d.cfg.name };
  });
  check('Kiro chilla cuando hay un depredador cerca', warn.txt.includes('Kiro chilla'), JSON.stringify(warn));

  // 6b. Modelo animado y orden de ataque.
  check('Kiro usa el raptor animado', await page.evaluate(() => !!window.game.story.kiro.dino.rig.clips));
  await page.evaluate(() => { const g = window.game, p = g.player.position; g.story.kiro.catchUp(); g.player.facing = 0; g.cam.yaw = Math.PI * 0.8; g.cam.distance = 4; g.cam.snap(); });
  await runStory(page, 1);
  await page.waitForTimeout(2000);
  await page.screenshot({ path: `${SHOTS}/k5-kiro-raptor.png` });
  const atk = await page.evaluate(async () => {
    const g = window.game, d = g.dinos.find((x) => x.cfg.name === 'Triceratops' && !x.down);
    const back = g.player.position.clone();
    g.player.spawn(d.position.x + 12, d.position.z + 4);
    g.story.kiro.catchUp();
    g.input.press('kiro');
    await new Promise((r) => setTimeout(r, 1200));
    const ordered = g.story.kiro.attacking;
    const t = g.story.kiro.target || d, hp0 = t.hp;
    for (let i = 0; i < 200 && !t.down && t.hp === hp0; i++) { g.story.update(0.05, 0, false); t.placeAt(t.position.x, t.position.z, t.heading); }
    const k = g.story.kiro.position;
    const res = { ordered, name: t.cfg.name, hp0, hp: t.hp, kd: Math.hypot(k.x - t.position.x, k.z - t.position.z).toFixed(1), toast: document.getElementById('toasts').textContent.slice(-120) };
    g.story.kiro.orderAttack(); if (g.story.kiro.attacking) g.story.kiro.orderAttack();
    g.player.spawn(back.x, back.z); g.story.kiro.catchUp(); g.cam.snap();
    return res;
  });
  check('Con la orden, Kiro ataca al dinosaurio más cercano', atk.ordered && atk.hp < atk.hp0, JSON.stringify(atk));
  check('El botón 🦖 aparece cuando Kiro es tu amigo', await page.evaluate(() => !document.getElementById('btn-kiro').classList.contains('hidden')));

  // 7. Llevarlo al refugio.
  await page.evaluate(() => { const g = window.game, s = g.buildings.shelters[0], p = s.inside(); g.player.spawn(p.x, p.z); g.story.kiro.catchUp(); g.cam.snap(); });
  await runStory(page, 1.5);
  await page.waitForTimeout(1500);
  const home = await page.evaluate(() => ({ f: window.game.story.has('kiro_home'), mission: window.game.objectives.current?.id, title: document.querySelector('#objective h3').textContent }));
  check('Al llegar al refugio termina el capítulo 2', home.f && home.mission === 'fragmentos', JSON.stringify(home));
  await page.screenshot({ path: `${SHOTS}/k4-kiro-refugio.png` });

  // 8. Guardado.
  await page.evaluate(() => window.game.setPaused(true));
  await page.waitForTimeout(1500);
  await ctx.close();
  ({ ctx, page } = await open(dir));
  await page.click('#btn-continue >> visible=true');
  await page.waitForFunction(() => window.game.playing === true, null, { timeout: 60000 });
  await page.waitForTimeout(3000);
  const back = await page.evaluate(() => ({ mode: window.game.story.kiro?.mode, mission: window.game.objectives.current?.id, flags: window.game.story.state.flags }));
  const bd = await kiroDist(page);
  check('Al volver a jugar, Kiro sigue contigo', back.mode === 'friend' && back.mission === 'fragmentos' && bd < 6, JSON.stringify(back) + ` ${bd.toFixed(1)} m`);
  check('Sin errores en la consola', page.errors.length === 0, page.errors.slice(0, 3).join(' | '));
  await ctx.close();

  const ok = results.filter((r) => r.ok).length;
  console.log(`\n${ok}/${results.length} pruebas superadas. Capturas en ${SHOTS}`);
  process.exit(ok === results.length ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1); });
