// Anima Rx: build the drug explorer, or one drug's page, from dossiers.
//
//   node rx/build.mjs                  rx/anima-rx.html with every public dossier in rx/dossiers/
//   node rx/build.mjs CGT1815          rx/private/CGT1815.html, opening on that dossier (looked up by id, name or alias)
//   node rx/build.mjs path/to/x.json   same, for a dossier file anywhere on disk; output still goes to rx/private/
//   node rx/build.mjs --check          check every dossier (public and private) and exit non-zero on a problem
//   --light / --dark                   force a theme (default: follow the viewer's system setting)
//   --hosted --out <file>              write the public explorer as a page body for hosting (no downloads, no public lookup)
//
// Pages built from private dossiers are written only to rx/private/, which git ignores.
import { existsSync, readdirSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { ISO_CSS } from "../kit/iso-kit.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const PUBLIC = join(HERE, "dossiers"), PRIVATE = join(HERE, "private");
const args = process.argv.slice(2);
const flags = new Set(args.filter((a) => a.startsWith("--")));
const want = args.find((a) => !a.startsWith("--"));
const theme = flags.has("--light") ? "light" : flags.has("--dark") ? "dark" : "";

const RENDER = readFileSync(join(HERE, "render.js"), "utf8");
const APP = readFileSync(join(HERE, "app.js"), "utf8");
const CSS = readFileSync(join(HERE, "rx.css"), "utf8");
new Function(RENDER)();
const RX = globalThis.AnimaRx;

const norm = (s) => String(s || "").toLowerCase().replace(/[\s\-_.()®™]/g, "");
const readDir = (dir) => (existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith(".json") && !f.startsWith("_")).sort().map((f) => ({ file: join(dir, f), d: JSON.parse(readFileSync(join(dir, f), "utf8")) })) : []);
const pub = readDir(PUBLIC), priv = readDir(PRIVATE);

const MODALITIES = ["small-molecule", "antibody", "protein", "peptide", "oligonucleotide", "mrna", "gene-therapy", "cell-therapy"];
function check({ file, d }) {
  const out = [], warn = (m) => out.push(`  warn  ${m}`), fail = (m) => out.push(`  FAIL  ${m}`);
  if (!d.name) fail("no name");
  if (!d.id) warn("no id; one will be made from the name");
  if (!MODALITIES.includes(d.modality)) fail(`modality "${d.modality}" is not one of ${MODALITIES.join(", ")}`);
  const cls = d.target && d.target.class;
  if (cls && !RX.SCENE_NAMES[cls] && !["kinase", "engager", "mrna-knockdown"].includes(cls)) fail(`target.class "${cls}" is not one of ${Object.keys(RX.SCENE_NAMES).join(", ")}`);
  const ROUTES = ["oral", "sublingual", "inhaled", "nasal", "iv", "subq", "im", "intravitreal", "intrathecal", "topical", "transdermal", "ophthalmic", "rectal", "ex-vivo", "allogeneic", "gene-iv", "mrna-im"];
  if (d.route && !ROUTES.includes(d.route)) fail(`route "${d.route}" is not one of ${ROUTES.join(", ")}`);
  if (!d.route) warn("no route: choosing a different dosage form cannot redraw the entry steps");
  (d.needs || []).forEach((n, i) => { if (!n.path || !n.label) fail(`need ${i + 1} has no path or label`); });
  const req = (d.needs || []).filter((n) => n.required);
  if (req.length) warn(`${req.length} required field(s) still need input: ${req.map((n) => n.label).join(", ")}`);
  const ids = new Set((d.sources || []).map((s) => s.id));
  (d.sources || []).forEach((s, i) => { if (!s.text) fail(`source ${i + 1} has no text`); if (s.id == null) fail(`source ${i + 1} has no id`); });
  const targets = (d.journey || []).filter((j) => j.target).length;
  if (targets > 1) fail(`${targets} journey steps are marked as the target; mark one`);
  if (!targets && (d.journey || []).length) warn("no journey step is marked as the target; the mechanism will play after the last step");
  const where = [
    ...(d.journey || []).map((j, i) => [`journey ${i + 1} (${j.title})`, j, `${j.title} ${j.text}`]),
    ...(d.mechanism || []).map((m, i) => [`mechanism ${i + 1} (${m.title})`, m, `${m.title} ${m.text}`]),
    ...(d.facts || []).map((f, i) => [`fact "${f.label}"`, f, `${f.value}`]),
  ];
  (d.journey || []).forEach((j, i) => {
    const k = String(j.site || "").toLowerCase().trim().replace(/\s+/g, "-");
    if (!RX.SITES[k] && !RX.SITE_ALIAS[k] && !RX.SITES[k + "s"]) warn(`journey ${i + 1}: site "${j.site}" is unknown and will be drawn as "tissues"`);
  });
  for (const [name, it, text] of where) {
    (it.cite || []).forEach((n) => { if (!ids.has(n)) fail(`${name} cites source ${n}, which is not in the sources list`); });
    const bare = String(text).replace(/\b(CYP\d\w*|IgG\d|CD\d+\w*|[A-Z]{1,5}-?\d+[A-Z]?\d*|\d+(st|nd|rd|th)|β|α)\b/g, "");
    if (/\d/.test(bare) && !(it.cite || []).length) fail(`${name} shows a number but cites no source`);
  }
  if (!(d.sources || []).length) warn("no sources: every statement will be shown as unverified");
  return { file, out };
}

