import type { AuthClaims } from '../auth.js';

declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: AuthClaims;
    user: AuthClaims;
  }
}
