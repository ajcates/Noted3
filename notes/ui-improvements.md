# Twenty UI improvements for Noted

These ideas build on the existing Material 3-inspired design without changing
the app's local-first, lightweight character. They are ordered roughly by how
much everyday usability they would add.

**Implementation status:** all twenty improvements are complete on
`feat/ui-improvements`. The companion motion inventory and Material 3
Expressive behaviour are documented in [`ui-animations.md`](ui-animations.md).

## 1. Make the masthead reflect the current context

The same `noted` masthead and navigation buttons currently appear on every
screen, which makes search results, tag views, and the editor feel less distinct
than they should.

- On the note list, show a small kicker with the vault name and note count.
- On search, tag, and editor screens, replace the wordmark with a back button
  and the current screen or note title.
- Keep global actions available, but visually separate them from contextual
  navigation.

**Done when:** a user can tell where they are and how to return without having
to interpret the URL or use the browser's Back button.

## 2. Add sorting and a compact list option

Long vaults will become difficult to scan if every note always uses the same
large snippet-card layout and fixed ordering.

- Add a sort control for recently updated, title A–Z, and backlink count.
- Add a comfortable/compact toggle; compact rows can omit the excerpt while
  retaining the title, tags, sync state, and updated time.
- Persist both choices locally so the list does not reset on every visit.

**Done when:** users can quickly find recent or highly connected notes and fit
more notes on screen when they prefer density over previews.

## 3. Make search results explain why they matched

Search currently returns note cards, but it does not highlight the matching
text or summarize the result set. This makes near-identical results harder to
compare.

- Highlight matched terms in titles, excerpts, and tags.
- Show a result count and the active query above the cards.
- Add scope chips for Everything, Titles, Tags, and Links.
- When there are no matches, offer a primary action to create a note using the
  query as its title.

**Done when:** every result visibly communicates why it appeared, and an empty
search still provides a useful next action.

## 4. Surface sync state wherever a note appears

Offline saves currently use a transient shell message. Once that message
disappears, a queued note looks identical to a fully synced one.

- Show a small status mark on note cards and in the editor for saving, queued,
  synced, and conflicted states.
- Put a queue count on the docked toolbar while writes are pending.
- Let the user open a small queue panel to see which notes are waiting and retry
  failed writes.
- Use both an icon and a label for errors so state is never communicated by
  colour alone.

**Done when:** users can always tell whether their latest edits are safely local,
waiting to sync, or need attention.

## 5. Introduce a wide-screen two-pane layout

The app is capped at a narrow mobile column even when a large desktop window is
available. Editing often requires switching back and forth between the list and
a note.

- Keep the current single-column layout on phones.
- At a suitable breakpoint, expand the shell and show the note list, search, or
  tags in a left pane with the selected note in a larger editor pane.
- Preserve the selected item and scroll position when moving between notes.
- Make both panes independently scrollable and fully keyboard navigable.

**Done when:** desktop users can browse and edit without losing their place,
while the existing mobile experience remains unchanged.

## 6. Put primary mobile navigation within thumb reach

Search and tags currently live in the top masthead while the New note action is
at the bottom. On taller phones, moving between these controls requires a lot of
hand repositioning.

- Turn the mobile docked toolbar into a consistent Home, Search, and Tags
  navigation bar with the New note action kept prominent.
- Clearly mark the active destination with shape, colour, and a text label.
- Respect `env(safe-area-inset-bottom)` so controls stay clear of gesture bars
  and display cut-outs.
- Keep the top masthead focused on context rather than duplicating navigation.

**Done when:** every primary destination and creation action can be reached
comfortably with one thumb on a typical phone.

## 7. Make the editor adapt to the virtual keyboard

The editor's sticky actions and format controls can become cramped or obscured
when a mobile keyboard reduces the viewport.

- Keep Save and the current sync state visible immediately above the keyboard.
- Collapse formatting controls into a horizontally scrollable, touch-sized row
  while typing, with the full format menu still available on demand.
- Use the visual viewport to prevent the cursor, autocomplete menu, and selected
  text from being hidden behind the keyboard.
- Restore the full editor layout when the keyboard closes without jumping the
  user's scroll position.

