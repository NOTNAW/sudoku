// --- 1. Setup ---
const board = document.getElementById('board');
const messageEl = document.getElementById('message');
const timerEl = document.getElementById('timer');
const bestEl = document.getElementById('best');
const cells = [];
let grid = new Array(81).fill(0);
let given = new Array(81).fill(false);
let solution = new Array(81).fill(0);
let selectedIndex = -1;
let notesMode = false;
let hintState = null;
let won = false;
let elapsedSeconds = 0;
let timerInterval = null;

// --- 2. Build the grid ---
for (let i = 0; i < 81; i++) {
  const cell = document.createElement('div');
  cell.className = 'cell';
  cell.addEventListener('click', () => selectCell(i));
  board.appendChild(cell);
  cells.push(cell);
}

// --- 3. Selection ---
function selectCell(i) {
  if (selectedIndex !== -1) {
    cells[selectedIndex].classList.remove('selected');
  }
  selectedIndex = i;
  cells[i].classList.add('selected');
  highlightPeers(i);
  refreshConflicts();
}

function highlightPeers(i) {
  cells.forEach(c => c.classList.remove('peer'));
  const row = Math.floor(i / 9);
  const col = i % 9;
  const boxRow = Math.floor(row / 3) * 3;
  const boxCol = Math.floor(col / 3) * 3;
  for (let r = 0; r < 9; r++) {
    for (let c = 0; c < 9; c++) {
      const j = r * 9 + c;
      if (j === i) continue;
      const inRow = r === row;
      const inCol = c === col;
      const inBox = r >= boxRow && r < boxRow + 3 &&
                    c >= boxCol && c < boxCol + 3;
      if (inRow || inCol || inBox) cells[j].classList.add('peer');
    }
  }
}

// --- 4. Conflicts ---
function checkGroup(indices, conflicts) {
  const seen = {};
  for (const i of indices) {
    const v = grid[i];
    if (v === 0) continue;
    if (seen[v] !== undefined) {
      conflicts.add(i);
      conflicts.add(seen[v]);
    } else {
      seen[v] = i;
    }
  }
}

function getConflicts() {
  const conflicts = new Set();
  for (let i = 0; i < 9; i++) {
    const rowIndices = [];
    const colIndices = [];
    for (let j = 0; j < 9; j++) {
      rowIndices.push(i * 9 + j);
      colIndices.push(j * 9 + i);
    }
    checkGroup(rowIndices, conflicts);
    checkGroup(colIndices, conflicts);
  }
  for (let br = 0; br < 3; br++) {
    for (let bc = 0; bc < 3; bc++) {
      const boxIndices = [];
      for (let r = 0; r < 3; r++) {
        for (let c = 0; c < 3; c++) {
          boxIndices.push((br * 3 + r) * 9 + (bc * 3 + c));
        }
      }
      checkGroup(boxIndices, conflicts);
    }
  }
  return conflicts;
}

function refreshConflicts() {
  cells.forEach(c => c.classList.remove('conflict'));
  getConflicts().forEach(i => cells[i].classList.add('conflict'));
}

// --- 5. Timer & best times ---
function formatTime(seconds) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0');
}

function startTimer() {
  stopTimer();
  timerInterval = setInterval(() => {
    elapsedSeconds++;
    timerEl.textContent = formatTime(elapsedSeconds);
    if (elapsedSeconds % 5 === 0) saveState();
  }, 1000);
}

function stopTimer() {
  if (timerInterval) {
    clearInterval(timerInterval);
    timerInterval = null;
  }
}

function loadBestTimes() {
  try {
    return JSON.parse(localStorage.getItem('sudoku-best-times') || '{}');
  } catch { return {}; }
}

function saveBestTime(difficulty, time) {
  const times = loadBestTimes();
  if (!times[difficulty] || time < times[difficulty]) {
    times[difficulty] = time;
    try {
      localStorage.setItem('sudoku-best-times', JSON.stringify(times));
    } catch {}
    return true;
  }
  return false;
}

function showBestTime(difficulty) {
  const times = loadBestTimes();
  bestEl.textContent = times[difficulty]
    ? 'Best: ' + formatTime(times[difficulty])
    : 'Best: —';
}

