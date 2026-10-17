# Anima Rx

Type a drug name or development code and see two linked views:

- **In the body**: a schematic body map. Particles follow the drug from where it enters, through absorption, distribution and the target tissue, to where it is metabolised and eliminated.
- **At the target**: a cell-level scene of the mechanism. It shows the target, what the drug does to it and the cell's response, with a binding-occupancy slider where binding applies.

A numbered step list ties the two views together, with a cited sentence for each step. A key-facts table, the sources, a list of what is simplified, and the educational-use note sit underneath.

Each page is generated from a **dossier**, a small JSON file of cited facts. The page draws the dossier and adds nothing of its own. A dossier with weak sources gives a page with weak sources.

## Use it

Type a drug name or development code, choose its **dosage form**, and press **Go**.

- **The page has a dossier for it.** It opens with your dosage form shown. If the form implies a different route from the dossier's, for example IV infusion for an oral drug, the entry steps are redrawn for that route and marked "typical". Everything from the target on stays as written.
- **The page has no dossier, and it can ask Claude** (the hosted copy). Claude drafts one from the name and dosage form. It fills everything it can judge and flags what it cannot. Invented links and citations that point to nothing are stripped before the page shows the draft. The draft is saved in your browser and marked as Claude's work until you check it.
- **The page has no dossier, and it cannot ask Claude** (the local file, or when you decline). The dosage form's template supplies the entry, distribution and clearance steps. **Fill from ChEMBL + PubChem** adds what public databases know.

Either way, the editor opens with the fields that still need you highlighted. A solid outline means **required**: the target, the mechanism type, the action, the target tissue, and the modality when the dosage form doesn't tell. A dashed outline means **optional**: data that isn't public or isn't known, such as an unpublished half-life. A highlight clears as soon as you fill its field. The same gaps show as chips above the figure, flags on the steps and gaps in the facts table. Click any of them to jump to the field.

[`dossiers/bezuclastinib.json`](dossiers/bezuclastinib.json) (CGT9486) shows the pattern. Its mechanism, disease biology and trial status are public and cited. Its human pharmacokinetics are not published yet, so those five fields are flagged as optional rather than guessed.

From the command line:

```sh
node rx/build.mjs              # rebuild rx/anima-rx.html from rx/dossiers/*.json
node rx/build.mjs --check      # check every dossier; fails on uncited numbers or missing sources, lists open required fields
node rx/build.mjs CGT1815      # build one page from rx/private/ or rx/dossiers/ (matched by id, name or alias)
node rx/build.mjs --hosted --out page.html   # the hosted variant, which asks Claude to draft unknown names
```

## Internal and confidential compounds

Put their dossiers in [`rx/private/`](private/). Git ignores everything in that folder except its README. Pages built from a private dossier are written to `rx/private/` too, and they show a **Confidential** banner by default.

```sh
cp rx/dossiers/_template.json rx/private/CGT1815.json
# fill it in from the Investigator's Brochure, development reports, tech-transfer package...
node rx/build.mjs --check && node rx/build.mjs CGT1815
open rx/private/cgt1815.html
```

## The dossier

| Field | What goes in it |
|---|---|
| `id`, `name`, `aliases` | Code, INN, brand names, former codes. Search matches any of them. |
| `modality` | `small-molecule`, `antibody`, `protein`, `peptide`, `oligonucleotide`, `mrna`, `gene-therapy` or `cell-therapy`. |
| `route`, `dosageForm` | The route the dossier describes (`oral`, `sublingual`, `inhaled`, `nasal`, `iv`, `subq`, `im`, `intravitreal`, `intrathecal`, `topical`, `transdermal`, `ophthalmic`, `rectal`, `ex-vivo`, `allogeneic`, `gene-iv`, `mrna-im`), and the dosage form chosen on the page. |
| `status`, `confidential` | Free text, and `true` to show the confidential banner and keep the name out of the address bar. |
| `summary` | One or two sentences, shown under the figure. |
| `target.name`, `target.short` | Full target name, and the short label drawn in the scene. |
| `target.class` | The scene: `receptor`, `enzyme`, `rtk` (receptor tyrosine kinase), `channel`, `transporter`, `nuclear`, `ligand`, `checkpoint`, `car`, `gene` or `oligo`. If left empty, it is chosen from the modality. |
| `target.action` | For example `inhibitor`, `antagonist`, `agonist`, `blocker`, `opener`, `neutraliser`, `T-cell engager` or `expression`. Agonist-like words make the scene switch things on; the rest switch them off. |
| `target.cell`, `target.vector`, `target.labels` | The target cell's name; the vector (`AAV`, `lentivirus`, `LNP`); label overrides (`receptor`, `ligand`, `antigen`, `effector`, `target`, `protein`, `pocket`, `substrate`, `signal`, `blocks`). |
| `binding` | `false` hides the occupancy slider. |
| `journey[]` | Body steps: `site`, `title`, `text`, `cite`. Mark one step `"target": true`; the mechanism plays after it. |
| `mechanism[]` | Up to four beats at the target: `title`, `text`, `cite`. If left empty, the scene's own generic text is used. |
| `facts[]` | `label`, `value`, `cite`. Values carry their units, population and conditions. |
| `simplified[]` | What the drawing leaves out. |
| `needs[]` | What is still missing: `path` (`target.name`, `journey[3].text`, `mechanism`, `fact:Elimination half-life` and so on), `label`, `why`, and `required`. |
| `sources[]` | `id`, `text`, `url`. Every `cite` refers to a source `id`. |

**Body sites:** `mouth`, `eye`, `nose`, `stomach`, `intestine`, `liver`, `pancreas`, `spleen`, `kidneys`, `bladder`, `lungs`, `heart`, `blood`, `brain`, `spinal-cord`, `bone-marrow`, `lymph-nodes`, `joints`, `skin`, `iv`, `subq`, `im`, `tumor`, `tissues` and `ex-vivo` (the manufacturing step of a cell therapy). Common synonyms also work (`gut`, `urine`, `vein`, `duodenum` and others).

## Rules the checker enforces

- A step or fact that contains a number must cite a source. Codes such as CYP3A4, IgG4 and CD19 are not counted as numbers.
- Every cited number must exist in `sources`.
- No more than one journey step can be the target.
- The modality and the scene must be known values. An unknown body site is a warning, and it is drawn as `tissues`.

## Limits

These figures show mechanism. They show the route because it is part of how a drug moves through the body, but they never show a dose, schedule, regimen or recommendation. The scenes are generic templates labelled for each drug, so they are schematic and not to scale. When a mechanism does not fit any template, build a bespoke Anima figure: copy the closest folder in `examples/`.
