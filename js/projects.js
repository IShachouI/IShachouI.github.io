/* =============================================================
   projects.js — the single source of truth for featured work.
   -------------------------------------------------------------
   Everything the UI shows (hero reveal cards, the Projects gallery,
   and the detail dialog) is driven by this catalog. Add a project
   by appending an entry — no other file needs structural changes.

   PRIVACY NOTE: every field here is published on a public GitHub
   Pages site. Never put private repo URLs, secrets, internal docs,
   or unverified claims in this file. A project whose source is
   private simply omits `repo` and sets `showCode: false`.
   ============================================================= */

export const PROJECTS = [
  {
    id: "mizanook",
    catchOrder: 0,
    title: "Mizanook",
    category: "Systematic investing research",
    accent: "#d8b45a",                     // restrained moonlit gold (flagship)
    // Public tagline, taken verbatim from the public mizanook.com landing page.
    tagline: "Systematic investing, with constraints you can audit.",
    // Approved high-level, public-safe summary.
    summary:
      "Research and infrastructure for values-constrained systematic " +
      "investing — with an emphasis on disciplined testing, risk awareness, " +
      "and auditable rules.",
    problem:
      "Values-based investment constraints are usually checked after the " +
      "fact. Mizanook explores enforcing them up front, with versioned rules " +
      "and decision records so every outcome can be traced and audited.",
    // High-level themes only — all publicly stated on mizanook.com.
    highlights: [
      "Explicit, versioned constraints rather than post-hoc compliance",
      "Out-of-sample testing methodology for strategy validation",
      "Deterministic pre-trade checks with permanent audit records",
    ],
    // Honest framing from the public site: research-focused, not a live adviser.
    note:
      "Public research preview. Mizanook states it is not a registered " +
      "adviser or broker-dealer, does not manage client assets, and makes " +
      "no performance claims.",
    website: "https://mizanook.com",       // verified reachable (HTTP 200)
    websiteVerified: true,
    repo: null,                            // source is PRIVATE — never linked
    showCode: false,
    tags: ["Systematic research", "Auditable constraints", "Risk-aware"],
    primaryAction: { label: "Visit Website", href: "https://mizanook.com" },
  },

  {
    id: "nudge",
    catchOrder: 1,
    title: "Nudge",
    category: "Social product",
    accent: "#5aa0e6",                     // calm water blue
    tagline: "Make plans that actually happen.",
    summary:
      "A social planning product that helps friend groups coordinate " +
      "activities and lock in plans everyone actually shows up to.",
    problem:
      "Group plans stall in long chats and rarely get committed to. Nudge " +
      "turns loose ideas into concrete plans with gentle, low-friction nudges.",
    highlights: [
      "Lightweight plan coordination for friend groups",
      "Public marketing site deployed to nudgesocial.app",
    ],
    note: null,
    website: "https://nudgesocial.app",    // verified reachable (HTTP 200)
    websiteVerified: true,
    repo: "https://github.com/IShachouI/nudge-website",
    showCode: true,
    tags: ["Social", "Planning", "TypeScript"],
    primaryAction: { label: "Visit Website", href: "https://nudgesocial.app" },
  },

  {
    id: "claremont-nutrition",
    catchOrder: 2,
    title: "Claremont Student Nutrition Tracker",
    category: "Student tool",
    accent: "#7fc8a9",                     // muted natural green
    tagline: "Track meals across the 5C dining halls.",
    summary:
      "A Java application for tracking and logging meals across the " +
      "Claremont Colleges dining halls.",
    problem:
      "Eating across several dining halls makes it hard to keep track of " +
      "meals. This tool logs what you eat across the 5Cs in one place.",
    highlights: [
      "Logs meals across the Claremont Colleges dining halls",
      "Built in Java",
    ],
    note: null,
    website: null,
    websiteVerified: false,
    repo: "https://github.com/IShachouI/Claremont-Student-Nutrition-Tracker",
    showCode: true,
    tags: ["Java", "Nutrition", "Student life"],
    primaryAction: {
      label: "View Code",
      href: "https://github.com/IShachouI/Claremont-Student-Nutrition-Tracker",
    },
  },
];

/** Catalog ordered by the sequence in which the fishing intro reveals them. */
export const PROJECTS_BY_CATCH = [...PROJECTS].sort((a, b) => a.catchOrder - b.catchOrder);

/** Accent colors in catch order — handed to the scene for the reveal shimmer. */
export const CATCH_ACCENTS = PROJECTS_BY_CATCH.map((p) => p.accent);
