// Offline panoramic plates for devices with WebGL2 disabled. The horizontal strip
// wraps at 360 degrees; panning only copies pixels from the current cached plate.
const W = 4096,
  H = 920,
  MID = W / 2,
  TAU = Math.PI * 2;
type Ctx = CanvasRenderingContext2D;
type P = [number, number];
type Palette = { sky: string[]; rock: string[]; tint: string; glow: string };
const palettes: Record<string, Palette> = {
  hub: {
    sky: ["#09162d", "#274259", "#72808b", "#dfb89a"],
    rock: ["#8c939c", "#697986", "#4e626f", "#303e4d", "#182831"],
    tint: "#c5cbd0",
    glow: "#ffd694",
  },
  earth: {
    sky: ["#030818", "#101a36", "#424263", "#e8a589"],
    rock: ["#797684", "#625e70", "#484456", "#373041", "#272631"],
    tint: "#d0bdba",
    glow: "#ffcc8d",
  },
  valley: {
    sky: ["#081b37", "#1e4159", "#618082", "#abc3a7"],
    rock: ["#679292", "#477477", "#315c62", "#234748", "#173639"],
    tint: "#9bc3aa",
    glow: "#a3ffdc",
  },
  field: {
    sky: ["#100e31", "#34345c", "#74678d", "#e0acb5"],
    rock: ["#908098", "#6e6787", "#514b6e", "#3d3758", "#252842"],
    tint: "#cab3d2",
    glow: "#ebcbff",
  },
  sculpture: {
    sky: ["#0b1023", "#2e2949", "#51465e", "#866f83"],
    rock: ["#715b75", "#554861", "#433a50", "#302939", "#201d2d"],
    tint: "#c5a4c7",
    glow: "#f7bcff",
  },
  lab: {
    sky: ["#061025", "#102f46", "#315969", "#618588"],
    rock: ["#527781", "#3f606c", "#304b55", "#203742", "#152933"],
    tint: "#a2cace",
    glow: "#91fff0",
  },
};
function rng(seed: number) {
  return () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
}
function poly(c: Ctx, p: P[], color: string) {
  c.fillStyle = color;
  c.beginPath();
  p.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y)));
  c.closePath();
  c.fill();
}
function line(c: Ctx, p: P[], color: string, width: number) {
  c.strokeStyle = color;
  c.lineWidth = width;
  c.beginPath();
  p.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y)));
  c.stroke();
}
function glow(
  c: Ctx,
  x: number,
  y: number,
  r: number,
  color: string,
  strength: number,
  squash = 1,
) {
  c.save();
  c.translate(x, y);
  c.scale(1, squash);
  const g = c.createRadialGradient(0, 0, 0, 0, 0, r);
  g.addColorStop(0, color);
  g.addColorStop(1, color + "00");
  c.globalAlpha *= strength;
  c.fillStyle = g;
  c.fillRect(-r, -r, r * 2, r * 2);
  c.restore();
}
function oval(
  c: Ctx,
  x: number,
  y: number,
  rx: number,
  ry: number,
  color: string,
  width = 0,
) {
  c.beginPath();
  c.ellipse(x, y, rx, ry, 0, 0, TAU);
  if (width) {
    c.strokeStyle = color;
    c.lineWidth = width;
    c.stroke();
  } else {
    c.fillStyle = color;
    c.fill();
  }
}
function noise(x: number, seed: number) {
  const h = (i: number) => {
    const s = Math.sin(i * 127.1 + seed * 311.7) * 43758.5453;
    return s - Math.floor(s);
  };
  const i = Math.floor(x),
    f = x - i;
  return h(i) + (h(i + 1) - h(i)) * f * f * (3 - 2 * f);
}
function fractal(x: number, seed: number) {
  return (
    0.53 * noise(x, seed) +
    0.26 * noise(x * 2.43, seed + 9) +
    0.13 * noise(x * 5.12, seed + 3) +
    0.055 * noise(x * 11.1, seed + 4) +
    0.025 * noise(x * 25, seed + 5)
  );
}

