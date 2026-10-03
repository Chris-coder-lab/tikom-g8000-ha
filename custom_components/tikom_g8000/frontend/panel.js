/* Tikom G8000 panel. Plain JavaScript, no external resources, no build step.
 * All text that comes from the backend or from the user is inserted with
 * textContent or escaped with esc(); never as raw HTML. */

const ROOM_CHARS = "0123456789abcdefghijklmnopqrstuvwxyz";
const STATE_TEXT = {
  docked: "An der Station", cleaning: "Reinigt", returning: "Fährt zur Station",
  paused: "Pausiert", idle: "Bereit", error: "Fehler", unavailable: "Nicht erreichbar",
  unknown: "Unbekannt",
};
const OPTION_TEXT = {
  sweep: "Saugen", mop: "Wischen", sweep_and_mop: "Saugen und wischen",
  low: "Niedrig", medium: "Mittel", high: "Hoch",
  mute: "Stumm", normal: "Normal", max: "Laut",
  english: "Englisch", german: "Deutsch", french: "Französisch",
  italian: "Italienisch", off: "Aus", spanish: "Spanisch", japanese: "Japanisch",
};
const MODE_TEXT = { sweep: "Saugen", mop: "Wischen", sweep_and_mop: "Beides" };
const SUPPLY_MAX = { filter: 150, edge_brush: 150, roll_brush: 300 };
const SUPPLY_TEXT = { filter: "Filter", edge_brush: "Seitenbürste", roll_brush: "Rollbürste" };

