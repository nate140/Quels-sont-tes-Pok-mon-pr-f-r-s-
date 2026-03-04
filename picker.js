// Configuration
const IMAGE_FOLDER = './pokemon/';
const BATCH_SIZE = 20;
const DATA_SOURCE = './pokemon-data.csv';
const MAX_FAVORITES = 12;

// État global
let allPokemon = [];
let state = {
    eliminated: [],
    current: [],
    survived: [],
    evaluating: [],
    favorites: []
};
let history = [];
let selectedIds = new Set();

// ============================================================
// SONS 8-BIT (Web Audio API — aucun fichier externe)
// ============================================================
let audioCtx = null;

function getAudioCtx() {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    return audioCtx;
}

function playTone(frequency, duration, type = 'square', volume = 0.15) {
    try {
        const ctx = getAudioCtx();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.type = type;
        osc.frequency.setValueAtTime(frequency, ctx.currentTime);
        gain.gain.setValueAtTime(volume, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
        osc.start(ctx.currentTime);
        osc.stop(ctx.currentTime + duration);
    } catch(e) {}
}

function soundSelect()   { playTone(523, 0.08); }
function soundDeselect() { playTone(330, 0.08, 'square', 0.1); }
function soundPass()     { playTone(392, 0.1, 'triangle', 0.1); }
function soundUndo()     { playTone(440, 0.06); setTimeout(() => playTone(330, 0.1), 70); }

function soundPick() {
    playTone(523, 0.08);
    setTimeout(() => playTone(659, 0.08), 80);
    setTimeout(() => playTone(784, 0.12), 160);
}

function soundFavorite() {
    [523, 659, 784, 1047].forEach((note, i) => {
        setTimeout(() => playTone(note, 0.15, 'square', 0.18), i * 100);
    });
    setTimeout(() => playTone(1047, 0.4, 'square', 0.2), 420);
}

// ============================================================
// INITIALISATION
// ============================================================
async function init() {
    try {
        await loadPokemonData();
        console.log(`${allPokemon.length} Pokémon chargés`);
        state.current = allPokemon.map(p => p.id);
        shuffleArray(state.current);
        loadNextBatch();
        updateUI();
        document.getElementById('pickBtn').addEventListener('click', pick);
        document.getElementById('passBtn').addEventListener('click', pass);
        document.getElementById('undoBtn').addEventListener('click', undo);
    } catch (error) {
        console.error('Erreur:', error);
        document.getElementById('pokemonGrid').innerHTML = `
            <div class="empty-message">ERREUR<br><br>Impossible de charger les données.<br><br>Vérifiez que ${DATA_SOURCE} existe.</div>
        `;
    }
}

async function loadPokemonData() {
    const response = await fetch(DATA_SOURCE);
    const csvText = await response.text();
    const lines = csvText.split('\n');
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;
        const parts = line.split(',').map(s => s.trim());
        if (parts.length >= 3) {
            const id = parseInt(parts[0]);
            const name = parts[1];
            const url = parts[2];
            if (!isNaN(id) && name && url) allPokemon.push({ id, name, image: url });
        }
    }
}

function shuffleArray(array) {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
}

// ============================================================
// GRILLE ADAPTATIVE
// ============================================================
function getBatchSize() {
    const remaining = state.current.length + state.survived.length;
    const size = Math.max(2, Math.min(BATCH_SIZE, Math.ceil(remaining / 5)));
    if (state.current.length < 2 && state.survived.length > 0) {
        state.current = [...state.current, ...state.survived];
        state.survived = [];
        shuffleArray(state.current);
    }
    return Math.min(size, state.current.length);
}

function getGridLayout(count) {
    // Grille fixe 5 colonnes — aucun resize, les cases vides restent vides
    return { cols: 5 };
}