function night(c: Ctx, p: Palette, seed: number) {
  const g = c.createLinearGradient(0, 0, 0, 650);
  p.sky.forEach((s, i) => g.addColorStop([0, 0.43, 0.79, 1][i], s));
  c.fillStyle = g;
  c.fillRect(0, 0, W, H);
  const r = rng(seed);
  // Wisps follow a long broken diagonal through the upper atmosphere.
  for (let i = 0; i < 560; i++) {
    const x = r() * W,
      y =
        95 +
        70 * Math.sin(x * 0.0024) +
        65 * Math.sin(x * 0.001 - 1) +
        (r() - 0.5) * 135;
    glow(
      c,
      x,
      y,
      10 + r() * 72,
      i % 3 ? "#b7a8ce" : "#8fbcdb",
      0.012 + r() * 0.025,
      0.38 + r() * 0.46,
    );
  }
  for (let i = 0; i < 8000; i++) {
    const x = r() * W,
      y = r() * 490,
      a = (1 - y / 510) * (0.08 + 0.8 * r() ** 2);
    const s = 0.22 + r() ** 5 * 1.32;
    c.globalAlpha = a;
    c.fillStyle = i % 9 === 0 ? "#ffdfae" : "#e2efff";
    c.fillRect(x, y, s, s);
    if (s > 1.42) {
      c.fillRect(x - 1.4, y + 0.4, 4.1, 0.38);
      c.fillRect(x + 0.45, y - 1.1, 0.38, 3.4);
    }
  }
  c.globalAlpha = 1;
  for (let i = 0; i < 230; i++) {
    const x = r() * W,
      y = 303 + r() * 244;
    glow(
      c,
      x,
      y,
      20 + r() * 160,
      i % 3 ? p.sky[3] : p.sky[1],
      0.035 + r() * 0.06,
      0.026 + r() * 0.06,
    );
  }
}
function ridge(
  c: Ctx,
  p: Palette,
  layer: number,
  seed: number,
  base: number,
  amp: number,
) {
  const r = rng(seed),
    step = 3,
    ys: number[] = [],
    path: P[] = [];
  for (let x = 0; x <= W + step; x += step) {
    const val = fractal(x / (260 + layer * 42), seed);
    const y = base - amp * val + Math.sin(x * 0.0023 + seed) * amp * 0.16;
    ys.push(y);
    path.push([x, y]);
  }
  poly(c, [...path, [W, H], [0, H]], p.rock[layer]);
  // Slanting rock buttresses form distinct lit planes. All facets begin on
  // the sampled crest, leaving the broken silhouette intact.
  for (let j = 1; j < ys.length - 10; j += 1 + Math.floor(r() * 4)) {
    const x = j * step,
      y = ys[j],
      k = 2 + Math.floor(r() * 7),
      length = (18 + r() ** 2 * 116) * (1 + layer * 0.1);
    const lit = ys[j + k] - y,
      dx = (lit > 0 ? -1 : 1) * length * (0.3 + r() * 0.75);
    c.globalAlpha = (lit < 0 ? 0.09 : 0.033) + r() * 0.075;
    poly(
      c,
      [
        [x, y + 0.6],
        [x + k * step, ys[j + k] + 1],
        [x + dx, y + length],
        [x + dx * 0.52, y + length * 0.67],
      ],
      lit < 0 ? p.tint : "#101726",
    );
    if (lit < -1.7 && r() > 0.52) {
      c.globalAlpha = 0.22;
      line(
        c,
        [
          [x, y + 1],
          [x + k * step * 0.6, ys[j + Math.floor(k * 0.6)] + 1],
          [x + dx * 0.35, y + length * 0.25],
        ],
        p.tint,
        0.7,
      );
    }
  }
  c.globalAlpha = 1;
}
function rock(
  c: Ctx,
  x: number,
  y: number,
  w: number,
  h: number,
  p: Palette,
  seed: number,
) {
  const r = rng(seed),
    points: P[] = [];
  for (let i = 0; i <= 14; i++)
    points.push([
      x - w / 2 + (w * i) / 14,
      y - h * (0.64 + 0.3 * Math.sin((i / 14) * Math.PI) + r() * 0.095),
    ]);
  poly(
    c,
    [[x - w * 0.64, y + h * 0.2], ...points, [x + w * 0.55, y + h * 0.13]],
    p.rock[4],
  );
  for (let i = 0; i < points.length - 1; i++) {
    const [ax, ay] = points[i],
      [bx, by] = points[i + 1];
    c.globalAlpha = 0.1 + r() * 0.13;
    poly(
      c,
      [
        [ax, ay],
        [bx, by],
        [bx - w * (0.04 + r() * 0.12), y + h * 0.15],
        [ax - w * 0.12, y + h * 0.13],
      ],
      i % 3 ? p.rock[1] : p.tint,
    );
    c.globalAlpha = 0.4;
    line(
      c,
      [
        [ax, ay],
        [bx, by],
      ],
      p.tint,
      0.75,
    );
  }
  c.globalAlpha = 1;
}
function pines(
  c: Ctx,
  p: Palette,
  seed: number,
  y: number,
  span: number,
  count: number,
) {
  const r = rng(seed);
  for (let i = 0; i < count; i++) {
    const x = r() * W,
      edge = Math.abs(x - MID),
      a = y + 35 * Math.sin(x * 0.006) + span * r(),
      h = (10 + r() ** 1.5 * 69) * (edge < 360 ? 0.55 : 1),
      w = h * (0.13 + r() * 0.07);
    c.fillStyle = p.rock[4];
    c.fillRect(x - 1, a - h, 2, h);
    for (let j = 0; j < 4; j++)
      poly(
        c,
        [
          [x, a - h + h * 0.15 * j],
          [x + w * (0.55 + j * 0.14), a - h + h * (0.41 + j * 0.17)],
          [x - w * (0.55 + j * 0.14), a - h + h * (0.41 + j * 0.17)],
        ],
        j % 2 ? p.rock[3] : p.rock[4],
      );
  }
}
function arch(
  c: Ctx,
  x: number,
  y: number,
  r: number,
  color: string,
  seed: number,
  hero = true,
) {
  const random = rng(seed),
    sx = hero ? 0.91 : 0.7,
    ry = r * 1.07,
    rx = r * sx;
  glow(c, x, y, r * 1.42, color, 0.26);
  glow(c, x, y, r * 0.77, color, 0.085);
  // Orbital ticks and inset metal segments maintain a discernible material finish.
  const metal = c.createLinearGradient(x - r, y - r, x + r, y + r);
  metal.addColorStop(0, "#ffe1ab");
  metal.addColorStop(0.25, "#b69a7e");
  metal.addColorStop(0.46, "#3e4250");
  metal.addColorStop(0.7, "#82796f");
  metal.addColorStop(1, "#2a3943");
  c.beginPath();
  c.ellipse(x, y, rx, ry, -0.07, 0, TAU);
  c.strokeStyle = metal;
  c.lineWidth = r * 0.1;
  c.stroke();
  c.save();
  c.translate(x, y);
  c.rotate(-0.07);
  c.scale(sx, 1.07);
  for (const [d, th, alpha] of [
    [0.942, 0.012, 0.95],
    [1.01, 0.008, 0.58],
    [1.068, 0.004, 0.86],
    [1.118, 0.0025, 0.39],
  ]) {
    c.globalAlpha = alpha;
    oval(c, 0, 0, r * d, r * d, color, Math.max(0.6, r * th));
  }
  c.globalAlpha = 1;
  for (let i = 0; i < 180; i++) {
    const a = (i / 180) * TAU,
      dr = i % 10 === 0 ? 0.035 : i % 5 === 0 ? 0.022 : 0.011;
    line(
      c,
      [
        [Math.cos(a) * r * 0.965, Math.sin(a) * r * 0.965],
        [Math.cos(a) * r * (0.965 + dr), Math.sin(a) * r * (0.965 + dr)],
      ],
      i % 3 ? "#b1aaa0" : color,
      0.7,
    );
    if (i % 6 === 0) {
      c.beginPath();
      c.arc(0, 0, r * 1.055, a, a + 0.018 + random() * 0.04);
      c.lineWidth = r * 0.015;
      c.strokeStyle = color;
      c.globalAlpha = 0.5;
      c.stroke();
      c.globalAlpha = 1;
    }
  }
  c.restore();
  if (hero) {
    for (const side of [-1, 1]) {
      const xx = x + side * rx * 0.79;
      poly(
        c,
        [
          [xx - 5, y + r * 0.51],
          [xx + 4, y + r * 0.48],
          [xx + side * r * 0.19 + 7, y + r * 1.18],
          [xx + side * r * 0.18 - 11, y + r * 1.18],
        ],
        "#414b51",
      );
      line(
        c,
        [
          [xx - 4, y + r * 0.51],
          [xx + side * r * 0.19 - 9, y + r * 1.18],
        ],
        "#c0a78a",
        1.6,
      );
    }
    for (let i = 0; i < 160; i++) {
      const a = random() * TAU,
        rad = Math.sqrt(random()) * r * 0.89;
      c.fillStyle = "#ffe0ab";
      c.globalAlpha = 0.15 + random() * 0.62;
      c.fillRect(
        x + Math.cos(a) * rad * sx,
        y + Math.sin(a) * rad,
        random() * 1.7 + 0.3,
        1.2,
      );
    }
    c.globalAlpha = 1;
  }
}
function station(c: Ctx, p: Palette) {
  const x = MID + 155;
  rock(c, x, 590, 390, 91, p, 454);
  arch(c, x, 382, 126, p.glow, 77);
  for (const [dx, dy, rr, s] of [
    [-411, 559, 29, 11],
    [-257, 540, 37, 13],
    [288, 543, 34, 17],
    [438, 568, 29, 23],
  ]) {
    rock(c, x + dx, dy + 49, rr * 3.7, 42, p, s);
    arch(c, x + dx, dy, rr, s % 3 ? "#bddfda" : "#e1d1fc", s, false);
  }
  const left: P[] = [
    [0, 640],
    [x - 140, 573],
    [x - 94, 554],
    [x - 40, 560],
    [x - 240, 920],
    [0, 920],
  ];
  const right: P[] = [
    [x + 43, 560],
    [x + 97, 555],
    [x + 132, 574],
    [W, 649],
    [W, 920],
    [x + 270, 920],
  ];
  poly(c, left, "#253642");
  poly(c, right, "#293a44");
  poly(
    c,
    [
      [x - 40, 560],
      [x + 43, 560],
      [x + 270, 920],
      [x - 240, 920],
    ],
    "#47555b",
  );
  for (let i = 0; i < 21; i++) {
    const k = (i / 20) ** 1.8,
      yy = 560 + 360 * k,
      ww = 40 + 212 * k;
    line(
      c,
      [
        [x - ww, yy],
        [x + ww, yy],
      ],
      i % 3 ? "#657178" : "#92978c",
      0.5 + k * 2.2,
    );
  }
  for (const side of [-1, 1]) {
    line(
      c,
      [
        [x + side * 45, 564],
        [x + side * 256, 920],
      ],
      "#a3987f",
      2,
    );
    line(
      c,
      [
        [x + side * 58, 565],
        [x + side * 349, 920],
      ],
      "#4c5d63",
      2.2,
    );
  }
  const r = rng(971);
  for (let i = 0; i < 190; i++) {
    const xx = r() * W,
      yy = 625 + r() * 304,
      k = (yy - 560) / 360;
    if (Math.abs(xx - x) < 85 + 240 * k) continue;
    line(
      c,
      [
        [xx, yy],
        [xx + 12 + r() * 65, yy - r() * 2],
      ],
      i % 3 ? "#344755" : "#41515b",
      0.5 + r() * 1.5,
    );
  }
}
function orbital(c: Ctx, p: Palette) {
  const x = MID + 80,
    y = 1340,
    r = 1035;
  glow(c, x + 460, 367, 270, "#ffd09a", 0.65, 0.55);
  oval(c, x + 450, 372, 36, 36, "#fff0cd");
  c.save();
  c.beginPath();
  c.arc(x, y, r, 0, TAU);
  c.clip();
  const g = c.createLinearGradient(0, 300, 0, 810);
  g.addColorStop(0, "#8fbdcf");
  g.addColorStop(0.12, "#3e7598");
  g.addColorStop(0.46, "#284e71");
  g.addColorStop(1, "#122946");
  c.fillStyle = g;
  c.fillRect(x - r, y - r, 2 * r, r);
  const random = rng(688);
  for (let i = 0; i < 4000; i++) {
    const xx = x - r + 2 * r * random(),
      yy = 300 + random() * 515;
    const val = fractal(xx / 120 + yy / 100, Math.floor(yy / 36));
    glow(
      c,
      xx,
      yy,
      9 + random() * 44,
      val > 0.5 ? "#dfddd3" : "#3a685f",
      0.06 + val * 0.14,
      0.04 + 0.12 * random(),
    );
  }
  c.restore();
  for (const [width, col] of [
    [12, "#a7ddf322"],
    [5, "#d9f4f493"],
    [1.6, "#f4e6d8"],
  ] as const) {
    c.beginPath();
    c.arc(x, y, r, Math.PI, TAU);
    c.strokeStyle = col;
    c.lineWidth = width;
    c.stroke();
  }
  for (let i = 0; i < 140; i++) {
    const rand = rng(i + 22);
    glow(
      c,
      rand() * W,
      591 + rand() * 110,
      30 + rand() * 180,
      "#b2a7b0",
      0.08,
      0.1 + rand() * 0.09,
    );
  }
  rock(c, MID - 490, 945, 1120, 230, p, 88);
  rock(c, MID + 370, 953, 480, 169, p, 182);
}
function valley(c: Ctx, p: Palette) {
  const x = MID + 130;
  pines(c, p, 86, 550, 70, 1350);
  rock(c, x, 605, 260, 64, p, 82);
  arch(c, x, 495, 64, p.glow, 147, false);
  const stream = (y: number) =>
    x - 121 * Math.sin((y - 560) / 110) + 65 * Math.sin((y - 560) / 66);
  const width = (y: number) => 12 + (y - 570) * 0.67;
  const bank: P[] = [],
    other: P[] = [];
  for (let y = 575; y <= 930; y += 3) {
    bank.push([stream(y) - width(y), y]);
    other.push([stream(y) + width(y), y]);
  }
  c.save();
  c.beginPath();
  [...bank, ...other.reverse()].forEach(([a, b], i) =>
    i ? c.lineTo(a, b) : c.moveTo(a, b),
  );
  c.closePath();
  c.clip();
  const water = c.createLinearGradient(0, 575, 0, 930);
  water.addColorStop(0, "#8eafa1");
  water.addColorStop(0.33, "#496e72");
  water.addColorStop(1, "#244650");
  c.fillStyle = water;
  c.fillRect(0, 575, W, 355);
  const r = rng(549);
  for (let i = 0; i < 2600; i++) {
    const y = 575 + r() * 350,
      xx = stream(y) + (r() * 2 - 1) * width(y);
    c.globalAlpha = 0.1 + r() * 0.36;
    line(
      c,
      [
        [xx, y],
        [xx + 1 + r() * (3 + (y - 575) * 0.092), y + 0.2],
      ],
      Math.abs(xx - x) < 20 ? "#a4e2c8" : i % 3 ? p.tint : p.rock[4],
      0.5 + r() * 1.4,
    );
  }
  c.restore();
  for (let i = 0; i < 280; i++) {
    const yy = 590 + r() * 330,
      xx = stream(yy) + (r() > 0.5 ? -1 : 1) * (width(yy) + r() * 560);
    const h = 3 + r() ** 3 * 20;
    poly(
      c,
      [
        [xx, yy],
        [xx - h * 0.25, yy - h],
        [xx + h * 0.24, yy - h * 0.42],
        [xx + h * 0.42, yy],
      ],
      "#204438",
    );
  }
}
function meadow(c: Ctx, p: Palette) {
  const rand = rng(773),
    cx = MID + 100;
  for (let i = 0; i < 14000; i++) {
    const y = 559 + rand() * 364,
      depth = (y - 559) / 364,
      x = rand() * W;
    const path = cx + 115 * Math.sin(depth * 5.6) - depth * 128;
    if (Math.abs(x - path) < 14 + depth * 84) continue;
    const h = (0.6 + rand() * 11) * (depth + 0.14),
      b = (rand() - 0.5) * h;
    line(
      c,
      [
        [x, y],
        [x + b * 0.4, y - h * 0.57],
        [x + b, y - h],
      ],
      "#476061",
      0.55 + depth * 0.7,
    );
    if (i % 3 === 0) {
      const color = ["#b7abd8", "#b7d5e0", "#dfaaca", "#9dd9cd"][
        Math.floor(rand() * 4)
      ];
      c.globalAlpha = 0.5 + rand() * 0.48;
      oval(c, x + b, y - h, 0.7 + depth * 2.8, 0.5 + depth * 1.5, color);
      c.globalAlpha = 1;
      if (i % 27 === 0) glow(c, x + b, y - h, 3 + depth * 13, color, 0.38);
    }
  }
  for (let i = 0; i < 390; i++) {
    const x = rand() * W,
      y = 487 + rand() * 235,
      r = 0.7 + rand() * 0.9;
    glow(c, x, y, r * 4.8, p.glow, 0.18);
    oval(c, x, y, r, r, "#f1dfff");
  }
}
function chamber(c: Ctx, p: Palette, lab: boolean) {
  const x = MID + 100,
    y = 445,
    r = rng(911);
  for (let i = -5; i < 6; i++) {
    const xx = x + i * 190;
    poly(
      c,
      [
        [xx - 18, 170],
        [xx + 10, 176],
        [xx + 13, 553],
        [xx - 21, 561],
      ],
      p.rock[3],
    );
    line(
      c,
      [
        [xx + 8, 190],
        [xx + 8, 521],
      ],
      p.glow,
      1.5,
    );
  }
  const floor = c.createLinearGradient(0, 535, 0, H);
  floor.addColorStop(0, p.rock[3]);
  floor.addColorStop(1, p.rock[4]);
  c.fillStyle = floor;
  c.fillRect(0, 550, W, 370);
  for (let j = 0; j < 9; j++) {
    const scale = 1 + j * 0.4;
    oval(c, x, 596, scale * 123, scale * 23, j % 2 ? p.rock[2] : p.rock[1], 1);
  }
  glow(c, x, y, 220, p.glow, 0.19);
  for (let i = 0; i < 8800; i++) {
    const a = r() * TAU,
      b = r() * TAU;
    let xx: number, yy: number, depth: number;
    if (lab) {
      const s = Math.cos(b),
        w = 93 * (1 + 0.15 * Math.sin(4 * a + 3 * b));
      xx = w * s * Math.cos(a);
      yy = w * Math.sin(b);
      depth = s * Math.sin(a);
    } else {
      const v = (r() - 0.5) * 2,
        t = 2.7 * a + v * 0.83;
      xx = (80 + 36 * Math.cos(t)) * Math.cos(a) + v * 16;
      yy =
        (80 + 36 * Math.cos(t)) * Math.sin(a) * 0.48 +
        52 * Math.sin(t) +
        v * 25;
      depth = Math.cos(t);
    }
    const k = (depth + 1) * 0.5;
    c.globalAlpha = 0.16 + k * 0.7;
    c.fillStyle = i % 6 === 0 ? "#fcedd8" : p.glow;
    c.fillRect(x + xx * 1.39, y + yy, 0.65 + k * 0.94, 0.65 + k * 0.94);
  }
  c.globalAlpha = 1;
}
let lastId = "",
  plate: HTMLCanvasElement | undefined;
