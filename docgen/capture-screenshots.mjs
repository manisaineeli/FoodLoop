/**
 * Capture FoodLoop UI screenshots with headless Chrome over the DevTools
 * Protocol. Uses only Node built-ins (global fetch + WebSocket), so there is
 * nothing to install.
 *
 *   node docgen/capture-screenshots.mjs
 *
 * Writes docgen/screenshots/*.png
 */

import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, "screenshots");
const PROFILE = join(HERE, ".chrome-profile");
const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const PORT = 9222;
const BASE = "http://localhost:5000";
const VIEW = { width: 1600, height: 1000, scale: 2 };

mkdirSync(OUT, { recursive: true });
rmSync(PROFILE, { recursive: true, force: true });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------------------------------------------------------------- CDP client
class CDP {
  constructor(ws) {
    this.ws = ws;
    this.id = 0;
    this.pending = new Map();
    this.events = [];
    ws.addEventListener("message", (ev) => {
      const msg = JSON.parse(ev.data);
      if (msg.id && this.pending.has(msg.id)) {
        const { resolve, reject } = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        msg.error ? reject(new Error(JSON.stringify(msg.error))) : resolve(msg.result);
      } else if (msg.method) {
        this.events.push(msg);
      }
    });
  }

  static async attach(port) {
    // wait for the browser endpoint
    let target;
    for (let i = 0; i < 60; i++) {
      try {
        const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
        target = list.find((t) => t.type === "page");
        if (target) break;
      } catch { /* not up yet */ }
      await sleep(250);
    }
    if (!target) throw new Error("Chrome DevTools endpoint never came up");

    const ws = new WebSocket(target.webSocketDebuggerUrl);
    await new Promise((res, rej) => {
      ws.addEventListener("open", res, { once: true });
      ws.addEventListener("error", rej, { once: true });
    });
    const cdp = new CDP(ws);
    cdp.targetId = target.id;
    return cdp;
  }

  send(method, params = {}) {
    const id = ++this.id;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
      setTimeout(() => {
        if (this.pending.has(id)) {
          this.pending.delete(id);
          reject(new Error(`CDP timeout: ${method}`));
        }
      }, 45000);
    });
  }

  async eval(expression) {
    const r = await this.send("Runtime.evaluate", {
      expression,
      awaitPromise: true,
      returnByValue: true,
    });
    if (r.exceptionDetails) {
      throw new Error(r.exceptionDetails.exception?.description || "eval failed");
    }
    return r.result.value;
  }

  async shot(name) {
    const { data } = await this.send("Page.captureScreenshot", {
      format: "png",
      captureBeyondViewport: false,
    });
    const file = join(OUT, `${name}.png`);
    writeFileSync(file, Buffer.from(data, "base64"));
    console.log("  saved", `${name}.png`);
  }

  async goto(url) {
    await this.send("Page.navigate", { url });
    await sleep(1400);
  }
}

// --------------------------------------------------------------- the capture
// [slug, human name, action or null, authScreenOnly]
const SHOTS = [
  ["01-signin", "Sign in screen", null, true],
  ["02-signup", "Create account screen", `() => {
      document.querySelector('[data-tab="signup"]').click();
    }`, true],
  ["03-overview", "Overview dashboard", `() => showView('overview')`],
  ["04-food-listings", "Food listings view", `() => showView('listings')`],
  ["05-requests", "Donation requests inbox", `() => showView('requests')`],
  ["06-pickups", "Pickup coordination board", `() => showView('pickups')`],
  ["07-waste-log", "Waste log view", `() => showView('waste')`],
  ["08-partners", "Community partners view", `() => showView('partners')`],
  ["09-reports", "Impact reports view", `() => showView('reports')`],
  ["10-add-listing", "Add food listing modal", `() => {
      showView('overview'); openListingModal();
    }`],
  ["11-help", "Help centre modal", `() => {
      showView('overview'); document.getElementById('helpBtn').click();
    }`],
  ["12-search", "Global search palette", `() => openSearch()`],
  ["13-notifications", "Notifications panel", `() => {
      document.getElementById('topNotifBtn').click();
    }`],
  ["14-about", "About FoodLoop documentation view", `() => showView('docs')`],
  ["15-settings", "Settings view", `() => showView('settings')`],
];

