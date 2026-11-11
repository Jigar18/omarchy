// Codex-style "Worked for 3m 12s ›" fold for the Code tab's transcript.
//
// Once an assistant turn has finished, everything before its final answer (tool calls, web
// searches, the narration in between) folds under one toggle row, so the answer is what you see;
// click the toggle to show the work again. Turns that are still running are left alone.
//
// The page draws a turn in one of two ways, and both are handled: while it runs (and when it is
// very long) each step is its own transcript row ("row mode"); once a normal-sized turn has finished,
// the whole turn is a single row whose steps are [data-item-key] blocks inside it ("block mode").
//
// A message's action bar (which holds its timestamp) is only built while the mouse is over it; until
// then the page leaves an empty MessageActions placeholder. The placeholder marks a finished message,
// and the times behind "Worked for …" are read by briefly hovering the message, then remembered in
// localStorage so they show up at once after a restart. The latest reply is the exception: its bar
// is drawn below the transcript rows (the "tail"), not in its own row, and only once the turn is done.
//
// Run by claude-desktop-tweaks (see the pacman hook) in an isolated world: this script sees the
// page's DOM but none of its JavaScript, and it re-runs whenever this file is saved. It never moves
// or removes the page's own (React) nodes: it tags transcript rows (or step blocks) with data-cdt, which
// claude-desktop-custom.css turns into hiding and styling, and adds its own toggle element.
//
// The transcript is a virtual list that measures each row as it mounts, so rows are tagged in the
// same task that mounts them (before they are drawn or measured): tagging them later would make the
// list re-measure and shift while you scroll. For the same reason, rows already on screen are not
// folded mid-scroll, and timestamps are only read once scrolling has stopped.
// Delete this file to switch the feature off.
(() => {
  const LOG = "[claude-desktop-tweaks]";
  globalThis.__claudeDesktopTweaks?.destroy?.();

  const ROW = '[data-testid="transcript-row"]';
  const ACTIONS = '[data-cds="MessageActions"]'; // placeholder or the built action bar
  const TAIL_ACTIONS = `[data-testid="transcript-tail-actions"] ${ACTIONS}`;
  const STAMP = "time[datetime]";
  const HOVER_TARGET = '[data-cds="UserMessage"], [data-cds="AssistantMessage"]';
  const STORE_KEY = "claude-desktop-tweaks.worked-fold.v1";
  const STORE_MAX = 4000;
  const RETRY_MS = 15000;
  const ATTR = "data-cdt";
  const PROBING_ATTR = "data-cdt-probing";
  const PASS_DELAY_MS = 120;
  const SCROLL_IDLE_MS = 300;
  const STRUCTURE = `${ROW}, [data-epitaxy-entry], [data-item-key], ${ACTIONS}`;

  const expanded = new Set(); // assistant entry ids whose work the user has unfolded
  const entries = new Map(); // assistant entry id -> { kinds, last, streaming }
  const times = new Map(); // entry id (user or assistant message) -> ISO timestamp
  const humans = new Map(); // assistant entry id -> id of the user message that started the turn
  const shapes = new Map(); // assistant entry id -> [first item of the final answer, last item] (row mode)
  const wanted = new Set(); // entry ids whose timestamp should be read by hovering
  const failed = new Map(); // entry id -> when reading its timestamp last failed
  let alive = true;
  let probing = false;
  let timer = 0;
  let idleTimer = 0;
  let lastScroll = -Infinity;
  const seen = new WeakSet(); // assistant rows that were already on screen at an earlier pass
  let saveTimer = 0;
  let errors = 0;
  let held = false;

  try {
    const saved = JSON.parse(localStorage.getItem(STORE_KEY) ?? "{}");
    for (const [id, time] of Object.entries(saved.times ?? {})) times.set(id, time);
    for (const [id, human] of Object.entries(saved.humans ?? {})) humans.set(id, human);
    for (const [id, shape] of Object.entries(saved.shapes ?? {})) shapes.set(id, shape);
  } catch {}
  const save = () => {
    saveTimer = 0;
    for (const map of [times, humans, shapes]) {
      for (const key of map.keys()) {
        if (map.size <= STORE_MAX) break;
        map.delete(key);
      }
    }
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify({ times: Object.fromEntries(times), humans: Object.fromEntries(humans), shapes: Object.fromEntries(shapes) }));
    } catch {}
  };
  const remember = (map, key, value) => {
    if (!key || !value || JSON.stringify(map.get(key)) === JSON.stringify(value)) return;
    map.set(key, value);
    if (!saveTimer) saveTimer = setTimeout(save, 1000);
  };
  const entryIdOf = (row) => row?.querySelector("[data-epitaxy-entry]")?.dataset.epitaxyEntry;

  // The row's action bar, present only once its message is complete. For the latest reply that bar
  // sits in the transcript's tail rather than in the row.
  const actionsOf = (row) => {
    const own = row.querySelector(ACTIONS);
    if (own || row.dataset.lastMessage !== "true" || row.dataset.perfRowStreaming === "true") return own;
    return row.closest('[data-testid="transcript-sizer"]')?.querySelector(TAIL_ACTIONS) ?? null;
  };
  const stampOf = (row) => actionsOf(row)?.querySelector(STAMP)?.getAttribute("datetime") ?? null;

  // Records the message's timestamp if its action bar is up, or queues a hover to read it.
  const needTime = (row, id) => {
    if (times.has(id)) return;
    const time = stampOf(row);
    if (time) remember(times, id, time);
    else wanted.add(id);
  };

  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const entryOf = (id) => {
    let entry = entries.get(id);
    if (!entry) entries.set(id, (entry = { kinds: new Map(), last: null, end: null, human: null, streaming: false }));
    return entry;
  };

  // "text" is a plain prose block (narration or the answer); anything else (tool calls, searches,
  // thinking, notices) is work. Takes a row (row mode) or a step block (block mode).
  const classify = (el) => {
    if (el.dataset.perfRow === "assistant_tool" || el.matches("[data-tool-anchor]") || el.querySelector("[data-tool-anchor]")) return "work";
    if (!el.querySelector('[data-cds="Prose"]')) return "work";
    for (const child of el.querySelectorAll("[aria-expanded]")) {
      if (!child.closest('[data-cds="Prose"], .cdt-fold')) return "work";
    }
    return "text";
  };

  // Where the final answer starts and the turn ends (row mode), as [start, last] item indexes: the
  // trailing run of prose rows after the last piece of work. Worked out from the rows seen so far,
  // or else from what was remembered earlier (the rows before and after the one on screen may not be
  // mounted, e.g. after a restart). null while the turn is running, can't be told yet, or has no work.
  const shapeOf = (id, entry) => {
    if (entry.streaming) return null;
    if (entry.last != null && entry.kinds.get(entry.last) === "text") {
      let i = entry.last;
      while (i > 0 && entry.kinds.get(i - 1) === "text") i--;
      if (i > 0 && entry.kinds.get(i - 1) === "work") {
        remember(shapes, id, [i, entry.last]);
        return [i, entry.last];
      }
      if (i > 0) return shapes.get(id) ?? null; // the row before the answer isn't known yet
      return null;
    }
    return entry.last == null ? shapes.get(id) ?? null : null;
  };

  const duration = (id) => {
    const ms = Date.parse(times.get(id) ?? "") - Date.parse(times.get(humans.get(id)) ?? "");
    if (!(ms >= 0 && ms < 7 * 24 * 3600e3)) return null;
    let s = Math.max(1, Math.round(ms / 1000));
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    s %= 60;
    return h ? `${h}h ${m}m ${s}s` : m ? `${m}m ${s}s` : `${s}s`;
  };

  const humanRowBefore = (row) => {
    const prev = row.previousElementSibling;
    return prev?.matches(ROW) && prev.dataset.perfRow === "human" ? prev : null;
  };

  const hover = (el, on) => {
    const rect = el.getBoundingClientRect();
    const init = { clientX: rect.left + rect.width / 2, clientY: rect.top + rect.height / 2, pointerId: 1, pointerType: "mouse", isPrimary: true };
    const types = on ? ["pointerover", "pointerenter", "mouseover", "mouseenter"] : ["pointerout", "pointerleave", "mouseout", "mouseleave"];
    for (const type of types) {
      const Event = type.startsWith("pointer") ? PointerEvent : MouseEvent;
      el.dispatchEvent(new Event(type, { ...init, bubbles: !/enter|leave/.test(type), composed: true }));
    }
  };

  // The row that holds a message's action bar (for a turn split over several rows, its last row).
  const rowWithActions = (id) => {
    for (const el of document.querySelectorAll(`[data-epitaxy-entry="${CSS.escape(id)}"]`)) {
      const row = el.closest(ROW);
      if (row && actionsOf(row)) return row;
    }
    return null;
  };

  const scrolling = () => performance.now() - lastScroll < SCROLL_IDLE_MS;
  // Runs a pass once scrolling has stopped (for work held back while it was going on).
  const afterScroll = () => {
    if (idleTimer || !alive) return;
    const wait = () => {
      const left = lastScroll + SCROLL_IDLE_MS - performance.now();
      idleTimer = left > 0 ? setTimeout(wait, left + 20) : 0;
      if (!idleTimer) run();
    };
    wait();
  };

  // Hovers one queued message for a moment (keeping its action bar invisible) so the page builds
  // the bar, and reads the timestamp from it. One message at a time; each takes a few frames.
  const probeNext = async () => {
    if (probing || !alive || !wanted.size) return;
    if (scrolling()) return afterScroll();
    let id, row;
    for (const candidate of wanted) {
      wanted.delete(candidate);
      if (times.has(candidate) || Date.now() - (failed.get(candidate) ?? 0) < RETRY_MS) continue;
      row = rowWithActions(candidate);
      if (row) {
        id = candidate;
        break;
      }
    }
    if (!id) return;
    probing = true;
    const target = row.querySelector(HOVER_TARGET) ?? row;
    const read = () => stampOf(row);
    let time = read();
    row.setAttribute(PROBING_ATTR, "");
    try {
      if (!time) {
        const hovered = target.matches(":hover");
        hover(target, true);
        for (let i = 0; i < 40 && !time && alive && row.isConnected; i++) {
          await sleep(25);
          time = read();
        }
        if (!hovered) hover(target, false);
        await sleep(50);
      }
    } finally {
      row.removeAttribute(PROBING_ATTR);
      probing = false;
    }
    if (time) {
      remember(times, id, time);
      failed.delete(id);
    } else {
      failed.set(id, Date.now());
      console.log(`${LOG} worked-fold: no timestamp for message ${id}`);
    }
    schedule();
  };

  const findScroller = (el) => {
    const known = el.closest('[data-testid="epitaxy-virtual-transcript"]');
    if (known) return known;
    for (let p = el.parentElement; p; p = p.parentElement) {
      if (p.scrollHeight > p.clientHeight && /auto|scroll/.test(getComputedStyle(p).overflowY)) return p;
    }
    return null;
  };

  const onToggle = (event) => {
    event.stopPropagation();
    const fold = event.currentTarget.closest(".cdt-fold");
    const id = fold?.dataset.entry;
    if (!id) return;
    const scroller = findScroller(fold);
    const top = fold.getBoundingClientRect().top;
    if (!expanded.delete(id)) expanded.add(id);
    run();
    // Keep the toggle where it was on screen, so the work opens (and closes) below it instead of
    // shoving the view around.
    const keep = () => {
      const now = document.querySelector(`.cdt-fold[data-entry="${CSS.escape(id)}"]`);
      if (!scroller || !now) return;
      const delta = now.getBoundingClientRect().top - top;
      if (Math.abs(delta) >= 1) scroller.scrollTop += delta;
    };
    keep();
    requestAnimationFrame(() => {
      keep();
      requestAnimationFrame(keep);
    });
  };

  const makeFold = () => {
    const fold = document.createElement("div");
    fold.className = "cdt-fold";
    const button = document.createElement("button");
    button.type = "button";
    button.className = "cdt-fold-button text-muted";
    const label = document.createElement("span");
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("viewBox", "0 0 16 16");
    svg.setAttribute("aria-hidden", "true");
    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("d", "M6 3.5 10.5 8 6 12.5");
    svg.append(path);
    button.append(label, svg);
    button.addEventListener("click", onToggle);
    button.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") event.stopPropagation();
    });
    const line = document.createElement("span");
    line.className = "cdt-fold-line";
    line.setAttribute("aria-hidden", "true");
    fold.append(button, line);
    return fold;
  };

  // Puts the toggle right before `anchor` (reusing the one already there) and brings it up to date.
  const renderFold = (anchor, id, entry, open, keep) => {
    let fold = anchor.previousElementSibling;
    if (!fold?.classList.contains("cdt-fold")) {
      fold = makeFold();
      anchor.before(fold);
    }
    keep.add(fold);
    if (fold.dataset.entry !== id) fold.dataset.entry = id;
    if (fold.hasAttribute("data-open") !== open) fold.toggleAttribute("data-open", open);
    const button = fold.firstElementChild;
    const took = duration(id);
    const text = took ? `Worked for ${took}` : "Worked";
    if (button.firstElementChild.textContent !== text) button.firstElementChild.textContent = text;
    const label = `${text}. ${open ? "Hide" : "Show"} the steps before the final answer.`;
    if (button.getAttribute("aria-label") !== label) button.setAttribute("aria-label", label);
    if (button.getAttribute("aria-expanded") !== String(open)) button.setAttribute("aria-expanded", String(open));
  };

  // Tags el, unless that would suddenly fold content already on screen while the user is scrolling
  // (e.g. a long turn whose end only just came into view): that waits until scrolling stops.
  const setState = (el, state, tagged) => {
    const current = el.getAttribute(ATTR);
    if (current == null && seen.has(el) && scrolling()) {
      held = true;
      return false;
    }
    tagged.add(el);
    if (current !== state) el.setAttribute(ATTR, state);
    return true;
  };

  // Makes sure both ends of the turn will have a timestamp: the user message before its first row
  // and the assistant message itself.
  const wantTimes = (firstRow, id, timedRow) => {
    const humanRow = firstRow && humanRowBefore(firstRow);
    if (humanRow) remember(humans, id, entryIdOf(humanRow));
    if (humanRow && humans.get(id)) needTime(humanRow, humans.get(id));
    if (timedRow) needTime(timedRow, id);
  };

  // Block mode: the finished turn is one row; fold the step blocks before its final answer.
  const passBlocks = (row, id, tagged, keep) => {
    if (row.dataset.perfRowStreaming === "true") return;
    if (row.querySelector('[data-cds="AssistantMessage"][data-is-streaming="true"]')) return;
    if (!actionsOf(row)) return;
    const blocks = [...row.querySelectorAll("[data-item-key]")].filter((el) => !el.parentElement.closest("[data-item-key]"));
    const kinds = blocks.map(classify);
    let start = kinds.length - 1;
    if (kinds[start] !== "text") return;
    while (start > 0 && kinds[start - 1] === "text") start--;
    if (start === 0) return;
    const entry = entryOf(id);
    const open = expanded.has(id);
    if (!blocks[0].hasAttribute(ATTR) && seen.has(row) && scrolling()) {
      held = true;
      return;
    }
    for (let i = 0; i <= start; i++) setState(blocks[i], (i < start ? "work" : "final") + (open ? "-open" : ""), tagged);
    wantTimes(row, id, row);
    renderFold(blocks[0], id, entry, open, keep);
  };

  const pass = () => {
    held = false;
    const present = [];
    const rows = [];
    const streaming = new Set();
    const tagged = new Set();
    const keep = new Set();
    for (const row of document.querySelectorAll(ROW)) {
      if (!row.dataset.perfRow?.startsWith("assistant")) continue;
      present.push(row);
      const entryEl = row.querySelector(":scope > [data-epitaxy-entry]") ?? row.querySelector("[data-epitaxy-entry]");
      const id = entryEl?.dataset.epitaxyEntry;
      if (!id) continue;
      if (entryEl.dataset.epitaxyItemIndex == null) {
        passBlocks(row, id, tagged, keep);
        continue;
      }
      const item = Number(entryEl.dataset.epitaxyItemIndex);
      if (!Number.isInteger(item)) continue;
      const entry = entryOf(id);
      entry.kinds.set(item, classify(row));
      if (row.dataset.perfRowStreaming === "true") streaming.add(id);
      if (actionsOf(row)) {
        entry.last = item;
      } else if (entry.last != null && item >= entry.last) {
        entry.last = null; // the turn picked up again after it had looked finished
      }
      rows.push({ row, entryEl, id, item, entry });
    }
    for (const [id, entry] of entries) entry.streaming = streaming.has(id);

    for (const { row, entryEl, id, item, entry } of rows) {
      const shape = shapeOf(id, entry);
      const start = shape?.[0];
      let state = null;
      if (shape && item <= shape[1]) {
        if (item === 0) state = "head";
        else if (item < start) state = "work";
        else if (item === start) state = "final";
        if (state && expanded.has(id)) state += "-open";
      }
      if (state && !setState(row, state, tagged)) state = null;
      if (state?.startsWith("head") && entryEl.firstElementChild) {
        const first = entryEl.firstElementChild.classList.contains("cdt-fold") ? entryEl.firstElementChild.nextElementSibling : entryEl.firstElementChild;
        wantTimes(row, id, null);
        if (first) renderFold(first, id, entry, state.endsWith("-open"), keep);
      }
      if (shape && item === shape[1]) wantTimes(null, id, row);
    }
    for (const el of document.querySelectorAll(`[${ATTR}]`)) if (!tagged.has(el)) el.removeAttribute(ATTR);
    for (const fold of document.querySelectorAll(".cdt-fold")) if (!keep.has(fold)) fold.remove();
    for (const row of present) seen.add(row);
    if (held) afterScroll();
    probeNext();
  };

  const run = () => {
    clearTimeout(timer);
    timer = 0;
    if (!alive) return;
    try {
      pass();
    } catch (err) {
      if (errors++ < 5) console.log(`${LOG} worked-fold: ${err?.stack ?? err}`);
    }
  };
  const schedule = () => {
    if (alive && !timer) timer = setTimeout(run, PASS_DELAY_MS);
  };

  // Rows (or a turn's steps) that just mounted are handled right away, in the same task, so they are
  // drawn and measured already folded; any other change (streaming text, our own toggles) waits for a
  // throttled pass.
  const addsStructure = (node) =>
    node.nodeType === 1 && !node.classList.contains("cdt-fold") && (node.matches(STRUCTURE) || (node.firstElementChild != null && node.querySelector(STRUCTURE) != null));
  const onMutations = (records) => {
    if (!alive) return;
    for (const record of records) {
      if (record.type === "attributes") return run();
      for (const node of record.addedNodes) if (addsStructure(node)) return run();
    }
    for (const record of records) {
      for (const node of record.addedNodes) if (!node.classList?.contains("cdt-fold")) return schedule();
      if (record.removedNodes.length) return schedule();
    }
  };
  const onScroll = (event) => {
    if (event.target instanceof Element && event.target.closest?.('[data-testid="epitaxy-virtual-transcript"]') == null && !event.target.querySelector?.(ROW)) return;
    lastScroll = performance.now();
  };
  document.addEventListener("scroll", onScroll, { capture: true, passive: true });
  const observer = new MutationObserver(onMutations);
  observer.observe(document.body ?? document.documentElement, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ["data-perf-row", "data-perf-row-streaming", "data-epitaxy-item-index", "data-is-streaming"],
  });
  run();

  globalThis.__claudeDesktopTweaks = {
    destroy() {
      alive = false;
      observer.disconnect();
      document.removeEventListener("scroll", onScroll, { capture: true });
      clearTimeout(timer);
      clearTimeout(idleTimer);
      if (saveTimer) {
        clearTimeout(saveTimer);
        save();
      }
      for (const el of document.querySelectorAll(".cdt-fold")) el.remove();
      for (const el of document.querySelectorAll(`[${ATTR}], [${PROBING_ATTR}]`)) {
        el.removeAttribute(ATTR);
        el.removeAttribute(PROBING_ATTR);
      }
    },
  };
  return `worked-fold loaded on ${location.pathname}`;
})();

