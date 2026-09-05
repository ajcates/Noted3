# noted — Development Style

How work actually gets done on this project, distinct from *what* gets built (that's `spec.md`, `system-overview.md`, `roadmap.md`). This file is itself a living document — update it when the way you actually work drifts from what's written here.

## 1. Language & module design

Deno gives native TypeScript with no build step, so there's no excuse not to use the language fully. Strict mode stays on everywhere (`strict: true`, `noImplicitAny`, `noUncheckedIndexedAccess`) — `any` doesn't appear in this codebase; if a type is genuinely unknown, it's `unknown` and gets narrowed. Favor the parts of modern TypeScript that catch mistakes at compile time rather than the parts that just look clever:

- **Discriminated unions with exhaustive `switch`** for anything with distinct states — a sync-queue entry, a conflict-resolution choice, a wikilink that resolved vs. one that didn't. Let the compiler yell if a case is missing (`never`-check the default branch).
- **`satisfies`** when you want a literal's shape checked against a type without widening it — config objects, route tables, the token names shared with `noted-field-guide.html`.
- **Branded/nominal types** where two strings mean genuinely different things — a note's filename and an arbitrary string shouldn't be interchangeable to the type checker even though both are `string` at runtime.
- **`readonly`/`Readonly<T>` by default** on anything that isn't meant to be mutated in place, especially data coming out of the In-Memory Index.
- **`using` / `await using`** (explicit resource management) anywhere a resource needs guaranteed cleanup — a good fit for the File Store's write handles.

Module boundaries follow `system-overview.md` directly: one module per component in that inventory, and a module only imports the things the dependency map says it depends on — the Editor View doesn't reach into the Write Queue's internals, it goes through the API Client like everything else. High cohesion, loose coupling isn't a slogan here, it's literally "match the diagram."

Within that structure, lean functional with a thin object-oriented shell where actual state demands it. The parsing and transform logic — Frontmatter Parser, Markdown/Wikilink Parser, slug generation, the pure "given this input, produce this output" pieces — stays as plain functions on immutable data, easy to unit-test with no setup. Reach for a small class only where something is genuinely stateful with a lifecycle: the In-Memory Index (it's built, then mutated incrementally, and needs to stay internally consistent), the Sync Manager, the Service Worker registration wrapper. A class here means "state plus the operations that keep it valid," not an inheritance hierarchy — prefer composition over extending base classes.

## 2. Comments explain *why*, not *what*

The code already says what it does; a comment that just restates the line above it in English is noise. Comment the parts a reader can't get from the code alone: why this approach and not the obvious alternative, what tradeoff was made, what would break if this changed. When a comment is implementing a decision from `spec.md` or `system-overview.md`, reference the section (`// see spec.md §7 — conflict handling`) so the reasoning stays connected instead of getting rediscovered later. Exported functions get a short JSDoc block: what it's for, what it assumes about its inputs, what it deliberately does *not* handle.

## 3. Git: commit small, commit often

A commit corresponds to one coherent change, not one day's work. If you can describe what changed in one sentence, it's probably the right size for a commit. Commit as soon as something works, before starting the next small thing — don't let uncommitted changes accumulate across a sitting. Messages describe intent ("add backlink graph rebuild on file rename") over mechanics ("update index.ts"). This matters more here than usual because it's a solo project with no PR review to catch a change getting too large to reason about — frequent commits are the review.

## 4. The build loop: goal, then code, then e2e test

For each task pulled off `TODO.md` (see §5), work in this order, scrum-style, treating each roadmap milestone as a sprint broken into task-sized goals:

1. **Write the goal first** — a sentence or two of acceptance criteria before writing any implementation. "Deleting a note removes the file and marks any note that linked to it as having an unresolved link" is a goal; "implement delete" is not.
2. **Write the code** against that goal.
3. **Write the end-to-end test** that exercises the goal the way a user actually would — through the API or the UI, not by calling an internal function directly. The test is what proves the goal was actually met, not just that the code runs.
4. Only then is the task done: commit, check it off in `TODO.md`.

E2E tests live under `tests/e2e/`, run with Deno's built-in test runner (`deno test`) for API-level flows and Playwright (already available, no separate install needed) for anything that has to happen in a real browser — the wikilink autocomplete, the offline/reconnect sync path, installability.

## 5. Task tracking — `TODO.md`

A `TODO.md` at the repo root holds the active, granular task list — one level more detailed than `roadmap.md`'s milestones. Same checkbox format as the roadmap. When a task is finished, don't delete it — move it under a dated `## Done` heading (`### 2026-09-12`) so there's a record of when things actually got built, which is worth more than it sounds once you're trying to remember why something works the way it does.

## 6. Keep the technical overview current

`spec.md` and `system-overview.md` describe the system as it's *supposed* to work. The moment an implementation detail diverges from what they say — a component gets split, an endpoint's shape changes, a flow picks up a step nobody wrote down — update the doc in the same sitting, not "later." A technical overview that's stopped matching the code is worse than no overview, because it actively misleads the next reader (including future you).

## 7. Issue tracking — `ISSUES.md`

Bugs, rough edges, and deferred decisions get written down the moment they're noticed, even if fixing them right then isn't worth the context switch — an `ISSUES.md` entry with a one-line description and the date. Triage the list every so often (the natural checkpoint is the end of each roadmap milestone): close what's fixed, decide what's actually worth fixing versus what's a v2-or-never wart, and fold anything that turns out to be a real design gap back into `spec.md`'s open questions rather than leaving it stuck in an issue list forever.

## 8. Ask clarifying questions before guessing

When a task is ambiguous enough that two reasonable implementations would behave differently in ways a user would notice, stop and ask rather than picking one silently — especially for anything touching data safety (the conflict-resolution flow), anything hard to undo once notes exist in the vault (the frontmatter schema, the filename/slug scheme), or anything the existing docs genuinely don't cover. Ask with concrete options when there are some to offer ("keep-mine/keep-server's, or a merge view?") rather than an open-ended "what do you want here?" — a concrete choice is easier to answer than a blank page. When there's no one to ask right now, make the most reasonable call, write down the assumption where the decision was made (a comment, or a new line in `spec.md` §11), and keep moving rather than blocking on it.
