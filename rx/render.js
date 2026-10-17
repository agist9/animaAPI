/* Anima Rx renderer: one dossier in, a body map + a cell-level mechanism + a step player out.
   Plain browser script with no dependencies; rx/build.mjs inlines it into a standalone page. */
(function (G) {
  "use strict";

  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const mix = (p, q, t) => [lerp(p[0], q[0], t), lerp(p[1], q[1], t)];
  const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
  const f1 = (v) => Math.round(v * 10) / 10;
  const ph = (t, period, off = 0) => (((t / period + off) % 1) + 1) % 1;
  const lower = (s) => String(s || "").toLowerCase();

  /* ---------- the body ---------- */

  const SITES = {
    brain: { label: "Brain", pts: [[150, 48]] },
    mouth: { label: "Mouth", pts: [[150, 78]] },
    eye: { label: "Eye", pts: [[139, 57], [161, 57]] },
    nose: { label: "Nose", pts: [[150, 67]] },
    lungs: { label: "Lungs", pts: [[126, 190], [174, 190]] },
    heart: { label: "Heart", pts: [[156, 203]] },
    blood: { label: "Bloodstream", pts: [[153, 214], [92, 200], [208, 200], [121, 420], [179, 420], [152, 300]] },
    liver: { label: "Liver", pts: [[134, 238]] },
    stomach: { label: "Stomach", pts: [[178, 246]] },
    spleen: { label: "Spleen", pts: [[191, 240]] },
    pancreas: { label: "Pancreas", pts: [[162, 266]] },
    kidneys: { label: "Kidneys", pts: [[128, 277], [172, 277]] },
    intestine: { label: "Intestine", pts: [[150, 308]] },
    bladder: { label: "Bladder", pts: [[150, 344]] },
    "bone-marrow": { label: "Bone marrow", pts: [[122, 405], [178, 405]] },
    "lymph-nodes": { label: "Lymph nodes", pts: [[141, 100], [159, 100], [110, 162], [190, 162], [136, 350], [164, 350]] },
    "spinal-cord": { label: "Spinal cord", pts: [[150, 120], [150, 170], [150, 220], [150, 270]] },
    joints: { label: "Joints", pts: [[120, 470], [180, 470]] },
    skin: { label: "Skin", pts: [[238, 300]] },
    iv: { label: "Vein (IV)", pts: [[72, 262]] },
    subq: { label: "Under the skin", pts: [[186, 398]] },
    im: { label: "Muscle", pts: [[220, 158]] },
    tumor: { label: "Tumour", pts: [[180, 171]] },
    tissues: { label: "Body tissues", pts: [[118, 200], [184, 206], [112, 300], [190, 300], [128, 440], [172, 440], [78, 250], [222, 250]] },
    "ex-vivo": { label: "Ex vivo (GMP)", pts: [[268, 520]] },
  };
  const SITE_ALIAS = {
    gut: "intestine", "small-intestine": "intestine", colon: "intestine", feces: "intestine", stool: "intestine", bile: "intestine",
    kidney: "kidneys", urine: "bladder", marrow: "bone-marrow", lymph: "lymph-nodes", "lymph-node": "lymph-nodes",
    vein: "iv", intravenous: "iv", infusion: "iv", subcutaneous: "subq", sc: "subq", intramuscular: "im", muscle: "im",
    topical: "skin", transdermal: "skin", cns: "brain", spine: "spinal-cord", lung: "lungs", inhaled: "lungs", tumour: "tumor",
    duodenum: "intestine", jejunum: "intestine", ileum: "intestine", portal: "liver", hepatic: "liver", renal: "kidneys", csf: "spinal-cord", "motor-neurons": "spinal-cord",
    oral: "mouth", sublingual: "mouth", buccal: "mouth", manufacturing: "ex-vivo", eyes: "eye", ophthalmic: "eye", intravitreal: "eye",
    nasal: "nose", intranasal: "nose", rectum: "intestine", rectal: "intestine", intrathecal: "spinal-cord", circulation: "blood", plasma: "blood", "whole-body": "tissues", body: "tissues",
  };
  const siteId = (s) => { const k = lower(s).trim().replace(/\s+/g, "-"); return SITES[k] ? k : SITE_ALIAS[k] || (SITES[k + "s"] ? k + "s" : "tissues"); };

  function smoothClosed(p) {
    const n = p.length, at = (i) => p[(i + n) % n];
    let d = `M${p[0][0]},${p[0][1]}`;
    for (let i = 0; i < n; i++) {
      const p0 = at(i - 1), p1 = at(i), p2 = at(i + 1), p3 = at(i + 2);
      d += `C${f1(p1[0] + (p2[0] - p0[0]) / 6)},${f1(p1[1] + (p2[1] - p0[1]) / 6)} ${f1(p2[0] - (p3[0] - p1[0]) / 6)},${f1(p2[1] - (p3[1] - p1[1]) / 6)} ${p2[0]},${p2[1]}`;
    }
    return d + "Z";
  }
  const HALF = [[162, 92], [166, 112], [178, 124], [204, 131], [221, 142], [229, 166], [235, 212], [241, 260], [249, 308], [256, 344], [263, 368], [258, 388], [246, 384], [238, 352], [227, 308], [216, 262], [207, 214], [203, 178], [200, 212], [195, 258], [201, 300], [207, 338], [207, 398], [201, 458], [197, 520], [193, 572], [206, 592], [190, 600], [166, 598], [164, 574], [163, 520], [160, 458], [157, 398], [153, 358]];
  const SILHOUETTE = smoothClosed([...HALF, ...HALF.slice().reverse().map(([x, y]) => [300 - x, y])]);

  const organ = (site, inner) => `<g class="rx-organ" data-site="${site}" tabindex="0" role="button" aria-label="${esc(SITES[site].label)}">${inner}</g>`;
  function bodySvg() {
    const vessels = [
      "M154,196 L152,338", "M152,338 C160,352 176,362 178,420 L178,575", "M152,338 C144,352 124,362 122,420 L122,575",
      "M150,140 C176,136 206,140 214,160 C222,200 228,250 236,300 L246,350", "M150,140 C124,136 94,140 86,160 C78,200 72,250 64,300 L54,350",
      "M150,150 L150,96",
    ];
    return `<svg class="rx-body" viewBox="-62 14 424 596" role="img" aria-label="Schematic human body showing where the drug goes">
<path class="rx-sil" d="${SILHOUETTE}"/><ellipse class="rx-sil" cx="150" cy="56" rx="27" ry="33"/>
<g class="rx-vessels">${vessels.map((d) => `<path d="${d}"/>`).join("")}</g>
${organ("brain", `<path class="rx-o" d="M128,50 C126,34 140,27 150,28 C162,27 175,34 172,50 C171,62 160,68 150,67 C139,68 129,62 128,50 Z"/><path class="rx-o-line" d="M136,40 C141,44 137,50 142,54 M150,31 L150,66 M164,40 C159,44 163,50 158,54"/>`)}
${organ("mouth", `<path class="rx-o-line rx-o-strong" d="M142,77 C146,80 154,80 158,77"/>`)}
${organ("eye", `<path class="rx-o" d="M133,57 C136,53.5 142,53.5 145,57 C142,60.5 136,60.5 133,57 Z"/><path class="rx-o" d="M155,57 C158,53.5 164,53.5 167,57 C164,60.5 158,60.5 155,57 Z"/>`)}
${organ("nose", `<path class="rx-o-line rx-o-strong" d="M150,60 L146.5,69 L152,69"/>`)}
${organ("lungs", `<path class="rx-o" d="M146,152 C130,148 112,164 110,192 C108,214 114,226 124,226 C134,226 143,220 144,210 Z"/><path class="rx-o" d="M154,152 C170,148 188,164 190,192 C192,214 186,226 176,226 C166,226 157,220 156,210 Z"/><path class="rx-o-line" d="M150,104 L150,150 M150,150 L141,160 M150,150 L159,160"/>`)}
${organ("heart", `<path class="rx-o" d="M149,192 C142,186 134,193 139,202 C142,209 151,214 158,219 C166,212 173,204 171,196 C169,188 160,187 156,193 C154,191 152,191 149,192 Z"/>`)}
${organ("kidneys", `<ellipse class="rx-o" cx="128" cy="277" rx="8" ry="13"/><ellipse class="rx-o" cx="172" cy="277" rx="8" ry="13"/>`)}
${organ("liver", `<path class="rx-o" d="M108,229 C120,219 150,219 171,224 C176,226 176,232 170,236 C156,245 136,258 118,258 C107,256 104,240 108,229 Z"/>`)}
${organ("spleen", `<ellipse class="rx-o" cx="191" cy="240" rx="5" ry="11" transform="rotate(18 191 240)"/>`)}
${organ("stomach", `<path class="rx-o" d="M168,232 C176,226 190,228 191,241 C193,255 185,264 172,264 C164,264 158,261 155,256 C162,256 170,254 172,248 C174,242 168,238 168,232 Z"/>`)}
${organ("pancreas", `<path class="rx-o" d="M140,266 C150,262 168,262 182,258 C185,262 182,266 176,267 C164,270 150,272 140,270 Z"/>`)}
${organ("intestine", `<path class="rx-o-tube" d="M126,334 L124,292 C124,285 130,282 138,282 L162,282 C170,282 176,285 176,292 L176,330"/><path class="rx-o-tube rx-o-thin" d="M136,294 C146,290 156,298 164,294 C168,302 158,306 148,304 C138,302 134,310 140,314 C150,318 160,312 164,318 C166,326 154,328 146,326 C138,324 136,330 141,332"/>`)}
${organ("bladder", `<ellipse class="rx-o" cx="150" cy="344" rx="10" ry="7"/>`)}
${organ("bone-marrow", `<path class="rx-bone" d="M124,360 L121,452 M176,360 L179,452 M118,330 C126,346 140,350 150,350 C160,350 174,346 182,330"/><path class="rx-marrow" d="M124,368 L121,444 M176,368 L179,444"/>`)}
${organ("joints", `<circle class="rx-o" cx="120" cy="470" r="7"/><circle class="rx-o" cx="180" cy="470" r="7"/>`)}
${organ("spinal-cord", `<path class="rx-cord" d="M150,82 L150,330"/>`)}
${organ("lymph-nodes", SITES["lymph-nodes"].pts.map(([x, y]) => `<circle class="rx-o" cx="${x}" cy="${y}" r="3.2"/>`).join(""))}
${organ("tumor", `<path class="rx-o rx-tumor" d="M174,163 C178,159 187,161 189,168 C191,175 186,181 180,181 C173,182 169,177 170,171 C170,168 171,165 174,163 Z"/>`)}
${organ("iv", `<path class="rx-o-line rx-o-strong" d="M56,248 L72,262"/><circle class="rx-o" cx="72" cy="262" r="3"/>`)}
${organ("subq", `<path class="rx-o-line rx-o-strong" d="M200,386 L188,397"/><circle class="rx-o" cx="186" cy="398" r="2.6"/>`)}
${organ("im", `<path class="rx-o-line rx-o-strong" d="M236,146 L222,157"/><circle class="rx-o" cx="220" cy="158" r="2.6"/>`)}
${organ("skin", `<rect class="rx-o" x="231" y="292" width="15" height="16" rx="3" transform="rotate(-8 238 300)"/>`)}
${organ("ex-vivo", `<path class="rx-o" d="M256,500 L280,500 C284,500 286,503 286,507 L286,538 C286,544 282,548 276,548 L260,548 C254,548 250,544 250,538 L250,507 C250,503 252,500 256,500 Z"/><path class="rx-o-line" d="M268,500 L268,486 M254,520 L282,520"/>`)}
<g class="rx-dots">${Array.from({ length: 18 }, () => `<circle r="2.4"/>`).join("")}</g>
<g class="rx-callout"><path class="rx-leader"/><text class="rx-site-label"></text></g>
</svg>`;
  }

  const DIRECT = new Set(["mouth>stomach", "stomach>intestine", "intestine>liver", "liver>intestine", "kidneys>bladder", "liver>kidneys", "intestine>bladder", "liver>bladder"]);
  const HUB = [155, 206];
  function routeOf(a, b, i) {
    const pb = SITES[b].pts[i % SITES[b].pts.length];
    if (!a) return [[pb[0] - 40, pb[1] - 46], pb];
    const pa = SITES[a].pts[i % SITES[a].pts.length];
    if (a === b) return [pa, pb];
    const hubless = ["blood", "heart", "ex-vivo", "tissues"].includes(a) || ["blood", "heart", "ex-vivo", "tissues"].includes(b) || DIRECT.has(`${a}>${b}`);
    return hubless ? [pa, pb] : [pa, HUB, pb];
  }
  function along(route, u) {
    if (route.length === 2) return mix(route[0], route[1], u);
    const l1 = Math.hypot(route[1][0] - route[0][0], route[1][1] - route[0][1]);
    const l2 = Math.hypot(route[2][0] - route[1][0], route[2][1] - route[1][1]);
    const s = u * (l1 + l2);
    return s < l1 ? mix(route[0], route[1], s / (l1 || 1)) : mix(route[1], route[2], (s - l1) / (l2 || 1));
  }

  /* ---------- the cell: shared pieces ---------- */

  function bilayer(y, x0 = -10, x1 = 450, flip = false) {
    let s = "";
    for (let x = x0; x <= x1; x += 7.5) {
      s += `<circle cx="${x}" cy="${y}" r="2.7"/><circle cx="${x}" cy="${y + 18}" r="2.7"/>`;
    }
    return `<g class="rx-mem"><rect class="rx-mem-core" x="${x0}" y="${y + 3}" width="${x1 - x0}" height="12"/>${s}</g>`;
  }
  const nucleus = (cx, cy, rx, ry) => `<g class="rx-nuc"><ellipse class="rx-nuc-glow" cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}"/><ellipse class="rx-nuc-env" cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}"/><ellipse class="rx-nuc-env rx-thin" cx="${cx}" cy="${cy}" rx="${rx - 4}" ry="${ry - 4}"/><path class="rx-chrom" d="M${cx - rx * 0.6},${cy + 6} c 14,-14 22,10 36,-4 s 22,10 36,-4 s 22,10 34,-2"/><text class="rx-lab" x="${cx - rx * 0.55}" y="${cy - ry * 0.35}">nucleus</text></g>`;
  const lab = (x, y, text, anchor = "start", cls = "") => `<text class="rx-lab ${cls}" x="${x}" y="${y}" text-anchor="${anchor}">${esc(text)}</text>`;
  const leader = (x1, y1, x2, y2) => `<path class="rx-lead" d="M${x1},${y1} L${x2},${y2}"/>`;
  const sideLabels = (yOut, yIn, outText = "outside the cell", inText = "inside the cell") => lab(6, yOut, outText, "start", "rx-zone") + lab(6, yIn, inText, "start", "rx-zone");

  const GLYPH = {
    hex: `<path class="rx-drug-g" d="M6,0 L3,5.2 L-3,5.2 L-6,0 L-3,-5.2 L3,-5.2 Z"/><path class="rx-drug-l" d="M-2.2,0 L2.2,0"/>`,
    antibody: `<path class="rx-ab" d="M0,11 L0,1 M0,1 L-7.5,-8 M0,1 L7.5,-8"/>`,
    protein: `<path class="rx-drug-g" d="M-6,-2 C-6,-7 2,-8 5,-4 C8,0 5,6 0,6 C-4,7 -7,3 -6,-2 Z"/>`,
    duplex: `<path class="rx-ab rx-thin" d="M-9,-2 L9,-2 M-9,2 L9,2"/>`,
    native: `<circle class="rx-native-g" r="3.6"/>`,
    ligand: `<path class="rx-native-g" d="M0,-5 L4.6,3 L-4.6,3 Z"/>`,
  };
  const drugGlyph = (mod) => (mod === "antibody" ? GLYPH.antibody : mod === "protein" || mod === "peptide" ? GLYPH.protein : mod === "oligonucleotide" ? GLYPH.duplex : GLYPH.hex);
  const g = (k, i, inner, cls = "") => `<g data-k="${k}" data-i="${i}" class="${cls}">${inner}</g>`;
  const mv = (el, p, op, sc) => {
    if (!el) return;
    el.setAttribute("transform", `translate(${f1(p[0])} ${f1(p[1])})${sc != null && sc !== 1 ? ` scale(${f1(sc * 100) / 100})` : ""}`);
    if (op != null) el.style.opacity = f1(clamp(op) * 100) / 100;
  };
  const pulse = (el, x, y, t, i, on, rMax = 18) => {
    if (!el) return;
    const u = ph(t, 1.5, i * 0.31);
    el.setAttribute("cx", x); el.setAttribute("cy", y); el.setAttribute("r", f1(3 + rMax * u));
    el.style.opacity = on ? f1((1 - u) * 0.85 * on * 100) / 100 : 0;
  };
  const isUp = (a) => /agon|activ|potent|open|stimul|enhanc|induc|express|replace/.test(lower(a)) && !/antag|inverse/.test(lower(a));
  const beatP = (s, b) => (s.beat < b ? 0 : s.beat > b ? 1 : s.p);
  const pct = (v) => `${Math.round(v * 100)}%`;

  /* ---------- the cell: scenes ---------- */

  function sceneReceptor(d, L) {
    const N = 5, xs = [60, 140, 220, 300, 380], order = [2, 0, 4, 1, 3];
    const up = isUp(d.target.action), antag = /antag|block/.test(lower(d.target.action));
    const recLabel = L.receptor || d.target.short || "receptor";
    const svg = `${sideLabels(30, 292)}<rect class="rx-cyto" x="-10" y="122" width="460" height="190"/>${bilayer(104)}${nucleus(345, 268, 92, 46)}
${xs.map((x, i) => g("rec", i, `<path class="rx-rec" d="M-11,92 L-4,92 L-2,98 L2,98 L4,92 L11,92 L11,136 C11,140 -11,140 -11,136 Z"/><path class="rx-rec-tm" d="M-6,98 L-6,134 M0,100 L0,134 M6,98 L6,134"/>`, "rx-recg")).join("")}
${xs.map((_, i) => `<circle class="rx-pulse" data-k="pulse" data-i="${i}" r="0"/>`).join("")}
${xs.map((_, i) => g("sig", i, `<circle class="rx-sig" r="2.6"/>`)).join("")}
${xs.map((_, i) => g("nat", i, GLYPH.native)).join("")}
${xs.map((_, i) => g("drug", i, drugGlyph(d.modality))).join("")}
${leader(60, 140, 60, 158)}${lab(40, 170, recLabel)}${lab(434, 20, d.name, "end", "rx-strong")}${lab(434, 33, up ? "agonist" : antag ? "blocks the natural ligand" : lower(d.target.action) || "binds the receptor", "end")}${lab(220, 196, "signal to the nucleus", "middle")}`;
    let level = 0, bound = 0;
    return {
      svg,
      steps: [
        [`${d.name} arrives`, `${d.name} reaches ${recLabel} on the cell surface.`],
        [`Binds ${recLabel}`, up ? `It binds the receptor in place of the natural ligand.` : antag ? `It occupies the receptor so the natural ligand cannot bind.` : `It binds the receptor and reduces its signalling.`],
        [up ? "Receptor switches on" : "Signalling falls", up ? "The bound receptor changes shape and starts the signalling cascade inside the cell." : "Fewer receptors are activated, so less signal crosses the membrane."],
        ["Cell response", up ? "The signal reaches the nucleus and changes what the cell does." : "The downstream response is reduced."],
      ],
      frame(R, s) {
        const k = s.beat < 0 ? 0 : Math.round(s.occ * N);
        const set = new Set(order.slice(0, k));
        let act = 0;
        xs.forEach((x, i) => {
          mv(R.rec[i], [x, 0]);
          const isB = set.has(i);
          const start = [x + (i % 2 ? 20 : -20), 22 + ((i * 7) % 18)];
          const a = s.beat < 0 ? 0 : s.beat === 0 ? 0.6 * s.p : 0.6 + 0.4 * beatP(s, 1);
          const wander = [x + 16 * Math.sin(s.t * 0.7 + i * 1.7), 40 + 10 * Math.cos(s.t * 0.9 + i)];
          const fade = s.beat < 0 ? 0 : s.beat === 0 ? Math.min(1, s.p * 3) : 1;
          mv(R.drug[i], isB ? mix(start, [x, 88], ease(a)) : wander, isB ? fade : fade * 0.55);
          const nativeOn = up ? i === 3 : true;
          const kicked = isB ? beatP(s, 1) : 0;
          mv(R.nat[i], mix([x, 86], [x + 18, 52 + 5 * Math.sin(s.t * 1.3 + i)], ease(kicked)), nativeOn ? 1 : 0);
          const active = up ? (isB ? beatP(s, 2) : i === 3 ? 1 : 0) : 1 - kicked;
          act += active;
          pulse(R.pulse[i], x, 150, s.t, i, active);
          const u = ph(s.t, 2.4, i * 0.21);
          mv(R.sig[i], mix([x, 146], [312, 236], u), active * (u < 0.85 ? 1 : (1 - u) / 0.15));
        });
        level = act / N; bound = k;
        R.root.style.setProperty("--glow", f1(0.1 + 0.6 * level));
      },
      metric: () => `${bound}/${N} receptors bound · signal ${pct(level)}`,
    };
  }

  function sceneEnzyme(d, L, anchored) {
    const xs = anchored ? [120, 210, 300] : [70, 152, 234, 316], N = xs.length, order = anchored ? [1, 0, 2] : [1, 3, 0, 2], x0 = xs[0];
    const up = isUp(d.target.action);
    const enz = L.enzyme || d.target.short || (anchored ? "receptor kinase" : "enzyme");
    const svg = `${sideLabels(anchored ? 14 : 30, 110)}<rect class="rx-cyto" x="-10" y="84" width="460" height="230"/>${anchored ? xs.map((x) => `<path class="rx-stalk" d="M${x - 10},44 L${x - 10},147"/>`).join("") : ""}${bilayer(66)}${nucleus(352, 270, 98, 46)}
${anchored ? xs.map((x) => `<ellipse class="rx-rec" cx="${x - 10}" cy="34" rx="8" ry="12"/>`).join("") + lab(xs[N - 1] + 6, 50, L.domain || "extracellular domain") : ""}
${xs.map((x, i) => g("enz", i, `<path class="rx-enz" d="M-8,-15 A17,17 0 1 0 8,-15 L0,-4 Z"/>`, "rx-enzg")).join("")}
${xs.map((_, i) => g("sub", i, `<rect class="rx-sub" x="-4" y="-4" width="8" height="8" rx="1.5"/>`)).join("")}
${xs.map((_, i) => g("phos", i, `<circle class="rx-sig" r="3.4"/><text class="rx-p" y="2.4" text-anchor="middle">P</text>`)).join("")}
${xs.map((_, i) => g("drug", i, drugGlyph(d.modality))).join("")}
${leader(x0, 180, x0, 196)}${lab(x0, 208, enz, "middle")}${L.note ? lab(x0, 221, L.note, "middle") : ""}${lab(x0 + 50, 126, L.pocket || "active site", "start")}${leader(x0 + 48, 128, x0 + 7, 146)}
${lab(anchored ? 170 : 230, anchored ? 240 : 246, L.signal || "downstream signal", "middle")}${lab(6, 128, L.substrate || "substrate", "start")}${leader(30, 132, x0 - 25, 154)}
${lab(434, 20, d.name, "end", "rx-strong")}${lab(434, 33, up ? (anchored ? "activates the kinase" : "activates the enzyme") : anchored ? "inhibits the kinase" : "inhibits the enzyme", "end")}`;
    let level = 0, bound = 0;
    return {
      svg,
      steps: [
        ["Enters the cell", `${d.name} crosses the membrane to reach ${enz} in the cytoplasm.`],
        [`Binds ${enz}`, up ? "It binds and switches the enzyme on." : "It occupies the enzyme's active site."],
        [up ? "Activity rises" : "Activity is blocked", up ? "The enzyme processes more substrate." : "The enzyme can no longer process its substrate."],
        ["Cell response", up ? "The downstream signal increases." : "The downstream signal falls."],
      ],
      frame(R, s) {
        const k = s.beat < 0 ? 0 : Math.round(s.occ * N);
        const set = new Set(order.slice(0, k));
        let act = 0;
        xs.forEach((x, i) => {
          mv(R.enz[i], [x, 160]);
          const isB = set.has(i);
          const start = anchored ? [x + 16, 14 + (i % 2) * 8] : [x - 14, 22 + (i % 2) * 10];
          let pos;
          const p0 = beatP(s, 0), p1 = beatP(s, 1);
          if (isB) pos = p1 > 0 ? mix([x - 4, 112], [x, 151], ease(p1)) : mix(start, [x - 4, 112], ease(p0));
          else pos = s.beat >= 1 ? [x + 22 + 8 * Math.sin(s.t * 0.8 + i), 112 + 8 * Math.cos(s.t + i)] : mix(start, [x + 22, 112], ease(p0));
          mv(R.drug[i], pos, s.beat < 0 ? 0 : (isB ? 1 : 0.55) * Math.min(1, p0 * 3 + (s.beat > 0 ? 1 : 0)));
          const active = up ? (isB ? p1 : 0.25) : 1 - (isB ? beatP(s, 2) * 0.9 + p1 * 0.1 : 0);
          act += active;
          mv(R.sub[i], [x - 22 + 3 * Math.sin(s.t * 1.2 + i), 160]);
          const u = ph(s.t, 2.6, i * 0.27);
          mv(R.phos[i], mix([x + 14, 168], [300, 240], u), active * (u < 0.85 ? 1 : (1 - u) / 0.15));
          R.enz[i].classList.toggle("rx-off", active < 0.5);
        });
        level = act / N; bound = k;
        R.root.style.setProperty("--glow", f1(0.1 + 0.6 * level));
      },
      metric: () => `${bound}/${N} ${anchored ? "kinases" : "enzymes"} bound · activity ${pct(level)}`,
    };
  }

  function sceneChannel(d, L, transporter) {
    const N = 3, xs = [90, 220, 350], order = [1, 0, 2], ions = transporter ? 4 : 6;
    const up = isUp(d.target.action);
    const name = L.channel || d.target.short || (transporter ? "transporter" : "ion channel");
    const body = transporter
      ? `<path class="rx-rec" data-half="l" d="M-1,90 L-14,94 C-18,110 -18,122 -14,138 L-1,140 Z"/><path class="rx-rec" data-half="r" d="M1,90 L14,94 C18,110 18,122 14,138 L1,140 Z"/>`
      : `<rect class="rx-rec" data-half="l" x="-15" y="90" width="10" height="48" rx="4"/><rect class="rx-rec" data-half="r" x="5" y="90" width="10" height="48" rx="4"/>`;
    const svg = `${sideLabels(30, 190)}<rect class="rx-cyto" x="-10" y="122" width="460" height="190"/>${bilayer(104)}
${xs.map((x, i) => g("ch", i, body)).join("")}
${xs.map((_, i) => Array.from({ length: ions }, (_, j) => `<g data-k="ion" data-i="${i * ions + j}"><circle class="rx-ion" r="3"/></g>`).join("")).join("")}
${xs.map((_, i) => g("drug", i, drugGlyph(d.modality))).join("")}
${leader(90, 142, 90, 158)}${lab(90, 170, name, "middle")}${lab(434, 20, d.name, "end", "rx-strong")}${lab(434, 33, up ? "opens / enhances" : transporter ? "inhibits transport" : "blocks the pore", "end")}${lab(434, 290, transporter ? "substrate" : "ions", "end")}`;
    let level = 0, bound = 0;
    return {
      svg,
      steps: [
        [`${d.name} arrives`, `It reaches ${name} in the membrane.`],
        [up ? "Binds and opens" : transporter ? "Binds the transporter" : "Plugs the channel", up ? "Binding makes the channel open more readily." : transporter ? "It binds the transporter and stops it cycling." : "It lodges in or over the pore."],
        [up ? "More flow" : "Less flow", up ? "More ions cross the membrane." : `Less ${transporter ? "substrate" : "ion"} crosses the membrane.`],
        ["Cell response", "The change in flow changes the cell's electrical or chemical state."],
      ],
      frame(R, s) {
        const k = s.beat < 0 ? 0 : Math.round(s.occ * N);
        const set = new Set(order.slice(0, k));
        let flow = 0;
        xs.forEach((x, i) => {
          const isB = set.has(i), b = isB ? beatP(s, 1) : 0, eff = isB ? beatP(s, 2) : 0;
          const widen = up ? 3 * b : 0, rock = transporter ? Math.sin(s.t * 2.4 + i) * (1 - (up ? 0 : b)) : 0;
          mv(R.ch[i], [x, 0]);
          R.ch[i].querySelectorAll("[data-half]").forEach((el) => {
            const sx = el.dataset.half === "l" ? -widen : widen;
            el.setAttribute("transform", transporter ? `rotate(${f1((el.dataset.half === "l" ? 1 : -1) * 5 * rock)} 0 115) translate(${sx} 0)` : `translate(${sx} 0)`);
          });
          const start = [x + 24, 20], dock = [x, up ? 84 : 100];
          const p0 = beatP(s, 0);
          mv(R.drug[i], isB ? mix(start, dock, ease(0.6 * p0 + 0.4 * b)) : [x + 26 + 8 * Math.sin(s.t + i), 44 + 6 * Math.cos(s.t * 0.8 + i)], s.beat < 0 ? 0 : (isB ? 1 : 0.5) * Math.min(1, p0 * 3 + (s.beat > 0 ? 1 : 0)));
          const open = up ? 1 + eff : 1 - eff;
          flow += up ? (isB ? 1 + eff : 1) / 2 : open;
          const period = transporter ? 3.2 : up ? 2.4 / (1 + eff) : 2.4;
          for (let j = 0; j < ions; j++) {
            const el = R.ion[i * ions + j];
            const u = ph(s.t, period, j / ions + i * 0.17);
            const yFree = lerp(16, 250, u), spread = clamp(Math.abs(yFree - 115) / 70);
            const free = [x + spread * 22 * Math.sin(j * 2.3 + i), yFree];
            const stuck = [x + (j % 2 ? 14 : -14) + 3 * Math.sin(s.t + j), 32 + 9 * j + 2 * Math.cos(s.t * 1.4 + j)];
            const blockedNow = !up && eff > 0.5;
            mv(el, blockedNow ? stuck : free, blockedNow ? 0.9 : u > 0.9 ? (1 - u) * 10 : u < 0.08 ? u * 12 : 1);
          }
        });
        level = flow / N; bound = k;
      },
      metric: () => `${bound}/${N} ${transporter ? "transporters" : "channels"} bound · flow ${pct(level)}`,
    };
  }

  function sceneNuclear(d, L) {
    const N = 3, rec = [[90, 138], [178, 150], [266, 134]], dna = [[160, 266], [240, 270], [320, 266]], order = [1, 0, 2];
    const up = isUp(d.target.action);
    const name = L.receptor || d.target.short || "nuclear receptor";
    const svg = `${sideLabels(26, 92)}<rect class="rx-cyto" x="-10" y="74" width="460" height="240"/>${bilayer(56)}
<g class="rx-nuc"><ellipse class="rx-nuc-glow" cx="250" cy="268" rx="178" ry="60"/><ellipse class="rx-nuc-env" cx="250" cy="268" rx="178" ry="60"/><ellipse class="rx-nuc-env rx-thin" cx="250" cy="268" rx="173" ry="55"/>${lab(96, 250, "nucleus")}</g>
<path class="rx-dna" d="M120,268 C140,258 150,278 170,268 S200,258 220,268 S250,278 270,268 S300,258 320,268 S350,278 380,268"/>${lab(386, 272, "DNA")}
${rec.map((_, i) => g("rec", i, `<path class="rx-enz" d="M-13,-2 C-13,-10 -4,-11 0,-6 C4,-11 13,-10 13,-2 C13,7 6,10 0,10 C-6,10 -13,7 -13,-2 Z"/>`)).join("")}
${rec.map((_, i) => g("nat", i, GLYPH.native)).join("")}
${rec.map((_, i) => g("drug", i, drugGlyph(d.modality))).join("")}
${rec.map((_, i) => g("rna", i, `<path class="rx-rna" d="M0,0 c4,-4 8,4 12,0 s8,4 12,0 s8,4 12,0"/>`)).join("")}
${leader(90, 152, 90, 172)}${lab(90, 184, name, "middle")}${lab(434, 20, d.name, "end", "rx-strong")}${lab(434, 33, up ? "switches gene expression on" : "blocks gene expression", "end")}`;
    let level = 0, bound = 0;
    return {
      svg,
      steps: [
        ["Enters the cell", `${d.name} crosses the membrane into the cytoplasm.`],
        [`Binds ${name}`, `It binds ${name} inside the cell.`],
        ["Moves into the nucleus", "The receptor complex moves into the nucleus and binds DNA."],
        [up ? "Genes switch on" : "Genes stay off", up ? "Target genes are transcribed into mRNA." : "The bound receptor cannot switch on its target genes."],
      ],
      frame(R, s) {
        const k = s.beat < 0 ? 0 : Math.round(s.occ * N);
        const set = new Set(order.slice(0, k));
        let act = 0;
        rec.forEach((r, i) => {
          const isB = set.has(i);
          const p0 = beatP(s, 0), p1 = beatP(s, 1), p2 = beatP(s, 2);
          const nativeOn = !up && !isB;
          const moves = isB ? p2 : nativeOn ? 1 : 0;
          const rp = mix(r, [dna[i][0], dna[i][1] - 12], ease(moves));
          mv(R.rec[i], rp);
          const start = [r[0] - 30, 16];
          mv(R.drug[i], isB ? (p1 > 0 ? mix([r[0] - 10, 100], [rp[0], rp[1] - 12], ease(p1)) : mix(start, [r[0] - 10, 100], ease(p0))) : [r[0] + 30 + 8 * Math.sin(s.t + i), 30 + 6 * Math.cos(s.t + i)], s.beat < 0 ? 0 : isB ? 1 : 0.5);
          mv(R.nat[i], [rp[0], rp[1] - 12], nativeOn ? 1 : 0);
          const active = up ? (isB ? beatP(s, 3) : 0) : nativeOn ? 1 : 0;
          act += active;
          const u = ph(s.t, 2.8, i * 0.3);
          mv(R.rna[i], mix([dna[i][0] - 18, dna[i][1] - 4], [dna[i][0] - 60, 150], u), active * (u > 0.85 ? (1 - u) / 0.15 : 1));
        });
        level = act / N; bound = k;
        R.root.style.setProperty("--glow", f1(0.1 + 0.55 * level));
      },
      metric: () => `${bound}/${N} receptors bound · transcription ${pct(level)}`,
    };
  }

  function sceneLigand(d, L) {
    const N = 4, xs = [80, 170, 260, 350], order = [0, 2, 1, 3];
    const name = L.ligand || d.target.short || "ligand";
    const svg = `${sideLabels(30, 236)}<rect class="rx-cyto" x="-10" y="200" width="460" height="110"/>${bilayer(182)}
${xs.map((x, i) => g("rec", i, `<path class="rx-stalk" d="M0,182 L0,146"/><path class="rx-rec" d="M-9,146 L-9,138 C-9,132 -5,132 -4,138 L-4,141 L4,141 L4,138 C5,132 9,132 9,138 L9,146 Z"/>`)).join("")}
${xs.map((_, i) => `<circle class="rx-pulse" data-k="pulse" data-i="${i}" r="0"/>`).join("")}
${xs.map((_, i) => g("lig", i, GLYPH.ligand)).join("")}
${xs.map((_, i) => g("drug", i, drugGlyph(d.modality))).join("")}
${lab(80, 128, L.receptor || "receptor", "middle")}${lab(434, 20, d.name, "end", "rx-strong")}${lab(434, 33, `captures ${name}`, "end")}${lab(6, 60, `free ${name}`, "start")}`;
    let level = 0, bound = 0;
    return {
      svg,
      steps: [
        [`${d.name} circulates`, `It travels in the fluid around cells, where ${name} is found.`],
        [`Captures ${name}`, `It binds ${name} before ${name} can reach its receptor.`],
        ["Receptors stay empty", `Fewer receptors are activated by ${name}.`],
        ["Cell response", "The signal that drives the response falls."],
      ],
      frame(R, s) {
        const k = s.beat < 0 ? 0 : Math.round(s.occ * N);
        const set = new Set(order.slice(0, k));
        let act = 0;
        xs.forEach((x, i) => {
          mv(R.rec[i], [x, 0]);
          const isB = set.has(i), c = isB ? beatP(s, 1) : 0;
          const drift = [x + 6 + 12 * Math.sin(s.t * 0.6 + i * 1.3), 62 + 10 * Math.cos(s.t * 0.7 + i)];
          const p0 = beatP(s, 0);
          mv(R.drug[i], isB ? mix(mix([x + 40, 10], [x + 10, 100], ease(p0)), drift, ease(c)) : [x + 34 + 6 * Math.sin(s.t + i), 44 + 6 * Math.cos(s.t + i)], s.beat < 0 ? 0 : isB ? 1 : 0.5 * p0);
          const dp = isB ? mix(mix([x + 40, 10], [x + 10, 100], ease(p0)), drift, ease(c)) : null;
          mv(R.lig[i], isB ? mix([x, 135], [dp[0], dp[1] - 12], ease(c)) : [x, 135]);
          const active = 1 - (isB ? beatP(s, 2) * 0.8 + c * 0.2 : 0);
          act += active;
          pulse(R.pulse[i], x, 222, s.t, i, active, 14);
        });
        level = act / N; bound = k;
      },
      metric: () => `${bound}/${N} ${name} captured · receptor signal ${pct(level)}`,
    };
  }

  function twoCells(topName, botName) {
    return `<rect class="rx-cyto rx-cyto-top" x="-10" y="-10" width="460" height="104"/><rect class="rx-cyto rx-cyto-bot" x="-10" y="226" width="460" height="90"/>
${bilayer(76)}${bilayer(208)}<rect class="rx-heat" x="-10" y="-10" width="460" height="86"/>${lab(6, 22, topName, "start", "rx-strong")}${lab(6, 290, botName, "start", "rx-strong")}`;
  }

  function sceneCheckpoint(d, L) {
    const N = 4, xs = [116, 200, 284, 368], order = [1, 3, 0, 2];
    const rName = L.receptor || d.target.short || "checkpoint receptor", lName = L.ligand || "ligand";
    const onLigand = /ligand/.test(lower(L.blocks));
    const svg = `${twoCells(L.effector || "T cell", L.target || "tumour cell")}<g class="rx-tumor-cell"><rect class="rx-hurt" x="-10" y="208" width="460" height="110"/></g>
${xs.map((x, i) => g("rec", i, `<path class="rx-stalk" d="M0,0 L0,30"/><rect class="rx-rec" x="-7" y="28" width="14" height="10" rx="4"/>`)).join("")}
${xs.map((x, i) => g("lig", i, `<path class="rx-stalk" d="M0,0 L0,-30"/><rect class="rx-rec rx-rec-alt" x="-7" y="-38" width="14" height="10" rx="4"/>`)).join("")}
${xs.map((_, i) => g("brake", i, `<path class="rx-brake" d="M-6,0 L6,0"/>`)).join("")}
${xs.map((_, i) => g("drug", i, drugGlyph(d.modality))).join("")}
${xs.map((_, i) => g("gran", i, `<circle class="rx-sig" r="3"/>`)).join("")}
${lab(6, 132, rName)}${lab(6, 168, lName)}${lab(434, 22, d.name, "end", "rx-strong")}${lab(434, 35, `blocks ${onLigand ? lName : rName}`, "end")}`;
    let level = 0, bound = 0;
    return {
      svg,
      steps: [
        ["The brake is on", `${lName} on the ${L.target || "target cell"} engages ${rName} and damps the ${L.effector || "T cell"} down.`],
        [`${d.name} binds ${onLigand ? lName : rName}`, `It blocks the ${rName}–${lName} contact.`],
        ["The brake is released", `The ${L.effector || "T cell"} becomes active again.`],
        ["Attack", `The active ${L.effector || "T cell"} kills the ${L.target || "target cell"}.`],
      ],
      frame(R, s) {
        const k = s.beat < 0 ? 0 : Math.round(s.occ * N);
        const set = new Set(order.slice(0, k));
        let freed = 0;
        xs.forEach((x, i) => {
          const isB = set.has(i), b = isB ? beatP(s, 1) : 0;
          const sep = 10 * ease(b);
          mv(R.rec[i], [x, 94 - (onLigand ? 0 : sep)]);
          mv(R.lig[i], [x, 190 + (onLigand ? sep : 0)]);
          mv(R.brake[i], [x, 60], 1 - b);
          const start = [x + 40, 150], dock = onLigand ? [x + 12, 160] : [x + 12, 124];
          const p0 = beatP(s, 0);
          mv(R.drug[i], isB ? mix(mix([x + 52, 150], start, p0), dock, ease(b)) : [x + 36 + 5 * Math.sin(s.t + i), 142 + 5 * Math.cos(s.t + i)], s.beat < 0 ? 0 : isB ? 1 : 0.5 * Math.min(1, p0 * 3));
          const rel = isB ? beatP(s, 2) : 0;
          freed += rel;
          const u = ph(s.t, 1.6, i * 0.23), att = isB ? beatP(s, 3) : 0;
          mv(R.gran[i], mix([x - 18, 70], [x - 18, 214], u), att * (u > 0.85 ? (1 - u) / 0.15 : 1));
        });
        level = freed / N; bound = k;
        R.root.style.setProperty("--heat", f1(0.05 + 0.5 * level));
        R.root.style.setProperty("--hurt", f1(0.4 * level * beatP(s, 3)));
      },
      metric: () => `${bound}/${N} ${onLigand ? lName : rName} blocked · T-cell activity ${pct(level)}`,
    };
  }

  function sceneCar(d, L) {
    const N = 4, xs = [116, 200, 284, 368];
    const engager = /engag|bispecific|bite/.test(lower(d.target.action) + lower(L.format));
    const ag = L.antigen || d.target.short || "antigen";
    const svg = `${twoCells(L.effector || (engager ? "T cell" : "CAR-T cell"), L.target || "target cell")}<g class="rx-tumor-cell"><rect class="rx-hurt" x="-10" y="208" width="460" height="110"/></g>
${xs.map((x, i) => g("car", i, engager ? `<path class="rx-stalk" d="M0,0 L0,10"/><rect class="rx-rec" x="-5" y="8" width="10" height="7" rx="3"/>` : `<path class="rx-stalk" d="M0,0 L0,32"/><ellipse class="rx-rec" cx="-4" cy="36" rx="4.5" ry="6"/><ellipse class="rx-rec" cx="4" cy="36" rx="4.5" ry="6"/>`)).join("")}
${xs.map((x, i) => g("ag", i, `<path class="rx-stalk" d="M0,0 L0,-14"/><circle class="rx-rec rx-rec-alt" cy="-19" r="6"/>`)).join("")}
${xs.map((_, i) => g("drug", i, engager ? `<path class="rx-ab" d="M0,-34 L0,34"/><circle class="rx-drug-g" cy="-34" r="4"/><circle class="rx-drug-g" cy="34" r="4"/>` : "")).join("")}
${xs.map((_, i) => `<circle class="rx-pulse" data-k="pulse" data-i="${i}" r="0"/>`).join("")}
${xs.map((_, i) => g("gran", i, `<circle class="rx-sig" r="3"/>`)).join("")}
${[0, 1].map((i) => g("clone", i, `<circle class="rx-clone" r="15"/><circle class="rx-clone-n" r="6"/>`)).join("")}
${lab(6, engager ? 108 : 132, engager ? "CD3" : L.receptor || "CAR")}${lab(6, 182, ag)}${lab(434, 22, d.name, "end", "rx-strong")}${lab(434, 35, engager ? `bridges T cell and ${ag}` : `targets ${ag}`, "end")}`;
    let level = 0, killed = 0;
    return {
      svg,
      steps: [
        [`Recognises ${ag}`, engager ? `${d.name} links CD3 on a T cell to ${ag} on the target cell.` : `The CAR binds ${ag} on the target cell.`],
        ["The T cell switches on", "Signalling inside the T cell activates it."],
        ["Kills the target", "The activated T cell releases cytotoxic granules into the target cell."],
        ["Expands", "Activated T cells multiply."],
      ],
      frame(R, s) {
        const on = s.beat < 0 ? 0 : 1;
        xs.forEach((x, i) => {
          const r = beatP(s, 0) * on;
          mv(R.car[i], [x, 94 + (engager ? 0 : 24 * ease(r))]);
          mv(R.ag[i], [x, 190]);
          if (engager) mv(R.drug[i], mix([x + 30, 40], [x, 148], ease(r)), on ? Math.min(1, r * 3) : 0);
          const act = beatP(s, 1) * on;
          pulse(R.pulse[i], x, 52, s.t, i, act, 16);
          const u = ph(s.t, 1.5, i * 0.29), k = beatP(s, 2) * on;
          mv(R.gran[i], mix([x + 14, 74], [x + 14, 214], u), k * (u > 0.85 ? (1 - u) / 0.15 : 1));
        });
        const ex = beatP(s, 3) * on;
        mv(R.clone[0], [196, 34], ex, 0.4 + 0.6 * ex);
        mv(R.clone[1], [240, 50], ex > 0.4 ? (ex - 0.4) / 0.6 : 0, 0.4 + 0.6 * ex);
        level = beatP(s, 1) * on; killed = beatP(s, 2) * on;
        R.root.style.setProperty("--heat", f1(0.05 + 0.5 * level));
        R.root.style.setProperty("--hurt", f1(0.45 * killed));
      },
      metric: () => `T-cell activation ${pct(level)} · target killing ${pct(killed)}`,
    };
  }

  function sceneGene(d, L) {
    const v = lower(d.target.vector || L.vector);
    const kind = /lnp|mrna|lipid/.test(v) || d.modality === "mrna" ? "lnp" : /lenti|retro/.test(v) ? "lenti" : "aav";
    const vec = kind === "lnp"
      ? `<circle class="rx-cap" r="12"/><circle class="rx-cap-i" r="7.5"/><path class="rx-rna" d="M-5,0 c2,-2 3,2 5,0 s3,2 5,0"/>`
      : kind === "lenti"
        ? `<circle class="rx-cap" r="11"/><path class="rx-cap-i" d="M0,-11 L0,-15 M11,0 L15,0 M0,11 L0,15 M-11,0 L-15,0 M8,-8 L11,-11 M8,8 L11,11 M-8,8 L-11,11 M-8,-8 L-11,-11"/>`
        : `<path class="rx-cap" d="M11,0 L5.5,9.5 L-5.5,9.5 L-11,0 L-5.5,-9.5 L5.5,-9.5 Z"/><path class="rx-cap-i" d="M-5.5,-9.5 L0,0 L5.5,-9.5 M-11,0 L0,0 L11,0 M-5.5,9.5 L0,0 L5.5,9.5"/>`;
    const NUC = { cx: 310, cy: 258, rx: 120, ry: 56 };
    const name = L.vector || (kind === "lnp" ? "lipid nanoparticle" : kind === "lenti" ? "lentiviral vector" : "AAV capsid");
    const prot = L.protein || "protein";
    const svg = `${sideLabels(30, 102)}<rect class="rx-cyto" x="-10" y="80" width="460" height="230"/>${bilayer(62)}${nucleus(NUC.cx, NUC.cy, NUC.rx, NUC.ry)}
<path class="rx-dna rx-thin" d="M220,282 C240,274 252,290 272,282 S304,274 324,282 S356,290 380,282"/>
${g("endo", 0, `<circle class="rx-endo" r="19"/>`)}
${g("vec", 0, vec)}${g("vec", 1, vec)}
${g("epi", 0, kind === "lenti" ? `<path class="rx-dna rx-hot" d="M-16,0 C-10,-8 -4,8 4,0 S12,-8 16,0"/>` : kind === "lnp" ? `<path class="rx-rna" d="M-14,0 c3,-4 6,4 9,0 s6,4 9,0 s6,4 9,0"/>` : `<circle class="rx-epi" r="11"/><circle class="rx-epi rx-thin" r="7"/>`)}
${[0, 1, 2].map((i) => g("rna", i, `<path class="rx-rna" d="M0,0 c4,-4 8,4 12,0 s8,4 12,0 s8,4 12,0"/>`)).join("")}
${g("ribo", 0, `<ellipse class="rx-ribo" rx="13" ry="8"/><ellipse class="rx-ribo" cy="-8" rx="9" ry="6"/>`)}
${[0, 1, 2, 3, 4].map((i) => g("prot", i, `<path class="rx-prot" d="M-6,-2 C-6,-7 2,-8 5,-4 C8,0 5,6 0,6 C-4,7 -7,3 -6,-2 Z"/>`)).join("")}
${lab(434, 22, d.name, "end", "rx-strong")}${lab(434, 35, name, "end")}${lab(66, 250, prot, "middle")}${lab(134, 170, "ribosome", "end")}
${kind === "lenti" ? lab(300, 298, "integrated", "middle") : kind === "aav" ? lab(364, 256, "episome") : ""}`;
    let made = 0;
    return {
      svg,
      steps: [
        [`The ${name} attaches`, `It binds the cell surface and is taken up into an endosome.`],
        [kind === "lnp" ? "Escapes the endosome" : "Travels to the nucleus", kind === "lnp" ? "The mRNA is released into the cytoplasm." : "It escapes the endosome and moves to the nucleus."],
        [kind === "lnp" ? "mRNA is read" : kind === "lenti" ? "The gene integrates" : "The gene is delivered", kind === "lnp" ? "Ribosomes read the mRNA directly; it never enters the nucleus." : kind === "lenti" ? "The vector genome is reverse-transcribed and integrated into a chromosome." : "The vector DNA is released and persists as an episome."],
        [`${prot} is made`, `The transgene is expressed and the cell makes ${prot}.`],
      ],
      frame(R, s) {
        const on = s.beat < 0 ? 0 : 1;
        const p0 = beatP(s, 0), p1 = beatP(s, 1), p2 = beatP(s, 2), p3 = beatP(s, 3);
        const dock = [110, 52], inside = [118, 110], atNuc = kind === "lnp" ? [176, 150] : [222, 222], epi = kind === "lenti" ? [300, 282] : kind === "lnp" ? [176, 158] : [348, 252];
        let vp = p0 < 1 ? mix([60, 0], dock, ease(p0)) : p1 < 1 ? (p1 < 0.35 ? mix(dock, inside, ease(p1 / 0.35)) : mix(inside, atNuc, ease((p1 - 0.35) / 0.65))) : mix(atNuc, epi, ease(p2));
        mv(R.vec[0], vp, on * (1 - p2), 1 - 0.4 * p2);
        mv(R.vec[1], [236 + 18 * Math.sin(s.t * 0.5), 28 + 6 * Math.cos(s.t * 0.7)], on * 0.6);
        mv(R.endo[0], p0 > 0.6 && p1 < 1 ? vp : vp, on * clamp((p0 - 0.6) * 2.5) * (1 - clamp((p1 - 0.75) * 4)));
        mv(R.epi[0], epi, on * p2);
        const ribo = kind === "lnp" ? [176, 158] : [150, 186];
        mv(R.ribo[0], ribo, 1);
        R.rna.forEach((el, i) => {
          const u = ph(s.t, 3, i / 3);
          mv(el, kind === "lnp" ? [ribo[0] - 22 + 4 * Math.sin(s.t + i), ribo[1] + 12 * i - 12] : mix([epi[0] - 30, epi[1] - 10], [ribo[0] - 10, ribo[1] + 4], u), on * p3 * (kind === "lnp" ? (i === 0 ? 1 : 0) : u > 0.85 ? (1 - u) / 0.15 : 1));
        });
        R.prot.forEach((el, i) => {
          const show = clamp(p3 * 5 - i);
          mv(el, [ribo[0] - 50 - i * 16 + 4 * Math.sin(s.t * 0.8 + i), ribo[1] + 26 + (i % 2) * 10 + 3 * Math.cos(s.t + i)], on * show);
        });
        made = on * p3;
        R.root.style.setProperty("--glow", f1(0.08 + 0.4 * on * (kind === "lnp" ? 0 : p2)));
      },
      metric: () => `transgene expression ${pct(made)}`,
    };
  }

  function sceneOligo(d, L) {
    const target = L.mrna || (d.target.short ? `${d.target.short} mRNA` : "target mRNA");
    const svg = `${sideLabels(30, 102)}<rect class="rx-cyto" x="-10" y="80" width="460" height="230"/>${bilayer(62)}${nucleus(352, 268, 98, 46)}
${g("endo", 0, `<circle class="rx-endo" r="16"/>`)}
${g("drug", 0, GLYPH.duplex)}
${g("risc", 0, `<path class="rx-enz" d="M-14,-4 C-14,-12 -4,-13 2,-9 C10,-12 16,-6 14,2 C12,10 2,11 -4,10 C-12,9 -14,4 -14,-4 Z"/>`)}
${[0, 1, 2].map((i) => g("mrna", i, `<path class="rx-rna" data-half="a" d="M-30,0 c5,-5 10,5 15,0 s10,5 15,0"/><path class="rx-rna" data-half="b" d="M0,0 c5,-5 10,5 15,0 s10,5 15,0"/>`)).join("")}
${g("ribo", 0, `<ellipse class="rx-ribo" rx="13" ry="8"/><ellipse class="rx-ribo" cy="-8" rx="9" ry="6"/>`)}
${[0, 1, 2, 3, 4].map((i) => g("prot", i, `<path class="rx-prot" d="M-6,-2 C-6,-7 2,-8 5,-4 C8,0 5,6 0,6 C-4,7 -7,3 -6,-2 Z"/>`)).join("")}
${lab(434, 22, d.name, "end", "rx-strong")}${lab(434, 35, "silences " + target, "end")}${lab(250, 150, target, "middle")}${lab(70, 196, "ribosome", "middle")}`;
    let left = 1;
    return {
      svg,
      steps: [
        ["Enters the cell", `${d.name} is taken up into an endosome and released into the cytoplasm.`],
        ["Finds its mRNA", `It pairs with ${target} by complementary base pairing.`],
        ["The mRNA is cut", "The paired mRNA is cleaved and degraded."],
        ["Less protein is made", "With less mRNA, ribosomes make less of the protein."],
      ],
      frame(R, s) {
        const on = s.beat < 0 ? 0 : 1;
        const p0 = beatP(s, 0), p1 = beatP(s, 1), p2 = beatP(s, 2), p3 = beatP(s, 3);
        const pos = p0 < 1 ? mix([80, 0], [120, 116], ease(p0)) : mix([120, 116], [236, 168], ease(p1));
        mv(R.drug[0], pos, on);
        mv(R.endo[0], pos, on * clamp(p0 * 3) * (1 - clamp(p0 * 2 - 1)));
        mv(R.risc[0], mix([120, 130], [238, 172], ease(p1)), on * clamp(p0 * 2 - 1));
        R.mrna.forEach((el, i) => {
          const base = [250 - i * 70, 172 + i * 14];
          const cut = i === 0 ? on * p2 : 0;
          mv(el, base, i === 0 ? 1 - on * clamp(p3 * 1.4) : 1 - on * 0.6 * p3);
          el.querySelector('[data-half="a"]').setAttribute("transform", `translate(${f1(-10 * cut)} ${f1(6 * cut)})`);
          el.querySelector('[data-half="b"]').setAttribute("transform", `translate(${f1(10 * cut)} ${f1(-6 * cut)})`);
        });
        mv(R.ribo[0], [70, 210], 1);
        left = 1 - 0.8 * on * p3;
        R.prot.forEach((el, i) => mv(el, [40 + i * 26 + 4 * Math.sin(s.t + i), 250 + (i % 2) * 12], clamp(left * 5 - i)));
      },
      metric: () => `protein made ${pct(left)} of baseline`,
    };
  }

  function sceneKey(d) {
    const c = lower(d.target && d.target.class), m = lower(d.modality);
    if (c === "kinase") return "enzyme";
    if (c === "engager") return "car";
    if (c === "mrna-knockdown") return "oligo";
    if (["checkpoint", "car", "gene", "oligo", "channel", "transporter", "nuclear", "ligand", "enzyme", "rtk", "receptor"].includes(c)) return c;
    if (m === "cell-therapy") return "car";
    if (m === "gene-therapy" || m === "mrna") return "gene";
    if (m === "oligonucleotide") return "oligo";
    return m === "antibody" || m === "protein" || m === "peptide" ? "receptor" : "enzyme";
  }
  const SCENES = {
    receptor: sceneReceptor, enzyme: (d, L) => sceneEnzyme(d, L, false), rtk: (d, L) => sceneEnzyme(d, L, true), nuclear: sceneNuclear, ligand: sceneLigand, checkpoint: sceneCheckpoint, car: sceneCar, gene: sceneGene, oligo: sceneOligo,
    channel: (d, L) => sceneChannel(d, L, false), transporter: (d, L) => sceneChannel(d, L, true),
  };
  function sceneFor(d) {
    const key = sceneKey(d), s = SCENES[key](d, (d.target && d.target.labels) || {});
    s.key = key;
    return s;
  }
  const SCENE_NAMES = { receptor: "Membrane receptor", enzyme: "Enzyme / kinase", rtk: "Receptor tyrosine kinase", channel: "Ion channel", transporter: "Transporter", nuclear: "Nuclear receptor", ligand: "Soluble ligand (neutraliser)", checkpoint: "Immune checkpoint (two cells)", car: "CAR-T / T-cell engager", gene: "Gene therapy / mRNA", oligo: "siRNA / antisense" };

  /* ---------- the timeline ---------- */

  const needFor = (d, prefix) => (d.needs || []).find((n) => String(n.path || "").startsWith(prefix));
  function timelineOf(d, scene) {
    const journey = (d.journey || []).map((j, i) => ({ kind: "body", site: siteId(j.site), title: j.title, text: j.text, cite: j.cite, generic: j.generic, need: needFor(d, `journey[${i}]`) }));
    const mech = (d.mechanism && d.mechanism.length ? d.mechanism : scene.steps.map(([title, text]) => ({ title, text, generic: true })))
      .map((m, i) => ({ kind: "cell", beat: Math.min(i, 3), title: m.title, text: m.text, cite: m.cite, generic: m.generic, need: needFor(d, `mechanism[${i}]`) || (!(d.mechanism || []).length ? needFor(d, "mechanism") : null) }));
    let at = (d.journey || []).findIndex((j) => j.target);
    if (at < 0) at = journey.length - 1;
    const site = journey[at] ? journey[at].site : "tissues";
    mech.forEach((m) => (m.site = site));
    if (mech.length && mech.length < 4) mech[mech.length - 1].beatEnd = 3;
    return [...journey.slice(0, at + 1), ...mech, ...journey.slice(at + 1).map((j) => ({ ...j, after: true }))];
  }

  const cites = (c, d) => (c && c.length ? `<sup class="rx-cite">${c.map((n) => `<a href="#rx-src-${esc(n)}">${esc(n)}</a>`).join(",")}</sup>` : "");
  const MODALITY = { "small-molecule": "small molecule", antibody: "antibody", protein: "protein", peptide: "peptide", "cell-therapy": "cell therapy", "gene-therapy": "gene therapy", oligonucleotide: "oligonucleotide", mrna: "mRNA" };

  const reduce = typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
  const STEP_S = 4.4;

  function mount(host, d, opts = {}) {
    if (host._rx) host._rx.destroy();
    d.target = d.target || {};
    const scene = sceneFor(d);
    const steps = timelineOf(d, scene);
    const binding = d.binding !== false && !["cell-therapy", "gene-therapy", "oligonucleotide", "mrna"].includes(d.modality) && !["car", "gene", "oligo"].includes(lower(d.target.class));
    const form = d.dosageForm ? ` (${esc(d.dosageForm)})` : "";
    const DRAFTS = {
      claude: `<b>Drafted by Claude for ${esc(d.name)}${form}.</b> Claude wrote this from what it already knew; it did not look anything up. Check every statement and source before you rely on it. Steps marked “typical” describe the drug class.`,
      template: `<b>Built from the ${esc(d.dosageForm || "route")} template.</b> The route and class steps are filled in. The highlighted fields are specific to ${esc(d.name)} and need your input.`,
      public: `<b>Auto-drafted from public databases.</b> Steps marked “typical” describe the drug class, not this drug. Verify against the label or primary sources before you rely on it.`,
    };
    const needs = (d.needs || []).filter((n) => n && n.label);
    const req = needs.filter((n) => n.required), opt = needs.filter((n) => !n.required);
    const needBtn = (n) => `<button type="button" class="rx-need-chip${n.required ? " rx-req" : ""}" data-need="${esc(n.path)}" title="${esc(n.why || "")}">${esc(n.label)}</button>`;
    const banner = (d.confidential ? `<p class="rx-banner rx-banner-conf"><b>Confidential.</b> Loaded on this device only. Nothing on this page is sent anywhere unless you press a public-lookup button.</p>` : "")
      + (d.draft ? `<p class="rx-banner">${DRAFTS[d.draft] || DRAFTS.public}</p>` : "")
      + (needs.length ? `<div class="rx-needs" role="region" aria-label="Fields that need your input">${req.length ? `<div><span class="rx-needs-h rx-req">${req.length} required field${req.length > 1 ? "s" : ""} need${req.length > 1 ? "" : "s"} your input</span>${req.map(needBtn).join("")}</div>` : `<div><span class="rx-needs-h">Nothing required is missing.</span></div>`}${opt.length ? `<div><span class="rx-needs-h">Optional, not public or not known:</span>${opt.map(needBtn).join("")}</div>` : ""}</div>` : "");
    host.innerHTML = `${banner}<figure class="iso-figure rx-fig">
<div class="iso-plate rx-plate">
  <div class="iso-plate-corners" aria-hidden="true"><span class="iso-plate-corner" data-corner="fig">${esc(opts.fig || "Fig 1")}</span><span class="iso-plate-corner" data-corner="title">${esc(d.name)} · ${esc(MODALITY[d.modality] || d.modality || "drug")}${d.dosageForm ? ` · ${esc(d.dosageForm)}` : ""}</span><span class="iso-plate-corner" data-corner="hint">Space pause · ←/→ step · hover parts</span><span class="iso-plate-corner" data-corner="readout" data-readout></span></div>
  <div class="rx-stage">
    <div class="rx-pane rx-pane-body"><div class="rx-pane-h">In the body</div>${bodySvg()}</div>
    <div class="rx-pane rx-pane-cell"><div class="rx-pane-h">At the target<span> · ${esc(d.target.cell || d.target.name || "")}</span></div>
      <svg class="rx-cell" viewBox="0 0 440 300" role="img" aria-label="${esc(`Mechanism of ${d.name} at ${d.target.name || "its target"}`)}">${scene.svg}</svg>
      <div class="rx-now" aria-live="polite"><div class="rx-now-k"></div><b class="rx-now-t"></b><p class="rx-now-p"></p></div>
    </div>
  </div>
  <div class="rx-controls">
    <div class="rx-group"><button type="button" data-act="prev" aria-label="Previous step">◀</button><button type="button" data-act="play" aria-pressed="false">Pause</button><button type="button" data-act="next" aria-label="Next step">▶</button></div>
    ${binding ? `<label class="rx-range"><span class="rx-gl">Drug concentration at the target, relative to K<sub>d</sub></span><input type="range" min="-2" max="2" step="0.05" value="${opts.logc ?? 0.6}" data-act="conc" aria-describedby="rx-occ-note"><span class="rx-ticks"><i>0.01×</i><i>0.1×</i><i>1×</i><i>10×</i><i>100×</i></span></label>` : ""}
  </div>
  <ol class="rx-steps">${steps.map((st, i) => `<li><button type="button" data-step="${i}"><span class="rx-step-k">${st.kind === "cell" ? "cell" : esc(SITES[st.site].label)}</span>${esc(st.title)}${st.generic ? ` <em>typical</em>` : ""}${st.need ? ` <i class="rx-flag${st.need.required ? " rx-req" : ""}">${st.need.required ? "needs input" : "could add data"}</i>` : ""}</button></li>`).join("")}</ol>
</div>
<figcaption class="iso-legend"><span class="iso-caption">${esc(d.summary || "")}${binding ? ` <span id="rx-occ-note">The slider drives a simple binding model, occupancy = C / (C + K<sub>d</sub>) (one site, Hill coefficient 1). It shows the shape of the relationship, not a measured value for this drug.</span>` : ""}</span></figcaption>
</figure>
${(() => {
      const missing = needs.filter((n) => String(n.path).startsWith("fact:") && !(d.facts || []).some((f) => f.label === n.label && f.value));
      d = { ...d, facts: [...(d.dosageForm ? [{ label: "Dosage form", value: `${d.dosageForm} (as entered)` }] : []), ...(d.facts || []).filter((f) => f.value), ...missing.map((n) => ({ label: n.label, value: "", need: n }))] };
      return "";
    })()}${(d.facts || []).length ? `<section class="rx-facts"><h2>Key facts</h2>${d.structure && d.structure.url ? `<figure class="rx-struct"><img src="${esc(d.structure.url)}" alt="2D structure of ${esc(d.name)}" loading="lazy" width="150" height="150"><figcaption>2D structure${cites(d.structure.cite, d)}</figcaption></figure>` : ""}<dl>${d.facts.map((f) => `<div><dt>${esc(f.label)}</dt><dd>${f.need ? `<button type="button" class="rx-need-cell${f.need.required ? " rx-req" : ""}" data-need="${esc(f.need.path)}">${f.need.required ? "Needs your input" : "Not public: add if you have it"}</button>` : esc(f.value)}${cites(f.cite, d)}</dd></div>`).join("")}</dl></section>` : ""}
<section class="bio-sources">
  <h2>Sources</h2>${(d.sources || []).length ? `<ol>${d.sources.map((s) => `<li id="rx-src-${esc(s.id)}" value="${esc(s.id)}">${esc(s.text)}${s.url ? ` <a href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.url.replace(/^https?:\/\//, "").slice(0, 60))}</a>` : ""}</li>`).join("")}</ol>` : `<p>No sources given. Treat every statement on this page as unverified.</p>`}
  <h2>What is simplified</h2><ul>${[...(d.simplified || []), `The cell scene is the generic “${SCENE_NAMES[scene.key]}” template, labelled for this drug. It is schematic and not to scale.`].map((s) => `<li>${esc(s)}</li>`).join("")}</ul>
  <p class="rx-note">Educational illustration of mechanism, not medical advice. No doses, schedules or recommendations are shown. Not a validated pharmacology model and not a substitute for the product label, Investigator's Brochure or approved documents.</p>
</section>`;

    const $ = (q) => host.querySelector(q);
    const cell = $(".rx-cell"), body = $(".rx-body");
    const R = { root: cell };
    cell.querySelectorAll("[data-k]").forEach((el) => { (R[el.dataset.k] = R[el.dataset.k] || [])[+el.dataset.i] = el; });
    const dots = [...body.querySelectorAll(".rx-dots circle")];
    const readout = $("[data-readout]"), playBtn = $('[data-act="play"]');
    const stepBtns = [...host.querySelectorAll("[data-step]")];
    const now = { k: $(".rx-now-k"), t: $(".rx-now-t"), p: $(".rx-now-p") };
    const callout = { lead: body.querySelector(".rx-leader"), text: body.querySelector(".rx-site-label") };

    let idx = 0, prevSite = null, stepT0 = 0, clock = 0, last = null, playing = !reduce, visible = true, raf = 0, hover = null;
    let logc = binding ? +(opts.logc ?? 0.6) : 2;
    const occ = () => { const c = Math.pow(10, logc); return c / (1 + c); };

    function labelSite(site) {
      const p = SITES[site].pts[0], right = p[0] >= 150;
      const lx = right ? 292 : 8;
      callout.lead.setAttribute("d", `M${p[0]},${p[1]} L${right ? lx - 4 : lx + 4},${p[1]}`);
      callout.text.setAttribute("x", right ? lx : lx);
      callout.text.setAttribute("y", p[1] + 3.5);
      callout.text.setAttribute("text-anchor", right ? "start" : "end");
      callout.text.textContent = SITES[site].label;
    }
    function setStep(i, user) {
      idx = (i + steps.length) % steps.length;
      const st = steps[idx];
      prevSite = idx > 0 ? steps[idx - 1].site : null;
      stepT0 = reduce && !playing ? clock - 60 : clock;
      stepBtns.forEach((b, j) => { b.setAttribute("aria-current", j === idx ? "step" : "false"); b.classList.toggle("rx-done", j < idx); });
      body.querySelectorAll(".rx-organ").forEach((o) => o.classList.toggle("rx-on", o.dataset.site === st.site || (st.site === "blood" && o.dataset.site === "heart")));
      body.classList.toggle("rx-blood-on", st.site === "blood" || st.site === "tissues");
      body.classList.toggle("rx-all-on", st.site === "tissues");
      host.querySelector(".rx-pane-cell").classList.toggle("rx-live", st.kind === "cell");
      host.querySelector(".rx-pane-body").classList.toggle("rx-live", st.kind !== "cell");
      now.k.textContent = `Step ${idx + 1} of ${steps.length} · ${st.kind === "cell" ? "at the target" : SITES[st.site].label}${st.generic ? " · typical for the class" : ""}`;
      now.t.textContent = st.title || "";
      now.p.innerHTML = (st.text ? esc(st.text) : `<span class="rx-missing">Not filled in yet.</span>`) + cites(st.cite, d)
        + (st.need ? `<span class="rx-now-need${st.need.required ? " rx-req" : ""}"><button type="button" data-need="${esc(st.need.path)}">${st.need.required ? "Needs your input" : "You could add"}: ${esc(st.need.label)}</button>${st.need.why ? ` ${esc(st.need.why)}` : ""}</span>` : "");
      labelSite(hover || st.site);
      if (user && reduce) draw();
    }
    function sceneState() {
      const st = steps[idx], el = clock - stepT0, p = ease(clamp(el / (STEP_S * 0.7)));
      if (st.kind === "cell") return { beat: st.beatEnd != null && p >= 1 ? st.beatEnd : st.beat, p: st.beatEnd != null && p >= 1 ? 1 : p, t: clock, occ: occ() };
      if (st.after) return { beat: 3, p: 1, t: clock, occ: occ() };
      return { beat: -1, p: 0, t: clock, occ: 0 };
    }
    function draw() {
      const st = steps[idx], el = clock - stepT0;
      dots.forEach((c, i) => {
        const route = routeOf(prevSite, st.site, i);
        const u = clamp((el - i * 0.05) / 1.5);
        const b = route[route.length - 1];
        let p;
        if (u < 1) {
          const q = along(route, ease(u));
          p = [q[0] + 2.5 * Math.sin(i * 2.1 + u * 9), q[1] + 2.5 * Math.cos(i * 1.7 + u * 7)];
        } else {
          const a = clock * (0.8 + (i % 5) * 0.12) + i * 2.4, r = 4 + (i % 4) * 1.6;
          p = [b[0] + r * Math.cos(a), b[1] + r * 0.8 * Math.sin(a)];
        }
        c.setAttribute("cx", f1(p[0])); c.setAttribute("cy", f1(p[1]));
        c.style.opacity = !prevSite && u < 0.2 ? f1(u * 5) : 1;
      });
      const s = sceneState();
      scene.frame(R, s);
      const head = st.kind === "cell" || st.after ? scene.metric() : `${SITES[st.site].label}`;
      readout.textContent = `${idx + 1}/${steps.length} · ${head}${binding && (st.kind === "cell" || st.after) ? ` · occupancy ${Math.round(occ() * 100)}%` : ""}`;
    }
    function tick(ts) {
      raf = requestAnimationFrame(tick);
      const dt = last == null ? 0 : Math.min(0.1, (ts - last) / 1000);
      last = ts;
      if (!visible) return;
      if (playing) {
        clock += dt;
        const dur = steps[idx].kind === "cell" ? STEP_S + 0.6 : STEP_S;
        if (clock - stepT0 > dur + (idx === steps.length - 1 ? 2.5 : 0)) setStep(idx + 1);
      }
      draw();
    }
    function setPlaying(v) {
      playing = v;
      playBtn.textContent = playing ? "Pause" : "Play";
      playBtn.setAttribute("aria-pressed", String(!playing));
    }

    host.querySelectorAll("button[data-step]").forEach((b) => b.addEventListener("click", () => setStep(+b.dataset.step, true)));
    $('[data-act="prev"]').addEventListener("click", () => setStep(idx - 1, true));
    $('[data-act="next"]').addEventListener("click", () => setStep(idx + 1, true));
    playBtn.addEventListener("click", () => { setPlaying(!playing); if (playing && reduce) stepT0 = clock; });
    const range = $('[data-act="conc"]');
    if (range) range.addEventListener("input", () => { logc = +range.value; if (reduce) draw(); });
    body.querySelectorAll(".rx-organ").forEach((o) => {
      const on = () => { hover = o.dataset.site; labelSite(hover); o.classList.add("rx-hover"); };
      const off = () => { hover = null; labelSite(steps[idx].site); o.classList.remove("rx-hover"); };
      o.addEventListener("pointerenter", on); o.addEventListener("pointerleave", off);
      o.addEventListener("focus", on); o.addEventListener("blur", off);
      o.addEventListener("click", () => { const j = steps.findIndex((s) => s.site === o.dataset.site && s.kind === "body"); if (j >= 0) setStep(j, true); });
    });
    const onKey = (e) => {
      if (e.target.closest && e.target.closest("input, textarea, select, [contenteditable]")) return;
      if (e.code === "Space" && !(e.target.closest && e.target.closest("button"))) { e.preventDefault(); setPlaying(!playing); }
      else if (e.key === "ArrowRight") setStep(idx + 1, true);
      else if (e.key === "ArrowLeft") setStep(idx - 1, true);
    };
    document.addEventListener("keydown", onKey);
    const onNeed = (e) => {
      const b = e.target.closest && e.target.closest("[data-need]");
      if (b && host.contains(b)) host.dispatchEvent(new CustomEvent("rx-need", { bubbles: true, detail: { path: b.dataset.need } }));
    };
    host.addEventListener("click", onNeed);
    let io = null;
    if (typeof IntersectionObserver === "function") { io = new IntersectionObserver((es) => { visible = es.some((e) => e.isIntersecting); }); io.observe(host.querySelector(".rx-stage")); }

    setPlaying(playing);
    setStep(opts.step || 0);
    draw();
    raf = requestAnimationFrame(tick);
    const api = {
      steps, scene,
      destroy() { cancelAnimationFrame(raf); document.removeEventListener("keydown", onKey); host.removeEventListener("click", onNeed); if (io) io.disconnect(); host._rx = null; },
      go: (i) => setStep(i, true),
      pause: () => setPlaying(false),
      advance(sec) { clock += sec; draw(); },
    };
    host._rx = api;
    return api;
  }

  G.AnimaRx = { mount, SITES, SITE_ALIAS, SCENE_NAMES, siteId, sceneFor, sceneKey, timelineOf, esc };
})(typeof window !== "undefined" ? window : globalThis);
