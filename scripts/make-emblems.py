"""產生七個國家的單色標誌：public/ink/emblems/XX.svg（CSS mask 用）與 lib/emblems.js（地圖 Path2D 用）。
圖案刻意避開敏感符號：日＝日輪、英＝都鐸玫瑰、美＝五角星、義＝月桂冠、法＝鳶尾花、德＝橡葉、蘇＝星與麥穗。
用法：python3 scripts/make-emblems.py"""
import math, random, os, json
ROOT = os.path.join(os.path.dirname(__file__), '..')
r = random.Random(5)
def poly(pts): return 'M' + ' L'.join(f'{x:.1f} {y:.1f}' for x, y in pts) + 'Z'
def circ(cx, cy, rad, n=48, rev=False, wob=0.0):
    pts = [(cx + math.cos(i / n * 6.2832) * rad * (1 + wob * (r.random() - .5)), cy + math.sin(i / n * 6.2832) * rad * (1 + wob * (r.random() - .5))) for i in range(n)]
    return poly(pts[::-1] if rev else pts)
def ell(cx, cy, rx, ry, rot, n=18):
    c, s = math.cos(rot), math.sin(rot)
    return poly([(cx + math.cos(i / n * 6.2832) * rx * c - math.sin(i / n * 6.2832) * ry * s, cy + math.cos(i / n * 6.2832) * rx * s + math.sin(i / n * 6.2832) * ry * c) for i in range(n)])
def star(cx, cy, ro, ri, rot=-math.pi / 2):
    return poly([(cx + math.cos(rot + i * math.pi / 5) * (ro if i % 2 == 0 else ri), cy + math.sin(rot + i * math.pi / 5) * (ro if i % 2 == 0 else ri)) for i in range(10)])

E = {}
E['JP'] = [circ(50, 50, 35, 72, wob=0.05)]
E['UK'] = [ell(50 + math.cos(a) * 29, 50 + math.sin(a) * 29, 15.5, 15.5, 0) for a in [-math.pi / 2 + i * 6.2832 / 5 for i in range(5)]] + [circ(50, 50, 9.5, 36)]
E['US'] = [star(50, 52, 42, 17)]
wreath = []
for s in (-1, 1):
    for i in range(9):
        a = math.pi / 2 + s * (0.3 + i * 0.3); px, py = 50 + math.cos(a) * 34, 50 + math.sin(a) * 34
        rr = 32 if i % 2 else 37; px, py = 50 + math.cos(a) * rr, 50 + math.sin(a) * rr
        wreath.append(ell(px, py, 8.5, 3.6, a + s * math.pi / 2 + (0.5 if i % 2 else -0.5) * s))
wreath.append(poly([(48, 82), (52, 82), (52, 94), (48, 94)]))
E['IT'] = wreath
E['FR'] = ['M50 6 C61 21 63 38 50 58 C37 38 39 21 50 6Z',
           'M45 54 C31 57 14 49 14 31 C23 35 30 33 34 26 C33 38 39 47 45 54Z', 'M55 54 C69 57 86 49 86 31 C77 35 70 33 66 26 C67 38 61 47 55 54Z',
           'M30 58 L70 58 L70 67 L30 67Z', 'M50 67 C41 73 40 84 32 93 C41 91 47 89 50 81 C53 89 59 91 68 93 C60 84 59 73 50 67Z']
leaf = []
for side in (-1, 1):
    for k in range(60):
        t = k / 59; w = 24 * (math.sin(math.pi * t) ** 0.6) * (1 + 0.38 * math.sin(t * math.pi * 6 + 0.4))
        leaf.append((50 + side * max(1.2, w), 92 - 82 * t))
    if side == -1: leaf = leaf[:]; left = leaf; leaf = []
right = leaf[::-1]
E['DE'] = [poly(left + right), 'M48.5 80 L51.5 80 L51.5 98 L48.5 98Z']
wheat = [star(50, 18, 14, 5.6)]
for s_ in (-1, 1):
    pts_l, pts_r = [], []
    for i in range(30):
        t = i / 29; px = 50 + s_ * (6 + 30 * t * (1.15 - 0.3 * t)); py = 96 - 56 * t
        pts_l.append((px - 1.2, py)); pts_r.append((px + 1.2, py))
    wheat.append(poly(pts_l + pts_r[::-1]))
    for i in range(1, 7):
        t = i / 6; px = 50 + s_ * (6 + 30 * t * (1.15 - 0.3 * t)); py = 96 - 56 * t
        for o in (-1, 1):
            wheat.append(ell(px + s_ * o * 5.2, py - 3, 3.2, 8, s_ * (0.35 + 0.3 * t) + o * 0.45))
E['SU'] = wheat

os.makedirs(os.path.join(ROOT, 'public', 'ink', 'emblems'), exist_ok=True)
for k, ds in E.items():
    with open(os.path.join(ROOT, 'public', 'ink', 'emblems', f'{k}.svg'), 'w', encoding='utf-8') as fp:
        fp.write('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">' + ''.join(f'<path d="{d}" fill="#000"/>' for d in ds) + '</svg>')
with open(os.path.join(ROOT, 'lib', 'emblems.js'), 'w', encoding='utf-8') as fp:
    fp.write('// 由 scripts/make-emblems.py 產生；100×100 的單色標誌路徑，地圖畫布用 Path2D 畫。\nexport const EMBLEMS = ' + json.dumps(E, ensure_ascii=False) + ';\n')
print('ok', {k: len(v) for k, v in E.items()})
