/* =============================================================
   app.js — orchestration
   -------------------------------------------------------------
   Connects the Canvas scene (scene.js) and the project catalog
   (projects.js) to the DOM:
     • renders the hero reveal cards + the Projects gallery
     • reveals one project per "catch", then settles the hero
     • Skip Intro / Cast Again / "Cast a line" controls
     • an accessible project detail <dialog>
     • subtle water ripples where you tap the lake
     • prefers-reduced-motion: everything shown immediately
   Scene rendering, the fishing state machine, project content, and
   UI controls stay cleanly separated across files.
   ============================================================= */

import { NightFishingScene } from "./scene.js";
import { PROJECTS_BY_CATCH, CATCH_ACCENTS } from "./projects.js";

const $ = (sel, root = document) => root.querySelector(sel);
const el = (tag, cls, text) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
};

const canvas = $("#scene");
const skipBtn = $("#skip-intro");
const castAgainBtn = $("#cast-again");
const castLineBtn = $("#cast-line");
const revealList = $("#reveal-cards");
const gallery = $("#projects-gallery");
const cta = $(".cta");
const dialog = $("#project-dialog");
const announcer = $("#catch-announcer");
const yearEl = $("#year");

if (yearEl) yearEl.textContent = new Date().getFullYear();

const prefersReduced =
  window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/* -------------------------------------------------------------
   Build an external link (safe rel, new tab) or an internal button.
   ------------------------------------------------------------- */
function actionLink(label, href, variant) {
  const a = el("a", `btn btn--sm ${variant}`, label);
  a.href = href;
  a.target = "_blank";
  a.rel = "noopener noreferrer";
  return a;
}
function detailsButton(project, variant = "btn--ghost") {
  const b = el("button", `btn btn--sm ${variant}`, "Details");
  b.type = "button";
  b.addEventListener("click", () => openDialog(project));
  return b;
}
/** Extra "View Code" link only when a project has a public repo distinct
    from its primary action (never for private-source projects). */
function codeLink(p) {
  if (p.showCode && p.repo && p.primaryAction.href !== p.repo)
    return actionLink("View Code", p.repo, "btn--ghost");
  return null;
}

/* -------------------------------------------------------------
   Hero reveal cards (compact; hidden until "caught")
   ------------------------------------------------------------- */
const revealCards = PROJECTS_BY_CATCH.map((p) => {
  const li = el("li", "reveal-card");
  li.dataset.id = p.id;
  li.style.setProperty("--accent", p.accent);
  li.setAttribute("aria-hidden", "true");

  li.append(el("span", "reveal-card__accent"));
  const body = el("div", "reveal-card__body");
  body.append(
    el("p", "reveal-card__cat", p.category),
    el("h3", "reveal-card__title", p.title),
    el("p", "reveal-card__desc", p.tagline)
  );
  const actions = el("div", "reveal-card__actions");
  const primary = actionLink(p.primaryAction.label, p.primaryAction.href, "btn--primary");
  const details = detailsButton(p);
  // keep actions out of the tab order until the card is revealed
  primary.tabIndex = -1;
  details.tabIndex = -1;
  actions.append(primary, details);
  body.append(actions);
  li.append(body);
  revealList.append(li);
  return { li, focusables: [primary, details] };
});

/* -------------------------------------------------------------
   Projects gallery (always visible, richer)
   ------------------------------------------------------------- */
for (const p of PROJECTS_BY_CATCH) {
  const li = el("li", "gallery-card");
  if (p.catchOrder === 0) li.classList.add("gallery-card--featured"); // Mizanook = flagship
  li.style.setProperty("--accent", p.accent);
  li.append(el("span", "gallery-card__accent"));
  li.append(el("p", "gallery-card__cat", p.category));
  li.append(el("h3", null, p.title));
  li.append(el("p", "gallery-card__tagline", p.tagline));
  li.append(el("p", "gallery-card__summary", p.summary));

  const tags = el("ul", "tags");
  for (const t of p.tags) tags.append(el("li", null, t));
  li.append(tags);

  const actions = el("div", "gallery-card__actions");
  actions.append(actionLink(p.primaryAction.label, p.primaryAction.href, "btn--primary"));
  const code = codeLink(p);
  if (code) actions.append(code);
  actions.append(detailsButton(p));
  li.append(actions);
  gallery.append(li);
}

/* -------------------------------------------------------------
   Accessible detail dialog (native <dialog> → Esc + focus restore)
   ------------------------------------------------------------- */
