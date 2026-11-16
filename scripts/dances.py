# Танцевальные кадры: 6 фаз на пару «герой:наряд», общий масштаб и общая опорная точка на все фазы.
# Запуск: python3 -I scripts/dances.py <папка с frames/ и MANIFEST.json>. Точки лица ищутся по румянцу, как в chars.py.
import sys, json, os
import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage as ndi

SRC = sys.argv[1]
FACE_UNITS = 104  # ширина лица в единицах комнаты — как у обычных фигурок
MAN = json.load(open(os.path.join(SRC, 'MANIFEST.json')))
GX, GY = MAN['groundAnchor']['x'], MAN['groundAnchor']['y']
OUT = 'public/assets/chars/dance'; os.makedirs(OUT, exist_ok=True)
OVR = json.load(open('art-src/dance-overrides.json')) if os.path.exists('art-src/dance-overrides.json') else {}

def face(a):
    # румянец ярче у светлой кожи и мягче у тёмной: сначала строгий порог, потом мягкий
    return face_at(a, 85) or face_at(a, 68)
def face_at(a, redder):
    h, w = a.shape[:2]; op = a[..., 3] > 60
    r, g, b = [a[..., k].astype(int) for k in range(3)]
    pink = op & (r > 212) & (g > 95) & (g < 185) & (b > 75) & (b < 185) & (r - g > redder) & (np.abs(g - b) < 45)
    pink[int(h * 0.62):] = False
    pl, pn = ndi.label(pink); blobs = []
    for j, sl in enumerate(ndi.find_objects(pl), 1):
        area = (pl[sl] == j).sum()
        if area < 60 or area > 2500: continue
        ys, xs = np.nonzero(pl[sl] == j); blobs.append((xs.mean() + sl[1].start, ys.mean() + sl[0].start, area))
    best = None
    for p in blobs:
        for q in blobs:
            if q[0] <= p[0] or abs(p[1] - q[1]) > 14: continue
            sep = q[0] - p[0]
            if sep < 55 or sep > 130 or not (0.5 < p[2] / q[2] < 2): continue
            my = int((p[1] + q[1]) / 2); pts = [a[my, int(p[0] + sep * f), :3].astype(int) for f in (0.3, 0.5, 0.7)]
            if any(abs(c - pts[1]).sum() > 40 for c in pts): continue
            if pts[1][0] - pts[1][2] < 40 or pink[my, int((p[0] + q[0]) / 2)]: continue
            # лицо — самая верхняя подходящая пара: ниже бывают ладони, рукава и узоры того же розового цвета
            score = -(p[1] + q[1])
            if best is None or score > best[3]: best = (p, q, sep, score)
    return best

out = {}; dbg = []
for key, st in sorted(MAN['sets'].items()):
    frames = [Image.open(os.path.join(SRC, f)).convert('RGBA') for f in st['frames']]
    arrs = [np.array(f) for f in frames]
    found = [face(a) for a in arrs]
    seps = [f[2] for f in found if f]
    if len(seps) < 3: print('!!', key, 'румянец найден только в', len(seps), 'кадрах', seps)
    assert seps, key
    sep = float(np.median(seps)); faceW = sep / 0.60
    k = 2 / (faceW / FACE_UNITS)  # общий масштаб на все шесть фаз: 2 пикселя на единицу комнаты
    # общий прямоугольник обрезки на все фазы — опорная точка одна
    boxes = [f.getbbox() for f in frames]
    x0 = min(b[0] for b in boxes); y0 = min(b[1] for b in boxes); x1 = max(b[2] for b in boxes); y1 = max(max(b[3] for b in boxes), GY + 2)
    entry = {'unit': 2, 'origin': {'x': round((GX - x0) * k), 'y': round((GY - y0) * k)}, 'frames': []}
    prev = None
    for i, (f, fd) in enumerate(zip(frames, found)):
        if fd: (bl, br, s, _) = fd; cx = (bl[0] + br[0]) / 2; by = (bl[1] + br[1]) / 2; prev = (cx, by)
        else:
            nxt = next(((g[0][0] + g[1][0]) / 2, (g[0][1] + g[1][1]) / 2) for g in found[i:] + found[:i] if g)
            cx, by = prev or nxt
        eyeY = by - faceW * 0.165; browY = eyeY - faceW * 0.125; mouthY = by + faceW * 0.06; ex = faceW * 0.185
        pts = {'eyeL': (cx - ex, eyeY), 'eyeR': (cx + ex, eyeY), 'browL': (cx - ex, browY), 'browR': (cx + ex, browY), 'mouth': (cx, mouthY)}
        for name, d in OVR.get(key, {}).get(str(i + 1), OVR.get(key, {}).get('*', {})).items(): pts[name] = (pts[name][0] + d.get('x', 0), pts[name][1] + d.get('y', 0))
        crop = f.crop((x0, y0, x1, y1)); crop = crop.resize((round(crop.width * k), round(crop.height * k)), Image.LANCZOS)
        name = f"{st['heroId']}_{st['costumeId']}_{i + 1}.webp"
        crop.save(os.path.join(OUT, name), 'WEBP', quality=88, method=4)
        fr = {'file': name, 'found': bool(fd)}
        for n, (px, py) in pts.items(): fr[n] = {'x': round((px - x0) * k), 'y': round((py - y0) * k)}
        entry['frames'].append(fr)
        entry['w'], entry['h'] = crop.width, crop.height
        t = Image.new('RGBA', crop.size, '#dfe8f0'); t.alpha_composite(crop); d = ImageDraw.Draw(t)
        for n, col in (('eyeL', '#06f'), ('eyeR', '#06f'), ('browL', '#93f'), ('browR', '#93f'), ('mouth', '#0a4')): p = fr[n]; d.line([(p['x'] - 7, p['y']), (p['x'] + 7, p['y'])], fill=col, width=3); d.line([(p['x'], p['y'] - 7), (p['x'], p['y'] + 7)], fill=col, width=3)
        o = entry['origin']; d.line([(o['x'] - 14, o['y']), (o['x'] + 14, o['y'])], fill='#f00', width=3)
        dbg.append((key, i, t, bool(fd)))
    ys = [fr['eyeL']['y'] for fr in entry['frames']]; xs = [fr['mouth']['x'] for fr in entry['frames']]
    odd = [i + 1 for i, f in enumerate(found) if f and abs(f[2] - sep) > sep * 0.12]
    jump = [i + 1 for i in range(6) if abs(ys[i] - float(np.median(ys))) > faceW * k * 0.75 or abs(xs[i] - float(np.median(xs))) > faceW * k * 0.75]
    if odd or jump: print('??', key, 'ширина лица не как в других кадрах:', odd, 'лицо далеко от обычного места:', jump)
    out[key] = entry
    print(key, 'k=%.3f' % k, entry['w'], entry['h'], 'found', sum(1 for f in found if f))
json.dump(out, open('src/content/danceSprites.json', 'w'), indent=1)
os.makedirs('art-src/debug', exist_ok=True)
keys = sorted(out)
for part in range(0, len(keys), 7):
    ks = keys[part:part + 7]; W = 150; H = 190
    sheet = Image.new('RGB', (6 * W, len(ks) * H), '#fff')
    for (key, i, t, ok) in dbg:
        if key not in ks: continue
        t = t.copy(); t.thumbnail((W - 4, H - 4)); sheet.paste(t.convert('RGB'), (i * W + 2, ks.index(key) * H + 2))
    sheet.save(f'art-src/debug/dance-{part // 7}.png')
