/**
 * The AnteFirma server address.
 *
 * This is the only place it appears: to test the extension against a local
 * server (`npm start` in antefirma-server) change it here and add the matching
 * origin to `host_permissions` in the manifest.
 */
export const API_BASE = 'https://api.antefirma.app';

/** Maximum duration of an analysis call, in milliseconds. */
export const ANALYZE_TIMEOUT_MS = 15_000;
