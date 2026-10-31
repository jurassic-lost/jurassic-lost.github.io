/**
 * Misiones M01–M05 del Proyecto Génesis, adaptadas de `docs/genesis/data/missions.json`
 * (mismos ids, requisitos y objetivos; los textos para la pantalla se escriben aquí).
 * La prueba `tests/e2e-genesis.cjs` comprueba que coinciden con el JSON de diseño.
 */
export interface GenesisObjective { id: string; text: string }
export interface GenesisMission { id: string; title: string; requires: string[]; objectives: GenesisObjective[] }

export const GENESIS_MISSIONS: GenesisMission[] = [
  {
    id: 'M01', title: 'Investiga el ruido', requires: [],
    objectives: [
      { id: 'walk_to_window', text: 'Acércate a la ventana' },
      { id: 'inspect_street', text: 'Mira hacia la calle' },
    ],
  },
  {
    id: 'M02', title: '¡Escóndete!', requires: ['M01'],
    objectives: [
      { id: 'move_from_window', text: 'Aléjate de la ventana' },
      { id: 'switch_off_lights', text: 'Apaga la luz del cuarto' },
      { id: 'enter_hide_spot', text: 'Escóndete en el ropero' },
      { id: 'wait_until_creature_leaves', text: 'Espera sin moverte a que se vaya' },
    ],
  },
  {
    id: 'M03', title: 'Sobrevive al amanecer', requires: ['M02'],
    objectives: [
      { id: 'receive_emergency_broadcast', text: 'Lee el aviso del celular' },
      { id: 'exit_house_safely', text: 'Sal de la casa por la puerta' },
    ],
  },
  {
    id: 'M04', title: 'Encuentra suministros', requires: ['M03'],
    objectives: [
      { id: 'collect_water', text: 'Consigue agua' },
      { id: 'collect_food', text: 'Consigue comida' },
      { id: 'collect_flashlight', text: 'Consigue una linterna' },
    ],
  },
  {
    id: 'M05', title: 'Prepara un refugio', requires: ['M04'],
    objectives: [
      { id: 'secure_room', text: 'Tapa la ventana de tu cuarto' },
      { id: 'place_supplies', text: 'Guarda los suministros en el estante' },
      { id: 'save_or_rest', text: 'Descansa en tu cama (se guarda)' },
    ],
  },
];
