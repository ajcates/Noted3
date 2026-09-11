# Noted UI animation specification

This document inventories every current or planned Noted UI element that can
benefit from motion. It applies Material 3 Expressive motion to the interface
described in [`ui-improvements.md`](./ui-improvements.md); it is a motion
contract, not permission to animate everything continuously.

The project-specific authority is §6 of
[`Noted Design Notes.dc.html`](./mobile-app-design-project/project/Noted%20Design%20Notes.dc.html).
It adapts the principles in the official
[Material motion guidance](https://m3.material.io/styles/motion/overview/how-it-works)
and
[Material 3 Expressive guidance](https://developer.android.com/design/ui/mobile/guides/layout-and-content/m3-expressive)
to Noted's shape and colour system.

## 1. Motion principles

1. **Motion explains origin and destination.** A menu grows from its button, a
   sheet rises from the edge that owns it, and a note opens from its card. No
   surface fades in from an unrelated position.
2. **Spatial movement uses spring character.** Translation, scale, size,
   position, and shape changes use a spatial token with a small, controlled
   overshoot. They do not use a generic `ease` curve.
3. **Effects remain composed.** Colour, opacity, highlights, and scrims use the
   effects curve without overshoot. A hue change communicates state, not
   physical movement.
4. **Exits are quicker than entrances.** Dismissed UI gets out of the user's way
   in 200 ms or less. An exit never performs the entrance animation backwards
   at full length.
5. **Persistent objects retain identity.** Cards that survive a sort or filter
   slide to their new position. They must not disappear and re-enter as if they
   were different notes.
6. **One dominant movement at a time.** Supporting items may stagger around the
   main movement, but several unrelated surfaces must not compete for attention.
7. **Distance and importance determine pace.** Press feedback is fast; menus and
   regrouping are default; full-screen or pane-level changes are slow.
8. **Motion never delays truth.** Saving, queued, failed, and conflicted states
   update accessibly as soon as they are known, even if their visual transition
   is still settling.
9. **Animation is interruptible.** A second tap, route change, or new query
   continues from the current visual state instead of waiting for the first
   animation to finish.
10. **Reduced motion is a complete design.** It retains state, hierarchy, focus,
    and feedback while removing travel, overshoot, sweep, rotation, and stagger.

## 2. Shared motion tokens

| Token | Target behavior | Use |
|---|---|---|
| `spatial-fast` | Spring, about 280 ms, damping 0.82 | Press release, chips, small expanders, toggle knobs |
| `spatial-default` | Spring, about 420 ms, damping 0.8 | Menus, sheets, list regrouping, card and shape morphs |
| `spatial-slow` | Spring, about 560 ms, damping 0.85 | Full-screen transitions, responsive pane changes |
| `effects-fast` | `cubic-bezier(0.2, 0, 0, 1)`, 150 ms | Pressed colour, selection, short highlights |
| `effects-default` | `cubic-bezier(0.2, 0, 0, 1)`, 200 ms | Opacity, scrims, status changes |
| `exit` | `cubic-bezier(0.3, 0, 0.8, 0.15)`, 200 ms maximum | Menu, dialog, card, toast, and route dismissal |

On the web, use a sampled `linear()` spring or the Web Animations API for the
spatial tokens where supported. A documented overshooting cubic Bézier is an
acceptable fallback. Effects must use their non-overshooting curve even when a
spatial animation runs beside them.

Staggers should follow proximity to the action that caused them:

- 12 ms per row for a reordered list.
- 15 ms per row for a view change.
- 18 ms per format cell, starting nearest the thumb.
- 20 ms per child row or quick-action chip.
- No stagger may add more than 120 ms to the total sequence.

## 3. Global controls and feedback

| UI element or change | Animation |
|---|---|
| Any tappable button, link, chip, card, or row | On press, scale to `0.96` and move one tonal surface brighter over 100 ms. Release scale on `spatial-fast`; restore colour on `effects-fast`. Do not use a ripple. |
| Mirrored-squircle icon button | Apply the shared press response and morph its asymmetric corners toward the mirrored corner family. The icon stays optically centred. |
| Primary FAB | Compress to `0.94` on press, with up to 2° of rotation toward its flat edge; spring back on `spatial-fast`. It may be more expressive than secondary buttons but must not wobble while idle. |
| Hover-capable controls | Shift one tonal step and, where helpful, translate up no more than 1 px on `spatial-fast`. Never apply hover motion on coarse pointers. |
| Keyboard focus | Draw the focus ring from 85% to 100% scale while its opacity reaches full over `effects-fast`. Moving focus must not move the control itself. |
| Selected or active control | Cross-fade container and foreground roles on `effects-fast`; if a selection indicator moves between siblings, spring that indicator on `spatial-fast`. |
| Disabled state | Cross-fade to disabled opacity over `effects-fast`. Do not scale or drift away. |
| Checkbox, toggle, or segmented selection | Spring the mark or selection capsule to the new position on `spatial-fast`; cross-fade colour separately. |
| Tooltip | Fade and rise 4 px over 150 ms after its normal delay; dismiss in 100 ms with no spring. |
| Text selection and matched-text highlight | Grow the background from the text centre over 180 ms using `effects-default`; text itself does not move. |

## 4. App launch, shell, and navigation

| UI element or change | Animation |
|---|---|
| Initial app-shell boot | The masthead and docked bar are present immediately. Content skeletons fade in over 120 ms; the app must not animate the whole shell from blank. |
| Wordmark and vault kicker | On the home route, the kicker rises 4 px and fades over `effects-default`. A changed note count cross-fades in place without resizing the masthead. |
| Contextual masthead | The old title exits 6 px toward the navigation direction while the new title enters from the opposite side on `spatial-fast`. The back button grows from the wordmark's left edge so the relationship is clear. |
| Top-level bottom navigation | Spring the active selection shape between Notes, Search, and Tags on `spatial-fast`; cross-fade icon and label colours. Labels do not individually bounce. |
| Forward route | Use a shared note card/title where available. Otherwise, old content shifts left 12 px and fades while new content enters 16 px from the right on `spatial-default`. |
| Back route | Reverse the forward direction and restore the previous scroll position before the first painted frame, so content does not visibly jump. |
| Browser/device Back with an overlay open | Dismiss the topmost menu, sheet, dialog, or queue panel on `exit`; the route underneath does not animate. |
| Shell status message | Expand from the masthead edge by height on `spatial-fast` and cross-fade the text. Success settles quietly; error performs one 2 px lateral emphasis, never a repeating shake. |
| Offline banner | Drop 6 px from the masthead on `spatial-fast`; its icon and label cross-fade as connectivity changes. Do not pulse continuously. |
| Desktop two-pane activation | At the wide breakpoint, spring the list pane to its fixed width and let the editor grow into the remaining space on `spatial-slow`. Existing content retains position where possible. |
| Desktop pane selection | Move the selected-card tonal rail on `spatial-fast`; update the detail pane with a shared title transition. The list does not re-enter. |
| Safe-area or browser-chrome inset change | Track the platform inset frame by frame. Do not add a second CSS transition that lags behind the operating system. |
| Screen rotation | Reflow once the viewport dimensions settle. Preserve content, focus, selection, and scroll; use only a 120 ms effects fade on elements whose layout must be reconstructed. |

## 5. Note list and cards

| UI element or change | Animation |
|---|---|
| Initial list load | Replace skeleton cards with real cards using a 160 ms cross-fade. Geometry must match so there is no vertical jump. |
| Section rail and live note count | Cross-fade only the digits or stale marker over `effects-fast`; keep the rail width stable. |
| Sort control opening | On mobile, raise a bottom sheet 24 px on `spatial-default` while the scrim reaches 40% on `effects-default`. On desktop, grow a menu from the sort control with the same origin rule. |
| Choosing a sort key | Dismiss the chooser first on `exit`, then reorder cards with FLIP-style position springs on `spatial-default` and a 12 ms row stagger. Shared cards slide rather than re-render. |
| Sort label change | Cross-fade the old and new labels in place over `effects-fast`; the control width remains stable. |
| Comfortable/compact switch | Morph the selection capsule on `spatial-fast`, then animate card height and internal spacing on `spatial-default`. Excerpts fade during the size change rather than being clipped mid-line. |
| Card entrance after creation | Grow the new card from the New action's side of the list at `0.94` scale on `spatial-default`; pulse its ember edge once. Existing cards move to their new positions. |
| Card press | Apply the global press response and brighten the surface. The notched corner moves 2–4 px toward its mirrored family and springs back. |
| Card open | On capable browsers, share the card title and surface into the editor. Otherwise use the route transition; never animate every child independently. |
| Sync badge entering the card | Pulse once from scale `1 → 1.3 → 1` on `spatial-fast`; queued uses ember, conflict uses error. It remains still afterward. |
| Extra-tag `+N` chip | Cross-fade the count on `effects-fast`. If the count reaches zero, shrink the chip toward the preceding tag on `spatial-fast`. |
| Backlink-count change | Cross-fade digits in place. When appearing or disappearing, spring the chip width from or to the adjacent chip. |
| Timestamp update | Cross-fade without movement or counting. Time is supporting information and should remain quiet. |
| Overflow menu open | Grow from the card's overflow button at `0.92` scale and 8 px offset on `spatial-default`; menu items enter together, not with a long stagger. |
| Horizontal swipe | The card follows the finger directly with slight resistance while the action surface is revealed underneath. On release, spring to open or closed on `spatial-fast` based on threshold and velocity. |
| Swipe cancellation by vertical scroll | Return horizontal offset immediately enough to preserve scroll ownership; use `spatial-fast` only after pointer direction is resolved. |
| Delete commitment | Collapse the card toward the overflow/delete origin on `exit`; surrounding cards spring into the gap on `spatial-default`. |
| Undo deletion | Reinsert the same card from its collapsed location on `spatial-default`, preserving its previous scroll-relative position where possible. |
| Scroll-position restoration | Restore before paint with no animated page scroll. The returning card may receive a 400 ms ink-container highlight fade to re-establish context. |

## 6. Search

| UI element or change | Animation |
|---|---|
| Search field focus | Spring the field's leading icon and container shape subtly on `spatial-fast`; cross-fade border/surface state over `effects-fast`. Do not scale the text. |
| Clear button appearing | Scale from the text-field trailing edge on `spatial-fast`; dismiss on `exit`. |
| Query results update | Cross-fade the old and new result contents over 120 ms. Keep the result-count line fixed so it never reflows between keystrokes. |
| Result count | Cross-fade digits over `effects-fast`; do not count through intermediate numbers. |
| Match spans | Grow highlight backgrounds from the centre over 180 ms. A query change replaces the highlights with the result cross-fade. |
| Scope chip selection | Spring the selection capsule on `spatial-fast`, cross-fade chip colours, then regroup persistent cards with position springs. |
| Scope-filtered results | Shared results slide to new positions; outgoing rows fade at `0.9` scale on `exit`; incoming rows rise 6 px on `spatial-fast`. |
| No-results state | Results leave first on `exit`; the empty-state illustration grows from the search field at `0.94` scale on `spatial-default`. |
| Create-from-search action | Compress the action, collapse the empty state toward it, and expand that surface into quick capture or the editor on `spatial-default`. |

## 7. Tags and related-note navigation

| UI element or change | Animation |
|---|---|
| Tag-list load | Use tag-row skeletons, then cross-fade to real rows over 160 ms with no positional stagger. |
| Tag-row press | Apply the shared press response; the `#` mark moves 2 px toward the label and springs back. |
| Tag drill-in | Share the selected tag label into the section rail while old rows leave downward and note cards rise 10 px on `spatial-default`. |
| Return to all tags | Reverse the drill-in and restore the former tag-list scroll position before paint. |
| Future tag expander | Rotate the caret 180°, shift row surface/mark colour on effects, and expand children by height on `spatial-default` with a 20 ms stagger. Collapsing one tag while opening another is one continuous layout animation. |
| Tag count update | Cross-fade the number in place. If an entire tag disappears, collapse its row on `exit` and spring following rows upward. |
| Backlink panel disclosure | Rotate the disclosure icon 180° on `spatial-fast`; reveal rows by height with a 20 ms stagger and 6 px rise. Collapse on `exit` with no stagger. |
| Backlink navigation | Share the backlink title into the destination masthead/editor and use the normal forward route transition. |

## 8. Editor and formatting

| UI element or change | Animation |
|---|---|
| Editor entrance | Share the note title from its card where supported; bring the body surface up 10 px on `spatial-default`. Existing text does not animate line by line. |
| Title focus | Draw the underline from the caret side over `effects-fast`; placeholder/title cross-fades without shifting baseline. |
| Ordinary typing | No per-keystroke animation. Caret, native selection, and IME behavior remain immediate. |
| Dirty state | Change the editor sync label from Synced to Editing with an effects cross-fade; do not pulse on every keystroke. |
| Save action | Compress on press. On success, the label/icon morphs to a check on `spatial-fast`, holds 500 ms, then returns quietly. |
| Save queued offline | The queued icon pulses once and the editor status bar grows from the Save action toward the title on `spatial-default`. |
| Sticky editor actions | When content scrolls beneath the bar, cross-fade its tonal surface and hairline over `effects-fast`; do not bounce the whole bar. |
| Format toolbar while keyboard is open | Track the visual viewport frame by frame and compact into the horizontal row on `spatial-fast` only after the keyboard begins moving. It must not run a competing independent transition. |
| Format menu open | Grow from the Format button at `0.9` scale with a 14 px rise on `spatial-default`. Stagger cells by 18 ms starting from the cell nearest the thumb. |
| Format menu close | Collapse to the Format button on `exit`, with no stagger. Focus returns to the editor after the exit begins, not after a long wait. |
| Format action | Fill the tapped cell with ember over 150 ms and pulse its corners once. Highlight the affected passage on effects; never bounce the body text. |
| Active formatting state | Move/fade the selected state as the caret crosses marked text on `effects-fast`; no animation should fire while simply arrowing within the same state. |
| Undo or redo | Rotate the pressed arrow 12° and spring back. Flash the changed passage with an ink-container highlight that fades over 400 ms and scroll it into view only if needed. |
| Held undo/redo | Repeat at five steps per second with one shared passage highlight. Do not flash once per repeated step. |
| Wikilink autocomplete open | Expand by height from the caret line on `spatial-fast` with no opacity fade, because it belongs to the text insertion point. |
| Autocomplete results re-rank | Use shared-row position springs so persistent suggestions slide to new positions. New/removed suggestions enter/exit compactly. |
| Accept autocomplete | Collapse the list in 120 ms while raw `[[…]]` syntax cross-fades to its styled link treatment. |
| Editor cursor kept above keyboard | Scroll only the minimum necessary and follow the keyboard's curve. Maintain at least 96 px between caret line and keyboard. |
| Conflict banner entrance | Grow downward from the editor status area on `spatial-default`; error colour arrives on `effects-default`. Focus moves to the heading/actions without a visual jump. |
| Conflict resolution | Collapse the rejected version toward its action on `exit`; highlight the retained text with a 400 ms moss or ink fade. |
| Delete-note action | Widen into an inline confirmation or open the card action sheet on `spatial-default`; after commitment use the shared deletion/Undo sequence. |
| Draft-restored notice | Rise 6 px from the editor surface on `spatial-fast`, hold long enough to read, and leave on `exit`. The restored text itself is already present at first paint. |

## 9. Quick capture and mobile input

| UI element or change | Animation |
|---|---|
| Quick-capture sheet open | Morph the New FAB into the sheet's primary surface while the sheet rises 24 px from the bottom on `spatial-default`; scrim reaches 40% on effects. |
| Capture fields | Title appears with the sheet; body rises 6 px 20 ms later. Focus and keyboard begin only after the sheet has a stable destination. |
| Draft saving | Do not animate each save. A small Saved locally label cross-fades only when the durable state actually changes. |
| Keep writing | Share the title and body fields into the full editor while the sheet corners morph into the editor surface on `spatial-default`. |
| Capture dismissal | Drop the sheet on `exit`; if a non-empty draft was retained, let a small draft chip settle into the list before fading. |
| Incoming PWA share | Launch directly into the populated capture sheet. Shared text is present at first frame; only the sheet entrance animates. |
| Virtual keyboard open/close | Toolbars and sheets track `visualViewport` continuously. Never guess the keyboard duration or animate the same offset twice. |

## 10. Sync queue, messages, and destructive recovery

| UI element or change | Animation |
|---|---|
| Queue count appears | Grow the queue badge from the docked bar on `spatial-fast`; pulse once when the count increases. |
| Queue count changes | Cross-fade digits. When it reaches zero, cross-fade ember to moss, then shrink the badge into the bar on `exit`. |
| Active sync | Draw a 2 px moss progress rule along the top of the docked bar. It may loop by translating once per request, but no icon spins persistently. |
| Queue panel open | Grow from the queue badge on desktop or rise as a bottom sheet on mobile using `spatial-default`; scrim uses effects. |
| Queue row syncing | Shift its status from Queued to Syncing on effects and run the shared progress rule. Keep row geometry fixed. |
| Queue row success | Morph status icon to a moss check on `spatial-fast`, hold briefly, then collapse the row on `exit`. |
| Queue row failure | Cross-fade to error roles and perform one 2 px lateral emphasis. It remains visible until retry or resolution. |
| Retry | Rotate the retry icon up to 160° on `spatial-default`, stopping in its original orientation; status truth updates immediately. |
| Conflict in queue | Expand the row to reveal actions on `spatial-default`; other rows shift once. Never pulse the error indefinitely. |
| Snackbar entrance | Rise 12 px from directly above the docked bar on `spatial-fast` and fade on effects. |
| Snackbar timeout | Shrink its timeout rule linearly while the content remains still; dismiss downward on `exit`. |
| Snackbar Undo | Compress Undo, reverse the associated card deletion, then collapse the snackbar toward the restored card on `exit`. |

## 11. Loading, empty, offline, and error states

| UI element or change | Animation |
|---|---|
| Skeleton cards/rows | Use a low-contrast surface sheen moving once across the group, then pause; avoid endless high-contrast shimmer. Skeleton geometry exactly matches loaded content. |
| Skeleton-to-content | Cross-fade over 160 ms. Do not animate height unless the final content genuinely differs. |
| Empty-state illustration | Assemble sheet, orbit, and spark from the nearest primary action on `spatial-default` with at most a 20 ms part stagger. It remains completely still afterward. |
| Empty-state primary action | Use the normal FAB/primary press response; transition from the illustration into the resulting capture/editor surface. |
| Offline cached-content state | Keep cached content stable. Cross-fade the rail detail to Offline cache and bring in the offline banner; do not dim or disable readable notes. |
| Recoverable inline error | Expand from the component that failed on `spatial-fast`; retry reverses the error state only after success. |
| Full-view error | Replace skeleton/content on `exit`, then raise the error state 8 px on `spatial-default`. Keep navigation available. |

## 12. Themes, responsive layout, and visual-system changes

| UI element or change | Animation |
|---|---|
| Theme-picker open | Grow from the palette control on desktop or rise as a mobile bottom sheet on `spatial-default`. |
| Theme preview selection | Spring the selection outline between preview cards and cross-fade the small preview swatches. Do not recolour the full application on every hover. |
| Applying a theme | Cross-fade surface, text, and accent roles together over 200 ms. Shape and layout stay fixed; colour never overshoots or springs. |
| System theme change | Use the same 200 ms effects transition unless the page is hidden, in which case apply instantly before the next visible frame. |
| Paper theme | Cross-fade exactly like other themes. Do not add simulated page movement, texture animation, or decorative particles. |
| Mobile-to-desktop breakpoint | Use the two-pane activation sequence only when resize settles and the pointer is not actively dragging. Continuous window resizing should reflow directly. |
| Card line clamping after resize/text scaling | Reflow without motion while the viewport or font size is actively changing; use a short effects fade only after a rebuilt card replaces a previous layout. |
| Safe-area colour | Update with the active theme effects transition so device-edge colour and app surface change as one field. |

## 13. Motion that should not be added

- No continuously floating FAB, bouncing empty-state art, blinking sync dot, or
  endlessly rotating sync icon.
- No ripple effects; Noted's tonal and shape response replaces them.
- No parallax while scrolling notes or editor text.
- No typewriter animation for the user's own text.
- No spring on colour, opacity, scrims, text weight, or theme changes.
- No stagger on routine app boot that makes content slower to reach.
- No smooth-scroll restoration when returning to a list; restore immediately.
- No animation that moves focus, delays an ARIA announcement, or makes a control
  unavailable until a flourish finishes.
- No forced portrait-only transition; rotation and landscape are supported.

## 14. Reduced-motion behavior

When `prefers-reduced-motion: reduce` is active:

| Normal behavior | Reduced-motion replacement |
|---|---|
| Spatial spring, travel, shared-element move | 120 ms opacity fade in place |
| Shape or corner morph | Instant final shape |
| Row/cell/chip stagger | All items appear together |
| Scale press | Tonal pressed-state change only |
| Rotation, bounce, pulse, sweep, shimmer | Remove; show the static state immediately |
| List FLIP/reorder | Instant order, with a 120 ms group cross-fade |
| Sheet/menu travel | 120 ms scrim/content fade at final position |
| Route directional movement | 120 ms outgoing/incoming cross-fade |
| Progress-rule movement | Static progress rule while syncing |
| Match or changed-text sweep | Static highlight that fades over 120 ms |

`scroll-behavior` must be `auto`, view transitions must omit transforms, and all
states and controls must remain reachable with animation disabled entirely.

## 15. Implementation and QA rules

- Prefer `transform`, `opacity`, and registered custom properties. Use FLIP or
  the View Transitions API for list/pane identity; avoid animating layout on
  every frame.
- Use `transitionend` only for cleanup, never as the sole trigger for a state
  change. Reduced motion can make durations effectively zero.
- Cancel obsolete Web Animations when a route, query, or gesture changes.
- Keep touch-driven surfaces under the pointer during a gesture; spring only
  after release.
- Set `transform-origin` to the invoking control or physical edge named in this
  specification.
- Test normal and reduced motion at phone and desktop widths. Also test rapid
  repeat input, interrupted route changes, keyboard appearance, screen
  rotation, offline/online changes, and Back while every overlay is open.
- Verify that animated elements do not create unexpected cumulative layout
  shift and that the interface remains operable at 200% text size.
