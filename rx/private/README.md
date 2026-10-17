# rx/private

Put dossiers for internal or confidential compounds here, for example `rx/private/CGT1815.json`.
Everything in this folder except this README is ignored by git, so it is never committed or pushed.

```sh
cp rx/dossiers/_template.json rx/private/CGT1815.json   # then fill it in from your source documents
node rx/build.mjs --check                               # flags uncited numbers and broken source references
node rx/build.mjs CGT1815                               # writes rx/private/cgt1815.html
```

You can also skip files entirely: open `rx/anima-rx.html`, type the code, and use the dossier editor.
It keeps the dossier in your browser, and **Download JSON** saves it wherever your document controls require.

Before you put anything here, check your company's confidentiality and data-handling policy. Git-ignored files
are still on this disk, and a cloud workspace is still someone else's computer.
