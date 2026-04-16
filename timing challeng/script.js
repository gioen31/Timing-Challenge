// ------------------------- STATO GLOBALE -------------------------
const gameState = {
  phase: 'setup',            // 'setup', 'modeSelect', 'precision', 'estimation', 'results'
  players: [],               // { name: string, score: number }
  currentMode: null,         // 'precision' o 'estimation'
  roundData: {
    target: null,            // per precisione
    realTime: null,          // per stima
    attempts: [],            // { playerIndex, value, diff }
    estimator: null,         // indice giocatore che ha cronometrato (per stima)
    estimations: [],         // { playerIndex, guess, diff }
  },
  currentPlayerIndex: 0,     // indice giocatore di turno (precisione / stima cronometrista)
  turnStep: 'idle',          // 'awaitStart', 'timing', 'awaitStop', 'estimating', ...
  
  // NUOVO: gestione cronometrista equo per modalità stima
  estimationUsedEstimators: [],   // tiene traccia degli indici già usati come cronometristi
};

// Riferimenti DOM
const gameArea = document.getElementById('gameArea');
const scoreboardContainer = document.getElementById('scoreboardContainer');
const newGameBtn = document.getElementById('newGameBtn');

// ------------------------- FUNZIONI DI UTILITÀ -------------------------
function updateScoreboardUI() {
  if (!gameState.players.length) {
    scoreboardContainer.innerHTML = '<p class="placeholder">Nessun giocatore</p>';
    return;
  }
  const sorted = [...gameState.players].sort((a, b) => b.score - a.score);
  const list = document.createElement('ul');
  list.className = 'score-list';
  sorted.forEach(p => {
    const li = document.createElement('li');
    li.className = 'score-item';
    li.innerHTML = `<span class="player-name">${p.name}</span><span class="player-points">${p.score}</span>`;
    list.appendChild(li);
  });
  scoreboardContainer.innerHTML = '';
  scoreboardContainer.appendChild(list);
}

function randomTarget() {
  // tra 1.00 e 9.99 secondi
  return (Math.floor(Math.random() * 899) + 100) / 100;
}

// Calcola differenza assoluta
function absDiff(a, b) {
  return Math.abs(a - b);
}

// Reset per nuovo round (mantiene giocatori e punteggi)
function prepareNewRound() {
  gameState.phase = 'modeSelect';
  gameState.currentMode = null;
  gameState.roundData = {
    target: null,
    realTime: null,
    attempts: [],
    estimator: null,
    estimations: [],
  };
  gameState.currentPlayerIndex = 0;
  gameState.turnStep = 'idle';
  renderUI();
}

// Seleziona un cronometrista per la modalità stima secondo la regola equa
function selectEstimatorForEstimationRound() {
  const totalPlayers = gameState.players.length;
  const used = gameState.estimationUsedEstimators;
  
  let availableIndices = [];
  for (let i = 0; i < totalPlayers; i++) {
    if (!used.includes(i)) availableIndices.push(i);
  }
  
  let chosen;
  if (availableIndices.length > 0) {
    // Scegli casualmente tra quelli non ancora usati
    const randomIdx = Math.floor(Math.random() * availableIndices.length);
    chosen = availableIndices[randomIdx];
  } else {
    // Tutti hanno già fatto il cronometrista almeno una volta: scegli a caso tra tutti
    chosen = Math.floor(Math.random() * totalPlayers);
  }
  
  // Aggiungi ai used (se non già presente – potrebbe esserlo se ricominciamo dopo aver usato tutti)
  if (!used.includes(chosen)) {
    used.push(chosen);
  }
  
  return chosen;
}

