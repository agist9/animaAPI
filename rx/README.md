# Anima Rx

Type a drug name or development code and see two linked views:

- **In the body**: a schematic body map. Particles follow the drug from where it enters, through absorption, distribution and the target tissue, to where it is metabolised and eliminated.
- **At the target**: a cell-level scene of the mechanism. It shows the target, what the drug does to it and the cell's response, with a binding-occupancy slider where binding applies.

A numbered step list ties the two views together, with a cited sentence for each step. A key-facts table, the sources, a list of what is simplified, and the educational-use note sit underneath.

Each page is generated from a **dossier**, a small JSON file of cited facts. The page draws the dossier and adds nothing of its own. A dossier with weak sources gives a page with weak sources.

## Use it

Open [`anima-rx.html`](anima-rx.html) in a browser. Type a name (`imatinib`, `Keytruda`, `CTL019`) and press **Visualize**.

If the page has no dossier for what you typed, you get three choices:

1. **Create a dossier.** The editor opens with a route template. The figure redraws as you type. The dossier stays in your browser; **Download JSON** saves it as a file.
2. **Open a dossier file.** You can also drag one onto the page.
3. **Search ChEMBL + PubChem.** This sends what you typed to EMBL-EBI and NCBI, then drafts a dossier from their records. Draft pages are marked as drafts, and their body journeys are generic for the route and modality. Do not use this for unpublished internal codes unless your confidentiality policy allows it.

From the command line:

```sh
node rx/build.mjs              # rebuild rx/anima-rx.html from rx/dossiers/*.json
node rx/build.mjs --check      # check every dossier; fails on uncited numbers or missing sources
node rx/build.mjs CGT1815      # build one page from rx/private/ or rx/dossiers/ (matched by id, name or alias)
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
| `status`, `confidential` | Free text, and `true` to show the confidential banner and keep the name out of the address bar. |
| `summary` | One or two sentences, shown under the figure. |
| `target.name`, `target.short` | Full target name, and the short label drawn in the scene. |
| `target.class` | The scene: `receptor`, `enzyme`, `channel`, `transporter`, `nuclear`, `ligand`, `checkpoint`, `car`, `gene` or `oligo`. If left empty, it is chosen from the modality. |
| `target.action` | For example `inhibitor`, `antagonist`, `agonist`, `blocker`, `opener`, `neutraliser`, `T-cell engager` or `expression`. Agonist-like words make the scene switch things on; the rest switch them off. |
| `target.cell`, `target.vector`, `target.labels` | The target cell's name; the vector (`AAV`, `lentivirus`, `LNP`); label overrides (`receptor`, `ligand`, `antigen`, `effector`, `target`, `protein`, `pocket`, `substrate`, `signal`, `blocks`). |
| `binding` | `false` hides the occupancy slider. |
| `journey[]` | Body steps: `site`, `title`, `text`, `cite`. Mark one step `"target": true`; the mechanism plays after it. |
| `mechanism[]` | Up to four beats at the target: `title`, `text`, `cite`. If left empty, the scene's own generic text is used. |
| `facts[]` | `label`, `value`, `cite`. Values carry their units, population and conditions. |
| `simplified[]` | What the drawing leaves out. |
| `sources[]` | `id`, `text`, `url`. Every `cite` refers to a source `id`. |

**Body sites:** `mouth`, `stomach`, `intestine`, `liver`, `pancreas`, `spleen`, `kidneys`, `bladder`, `lungs`, `heart`, `blood`, `brain`, `spinal-cord`, `bone-marrow`, `lymph-nodes`, `joints`, `skin`, `iv`, `subq`, `im`, `tumor`, `tissues` and `ex-vivo` (the manufacturing step of a cell therapy). Common synonyms also work (`gut`, `urine`, `vein`, `duodenum` and others).

## Rules the checker enforces

- A step or fact that contains a number must cite a source. Codes such as CYP3A4, IgG4 and CD19 are not counted as numbers.
- Every cited number must exist in `sources`.
- No more than one journey step can be the target.
- The modality and the scene must be known values. An unknown body site is a warning, and it is drawn as `tissues`.

## Limits

These figures show mechanism. They show the route because it is part of how a drug moves through the body, but they never show a dose, schedule, regimen or recommendation. The scenes are generic templates labelled for each drug, so they are schematic and not to scale. When a mechanism does not fit any template, build a bespoke Anima figure: copy the closest folder in `examples/`.
