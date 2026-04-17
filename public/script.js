const words = [
    // Poziome (H)
    { id: 'h1', answer: 'RIMA', x: 1, y: 5, dir: 'right', clue: 'Rym w\nwierszu', clueX: 0, clueY: 5 },
    { id: 'h2', answer: 'KOMPUTER', x: 1, y: 2, dir: 'right', clue: 'Osobisty\nlub\nprzenośny', clueX: 0, clueY: 2 },
    { id: 'h3', answer: 'TERA', x: 6, y: 2, dir: 'right', clue: 'Przedrostek\n(10^12)', clueX: 5, clueY: 2 },
    { id: 'h4', answer: 'MYSZKA', x: 1, y: 4, dir: 'right', clue: 'Zwierzę\nlub sprzęt', clueX: 0, clueY: 4 },
    { id: 'h5', answer: 'OAZA', x: 5, y: 4, dir: 'right', clue: 'Pustynny\nraj', clueX: 4, clueY: 4 },
    { id: 'h6', answer: 'WIATR', x: 2, y: 6, dir: 'right', clue: 'Gwiżdże\nw polu', clueX: 1, clueY: 6 },
    { id: 'h7', answer: 'SALA', x: 1, y: 8, dir: 'right', clue: 'Duże\npomieszczenie', clueX: 0, clueY: 8 },
    { id: 'h8', answer: 'AKT', x: 3, y: 9, dir: 'right', clue: 'Dzieło\nmalarskie', clueX: 2, clueY: 9 },
    { id: 'h9', answer: 'EWA', x: 7, y: 5, dir: 'right', clue: 'Pierwsza\nkobieta', clueX: 6, clueY: 5 },
    { id: 'h10', answer: 'BAL', x: 7, y: 7, dir: 'right', clue: 'Duża\nimpreza', clueX: 6, clueY: 7 },
    { id: 'h11', answer: 'NOS', x: 7, y: 9, dir: 'right', clue: 'Narząd\nwęchu', clueX: 6, clueY: 9 },
    { id: 'h12', answer: 'BOB', x: 1, y: 0, dir: 'right', clue: 'Pszczoła', clueX: 0, clueY: 0 },
    { id: 'h13', answer: 'AS', x: 8, y: 7, dir: 'right', clue: 'Karta', clueX: 7, clueY: 7 },

    // Pionowe (V)
    { id: 'v1', answer: 'AMOS', x: 3, y: 1, dir: 'down', clue: 'Imię\nmęskie', clueX: 3, clueY: 0 },
    { id: 'v2', answer: 'SPIZ', x: 4, y: 1, dir: 'down', clue: 'Stop\nmiedzi', clueX: 4, clueY: 0 },
    { id: 'v3', answer: 'KOMORA', x: 1, y: 2, dir: 'down', clue: 'Serca\nlub celna', clueX: 1, clueY: 1 },
    { id: 'v4', answer: 'ORYGINA', x: 2, y: 2, dir: 'down', clue: 'Pierwowzór\n(potocznie)', clueX: 2, clueY: 1 },
    { id: 'v5', answer: 'TEATRY', x: 6, y: 2, dir: 'down', clue: 'Kina\ni ...', clueX: 6, clueY: 1 },
    { id: 'v6', answer: 'EKRAN', x: 7, y: 2, dir: 'down', clue: 'Telewizyjny', clueX: 7, clueY: 1 },
    { id: 'v7', answer: 'RYAD', x: 8, y: 2, dir: 'down', clue: 'Stolica\nArabii', clueX: 8, clueY: 1 },
    { id: 'v8', answer: 'IGLA', x: 3, y: 6, dir: 'down', clue: 'W stogu\nsiana', clueX: 3, clueY: 5 },
    { id: 'v9', answer: 'LATO', x: 9, y: 2, dir: 'down', clue: 'Pora\nroku', clueX: 9, clueY: 1 },
    { id: 'v10', answer: 'KOT', x: 5, y: 6, dir: 'down', clue: 'Mruczący\npupil', clueX: 5, clueY: 5 },
    { id: 'v11', answer: 'TYL', x: 9, y: 7, dir: 'down', clue: 'Zad', clueX: 9, clueY: 6 }
];