function openDialog(p) {
  $("#dlg-category").textContent = p.category;
  $("#dlg-title").textContent = p.title;
  $("#dlg-tagline").textContent = p.tagline;
  $("#dlg-problem").textContent = p.problem;
  $("#dlg-summary").textContent = p.summary;

  const hl = $("#dlg-highlights");
  hl.replaceChildren(...(p.highlights || []).map((h) => el("li", null, h)));

  const note = $("#dlg-note");
  if (p.note) { note.textContent = p.note; note.hidden = false; }
  else { note.hidden = true; }

  const tags = $("#dlg-tags");
  tags.replaceChildren(...p.tags.map((t) => el("li", null, t)));

  const actions = $("#dlg-actions");
  actions.replaceChildren();
  actions.append(actionLink(p.primaryAction.label, p.primaryAction.href, "btn--primary"));
  const code = codeLink(p);
  if (code) actions.append(code);

  dialog.style.setProperty("--accent", p.accent);
  dialog.showModal();
  // move focus into the dialog for keyboard users
  $(".dialog__close", dialog).focus();
}
// close via the × button, the backdrop, or Escape (Escape is native)
dialog.addEventListener("click", (e) => {
  if (e.target === dialog || e.target.hasAttribute("data-close")) dialog.close();
});

/* -------------------------------------------------------------
   Scene + reveal wiring
   ------------------------------------------------------------- */
function revealCard(i) {
  const card = revealCards[i];
  if (!card) return;
  card.li.classList.add("is-revealed");
  card.li.removeAttribute("aria-hidden");
  card.focusables.forEach((n) => (n.tabIndex = 0));
  // Reliably announce the caught project's name to screen readers.
  if (announcer) announcer.textContent = `Discovered project: ${PROJECTS_BY_CATCH[i].title}`;
}
function hideRevealCards() {
  for (const card of revealCards) {
    card.li.classList.remove("is-revealed");
    card.li.setAttribute("aria-hidden", "true");
    card.focusables.forEach((n) => (n.tabIndex = -1));
  }
}
/* Skip Intro visibility is kept in sync with the tab order + AT visibility,
   so it's never a hidden-but-focusable trap. */
function showSkip() {
  if (!skipBtn) return;
  skipBtn.classList.remove("is-hidden");
  skipBtn.tabIndex = 0;
  skipBtn.removeAttribute("aria-hidden");
}
function hideSkip() {
  if (!skipBtn) return;
  // if focus is on Skip as we hide it, move it somewhere sensible first
  if (document.activeElement === skipBtn) {
    (cta?.querySelector(".btn") || document.body).focus?.();
  }
  skipBtn.classList.add("is-hidden");
  skipBtn.tabIndex = -1;
  skipBtn.setAttribute("aria-hidden", "true");
}
function settle() {
  cta?.classList.add("is-ready");
  hideSkip();                              // hide + remove from tab order
  castLineBtn?.classList.add("is-ready");  // reveal the lake-side cast control
}

const scene = new NightFishingScene(canvas, {
  revealCount: PROJECTS_BY_CATCH.length,
  accents: CATCH_ACCENTS,
  reducedMotion: prefersReduced,
  onReveal: revealCard,
  onComplete: settle,
});

/* ---- controls ---- */
function replay() {
  const started = scene.castAgain(); // true only when already settled
  if (!started) return;
  hideRevealCards();
  showSkip();                              // let visitors skip the replay too
  [castAgainBtn, castLineBtn].forEach((b) => b && (b.disabled = true));
}
// re-enable the cast controls once a replay finishes
const baseComplete = settle;
scene.onComplete = () => {
  baseComplete();
  [castAgainBtn, castLineBtn].forEach((b) => b && (b.disabled = false));
};

if (skipBtn) skipBtn.addEventListener("click", () => { scene.skip(); settle(); });
if (castAgainBtn) castAgainBtn.addEventListener("click", replay);
if (castLineBtn) castLineBtn.addEventListener("click", replay);

// subtle water ripple where you tap the lake (clicks fall through the overlay)
canvas.addEventListener("pointerdown", (e) => {
  const r = canvas.getBoundingClientRect();
  scene.addRippleAt(e.clientX - r.left, e.clientY - r.top);
});

/* ---- start ---- */
if (document.readyState === "loading")
  document.addEventListener("DOMContentLoaded", () => scene.start());
else scene.start();

// reduced motion: scene.start() fires onReveal/onComplete for all already.
if (prefersReduced) settle();
