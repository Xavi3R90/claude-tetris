'use strict';

const COLS = 10;
const ROWS = 20;
const BLOCK = 30;

const SKINS = {
  retro: {
    colors: ['#4dd0e1','#ffd54f','#ba68c8','#81c784','#e57373','#64b5f6','#ffb74d'],
  },
  neon: {
    colors: ['#00e5ff','#ffe500','#ea80fc','#69ff47','#ff5252','#40c4ff','#ffab40'],
  },
  pastel: {
    colors: ['#a5e8ee','#fff0a0','#d9b0e8','#b8e6b8','#f0b0b0','#a8ccf0','#f5d0a0'],
  },
  pixel: {
    colors: ['#4dd0e1','#ffd54f','#ba68c8','#81c784','#e57373','#64b5f6','#ffb74d'],
  },
};

const PIECES = [
  null,
  [[0,0,0,0],[1,1,1,1],[0,0,0,0],[0,0,0,0]], // I
  [[2,2],[2,2]],                               // O
  [[0,3,0],[3,3,3],[0,0,0]],                  // T
  [[0,4,4],[4,4,0],[0,0,0]],                  // S
  [[5,5,0],[0,5,5],[0,0,0]],                  // Z
  [[6,0,0],[6,6,6],[0,0,0]],                  // J
  [[0,0,7],[7,7,7],[0,0,0]],                  // L
];

const LINE_SCORES = [0, 100, 300, 500, 800];

const canvas = document.getElementById('board');
const ctx = canvas.getContext('2d');
const nextCanvas = document.getElementById('next-canvas');
const nextCtx = nextCanvas.getContext('2d');
const scoreEl = document.getElementById('score');
const linesEl = document.getElementById('lines');
const levelEl = document.getElementById('level');
const overlay = document.getElementById('overlay');
const overlayTitle = document.getElementById('overlay-title');
const overlayScore = document.getElementById('overlay-score');
const restartBtn = document.getElementById('restart-btn');
const themeSwitch = document.getElementById('theme-switch');
const skinSelect = document.getElementById('skin-select');

const THEME_KEY = 'tetris-theme';
const SKIN_KEY = 'tetris-skin';

let currentSkin = 'retro';
let board, current, next, score, lines, level, paused, gameOver, lastTime, dropAccum, dropInterval, animId;
let gridColor = '#22222e';

function createBoard() {
  return Array.from({ length: ROWS }, () => new Array(COLS).fill(0));
}

function randomPiece() {
  const type = Math.floor(Math.random() * 7) + 1;
  const shape = PIECES[type].map(row => [...row]);
  return { type, shape, x: Math.floor(COLS / 2) - Math.floor(shape[0].length / 2), y: 0 };
}

function collide(shape, ox, oy) {
  for (let r = 0; r < shape.length; r++) {
    for (let c = 0; c < shape[r].length; c++) {
      if (!shape[r][c]) continue;
      const nx = ox + c;
      const ny = oy + r;
      if (nx < 0 || nx >= COLS || ny >= ROWS) return true;
      if (ny >= 0 && board[ny][nx]) return true;
    }
  }
  return false;
}

function rotateCW(shape) {
  const rows = shape.length, cols = shape[0].length;
  const result = Array.from({ length: cols }, () => new Array(rows).fill(0));
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++)
      result[c][rows - 1 - r] = shape[r][c];
  return result;
}

function tryRotate() {
  const rotated = rotateCW(current.shape);
  const kicks = [0, -1, 1, -2, 2];
  for (const kick of kicks) {
    if (!collide(rotated, current.x + kick, current.y)) {
      current.shape = rotated;
      current.x += kick;
      return;
    }
  }
}

function merge() {
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      if (current.shape[r][c])
        board[current.y + r][current.x + c] = current.shape[r][c];
}

