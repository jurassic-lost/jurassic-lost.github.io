import * as THREE from 'three';
import Peer, { type DataConnection, type PeerOptions } from 'peerjs';
import { CharacterModel, type CharacterAction } from '../player/CharacterModel';
import { WEAPONS, weaponModel, type WeaponId } from '../combat/Weapons';
import { sanitizeAppearance } from '../profile/appearance';
import { checkName } from '../profile/nameFilter';
import type { Appearance } from '../profile/types';
import type { Terrain } from '../world/Terrain';

/** Prefijo de las salas en el servidor de PeerJS (cambiarlo si el protocolo deja de ser compatible). */
const PREFIX = 'jurassiclost-v1-';
/** Letras sin confusiones (sin 0/O, 1/I/L). */
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export const CODE_LENGTH = 5;
/** Dos equipos de 3. */
export const MAX_PLAYERS = 6;
export const TEAM_SIZE = 3;
export type Team = 'verde' | 'naranja';
export const TEAMS: Record<Team, { name: string; icon: string; color: string }> = {
  verde: { name: 'Equipo Verde', icon: '🟢', color: '#3fbf5a' },
  naranja: { name: 'Equipo Naranja', icon: '🟠', color: '#ff8a2a' },
};
const isTeam = (v: unknown): v is Team => v === 'verde' || v === 'naranja';
const SEND_EVERY = 0.1;
const ACTIONS: CharacterAction[] = ['swing', 'thrust', 'throw', 'bow', 'hurt', 'build', 'pickup'];

/** Lo que cada jugador cuenta de sí mismo al entrar. */
interface Profile { name: string; look: Appearance; lvl: number; team?: Team }
/** Estado que se envía 10 veces por segundo: posición, giro, velocidad, salto… */
interface Pose { p: [number, number, number, number, number, number]; g: 0 | 1; c: 0 | 1; s: 0 | 1; a: 0 | 1; w: WeaponId }

type Msg =
  | ({ t: 'hi' } & Profile)
  | ({ t: 'join'; id: string } & Profile)
  | { t: 'leave'; id: string }
  | { t: 'full' }
  | ({ t: 's'; id?: string } & Pose)
  | { t: 'a'; id?: string; k: CharacterAction }
  /** Cambio de equipo: el invitado lo pide (sin id) y el anfitrión lo confirma a todos (con id). */
  | { t: 'team'; id?: string; team: Team }
  /** Un golpe a un jugador del otro equipo (el anfitrión lo entrega a «to»). */
  | { t: 'hit'; to: string; from?: string }
  /** «Me atraparon»: lo envía quien recibió el tercer golpe; el anfitrión suma el punto. */
  | { t: 'caught'; by: string; id?: string }
  | { t: 'score'; v: number; n: number; who?: string; by?: string };

export type MpState = 'off' | 'connecting' | 'host' | 'guest';

export function normalizeCode(raw: string) {
  return raw.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, CODE_LENGTH);
}

function randomCode() {
  let s = '';
  const r = new Uint32Array(CODE_LENGTH);
  crypto.getRandomValues(r);
  for (const v of r) s += ALPHABET[v % ALPHABET.length];
  return s;
}

/** Servidor de señalización: el gratuito de PeerJS, o uno propio con ?peer=host:puerto (pruebas). */
function peerOptions(): PeerOptions {
  const q = new URLSearchParams(location.search).get('peer');
  if (!q) return { debug: 0 };
  const [host, port] = q.split(':');
  const local = /^(localhost|127\.|\d+\.\d+\.\d+\.\d+)/.test(host);
  return { host, port: Number(port) || (local ? 9000 : 443), path: '/', secure: !local, debug: 0, config: local ? { iceServers: [] } : undefined };
}