// Fine round: determina vincitore, assegna punti, mostra risultati
function finishRoundAndShowResults() {
  gameState.phase = 'results';
  let winnerIndices = [];
  let minDiff = Infinity;

  if (gameState.currentMode === 'precision') {
    gameState.roundData.attempts.forEach(att => {
      if (att.diff < minDiff) {
        minDiff = att.diff;
        winnerIndices = [att.playerIndex];
      } else if (att.diff === minDiff) {
        winnerIndices.push(att.playerIndex);
      }
    });
    
    // Assegna punti (sempre, anche con 2 giocatori)
    winnerIndices.forEach(idx => { gameState.players[idx].score += 1; });
    
  } else { // modalità estimation
    gameState.roundData.estimations.forEach(est => {
      if (est.diff < minDiff) {
        minDiff = est.diff;
        winnerIndices = [est.playerIndex];
      } else if (est.diff === minDiff) {
        winnerIndices.push(est.playerIndex);
      }
    });
    
    // MODIFICA: se ci sono esattamente 2 giocatori, non assegnare punti nella modalità stima
    if (gameState.players.length !== 2) {
      winnerIndices.forEach(idx => { gameState.players[idx].score += 1; });
    }
    // Se sono 2 giocatori, semplicemente non si incrementa il punteggio di nessuno.
  }

  updateScoreboardUI();
  renderUI(); // mostrerà schermata risultati con pulsante per continuare
}

// ------------------------- RENDERING PRINCIPALE -------------------------
function renderUI() {
  switch (gameState.phase) {
    case 'setup': renderSetup(); break;
    case 'modeSelect': renderModeSelect(); break;
    case 'precision': renderPrecisionMode(); break;
    case 'estimation': renderEstimationMode(); break;
    case 'results': renderResults(); break;
    default: gameArea.innerHTML = '<p>Errore di stato</p>';
  }
}

// ------------------------- SETUP INIZIALE -------------------------
function renderSetup() {
  let html = `
    <h2>⚙️ Configurazione giocatori</h2>
    <div class="setup-form">
      <div class="input-group">
        <label for="playerCount">Numero di giocatori (2-8):</label>
        <select id="playerCountSelect">
          ${Array.from({length:7},(_,i)=>i+2).map(n=>`<option value="${n}">${n}</option>`).join('')}
        </select>
      </div>
      <div id="nameInputsContainer" class="player-names-inputs"></div>
      <button id="startGameBtn" class="btn-large">🎮 Inizia partita</button>
    </div>
  `;
  gameArea.innerHTML = html;

  const selectEl = document.getElementById('playerCountSelect');
  const container = document.getElementById('nameInputsContainer');

  function generateNameInputs(count) {
    let inputsHtml = '';
    for (let i=0; i<count; i++) {
      inputsHtml += `<input type="text" id="playerName${i}" placeholder="Nome giocatore ${i+1}" value="Giocatore ${i+1}" class="name-input">`;
    }
    container.innerHTML = inputsHtml;
  }

  generateNameInputs(parseInt(selectEl.value));
  selectEl.addEventListener('change', (e) => generateNameInputs(parseInt(e.target.value)));

  document.getElementById('startGameBtn').addEventListener('click', () => {
    const count = parseInt(selectEl.value);
    const players = [];
    for (let i=0; i<count; i++) {
      const nameInput = document.getElementById(`playerName${i}`);
      let name = nameInput.value.trim();
      if (name === '') name = `Giocatore ${i+1}`;
      players.push({ name, score: 0 });
    }
    gameState.players = players;
    gameState.phase = 'modeSelect';
    // Resetta anche il tracciamento dei cronometristi per la stima
    gameState.estimationUsedEstimators = [];
    updateScoreboardUI();
    renderUI();
  });
}

// ------------------------- SELEZIONE MODALITÀ -------------------------
function renderModeSelect() {
  let html = `
    <h2>🎲 Scegli la modalità</h2>
    <button id="modePrecisionBtn" class="btn-large" style="margin-bottom:20px;">🎯 Precisione del tempo</button>
    <button id="modeEstimationBtn" class="btn-large">🤔 Stima del tempo</button>
  `;
  gameArea.innerHTML = html;

  document.getElementById('modePrecisionBtn').addEventListener('click', () => {
    gameState.currentMode = 'precision';
    gameState.phase = 'precision';
    gameState.roundData.target = randomTarget();
    gameState.currentPlayerIndex = 0;
    gameState.turnStep = 'awaitStart';
    gameState.roundData.attempts = [];
    renderUI();
  });

  document.getElementById('modeEstimationBtn').addEventListener('click', () => {
    gameState.currentMode = 'estimation';
    gameState.phase = 'estimation';
    
    // Seleziona il cronometrista con la nuova logica equa
    const estimatorIdx = selectEstimatorForEstimationRound();
    gameState.roundData.estimator = estimatorIdx;
    gameState.currentPlayerIndex = estimatorIdx; // il giocatore che cronometra
    gameState.turnStep = 'awaitTimerStart';
    gameState.roundData.realTime = null;
    gameState.roundData.estimations = [];
    renderUI();
  });
}

