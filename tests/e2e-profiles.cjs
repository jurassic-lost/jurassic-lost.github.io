// Prueba automática del sistema de perfiles y guardado (Playwright + Chromium).
// Uso: npm run dev  (en otra terminal)  y luego  node tests/e2e-profiles.cjs [url]
// Usa un perfil de navegador persistente para comprobar que el progreso sobrevive al cierre.
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

async function open(dir, opts = {}) {
  const ctx = await chromium.launchPersistentContext(dir, { args: ARGS, viewport: { width: 1280, height: 760 }, ...opts });
  const page = ctx.pages()[0] || await ctx.newPage();
  page.errors = [];
  page.on('pageerror', (e) => page.errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') page.errors.push(m.text().slice(0, 200)); });
  await page.goto(URL);
  // Calidad baja: el navegador de pruebas no tiene GPU.
  await page.evaluate(() => localStorage.setItem('jurassic-lost-settings-v1', JSON.stringify({ quality: 'low' })));
  await page.reload();
  await page.waitForSelector('#menu-buttons:not(.hidden)', { timeout: 120000 });
  return { ctx, page };
}

async function createProfile(page, name, character, picks) {
  await page.click('#btn-new');
  await page.waitForSelector('#menu-creator:not(.hidden)');
  await page.click(`#cr-char button[data-v=${character}]`);
  await page.locator('#cr-hair button').nth(picks.hair).click();
  await page.locator('#cr-skin button').nth(picks.skin).click();
  await page.locator('#cr-hair-color button').nth(picks.hairColor).click();
  await page.locator('#cr-shirt button').nth(picks.shirt).click();
  await page.locator('#cr-pants button').nth(picks.pants).click();
  await page.fill('#cr-name', name);
  await page.click('#cr-confirm');
  await page.waitForTimeout(400);
}

async function startAndSkipIntro(page, button = '#cr-start, #btn-continue >> visible=true') {
  if (button) await page.click(button);
  // Espera a que empiece la introducción (partida nueva) o el juego (partida guardada).
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

const inv = (page) => page.evaluate(() => window.game.inventory.toJSON());
const pos = (page) => page.evaluate(() => { const p = window.game.player.position; return [p.x, p.z]; });

(async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'jl-profile-'));
  let { ctx, page } = await open(dir);

  // 1-6. Perfil de niño, nombres rechazados y aceptados, personalización.
  await page.click('#btn-new');
  for (const bad of ['p3nd3j0', 'Admin', 'f_u_c_k', 'Rex_5551234567', 'ab']) {
    await page.fill('#cr-name', bad);
    const msg = await page.textContent('#cr-name-msg');
    check(`Rechaza el nombre "${bad}"`, msg.startsWith('⚠️'), msg);
  }
  await page.click('#cr-back');
  await createProfile(page, 'Dino_Max', 'boy', { hair: 0, skin: 3, hairColor: 0, shirt: 2, pants: 3 });
  check('Acepta el nombre "Dino_Max"', (await page.textContent('#cr-name-msg')).startsWith('✅'));
  check('Guarda el perfil de niño', (await page.textContent('#cr-status')).includes('guardado'));
  await page.screenshot({ path: `${SHOTS}/1-creador-nino.png` });

  // 7-9. Iniciar, recoger materiales, guardar.
  await startAndSkipIntro(page);
  const app1 = await page.evaluate(() => window.game.player.model.currentAppearance);
  check('El personaje del juego usa la apariencia elegida', app1.character === 'boy' && app1.hairStyle === 'corto' && app1.shirt === '#6fae3c', JSON.stringify(app1));
  await collect(page, 'wood', 3);
  await collect(page, 'stone', 2);
  const inv1 = await inv(page);
  check('Recolecta materiales', inv1.wood === 3 && inv1.stone === 2, JSON.stringify(inv1));
  await page.evaluate(() => window.game.setPaused(true));
  await page.waitForTimeout(800);
  const pos1 = await pos(page);
  const obj1 = await page.evaluate(() => window.game.objectives.progressMap());
  await page.screenshot({ path: `${SHOTS}/2-jugando-nino.png` });
  await ctx.close();

  // 10-11. Cerrar y abrir el navegador: recuperar el progreso.
  ({ ctx, page } = await open(dir));
  const welcome = await page.textContent('#welcome');
  check('Muestra BIENVENIDO DE NUEVO con el nombre', welcome.includes('BIENVENIDO DE NUEVO') && welcome.includes('Dino_Max'), welcome.replace(/\s+/g, ' ').slice(0, 160));
  await page.screenshot({ path: `${SHOTS}/3-bienvenida.png` });
  await startAndSkipIntro(page);
  const inv2 = await inv(page);
  const pos2 = await pos(page);
  check('Recupera el inventario sin duplicar', JSON.stringify(inv2) === JSON.stringify(inv1), JSON.stringify(inv2));
  check('Recupera la posición', Math.hypot(pos2[0] - pos1[0], pos2[1] - pos1[1]) < 1.5, `${pos1.map((v) => v.toFixed(1))} → ${pos2.map((v) => v.toFixed(1))}`);
  const obj2 = await page.evaluate(() => window.game.objectives.progressMap());
  check('Recupera los objetivos de la misión', JSON.stringify(obj2) === JSON.stringify(obj1), JSON.stringify(obj2));

  // Salir al menú y crear un segundo perfil (niña).
  await page.evaluate(() => window.game.setPaused(true));
  await page.click('#btn-exit');
  await page.waitForSelector('#menu-buttons:not(.hidden)', { timeout: 120000 });
  await createProfile(page, 'Luna_Rex', 'girl', { hair: 2, skin: 1, hairColor: 4, shirt: 4, pants: 1 });
  check('Guarda el perfil de niña', (await page.textContent('#cr-status')).includes('guardado'));
  await page.screenshot({ path: `${SHOTS}/4-creador-nina.png` });
  await startAndSkipIntro(page);
  const inv3 = await inv(page);
  check('La partida nueva de Luna_Rex no tiene materiales de Dino_Max', !inv3.wood && !inv3.stone, JSON.stringify(inv3));
  await collect(page, 'fiber', 2);
  await page.evaluate(() => window.game.setPaused(true));
  await page.waitForTimeout(600);
  await page.click('#btn-exit');
  await page.waitForSelector('#menu-buttons:not(.hidden)', { timeout: 120000 });
  const slots = await page.locator('#profile-slots .pslot b').allTextContents();
  check('Muestra los perfiles en el menú', slots.some((s) => s.includes('Dino_Max')) && slots.some((s) => s.includes('Luna_Rex')), slots.join(' | '));
  await page.screenshot({ path: `${SHOTS}/5-menu-dos-perfiles.png` });

  // 13. Las partidas están separadas.
  await page.locator('#profile-slots .pslot', { hasText: 'Dino_Max' }).click();
  await startAndSkipIntro(page);
  const inv4 = await inv(page);
  check('Dino_Max conserva su inventario y no recibe la fibra de Luna_Rex', inv4.wood === 3 && inv4.stone === 2 && !inv4.fiber, JSON.stringify(inv4));

  // Posición insegura: se usa el último punto seguro.
  await page.evaluate(async () => { const g = window.game; g.session.save.world.lastSafe = [2, 10]; });
  await page.evaluate(() => window.game.setPaused(true));
  await page.waitForTimeout(500);
  await page.evaluate(async () => {
    // Simula una partida guardada dentro del lago.
    const g = window.game; const s = structuredClone(g.session.save);
    s.world.pos = [34, 0, 66]; s.revision += 1;
    await new Promise((res, rej) => { const r = indexedDB.open('jurassic-lost'); r.onsuccess = () => { const t = r.result.transaction('saves', 'readwrite'); t.objectStore('saves').put(s, s.profileId + ':current'); t.oncomplete = res; t.onerror = rej; }; });
  });
  await page.reload();
  await page.waitForSelector('#menu-buttons:not(.hidden)', { timeout: 120000 });
  await startAndSkipIntro(page);
  const pos5 = await pos(page);
  check('Si la posición guardada está en el agua, aparece en el último punto seguro', Math.hypot(pos5[0] - 2, pos5[1] - 10) < 1.5, pos5.map((v) => v.toFixed(1)).join(','));

  // Recuperación: si la copia actual está dañada, se usa la copia anterior.
  await page.evaluate(async () => {
    const id = window.game.session.profile.id;
    await new Promise((res, rej) => { const r = indexedDB.open('jurassic-lost'); r.onsuccess = () => { const t = r.result.transaction('saves', 'readwrite'); t.objectStore('saves').put({ roto: true }, id + ':current'); t.oncomplete = res; t.onerror = rej; }; });
  });
  await page.reload();
  await page.waitForSelector('#menu-buttons:not(.hidden)', { timeout: 120000 });
  await startAndSkipIntro(page);
  const inv6 = await inv(page);
  check('Con la copia actual dañada se recupera la copia anterior', inv6.wood === 3 && inv6.stone === 2, JSON.stringify(inv6));

  // Configuración guardada por perfil.
  await page.evaluate(() => window.game.setPaused(true));
  await page.click('#btn-pause-settings');
  await page.locator('#set-large').check();
  await page.click('#set-back');
  await page.waitForTimeout(300);
  await page.click('#btn-stats');
  const stats = await page.textContent('#stats-body');
  check('Panel de estadísticas del explorador', stats.includes('Dino_Max') && stats.includes('Nivel') && stats.includes('Kiro'), stats.replace(/\s+/g, ' ').slice(0, 200));
  await page.screenshot({ path: `${SHOTS}/6-estadisticas.png` });
  await page.click('#stats-back');
  await page.click('#btn-exit');
  await page.waitForSelector('#menu-buttons:not(.hidden)', { timeout: 120000 });
  const large = await page.evaluate(async () => (await (await import('/src/profile/persistence.ts')).createPersistence()).service.listProfiles().then((ps) => ps.find((p) => p.displayName === 'Dino_Max').settings.largeText));
  check('La preferencia "texto grande" queda guardada en el perfil', large === true);

  // Borrado protegido.
  await page.locator('#profile-slots .pslot', { hasText: 'Luna_Rex' }).locator('.del').click();
  const disabled = await page.isDisabled('#del-confirm');
  await page.fill('#del-input', 'Luna_Re');
  const stillDisabled = await page.isDisabled('#del-confirm');
  await page.fill('#del-input', 'Luna_Rex');
  await page.click('#del-confirm');
  await page.waitForTimeout(500);
  const slots2 = await page.locator('#profile-slots .pslot b').allTextContents();
  check('Borrar exige escribir el nombre exacto', disabled && stillDisabled && !slots2.some((s) => s.includes('Luna_Rex')), slots2.join(' | '));
  const errs = page.errors.slice();
  await ctx.close();

  // 18. Móvil: menú y controles táctiles.
  const mdir = fs.mkdtempSync(path.join(os.tmpdir(), 'jl-mobile-'));
  ({ ctx, page } = await open(mdir, { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }));
  await page.screenshot({ path: `${SHOTS}/7-movil-menu.png` });
  await page.tap('#btn-new');
  await page.waitForSelector('#menu-creator:not(.hidden)');
  await page.fill('#cr-name', 'Rex_Movil');
  await page.locator('#cr-char button[data-v=girl]').tap();
  await page.screenshot({ path: `${SHOTS}/8-movil-creador.png` });
  await page.locator('#cr-start').tap();
  await startAndSkipIntro(page, null);
  const touchVisible = await page.isVisible('#joystick');
  const p0 = await pos(page);
  const box = await page.locator('#joystick').boundingBox();
  const cdp = await ctx.newCDPSession(page);
  const cx = box.x + box.width / 2, cy = box.y + box.height / 2;
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: cx, y: cy }] });
  for (let i = 1; i <= 6; i++) { await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: cx, y: cy - i * 8 }] }); await page.waitForTimeout(60); }
  await page.waitForTimeout(1500);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  const p1 = await pos(page);
  await page.screenshot({ path: `${SHOTS}/9-movil-juego.png` });
  check('Controles táctiles visibles y el joystick mueve al personaje', touchVisible && Math.hypot(p1[0] - p0[0], p1[1] - p0[1]) > 1, `movió ${Math.hypot(p1[0] - p0[0], p1[1] - p0[1]).toFixed(1)} m`);
  errs.push(...page.errors);
  await ctx.close();

  check('Sin errores de JavaScript', errs.length === 0, errs.slice(0, 3).join(' | '));
  const failed = results.filter((r) => !r.ok).length;
  console.log(`\n${results.length - failed}/${results.length} comprobaciones correctas. Capturas en ${SHOTS}`);
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