// --- 6. Save / load state ---
function saveState() {
  try {
    localStorage.setItem('sudoku-state', JSON.stringify({
      version: 1,
      grid, given, solution,
      difficulty: document.getElementById('difficulty').value,
      elapsed: elapsedSeconds,
    }));
  } catch {}
}

function loadState() {
  try {
    const raw = localStorage.getItem('sudoku-state');
    if (!raw) return null;
    const s = JSON.parse(raw);
    if (!Array.isArray(s.grid) || s.grid.length !== 81) return null;
    if (!Array.isArray(s.given) || s.given.length !== 81) return null;
    if (!Array.isArray(s.solution) || s.solution.length !== 81) return null;
    return s;
  } catch { return null; }
}

function clearState() {
  try { localStorage.removeItem('sudoku-state'); } catch {}
}

// --- 7. Keyboard ---
document.addEventListener('keydown', (e) => {
  if (e.key.startsWith('Arrow')) {
    e.preventDefault();
    if (selectedIndex === -1) { selectCell(0); return; }
    let next = selectedIndex;
    if (e.key === 'ArrowUp' && selectedIndex >= 9) next = selectedIndex - 9;
    if (e.key === 'ArrowDown' && selectedIndex <= 71) next = selectedIndex + 9;
    if (e.key === 'ArrowLeft' && selectedIndex % 9 !== 0) next = selectedIndex - 1;
    if (e.key === 'ArrowRight' && selectedIndex % 9 !== 8) next = selectedIndex + 1;
    if (next !== selectedIndex) selectCell(next);
    return;
  }

  if (selectedIndex === -1) return;
  if (given[selectedIndex]) return;

  if (e.key >= '1' && e.key <= '9') {
    clearHint();
    grid[selectedIndex] = Number(e.key);
    renderAll();
    refreshConflicts();
    saveState();
    checkWin();
  }
  if (e.key === 'Backspace' || e.key === 'Delete') {
    clearHint();
    grid[selectedIndex] = 0;
    renderAll();
    refreshConflicts();
    saveState();
  }
});

// --- 8. Rendering ---
function getCandidates(g, i) {
  if (g[i] !== 0) return [];
  const row = Math.floor(i / 9);
  const col = i % 9;
  const used = new Set();
  for (let c = 0; c < 9; c++) used.add(g[row * 9 + c]);
  for (let r = 0; r < 9; r++) used.add(g[r * 9 + col]);
  const br = Math.floor(row / 3) * 3;
  const bc = Math.floor(col / 3) * 3;
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 3; c++) {
      used.add(g[(br + r) * 9 + (bc + c)]);
    }
  }
  const cands = [];
  for (let n = 1; n <= 9; n++) if (!used.has(n)) cands.push(n);
  return cands;
}

function candidatesHTML(cands) {
  let html = '<div class="cands">';
  for (let n = 1; n <= 9; n++) {
    html += cands.includes(n) ? `<span>${n}</span>` : '<span></span>';
  }
  return html + '</div>';
}

function renderCell(i) {
  const cell = cells[i];
  if (grid[i] !== 0) {
    cell.innerHTML = String(grid[i]);
  } else if (notesMode) {
    cell.innerHTML = candidatesHTML(getCandidates(grid, i));
  } else {
    cell.innerHTML = '';
  }
}

function renderAll() {
  for (let i = 0; i < 81; i++) renderCell(i);
}

function displayGrid() {
  for (let i = 0; i < 81; i++) {
    const cell = cells[i];
    cell.classList.remove('given', 'selected', 'conflict', 'peer',
                          'hint-target', 'hint-group', 'solved-pop');
    if (given[i]) cell.classList.add('given');
  }
  selectedIndex = -1;
  hintState = null;
  messageEl.textContent = '';
  renderAll();
}

// --- 9. Win ---
function checkWin() {
  if (won) return false;
  for (let i = 0; i < 81; i++) if (grid[i] !== solution[i]) return false;
  won = true;
  stopTimer();
  clearState();
  const difficulty = document.getElementById('difficulty').value;
  const isNewBest = saveBestTime(difficulty, elapsedSeconds);
  showBestTime(difficulty);
  messageEl.textContent = isNewBest
    ? `Solved in ${formatTime(elapsedSeconds)}! New best! 🎉`
    : `Solved in ${formatTime(elapsedSeconds)}! 🎉`;
  cells.forEach(c => c.classList.add('solved-pop'));
  return true;
}