if (flags.has("--check")) {
  let bad = 0;
  for (const item of [...pub, ...priv]) {
    const { file, out } = check(item);
    const failed = out.some((l) => l.includes("FAIL"));
    bad += failed;
    console.log(`${failed ? "✗" : "✓"} ${file.replace(HERE + "/", "rx/")}`);
    out.forEach((l) => console.log(l));
  }
  if (!pub.length && !priv.length) console.log("no dossiers found");
  process.exit(bad ? 1 : 0);
}

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const safeJson = (v) => JSON.stringify(v).replace(/</g, "\\u003c");

const HOSTED_CSS = `:root{--rx-host-bg:#f2f2ef}
@media (prefers-color-scheme: dark){:root:not([data-theme="light"]){--rx-host-bg:#0b0b0b;color-scheme:dark}}
:root[data-theme="dark"]{--rx-host-bg:#0b0b0b;color-scheme:dark}
html,body{height:100%}body{background:var(--rx-host-bg)}`;

function page({ title, dossiers, initial, hosted }) {
  const head = hosted
    ? `<title>${esc(title)}</title><meta name="claude:viewport-fit-sides" content="cover">
<style>${HOSTED_CSS}${ISO_CSS}${CSS}</style>
<div class="iso" id="rx-shell"><main class="rx-page">`
    : `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${esc(title)}</title><meta name="description" content="Type a drug name or code and see where it goes in the body and what it does at its target.">
<style>${ISO_CSS}${CSS}</style></head>
<body class="iso"${theme ? ` data-theme="${theme}"` : ""}><main class="rx-page">`;
  return `${head}
<header class="rx-head">
  <div class="rx-brand"><b>Anima Rx</b><span>drug · body · cell</span></div>
  <form class="rx-search" id="rx-search" role="search"><label class="rx-sr" for="rx-q">Drug name or code</label><input id="rx-q" list="rx-list" placeholder="API name or code, e.g. CGT9486" autocomplete="off" spellcheck="false"><datalist id="rx-list"></datalist><label class="rx-sr" for="rx-form-sel">Dosage form</label><select id="rx-form-sel"></select><button type="submit">Go</button><p class="rx-engine" id="rx-engine"></p></form>
  <div class="rx-tools"><button type="button" data-act="open">Open dossier…</button><input type="file" id="rx-file" accept=".json,application/json" hidden><button type="button" data-act="new">New dossier</button><button type="button" data-act="theme">Light theme</button></div>
</header>
<nav class="rx-lib" id="rx-lib" aria-label="Dossiers on this page"></nav>
<div id="rx-msg" class="rx-msg" role="status" hidden></div>
<div id="rx-view"></div>
<details id="rx-edit" class="rx-edit"><summary>Dossier editor: build one for an internal code, or edit the one on screen</summary><div id="rx-form"></div></details>
<footer class="rx-foot">Anima Rx is part of <a href="https://github.com/Garinmckayl/anima">Anima</a>. Educational illustrations of mechanism only: no doses, schedules or recommendations. Dossiers you create or open stay in this browser.</footer>
</main>${hosted ? "</div>" : ""}
<script>window.__RX_DOSSIERS__=${safeJson(dossiers)};window.__RX_INITIAL__=${safeJson(initial || "")};${hosted ? "window.__RX_HOSTED__=true;" : ""}</script>
<script>${RENDER.replace(/<\/(script)/gi, "<\\/$1")}</script>
<script>${APP.replace(/<\/(script)/gi, "<\\/$1")}</script>
${hosted ? "" : "</body></html>\n"}`;
}

