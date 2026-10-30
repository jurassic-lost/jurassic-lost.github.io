/**
 * Reglas del filtro de nombres. Están separadas del código para poder
 * actualizarlas (y, en la versión en línea, descargarlas del servidor).
 * Todo se escribe ya normalizado: minúsculas, sin acentos, ñ → n.
 * Esta lista nunca se muestra al jugador.
 */
export const NAME_RULES_VERSION = 1;

/** Términos que se bloquean aunque aparezcan dentro de otra palabra. */
export const BLOCK_ANYWHERE = [
  // groserías e insultos (es)
  'puta', 'puto', 'pendej', 'cabron', 'chinga', 'verga', 'mierd', 'cojon', 'gilipoll', 'imbecil', 'idiota', 'estupid',
  'malparid', 'hijueput', 'hijodeput', 'putit', 'putos', 'putas', 'culer', 'mamon', 'mamahuev', 'huevon', 'boludo', 'pelotud',
  'carajo', 'cono', 'joder', 'jodid', 'ojete', 'pinche', 'tarado', 'subnormal', 'baboso', 'zorra', 'perra',
  // groserías e insultos (en)
  'fuck', 'shit', 'bitch', 'asshole', 'bastard', 'dick', 'cunt', 'whore', 'slut', 'stupid', 'moron', 'wtf', 'stfu',
  // discriminación y odio
  'nigg', 'negrat', 'sudaca', 'maricon', 'marica', 'joto', 'faggot', 'retrasad', 'mongol', 'retard', 'nazi', 'hitler', 'kkk', 'esclav',
  'gitanos', 'judios', 'indio_', 'panchit', 'cholo', 'chino_', 'naco',
  // contenido sexual
  'sexo', 'sexy', 'porno', 'porn', 'xxx', 'desnud', 'tetas', 'teton', 'pezon', 'pene', 'vagina', 'chocho', 'concha', 'orgasm', 'viola', 'rape', 'hentai', 'nsfw', 'onlyfans', 'nude', 'boob', 'penis', 'vagin', 'horny', 'cachond', 'calient', 'follar', 'coger_', 'mamad', 'chupal', 'semen', 'condon', 'pedofil', 'pedo_fil',
  // amenazas y violencia
  'temato', 'tematare', 'matarte', 'tevoyamatar', 'tevoyamata', 'asesinar', 'killyou', 'killu', 'muerete', 'suicid', 'terrorist', 'bomba', 'disparar',
  // drogas
  'droga', 'cocain', 'marihuan', 'weed', 'mota_', 'heroin', 'meth',
];

/** Términos cortos que solo se bloquean como palabra completa (para no castigar palabras inocentes). */
export const BLOCK_WORD = [
  'culo', 'caca', 'pedo', 'pis', 'tonto', 'tonta', 'feo', 'fea', 'gay', 'ass', 'sex', 'kill', 'die', 'muere', 'mata', 'gorda', 'gordo', 'negro', 'mono',
  'coger', 'mota', 'indio', 'chino', 'ano', 'teta', 'tit', 'tits', 'pija', 'polla', 'nabo', 'lol', 'fag', 'wey', 'guey', 'bobo', 'pajero', 'paja', 'pajas',
];

/** Palabras inocentes que contienen fragmentos bloqueados: se retiran antes de buscar. */
export const ALLOW = [
  'computador', 'computo', 'disputa', 'disputo', 'reputo', 'imputo', 'diputo', 'amputa', 'amputo', 'reputacion', 'diputad', 'imputad', 'calculo', 'cuculo', 'escopeta', 'peneloe', 'penelope', 'pendiente',
  'concha_marina', 'conchita', 'cocodrilo', 'escocer', 'sexto', 'sexta', 'bombardino', 'bombero', 'bombon', 'pinchito',
  'violeta', 'viola_flor', 'violin', 'scunthorpe', 'cocinero', 'dickens', 'mongolia', 'pasta', 'canopy', 'bananas', 'class', 'grass',
  'assassin', 'mass', 'bass', 'massimo', 'cucumber', 'hancock', 'peacock', 'rapero', 'drape', 'grape', 'therapist', 'skilled', 'skillet',
  'acoso', 'perrito', 'perrocaliente', 'esclavina', 'cholula', 'penedes', 'tetera', 'pinocho', 'gitano_rey', 'calientito',
];

/** Nombres que suplantan a personal o al propio juego. */
export const STAFF = [
  'admin', 'administrador', 'moderador', 'moderator', 'soporte', 'support', 'staff', 'oficial', 'official', 'sistema', 'system',
  'gamemaster', 'developer', 'desarrollador', 'jurassiclost', 'anthropic', 'claude', 'servidor', 'server', 'owner', 'dueno', 'root', 'gm_', 'dev_', '_dev', '_gm', 'mod_', '_mod',
];

/** Indicios de datos personales o de contacto. */
export const CONTACT = [
  'gmail', 'hotmail', 'outlook', 'yahoo', 'icloud', 'arroba', 'puntocom', 'dotcom', 'whatsapp', 'whats', 'telegram', 'instagram', 'insta_', 'tiktok', 'snapchat', 'snap_', 'discord', 'facebook', 'twitter', 'youtube',
  'telefono', 'phone', 'calle', 'avenida', 'colonia', 'direccion', 'address', 'escuela', 'colegio', 'apellido',
];