// --- 10. Solver ---
function isValid(g, index, num) {
  const row = Math.floor(index / 9);
  const col = index % 9;
  for (let c = 0; c < 9; c++) if (g[row * 9 + c] === num) return false;
  for (let r = 0; r < 9; r++) if (g[r * 9 + col] === num) return false;
  const br = Math.floor(row / 3) * 3;
  const bc = Math.floor(col / 3) * 3;
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 3; c++) {
      if (g[(br + r) * 9 + (bc + c)] === num) return false;
    }
  }
  return true;
}

function solve(g) {
  const empty = g.indexOf(0);
  if (empty === -1) return true;
  for (let num = 1; num <= 9; num++) {
    if (isValid(g, empty, num)) {
      g[empty] = num;
      if (solve(g)) return true;
      g[empty] = 0;
    }
  }
  return false;
}

// --- 11. Generator ---
function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function fillGrid(g) {
  const empty = g.indexOf(0);
  if (empty === -1) return true;
  const numbers = shuffle([1, 2, 3, 4, 5, 6, 7, 8, 9]);
  for (const num of numbers) {
    if (isValid(g, empty, num)) {
      g[empty] = num;
      if (fillGrid(g)) return true;
      g[empty] = 0;
    }
  }
  return false;
}

function countSolutions(g, limit) {
  const empty = g.indexOf(0);
  if (empty === -1) return 1;
  let count = 0;
  for (let num = 1; num <= 9; num++) {
    if (isValid(g, empty, num)) {
      g[empty] = num;
      count += countSolutions(g, limit);
      g[empty] = 0;
      if (count >= limit) return count;
    }
  }
  return count;
}

const DIFFICULTY_CLUES = { easy: 42, medium: 32, hard: 26 };

function generatePuzzle(targetClues) {
  const full = new Array(81).fill(0);
  fillGrid(full);
  solution = full.slice();
  const puzzle = full.slice();
  const positions = shuffle([...Array(81).keys()]);
  let clues = 81;
  for (const pos of positions) {
    if (clues <= targetClues) break;
    const backup = puzzle[pos];
    puzzle[pos] = 0;
    if (countSolutions(puzzle.slice(), 2) !== 1) {
      puzzle[pos] = backup;
    } else {
      clues--;
    }
  }
  return puzzle;
}

// --- 12. New game ---
function newGame() {
  clearState();
  clearHint();
  stopTimer();
  const difficulty = document.getElementById('difficulty').value;
  const puzzle = generatePuzzle(DIFFICULTY_CLUES[difficulty]);
  grid = puzzle.slice();
  given = puzzle.map(v => v !== 0);
  won = false;
  elapsedSeconds = 0;
  timerEl.textContent = formatTime(0);
  showBestTime(difficulty);
  displayGrid();
  refreshConflicts();
  startTimer();
  saveState();
}

// --- 13. Hints ---
function cellName(i) {
  return `R${Math.floor(i / 9) + 1}C${(i % 9) + 1}`;
}

function describeGroup(indices) {
  const firstRow = Math.floor(indices[0] / 9);
  const firstCol = indices[0] % 9;
  if (indices.every(i => Math.floor(i / 9) === firstRow)) return `row ${firstRow + 1}`;
  if (indices.every(i => i % 9 === firstCol)) return `column ${firstCol + 1}`;
  const br = Math.floor(firstRow / 3);
  const bc = Math.floor(firstCol / 3);
  return `box ${br * 3 + bc + 1}`;
}

function findHiddenSingle(g, groupIndices) {
  for (let num = 1; num <= 9; num++) {
    let alreadyPresent = false;
    for (const i of groupIndices) {
      if (g[i] === num) { alreadyPresent = true; break; }
    }
    if (alreadyPresent) continue;
    const candidates = [];
    for (const i of groupIndices) {
      if (g[i] !== 0) continue;
      if (getCandidates(g, i).includes(num)) candidates.push(i);
    }
    if (candidates.length === 1) {
      const target = candidates[0];
      return {
        type: 'hidden-single',
        index: target,
        value: num,
        groupHighlight: groupIndices,
        message: `In ${describeGroup(groupIndices)}, only ${cellName(target)} can be ${num}.`,
      };
    }
  }
  return null;
}