async function main() {
  const chrome = spawn(CHROME, [
    "--headless=new",
    `--remote-debugging-port=${PORT}`,
    `--user-data-dir=${PROFILE}`,
    "--no-first-run",
    "--no-default-browser-check",
    "--disable-extensions",
    "--hide-scrollbars",
    "--force-device-scale-factor=1",
    `--window-size=${VIEW.width},${VIEW.height}`,
    "about:blank",
  ], { stdio: "ignore" });

  process.on("exit", () => chrome.kill());

  const cdp = await CDP.attach(PORT);
  await cdp.send("Page.enable");
  await cdp.send("Runtime.enable");
  await cdp.send("Emulation.setDeviceMetricsOverride", {
    width: VIEW.width,
    height: VIEW.height,
    deviceScaleFactor: VIEW.scale,
    mobile: false,
  });

  // --- sign in so the app shell is reachable
  const creds = {
    admin: { name: "Harbor House Kitchen", email: "admin@foodloop.app", password: "foodloop123", role: "admin" },
    ngo: { name: "Hope Foundation", email: "ngo@foodloop.app", password: "foodloop123", role: "ngo" },
  };
  for (const [who, c] of Object.entries(creds)) {
    await fetch(`${BASE}/api/signup`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(c),
    });
  }

  console.log("capturing…");
  for (const [slug, , action, authOnly] of SHOTS) {
    if (authOnly) {
      // clear the session so the auth screen is what loads
      await cdp.goto(BASE);
      await cdp.eval(`localStorage.removeItem('foodloop_session');`);
      await cdp.goto(BASE);
      await sleep(700);
      if (action) {
        await cdp.eval(`(${action})()`);
        await sleep(500);
      }
    } else {
      if (!(await cdp.eval(`!!window.showView && !!auth.currentUser`))) {
        await cdp.eval(`(async () => {
          const r = await api('/signin', {
            method: 'POST',
            body: JSON.stringify({ email: '${creds.admin.email}', password: '${creds.admin.password}', role: 'admin' })
          });
          auth.currentUser = r.user; auth.saveSession();
        })()`);
        await cdp.goto(BASE);
        await sleep(1200);
      }
      // close anything left open by the previous shot, then run the action
      await cdp.eval(`(() => {
        ['helpBackdrop','searchBackdrop','modalBackdrop'].forEach(id =>
          document.getElementById(id)?.classList.remove('open'));
        closeTopDropdowns();
      })()`);
      await sleep(200);
      // the action is a function expression -> it has to actually be invoked
      await cdp.eval(`(${action})()`);
      await sleep(900);
    }
    await cdp.shot(slug);
  }

  // --- the NGO dashboard needs an NGO session
  await cdp.eval(`localStorage.removeItem('foodloop_session')`);
  await cdp.goto(BASE);
  await cdp.eval(`(async () => {
    const r = await api('/signin', {
      method: 'POST',
      body: JSON.stringify({ email: '${creds.ngo.email}', password: '${creds.ngo.password}', role: 'ngo' })
    });
    auth.currentUser = r.user; auth.saveSession();
  })()`);
  await cdp.goto(BASE);
  await sleep(900);
  await cdp.shot("16-ngo-dashboard");

  // --- mobile layout, for the responsive note
  await cdp.send("Emulation.setDeviceMetricsOverride", {
    width: 430, height: 900, deviceScaleFactor: 2, mobile: true,
  });
  await cdp.eval(`(async () => {
    const r = await api('/signin', {
      method: 'POST',
      body: JSON.stringify({ email: '${creds.admin.email}', password: '${creds.admin.password}', role: 'admin' })
    });
    auth.currentUser = r.user; auth.saveSession();
  })()`);
  await cdp.goto(BASE);
  await sleep(1000);
  await cdp.shot("17-mobile-overview");

  cdp.ws.close();
  chrome.kill();
  await sleep(1500);
  try { rmSync(PROFILE, { recursive: true, force: true, maxRetries: 3 }); } catch { /* chrome still detaching */ }
  console.log("\nAll screenshots written to", OUT);
}

main().catch((err) => {
  console.error("FAILED:", err.message);
  process.exit(1);
});