const width = 10;
const height = 10;

let activeWordId = null;
let activeCell = null;

// Initialize grid structure
const grid = Array(height).fill(null).map(() => Array(width).fill(null));

// Populate grid with clues and letter cells
words.forEach(word => {
    // Place clue
    grid[word.clueY][word.clueX] = {
        type: 'clue',
        text: word.clue,
        dir: word.dir,
        wordId: word.id
    };

    // Place letters
    for (let i = 0; i < word.answer.length; i++) {
        const lx = word.dir === 'right' ? word.x + i : word.x;
        const ly = word.dir === 'down' ? word.y + i : word.y;
        
        if (!grid[ly][lx] || grid[ly][lx].type !== 'letter') {
            grid[ly][lx] = {
                type: 'letter',
                words: [word.id],
                value: '',
                x: lx,
                y: ly
            };
        } else {
            // Intersection
            grid[ly][lx].words.push(word.id);
        }
    }
});

// Logging utility
async function logAction(action, details) {
    try {
        await fetch('/api/log', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action, details })
        });
    } catch (err) {
        console.error('Failed to log action', err);
    }
}

function initGrid() {
    const gridContainer = document.getElementById('crossword-grid');
    gridContainer.style.gridTemplateColumns = `repeat(${width}, var(--cell-size))`;
    gridContainer.style.gridTemplateRows = `repeat(${height}, var(--cell-size))`;

    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const cellData = grid[y][x];
            const cellEl = document.createElement('div');
            cellEl.classList.add('cell');
            
            if (!cellData) {
                cellEl.classList.add('empty');
            } else if (cellData.type === 'clue') {
                cellEl.classList.add('clue');
                const arrow = cellData.dir === 'right' ? '➔' : (cellData.dir === 'down' ? '⬇' : '');
                cellEl.innerHTML = `<span class="clue-text-inner">${cellData.text.replace(/\n/g, '<br>')}</span><span class="dir-arrow">${arrow}</span>`;
                cellEl.addEventListener('click', () => selectWord(cellData.wordId));
            } else if (cellData.type === 'letter') {
                cellEl.classList.add('letter');
                cellEl.dataset.x = x;
                cellEl.dataset.y = y;
                
                const input = document.createElement('input');
                input.type = 'text';
                input.maxLength = 1;
                input.dataset.x = x;
                input.dataset.y = y;
                
                input.addEventListener('focus', () => {
                    activeCell = { x, y };
                    if (!activeWordId || !cellData.words.includes(activeWordId)) {
                        selectWord(cellData.words[0]);
                    }
                    highlightWord(activeWordId);
                });

                input.addEventListener('input', (e) => {
                    logAction('letter_typed', { x, y, value: e.target.value, wordId: activeWordId });
                    if (e.target.value) {
                        moveToNextCell();
                    }
                });

                input.addEventListener('keydown', (e) => {
                    if (e.key === 'Backspace' && !e.target.value) {
                        moveToPrevCell();
                    } else if (e.key === 'ArrowRight' || e.key === 'ArrowLeft' || e.key === 'ArrowUp' || e.key === 'ArrowDown') {
                        e.preventDefault();
                        handleArrowNav(e.key, x, y);
                    }
                });

                cellEl.appendChild(input);
            }
            gridContainer.appendChild(cellEl);
        }
    }
    
    logAction('session_start', { timestamp: new Date().toISOString() });
}

function getCellInput(x, y) {
    return document.querySelector(`input[data-x="${x}"][data-y="${y}"]`);
}

function selectWord(wordId) {
    activeWordId = wordId;
    const word = words.find(w => w.id === wordId);
    
    document.getElementById('active-clue-title').innerText = `Hasło: ${word.dir === 'right' ? 'Poziomo' : 'Pionowo'}`;
    document.getElementById('active-clue-text').innerText = word.clue.replace(/\n/g, ' ');
    document.getElementById('input-container').style.display = 'block';
    document.getElementById('word-input').value = '';
    
    highlightWord(wordId);
    logAction('clue_selected', { wordId, clue: word.clue.replace(/\n/g, ' ') });
}

