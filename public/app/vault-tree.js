// @ts-check

/** @typedef {import("./api.js").NoteSummary} NoteSummary */
/**
 * @typedef {{ path: string, name: string, noteCount: number,
 *   notes: NoteSummary[], folders: FolderNode[] }} FolderNode
 */

/** @param {string} filename */
export function noteFolder(filename) {
  const at = filename.lastIndexOf("/");
  return at < 0 ? "" : filename.slice(0, at);
}

/** @param {string} path */
export function folderName(path) {
  return path.slice(path.lastIndexOf("/") + 1);
}

/**
 * Build one deterministic folder tree from note paths plus the filesystem's
 * explicit folder list, so newly-created empty folders remain visible.
 * @param {readonly NoteSummary[]} notes
 * @param {readonly string[]} [folderPaths]
 * @returns {FolderNode}
 */
export function buildVaultTree(notes, folderPaths = []) {
  /** @type {FolderNode} */
  const root = { path: "", name: "", noteCount: 0, notes: [], folders: [] };
  /** @type {Map<string, FolderNode>} */
  const nodes = new Map([["", root]]);

  /** @param {string} folder */
  const ensureFolder = (folder) => {
    let parent = root;
    let path = "";
    for (const segment of folder.split("/").filter(Boolean)) {
      path = path === "" ? segment : `${path}/${segment}`;
      let node = nodes.get(path);
      if (!node) {
        node = { path, name: segment, noteCount: 0, notes: [], folders: [] };
        nodes.set(path, node);
        parent.folders.push(node);
      }
      parent = node;
    }
    return parent;
  };

  for (const folder of folderPaths) ensureFolder(folder);

  for (const note of notes) {
    const parent = ensureFolder(noteFolder(note.filename));
    parent.notes.push(note);
  }

  const finish = (/** @type {FolderNode} */ node) => {
    node.folders.sort((a, b) => a.name.localeCompare(b.name));
    node.notes.sort((a, b) => a.title.localeCompare(b.title));
    node.noteCount = node.notes.length +
      node.folders.reduce((total, child) => total + finish(child), 0);
    return node.noteCount;
  };
  finish(root);
  return root;
}

/** @param {FolderNode} root @param {string} path */
export function findFolder(root, path) {
  if (path === "") return root;
  let current = root;
  for (const segment of path.split("/")) {
    const child = current.folders.find((folder) => folder.name === segment);
    if (!child) return null;
    current = child;
  }
  return current;
}
