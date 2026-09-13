# Office PPTX playback corpus

This directory is reserved for files exported by Microsoft PowerPoint (or the
classroom's actual Office/WPS authoring path), plus matching PowerPoint-exported
reference screenshots. Do not replace these with PptxGenJS fixtures: generated
files cannot prove Office round-trip fidelity.

The required first wave is listed in `manifest.json`. Until the real files and
their screenshots are supplied, the corpus gate remains `NOT_EVALUATED`; this
repository must not claim `EXACT` or a compatibility percentage from the
synthetic blank template.

Expected layout for each case:

```text
<fixture>.pptx
reference/slide-01.png
reference/slide-02.png
...
```

The public-lesson fixture is intentionally external input and should be added
only when the teacher provides the actual deck.
