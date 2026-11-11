"use strict";
// Added by claude-desktop-tweaks (pacman hook): injects the user's CSS and JS files into claude.ai pages
// and re-applies them whenever either file changes, so edits take effect without restarting the app.
//   ~/.config/claude-desktop-custom.css  inserted as a user stylesheet
//   ~/.config/claude-desktop-custom.js   run in an isolated world (sees the DOM, not the page's JS)
// Console messages from the page that start with "[claude-desktop-tweaks]" are appended to
// ~/.cache/claude-desktop-tweaks.log, which makes the custom script debuggable.
(() => {
  try {
    const { app, webContents } = require("electron");
    const fs = require("fs");
    const os = require("os");
    const path = require("path");
    const configDir = process.env.XDG_CONFIG_HOME || path.join(os.homedir(), ".config");
    const cacheDir = process.env.XDG_CACHE_HOME || path.join(os.homedir(), ".cache");
    const CSS_FILE = "claude-desktop-custom.css";
    const JS_FILE = "claude-desktop-custom.js";
    const cssPath = path.join(configDir, CSS_FILE);
    const jsPath = path.join(configDir, JS_FILE);
    const logPath = path.join(cacheDir, "claude-desktop-tweaks.log");
    const LOG_PREFIX = "[claude-desktop-tweaks]";
    const LOG_MAX_BYTES = 512 * 1024;
    const WORLD_ID = 4242;
    const cssKeys = new WeakMap();

    const isClaudePage = (url) => {
      try {
        const u = new URL(url);
        return u.protocol === "https:" && /(^|\.)claude\.(ai|com)$/.test(u.hostname);
      } catch {
        return false;
      }
    };
    const read = (file) => {
      try {
        return fs.readFileSync(file, "utf8");
      } catch {
        return null;
      }
    };
    const log = (message) => {
      try {
        if (fs.statSync(logPath, { throwIfNoEntry: false })?.size > LOG_MAX_BYTES) fs.truncateSync(logPath, 0);
        fs.appendFileSync(logPath, `${new Date().toISOString()} ${message}\n`);
      } catch {}
    };

    const applyCss = async (wc) => {
      const css = read(cssPath);
      const previous = cssKeys.get(wc);
      cssKeys.delete(wc);
      if (previous) await wc.removeInsertedCSS(previous).catch(() => {});
      if (css && !wc.isDestroyed()) cssKeys.set(wc, await wc.insertCSS(css, { cssOrigin: "user" }));
    };
    const applyJs = async (wc) => {
      // A missing file still runs the teardown hook, so deleting the script turns its effects off.
      const code = read(jsPath) ?? "globalThis.__claudeDesktopTweaks?.destroy?.();";
      const result = await wc.executeJavaScriptInIsolatedWorld(WORLD_ID, [{ code, url: JS_FILE }]);
      if (typeof result === "string" && result) log(result);
    };
    const apply = (wc, which) => {
      if (wc.isDestroyed() || !isClaudePage(wc.getURL())) return;
      if (which !== JS_FILE) applyCss(wc).catch((err) => log(`css: ${err}`));
      if (which !== CSS_FILE) applyJs(wc).catch((err) => log(`js: ${err}`));
    };

    app.on("web-contents-created", (_event, wc) => {
      wc.on("dom-ready", () => {
        cssKeys.delete(wc);
        apply(wc);
      });
      wc.on("console-message", (event, _level, legacyMessage) => {
        const message = typeof event?.message === "string" ? event.message : legacyMessage;
        if (typeof message === "string" && message.startsWith(LOG_PREFIX)) log(message.slice(LOG_PREFIX.length).trim());
      });
    });

    const pending = new Map();
    app.whenReady().then(() => {
      try {
        fs.watch(configDir, (_event, filename) => {
          if (filename !== CSS_FILE && filename !== JS_FILE) return;
          clearTimeout(pending.get(filename));
          pending.set(filename, setTimeout(() => {
            pending.delete(filename);
            for (const wc of webContents.getAllWebContents()) apply(wc, filename);
          }, 200));
        });
      } catch (err) {
        log(`watch: ${err}`);
      }
    });
  } catch (err) {
    console.error("[claude-desktop-tweaks]", err);
  }
})();
require("./__ORIGINAL_MAIN__");
