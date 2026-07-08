#!/usr/bin/env python3
"""Generate the LazyVlogRecorder app icon: a simple Martian record button —
one teal ring + a red record dot on a dark graphite square. Rendered at 2x
then downscaled for smooth edges."""
from PIL import Image, ImageDraw, ImageFilter, ImageChops

S = 2048  # supersample size
R = int(S * 0.225)  # corner radius
CX = CY = S / 2

CYAN = (126, 224, 233)
RED = (226, 78, 60)


def rounded_mask():
    m = Image.new("L", (S, S), 0)
    ImageDraw.Draw(m).rounded_rectangle([0, 0, S - 1, S - 1], radius=R, fill=255)
    return m


def base_gradient():
    img = Image.new("RGB", (S, S))
    d = ImageDraw.Draw(img)
    top, bot = (12, 18, 24), (18, 12, 10)
    for y in range(S):
        t = y / S
        d.line([(0, y), (S, y)], fill=tuple(int(top[i] + (bot[i] - top[i]) * t) for i in range(3)))
    return img


def radial_glow(cx, cy, radius, color, strength=1.0):
    g = Image.new("L", (S, S), 0)
    dg = ImageDraw.Draw(g)
    steps = 60
    for i in range(steps, 0, -1):
        rr = radius * i / steps
        dg.ellipse([cx - rr, cy - rr, cx + rr, cy + rr],
                   fill=int(255 * strength * (1 - i / steps) ** 2))
    layer = Image.new("RGB", (S, S), color)
    out = Image.new("RGB", (S, S), (0, 0, 0))
    out.paste(layer, (0, 0), g)
    return out


def main():
    mask = rounded_mask()
    img = base_gradient()

    # subtle warm glow at the bottom (Mars horizon), kept minimal
    img = ImageChops.screen(img, radial_glow(CX, S * 0.95, S * 0.5, (120, 55, 20), 0.55))
    img = img.convert("RGBA")

    # single clean teal ring
    ring = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    r = S * 0.30
    lw = max(6, int(S * 0.022))
    ImageDraw.Draw(ring).ellipse([CX - r, CY - r, CX + r, CY + r], outline=CYAN + (255,), width=lw)
    glow = ring.filter(ImageFilter.GaussianBlur(S * 0.02))
    img.alpha_composite(glow)
    img.alpha_composite(ring)

    # red record dot + soft glow + top highlight
    dot = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    rr = S * 0.135
    ImageDraw.Draw(dot).ellipse([CX - rr, CY - rr, CX + rr, CY + rr], fill=RED + (255,))
    img.alpha_composite(dot.filter(ImageFilter.GaussianBlur(S * 0.03)))
    img.alpha_composite(dot)
    hr = rr * 0.5
    ImageDraw.Draw(img).ellipse(
        [CX - hr, CY - hr - rr * 0.25, CX + hr, CY + hr - rr * 0.25],
        fill=(255, 150, 130, 110),
    )

    # rounded corners
    img.putalpha(ImageChops.multiply(img.split()[3], mask))

    out = img.resize((1024, 1024), Image.LANCZOS)
    path = "/Users/harry/Projects/LazyVlogRecorder/assets/app-icon-source.png"
    out.save(path)
    print("saved", path)


if __name__ == "__main__":
    main()
