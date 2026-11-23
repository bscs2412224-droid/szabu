// Where the backend lives.
//   - Development: empty. The Vite dev server forwards /api and /socket.io to the backend (see vite.config.ts).
//   - Hosting the app and the API on different addresses (for example Vercel + Railway, as the SRS plans):
//     set VITE_API_URL in the frontend build, e.g.  VITE_API_URL=https://szabu-api.up.railway.app
//     and add the app's address to CLIENT_ORIGIN in backend/.env.
const raw = String(import.meta.env?.VITE_API_URL ?? '').trim().replace(/\/+$/, '');

/** "" (same website) or "https://api.example.com" */
export const API_ORIGIN = raw;
export const API_BASE = `${raw}/api`;
