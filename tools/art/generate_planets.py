#!/usr/bin/env python3
"""
Procedural pixel art for planets, plus green phosphor BBS variants.

Cyber mode gets full color art. BBS mode gets a true 4 level green phosphor
rendering (ordered dither plus scanlines) instead of a CSS filter.

Planet classes follow the classic TradeWars 2002 letters:
  M earth type, K desert, O oceanic, L mountainous, C glacial, H volcanic, U gaseous.
Frontier planets are gritty and desolate. Earth, Mars (Terra Corp colony)
and the alien homeworlds are alive: atmospheres, clouds and city lights.

Usage: python3 tools/art/generate_planets.py
Writes client/public/planets/*.webp and client/public/ships/stardock_bbs.webp.
Output is deterministic (fixed seeds), so reruns produce identical art.
"""

import os
import numpy as np
from PIL import Image

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
OUT = os.path.join(ROOT, 'client', 'public', 'planets')
SHIPS = os.path.join(ROOT, 'client', 'public', 'ships')

W, H = 240, 160          # native pixel canvas
SCALE = 4                # upscale with nearest neighbour, 960x640 output

BAYER4 = np.array([[0, 8, 2, 10],
                   [12, 4, 14, 6],
                   [3, 11, 1, 9],
                   [15, 7, 13, 5]], dtype=np.float32) / 16.0 - 0.5


