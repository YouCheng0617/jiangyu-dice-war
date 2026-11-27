"""產生水墨點綴用的 SVG（毛筆線（標題底線））到 public/ink/。
這些圖只有「濃淡」（alpha），顏色由 CSS 的 mask 決定，所以每個主題都能換色。
用法：python3 scripts/make-ink-art.py    （固定亂數種子，重跑會得到同樣的圖；想換構圖就改 seed）"""
import math, random, os

OUT = os.path.join(os.path.dirname(__file__), '..', 'public', 'ink')
os.makedirs(OUT, exist_ok=True)

def f(x): return f'{x:.1f}'

def catmull(pts, n=10):
    out = []
    P = [pts[0]] + pts + [pts[-1]]
    for i in range(1, len(P) - 2):
        p0, p1, p2, p3 = P[i - 1], P[i], P[i + 1], P[i + 2]
        for k in range(n):
            t = k / n
            t2, t3 = t * t, t * t * t
            out.append(tuple(0.5 * ((2 * p1[j]) + (-p0[j] + p2[j]) * t + (2 * p0[j] - 5 * p1[j] + 4 * p2[j] - p3[j]) * t2 + (-p0[j] + 3 * p1[j] - 3 * p2[j] + p3[j]) * t3) for j in (0, 1)))
    out.append(pts[-1])
    return out

def stroke(pts, w0, w1, rnd, wob=0.15, mid=1.0, n=10):
    """毛筆筆畫：沿著曲線、寬度從 w0 漸變到 w1，中段略粗（mid），邊緣有些微抖動；回傳 path 的 d。"""
    d = catmull(pts, n)
    L, R = [], []
    for i, (x, y) in enumerate(d):
        a = d[max(0, i - 1)]; b = d[min(len(d) - 1, i + 1)]
        dx, dy = b[0] - a[0], b[1] - a[1]
        m = math.hypot(dx, dy) or 1
        nx, ny = -dy / m, dx / m
        t = i / (len(d) - 1)
        w = (w0 + (w1 - w0) * t) * (1 + (mid - 1) * math.sin(math.pi * t)) * (1 + (rnd.random() - 0.5) * wob)
        w = max(0.4, w)
        L.append((x + nx * w / 2, y + ny * w / 2)); R.append((x - nx * w / 2, y - ny * w / 2))
    pts2 = L + R[::-1]
    return 'M' + ' L'.join(f'{f(x)} {f(y)}' for x, y in pts2) + 'Z'

def rough(id_, seed, scale=3, freq=0.04, blur=0.4):
    return (f'<filter id="{id_}" x="-8%" y="-8%" width="116%" height="116%"><feTurbulence type="fractalNoise" baseFrequency="{freq}" numOctaves="3" seed="{seed}" result="n"/>'
            f'<feDisplacementMap in="SourceGraphic" in2="n" scale="{scale}"/><feGaussianBlur stdDeviation="{blur}"/></filter>')

def svg(w, h, body, defs='', par='xMidYMid meet'):
    return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {w} {h}" preserveAspectRatio="{par}"><defs>{defs}</defs>{body}</svg>'

def write(name, s):
    with open(os.path.join(OUT, name), 'w', encoding='utf-8') as fp: fp.write(s)
    print(name, len(s) // 1024, 'KB')

def noise1(rnd, n=64):
    v = [rnd.random() for _ in range(n + 2)]
    def g(x):
        x = x % n; i = int(x); t = x - i; t = t * t * (3 - 2 * t)
        return v[i] * (1 - t) + v[i + 1] * t
    return g

# ── 毛筆線（分隔線、標題底線） ──
def brush_line():
    r = random.Random(11)
    W, H = 600, 28
    body = ''
    body += f'<path d="{stroke([(8, 15), (150, 12), (300, 16), (450, 12), (592, 14)], 4.6, 1.6, r, 0.35, 2.6)}" fill="#000" opacity=".92"/>'
    # 飛白：幾條細的斷續筆絲
    for k in range(5):
        y = 15 + (r.random() - 0.5) * 7
        x = 20 + r.random() * 60
        while x < 560:
            seg = 30 + r.random() * 120
            body += f'<path d="{stroke([(x, y), (x + seg / 2, y + (r.random() - 0.5) * 2), (x + seg, y + (r.random() - 0.5) * 2)], 1.1, 0.5, r, 0.3)}" fill="#000" opacity="{0.35 + r.random() * 0.35:.2f}"/>'
            x += seg + 10 + r.random() * 40
    body += '<circle cx="592" cy="15" r="2.4" fill="#000" opacity=".85"/><circle cx="12" cy="13" r="1.6" fill="#000" opacity=".6"/>'
    write('brush-line.svg', svg(W, H, f'<g filter="url(#r)">{body}</g>', rough('r', 2, 2.5, 0.06, 0.3), 'none'))

if __name__ == '__main__':
    brush_line()
