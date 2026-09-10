# noted

A local-first, self-hosted markdown notes app — wikilinks, backlinks, tags,
search, offline sync, and a real git-backed history of your vault. Design and
architecture live in `notes/` (`spec.md`, `system-overview.md`, `techstack.md`,
`roadmap.md`).

## Install

```sh
npm install -g @ajcates/noted3
```

Needs [Deno](https://deno.com) under the hood — `noted` checks for it on first
run and installs it automatically if it's missing.

## Use

```sh
cd ~/wherever-you-keep-your-notes
noted
```

That's it. `noted`:

- treats the directory you ran it from as your vault (`NOTES_DIR`)
- always listens on the same port for that same directory, and a different port
  for a different directory, so several vaults can run side by side
- opens your browser to the running app for you
- remembers you across restarts (same URL, no login step)
- turns the vault into a git repo and commits every save automatically, so you
  get full history for free — nothing to configure

Run it from a different folder and you get a second, independent vault.

## Local development

See `notes/development.md` and `notes/techstack.md`. Short version:

```sh
deno task dev     # watch mode, reads .env (copy .env.example first)
deno task test    # full test suite
deno task check   # type-check
```