**Done when:** users can type, format, follow autocomplete suggestions, and save
without dismissing the keyboard or losing their place.

## 8. Replace exposed destructive actions with touch-safe card actions

Every note card currently has a separate Delete control underneath it. This
adds visual noise and places a destructive action directly in the normal
scrolling path.

- Move secondary actions into a clearly labelled overflow menu on each card.
- Optionally allow a deliberate horizontal swipe to reveal Delete, while
  retaining the menu for accessibility and discoverability.
- Show an Undo snackbar after deletion instead of relying only on a confirmation
  dialog.
- Require enough swipe distance and ignore mostly vertical movement so ordinary
  scrolling cannot trigger an action.

**Done when:** note cards are cleaner, deletion remains easy to find, and an
accidental touch can be reversed immediately.

## 9. Add a fast mobile capture flow

Creating a note currently opens the full editor immediately. That works for
long-form writing, but it adds friction when someone only wants to capture a
thought before it disappears.

- Let the New note action open a lightweight bottom sheet with the title and
  first few lines ready for typing.
- Save the draft locally from the first keystroke so closing the sheet cannot
  lose captured text.
- Offer **Keep writing** to expand the sheet into the full editor without
  recreating the note.
- Allow shared text from another mobile app to enter through the same capture
  sheet when Noted is installed as a PWA.

**Done when:** a user can capture and safely close a short thought in a few
seconds, while retaining a direct path into the full editor.

## 10. Preserve context through mobile back navigation

Mobile users frequently move between a list and several notes. Returning to the
top of the list or losing an unfinished edit makes that exploration feel much
slower.

- Restore each list's scroll position, active sort, and search query when the
  user returns from a note.
- Keep unsaved editor text as a local draft when navigating away, then offer to
  resume it on return.
- Make the device or browser Back action close an open menu, sheet, or dialog
  before leaving the current screen.
- Use a subtle directional transition so forward and backward navigation are
  visually distinct, with a reduced-motion fallback.

**Done when:** opening a note and going back returns the user to the same place
and no in-progress mobile edit disappears unexpectedly.

## 11. Support mobile text scaling and orientation changes

The interface should remain usable when the operating system uses larger text,
display zoom, or a landscape orientation. Fixed-height controls and tightly
packed rows can otherwise clip labels or overlap content.

- Test the complete interface at 200% text size and allow controls and cards to
  grow vertically rather than clipping text.
- Reflow action bars when translated or enlarged labels no longer fit on one
  row.
- Maintain at least 44-by-44 CSS-pixel touch targets without preventing browser
  zoom.
- Handle portrait/landscape and device rotation without losing the editor
  selection, draft, or current scroll position.

**Done when:** all mobile workflows remain readable and operable with large text,
zoom, and either screen orientation.

## 12. Strengthen the visual hierarchy and spacing rhythm

The colour and type foundations are expressive, but screens would feel more
intentional if headings, content groups, and spacing followed a clearer visual
rhythm.

- Add a section rail above note collections with a descriptive title, item
  count, and any active filter or sort.
- Use a small, consistent spacing scale instead of ad-hoc gaps between controls,
  cards, and sections.
- Increase contrast between primary content, supporting metadata, and secondary
  actions through type size, weight, and surface tone rather than extra borders.
- Align card titles, excerpts, chips, and timestamps to a shared internal grid.

**Done when:** each screen has an obvious first, second, and third level of
attention, and repeated elements align consistently as the user scrolls.

## 13. Replace text glyphs with a cohesive icon set

The current interface mixes symbols such as `⌕`, `#`, `↶`, `↷`, and `✎` with
text labels. Their weight, baseline, and appearance vary across devices and
fonts, which makes otherwise polished controls look uneven.

- Create a small SVG icon family with the same stroke width, corner treatment,
  and optical size.
- Cover navigation, search, tags, formatting, undo/redo, backlinks, sync, and
  overflow actions with the same visual language.
- Keep accessible text labels or tooltips instead of relying on icons alone.
- Tune icon placement inside the mirrored-squircle buttons so each control feels
  visually centred, not merely mathematically centred.

**Done when:** icons look like one designed family at every size and remain
consistent across browsers and operating systems.

## 14. Add user-selectable visual themes