// ------------------------- MODALITÀ PRECISIONE -------------------------
function renderPrecisionMode() {
  const target = gameState.roundData.target;
  const currentPlayer = gameState.players[gameState.currentPlayerIndex];
  const isTiming = gameState.turnStep === 'timing';
  const attemptsDone = gameState.roundData.attempts.length;

  let html = `
    <h2>🎯 Precisione</h2>
    <div class="target-display-large">${target.toFixed(2)}s</div>
  `;

  if (attemptsDone < gameState.players.length) {
    html += `<div class="info-message">🎤 Tocca a: <strong>${currentPlayer.name}</strong></div>`;
    
    if (gameState.turnStep === 'awaitStart') {
      html += `<button id="startTimerBtn" class="btn-large">▶️ Avvia timer</button>`;
    } else if (gameState.turnStep === 'timing') {
      html += `<button id="stopTimerBtn" class="btn-large">⏹️ Ferma timer</button>
               <p style="text-align:center; margin-top:16px;">⏳ Timer in corso...</p>`;
    } else if (gameState.turnStep === 'showAttempt') {
      const last = gameState.roundData.attempts[gameState.roundData.attempts.length-1];
      html += `<div style="text-align:center; background:#0f172a; border-radius:40px; padding:24px;">
        <p>Tempo effettivo: <strong>${last.value.toFixed(2)}s</strong></p>
        <p>Differenza: <span class="difference">${last.diff.toFixed(2)}s</span></p>
        <button id="nextPlayerBtn" class="btn-large" style="margin-top:20px;">👉 Prossimo giocatore</button>
      </div>`;
    }
  } else {
    finishRoundAndShowResults();
    return;
  }

  gameArea.innerHTML = html;

  if (gameState.turnStep === 'awaitStart') {
    document.getElementById('startTimerBtn').addEventListener('click', () => {
      const startTime = Date.now();
      gameState.turnStep = 'timing';
      gameState._timerStart = startTime;
      renderUI();
    });
  } else if (gameState.turnStep === 'timing') {
    document.getElementById('stopTimerBtn').addEventListener('click', () => {
      const stopTime = Date.now();
      const elapsed = (stopTime - gameState._timerStart) / 1000;
      const target = gameState.roundData.target;
      const diff = absDiff(elapsed, target);
      const playerIdx = gameState.currentPlayerIndex;
      gameState.roundData.attempts.push({ playerIndex: playerIdx, value: elapsed, diff });
      gameState.turnStep = 'showAttempt';
      renderUI();
    });
  } else if (gameState.turnStep === 'showAttempt') {
    document.getElementById('nextPlayerBtn').addEventListener('click', () => {
      gameState.currentPlayerIndex++;
      if (gameState.currentPlayerIndex < gameState.players.length) {
        gameState.turnStep = 'awaitStart';
        renderUI();
      } else {
        finishRoundAndShowResults();
      }
    });
  }
}

