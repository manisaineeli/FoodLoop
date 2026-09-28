// FoodLoop runtime configuration.
//
// This file is loaded BEFORE app.js. Set FOODLOOP_API to the URL of your
// Express backend so the deployed site knows where to send signin/signup.
//
// LOCAL DEVELOPMENT (default, leave as-is):
//   window.FOODLOOP_API = 'http://localhost:5000/api';
//
// DEPLOYED ON GITHUB PAGES (set this after deploying server.js):
//   window.FOODLOOP_API = 'https://your-backend.onrender.com/api';
//
// Note: GitHub Pages only serves static files. It CANNOT run server.js,
// so the deployed build needs a separately hosted backend (Render, Railway,
// Vercel, Fly.io, or your own server). It must be HTTPS, because browsers
// block plain-HTTP requests from an HTTPS page.
window.FOODLOOP_API = window.FOODLOOP_API || 'http://localhost:5000/api';
