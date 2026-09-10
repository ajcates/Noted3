# noted — Design Parity Checklist

Compares the implemented app (`public/app/*`) against the mockup bundle in
`notes/mobile-app-design-project/project/` (`Noted Mobile v1.dc.html` — 9
screens — and `Noted Design Notes.dc.html` — the theory/token/motion spec
behind them). Checkbox format matches `TODO.md`; check an item only when the
*implementation* (not just a plan) satisfies it. Re-run this pass at the end
of M5 and whenever a mockup screen gets built.

**Context**: the mockups are a native-Android M3 Expressive design (dark
theme, OKLCH tokens, spring motion). The shipped app is a browser PWA
(`spec.md` §3) — pixel-for-pixel Android chrome isn't the goal, faithful
translation of the same tokens/shapes/hierarchy to the web is. `styles.css`
currently says as much: *"Minimal M2 styling — legibility only... nothing
here is meant to survive [M5]."* So the honest answer as of this pass is
**nothing below is done yet** — this checklist exists to make M5 (and
whatever comes after it) concrete and trackable, not to report a surprise.

## 0. Scope mismatches to resolve before checking these off as "todo, in scope"

The mockups cover 9 screens; `spec.md`/`roadmap.md` only commit to some of
them. Flag, don't silently build or silently drop:

- [ ] **Folder view (mockup `1i`)** contradicts `spec.md` §9, which lists
      "Nested folders/hierarchical organization" as an explicit v1
      **non-goal** ("tags cover organization for v1"). Decide: update §9 to
      bring folders into scope, or treat `1i`/`1j`'s folder parts as v2
      concept art and scope M5 to list + tag view only.
- [ ] **Settings screen (`1e`)** has no corresponding endpoint, view, or
      roadmap milestone anywhere in `spec.md`/`roadmap.md`/`TODO.md`. Needs a
      spec section (what's actually configurable server-side?) before it's
      buildable, not just styleable.
- [ ] **Version history (`1f`) + Snapshot action in the editor (`1c`)**
      assume a versioning/snapshot API that doesn't exist (`src/` has no
      version store). This is a real feature, not a style pass — needs its
      own spec entry and milestone.
- [ ] **AI edit panel, single + bulk (`1g`, `1h`)** assume an LLM-editing
      integration with diff-preview/apply/undo that isn't in `spec.md` at
      all. Same as above: feature work, not a design-token port.

Until these are resolved, §§2–4 below mark `1e`–`1h` as **not applicable to
M5** rather than "failing" — M5 per `TODO.md` is scoped to "note cards, tag
chips, toolbar, FAB."

## 1. Foundations (`spec.md` §12, Design Notes §3)

- [ ] OKLCH token set defined as CSS custom properties — ink / ink-container,
      moss, ember / ember-container, the 11→16→19→27% surface ladder, the
      93/85/78/70% text ramp, diff-red. `styles.css` currently hardcodes
      one-off hex values (`#1a56db`, `#fafafa`, `#ccc`, …) with no tokens.
- [ ] Dark theme via `prefers-color-scheme` (also `TODO.md` M5 item) — not
      started; there is currently exactly one (light) palette.
- [ ] Light theme derived from the same tokens (mockups are dark-only, but
      §12's "system/light/dark" switch in `1e` implies a light ramp exists
      too) — undecided/not started.
- [ ] Type families loaded and assigned by jurisdiction: **Fraunces** for
      note titles/screen titles, **Manrope** for chrome, **IBM Plex Mono**
      for filenames/timestamps/counts — `index.html` loads no web fonts;
      body is `system-ui, sans-serif`, editor textarea is
      `ui-monospace, monospace`. No jurisdiction split exists yet.
- [ ] Shape system: mirrored squircle icon buttons (16/26 px, alternating),
      notched card family (28 px + one 12 px notch), pill (999 px) for
      filters/search, asymmetric pill for commit actions, cookie clip-path
      for the format badge / AI avatar — current buttons/cards are plain
      4 px-radius rectangles (`button`, `.tag-chip` in `styles.css`).
- [ ] Spacing/density scale (18–20 px gutter, 120 px snippet-card row, 58 px
      folder row, 52 px tag row, 44 px minimum tap target, 74 px format
      cell) — not audited; current layout uses ad-hoc `rem` gaps.
- [ ] Iconography set (⌕ search, ⇅ sort, ◎ view mode, ⏱ snapshot, ↶↷
      undo/redo, ✦ AI, ▾/› expanders/drill-in) — none in use; all controls
      are plain text buttons ("New", "Delete", "Save").

## 2. Screen-by-screen (mockup id → app view)

