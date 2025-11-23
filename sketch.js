let maskImg; 
let handPose;
let video;
let hands = [];
let clouds = [];
let windX = 0;
let windY = 0;
let stars = [];
let numStars = 200;
let noiseSpeed = 0.8;
let windowDensity = 0.5;
let windowGrid = [];
const CELL_W = 5;
const CELL_H = 6;

function preload() {
  maskImg = loadImage("skyline.png");
  handPose = ml5.handPose();
}

function setup() {
  createCanvas(maskImg.width, maskImg.height);
  pixelDensity(1);
  noLoop();

  video = createCapture(VIDEO);
  video.size(640, 480);
  video.hide();
  handPose.detectStart(video, gotHands);

  windowDensity = random(0.2, 0.9);

  initClouds();
  initWindowsGrid();
  generateStars();
}

function initClouds() {
  clouds = [];
  for (let i = 0; i < int(random(40, 200)); i++) {
    let cx = random(width);
    let cy = random(height * 0.05, height * 0.45);
    let size = random(80, 200);
    let seed = floor(random(100000));
    clouds.push({ x: cx, y: cy, size: size, seed: seed });
  }
}

function generateStars() {
  stars = [];
  numStars = int(random(20, 250));

  maskImg.loadPixels();
  const w = maskImg.width;
  const h = maskImg.height;

  let skyBottom = h * 0.75 - 50;

  let attempts = 0;
  while (stars.length < numStars && attempts < numStars * 30) {
    attempts++;

    let x = int(random(w));
    let y = int(random(0, skyBottom));
    let idx = 4 * (x + y * w);
    let alpha = maskImg.pixels[idx + 3];
    if (alpha > 0) continue;

    let baseBrightness = map(y, skyBottom, 0, 0, 220);
    baseBrightness = constrain(baseBrightness, 0, 255);

    let size = random(1, 4);
    let noiseOffset = random(2000);

    stars.push({
      x,
      y,
      size,
      baseBrightness,
      noiseOffset
    });
  }
}

function drawStars() {
  if (stars.length === 0) return;

  let t = frameCount * 0.015 * noiseSpeed;

  let pollutionFactor = map(windowDensity, 0.2, 0.9, 1.0, 0.3);
  pollutionFactor = constrain(pollutionFactor, 0.1, 1.0);

  noStroke();
  for (let s of stars) {
    let n = noise(s.noiseOffset, t);
    let flickerFactor = map(n, 0, 1, 0.15, 3.0);

    let currentBrightness = s.baseBrightness * pollutionFactor * flickerFactor;
    currentBrightness = constrain(currentBrightness, 0, 255);

    let currentSize = s.size * map(flickerFactor, 0.2, 2.0, 0.8, 1.6);

    fill(255, 255, 255, currentBrightness);
    ellipse(s.x, s.y, currentSize, currentSize);
  }
}

function draw() {
  clear();

  updateWindFromHand();
  drawSkyGradient();
  drawStars();
  drawCloudLayer();

  maskImg.loadPixels();
  const w = maskImg.width;
  const h = maskImg.height;

  noStroke();
  fill(10, 10, 30);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const idx = 4 * (x + y * w);
      const alpha = maskImg.pixels[idx + 3];
      if (alpha > 0) rect(x, y, 1, 1);
    }
  }

  drawWindowsFromAlphaMask();

  noStroke();
  fill(255);
  textSize(16);
  text(mouseX + ':' + mouseY, 20, 30);

  fill(200);
  textSize(14);
  text("windX: " + windX.toFixed(2), 20, 55);
  text("windY: " + windY.toFixed(2), 20, 75);
}

function drawCloudLayer() {
  if (clouds.length === 0) return;

  for (let i = clouds.length - 1; i >= 0; i--) {
    let c = clouds[i];

    c.x += windX * 14;
    c.y += windY * 10;

    if (c.x > width + 150) c.x = -150;
    if (c.x < -150) c.x = width + 150;

    if (c.y < -150 || c.y > height + 150) {
      clouds.splice(i, 1);
      continue;
    }

    drawFluffyCloud(c.x, c.y, c.size, c.seed);
  }
}

function updateWindFromHand() {
  if (hands.length === 0) {
    windX *= 0.95;
    windY *= 0.95;
    return;
  }

  let hand = hands[0];
  let keypoint = hand.keypoints[8];
  let nx = keypoint.x;
  let ny = keypoint.y;

  let cx = video.width / 2;
  let cy = video.height / 2;

  let dx = (nx - cx) / cx;
  let dy = (ny - cy) / cy;

  let targetWindX = -dx;

  let targetWindY;
  if (dy < 0) {
    targetWindY = dy * 0.4;
  } else {
    targetWindY = 0;
  }

  windX = lerp(windX, targetWindX, 0.15);
  windY = lerp(windY, targetWindY, 0.15);

  if (dy > 0) {
    let k = constrain(dy, 0, 1);

    let oldDensity = windowDensity;

    let factor = 1 - 0.85 * k;
    let targetDensity = oldDensity * factor;
    targetDensity = max(targetDensity, 0.03);

    let newDensity = lerp(oldDensity, targetDensity, 0.35);
    newDensity = min(oldDensity, newDensity);

    let offProb = 0;
    if (oldDensity > 0) {
      offProb = 1 - (newDensity / oldDensity);
      offProb = constrain(offProb, 0, 1);
    }

    if (offProb > 0) {
      dimWindows(offProb);
    }

    windowDensity = newDensity;
  }
}

