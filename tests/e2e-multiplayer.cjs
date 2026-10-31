// Prueba automática de «Jugar con amigos»: tres navegadores en la misma isla.
// Arranca su propio servidor de salas (PeerJS) en el puerto 9000, así no necesita internet.
// Uso: npm run dev  (en otra terminal)  y luego  node tests/e2e-multiplayer.cjs [url]
const { chromium } = require('playwright');
const { ExpressPeerServer } = require('peer');
const express = require('express');
const fs = require('fs');
const os = require('os');
const path = require('path');

const BASE = process.argv[2] || 'http://localhost:5173/';
const URL = BASE + (BASE.includes('?') ? '&' : '?') + 'peer=127.0.0.1:9000';
const SHOTS = process.env.SHOTS || path.join(os.tmpdir(), 'jl-shots');
fs.mkdirSync(SHOTS, { recursive: true });
const ARGS = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--disable-features=WebRtcHideLocalIpsWithMdns'];
const results = [];
const check = (name, ok, extra = '') => { results.push({ name, ok }); console.log(`${ok ? 'OK  ' : 'FALLA'} ${name}${extra ? ' — ' + extra : ''}`); };

async function player(name, look) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'jl-mp-'));
  const ctx = await chromium.launchPersistentContext(dir, { args: ARGS, viewport: { width: 1000, height: 640 } });
  const page = ctx.pages()[0] || await ctx.newPage();
  page.errors = [];
  page.on('pageerror', (e) => page.errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/WebSocket|ERR_|favicon|peer/i.test(m.text())) page.errors.push(m.text().slice(0, 200)); });
  await page.goto(URL);
  await page.evaluate(() => localStorage.setItem('jurassic-lost-settings-v1', JSON.stringify({ quality: 'low' })));
  await page.reload();
  await page.waitForSelector('#menu-buttons:not(.hidden)', { timeout: 180000 });
  await page.click('#btn-new');
  await page.waitForSelector('#menu-creator:not(.hidden)');
  await page.fill('#cr-name', name);
  if (look) await page.click(`#cr-char [data-v="${look}"]`);
  await page.click('#cr-confirm');
  await page.waitForTimeout(400);
  await page.click('#cr-start');
  await page.waitForFunction(() => !document.getElementById('intro').classList.contains('hidden') || window.game.playing, null, { timeout: 60000 });
  await page.waitForTimeout(1500);
  if (await page.isVisible('#intro-skip')) await page.evaluate(() => document.getElementById('intro-skip').click());
  await page.waitForFunction(() => window.game.playing === true, null, { timeout: 90000 });
  await page.waitForTimeout(800);
  // Guarda los avisos (los toasts desaparecen antes de que la prueba los mire).
  await page.evaluate(() => { const mp = window.game.mp, o = mp.onNotice; window.__notices = []; mp.onNotice = (t) => { window.__notices.push(t); o(t); }; });
  return { ctx, page, name };
}

const openFriends = (page) => page.evaluate(() => { window.game.setPaused(true); document.getElementById('btn-friends').click(); });
const backToGame = (page) => page.evaluate(() => { document.getElementById('mp-back').click(); window.game.setPaused(false); });
const remotes = (page) => page.evaluate(() => [...window.game.mp.players.values()].map((p) => ({
  name: p.info.name, x: p.position.x, z: p.position.z, visible: p.model.root.visible, weapon: p.weapon, busy: p.model.busy,
  shirt: p.info.look.shirt, char: p.info.look.character,
})));
const waitFor = async (page, fn, arg, ms = 60000) => { try { await page.waitForFunction(fn, arg, { timeout: ms, polling: 250 }); return true; } catch { return false; } };