const failures = [...pub, ...priv].map(check).filter((r) => r.out.some((l) => l.includes("FAIL")));
const publicDs = pub.map((p) => p.d);

if (flags.has("--hosted")) {
  const out = args[args.indexOf("--out") + 1];
  if (!args.includes("--out") || !out) { console.error("--hosted needs --out <file>"); process.exit(1); }
  writeFileSync(resolve(out), page({ title: "Anima Rx", dossiers: publicDs, initial: publicDs[0] && publicDs[0].id, hosted: true }));
  console.log(`wrote ${out} (hosted, ${publicDs.length} public dossiers)`);
} else if (!want) {
  const bad = failures.filter((f) => f.file.startsWith(PUBLIC));
  if (bad.length) { bad.forEach((b) => console.error(`✗ ${b.file}\n${b.out.join("\n")}`)); process.exit(1); }
  const name = theme === "light" ? "anima-rx-light.html" : theme === "dark" ? "anima-rx-dark.html" : "anima-rx.html";
  writeFileSync(join(HERE, name), page({ title: "Anima Rx", dossiers: publicDs, initial: publicDs[0] && publicDs[0].id }));
  console.log(`wrote rx/${name} (${publicDs.length} dossiers)`);
} else {
  let item = null;
  if (want.endsWith(".json") && existsSync(resolve(want))) item = { file: resolve(want), d: JSON.parse(readFileSync(resolve(want), "utf8")) };
  else item = [...priv, ...pub].find(({ d }) => [d.id, d.name, ...(d.aliases || [])].some((a) => norm(a) === norm(want)));
  if (!item) {
    console.error(`No dossier matches "${want}".\nLooked in rx/private/ and rx/dossiers/. Start one with:\n  cp rx/dossiers/_template.json rx/private/${basename(want)}.json\nor open rx/anima-rx.html, type ${want}, and use the dossier editor.`);
    process.exit(1);
  }
  const res = check(item);
  if (res.out.length) console.log(`${item.file}\n${res.out.join("\n")}`);
  if (res.out.some((l) => l.includes("FAIL"))) process.exit(1);
  const d = { ...item.d, id: item.d.id || norm(item.d.name) };
  const isPublic = item.file.startsWith(PUBLIC + "/");
  if (!isPublic && d.confidential == null) d.confidential = true;
  const all = [d, ...publicDs.filter((p) => p.id !== d.id)];
  mkdirSync(PRIVATE, { recursive: true });
  const out = join(PRIVATE, `${d.id}${theme ? `-${theme}` : ""}.html`);
  writeFileSync(out, page({ title: `${d.name} · Anima Rx`, dossiers: all, initial: d.id }));
  console.log(`wrote ${out.replace(HERE + "/", "rx/")}${isPublic ? "" : " (git-ignored; keep it inside your controlled environment)"}`);
}
