'use strict';

const COLS = 10;
const ROWS = 20;
const BLOCK = 30;

const COLORS = [
  null,
  '#4dd0e1', // I - cyan
  '#ffd54f', // O - yellow
  '#ba68c8', // T - purple
  '#81c784', // S - green
  '#e57373', // Z - red
  '#64b5f6', // J - pale blue
  '#ffb74d', // L - orange
];

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
const hsNameForm = document.getElementById('hs-name-form');
const hsNameInput = document.getElementById('hs-name-input');
const hsSubmitBtn = document.getElementById('hs-submit-btn');
const hsStats = document.getElementById('hs-stats');
const hsTable = document.getElementById('hs-table');
const resetRecordsBtn = document.getElementById('reset-records-btn');

const THEME_KEY = 'tetris-theme';
const HS_KEY = 'tetris-highscores';
const HS_NAME_KEY = 'tetris-last-name';
const HS_COMBO_KEY = 'tetris-best-combo';
const HS_LINES_KEY = 'tetris-max-lines';

let board, current, next, score, lines, level, paused, gameOver, lastTime, dropAccum, dropInterval, animId;
let comboStreak = 0;
let bestCombo = 0;
let maxLines = 0;
let gridColor = '#22222e';

// ---- localStorage helpers ----

function getHighScores() {
  try {
    return JSON.parse(localStorage.getItem(HS_KEY)) || [];
  } catch (_) {
    return [];
  }
}

function lsGetInt(key) {
  try { return parseInt(localStorage.getItem(key), 10) || 0; } catch (_) { return 0; }
}

function lsGetStr(key) {
  try { return localStorage.getItem(key) || ''; } catch (_) { return ''; }
}

function saveHighScore(entry) {
  const scores = getHighScores();
  scores.push(entry);
  scores.sort((a, b) => b.score - a.score);
  scores.splice(5);
  localStorage.setItem(HS_KEY, JSON.stringify(scores));
}

function qualifiesForTop5(s) {
  const scores = getHighScores();
  if (scores.length < 5) return true;
  return s > (scores[4].score ?? 0);
}

function renderHighScores(currentEntry) {
  const scores = getHighScores();
  if (!scores.length) {
    hsTable.innerHTML = '<p class="hs-empty">Sin récords aún</p>';
    hsTable.classList.remove('hidden');
    return;
  }
  const cols = ['#', 'Nombre', 'Puntos', 'Líneas', 'Combo'];
  let html = '<table class="hs-table"><thead><tr>';
  cols.forEach(c => { html += `<th>${c}</th>`; });
  html += '</tr></thead><tbody>';
  scores.forEach((entry, i) => {
    const isCurrent = currentEntry &&
      entry.name === currentEntry.name &&
      entry.score === currentEntry.score &&
      entry.date === currentEntry.date;
    const cls = isCurrent ? ' class="hs-current"' : '';
    html += `<tr${cls}>`;
    html += `<td>${i + 1}</td>`;
    html += `<td>${escapeHtml(entry.name)}</td>`;
    html += `<td>${entry.score.toLocaleString()}</td>`;
    html += `<td>${entry.lines}</td>`;
    html += `<td>${entry.combo}</td>`;
    html += '</tr>';
  });
  html += '</tbody></table>';
  hsTable.innerHTML = html;
  hsTable.classList.remove('hidden');
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ---- Start screen ----

function showStartScreen() {
  bestCombo = lsGetInt(HS_COMBO_KEY);
  maxLines = lsGetInt(HS_LINES_KEY);
  overlayTitle.textContent = 'TETRIS';
  overlayScore.textContent = '';
  hsNameForm.classList.add('hidden');
  resetRecordsBtn.classList.remove('hidden');

  // Show stats and scores if any exist
  if (bestCombo || maxLines) {
    const parts = [];
    if (bestCombo) parts.push(`Mejor combo: <strong>${bestCombo}</strong>`);
    if (maxLines) parts.push(`Máx. líneas de una vez: <strong>${maxLines}</strong>`);
    hsStats.innerHTML = `<p class="hs-stats">${parts.join(' &nbsp;|&nbsp; ')}</p>`;
    hsStats.classList.remove('hidden');
  } else {
    hsStats.classList.add('hidden');
  }
  const scores = getHighScores();
  if (scores.length) {
    renderHighScores(null);
  } else {
    hsTable.classList.add('hidden');
  }

  // Replace restart button text for start screen
  restartBtn.textContent = 'Comenzar';
  overlay.classList.remove('hidden');
}

// ---- Game-over high score flow ----

function showHighScoreEntry() {
  hsNameInput.value = lsGetStr(HS_NAME_KEY);
  hsNameForm.classList.remove('hidden');
  hsTable.classList.add('hidden');
  hsNameInput.focus();
}

function submitHighScore() {
  const name = hsNameInput.value.trim() || 'Anónimo';
  const date = new Date().toISOString();
  const entry = { name, score, lines, combo: bestCombo, date };
  try { localStorage.setItem(HS_NAME_KEY, name); } catch (_) { /* ignore */ }
  saveHighScore(entry);
  hsNameForm.classList.add('hidden');
  renderHighScores(entry);
  resetRecordsBtn.classList.remove('hidden');
}

// ---- Board ----

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
    comboStreak++;
    if (comboStreak > bestCombo) {
      bestCombo = comboStreak;
      try { localStorage.setItem(HS_COMBO_KEY, bestCombo); } catch (_) { /* ignore */ }
    }
    if (cleared > maxLines) {
      maxLines = cleared;
      try { localStorage.setItem(HS_LINES_KEY, maxLines); } catch (_) { /* ignore */ }
    }
    updateHUD();
  } else {
    comboStreak = 0;
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

function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  localStorage.setItem(THEME_KEY, theme);
  themeSwitch.checked = theme === 'light';
  gridColor = getComputedStyle(document.documentElement).getPropertyValue('--grid-line').trim();
  if (board) draw();
}

