"""Export generated icon cells; deterministic alpha cleanup and QA preview only."""
import json
import shutil
from pathlib import Path
import numpy as np
from PIL import Image, ImageDraw, ImageFont

root = Path(__file__).resolve().parents[1]
out = root / 'assets/ui/item-icons'
manifest = json.loads((out / 'source/generation.json').read_text(encoding='utf-8'))
preview = Image.new('RGB', (1000, 960), '#1c2f26')
draw = ImageDraw.Draw(preview)
font = ImageFont.truetype('C:/Windows/Fonts/arial.ttf', 12)
for pack_index, pack in enumerate(manifest['packs']):
    source = root / '.cache/item-icons' / f'clean-{pack_index + 1}'
    qc = json.loads((source / 'pipeline-meta.json').read_text())
    assert not qc['empty_frames'] and not qc['output_edge_touch_frames'] and not qc['paste_clamped_frames']
    shutil.copyfile(source / 'pipeline-meta.json', out / 'source' / f'qc-{pack_index + 1}.json')
    for index, name in enumerate(pack):
        im = Image.open(source / f'prop_pack-{index+1}.png').convert('RGBA')
        pixels = np.array(im)
        rgb = pixels[:, :, :3].astype('int16')
        # Remove residual chroma-key reflections, including holes in woven baskets.
        magenta = (rgb[:,:,0] - rgb[:,:,1] > 35) & (rgb[:,:,2] - rgb[:,:,1] > 35)
        pixels[magenta, 3] = 0
        im = Image.fromarray(pixels)
        assert im.size == (128, 128) and im.getbbox()
        im.save(out / f'{name}.png', optimize=True)
        n = pack_index * 25 + index
        x, y = (n % 10) * 100, (n // 10) * 120
        thumb = im.resize((88, 88), Image.Resampling.LANCZOS)
        preview.paste(thumb, (x+6, y+3), thumb)
        draw.text((x+50,y+94), name, font=font, fill='#e4dcc1', anchor='mt')
preview.save(out / 'preview.jpg', quality=92)
