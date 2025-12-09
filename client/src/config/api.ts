// Prefer env override, otherwise derive API host from the current page host.
// This lets IP-based access (e.g., http://37.27.80.77:5173) talk to the API on port 3000.
// NOTE: Do NOT include /api here - it's added by individual fetch calls
const derivedHost =
  typeof window !== 'undefined'
    ? window.location.hostname
    : 'localhost';

export const API_URL =
  import.meta.env.VITE_API_URL ||
  `http://${derivedHost}:3000`;