function findNextStep(g) {
  for (let i = 0; i < 81; i++) {
    if (g[i] !== 0) continue;
    const cands = getCandidates(g, i);
    if (cands.length === 1) {
      return {
        type: 'naked-single', index: i, value: cands[0], groupHighlight: [],
        message: `${cellName(i)} can only be ${cands[0]}. Every other number is blocked by its row, column, or box.`,
      };
    }
  }
  for (let row = 0; row < 9; row++) {
    const idxs = [];
    for (let c = 0; c < 9; c++) idxs.push(row * 9 + c);
    const r = findHiddenSingle(g, idxs);
    if (r) return r;
  }
  for (let col = 0; col < 9; col++) {
    const idxs = [];
    for (let row = 0; row < 9; row++) idxs.push(row * 9 + col);
    const r = findHiddenSingle(g, idxs);
    if (r) return r;
  }
  for (let br = 0; br < 3; br++) {
    for (let bc = 0; bc < 3; bc++) {
      const idxs = [];
      for (let r = 0; r < 3; r++)
        for (let c = 0; c < 3; c++)
          idxs.push((br * 3 + r) * 9 + (bc * 3 + c));
      const r = findHiddenSingle(g, idxs);
      if (r) return r;
    }
  }
  return null;
}

function clearHint() {
  hintState = null;
  cells.forEach(c => {
    c.classList.remove('hint-target');
    c.classList.remove('hint-group');
  });
  messageEl.textContent = '';
}

function showHint() {
  clearHint();
  if (selectedIndex !== -1) {
    cells[selectedIndex].classList.remove('selected');
    selectedIndex = -1;
  }
  cells.forEach(c => c.classList.remove('peer'));

  if (getConflicts().size > 0) {
    messageEl.textContent = 'Fix the red cells first, then ask for a hint.';
    return;
  }
  for (let i = 0; i < 81; i++) {
    if (grid[i] !== 0 && !given[i] && grid[i] !== solution[i]) {
      messageEl.textContent = 'One of your numbers is wrong. Clear it, or click Solve to see the answer.';
      return;
    }
  }
  const step = findNextStep(grid);
  if (!step) {
    messageEl.textContent = 'No basic hint available. Try Solve, or keep looking manually.';
    return;
  }
  hintState = step;
  cells[step.index].classList.add('hint-target');
  if (step.groupHighlight) {
    for (const i of step.groupHighlight) {
      if (i !== step.index && !given[i]) cells[i].classList.add('hint-group');
    }
  }
  messageEl.textContent = step.message;
}

// --- 14. Buttons ---
document.getElementById('new-btn').addEventListener('click', newGame);

document.getElementById('notes-btn').addEventListener('click', () => {
  notesMode = !notesMode;
  document.getElementById('notes-btn').classList.toggle('active', notesMode);
  renderAll();
});

document.getElementById('hint-btn').addEventListener('click', showHint);

document.getElementById('solve-btn').addEventListener('click', () => {
  if (getConflicts().size > 0) {
    alert('Fix the red cells first.');
    return;
  }
  if (solve(grid)) {
    given = grid.map(() => true);
    stopTimer();
    clearState();
    won = true;
    displayGrid();
    messageEl.textContent = 'Solution revealed. Click New Puzzle to try again.';
  } else {
    alert('No solution found.');
  }
});

document.getElementById('difficulty').addEventListener('change', () => {
  showBestTime(document.getElementById('difficulty').value);
});

window.addEventListener('beforeunload', saveState);

// --- 15. PWA service worker ---
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}

// --- 16. Boot ---
function boot() {
  const saved = loadState();
  if (saved) {
    grid = saved.grid;
    given = saved.given;
    solution = saved.solution;
    elapsedSeconds = saved.elapsed || 0;
    document.getElementById('difficulty').value = saved.difficulty || 'medium';
    won = false;
    displayGrid();
    refreshConflicts();
    timerEl.textContent = formatTime(elapsedSeconds);
    showBestTime(saved.difficulty || 'medium');
    startTimer();
  } else {
    newGame();
  }
}

boot();