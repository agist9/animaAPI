/* Anima Rx app: name + dosage form -> Go. Finds a dossier, or drafts one (Claude in the hosted page, the
   dosage-form template elsewhere, ChEMBL + PubChem on request), then opens the editor on whatever still needs
   the user's input. Needs render.js first. Bundled dossiers arrive as window.__RX_DOSSIERS__. */
(function () {
  "use strict";
  const RX = window.AnimaRx, esc = RX.esc;
  const BUNDLED = window.__RX_DOSSIERS__ || [];
  const HOSTED = !!window.__RX_HOSTED__;
  const KEY = "anima-rx-local-v1";
  const norm = (s) => String(s || "").toLowerCase().replace(/[\s\-_.()®™]/g, "");
  const $ = (q, el = document) => el.querySelector(q);
  const clone = (o) => JSON.parse(JSON.stringify(o));
  const store = {
    load() { try { return JSON.parse(localStorage.getItem(KEY) || "{}") || {}; } catch { return {}; } },
    save(v) { try { localStorage.setItem(KEY, JSON.stringify(v)); return true; } catch { return false; } },
  };
  let local = store.load();
  let current = null;
  let sample = null, downloads = null;

  const view = $("#rx-view"), msg = $("#rx-msg"), q = $("#rx-q"), formSel = $("#rx-form-sel"), list = $("#rx-list"), lib = $("#rx-lib"), engine = $("#rx-engine");

  /* ---------- dosage forms and the journeys they start ---------- */

  const FORMS = [
    ["Oral", [["Tablet", "oral"], ["Film-coated tablet", "oral"], ["Capsule", "oral"], ["Oral solution or suspension", "oral"], ["Orally disintegrating tablet", "oral"], ["Sublingual or buccal tablet", "sublingual"]]],
    ["Inhaled and nasal", [["Inhalation powder (DPI)", "inhaled"], ["Inhalation aerosol (MDI)", "inhaled"], ["Nebuliser solution", "inhaled"], ["Nasal spray", "nasal"]]],
    ["Injection", [["IV infusion", "iv"], ["IV injection (bolus)", "iv"], ["Subcutaneous injection", "subq"], ["Intramuscular injection", "im"], ["Intravitreal injection", "intravitreal"], ["Intrathecal injection", "intrathecal"]]],
    ["Skin, eye and other", [["Cream, ointment or gel", "topical"], ["Transdermal patch", "transdermal"], ["Eye drops", "ophthalmic"], ["Rectal suppository", "rectal"]]],
    ["Advanced therapies", [["Autologous cell suspension for infusion", "ex-vivo"], ["Allogeneic cell suspension for infusion", "allogeneic"], ["Gene therapy suspension for IV infusion", "gene-iv"], ["mRNA lipid nanoparticle injection", "mrna-im"]]],
  ];
  const ROUTE_OF = Object.fromEntries(FORMS.flatMap(([, items]) => items));
  const MODALITY_OF_ROUTE = { "ex-vivo": "cell-therapy", allogeneic: "cell-therapy", "gene-iv": "gene-therapy", "mrna-im": "mrna" };
  const SMALL_ROUTES = ["oral", "sublingual", "inhaled", "nasal", "topical", "transdermal", "ophthalmic", "rectal"];
  const LOCAL_SITE = { intravitreal: "eye", ophthalmic: "eye", topical: "skin", inhaled: "lungs", intrathecal: "spinal-cord" };
  const ROUTE_NAME = { oral: "oral", sublingual: "sublingual", inhaled: "inhaled", nasal: "nasal", iv: "intravenous", subq: "subcutaneous", im: "intramuscular", intravitreal: "intravitreal", intrathecal: "intrathecal", topical: "topical", transdermal: "transdermal", ophthalmic: "ophthalmic", rectal: "rectal", "ex-vivo": "autologous cell infusion", allogeneic: "allogeneic cell infusion", "gene-iv": "intravenous", "mrna-im": "intramuscular" };
  const formInfo = (label) => {
    const route = ROUTE_OF[label] || null;
    return { label, route, modality: MODALITY_OF_ROUTE[route] || null, localSite: LOCAL_SITE[route] || null };
  };

  const ROUTES = {
    oral: [
      ["mouth", "Swallowed", "Taken by mouth."],
      ["stomach", "Dissolves", "The dosage form disintegrates and the drug dissolves."],
      ["intestine", "Absorbed", "Most oral drugs are absorbed across the small-intestine wall into the portal blood."],
      ["liver", "First pass through the liver", "Portal blood passes through the liver before reaching the general circulation; some drugs are partly metabolised on this pass."],
      ["blood", "Distributed", "Carried in the blood, partly bound to plasma proteins; the unbound fraction reaches tissues."]],
    sublingual: [
      ["mouth", "Dissolves under the tongue", "Absorbed through the lining of the mouth straight into the blood, which bypasses first-pass metabolism in the liver."],
      ["blood", "Distributed", "Carried in the blood to the tissues."]],
    inhaled: [
      ["mouth", "Inhaled", "Breathed in as a powder, aerosol or mist."],
      ["lungs", "Deposits in the airways", "Acts on the airways; some crosses into the blood."]],
    nasal: [
      ["nose", "Sprayed into the nose", "Absorbed through the nasal lining; it may act locally or reach the blood."],
      ["blood", "Distributed", "Carried in the blood to the tissues."]],
    iv: [
      ["iv", "Infused into a vein", "Enters the bloodstream directly, with no absorption step."],
      ["blood", "Distributed", "Carried in the blood to the tissues."]],
    subq: [
      ["subq", "Injected under the skin", "Forms a depot in the tissue under the skin."],
      ["lymph-nodes", "Absorbed", "Small molecules enter capillaries; large molecules such as antibodies are absorbed slowly, largely through the lymphatic system."],
      ["blood", "Distributed", "Reaches the bloodstream and is carried to the tissues."]],
    im: [
      ["im", "Injected into muscle", "Absorbed from the muscle into nearby capillaries."],
      ["blood", "Distributed", "Carried in the blood to the tissues."]],
    intravitreal: [["eye", "Injected into the eye", "Delivered into the vitreous, so it acts locally; little reaches the rest of the body."]],
    intrathecal: [["spinal-cord", "Injected into the spinal fluid", "Delivered into the cerebrospinal fluid around the spinal cord, bypassing the blood–brain barrier."]],
    topical: [["skin", "Applied to the skin", "Acts locally in the skin; little reaches the blood."]],
    transdermal: [
      ["skin", "Patch on the skin", "Releases drug that crosses the skin slowly."],
      ["blood", "Absorbed into the blood", "Enters the blood without passing through the liver first."]],
    ophthalmic: [["eye", "Drops in the eye", "Acts on the surface and front of the eye; a little is absorbed into the blood."]],
    rectal: [
      ["intestine", "Inserted rectally", "Absorbed through the rectal lining; part of the blood draining the rectum bypasses the liver."],
      ["blood", "Distributed", "Carried in the blood to the tissues."]],
    "ex-vivo": [
      ["iv", "Cells are collected", "The patient’s own cells are collected, for example by leukapheresis."],
      ["ex-vivo", "Engineered outside the body", "The cells are modified, expanded and formulated at the manufacturing site."],
      ["iv", "Infused back", "The modified cells are returned by intravenous infusion."],
      ["blood", "Expand in the body", "The cells multiply after infusion."]],
    allogeneic: [
      ["ex-vivo", "Donor cells are engineered", "Cells from a healthy donor are modified, expanded and formulated at the manufacturing site."],
      ["iv", "Infused", "The cells are given by intravenous infusion."],
      ["blood", "Expand in the body", "The cells multiply after infusion."]],
    "gene-iv": [
      ["iv", "Infused into a vein", "The vector enters the bloodstream directly."],
      ["blood", "Carried in the blood", "The vector circulates and reaches tissues its capsid can enter."]],
    "mrna-im": [
      ["im", "Injected into muscle", "Lipid nanoparticles are taken up by cells at the injection site."],
      ["lymph-nodes", "Drains to lymph nodes", "Some particles and antigen-presenting cells travel to nearby lymph nodes."]],
  };
  const CLEAR = {
    small: [["liver", "Metabolised", "Small molecules are typically metabolised in the liver, often by CYP enzymes."], ["kidneys", "Filtered", "Drug and metabolites are filtered by the kidneys."], ["bladder", "Excreted", "Some leaves in the urine; some leaves in bile and feces."]],
    big: [["tissues", "Broken down like other proteins", "Proteins and antibodies are cleared by catabolism throughout the body, not by CYP enzymes."]],
  };
  const isBig = (m) => ["antibody", "protein", "peptide"].includes(m);
  function journeyFor(route, modality, targetName, targetSite, generic = true) {
    const site = targetSite || LOCAL_SITE[route] || "tissues";
    const pre = (ROUTES[route] || ROUTES.iv).map(([s, title, text]) => ({ site: s, title, text, generic }));
    if (LOCAL_SITE[route] && pre[pre.length - 1].site === site) {
      pre[pre.length - 1].target = true;
      return pre;
    }
    const tgt = { site, title: `Reaches ${targetName || "its target"}`, text: `Distributes to the tissue where ${targetName || "the target"} is found.`, generic, target: true };
    const post = ["cell-therapy", "gene-therapy", "mrna"].includes(modality) ? [] : (isBig(modality) ? CLEAR.big : CLEAR.small).map(([s, title, text]) => ({ site: s, title, text, generic }));
    return [...pre, tgt, ...post];
  }
  /* Keep a curated dossier's target and later steps, and redraw only how the drug gets in. */
  function reroute(d, route) {
    const at = d.journey.findIndex((j) => j.target);
    const tail = at >= 0 ? d.journey.slice(at) : [];
    const pre = (ROUTES[route] || []).map(([site, title, text]) => ({ site, title, text, generic: true }));
    const shift = pre.length - Math.max(0, at);
    d.journey = [...pre, ...tail];
    d.needs = (d.needs || []).map((n) => ({ ...n, path: String(n.path).replace(/^journey\[(\d+)\]/, (_, i) => `journey[${+i + shift}]`) }));
    d.route = route;
    d.simplified = [...(d.simplified || []), `The entry steps were redrawn for the ${ROUTE_NAME[route]} route you chose; they describe the route in general, not this product.`];
    return d;
  }

  /* ---------- library and display ---------- */

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
    current = clone(d);
    delete current._local;
    if (!opts.keepMsg) say("");
    RX.mount(view, current, opts);
    q.value = current.name;
    if (current.dosageForm && ROUTE_OF[current.dosageForm]) formSel.value = current.dosageForm;
    document.title = `${current.name} · Anima Rx`;
    try { if (!current.confidential && !current.draft) history.replaceState(null, "", `#${encodeURIComponent(current.id)}`); else history.replaceState(null, "", location.pathname + location.search); } catch {}
    if (!opts.fromEditor && (editor.open || (current.needs || []).some((n) => n.required))) editor.fill(current, (current.needs || []).some((n) => n.required));
  }
  view.addEventListener("rx-need", (e) => editor.focusNeed(e.detail.path));

  const looksInternal = (s) => /^[a-z]{1,6}[-\s]?\d{2,}[a-z0-9-]*$/i.test(String(s).trim());

  /* ---------- Go ---------- */

  let busy = null;
  $("#rx-search").addEventListener("submit", (e) => { e.preventDefault(); go(q.value.trim(), formSel.value); });
  async function go(name, formLabel) {
    if (!name) { q.focus(); return; }
    if (busy) busy.abort();
    const f = formInfo(formLabel);
    const hit = find(name);
    if (hit) {
      const d = clone(hit);
      delete d._local;
      if (formLabel) {
        d.dosageForm = formLabel;
        if (f.route && d.route && f.route !== d.route && ROUTES[f.route] && !f.modality) {
          reroute(d, f.route);
          say(`<p><b>This dossier describes ${esc(d.name)} by the ${esc(ROUTE_NAME[hit.route] || hit.route)} route.</b> You chose ${esc(formLabel)}, so the entry steps were redrawn for that route, marked “typical”. Everything from the target on is unchanged.</p>`, "rx-msg-warn");
          show(d, { keepMsg: true });
          return;
        }
      }
      show(d);
      return;
    }
    if (!formLabel) {
      say(`<p><b>Choose a dosage form for “${esc(name)}”.</b> It decides how the drug gets into the body, which is the first half of the flow.</p>`, "rx-msg-warn");
      formSel.focus();
      return;
    }
    if (sample) return draftWithClaude(name, formLabel);
    const d = templateDraft(name, formLabel);
    show(d, { keepMsg: true });
    say(`<p>${HOSTED ? "Claude drafting is not available in this view." : "This copy of the page cannot ask Claude to draft it. Use the hosted page for that, or fill what public databases know."}</p>
<div class="rx-msg-actions">${HOSTED ? "" : `<button type="button" data-act="public">Fill from ChEMBL + PubChem</button>`}<button type="button" data-act="edit">Fill in the highlighted fields</button></div>
${HOSTED ? "" : `<p class="rx-small">ChEMBL + PubChem receive the text “${esc(name)}”.${looksInternal(name) ? " <b>It looks like an internal code: check your confidentiality policy before you send it to a third party.</b>" : ""}</p>`}`, looksInternal(name) ? "rx-msg-warn" : "");
    const pub = msg.querySelector('[data-act="public"]');
    if (pub) pub.onclick = () => lookupPublic(name, formLabel);
    msg.querySelector('[data-act="edit"]').onclick = () => editor.fill(current, true);
  }

  function templateDraft(name, formLabel) {
    const f = formInfo(formLabel);
    const modality = f.modality || (SMALL_ROUTES.includes(f.route) ? "small-molecule" : "small-molecule");
    const journey = journeyFor(f.route, modality, "", f.localSite, true);
    const at = journey.findIndex((j) => j.target);
    const needs = [
      ...(!f.modality && !SMALL_ROUTES.includes(f.route) ? [{ path: "modality", label: "Modality", why: "An injection could hold a small molecule, peptide, protein or antibody.", required: true }] : []),
      { path: "target.name", label: "Target", why: "The molecule the drug acts on, for example KIT D816V or the GLP-1 receptor.", required: true },
      { path: "target.class", label: "Mechanism type", why: "Picks the cell scene: receptor, kinase, channel, transporter and so on.", required: true },
      { path: "target.action", label: "Action", why: "Inhibitor, agonist, antagonist, blocker…", required: true },
      ...(f.localSite ? [] : [{ path: `journey[${at}].site`, label: "Target tissue", why: "Where the target cells are, for example bone marrow or tumour.", required: true }]),
      { path: "mechanism", label: "Drug-specific mechanism steps", why: "The scene shows generic text until you add them.", required: false },
      { path: "fact:Elimination half-life", label: "Elimination half-life", why: "With units, population and source.", required: false },
      { path: "sources", label: "Sources", why: "Cite where each statement comes from.", required: false },
    ];
    return {
      id: norm(name), name, aliases: [name], modality, route: f.route, dosageForm: formLabel, status: looksInternal(name) ? "Investigational (internal)" : "",
      confidential: looksInternal(name), draft: "template", summary: "",
      target: { name: "", short: "", class: "", action: modality === "cell-therapy" ? "cytotoxic" : modality === "gene-therapy" || modality === "mrna" ? "expression" : "inhibitor", cell: "", labels: {} },
      binding: !["cell-therapy", "gene-therapy", "mrna"].includes(modality), journey, mechanism: [], facts: [], needs,
      simplified: ["The body journey is the general template for this dosage form and modality, not this drug’s measured pharmacokinetics."], sources: [],
    };
  }

  /* ---------- Claude drafting (hosted page only) ---------- */

  const SCENES = Object.keys(RX.SCENE_NAMES);
  const SITES = Object.keys(RX.SITES);
  function promptFor(name, formLabel, f) {
    const tmpl = journeyFor(f.route, f.modality || "small-molecule", "", f.localSite, true);
    return `You are drafting an educational "mechanism dossier" that drives an animated figure of a drug moving through the body and acting at its target. The reader is a GMP technical writer in pharmaceutical manufacturing. Fill in as much as you can judge yourself; flag only what you cannot.

Drug name or code typed by the user: ${JSON.stringify(name)}
Dosage form chosen by the user: ${JSON.stringify(formLabel)} (route: ${ROUTE_NAME[f.route] || "unknown"})

Rules:
1. Identify the compound. If the name is a development code you do not recognise with confidence, set "recognized": false. Then do NOT guess its target or mechanism from the code's prefix or the company. Fill only what the dosage form and route tell you, and flag the target, mechanism type, action and target tissue as required needs.
2. Never include doses, strengths, schedules, regimens or recommendations.
3. A number may appear only if you can name the specific source it comes from (a product label section, or a paper with authors, journal and year). If you cannot, leave the number out and add a need for it.
4. Write plain, specific sentences of 1 to 3 lines each. Mark any step that describes the drug class rather than this drug with "generic": true.
5. Start the journey from this template for the chosen dosage form, adapting the text to this drug where you know better: ${JSON.stringify(tmpl.map(({ site, title, text, target }) => ({ site, title, text, ...(target ? { target } : {}) })))}
   Then add the target step (exactly one step with "target": true) and the metabolism and elimination steps. Use 5 to 10 steps. Allowed sites: ${SITES.join(", ")}.
6. Mechanism: exactly 4 beats at the target cell, in order: reaching the target, binding, the immediate effect, the cell's response.
7. target.class must be one of: ${SCENES.join(", ")} ("rtk" means a receptor tyrosine kinase, a membrane receptor with an intracellular kinase domain; "enzyme" means a cytoplasmic enzyme or kinase). target.action is a word such as inhibitor, antagonist, agonist, blocker, opener, neutraliser, cytotoxic, T-cell engager, expression or knockdown.
8. Sources: full citation text. Give a "url" only in one of these two forms, which always work: https://dailymed.nlm.nih.gov/dailymed/search.cfm?labeltype=all&query=<BRAND_OR_INN> for a US label, or https://pubmed.ncbi.nlm.nih.gov/?term=<first+author+key+words+year> for a paper. Never invent a DOI or any other URL.
9. "needs" lists only what you could not judge: each item has "path" (for example "target.name", "journey[3].text", "mechanism", "modality", "sources", or "fact:<Label>" for a fact you would want but cannot source), "label" (a few words), "why" (one short sentence) and "required" (true only for the target, mechanism type, action, target tissue or modality, and only when you do not know them).

Reply with only one JSON object of this shape:
{"recognized": true, "name": "INN or the code", "aliases": ["codes, brand names"], "modality": "small-molecule|antibody|protein|peptide|oligonucleotide|mrna|gene-therapy|cell-therapy", "status": "e.g. Approved (US) or Phase 3", "summary": "two sentences",
 "target": {"name": "", "short": "label of at most 14 characters", "class": "", "action": "", "cell": "target cell or tissue", "labels": {}},
 "journey": [{"site": "", "title": "", "text": "", "cite": [1], "generic": false, "target": false}],
 "mechanism": [{"title": "", "text": "", "cite": [1]}],
 "facts": [{"label": "", "value": "value with units, population and conditions", "cite": [1]}],
 "simplified": ["what the figure leaves out"],
 "sources": [{"id": 1, "text": "", "url": ""}],
 "needs": [{"path": "", "label": "", "why": "", "required": false}]}`;
  }

  function normalize(raw, typed, formLabel, f) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw { code: "invalid_json" };
    const str = (v) => (typeof v === "string" ? v.trim() : "");
    const MODS = ["small-molecule", "antibody", "protein", "peptide", "oligonucleotide", "mrna", "gene-therapy", "cell-therapy"];
    const sources = (Array.isArray(raw.sources) ? raw.sources : []).map((s, i) => ({ id: Number(s.id) || i + 1, text: str(s.text), url: /^https:\/\/(dailymed\.nlm\.nih\.gov|pubmed\.ncbi\.nlm\.nih\.gov)\//.test(str(s.url)) ? str(s.url) : undefined })).filter((s) => s.text);
    const ids = new Set(sources.map((s) => s.id));
    const cite = (c) => (Array.isArray(c) ? c.map(Number).filter((n) => ids.has(n)) : []);
    let journey = (Array.isArray(raw.journey) ? raw.journey : []).map((j) => ({ site: RX.siteId(str(j.site) || "tissues"), title: str(j.title), text: str(j.text), cite: cite(j.cite), generic: !!j.generic, ...(j.target ? { target: true } : {}) })).filter((j) => j.title || j.text);
    const modality = MODS.includes(raw.modality) ? raw.modality : f.modality || "small-molecule";
    if (!journey.length) journey = journeyFor(f.route, modality, "", f.localSite, true);
    let seen = false;
    journey.forEach((j) => { if (j.target) { if (seen) delete j.target; seen = true; } });
    if (!seen) journey[Math.min(journey.length - 1, (ROUTES[f.route] || []).length)].target = true;
    const t = raw.target && typeof raw.target === "object" ? raw.target : {};
    const name = str(raw.name) || typed;
    const aliases = [...new Set([typed, ...(Array.isArray(raw.aliases) ? raw.aliases.map(str) : [])].filter((a) => a && norm(a) !== norm(name)))];
    const needs = (Array.isArray(raw.needs) ? raw.needs : []).map((n) => ({ path: str(n.path), label: str(n.label), why: str(n.why), required: !!n.required })).filter((n) => n.path && n.label);
    return {
      id: norm(name), name, aliases, modality, route: f.route, dosageForm: formLabel, status: str(raw.status), draft: "claude",
      confidential: raw.recognized === false && looksInternal(typed),
      summary: str(raw.summary),
      target: { name: str(t.name), short: str(t.short).slice(0, 18) || str(t.name).slice(0, 18), class: SCENES.includes(t.class) ? t.class : "", action: str(t.action), cell: str(t.cell), labels: t.labels && typeof t.labels === "object" ? t.labels : {} },
      binding: !["cell-therapy", "gene-therapy", "oligonucleotide", "mrna"].includes(modality),
      journey,
      mechanism: (Array.isArray(raw.mechanism) ? raw.mechanism : []).slice(0, 4).map((m) => ({ title: str(m.title), text: str(m.text), cite: cite(m.cite), generic: !!m.generic })).filter((m) => m.title || m.text),
      facts: (Array.isArray(raw.facts) ? raw.facts : []).map((x) => ({ label: str(x.label), value: str(x.value), cite: cite(x.cite) })).filter((x) => x.label && x.value),
      simplified: [...(Array.isArray(raw.simplified) ? raw.simplified.map(str).filter(Boolean) : []), "Drafted by Claude from its own knowledge, without looking anything up."],
      sources, needs,
    };
  }

  const SAMPLE_COPY = {
    not_granted: "Claude drafting was not allowed for this page, so the template was used instead.",
    sampling_disabled: "Claude is not available for this account, so the template was used instead.",
    rate_limited: "Too many requests to Claude just now. Wait a minute, then press Go again.",
    session_expired: "Your Claude session has expired. Sign in again, then press Go.",
    invalid_json: "Claude’s reply could not be read as a dossier. Press Go to try again.",
    refused: "Claude declined to draft this one. The template was used instead.",
    empty_completion: "Claude returned nothing. The template was used instead.",
  };
  async function draftWithClaude(name, formLabel) {
    const f = formInfo(formLabel);
    const ctl = new AbortController();
    busy = ctl;
    const t0 = Date.now();
    say(`<p><b>Claude is drafting “${esc(name)}” as ${esc(formLabel)}…</b> <span id="rx-progress">Thinking. This usually takes 30 to 90 seconds.</span></p><div class="rx-msg-actions"><button type="button" data-act="stop">Stop</button></div><p class="rx-small">The name and dosage form go to Claude on your account. Nothing else on this page is sent.${looksInternal(name) ? " <b>If this is an unpublished internal code, check your confidentiality policy first.</b>" : ""}</p>`);
    msg.querySelector('[data-act="stop"]').onclick = () => ctl.abort();
    const prog = () => $("#rx-progress");
    try {
      const raw = await sample.json(promptFor(name, formLabel, f), {
        modelTier: "complex", signal: ctl.signal,
        onText: ({ text }) => { const p = prog(); if (p) p.textContent = `Writing the dossier… ${text.length.toLocaleString()} characters so far.`; },
      });
      const d = normalize(raw, name, formLabel, f);
      local[d.id] = d; store.save(local); refreshLib();
      show(d);
      const req = d.needs.filter((n) => n.required).length;
      say(`<p><b>Drafted in ${Math.round((Date.now() - t0) / 1000)} s.</b> ${req ? `${req} required field${req > 1 ? "s" : ""} need${req > 1 ? "" : "s"} your input; they are highlighted in the editor below.` : "Nothing required is missing."} The draft is saved in this browser. Check it against your sources before you use it.</p>`);
      if (req) editor.fill(current, true);
    } catch (e) {
      if (e && e.code === "cancelled") { say(`<p>Stopped. Press Go to draft again.</p>`); return; }
      const fallback = ["not_granted", "sampling_disabled", "refused", "empty_completion", "capability_disabled", "capability_removed", "not_declared"].includes(e && e.code);
      if (["not_granted", "sampling_disabled", "capability_disabled", "capability_removed", "not_declared"].includes(e && e.code)) { sample = null; refreshEngine(); }
      if (fallback) { show(templateDraft(name, formLabel), { keepMsg: true }); editor.fill(current, true); }
      say(`<p><b>${esc(SAMPLE_COPY[e && e.code] || "Claude could not finish the draft. Press Go to try again.")}</b></p>`, "rx-msg-err");
    } finally {
      if (busy === ctl) busy = null;
    }
  }

  function refreshEngine() {
    engine.textContent = sample ? "Unknown names are drafted by Claude, then checked by you." : HOSTED ? "Unknown names start from the dosage-form template." : "Unknown names start from the dosage-form template; ChEMBL and PubChem can fill more.";
  }

  /* ---------- files ---------- */

  const fileIn = $("#rx-file");
  $('[data-act="open"]').addEventListener("click", () => fileIn.click());
  async function openFile(f) {
    try {
      const d = validate(JSON.parse(await f.text()));
      local[d.id] = d; store.save(local); refreshLib(); show(d);
    } catch (err) { say(`<p><b>Could not open that file.</b> ${esc(err.message)}</p>`, "rx-msg-err"); }
  }
  fileIn.addEventListener("change", () => { const f = fileIn.files && fileIn.files[0]; fileIn.value = ""; if (f) openFile(f); });
  document.addEventListener("dragover", (e) => { if (e.dataTransfer && [...e.dataTransfer.types].includes("Files")) e.preventDefault(); });
  document.addEventListener("drop", (e) => {
    const f = e.dataTransfer && e.dataTransfer.files[0];
    if (!f || !/json/i.test(f.type + f.name)) return;
    e.preventDefault();
    openFile(f);
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

  /* ---------- public lookup (local file only) ---------- */

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
    if (/receptor (protein-)?tyrosine kinase|stem cell growth factor receptor|\bkit\b|egfr|erbb|pdgfr|vegfr|fgfr|\bmet\b|\bret\b|\balk\b/.test(t) && modality === "small-molecule") return "rtk";
    if (/receptor/.test(t)) return "receptor";
    if (isBig(modality) && /tumou?r necrosis factor|interleukin|\bil-?\d|cytokine|vegf|immunoglobulin e|complement|tslp|interferon|rankl|sclerostin|pcsk9/.test(t)) return "ligand";
    if (/kinase|ase\b|ase |cyclooxygenase|synthase|protease|polymerase|reductase|inhibitor/.test(t)) return "enzyme";
    return isBig(modality) ? "receptor" : "enzyme";
  }
  async function lookupPublic(term, formLabel) {
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
      const f = formInfo(formLabel);
      const route = f.route || (mol.oral ? "oral" : mol.parenteral ? "iv" : mol.topical ? "topical" : modality === "cell-therapy" ? "ex-vivo" : isBig(modality) ? "iv" : "oral");
      const name = mol.pref_name ? mol.pref_name.charAt(0) + mol.pref_name.slice(1).toLowerCase() : term;
      const sources = [{ id: 1, text: `ChEMBL compound report card ${id}${parent !== id ? ` (parent ${parent})` : ""}, EMBL-EBI.`, url: `https://www.ebi.ac.uk/chembl/compound_report_card/${parent}/` }];
      if (pc) sources.push({ id: 2, text: `PubChem compound CID ${pc.CID}, NCBI.`, url: `https://pubchem.ncbi.nlm.nih.gov/compound/${pc.CID}` });
      const refs = [];
      mech.forEach((m) => (m.mechanism_refs || []).forEach((r) => { if (r.ref_url && refs.length < 4 && !refs.some((x) => x.url === r.ref_url)) refs.push({ text: `${r.ref_type}: ${r.ref_id} (cited by ChEMBL for the mechanism)`, url: r.ref_url }); }));
      refs.forEach((r) => sources.push({ id: sources.length + 1, ...r }));
      const mechCite = refs.length ? refs.map((_, i) => sources.length - refs.length + i + 1) : [1];
      const inds = ind.slice().sort((a, b) => (+b.max_phase_for_ind || 0) - (+a.max_phase_for_ind || 0)).map((x) => x.efo_term || x.mesh_heading).filter((v, i, a) => v && a.indexOf(v) === i).slice(0, 4);
      const phase = mol.max_phase != null ? `${+mol.max_phase === 4 ? "Approved (max phase 4)" : `Max phase ${+mol.max_phase}`}` : "Unknown";
      const journey = journeyFor(route, modality, tName, f.localSite, true);
      const at = journey.findIndex((j) => j.target);
      const d = {
        id: norm(name), name, aliases: [term], modality, route, dosageForm: formLabel || undefined, status: phase, draft: "public",
        summary: `${moa || "Mechanism not recorded in ChEMBL"}. Drafted automatically from ChEMBL${pc ? " and PubChem" : ""}.`,
        target: { name: tName, short, class: cls, action: String(m0.action_type || (cls === "car" ? "cytotoxic" : "inhibitor")).toLowerCase(), cell: `cell carrying ${tName}`, labels: cls === "checkpoint" && /l1|ligand/i.test(tName) ? { blocks: "ligand", receptor: "PD-1", ligand: "PD-L1" } : {} },
        binding: !["car", "gene", "oligo"].includes(cls),
        journey, mechanism: [],
        facts: [
          { label: "Mechanism (ChEMBL)", value: mech.length ? mech.map((m) => `${m.mechanism_of_action} (${String(m.action_type || "").toLowerCase()})`).join("; ") : "not recorded", cite: mechCite },
          { label: "Molecule type", value: mol.molecule_type || "unknown", cite: [1] },
          { label: "Development stage", value: `${phase}${mol.first_approval ? `, first approved ${mol.first_approval}` : ""}`, cite: [1] },
          ...(pc ? [{ label: "Formula · molecular weight", value: `${pc.MolecularFormula} · ${pc.MolecularWeight} g/mol`, cite: [2] }] : []),
          ...(inds.length ? [{ label: "Indications studied (top)", value: inds.join("; "), cite: [1] }] : []),
        ],
        needs: [
          ...(LOCAL_SITE[route] ? [] : [{ path: `journey[${at}].site`, label: "Target tissue", why: "ChEMBL names the target but not where in the body it acts.", required: true }]),
          { path: "mechanism", label: "Drug-specific mechanism steps", why: "The scene shows generic text until you add them.", required: false },
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
      say(`<p><b>Public lookup failed.</b> ${esc(err.message)}</p><p class="rx-small">If you opened this page from a sandbox or a locked-down network, the request may be blocked. The template draft and the editor still work.</p>`, "rx-msg-err");
    }
  }

  /* ---------- editor ---------- */

  const editor = (() => {
    const box = $("#rx-edit"), form = $("#rx-form");
    let d = null, timer = 0;
    const touched = new Set();
    const MODS = ["small-molecule", "antibody", "protein", "peptide", "oligonucleotide", "mrna", "gene-therapy", "cell-therapy"];
    const ACTIONS = ["inhibitor", "antagonist", "agonist", "blocker", "opener", "positive modulator", "neutraliser", "cytotoxic", "T-cell engager", "expression", "knockdown"];
    const siteOpts = Object.entries(RX.SITES).map(([k, v]) => `<option value="${k}">${esc(v.label)}</option>`).join("");
    const formOpts = (v) => `<option value="">Not set</option>` + FORMS.map(([g, items]) => `<optgroup label="${esc(g)}">${items.map(([l]) => `<option${l === v ? " selected" : ""}>${esc(l)}</option>`).join("")}</optgroup>`).join("");
    const opt = (list, v) => list.map((o) => `<option${o === v ? " selected" : ""}>${esc(o)}</option>`).join("");
    const field = (label, inner, wide) => `<label class="rx-f${wide ? " rx-f-wide" : ""}"><span>${label}</span>${inner}</label>`;
    const nums = (s) => String(s || "").split(/[^\d]+/).filter(Boolean).map(Number);
    const rowBtns = `<span class="rx-row-btns"><button type="button" data-mv="-1" aria-label="Move up">↑</button><button type="button" data-mv="1" aria-label="Move down">↓</button><button type="button" data-del aria-label="Remove">✕</button></span>`;

    function rowsHtml(kind, items) {
      const r = (it, i) => {
        if (kind === "journey") return `<div class="rx-row" data-i="${i}"><select data-f="site" aria-label="Body site">${siteOpts.replace(`value="${RX.siteId(it.site)}"`, `value="${RX.siteId(it.site)}" selected`)}</select><input data-f="title" placeholder="Step title" value="${esc(it.title)}"><textarea data-f="text" rows="2" placeholder="What happens here (numbers only with a source)">${esc(it.text)}</textarea><input data-f="cite" class="rx-cite-in" placeholder="src #" value="${esc((it.cite || []).join(","))}"><label class="rx-tgt"><input type="radio" name="rx-target" data-f="target"${it.target ? " checked" : ""}> target</label>${rowBtns}</div>`;
        if (kind === "mechanism") return `<div class="rx-row" data-i="${i}"><input data-f="title" placeholder="Beat ${i + 1} title" value="${esc(it.title)}"><textarea data-f="text" rows="2" placeholder="What happens at the target">${esc(it.text)}</textarea><input data-f="cite" class="rx-cite-in" placeholder="src #" value="${esc((it.cite || []).join(","))}">${rowBtns}</div>`;
        if (kind === "facts") return `<div class="rx-row" data-i="${i}"><input data-f="label" placeholder="Label, e.g. Half-life" value="${esc(it.label)}"><input data-f="value" placeholder="Value with units and conditions" value="${esc(it.value)}"><input data-f="cite" class="rx-cite-in" placeholder="src #" value="${esc((it.cite || []).join(","))}">${rowBtns}</div>`;
        return `<div class="rx-row" data-i="${i}"><span class="rx-src-n">${i + 1}</span><input data-f="text" placeholder="Document, section, version (e.g. IB ed. 4, §5.3)" value="${esc(it.text)}"><input data-f="url" placeholder="Link (optional)" value="${esc(it.url || "")}">${rowBtns}</div>`;
      };
      return items.map(r).join("") + `<button type="button" class="rx-add" data-add="${kind}">+ Add ${kind === "journey" ? "body step" : kind === "mechanism" ? "mechanism beat" : kind === "facts" ? "fact" : "source"}</button>`;
    }

    function render() {
      (d.needs || []).forEach((n) => { const m = /^fact:(.+)$/.exec(n.path); if (m && !(d.facts || []).some((f) => f.label === m[1])) (d.facts = d.facts || []).push({ label: m[1], value: "" }); });
      const t = d.target, L = t.labels || {};
      form.innerHTML = `
<p class="rx-small">Everything you type here stays in this browser. <b>Save on this device</b> keeps it in local browser storage; <b>${downloads || !HOSTED ? "Download JSON" : "Copy JSON"}</b> gives you a copy for your controlled document system or <code>rx/private/</code>. <span class="rx-key"><i class="rx-req"></i> needs your input</span> <span class="rx-key"><i></i> optional, add if you have it</span></p>
<fieldset><legend>Identity</legend><div class="rx-grid">
${field("Name or code", `<input id="rx-ed-name" data-p="name" value="${esc(d.name)}">`)}
${field("Aliases (comma-separated)", `<input id="rx-ed-aliases" data-p="aliases" value="${esc((d.aliases || []).join(", "))}">`)}
${field("Dosage form", `<select id="rx-ed-form" data-p="dosageForm">${formOpts(d.dosageForm)}</select>`)}
${field("Modality", `<select id="rx-ed-modality" data-p="modality">${opt(MODS, d.modality)}</select>`)}
${field("Status", `<input id="rx-ed-status" data-p="status" value="${esc(d.status || "")}">`)}
${field("Summary (one or two sentences)", `<textarea id="rx-ed-summary" data-p="summary" rows="2">${esc(d.summary || "")}</textarea>`, true)}
<label class="rx-check"><input type="checkbox" id="rx-ed-conf" data-p="confidential"${d.confidential ? " checked" : ""}> Confidential (shows a banner and never puts the name in the address bar)</label>
</div></fieldset>
<fieldset><legend>Target and mechanism scene</legend><div class="rx-grid">
${field("Target", `<input id="rx-ed-tname" data-p="target.name" placeholder="e.g. KIT D816V kinase" value="${esc(t.name || "")}">`)}
${field("Short label", `<input id="rx-ed-tshort" data-p="target.short" placeholder="e.g. KIT" value="${esc(t.short || "")}">`)}
${field("Mechanism type (scene)", `<select id="rx-ed-tclass" data-p="target.class"><option value="">auto (from modality)</option>${Object.entries(RX.SCENE_NAMES).map(([k, v]) => `<option value="${k}"${t.class === k ? " selected" : ""}>${esc(v)}</option>`).join("")}</select>`)}
${field("Action", `<input id="rx-ed-taction" data-p="target.action" list="rx-actions" value="${esc(t.action || "")}"><datalist id="rx-actions">${ACTIONS.map((a) => `<option value="${a}">`).join("")}</datalist>`)}
${field("Target cell or tissue", `<input id="rx-ed-tcell" data-p="target.cell" placeholder="e.g. Mast cell" value="${esc(t.cell || "")}">`)}
${field("Vector (gene therapy)", `<input id="rx-ed-tvector" data-p="target.vector" placeholder="AAV, lentivirus, LNP" value="${esc(t.vector || "")}">`)}
${field("Ligand / antigen label", `<input id="rx-ed-lig" data-p="target.labels.ligand" value="${esc(L.ligand || L.antigen || "")}">`)}
${field("Effector cell label", `<input id="rx-ed-eff" data-p="target.labels.effector" value="${esc(L.effector || "")}">`)}
${field("Target cell label", `<input id="rx-ed-tgt" data-p="target.labels.target" value="${esc(L.target || "")}">`)}
${field("Protein made (gene therapy)", `<input id="rx-ed-prot" data-p="target.labels.protein" value="${esc(L.protein || "")}">`)}
<label class="rx-check"><input type="checkbox" id="rx-ed-binding" data-p="binding"${d.binding !== false ? " checked" : ""}> Show the binding-occupancy slider</label>
</div></fieldset>
<fieldset data-sec="journey"><legend>Journey through the body</legend>
<div class="rx-inline"><select id="rx-route" aria-label="Dosage form template">${FORMS.map(([g, items]) => `<optgroup label="${esc(g)}">${items.map(([l]) => `<option${l === d.dosageForm ? " selected" : ""}>${esc(l)}</option>`).join("")}</optgroup>`).join("")}</select><button type="button" id="rx-route-go">Replace the journey with this dosage form’s template</button></div>
<div class="rx-rows" data-list="journey">${rowsHtml("journey", d.journey)}</div></fieldset>
<fieldset data-sec="mechanism"><legend>Mechanism at the target (up to four beats; leave empty to use the scene’s default text)</legend><div class="rx-rows" data-list="mechanism">${rowsHtml("mechanism", d.mechanism)}</div></fieldset>
<fieldset data-sec="facts"><legend>Key facts</legend><div class="rx-rows" data-list="facts">${rowsHtml("facts", d.facts || [])}</div></fieldset>
<fieldset data-sec="sources"><legend>Sources (cite them by number above)</legend><div class="rx-rows" data-list="sources">${rowsHtml("sources", d.sources || [])}</div></fieldset>
<fieldset><legend>What is simplified (one per line)</legend><textarea id="rx-ed-simpl" data-p="simplified" rows="3">${esc((d.simplified || []).join("\n"))}</textarea></fieldset>
<div class="rx-inline rx-edit-actions"><button type="button" data-ed="save">Save on this device</button>${downloads || !HOSTED ? `<button type="button" data-ed="download">Download JSON</button>` : ""}<button type="button" data-ed="copy">Copy JSON</button><button type="button" data-ed="forget">Remove from this device</button><span class="rx-small" id="rx-ed-status" role="status"></span></div>`;
      mark();
    }

    /* The element a need points at, so it can be highlighted and focused. */
    function target(path) {
      let m;
      if ((m = /^(journey|mechanism|facts)\[(\d+)\](?:\.(\w+))?$/.exec(path))) {
        const row = form.querySelector(`[data-list="${m[1]}"] .rx-row[data-i="${m[2]}"]`);
        return row && (row.querySelector(`[data-f="${m[3] || (m[1] === "facts" ? "value" : "text")}"]`) || row);
      }
      if ((m = /^fact:(.+)$/.exec(path))) {
        const i = (d.facts || []).findIndex((f) => f.label === m[1]);
        const row = form.querySelector(`[data-list="facts"] .rx-row[data-i="${i}"]`);
        return row && row.querySelector('[data-f="value"]');
      }
      if (["mechanism", "sources", "journey", "facts"].includes(path)) return form.querySelector(`[data-sec="${path}"]`);
      return form.querySelector(`[data-p="${path}"]`);
    }
    function mark() {
      form.querySelectorAll(".rx-need, .rx-need-opt").forEach((el) => el.classList.remove("rx-need", "rx-need-opt"));
      form.querySelectorAll(".rx-need-note").forEach((el) => el.remove());
      (d.needs || []).forEach((n) => {
        const el = target(n.path);
        if (!el) return;
        el.classList.add(n.required ? "rx-need" : "rx-need-opt");
        const note = document.createElement("span");
        note.className = `rx-need-note${n.required ? " rx-req" : ""}`;
        note.textContent = `${n.required ? "Needs your input" : "Optional"}: ${n.why || n.label}`;
        (el.tagName === "FIELDSET" ? el.querySelector("legend") : el).after(note);
      });
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
        const was = (d[kind] || [])[i] || {};
        if (kind === "journey") return { site: get("site"), title: get("title"), text: get("text"), cite: nums(get("cite")), ...(was.generic ? { generic: true } : {}), ...(get("target") ? { target: true } : {}) };
        if (kind === "mechanism") return { title: get("title"), text: get("text"), cite: nums(get("cite")), ...(was.generic ? { generic: true } : {}) };
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
      // A need is met once its field has been edited and holds something.
      d.needs = (d.needs || []).filter((n) => {
        if (!touched.has(n.path)) return true;
        if (n.path === "mechanism") return !d.mechanism.length;
        if (n.path === "sources") return !d.sources.some((s) => s.text);
        const el = target(n.path);
        return !(el && "value" in el && String(el.value).trim());
      });
      return d;
    }
    function preview() {
      clearTimeout(timer);
      timer = setTimeout(() => {
        read();
        const b = view.querySelector('[aria-current="step"]');
        show(d, { fromEditor: true, step: b ? +b.dataset.step : 0 });
        mark();
      }, 250);
    }
    function touch(e) {
      (d.needs || []).forEach((n) => { const el = target(n.path); if (el && (el === e.target || el.contains(e.target))) touched.add(n.path); });
      if (e.target.closest('[data-list="mechanism"]')) touched.add("mechanism");
      if (e.target.closest('[data-list="sources"]')) touched.add("sources");
    }
    form.addEventListener("input", (e) => { touch(e); preview(); });
    form.addEventListener("change", (e) => { touch(e); preview(); });
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
        const fl = $("#rx-route").value, fi = formInfo(fl);
        const tgt = d.journey.find((j) => j.target);
        d.dosageForm = fl; d.route = fi.route;
        d.journey = journeyFor(fi.route, d.modality, d.target.name, tgt ? RX.siteId(tgt.site) : fi.localSite, true);
        render(); preview(); return;
      }
      const status = $("#rx-ed-status");
      const act = b.dataset.ed;
      if (!act) return;
      read();
      const json = JSON.stringify(clean(d), null, 2);
      if (act === "save") { local[d.id] = clean(d); status.textContent = store.save(local) ? "Saved in this browser." : "This browser blocked local storage. Use Copy JSON instead."; refreshLib(); }
      if (act === "download") {
        if (downloads) downloads.save({ filename: `${d.id}.json`, data: json + "\n" }).then(() => (status.textContent = `Saved ${d.id}.json.`), (err) => (status.textContent = err && err.code === "declined" ? "Download cancelled." : "Download is not available here. Use Copy JSON."));
        else { const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([json + "\n"], { type: "application/json" })); a.download = `${d.id}.json`; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000); status.textContent = `Downloaded ${d.id}.json.`; }
      }
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
      const o = clone(x);
      delete o._local;
      o.facts = (o.facts || []).filter((f) => f.label && f.value);
      ["journey", "mechanism", "facts"].forEach((k) => (o[k] || []).forEach((it) => { if (!it.cite || !it.cite.length) delete it.cite; if (!it.generic) delete it.generic; }));
      return o;
    }

    return {
      get open() { return box.open; },
      start(name) { d = templateDraft(name || "New dossier", formSel.value || "Tablet"); touched.clear(); box.open = true; render(); show(d, { fromEditor: true }); box.scrollIntoView({ behavior: "smooth", block: "start" }); },
      fill(src, openIt) { d = clone(src); delete d._local; touched.clear(); render(); if (openIt) box.open = true; },
      focusNeed(path) {
        if (!d || d.id !== (current && current.id)) this.fill(current);
        box.open = true;
        const el = target(path);
        if (!el) { box.scrollIntoView({ behavior: "smooth", block: "start" }); return; }
        el.scrollIntoView({ behavior: "smooth", block: "center" });
        const f = el.matches("input, select, textarea") ? el : el.querySelector("input, select, textarea");
        if (f) setTimeout(() => f.focus({ preventScroll: true }), 300);
      },
      boot() {
        $('[data-act="new"]').addEventListener("click", () => editor.start(q.value.trim() && !find(q.value) ? q.value.trim() : ""));
        box.addEventListener("toggle", () => { if (box.open && current && (!d || d.id !== current.id)) editor.fill(current); });
      },
    };
  })();
  editor.boot();

  /* ---------- start ---------- */

  formSel.innerHTML = `<option value="">Dosage form…</option>` + FORMS.map(([g, items]) => `<optgroup label="${esc(g)}">${items.map(([l]) => `<option>${esc(l)}</option>`).join("")}</optgroup>`).join("");
  refreshEngine();
  if (window.claude && typeof window.claude.use === "function") {
    window.claude.use("sample").then((s) => { sample = s || null; refreshEngine(); }, () => {});
    window.claude.use("downloads").then((dl) => { downloads = dl || null; if (editor.open && current) editor.fill(current); }, () => {});
  }

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
  window.AnimaRxApp = { show, find, go, lookupPublic, editor, journeyFor, templateDraft, normalize: (raw, name, form) => normalize(raw, name, form, formInfo(form)), promptFor: (name, form) => promptFor(name, form, formInfo(form)) };
})();
