// Use VITE_API_URL if set, otherwise derive from the page's hostname
// (so the admin panel works when accessed remotely, not just via localhost).
function getApiUrl(): string {
  if (import.meta.env.VITE_API_URL) {
    return import.meta.env.VITE_API_URL;
  }
  if (typeof window !== 'undefined') {
    const host = window.location.hostname;
    // In dev, vite runs on 5173/5174 and API is on 3000
    return `${window.location.protocol}//${host}:3000`;
  }
  return 'http://localhost:3000';
}

export const API_URL = getApiUrl();
