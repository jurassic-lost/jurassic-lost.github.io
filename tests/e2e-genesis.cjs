// Prueba automática del Proyecto Génesis (Fase 1) con Playwright + Chromium.
// Uso: npm run dev  (en otra terminal)  y luego  node tests/e2e-genesis.cjs [url]
// Comprueba: datos de diseño de misiones, inicio de la campaña, que la isla no se toca,
// guardado y reanudación tras recargar, y validación del estado guardado.
const { chromium } = require('playwright');
const fs = require('fs');
const os = require('os');
const path = require('path');

const URL = process.argv[2] || 'http://localhost:5173/';
const ARGS = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'];
const DESIGN = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'docs', 'genesis', 'data', 'missions.json'), 'utf8'));
const results = [];
const check = (name, ok, extra = '') => { results.push({ name, ok }); console.log(`${ok ? 'OK  ' : 'FALLA'} ${name}${extra ? ' — ' + extra : ''}`); };

// Lee las partidas guardadas de un perfil directamente de IndexedDB (texto exacto).
const readSaves = (page, id) => page.evaluate((id) => new Promise((res, rej) => {
  const r = indexedDB.open('jurassic-lost');
  r.onsuccess = () => {
    const out = {}; const keys = [`${id}:current`, `${id}:backup`, `${id}~abierto:current`, `${id}~genesis:current`];
    const st = r.result.transaction('saves').objectStore('saves');
    let n = keys.length;
    for (const k of keys) { const q = st.get(k); q.onsuccess = () => { out[k] = q.result === undefined ? null : JSON.stringify(q.result); if (--n === 0) { r.result.close(); res(out); } }; }
  };
  r.onerror = () => rej(r.error);
}), id);

async function toMenu(page) {
  await page.waitForSelector('#menu-buttons:not(.hidden)', { timeout: 180000 });
  await page.waitForTimeout(800);
}

async function startGenesis(page) {
  await page.evaluate(() => document.getElementById('btn-genesis').click());
  await page.waitForFunction(() => window.game?.genesis && window.game.playing, null, { timeout: 180000, polling: 500 });
  await page.waitForTimeout(1500);
}

