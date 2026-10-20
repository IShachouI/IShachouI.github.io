/* =============================================================
   scene.js — Night-lake Canvas animation engine
   -------------------------------------------------------------
   A single 2D canvas renders, back-to-front:
     1. Sky gradient            6. Moonlight glitter on water
     2. Stars (cached layer)    7. Fish silhouettes (below surface)
     3. Moon + glow             8. Ripples (splash rings)
     4. Horizon mist + treeline 9. Dock + angler silhouette + rod
     5. Water gradient         10. Fishing line + bobber
                               11. Vignette (cinematic edges)

   A small state machine drives the fishing sequence:
     settle → cast → land → wait → bite → reel → (reveal) → pause → …
   On each "reel" it fires onReveal(index); after the last item it
   fires onComplete() and the scene relaxes into a calm ambient loop.

   Everything is drawn in CSS-pixel space; the context is scaled by
   devicePixelRatio (capped) for crisp output without extra cost.
   ============================================================= */

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const lerp = (a, b, t) => a + (b - a) * t;
// ease-out / ease-in-out helpers for calm motion
const easeOut = (t) => 1 - Math.pow(1 - t, 3);
const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
// "#rrggbb" + alpha → "rgba(...)" (for the per-catch reveal shimmer)
const hexToRgba = (hex, a) => {
  const h = (hex || "#e9eef6").replace("#", "");
  const n = parseInt(h.length === 3 ? h.replace(/(.)/g, "$1$1") : h, 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
};

export class NightFishingScene {
  /**
   * @param {HTMLCanvasElement} canvas
   * @param {object} opts
   * @param {number} opts.revealCount  number of items to reveal (default 6)
   * @param {(i:number)=>void} opts.onReveal   called as each item is reeled in
   * @param {()=>void} opts.onComplete         called after the last reveal
   * @param {boolean} opts.reducedMotion        render calm/near-static scene
   */
  constructor(canvas, opts = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d", { alpha: false });
    this.revealCount = opts.revealCount ?? 6;
    this.accents = opts.accents ?? [];      // per-catch accent colors (reveal shimmer)
    this._revealGlow = null;                // active {x,y,t,color} shimmer, or null
    this.onReveal = opts.onReveal ?? (() => {});
    this.onComplete = opts.onComplete ?? (() => {});
    this.reduced = !!opts.reducedMotion;

    this.dpr = 1;
    this.W = 0;
    this.H = 0;
    this.time = 0;              // seconds since start
    this.running = false;
    this.rafId = 0;
    this.lastTs = 0;

    // Parallax target + eased current offset (in px)
    this.px = 0; this.py = 0;
    this.pxCur = 0; this.pyCur = 0;

    // Scene actors
    this.stars = null;         // offscreen cached star field
    this.fish = [];
    this.ripples = [];

    // Fishing state machine
    this.phase = "settle";
    this.phaseT = 0;           // seconds elapsed in current phase
    this.index = 0;            // which interest is being caught
    this.done = false;         // all items revealed → ambient loop
    this._ambientTimer = 3;    // seconds until the next idle ripple

    // Bobber + line geometry (populated on resize)
    this.rodTip = { x: 0, y: 0 };
    this.castTarget = { x: 0, y: 0 };
    this.bobber = { x: 0, y: 0, visible: false };

    // reusable soft "glint" strip for the moon reflection
    this.glint = this._makeGlint();

    this._onResize = this._onResize.bind(this);
    this._onPointer = this._onPointer.bind(this);
    this._onVisibility = this._onVisibility.bind(this);
    this._loop = this._loop.bind(this);
  }

  /* ---------- lifecycle ---------- */
  start() {
    this._onResize();
    window.addEventListener("resize", this._onResize, { passive: true });
    window.addEventListener("pointermove", this._onPointer, { passive: true });
    document.addEventListener("visibilitychange", this._onVisibility);

    if (this.reduced) {
      // Reveal everything immediately; render a single calm frame + gentle loop.
      this.phase = "ambient";
      this.done = true;
      this.bobber.visible = true;
      this.bobber.x = this.castTarget.x;
      this.bobber.y = this.castTarget.y;
      for (let i = 0; i < this.revealCount; i++) this.onReveal(i);
      this.onComplete();
    }

    this.running = true;
    this.lastTs = performance.now();
    this.rafId = requestAnimationFrame(this._loop);
  }

  /** Jump straight to the settled hero: reveal any *not-yet-revealed* items. */
  skip() {
    if (this.done) return;
    // If the current index's reveal already fired (reel in progress), start at
    // the next one so we never emit a duplicate reveal event.
    const start = this._revealedThis ? this.index + 1 : this.index;
    for (let i = start; i < this.revealCount; i++) this.onReveal(i);
    this.index = this.revealCount;
    this._revealedThis = false;
    this._revealGlow = null;
    this.done = true;
    this.phase = "ambient";
    this.bobber.visible = false;
    this.onComplete();
  }

  /**
   * Replay the fishing sequence in-place (no page reload).
   * Returns true if a replay actually started (only when already settled).
   */
  castAgain() {
    if (!this.done || this.reduced) return false; // don't overlap a running intro
    this.index = 0;
    this.done = false;
    this._revealedThis = false;
    this._bitRippled = false;
    this._revealGlow = null;
    this.bobber.visible = false;
    this._setPhase("cast"); // skip the long opening settle on a replay
    return true;
  }

  destroy() {
    this.running = false;
    cancelAnimationFrame(this.rafId);
    window.removeEventListener("resize", this._onResize);
    window.removeEventListener("pointermove", this._onPointer);
    document.removeEventListener("visibilitychange", this._onVisibility);
  }

  /* ---------- input ---------- */
  _onPointer(e) {
    // normalized -1..1 from center → small parallax target
    const nx = (e.clientX / window.innerWidth) * 2 - 1;
    const ny = (e.clientY / window.innerHeight) * 2 - 1;
    this.px = -nx; // move opposite the cursor for depth
    this.py = -ny;
  }

  _onVisibility() {
    // Pause the clock while hidden so the sequence doesn't "fast-forward".
    if (document.hidden) {
      this.running = false;
      cancelAnimationFrame(this.rafId);
    } else if (!this.running) {
      this.running = true;
      this.lastTs = performance.now();
      this.rafId = requestAnimationFrame(this._loop);
    }
  }

  /* ---------- sizing ---------- */
  _onResize() {
    const rect = this.canvas.getBoundingClientRect();
    this.W = Math.max(1, rect.width);
    this.H = Math.max(1, rect.height);
    this.dpr = clamp(window.devicePixelRatio || 1, 1, 2); // cap DPR for perf
    this.canvas.width = Math.round(this.W * this.dpr);
    this.canvas.height = Math.round(this.H * this.dpr);
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);

    // Key layout anchors (all relative → responsive)
    this.horizon = this.H * 0.56;
    this.moon = { x: this.W * 0.62, y: this.H * 0.2, r: Math.max(26, this.H * 0.045) };

    // Dock + angler sit in the lower-left foreground; rod tip aims up-right.
    this.dock = {
      x0: -10,
      x1: this.W * 0.28,
      y: this.H * 0.76,
    };
    this.angler = { x: this.W * 0.2, y: this.dock.y };
    this.rodTip = { x: this.W * 0.33, y: this.H * 0.44 };

    // Bobber lands out in the water, within the moon's reflected path.
    this.castTarget = { x: this.W * 0.62, y: this.H * 0.78 };

    this._buildStars();
    this._buildFish();
  }

  /* ---------- actor builders ---------- */
  _buildStars() {
    // Render the star field once to an offscreen canvas; cheap to blit.
    const c = document.createElement("canvas");
    c.width = Math.round(this.W * this.dpr);
    c.height = Math.round(this.horizon * this.dpr);
    const g = c.getContext("2d");
    g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    const count = Math.round((this.W * this.horizon) / 9000); // density ~ area
    for (let i = 0; i < count; i++) {
      // deterministic-ish spread using golden-angle so it looks even
      const x = (i * 97.13) % this.W;
      const y = ((i * 57.31) % this.horizon) * 0.96;
      const r = Math.random() * 1.1 + 0.2;
      const a = Math.random() * 0.5 + 0.12;
      g.globalAlpha = a;
      g.fillStyle = "#cfe0ff";
      g.beginPath();
      g.arc(x, y, r, 0, Math.PI * 2);
      g.fill();
    }
    g.globalAlpha = 1;
    this.stars = c;
  }

  _buildFish() {
    this.fish = [];
    const n = 4;
    for (let i = 0; i < n; i++) {
      const depth = Math.random();            // 0 = near surface, 1 = deep
      this.fish.push({
        x: Math.random() * this.W,
        y: lerp(this.horizon + 24, this.H * 0.96, Math.random()),
        dir: Math.random() < 0.5 ? -1 : 1,
        speed: lerp(10, 26, Math.random()),   // px/sec
        size: lerp(10, 22, 1 - depth),
        depth,
        phase: Math.random() * Math.PI * 2,
      });
    }
  }

  /** Small horizontal gradient strip reused for soft moon-glitter segments. */
  _makeGlint() {
    const c = document.createElement("canvas");
    c.width = 64; c.height = 1;
    const g = c.getContext("2d");
    const grad = g.createLinearGradient(0, 0, 64, 0);
    grad.addColorStop(0.0, "rgba(233,238,246,0)");
    grad.addColorStop(0.5, "rgba(233,238,246,1)");
    grad.addColorStop(1.0, "rgba(233,238,246,0)");
    g.fillStyle = grad;
    g.fillRect(0, 0, 64, 1);
    return c;
  }

  /* ---------- main loop ---------- */
  _loop(ts) {
    if (!this.running) return;
    let dt = (ts - this.lastTs) / 1000;
    this.lastTs = ts;
    dt = clamp(dt, 0, 0.05); // guard against tab-switch jumps
    this.time += dt;

    this._update(dt);
    this._render();

    this.rafId = requestAnimationFrame(this._loop);
  }

  _update(dt) {
    // Ease parallax toward target for buttery movement.
    this.pxCur = lerp(this.pxCur, this.px, 1 - Math.pow(0.001, dt));
    this.pyCur = lerp(this.pyCur, this.py, 1 - Math.pow(0.001, dt));

    // Fish drift
    for (const f of this.fish) {
      f.x += f.speed * f.dir * dt;
      if (f.x < -40) { f.x = this.W + 40; }
      if (f.x > this.W + 40) { f.x = -40; }
    }

    // Ripples expand + fade
    for (const r of this.ripples) {
      r.r += r.speed * dt;
      r.alpha = clamp(r.alpha - dt * r.fade, 0, 1);
    }
    this.ripples = this.ripples.filter((r) => r.alpha > 0.01);

    // Advance / expire the per-catch reveal shimmer.
    if (this._revealGlow) {
      this._revealGlow.t += dt;
      if (this._revealGlow.t > 1.5) this._revealGlow = null;
    }

    // Once settled, keep the water alive with the occasional faint ripple.
    if (this.done) {
      this._ambientTimer -= dt;
      if (this._ambientTimer <= 0) {
        this._ambientTimer = lerp(2.5, 5.5, Math.random());
        const x = lerp(this.W * 0.3, this.W * 0.95, Math.random());
        const y = lerp(this.horizon + 30, this.H * 0.92, Math.random());
        this.ripples.push({ x, y, r: 1, speed: 15, alpha: 0.12, fade: 0.5 });
      }
    }

    if (!this.reduced) this._updateSequence(dt);
  }

  /* -------- fishing sequence state machine -------- */
  _updateSequence(dt) {
    this.phaseT += dt;
    const T = this.phaseT;

    switch (this.phase) {
      case "settle": {
        // Quiet beat while the scene fades in, then cast.
        if (T > 0.9) this._setPhase("cast");
        break;
      }
      case "cast": {
        // Bobber flies from rod tip out to the target on an arc.
        const dur = 0.85;
        const t = clamp(T / dur, 0, 1);
        const e = easeOut(t);
        const arc = this.H * 0.22; // peak height of the cast
        this.bobber.visible = true;
        this.bobber.x = lerp(this.rodTip.x, this.castTarget.x, e);
        this.bobber.y = lerp(this.rodTip.y, this.castTarget.y, e) - Math.sin(Math.PI * t) * arc;
        if (t >= 1) {
          this._splash(this.castTarget.x, this.castTarget.y, 1);
          this._setPhase("land");
        }
        break;
      }
      case "land": {
        // Bobber settles; let the first ripples breathe.
        this._restBobber();
        if (T > 0.28) this._setPhase("wait");
        break;
      }
      case "wait": {
        // Idle bob while fish circle below.
        this._restBobber();
        if (T > 0.55) this._setPhase("bite");
        break;
      }
      case "bite": {
        // A quick dip + ripple — something took the line.
        const t = clamp(T / 0.32, 0, 1);
        this.bobber.x = this.castTarget.x;
        this.bobber.y = this.castTarget.y + Math.sin(Math.PI * t) * 10;
        if (T > 0.1 && !this._bitRippled) { this._splash(this.castTarget.x, this.castTarget.y, 0.7); this._bitRippled = true; }
        if (t >= 1) { this._bitRippled = false; this._setPhase("reel"); }
        break;
      }
      case "reel": {
        // Reel the bobber home; reveal the caught project as it rises,
        // with a restrained shimmer in that project's accent color.
        if (!this._revealedThis) {
          this.onReveal(this.index);
          this._revealedThis = true;
          this._revealGlow = {
            x: this.castTarget.x, y: this.castTarget.y, t: 0,
            color: this.accents[this.index] || "#e9eef6",
          };
        }
        const dur = 1.2;
        const t = clamp(T / dur, 0, 1);
        const e = easeInOut(t);
        this.bobber.x = lerp(this.castTarget.x, this.rodTip.x, e);
        this.bobber.y = lerp(this.castTarget.y, this.rodTip.y, e) - Math.sin(Math.PI * t) * this.H * 0.12;
        if (t >= 1) {
          this._revealedThis = false;
          this.bobber.visible = false;
          this.index++;
          if (this.index >= this.revealCount) {
            this.done = true;
            this.onComplete();
            this._setPhase("ambient");
          } else {
            this._setPhase("pause");
          }
        }
        break;
      }
      case "pause": {
        // A longer beat so each discovered project has room to be read.
        if (T > 2.4) this._setPhase("cast"); // next item
        break;
      }
      case "ambient":
      default:
        // Scene has settled; nothing to drive but water + fish.
        break;
    }
  }

  _setPhase(name) { this.phase = name; this.phaseT = 0; }

  _restBobber() {
    // gentle idle bob on the water surface
    this.bobber.visible = true;
    this.bobber.x = this.castTarget.x;
    this.bobber.y = this.castTarget.y + Math.sin(this.time * 2.0) * 1.8;
  }

  /** Public: spawn a gentle ripple where the visitor taps the water. */
  addRippleAt(x, y) {
    if (y < this.horizon + 4) return; // ignore taps on the sky
    this.ripples.push({ x, y, r: 1, speed: 20, alpha: 0.2, fade: 0.6 });
  }

  _splash(x, y, strength = 1) {
    const n = 3;
    for (let i = 0; i < n; i++) {
      this.ripples.push({
        x, y,
        r: 2 + i * 6,
        speed: lerp(26, 42, strength),
        alpha: (0.5 - i * 0.12) * strength,
        fade: lerp(0.5, 0.75, i / n),
      });
    }
  }

  /* =============================================================
     RENDER
     ============================================================= */
  _render() {
    const { ctx, W, H } = this;
    const ox = this.pxCur, oy = this.pyCur; // base parallax units

    this._drawSky(ctx, W, H);
    this._drawStars(ctx, ox, oy);
    this._drawMoon(ctx, ox, oy);
    this._drawHorizon(ctx, W, ox, oy);
    this._drawWater(ctx, W, H);
    this._drawMoonPath(ctx);
    this._drawFish(ctx);
    this._drawRipples(ctx);
    this._drawRevealGlow(ctx);
    this._drawDockAndAngler(ctx);
    this._drawLine(ctx);
    this._drawVignette(ctx, W, H);
  }

  _drawSky(ctx, W, H) {
    const g = ctx.createLinearGradient(0, 0, 0, this.horizon + 40);
    g.addColorStop(0, "#04060c");
    g.addColorStop(0.55, "#070c18");
    g.addColorStop(1, "#0b1424");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
  }

  _drawStars(ctx, ox, oy) {
    if (!this.stars) return;
    // subtle collective twinkle via alpha; small parallax drift
    const tw = 0.82 + Math.sin(this.time * 0.8) * 0.06;
    ctx.save();
    ctx.globalAlpha = tw;
    ctx.drawImage(this.stars, ox * 6, oy * 4, this.W, this.horizon);
    ctx.restore();
  }

  _drawMoon(ctx, ox, oy) {
    const mx = this.moon.x + ox * 10;
    const my = this.moon.y + oy * 8;
    const r = this.moon.r;

    // outer glow
    const glow = ctx.createRadialGradient(mx, my, r * 0.4, mx, my, r * 6);
    glow.addColorStop(0, "rgba(220, 230, 245, 0.42)");
    glow.addColorStop(0.3, "rgba(150, 175, 215, 0.14)");
    glow.addColorStop(1, "rgba(150, 175, 215, 0)");
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(mx, my, r * 6, 0, Math.PI * 2);
    ctx.fill();

    // moon disc with a faint terminator for depth
    const disc = ctx.createRadialGradient(mx - r * 0.3, my - r * 0.3, r * 0.2, mx, my, r);
    disc.addColorStop(0, "#f4f7fc");
    disc.addColorStop(1, "#c9d4e6");
    ctx.fillStyle = disc;
    ctx.beginPath();
    ctx.arc(mx, my, r, 0, Math.PI * 2);
    ctx.fill();
  }

  _drawHorizon(ctx, W, ox, oy) {
    // thin mist band just above the waterline
    const mist = ctx.createLinearGradient(0, this.horizon - 40, 0, this.horizon + 8);
    mist.addColorStop(0, "rgba(120, 150, 190, 0)");
    mist.addColorStop(1, "rgba(150, 175, 205, 0.1)");
    ctx.fillStyle = mist;
    ctx.fillRect(0, this.horizon - 40, W, 48);

    // distant treeline silhouette (low, irregular, very dark)
    ctx.save();
    ctx.translate(ox * 3, oy * 2);
    ctx.fillStyle = "#05080f";
    ctx.beginPath();
    ctx.moveTo(0, this.horizon);
    const step = Math.max(24, W / 40);
    for (let x = 0; x <= W; x += step) {
      const h = 10 + Math.abs(Math.sin(x * 0.07) * 14) + Math.abs(Math.sin(x * 0.021) * 10);
      ctx.lineTo(x, this.horizon - h);
      ctx.lineTo(x + step / 2, this.horizon - h * 0.5);
    }
    ctx.lineTo(W, this.horizon);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  _drawWater(ctx, W, H) {
    const g = ctx.createLinearGradient(0, this.horizon, 0, H);
    g.addColorStop(0, "#0c1a24");   // near horizon: reflects the sky
    g.addColorStop(0.5, "#081220");
    g.addColorStop(1, "#040810");
    ctx.fillStyle = g;
    ctx.fillRect(0, this.horizon, W, H - this.horizon);

    // a couple of faint horizontal wave highlights for gentle motion
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    for (let i = 0; i < 3; i++) {
      const y = this.horizon + (i + 1) * (H - this.horizon) * 0.22
              + Math.sin(this.time * 0.8 + i) * 2;
      ctx.globalAlpha = 0.05 - i * 0.012;
      ctx.fillStyle = "#9fb4d6";
      ctx.fillRect(0, y, W, 1.2);
    }
    ctx.restore();
  }

  /** The shimmering column of moonlight on the water (the premium bit). */
  _drawMoonPath(ctx) {
    const mx = this.moon.x + this.pxCur * 10;
    const top = this.horizon;
    const bottom = this.H;
    const r = this.moon.r;

    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    const rowH = 3;
    for (let y = top; y < bottom; y += rowH) {
      const t = (y - top) / (bottom - top);        // 0 at horizon → 1 at bottom
      // width widens and brightness fades toward the viewer
      const width = lerp(r * 0.7, r * 3.4, t);
      const alpha = lerp(0.20, 0.015, t) * (0.9 + Math.sin(this.time * 1.6 + t * 10) * 0.1);
      // horizontal shimmer offset grows with distance
      const jitter = Math.sin(this.time * 1.4 + y * 0.12) * lerp(1.5, 14, t)
                   + Math.sin(this.time * 0.7 + y * 0.03) * lerp(1, 7, t);
      ctx.globalAlpha = clamp(alpha, 0, 1);
      ctx.drawImage(this.glint, mx - width / 2 + jitter, y, width, rowH + 0.6);
    }
    ctx.restore();
  }

  _drawFish(ctx) {
    ctx.save();
    for (const f of this.fish) {
      if (f.y < this.horizon + 10) continue;
      const wob = Math.sin(this.time * 1.5 + f.phase) * 2;
      const a = lerp(0.16, 0.05, f.depth); // fainter when deeper
      ctx.globalAlpha = a;
      ctx.fillStyle = "#9db2d4"; // a faint moonlit sheen, barely sensed
      ctx.save();
      ctx.translate(f.x, f.y + wob);
      ctx.scale(f.dir, 1);
      // body
      ctx.beginPath();
      ctx.ellipse(0, 0, f.size, f.size * 0.4, 0, 0, Math.PI * 2);
      ctx.fill();
      // tail
      ctx.beginPath();
      ctx.moveTo(-f.size * 0.9, 0);
      ctx.lineTo(-f.size * 1.4, -f.size * 0.3);
      ctx.lineTo(-f.size * 1.4, f.size * 0.3);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
    ctx.restore();
  }

  _drawRipples(ctx) {
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    for (const r of this.ripples) {
      ctx.globalAlpha = r.alpha;
      ctx.strokeStyle = "#bcd0ee";
      ctx.lineWidth = 1.1;
      ctx.beginPath();
      // flattened ellipse → reads as rings lying on the water surface
      ctx.ellipse(r.x, r.y, r.r, r.r * 0.34, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();
  }

  /** A restrained accent-colored shimmer when a project is discovered. */
  _drawRevealGlow(ctx) {
    const g = this._revealGlow;
    if (!g) return;
    const p = clamp(g.t / 1.5, 0, 1);          // 0→1 over the glow lifetime
    const rise = easeOut(p);
    const fade = 1 - p;                         // fade out as it rises
    const r = lerp(this.moon.r * 0.6, this.moon.r * 2.2, rise);
    const y = g.y - rise * 14;                  // drifts up gently as it's reeled
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    // soft radial bloom
    const grad = ctx.createRadialGradient(g.x, y, 0, g.x, y, r);
    grad.addColorStop(0, hexToRgba(g.color, 0.5 * fade));
    grad.addColorStop(0.5, hexToRgba(g.color, 0.14 * fade));
    grad.addColorStop(1, hexToRgba(g.color, 0));
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(g.x, y, r, 0, Math.PI * 2);
    ctx.fill();
    // a single thin expanding ring on the water
    ctx.globalAlpha = 0.5 * fade;
    ctx.strokeStyle = hexToRgba(g.color, 1);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.ellipse(g.x, g.y, r * 0.8, r * 0.28, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  _drawDockAndAngler(ctx) {
    const d = this.dock;
    ctx.save();
    ctx.fillStyle = "#03060c"; // near-black foreground silhouette

    // dock deck
    ctx.fillRect(d.x0, d.y, d.x1 - d.x0, 8);
    // posts
    for (let i = 0; i < 3; i++) {
      const x = lerp(d.x0 + 30, d.x1 - 10, i / 2);
      ctx.fillRect(x, d.y + 6, 5, this.H - d.y);
    }

    // angler silhouette (seated), kept abstract + elegant
    const a = this.angler;
    ctx.beginPath();
    // hips / torso
    ctx.moveTo(a.x - 16, a.y);
    ctx.quadraticCurveTo(a.x - 20, a.y - 34, a.x - 4, a.y - 40);
    // head
    ctx.arc(a.x, a.y - 48, 9, Math.PI, Math.PI * 3);
    // back down the front
    ctx.quadraticCurveTo(a.x + 14, a.y - 30, a.x + 8, a.y);
    ctx.closePath();
    ctx.fill();
    // a leg hint toward the water
    ctx.fillRect(a.x + 2, a.y - 2, 22, 6);

    // fishing rod: from the hands up to the rod tip
    ctx.strokeStyle = "#05080f";
    ctx.lineWidth = 2.4;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(a.x + 6, a.y - 30);
    ctx.quadraticCurveTo(
      (a.x + this.rodTip.x) / 2, a.y - 70,
      this.rodTip.x, this.rodTip.y
    );
    ctx.stroke();
    ctx.restore();
  }

  _drawLine(ctx) {
    if (!this.bobber.visible) return;
    const tip = this.rodTip;
    const b = this.bobber;

    // Fishing line: a gently sagging curve from rod tip to bobber.
    const sag = this.phase === "cast" ? 6 : 18; // tauter mid-cast, slacker at rest
    const midX = (tip.x + b.x) / 2;
    const midY = (tip.y + b.y) / 2 + sag;
    ctx.save();
    ctx.strokeStyle = "rgba(200, 214, 236, 0.35)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(tip.x, tip.y);
    ctx.quadraticCurveTo(midX, midY, b.x, b.y);
    ctx.stroke();

    // Bobber: a small pale dot with a faint glow.
    const glow = ctx.createRadialGradient(b.x, b.y, 0, b.x, b.y, 7);
    glow.addColorStop(0, "rgba(233,238,246,0.9)");
    glow.addColorStop(1, "rgba(233,238,246,0)");
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(b.x, b.y, 7, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#eef2f8";
    ctx.beginPath();
    ctx.arc(b.x, b.y, 2.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  _drawVignette(ctx, W, H) {
    const g = ctx.createRadialGradient(W / 2, H * 0.5, Math.min(W, H) * 0.3, W / 2, H * 0.5, Math.max(W, H) * 0.75);
    g.addColorStop(0, "rgba(0,0,0,0)");
    g.addColorStop(1, "rgba(0,0,0,0.5)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
  }
}
