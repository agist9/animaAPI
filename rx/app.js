/* Anima Rx app: search box, local dossier library, public lookup (ChEMBL + PubChem) and the dossier editor.
   Needs render.js first. Bundled dossiers arrive as window.__RX_DOSSIERS__. */
(function () {
  "use strict";
  const RX = window.AnimaRx, esc = RX.esc;
  const BUNDLED = window.__RX_DOSSIERS__ || [];
  const HOSTED = !!window.__RX_HOSTED__;
  const KEY = "anima-rx-local-v1";
  const norm = (s) => String(s || "").toLowerCase().replace(/[\s\-_.()®™]/g, "");
  const $ = (q, el = document) => el.querySelector(q);
  const store = {
    load() { try { return JSON.parse(localStorage.getItem(KEY) || "{}") || {}; } catch { return {}; } },
    save(v) { try { localStorage.setItem(KEY, JSON.stringify(v)); return true; } catch { return false; } },
  };
  let local = store.load();
  let current = null;

  const view = $("#rx-view"), msg = $("#rx-msg"), q = $("#rx-q"), list = $("#rx-list"), lib = $("#rx-lib");

  const all = () => [...Object.values(local).map((d) => ({ ...d, _local: true })), ...BUNDLED.filter((b) => !local[b.id])];
  function find(term) {
    const n = norm(term);
    if (!n) return null;
    return all().find((d) => [d.id, d.name, ...(d.aliases || [])].some((a) => norm(a) === n)) || null;
  }
  function refreshLib() {
    const items = all();
    list.innerHTML = items.flatMap((d) => [d.name, ...(d.aliases || [])].map((a) => `<option value="${esc(a)}">`)).join("");
    lib.innerHTML = items.map((d) => `<button type="button" class="rx-chip${d._local ? " rx-chip-local" : ""}" data-id="${esc(d.id)}">${esc(d.name)}<span>${esc(d.modality || "")}${d.confidential ? " · confidential" : d._local ? " · on this device" : ""}</span></button>`).join("");
  }
  lib.addEventListener("click", (e) => { const b = e.target.closest("[data-id]"); if (b) show(all().find((d) => d.id === b.dataset.id)); });

  function say(html, tone = "") { msg.hidden = !html; msg.className = `rx-msg ${tone}`; msg.innerHTML = html || ""; }

  function show(d, opts = {}) {
    if (!d) return;
    current = JSON.parse(JSON.stringify(d));
    delete current._local;
    say("");
    RX.mount(view, current, opts);
    q.value = current.name;
    document.title = `${current.name} · Anima Rx`;
    try { if (!current.confidential && !current.draft) history.replaceState(null, "", `#${encodeURIComponent(current.id)}`); else history.replaceState(null, "", location.pathname + location.search); } catch {}
    if (editor.open && !opts.fromEditor) editor.fill(current);
  }

  const looksInternal = (s) => /^[a-z]{1,6}[-\s]?\d{2,}[a-z0-9-]*$/i.test(String(s).trim());
  function notFound(term) {
    const internal = looksInternal(term);
    if (view._rx) view._rx.destroy();
    view.innerHTML = "";
    current = null;
    say(`<p><b>No dossier for “${esc(term)}” on this page.</b> ${internal ? "It looks like an internal development code. Codes like this rarely appear in public databases until a compound is published, so the fastest route is to build a dossier from your own documents (Investigator’s Brochure, development reports, tech-transfer package)." : "Build a dossier yourself, open a dossier file, or draft one from public databases."}</p>
<div class="rx-msg-actions"><button type="button" data-act="create">Create a dossier for “${esc(term)}”</button><button type="button" data-act="open-file">Open a dossier file…</button>${HOSTED ? "" : `<button type="button" data-act="public">Search ChEMBL + PubChem</button>`}</div>
<p class="rx-small">${HOSTED ? "Public database search is switched off in this hosted copy, which cannot reach outside servers. Use the local file <code>rx/anima-rx.html</code> for it. " : ""}The public search sends the text “${esc(term)}” to EBI (ChEMBL) and NCBI (PubChem).${internal ? " <b>Check your confidentiality policy before you send an unpublished code to a third party.</b>" : ""} Nothing else leaves this page. Dossiers you create stay in this browser.</p>`, internal ? "rx-msg-warn" : "");
    msg.querySelector('[data-act="create"]').onclick = () => editor.start(term);
    msg.querySelector('[data-act="open-file"]').onclick = () => fileIn.click();
    const pubBtn = msg.querySelector('[data-act="public"]');
    if (pubBtn) pubBtn.onclick = () => lookupPublic(term);
  }

  $("#rx-search").addEventListener("submit", (e) => {
    e.preventDefault();
    const term = q.value.trim();
    if (!term) return;
    const d = find(term);
    if (d) show(d); else notFound(term);
  });

  /* ---------- files ---------- */

  const fileIn = $("#rx-file");
  $('[data-act="open"]').addEventListener("click", () => fileIn.click());
  fileIn.addEventListener("change", async () => {
    const f = fileIn.files && fileIn.files[0];
    fileIn.value = "";
    if (!f) return;
    try {
      const d = validate(JSON.parse(await f.text()));
      local[d.id] = d; store.save(local); refreshLib(); show(d);
    } catch (err) { say(`<p><b>Could not open that file.</b> ${esc(err.message)}</p>`, "rx-msg-err"); }
  });
  document.addEventListener("dragover", (e) => { if (e.dataTransfer && [...e.dataTransfer.types].includes("Files")) e.preventDefault(); });
  document.addEventListener("drop", async (e) => {
    const f = e.dataTransfer && e.dataTransfer.files[0];
    if (!f || !/json/i.test(f.type + f.name)) return;
    e.preventDefault();
    try { const d = validate(JSON.parse(await f.text())); local[d.id] = d; store.save(local); refreshLib(); show(d); }
    catch (err) { say(`<p><b>Could not open that file.</b> ${esc(err.message)}</p>`, "rx-msg-err"); }
  });

  function validate(d) {
    if (!d || typeof d !== "object") throw new Error("The file is not a JSON object.");
    if (!d.name) throw new Error("A dossier needs at least a “name”.");
    d.id = d.id || norm(d.name);
    d.target = d.target || {};
    d.journey = Array.isArray(d.journey) ? d.journey : [];
    d.mechanism = Array.isArray(d.mechanism) ? d.mechanism : [];
    return d;
  }

  /* ---------- route presets (shared by the editor and public drafts) ---------- */

  const ROUTES = {
    oral: { label: "Oral (tablet, capsule)", steps: [
      ["mouth", "Swallowed", "Taken by mouth."],
      ["stomach", "Dissolves", "The dosage form disintegrates and the drug dissolves."],
      ["intestine", "Absorbed", "Most oral drugs are absorbed across the small-intestine wall into the portal blood."],
      ["liver", "First pass through the liver", "Portal blood passes through the liver before reaching the general circulation; some drugs are partly metabolised on this pass."],
      ["blood", "Distributed", "Carried in the blood, partly bound to plasma proteins; the unbound fraction reaches tissues."]] },
    iv: { label: "Intravenous", steps: [
      ["iv", "Infused into a vein", "Enters the bloodstream directly, with no absorption step."],
      ["blood", "Distributed", "Carried in the blood to the tissues."]] },
    subq: { label: "Subcutaneous", steps: [
      ["subq", "Injected under the skin", "Forms a depot in the tissue under the skin."],
      ["lymph-nodes", "Absorbed via lymph", "Large molecules such as antibodies are absorbed slowly, largely through the lymphatic system."],
      ["blood", "Distributed", "Reaches the bloodstream and is carried to the tissues."]] },
    im: { label: "Intramuscular", steps: [
      ["im", "Injected into muscle", "Absorbed from the muscle into nearby capillaries."],
      ["blood", "Distributed", "Carried in the blood to the tissues."]] },
    inhaled: { label: "Inhaled", steps: [
      ["mouth", "Inhaled", "Breathed in as an aerosol or powder."],
      ["lungs", "Deposits in the airways", "Acts locally in the lungs; some crosses into the blood."]] },
    topical: { label: "Topical / transdermal", steps: [
      ["skin", "Applied to the skin", "Acts locally or crosses the skin slowly into the blood."]] },
    "ex-vivo": { label: "Autologous cell therapy (ex vivo)", steps: [
      ["iv", "Cells are collected", "The patient’s cells are collected, for example by leukapheresis."],
      ["ex-vivo", "Engineered outside the body", "Cells are modified, expanded and formulated at the manufacturing site."],
      ["iv", "Infused back", "The modified cells are returned by intravenous infusion."],
      ["blood", "Expand in the body", "The cells multiply after infusion."]] },
  };
  const CLEAR = {
    small: [["liver", "Metabolised", "Small molecules are typically metabolised in the liver, often by CYP enzymes."], ["kidneys", "Filtered", "Drug and metabolites are filtered by the kidneys."], ["bladder", "Excreted in urine", "and leave in the urine (some leave in bile and feces)."]],
    big: [["tissues", "Broken down like other proteins", "Proteins and antibodies are cleared by catabolism throughout the body, not by CYP enzymes."]],
  };
  const isBig = (m) => ["antibody", "protein", "peptide"].includes(m);
  function journeyFor(route, modality, targetName, targetSite = "tissues", generic = true) {
    const pre = (ROUTES[route] || ROUTES.iv).steps.map(([site, title, text]) => ({ site, title, text, generic }));
    const tgt = { site: targetSite, title: `Reaches ${targetName || "its target"}`, text: `Distributes to the tissue where ${targetName || "the target"} is found.`, generic, target: true };
    const post = ["cell-therapy", "gene-therapy"].includes(modality) ? [] : (isBig(modality) ? CLEAR.big : CLEAR.small).map(([site, title, text]) => ({ site, title, text, generic }));
    return [...pre, tgt, ...post];
  }

  /* ---------- public lookup ---------- */

  const CHEMBL = "https://www.ebi.ac.uk/chembl/api/data";
  const getJson = async (u) => { const r = await fetch(u, { headers: { Accept: "application/json" } }); if (!r.ok) throw new Error(`${r.status} from ${new URL(u).host}`); return r.json(); };
  const TYPE = { "small molecule": "small-molecule", antibody: "antibody", protein: "protein", oligonucleotide: "oligonucleotide", cell: "cell-therapy", gene: "gene-therapy", enzyme: "protein" };

  function classify(text, modality) {
    const t = text.toLowerCase();
    if (modality === "cell-therapy") return "car";
    if (modality === "gene-therapy") return "gene";
    if (modality === "oligonucleotide") return "oligo";
    if (/programmed cell death|pd-?1\b|pd-?l1|ctla-?4|lag-?3|tigit/.test(t)) return "checkpoint";
    if (/cd3.*(bispecific|engager)|bispecific.*cd3/.test(t)) return "car";
    if (/channel/.test(t)) return "channel";
    if (/transporter|symporter|antiporter|reuptake|pump|exchanger/.test(t)) return "transporter";
    if (/estrogen receptor|androgen receptor|glucocorticoid receptor|mineralocorticoid|progesterone receptor|peroxisome|ppar|retinoic acid receptor|retinoid x|thyroid hormone receptor|vitamin d receptor|nuclear receptor/.test(t)) return "nuclear";
    if (/receptor/.test(t)) return "receptor";
    if (isBig(modality) && /tumou?r necrosis factor|interleukin|\bil-?\d|cytokine|vegf|immunoglobulin e|complement|tslp|interferon|rankl|sclerostin|pcsk9/.test(t)) return "ligand";
    if (/kinase|ase\b|ase |cyclooxygenase|synthase|protease|polymerase|reductase|inhibitor/.test(t)) return "enzyme";
    return isBig(modality) ? "receptor" : "enzyme";
  }

  async function lookupPublic(term) {
    say(`<p>Searching ChEMBL and PubChem for “${esc(term)}”…</p>`);
    try {
      const enc = encodeURIComponent(term);
      const res = await getJson(`${CHEMBL}/molecule/search.json?q=${enc}&limit=10`);
      const mols = res.molecules || [];
      const n = norm(term);
      const mol = mols.find((m) => norm(m.pref_name) === n || (m.molecule_synonyms || []).some((s) => norm(s.molecule_synonym) === n)) || mols[0];
      if (!mol) throw new Error(`ChEMBL has no record matching “${term}”.`);
      const id = mol.molecule_chembl_id;
      const parent = (mol.molecule_hierarchy && mol.molecule_hierarchy.parent_chembl_id) || id;
      const [mech, ind, pc] = await Promise.all([
        getJson(`${CHEMBL}/mechanism.json?molecule_chembl_id=${parent}&limit=20`).then((r) => r.mechanisms || []).catch(() => []),
        getJson(`${CHEMBL}/drug_indication.json?molecule_chembl_id=${parent}&limit=100`).then((r) => r.drug_indications || []).catch(() => []),
        getJson(`https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/name/${enc}/property/MolecularFormula,MolecularWeight/JSON`).then((r) => r.PropertyTable.Properties[0]).catch(() => null),
      ]);
      const m0 = mech[0] || {};
      let tgt = null;
      if (m0.target_chembl_id) tgt = await getJson(`${CHEMBL}/target/${m0.target_chembl_id}.json`).catch(() => null);
      const modality = TYPE[String(mol.molecule_type || "").toLowerCase()] || "small-molecule";
      const moa = m0.mechanism_of_action || "";
      const tName = (tgt && tgt.pref_name) || moa.replace(/\s+(inhibitor|antagonist|agonist|blocker|modulator|opener|binding agent)$/i, "") || "its target";
      const gene = tgt && (tgt.target_components || []).flatMap((c) => c.target_component_synonyms || []).find((y) => y.syn_type === "GENE_SYMBOL");
      const short = gene ? gene.component_synonym : tName.length <= 20 ? tName : tName.slice(0, 20).replace(/\s+\S*$/, "") + "…";
      const cls = classify(`${moa} ${tName}`, modality);
      const route = mol.oral ? "oral" : mol.parenteral ? (isBig(modality) ? "iv" : "iv") : mol.topical ? "topical" : modality === "cell-therapy" ? "ex-vivo" : isBig(modality) ? "iv" : "oral";
      const name = mol.pref_name ? mol.pref_name.charAt(0) + mol.pref_name.slice(1).toLowerCase() : term;
      const sources = [{ id: 1, text: `ChEMBL compound report card ${id}${parent !== id ? ` (parent ${parent})` : ""}, EMBL-EBI.`, url: `https://www.ebi.ac.uk/chembl/compound_report_card/${parent}/` }];
      if (pc) sources.push({ id: 2, text: `PubChem compound CID ${pc.CID}, NCBI.`, url: `https://pubchem.ncbi.nlm.nih.gov/compound/${pc.CID}` });
      const refs = [];
      mech.forEach((m) => (m.mechanism_refs || []).forEach((r) => { if (r.ref_url && refs.length < 4 && !refs.some((x) => x.url === r.ref_url)) refs.push({ text: `${r.ref_type}: ${r.ref_id} (cited by ChEMBL for the mechanism)`, url: r.ref_url }); }));
      refs.forEach((r, i) => sources.push({ id: sources.length + 1, ...r }));
      const mechCite = refs.length ? refs.map((_, i) => sources.length - refs.length + i + 1) : [1];
      const inds = ind.slice().sort((a, b) => (+b.max_phase_for_ind || 0) - (+a.max_phase_for_ind || 0)).map((x) => x.efo_term || x.mesh_heading).filter((v, i, a) => v && a.indexOf(v) === i).slice(0, 4);
      const phase = mol.max_phase != null ? `${+mol.max_phase === 4 ? "Approved (max phase 4)" : `Max phase ${+mol.max_phase}`}` : "Unknown";
      const d = {
        id: norm(name), name, aliases: [term], modality, status: phase, draft: true,
        summary: `${moa || "Mechanism not recorded in ChEMBL"}. Drafted automatically from ChEMBL${pc ? " and PubChem" : ""}.`,
        target: { name: tName, short, class: cls, action: String(m0.action_type || (cls === "car" ? "cytotoxic" : "inhibitor")).toLowerCase(), cell: `cell carrying ${tName}`, labels: cls === "checkpoint" && /l1|ligand/i.test(tName) ? { blocks: "ligand", receptor: "PD-1", ligand: "PD-L1" } : {} },
        binding: !["car", "gene", "oligo"].includes(cls),
        journey: journeyFor(route, modality, tName),
        mechanism: [],
        facts: [
          { label: "Mechanism (ChEMBL)", value: mech.length ? mech.map((m) => `${m.mechanism_of_action} (${String(m.action_type || "").toLowerCase()})`).join("; ") : "not recorded", cite: mechCite },
          { label: "Molecule type", value: mol.molecule_type || "unknown", cite: [1] },
          { label: "Development stage", value: `${phase}${mol.first_approval ? `, first approved ${mol.first_approval}` : ""}`, cite: [1] },
          ...(pc ? [{ label: "Formula · molecular weight", value: `${pc.MolecularFormula} · ${pc.MolecularWeight} g/mol`, cite: [2] }] : []),
          ...(inds.length ? [{ label: "Indications studied (top)", value: inds.join("; "), cite: [1] }] : []),
        ],
        simplified: [
          "The body journey is a generic template for the route and modality, not this drug’s measured pharmacokinetics.",
          `The scene type (${RX.SCENE_NAMES[cls]}) was chosen automatically from the ChEMBL mechanism text. Check that it fits.`,
        ],
        sources,
      };
      if (pc && modality === "small-molecule") d.structure = { url: `https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/cid/${pc.CID}/PNG?image_size=300x300`, cite: [2] };
      local[d.id] = d; store.save(local); refreshLib();
      show(d);
    } catch (err) {
      say(`<p><b>Public lookup failed.</b> ${esc(err.message)}</p><p class="rx-small">If you opened this page from a sandbox or a locked-down network, the request may be blocked. You can still build the dossier by hand.</p><div class="rx-msg-actions"><button type="button" data-act="create">Create a dossier for “${esc(term)}”</button></div>`, "rx-msg-err");
      const b = msg.querySelector('[data-act="create"]'); if (b) b.onclick = () => editor.start(term);
    }
  }

  /* ---------- editor ---------- */

  const editor = (() => {
    const box = $("#rx-edit"), form = $("#rx-form");
    let d = null, timer = 0, stepKeep = 0;
    const MODS = ["small-molecule", "antibody", "protein", "peptide", "oligonucleotide", "mrna", "gene-therapy", "cell-therapy"];
    const ACTIONS = ["inhibitor", "antagonist", "agonist", "blocker", "opener", "positive modulator", "neutraliser", "cytotoxic", "T-cell engager", "expression", "knockdown"];
    const siteOpts = Object.entries(RX.SITES).map(([k, v]) => `<option value="${k}">${esc(v.label)}</option>`).join("");
    const opt = (list, v) => list.map((o) => `<option${o === v ? " selected" : ""}>${esc(o)}</option>`).join("");
    const field = (label, inner, wide) => `<label class="rx-f${wide ? " rx-f-wide" : ""}"><span>${label}</span>${inner}</label>`;
    const nums = (s) => String(s || "").split(/[^\d]+/).filter(Boolean).map(Number);

    function blank(name) {
      return {
        id: norm(name) || "new-dossier", name: name || "New dossier", aliases: [], modality: "small-molecule", status: "Investigational (internal)", confidential: true,
        summary: "", target: { name: "", short: "", class: "", action: "inhibitor", cell: "", labels: {} }, binding: true,
        journey: journeyFor("oral", "small-molecule", "", "tissues", false).map((j) => ({ ...j, generic: undefined })),
        mechanism: [], facts: [], simplified: [], sources: [],
      };
    }
    function rowsHtml(kind, items) {
      const r = (it, i) => {
        if (kind === "journey") return `<div class="rx-row" data-i="${i}"><select data-f="site">${siteOpts.replace(`value="${RX.siteId(it.site)}"`, `value="${RX.siteId(it.site)}" selected`)}</select><input data-f="title" placeholder="Step title" value="${esc(it.title)}"><textarea data-f="text" rows="2" placeholder="What happens here (with numbers only if sourced)">${esc(it.text)}</textarea><input data-f="cite" class="rx-cite-in" placeholder="src #" value="${esc((it.cite || []).join(","))}"><label class="rx-tgt"><input type="radio" name="rx-target" data-f="target"${it.target ? " checked" : ""}> target</label>${rowBtns}</div>`;
        if (kind === "mechanism") return `<div class="rx-row" data-i="${i}"><input data-f="title" placeholder="Beat ${i + 1} title" value="${esc(it.title)}"><textarea data-f="text" rows="2" placeholder="What happens at the target">${esc(it.text)}</textarea><input data-f="cite" class="rx-cite-in" placeholder="src #" value="${esc((it.cite || []).join(","))}">${rowBtns}</div>`;
        if (kind === "facts") return `<div class="rx-row" data-i="${i}"><input data-f="label" placeholder="Label, e.g. Half-life" value="${esc(it.label)}"><input data-f="value" placeholder="Value with units and conditions" value="${esc(it.value)}"><input data-f="cite" class="rx-cite-in" placeholder="src #" value="${esc((it.cite || []).join(","))}">${rowBtns}</div>`;
        return `<div class="rx-row" data-i="${i}"><span class="rx-src-n">${i + 1}</span><input data-f="text" placeholder="Document, section, version (e.g. IB v4.0 §5.3)" value="${esc(it.text)}"><input data-f="url" placeholder="Link (optional)" value="${esc(it.url || "")}">${rowBtns}</div>`;
      };
      return items.map(r).join("") + `<button type="button" class="rx-add" data-add="${kind}">+ Add ${kind === "journey" ? "body step" : kind === "mechanism" ? "mechanism beat" : kind === "facts" ? "fact" : "source"}</button>`;
    }
    const rowBtns = `<span class="rx-row-btns"><button type="button" data-mv="-1" aria-label="Move up">↑</button><button type="button" data-mv="1" aria-label="Move down">↓</button><button type="button" data-del aria-label="Remove">✕</button></span>`;

    function render() {
      const t = d.target, L = t.labels || {};
      form.innerHTML = `
<p class="rx-small">Everything you type here stays in this browser. <b>Save on this device</b> keeps it in local browser storage; ${HOSTED ? "<b>Copy JSON</b> gives you the text" : "<b>Download JSON</b> gives you a file"} to keep in your controlled document system or in <code>rx/private/</code>. Show only numbers you can cite, with units and conditions.</p>
<fieldset><legend>Identity</legend><div class="rx-grid">
${field("Name or code", `<input data-p="name" value="${esc(d.name)}">`)}
${field("Aliases (comma-separated)", `<input data-p="aliases" value="${esc((d.aliases || []).join(", "))}">`)}
${field("Modality", `<select data-p="modality">${opt(MODS, d.modality)}</select>`)}
${field("Status", `<input data-p="status" value="${esc(d.status || "")}">`)}
${field("Summary (one or two sentences)", `<textarea data-p="summary" rows="2">${esc(d.summary || "")}</textarea>`, true)}
<label class="rx-check"><input type="checkbox" data-p="confidential"${d.confidential ? " checked" : ""}> Confidential (shows a banner and never puts the name in the address bar)</label>
</div></fieldset>
<fieldset><legend>Target and mechanism scene</legend><div class="rx-grid">
${field("Target", `<input data-p="target.name" placeholder="e.g. KIT D816V kinase" value="${esc(t.name || "")}">`)}
${field("Short label", `<input data-p="target.short" placeholder="e.g. KIT" value="${esc(t.short || "")}">`)}
${field("Scene", `<select data-p="target.class"><option value="">auto (from modality)</option>${Object.entries(RX.SCENE_NAMES).map(([k, v]) => `<option value="${k}"${t.class === k ? " selected" : ""}>${esc(v)}</option>`).join("")}</select>`)}
${field("Action", `<input data-p="target.action" list="rx-actions" value="${esc(t.action || "")}"><datalist id="rx-actions">${ACTIONS.map((a) => `<option value="${a}">`).join("")}</datalist>`)}
${field("Target cell or tissue", `<input data-p="target.cell" placeholder="e.g. Mast cell" value="${esc(t.cell || "")}">`)}
${field("Vector (gene therapy)", `<input data-p="target.vector" placeholder="AAV, lentivirus, LNP" value="${esc(t.vector || "")}">`)}
${field("Ligand / antigen label", `<input data-p="target.labels.ligand" value="${esc(L.ligand || L.antigen || "")}">`)}
${field("Effector cell label", `<input data-p="target.labels.effector" value="${esc(L.effector || "")}">`)}
${field("Target cell label", `<input data-p="target.labels.target" value="${esc(L.target || "")}">`)}
${field("Protein made (gene therapy)", `<input data-p="target.labels.protein" value="${esc(L.protein || "")}">`)}
<label class="rx-check"><input type="checkbox" data-p="binding"${d.binding !== false ? " checked" : ""}> Show the binding-occupancy slider</label>
</div></fieldset>
<fieldset><legend>Journey through the body</legend>
<div class="rx-inline"><select id="rx-route">${Object.entries(ROUTES).map(([k, v]) => `<option value="${k}">${esc(v.label)}</option>`).join("")}</select><button type="button" id="rx-route-go">Replace journey with this route’s template</button></div>
<div class="rx-rows" data-list="journey">${rowsHtml("journey", d.journey)}</div></fieldset>
<fieldset><legend>Mechanism at the target (up to four beats; leave empty to use the scene’s default text)</legend><div class="rx-rows" data-list="mechanism">${rowsHtml("mechanism", d.mechanism)}</div></fieldset>
<fieldset><legend>Key facts</legend><div class="rx-rows" data-list="facts">${rowsHtml("facts", d.facts || [])}</div></fieldset>
<fieldset><legend>Sources (cite them by number above)</legend><div class="rx-rows" data-list="sources">${rowsHtml("sources", d.sources || [])}</div></fieldset>
<fieldset><legend>What is simplified (one per line)</legend><textarea data-p="simplified" rows="3">${esc((d.simplified || []).join("\n"))}</textarea></fieldset>
<div class="rx-inline rx-edit-actions"><button type="button" data-ed="save">Save on this device</button>${HOSTED ? "" : `<button type="button" data-ed="download">Download JSON</button>`}<button type="button" data-ed="copy">Copy JSON</button><button type="button" data-ed="forget">Remove from this device</button><span class="rx-small" id="rx-ed-status"></span></div>`;
    }

    function setPath(obj, path, v) {
      const ks = path.split(".");
      let o = obj;
      ks.slice(0, -1).forEach((k) => { o[k] = o[k] || {}; o = o[k]; });
      o[ks[ks.length - 1]] = v;
    }
    function readRows(kind) {
      return [...form.querySelectorAll(`[data-list="${kind}"] .rx-row`)].map((row, i) => {
        const get = (f) => { const el = row.querySelector(`[data-f="${f}"]`); return el ? (el.type === "radio" ? el.checked : el.value) : undefined; };
        if (kind === "journey") return { site: get("site"), title: get("title"), text: get("text"), cite: nums(get("cite")), ...(get("target") ? { target: true } : {}) };
        if (kind === "mechanism") return { title: get("title"), text: get("text"), cite: nums(get("cite")) };
        if (kind === "facts") return { label: get("label"), value: get("value"), cite: nums(get("cite")) };
        return { id: i + 1, text: get("text"), url: get("url") || undefined };
      });
    }
    function read() {
      form.querySelectorAll("[data-p]").forEach((el) => {
        let v = el.type === "checkbox" ? el.checked : el.value;
        if (el.dataset.p === "aliases") v = v.split(",").map((s) => s.trim()).filter(Boolean);
        if (el.dataset.p === "simplified") v = v.split("\n").map((s) => s.trim()).filter(Boolean);
        setPath(d, el.dataset.p, v);
      });
      if (d.target.labels && d.target.labels.ligand) d.target.labels.antigen = d.target.labels.ligand;
      d.id = norm(d.name) || d.id;
      ["journey", "mechanism", "facts", "sources"].forEach((k) => (d[k] = readRows(k)));
      d.mechanism = d.mechanism.filter((m) => m.title || m.text).slice(0, 4);
      return d;
    }
    function preview() {
      clearTimeout(timer);
      timer = setTimeout(() => {
        read();
        stepKeep = view._rx ? Math.min(stepKeepIdx(), 99) : 0;
        show(d, { fromEditor: true, step: stepKeep });
      }, 250);
    }
    const stepKeepIdx = () => { const b = view.querySelector('[aria-current="step"]'); return b ? +b.dataset.step : 0; };

    form.addEventListener("input", preview);
    form.addEventListener("change", preview);
    form.addEventListener("click", (e) => {
      const b = e.target.closest("button");
      if (!b) return;
      if (b.dataset.add) { read(); const k = b.dataset.add; d[k] = d[k] || []; d[k].push(k === "journey" ? { site: "blood", title: "", text: "" } : k === "sources" ? { text: "" } : {}); render(); return; }
      const row = b.closest(".rx-row"), listEl = b.closest("[data-list]");
      if (row && listEl) {
        read();
        const k = listEl.dataset.list, i = +row.dataset.i;
        if (b.hasAttribute("data-del")) d[k].splice(i, 1);
        else if (b.dataset.mv) { const j = i + +b.dataset.mv; if (j >= 0 && j < d[k].length) [d[k][i], d[k][j]] = [d[k][j], d[k][i]]; }
        render(); preview(); return;
      }
      if (b.id === "rx-route-go") {
        read();
        const route = $("#rx-route").value;
        const tgt = d.journey.find((j) => j.target);
        d.journey = journeyFor(route, d.modality, d.target.name, tgt ? RX.siteId(tgt.site) : "tissues", false).map((j) => ({ ...j, generic: undefined }));
        render(); preview(); return;
      }
      const status = $("#rx-ed-status");
      const act = b.dataset.ed;
      if (!act) return;
      read();
      const json = JSON.stringify(clean(d), null, 2);
      if (act === "save") { local[d.id] = clean(d); status.textContent = store.save(local) ? "Saved in this browser." : "This browser blocked local storage. Use Download JSON instead."; refreshLib(); }
      if (act === "download") { const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([json + "\n"], { type: "application/json" })); a.download = `${d.id}.json`; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000); status.textContent = `Downloaded ${d.id}.json.`; }
      if (act === "copy") {
        const fallback = () => {
          let ta = form.querySelector(".rx-json");
          if (!ta) { ta = document.createElement("textarea"); ta.className = "rx-json"; ta.rows = 8; ta.readOnly = true; ta.id = "rx-json-out"; b.parentElement.after(ta); }
          ta.value = json; ta.focus(); ta.select();
          status.textContent = "Clipboard blocked. The JSON is selected below; copy it with your keyboard.";
        };
        try { navigator.clipboard.writeText(json).then(() => (status.textContent = "Copied."), fallback); } catch { fallback(); }
      }
      if (act === "forget") { delete local[d.id]; store.save(local); refreshLib(); status.textContent = "Removed from this browser."; }
    });
    function clean(x) {
      const o = JSON.parse(JSON.stringify(x));
      delete o._local;
      ["journey", "mechanism", "facts"].forEach((k) => (o[k] || []).forEach((it) => { if (!it.cite || !it.cite.length) delete it.cite; delete it.generic; }));
      return o;
    }

    return {
      get open() { return box.open; },
      start(name) { d = blank(name); box.open = true; render(); show(d, { fromEditor: true }); box.scrollIntoView({ behavior: "smooth", block: "start" }); },
      fill(src) { d = JSON.parse(JSON.stringify(src)); delete d._local; render(); },
      boot() {
        $('[data-act="new"]').addEventListener("click", () => editor.start(q.value.trim() && !find(q.value) ? q.value.trim() : ""));
        box.addEventListener("toggle", () => { if (box.open && current && (!d || d.id !== current.id)) editor.fill(current); });
      },
    };
  })();
  editor.boot();

  /* ---------- theme and start ---------- */

  const themeBtn = $('[data-act="theme"]'), shell = document.querySelector(".iso"), html = document.documentElement;
  const hostTheme = () => (["light", "dark"].includes(html.dataset.theme) ? html.dataset.theme : null);
  const systemTheme = () => (matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark");
  const setTheme = (t, remember) => {
    shell.dataset.theme = t;
    themeBtn.textContent = t === "dark" ? "Light theme" : "Dark theme";
    if (remember) try { localStorage.setItem("anima-rx-theme", t); } catch {}
  };
  themeBtn.addEventListener("click", () => setTheme(shell.dataset.theme === "dark" ? "light" : "dark", true));
  let saved = null;
  try { saved = localStorage.getItem("anima-rx-theme"); } catch {}
  setTheme(hostTheme() || saved || shell.dataset.theme || systemTheme());
  new MutationObserver(() => { if (hostTheme()) setTheme(hostTheme()); }).observe(html, { attributes: true, attributeFilter: ["data-theme"] });
  matchMedia("(prefers-color-scheme: light)").addEventListener("change", () => { if (!hostTheme() && !saved) setTheme(systemTheme()); });

  refreshLib();
  const fromHash = decodeURIComponent(location.hash.slice(1));
  const first = (fromHash && find(fromHash)) || find(window.__RX_INITIAL__ || "") || BUNDLED[0];
  if (first) show(first);
  window.AnimaRxApp = { show, find, lookupPublic, editor, journeyFor };
})();
