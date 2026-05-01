// runtime config for the snag web frontend.
// values come from Vite env (VITE_*) at build time.

export const apiURL = import.meta.env.VITE_API_URL ?? 'http://localhost:9000';
export const projectName = 'snag';
export const projectTagline = 'paste a link, get the file';
export const projectRepo = 'https://github.com/itzAditya0/Snag';
