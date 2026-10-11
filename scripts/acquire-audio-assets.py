"""Download licensed audio and prepare the small runtime library (requires ffmpeg, py7zr)."""
from pathlib import Path
import hashlib
import io
import json
import shutil
import subprocess
import urllib.request
import zipfile

ROOT = Path(__file__).resolve().parents[1]
CACHE = ROOT / '.cache/audio-sources'
OUT = ROOT / 'assets/audio'
CACHE.mkdir(parents=True, exist_ok=True)
OUT.mkdir(parents=True, exist_ok=True)
sources = {}
clips = {}


def download(url, target):
    if not target.exists():
        target.write_bytes(urllib.request.urlopen(url, timeout=90).read())
    return target


def source(key, author, page, url, license='CC0-1.0'):
    sources[key] = dict(author=author, page=page, download=url, license=license)


def pack(key, stamp):
    page = 'https://kenney.nl/assets/' + key
    url = f'https://kenney.nl/media/pages/assets/{key}/{stamp}/kenney_{key}.zip'
    source(key, 'Kenney', page, url)
    archive = download(url, CACHE / (key + '.zip'))
    with zipfile.ZipFile(archive) as z:
        z.extractall(CACHE / key)
    licenses = OUT / 'licenses'
    licenses.mkdir(exist_ok=True)
    shutil.copyfile(next((CACHE / key).rglob('License.txt')), licenses / (key + '.txt'))


def clip(id, key, pattern, category='sfx', seconds=None, start=0):
    matches = sorted(CACHE.glob(pattern))
    if not matches:
        raise RuntimeError(f'Missing audio: {pattern}')
    paths = []
    for i, original in enumerate(matches):
        relative = f'{category}/{id}-{i}.ogg'
        target = OUT / relative
        target.parent.mkdir(exist_ok=True)
        # Re-encode field recordings/music; preserve the short original SFX.
        if original.suffix == '.ogg' and category == 'sfx' and seconds is None:
            shutil.copyfile(original, target)
        else:
            duration = float(subprocess.check_output(['ffprobe', '-v', 'error', '-show_entries',
                'format=duration', '-of', 'csv=p=0', str(original)], text=True).strip())
            if seconds:
                seconds = min(seconds, duration - start)
            args = ['ffmpeg', '-hide_banner', '-loglevel', 'error', '-y', '-ss', str(start), '-i', str(original)]
            if seconds:
                args += ['-t', str(seconds)]
            args += ['-vn', '-ar', '44100', '-ac', '2' if category == 'music' else '1']
            # Fade the boundaries of edited loops to avoid hard sample discontinuities.
            if seconds:
                args += ['-af', f'afade=t=in:d=0.08,afade=t=out:st={seconds-0.08}:d=0.08']
            args += ['-c:a', 'libvorbis', '-q:a', '3', str(target)]
            subprocess.run(args, check=True)
        paths.append(dict(path='assets/audio/' + relative, original=original.name,
                          sha256=hashlib.sha256(target.read_bytes()).hexdigest()))
    clips[id] = dict(source=key, category=category, files=paths)


for key, stamp in [('rpg-audio', '8e99002d76-1677590336'),
                   ('impact-sounds', '87b4ddecda-1677589768'),
                   ('interface-sounds', 'fa43c1dd4d-1677589452'),
                   ('music-jingles', 'f37e530b9e-1677590399')]:
    pack(key, stamp)

oga = 'https://opengameart.org/'
records = [
    ('calm', 'KiluaBoy', 'sunset-walk-ambient-quiet-sweet-loop', 'SunsetWalk.ogg', '.ogg'),
    ('night', 'Joth', 'contemplation-0', 'Contemplation.mp3', '.mp3'),
    ('danger', 'iamoneabe', 'night-shift', 'nightshift_0.mp3', '.mp3'),
    ('waves', 'jasinski (submitted by qubodup)', '../node/11174', 'wave_01_cc0-18363__jasinski__alkaibeach.flac', '.flac'),
    ('birds', 'isaiah658', 'ambient-bird-sounds', 'birds-isaiah658_0.ogg', '.ogg'),
    ('crickets', 'dklon', 'crickets', 'crickets_0.mp3', '.mp3'),
    ('fire', 'AntumDeluge', 'fire-crackling', 'fire-1.wav', '.wav'),
    ('splash', 'Thimras', 'ocean-splash', 'cannon_miss.ogg', '.ogg'),
    ('heartbeat', 'bart', 'heartbeat-sounds', 'heartbeat_slow_0.wav', '.wav'),
    ('thunder', 'WuxiaScrub', 'rain-long-thunder', 'rain-thunder.ogg', '.ogg'),
    ('rain', 'Ylmir', 'rain-loopable', 'Rain%20OGG.zip', '.zip'),
    ('rpg-extra', 'rubberduck', '80-cc0-rpg-sfx', '80-CC0-RPG-SFX_0.zip', '.zip'),
    ('nature', 'Blender Foundation (submitted by Lamoot)', 'ambient-mountain-river-wind-and-forest-and-waterfall', 'ambient_mountains_forest_river_waterfall_wind.7z', '.7z'),
]
for key, author, slug, filename, ext in records:
    page = oga + 'content/' + slug if not slug.startswith('../') else oga + slug[3:]
    url = oga + 'sites/default/files/' + filename
    source(key, author, page, url, 'CC-BY-3.0' if key in ('crickets', 'nature') else 'CC0-1.0')
    archive = download(url, CACHE / (key + ext))
    if ext == '.zip':
        with zipfile.ZipFile(archive) as z:
            z.extractall(CACHE / key)
    if ext == '.7z':
        import py7zr
        with py7zr.SevenZipFile(archive) as z:
            z.extractall(CACHE / key)