function initTheme() {
  const saved = localStorage.getItem(THEME_KEY);
  applyTheme(saved === 'light' ? 'light' : 'dark');
}

themeSwitch.addEventListener('change', () => {
  applyTheme(themeSwitch.checked ? 'light' : 'dark');
});

function drawBlock(context, x, y, colorIndex, size, alpha) {
  if (!colorIndex) return;
  const color = COLORS[colorIndex];
  context.globalAlpha = alpha ?? 1;
  context.fillStyle = color;
  context.fillRect(x * size + 1, y * size + 1, size - 2, size - 2);
  // highlight
  context.fillStyle = 'rgba(255,255,255,0.12)';
  context.fillRect(x * size + 1, y * size + 1, size - 2, 4);
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
  hsNameForm.classList.add('hidden');
  hsStats.classList.add('hidden');
  hsTable.classList.add('hidden');
  restartBtn.textContent = 'Reiniciar';
  resetRecordsBtn.classList.remove('hidden');
  overlay.classList.remove('hidden');

  if (qualifiesForTop5(score)) {
    showHighScoreEntry();
  } else {
    renderHighScores(null);
  }
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
    hsNameForm.classList.add('hidden');
    hsStats.classList.add('hidden');
    hsTable.classList.add('hidden');
    resetRecordsBtn.classList.add('hidden');
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
  comboStreak = 0;
  lastTime = performance.now();
  next = randomPiece();
  spawn();
  updateHUD();
  overlay.classList.add('hidden');
  cancelAnimationFrame(animId);
  animId = requestAnimationFrame(loop);
}

// ---- Event listeners ----

restartBtn.addEventListener('click', init);

hsSubmitBtn.addEventListener('click', submitHighScore);

hsNameInput.addEventListener('keydown', e => {
  if (e.key === 'Enter') submitHighScore();
});

resetRecordsBtn.addEventListener('click', () => {
  if (confirm('¿Estás seguro de que quieres restablecer todos los récords?')) {
    localStorage.removeItem(HS_KEY);
    localStorage.removeItem(HS_COMBO_KEY);
    localStorage.removeItem(HS_LINES_KEY);
    bestCombo = 0;
    maxLines = 0;
    if (gameOver) {
      hsStats.classList.add('hidden');
      renderHighScores(null);
    } else if (!paused) {
      showStartScreen();
    } else {
      hsStats.classList.add('hidden');
      hsTable.classList.add('hidden');
    }
  }
});

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

initTheme();
showStartScreen();
