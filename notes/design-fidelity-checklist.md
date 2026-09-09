# noted — Design Fidelity Checklist

How closely the running app matches the design bundle, checked item-by-item
against the actual criteria in `Noted Design Notes.dc.html` §3–4 (foundations
and element catalogue) rather than eyeballed. First pass: 2026-09-09.

**Scope caveat, stated once instead of on every line below:** this app is a
desktop/any-browser web app (`spec.md` §1), not the literal Android app the
nine mockups draw. This checklist measures adherence to the *design
language* — color, type, shape, spacing, motion tokens, and the specific
per-component rules the catalogue states — everywhere an equivalent
component exists in this app. Where the catalogue describes chrome that
doesn't exist here (a sort button with no sort feature behind it, a docked
bottom bar, folders, AI panels), the honest answer is "not applicable yet,"
not "fix the CSS" — building the feature is a different, larger task than
this pass, and several of them (folders, version history, AI panels) already
have their own tracked decision in `roadmap.md` M8.

## Foundations (§3)

- [x] **Color** — five-seed OKLCH system (ink/moss/ember/paper/alert),
      surface ladder, light + dark via `prefers-color-scheme`
      (`public/app/styles.css` `:root`)
- [x] **Type** — three jurisdictions applied by rule, not by eye: note
      titles/headings in Fraunces+ink ("what the user wrote"), chrome in
      Manrope, filesystem facts (filenames, timestamps) in IBM Plex Mono.
      Vendored locally (`public/vendor/fonts/`), not loaded from a CDN.
- [~] **Shape** — the corner scale (none→full) is ported; the *shape family*
      (§3.3's mirrored squircles, notched card, asymmetric-pill commit
      button) is only partly built — the asymmetric pill exists
      (`--radius-commit`), the mirrored-squircle icon buttons and the
      notched card's clip-path do not. Decorative, not load-bearing; still
      open.
- [x] **Space, density, touch** — gutter/card-padding/gap/touch-target
      tokens from §3.4's actual numbers
- [~] **Motion** — spatial-fast/default/slow + effects/exit tokens are
      defined; only **Press** (all buttons/chips) and **Search** (results
      crossfade) from §6.2's specified behaviours are actually wired,
      because almost everything else in §6.2 (format menu, sort sheet, tag
      expander, folder drill-in, AI panel, version timeline) needs chrome
      that doesn't exist in this app. Re-check this line as more of that
      chrome gets built.