/** Lee un mensaje de otro jugador y descarta lo que no tenga la forma esperada. */
function parse(data: unknown): Msg | null {
  if (!data || typeof data !== 'object') return null;
  const m = data as Record<string, unknown>;
  const num = (v: unknown) => typeof v === 'number' && Number.isFinite(v);
  switch (m.t) {
    case 'hi': case 'join': {
      if (typeof m.name !== 'string') return null;
      if (m.t === 'join' && typeof m.id !== 'string') return null;
      // Un nombre que no pasa el filtro (p. ej. de una versión modificada del juego) se muestra genérico.
      const chk = checkName(m.name.slice(0, 16));
      const clean = chk.ok ? chk.name : 'Explorador';
      return { ...(m as object), name: clean, look: sanitizeAppearance(m.look as Partial<Appearance>), lvl: num(m.lvl) ? Math.max(1, Math.min(99, Math.floor(m.lvl as number))) : 1, team: isTeam(m.team) ? m.team : undefined } as Msg;
    }
    case 'leave': return typeof m.id === 'string' ? (m as unknown as Msg) : null;
    case 'full': return { t: 'full' };
    case 's': {
      const p = m.p as unknown[];
      if (!Array.isArray(p) || p.length !== 6 || !p.every(num)) return null;
      const w = WEAPONS.some((x) => x.id === m.w) ? (m.w as WeaponId) : 'hand';
      return { t: 's', id: typeof m.id === 'string' ? m.id : undefined, p: p as Pose['p'], g: m.g ? 1 : 0, c: m.c ? 1 : 0, s: m.s ? 1 : 0, a: m.a ? 1 : 0, w };
    }
    case 'team': return isTeam(m.team) ? { t: 'team', id: typeof m.id === 'string' ? m.id : undefined, team: m.team } : null;
    case 'hit': return typeof m.to === 'string' ? { t: 'hit', to: m.to, from: typeof m.from === 'string' ? m.from : undefined } : null;
    case 'caught': return typeof m.by === 'string' ? { t: 'caught', by: m.by, id: typeof m.id === 'string' ? m.id : undefined } : null;
    case 'score': return num(m.v) && num(m.n) ? { t: 'score', v: m.v as number, n: m.n as number, who: typeof m.who === 'string' ? m.who : undefined, by: typeof m.by === 'string' ? m.by : undefined } : null;
    case 'a': return ACTIONS.includes(m.k as CharacterAction) ? { t: 'a', id: typeof m.id === 'string' ? m.id : undefined, k: m.k as CharacterAction } : null;
  }
  return null;
}

function nameTag(name: string, lvl: number, team: Team) {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 64;
  const g = c.getContext('2d')!;
  g.font = 'bold 30px system-ui, sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  const text = `${name}  ⭐${lvl}`;
  const w = Math.min(250, g.measureText(text).width + 28);
  g.fillStyle = 'rgba(10,30,18,0.72)';
  g.strokeStyle = TEAMS[team].color;
  g.lineWidth = 5;
  g.beginPath();
  g.roundRect((256 - w) / 2, 8, w, 48, 22);
  g.fill();
  g.stroke();
  g.fillStyle = '#ffe9a8';
  g.fillText(text, 128, 33);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, depthWrite: false, transparent: true, fog: false }));
  sp.scale.set(2.2, 0.55, 1);
  sp.position.y = 2.25;
  sp.renderOrder = 5;
  return sp;
}

/** Otro explorador en la isla, movido con lo que llega por la red (suavizado). */
export class RemotePlayer {
  readonly model: CharacterModel;
  readonly position = new THREE.Vector3();
  private readonly target = new THREE.Vector3();
  private facing = 0;
  private targetFacing = 0;
  private pose: Pose | null = null;
  private weapon: WeaponId = 'hand';
  private tag: THREE.Sprite;
  team: Team;
  private lastSeen = performance.now();

  constructor(readonly id: string, public info: Profile) {
    this.model = new CharacterModel(info.look);
    this.model.root.visible = false;
    this.team = info.team ?? 'verde';
    this.tag = nameTag(info.name, info.lvl, this.team);
    this.model.root.add(this.tag);
  }

  setTeam(t: Team) {
    if (t === this.team) return;
    this.team = t;
    this.disposeTag();
    this.tag = nameTag(this.info.name, this.info.lvl, t);
    this.model.root.add(this.tag);
  }

  private disposeTag() {
    this.tag.removeFromParent();
    (this.tag.material.map as THREE.Texture).dispose();
    this.tag.material.dispose();
  }

  setPose(p: Pose) {
    const first = !this.pose;
    this.pose = p;
    this.target.set(p.p[0], p.p[1], p.p[2]);
    this.targetFacing = p.p[3];
    if (first) { this.position.copy(this.target); this.facing = this.targetFacing; this.model.root.visible = true; }
    if (p.w !== this.weapon) { this.weapon = p.w; this.model.hold(weaponModel(p.w)); }
    this.lastSeen = performance.now();
  }