def bayer(h, w):
    return np.tile(BAYER4, (h // 4 + 1, w // 4 + 1))[:h, :w]


def hexrgb(s):
    s = s.lstrip('#')
    return np.array([int(s[i:i + 2], 16) for i in (0, 2, 4)], dtype=np.float32)


# ---------------------------------------------------------------- noise

class Noise3:
    """Value noise on a 3D lattice with fractal sum. Seeded, numpy only."""

    def __init__(self, seed):
        rng = np.random.default_rng(seed)
        self.perm = rng.permutation(256)
        self.vals = rng.random(256).astype(np.float32)

    def _h(self, x, y, z):
        p = self.perm
        return self.vals[p[(p[(p[x & 255] + y) & 255] + z) & 255]]

    def value(self, x, y, z):
        xi, yi, zi = np.floor(x).astype(np.int64), np.floor(y).astype(np.int64), np.floor(z).astype(np.int64)
        xf, yf, zf = x - xi, y - yi, z - zi
        u, v, w = (t * t * (3 - 2 * t) for t in (xf, yf, zf))
        out = 0
        for dx in (0, 1):
            for dy in (0, 1):
                for dz in (0, 1):
                    wt = (u if dx else 1 - u) * (v if dy else 1 - v) * (w if dz else 1 - w)
                    out = out + wt * self._h(xi + dx, yi + dy, zi + dz)
        return out

    def fbm(self, x, y, z, octaves=5, lac=2.0, gain=0.5):
        amp, freq, tot, norm = 1.0, 1.0, 0, 0
        for _ in range(octaves):
            tot = tot + amp * self.value(x * freq, y * freq, z * freq)
            norm += amp
            amp *= gain
            freq *= lac
        return tot / norm


# ---------------------------------------------------------------- background

def starfield(seed, nebula=None):
    rng = np.random.default_rng(seed)
    img = np.zeros((H, W, 3), np.float32)
    img[:] = hexrgb('#07070f')
    yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
    n = Noise3(seed + 99)
    dust = n.fbm(xx / 40, yy / 40, np.full_like(xx, 0.5), 4)
    dust = np.clip((dust - 0.45) * 2.2, 0, 1)
    tint = hexrgb(nebula or '#2a1a2e')
    img += dust[..., None] * tint * 0.55
    img = np.floor(img / 6 + bayer(H, W)[..., None] * 0.9) * 6  # banded, dithered dust
    for _ in range(140):
        x, y = rng.integers(0, W), rng.integers(0, H)
        b = rng.choice([70, 110, 160, 220], p=[0.5, 0.3, 0.15, 0.05])
        c = np.array([b, b, b + 20], np.float32) * rng.uniform(0.85, 1.05, 3)
        img[y, x] = np.clip(c, 0, 255)
        if b >= 220 and 1 < x < W - 2 and 1 < y < H - 2:
            for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                img[y + dy, x + dx] = c * 0.45
    return img


# ---------------------------------------------------------------- planet core

LIGHT = np.array([-0.8, -0.38, 0.46], np.float32)
LIGHT /= np.linalg.norm(LIGHT)


def sphere(cx, cy, r):
    yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
    nx, ny = (xx + 0.5 - cx) / r, (yy + 0.5 - cy) / r
    d2 = nx * nx + ny * ny
    mask = d2 <= 1.0
    nz = np.sqrt(np.clip(1 - d2, 0, 1))
    return nx, ny, nz, mask, d2


def rotate(nx, ny, nz, tilt, spin):
    # spin around y, then tilt around z
    cs, ss = np.cos(spin), np.sin(spin)
    x = nx * cs + nz * ss
    z = -nx * ss + nz * cs
    ct, st = np.cos(tilt), np.sin(tilt)
    return x * ct - ny * st, x * st + ny * ct, z


def ramp_pick(ramp, t):
    """ramp: list of hex colors dark to light, t: 0..1 array -> rgb."""
    cols = np.stack([hexrgb(c) for c in ramp])
    idx = np.clip(np.floor(t * len(ramp)), 0, len(ramp) - 1).astype(int)
    return cols[idx]


def render_planet(spec):
    seed = spec['seed']
    img = starfield(seed, spec.get('nebula'))
    cx, cy, r = spec.get('cx', 132), spec.get('cy', 82), spec.get('r', 58)
    nx, ny, nz, mask, d2 = sphere(cx, cy, r)
    px, py, pz = rotate(nx, ny, nz, spec.get('tilt', 0.35), spec.get('spin', 0.0))
    noise = Noise3(seed)
    f = spec.get('freq', 2.2)

    if spec.get('bands'):
        # gas giant: latitude bands warped by turbulence
        turb = noise.fbm(px * 3, py * 3, pz * 3, 4)
        lat = py * spec['bands'] + turb * 2.4
        height = (np.sin(lat * 3.1) * 0.5 + 0.5) * 0.7 + noise.fbm(px * 6, py * 14, pz * 6, 3) * 0.3
    else:
        height = noise.fbm(px * f, py * f, pz * f, 6)
        height = (height - 0.5) * spec.get('contrast', 1.6) + 0.5

    # craters: depressions with raised rims, desolate worlds only
    rng = np.random.default_rng(seed + 7)
    for _ in range(spec.get('craters', 0)):
        v = rng.normal(size=3)
        v /= np.linalg.norm(v)
        rad = rng.uniform(0.06, 0.22)
        ang = np.arccos(np.clip(px * v[0] + py * v[1] + pz * v[2], -1, 1))
        k = ang / rad
        height = height - np.where(k < 1, (1 - k * k) * 0.22, 0) + np.where((k >= 1) & (k < 1.35), (1.35 - k) * 0.25, 0)

    # surface relief lighting from the height gradient
    gy, gx = np.gradient(height)
    lam = nx * LIGHT[0] + ny * LIGHT[1] + nz * LIGHT[2]
    shade = np.clip(lam, 0, 1) ** 0.8
    shade = shade + (-gx * LIGHT[0] - gy * LIGHT[1]) * spec.get('relief', 9.0)
    grit = noise.fbm(px * 30, py * 30, pz * 30, 2) - 0.5
    shade = shade + grit * spec.get('grit', 0.25)
    shade = np.clip(shade, 0, 1)

    lat = np.abs(py)
    surf = np.zeros((H, W, 3), np.float32)
    t_sh = np.clip(shade + bayer(H, W) * 0.22, 0, 0.999)
    sea = spec.get('sea', -1)
    layers = spec['layers']  # list of (height_threshold, ramp) ascending
    assigned = np.zeros((H, W), bool)
    for thresh, ramp in layers:
        sel = (height <= thresh) & ~assigned & mask
        surf[sel] = ramp_pick(ramp, t_sh[sel])
        assigned |= sel
    if spec.get('ice_caps'):
        cap = (lat + (noise.fbm(px * 5, py * 5, pz * 5, 3) - 0.5) * 0.3) > spec['ice_caps']
        sel = cap & mask
        surf[sel] = ramp_pick(spec.get('ice_ramp', ['#3a4048', '#6a727c', '#a9b2ba', '#dfe6ea']), t_sh[sel])

    # glowing fissures (lava, toxic seeps) ignore the day side shading
    if spec.get('fissures'):
        fis = np.abs(noise.fbm(px * 4 + 9, py * 4, pz * 4, 4) - 0.5) < spec['fissures'][0]
        sel = fis & mask & (height > sea)
        surf[sel] = ramp_pick(spec['fissures'][1], np.clip(0.4 + shade[sel] * 0.6 + bayer(H, W)[sel] * 0.3, 0, 0.999))

    # clouds
    if spec.get('clouds'):
        cl = noise.fbm(px * 3 + 40, py * 6 + 40, pz * 3 + 40, 5)
        cov, ramp = spec['clouds']
        sel = (cl > cov) & mask
        surf[sel] = ramp_pick(ramp, t_sh[sel])

    # city lights on the night side (alive worlds) or dying flickers (desolate)
    if spec.get('lights'):
        dens, col = spec['lights']
        night = lam < 0.05
        land = height > sea
        city = rng.random((H, W)) < dens * np.clip(noise.fbm(px * 7, py * 7, pz * 7, 3) * 2 - 0.7, 0, 1)
        sel = night & land & mask & city
        if spec.get('clouds'):
            sel &= ~((noise.fbm(px * 3 + 40, py * 6 + 40, pz * 3 + 40, 5) > spec['clouds'][0]))
        surf[sel] = hexrgb(col)

    # terminator darkness: night side keeps a faint ambient
    night_k = np.clip(lam * 3 + 0.15, 0.07, 1.0)
    lit = surf * np.where(surf.sum(-1, keepdims=True) > 0, 1, 1)
    keep_bright = np.zeros((H, W), bool)
    if spec.get('lights'):
        keep_bright = (lam < 0.05) & (np.abs(surf - hexrgb(spec['lights'][1])).sum(-1) < 1)
    if spec.get('fissures'):
        keep_bright |= (np.abs(noise.fbm(px * 4 + 9, py * 4, pz * 4, 4) - 0.5) < spec['fissures'][0]) & (height > sea)
    dark = np.floor(night_k * 4 + bayer(H, W) * 0.9) / 4
    lit = np.where(keep_bright[..., None], surf, surf * np.clip(dark, 0.07, 1)[..., None])

    img[mask] = lit[mask]

    # atmosphere rim
    if spec.get('atmo'):
        col, strength = spec['atmo']
        dd = np.sqrt(d2)
        rim = np.clip(1 - np.abs(dd - 1.0) / 0.09, 0, 1)
        rim *= np.clip(-(nx * LIGHT[0] + ny * LIGHT[1]) * 0.7 + 0.6, 0.15, 1)
        rim = np.floor(rim * 3 + bayer(H, W) * 0.8) / 3
        img = img * (1 - rim[..., None] * strength) + hexrgb(col) * rim[..., None] * strength

    # dark outline for a crisp pixel art silhouette
    edge = mask & ~np.roll(mask, 1, 0) | mask & ~np.roll(mask, -1, 0) | mask & ~np.roll(mask, 1, 1) | mask & ~np.roll(mask, -1, 1)
    if not spec.get('atmo'):
        img[edge & (lam < 0.3)] = hexrgb('#050508')

    if spec.get('ring'):
        img = draw_ring(img, cx, cy, r, spec['ring'], mask, lam)
    for extra in spec.get('extras', []):
        img = extra(img, rng, cx, cy, r)
    return np.clip(img, 0, 255)


def draw_ring(img, cx, cy, r, ramp, mask, lam):
    yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
    # tilted ellipse ring, back half hidden behind the planet
    a = np.radians(-14)
    dx, dy = xx + 0.5 - cx, yy + 0.5 - cy
    rx = dx * np.cos(a) - dy * np.sin(a)
    ry = (dx * np.sin(a) + dy * np.cos(a)) / 0.28
    rr = np.sqrt(rx * rx + ry * ry) / r
    band = (rr > 1.25) & (rr < 1.85)
    front = ry > 0
    sel = band & (front | ~mask)
    gaps = (np.abs(rr - 1.52) > 0.035)
    noise = np.sin(rr * 60) * 0.5 + 0.5
    t = np.clip(noise * 0.8 + bayer(H, W) * 0.3 + 0.1, 0, 0.999)
    col = ramp_pick(ramp, t)
    # planet shadow falls across the back right of the ring
    shadow = (rx > 0) & ~front & (np.abs(ry) < r * 1.2)
    col = np.where(shadow[..., None], col * 0.35, col)
    sel &= gaps
    img[sel] = img[sel] * 0.25 + col[sel] * 0.75
    return img


# ---------------------------------------------------------------- extras

WRECK_SPRITE = [
    "pp.p..........",
    ".pp.p....#....",
    "..p....##o#...",
    "......#oorr##.",
    "pppp.#ooroooo#",
    "pp.p#ooorrooo#",
    ".....#ooooo##.",
    "......##rr#...",
    "........##....",
]
WRECK_COLORS = {'#': '#24201e', 'o': '#6a645e', 'r': '#7a4426', 'p': '#28364a'}


def wreck(x, y, size=1.0, glow=None):
    """Derelict satellite hulk with a snapped solar wing and an optional dying beacon."""
    def fn(img, rng, cx, cy, r):
        sp = WRECK_SPRITE if size >= 0 else [row[::-1] for row in WRECK_SPRITE]
        for j, row in enumerate(sp):
            for i, ch in enumerate(row):
                if ch == '.':
                    continue
                yy, xx = y + j - 4, x + i - 7
                if 0 <= yy < H and 0 <= xx < W:
                    c = hexrgb(WRECK_COLORS[ch])
                    if ch == 'o' and j < 5 and i > 6:
                        c = c * 1.35  # sunlit upper plating
                    img[yy, xx] = np.clip(c, 0, 255)
        if glow:
            img[y - 2, x + 2] = hexrgb(glow)
        return img
    return fn


def debris(count, radius_k=1.5, color='#6b5d52'):
    def fn(img, rng, cx, cy, r):
        for _ in range(count):
            ang = rng.uniform(0, 2 * np.pi)
            rad = r * rng.uniform(1.15, radius_k)
            x = int(cx + np.cos(ang) * rad)
            y = int(cy + np.sin(ang) * rad * 0.35)
            if 0 <= x < W and 0 <= y < H and (np.sin(ang) > 0 or (x - cx) ** 2 + (y - cy) ** 2 > r * r):
                c = hexrgb(color) * rng.uniform(0.5, 1.2)
                img[y, x] = np.clip(c, 0, 255)
                if rng.random() < 0.3 and x + 1 < W:
                    img[y, x + 1] = c * 0.6
        return img
    return fn


def moon(mx, my, mr, ramp, seed):
    def fn(img, rng, cx, cy, r):
        nx, ny, nz, mask, _ = sphere(mx, my, mr)
        n = Noise3(seed)
        h = n.fbm(nx * 4, ny * 4, nz * 4, 4)
        lam = np.clip(nx * LIGHT[0] + ny * LIGHT[1] + nz * LIGHT[2], 0, 1)
        t = np.clip(lam * 0.85 + (h - 0.5) * 0.6 + bayer(H, W) * 0.25, 0, 0.999)
        col = ramp_pick(ramp, t)
        img[mask] = col[mask]
        return img
    return fn


def station(x, y):
    """Small lit orbital station for living worlds."""
    def fn(img, rng, cx, cy, r):
        pts = [(0, 0, '#9aa3ab'), (1, 0, '#cfd6dc'), (-1, 0, '#6d757d'), (2, 0, '#6d757d'), (-2, 0, '#6d757d'),
               (0, -1, '#cfd6dc'), (0, 1, '#4a5058'), (3, 0, '#2f4a6a'), (4, 0, '#2f4a6a'), (-3, 0, '#2f4a6a'),
               (-4, 0, '#2f4a6a'), (0, -2, '#ffd27a')]
        for dx, dy, c in pts:
            if 0 <= y + dy < H and 0 <= x + dx < W:
                img[y + dy, x + dx] = hexrgb(c)
        return img
    return fn


# ---------------------------------------------------------------- specs

ROCK_DARK = ['#1c1a19', '#33302d', '#4d4843', '#6b645c', '#8a8178']
RUST = ['#2a1710', '#4a2a1a', '#6e3f22', '#93582e', '#b8753c']

PLANETS = {
    # Living worlds
    'earth': dict(seed=11, freq=1.8, contrast=1.9, sea=0.5, relief=5, grit=0.08,
                  layers=[(0.5, ['#0a1838', '#12306a', '#1c4c94', '#2c6cba']),
                          (0.515, ['#3a3a20', '#6a6a3a', '#9a925a', '#c4ba84']),
                          (0.7, ['#14300f', '#1f4a18', '#2f6a22', '#4a8a30']),
                          (2.0, ['#2e2a1c', '#4e4630', '#786a4a', '#a39470'])],
                  ice_caps=0.82, ice_ramp=['#5a6a78', '#9fb0bf', '#d8e3ec', '#ffffff'],
                  clouds=(0.58, ['#8a96a4', '#c2ccd6', '#e8eef4', '#ffffff']),
                  lights=(0.55, '#ffd27a'), atmo=('#5aa8ff', 0.85), nebula='#14203a',
                  extras=[station(64, 34), moon(206, 36, 9, ['#2a2a2c', '#545458', '#8a8a8e', '#bdbdc2'], 12)]),
    'mars': dict(seed=21, freq=2.0, contrast=1.7, sea=0.36, relief=8, grit=0.18, craters=10,
                 layers=[(0.36, ['#16303a', '#1f4a52', '#2d6a6a', '#3f8a80']),   # terraformed lakes
                         (0.6, RUST),
                         (2.0, ['#2a1a14', '#4e3226', '#7a5038', '#a8704c'])],
                 ice_caps=0.86, clouds=(0.7, ['#8a6a5a', '#b8988a', '#d8c0b0', '#efe0d4']),
                 lights=(0.5, '#ffe7a8'), atmo=('#e8906a', 0.55), nebula='#2a1414',
                 extras=[station(70, 128), moon(42, 120, 5, ['#2a2420', '#4a3e34', '#6a5a4a', '#8a7a68'], 22)]),

    # Desolate frontier, classic TW2002 classes
    'class_m': dict(seed=31, freq=1.9, contrast=1.8, sea=0.48, relief=7, grit=0.3, craters=4,   # earth type, ruined
                    layers=[(0.48, ['#121614', '#1e2522', '#2c3530', '#3c4842']),
                            (0.62, ['#241e18', '#3e3328', '#5a4a38', '#786450']),
                            (2.0, ROCK_DARK)],
                    clouds=(0.68, ['#3a3530', '#56504a', '#706860', '#8a8278']),
                    lights=(0.06, '#c86a2a'), nebula='#1e1a18',
                    extras=[wreck(56, 40, 1.0, '#ff3a2a'), debris(70)]),
    'class_k': dict(seed=41, freq=2.6, contrast=1.5, relief=12, grit=0.35, craters=22,           # desert wasteland
                    layers=[(0.4, ['#2a1a10', '#4a2e18', '#6a4424', '#8a5a30']),
                            (2.0, ['#3a2614', '#62401e', '#8a5c2c', '#b07a3e', '#c8955a'])],
                    nebula='#2a1a10', extras=[wreck(200, 120, 1.2), debris(40, 1.6, '#8a6a4a')]),
    'class_o': dict(seed=51, freq=2.2, contrast=1.6, sea=0.62, relief=4, grit=0.3,               # toxic ocean
                    layers=[(0.62, ['#12140e', '#22251a', '#363a26', '#4c5032']),
                            (2.0, ['#1e1c18', '#36322a', '#504a3c', '#6a6250'])],
                    clouds=(0.66, ['#2e3022', '#46483a', '#5e604c', '#767860']),
                    fissures=(0.012, ['#4a6a1a', '#7a9a20', '#a8c428', '#d0e83a']),
                    nebula='#141e10', extras=[wreck(60, 128, 1.0, '#9aff3a')]),
    'class_l': dict(seed=61, freq=3.0, contrast=2.0, relief=14, grit=0.3, craters=12,            # mountainous, strip mined
                    layers=[(0.42, ['#1a1816', '#2e2a26', '#46403a', '#5e564e']),
                            (0.7, ROCK_DARK),
                            (2.0, ['#3a3836', '#5e5a56', '#86807a', '#b0aaa2'])],
                    fissures=(0.01, ['#5a2a10', '#8a4418', '#c06a22', '#e8963a']),
                    nebula='#1a1a20', extras=[wreck(190, 34, 1.3, '#ffb23a'), debris(55)]),
    'class_c': dict(seed=71, freq=2.4, contrast=1.4, relief=10, grit=0.22, craters=8,            # glacial, dirty ice
                    layers=[(0.45, ['#1a2228', '#2e3a42', '#48565e', '#66747c']),
                            (2.0, ['#3a4248', '#5e686e', '#8a9498', '#b4bcc0', '#d2d8da'])],
                    fissures=(0.008, ['#0e1a26', '#16283a', '#1e3a52', '#2a4e6a']),
                    nebula='#121a24', extras=[moon(54, 120, 7, ROCK_DARK[:4], 72), debris(30, 1.4, '#7a8a94')]),
    'class_h': dict(seed=81, freq=2.6, contrast=1.7, relief=11, grit=0.35, craters=6,            # volcanic
                    layers=[(2.0, ['#0e0c0c', '#1e1a18', '#302a26', '#463e38'])],
                    fissures=(0.03, ['#6a1a08', '#a8320c', '#e05a14', '#ff9a2a', '#ffd25a']),
                    clouds=(0.72, ['#1a1614', '#2a2420', '#3a322c', '#4a4038']),
                    nebula='#2a100a', extras=[debris(60, 1.5, '#5a3a2a')]),
    'class_u': dict(seed=91, r=54, bands=7, relief=3, grit=0.12,                                  # gas giant, murky
                    layers=[(0.35, ['#1e1a12', '#332c1e', '#4a402a', '#62563a']),
                            (0.6, ['#2a2216', '#4a3a24', '#6a5434', '#8a7046']),
                            (2.0, ['#3a3426', '#5a5038', '#7a6e4e', '#9a8c66'])],
                    ring=['#2a2620', '#4a443a', '#6a6252', '#8a806c'], nebula='#1c1a14',
                    extras=[wreck(40, 30, 1.0, '#ff3a2a')]),
}

# Alien homeworlds: alive, each race gets its own biosphere and city glow
ALIENS = {
    'xenthi': ('#2a0e3a', ['#1a0a2a', '#2e1248', '#46206a', '#62308e'], ['#0e3a2a', '#14583a', '#20784a', '#36a060'], '#c070ff', '#7affc0'),
    'vorlak': ('#3a0e0e', ['#2a0a0a', '#4a1210', '#6a1e16', '#8e2c1e'], ['#3a2a10', '#5a4218', '#7a5c22', '#a07a30'], '#ff6a3a', '#ffb05a'),
    'krynn': ('#0e2a3a', ['#08202e', '#0e3448', '#164e66', '#226e88'], ['#1e3a3a', '#2a5650', '#3a766a', '#509a88'], '#5adcff', '#aaffff'),
    'sslith': ('#1a2a0e', ['#122008', '#1c3410', '#2a4c18', '#3c6a22'], ['#3a3a0e', '#585816', '#7a7a20', '#a0a030'], '#a8ff3a', '#eaff6a'),
    'zendarr': ('#2a1a0e', ['#2a1408', '#44220e', '#663418', '#8a4a22'], ['#5a4a2a', '#7a683c', '#9c8a52', '#c0ae6c'], '#ffd23a', '#fff07a'),
    'thorax': ('#1a0e2a', ['#120a22', '#1e1238', '#2c1e52', '#3e2c70'], ['#3a0e2a', '#5a1640', '#7c225a', '#a03278'], '#ff3ab0', '#ff9ae0'),
    'quell': ('#0e1a2a', ['#0a1424', '#10203a', '#183054', '#244472'], ['#2a3a4a', '#3e5468', '#567088', '#7290aa'], '#9ac0ff', '#e0ecff'),
    'nebari': ('#0e2a22', ['#062018', '#0c3426', '#145038', '#1e6e4e'], ['#2a0e3a', '#401656', '#5a2276', '#783498'], '#3affb0', '#c0ffe8'),
    'vedran': ('#2a220e', ['#20180a', '#362812', '#4e3a1c', '#6a4e28'], ['#0e2a1a', '#164428', '#22603a', '#32804e'], '#ffaa3a', '#ffe0a0'),
    'pyrians': ('#3a1a0e', ['#3a0e06', '#5a1a0a', '#7e2a10', '#a43e18'], ['#2a2a2a', '#444040', '#625a56', '#847a74'], '#ff7a2a', '#ffd06a'),
}

for i, (race, (neb, sea, land, atmo, light)) in enumerate(ALIENS.items()):
    PLANETS['alien_' + race] = dict(
        seed=200 + i * 13, freq=2.0 + (i % 3) * 0.3, contrast=1.8, sea=0.5, relief=6, grit=0.1,
        spin=i * 0.7, tilt=0.2 + (i % 4) * 0.12,
        layers=[(0.5, sea), (0.66, land), (2.0, [land[0], land[1], land[2], land[3]])],
        clouds=(0.64, ['#4a4a5a', '#7a7a8e', '#aeaec0', '#dcdcea']) if i % 2 == 0 else None,
        fissures=(0.006, [atmo, atmo, light, light]) if i % 3 == 0 else None,
        lights=(0.7, light), atmo=(atmo, 0.8), nebula=neb,
        ring=[sea[1], sea[2], land[2], land[3]] if i % 4 == 1 else None,
        extras=[station(60 + (i * 17) % 40, 30 + (i * 11) % 20)],
    )


# ---------------------------------------------------------------- BBS phosphor

PHOSPHOR = np.stack([hexrgb(c) for c in ['#020a02', '#0b3a0e', '#1f8a24', '#4cff4c']])


def phosphor(rgb):
    """Map an RGB image to 4 level green phosphor with ordered dither and scanlines."""
    h, w, _ = rgb.shape
    lum = (rgb[..., 0] * 0.3 + rgb[..., 1] * 0.59 + rgb[..., 2] * 0.11) / 255.0
    lum = np.clip((lum * 1.35 - 0.07) / 0.93, 0, 1) ** 0.85  # dead zone keeps space black
    idx = np.clip(np.floor(lum * 3 + 0.5 + bayer(h, w) * 0.95), 0, 3).astype(int)
    out = PHOSPHOR[idx]
    return out


def upscale_bbs(native):
    """Upscale, then darken every 4th row for CRT scanlines."""
    big = np.repeat(np.repeat(native, SCALE, 0), SCALE, 1).astype(np.float32)
    big[SCALE - 1::SCALE] *= 0.45
    return big


def save(arr, path, scanlines=False):
    if scanlines:
        big = upscale_bbs(arr)
    else:
        big = np.repeat(np.repeat(arr, SCALE, 0), SCALE, 1)
    Image.fromarray(np.clip(big, 0, 255).astype(np.uint8)).save(path, 'WEBP', quality=88, method=6)


def stardock_bbs():
    src = Image.open(os.path.join(SHIPS, 'stardock.webp')).convert('RGB')
    native = np.asarray(src.resize((W, H), Image.BOX), np.float32)
    save(phosphor(native), os.path.join(SHIPS, 'stardock_bbs.webp'), scanlines=True)


def main():
    os.makedirs(OUT, exist_ok=True)
    for name, spec in PLANETS.items():
        spec = {k: v for k, v in spec.items() if v is not None}
        art = render_planet(spec)
        save(art, os.path.join(OUT, f'{name}.webp'))
        save(phosphor(art), os.path.join(OUT, f'{name}_bbs.webp'), scanlines=True)
        print('planet', name)
    stardock_bbs()
    print('stardock_bbs')


if __name__ == '__main__':
    main()
