"""
Icone per Vincolo.

Il vincolo di progetto vero è il 16px della barra di Chrome: lì sopravvive una
forma sola, spessa, con al massimo un buco. Tutto il resto è decorazione che si
vedrà solo nello store.

Niente lucchetti (sicurezza) e niente simboli di divieto (l'estensione informa,
non proibisce): il segno è un anello che si può aprire.
"""
from PIL import Image, ImageDraw
import math

INK = (22, 25, 31, 255)
WHITE = (255, 255, 255, 255)
AMBER = (194, 98, 15, 255)
S = 10  # supersampling


def canvas(s, bg=INK, radius=0.22):
    img = Image.new('RGBA', (s, s), (0, 0, 0, 0))
    ImageDraw.Draw(img).rounded_rectangle([0, 0, s - 1, s - 1], radius=int(s * radius), fill=bg)
    return img


def ring(s, cx, cy, rx, ry, stroke, gap=0, gap_center=315, stadium=None, rot=0):
    """
    Maschera di un anello, eventualmente aperto.
    Costruito per sottrazione di forme piene: è l'unico modo, con PIL, di
    ottenere bordi netti — una polilinea spessa lascia una scia frastagliata.
    """
    m = Image.new('L', (s, s), 0)
    d = ImageDraw.Draw(m)
    if stadium is None:
        d.ellipse([cx - rx, cy - ry, cx + rx, cy + ry], fill=255)
        d.ellipse([cx - rx + stroke, cy - ry + stroke, cx + rx - stroke, cy + ry - stroke], fill=0)
    else:
        d.rounded_rectangle([cx - rx, cy - ry, cx + rx, cy + ry], radius=stadium, fill=255)
        d.rounded_rectangle([cx - rx + stroke, cy - ry + stroke, cx + rx - stroke, cy + ry - stroke],
                            radius=max(1, stadium - stroke), fill=0)
    if gap:
        r = max(rx, ry) * 2.2
        d.pieslice([cx - r, cy - r, cx + r, cy + r], gap_center - gap / 2, gap_center + gap / 2, fill=0)
        for a in (gap_center - gap / 2, gap_center + gap / 2):
            ar = math.radians(a)
            ex = cx + (rx - stroke / 2) * math.cos(ar)
            ey = cy + (ry - stroke / 2) * math.sin(ar)
            d.ellipse([ex - stroke / 2, ey - stroke / 2, ex + stroke / 2, ey + stroke / 2], fill=255)
    if rot:
        m = m.rotate(rot, resample=Image.BICUBIC, center=(cx, cy))
    return m


def paint(img, mask, color):
    layer = Image.new('RGBA', img.size, color)
    img.paste(layer, (0, 0), mask)


# ── 1. L'anello aperto ──────────────────────────────────────────────────────
def v1(size):
    """
    Forma di stadio e non cerchio: un cerchio con un'apertura e gli estremi
    arrotondati si legge come il simbolo di ricarica, che è l'ultima cosa che
    questa icona deve suggerire.
    """
    s = size * S
    img = canvas(s)
    m = ring(s, s * .5, s * .5, s * .345, s * .225, s * .105,
               gap=52, gap_center=0, stadium=s * .225, rot=-38)
    paint(img, m, WHITE)
    return img.resize((size, size), Image.LANCZOS)


# ── 2. Due anelli, uno si apre ──────────────────────────────────────────────
def v2(size):
    s = size * S
    img = canvas(s)
    left = ring(s, s * .385, s * .5, s * .225, s * .225, s * .095)
    right = ring(s, s * .615, s * .5, s * .225, s * .225, s * .095, gap=80, gap_center=330)
    paint(img, left, WHITE)
    paint(img, right, AMBER)
    # l'anello sinistro passa sopra: senza questo si perde l'incastro
    above = Image.new('L', (s, s), 0)
    ImageDraw.Draw(above).rectangle([0, 0, s * .5, s], fill=255)
    paint(img, Image.composite(left, Image.new('L', (s, s), 0), above), WHITE)
    return img.resize((size, size), Image.LANCZOS)


# ── 3. Monogramma: la V dentro l'anello ─────────────────────────────────────
def v3(size):
    s = size * S
    img = canvas(s)
    m = ring(s, s * .5, s * .5, s * .335, s * .335, s * .085, gap=86, gap_center=270)
    paint(img, m, WHITE)
    # la V, tracciata come poligono pieno per avere spigoli netti
    w = s * .085
    ax, ay = s * .335, s * .375
    bx, by = s * .5, s * .655
    cx2, cy2 = s * .665, s * .375
    glyph = Image.new('L', (s, s), 0)
    draw_v = ImageDraw.Draw(glyph)
    draw_v.polygon([(ax, ay), (ax + w, ay), (bx + w * .0, by), (bx - w * .0, by)], fill=255)
    draw_v.line([(ax + w / 2, ay), (bx, by - w / 2)], fill=255, width=int(w))
    draw_v.line([(cx2 - w / 2, ay), (bx, by - w / 2)], fill=255, width=int(w))
    for p in ((ax + w / 2, ay), (cx2 - w / 2, ay), (bx, by - w / 2)):
        draw_v.ellipse([p[0] - w / 2, p[1] - w / 2, p[0] + w / 2, p[1] + w / 2], fill=255)
    paint(img, glyph, WHITE)
    return img.resize((size, size), Image.LANCZOS)


VARIANTS = {'v1': v1, 'v2': v2, 'v3': v3}

if __name__ == '__main__':
    import sys, os
    out = sys.argv[1] if len(sys.argv) > 1 else '/tmp/icone'
    os.makedirs(out, exist_ok=True)
    for name, fn in VARIANTS.items():
        for size in (16, 32, 48, 128, 256):
            fn(size).save(f'{out}/{name}-{size}.png')
    print('generate')