// ============================================================
// LOGIQUE PRINCIPALE
// ============================================================
function loadNextBatch() {
    if (state.current.length === 0) {
        if (state.survived.length === 1) {
            const favoriteId = state.survived[0];
            state.favorites.push(favoriteId);

            const pokemon = allPokemon.find(p => p.id === favoriteId);
            if (pokemon) showFavoriteCelebration(pokemon, state.favorites.length);

            if (state.favorites.length >= MAX_FAVORITES) {
                updateUI();
                setTimeout(() => endGame(), 1800);
                return;
            }

            const toRevive = [];
            state.eliminated = state.eliminated.filter(elim => {
                if (elim.eliminatedBy.includes(favoriteId)) {
                    elim.eliminatedBy = elim.eliminatedBy.filter(id => id !== favoriteId);
                    if (elim.eliminatedBy.length === 0) { toRevive.push(elim.id); return false; }
                }
                return true;
            });
            state.current = toRevive;
            state.survived = [];
            shuffleArray(state.current);

        } else if (state.survived.length > 1) {
            state.current = state.survived;
            state.survived = [];
            shuffleArray(state.current);
        } else {
            endGame();
            return;
        }
    }

    const batchSize = getBatchSize();
    state.evaluating = state.current.splice(0, batchSize);
    selectedIds.clear();
    displayBatch();
}

function displayBatch() {
    const grid = document.getElementById('pokemonGrid');
    grid.innerHTML = '';
    if (state.evaluating.length === 0) {
        grid.innerHTML = '<div class="empty-message">Calcul en cours...</div>';
        return;
    }
    const count = state.evaluating.length;
    // Sur mobile on plafonne à 4 colonnes, sur desktop 5
    const isMobile = window.innerWidth <= 768;
    const maxCols = isMobile ? 4 : 5;
    const cols = Math.min(count, maxCols);
    grid.style.gridTemplateColumns = `repeat(${cols}, 1fr)`;

    const placeholder = `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='100' height='100'%3E%3Crect width='100' height='100' fill='%23c8d4a8'/%3E%3Ctext x='50%25' y='50%25' text-anchor='middle' dy='.3em' font-size='28' fill='%232d3a1e'%3E?%3C/text%3E%3C/svg%3E`;

    state.evaluating.forEach(id => {
        const pokemon = allPokemon.find(p => p.id === id);
        if (!pokemon) return;
        const card = document.createElement('div');
        card.className = 'pokemon-card';
        if (selectedIds.has(id)) card.classList.add('selected');
        card.innerHTML = `
            <img src="${pokemon.image}" alt="${pokemon.name}" class="pokemon-image"
                 onerror="this.src='${placeholder}'">
            <div class="pokemon-name">${pokemon.name}</div>
        `;
        card.addEventListener('click', () => toggleSelection(id, card));
        grid.appendChild(card);
    });
}

function toggleSelection(id, cardElement) {
    if (selectedIds.has(id)) {
        selectedIds.delete(id);
        cardElement.classList.remove('selected');
        soundDeselect();
    } else {
        selectedIds.add(id);
        cardElement.classList.add('selected');
        soundSelect();
    }
}

function pick() {
    if (selectedIds.size === 0) { alert('Sélectionne au moins un Pokémon!'); return; }
    soundPick();
    saveHistory();
    const picked = Array.from(selectedIds);
    const notPicked = state.evaluating.filter(id => !selectedIds.has(id));
    state.survived.push(...picked);
    notPicked.forEach(id => {
        let existing = state.eliminated.find(e => e.id === id);
        if (!existing) { existing = { id, eliminatedBy: [] }; state.eliminated.push(existing); }
        picked.forEach(pickId => { if (!existing.eliminatedBy.includes(pickId)) existing.eliminatedBy.push(pickId); });
    });
    state.evaluating = [];
    loadNextBatch();
    updateUI();
}

function pass() {
    soundPass();
    saveHistory();
    state.survived.push(...state.evaluating);
    state.evaluating = [];
    loadNextBatch();
    updateUI();
}

function saveHistory() {
    history.push(JSON.parse(JSON.stringify(state)));
    if (history.length > 10) history.shift();
}

function undo() {
    if (history.length === 0) return;
    soundUndo();
    state = history.pop();
    selectedIds.clear();
    displayBatch();
    updateUI();
}