// ------------------------- MODALITÀ STIMA -------------------------
function renderEstimationMode() {
  const estimatorIdx = gameState.roundData.estimator;
  const estimator = gameState.players[estimatorIdx];
  const otherPlayers = gameState.players.filter((_,idx) => idx !== estimatorIdx);
  
  if (gameState.roundData.realTime === null) {
    if (gameState.turnStep === 'awaitTimerStart') {
      gameArea.innerHTML = `
        <h2>🤔 Stima · Cronometrista: ${estimator.name}</h2>
        <p class="info-message">${estimator.name}, avvia il timer quando vuoi, fermalo quando preferisci. Il tempo rimarrà segreto.</p>
        <button id="estimatorStartBtn" class="btn-large">▶️ Avvia timer segreto</button>
      `;
      document.getElementById('estimatorStartBtn').addEventListener('click', () => {
        const start = Date.now();
        gameState._estimatorStart = start;
        gameState.turnStep = 'timingInProgress';
        renderUI();
      });
    } else if (gameState.turnStep === 'timingInProgress') {
      gameArea.innerHTML = `
        <h2>🤔 Cronometro in corso...</h2>
        <p class="info-message">${estimator.name}, ferma quando vuoi.</p>
        <button id="estimatorStopBtn" class="btn-large">⏹️ Ferma timer</button>
      `;
      document.getElementById('estimatorStopBtn').addEventListener('click', () => {
        const stop = Date.now();
        const realTime = (stop - gameState._estimatorStart) / 1000;
        gameState.roundData.realTime = realTime;
        gameState.turnStep = 'collectEstimates';
        renderUI();
      });
    }
  } 
  else if (gameState.turnStep === 'collectEstimates') {
    let html = `<h2>🤔 Inserite le vostre stime!</h2>`;
    html += `<div class="estimation-grid">`;
    otherPlayers.forEach(p => {
      const idx = gameState.players.indexOf(p);
      html += `
        <div class="estimation-card">
          <p><strong>${p.name}</strong></p>
          <input type="number" step="0.01" min="0" id="estimateInput${idx}" placeholder="es. 3.45" value="0.00" style="width:100%;">
        </div>
      `;
    });
    html += `</div><button id="submitEstimatesBtn" class="btn-large">✅ Invia tutte le stime</button>`;
    gameArea.innerHTML = html;

    document.getElementById('submitEstimatesBtn').addEventListener('click', () => {
      const realTime = gameState.roundData.realTime;
      const estimations = [];
      otherPlayers.forEach(p => {
        const idx = gameState.players.indexOf(p);
        const input = document.getElementById(`estimateInput${idx}`);
        let guess = parseFloat(input.value);
        if (isNaN(guess) || guess < 0) guess = 0;
        const diff = absDiff(guess, realTime);
        estimations.push({ playerIndex: idx, guess, diff });
      });
      gameState.roundData.estimations = estimations;
      finishRoundAndShowResults();
    });
  }
}

// ------------------------- RISULTATI ROUND -------------------------
function renderResults() {
  const mode = gameState.currentMode;
  let html = `<h2>📊 Risultati del round</h2>`;
  
  if (mode === 'precision') {
    html += `<p>Obiettivo: <strong>${gameState.roundData.target.toFixed(2)}s</strong></p>`;
    html += `<ul class="result-list">`;
    gameState.roundData.attempts.forEach(att => {
      const p = gameState.players[att.playerIndex];
      html += `<li>${p.name}: ${att.value.toFixed(2)}s (diff ${att.diff.toFixed(2)}s)</li>`;
    });
    html += `</ul>`;
  } else {
    html += `<p>Tempo reale: <strong>${gameState.roundData.realTime.toFixed(2)}s</strong></p>`;
    html += `<ul class="result-list">`;
    gameState.roundData.estimations.forEach(est => {
      const p = gameState.players[est.playerIndex];
      html += `<li>${p.name}: stima ${est.guess.toFixed(2)}s (diff ${est.diff.toFixed(2)}s)</li>`;
    });
    html += `<p><em>${gameState.players[gameState.roundData.estimator].name} ha cronometrato.</em></p>`;
    html += `</ul>`;
  }

  html += `<button id="nextRoundBtn" class="btn-large">🔁 Prossimo round</button>`;
  gameArea.innerHTML = html;

  document.getElementById('nextRoundBtn').addEventListener('click', () => {
    prepareNewRound();
  });
}

// ------------------------- NUOVA PARTITA -------------------------
function resetToSetup() {
  gameState.phase = 'setup';
  gameState.players = [];
  gameState.currentMode = null;
  gameState.roundData = { target: null, realTime: null, attempts: [], estimator: null, estimations: [] };
  gameState.estimationUsedEstimators = [];   // reset cronometristi usati
  updateScoreboardUI();
  renderUI();
}

// ------------------------- INIZIALIZZAZIONE -------------------------
newGameBtn.addEventListener('click', resetToSetup);

// Avvio iniziale
renderUI();
updateScoreboardUI();