/**
 * Git Backup (M7, `notes/roadmap.md`) — the chosen backup strategy for
 * `NOTES_DIR`: a plain git repo, committed to automatically after every
 * write, giving full history for free instead of a separate periodic-copy
 * job.
 *
 * Best-effort throughout: if `git` isn't installed, or a commit fails for
 * some other reason, this logs a warning once and otherwise gets out of the
 * way — a missing backup should never turn into a lost edit or a failed API
 * response (`ISSUES.md`). Commits are serialized per `notesDir` via
 * {@link scheduleBackup} so two writes landing close together can't race two
 * `git` processes over the same `.git/index.lock`.
 */

async function run(
  notesDir: string,
  args: string[],
): Promise<{ success: boolean; stderr: string }> {
  const command = new Deno.Command("git", {
    args,
    cwd: notesDir,
    stdout: "null",
    stderr: "piped",
  });
  const { success, stderr } = await command.output();
  return { success, stderr: new TextDecoder().decode(stderr) };
}

/**
 * Vault directories `ensureRepo` has confirmed are a ready git repo.
 * `scheduleBackup` is a no-op for anything not in here — most importantly,
 * this keeps every `deno test` temp directory (which never calls
 * `ensureRepo`, since that's a `main.ts` boot step) silent instead of
 * spamming "not a git repository" warnings on every write.
 */
const readyDirs = new Set<string>();

let gitAvailable: Promise<boolean> | undefined;

/** Whether a `git` binary is on `PATH` at all. Checked once, cached. */
function isGitAvailable(): Promise<boolean> {
  gitAvailable ??= new Deno.Command("git", { args: ["--version"] })
    .output()
    .then((r) => r.success)
    .catch(() => false);
  return gitAvailable;
}

/**
 * Make sure `notesDir` is a git repo, ready to commit to. Safe to call every
 * boot: no-ops if `.git` already exists (including a repo the user already
 * manages themselves — their identity/remotes/history are left untouched).
 *
 * Returns whether backups are actually active (`false` when `git` isn't
 * installed or `git init` failed) — `main.ts` logs this once at boot rather
 * than silently doing nothing.
 */
export async function ensureRepo(notesDir: string): Promise<boolean> {
  if (!(await isGitAvailable())) return false;

  const alreadyRepo = await Deno.stat(`${notesDir}/.git`).then(
    () => true,
    (cause) => {
      if (cause instanceof Deno.errors.NotFound) return false;
      throw cause;
    },
  );

  if (!alreadyRepo) {
    const init = await run(notesDir, ["init", "--quiet"]);
    if (!init.success) return false;

    // A fresh machine may have no git identity configured at all, which
    // would otherwise fail every commit. Only set one locally, and only if
    // nothing — global or local — is already there.
    const hasIdentity = (await run(notesDir, ["config", "user.email"])).success;
    if (!hasIdentity) {
      await run(notesDir, ["config", "user.name", "noted"]);
      await run(notesDir, ["config", "user.email", "noted@localhost"]);
    }
  }

  readyDirs.add(notesDir);
  return true;
}

/** `git add -A && git commit`. Resolves quietly when there's nothing to commit. */
async function commitAll(notesDir: string, message: string): Promise<void> {
  const add = await run(notesDir, ["add", "-A"]);
  if (!add.success) {
    console.warn(`noted: backup 'git add' failed:\n${add.stderr}`);
    return;
  }
  const commit = await run(notesDir, ["commit", "--quiet", "-m", message]);
  if (!commit.success && !commit.stderr.includes("nothing to commit")) {
    console.warn(`noted: backup commit failed:\n${commit.stderr}`);
  }
}

const backupChains = new Map<string, Promise<void>>();

/**
 * Queue a backup commit for `notesDir`, chained after any already-pending one
 * for the same directory. Fire-and-forget — callers don't (and shouldn't)
 * await this; a save should never wait on a `git commit`.
 */
export function scheduleBackup(notesDir: string, message: string): void {
  if (!readyDirs.has(notesDir)) return;

  const previous = backupChains.get(notesDir) ?? Promise.resolve();
  const next = previous
    .then(() => commitAll(notesDir, message))
    .catch((cause) => {
      console.warn(`noted: backup commit threw:`, cause);
    });
  backupChains.set(notesDir, next);
}

/**
 * Wait for every currently-scheduled backup commit to finish. Called on
 * shutdown (`main.ts`, `SIGINT`/`SIGTERM`) so a commit already in flight
 * isn't killed mid-write by the process exiting.
 */
export function flushBackups(): Promise<void> {
  return Promise.all(backupChains.values()).then(() => undefined);
}
