# Island survival item icons

75 generated PNG icons: all 69 distinct Classic/Campaign items and 6 crafting categories.
Each icon is 128 × 128 RGBA with a transparent background. `preview.jpg` is a contact sheet.

Art direction: low-poly tropical survival props, warm timber and rope, faceted stone,
ivory sailcloth, olive foliage, restrained blue and orange accents. Upper-left lighting,
clear silhouettes and consistent three-quarter views for the dark olive game interface.

Generated using the built-in `image_gen` tool. Exact prompts, cell order and provenance
are saved in `source/generation.json`; original generated sheets are `source/pack-*.png`.
These source files are not shipped in the production game.

Processing: the generate2dsprite skill processor splits each source into a 5 × 5 grid,
keys magenta, crops to the largest component and centers the result in 128 px cells
at 0.88 fit scale. Use `--trim-border 0 --strict-qc --allow-source-edge-touch`.
Source-edge overrides were reviewed against the full original silhouettes; every final
sheet has zero empty frames, zero output edge contacts and zero paste clamping.
QC reports are retained in `source/qc-*.json`.

`scripts/export-item-icons.py` exports the processor results from
`.cache/item-icons/clean-{1,2,3}`, removes residual magenta and builds the preview.
`src/systems/ItemIcons.js` provides static Vite asset URLs and decorative image markup;
localized accessible labels remain on the surrounding controls.
