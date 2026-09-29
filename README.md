# FoodLoop

FoodLoop is a browser-based prototype for the Food Waste Reduction Platform described in `OOADUML_final.pptx`. It represents the main OOAD flows in a lightweight, dependency-free interface:

- food providers publish surplus listings;
- NGOs and community partners send donation requests;
- teams coordinate pickups;
- waste entries and impact reports make the outcome visible.

## Live site

https://manisaineeli.github.io/FoodLoop/

The site is published with GitHub Pages from the `master` branch. Every push to `master` rebuilds and republishes automatically.

## Run it

**Easiest:** double-click `start.cmd`. It checks MongoDB, starts the API server (detached, no console window, logs to `%USERPROFILE%\.foodloop\foodloop.log`), and opens http://localhost:5000 in your browser. Run it again any time — if the server is already up it just opens the page. The server keeps running after the script closes.

FoodLoop stores all of its data in MongoDB, so the Express server **must be running** before you log in. Signup and signin go through `POST /api/signup` and `POST /api/signin`; if the server is down the browser reports a failed request and the login form shows a hint instead.

Manually:

1. Make sure MongoDB is listening on `127.0.0.1:27017`.
2. Install dependencies and start the server:

   ```
   npm install
   npm start
   ```

3. Open **http://localhost:5000** in a browser.

The server serves `index.html` itself, so use that URL rather than double-clicking `index.html`. A `file://` page cannot reach the API and will show a `file://` hint on the login form.

Configuration lives in two places:

- `.env` — `PORT` and `MONGODB_URI` for the server (see `.env.example`).
- `config.js` — `window.FOODLOOP_API`, the API base URL the browser calls. It defaults to `http://localhost:5000/api`.

### Deployed on GitHub Pages

GitHub Pages only serves static files and cannot run `server.js`, so a deployed copy needs a separately hosted backend (Render, Railway, Vercel, Fly.io, or your own server) and `window.FOODLOOP_API` set to its public HTTPS URL. A browser blocks plain-HTTP API calls from an HTTPS page.