function clearLines() {
  let cleared = 0;
  for (let r = ROWS - 1; r >= 0; r--) {
    if (board[r].every(v => v !== 0)) {
      board.splice(r, 1);
      board.unshift(new Array(COLS).fill(0));
      cleared++;
      r++;
    }
  }
  if (cleared) {
    lines += cleared;
    score += (LINE_SCORES[cleared] || 0) * level;
    level = Math.floor(lines / 10) + 1;
    dropInterval = Math.max(100, 1000 - (level - 1) * 90);
    updateHUD();
  }
}

function ghostY() {
  let gy = current.y;
  while (!collide(current.shape, current.x, gy + 1)) gy++;
  return gy;
}

function hardDrop() {
  const gy = ghostY();
  score += (gy - current.y) * 2;
  current.y = gy;
  lockPiece();
}

function softDrop() {
  if (!collide(current.shape, current.x, current.y + 1)) {
    current.y++;
    score += 1;
    updateHUD();
  } else {
    lockPiece();
  }
}

function lockPiece() {
  merge();
  clearLines();
  spawn();
}

function spawn() {
  current = next;
  next = randomPiece();
  if (collide(current.shape, current.x, current.y)) {
    endGame();
  }
  drawNext();
}

function updateHUD() {
  scoreEl.textContent = score.toLocaleString();
  linesEl.textContent = lines;
  levelEl.textContent = level;
}

function refreshGridColor() {
  gridColor = getComputedStyle(document.documentElement).getPropertyValue('--grid-line').trim();
}

function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  localStorage.setItem(THEME_KEY, theme);
  themeSwitch.checked = theme === 'light';
  refreshGridColor();
  if (board) draw();
}

function initTheme() {
  const saved = localStorage.getItem(THEME_KEY);
  applyTheme(saved === 'light' ? 'light' : 'dark');
}

function applySkin(skin) {
  currentSkin = skin;
  document.documentElement.setAttribute('data-skin', skin);
  localStorage.setItem(SKIN_KEY, skin);
  skinSelect.value = skin;
  refreshGridColor();
  if (board) draw();
}

function initSkin() {
  const saved = localStorage.getItem(SKIN_KEY) || 'retro';
  applySkin(saved);
}

themeSwitch.addEventListener('change', () => {
  applyTheme(themeSwitch.checked ? 'light' : 'dark');
});

skinSelect.addEventListener('change', () => applySkin(skinSelect.value));

function drawBlock(context, x, y, colorIndex, size, alpha) {
  if (!colorIndex) return;
  const color = SKINS[currentSkin].colors[colorIndex - 1];
  const a = alpha ?? 1;
  const px = x * size + 1;
  const py = y * size + 1;
  const w = size - 2;

  context.globalAlpha = a;

  if (currentSkin === 'neon') {
    context.shadowColor = color;
    context.shadowBlur = 12;
    context.fillStyle = color;
    context.fillRect(px, py, w, w);
    context.shadowBlur = 0;
    context.shadowColor = 'transparent';
    context.fillStyle = 'rgba(0,0,0,0.4)';
    context.fillRect(px + 3, py + 3, w - 6, w - 6);
  } else if (currentSkin === 'pastel') {
    const r = 5;
    context.fillStyle = color;
    context.beginPath();
    if (context.roundRect) {
      context.roundRect(px, py, w, w, r);
    } else {
      context.rect(px, py, w, w);
    }
    context.fill();
    context.fillStyle = 'rgba(255,255,255,0.3)';
    context.beginPath();
    if (context.roundRect) {
      context.roundRect(px, py, w, 5, [r, r, 0, 0]);
    } else {
      context.rect(px, py, w, 5);
    }
    context.fill();
  } else if (currentSkin === 'pixel') {
    context.fillStyle = color;
    context.fillRect(px, py, w, w);
    context.fillStyle = 'rgba(255,255,255,0.18)';
    for (let dx = 3; dx < w - 1; dx += 6) {
      for (let dy = 3; dy < w - 1; dy += 6) {
        context.fillRect(px + dx, py + dy, 2, 2);
      }
    }
    context.fillStyle = 'rgba(0,0,0,0.25)';
    context.fillRect(px + w - 2, py, 2, w);
    context.fillRect(px, py + w - 2, w, 2);
  } else {
    context.fillStyle = color;
    context.fillRect(px, py, w, w);
    context.fillStyle = 'rgba(255,255,255,0.12)';
    context.fillRect(px, py, w, 4);
  }

  context.globalAlpha = 1;
}

