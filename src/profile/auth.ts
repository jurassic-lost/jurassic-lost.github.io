/**
 * Servicio de autenticación (FUTURO). La primera versión es solo local:
 * no hay cuentas, contraseñas ni envío de datos a ningún servidor.
 *
 * Diseño previsto para la versión en línea:
 * - Registro administrado por madres, padres o tutores, con consentimiento
 *   verificable cuando la ley lo exija (p. ej. COPPA, RGPD-K, leyes locales).
 * - La cuenta (identidad del adulto) vive en el servidor y se enlaza con los
 *   perfiles de juego por su `id` aleatorio; el perfil no guarda datos reales.
 * - Contraseñas solo con hash fuerte en el servidor; sesiones con tokens que caducan.
 * - Guardado en la nube con `revision` + `savedAt` para resolver conflictos entre
 *   dispositivos (gana la revisión más alta; si chocan, se pregunta al jugador).
 * - Exportar y eliminar todos los datos a petición del tutor.
 * - El filtro de nombres se repite obligatoriamente en el servidor.
 */
export interface AuthService {
  readonly mode: 'local' | 'online';
  /** Cuenta del tutor; null en modo local. */
  currentAccount(): Promise<{ accountId: string } | null>;
}

export class LocalOnlyAuth implements AuthService {
  readonly mode = 'local' as const;
  async currentAccount() { return null; }
}
