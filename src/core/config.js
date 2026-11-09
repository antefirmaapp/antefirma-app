/**
 * Indirizzo del server di AnteFirma.
 *
 * È l'unico posto in cui compare: per provare l'estensione contro un server
 * locale (`npm start` in antefirma-server) basta cambiarlo qui e aggiungere
 * l'origine corrispondente a `host_permissions` nel manifest.
 */
export const API_BASE = 'https://api.antefirma.app';

/** Durata massima di una chiamata di analisi, in millisecondi. */
export const ANALYZE_TIMEOUT_MS = 15_000;
