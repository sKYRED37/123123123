// Topoff Ranked frontend configuration.
// Netlify proxies /api/* to the Bothost backend defined in netlify.toml.
window.STANDRISE_CONFIG = {
  API_BASE: "/api"
};
window.STANDRISE_API_BASE = window.STANDRISE_CONFIG.API_BASE;