function dimWindows(offProb) {
  for (let row = 0; row < windowGrid.length; row++) {
    let rowArr = windowGrid[row];
    for (let col = 0; col < rowArr.length; col++) {
      let cell = rowArr[col];
      if (!cell || !cell.active || !cell.on) continue;

      if (random() < offProb) {
        cell.on = false;
      }
    }
  }
}

function drawFluffyCloud(cx, cy, size, seed) {
  if (seed !== undefined) {
    randomSeed(seed);
  }

  let circles = int(size * 0.8);
  noStroke();

  let topCol = color(40, 50, 90);
  let bottomWarmCol = color(230, 185, 140);
  let bottomCoolCol = color(170, 140, 120);

  let densityNorm = map(windowDensity, 0.2, 0.9, 0.3, 1.0);
  densityNorm = constrain(densityNorm, 0.3, 1.0);

  let bottomColAdj = lerpColor(bottomCoolCol, bottomWarmCol, densityNorm);

  for (let i = 0; i < circles; i++) {
    let angle = random(TWO_PI);
    let radius = random(0, size * 0.6);
    let x = cx + cos(angle) * radius;
    let y = cy + sin(angle) * radius * 0.6;
    let r = random(size * 0.2, size * 0.5);

    let heightFactor = constrain(map(cy, height * 0.05, height * 0.45, 0, 1), 0, 1);

    let baseCol = lerpColor(topCol, bottomColAdj, heightFactor);

    let jitter = random(-8, 10);

    let baseAlpha = map(heightFactor, 0, 1, 70, 150);
    let alphaScale = map(densityNorm, 0.3, 1.0, 0.6, 1.0);
    let alphaVal = baseAlpha * alphaScale;

    fill(
      red(baseCol)   + jitter,
      green(baseCol) + jitter,
      blue(baseCol)  + jitter,
      alphaVal
    );
    ellipse(x, y, r, r);
  }
}

function initWindowsGrid() {
  windowGrid = [];

  const w = maskImg.width;
  const h = maskImg.height;

  let minY = int(h * 0.25);
  let maxY = int(h * 0.95);

  maskImg.loadPixels();

  for (let y = minY, row = 0; y < maxY; y += CELL_H, row++) {
    let rowArr = [];
    for (let x = 0, col = 0; x < w; x += CELL_W, col++) {
      const idx = 4 * (x + y * w);
      const alpha = maskImg.pixels[idx + 3];

      let cell = {
        active: false,
        on: false,
        base: 0,
        warm: 0,
        alphaWin: 0
      };

      if (alpha > 0) {
        let blocked =
          (x >= 348 && x <= 355 && y >= 485 && y <= 527) ||
          (x >= 454 && x <= 460 && y >= 638 && y <= 677) ||
          (x >= 1128 && x <= 1136 && y >= 587 && y <= 623) ||
          (x >= 1134 && x <= 1140 && y >= 623 && y <= 745) ||
          (x >= 1383 && x <= 1399 && y >= 753 && y <= 767) ||
          (x >= 1470 && x <= 1474 && y >= 565 && y <= 664) ||
          (x >= 1485 && x <= 1501 && y >= 665 && y <= 707) ||
          (x >= 1499 && x <= 1505 && y >= 709 && y <= 753);

        if (!blocked) {
          cell.active = true;

          if (random() < windowDensity) {
            cell.on = true;
            cell.base = random(180, 255);
            cell.warm = random(-30, 30);
            cell.alphaWin = random(170, 255);
          }
        }
      }

      rowArr.push(cell);
    }
    windowGrid.push(rowArr);
  }
}

function drawWindowsFromAlphaMask() {
  const w = maskImg.width;
  const h = maskImg.height;

  let minY = int(h * 0.25);
  let maxY = int(h * 0.95);

  for (let y = minY, row = 0; y < maxY; y += CELL_H, row++) {
    let rowArr = windowGrid[row];
    if (!rowArr) continue;

    for (let x = 0, col = 0; x < w; x += CELL_W, col++) {
      let cell = rowArr[col];
      if (!cell || !cell.active || !cell.on) continue;

      let base = cell.base;
      let warm = cell.warm;
      let alphaWin = cell.alphaWin;

      fill(
        base,
        base - 60 + warm * 0.3,
        120 + warm,
        alphaWin
      );
      rect(x + 1, y + 1, CELL_W - 2, CELL_H - 2, 1);
    }
  }
}

function drawSkyGradient() {
  const h = height;

  let topCol    = color(5, 8, 18);
  let midCol    = color(18, 22, 45);
  let bottomCol = color(255, 160, 120);

  for (let y = 0; y < h; y++) {
    let t = y / h;

    let bottomStart = map(windowDensity, 0.2, 0.9, 0.78, 0.5);
    let midStart = 0.22;

    let c;
    if (t < midStart) {
      let tt = t / midStart;
      c = lerpColor(topCol, midCol, tt);
    } else if (t < bottomStart) {
      let tt = (t - midStart) / (bottomStart - midStart);
      c = lerpColor(midCol, bottomCol, tt);
    } else {
      c = bottomCol;
    }

    stroke(c);
    line(0, y, width, y);
  }
}

function mousePressed() {
  windowDensity = random(0.2, 0.6);

  initClouds();
  initWindowsGrid();
  generateStars();
  redraw();
}

function gotHands(results) {
  hands = results;
  if (hands.length > 0) {
    redraw();
  }
}