  act(k: CharacterAction) {
    if (k === 'hurt') this.model.playHurt();
    else if (k === 'build') this.model.playBuild();
    else if (k === 'pickup') this.model.playPickup();
    else this.model.playAttack(k);
  }

  update(dt: number, terrain: Terrain) {
    const p = this.pose;
    if (!p) return;
    // Si se pierde la conexión un momento, se queda quieto en su sitio.
    const stale = performance.now() - this.lastSeen > 1500;
    const k = 1 - Math.exp(-10 * dt);
    this.position.lerp(this.target, k);
    if (p.g) this.position.y = Math.max(this.position.y, terrain.heightAt(this.position.x, this.position.z));
    let d = this.targetFacing - this.facing;
    d = Math.atan2(Math.sin(d), Math.cos(d));
    this.facing += d * k;
    this.model.root.position.copy(this.position);
    this.model.root.rotation.y = this.facing;
    this.model.sitting = !!p.s;
    this.model.aiming = !!p.a;
    this.model.update(dt, stale ? 0 : p.p[4], !!p.g, !!p.c, p.p[5]);
    // La etiqueta mira siempre a la cámara (es un sprite) y no gira con el cuerpo.
  }

  dispose() {
    this.model.root.removeFromParent();
    this.disposeTag();
  }
}

/** Lo que el juego le da al multijugador para contar quién eres y qué haces. */
export interface LocalPlayer {
  position: THREE.Vector3;
  facing: number;
  speed: number;
  grounded: boolean;
  crouching: boolean;
  vy: number;
  sitting: boolean;
  aiming: boolean;
  weapon: WeaponId;
  profile(): Profile;
}

/**
 * Juego con amigos en la misma isla, sin cuentas: uno crea una sala con un código
 * y los demás se unen. Las conexiones van directas entre navegadores (WebRTC con PeerJS);
 * el que crea la sala reparte los mensajes a todos. Cada uno conserva su partida guardada.
 * No hay chat de texto: solo nombres (ya filtrados) y lo que hace cada personaje.
 */
export class Multiplayer {
  readonly group = new THREE.Group();
  readonly players = new Map<string, RemotePlayer>();
  state: MpState = 'off';
  code = '';
  private peer: Peer | null = null;
  /** Como anfitrión: una conexión por invitado. Como invitado: solo la del anfitrión. */
  private readonly conns = new Map<string, DataConnection>();
  private readonly hello = new Map<string, Profile>();
  private sendT = 0;
  private myId = '';
  /** Avisos para el jugador (entró, salió, error…). */
  onNotice?: (text: string) => void;
  /** Cambió la sala o la lista de jugadores. */
  onChange?: () => void;
  /** Un jugador del otro equipo te golpeó. */
  onHit?: (from: RemotePlayer) => void;
  /** Mi equipo en esta sala. */
  team: Team = 'verde';
  /** Jugadores atrapados por cada equipo. */
  readonly score: Record<Team, number> = { verde: 0, naranja: 0 };

  constructor(private readonly terrain: Terrain, private readonly local: LocalPlayer) {
    this.group.name = 'multiplayer';
  }

  get active() { return this.state === 'host' || this.state === 'guest'; }
  get count() { return this.active ? this.players.size + 1 : 0; }

  /** Crea una sala nueva y devuelve su código. */
  async host(): Promise<string> {
    this.leave(true);
    for (let tries = 0; tries < 4; tries++) {
      const code = randomCode();
      try {
        await this.open(PREFIX + code);
      } catch (e) {
        if ((e as { type?: string }).type === 'unavailable-id') continue;
        throw this.fail(e);
      }
      this.code = code;
      this.state = 'host';
      this.team = 'verde';
      this.peer!.on('connection', (c) => this.accept(c));
      this.watchPeer();
      this.onChange?.();
      return code;
    }
    throw this.fail({ type: 'unavailable-id' });
  }