(async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'jl-genesis-'));
  let ctx = await chromium.launchPersistentContext(dir, { args: ARGS, viewport: { width: 1280, height: 720 } });
  let page = ctx.pages()[0] || await ctx.newPage();
  const errors = [];
  const watch = (p) => { p.on('pageerror', (e) => errors.push(e.message)); p.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 200)); }); };
  watch(page);
  await page.goto(URL);
  await page.evaluate(() => localStorage.setItem('jurassic-lost-settings-v1', JSON.stringify({ quality: 'low' })));
  await page.reload();
  await toMenu(page);

  // 1) Las misiones del juego coinciden con el JSON de diseño (ids, requisitos y objetivos).
  const code = await page.evaluate(async () => (await import('/src/genesis/missions.ts')).GENESIS_MISSIONS);
  // La Fase 1 implementa M01–M05; el JSON ya trae M06–M10 para fases siguientes.
  const phase1 = DESIGN.missions.filter((m) => ['M01', 'M02', 'M03', 'M04', 'M05'].includes(m.id));
  const same = phase1.length === 5 && code.length === 5 && phase1.every((d, i) => {
    const c = code[i];
    return c.id === d.id && JSON.stringify(c.requires) === JSON.stringify(d.requires)
      && JSON.stringify(c.objectives.map((o) => o.id)) === JSON.stringify(d.objectives.map((o) => o.id));
  });
  check('Misiones M01–M05 iguales al diseño (docs/genesis/data/missions.json)', same);

  // 2) El estado guardado se valida: valores raros se descartan sin perder los buenos.
  const san = await page.evaluate(async () => {
    const { sanitizeGenesis } = await import('/src/genesis/state.ts');
    return [sanitizeGenesis(null), sanitizeGenesis({ v: 1, done: ['M01.walk_to_window', 7, '<x>'.repeat(99)], missions: ['M01'], taken: ['water', 'cohete'], lightsOff: 'si' })];
  });
  check('Estado vacío o dañado da un estado nuevo', Array.isArray(san[0].done) && san[0].done.length === 0);
  check('Estado mezclado conserva lo válido', san[1].done.length === 1 && san[1].missions[0] === 'M01' && san[1].taken.join() === 'water' && san[1].lightsOff === false,
    JSON.stringify(san[1]));

  // 3) Perfil con una partida de la isla (marcada) que la campaña nueva no debe tocar.
  await page.click('#btn-new');
  await page.waitForSelector('#menu-creator:not(.hidden)');
  await page.fill('#cr-name', 'Prueba_Genesis');
  await page.click('#cr-confirm'); await page.waitForTimeout(800);
  await page.evaluate(() => document.getElementById('cr-back')?.click()); await page.waitForTimeout(800);
  const pid = await page.evaluate(() => new Promise((res) => {
    const r = indexedDB.open('jurassic-lost');
    r.onsuccess = () => { const q = r.result.transaction('profiles').objectStore('profiles').getAll(); q.onsuccess = () => { r.result.close(); res(q.result.find((p) => p.displayName === 'Prueba_Genesis')?.id); }; };
  }));
  check('Perfil creado', !!pid);
  await page.evaluate(async (id) => {
    const { PlayerSession } = await import('/src/profile/session.ts');
    const s = PlayerSession.blank(id); s.inventory = { stick: 7 }; s.world.pos = [12, 0, -34]; s.savedAt = Date.now(); s.revision = 3;
    await new Promise((res, rej) => {
      const r = indexedDB.open('jurassic-lost');
      r.onsuccess = () => { const t = r.result.transaction('saves', 'readwrite'); t.objectStore('saves').put(s, `${id}:current`); t.oncomplete = () => { r.result.close(); res(); }; t.onerror = () => rej(t.error); };
    });
  }, pid);
  await page.reload(); await toMenu(page);
  const before = await readSaves(page, pid);
  check('Partida de la isla preparada', !!before[`${pid}:current`]);

  // 4) Arranca Génesis: introducción, se puede omitir, M01 activa, jugador en la ciudad.
  await startGenesis(page);
  const s1 = await page.evaluate(() => { const g = window.game, G = g.genesis; return { phase: G.phase, skip: !document.getElementById('gen-skip').classList.contains('hidden'), mode: g.session.mode }; });
  check('La introducción empieza al abrir Génesis', s1.phase === 'intro' && s1.mode === 'genesis', JSON.stringify(s1));
  check('Botón para omitir la introducción visible', s1.skip);
  await page.evaluate(() => document.getElementById('gen-skip').click());
  await page.waitForFunction(() => window.game.genesis.phase === 'play', null, { timeout: 60000, polling: 300 });
  const s2 = await page.evaluate(() => { const g = window.game, G = g.genesis; return { cur: G.current?.id, x: g.player.position.x, z: g.player.position.z, island: g.world?.group?.visible ?? null, panel: document.getElementById('objective')?.textContent ?? '' }; });
  check('Tras omitir: misión M01 activa', s2.cur === 'M01', JSON.stringify(s2).slice(0, 200));
  check('El jugador está en el barrio, no en la isla', s2.x > 1900 && s2.x < 2100, `x=${s2.x.toFixed(1)}`);

  // 5) Progreso simulado (M01–M03 hechas y el agua recogida), se guarda y se recarga la página.
  await page.evaluate(async () => {
    const G = window.game.genesis;
    G.st.done = ['M01.walk_to_window', 'M01.inspect_street', 'M02.move_from_window', 'M02.switch_off_lights', 'M02.enter_hide_spot',
      'M02.wait_until_creature_leaves', 'M03.receive_emergency_broadcast', 'M03.exit_house_safely', 'M04.collect_water'];
    G.st.missions = ['M01', 'M02', 'M03']; G.st.taken = ['water'];
    window.game.inventory.add('water_bottle', 1);
    G.begin();
    await window.game.save('mission');
  });
  await page.waitForTimeout(1500);
  const s3 = await page.evaluate(() => ({ cur: window.game.genesis.current?.id, camp: window.game.session.save.campaignId, world: window.game.session.save.worldId }));
  check('Al avanzar, la misión activa es M04', s3.cur === 'M04', JSON.stringify(s3));
  check('La partida se marca como campaña genesis_city', s3.camp === 'genesis_city' && s3.world === 'ciudad_sector_piloto');

  await page.reload(); await toMenu(page);
  await startGenesis(page);
  const s4 = await page.evaluate(() => { const g = window.game, G = g.genesis; return { phase: G.phase, cur: G.current?.id, done: G.st.done.length, water: G.city.pickups.get('water').visible, inv: g.inventory.get('water_bottle'), x: g.player.position.x, day: g.session.save.genesis?.v }; });
  check('Tras recargar: sigue en M04 con 9 objetivos hechos', s4.cur === 'M04' && s4.done === 9 && s4.phase === 'play', JSON.stringify(s4));
  check('Tras recargar: el agua recogida no reaparece y sigue en la mochila', s4.water === false && s4.inv >= 1);
  check('Tras recargar: el jugador aparece en el barrio', s4.x > 1900 && s4.x < 2100, `x=${s4.x.toFixed(1)}`);

  // 6) La partida de la isla quedó exactamente igual.
  await page.evaluate(() => window.game.save('exit'));
  const after = await readSaves(page, pid);
  check('Partida de la isla (Historia) sin cambios', after[`${pid}:current`] === before[`${pid}:current`]);
  check('Partida de Mundo abierto sin cambios', after[`${pid}~abierto:current`] === before[`${pid}~abierto:current`]);
  check('Génesis guardó en su propia clave', !!after[`${pid}~genesis:current`] && JSON.parse(after[`${pid}~genesis:current`]).campaignId === 'genesis_city');

  check('Sin errores en la consola', errors.length === 0, errors.slice(0, 3).join(' | '));
  await ctx.close();
  fs.rmSync(dir, { recursive: true, force: true });
  const bad = results.filter((r) => !r.ok).length;
  console.log(`\n${results.length - bad}/${results.length} comprobaciones correctas`);
  process.exit(bad ? 1 : 0);
})().catch((e) => { console.error('ERROR', e.message); process.exit(1); });
