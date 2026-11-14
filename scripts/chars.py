# Нарезка листа фигурок и расстановка точек: опора (ступни/посадка), глаза, брови, рот, кисти.
# Точки ищутся по румянцу и цвету кожи; ручные поправки — в OVERRIDES. Запуск: python3 -I scripts/chars.py <лист> 
import sys, json, os
import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage as ndi

# Запуск: python3 -I scripts/chars.py <лист> <колонок> <рядов> герой:костюм,герой:костюм,…
# Каждая пара «герой:костюм» — две фигурки подряд: стоя, затем сидя. Результат дописывается в общий манифест.
SHEET = sys.argv[1]
COLS, ROWS = int(sys.argv[2]), int(sys.argv[3])
ORDER = [(hs.split(':')[0], hs.split(':')[1], p) for hs in sys.argv[4].split(',') for p in ('stand', 'sit')]
FACE_UNITS = 104      # ширина лица в единицах комнаты — общий масштаб героя
OVERRIDES = json.load(open('art-src/char-overrides.json')) if os.path.exists('art-src/char-overrides.json') else {}

im = Image.open(SHEET).convert('RGBA'); A = np.array(im)
alpha = A[..., 3] > 30
if alpha.all():  # фон не прозрачный: убираем белый
    rgb = A[..., :3].astype(int); bg = (rgb.min(axis=2) > 244)
    lab, _ = ndi.label(bg); edge = set(np.unique(np.concatenate([lab[0], lab[-1], lab[:, 0], lab[:, -1]]))) - {0}
    mask = np.isin(lab, list(edge)); A[mask, 3] = 0; alpha = A[..., 3] > 30; im = Image.fromarray(A)