Noted currently follows the system's light or dark preference. A small set of
curated themes would let the interface feel more personal without weakening the
existing design system.

- Provide Light, Dark, and System choices plus a low-glare Paper theme for long
  reading and writing sessions.
- Derive every theme from the existing OKLCH roles so contrast and component
  relationships remain predictable.
- Preview the selected surface, type, and accent colours before applying them.
- Store the preference locally and set the browser theme colour to match the
  active surface.

**Done when:** users can change the app's overall atmosphere while every screen
still looks recognisably like Noted and meets the same contrast standard.

## 15. Give the mobile shell an edge-to-edge treatment

The narrow app surface currently reads like a centred web page. On a phone, the
interface would feel more native if its colour and structure deliberately
included the device edges.

- Extend the masthead and docked navigation surfaces behind the status and
  gesture-bar areas, with content inset by the appropriate safe-area values.
- Set the browser status-bar and navigation-bar colours to blend with the active
  theme instead of leaving contrasting system strips.
- Use a subtle tonal change or hairline where fixed chrome meets scrolling
  content, rather than boxing the whole app in a separate column.
- Remove the desktop-style outer gutter and shadow at mobile widths while
  retaining them for the wide-screen layout.

**Done when:** the PWA fills the phone screen as one intentional composition,
including around notches, rounded corners, and gesture areas.

## 16. Refine the visual composition of note cards on small screens

On a narrow viewport, titles, excerpts, chips, backlinks, and timestamps compete
for limited space. A predictable card composition would make the list calmer
and easier to scan.

- Clamp titles and excerpts to deliberate line counts so card heights remain
  balanced without hiding whether a note has body text.
- Show the most relevant tag first and collapse additional tags into a compact
  `+N` chip rather than wrapping into an uneven second row.
- Reserve a consistent metadata baseline for the sync mark and updated time.
- Use the notched-corner variations in a controlled repeating rhythm, with a
  clear pressed surface state when a card is touched.

**Done when:** a screenful of mobile cards has a clean visual cadence even when
note titles, excerpts, and tag counts vary widely.

## 17. Design branded mobile loading and empty states

Blank space and plain status text make an interface look unfinished while data
loads or when a new vault has no content. These moments are especially prominent
on a full-screen mobile layout.

- Create a small family of lightweight illustrations using Noted's ink, moss,
  and ember colours for empty notes, empty search, no tags, and offline states.
- Pair each illustration with one short explanation and a relevant primary
  action, such as **Create your first note** or **Clear search**.
- Use skeleton cards that match the real card geometry while a list is loading,
  avoiding generic spinners and layout jumps.
- Keep artwork compact and decorative so it does not compete with recovery
  instructions or consume most of a short screen.

**Done when:** loading, empty, and offline screens look like deliberate parts of
the Noted design rather than temporary gaps in the interface.

## 18. Keep mobile vault identity readable

Long vault folder names can consume the whole masthead and cause the useful note
count to disappear at phone widths.

- Put the vault name and note count in separate elements so only the name
  truncates.
- Stack the identity beneath the wordmark on narrow phones, preserving a calm
  two-line lockup.
- Keep the complete vault name available as a tooltip on devices that support
  hover.

**Done when:** the wordmark and note count remain intact at 320 CSS pixels even
when the vault name is unusually long.

## 19. Give mobile sheets a physical affordance

Bottom sheets read more clearly as temporary mobile surfaces when their top
edge indicates that they can be dismissed and are separate from the page.

- Add a subtle, centred grab handle to bottom sheets.
- Use the outline colour at low emphasis so the handle never competes with the
  sheet title or close button.
- Hide the handle when the same component becomes a centred desktop dialog.

**Done when:** capture, sync, and settings sheets are immediately recognisable
as layered mobile surfaces without adding explanatory text.

## 20. Move connection controls out of the everyday layout

The persistent Connection settings footer creates a large strip of low-value
chrome below every screen, even after the app is configured.

- Place the authentication token control in the existing appearance/settings
  sheet.
- Keep the token masked and explain that it remains in the current browser.
- Remove the footer so the content panes can use the full remaining viewport.

**Done when:** connection setup remains discoverable from the masthead while no
permanent settings panel interrupts browsing or editing.
