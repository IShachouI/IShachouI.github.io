# Night Fishing — landing page

A quiet, cinematic landing animation: a moonlit lake at night where a line is
cast, a fish bites, and reeling in reveals your interests as premium UI chips —
then the page settles into a clean hero. Built as a **static site** with plain
HTML, CSS, and a vanilla-JS Canvas animation (no framework, no build step).

**Interactions**
- ~17s auto-playing intro; **Skip Intro** jumps to the settled hero.
- **Cast Again** replays the fishing sequence in-place (no page reload).
- The revealed interest chips are real **navigation links** (keyboard-focusable
  only once revealed) that jump to the matching section.
- After the intro, the water, moonlight, fish, and occasional ripples keep
  drifting as a calm ambient loop.

## File structure

```
night-fishing-landing/
├── index.html        # page structure + editable placeholder content
├── css/
│   └── styles.css     # night palette, hero overlay, chips, sections
├── js/
│   ├── scene.js       # Canvas animation engine + fishing state machine
│   └── app.js         # wires the scene to the DOM reveals + Skip button
├── .nojekyll          # tell GitHub Pages to serve files as-is
└── README.md
```

## Run locally

It’s a static site, so any static server works (ES modules need `http://`,
not `file://`):

```bash
cd night-fishing-landing
python3 -m http.server 8000
# then open http://localhost:8000
```

## What to edit (all placeholders are marked `EDIT` in `index.html`)

- **Name** — `<h1 class="name">`
- **Kicker / intro line** — `.kicker`, `.intro`
- **Interests** — the `.chip` list items (text + `data-index` reveal order).
  The reveal count follows the number of chips automatically.
- **Buttons** — `.cta` (`Explore Projects`, `Enter Site`)
- **About / Projects / Contact** — the `#about`, `#work`, `#contact` sections

No code changes are needed to edit content — it all lives in `index.html`.

## Customising the look

- **Colors** live as CSS variables at the top of `css/styles.css`
  (`--night-*`, `--moon`, `--silver`, …).
- **Animation feel** (durations, cast arc, moon position, dock/angler
  placement) lives in `js/scene.js` — see `_onResize()` for layout anchors and
  `_updateSequence()` for the per-phase timings.
- **Reveal vs. loop:** the sequence currently reveals all items once, then
  relaxes into a calm ambient loop (`phase === "ambient"`). To loop the catches
  instead, reset `this.index = 0` and re-enter the `"cast"` phase at the end of
  `"reel"` rather than finishing.

## Accessibility & performance notes

- Honours `prefers-reduced-motion`: the scene renders calm, reveals all chips
  instantly, and skips the large intro motion.
- The canvas is capped at 2× device pixel ratio and pauses rendering when the
  tab is hidden. Stars are rendered once to an offscreen layer and blitted.
- A **Skip Intro** button jumps straight to the settled hero.

---

## Deploy on GitHub Pages

### Option A — your user site (`username.github.io`)
Serves at `https://IShachouI.github.io/`.

1. Create a **public** repo named exactly `IShachouI.github.io`.
2. Put these files at the **repo root** (so `index.html` is at the top level):
   ```bash
   cd night-fishing-landing
   git init -b main
   git add .
   git commit -m "Night Fishing landing page"
   git remote add origin https://github.com/IShachouI/IShachouI.github.io.git
   git push -u origin main
   ```
3. GitHub → repo **Settings → Pages** → Source: **Deploy from a branch** →
   Branch: `main` / `/ (root)` → **Save**. Live in a minute or two.

### Option B — a project site (any repo)
Serves at `https://IShachouI.github.io/<repo-name>/`.

1. Push these files to any repo (root or a `/docs` folder).
2. **Settings → Pages** → Branch `main`, folder `/ (root)` (or `/docs`).

> The included `.nojekyll` file ensures GitHub Pages serves the `css/` and `js/`
> folders verbatim (Jekyll otherwise ignores files/folders it doesn’t
> recognise). All paths are relative, so both options work without changes.

### Custom domain (optional)
Add a `CNAME` file containing your domain and configure DNS per GitHub’s docs.