function updateUI() {
    const totalRemaining = state.current.length + state.survived.length + state.evaluating.length;
    const totalPokemon = allPokemon.length;
    document.getElementById('remaining').textContent = totalRemaining;
    document.getElementById('total').textContent = totalPokemon;
    document.getElementById('currentRound').textContent = totalRemaining;
    const percentage = totalRemaining > 0 ? ((totalPokemon - totalRemaining) / totalPokemon) * 100 : 100;
    document.getElementById('progressBar').style.width = percentage + '%';
    document.getElementById('progressText').textContent = Math.round(percentage) + '%';
    document.getElementById('undoBtn').disabled = history.length === 0;

    // Bouton résultat anticipé dès 6 favoris
    const earlyBtn = document.getElementById('earlyResultBtn');
    if (state.favorites.length >= 6 && state.favorites.length < MAX_FAVORITES) {
        if (!earlyBtn) {
            const controls = document.querySelector('.controls');
            const btn = document.createElement('button');
            btn.className = 'btn btn-early';
            btn.id = 'earlyResultBtn';
            btn.textContent = '★ RÉSULTAT';
            btn.addEventListener('click', () => endGame());
            controls.appendChild(btn);
        }
    } else if (earlyBtn) {
        earlyBtn.remove();
    }

    displayFavorites();
}

// ============================================================
// FAVORIS
// ============================================================
function displayFavorites() {
    const list = document.getElementById('favoritesList');
    list.innerHTML = '';
    if (state.favorites.length === 0) {
        list.innerHTML = '<div class="empty-favorites">Tes favoris<br>apparaîtront ici...</div>';
        return;
    }
    const placeholder = `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='44' height='44'%3E%3Crect width='44' height='44' fill='%23c8d4a8'/%3E%3Ctext x='50%25' y='50%25' text-anchor='middle' dy='.3em' font-size='18' fill='%232d3a1e'%3E?%3C/text%3E%3C/svg%3E`;
    state.favorites.slice(0, MAX_FAVORITES).forEach((id, index) => {
        const pokemon = allPokemon.find(p => p.id === id);
        if (!pokemon) return;
        const item = document.createElement('li');
        item.className = 'favorite-item';
        item.setAttribute('data-rank', `#${index + 1}`);
        item.title = pokemon.name;
        item.innerHTML = `
            <div class="fav-tooltip">${pokemon.name}</div>
            <img src="${pokemon.image}" alt="${pokemon.name}" onerror="this.src='${placeholder}'">
        `;
        list.appendChild(item);
    });
}

// ============================================================
// CÉLÉBRATION FAVORI
// ============================================================
const professorQuotes = [
    "Intéressant choix, Dresseur !",
    "Ce Pokémon est vraiment remarquable !",
    "Ton instinct de Dresseur est sûr !",
    "Un choix que j'approuve pleinement !",
    "Les données confirment ton bon goût !",
    "Fascinant ! Ce Pokémon te ressemble !",
    "La science du Pokédex valide ce choix !",
    "Un Pokémon digne d'un grand Dresseur !",
    "Excellent ! Ma recherche te donne raison !",
    "TOP 10 COMPLET ! Équipe légendaire !"
];

function showFavoriteCelebration(pokemon, rank) {
    soundFavorite();

    const overlay = document.createElement('div');
    overlay.className = 'celebration-overlay';
    overlay.innerHTML = `
        <div class="celebration-box">
            <div class="celebration-rank">#${rank}</div>
            <div class="celebration-label">NOUVEAU FAVORI !</div>
            <img src="${pokemon.image}" alt="${pokemon.name}" class="celebration-img">
            <div class="celebration-name">${pokemon.name}</div>
            <div class="celebration-quote">"${professorQuotes[rank - 1] || professorQuotes[0]}"</div>
            <div style="display:flex;align-items:center;gap:8px;margin-top:8px;justify-content:center;">
                <img src="./professor-chen.png" 
                     alt="Prof. Chen" 
                     class="celebration-professor"
                     onerror="this.style.display='none';this.nextElementSibling.style.display='flex'">
                <div class="celebration-professor-placeholder" style="display:none">🧪</div>
                <div class="celebration-author">— Prof. Chen</div>
            </div>
        </div>
    `;

    for (let i = 0; i < 18; i++) {
        const pixel = document.createElement('div');
        pixel.className = 'confetti-pixel';
        pixel.style.left = Math.random() * 100 + '%';
        pixel.style.animationDelay = (Math.random() * 0.5) + 's';
        pixel.style.background = ['#9bbc0f','#306230','#8bac0f','#0f380f','#c8d4a8'][Math.floor(Math.random() * 5)];
        overlay.appendChild(pixel);
    }

    document.querySelector('.screen').appendChild(overlay);
    setTimeout(() => {
        overlay.style.opacity = '0';
        overlay.style.transition = 'opacity 0.4s ease';
        setTimeout(() => overlay.remove(), 400);
    }, 1600);
}

