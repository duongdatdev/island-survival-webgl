"""Acquire selected CC0 assets, keeping original archives in an ignored cache.

Only explicitly selected archive members are copied. No publisher archive is
blindly extracted, and no source library is added to the production payload.
"""
from concurrent.futures import ThreadPoolExecutor
from hashlib import sha256
from pathlib import Path
import io
import json
import posixpath
import struct
import urllib.request
import zipfile

ROOT = Path(__file__).resolve().parents[1]
DEST = ROOT / "assets" / "campaign"
CACHE = ROOT / ".cache" / "asset-downloads"
PACKS = [
    ("survival", "https://kenney.nl/assets/survival-kit",
     "https://kenney.nl/media/pages/assets/survival-kit/4065a8185b-1712149243/kenney_survival-kit.zip",
     ["workbench", "workbench-anvil", "workbench-grind", "bedroll", "bedroll-frame", "chest", "box-large", "barrel", "tool-pickaxe", "tool-pickaxe-upgraded", "tool-axe-upgraded", "tool-hammer", "tool-hoe", "structure", "structure-floor", "structure-roof", "structure-metal-wall", "structure-metal-doorway", "structure-metal-roof", "resource-planks", "resource-stone", "fish", "fish-large", "signpost"]),
    ("building", "https://kenney.nl/assets/building-kit",
     "https://kenney.nl/media/pages/assets/building-kit/0de7aaa492-1743244741/kenney_building-kit.zip",
     ["floor", "wall", "wall-doorway-square", "door-rotate-square-a", "roof-flat-square", "column", "detail-pipe", "stairs-open-short"]),
    ("pirate", "https://kenney.nl/assets/pirate-kit",
     "https://kenney.nl/media/pages/assets/pirate-kit/e6d4bb1525-1771333093/kenney_pirate-kit.zip",
     ["ship-wreck", "boat-row-small", "structure-platform-dock", "structure-platform-dock-small", "mast", "mast-ropes", "crate", "tower-watch", "platform-planks"]),
    ("cave", "https://kenney.nl/assets/modular-cave-kit",
     "https://kenney.nl/media/pages/assets/modular-cave-kit/37ec3cb12d-1783667097/kenney_modular-cave-kit_1.0.zip",
     ["corridor", "corridor-corner", "corridor-end", "corridor-junction", "gate", "room-small", "room-large", "template-floor", "template-wall", "ladder", "stairs"]),
    ("food", "https://kenney.nl/assets/food-kit",
     "https://kenney.nl/media/pages/assets/food-kit/83086fa91c-1719418518/kenney_food-kit.zip",
     ["coconut", "coconut-half", "fish", "meat-raw", "meat-cooked", "carrot", "mushroom", "bowl-soup", "pot", "bag"]),
    ("crops", "https://opengameart.org/content/lowpoly-crops-pack",
     "https://opengameart.org/sites/default/files/nature_crops_pack_by_quaternius.zip",
     ["Carrot_1", "Carrot_2", "Carrot_3", "Carrot_4", "Carrot_Crop"]),
]


