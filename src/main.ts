import './ui/styles.css';
import { Game } from './core/Game';
import { loadSettings } from './core/Settings';
import { preloadProps } from './world/propModels';
import { preloadGlbModels } from './creatures/glbModels';
import { preloadQuatModels, quatErrors } from './creatures/quatModels';
import { preloadRiggedCharacters } from './player/RiggedModel';
import { createPersistence } from './profile/persistence';
import { PlayerSession } from './profile/session';
import { MainMenu } from './ui/MainMenu';
import { setupFriendsMenu } from './ui/FriendsMenu';

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;

async function boot() {
  const settings = loadSettings();
  if (!document.createElement('canvas').getContext('webgl2') && !document.createElement('canvas').getContext('webgl')) {
    $('loading').textContent = 'Tu navegador no admite WebGL, necesario para el juego.';
    return;
  }
  const [{ service, persistent }] = await Promise.all([createPersistence(), preloadGlbModels(), preloadQuatModels(), preloadRiggedCharacters(), preloadProps()]);
  const game = new Game($<HTMLCanvasElement>('game'), settings);
  (window as unknown as { game: Game }).game = game; // útil para depurar desde la consola
  // App instalable (GitHub Pages): solo en una web normal, no en la versión de un archivo.
  if ('serviceWorker' in navigator && location.protocol === 'https:' && !(window as unknown as { __GLB?: unknown }).__GLB) {
    navigator.serviceWorker.register('./sw.js', { updateViaCache: 'none' }).then((r) => r.update()).catch(() => {});
    // Cuando hay una versión nueva instalada, se recarga una vez para mostrarla.
    let reloaded = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (reloaded || !document.getElementById('hud')!.classList.contains('hidden')) return; // no interrumpe una partida
      reloaded = true;
      location.reload();
    });
  }
  // En el archivo único el tiranosaurio de bajo detalle no va incluido a propósito (se usa el realista): sin aviso.
  const missing = (window as unknown as { __GLB?: unknown }).__GLB ? quatErrors.filter((e) => !e.includes('t-rex')) : quatErrors;
  if (missing.length) {
    // Aviso visible (también en el menú) para saber por qué no salen los dinosaurios nuevos.
    const w = document.createElement('div');
    w.style.cssText = 'position:fixed;left:8px;bottom:8px;max-width:90vw;z-index:9999;background:#000c;color:#fc6;font:12px sans-serif;padding:6px 8px;border-radius:6px;pointer-events:none';
    w.textContent = `⚠️ No se cargaron ${missing.length} modelos de dinosaurio: ${missing[0]}`;
    document.body.appendChild(w);
    setTimeout(() => w.remove(), 30000);
  }

  const menu = new MainMenu(service, persistent, game);
  (window as unknown as { menu: MainMenu }).menu = menu;
  menu.onPlay = (profile, save, mode) => {
    game.setSession(new PlayerSession(profile, service, save, mode));
    $('start-screen').classList.add('hidden');
    if (!game.isTouch) game.renderer.domElement.requestPointerLock?.();
    else document.documentElement.requestFullscreen?.().catch(() => {});
    game.start();
    // Primer guardado en cuanto empieza (perfil nuevo o recuperado).
    setTimeout(() => void game.save('auto'), 1500);
  };
  await menu.show();

  // Menú de pausa
  const resume = () => {
    game.setPaused(false);
    if (!game.isTouch) game.renderer.domElement.requestPointerLock?.();
  };
  $('btn-resume').onclick = resume;
  $('btn-pause').onclick = () => game.setPaused(true);
  $('btn-pause').addEventListener('pointerdown', (e) => e.stopPropagation());
  $('btn-stats').onclick = () => { if (game.session) { game.session.capture(game); MainMenu.showStats(game.session); } };
  setupFriendsMenu(game.mp, game.hud);
  $('btn-pause-settings').onclick = () => menu.openSettings(game.session?.profile ?? null);
  $('btn-intro').onclick = () => game.replayIntro();
  $('btn-respawn').onclick = () => { game.respawnAtSafePoint(false); game.setPaused(false); };
  $('btn-exit').onclick = () => { $('btn-exit').textContent = 'Guardando…'; void game.exitToMenu(); };
  // Confirmación en dos pulsaciones (sin diálogos del navegador).
  const reset = $('btn-reset');
  let armed = false;
  reset.onclick = () => {
    if (armed) { void game.resetSave(); return; }
    armed = true;
    reset.textContent = 'Pulsa otra vez: se perderá el progreso de este perfil';
    setTimeout(() => { armed = false; reset.textContent = 'Reiniciar la partida de este perfil'; }, 3000);
  };
  window.addEventListener('keydown', (e) => {
    const overlay = !$('settings-screen').classList.contains('hidden') || !$('stats-screen').classList.contains('hidden') || !$('mp-screen').classList.contains('hidden');
    if ((e.code === 'Escape' || e.code === 'KeyP') && game.paused && !overlay && !document.pointerLockElement) resume();
  });
}

// Deja que el navegador pinte la pantalla de carga antes de generar el mundo.
requestAnimationFrame(() => setTimeout(() => void boot(), 30));
