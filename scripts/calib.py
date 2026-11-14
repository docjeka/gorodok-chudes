# Калибровка спрайтов мебели: масштаб (единиц комнаты на пиксель) и опорная точка. Плюс отладочный лист с сеткой.
# Запуск: python3 -I scripts/calib.py [debug]
import json, sys, re
from PIL import Image, ImageDraw
S = json.load(open('art-src/slices.json'))['furn']
# целевой размер базового спрайта в единицах комнаты: ('w'|'h', значение)
T = {'sofa':('w',430),'armchair':('w',250),'coffeetable':('w',250),'shelf':('w',300),'tv':('w',290),'floorlamp':('h',390),'rug':('w',500),'plant':('h',270),
 'toybox':('w',250),'picture':('w',200),'window':('w',290),'fridge':('h',430),'counter':('w',290),'stove':('w',260),'sink':('w',250),'cupboard':('w',290),
 'blenderstand':('w',250),'table':('w',380),'chair':('h',225),'clock':('w',120),'bed':('w',500),'nightstand':('w',165),'ceilinglamp':('w',170),'wardrobe':('h',440),
 'toyshelf':('w',240),'petbed':('w',210),'bathtub':('w',450),'bathsink':('h',262),'mirror':('h',240),'bathshelf':('w',280),'laundry':('h',190),'bathmat':('w',260),'stool':('w',125)}
# состояние -> (база, по какому размеру совмещать)
ST = {'fridge_open':('fridge','h'),'cupboard_open':('cupboard','h'),'toybox_open':('toybox','w'),'nightstand_open':('nightstand','w'),'laundry_open':('laundry','w'),
 'floorlamp_on':('floorlamp','h'),'ceilinglamp_on':('ceilinglamp','w'),'stove_on':('stove','w'),'bathtub_on':('bathtub','body'),'window_night':('window','w'),'sink_on':('sink','w')}
out = {}
for name,(dim,val) in T.items():
    s = S[name]; upp = val / s[dim]
    out[name] = {'upp': round(upp,4), 'ox': s['footX'], 'oy': s['h'], 'w': s['w'], 'h': s['h']}
for name,(base,dim) in ST.items():
    s = S[name]; b = S[base]; bu = out[base]['upp']
    if dim == 'body':  # ванна с пеной: тело ванны шире из-за пены, совмещаем по высоте тела от пола до края (≈ доля)
        upp = (b['w'] * bu) / (s['w'] * 0.93)
    else:
        upp = (b[dim] * bu) / s[dim]
    ox = s['footX']
    if name == 'fridge_open': ox = s['w'] - (b['w'] * bu / upp) / 2
    out[name] = {'upp': round(upp,4), 'ox': round(ox), 'oy': s['h'], 'w': s['w'], 'h': s['h']}
out['ceilinglamp']['top'] = True; out['ceilinglamp_on']['top'] = True
json.dump(out, open('src/content/furnSprites.json','w'), indent=1)
P = json.load(open('art-src/slices.json'))['pets']; pets = {}
PH = {'cat': 118, 'dog': 112, 'rabbit': 128}
for k,h in PH.items():
    upp = h / P[f'{k}_idle']['h']
    for m in ['idle','happy','sleep','eat','play']:
        s = P[f'{k}_{m}']; pets[f'{k}_{m}'] = {'upp': round(upp,4), 'ox': s['footX'], 'oy': s['h'], 'w': s['w'], 'h': s['h']}
json.dump(pets, open('src/content/petSprites.json','w'), indent=1)
if len(sys.argv) > 1:
    names = sys.argv[2:] or list(out.keys())
    K = 1.0; cell = (560, 520); cols = 4
    sheet = Image.new('RGB', (cols*cell[0], ((len(names)+cols-1)//cols)*cell[1]), '#fff6e6'); d = ImageDraw.Draw(sheet)
    slots = json.load(open('art-src/slots.json')) if __import__('os').path.exists('art-src/slots.json') else {}
    for i,n in enumerate(names):
        m = out[n]; im = Image.open(f'public/assets/furn/{n}.png'); k = m['upp']*K
        im2 = im.resize((max(1,int(im.width*k)), max(1,int(im.height*k))), Image.LANCZOS)
        cx = (i%cols)*cell[0] + cell[0]//2; by = (i//cols)*cell[1] + cell[1] - 30
        sheet.paste(im2, (int(cx - m['ox']*k), int(by - m['oy']*k)), im2)
        for u in range(0, 500, 50):
            y = by - u*K; d.line([(cx-270, y), (cx+270, y)], fill='#8fc3f2' if u % 100 else '#6f9ad6', width=1); d.text((cx-268, y-11), str(-u), fill='#345')
        for u in range(-250, 251, 50):
            x = cx + u*K; d.line([(x, by-480), (x, by)], fill='#cfe', width=1); d.text((x+2, by+2), str(u), fill='#345')
        d.text((cx-260, by-500), n, fill='#d33')
        base = n.split('_')[0]
        for kind,col in (('surfaces','#e33'),('seats','#22c'),('slots','#2a2'),('petSeats','#a2a')):
            for p in slots.get(base, {}).get(kind, []):
                if kind == 'slots' and '_open' not in n: continue
                x = cx + p['x']*K; y = by + p['y']*K; d.ellipse([x-5,y-5,x+5,y+5], fill=col)
    sheet.save('.studioigor/captures/sheets/calib.png'); print(sheet.size)