  /** Entra en la sala de un amigo con su código. */
  async join(raw: string) {
    const code = normalizeCode(raw);
    if (code.length !== CODE_LENGTH) throw new Error(`El código tiene ${CODE_LENGTH} letras o números.`);
    this.leave(true);
    try {
      await this.open();
      const c = this.peer!.connect(PREFIX + code, { reliable: true, serialization: 'json' });
      await new Promise<void>((ok, ko) => {
        const t = setTimeout(() => ko({ type: 'peer-unavailable' }), 15000);
        c.on('open', () => { clearTimeout(t); ok(); });
        c.on('error', (e) => { clearTimeout(t); ko(e); });
        this.peer!.once('error', (e) => { clearTimeout(t); ko(e); });
      });
      this.code = code;
      this.state = 'guest';
      this.conns.set(c.peer, c);
      c.on('data', (d) => this.fromHost(d));
      c.on('close', () => { if (this.state === 'guest') { this.onNotice?.('🔌 La sala se cerró o se perdió la conexión.'); this.leave(); } });
      this.watchPeer();
      c.send({ t: 'hi', ...this.me() } satisfies Msg);
      this.onChange?.();
    } catch (e) {
      this.leave(true);
      throw this.fail(e);
    }
  }

  /** Sale de la sala y quita a los demás exploradores del mapa. */
  leave(silent = false) {
    const was = this.active;
    for (const c of this.conns.values()) c.close();
    this.conns.clear();
    this.hello.clear();
    for (const p of this.players.values()) p.dispose();
    this.players.clear();
    this.peer?.destroy();
    this.peer = null;
    this.state = 'off';
    this.code = '';
    this.score.verde = this.score.naranja = 0;
    if (was && !silent) this.onNotice?.('Saliste de la sala.');
    this.onChange?.();
  }

  /** Envía una acción del personaje local (atacar, recoger, construir…). */
  action(k: CharacterAction) {
    if (!this.active) return;
    this.broadcast({ t: 'a', id: this.state === 'host' ? this.myId : undefined, k });
  }

  update(dt: number) {
    for (const p of this.players.values()) p.update(dt, this.terrain);
    if (!this.active) return;
    this.sendT -= dt;
    if (this.sendT > 0) return;
    this.sendT = SEND_EVERY;
    const l = this.local, r = (v: number, n = 100) => Math.round(v * n) / n;
    this.broadcast({
      t: 's', id: this.state === 'host' ? this.myId : undefined,
      p: [r(l.position.x), r(l.position.y), r(l.position.z), r(l.facing), r(l.speed, 10), r(l.vy, 10)],
      g: l.grounded ? 1 : 0, c: l.crouching ? 1 : 0, s: l.sitting ? 1 : 0, a: l.aiming ? 1 : 0, w: l.weapon,
    });
  }

  /** Puntos para el minimapa: tu equipo siempre; los rivales solo si están cerca. */
  markers() {
    const me = this.local.position;
    return [...this.players.values()]
      .filter((p) => p.model.root.visible && (p.team === this.team || p.position.distanceTo(me) < 35))
      .map((p) => ({ x: p.position.x, z: p.position.z, color: TEAMS[p.team].color, size: 4 }));
  }

  /** Lista para el menú: nombre y equipo de cada uno. */
  roster() {
    return [{ name: this.local.profile().name, team: this.team, me: true },
      ...[...this.players.values()].map((p) => ({ name: p.info.name, team: p.team, me: false }))];
  }

  teamCount(t: Team) { return (this.team === t ? 1 : 0) + [...this.players.values()].filter((p) => p.team === t).length; }

  /** Jugadores del otro equipo que se ven en el mapa (se les puede golpear). */
  enemies() { return [...this.players.values()].filter((p) => p.team !== this.team && p.model.root.visible); }

  /** Pide cambiar de equipo (si hay sitio). */
  changeTeam(t: Team) {
    if (!this.active || t === this.team) return true;
    if (this.teamCount(t) >= TEAM_SIZE) return false;
    if (this.state === 'host') this.setTeamOf(this.myId, t);
    else this.toHost({ t: 'team', team: t });
    return true;
  }

  /** Golpeaste a un rival: se lo cuenta (a través del anfitrión). */
  hit(target: RemotePlayer) {
    if (!this.active || target.team === this.team) return;
    if (this.state === 'host') this.deliverHit(this.myId, target.id);
    else this.toHost({ t: 'hit', to: target.id });
  }

  /** Te atraparon (tercer golpe): el equipo de «by» gana un punto. */
  caught(by: RemotePlayer) {
    if (!this.active) return;
    if (this.state === 'host') this.addPoint(by.id, this.myId);
    else this.toHost({ t: 'caught', by: by.id });
  }