def embed_glb_images(data, member, archive):
    """Some publisher GLBs still reference a neighbouring palette PNG."""
    json_length, _ = struct.unpack_from('<II', data, 12)
    document = json.loads(data[20:20 + json_length])
    offset = 20 + json_length
    binary = bytearray()
    if offset + 8 <= len(data):
        binary_length, _ = struct.unpack_from('<II', data, offset)
        binary.extend(data[offset + 8:offset + 8 + binary_length])
    changed = False
    # Remove identity-only texture transforms emitted by the publisher. Preserve
    # texCoord selection explicitly; do not silently drop non-identity transforms.
    def strip_identity(value):
        nonlocal changed
        if isinstance(value, list):
            for entry in value:
                strip_identity(entry)
        elif isinstance(value, dict):
            extension = value.get('extensions', {}).get('KHR_texture_transform')
            if extension is not None and extension.get('offset', [0, 0]) == [0, 0] \
                    and extension.get('scale', [1, 1]) == [1, 1] and extension.get('rotation', 0) == 0:
                if 'texCoord' in extension:
                    value['texCoord'] = extension['texCoord']
                del value['extensions']['KHR_texture_transform']
                if not value['extensions']:
                    del value['extensions']
                changed = True
            for entry in list(value.values()):
                strip_identity(entry)
    strip_identity(document)
    if 'KHR_texture_transform' not in json.dumps(document.get('materials', [])):
        for key in ('extensionsUsed', 'extensionsRequired'):
            if key in document:
                document[key] = [name for name in document[key] if name != 'KHR_texture_transform']
    for image in document.get('images', []):
        uri = image.get('uri')
        if not uri:
            continue
        source = posixpath.normpath(posixpath.join(posixpath.dirname(member), uri))
        image_data = archive.read(source)
        while len(binary) % 4:
            binary.append(0)
        view = {'buffer': 0, 'byteOffset': len(binary), 'byteLength': len(image_data)}
        image['bufferView'] = len(document.setdefault('bufferViews', []))
        document['bufferViews'].append(view)
        image['mimeType'] = 'image/png' if uri.lower().endswith('.png') else 'image/jpeg'
        del image['uri']
        binary.extend(image_data)
        changed = True
    if not changed:
        return data
    document['buffers'][0]['byteLength'] = len(binary)
    while len(binary) % 4:
        binary.append(0)
    encoded = json.dumps(document, separators=(',', ':')).encode()
    encoded += b' ' * ((-len(encoded)) % 4)
    return (struct.pack('<III', 0x46546C67, 2, 28 + len(encoded) + len(binary))
            + struct.pack('<II', len(encoded), 0x4E4F534A) + encoded
            + struct.pack('<II', len(binary), 0x004E4942) + binary)


def acquire(pack):
    key, page, url, selection = pack
    cache = CACHE / (key + ".zip")
    if cache.exists():
        data = cache.read_bytes()
    else:
        request = urllib.request.Request(url, headers={"User-Agent": "IslandSurvival asset acquisition"})
        data = urllib.request.urlopen(request, timeout=60).read()
        zipfile.ZipFile(io.BytesIO(data)).testzip()
        cache.write_bytes(data)
    archive = zipfile.ZipFile(io.BytesIO(data))
    names = archive.namelist()
    records = []
    for stem in selection:
        suffix = ".obj" if key == "crops" else ".glb"
        matches = [n for n in names if Path(n).name == stem + suffix]
        if len(matches) != 1:
            raise ValueError(f"{key}/{stem}: expected one model, found {matches}")
        member = matches[0]
        relative = f"sources/crops/{stem}.obj" if key == "crops" else f"models/{key}_{stem}.glb"
        target = DEST / relative
        target.parent.mkdir(parents=True, exist_ok=True)
        model_data = archive.read(member)
        if suffix == '.glb':
            model_data = embed_glb_images(model_data, member, archive)
        target.write_bytes(model_data)
        if key == "crops":
            mtl = member[:-4] + ".mtl"
            if mtl in names:
                target.with_suffix(".mtl").write_bytes(archive.read(mtl))
        records.append({"id": f"{key}_{stem}", "path": "assets/campaign/" + relative,
                        "sourceMember": member, "sha256": sha256(model_data).hexdigest()})
    licence_members = [n for n in names if Path(n).name.lower() == "license.txt"]
    license_path = DEST / "licenses" / (key + ".txt")
    license_path.parent.mkdir(parents=True, exist_ok=True)
    if licence_members:
        license_path.write_bytes(archive.read(licence_members[0]))
    else:
        license_path.write_text(f"Source declaration: {page}\nAuthor: Quaternius\nLicense: CC0 1.0 Universal\nhttps://creativecommons.org/publicdomain/zero/1.0/\nVerified on source page 2026-10-06. The source ZIP has no License.txt.\n", encoding="utf-8")
    return {"pack": key, "author": "Quaternius" if key == "crops" else "Kenney",
            "source": page, "download": url, "license": "CC0-1.0",
            "licensePath": "assets/campaign/licenses/" + key + ".txt",
            "archiveSha256": sha256(data).hexdigest(), "models": records}


if __name__ == "__main__":
    CACHE.mkdir(parents=True, exist_ok=True)
    DEST.mkdir(parents=True, exist_ok=True)
    with ThreadPoolExecutor(max_workers=4) as pool:
        results = list(pool.map(acquire, PACKS))
    (DEST / "sources.json").write_text(json.dumps({"version": 1, "verifiedAt": "2026-10-06", "packs": results}, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Acquired {sum(len(p['models']) for p in results)} selected models from {len(results)} CC0 packs.")