function esc(value) {
  return String(value ?? "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

const STYLE = `
:host { display: block; height: 100%; overflow: auto; box-sizing: border-box;
  background: var(--primary-background-color, #111); color: var(--primary-text-color, #e8e8e8);
  --tk-accent: var(--primary-color, #03a9f4); --tk-card: var(--card-background-color, #1c1c1c);
  --tk-line: var(--divider-color, rgba(255,255,255,.14)); --tk-soft: var(--secondary-text-color, #9aa0a6);
  --tk-ok: #3fb27f; --tk-warn: #f2a33a; --tk-bad: #e5534b;
  font-family: var(--paper-font-body1_-_font-family, Roboto, system-ui, sans-serif); }
* { box-sizing: border-box; }
.wrap { max-width: 1180px; margin: 0 auto; padding: 16px 16px 48px; }
h1, h2, h3, p { margin: 0; }
button, input, select { font: inherit; color: inherit; }
button { cursor: pointer; }
:focus-visible { outline: 2px solid var(--tk-accent); outline-offset: 2px; }

.top { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; margin-bottom: 14px; }
.top h1 { font-size: 22px; font-weight: 600; letter-spacing: .2px; }
.tabs { display: flex; gap: 4px; margin-left: auto; background: var(--tk-card); padding: 4px;
  border-radius: 12px; border: 1px solid var(--tk-line); overflow-x: auto; }
.tab { background: none; border: 0; padding: 8px 14px; flex: 1; border-radius: 9px; color: var(--tk-soft); white-space: nowrap; }
.tab[aria-selected="true"] { background: var(--tk-accent); color: #fff; }

.grid { display: grid; gap: 14px; grid-template-columns: minmax(0, 1.6fr) minmax(300px, 1fr); align-items: start; }
@media (max-width: 860px) { .grid { grid-template-columns: minmax(0, 1fr); } }
.card { background: var(--tk-card); border: 1px solid var(--tk-line); border-radius: 16px; padding: 16px; }
.card + .card { margin-top: 14px; }
.card h2 { font-size: 16px; font-weight: 600; margin-bottom: 10px; }
.card h3 { font-size: 14px; font-weight: 600; margin: 14px 0 6px; }
.hint { color: var(--tk-soft); font-size: 13px; line-height: 1.45; }
.row { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.row.between { justify-content: space-between; }
.stack { display: grid; gap: 10px; }

.status { display: flex; align-items: center; gap: 14px; }
.status .big { font-size: 26px; font-weight: 600; line-height: 1.1; }
.dot { width: 12px; height: 12px; border-radius: 50%; background: var(--tk-soft); flex: none; }
.dot.cleaning, .dot.returning { background: var(--tk-ok); box-shadow: 0 0 0 4px rgba(63,178,127,.2); }
.dot.docked { background: var(--tk-accent); }
.dot.error { background: var(--tk-bad); }
.battery { margin-left: auto; text-align: right; min-width: 84px; }
.battery b { font-size: 20px; font-weight: 600; }
.bar { height: 6px; border-radius: 3px; background: var(--tk-line); overflow: hidden; margin-top: 4px; }
.bar > i { display: block; height: 100%; background: var(--tk-ok); }
.bar.warn > i { background: var(--tk-warn); } .bar.bad > i { background: var(--tk-bad); }

.btn { border: 1px solid var(--tk-line); background: transparent; padding: 9px 14px; border-radius: 10px; }
.btn:hover { background: rgba(127,127,127,.12); }
.btn.primary { background: var(--tk-accent); border-color: var(--tk-accent); color: #fff; font-weight: 600; }
.btn.primary:hover { filter: brightness(1.08); }
.btn.danger { border-color: var(--tk-bad); color: var(--tk-bad); }
.btn.big { padding: 13px 18px; width: 100%; font-size: 16px; }
.btn[disabled] { opacity: .45; cursor: not-allowed; }
.seg { display: inline-flex; border: 1px solid var(--tk-line); border-radius: 10px; overflow: hidden; max-width: 100%; }
.seg button { background: none; border: 0; padding: 8px 13px; border-right: 1px solid var(--tk-line); }
.seg button:last-child { border-right: 0; }
.seg button[aria-pressed="true"] { background: var(--tk-accent); color: #fff; }
.seg.full { display: flex; } .seg.full button { flex: 1; }

.plan-wrap { position: relative; border-radius: 12px; overflow: hidden; background:
  radial-gradient(circle at 1px 1px, rgba(127,127,127,.22) 1px, transparent 0) 0 0 / 18px 18px, rgba(127,127,127,.06);
  border: 1px solid var(--tk-line); }
canvas { display: block; width: 100%; touch-action: none; }
.plan-empty { padding: 48px 20px; text-align: center; }

.chips { display: flex; flex-wrap: wrap; gap: 8px; }
.chip { display: inline-flex; align-items: center; gap: 8px; padding: 7px 12px; border-radius: 999px;
  border: 1px solid var(--tk-line); background: transparent; }
.chip i { width: 11px; height: 11px; border-radius: 50%; display: inline-block; }
.chip[aria-pressed="true"] { border-color: var(--tk-accent); background: color-mix(in srgb, var(--tk-accent) 22%, transparent); }

.steps { display: grid; gap: 8px; }
.step { display: flex; gap: 10px; align-items: center; padding: 9px 10px; border-radius: 10px; border: 1px solid var(--tk-line); }
.step .mark { width: 22px; height: 22px; border-radius: 50%; border: 2px solid var(--tk-line); flex: none; display: grid; place-items: center; font-size: 13px; }
.step.done .mark { background: var(--tk-ok); border-color: var(--tk-ok); color: #fff; }
.step .grow { flex: 1; }

.notice { padding: 10px 12px; border-radius: 10px; font-size: 14px; line-height: 1.4;
  background: color-mix(in srgb, var(--tk-warn) 16%, transparent); border: 1px solid color-mix(in srgb, var(--tk-warn) 55%, transparent); }
.notice.bad { background: color-mix(in srgb, var(--tk-bad) 16%, transparent); border-color: color-mix(in srgb, var(--tk-bad) 55%, transparent); }
.notice.ok { background: color-mix(in srgb, var(--tk-ok) 16%, transparent); border-color: color-mix(in srgb, var(--tk-ok) 55%, transparent); }

.tools { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 10px; }
.tool { display: inline-flex; gap: 6px; align-items: center; padding: 7px 11px; border-radius: 10px; border: 1px solid var(--tk-line); background: none; }
.tool[aria-pressed="true"] { background: var(--tk-accent); border-color: var(--tk-accent); color: #fff; }
.roomrow { display: grid; grid-template-columns: 30px 1fr 74px auto; gap: 8px; align-items: center; padding: 6px; border-radius: 10px; border: 1px solid transparent; }
.roomrow.active { border-color: var(--tk-accent); background: color-mix(in srgb, var(--tk-accent) 10%, transparent); }
.roomrow input[type=color] { width: 30px; height: 30px; padding: 0; border: 0; background: none; border-radius: 8px; }
input[type=text], input[type=number], select { background: transparent; border: 1px solid var(--tk-line); border-radius: 9px; padding: 8px 10px; min-width: 0; width: 100%; }
select option { background: var(--tk-card); color: var(--primary-text-color, #eee); }
input[type=range] { width: 100%; accent-color: var(--tk-accent); }
label.field { display: grid; gap: 4px; font-size: 13px; color: var(--tk-soft); }
.small { font-size: 13px; }
.num { font-variant-numeric: tabular-nums; }
.padgrid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; max-width: 280px; }
.padgrid .btn { padding: 14px 6px; }
.padgrid .empty { visibility: hidden; }
.supply { display: grid; gap: 4px; margin-bottom: 10px; }
.toggle { display: flex; align-items: center; justify-content: space-between; gap: 10px; padding: 6px 0; }
.running .plan-line { animation: none; }
.toast { position: fixed; left: 50%; bottom: 22px; transform: translateX(-50%); background: #202124; color: #fff;
  padding: 10px 16px; border-radius: 10px; box-shadow: 0 6px 24px rgba(0,0,0,.4); max-width: 90vw; z-index: 20; }
.toast.bad { background: #8c2a24; }
@media (max-width: 520px) {
  .top h1 { flex: 1 0 100%; }
  .tabs { margin-left: 0; width: 100%; box-sizing: border-box; }
  .tab { padding: 8px 6px; }
  .roomrow { grid-template-columns: 26px minmax(0, 1fr) 56px auto; gap: 6px; }
  .roomrow .btn { padding: 8px 9px; }
}
@media (prefers-reduced-motion: reduce) { * { animation: none !important; transition: none !important; } }
`;

/* ---------------------------------------------------------------- plan draft */
class Draft {
  constructor(w, h) {
    this.w = w; this.h = h;
    this.rows = Array.from({ length: h }, () => new Uint8Array(w));
    this.carpet = Array.from({ length: h }, () => new Uint8Array(w));
    this.dock = null;
  }
  static fromPlan(plan) {
    const d = new Draft(plan.w, plan.h);
    plan.rows.forEach((row, y) => { for (let x = 0; x < plan.w; x++) d.rows[y][x] = Math.max(0, ROOM_CHARS.indexOf(row[x])); });
    plan.carpet.forEach((row, y) => { for (let x = 0; x < plan.w; x++) d.carpet[y][x] = row[x] === "1" ? 1 : 0; });
    d.dock = plan.dock ? { ...plan.dock } : null;
    return d;
  }
  toPlan() {
    return {
      w: this.w, h: this.h,
      rows: this.rows.map((r) => Array.from(r, (c) => ROOM_CHARS[c]).join("")),
      carpet: this.carpet.map((r) => Array.from(r, (c) => (c ? "1" : "0")).join("")),
      dock: this.dock ? { x: this.dock.x, y: this.dock.y, heading: this.dock.heading, facing: this.dock.facing } : null,
    };
  }
  clone() {
    const d = new Draft(this.w, this.h);
    this.rows.forEach((r, y) => d.rows[y].set(r));
    this.carpet.forEach((r, y) => d.carpet[y].set(r));
    d.dock = this.dock ? { ...this.dock } : null;
    return d;
  }
  resized(w, h) {
    const d = new Draft(w, h);
    for (let y = 0; y < Math.min(h, this.h); y++) {
      d.rows[y].set(this.rows[y].subarray(0, Math.min(w, this.w)));
      d.carpet[y].set(this.carpet[y].subarray(0, Math.min(w, this.w)));
    }
    d.dock = this.dock && this.dock.x < w && this.dock.y < h ? { ...this.dock } : null;
    return d;
  }
  hasRooms() { return this.rows.some((r) => r.some((c) => c !== 0)); }
}

/* ---------------------------------------------------------------- plan view */
class PlanView {
  constructor() {
    this.canvas = document.createElement("canvas");
    this.ctx = this.canvas.getContext("2d");
    this.draft = null; this.rooms = {}; this.selected = new Set();
    this.line = null; this.recLine = null; this.image = null; this.imageMeta = null;
    this.mode = "view"; this.tool = "paint"; this.brush = 1; this.activeIdx = 1; this.running = false;
    this.onCell = null; this.onEditStart = null; this.onEditEnd = null; this.onChange = null;
    this._down = false; this._last = null; this._rectStart = null; this._rectNow = null;
    this._phase = 0; this._raf = 0;
    this.canvas.addEventListener("pointerdown", (e) => this._pointerDown(e));
    this.canvas.addEventListener("pointermove", (e) => this._pointerMove(e));
    this.canvas.addEventListener("pointerup", (e) => this._pointerUp(e));
    this.canvas.addEventListener("pointercancel", (e) => this._pointerUp(e));
    new ResizeObserver(() => this.draw()).observe(this.canvas);
  }

  /* visible cell range */
  _view() {
    const d = this.draft;
    let x0 = 0, y0 = 0, x1 = d.w - 1, y1 = d.h - 1;
    if (this.mode === "view") {
      let ax = d.w, ay = d.h, bx = -1, by = -1;
      const add = (x, y) => { ax = Math.min(ax, x); ay = Math.min(ay, y); bx = Math.max(bx, x); by = Math.max(by, y); };
      for (let y = 0; y < d.h; y++) for (let x = 0; x < d.w; x++) if (d.rows[y][x]) add(x, y);
      if (d.dock) add(Math.round(d.dock.x), Math.round(d.dock.y));
      if (bx >= 0) {
        const m = 4;
        x0 = Math.max(0, ax - m); y0 = Math.max(0, ay - m); x1 = Math.min(d.w - 1, bx + m); y1 = Math.min(d.h - 1, by + m);
      }
    }
    return { x0, y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
  }

  _size() {
    const v = this._view();
    const cssW = this.canvas.clientWidth || 600;
    return { v, s: cssW / v.w, cssW };
  }

  draw() {
    if (!this.draft) return;
    const { v, s, cssW } = this._size();
    const cssH = v.h * s;
    const dpr = window.devicePixelRatio || 1;
    this.canvas.style.height = `${cssH}px`;
    this.canvas.width = Math.round(cssW * dpr);
    this.canvas.height = Math.round(cssH * dpr);
    const c = this.ctx;
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    c.clearRect(0, 0, cssW, cssH);
    const d = this.draft;
    const px = (x) => (x - v.x0) * s, py = (y) => (y - v.y0) * s;
    const cs = getComputedStyle(this.canvas);
    const wall = cs.getPropertyValue("--tk-wall").trim() || "#e9edf2";

    if (this.image && this.imageMeta) {
      const m = this.imageMeta, wC = m.width_m * 10, hC = wC * (this.image.height / this.image.width);
      c.globalAlpha = m.opacity;
      c.drawImage(this.image, px(m.x_m * 10), py(m.y_m * 10), wC * s, hC * s);
      c.globalAlpha = 1;
    }
    // room fills
    const colorOf = {};
    Object.values(this.rooms).forEach((r) => { colorOf[r.idx] = r.color; });
    const selIdx = new Set([...this.selected].map((id) => this.rooms[id]?.idx));
    const paths = new Map();
    for (let y = v.y0; y < v.y0 + v.h; y++) for (let x = v.x0; x < v.x0 + v.w; x++) {
      const idx = d.rows[y][x];
      if (!idx) continue;
      if (!paths.has(idx)) paths.set(idx, new Path2D());
      paths.get(idx).rect(px(x), py(y), s + 0.6, s + 0.6);
    }
    paths.forEach((path, idx) => {
      c.globalAlpha = selIdx.has(idx) ? 0.92 : (this.selected.size && this.mode === "view" ? 0.42 : 0.62);
      c.fillStyle = colorOf[idx] || "#8a8f98";
      c.fill(path);
    });
    c.globalAlpha = 1;
    // carpet hatch
    c.strokeStyle = "rgba(255,255,255,.55)"; c.lineWidth = Math.max(1, s * 0.12);
    for (let y = v.y0; y < v.y0 + v.h; y++) for (let x = v.x0; x < v.x0 + v.w; x++) {
      if (!d.carpet[y][x] || !d.rows[y][x]) continue;
      c.beginPath(); c.moveTo(px(x), py(y + 1)); c.lineTo(px(x + 1), py(y)); c.stroke();
    }
    // grid in editor
    if (this.mode === "edit" && s >= 7) {
      c.strokeStyle = "rgba(127,127,127,.16)"; c.lineWidth = 1; c.beginPath();
      for (let x = v.x0; x <= v.x0 + v.w; x++) { c.moveTo(px(x), 0); c.lineTo(px(x), cssH); }
      for (let y = v.y0; y <= v.y0 + v.h; y++) { c.moveTo(0, py(y)); c.lineTo(cssW, py(y)); }
      c.stroke();
    }
    // walls = border between a room cell and a non-room cell
    c.strokeStyle = wall; c.lineWidth = Math.max(2, s * 0.35); c.lineCap = "round"; c.beginPath();
    for (let y = v.y0; y < v.y0 + v.h; y++) for (let x = v.x0; x < v.x0 + v.w; x++) {
      if (!d.rows[y][x]) continue;
      const open = (xx, yy) => !(xx >= 0 && yy >= 0 && xx < d.w && yy < d.h) || d.rows[yy][xx] === 0;
      if (open(x, y - 1)) { c.moveTo(px(x), py(y)); c.lineTo(px(x + 1), py(y)); }
      if (open(x, y + 1)) { c.moveTo(px(x), py(y + 1)); c.lineTo(px(x + 1), py(y + 1)); }
      if (open(x - 1, y)) { c.moveTo(px(x), py(y)); c.lineTo(px(x), py(y + 1)); }
      if (open(x + 1, y)) { c.moveTo(px(x + 1), py(y)); c.lineTo(px(x + 1), py(y + 1)); }
    }
    c.stroke();
    // labels
    const acc = {};
    for (let y = 0; y < d.h; y++) for (let x = 0; x < d.w; x++) {
      const idx = d.rows[y][x];
      if (idx) { const a = (acc[idx] ||= { x: 0, y: 0, n: 0 }); a.x += x; a.y += y; a.n++; }
    }
    c.textAlign = "center"; c.textBaseline = "middle";
    Object.entries(this.rooms).forEach(([id, room]) => {
      const a = acc[room.idx];
      if (!a || a.n < 12) return;
      const size = Math.max(11, Math.min(18, s * 2.4));
      c.font = `600 ${size}px Roboto, system-ui, sans-serif`;
      const tx = px(a.x / a.n + 0.5), ty = py(a.y / a.n + 0.5);
      c.lineJoin = "round"; c.lineWidth = 4; c.strokeStyle = "rgba(0,0,0,.55)"; c.strokeText(room.name, tx, ty);
      c.fillStyle = "#fff"; c.fillText(room.name, tx, ty);
    });
    // targets
    if (this.mode === "edit") {
      Object.values(this.rooms).forEach((room) => {
        if (!room.target) return;
        const tx = px(room.target[0] + 0.5), ty = py(room.target[1] + 0.5), r = Math.max(5, s * 0.9);
        c.strokeStyle = "#fff"; c.lineWidth = 2; c.beginPath(); c.arc(tx, ty, r, 0, 7); c.moveTo(tx - r - 3, ty); c.lineTo(tx + r + 3, ty); c.moveTo(tx, ty - r - 3); c.lineTo(tx, ty + r + 3); c.stroke();
      });
    }
    // rectangle preview
    if (this._rectStart && this._rectNow) {
      const [a, b] = [this._rectStart, this._rectNow];
      c.strokeStyle = "#fff"; c.setLineDash([6, 4]); c.lineWidth = 2;
      c.strokeRect(px(Math.min(a.x, b.x)), py(Math.min(a.y, b.y)), (Math.abs(a.x - b.x) + 1) * s, (Math.abs(a.y - b.y) + 1) * s);
      c.setLineDash([]);
    }
    // routes
    const drawLine = (pts, color, dashed) => {
      if (!pts || pts.length < 2) return;
      c.strokeStyle = color; c.lineWidth = Math.max(2.5, s * 0.35); c.lineJoin = "round"; c.lineCap = "round";
      c.setLineDash(dashed ? [s * 1.2, s * 0.9] : []); c.lineDashOffset = -this._phase;
      c.beginPath(); pts.forEach((p, i) => (i ? c.lineTo(px(p[0] + 0.5), py(p[1] + 0.5)) : c.moveTo(px(p[0] + 0.5), py(p[1] + 0.5))));
      c.stroke(); c.setLineDash([]);
      const e = pts[pts.length - 1];
      c.fillStyle = color; c.beginPath(); c.arc(px(e[0] + 0.5), py(e[1] + 0.5), Math.max(4, s * 0.7), 0, 7); c.fill();
    };
    drawLine(this.recLine, "#ffd54f", true);
    drawLine(this.line, "#ffffff", true);
    // dock
    if (d.dock) {
      const gx = px(d.dock.x + 0.5), gy = py(d.dock.y + 0.5), r = Math.max(8, s * 1.5);
      c.fillStyle = "#1f2430"; c.strokeStyle = "#fff"; c.lineWidth = 2;
      c.beginPath(); c.arc(gx, gy, r, 0, 7); c.fill(); c.stroke();
      const a = (d.dock.heading * Math.PI) / 180;
      c.beginPath(); c.moveTo(gx, gy); c.lineTo(gx + Math.cos(a) * r * 1.9, gy + Math.sin(a) * r * 1.9);
      c.lineWidth = 3; c.stroke();
      c.fillStyle = "#fff"; c.font = `700 ${r * 1.1}px Roboto, sans-serif`; c.fillText("⚡", gx, gy + 1);
    }
  }

  start() {
    if (this._raf) return;
    const tick = () => {
      if (this.running && !this._down) { this._phase = (this._phase + 0.8) % 1000; this.draw(); }
      this._raf = requestAnimationFrame(tick);
    };
    this._raf = requestAnimationFrame(tick);
  }
  stop() { cancelAnimationFrame(this._raf); this._raf = 0; }

  /* input */
  _cell(e) {
    const { v } = this._size();
    const r = this.canvas.getBoundingClientRect();
    return {
      x: Math.floor(((e.clientX - r.left) / r.width) * v.w) + v.x0,
      y: Math.floor(((e.clientY - r.top) / r.height) * v.h) + v.y0,
    };
  }
  _inside(p) { return p.x >= 0 && p.y >= 0 && p.x < this.draft.w && p.y < this.draft.h; }

  _paint(p) {
    const d = this.draft, b = this.brush, half = Math.floor(b / 2);
    for (let yy = p.y - half; yy < p.y - half + b; yy++) for (let xx = p.x - half; xx < p.x - half + b; xx++) {
      if (xx < 0 || yy < 0 || xx >= d.w || yy >= d.h) continue;
      if (this.tool === "paint") d.rows[yy][xx] = this.activeIdx;
      else if (this.tool === "erase") { d.rows[yy][xx] = 0; d.carpet[yy][xx] = 0; }
      else if (this.tool === "carpet") { if (d.rows[yy][xx]) d.carpet[yy][xx] = 1; }
      else if (this.tool === "carpet-erase") d.carpet[yy][xx] = 0;
    }
  }

  _pointerDown(e) {
    if (!this.draft) return;
    const p = this._cell(e);
    if (!this._inside(p)) return;
    if (this.mode === "view") { this.onCell?.(p, "click"); return; }
    this.canvas.setPointerCapture(e.pointerId);
    this._down = true; this._last = p;
    if (this.tool === "dock") { this.onEditStart?.(); const h = this.draft.dock?.heading ?? 0, f = this.draft.dock?.facing ?? "out"; this.draft.dock = { x: p.x, y: p.y, heading: h, facing: f }; this._finish(); return; }
    if (this.tool === "target") { this.onCell?.(p, "target"); this._down = false; return; }
    this.onEditStart?.();
    if (this.tool === "rect") { this._rectStart = p; this._rectNow = p; this.draw(); return; }
    this._paint(p); this.draw();
  }
  _pointerMove(e) {
    if (!this._down) return;
    const p = this._cell(e);
    if (this.tool === "rect") { this._rectNow = p; this.draw(); return; }
    // fill the gap between two pointer events
    const a = this._last, n = Math.max(Math.abs(p.x - a.x), Math.abs(p.y - a.y), 1);
    for (let i = 1; i <= n; i++) this._paint({ x: Math.round(a.x + ((p.x - a.x) * i) / n), y: Math.round(a.y + ((p.y - a.y) * i) / n) });
    this._last = p; this.draw();
  }
  _pointerUp() {
    if (!this._down) return;
    if (this.tool === "rect" && this._rectStart && this._rectNow) {
      const [a, b] = [this._rectStart, this._rectNow], d = this.draft;
      for (let y = Math.max(0, Math.min(a.y, b.y)); y <= Math.min(d.h - 1, Math.max(a.y, b.y)); y++)
        for (let x = Math.max(0, Math.min(a.x, b.x)); x <= Math.min(d.w - 1, Math.max(a.x, b.x)); x++) d.rows[y][x] = this.activeIdx;
    }
    this._finish();
  }
  _finish() { this._down = false; this._rectStart = this._rectNow = null; this.draw(); this.onEditEnd?.(); }
}

/* ---------------------------------------------------------------- panel */
const TABS = [["home", "Übersicht"], ["plan", "Plan"], ["drive", "Fahren"], ["care", "Zubehör"]];
const HEADINGS = [["Norden", -90], ["Osten", 0], ["Süden", 90], ["Westen", 180]];
const TOOLS = [
  ["paint", "Pinsel"], ["rect", "Rechteck"], ["erase", "Radierer"], ["carpet", "Teppich"],
  ["carpet-erase", "Teppich weg"], ["dock", "Station"], ["target", "Zielpunkt"],
];

class TikomPanel extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this.shadowRoot.innerHTML = `<style>${STYLE}</style><div class="wrap"><div id="top"></div><div id="body"></div></div><div id="toast"></div>`;
    this.$top = this.shadowRoot.getElementById("top");
    this.$body = this.shadowRoot.getElementById("body");
    this.$toast = this.shadowRoot.getElementById("toast");
    this.tab = "home"; this.snap = null; this.draft = null; this.undo = [];
    this.sel = new Set(); this.activeRoom = null; this.preview = null; this.previewKey = "";
    this.dirty = false; this.saveState = ""; this.saveTimer = 0; this.pending = false;
    this.image = null; this.imageData = null; this.imageLoading = false;
    this.pv = new PlanView(); this.fbDismissed = ""; this.confirmDelete = "";
    this.calSeconds = { speed: 5, turn: 3 }; this.recName = "";
    this.pv.onCell = (p, kind) => this._cellEvent(p, kind);
    this.pv.onEditStart = () => { this.undo.push(this.draft.clone()); if (this.undo.length > 30) this.undo.shift(); };
    this.pv.onEditEnd = () => this._edited();
    const r = this.shadowRoot;
    r.addEventListener("click", (e) => this._click(e));
    r.addEventListener("change", (e) => this._change(e));
    r.addEventListener("focusout", () => setTimeout(() => this.pending && this._render(), 50));
  }

  set hass(hass) {
    const first = !this._hass;
    this._hass = hass;
    if (first) this._start();
    const sig = this._signature();
    if (sig !== this._sig) { this._sig = sig; this._render(); }
  }
  get hass() { return this._hass; }
  set narrow(v) { this._narrow = v; }
  set panel(v) { this._panel = v; }
  set route(v) { this._route = v; }

  connectedCallback() { this.pv.start(); if (this._hass && !this._unsub) this._start(); }
  disconnectedCallback() {
    this.pv.stop();
    if (this._unsub) { this._unsub(); this._unsub = null; }
  }

  /* ---- backend */
  async ws(type, payload = {}) {
    return this._hass.callWS({ type: `tikom_g8000/${type}`, ...payload });
  }
  async act(type, payload = {}, okMessage = "") {
    try { const r = await this.ws(type, payload); if (okMessage) this.toast(okMessage); return r; }
    catch (err) { this.toast(err?.message || String(err), true); return null; }
  }
  async _start() {
    try {
      this._unsub = await this._hass.connection.subscribeMessage((snap) => this._onSnap(snap), { type: "tikom_g8000/subscribe" });
    } catch (err) {
      this.$body.innerHTML = `<div class="card"><h2>Keine Verbindung</h2><p class="hint">${esc(err?.message || err)}</p>
        <p class="hint">Ist die Integration „Tikom G8000“ eingerichtet und bist du als Administrator angemeldet?</p></div>`;
    }
  }
  toast(msg, bad = false) {
    this.$toast.innerHTML = `<div class="toast ${bad ? "bad" : ""}" role="status">${esc(msg)}</div>`;
    clearTimeout(this._toastT); this._toastT = setTimeout(() => (this.$toast.innerHTML = ""), 4200);
  }

  _onSnap(snap) {
    this.snap = snap;
    const editing = this.dirty || this.pv._down;
    if (!editing) {
      this.draft = snap.plan ? Draft.fromPlan(snap.plan) : this.draft || new Draft(100, 80);
      if (!snap.plan && this.draft.dock === null) this.draft.dock = null;
    }
    this.pv.draft = this.draft;
    this.pv.rooms = snap.rooms;
    this.pv.running = snap.job.running;
    this.pv.recLine = snap.recording_line;
    for (const id of [...this.sel]) if (!snap.rooms[id]) this.sel.delete(id);
    if (!this.activeRoom || !snap.rooms[this.activeRoom]) this.activeRoom = Object.keys(snap.rooms)[0] || null;
    this.pv.activeIdx = this.activeRoom ? snap.rooms[this.activeRoom].idx : 1;
    this._syncImage(snap);
    this._loadPreview();
    this._render();
  }

  async _syncImage(snap) {
    if (!snap.has_image) { this.image = null; this.imageData = null; this.pv.image = null; this.pv.imageMeta = null; return; }
    this.pv.imageMeta = snap.image_meta;
    if (this.image || this.imageLoading) return;
    this.imageLoading = true;
    const r = await this.act("get_image");
    this.imageLoading = false;
    if (!r?.image) return;
    this.imageData = r.image.data;
    const img = new Image();
    img.onload = () => { this.image = img; this.pv.image = img; this.pv.draw(); };
    img.src = r.image.data;
  }

  async _loadPreview() {
    const id = [...this.sel][0];
    const mode = this.snap?.settings.clean_mode || "sweep_and_mop";
    const key = id ? `${id}|${mode}|${JSON.stringify(this.snap.calibration)}|${this.snap.plan ? JSON.stringify(this.snap.plan.dock) : ""}|${this.snap.rooms[id]?.use_recorded}` : "";
    if (key === this.previewKey) return;
    this.previewKey = key;
    if (!id) { this.preview = null; this.pv.line = null; this.pv.draw(); return; }
    try {
      const p = await this.ws("preview", { room_id: id, mode });
      if (key !== this.previewKey) return;
      this.preview = p; this.pv.line = p.line;
    } catch (err) {
      if (key !== this.previewKey) return;
      this.preview = { error: err?.message || String(err) }; this.pv.line = null;
    }
    this.pv.draw(); this._render();
  }

  /* ---- helpers */
  _signature() {
    const s = this.snap, h = this._hass;
    if (!s || !h) return "x";
    const ids = [s.vacuum, ...Object.values(s.entities)];
    return ids.map((id) => { const st = h.states[id]; return st ? `${st.state}` : "-"; }).join("|");
  }
  ent(key) { const id = this.snap?.entities[key]; return id ? this._hass.states[id] : null; }
  num(key) { const st = this.ent(key); const n = st ? parseFloat(st.state) : NaN; return Number.isFinite(n) ? n : null; }
  vacState() { return this._hass?.states[this.snap?.vacuum]?.state || "unavailable"; }
  svc(domain, service, data) {
    return this._hass.callService(domain, service, data).catch((e) => this.toast(e?.message || String(e), true));
  }

  /* ---- render */
  _render() {
    if (!this.snap || !this._hass) return;
    const active = this.shadowRoot.activeElement;
    if (active && /^(INPUT|SELECT|TEXTAREA)$/.test(active.tagName) && active.type !== "checkbox") { this.pending = true; return; }
    this.pending = false;
    this.$top.innerHTML = `<div class="top"><h1>${esc(this.snap.title)}</h1>
      <div class="tabs" role="tablist">${TABS.map(([id, label]) =>
        `<button class="tab" role="tab" data-act="tab" data-tab="${id}" aria-selected="${this.tab === id}">${label}</button>`).join("")}</div></div>`;
    const view = { home: () => this._home(), plan: () => this._planTab(), drive: () => this._drive(), care: () => this._care() }[this.tab]();
    this.$body.innerHTML = view;
    const slot = this.shadowRoot.getElementById("planslot");
    if (slot) {
      this.pv.mode = this.tab === "plan" ? "edit" : "view";
      this.pv.tool = this.tool || "paint";
      this.pv.brush = this.brush || 1;
      slot.appendChild(this.pv.canvas);
      this.pv.draw();
    }
  }

  _statusCard() {
    const s = this.snap, st = this.vacState();
    const bat = this.num("battery");
    const room = s.job.running && s.job.room ? s.rooms[s.job.room]?.name : "";
    const sub = s.job.running ? [room && `Raum ${room}`, s.job.phase].filter(Boolean).join(", ") : (this.ent("problem")?.state === "on" ? "Der Roboter meldet ein Problem" : "");
    const barClass = bat !== null && bat < 20 ? "bad" : bat !== null && bat < 40 ? "warn" : "";
    return `<div class="card"><div class="status"><span class="dot ${esc(st)}"></span>
      <div><div class="big">${esc(STATE_TEXT[st] || st)}</div><div class="hint">${esc(sub)}</div></div>
      <div class="battery">${bat === null ? "" : `<b class="num">${Math.round(bat)} %</b><div class="bar ${barClass}"><i style="width:${Math.min(100, bat)}%"></i></div>`}</div></div>
      <div class="row" style="margin-top:12px">
        <button class="btn" data-act="svc" data-s="start">Start</button>
        <button class="btn" data-act="svc" data-s="pause">Pause</button>
        <button class="btn" data-act="svc" data-s="return_to_base">Zur Station</button>
        <button class="btn" data-act="svc" data-s="locate">Suchen</button>
      </div></div>`;
  }

  _home() {
    const s = this.snap;
    const rooms = Object.entries(s.rooms);
    const hasPlan = this.draft && this.draft.hasRooms();
    const chips = rooms.length
      ? `<div class="chips">${rooms.map(([id, r]) => `<button class="chip" data-act="sel" data-room="${esc(id)}" aria-pressed="${this.sel.has(id)}"><i style="background:${esc(r.color)}"></i>${esc(r.name)}</button>`).join("")}</div>`
      : "";
    const plan = hasPlan
      ? `<div class="plan-wrap" id="planslot"></div><p class="hint" style="margin-top:8px">Tippe auf einen Raum, um ihn auszuwählen. Mehrere Räume werden nacheinander gereinigt.</p>`
      : `<div class="plan-wrap"><div class="plan-empty"><h2>Noch kein Wohnungsplan</h2><p class="hint" style="margin:6px 0 14px">Male deine Räume, setze die Station, dann erscheinen sie hier zum Antippen.</p><button class="btn primary" data-act="tab" data-tab="plan">Plan zeichnen</button></div></div>`;
    return `<div class="stack">${this._statusCard()}
      <div class="grid"><div>
        <div class="card"><h2>Wohnung</h2>${plan}${chips ? `<div style="margin-top:12px">${chips}</div>` : ""}</div>
      </div><div>${this._actionCard()}${this._setupCard()}${this._feedbackCard()}${this._quickCard()}</div></div></div>`;
  }

  _actionCard() {
    const s = this.snap, mode = s.settings.clean_mode;
    if (s.job.running) {
      const names = s.job.queue.map((id) => s.rooms[id]?.name).filter(Boolean);
      return `<div class="card"><h2>Läuft gerade</h2><p>${esc(s.job.phase || "Starte")}</p>
        <p class="hint" style="margin:6px 0 12px">${names.length ? `Noch offen: ${esc(names.join(", "))}` : ""}</p>
        <button class="btn danger big" data-act="abort">Abbrechen und zur Station</button></div>`;
    }
    const picked = [...this.sel].map((id) => s.rooms[id]?.name).filter(Boolean);
    let info = `<p class="hint">Wähle einen oder mehrere Räume im Plan.</p>`;
    if (this.preview?.error) info = `<div class="notice">${esc(this.preview.error)}</div>`;
    else if (this.preview) info = `<p class="hint">Weg zum Raum ${this.preview.source === "plan" ? "aus dem Plan" : "aus der Aufnahme"}, ca. ${Math.round(this.preview.seconds)} Sekunden Fahrt (weiße Linie im Plan).</p>`;
    const docked = this.vacState() === "docked";
    return `<div class="card"><h2>Reinigen</h2>
      <p style="margin-bottom:10px">${picked.length ? esc(picked.join(", ")) : "Kein Raum gewählt"}</p>
      <div class="seg full" style="margin-bottom:12px">${Object.entries(MODE_TEXT).map(([k, t]) => `<button data-act="mode" data-mode="${k}" aria-pressed="${mode === k}">${t}</button>`).join("")}</div>
      ${info}
      ${docked ? "" : `<div class="notice" style="margin-top:10px">Der Roboter muss auf der Station stehen, sonst startet kein Raumauftrag.</div>`}
      <div class="row" style="margin-top:12px"><button class="btn primary big" data-act="clean" ${picked.length && docked && !this.preview?.error ? "" : "disabled"}>Los</button></div>
      <div class="row" style="margin-top:8px"><button class="btn" data-act="dry" ${picked.length && docked && !this.preview?.error ? "" : "disabled"}>Nur hinfahren (Test)</button></div></div>`;
  }

  _setupCard() {
    const s = this.snap, d = this.draft;
    const steps = [
      [s.calibration.calibrated, "Roboter messen", "Geschwindigkeit und Drehung messen, dauert 2 Minuten.", "drive", "Messen"],
      [d && d.hasRooms() && !!d.dock, "Plan malen und Station setzen", "Wände, Räume und Teppiche einzeichnen.", "plan", "Zeichnen"],
      [Object.keys(s.rooms).length > 0, "Räume benennen", "Zum Beispiel Wohnzimmer oder Küche.", "plan", "Benennen"],
      [!!s.last_run && !s.last_run.error, "Testfahrt", "Wähle einen Raum und tippe auf „Nur hinfahren“.", "home", ""],
    ];
    if (steps.every((x) => x[0])) return "";
    return `<div class="card"><h2>Einrichtung</h2><div class="steps">${steps.map(([done, title, text, tab, label]) =>
      `<div class="step ${done ? "done" : ""}"><span class="mark">${done ? "✓" : ""}</span><div class="grow"><div>${esc(title)}</div><div class="hint">${esc(text)}</div></div>
      ${!done && label ? `<button class="btn" data-act="tab" data-tab="${tab}">${label}</button>` : ""}</div>`).join("")}</div></div>`;
  }

  _feedbackCard() {
    const lr = this.snap.last_run;
    if (!lr || lr.error || this.snap.job.running) return "";
    const key = JSON.stringify(lr);
    if (this.fbDismissed === key) return "";
    return `<div class="card"><h2>Wie genau war die Fahrt?</h2><p class="hint" style="margin-bottom:10px">Jede Rückmeldung verbessert die Messwerte um 5 Prozent.</p>
      <div class="row">
        <button class="btn" data-act="fb" data-kind="too_short">Zu kurz</button>
        <button class="btn" data-act="fb" data-kind="too_long">Zu weit</button>
        <button class="btn" data-act="fb" data-kind="over_turn">Zu viel gedreht</button>
        <button class="btn" data-act="fb" data-kind="under_turn">Zu wenig gedreht</button>
        <button class="btn" data-act="fb-ok">Passt</button></div></div>`;
  }

  _control(key, label) {
    const st = this.ent(key);
    if (!st) return "";
    const id = this.snap.entities[key], dom = id.split(".")[0];
    if (dom === "select") {
      const opts = st.attributes.options || [];
      const body = opts.length <= 4
        ? `<div class="seg">${opts.map((o) => `<button data-act="select" data-ent="${esc(id)}" data-opt="${esc(o)}" aria-pressed="${st.state === o}">${esc(OPTION_TEXT[o] || o)}</button>`).join("")}</div>`
        : `<select data-change="select" data-ent="${esc(id)}">${opts.map((o) => `<option value="${esc(o)}" ${st.state === o ? "selected" : ""}>${esc(OPTION_TEXT[o] || o)}</option>`).join("")}</select>`;
      return `<div class="stack" style="gap:6px"><span class="small hint">${esc(label)}</span>${body}</div>`;
    }
    if (dom === "switch") return `<label class="toggle"><span>${esc(label)}</span><input type="checkbox" data-change="switch" data-ent="${esc(id)}" ${st.state === "on" ? "checked" : ""}></label>`;
    return "";
  }

  _quickCard() {
    const parts = [this._control("water", "Wassermenge"), this._control("carpet_boost", "Teppich Druckerhöhung")].filter(Boolean);
    const fan = this._hass.states[this.snap.vacuum]?.attributes.fan_speed_list;
    if (!parts.length && !fan) return "";
    const cur = this._hass.states[this.snap.vacuum]?.attributes.fan_speed;
    const fanHtml = fan?.length ? `<div class="stack" style="gap:6px"><span class="small hint">Saugkraft</span><div class="seg">${fan.map((f) => `<button data-act="fan" data-fan="${esc(f)}" aria-pressed="${cur === f}">${esc(OPTION_TEXT[f] || f)}</button>`).join("")}</div></div>` : "";
    return `<div class="card"><h2>Schnell einstellen</h2><div class="stack">${fanHtml}${parts.join("")}</div></div>`;
  }

  /* ---- plan tab */
  _planTab() {
    const s = this.snap, d = this.draft;
    const tool = this.tool || "paint", brush = this.brush || 1;
    const rooms = Object.entries(s.rooms);
    const toolsHtml = `<div class="tools">${TOOLS.map(([id, label]) => `<button class="tool" data-act="tool" data-tool="${id}" aria-pressed="${tool === id}">${label}</button>`).join("")}
      <span class="seg" title="Pinselgröße">${[1, 3, 5].map((b) => `<button data-act="brush" data-b="${b}" aria-pressed="${brush === b}">${b * 10} cm</button>`).join("")}</span>
      <button class="tool" data-act="undo" ${this.undo.length ? "" : "disabled"}>Rückgängig</button></div>`;
    const hints = {
      paint: "Fahre mit dem Finger oder der Maus über den Boden des gewählten Raums.",
      rect: "Ziehe ein Rechteck für den gewählten Raum auf.",
      erase: "Löscht Boden und Teppich. Alles ohne Farbe gilt als Wand.",
      carpet: "Markiert Teppichboden. Beim Wischen fährt der Roboter dort nicht durch.",
      "carpet-erase": "Entfernt die Teppichmarkierung.",
      dock: "Tippe dorthin, wo die Ladestation steht.",
      target: "Tippe in den gewählten Raum, wohin der Roboter fahren soll. Sonst nimmt die App die Mitte.",
    };
    const roomRows = rooms.map(([id, r]) => `<div class="roomrow ${this.activeRoom === id ? "active" : ""}">
        <input type="color" value="${esc(r.color)}" data-change="room-color" data-room="${esc(id)}" aria-label="Farbe ${esc(r.name)}">
        <button class="btn" style="text-align:left;border:0" data-act="active" data-room="${esc(id)}" aria-pressed="${this.activeRoom === id}"><input type="text" value="${esc(r.name)}" data-change="room-name" data-room="${esc(id)}" aria-label="Name" maxlength="40"></button>
        <input type="number" min="1" max="90" value="${esc(r.minutes)}" data-change="room-minutes" data-room="${esc(id)}" aria-label="Minuten">
        <button class="btn ${this.confirmDelete === id ? "danger" : ""}" data-act="room-del" data-room="${esc(id)}" aria-label="Raum löschen">${this.confirmDelete === id ? "Sicher?" : "✕"}</button>
        ${r.has_route ? `<div></div><label class="field" style="grid-column:2/-1">Weg zum Raum<select data-change="room-src" data-room="${esc(id)}"><option value="plan" ${r.use_recorded ? "" : "selected"}>Aus dem Plan berechnen</option><option value="rec" ${r.use_recorded ? "selected" : ""}>Aus meiner Aufnahme</option></select></label>` : ""}
      </div>`).join("");
    const dock = d.dock;
    const meta = s.image_meta;
    return `<div class="grid"><div><div class="card"><h2>Plan zeichnen</h2>${toolsHtml}
        <div class="plan-wrap" id="planslot"></div>
        <p class="hint" style="margin-top:8px">${esc(hints[tool])} <span id="savestate">${esc(this.saveState)}</span></p></div></div>
      <div>
        <div class="card"><h2>Räume</h2>${roomRows || `<p class="hint">Lege deinen ersten Raum an, dann kannst du ihn malen.</p>`}
          <div class="row" style="margin-top:10px"><input type="text" id="newroom" placeholder="Neuer Raum, z. B. Wohnzimmer" maxlength="40" style="flex:1"><button class="btn primary" data-act="room-add">Anlegen</button></div>
          <p class="hint" style="margin-top:8px">Die Zahl rechts sind die Minuten, die der Roboter im Raum saugt.</p></div>
        <div class="card"><h2>Ladestation</h2>
          ${dock ? `<div class="stack"><div class="stack" style="gap:6px"><span class="small hint">Die Station schaut in Richtung</span><div class="seg full">${HEADINGS.map(([t, a]) => `<button data-act="heading" data-a="${a}" aria-pressed="${Math.round(dock.heading) === a}">${t}</button>`).join("")}</div></div>
          <label class="field">Roboter sitzt auf der Station<select data-change="facing"><option value="out" ${dock.facing === "out" ? "selected" : ""}>mit der Front zum Raum</option><option value="in" ${dock.facing === "in" ? "selected" : ""}>mit der Front zur Wand (fährt erst zurück)</option></select></label></div>`
            : `<p class="hint">Wähle das Werkzeug „Station“ und tippe auf den Plan.</p>`}</div>
        <div class="card"><h2>Größe und Hintergrundbild</h2>
          <div class="row"><label class="field" style="flex:1">Breite in m<input type="number" min="1" max="20" step="0.5" value="${d.w / 10}" data-change="size-w"></label>
          <label class="field" style="flex:1">Höhe in m<input type="number" min="1" max="20" step="0.5" value="${d.h / 10}" data-change="size-h"></label></div>
          <div class="row" style="margin-top:12px"><label class="btn" style="cursor:pointer">Bild wählen<input type="file" accept="image/png,image/jpeg,image/webp" data-change="image" hidden></label>
            ${meta ? `<button class="btn" data-act="image-del">Bild entfernen</button>` : ""}</div>
          ${meta ? `<div class="stack" style="margin-top:12px"><label class="field">Breite des Bildes in m<input type="number" min="1" max="100" step="0.5" value="${esc(meta.width_m)}" data-change="img-w"></label>
            <div class="row"><label class="field" style="flex:1">Nach rechts in m<input type="number" step="0.1" value="${esc(meta.x_m)}" data-change="img-x"></label>
            <label class="field" style="flex:1">Nach unten in m<input type="number" step="0.1" value="${esc(meta.y_m)}" data-change="img-y"></label></div>
            <label class="field">Deckkraft<input type="range" min="0.1" max="1" step="0.05" value="${esc(meta.opacity)}" data-change="img-o"></label></div>`
            : `<p class="hint" style="margin-top:8px">Optional: ein Foto oder Bild deines Grundrisses als Vorlage zum Nachzeichnen.</p>`}</div>
      </div></div>`;
  }

  /* ---- drive tab */
  _drive() {
    const s = this.snap, cal = s.calibration;
    const rec = s.recording;
    const docked = this.vacState() === "docked";
    return `<div class="grid"><div>
      <div class="card"><h2>Roboter messen</h2>
        ${cal.calibrated ? `<div class="notice ok">Gemessen: ${cal.speed_cm_s.toFixed(1)} cm pro Sekunde, ${cal.turn_deg_s.toFixed(0)} Grad pro Sekunde.</div>` : `<div class="notice">Noch nicht gemessen. Ohne Messung gibt es keine Wege aus dem Plan.</div>`}
        <p class="hint" style="margin:10px 0 0">Stelle den Roboter mit Platz vor sich auf den Boden und lege einen Zollstock bereit.</p>
        <h3>1. Geschwindigkeit</h3>
        <div class="row"><label class="field" style="width:110px">Sekunden<input type="number" min="1" max="30" step="1" value="${this.calSeconds.speed}" data-change="cal-sec-speed"></label>
          <button class="btn" data-act="cal-drive-speed">Vorwärts fahren</button></div>
        <div class="row" style="margin-top:8px"><label class="field" style="width:110px">Strecke in cm<input type="number" min="1" max="2000" id="cal-speed" placeholder="z. B. 120"></label>
          <button class="btn primary" data-act="cal-save-speed">Speichern</button></div>
        <h3>2. Drehung</h3>
        <div class="row"><label class="field" style="width:110px">Sekunden<input type="number" min="1" max="30" step="1" value="${this.calSeconds.turn}" data-change="cal-sec-turn"></label>
          <button class="btn" data-act="cal-drive-turn">Links drehen</button></div>
        <div class="row" style="margin-top:8px"><label class="field" style="width:110px">Winkel in Grad<input type="number" min="1" max="2000" id="cal-turn" placeholder="z. B. 180"></label>
          <button class="btn primary" data-act="cal-save-turn">Speichern</button></div>
        <p class="hint" style="margin-top:8px">Ein Viertelkreis sind 90 Grad, eine halbe Drehung 180 Grad.</p></div>
      </div><div>
      <div class="card"><h2>Von Hand fahren und aufnehmen</h2>
        <div class="padgrid"><span class="empty btn"></span><button class="btn" data-act="drive" data-d="forward">Vor</button><span class="empty btn"></span>
          <button class="btn" data-act="drive" data-d="left">Links</button><button class="btn" data-act="drive" data-d="reverse">Zurück</button><button class="btn" data-act="drive" data-d="right">Rechts</button></div>
        <label class="field" style="margin-top:12px">Sekunden pro Tastendruck<input type="number" min="0.5" max="30" step="0.5" value="${esc(s.settings.step_seconds)}" data-change="step-seconds"></label>
        <h3>Aufnahme</h3>
        <p class="num" style="word-break:break-all">${rec ? esc(rec) : `<span class="hint">Noch leer. Jeder Tastendruck wird hier festgehalten.</span>`}</p>
        <div class="row" style="margin-top:10px"><button class="btn" data-act="rec" data-r="clear" ${rec ? "" : "disabled"}>Leeren</button>
          <button class="btn" data-act="rec" data-r="test" ${rec && docked ? "" : "disabled"}>Abspielen</button></div>
        <div class="row" style="margin-top:10px"><input type="text" id="recname" placeholder="Als Raum speichern, z. B. Bad" maxlength="40" style="flex:1" value="${esc(this.recName)}"><button class="btn primary" data-act="rec-save" ${rec ? "" : "disabled"}>Speichern</button></div>
        <p class="hint" style="margin-top:8px">Gelb gestrichelt zeigt der Plan, wo die Aufnahme enden sollte. Damit kannst du Wege auch dort festlegen, wo der Plan keinen findet.</p></div>
      </div></div>`;
  }

  /* ---- care tab */
  _care() {
    const keys = ["filter", "edge_brush", "roll_brush"];
    const supplies = keys.filter((k) => this.ent(k)).map((k) => {
      const v = this.num(k); if (v === null) return "";
      const max = Math.max(SUPPLY_MAX[k], v);
      const pct = Math.max(0, Math.min(100, (v / max) * 100));
      const cls = pct < 10 ? "bad" : pct < 25 ? "warn" : "";
      const reset = { filter: "reset_filter", edge_brush: "reset_edge_brush", roll_brush: "reset_roll_brush" }[k];
      return `<div class="supply"><div class="row between"><span>${SUPPLY_TEXT[k]}</span><span class="num">${Math.round(v)} Std.</span></div>
        <div class="bar ${cls}"><i style="width:${pct}%"></i></div>
        ${this.ent(reset) ? `<div><button class="btn" style="margin-top:6px" data-act="press" data-ent="${esc(this.snap.entities[reset])}">${SUPPLY_TEXT[k]} getauscht</button></div>` : ""}</div>`;
    }).join("");
    const settings = [["mode", "Betriebsmodus"], ["water", "Wassermenge"], ["carpet_boost", "Teppich Druckerhöhung"], ["carpet_detection", "Teppicherkennung"], ["volume", "Lautstärke"], ["language", "Sprache des Roboters"]]
      .map(([k, l]) => this._control(k, l)).filter(Boolean).join("");
    const area = this.num("area"), time = this.num("time");
    return `<div class="grid"><div><div class="card"><h2>Zubehör: verbleibende Zeit</h2>${supplies || `<p class="hint">Die Zubehör-Werte kommen von Tuya Local. Sie erscheinen, sobald der Roboter mit dem Typ „tikom_g8000_robot_vacuum_mop“ eingerichtet ist.</p>`}</div>
      <div class="card"><h2>Letzte Reinigung</h2><div class="row between"><span>Fläche</span><span class="num">${area === null ? "–" : `${area} m²`}</span></div>
        <div class="row between"><span>Dauer</span><span class="num">${time === null ? "–" : `${time} Min.`}</span></div></div></div>
      <div><div class="card"><h2>Einstellungen</h2><div class="stack">${settings || `<p class="hint">Noch keine Einstellungen gefunden.</p>`}</div></div></div></div>`;
  }

  /* ---- events */
  async _click(e) {
    const t = e.target.closest("[data-act]");
    if (!t) return;
    const a = t.dataset.act, s = this.snap;
    if (a === "tab") { this.tab = t.dataset.tab; this.confirmDelete = ""; this._render(); }
    else if (a === "svc") this.svc("vacuum", t.dataset.s, { entity_id: s.vacuum });
    else if (a === "sel") { const id = t.dataset.room; this.sel.has(id) ? this.sel.delete(id) : this.sel.add(id); this.pv.selected = this.sel; this._loadPreview(); this._render(); }
    else if (a === "mode") { await this.act("setting", { key: "clean_mode", value: t.dataset.mode }); }
    else if (a === "clean") await this.act("clean", { rooms: [...this.sel], mode: s.settings.clean_mode }, "Los geht's");
    else if (a === "dry") await this.act("clean", { rooms: [[...this.sel][0]], dry_run: true }, "Testfahrt gestartet");
    else if (a === "abort") await this.act("abort", {}, "Abgebrochen");
    else if (a === "fb") { await this.act("calibration", { action: "feedback", kind: t.dataset.kind }, "Danke, Messwerte angepasst"); this.fbDismissed = JSON.stringify(s.last_run); this._render(); }
    else if (a === "fb-ok") { this.fbDismissed = JSON.stringify(s.last_run); this._render(); }
    else if (a === "select") this.svc("select", "select_option", { entity_id: t.dataset.ent, option: t.dataset.opt });
    else if (a === "fan") this.svc("vacuum", "set_fan_speed", { entity_id: s.vacuum, fan_speed: t.dataset.fan });
    else if (a === "press") this.svc("button", "press", { entity_id: t.dataset.ent });
    else if (a === "tool") { this.tool = t.dataset.tool; this._render(); }
    else if (a === "brush") { this.brush = Number(t.dataset.b); this._render(); }
    else if (a === "undo") { const d = this.undo.pop(); if (d) { this.draft = d; this.pv.draft = d; this._edited(true); } }
    else if (a === "active") { if (e.target.tagName !== "INPUT") { this.activeRoom = t.dataset.room; this.pv.activeIdx = s.rooms[this.activeRoom].idx; this._render(); } }
    else if (a === "room-add") {
      const input = this.shadowRoot.getElementById("newroom"), name = input.value.trim();
      if (!name) return;
      const r = await this.act("room", { action: "add", name });
      if (r) { input.value = ""; this.activeRoom = r.room_id; this.tool = "rect"; }
    } else if (a === "room-del") {
      if (this.confirmDelete !== t.dataset.room) { this.confirmDelete = t.dataset.room; this._render(); return; }
      this.confirmDelete = ""; this.sel.delete(t.dataset.room);
      await this.act("room", { action: "delete", room_id: t.dataset.room }, "Raum gelöscht");
    } else if (a === "heading") { this.undo.push(this.draft.clone()); this.draft.dock.heading = Number(t.dataset.a); this._edited(); }
    else if (a === "image-del") { await this.act("save_plan", { plan: this.draft.toPlan(), image: null }); this.image = null; this.pv.image = null; this.imageData = null; }
    else if (a === "drive") await this.act("drive", { direction: t.dataset.d, seconds: Number(s.settings.step_seconds) });
    else if (a === "rec") await this.act("recording", { action: t.dataset.r }, t.dataset.r === "test" ? "Spiele ab" : "");
    else if (a === "rec-save") {
      const name = this.shadowRoot.getElementById("recname").value.trim();
      if (!name) { this.toast("Gib dem Raum einen Namen.", true); return; }
      const r = await this.act("recording", { action: "save_as_room", name }, "Raum gespeichert");
      if (r) this.recName = "";
    } else if (a === "cal-drive-speed") await this.act("drive", { direction: "forward", seconds: this.calSeconds.speed, record: false });
    else if (a === "cal-drive-turn") await this.act("drive", { direction: "left", seconds: this.calSeconds.turn, record: false });
    else if (a === "cal-save-speed") {
      const v = parseFloat(this.shadowRoot.getElementById("cal-speed").value);
      if (v > 0) await this.act("calibration", { action: "measure_speed", seconds: this.calSeconds.speed, measured: v }, "Geschwindigkeit gespeichert");
    } else if (a === "cal-save-turn") {
      const v = parseFloat(this.shadowRoot.getElementById("cal-turn").value);
      if (v > 0) await this.act("calibration", { action: "measure_turn", seconds: this.calSeconds.turn, measured: v }, "Drehung gespeichert");
    }
  }

  async _change(e) {
    const t = e.target, k = t.dataset.change, s = this.snap;
    if (!k) return;
    if (k === "select") this.svc("select", "select_option", { entity_id: t.dataset.ent, option: t.value });
    else if (k === "switch") this.svc("switch", t.checked ? "turn_on" : "turn_off", { entity_id: t.dataset.ent });
    else if (k === "room-name") await this.act("room", { action: "update", room_id: t.dataset.room, name: t.value.trim() || s.rooms[t.dataset.room].name });
    else if (k === "room-color") await this.act("room", { action: "update", room_id: t.dataset.room, color: t.value });
    else if (k === "room-minutes") await this.act("room", { action: "update", room_id: t.dataset.room, minutes: Number(t.value) });
    else if (k === "room-src") await this.act("room", { action: "update", room_id: t.dataset.room, use_recorded: t.value === "rec" });
    else if (k === "facing") { this.undo.push(this.draft.clone()); this.draft.dock.facing = t.value; this._edited(); }
    else if (k === "size-w" || k === "size-h") {
      const w = k === "size-w" ? Math.round(Number(t.value) * 10) : this.draft.w, h = k === "size-h" ? Math.round(Number(t.value) * 10) : this.draft.h;
      if (w >= 10 && w <= 200 && h >= 10 && h <= 200) { this.undo.push(this.draft.clone()); this.draft = this.draft.resized(w, h); this.pv.draft = this.draft; this._edited(); }
    } else if (k === "step-seconds") await this.act("setting", { key: "step_seconds", value: Number(t.value) });
    else if (k === "cal-sec-speed") this.calSeconds.speed = Math.min(30, Math.max(1, Number(t.value) || 5));
    else if (k === "cal-sec-turn") this.calSeconds.turn = Math.min(30, Math.max(1, Number(t.value) || 3));
    else if (k === "image") this._loadImage(t.files?.[0]);
    else if (k.startsWith("img-")) {
      if (!this.imageData || !s.image_meta) return;
      const m = { ...s.image_meta }, v = Number(t.value);
      if (k === "img-w") m.width_m = v; if (k === "img-x") m.x_m = v; if (k === "img-y") m.y_m = v; if (k === "img-o") m.opacity = v;
      this.pv.imageMeta = m; this.pv.draw();
      await this.act("save_plan", { plan: this.draft.toPlan(), image: { data: this.imageData, ...m } });
    }
  }

  _loadImage(file) {
    if (!file) return;
    if (!/^image\/(png|jpeg|webp)$/.test(file.type)) { this.toast("Nur PNG, JPEG oder WebP.", true); return; }
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = async () => {
        const scale = Math.min(1, 1400 / Math.max(img.width, img.height));
        const c = document.createElement("canvas");
        c.width = Math.round(img.width * scale); c.height = Math.round(img.height * scale);
        c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
        let q = 0.85, data = c.toDataURL("image/jpeg", q);
        while (data.length > 1_300_000 && q > 0.3) { q -= 0.1; data = c.toDataURL("image/jpeg", q); }
        if (data.length > 1_300_000) { this.toast("Das Bild ist zu groß.", true); return; }
        const meta = { width_m: this.draft.w / 10, x_m: 0, y_m: 0, opacity: 0.5 };
        const ok = await this.act("save_plan", { plan: this.draft.toPlan(), image: { data, ...meta } }, "Bild gespeichert");
        if (ok) { this.imageData = data; this.image = null; this.imageLoading = false; this.pv.image = null; this._syncImage({ has_image: true, image_meta: meta }); }
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  }

  _cellEvent(p, kind) {
    const d = this.draft; if (!d) return;
    const idx = d.rows[p.y]?.[p.x];
    if (kind === "click") {
      if (!idx) return;
      const id = Object.keys(this.snap.rooms).find((r) => this.snap.rooms[r].idx === idx);
      if (!id) return;
      this.sel.has(id) ? this.sel.delete(id) : this.sel.add(id);
      this.pv.selected = this.sel; this._loadPreview(); this._render();
    } else if (kind === "target") {
      const room = this.snap.rooms[this.activeRoom];
      if (!room || idx !== room.idx) { this.toast("Tippe in den gewählten Raum.", true); return; }
      this.act("room", { action: "update", room_id: this.activeRoom, target: [p.x, p.y] }, "Zielpunkt gesetzt");
    }
  }

  _edited(immediate = false) {
    this.dirty = true; this.saveState = "Speichert gleich …";
    const el = this.shadowRoot.getElementById("savestate"); if (el) el.textContent = this.saveState;
    this.pv.draft = this.draft; this.pv.draw();
    clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => this._save(), immediate ? 100 : 1200);
  }
  async _save() {
    const r = await this.act("save_plan", { plan: this.draft.toPlan() });
    this.dirty = false; this.saveState = r ? "Gespeichert." : "Speichern fehlgeschlagen.";
    const el = this.shadowRoot.getElementById("savestate"); if (el) el.textContent = this.saveState;
    if (this.snap) this._onSnap({ ...this.snap, plan: r ? this.draft.toPlan() : this.snap.plan });
  }
}

customElements.define("tikom-g8000-panel", TikomPanel);
