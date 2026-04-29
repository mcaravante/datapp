/**
 * Nest provider tokens used inside the auth module. Kept in their own
 * file so consumers (services + tests) can `import` them without
 * pulling the full module graph.
 */
export const AUTH_REDIS = Symbol('AUTH_REDIS');
