import { checkName } from '../src/profile/nameFilter';
const good = ['DinoMax', 'Luna_Rex', 'Sofía', 'Ñandú_12', 'Computadora', 'Disputa', 'Calculo', 'Explorador_7', 'Peneloe', 'Violeta', 'Sexto_Sentido', 'Rapero', 'Bombero', 'Mateo', 'María_José', 'Kiro_Fan', 'Tricera_Tops', 'Assassin_Dino', 'Andrés', 'Grass_Rex', 'Computo', 'Diputado_Rex', 'Musculo_Rex', 'Pantera', 'Mongolia_Rex', 'Gitano_Rey'];
const badN = ['puta', 'PuTo', 'p_u_t_o', 'pUt0', 'Pendejo', 'p3nd3j0', 'pennndejo', 'mi3rda', 'fuuuck', 'FUCK_rex', 'f_u_c_k', 'Admin', 'Moderador_1', 'admin123', 'GM_Rex', 'Rex_5551234567', 'juan_gmail', 'Mi_WhatsApp', 'Nigga', 'Maricon', 'Sexy_Girl', 'Te_Mato', 'ab', 'nombre_demasiado_largo_ok', 'hola mundo', 'Dino@Rex', 'рuta', 'Culo', 'Hitler', 'Te_voy_a_matar', 'aaaaaa', 'PutaRex', 'Rex_puta', 'Culo_Rex', 'CuloGrande', 'Idi0ta', 'S3X0', 'p0rn0_rex', 'K1ll_You'];
let fails = 0;
for (const n of good) { const r = checkName(n); if (!r.ok) { fails++; console.log('FALSE REJECT', n, r); } }
for (const n of badN) { const r = checkName(n); if (r.ok) { fails++; console.log('FALSE ACCEPT', n); } }
console.log(`good ${good.length}, bad ${badN.length}, fails ${fails}`);
if (fails) process.exit(1);