for id, filename in {'pickup':'handleCoins.ogg', 'open':'bookOpen.ogg', 'close':'bookClose.ogg',
                     'chop':'chop.ogg', 'bow':'drawKnife1.ogg'}.items():
    clip(id, 'rpg-audio', 'rpg-audio/**/' + filename)
for id, filename in {'click':'click_001.ogg', 'hover':'select_001.ogg', 'error':'error_003.ogg',
                     'heal':'confirmation_002.ogg', 'achievement':'confirmation_004.ogg'}.items():
    clip(id, 'interface-sounds', 'interface-sounds/**/' + filename)
for id, pattern in {'step-sand':'footstep_snow_00[0-3].ogg', 'step-grass':'footstep_grass_00[0-3].ogg',
                    'step-rock':'footstep_concrete_00[0-3].ogg', 'step-wood':'footstep_wood_00[0-3].ogg',
                    'punch':'impactPunch_medium_00[0-2].ogg', 'hit':'impactPunch_heavy_00[0-2].ogg',
                    'mine':'impactMining_00[0-3].ogg', 'craft':'impactWood_medium_00[0-2].ogg',
                    'raft':'impactPlank_medium_00[0-2].ogg', 'eat':'impactSoft_medium_00[0-2].ogg'}.items():
    clip(id, 'impact-sounds', 'impact-sounds/**/' + pattern)
for id, pattern in {'swing':'blade_0[1-3].ogg', 'thrust':'blade_02.ogg', 'arrow':'wood_02.ogg',
                    'tree-fall':'wood_05.ogg', 'creature-hurt':'creature_hurt_0[1-2].ogg',
                    'creature-die':'creature_die_01.ogg', 'drink':'creature_slime_01.ogg'}.items():
    clip(id, 'rpg-extra', 'rpg-extra/**/' + pattern)
clip('victory', 'music-jingles', 'music-jingles/**/jingles_STEEL00.ogg')
clip('death', 'music-jingles', 'music-jingles/**/jingles_PIZZI16.ogg')
clip('splash', 'splash', 'splash.ogg')
clip('heartbeat', 'heartbeat', 'heartbeat.wav', seconds=1.5)
clip('thunder', 'thunder', 'thunder.ogg', seconds=12, start=19)
for id, key, pattern, duration in [
    ('waves','waves','waves.flac',8), ('rain','rain','rain/**/1.ogg',25),
    ('daylife','birds','birds.ogg',16), ('nightlife','crickets','crickets.mp3',16),
    ('campfire','fire','fire.wav',2.7), ('waterfall','nature','nature/**/amb_waterfall.flac',16),
    ('wind','nature','nature/**/amb_wind_1.flac',16),
]:
    clip(id, key, pattern, 'ambience', seconds=duration)
clip('music-calm', 'calm', 'calm.ogg', 'music')
clip('music-night', 'night', 'night.mp3', 'music')
clip('music-danger', 'danger', 'danger.mp3', 'music', seconds=46.829268)

manifest = dict(version=1, sources=sources, clips=clips,
                licenses=['assets/audio/CREDITS.md'] + ['assets/audio/licenses/' + p.name for p in (OUT/'licenses').glob('*.txt')])
(OUT/'manifest.json').write_text(json.dumps(manifest, indent=2) + '\n', encoding='utf-8')
credits = '# Audio credits\n\nDownloaded audio used by Island Survival. CC0 assets are public domain; CC BY 3.0 assets retain the attribution below.\n\n'
for key, s in sources.items():
    credits += f"- **{key}** — {s['author']}. [{s['license']}]({'https://creativecommons.org/licenses/by/3.0/' if s['license']=='CC-BY-3.0' else 'https://creativecommons.org/publicdomain/zero/1.0/'}). [Source]({s['page']}).\n"
credits += '\nEdits: selected excerpts, mono conversion for ambience, 44.1 kHz Vorbis compression, and short fades on excerpt boundaries. Sand steps use soft snow footsteps; bow release, eating and drinking use adapted foley. Full per-file provenance and SHA-256 hashes are in manifest.json.\n\nRebuild with `python scripts/acquire-audio-assets.py` (ffmpeg and py7zr required). Runtime playback uses local bundled files; no external audio service is contacted.\n'
(OUT/'CREDITS.md').write_text(credits, encoding='utf-8')
print(f'Prepared {sum(len(c["files"]) for c in clips.values())} audio files.')
