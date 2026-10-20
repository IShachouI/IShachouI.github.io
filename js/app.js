/* =============================================================
   app.js — orchestration
   -------------------------------------------------------------
   Boots the Canvas scene and connects its fishing sequence to the
   DOM: each "catch" reveals an interest chip (which doubles as a
   navigation link); when the sequence completes, the CTAs settle in.
   Also wires Skip + Cast Again and honours prefers-reduced-motion.
   ============================================================= */

import { NightFishingScene } from "./scene.js";

const canvas = document.getElementById("scene");
const skipBtn = document.getElementById("skip-intro");
const castBtn = document.getElementById("cast-again");
const chips = Array.from(document.querySelectorAll(".chip"));
const cta = document.querySelector(".cta");
const yearEl = document.getElementById("year");

if (yearEl) yearEl.textContent = new Date().getFullYear();

const prefersReduced =
  window.matchMedia &&
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/** Reveal one chip and make it a real, focusable navigation link. */
function revealChip(i) {
  const chip = chips[i];
  if (!chip) return;
  chip.classList.add("is-revealed");
  chip.removeAttribute("aria-hidden");
  chip.setAttribute("tabindex", "0");
}

/** Hide all chips again (used when replaying) and drop them from tab order. */
function hideChips() {
  for (const chip of chips) {
    chip.classList.remove("is-revealed");
    chip.setAttribute("aria-hidden", "true");
    chip.setAttribute("tabindex", "-1");
  }
}

/** Settle the hero: show CTAs, retire the Skip button. */
function settle() {
  if (cta) cta.classList.add("is-ready");
  if (skipBtn) skipBtn.classList.add("is-hidden");
}

const scene = new NightFishingScene(canvas, {
  revealCount: chips.length,
  reducedMotion: prefersReduced,
  onReveal: revealChip,
  onComplete: settle,
});

// Skip → jump straight to the settled state.
if (skipBtn) {
  skipBtn.addEventListener("click", () => {
    scene.skip();
    settle();
  });
}

// Cast Again → replay the fishing sequence in-place (no reload).
if (castBtn) {
  castBtn.addEventListener("click", () => {
    const started = scene.castAgain(); // true only when already settled
    if (!started) return;
    hideChips();                       // re-hide so they re-reveal with the reel
    castBtn.disabled = true;           // guard against double-casts
    // re-enable when the replay finishes (onComplete → settle fires again)
    const prev = scene.onComplete;
    scene.onComplete = () => { prev(); castBtn.disabled = false; scene.onComplete = prev; };
  });
}

// Start once the DOM is parsed so the first frame is smooth.
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => scene.start());
} else {
  scene.start();
}

// Reduced motion: scene.start() already revealed everything; reflect it in UI.
if (prefersReduced) settle();
