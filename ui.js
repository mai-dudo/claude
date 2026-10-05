/* Интерфейс Barricade: SVG-доска, экран настройки, ходы человека и компьютера. */
(function () {
  'use strict';
  const B = window.Barricade;

  const S = 40, OX = 40, OY = 40, R = 14;
  const AI_DELAY = { roll: 500, move: 700, place: 700, skip: 1000 };
  const PIPS = { 1: [4], 2: [2, 6], 3: [2, 4, 6], 4: [0, 2, 6, 8], 5: [0, 2, 4, 6, 8], 6: [0, 2, 3, 5, 6, 8] };

  const $ = (sel) => document.querySelector(sel);
  const el = {
    setup: $('#setup'), game: $('#game'), seatRows: $('#seat-rows'), setupError: $('#setup-error'),
    board: $('#board'), dice: $('#dice'), rollBtn: $('#btn-roll'), message: $('#message'),
    turnColor: $('#turn-color'), turnName: $('#turn-name'), playerList: $('#player-list'), log: $('#log'),
    rules: $('#rules'), winner: $('#winner'), winnerText: $('#winner-text'),
  };

  let state = null;
  let moves = [];
  let selectedPawn = null;
  let gameId = 0; // отменяет таймеры ИИ после начала новой партии
  let busy = false; // пауза между действиями, пока идёт анимация

  // ---- Геометрия --------------------------------------------------------
  const pos = (node) => {
    const [r, c] = B.parse(node);
    return { x: OX + c * S, y: OY + r * S };
  };
  function baseSlots(seat) {
    const c = B.LANE_COLS[seat];
    const r1 = B.ENTRY_ROW + 1.25, r2 = B.ENTRY_ROW + 2.25;
    return [[r1, c - 1], [r1, c], [r1, c + 1], [r2, c - 0.5], [r2, c + 0.5]]
      .map(([r, cc]) => ({ x: OX + cc * S, y: OY + r * S }));
  }
  const esc = (s) => String(s).replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));

  // ---- Экран настройки --------------------------------------------------
  const DEFAULT_SEATS = ['human', 'ai', 'none', 'none'];
  function buildSetup() {
    el.seatRows.innerHTML = B.COLORS.map((col, i) => `
      <tr data-seat="${i}">
        <td><span class="swatch" style="background:${col.hex}"></span></td>
        <td>
          <select class="seat-kind">
            <option value="none" ${DEFAULT_SEATS[i] === 'none' ? 'selected' : ''}>Нет</option>
            <option value="human" ${DEFAULT_SEATS[i] === 'human' ? 'selected' : ''}>Человек</option>
            <option value="ai" ${DEFAULT_SEATS[i] === 'ai' ? 'selected' : ''}>Компьютер</option>
          </select>
        </td>
        <td><input class="seat-name" type="text" maxlength="16" placeholder="${col.name}"></td>
      </tr>`).join('');
  }
  function readSeats() {
    return [...el.seatRows.querySelectorAll('tr')].map((tr) => {
      const kind = tr.querySelector('.seat-kind').value;
      if (kind === 'none') return null;
      return { ai: kind === 'ai', name: tr.querySelector('.seat-name').value };
    });
  }
  function showSetup() {
    gameId++;
    state = null;
    el.game.hidden = true;
    el.setup.hidden = false;
    el.setupError.hidden = true;
  }
  function startGame(seats) {
    try {
      state = B.newGame(seats);
    } catch (e) {
      el.setupError.textContent = e.message;
      el.setupError.hidden = false;
      return;
    }
    gameId++;
    moves = [];
    selectedPawn = null;
    busy = false;
    el.setup.hidden = true;
    el.game.hidden = false;
    render();
    maybeRunAI();
  }

  // ---- Отрисовка доски --------------------------------------------------
  function drawBoard() {
    const out = [];
    const colorOfSeat = (seat) => B.COLORS[seat].hex;
    const laneSeat = (node) => {
      const [r, c] = B.parse(node);
      const seat = B.LANE_COLS.indexOf(c);
      return seat !== -1 && r > B.NO_BARRICADE_FROM_ROW ? seat : -1;
    };

    // Подписи координат
    for (let c = 0; c < B.COLS; c++) {
      if (B.id(0, c) === B.GOAL) continue;
      out.push(`<text class="label" x="${OX + c * S}" y="14" text-anchor="middle">${String.fromCharCode(65 + c)}</text>`);
    }
    for (let r = 0; r < B.ROWS; r++) out.push(`<text class="label" x="10" y="${OY + r * S + 3}" text-anchor="middle">${B.ROWS - r}</text>`);

    // Рёбра
    for (const n of B.squares) {
      const a = pos(n);
      for (const nb of B.adj[n]) {
        if (nb < n) continue;
        const b = pos(nb);
        out.push(`<line class="edge" x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}"/>`);
      }
    }
    // Базы: рёбра к входу и слоты
    for (let seat = 0; seat < 4; seat++) {
      const entry = pos(B.entryOf(seat));
      const slots = baseSlots(seat);
      out.push(`<line class="edge" x1="${entry.x}" y1="${entry.y}" x2="${slots[1].x}" y2="${slots[1].y}"/>`);
      for (const s of slots) out.push(`<circle class="base-slot" cx="${s.x}" cy="${s.y}" r="${R}" stroke="${colorOfSeat(seat)}"/>`);
    }
    // Клетки
    for (const n of B.squares) {
      const p = pos(n);
      const seat = laneSeat(n);
      const cls = n === B.GOAL ? 'square goal' : seat !== -1 ? 'square lane' : 'square';
      const stroke = seat !== -1 ? ` stroke="${colorOfSeat(seat)}"` : '';
      out.push(`<circle class="${cls}" cx="${p.x}" cy="${p.y}" r="${R}"${stroke}/>`);
    }
    out.push(`<text class="label" x="${pos(B.GOAL).x + 22}" y="${pos(B.GOAL).y + 4}" style="font-size:12px;font-weight:600">ЦЕЛЬ</text>`);

    // Баррикады
    for (const n of state.barricades) {
      const p = pos(n);
      out.push(`<rect class="barricade" x="${p.x - 11}" y="${p.y - 11}" width="22" height="22" rx="4"/>`);
    }

    // Подсветка доступных клеток
    const human = isHumanTurn();
    if (human && state.phase === 'move' && selectedPawn !== null) {
      for (const m of moves) {
        if (m.pawn !== selectedPawn) continue;
        const p = pos(m.to);
        const cls = m.capture ? 'target capture' : m.barricade ? 'target barricade-hit' : 'target';
        out.push(`<circle class="${cls}" data-target="${m.to}" cx="${p.x}" cy="${p.y}" r="${R + 2}"/>`);
      }
    }
    if (human && state.phase === 'place') {
      for (const n of B.placementTargets(state)) {
        const p = pos(n);
        out.push(`<rect class="place-target" data-place="${n}" x="${p.x - 11}" y="${p.y - 11}" width="22" height="22" rx="4"/>`);
      }
    }

    // Фишки
    const movable = new Set(human && state.phase === 'move' ? moves.map((m) => m.pawn) : []);
    state.players.forEach((pl, pi) => {
      const slots = baseSlots(pl.seat);
      let slot = 0;
      pl.pawns.forEach((node, k) => {
        const p = B.isBase(node) ? slots[slot++] : pos(node);
        const isCurrent = pi === state.current;
        let cls = 'pawn';
        let attrs = '';
        if (isCurrent && movable.has(k)) {
          cls += selectedPawn === k ? ' selected' : ' selectable';
          attrs = ` data-pawn="${k}"`;
        }
        out.push(`<g class="${cls}"${attrs}>
          <circle class="ring" cx="${p.x}" cy="${p.y}" r="${R + 4}" fill="none" stroke="none"/>
          <circle cx="${p.x}" cy="${p.y}" r="${R - 2}" fill="${pl.color.hex}"/>
          <circle cx="${p.x - 3}" cy="${p.y - 4}" r="4" fill="rgba(255,255,255,0.45)" stroke="none"/>
        </g>`);
      });
    });
    el.board.innerHTML = out.join('');
  }

  // ---- Боковая панель ---------------------------------------------------
  function drawDice(value, animate) {
    el.dice.classList.toggle('empty', !value);
    el.dice.innerHTML = Array.from({ length: 9 }, (_, i) =>
      `<span class="pip${value && PIPS[value].includes(i) ? ' on' : ''}"></span>`).join('');
    if (animate) {
      el.dice.classList.remove('rolling');
      void el.dice.offsetWidth;
      el.dice.classList.add('rolling');
    }
  }

  function drawSide() {
    const pl = state.players[state.current];
    el.turnColor.style.background = pl.color.hex;
    el.turnName.textContent = state.phase === 'over' ? `Победил(а) ${state.players[state.winner].name}` : `Ход: ${pl.name}`;
    drawDice(state.dice, false);
    el.rollBtn.disabled = !(isHumanTurn() && state.phase === 'roll');

    el.playerList.innerHTML = state.players.map((p, i) => {
      const inBase = p.pawns.filter(B.isBase).length;
      const onBoard = p.pawns.length - inBase;
      return `<li class="${i === state.current && state.phase !== 'over' ? 'active' : ''}">
        <span class="swatch" style="background:${p.color.hex}"></span>
        <span class="name">${esc(p.name)}${p.ai ? ' <small>(ИИ)</small>' : ''}</span>
        <span class="stats">в базе ${inBase} · на поле ${onBoard}</span>
      </li>`;
    }).join('');

    el.log.innerHTML = state.log.slice(-40).reverse().map((e) => {
      const color = state.players[e.player].color.hex;
      return `<li><span class="dot" style="background:${color}"></span>${esc(e.text)}</li>`;
    }).join('');

    el.message.textContent = messageText();
  }

  function messageText() {
    const pl = state.players[state.current];
    if (state.phase === 'over') return `Фишка игрока «${state.players[state.winner].name}» достигла цели!`;
    if (pl.ai) return 'Компьютер думает…';
    switch (state.phase) {
      case 'roll': return `${pl.name}, бросьте кубик.`;
      case 'move': return selectedPawn === null ? 'Выберите фишку, которой хотите ходить.' : 'Выберите клетку. Красная — сбить соперника, белая — снять баррикаду.';
      case 'place': return 'Вы сняли баррикаду. Поставьте её на любую подсвеченную клетку.';
      case 'nomove': return `Выпало ${state.dice}: ходов нет, ход переходит дальше.`;
    }
    return '';
  }

  function render() {
    if (!state) return;
    drawBoard();
    drawSide();
  }

  const isHumanTurn = () => state && !state.players[state.current].ai;

  // ---- Логика хода ------------------------------------------------------
  function later(ms, fn) {
    const myGame = gameId;
    setTimeout(() => { if (myGame === gameId && state) fn(); }, ms);
  }

  function doRoll() {
    moves = B.roll(state);
    selectedPawn = null;
    drawDice(state.dice, true);
    if (state.phase === 'move' && isHumanTurn()) {
      const pawns = new Set(moves.map((m) => m.pawn));
      if (pawns.size === 1) selectedPawn = moves[0].pawn;
    }
    render();
    if (state.phase === 'nomove') {
      busy = true;
      later(AI_DELAY.skip, () => { busy = false; B.skipTurn(state); afterTurn(); });
    }
  }

  function afterTurn() {
    selectedPawn = null;
    moves = [];
    render();
    if (state.phase === 'over') {
      el.winnerText.textContent = `${state.players[state.winner].name} первым довёл фишку до цели за ${state.turn} ходов.`;
      if (!el.winner.open) el.winner.showModal();
      return;
    }
    maybeRunAI();
  }

  function maybeRunAI() {
    if (!state || isHumanTurn() || state.phase !== 'roll') return;
    busy = true;
    later(AI_DELAY.roll, () => {
      moves = B.roll(state);
      drawDice(state.dice, true);
      render();
      if (state.phase === 'nomove') {
        later(AI_DELAY.skip, () => { B.skipTurn(state); busy = false; afterTurn(); });
        return;
      }
      later(AI_DELAY.move, () => {
        const m = B.chooseMove(state, moves);
        selectedPawn = m.pawn;
        B.applyMove(state, m);
        render();
        if (state.phase === 'place') {
          later(AI_DELAY.place, () => {
            B.placeBarricade(state, B.choosePlacement(state));
            busy = false;
            afterTurn();
          });
        } else {
          busy = false;
          afterTurn();
        }
      });
    });
  }

  // ---- События ----------------------------------------------------------
  el.board.addEventListener('click', (ev) => {
    if (!state || busy || !isHumanTurn()) return;
    const pawnEl = ev.target.closest('[data-pawn]');
    if (pawnEl && state.phase === 'move') {
      selectedPawn = Number(pawnEl.dataset.pawn);
      render();
      return;
    }
    const targetEl = ev.target.closest('[data-target]');
    if (targetEl && state.phase === 'move' && selectedPawn !== null) {
      B.applyMove(state, { pawn: selectedPawn, to: targetEl.dataset.target });
      if (state.phase === 'place') { selectedPawn = null; render(); return; }
      afterTurn();
      return;
    }
    const placeEl = ev.target.closest('[data-place]');
    if (placeEl && state.phase === 'place') {
      B.placeBarricade(state, placeEl.dataset.place);
      afterTurn();
    }
  });

  el.rollBtn.addEventListener('click', () => {
    if (state && !busy && isHumanTurn() && state.phase === 'roll') doRoll();
  });
  document.addEventListener('keydown', (ev) => {
    if ((ev.key === ' ' || ev.key === 'Enter') && !el.rollBtn.disabled && el.setup.hidden && document.activeElement.tagName !== 'INPUT') {
      if (!el.rules.open && !el.winner.open) { ev.preventDefault(); el.rollBtn.click(); }
    }
  });

  $('#btn-start').addEventListener('click', () => startGame(readSeats()));
  $('#btn-demo').addEventListener('click', () => startGame(B.COLORS.map(() => ({ ai: true }))));
  $('#btn-new').addEventListener('click', showSetup);
  $('#btn-rules').addEventListener('click', () => el.rules.showModal());
  el.winner.addEventListener('close', () => { if (el.winner.returnValue === 'again') showSetup(); });

  buildSetup();
  drawDice(null, false);
})();