lab, n = ndi.label(ndi.binary_dilation(alpha, iterations=3))
H, W = alpha.shape; cw, ch = W / COLS, H / ROWS
cells = {}
for i, sl in enumerate(ndi.find_objects(lab), 1):
    ys, xs = sl
    if (lab[sl] == i).sum() < 400: continue
    key = (int(((ys.start + ys.stop) / 2) // ch), int(((xs.start + xs.stop) / 2) // cw))
    b = cells.get(key, [xs.start, ys.start, xs.stop, ys.stop])
    cells[key] = [min(b[0], xs.start), min(b[1], ys.start), max(b[2], xs.stop), max(b[3], ys.stop)]

os.makedirs('public/assets/chars', exist_ok=True)
MAN = 'src/content/charSprites.json'
manifest = json.load(open(MAN)) if os.path.exists(MAN) else {}; debug = []
for idx, (hero, st, pose) in enumerate(ORDER):
    x0, y0, x1, y1 = cells[(idx // COLS, idx % COLS)]
    crop = im.crop((x0, y0, x1, y1)); crop = crop.crop(crop.getbbox())
    a = np.array(crop); h, w = a.shape[:2]; op = a[..., 3] > 60
    r, g, b = [a[..., k].astype(int) for k in range(3)]
    # румянец: насыщенный розовый в верхней части
    pink = op & (r > 212) & (g > 95) & (g < 185) & (b > 75) & (b < 185) & (r - g > 85) & (np.abs(g - b) < 45)
    pink[int(h * 0.62):] = False
    pl, pn = ndi.label(pink); blobs = []
    for j, sl in enumerate(ndi.find_objects(pl), 1):
        area = (pl[sl] == j).sum()
        if area < w * h * 0.0012 or area > w * h * 0.02: continue
        cy, cx = ndi.center_of_mass(pl == j); blobs.append((cx, cy, area))
    best = None
    for p in blobs:
        for q in blobs:
            if q[0] <= p[0] or abs(p[1] - q[1]) > h * 0.03: continue
            sep = q[0] - p[0]
            if sep < w * 0.15: continue
            # лицо: между пятнами должен быть цвет кожи одного тона
            # между пятнами должна быть ровная кожа (у банта и бус посередине бусина или ткань другого цвета)
            my = int((p[1] + q[1]) / 2); pts = [a[my, int(p[0] + (q[0] - p[0]) * f), :3].astype(int) for f in (0.3, 0.5, 0.7)]
            if any(abs(int(c[0]) - int(pts[1][0])) + abs(int(c[1]) - int(pts[1][1])) + abs(int(c[2]) - int(pts[1][2])) > 40 for c in pts): continue
            if pts[1][0] - pts[1][2] < 40 or pink[my, int((p[0] + q[0]) / 2)]: continue
            score = p[2] + q[2]  # румянец — самые крупные симметричные розовые пятна (бусины и резинки мельче)
            if best is None or score > best[3]: best = (p, q, sep, score)
    assert best, f'румянец не найден: {hero} {st} {pose} {blobs} size={w}x{h} pink={int(pink.sum())} comps={pn} areas={sorted([int((pl[s]==j).sum()) for j,s in enumerate(ndi.find_objects(pl),1)])[-6:]}'
    (bl, br, sep, _score) = best
    cx = (bl[0] + br[0]) / 2; by = (bl[1] + br[1]) / 2
    skin = a[int(by), int(cx), :3].astype(int)
    faceW = sep / 0.60
    unit = faceW / FACE_UNITS
    eyeY = by - faceW * 0.165; browY = eyeY - faceW * 0.125; mouthY = by + faceW * 0.06; ex = faceW * 0.185
    # кисти: пятна цвета кожи ниже лица, по бокам
    sk = op & (np.abs(r - skin[0]) < 30) & (np.abs(g - skin[1]) < 30) & (np.abs(b - skin[2]) < 30)
    sk[:int(by + faceW * 0.45)] = False
    sl_, sn = ndi.label(sk); hands = []
    for j, s2 in enumerate(ndi.find_objects(sl_), 1):
        area = (sl_[s2] == j).sum()
        if area < w * h * 0.003: continue
        comp = (sl_ == j); rows = np.where(comp.any(axis=1))[0]
        cut = int(rows.max() - (rows.max() - rows.min()) * 0.35)  # кисть — нижняя часть пятна «рука»
        low = comp.copy(); low[:cut] = False
        cyy, cxx = ndi.center_of_mass(low)
        if abs(cxx - cx) > faceW * 0.33 and cyy < h * 0.9: hands.append((cxx, cyy, area))
    left = min(hands, key=lambda t: t[0]) if hands else (cx - faceW * 0.5, h * 0.62, 0)
    right = max(hands, key=lambda t: t[0]) if hands else (cx + faceW * 0.5, h * 0.62, 0)
    # опора: стоя — середина ступней у нижнего края; сидя — точка посадки чуть выше обуви
    foot = op[int(h * 0.93):, :]; xs = np.where(foot.any(axis=0))[0]; footX = (xs.min() + xs.max()) / 2
    footX = cx  # фигурки симметричны; хвост дракона не должен сдвигать опору
    origin = {'x': footX, 'y': h - 3} if pose == 'stand' else {'x': footX, 'y': h * 0.86}
    key = f'{hero}:{st}:{pose}'
    m = {'file': f'{hero}_{st}_{pose}.webp', 'w': w, 'h': h, 'unit': round(unit, 4), 'origin': origin,
         'eyeL': {'x': cx - ex, 'y': eyeY}, 'eyeR': {'x': cx + ex, 'y': eyeY}, 'browL': {'x': cx - ex, 'y': browY}, 'browR': {'x': cx + ex, 'y': browY},
         'mouth': {'x': cx, 'y': mouthY}, 'handL': {'x': left[0], 'y': left[1]}, 'handR': {'x': right[0], 'y': right[1]}, 'faceScale': 1.18}
    for k, v in OVERRIDES.get(key, {}).items():  # поправки заданы долями ширины и высоты спрайта
        if isinstance(v, dict): m[k] = {'x': v['x'] * w if 'x' in v else m[k]['x'], 'y': v['y'] * h if 'y' in v else m[k]['y']}
        else: m[k] = v
    # приводим все спрайты к 2 пикселям на единицу комнаты: одинаковый размер головы и лёгкие файлы
    f = 2 / m['unit']
    crop = crop.resize((max(1, round(w * f)), max(1, round(h * f))), Image.LANCZOS)
    for k, v in list(m.items()):
        if isinstance(v, dict): m[k] = {'x': v['x'] * f, 'y': v['y'] * f}
    m['w'], m['h'], m['unit'] = crop.width, crop.height, 2
    w, h, unit = crop.width, crop.height, 2
    for k, v in m.items():
        if isinstance(v, dict): m[k] = {'x': round(v['x']), 'y': round(v['y'])}
    manifest[key] = m
    crop.save(f"public/assets/chars/{m['file']}", 'WEBP', quality=90, method=6)
    dbg = crop.copy().convert('RGBA'); bgim = Image.new('RGBA', dbg.size, '#dfe8f0'); bgim.alpha_composite(dbg); d = ImageDraw.Draw(bgim)
    def cross(p, col, r=9): d.line([(p['x'] - r, p['y']), (p['x'] + r, p['y'])], fill=col, width=3); d.line([(p['x'], p['y'] - r), (p['x'], p['y'] + r)], fill=col, width=3)
    for k, col in (('eyeL', '#06f'), ('eyeR', '#06f'), ('browL', '#93f'), ('browR', '#93f'), ('mouth', '#0a4'), ('handL', '#f80'), ('handR', '#f80')): cross(m[k], col)
    cross(m['origin'], '#f00', 16); d.text((4, 4), f"{key} unit={m['unit']} h={round(h / unit)}u", fill='#000')
    debug.append(bgim)
# сидя: точка посадки на одном расстоянии от глаз у всех костюмов героя — голова не прыгает при смене наряда
for hero in sorted({k.split(':')[0] for k in manifest}):
    ks = [k for k in manifest if k.startswith(hero) and k.endswith(':sit')]
    med = float(np.median([manifest[k]['origin']['y'] - manifest[k]['eyeL']['y'] for k in ks]))
    for k in ks: manifest[k]['origin']['y'] = round(manifest[k]['eyeL']['y'] + med)
json.dump(manifest, open(MAN, 'w'), indent=1)
cwid = max(i.width for i in debug); chei = max(i.height for i in debug)
sheet = Image.new('RGB', (cwid * COLS, chei * ROWS), 'white')
for i, d_ in enumerate(debug): sheet.paste(d_.convert('RGB'), ((i % COLS) * cwid, (i // COLS) * chei))
sheet.thumbnail((2000, 2000)); name = os.path.splitext(os.path.basename(SHEET))[0]
sheet.save(f'.studioigor/captures/sheets/anchors-{name}.png'); print(len(ORDER), 'спрайтов;', len(manifest), 'в манифесте')
