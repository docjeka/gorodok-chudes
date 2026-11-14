# Нарезка присланных листов по связным областям альфа-канала. Запуск: python3 -I scripts/slice.py
import numpy as np, json, os
from PIL import Image
from scipy import ndimage as ndi

def slice_sheet(path, cols, rows, names, outdir):
    im = Image.open(path).convert('RGBA'); a = np.array(im)
    alpha = a[..., 3] > 24
    lab, n = ndi.label(ndi.binary_dilation(alpha, iterations=4))
    H, W = alpha.shape; cw, ch = W / cols, H / rows
    cells = {}
    for i, sl in enumerate(ndi.find_objects(lab), 1):
        ys, xs = sl
        if (lab[sl] == i).sum() < 80: continue
        key = (int(((ys.start + ys.stop) / 2) // ch), int(((xs.start + xs.stop) / 2) // cw))
        b = cells.get(key, [xs.start, ys.start, xs.stop, ys.stop])
        cells[key] = [min(b[0], xs.start), min(b[1], ys.start), max(b[2], xs.stop), max(b[3], ys.stop)]
    os.makedirs(outdir, exist_ok=True)
    out = {}
    for idx, name in enumerate(names):
        if name.startswith('_'): continue
        key = (idx // cols, idx % cols)
        if key not in cells: print('MISSING', name); continue
        x0, y0, x1, y1 = cells[key]
        crop = im.crop((max(0, x0), max(0, y0), min(W, x1), min(H, y1)))
        bb = crop.getbbox(); crop = crop.crop(bb)
        crop.save(f'{outdir}/{name}.png')
        al = np.array(crop)[..., 3] > 40
        h = al.shape[0]
        foot = al[int(h * 0.88):, :]
        xs = np.where(foot.any(axis=0))[0]
        out[name] = {'w': crop.width, 'h': crop.height, 'footX': int(round((xs.min() + xs.max()) / 2))}
    return out

man = {}
man['furn'] = {}
man['furn'].update(slice_sheet('art-src/user/furniture-base-v1.png', 6, 3, 'sofa armchair coffeetable shelf tv floorlamp rug plant toybox picture window fridge counter stove sink cupboard blenderstand table'.split(), 'public/assets/furn'))
man['furn'].update(slice_sheet('art-src/user/furniture-extra-v1.png', 6, 3, 'chair clock bed nightstand ceilinglamp wardrobe toyshelf petbed bathtub bathsink mirror bathshelf laundry bathmat stool'.split(), 'public/assets/furn'))
man['furn'].update(slice_sheet('art-src/user/furniture-states-v1.png', 6, 2, 'fridge_open cupboard_open toybox_open nightstand_open laundry_open _skip floorlamp_on ceilinglamp_on stove_on bathtub_on window_night sink_on'.split(), 'public/assets/furn'))
man['pets'] = slice_sheet('art-src/user/pets-v1.png', 5, 3, [f'{k}_{m}' for k in ['cat', 'dog', 'rabbit'] for m in ['idle', 'happy', 'sleep', 'eat', 'play']], 'public/assets/pets')
os.makedirs('public/assets/rooms', exist_ok=True)
for i, n in enumerate(['cream', 'mint', 'lavender', 'bath']):
    Image.open(f'art-src/user/room-{n}.png').convert('RGB').resize((1600, 900), Image.LANCZOS).save(f'public/assets/rooms/room{i}.jpg', quality=88)
json.dump(man, open('art-src/slices.json', 'w'), indent=1)
print({k: len(v) for k, v in man.items()})
for n in ['sofa','coffeetable','bed','bathtub','bathtub_on','fridge','fridge_open','toyshelf','table','cat_idle','dog_idle','rabbit_idle']:
    d = (man['furn'].get(n) or man['pets'].get(n)); print(n, d)
