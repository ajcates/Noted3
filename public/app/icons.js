// @ts-check

/** A deliberately small, consistent 24px outline icon family. */
const PATHS = {
  home: ["M3 11.5 12 4l9 7.5", "M5.5 10v9h13v-9", "M9.5 19v-5h5v5"],
  search: ["M10.5 17a6.5 6.5 0 1 1 0-13 6.5 6.5 0 0 1 0 13Z", "m15.5 15.5 5 5"],
  tag: ["M4 5.5V11l8.5 8.5 7-7L11 4H5.5A1.5 1.5 0 0 0 4 5.5Z", "M8 8h.01"],
  edit: ["m5 19 3.5-.7L19 7.8 16.2 5 5.7 15.5 5 19Z", "m14.7 6.5 2.8 2.8"],
  plus: ["M12 5v14", "M5 12h14"],
  back: ["m14.5 5-7 7 7 7"],
  format: ["M5 18 10.5 5h3L19 18", "M7 14h10"],
  undo: ["M9 8 5 12l4 4", "M6 12h7a5 5 0 0 1 5 5"],
  redo: ["m15 8 4 4-4 4", "M18 12h-7a5 5 0 0 0-5 5"],
  more: ["M6 12h.01", "M12 12h.01", "M18 12h.01"],
  sync: ["m7 7 3-3 3 3", "M10 4v8", "m17 17-3 3-3-3", "M14 20v-8"],
  queued: ["M12 7v5l3 2", "M21 12a9 9 0 1 1-3-6.7"],
  conflict: ["M12 4 3 20h18L12 4Z", "M12 9v4", "M12 17h.01"],
  retry: ["M19 8V4l-2 2a8 8 0 1 0 2.2 8", "M19 4h-4"],
  trash: ["M5 7h14", "M9 7V4h6v3", "m7 7 1 13h8l1-13", "M10 11v5", "M14 11v5"],
  close: ["m6 6 12 12", "M18 6 6 18"],
  check: ["m5 12 4 4L19 6"],
  sort: ["M8 6h11", "M8 12h8", "M8 18h5", "m3 5-2 2-2-2", "M5 7v12"],
  layout: ["M4 5h16v14H4Z", "M4 10h16"],
  palette: [
    "M12 4a8 8 0 1 0 0 16h1.5a1.5 1.5 0 0 0 0-3H12a2 2 0 0 1 0-4h4a4 4 0 0 0-4-9Z",
    "M8 9h.01",
    "M11 7h.01",
    "M7 13h.01",
  ],
  menu: ["M5 7h14", "M5 12h14", "M5 17h14"],
  folder: [
    "M3.5 6.5h6l2 2h9v9.5a1.5 1.5 0 0 1-1.5 1.5H5A1.5 1.5 0 0 1 3.5 18Z",
  ],
  file: ["M6 3.5h8l4 4V20H6Z", "M14 3.5V8h4"],
  chevron: ["m9 5 7 7-7 7"],
};

/**
 * @param {keyof typeof PATHS} name
 * @param {string} [className]
 * @returns {SVGSVGElement}
 */
export function icon(name, className = "") {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("focusable", "false");
  svg.setAttribute("class", `icon ${className}`.trim());
  for (const d of PATHS[name]) {
    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("d", d);
    svg.append(path);
  }
  return svg;
}