(async () => {
  const app = express();
  const server = await new Promise((r) => { const s = app.listen(9000, '127.0.0.1', () => r(s)); });
  app.use('/', ExpressPeerServer(server, { path: '/' }));
  const [A, B] = await Promise.all([player('Ana_Exploradora', 'girl'), player('Beto_Dino', 'boy')]);

  // 1. Ana crea una sala.
  await openFriends(A.page);
  await A.page.click('#mp-host');
  const hosted = await waitFor(A.page, () => window.game.mp.state === 'host');
  const code = await A.page.textContent('#mp-room');
  check('Se crea una sala con un código de 5 letras', hosted && /^[A-Z2-9]{5}$/.test(code), code);
  await A.page.screenshot({ path: `${SHOTS}/mp1-sala-creada.png` });
  await backToGame(A.page);
  check('El HUD muestra la sala y cuántos hay', await A.page.isVisible('#mp-badge') && (await A.page.textContent('#mp-badge')).includes(code), await A.page.textContent('#mp-badge'));

  // 2. Un código que no existe da un mensaje claro.
  await openFriends(B.page);
  await B.page.fill('#mp-code', 'ZZZZZ');
  await B.page.click('#mp-join');
  await waitFor(B.page, () => /No encontramos/.test(document.getElementById('mp-status').textContent), null, 40000);
  check('Un código equivocado avisa que no existe la sala', /No encontramos/.test(await B.page.textContent('#mp-status')), await B.page.textContent('#mp-status'));

  // 3. Beto entra con el código (en minúsculas, también vale).
  await B.page.fill('#mp-code', code.toLowerCase());
  await B.page.click('#mp-join');
  const joined = await waitFor(B.page, () => window.game.mp.state === 'guest' && window.game.mp.players.size === 1);
  check('Beto entra en la sala con el código', joined, await B.page.textContent('#mp-status'));
  await B.page.screenshot({ path: `${SHOTS}/mp2-unido.png` });
  await backToGame(B.page);
  const seesB = await waitFor(A.page, () => window.game.mp.players.size === 1 && [...window.game.mp.players.values()][0].model.root.visible);
  const ra = await remotes(A.page), rb = await remotes(B.page);
  check('Ana ve a Beto en su isla', seesB && ra[0]?.name === 'Beto_Dino', JSON.stringify(ra[0]));
  check('Beto ve a Ana en su isla', rb[0]?.name === 'Ana_Exploradora' && rb[0].visible, JSON.stringify(rb[0]));
  check('Cada uno se ve con su aspecto (niño / niña)', ra[0]?.char === 'boy' && rb[0]?.char === 'girl');
  check('Llega el aviso «llegó a la isla»', await A.page.evaluate(() => window.__notices.some((t) => t.includes('Beto_Dino llegó'))));

  // 4. Beto camina hasta un punto: Ana lo ve llegar allí.
  const target = await A.page.evaluate(() => { const p = window.game.player.position; return { x: p.x + 4, z: p.z + 3 }; });
  await B.page.evaluate((t) => { window.game.player.spawn(t.x, t.z); window.game.player.facing = 1.2; }, target);
  const moved = await waitFor(A.page, (t) => { const p = [...window.game.mp.players.values()][0]; return p && Math.hypot(p.position.x - t.x, p.position.z - t.z) < 0.6; }, target);
  const rpos = (await remotes(A.page))[0];
  check('Ana ve a Beto moverse a donde está de verdad', moved, `objetivo ${target.x.toFixed(1)},${target.z.toFixed(1)} → visto ${rpos.x.toFixed(1)},${rpos.z.toFixed(1)}`);
  // Ana mira hacia Beto para la captura.
  await A.page.evaluate((t) => { const g = window.game, p = g.player.position; g.cam.yaw = Math.atan2(t.x - p.x, t.z - p.z) + Math.PI; g.cam.snap(); }, target);
  await A.page.waitForTimeout(2500);
  await A.page.screenshot({ path: `${SHOTS}/mp3-ana-ve-a-beto.png` });

  // 5. Arma en la mano y acciones (recoger).
  await B.page.evaluate(() => { window.game.hotbar.selected = 'club'; window.game.player.model.playPickup(); });
  const armed = await waitFor(A.page, () => [...window.game.mp.players.values()][0].weapon === 'club');
  check('Ana ve el arma que lleva Beto', armed);
  const acted = await A.page.evaluate(async () => {
    const p = [...window.game.mp.players.values()][0];
    for (let i = 0; i < 40 && !p.model.busy; i++) await new Promise((r) => setTimeout(r, 100));
    return p.model.busy || p.model.pickT >= 0;
  });
  await B.page.evaluate(() => window.game.player.model.playPickup());
  const acted2 = acted || await waitFor(A.page, () => [...window.game.mp.players.values()][0].model.busy, null, 8000);
  check('Ana ve la animación de recoger de Beto', acted2);

  // 6. En el minimapa sale el amigo.
  check('El amigo aparece en el minimapa', await A.page.evaluate(() => window.game.mp.markers().length === 1));

  // 7. Llega un tercero: todos se ven entre todos (el anfitrión reparte los mensajes).
  // Cami entra como lo haría un niño: menú principal → 🌍 Mundo abierto (se abre la pantalla de salas).
  const C = await player('Cami_Raptor', 'girl');
  check('En el modo historia no aparece «Jugar con amigos»', await C.page.evaluate(() => document.getElementById('btn-friends').classList.contains('hidden')));
  const storyPos = await C.page.evaluate(async () => { window.game.player.spawn(20, 30); await window.game.save('exit'); return window.game.session.save.world.pos; });
  await C.page.reload();
  await C.page.waitForSelector('#btn-open-world:not(.hidden)', { timeout: 180000 });
  await C.page.click('#btn-open-world');
  const autoOpen = await waitFor(C.page, () => window.game?.playing && !document.getElementById('mp-screen').classList.contains('hidden'), null, 90000);
  check('🌍 Mundo abierto empieza sin introducción y abre las salas', autoOpen && await C.page.evaluate(() => window.game.mode === 'abierto' && document.getElementById('objective').classList.contains('hidden')));
  await C.page.evaluate(() => { const mp = window.game.mp, o = mp.onNotice; window.__notices = []; mp.onNotice = (t) => { window.__notices.push(t); o(t); }; });
  await C.page.fill('#mp-code', code);
  await C.page.click('#mp-join');
  const cIn = await waitFor(C.page, () => window.game.mp.players.size === 2);
  await backToGame(C.page);
  const bSeesC = await waitFor(B.page, () => [...window.game.mp.players.values()].some((p) => p.info.name === 'Cami_Raptor' && p.model.root.visible));
  const cSeesB = await waitFor(C.page, () => [...window.game.mp.players.values()].some((p) => p.info.name === 'Beto_Dino' && p.model.root.visible));
  check('Con 3 jugadores, todos se ven entre sí', cIn && bSeesC && cSeesB && (await remotes(A.page)).length === 2, JSON.stringify((await remotes(C.page)).map((r) => r.name)));
  check('El HUD dice 3 jugadores', (await A.page.textContent('#mp-badge')).includes('3/6'), await A.page.textContent('#mp-badge'));

  // 8. Equipos: Ana y Cami (verde) contra Beto (naranja), equipos parejos al entrar.
  const teams = await Promise.all([A, B, C].map((p) => p.page.evaluate(() => window.game.mp.team)));
  check('Los equipos se reparten parejos al entrar', teams.join() === 'verde,naranja,verde', teams.join());
  const aSees = await A.page.evaluate(() => Object.fromEntries([...window.game.mp.players.values()].map((p) => [p.info.name, p.team])));
  check('Todos ven el equipo de los demás', aSees.Beto_Dino === 'naranja' && aSees.Cami_Raptor === 'verde', JSON.stringify(aSees));

  // Pone a un jugador junto a otro, mirándolo, y ataca (con la mano).
  const strike = async (att, victimName) => att.page.evaluate(async (vn) => {
    const g = window.game, v = [...g.mp.players.values()].find((p) => p.info.name === vn);
    const f = new (g.player.position.constructor)();
    let best = 0, bestDot = -2;
    const dx = v.position.x - g.player.position.x, dz = v.position.z - g.player.position.z, l = Math.hypot(dx, dz) || 1;
    for (let i = 0; i < 72; i++) { g.cam.yaw = (i / 72) * Math.PI * 2; g.cam.forward(f); const d = (f.x * dx + f.z * dz) / l; if (d > bestDot) { bestDot = d; best = g.cam.yaw; } }
    g.cam.yaw = best;
    g.weaponCd = 0;
    g.player.model.attackT = -1;
    g.player.model.pickT = -1;
    g.hotbar.selected = 'hand';
    g.attack();
  }, victimName);
  const near = (att, victim) => att.page.evaluate(async (vn) => {
    const g = window.game, v = [...g.mp.players.values()].find((p) => p.info.name === vn);
    g.player.spawn(v.position.x + 0.5, v.position.z + 0.3);
  }, victim.name);
  // Ana se queda quieta en un sitio sin refugio.
  await A.page.evaluate(() => { window.game.inventory.add('wood', 8); window.game.player.spawn(6, 14); });
  await waitFor(C.page, () => { const a = [...window.game.mp.players.values()].find((p) => p.info.name === 'Ana_Exploradora'); return a && Math.hypot(a.position.x - 6, a.position.z - 14) < 0.5; });
  await waitFor(B.page, () => { const a = [...window.game.mp.players.values()].find((p) => p.info.name === 'Ana_Exploradora'); return a && Math.hypot(a.position.x - 6, a.position.z - 14) < 0.5; });

  // Fuego amigo: Cami (verde) golpea a Ana (verde) y no pasa nada.
  await near(C, A);
  await C.page.waitForTimeout(1500);
  await strike(C, 'Ana_Exploradora');
  await A.page.waitForTimeout(3000);
  check('A los de tu equipo no les haces daño', (await A.page.evaluate(() => window.game.pvpHits)) === 0);

  // Beto (naranja) golpea a Ana tres veces: la atrapa y su equipo gana un punto.
  await near(B, A);
  await B.page.waitForTimeout(1500);
  await strike(B, 'Ana_Exploradora');
  const hit1 = await waitFor(A.page, () => window.game.pvpHits === 1, null, 20000);
  check('Un rival te golpea (1/3) sin quitarte salud', hit1 && (await A.page.evaluate(() => window.game.survival.health)) >= 99, `golpes ${await A.page.evaluate(() => window.game.pvpHits)}`);
  const invBefore = await A.page.evaluate(() => JSON.stringify([...window.game.inventory.counts]));
  await A.page.evaluate(() => window.game.player.spawn(6, 14));
  await strike(B, 'Ana_Exploradora');
  await waitFor(A.page, () => window.game.pvpHits === 2, null, 20000);
  await A.page.evaluate(() => window.game.player.spawn(6, 14));
  await strike(B, 'Ana_Exploradora');
  const caught = await waitFor(A.page, () => window.__notices.some((t) => t.includes('atrapó a Ana')), null, 20000);
  check('Al tercer golpe te atrapan y vuelves al refugio o al claro', caught && (await A.page.evaluate(() => window.game.pvpHits === 0 && window.game.pvpSafe > 0)));
  check('No pierdes materiales cuando te atrapan', invBefore === await A.page.evaluate(() => JSON.stringify([...window.game.inventory.counts])));
  const scoreSeen = await waitFor(C.page, () => window.game.mp.score.naranja === 1, null, 20000) && await waitFor(B.page, () => window.game.mp.score.naranja === 1, null, 20000);
  check('El marcador sube para el equipo naranja en todos', scoreSeen && (await A.page.textContent('#mp-badge')).includes('0 – 1'), await A.page.textContent('#mp-badge'));
  await A.page.screenshot({ path: `${SHOTS}/mp4-atrapada.png` });

  // Cambio de equipo desde el menú.
  await openFriends(C.page);
  await C.page.screenshot({ path: `${SHOTS}/mp5-equipos.png` });
  await C.page.click('.mp-team.naranja button');
  const switched = await waitFor(A.page, () => [...window.game.mp.players.values()].find((p) => p.info.name === 'Cami_Raptor')?.team === 'naranja');
  check('Puedes cambiarte al otro equipo si hay sitio', switched && await waitFor(C.page, () => window.game.mp.team === 'naranja', null, 20000));
  await C.page.screenshot({ path: `${SHOTS}/mp6-cambio-equipo.png` });
  await backToGame(C.page);

  // 9. La partida guardada de cada uno sigue siendo suya.
  const saves = await Promise.all([A, B, C].map((p) => p.page.evaluate(async () => { await window.game.save('pause'); return window.game.session.profile.displayName; })));
  check('Cada uno sigue con su propio perfil y partida', saves.join() === 'Ana_Exploradora,Beto_Dino,Cami_Raptor', saves.join());

  // La partida del mundo abierto va aparte: la de la historia de Cami sigue igual.
  const sep = await C.page.evaluate(async () => {
    const g = window.game; await g.save('pause');
    const req = indexedDB.open('jurassic-lost');
    const db = await new Promise((r) => { req.onsuccess = () => r(req.result); });
    const get = (k) => new Promise((r) => { const q = db.transaction('saves').objectStore('saves').get(k); q.onsuccess = () => r(q.result); });
    const id = g.session.profile.id;
    const story = await get(id + ':current'), open = await get(id + '~abierto:current');
    return { story: story?.world.pos, open: !!open, openId: g.session.save.profileId };
  });
  check('El mundo abierto se guarda aparte y no cambia la partida de la historia', sep.open && sep.openId.endsWith('~abierto') && JSON.stringify(sep.story) === JSON.stringify(storyPos), JSON.stringify(sep));

  // 10. Beto sale: desaparece para los demás.
  await openFriends(B.page);
  await B.page.click('#mp-leave');
  await backToGame(B.page);
  const gone = await waitFor(A.page, () => window.game.mp.players.size === 1) && await waitFor(C.page, () => window.game.mp.players.size === 1);
  check('Cuando alguien sale, desaparece para los demás', gone && (await B.page.evaluate(() => window.game.mp.players.size)) === 0);

  // 11. Ana (la anfitriona) cierra la sala: Cami recibe el aviso.
  await A.page.evaluate(() => window.game.mp.leave());
  const closed = await waitFor(C.page, () => window.game.mp.state === 'off');
  check('Si la anfitriona sale, la sala se cierra con aviso', closed && await C.page.evaluate(() => window.__notices.some((t) => t.includes('sala se cerró'))));

  for (const p of [A, B, C]) check(`Sin errores en la página de ${p.name}`, p.page.errors.length === 0, p.page.errors.slice(0, 3).join(' | '));
  for (const p of [A, B, C]) await p.ctx.close();
  server.close?.();
  const bad = results.filter((r) => !r.ok).length;
  console.log(`\n${results.length - bad}/${results.length} pruebas superadas`);
  process.exit(bad ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