function create(id: string) {
  const image = document.createElement("canvas");
  image.width = W;
  image.height = H;
  const c = image.getContext("2d")!;
  const p = palettes[id] ?? palettes.hub,
    seed = id.split("").reduce((s, k) => s + k.charCodeAt(0), 0);
  night(c, p, seed);
  if (id === "earth") orbital(c, p);
  else {
    if (id === "field") {
      glow(c, MID + 260, 281, 150, "#ffcbdc", 0.36);
      oval(c, MID + 260, 281, 31, 31, "#f2d6d6");
    } else if (id === "valley") {
      glow(c, MID - 160, 298, 90, "#e3efd9", 0.3);
      oval(c, MID - 160, 298, 16, 16, "#e2efd7");
    } else if (id === "hub") {
      const sx = MID + 197;
      glow(c, sx, 350, 310, "#ffc09b", 0.43, 0.7);
      oval(c, sx, 350, 49, 49, "#ffe5ae");
      glow(c, sx, 350, 70, "#fff0b4", 0.19);
    }
    for (let i = 0; i < 4; i++)
      ridge(
        c,
        p,
        i,
        seed + i * 151,
        [485, 520, 569, 625][i],
        [210, 185, 165, 132][i],
      );
    if (id === "valley") valley(c, p);
    else if (id === "field") meadow(c, p);
    else if (id === "sculpture" || id === "lab") chamber(c, p, id === "lab");
    else station(c, p);
  }
  // A fine deterministic grain avoids banding across low-contrast gradients.
  const tile = document.createElement("canvas");
  tile.width = tile.height = 96;
  const tc = tile.getContext("2d")!,
    noise = tc.createImageData(96, 96),
    r = rng(614);
  for (let i = 0; i < noise.data.length; i += 4) {
    const n = r() > 0.5 ? 255 : 0;
    noise.data[i] = noise.data[i + 1] = noise.data[i + 2] = n;
    noise.data[i + 3] = Math.floor(r() * 11);
  }
  tc.putImageData(noise, 0, 0);
  const grain = c.createPattern(tile, "repeat");
  if (grain) {
    c.fillStyle = grain;
    c.fillRect(0, 0, W, H);
  }
  return image;
}

