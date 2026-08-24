# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Running the game

No build step, no dependencies. Open `index.html` directly or serve it with any static server:

```bash
# Windows
start index.html

# Any static server (Python, Node, PHP all work)
python3 -m http.server 8000
npx serve .
php -S localhost:8000
```

There is no `package.json`, no npm scripts, and no test framework.

## Architecture

Three files, no framework:

- **`index.html`** — DOM structure: a 300×600px `<canvas id="board">` for the game grid, a 120×120px canvas for the next-piece preview, a sidebar with score/lines/level HUD, and an overlay div for PAUSE / GAME OVER states.
- **`style.css`** — Dark arcade theme; purely visual, no layout logic.
- **`game.js`** — All game logic (~305 lines). Calls `init()` at the bottom, which starts the `requestAnimationFrame` loop immediately on page load.

## game.js internals

**State:** The board is a `ROWS × COLS` (20×10) matrix where `0` = empty and `1–7` = piece color index. `current` and `next` are objects `{ type, shape, x, y }`.

**Key constants (easy to tune):**

| Constant | Default | Notes |
|----------|---------|-------|
| `COLS` / `ROWS` | 10 / 20 | Adjust canvas `width`/`height` in HTML if changed |
| `BLOCK` | 30px | Cell size in pixels |
| `LINE_SCORES` | `[0,100,300,500,800]` | Points per 1–4 cleared lines (×level) |
| `dropInterval` | 1000ms | Initial drop speed; `max(100, 1000 − (level−1)×90)` per level |

**Game loop flow:**

```
init() → createBoard() → spawn() → requestAnimationFrame(loop)
loop(ts) → accumulate dt → drop/lockPiece() when dt ≥ dropInterval → draw()
keydown → move / tryRotate / softDrop / hardDrop / togglePause
```

**Key functions:**

- `collide(shape, ox, oy)` — boundary + overlap check
- `tryRotate()` — rotates with wall kicks (±0, ±1, ±2 column offsets)
- `clearLines()` — removes complete rows bottom-up, inserts empty row at top, updates score/level
- `ghostY()` — projects piece downward at 20% opacity
- `lockPiece()` → `merge()` → `clearLines()` → `spawn()` → game over check
- `endGame()` — cancels animation frame, shows overlay

**Scoring:** Classic Tetris — `LINE_SCORES[linesCleared] × level`. Soft drop +1pt/row, hard drop +2pt/row.

## Triage conventions (for Claude workflows)

- Issues are automatically triaged by `.github/workflows/claude-issue-triage.yml`.
- Label taxonomy (defined in `.github/labels.yml`): type (`bug` / `enhancement` / `question` / `documentation`) + priority (`priority:high` / `priority:medium` / `priority:low`) + area (`area:game-logic` / `area:ui` / `area:rendering` / `area:controls` / `area:scoring`) + `needs-info` when repro steps are missing.
- The diagnosis comment is posted in Spanish using the "Diagnóstico automático (Claude)" template.
- The workflow never edits the issue title or body — only comments and labels.