function highlightWord(wordId) {
    document.querySelectorAll('.cell.letter').forEach(c => {
        c.classList.remove('highlight', 'active');
    });

    const word = words.find(w => w.id === wordId);
    if (!word) return;

    for (let i = 0; i < word.answer.length; i++) {
        const lx = word.dir === 'right' ? word.x + i : word.x;
        const ly = word.dir === 'down' ? word.y + i : word.y;
        const cellEl = document.querySelector(`.cell.letter[data-x="${lx}"][data-y="${ly}"]`);
        if (cellEl) {
            cellEl.classList.add('highlight');
            if (activeCell && activeCell.x === lx && activeCell.y === ly) {
                cellEl.classList.add('active');
            }
        }
    }
}

function getActiveWordCells() {
    if (!activeWordId) return [];
    const word = words.find(w => w.id === activeWordId);
    const cells = [];
    for (let i = 0; i < word.answer.length; i++) {
        cells.push({
            x: word.dir === 'right' ? word.x + i : word.x,
            y: word.dir === 'down' ? word.y + i : word.y
        });
    }
    return cells;
}

function moveToNextCell() {
    const cells = getActiveWordCells();
    if (!activeCell || cells.length === 0) return;
    
    const currentIndex = cells.findIndex(c => c.x === activeCell.x && c.y === activeCell.y);
    if (currentIndex >= 0 && currentIndex < cells.length - 1) {
        const next = cells[currentIndex + 1];
        const input = getCellInput(next.x, next.y);
        if (input) input.focus();
    }
}

function moveToPrevCell() {
    const cells = getActiveWordCells();
    if (!activeCell || cells.length === 0) return;
    
    const currentIndex = cells.findIndex(c => c.x === activeCell.x && c.y === activeCell.y);
    if (currentIndex > 0) {
        const prev = cells[currentIndex - 1];
        const input = getCellInput(prev.x, prev.y);
        if (input) input.focus();
    }
}

function handleArrowNav(key, x, y) {
    let nx = x, ny = y;
    if (key === 'ArrowRight') nx++;
    if (key === 'ArrowLeft') nx--;
    if (key === 'ArrowDown') ny++;
    if (key === 'ArrowUp') ny--;
    
    const input = getCellInput(nx, ny);
    if (input) {
        input.focus();
        // Automatically switch active word based on direction
        const cellData = grid[ny][nx];
        if (cellData && cellData.words) {
            const dir = (key === 'ArrowRight' || key === 'ArrowLeft') ? 'right' : 'down';
            const matchingWord = cellData.words.find(wId => words.find(w => w.id === wId).dir === dir);
            if (matchingWord) selectWord(matchingWord);
        }
    }
}

// Global interactions
document.getElementById('submit-word').addEventListener('click', () => {
    const word = document.getElementById('word-input').value.toUpperCase();
    if (activeWordId && word) {
        const cells = getActiveWordCells();
        for (let i = 0; i < Math.min(word.length, cells.length); i++) {
            const input = getCellInput(cells[i].x, cells[i].y);
            if (input) input.value = word[i];
        }
        logAction('word_submitted', { wordId: activeWordId, word });
        document.getElementById('word-input').value = '';
    }
});

document.getElementById('word-input').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        document.getElementById('submit-word').click();
    }
});

document.getElementById('btn-dont-know').addEventListener('click', () => {
    logAction('user_clicked_dont_know', { wordId: activeWordId });
    alert('Zapisano, że nie znasz tego hasła. Przejdź do następnego!');
});

document.getElementById('btn-hint').addEventListener('click', () => {
    logAction('user_requested_hint', { wordId: activeWordId });
    if (!activeWordId) return;
    const word = words.find(w => w.id === activeWordId);
    const cells = getActiveWordCells();
    
    // Find first empty cell
    for (let i = 0; i < cells.length; i++) {
        const input = getCellInput(cells[i].x, cells[i].y);
        if (input && !input.value) {
            input.value = word.answer[i];
            break;
        }
    }
});

window.onload = initGrid;