| # | Mockup screen | App view | Status | Gap |
|---|---|---|---|---|
| `1a` | Note list — snippet cards | `note-list.js` | 🟡 functional, unstyled | No card shape/shadow-free elevation, no tag chip + backlink-count chip footer, no unsynced dot, no sort button, no view-mode switcher, no docked bottom bar / FAB "New" |
| `1c` | Editor — format menu, undo/redo, snapshot | `note-editor.js` + `codemirror-setup.js` | 🟡 partial | Syntax de-emphasis + wikilink autocomplete done (M4). Missing: Format pop-menu (Bold/Italic/Strike/H2/List/Quote grid + Wikilink/Tag/Code pill row), visible undo/redo controls, Snapshot action (blocked on §0) |
| `1d` | Search — scope chips, matched spans | `search-view.js` | 🟡 functional, unstyled | No scope chips (Everything/Titles/Tags/Links — API doesn't distinguish these yet either), no match-count/timing line, no highlighted match spans, no "create missing note" affordance |
| `1e` | Settings | *none* | ⬜ not applicable to M5 | Blocked on §0 — no spec, no endpoint, no view |
| `1f` | Version history | *none* | ⬜ not applicable to M5 | Blocked on §0 — no versioning API |
| `1g` | AI edit panel — single note | *none* | ⬜ not applicable to M5 | Blocked on §0 — no AI integration |
| `1h` | AI edit panel — bulk | *none* | ⬜ not applicable to M5 | Blocked on §0 — no AI integration |
| `1i` | Note list — folder view | *none* | ⬜ not applicable to M5 | Blocked on §0 — contradicts `spec.md` §9 non-goal |
| `1j` | Note list — tag view w/ expanders | `tag-browser.js` | 🟡 partial | Flat tag→notes list exists (M4). Missing: A–Z jump index, expander-vs-row-navigates split (tapping a tag currently just navigates), card surface + 3-child preview + "N more" overflow row |

Legend: ⬜ not started · 🟡 partial/unstyled · ✅ matches mockup

## 3. Element catalogue (Design Notes §4) — components in scope for M5

- [ ] **Masthead** — ember mono kicker ("vault · N notes") over Fraunces
      italic wordmark + settings squircle (root); collapses to back-squircle
      + two-line identity block on sub-screens. Not built — current header
      is a plain `<h1>` + nav links (`app-shell.js` `.shell-header`).
- [ ] **Search field + sort button** — full pill field with detached 46 px
      two-line sort button (glyph + mono key label). Not built — current
      search is a bare `<input type="search">`; no sort exists in the API
      or UI at all.
- [ ] **Section rail + view-mode switcher** — ember mono uppercase rail
      sharing its line with an ◎-glyph mode pill. Not built — no concept of
      list/folder/tag "view mode" exists client-side (tags and list are
      separate routes, not a switcher on one screen).
- [ ] **Snippet card** — Fraunces title, 3-line excerpt w/ ink wikilinks,
      tag chip + relationship chip + mono timestamp footer, ember unsynced
      dot. Not built — `note-list.js` renders title + tags only, no excerpt,
      no backlink count, no sync-state indicator (there's no offline/sync
      layer yet per `spec.md` §7, unimplemented).
- [ ] **Folder row / file row** — blocked on §0.
- [ ] **Tag row + expander** — see `1j` above.
- [ ] **Docked bar + primary action (FAB)** — 27%-surface bar, 30 px
      shoulders, alternating squircle cluster + one ember asymmetric pill.
      Not built — no persistent bottom bar exists; actions are inline
      buttons in the flow.
- [ ] **Editor surface** — live-styled markdown, Fraunces headings, 16 px
      Manrope body, ember bullet markers, well-surface code blocks w/ moss
      rule. Partially built via CodeMirror's `ViewPlugin` (M4) but not
      reviewed against these exact type/color rules.
- [ ] **Wikilink autocomplete** — well-surface list, 28 px radius, ink-
      container top match, mono "+ Create '…'" row. Built functionally (M4:
      `codemirror-setup.js`), not styled to spec.
- [ ] **Format pop menu** — blocked on §0/`1c` above (no toolbar exists to
      attach it to yet beyond CodeMirror's built-in keybindings).
- [ ] **Undo/redo/Snapshot row** — undo/redo not surfaced as UI (CodeMirror
      has it internally via keybindings only); Snapshot blocked on §0.
- [ ] **Version history, AI panels, Settings** — blocked on §0.
- [ ] **Search results card** — see `1d` above.

## 4. Cross-cutting interaction rules (Design Notes §5) — not yet applicable

These describe how components *not yet built* must relate to each other
(one-surface-at-a-time, ember exclusivity, rail-always-agrees-with-rows,
sync state propagating everywhere). Nothing to check yet; revisit once §3's
components exist, since these rules are how a correct build could still
look wrong if wired sloppily.

- [ ] One surface at a time (format menu / autocomplete / sort sheet / AI
      panel mutually exclusive)
- [ ] Sort key persists across view-mode changes where it still makes sense
- [ ] Section rail text+count always matches the rows below it in the same
      frame
- [ ] Sync state (ember dot/bar/queued label) shows consistently everywhere
      a note appears — moot until the offline sync queue (`spec.md` §7) is
      built
- [ ] Ember exclusivity — only one commit-colored button live at a time

## 5. Motion (Design Notes §6) — not yet applicable

No spring/motion tokens exist in the codebase (no CSS transitions beyond
none currently defined). Once M5 lands static tokens, a follow-up pass
should check press/expand/dismiss motion against the spec's
spatial-fast/default/slow + effects/exit curves and the reduced-motion
fallback. Not itemized here to avoid tracking motion before the static
design it animates exists.

## How to use this

1. M5 (`TODO.md`) should close out §1 (foundations) and the `1a`/`1c`
   (partial)/`1d`/`1j` rows of §2/§3 — that's its stated scope.
2. Before `1e`–`1h`/`1i` can move from "not applicable" to real checklist
   items, each needs a `spec.md` entry and roadmap milestone (§0) — that's a
   product decision, not a styling task.
3. Re-check items in place rather than duplicating this file; add a dated
   note under a new `## Revisions` heading if the mockups themselves change.