  private me(): Profile { return { ...this.local.profile(), team: this.team }; }
  private nameOf(id: string) { return id === this.myId ? this.local.profile().name : this.players.get(id)?.info.name ?? '¿?'; }
  private teamOf(id: string): Team | undefined { return id === this.myId ? this.team : this.players.get(id)?.team; }
  private toHost(m: Msg) { for (const c of this.conns.values()) if (c.open) c.send(m); }

  private gotHit(fromId: string) {
    const p = this.players.get(fromId);
    if (p && p.team !== this.team) this.onHit?.(p);
  }

  private applyTeam(id: string, t: Team) {
    if (id === this.myId) {
      if (this.team !== t) { this.team = t; this.onNotice?.(`${TEAMS[t].icon} Ahora estás en el ${TEAMS[t].name}`); }
    } else this.players.get(id)?.setTeam(t);
    this.onChange?.();
  }

  private applyScore(v: number, n: number, who?: string, by?: string) {
    this.score.verde = v;
    this.score.naranja = n;
    if (who && by) this.onNotice?.(`🏁 ${this.nameOf(by)} atrapó a ${this.nameOf(who)} · ${TEAMS.verde.icon} ${v} – ${n} ${TEAMS.naranja.icon}`);
    this.onChange?.();
  }

  private open(id?: string) {
    return new Promise<void>((ok, ko) => {
      const peer = id ? new Peer(id, peerOptions()) : new Peer(peerOptions());
      this.peer = peer;
      const t = setTimeout(() => ko({ type: 'network' }), 15000);
      peer.once('open', (myId) => { clearTimeout(t); this.myId = myId; ok(); });
      peer.once('error', (e) => { clearTimeout(t); ko(e); });
    });
  }

  private watchPeer() {
    const peer = this.peer!;
    // Si se corta la conexión con el servidor, las conexiones ya hechas siguen; se intenta volver.
    peer.on('disconnected', () => { if (this.peer === peer && !peer.destroyed) setTimeout(() => { if (!peer.destroyed) peer.reconnect(); }, 2000); });
    peer.on('error', (e) => { if (this.peer === peer && (e.type === 'network' || e.type === 'server-error')) console.warn('[multijugador]', e.type); });
  }

  // ---------- Anfitrión ----------

  private accept(c: DataConnection) {
    c.on('open', () => {
      if (this.conns.size + 1 >= MAX_PLAYERS) { c.send({ t: 'full' } satisfies Msg); setTimeout(() => c.close(), 500); return; }
      this.conns.set(c.peer, c);
    });
    c.on('data', (d) => this.fromGuest(c, d));
    c.on('close', () => this.dropGuest(c.peer));
    c.on('error', () => this.dropGuest(c.peer));
  }

  private fromGuest(c: DataConnection, data: unknown) {
    const m = parse(data);
    if (!m || !this.conns.has(c.peer)) return;
    const id = c.peer;
    if (m.t === 'hi') {
      if (this.hello.has(id)) return;
      // Equipos parejos: el nuevo va al equipo con menos jugadores.
      const team: Team = this.teamCount('verde') <= this.teamCount('naranja') ? 'verde' : 'naranja';
      const info: Profile = { name: m.name, look: m.look, lvl: m.lvl, team };
      this.hello.set(id, info);
      // Al nuevo: quién soy yo, quién más está, su equipo y el marcador. A los demás: que llegó alguien.
      c.send({ t: 'team', id, team } satisfies Msg);
      c.send({ t: 'join', id: this.myId, ...this.me() } satisfies Msg);
      for (const [oid, o] of this.hello) if (oid !== id) c.send({ t: 'join', id: oid, ...o } satisfies Msg);
      c.send({ t: 'score', v: this.score.verde, n: this.score.naranja } satisfies Msg);
      this.relay({ t: 'join', id, ...info }, id);
      this.addPlayer(id, info);
      return;
    }
    if (!this.hello.has(id)) return;
    if (m.t === 's') { this.players.get(id)?.setPose(m); this.relay({ ...m, id }, id); }
    else if (m.t === 'a') { this.players.get(id)?.act(m.k); this.relay({ ...m, id }, id); }
    else if (m.t === 'team') {
      const p = this.players.get(id);
      if (p && p.team !== m.team && this.teamCount(m.team) < TEAM_SIZE) this.setTeamOf(id, m.team);
      else c.send({ t: 'team', id, team: p?.team ?? 'verde' } satisfies Msg);
    } else if (m.t === 'hit') this.deliverHit(id, m.to);
    else if (m.t === 'caught') this.addPoint(m.by, id);
  }