// ============================================================
// HALL OF FAME
// ============================================================
function endGame() {
    // Mélodie de victoire
    [392, 440, 494, 523, 587, 659, 784, 1047].forEach((note, i) => {
        setTimeout(() => playTone(note, 0.18, 'square', 0.15), i * 110);
    });

    const ph = (size) => `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='${size}' height='${size}'%3E%3Crect width='${size}' height='${size}' fill='%238888b8'/%3E%3Ctext x='50%25' y='50%25' text-anchor='middle' dy='.3em' font-size='${Math.floor(size*0.4)}' fill='%23ffffff'%3E?%3C/text%3E%3C/svg%3E`;
    const favs = state.favorites.slice(0, MAX_FAVORITES);

    // Confettis
    let confettiHTML = '';
    const confColors = ['#ff8ec4','#ffec6e','#7ad4ff','#a8f07a','#ffffff','#ff6b6b','#c8a0ff'];
    for (let i = 0; i < 35; i++) {
        const x = Math.random() * 100;
        const delay = Math.random() * 3;
        const dur = 2.5 + Math.random() * 2;
        const color = confColors[Math.floor(Math.random() * confColors.length)];
        const wide = Math.random() > 0.5 ? 'width:10px;' : '';
        confettiHTML += `<div class="hof-confetti" style="left:${x}%;animation-delay:${delay}s;animation-duration:${dur}s;background:${color};${wide}"></div>`;
    }

    // Rangée arrière : pokémon 1-3
    const backRow = favs.slice(0, 3).map((id, i) => {
        const p = allPokemon.find(pk => pk.id === id);
        if (!p) return '';
        return `<div class="hof-member" style="animation-delay:${0.3 + i * 0.25}s">
            <img src="${p.image}" alt="${p.name}" onerror="this.src='${ph(120)}'">
        </div>`;
    }).join('');

    // Rangée avant : pokémon 4-6
    const frontRow = favs.slice(3, 6).map((id, i) => {
        const p = allPokemon.find(pk => pk.id === id);
        if (!p) return '';
        return `<div class="hof-member" style="animation-delay:${1.1 + i * 0.2}s">
            <img src="${p.image}" alt="${p.name}" onerror="this.src='${ph(140)}'">
        </div>`;
    }).join('');

    // Banc : pokémon 7-12
    const bench = favs.slice(6, 12).map((id, i) => {
        const p = allPokemon.find(pk => pk.id === id);
        if (!p) return '';
        return `<div class="hof-bench-member" style="animation-delay:${1.7 + i * 0.15}s">
            <img src="${p.image}" alt="${p.name}" onerror="this.src='${ph(56)}'">
        </div>`;
    }).join('');

    const benchSection = bench ? `
        <div class="hof-bench-bar">
            <div class="hof-bench-label">BANC</div>
            <div class="hof-bench-row">${bench}</div>
        </div>` : '';

    document.querySelector('.main-container').innerHTML = `
        <div class="hof-screen">
            <div class="hof-frame">
                <div class="hof-arena">
                    ${confettiHTML}
                    <div class="hof-team">
                        <div class="hof-back-row">${backRow}</div>
                        <div class="hof-front-row">${frontRow}</div>
                    </div>
                </div>
                <div class="hof-bottom-bar">
                    <p>Welcome to the <span>HALL OF FAME!</span></p>
                </div>
            </div>
            ${benchSection}
            <button class="btn hof-restart-btn" onclick="location.reload()">↺ RECOMMENCER</button>
        </div>
    `;
}

// ============================================================
// DÉMARRAGE
// ============================================================
init();

function startGame() {
    const intro = document.getElementById('introScreen');
    intro.style.transition = 'opacity 0.5s ease';
    intro.style.opacity = '0';
    setTimeout(() => {
        intro.style.display = 'none';
        if (document.getElementById('pokemonGrid').children.length === 0) displayBatch();
    }, 500);
}
