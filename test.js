// Headless-проверка движка: node test.js
const B = require('./engine.js');

function assert(cond, msg) { if (!cond) { console.error('FAIL:', msg); process.exitCode = 1; } }

// Детерминированный генератор для воспроизводимости.
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// --- Граф ----------------------------------------------------------------
assert(B.squares.length > 0, 'есть клетки');
for (const n of B.squares) {
  for (const nb of B.adj[n]) assert(B.adj[nb].includes(n), `симметрия рёбер ${n}-${nb}`);
}
assert(B.adj[B.GOAL].length === 1 && B.adj[B.GOAL][0] === '1,8', 'цель соединена с клеткой под ней');
const d = B.distances(new Set());
for (const n of B.squares) assert(d.has(n), `клетка ${n} достижима из цели`);
// Все четыре игрока на одинаковом расстоянии от цели.
const entryDist = [0, 1, 2, 3].map((s) => d.get(B.entryOf(s)));
assert(new Set(entryDist).size === 1, 'равные дистанции от входов: ' + entryDist.join(','));
console.log('Дистанция от входа до цели:', entryDist[0]);

// --- Правила ходов --------------------------------------------------------
const seats = [{ name: 'A', ai: true }, { name: 'B', ai: true }, null, null];
let s = B.newGame(seats, mulberry32(1));
// Из базы: при броске 1 единственный ход — на вход дорожки.
let moves = B.legalMoves(s, 0, 1);
assert(moves.length === 1 && moves[0].to === B.entryOf(0), 'ход из базы на 1 попадает на вход');
// При броске 2 — одна клетка выше по дорожке.
moves = B.legalMoves(s, 0, 2);
assert(moves.length === 1 && moves[0].to === '10,2', 'ход из базы на 2');
// Бросок 3 ставит фишку на нижнюю линию.
moves = B.legalMoves(s, 0, 3);
assert(moves.length === 1 && moves[0].to === '9,2', 'ход из базы на 3');
// Бросок 4: развилка — влево/вправо по нижней линии (возвращаться назад нельзя).
moves = B.legalMoves(s, 0, 4);
assert(moves.map((m) => m.to).sort().join(' ') === '9,1 9,3', 'развилка на нижней линии: ' + moves.map((m) => m.to));

// Через баррикаду проходить нельзя, но на неё можно встать точным броском.
s.players[0].pawns[0] = '8,4';
moves = B.legalMoves(s, 0, 1);
assert(moves.some((m) => m.to === '7,4' && m.barricade), 'точный бросок на баррикаду разрешён');
moves = B.legalMoves(s, 0, 2);
assert(!moves.some((m) => m.to === '7,3' || m.to === '7,5' || m.to === '6,4'), 'сквозь баррикаду не пройти');

// Нельзя встать на свою фишку, но можно через неё перепрыгнуть.
s.players[0].pawns[0] = '9,2';
s.players[0].pawns[1] = '9,3';
moves = B.legalMoves(s, 0, 1);
assert(!moves.some((m) => m.pawn === 0 && m.to === '9,3'), 'нельзя встать на свою фишку');
moves = B.legalMoves(s, 0, 2);
assert(moves.some((m) => m.pawn === 0 && m.to === '9,4'), 'через свою фишку можно перепрыгнуть');

// Сбитие фишки соперника.
s.players[1].pawns[0] = '9,4';
moves = B.legalMoves(s, 0, 2);
const cap = moves.find((m) => m.pawn === 0 && m.to === '9,4');
assert(cap && cap.capture && cap.capture.player === 1, 'ход со сбитием найден');
s.phase = 'move'; s.dice = 2; s.current = 0;
B.applyMove(s, cap);
assert(s.players[1].pawns[0] === B.baseId(1), 'сбитая фишка вернулась в базу');
assert(s.current === 1 && s.phase === 'roll', 'ход перешёл');

// Снятие и перестановка баррикады.
s.current = 0; s.phase = 'move'; s.dice = 1;
s.players[0].pawns[2] = '8,4';
B.applyMove(s, { pawn: 2, to: '7,4' });
assert(s.phase === 'place' && !s.barricades.has('7,4'), 'после попадания на баррикаду — фаза расстановки');
const targets = B.placementTargets(s);
assert(!targets.includes('7,4'), 'занятую клетку нельзя выбрать');
assert(!targets.includes(B.GOAL), 'на цель нельзя');
assert(!targets.some((n) => B.parse(n)[0] >= B.NO_BARRICADE_FROM_ROW), 'нельзя в нижнюю зону');
let threw = false;
try { B.placeBarricade(s, '9,8'); } catch (e) { threw = true; }
assert(threw, 'запрещённая установка отклонена');
B.placeBarricade(s, targets[0]);
assert(s.barricades.size === 11 && s.phase === 'roll', 'баррикад снова 11');

// Победа: точный бросок на цель.
s.current = 0; s.phase = 'move'; s.dice = 1;
s.players[0].pawns[3] = '1,8';
s.barricades.delete('1,8');
B.applyMove(s, { pawn: 3, to: B.GOAL });
assert(s.phase === 'over' && s.winner === 0, 'победа засчитана');

// --- Симуляция партий ИИ ---------------------------------------------------
const wins = [0, 0, 0, 0];
let totalTurns = 0;
const GAMES = 60;
for (let g = 0; g < GAMES; g++) {
  const rng = mulberry32(1000 + g);
  const n = 2 + (g % 3);
  const seatCfg = [null, null, null, null];
  for (let i = 0; i < n; i++) seatCfg[(i * (n === 2 ? 2 : 1)) % 4] = { name: 'P' + i, ai: true };
  const st = B.newGame(seatCfg, rng);
  let guard = 0;
  while (st.phase !== 'over' && guard++ < 20000) {
    const mv = B.roll(st);
    if (st.phase === 'nomove') { B.skipTurn(st); continue; }
    const m = B.chooseMove(st, mv);
    B.applyMove(st, m);
    if (st.phase === 'place') B.placeBarricade(st, B.choosePlacement(st));
    assert(st.barricades.size === 11, 'число баррикад постоянно');
    // Инварианты: на клетке не больше одной фишки, фишки не стоят на баррикадах.
    const occ = new Set();
    for (const pl of st.players) for (const p of pl.pawns) {
      if (B.isBase(p)) continue;
      assert(!occ.has(p), 'две фишки на одной клетке ' + p);
      occ.add(p);
      assert(!st.barricades.has(p), 'фишка на баррикаде ' + p);
    }
  }
  assert(st.phase === 'over', `партия ${g} завершилась`);
  wins[st.players[st.winner].seat]++;
  totalTurns += st.turn;
}
console.log(`Сыграно партий: ${GAMES}, среднее число ходов: ${(totalTurns / GAMES).toFixed(1)}`);
console.log('Победы по местам (0..3):', wins.join(' / '));
console.log(process.exitCode ? 'ЕСТЬ ОШИБКИ' : 'Все проверки пройдены');