- [ ] **Iconography** — not started. This app is entirely text-label chrome
      right now; §3.5's typographic icons (B, I, H2) belong to the format
      menu (doesn't exist) and its glyphic icons (⌕, ⇅, ✦) aren't used
      anywhere yet. Not a regression — v1 never called for an icon system.

## Masthead (§4.1)

- [x] Fraunces italic wordmark
- [x] Ember mono kicker (note count) **above** the wordmark, in that
      order — "states scale before identity." Live: updates whenever the
      note-title cache refreshes (create/delete/rename).
- [ ] Settings squircle — no settings screen exists in this app (spec.md
      never specs one for v1)
- [ ] Back-squircle + two-line identity block on non-root screens — this
      app's editor has a plain "Back" text button in its action row instead
      of masthead-integrated back navigation. Works, doesn't match.

## Search field + sort button (§4.2)

- [x] Full-pill field on an elevated surface
- [ ] Detached sort button, sort sheet, "Group by day" — **not
      applicable**: search here is a single relevance-ish ranking (title
      hits first, then newest), with no user-facing sort control at all.
      Building the button without a real sort feature behind it would be
      decoration, not a fix.

## Section rail + view-mode switcher (§4.3)

- [ ] **Not applicable** — this app has one flat list, no grouping and no
      alternate view modes (list/folders/tags as *switchable* views of the
      same screen). Tags currently live on their own separate route
      (`#/tags`), not as a mode switch on the note list. Folders are M8/not
      built. A rail needs something to describe; nothing here varies yet.

## Snippet card (§4.4) — the list's core unit

- [x] Fraunces title
- [x] Excerpt — first non-blank line of the body, clamped to 3 lines via
      CSS `line-clamp` (not a true 3-line semantic excerpt, but reads the
      same). Added a `snippet` field to `NoteSummary`/`GET /api/notes`,
      reusing `search.ts`'s existing `firstLine()` rather than duplicating it.
- [x] Tag chips — real chips now (reusing `.tag-chip`, same as the Tag
      Browser), not comma-joined plain text, and clickable through to that
      tag's filtered list (`tag-open`, already-existing event contract)
- [x] Relationship chip ("N backlinks") — added `backlinkCount` to
      `NoteSummary`, computed from the index's already-derived backlink
      graph (`backlinkFilenames(...).length`) — **zero added disk I/O**,
      keeps the "served from index" property `system-overview.md` states
- [x] Mono timestamp — `<time datetime>`, `ui.js`'s new `formatStamp()`
- [ ] Unsynced ember dot — no sync/offline concept exists yet (M6, not built)
- [~] "No menu button, long-press for actions" — this app keeps an explicit
      Delete button since a desktop browser has no long-press equivalent.
      A deliberate, documented deviation, not an oversight.

## Tag row + expander (§4.6)

- [x] `#` mark, tag, count (Tag Browser, built in M4)
- [ ] Expand-in-place (tap the expander, see child rows without leaving the
      list) — this app always navigates to a full separate filtered list
      instead. Simpler, already the existing v1 behavior; not changed here.
- [ ] A–Z jump index — not built

## Docked bar + primary action (§4.7)

- [x] The one part of this that *is* real: "the ember asymmetric pill is the
      only committing action per screen" — New note / Save use
      `--radius-commit` + `tertiary-container`, exactly this rule
- [ ] No pinned/docked bottom bar chrome exists — the commit button sits
      in normal document flow, not fixed to a screen edge
- [ ] Menu/tags/AI squircle cluster — not applicable, mobile nav concepts
      with no equivalent in this app's flat page structure

## Editor surface (§4.8)

- [x] Markdown renders live in its final styling, not raw+split-preview
      (M4's de-emphasis `ViewPlugin`)
- [x] Wikilinks ink-colored (fixed the last hardcoded hex in
      `codemirror-setup.js` during the pre-M6 review)
- [ ] **Real gap, not just styling**: tag chips + a dashed "+ tag"
      affordance above the body. This app has *no UI to edit a note's tags
      at all* — only `.md` frontmatter set outside the app or at creation
      exposes them. Flagged here rather than built, since it's a feature
      addition (a tag-editing control wired to `PUT`'s existing but
      client-unused `tags` field), not a CSS pass — worth a deliberate
      decision, not scope creep off this checklist.
- [~] "Backlinks · N" rail phrasing — the panel exists and shows the count,
      as "Backlinks (N)"; cosmetic wording difference, not fixed here
- [ ] Bullets with an ember marker, code blocks on the well surface with a
      moss left rule — the CodeMirror highlight style doesn't token-style
      these that specifically yet

## Wikilink autocomplete (§4.9)

- [x] Well-surface list, 28px radius (verified via computed style, not just
      the CSS source — CodeMirror injects its own theme, which needed
      `!important` in a couple of places to actually win)
- [x] First/selected match in ink container
- [x] "Create '…'" row in ink text, distinguished by its completion type
      (`li:has(.cm-completionIcon-keyword)`)
- [x] Confirmed live in a real browser, not just read from the stylesheet

## Format pop menu (§4.10)

- [ ] **Not applicable** — no format toolbar or selection-based formatting
      UI exists; CodeMirror's own keyboard shortcuts are the only
      formatting path in this app today.

## Search results (§4.15)

- [x] Matched spans highlighted — via `<mark>`, a real semantic element
      (not a styled `<span>`), wrapping every case-insensitive occurrence
      of the query in both the title and the snippet
- [x] Relationship chip + mono timestamp — shares the same CSS/markup
      pattern as the snippet card (`.chip.relationship`, `.stamp`), added
      `backlinkCount` to `SearchResult` the same way as `NoteSummary`
- [ ] Scope chips (Everything / Titles / Tags / Links) — search has no
      scoping concept; it's one free-text query over title+body
- [ ] Dashed "create the missing note" card on a no-match query — not built
- [ ] "index · 4ms" mono footer — not built (would need timing
      instrumentation this app doesn't have)

## Undo/redo + Snapshot, Version history, AI panels, Settings (§4.11–4.14, 4.16)

- [ ] **Entirely out of scope for this pass.** These belong to M8/v1.1
      (undo/redo+Snapshot+version history, AI edit panels — `roadmap.md`
      M8, `spec.md` §4.1–§6.3) or were never specced for v1 at all
      (Settings). Don't build any of these to chase visual parity alone —
      the M8 go/no-go decision governs whether and when they get built,
      not this checklist.

## The "lean, dynamic, semantic" side of this pass

- [x] Zero new dependencies, zero build step added — still plain JS +
      native ES modules, no framework, matching `techstack.md` throughout
- [x] Reused rather than duplicated: `firstLine()` (search.ts) backs the
      snippet-card excerpt instead of a second implementation;
      `.tag-chip`/`.chip.relationship`/`.stamp` are shared CSS classes
      between the note list and search results, not copies
- [x] `backlinkCount` reads the index's already-derived backlink graph —
      an O(1) map lookup per note, no new disk I/O, no new pass over the
      vault
- [x] New semantic elements, not styling hooks pretending to be them: the
      native `<search>` landmark (search-view.js), `<mark>` for match
      highlighting, `<time datetime>` for every timestamp, `<hgroup>` for
      the kicker+wordmark pairing, `aria-label` on the two inputs
      (title, search) that only ever had a placeholder
- [x] Every change here re-verified live in a real browser (Playwright
      against real Chrome), not just read back from the CSS/HTML source —
      screenshots exist for the note list, search, and the autocomplete
      popup in both light and dark