/** Yaw in radians, increasing toward the right. Coordinates use CSS pixels. */
export function paintPanorama(
  canvas: HTMLCanvasElement,
  id: string,
  yaw: number,
): void {
  const c = canvas.getContext("2d");
  if (!c) return;
  if (!plate || lastId !== id) {
    plate = create(id);
    lastId = id;
  }
  const rect = canvas.getBoundingClientRect(),
    ratio = Math.min(window.devicePixelRatio || 1, 1.6);
  const width = Math.max(1, Math.round((rect.width || innerWidth) * ratio)),
    height = Math.max(1, Math.round((rect.height || innerHeight) * ratio));
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }
  const span = Math.min(W, (H * width) / height),
    top = (H - (span * height) / width) * 0.44,
    sourceH = Math.min(H, (span * height) / width);
  const center = MID + (span < 740 ? 95 : 0) + (yaw * W) / TAU;
  const start = (((center - span * 0.5) % W) + W) % W,
    first = Math.min(span, W - start),
    cut = (width * first) / span;
  c.drawImage(plate, start, top, first, sourceH, 0, 0, cut, height);
  if (span - first > 0.001)
    c.drawImage(
      plate,
      0,
      top,
      span - first,
      sourceH,
      cut,
      0,
      width - cut,
      height,
    );
}
