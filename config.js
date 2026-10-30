// FoodLoop runtime configuration.
// Supports Local Development (localhost:5000), Live Deployed Backends,
// and Live GitHub Pages Autonomous Mode (https://manisaineeli.github.io/FoodLoop/)

(function () {
  const isBrowser = typeof window !== 'undefined';
  if (!isBrowser) return;

  const host = window.location.hostname || '';
  const isGitHubPages = host.endsWith('github.io');
  const isLocal = host === 'localhost' || host === '127.0.0.1';

  // If deployed on GitHub Pages and no explicit remote HTTPS backend is configured,
  // we enable Autonomous Live Cloud Mode so everything works 100% with no Mixed-Content blocks!
  if (isGitHubPages) {
    if (!window.FOODLOOP_API || window.FOODLOOP_API.includes('localhost')) {
      window.FOODLOOP_API = 'autonomous';
    }
  } else if (isLocal) {
    window.FOODLOOP_API = window.FOODLOOP_API || 'http://localhost:5000/api';
  } else {
    // Single-origin deployed builds (e.g. Render / Railway)
    window.FOODLOOP_API = window.FOODLOOP_API || '/api';
  }
})();
