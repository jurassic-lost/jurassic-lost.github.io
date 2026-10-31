import { CODE_LENGTH, MAX_PLAYERS, TEAMS, TEAM_SIZE, normalizeCode, type Multiplayer, type Team } from '../net/Multiplayer';
import type { HUD } from './HUD';

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;

/** En la versión de un solo archivo (dentro de Claude) el visor puede bloquear las conexiones. */
const withHint = (msg: string) => (window as unknown as { __GLB?: unknown }).__GLB && /servidor de salas/.test(msg)
  ? `${msg} Si estás jugando dentro de Claude, abre la web jurassic-lost.github.io para jugar con amigos.`
  : msg;

/** Pantalla «Jugar con amigos» (desde la pausa) y el indicador de la sala en el HUD. */
export function setupFriendsMenu(mp: Multiplayer, hud: HUD) {
  const status = $('mp-status'), code = $<HTMLInputElement>('mp-code');
  const hostBtn = $<HTMLButtonElement>('mp-host'), joinBtn = $<HTMLButtonElement>('mp-join');
  const say = (t: string, bad = false) => { status.textContent = t; status.classList.toggle('bad', bad); };
  const busy = (b: boolean) => { hostBtn.disabled = joinBtn.disabled = b; };

  const render = () => {
    const on = mp.active;
    $('mp-off').classList.toggle('hidden', on);
    $('mp-on').classList.toggle('hidden', !on);
    $('mp-room').textContent = mp.code;
    $('mp-hint').textContent = mp.state === 'host'
      ? 'Díselo a tus amigos para que entren desde «Jugar con amigos».'
      : 'Estás en la sala de un amigo.';
    // Dos columnas, una por equipo, con botón para cambiarse si hay sitio.
    const list = $('mp-list');
    list.innerHTML = '';
    const roster = mp.roster();
    for (const t of ['verde', 'naranja'] as Team[]) {
      const col = document.createElement('div');
      col.className = `mp-team ${t}${mp.team === t ? ' mine' : ''}`;
      const h = document.createElement('h4');
      h.textContent = `${TEAMS[t].icon} ${TEAMS[t].name} (${mp.teamCount(t)}/${TEAM_SIZE})`;
      col.appendChild(h);
      for (const r of roster.filter((x) => x.team === t)) {
        const d = document.createElement('div');
        d.textContent = r.me ? `${r.name} (tú)` : r.name;
        col.appendChild(d);
      }
      if (mp.team !== t) {
        const b = document.createElement('button');
        b.textContent = 'Cambiarme aquí';
        b.disabled = mp.teamCount(t) >= TEAM_SIZE;
        b.onclick = () => { if (!mp.changeTeam(t)) say('Ese equipo está lleno.', true); };
        col.appendChild(b);
      }
      list.appendChild(col);
    }
    const badge = $('mp-badge');
    badge.classList.toggle('hidden', !on);
    badge.textContent = `${TEAMS[mp.team].icon} ${mp.code} · ${mp.count}/${MAX_PLAYERS} · 🏁 ${TEAMS.verde.icon}${mp.score.verde} – ${mp.score.naranja}${TEAMS.naranja.icon}`;
  };
  mp.onChange = render;
  mp.onNotice = (t) => { hud.toast(t); if (!$('mp-screen').classList.contains('hidden')) say(t); };

  $('btn-friends').onclick = () => { say(''); render(); $('mp-screen').classList.remove('hidden'); };
  $('mp-back').onclick = () => $('mp-screen').classList.add('hidden');
  code.oninput = () => { code.value = normalizeCode(code.value); };
  code.onkeydown = (e) => { e.stopPropagation(); if (e.key === 'Enter') joinBtn.click(); };

  hostBtn.onclick = async () => {
    busy(true);
    say('Creando la sala…');
    try {
      await mp.host();
      say('¡Sala lista! Comparte el código.');
    } catch (e) { say(withHint((e as Error).message), true); }
    busy(false);
    render();
  };
  joinBtn.onclick = async () => {
    if (normalizeCode(code.value).length !== CODE_LENGTH) { say(`Escribe el código de ${CODE_LENGTH} letras o números.`, true); return; }
    busy(true);
    say('Buscando la sala…');
    try {
      await mp.join(code.value);
      say('¡Conectado! Vuelve al juego para ver a tus amigos.');
    } catch (e) { say(withHint((e as Error).message), true); }
    busy(false);
    render();
  };
  $('mp-leave').onclick = () => { mp.leave(); say(''); };
  window.addEventListener('pagehide', () => mp.leave(true));
  render();
}