// Theme guard for the pure-dark theme in claude-desktop-custom.css. A few seconds after each page
// load (and after in-app navigation) it reads the real on-screen colours of the sidebar, chat area,
// input box and your message bubbles. If an app update has renamed what the CSS targets and any of
// them no longer match, it logs which ones to ~/.cache/claude-desktop-tweaks.log and shows a small
// banner, so a broken theme is noticed right away instead of silently reverting.
;(() => {
  const LOG = "[claude-desktop-tweaks]";
  globalThis.__claudeDesktopThemeGuard?.destroy?.();

  const EXPECTED = {
    sidebar: "rgb(13, 13, 13)",
    "chat area": "rgb(0, 0, 0)",
    "input box": "rgb(14, 14, 14)",
    "message bubble": "rgb(27, 27, 27)",
  };
  const BANNER_ID = "cdt-theme-guard";
  let timer;

  const normalize = (color) => {
    const m = color.match(/^color\(srgb ([\d.]+) ([\d.]+) ([\d.]+)\)$/);
    return m ? `rgb(${m.slice(1).map((v) => Math.round(v * 255)).join(", ")})` : color;
  };
  const bg = (el) => (el ? normalize(getComputedStyle(el).backgroundColor) : "missing");

  const check = () => {
    if (document.documentElement.dataset.mode !== "dark") return;
    const sidebar = document.querySelector(".dframe-sidebar") ?? document.querySelector("aside");
    if (!sidebar) return; // not the main app window (e.g. a popup)
    const actual = {
      sidebar: bg(sidebar),
      "chat area": bg(document.querySelector("main")),
    };
    // Only check these when the page shows an editor / a sent message, so empty pages don't warn.
    if (document.querySelector('.ProseMirror[contenteditable="true"]')) {
      actual["input box"] = bg(document.querySelector('[data-cds="ChatComposer"] > [class*="bg-surface"]'));
    }
    // The page also keeps an empty, zero-height UserMessage placeholder, so only check a rendered one.
    const userMessage = [...document.querySelectorAll('[data-cds="UserMessage"], [data-testid*="user-message" i]')]
      .find((el) => el.childElementCount);
    if (userMessage) {
      actual["message bubble"] = bg(document.querySelector('[data-cds="UserMessage"] > [class*="message-bubble"]'));
    }
    const broken = Object.keys(actual).filter((k) => actual[k] !== EXPECTED[k]);
    document.getElementById(BANNER_ID)?.remove();
    if (!broken.length) return;

    console.log(`${LOG} theme guard: not applying to ${broken.map((k) => `${k} (${actual[k]}, want ${EXPECTED[k]})`).join(", ")}`);
    const banner = document.createElement("div");
    banner.id = BANNER_ID;
    banner.textContent = `Custom dark theme stopped applying to: ${broken.join(", ")}. An app update probably changed the UI — ask Claude to update ~/.config/claude-desktop-custom.css. (click to dismiss)`;
    Object.assign(banner.style, {
      position: "fixed", bottom: "12px", right: "12px", zIndex: "2147483647", maxWidth: "420px",
      padding: "10px 14px", borderRadius: "8px", background: "#3a1d1d", color: "#ffd9d9",
      font: "13px/1.4 system-ui, sans-serif", boxShadow: "0 4px 16px rgb(0 0 0 / 0.5)", cursor: "pointer",
    });
    banner.addEventListener("click", () => banner.remove());
    document.body.append(banner);
  };

  const schedule = () => {
    clearTimeout(timer);
    timer = setTimeout(check, 5000);
  };
  let lastPath = location.pathname;
  const navWatcher = setInterval(() => {
    if (location.pathname !== lastPath) {
      lastPath = location.pathname;
      schedule();
    }
  }, 1000);
  schedule();

  globalThis.__claudeDesktopThemeGuard = {
    check,
    destroy() {
      clearTimeout(timer);
      clearInterval(navWatcher);
      document.getElementById(BANNER_ID)?.remove();
    },
  };
  return `worked-fold and theme guard loaded on ${location.pathname}`;
})();
