#!/usr/bin/env python3
"""Generate the LazyVlogRecorder app icon: a Martian HUD record button.
Rendered at 2x then downscaled for smooth edges."""
import math
from PIL import Image, ImageDraw, ImageFilter

S = 2048  # supersample size
R = int(S * 0.225)  # corner radius (squircle-ish)
CX = CY = S / 2

CYAN = (126, 224, 233)
CYAN_BRIGHT = (208, 250, 255)
RED = (226, 78, 60)


def rounded_mask():
    m = Image.new("L", (S, S), 0)
    ImageDraw.Draw(m).rounded_rectangle([0, 0, S - 1, S - 1], radius=R, fill=255)
    return m


def base_gradient():
    img = Image.new("RGB", (S, S))
    d = ImageDraw.Draw(img)
    top = (10, 16, 22)
    bot = (26, 15, 10)
    for y in range(S):
        t = y / S
        c = tuple(int(top[i] + (bot[i] - top[i]) * t) for i in range(3))
        d.line([(0, y), (S, y)], fill=c)
    return img


def radial_glow(cx, cy, radius, color, strength=1.0):
    g = Image.new("L", (S, S), 0)
    dg = ImageDraw.Draw(g)
    steps = 60
    for i in range(steps, 0, -1):
        rr = radius * i / steps
        a = int(255 * strength * (1 - i / steps) ** 2)
        dg.ellipse([cx - rr, cy - rr, cx + rr, cy + rr], fill=a)
    layer = Image.new("RGB", (S, S), color)
    out = Image.new("RGB", (S, S), (0, 0, 0))
    out.paste(layer, (0, 0), g)
    return out


def screen(base, add):
    # additive-ish screen blend
    from PIL import ImageChops
    return ImageChops.screen(base, add)


def draw_arcs(size, lw):
    """Draw the HUD gauge ring on a transparent RGBA image."""
    img = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)

    def arc(r, a0, a1, color, width, alpha=255):
        d.arc([CX - r, CY - r, CX + r, CY + r], a0, a1, fill=color + (alpha,), width=width)

    r1 = S * 0.30
    # main dial: 270-degree arc, teal
    arc(r1, 135, 135 + 300, CYAN, lw)
    # inner thin arc
    arc(S * 0.235, -40, 200, CYAN, max(2, lw // 2), alpha=180)
    # outer broken arcs (segments)
    ro = S * 0.355
    for seg in range(0, 360, 30):
        arc(ro, seg + 4, seg + 22, CYAN, max(2, lw // 3), alpha=140)
    # tick marks around main dial
    for ang in range(135, 135 + 300, 15):
        a = math.radians(ang)
        r_in = r1 - lw * 1.4
        r_out = r1 - lw * 0.2
        x0, y0 = CX + r_in * math.cos(a), CY + r_in * math.sin(a)
        x1, y1 = CX + r_out * math.cos(a), CY + r_out * math.sin(a)
        d.line([(x0, y0), (x1, y1)], fill=CYAN + (170,), width=max(2, lw // 3))
    return img


def corner_brackets():
    img = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    m = int(S * 0.11)
    ln = int(S * 0.10)
    w = max(3, int(S * 0.008))
    col = CYAN + (150,)
    pts = [
        # (corner x, y, dx, dy)
        (m, m, 1, 1), (S - m, m, -1, 1),
        (m, S - m, 1, -1), (S - m, S - m, -1, -1),
    ]
    for x, y, dx, dy in pts:
        d.line([(x, y), (x + dx * ln, y)], fill=col, width=w)
        d.line([(x, y), (x, y + dy * ln)], fill=col, width=w)
    return img


def main():
    mask = rounded_mask()

    img = base_gradient().convert("RGB")

    # Mars horizon glow (bottom), rust-orange
    mars = radial_glow(CX, S * 0.92, S * 0.55, (150, 70, 24), strength=0.9)
    img = screen(img, mars)

    # cyan center aura (subtle)
    aura = radial_glow(CX, CY, S * 0.42, (24, 66, 78), strength=0.7)
    img = screen(img, aura)

    # scanlines
    sl = Image.new("L", (S, S), 0)
    dsl = ImageDraw.Draw(sl)
    gap = max(3, int(S * 0.006))
    for y in range(0, S, gap * 2):
        dsl.line([(0, y), (S, y)], fill=14, width=gap)
    dark = Image.new("RGB", (S, S), (0, 0, 0))
    img = Image.composite(dark, img, sl)

    img = img.convert("RGBA")

    # HUD arcs + glow
    lw = max(6, int(S * 0.016))
    arcs = draw_arcs(S, lw)
    glow = arcs.filter(ImageFilter.GaussianBlur(S * 0.012))
    img.alpha_composite(glow)
    img.alpha_composite(glow)
    img.alpha_composite(arcs)

    # corner brackets
    img.alpha_composite(corner_brackets())

    # center record dot (red) with glow
    dot = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    dd = ImageDraw.Draw(dot)
    rr = S * 0.115
    dd.ellipse([CX - rr, CY - rr, CX + rr, CY + rr], fill=RED + (255,))
    dot_glow = dot.filter(ImageFilter.GaussianBlur(S * 0.03))
    img.alpha_composite(dot_glow)
    img.alpha_composite(dot_glow)
    img.alpha_composite(dot)
    # inner highlight on dot
    dh = ImageDraw.Draw(img)
    hr = rr * 0.45
    dh.ellipse([CX - hr, CY - hr - rr * 0.2, CX + hr, CY + hr - rr * 0.2],
               fill=(255, 150, 130, 120))

    # apply rounded mask (transparent corners)
    a = img.split()[3]
    from PIL import ImageChops
    a = ImageChops.multiply(a, mask)
    img.putalpha(a)

    out = img.resize((1024, 1024), Image.LANCZOS)
    path = "/Users/harry/Projects/LazyVlogRecorder/assets/app-icon-source.png"
    out.save(path)
    print("saved", path)


if __name__ == "__main__":
    main()
