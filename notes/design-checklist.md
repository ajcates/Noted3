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
translation of the same tokens/shapes/hierarchy to the web is.

**2026-09-10 update**: M5's first pass landed — tokens, fonts, and the
note-list/search/tag-browser/editor restyle (see `TODO.md`'s dated entry).
What's still open is called out inline below rather than moved to a separate
revisions log, so this file stays the single current-status view.

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

- [x] OKLCH token set defined as CSS custom properties — done 2026-09-10,
      ported verbatim from `notes/noted-field-guide.html`: the M3 role
      system (primary/secondary/tertiary + on-/-container), the
      surface-container ladder, `on-surface`/`on-surface-variant`, error.
      Uses the field guide's own role names, not the newer mockup bundle's
      ink/moss/ember-container naming — same colors, `spec.md`§12's
      authoritative token file.
- [x] Dark theme via `prefers-color-scheme` — done 2026-09-10, light is the
      `:root` default per the field guide's own pattern.
- [x] Light theme derived from the same tokens — done 2026-09-10 (it's the
      default; the field guide's seeds already work for both).
- [x] Type families loaded and assigned by jurisdiction — done 2026-09-10:
      Fraunces (`--font-display`) for titles, Manrope (`--font-body`) for
      chrome/body, IBM Plex Mono (`--font-source`) for
      filenames/timestamps/counts.
- [ ] Shape system: **partial**. Pill (999px) is in place for chips, buttons,
      the search field, and the FAB. Still missing: mirrored squircle icon
      buttons (16/26 px, alternating — current icon buttons are plain
      circles), the notched card family (28 px + one 12 px notch — current
      note cards use a uniform `--radius-lg`), the asymmetric commit pill
      (flat end toward its content), cookie clip-path (moot until the
      format badge/AI avatar exist, §0).
- [ ] Spacing/density scale (18–20 px gutter, 120 px snippet-card row, 58 px
      folder row, 52 px tag row, 44 px minimum tap target, 74 px format
      cell) — not audited; current layout uses ad-hoc `rem` gaps that read
      reasonably in the 2026-09-10 screenshots but haven't been measured
      against these exact numbers.
- [ ] Iconography set (⌕ search, ⇅ sort, ◎ view mode, ⏱ snapshot, ↶↷
      undo/redo, ✦ AI, ▾/› expanders/drill-in) — `⌕`/`#` now used for the
      topbar nav icons (2026-09-10); sort/view-mode/snapshot/undo-redo/AI
      glyphs still don't exist because the features behind them don't.

## 2. Screen-by-screen (mockup id → app view)

| # | Mockup screen | App view | Status | Gap |
|---|---|---|---|---|
| `1a` | Note list — snippet cards | `note-list.js` | 🟡 styled, feature-partial | Card shape/tokens/tag chip/backlink-count chip/mono stamp done (2026-09-10, real data via `NoteSummary.excerpt`/`.backlinkCount`); docked toolbar + FAB "New" done. Still missing: unsynced dot (no sync layer yet), sort button, view-mode switcher |
| `1c` | Editor — format menu, undo/redo, snapshot | `note-editor.js` + `codemirror-setup.js` | 🟡 partial | Syntax de-emphasis + wikilink autocomplete done (M4); title/actions/backlinks restyled and CodeMirror theme moved to tokens (2026-09-10). Still missing: Format pop-menu, visible undo/redo controls, Snapshot action (blocked on §0) |
| `1d` | Search — scope chips, matched spans | `search-view.js` | 🟡 styled, feature-partial | Pill search field + result cards (title/excerpt/tag chip/stamp) done (2026-09-10). Still missing: scope chips (Everything/Titles/Tags/Links — API doesn't distinguish these either), match-count/timing line, highlighted match spans, "create missing note" affordance |
| `1e` | Settings | *none* | ⬜ not applicable to M5 | Blocked on §0 — no spec, no endpoint, no view |
| `1f` | Version history | *none* | ⬜ not applicable to M5 | Blocked on §0 — no versioning API |
| `1g` | AI edit panel — single note | *none* | ⬜ not applicable to M5 | Blocked on §0 — no AI integration |
| `1h` | AI edit panel — bulk | *none* | ⬜ not applicable to M5 | Blocked on §0 — no AI integration |
| `1i` | Note list — folder view | *none* | ⬜ not applicable to M5 | Blocked on §0 — contradicts `spec.md` §9 non-goal |
| `1j` | Note list — tag view w/ expanders | `tag-browser.js` | 🟡 styled, feature-partial | Pill rows with ember `#` mark done (2026-09-10); per-tag note list now uses the same restyled card. Still missing: A–Z jump index, expander-vs-row-navigates split (tapping a tag still just navigates), the 3-child preview + "N more" overflow row |

Legend: ⬜ not started · 🟡 partial/unstyled · ✅ matches mockup

## 3. Element catalogue (Design Notes §4) — components in scope for M5

- [ ] **Masthead** — **partial** (2026-09-10): Fraunces italic wordmark +
      icon-btn nav (search/tags, active-route highlighted) built as
      `.app-topbar`; still missing the ember mono kicker ("vault · N
      notes") and the collapse-to-back-squircle pattern on sub-screens
      (topbar is currently identical on every route).
- [ ] **Search field + sort button** — pill search field done (2026-09-10);
      no sort button — there's no sort concept in the API or UI at all.
- [ ] **Section rail + view-mode switcher** — not built; no concept of
      list/folder/tag "view mode" exists client-side (tags and list are
      separate routes, not a switcher on one screen).
- [x] **Snippet card** — done 2026-09-10 as shared `renderNoteCard()`
      (`ui.js`): Fraunces title, excerpt, tag chip + backlink-count chip +
      mono stamp. Still no unsynced dot (no sync layer yet, `spec.md` §7)
      and only a 1-tag chip shown, not the mockup's multi-tag row.
- [ ] **Folder row / file row** — blocked on §0.
- [x] **Tag row** — done 2026-09-10 (pill row, ember `#` mark, mono count).
      **Expander** still not built — see `1j` above.
- [x] **Docked bar + primary action (FAB)** — done 2026-09-10 on the note
      list only (`.toolbar`/`.fab-new`): plain-circle icon button + ember
      pill FAB, not yet the squircle-cluster/asymmetric-pill shape family
      (§1). Search/tags/editor still use inline actions, not this bar.
- [x] **Editor surface** — title + actions restyled, CodeMirror theme now
      reads tokens instead of hardcoded hex (2026-09-10). Syntax
      de-emphasis unchanged from M4.
- [x] **Wikilink autocomplete** — tooltip chrome (surface/radius/selected
      row) now reads tokens via global CSS overrides on CodeMirror's
      `cm-tooltip-autocomplete` classes (2026-09-10); the "Create …" row is
      distinguished by color (`:has(.cm-completionIcon-keyword)`).
- [ ] **Format pop menu** — blocked on §0/`1c` above (no toolbar exists to
      attach it to yet beyond CodeMirror's built-in keybindings).
- [ ] **Undo/redo/Snapshot row** — undo/redo not surfaced as UI (CodeMirror
      has it internally via keybindings only); Snapshot blocked on §0.
- [ ] **Version history, AI panels, Settings** — blocked on §0.
- [x] **Search results card** — see `1d` above.

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
   (partial)/`1d`/`1j` rows of §2/§3 — that's its stated scope. Tokens/fonts
   (§1) and the note-list/search/tag-browser restyle landed 2026-09-10; the
   remaining shape system, the editor's format menu/undo-redo, and the
   docked bar on every screen are still open.
2. Before `1e`–`1h`/`1i` can move from "not applicable" to real checklist
   items, each needs a `spec.md` entry and roadmap milestone (§0) — that's a
   product decision, not a styling task.
3. Re-check items in place rather than duplicating this file; add a dated
   note under a new `## Revisions` heading if the mockups themselves change.