  /** Anfitrión: cambia el equipo de alguien y lo cuenta a todos. */
  private setTeamOf(id: string, t: Team) {
    const h = this.hello.get(id);
    if (h) h.team = t;
    this.applyTeam(id, t);
    this.relay({ t: 'team', id, team: t }, '');
  }

  /** Anfitrión: entrega un golpe solo si es entre equipos distintos. */
  private deliverHit(from: string, to: string) {
    const a = this.teamOf(from), b = this.teamOf(to);
    if (!a || !b || a === b) return;
    if (to === this.myId) this.gotHit(from);
    else this.conns.get(to)?.send({ t: 'hit', to, from } satisfies Msg);
  }

  /** Anfitrión: suma un punto al equipo de quien atrapó y lo cuenta a todos. */
  private addPoint(by: string, who: string) {
    const t = this.teamOf(by);
    if (!t || t === this.teamOf(who)) return;
    this.score[t]++;
    const m: Msg = { t: 'score', v: this.score.verde, n: this.score.naranja, who, by };
    this.relay(m, '');
    this.applyScore(m.v, m.n, who, by);
  }

  private dropGuest(id: string) {
    if (!this.conns.delete(id)) return;
    this.hello.delete(id);
    this.removePlayer(id);
    this.relay({ t: 'leave', id }, id);
  }

  private relay(m: Msg, except: string) {
    for (const [id, c] of this.conns) if (id !== except && c.open && this.hello.has(id)) c.send(m);
  }

  // ---------- Invitado ----------

  private fromHost(data: unknown) {
    const m = parse(data);
    if (!m) return;
    if (m.t === 'full') { this.onNotice?.(`😕 La sala está llena (máximo ${MAX_PLAYERS} exploradores).`); this.leave(true); return; }
    if (m.t === 'join') { if (m.id !== this.myId) this.addPlayer(m.id, { name: m.name, look: m.look, lvl: m.lvl, team: m.team }); return; }
    if (m.t === 'leave') { this.removePlayer(m.id); return; }
    if (m.t === 'team' && m.id) { this.applyTeam(m.id, m.team); return; }
    if (m.t === 'hit') { if (m.to === this.myId && m.from) this.gotHit(m.from); return; }
    if (m.t === 'score') { this.applyScore(m.v, m.n, m.who, m.by); return; }
    if (m.t !== 's' && m.t !== 'a') return;
    if (!m.id) return;
    if (m.t === 's') this.players.get(m.id)?.setPose(m);
    else if (m.t === 'a') this.players.get(m.id)?.act(m.k);
  }

  // ---------- Común ----------

  private broadcast(m: Msg) {
    for (const [id, c] of this.conns) if (c.open && (this.state === 'guest' || this.hello.has(id))) c.send(m);
  }

  private addPlayer(id: string, info: Profile) {
    if (this.players.has(id)) return;
    const p = new RemotePlayer(id, info);
    this.players.set(id, p);
    this.group.add(p.model.root);
    const t = TEAMS[p.team];
    this.onNotice?.(`👋 ${info.name} llegó a la isla (${t.icon} ${p.team === this.team ? 'de tu equipo' : 'equipo rival'})`);
    this.onChange?.();
  }

  private removePlayer(id: string) {
    const p = this.players.get(id);
    if (!p) return;
    p.dispose();
    this.players.delete(id);
    this.onNotice?.(`${p.info.name} salió de la isla`);
    this.onChange?.();
  }

  private fail(e: unknown) {
    const type = (e as { type?: string })?.type;
    if (e instanceof Error && !type) return e;
    const text: Record<string, string> = {
      'peer-unavailable': 'No encontramos esa sala. Revisa el código (y que tu amigo siga en la sala).',
      'unavailable-id': 'No se pudo crear la sala. Inténtalo otra vez.',
      network: 'No hay conexión con el servidor de salas. Revisa tu internet.',
      'server-error': 'El servidor de salas no responde. Inténtalo en un rato.',
      'socket-error': 'No hay conexión con el servidor de salas. Revisa tu internet.',
      'browser-incompatible': 'Este navegador no permite jugar con amigos.',
      webrtc: 'No se pudo conectar con tu amigo.',
    };
    return new Error(text[type ?? ''] ?? 'No se pudo conectar. Inténtalo otra vez.');
  }
}
