/*
 * Barricade (Malefiz) — игровой движок.
 * Не зависит от DOM: используется и в браузере (window.Barricade), и в Node (module.exports).
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Barricade = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // '#' — клетка, 'G' — цель, '.' — пусто. Колонки 2, 6, 10, 14 внизу — стартовые дорожки игроков.
  const LAYOUT = [
    '........G........', // 0
    '#################', // 1
    '#...............#', // 2
    '#################', // 3
    '........#........', // 4
    '......#####......', // 5
    '......#...#......', // 6
    '#################', // 7
    '#...#...#...#...#', // 8
    '#################', // 9
    '..#...#...#...#..', // 10
    '..#...#...#...#..', // 11
  ];
  const ROWS = LAYOUT.length;
  const COLS = LAYOUT[0].length;
  const GOAL = '0,8';
  const LANE_COLS = [2, 6, 10, 14];
  const ENTRY_ROW = ROWS - 1;
  const PAWNS_PER_PLAYER = 5;
  // Нижняя сплошная линия и дорожки — зона, где баррикады ставить нельзя.
  const NO_BARRICADE_FROM_ROW = 9;
  const INITIAL_BARRICADES = [
    '1,8',
    '3,0', '3,8', '3,16',
    '5,6', '5,10',
    '7,0', '7,4', '7,8', '7,12', '7,16',
  ];
  const COLORS = [
    { name: 'Красный', hex: '#d64541', dark: '#8e2320' },
    { name: 'Синий', hex: '#3b7dd8', dark: '#1f4a8c' },
    { name: 'Зелёный', hex: '#3aa655', dark: '#1f6b33' },
    { name: 'Жёлтый', hex: '#e2b400', dark: '#8f7200' },
  ];

  const id = (r, c) => r + ',' + c;
  const parse = (s) => s.split(',').map(Number);
  const baseId = (seat) => 'B' + seat;
  const isBase = (n) => n[0] === 'B';
  const isSquare = (r, c) => r >= 0 && r < ROWS && c >= 0 && c < COLS && LAYOUT[r][c] !== '.';

  // ---- Граф доски -------------------------------------------------------
  const squares = [];
  const adj = {};
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      if (!isSquare(r, c)) continue;
      const n = id(r, c);
      squares.push(n);
      adj[n] = [];
      for (const [dr, dc] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
        if (isSquare(r + dr, c + dc)) adj[n].push(id(r + dr, c + dc));
      }
    }
  }
  // База соединена с дорожкой только в одну сторону: вернуться в базу ходом нельзя.
  for (let seat = 0; seat < 4; seat++) {
    adj[baseId(seat)] = [id(ENTRY_ROW, LANE_COLS[seat])];
  }
  const entryOf = (seat) => id(ENTRY_ROW, LANE_COLS[seat]);
  const laneOf = (seat) => squares.filter((n) => {
    const [r, c] = parse(n);
    return c === LANE_COLS[seat] && r >= NO_BARRICADE_FROM_ROW + 1;
  });

  // ---- Состояние --------------------------------------------------------
  function newGame(seats, rng) {
    const players = [];
    seats.forEach((s, seat) => {
      if (!s) return;
      players.push({
        seat,
        name: (s.name || '').trim() || COLORS[seat].name,
        color: COLORS[seat],
        ai: !!s.ai,
        pawns: new Array(PAWNS_PER_PLAYER).fill(baseId(seat)),
      });
    });
    if (players.length < 2) throw new Error('Нужно минимум два игрока');
    return {
      players,
      barricades: new Set(INITIAL_BARRICADES),
      current: 0,
      dice: null,
      phase: 'roll', // roll | move | nomove | place | over
      winner: null,
      turn: 1,
      log: [],
      rng: rng || Math.random,
    };
  }

  function pawnAt(state, node) {
    if (isBase(node)) return null;
    for (let p = 0; p < state.players.length; p++) {
      const k = state.players[p].pawns.indexOf(node);
      if (k !== -1) return { player: p, pawn: k };
    }
    return null;
  }

  function addLog(state, text) {
    state.log.push({ turn: state.turn, player: state.current, text });
    if (state.log.length > 200) state.log.shift();
  }

  // ---- Ходы --------------------------------------------------------------
  // Все клетки, куда можно прийти ровно за n шагов, не проходя сквозь баррикады
  // и не возвращаясь на уже пройденные клетки в этом ходу.
  function reach(state, start, n) {
    const ends = new Set();
    const visited = new Set([start]);
    (function dfs(node, depth) {
      if (depth === n) { ends.add(node); return; }
      for (const nb of adj[node]) {
        if (visited.has(nb)) continue;
        if (state.barricades.has(nb) && depth + 1 < n) continue;
        visited.add(nb);
        dfs(nb, depth + 1);
        visited.delete(nb);
      }
    })(start, 0);
    return ends;
  }

  function legalMoves(state, pi, n) {
    const pl = state.players[pi];
    const moves = [];
    let baseSeen = false;
    pl.pawns.forEach((pos, k) => {
      if (pos === GOAL) return;
      if (isBase(pos)) {
        if (baseSeen) return; // все фишки в базе равнозначны
        baseSeen = true;
      }
      for (const to of reach(state, pos, n)) {
        const occ = pawnAt(state, to);
        if (occ && occ.player === pi) continue;
        moves.push({
          pawn: k,
          from: pos,
          to,
          capture: occ,
          barricade: state.barricades.has(to),
          goal: to === GOAL,
        });
      }
    });
    return moves;
  }

  function roll(state) {
    if (state.phase !== 'roll') throw new Error('Сейчас нельзя бросать кубик');
    state.dice = 1 + Math.floor(state.rng() * 6);
    const moves = legalMoves(state, state.current, state.dice);
    const pl = state.players[state.current];
    if (moves.length) {
      state.phase = 'move';
      addLog(state, `${pl.name}: выпало ${state.dice}`);
    } else {
      state.phase = 'nomove';
      addLog(state, `${pl.name}: выпало ${state.dice} — ходов нет, ход переходит`);
    }
    return moves;
  }

  function applyMove(state, move) {
    if (state.phase !== 'move') throw new Error('Сейчас нельзя ходить');
    const legal = legalMoves(state, state.current, state.dice)
      .find((m) => m.pawn === move.pawn && m.to === move.to);
    if (!legal) throw new Error('Недопустимый ход');
    const pl = state.players[state.current];
    pl.pawns[legal.pawn] = legal.to;
    let text = `${pl.name}: ${describe(legal.from)} → ${describe(legal.to)}`;
    if (legal.capture) {
      const op = state.players[legal.capture.player];
      op.pawns[legal.capture.pawn] = baseId(op.seat);
      text += `, фишка игрока «${op.name}» отправлена в базу`;
    }
    if (legal.goal) {
      state.phase = 'over';
      state.winner = state.current;
      addLog(state, text + ' — ЦЕЛЬ!');
      return legal;
    }
    if (legal.barricade) {
      state.barricades.delete(legal.to);
      state.phase = 'place';
      addLog(state, text + ', баррикада снята');
      return legal;
    }
    addLog(state, text);
    endTurn(state);
    return legal;
  }

  function placementTargets(state) {
    return squares.filter((n) => {
      if (n === GOAL) return false;
      if (parse(n)[0] >= NO_BARRICADE_FROM_ROW) return false;
      if (state.barricades.has(n)) return false;
      return !pawnAt(state, n);
    });
  }

  function placeBarricade(state, node) {
    if (state.phase !== 'place') throw new Error('Сейчас нельзя ставить баррикаду');
    if (!placementTargets(state).includes(node)) throw new Error('Сюда баррикаду ставить нельзя');
    state.barricades.add(node);
    addLog(state, `${state.players[state.current].name}: баррикада поставлена на ${describe(node)}`);
    endTurn(state);
  }

  function skipTurn(state) {
    if (state.phase !== 'nomove') throw new Error('Пропустить ход можно только при отсутствии ходов');
    endTurn(state);
  }

  function endTurn(state) {
    state.current = (state.current + 1) % state.players.length;
    state.dice = null;
    state.phase = 'roll';
    state.turn++;
  }

  function describe(node) {
    if (isBase(node)) return 'база';
    if (node === GOAL) return 'цель';
    const [r, c] = parse(node);
    return String.fromCharCode(65 + c) + (ROWS - r);
  }

  // ---- Искусственный интеллект ------------------------------------------
  // Расстояние от каждой клетки до цели, не проходя через blocked.
  function distances(blocked) {
    const dist = new Map([[GOAL, 0]]);
    const queue = [GOAL];
    for (let i = 0; i < queue.length; i++) {
      const n = queue[i];
      for (const nb of adj[n]) {
        if (dist.has(nb) || blocked.has(nb)) continue;
        dist.set(nb, dist.get(n) + 1);
        queue.push(nb);
      }
    }
    return dist;
  }

  const freeDist = distances(new Set());
  const UNREACHABLE_PENALTY = 10;

  function nearOpponent(state, node, pi, maxSteps) {
    // Есть ли фишка соперника в пределах maxSteps шагов (баррикады игнорируем — грубая оценка).
    const seen = new Set([node]);
    let frontier = [node];
    for (let step = 1; step <= maxSteps; step++) {
      const next = [];
      for (const n of frontier) {
        for (const nb of adj[n]) {
          if (seen.has(nb)) continue;
          seen.add(nb);
          const occ = pawnAt(state, nb);
          if (occ && occ.player !== pi) return true;
          next.push(nb);
        }
      }
      frontier = next;
    }
    // Фишки соперников в базе угрожают дорожке у входа.
    for (let p = 0; p < state.players.length; p++) {
      if (p === pi) continue;
      const pl = state.players[p];
      if (pl.pawns.some(isBase) && seen.has(entryOf(pl.seat))) return true;
    }
    return false;
  }

  function chooseMove(state, moves) {
    const pi = state.current;
    const d = distances(state.barricades);
    const val = (node) => {
      const extra = isBase(node) ? 1 : 0;
      const t = isBase(node) ? adj[node][0] : node;
      return extra + (d.has(t) ? d.get(t) : (freeDist.get(t) || 40) + UNREACHABLE_PENALTY);
    };
    let best = null;
    let bestScore = -Infinity;
    for (const m of moves) {
      let score = val(m.from) - val(m.to);
      if (m.goal) score += 1000;
      if (m.capture) {
        const victim = state.players[m.capture.player].pawns[m.capture.pawn];
        score += 4 + Math.max(0, 36 - val(victim)) * 0.35;
      }
      if (m.barricade) score += 3;
      if (!m.goal && nearOpponent(state, m.to, pi, 6)) {
        score -= 1 + Math.max(0, 36 - val(m.to)) * 0.06;
      }
      score += state.rng() * 0.3;
      if (score > bestScore) { bestScore = score; best = m; }
    }
    return best;
  }

  function choosePlacement(state) {
    const pi = state.current;
    const targets = placementTargets(state);
    const before = distances(state.barricades);
    const v = (d, node) => {
      const extra = isBase(node) ? 1 : 0;
      const t = isBase(node) ? adj[node][0] : node;
      return extra + (d.has(t) ? d.get(t) : (freeDist.get(t) || 40) + UNREACHABLE_PENALTY);
    };
    let best = targets[0];
    let bestScore = -Infinity;
    for (const cand of targets) {
      const blocked = new Set(state.barricades);
      blocked.add(cand);
      const after = distances(blocked);
      let score = 0;
      state.players.forEach((pl, p) => {
        for (const pos of pl.pawns) {
          if (pos === GOAL) continue;
          const b = v(before, pos);
          const delta = v(after, pos) - b;
          if (delta === 0) continue;
          const advance = Math.max(0, 36 - b) / 36; // 0..1, чем ближе к цели, тем важнее
          score += p === pi ? -delta * 1.3 : delta * (0.6 + advance * 2.4);
        }
      });
      score += state.rng() * 0.2;
      if (score > bestScore) { bestScore = score; best = cand; }
    }
    return best;
  }

  return {
    LAYOUT, ROWS, COLS, GOAL, LANE_COLS, ENTRY_ROW, PAWNS_PER_PLAYER, COLORS,
    NO_BARRICADE_FROM_ROW, squares, adj,
    id, parse, baseId, isBase, entryOf, laneOf, describe,
    newGame, pawnAt, legalMoves, roll, applyMove, placementTargets, placeBarricade, skipTurn,
    chooseMove, choosePlacement, distances,
  };
});