function drawGrid() {
  ctx.strokeStyle = gridColor;
  ctx.lineWidth = 0.5;
  for (let c = 1; c < COLS; c++) {
    ctx.beginPath();
    ctx.moveTo(c * BLOCK, 0);
    ctx.lineTo(c * BLOCK, ROWS * BLOCK);
    ctx.stroke();
  }
  for (let r = 1; r < ROWS; r++) {
    ctx.beginPath();
    ctx.moveTo(0, r * BLOCK);
    ctx.lineTo(COLS * BLOCK, r * BLOCK);
    ctx.stroke();
  }
}

function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  drawGrid();

  // board
  for (let r = 0; r < ROWS; r++)
    for (let c = 0; c < COLS; c++)
      drawBlock(ctx, c, r, board[r][c], BLOCK);

  if (gameOver) return;

  // ghost
  const gy = ghostY();
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      if (current.shape[r][c])
        drawBlock(ctx, current.x + c, gy + r, current.shape[r][c], BLOCK, 0.2);

  // current piece
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      drawBlock(ctx, current.x + c, current.y + r, current.shape[r][c], BLOCK);
}

function drawNext() {
  const NB = 30;
  nextCtx.clearRect(0, 0, nextCanvas.width, nextCanvas.height);
  const shape = next.shape;
  const offX = Math.floor((4 - shape[0].length) / 2);
  const offY = Math.floor((4 - shape.length) / 2);
  for (let r = 0; r < shape.length; r++)
    for (let c = 0; c < shape[r].length; c++)
      drawBlock(nextCtx, offX + c, offY + r, shape[r][c], NB);
}

function endGame() {
  gameOver = true;
  cancelAnimationFrame(animId);
  overlayTitle.textContent = 'GAME OVER';
  overlayScore.textContent = `Puntuación: ${score.toLocaleString()}`;
  overlay.classList.remove('hidden');
}

function togglePause() {
  if (gameOver) return;
  paused = !paused;
  if (!paused) {
    lastTime = performance.now();
    loop(lastTime);
  } else {
    cancelAnimationFrame(animId);
    overlayTitle.textContent = 'PAUSA';
    overlayScore.textContent = '';
    overlay.classList.remove('hidden');
  }
}

function loop(ts) {
  const dt = ts - lastTime;
  lastTime = ts;
  dropAccum += dt;
  if (dropAccum >= dropInterval) {
    dropAccum = 0;
    if (!collide(current.shape, current.x, current.y + 1)) {
      current.y++;
    } else {
      lockPiece();
    }
  }
  draw();
  if (!gameOver) animId = requestAnimationFrame(loop);
}

function init() {
  board = createBoard();
  score = 0;
  lines = 0;
  level = 1;
  paused = false;
  gameOver = false;
  dropInterval = 1000;
  dropAccum = 0;
  lastTime = performance.now();
  next = randomPiece();
  spawn();
  updateHUD();
  overlay.classList.add('hidden');
  cancelAnimationFrame(animId);
  animId = requestAnimationFrame(loop);
}

document.addEventListener('keydown', e => {
  if (e.code === 'KeyP') { togglePause(); return; }
  if (paused || gameOver) return;
  switch (e.code) {
    case 'ArrowLeft':
      if (!collide(current.shape, current.x - 1, current.y)) current.x--;
      break;
    case 'ArrowRight':
      if (!collide(current.shape, current.x + 1, current.y)) current.x++;
      break;
    case 'ArrowDown':
      softDrop();
      break;
    case 'ArrowUp':
    case 'KeyX':
      tryRotate();
      break;
    case 'Space':
      e.preventDefault();
      hardDrop();
      break;
  }
  updateHUD();
});

restartBtn.addEventListener('click', init);

initTheme();
initSkin();
init();
