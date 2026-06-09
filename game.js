/* =====================================================================
   FIGHT GAME V1 — Protótipo de mecânica estilo Punch-Out (1ª pessoa)
   ---------------------------------------------------------------------
   Stack: HTML5 Canvas + requestAnimationFrame (JS funcional, sem build).
   Foco: LÓGICA e TIMING. Toda arte é PLACEHOLDER (formas geométricas)
         claramente identificada para troca futura por sprites.

   ORGANIZAÇÃO DO ARQUIVO (separação de responsabilidades):
     [1] CONFIG ............. constantes de balanceamento e layout
     [2] CANVAS / ESCALA .... resolução virtual fixa 9:16 + DPR
     [3] ESTADO DO JOGO ..... objetos player / opponent / game
     [4] HELPERS DE ESTADO .. troca de estado + timers em ms
     [5] LÓGICA / FÍSICA .... ações do jogador + IA do oponente (update)
     [6] INPUT .............. botões na tela via 'pointerdown' (sem delay)
     [7] RENDER ............. desenho dos placeholders (puro visual)
     [8] LOOP ............... requestAnimationFrame com delta-time
   ===================================================================== */


/* =====================================================================
   [1] CONFIG — Ajuste o balanceamento do jogo aqui.
   Todos os tempos estão em MILISSEGUNDOS.
   ===================================================================== */
const CONFIG = {
  // Resolução virtual (tela vertical / mobile-first). Tudo é desenhado
  // nessas coordenadas e escalado para o tamanho real do dispositivo.
  VW: 360,
  VH: 640,

  // Vida
  MAX_HP: 100,

  // --- Janelas de tempo (ms) ---
  TELEGRAPH_MS: 400,      // tempo que o oponente "pisca" antes de atacar
  OPP_STRIKE_ANIM_MS: 260,// duração visual do soco do oponente
  OPP_VULN_MS: 600,       // janela de vulnerabilidade do oponente após esquiva
  OPP_HIT_STUN_MS: 320,   // atordoamento do oponente ao levar dano
  OPP_DODGE_MS: 280,      // duração da esquiva automática do oponente
  OPP_COUNTER_DELAY_MS: 240, // atraso até o contra-ataque garantido

  PLAYER_PUNCH_MS: 220,   // duração visual do soco do jogador
  PLAYER_DODGE_MS: 450,   // duração da esquiva (deve cobrir o strike do oponente)
  PLAYER_VULN_MS: 500,    // travamento do jogador após errar o soco
  PLAYER_HIT_STUN_MS: 260,// travamento ao tomar dano

  IDLE_MIN_MS: 1500,      // tempo mínimo do oponente parado
  IDLE_MAX_MS: 3000,      // tempo máximo do oponente parado

  // --- Dano ---
  DMG_OPP_PUNCH: 12,      // dano que o oponente causa no jogador
  DMG_COUNTER: 12,        // dano do contra-ataque garantido
  DMG_PLAYER_VULN_HIT: 20,// dano do jogador quando o oponente está VULNERÁVEL (já é o "dobro")

  // --- Detecção de spam de socos ---
  SPAM_WINDOW_MS: 1500,   // janela para contar socos
  SPAM_COUNT: 3,          // nº de socos na janela que dispara punição automática

  // Cores (placeholders) — troque livremente
  COLORS: {
    bg: "#111418",
    arena: "#1b2129",
    floor: "#0c0f13",
    hudBg: "#0a0d11",
    hpMineFill: "#33d17a",
    hpOppFill: "#ff5b5b",
    hpEmpty: "#2a2f37",
    opponentBody: "#5a6b8c",
    opponentHead: "#7e8fb0",
    opponentTelegraph: "#ff3b3b", // vermelho de aviso
    opponentVuln: "#ffd23b",      // amarelo = "bata em mim!"
    opponentHit: "#ff8a3b",
    playerSkin: "#3c4756",
    playerGlove: "#c0392b",
    btnPunch: "#2c3e50",
    btnPunchActive: "#46627f",
    btnDodge: "#1f3d2c",
    btnDodgeActive: "#2f6347",
    btnLocked: "#15181d",
    text: "#e8edf2",
    textDim: "#8a93a0",
    good: "#33d17a",
    bad: "#ff5b5b",
  },
};

// Estados possíveis (constantes para evitar erros de digitação)
const PLAYER_STATE = {
  IDLE: "IDLE",
  ATTACKING: "ATTACKING",
  DODGING_LEFT: "DODGING_LEFT",
  DODGING_RIGHT: "DODGING_RIGHT",
  VULNERABLE: "VULNERABLE",
  HIT: "HIT",
};

const OPP_STATE = {
  IDLE: "IDLE",
  PREPARING_ATTACK: "PREPARING_ATTACK",
  ATTACKING: "ATTACKING",
  DODGING: "DODGING",
  VULNERABLE: "VULNERABLE",
  HIT: "HIT",
};

const SIDE = { LEFT: "LEFT", RIGHT: "RIGHT" };


/* =====================================================================
   [2] CANVAS / ESCALA — resolução virtual fixa com suporte a DPR.
   Desenhamos sempre em coordenadas CONFIG.VW x CONFIG.VH; o navegador
   escala para o tamanho real mantendo a proporção 9:16.
   ===================================================================== */
const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");

// Guarda a transformação tela->virtual para converter toques em coordenadas.
let viewport = { scale: 1, offsetX: 0, offsetY: 0, rectW: 0, rectH: 0 };

function resize() {
  const dpr = window.devicePixelRatio || 1;
  const winW = window.innerWidth;
  const winH = window.innerHeight;
  const targetAspect = CONFIG.VW / CONFIG.VH;

  // Calcula o maior retângulo 9:16 que cabe na janela.
  let cssW = winW;
  let cssH = winW / targetAspect;
  if (cssH > winH) {
    cssH = winH;
    cssW = winH * targetAspect;
  }

  // Tamanho visual (CSS) do canvas.
  canvas.style.width = cssW + "px";
  canvas.style.height = cssH + "px";

  // Resolução interna = coordenadas virtuais * fator de tela * DPR (nitidez retina).
  const renderScale = (cssW / CONFIG.VW) * dpr;
  canvas.width = Math.round(CONFIG.VW * renderScale);
  canvas.height = Math.round(CONFIG.VH * renderScale);

  // Toda a renderização passa a usar coordenadas virtuais.
  ctx.setTransform(renderScale, 0, 0, renderScale, 0, 0);

  // Guarda dados para mapear toque -> coordenada virtual.
  const rect = canvas.getBoundingClientRect();
  viewport.rectW = rect.width;
  viewport.rectH = rect.height;

  // Re-sincroniza as superfícies do Rive (hoisted; no-op se ainda não há slots).
  if (typeof resizeRive === "function") resizeRive();
}
window.addEventListener("resize", resize);
window.addEventListener("orientationchange", resize);

// Converte coordenadas de um evento de ponteiro para o espaço virtual.
function toVirtual(clientX, clientY) {
  const rect = canvas.getBoundingClientRect();
  const x = ((clientX - rect.left) / rect.width) * CONFIG.VW;
  const y = ((clientY - rect.top) / rect.height) * CONFIG.VH;
  return { x, y };
}


/* =====================================================================
   [3] ESTADO DO JOGO — dados puros, sem lógica de desenho.
   ===================================================================== */
const player = {
  hp: CONFIG.MAX_HP,
  state: PLAYER_STATE.IDLE,
  stateTime: 0,     // ms acumulados no estado atual
  stateDur: 0,      // duração-alvo do estado (0 = sem expiração automática)
  offsetX: 0,       // deslocamento visual da esquiva
  recentPunches: [],// timestamps de socos (para detectar spam)
  lastPunchSide: SIDE.LEFT, // qual luva socou por último (para a animação Rive)
};

const opponent = {
  hp: CONFIG.MAX_HP,
  state: OPP_STATE.IDLE,
  stateTime: 0,
  stateDur: 0,
  attackSide: SIDE.LEFT,  // lado do soco telegrafado (define a esquiva correta)
  counterTimer: 0,        // >0 = contra-ataque agendado contra jogador vulnerável
  counterIsDodge: false,  // se o contra veio de uma esquiva automática (punição de spam)
  offsetX: 0,
};

const game = {
  running: true,
  over: false,
  winner: null,        // "PLAYER" | "OPPONENT"
  banner: null,        // { text, color, time, dur } feedback efêmero
  clock: 0,            // relógio global em ms (timestamps de spam)
};


/* =====================================================================
   [4] HELPERS DE ESTADO — trocar estado e mostrar feedback.
   ===================================================================== */
function setPlayerState(state, dur = 0) {
  player.state = state;
  player.stateTime = 0;
  player.stateDur = dur;
  // Espelha o estado na camada visual do Rive (no-op se o Rive não carregou).
  if (typeof animPlayer === "function") animPlayer(state);
}

function setOpponentState(state, dur = 0) {
  opponent.state = state;
  opponent.stateTime = 0;
  opponent.stateDur = dur;
  if (typeof animOpponent === "function") animOpponent(state);
}

function randRange(min, max) {
  return min + Math.random() * (max - min);
}

// Mostra um texto curto no centro (acerto/erro/etc.).
function showBanner(text, color, dur = 700) {
  game.banner = { text, color, time: 0, dur };
}

function damage(target, amount) {
  target.hp = Math.max(0, target.hp - amount);
}

// Reinicia o oponente para IDLE com um novo tempo aleatório de espera.
function opponentEnterIdle() {
  setOpponentState(OPP_STATE.IDLE, randRange(CONFIG.IDLE_MIN_MS, CONFIG.IDLE_MAX_MS));
  opponent.counterTimer = 0;
  opponent.counterIsDodge = false;
}

function checkGameOver() {
  if (player.hp <= 0 || opponent.hp <= 0) {
    game.over = true;
    game.winner = opponent.hp <= 0 ? "PLAYER" : "OPPONENT";
  }
}


/* =====================================================================
   [5] LÓGICA / FÍSICA — ações do jogador e IA do oponente.
   Esta seção NÃO desenha nada. Só muda estado e aplica regras/timers.
   ===================================================================== */

// ---- Ações disparadas pelo INPUT do jogador ----

// O jogador só aceita comandos quando está em IDLE.
// (VULNERABLE e HIT travam os botões; ATTACKING/DODGING já estão em ação.)
function playerCanAct() {
  return !game.over && player.state === PLAYER_STATE.IDLE;
}

// SOCO (esquerdo ou direito — o lado é só estético neste protótipo).
function playerPunch(side) {
  if (!playerCanAct()) return;

  player.lastPunchSide = side; // alimenta a animação Rive (punchL / punchR)
  setPlayerState(PLAYER_STATE.ATTACKING, CONFIG.PLAYER_PUNCH_MS);

  // Registra o soco para a detecção de spam.
  player.recentPunches.push(game.clock);
  player.recentPunches = player.recentPunches.filter(
    (t) => game.clock - t <= CONFIG.SPAM_WINDOW_MS
  );
  const isSpam = player.recentPunches.length >= CONFIG.SPAM_COUNT;

  // REGRA: só causa dano se o oponente estiver VULNERÁVEL.
  if (opponent.state === OPP_STATE.VULNERABLE) {
    damage(opponent, CONFIG.DMG_PLAYER_VULN_HIT); // dano dobrado já embutido
    setOpponentState(OPP_STATE.HIT, CONFIG.OPP_HIT_STUN_MS); // interrompe o oponente
    showBanner("ACERTOU!  x2", CONFIG.COLORS.good);
    checkGameOver();
    return;
  }

  // ERRO: o oponente não estava vulnerável -> o soco falha.
  // Jogador fica VULNERÁVEL e leva contra-ataque garantido (100%).
  setPlayerState(PLAYER_STATE.VULNERABLE, CONFIG.PLAYER_VULN_MS);
  opponent.counterTimer = CONFIG.OPP_COUNTER_DELAY_MS;

  if (isSpam) {
    // Punição extra: oponente ESQUIVA automaticamente (estilo) antes do contra.
    setOpponentState(OPP_STATE.DODGING, CONFIG.OPP_DODGE_MS);
    opponent.counterIsDodge = true;
    showBanner("ELE ESQUIVOU!", CONFIG.COLORS.bad);
  } else {
    showBanner("ERROU O SOCO!", CONFIG.COLORS.bad);
  }
}

// ESQUIVA (esquerda ou direita).
function playerDodge(direction) {
  if (!playerCanAct()) return;
  setPlayerState(
    direction === SIDE.LEFT ? PLAYER_STATE.DODGING_LEFT : PLAYER_STATE.DODGING_RIGHT,
    CONFIG.PLAYER_DODGE_MS
  );
}

// ---- Resolução do ataque do oponente (chamada no fim do telegraph) ----
function resolveOpponentStrike() {
  // A esquiva CORRETA é a do mesmo lado que o oponente telegrafou.
  const correct =
    opponent.attackSide === SIDE.LEFT
      ? PLAYER_STATE.DODGING_LEFT
      : PLAYER_STATE.DODGING_RIGHT;

  if (player.state === correct) {
    // ESQUIVA PERFEITA -> ataque falha e o oponente fica VULNERÁVEL 600ms.
    setOpponentState(OPP_STATE.VULNERABLE, CONFIG.OPP_VULN_MS);
    showBanner("ESQUIVA!  CONTRA-ATAQUE!", CONFIG.COLORS.good);
  } else {
    // Jogador não esquivou (ou esquivou pro lado errado) -> toma o soco.
    setOpponentState(OPP_STATE.ATTACKING, CONFIG.OPP_STRIKE_ANIM_MS);
    damage(player, CONFIG.DMG_OPP_PUNCH);
    // Só entra em HIT se não estiver já travado (vulnerável/hit).
    if (player.state === PLAYER_STATE.IDLE ||
        player.state === PLAYER_STATE.ATTACKING ||
        player.state === PLAYER_STATE.DODGING_LEFT ||
        player.state === PLAYER_STATE.DODGING_RIGHT) {
      setPlayerState(PLAYER_STATE.HIT, CONFIG.PLAYER_HIT_STUN_MS);
    }
    showBanner("VOCÊ TOMOU O SOCO", CONFIG.COLORS.bad);
    checkGameOver();
  }
}

// ---- Atualização da máquina de estados do JOGADOR ----
function updatePlayer(dt) {
  player.stateTime += dt;

  // Deslocamento visual suave da esquiva.
  const targetOffset =
    player.state === PLAYER_STATE.DODGING_LEFT ? -55 :
    player.state === PLAYER_STATE.DODGING_RIGHT ? 55 : 0;
  player.offsetX += (targetOffset - player.offsetX) * Math.min(1, dt / 60);

  // Expiração de estados temporários -> volta para IDLE.
  if (player.stateDur > 0 && player.stateTime >= player.stateDur) {
    switch (player.state) {
      case PLAYER_STATE.ATTACKING:
      case PLAYER_STATE.DODGING_LEFT:
      case PLAYER_STATE.DODGING_RIGHT:
      case PLAYER_STATE.VULNERABLE:
      case PLAYER_STATE.HIT:
        setPlayerState(PLAYER_STATE.IDLE);
        break;
    }
  }
}

// ---- Atualização da máquina de estados + IA do OPONENTE ----
function updateOpponent(dt) {
  opponent.stateTime += dt;

  // Contra-ataque garantido (agendado quando o jogador erra um soco).
  if (opponent.counterTimer > 0) {
    opponent.counterTimer -= dt;
    if (opponent.counterTimer <= 0) {
      opponent.counterTimer = 0;
      setOpponentState(OPP_STATE.ATTACKING, CONFIG.OPP_STRIKE_ANIM_MS);
      damage(player, CONFIG.DMG_COUNTER);
      showBanner("CONTRA-ATAQUE!", CONFIG.COLORS.bad);
      checkGameOver();
    }
  }

  // Deslocamento visual da esquiva do oponente.
  const oppTarget = opponent.state === OPP_STATE.DODGING ? 40 : 0;
  opponent.offsetX += (oppTarget - opponent.offsetX) * Math.min(1, dt / 60);

  switch (opponent.state) {
    case OPP_STATE.IDLE:
      // Espera aleatória e então telegrafa um ataque.
      if (opponent.stateTime >= opponent.stateDur) {
        opponent.attackSide = Math.random() < 0.5 ? SIDE.LEFT : SIDE.RIGHT;
        setOpponentState(OPP_STATE.PREPARING_ATTACK, CONFIG.TELEGRAPH_MS);
      }
      break;

    case OPP_STATE.PREPARING_ATTACK:
      // Fim do aviso -> resolve o golpe (acerta ou é esquivado).
      if (opponent.stateTime >= opponent.stateDur) {
        resolveOpponentStrike();
      }
      break;

    case OPP_STATE.ATTACKING:
      if (opponent.stateTime >= opponent.stateDur) opponentEnterIdle();
      break;

    case OPP_STATE.DODGING:
      // Após esquivar (punição de spam), volta a IDLE; o contra já foi agendado.
      if (opponent.stateTime >= opponent.stateDur) {
        if (opponent.counterTimer <= 0) opponentEnterIdle();
        else setOpponentState(OPP_STATE.IDLE, 99999); // segura até o contra disparar
      }
      break;

    case OPP_STATE.VULNERABLE:
      // Janela de 600ms para o jogador bater. Se não bater, volta a IDLE.
      if (opponent.stateTime >= opponent.stateDur) opponentEnterIdle();
      break;

    case OPP_STATE.HIT:
      if (opponent.stateTime >= opponent.stateDur) opponentEnterIdle();
      break;
  }
}

// ---- Update mestre (chamado a cada frame com delta-time) ----
function update(dt) {
  game.clock += dt;

  // Atualiza o banner de feedback.
  if (game.banner) {
    game.banner.time += dt;
    if (game.banner.time >= game.banner.dur) game.banner = null;
  }

  if (game.over) return; // congela a simulação na tela de fim

  updatePlayer(dt);
  updateOpponent(dt);
  syncRive();   // [9] espelha vida (number inputs) na camada Rive
}


/* =====================================================================
   [6] INPUT — botões desenhados no canvas, acionados por 'pointerdown'.
   Usamos pointerdown (não click) para resposta INSTANTÂNEA no mobile,
   sem o atraso de ~300ms do clique de navegador.
   ===================================================================== */

// Layout dos 4 botões em coordenadas virtuais.
// Linha de cima = SOCOS; linha de baixo = ESQUIVAS.
function buildButtons() {
  const pad = 14;
  const areaTop = 452;                 // topo da zona de botões
  const areaH = CONFIG.VH - areaTop;   // altura disponível
  const colW = (CONFIG.VW - pad * 3) / 2;
  const rowH = (areaH - pad * 3) / 2;
  const xL = pad;
  const xR = pad * 2 + colW;
  const yTop = areaTop + pad;
  const yBot = yTop + rowH + pad;

  return [
    { id: "PUNCH_L", x: xL, y: yTop, w: colW, h: rowH, label: "SOCO\nESQUERDO", kind: "punch", action: () => playerPunch(SIDE.LEFT) },
    { id: "PUNCH_R", x: xR, y: yTop, w: colW, h: rowH, label: "SOCO\nDIREITO",  kind: "punch", action: () => playerPunch(SIDE.RIGHT) },
    { id: "DODGE_L", x: xL, y: yBot, w: colW, h: rowH, label: "<<\nESQUIVA",    kind: "dodge", action: () => playerDodge(SIDE.LEFT) },
    { id: "DODGE_R", x: xR, y: yBot, w: colW, h: rowH, label: "ESQUIVA\n>>",    kind: "dodge", action: () => playerDodge(SIDE.RIGHT) },
  ];
}

let buttons = buildButtons();
const activePointers = new Map(); // pointerId -> buttonId (feedback de "pressionado")

function hitTest(vx, vy) {
  for (const b of buttons) {
    if (vx >= b.x && vx <= b.x + b.w && vy >= b.y && vy <= b.y + b.h) return b;
  }
  return null;
}

function onPointerDown(e) {
  e.preventDefault(); // evita scroll/zoom e o delay do clique

  // Tela de fim: qualquer toque reinicia a partida.
  if (game.over) { restartGame(); return; }

  const { x, y } = toVirtual(e.clientX, e.clientY);
  const btn = hitTest(x, y);
  if (btn) {
    activePointers.set(e.pointerId, btn.id);
    btn.action(); // dispara IMEDIATAMENTE
  }
}

function onPointerUp(e) {
  activePointers.delete(e.pointerId);
}

// pointer events cobrem mouse + touch + caneta com a mesma API.
canvas.addEventListener("pointerdown", onPointerDown, { passive: false });
canvas.addEventListener("pointerup", onPointerUp);
canvas.addEventListener("pointercancel", onPointerUp);
canvas.addEventListener("pointerleave", onPointerUp);
// Bloqueia menu de contexto no toque longo.
canvas.addEventListener("contextmenu", (e) => e.preventDefault());

// Bônus desktop: teclado (A/D = socos, ←/→ = esquivas) para testes rápidos.
window.addEventListener("keydown", (e) => {
  if (game.over) { if (e.key === " " || e.key === "Enter") restartGame(); return; }
  if (e.repeat) return;
  switch (e.key.toLowerCase()) {
    case "a": playerPunch(SIDE.LEFT); break;
    case "d": playerPunch(SIDE.RIGHT); break;
    case "arrowleft": playerDodge(SIDE.LEFT); break;
    case "arrowright": playerDodge(SIDE.RIGHT); break;
  }
});

function restartGame() {
  player.hp = CONFIG.MAX_HP;
  opponent.hp = CONFIG.MAX_HP;
  player.recentPunches = [];
  setPlayerState(PLAYER_STATE.IDLE);
  opponentEnterIdle();
  game.over = false;
  game.winner = null;
  game.banner = null;
  if (typeof animPlayer === "function") animPlayer(PLAYER_STATE.IDLE);
}


/* =====================================================================
   [9] CAMADA RIVE — ponte entre a máquina de estados (JS) e as
   animações (Rive). O JS continua sendo o CÉREBRO; o Rive é só visual.

   Estratégia: cada lutador é uma instância Rive renderizando num canvas
   OFFSCREEN (fora do DOM). No render() compositamos via ctx.drawImage()
   dentro do mesmo espaço virtual (mantém a ordem de camadas existente).

   FALLBACK: se o runtime do Rive não existir, o arquivo .riv não carregar
   ou o input não existir, tudo vira no-op e os PLACEHOLDERS continuam
   desenhando normalmente — o jogo nunca quebra.
   ===================================================================== */

// Configuração dos "slots" visuais. Cada slot vira uma instância Rive.
// rect = área (em coordenadas virtuais) onde a animação é desenhada.
// sm   = nome da State Machine no .riv (deixe null para tocar a timeline
//        padrão — útil para validar o pipeline com um .riv genérico).
const RIVE_SLOTS_CFG = {
  opponent: {
    // TESTE DE PIPELINE: usando um .riv genérico (sem State Machine) só para
    // validar carregamento + compositing + escala. Para a arte final, troque
    // por:  src: "assets/opponent.riv",  sm: "OppSM"
    src: "assets/test.riv",
    sm: null,
    rect: { x: CONFIG.VW / 2 - 95, y: 150, w: 190, h: 240 },
    quality: 3, // resolução interna = rect * quality (nitidez)
  },
  player: {
    // TESTE DE PIPELINE (mesmo .riv genérico). Para a arte final, troque
    // por:  src: "assets/player.riv",  sm: "PlayerSM"
    // (Se o arquivo final não existir, este slot cai no PLACEHOLDER sozinho.)
    src: "assets/test.riv",
    sm: null,
    rect: { x: CONFIG.VW / 2 - 135, y: 396, w: 270, h: 244 },
    quality: 3,
  },
};

const RIVE = {
  available: typeof window.rive !== "undefined", // runtime carregou?
  slots: {
    
  }, // nome -> { cfg, canvas, rive, inputs, loaded, failed }
};

// Cria uma instância Rive para um slot.
// IMPORTANTE: o canvas precisa estar NO DOM para o renderer do Rive
// inicializar a superfície de desenho. Mantemos o canvas escondido fora
// da tela e compositamos no canvas principal via drawImage() — assim a
// ordem de camadas (arena -> lutadores -> HUD -> botões) é preservada.
function createRiveSlot(name, cfg) {
  const off = document.createElement("canvas");
  // CSS define o tamanho lógico; resizeDrawingSurfaceToCanvas() converte
  // para o buffer real (x DPR). quality faz supersampling p/ nitidez.
  off.style.cssText =
    "position:fixed; left:-99999px; top:0; pointer-events:none; " +
    `width:${Math.round(cfg.rect.w * cfg.quality)}px; ` +
    `height:${Math.round(cfg.rect.h * cfg.quality)}px;`;
  document.body.appendChild(off);

  const slot = { cfg, canvas: off, rive: null, inputs: {}, loaded: false, failed: false };
  RIVE.slots[name] = slot;

  try {
    const opts = {
      src: cfg.src,
      canvas: off,
      autoplay: true,
      // contain + center garante que a arte caiba no slot sem distorcer.
      layout: new rive.Layout({ fit: rive.Fit.contain, alignment: rive.Alignment.center }),
      onLoad: () => {
        slot.rive.resizeDrawingSurfaceToCanvas(); // casa o buffer com CSS + DPR
        slot.loaded = true;
        cacheRiveInputs(slot);
        // Coloca o estado atual na animação assim que carregar.
        if (name === "opponent") animOpponent(opponent.state);
        if (name === "player") animPlayer(player.state);
      },
      onLoadError: () => { slot.failed = true; }, // cai no placeholder
    };
    // Só amarra a State Machine se um nome foi informado (senão toca a timeline padrão).
    if (cfg.sm) opts.stateMachines = cfg.sm;
    slot.rive = new rive.Rive(opts);
  } catch (e) {
    slot.failed = true; // qualquer erro -> placeholder
  }
}

// Re-sincroniza as superfícies Rive quando a viewport/DPR muda.
function resizeRive() {
  for (const n in RIVE.slots) {
    const s = RIVE.slots[n];
    if (s.loaded && !s.failed && s.rive) {
      try { s.rive.resizeDrawingSurfaceToCanvas(); } catch (e) {}
    }
  }
}

// Cacheia os inputs da State Machine num mapa { nome: input } para acesso O(1).
function cacheRiveInputs(slot) {
  if (!slot.cfg.sm || !slot.rive) return;
  try {
    const arr = slot.rive.stateMachineInputs(slot.cfg.sm);
    if (arr) arr.forEach((i) => { slot.inputs[i.name] = i; });
  } catch (e) { /* sem inputs (ex.: .riv de teste) -> tudo vira no-op */ }
}

// --- Helpers seguros: no-op se o slot/input não existir ---
function riveTrigger(slotName, inputName) {
  const i = RIVE.slots[slotName] && RIVE.slots[slotName].inputs[inputName];
  if (i && typeof i.fire === "function") i.fire();
}
function riveBool(slotName, inputName, v) {
  const i = RIVE.slots[slotName] && RIVE.slots[slotName].inputs[inputName];
  if (i) i.value = !!v;
}
function riveNum(slotName, inputName, v) {
  const i = RIVE.slots[slotName] && RIVE.slots[slotName].inputs[inputName];
  if (i) i.value = v;
}

/* ---- MAPEAMENTO estado JS -> inputs do Rive ----
   Estes nomes ("idle", "prepareL", "punchR"...) são o CONTRATO que o
   .riv final precisa expor na sua State Machine. Ver plano para a lista. */
function animOpponent(state) {
  switch (state) {
    case OPP_STATE.IDLE:
      riveBool("opponent", "vulnerable", false);
      riveTrigger("opponent", "idle");
      break;
    case OPP_STATE.PREPARING_ATTACK:
      riveTrigger("opponent", opponent.attackSide === SIDE.LEFT ? "prepareL" : "prepareR");
      break;
    case OPP_STATE.ATTACKING:
      riveTrigger("opponent", opponent.attackSide === SIDE.LEFT ? "attackL" : "attackR");
      break;
    case OPP_STATE.DODGING:
      riveTrigger("opponent", "dodge");
      break;
    case OPP_STATE.VULNERABLE:
      riveBool("opponent", "vulnerable", true);
      riveTrigger("opponent", "stun");
      break;
    case OPP_STATE.HIT:
      riveTrigger("opponent", "getHit");
      break;
  }
}

function animPlayer(state) {
  switch (state) {
    case PLAYER_STATE.IDLE:
      riveBool("player", "vulnerable", false);
      riveTrigger("player", "idle");
      break;
    case PLAYER_STATE.ATTACKING:
      riveTrigger("player", player.lastPunchSide === SIDE.LEFT ? "punchL" : "punchR");
      break;
    case PLAYER_STATE.DODGING_LEFT:
      riveTrigger("player", "dodgeL");
      break;
    case PLAYER_STATE.DODGING_RIGHT:
      riveTrigger("player", "dodgeR");
      break;
    case PLAYER_STATE.VULNERABLE:
      riveBool("player", "vulnerable", true);
      break;
    case PLAYER_STATE.HIT:
      riveTrigger("player", "getHit");
      break;
  }
}

// Empurra valores contínuos (vida) para os number inputs a cada frame.
function syncRive() {
  riveNum("opponent", "health", opponent.hp);
  riveNum("player", "health", player.hp);
}

// Desenha o slot Rive no canvas principal (no espaço virtual).
// Retorna true se desenhou (a render() do placeholder então é pulada).
function drawRiveSlot(name, extraOffsetX) {
  const s = RIVE.slots[name];
  if (!s || !s.loaded || s.failed) return false;
  const r = s.cfg.rect;
  ctx.drawImage(s.canvas, r.x + (extraOffsetX || 0), r.y, r.w, r.h);
  return true;
}

// Inicializa todas as instâncias (chamado no boot). Seguro se o Rive faltar.
function initRive() {
  if (!RIVE.available) return; // sem runtime -> placeholders
  for (const name in RIVE_SLOTS_CFG) createRiveSlot(name, RIVE_SLOTS_CFG[name]);
  try { window.RIVE = RIVE; } catch (e) {} // DEBUG: inspeção via console
}


/* =====================================================================
   [7] RENDER — desenho. Usa o Rive quando disponível; senão, PLACEHOLDERS.
   Cada bloco visual está isolado para troca fácil por sprites/Rive.
   ===================================================================== */

function clear() {
  ctx.fillStyle = CONFIG.COLORS.bg;
  ctx.fillRect(0, 0, CONFIG.VW, CONFIG.VH);
}

// --- HUD: barras de vida + rótulos ---
function renderHUD() {
  const C = CONFIG.COLORS;
  ctx.fillStyle = C.hudBg;
  ctx.fillRect(0, 0, CONFIG.VW, 64);

  const barW = 150, barH = 16, y = 30;

  // MINHA VIDA (esquerda) — preenche da esquerda p/ direita
  drawHpBar(10, y, barW, barH, player.hp, C.hpMineFill, false);
  drawLabel("MINHA VIDA", 10, 22, "left");

  // VIDA OPONENTE (direita) — preenche da direita p/ esquerda
  drawHpBar(CONFIG.VW - 10 - barW, y, barW, barH, opponent.hp, C.hpOppFill, true);
  drawLabel("VIDA OPONENTE", CONFIG.VW - 10, 22, "right");
}

function drawHpBar(x, y, w, h, hp, fill, rightToLeft) {
  const C = CONFIG.COLORS;
  const ratio = Math.max(0, hp / CONFIG.MAX_HP);
  ctx.fillStyle = C.hpEmpty;
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = fill;
  const fw = w * ratio;
  if (rightToLeft) ctx.fillRect(x + (w - fw), y, fw, h);
  else ctx.fillRect(x, y, fw, h);
  ctx.strokeStyle = "rgba(255,255,255,0.15)";
  ctx.strokeRect(x, y, w, h);
}

function drawLabel(text, x, y, align) {
  ctx.fillStyle = CONFIG.COLORS.text;
  ctx.font = "bold 11px sans-serif";
  ctx.textAlign = align;
  ctx.textBaseline = "alphabetic";
  ctx.fillText(text, x, y);
}

// --- Arena (fundo do ringue) ---
function renderArena() {
  const C = CONFIG.COLORS;
  ctx.fillStyle = C.arena;
  ctx.fillRect(0, 64, CONFIG.VW, 388 - 64);
  // Chão em perspectiva simples
  ctx.fillStyle = C.floor;
  ctx.beginPath();
  ctx.moveTo(0, 388);
  ctx.lineTo(CONFIG.VW, 388);
  ctx.lineTo(CONFIG.VW, 452);
  ctx.lineTo(0, 452);
  ctx.closePath();
  ctx.fill();
}

// --- OPONENTE (PLACEHOLDER): visto de frente, cintura para cima ---
// Substitua este bloco por um sprite/atlas mantendo o ponto de ancoragem (cx, baseY).
function renderOpponent() {
  const C = CONFIG.COLORS;
  const cx = CONFIG.VW / 2 + opponent.offsetX;
  const baseY = 360; // linha da cintura

  // Se o Rive carregou, ELE desenha o oponente; pulamos o placeholder.
  if (drawRiveSlot("opponent", opponent.offsetX)) {
    drawStateTag(cx, 128, "OPONENTE: " + opponent.state, C.textDim);
    return;
  }

  // Cor do corpo muda conforme o estado (feedback de leitura instantânea).
  let bodyColor = C.opponentBody;
  let blink = 1;
  if (opponent.state === OPP_STATE.PREPARING_ATTACK) {
    // Pisca em vermelho durante o telegraph (aviso de ataque).
    blink = 0.5 + 0.5 * Math.sin((opponent.stateTime / CONFIG.TELEGRAPH_MS) * Math.PI * 6);
    bodyColor = C.opponentTelegraph;
  } else if (opponent.state === OPP_STATE.VULNERABLE) {
    bodyColor = C.opponentVuln; // amarelo = janela de ataque do jogador
  } else if (opponent.state === OPP_STATE.HIT) {
    bodyColor = C.opponentHit;
  }

  ctx.save();
  ctx.globalAlpha = blink;

  // Tronco (retângulo)
  ctx.fillStyle = bodyColor;
  roundRect(cx - 55, baseY - 150, 110, 150, 12);
  ctx.fill();

  // Cabeça (círculo)
  ctx.fillStyle = opponent.state === OPP_STATE.PREPARING_ATTACK ? bodyColor : C.opponentHead;
  ctx.beginPath();
  ctx.arc(cx, baseY - 185, 32, 0, Math.PI * 2);
  ctx.fill();

  // Braços / luvas — o lado que vai atacar se destaca no telegraph e avança no ataque.
  const punchOut = (opponent.state === OPP_STATE.ATTACKING) ? 34 : 0;
  drawOppArm(cx - 70, baseY - 120, opponent.attackSide === SIDE.LEFT, punchOut, -1);
  drawOppArm(cx + 70, baseY - 120, opponent.attackSide === SIDE.RIGHT, punchOut, +1);

  ctx.restore();

  // Etiqueta de depuração do estado (remova ao integrar arte).
  drawStateTag(cx, baseY - 232, "OPONENTE: " + opponent.state, C.textDim);
}

function drawOppArm(x, y, isAttacker, punchOut, dir) {
  const C = CONFIG.COLORS;
  const highlight =
    isAttacker && opponent.state === OPP_STATE.PREPARING_ATTACK;
  ctx.fillStyle = highlight ? C.opponentTelegraph : C.opponentBody;
  const ax = x + dir * punchOut;
  roundRect(ax - 16, y - 16, 32, 60, 10);
  ctx.fill();
  // Luva
  ctx.fillStyle = C.opponentHit;
  ctx.beginPath();
  ctx.arc(ax, y - 16, 16, 0, Math.PI * 2);
  ctx.fill();
}

// --- JOGADOR (PLACEHOLDER): 1ª pessoa, cabeça/ombros/luvas vistos de costas ---
// Fica no primeiro plano inferior. Troque por sprite mantendo baseY.
function renderPlayer() {
  const C = CONFIG.COLORS;
  const cx = CONFIG.VW / 2 + player.offsetX;
  const baseY = 452;

  // Se o Rive carregou, ELE desenha o jogador; pulamos o placeholder.
  if (drawRiveSlot("player", player.offsetX)) {
    drawStateTag(cx, baseY - 44, "JOGADOR: " + player.state, C.textDim);
    return;
  }

  // Estado afeta a cor (vulnerável/hit ficam avermelhados).
  let skin = C.playerSkin;
  if (player.state === PLAYER_STATE.VULNERABLE) skin = "#5a3340";
  if (player.state === PLAYER_STATE.HIT) skin = C.opponentHit;

  // Ombros (trapézio largo na base) — silhueta de costas.
  ctx.fillStyle = skin;
  ctx.beginPath();
  ctx.moveTo(cx - 120, baseY + 60);
  ctx.lineTo(cx - 70, baseY - 6);
  ctx.lineTo(cx + 70, baseY - 6);
  ctx.lineTo(cx + 120, baseY + 60);
  ctx.closePath();
  ctx.fill();

  // Nuca/cabeça (de costas)
  ctx.beginPath();
  ctx.arc(cx, baseY - 4, 30, Math.PI, Math.PI * 2);
  ctx.fill();

  // Luvas do jogador — sobem/avançam ao socar.
  const punch = player.state === PLAYER_STATE.ATTACKING ? -28 : 0;
  drawPlayerGlove(cx - 92, baseY + 10 + punch);
  drawPlayerGlove(cx + 92, baseY + 10 + punch);

  drawStateTag(cx, baseY - 44, "JOGADOR: " + player.state, C.textDim);
}

function drawPlayerGlove(x, y) {
  ctx.fillStyle = CONFIG.COLORS.playerGlove;
  ctx.beginPath();
  ctx.arc(x, y, 22, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "rgba(0,0,0,0.3)";
  ctx.stroke();
}

// --- Botões virtuais ---
function renderButtons() {
  const C = CONFIG.COLORS;
  const locked = !playerCanAct(); // mostra botões travados durante VULNERABLE/HIT/etc.

  for (const b of buttons) {
    const pressed = [...activePointers.values()].includes(b.id);
    let color;
    if (locked) color = C.btnLocked;
    else if (b.kind === "punch") color = pressed ? C.btnPunchActive : C.btnPunch;
    else color = pressed ? C.btnDodgeActive : C.btnDodge;

    ctx.fillStyle = color;
    roundRect(b.x, b.y, b.w, b.h, 14);
    ctx.fill();
    ctx.strokeStyle = "rgba(255,255,255,0.08)";
    ctx.stroke();

    // Rótulo (suporta quebra de linha via "\n")
    ctx.fillStyle = locked ? C.textDim : C.text;
    ctx.font = "bold 15px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const lines = b.label.split("\n");
    const lh = 18;
    lines.forEach((ln, i) => {
      ctx.fillText(ln, b.x + b.w / 2, b.y + b.h / 2 + (i - (lines.length - 1) / 2) * lh);
    });
  }
}

// --- Banner central de feedback + dica ---
function renderBanner() {
  if (!game.banner) return;
  const b = game.banner;
  const alpha = 1 - b.time / b.dur;
  ctx.save();
  ctx.globalAlpha = Math.max(0, alpha);
  ctx.fillStyle = b.color;
  ctx.font = "bold 22px sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(b.text, CONFIG.VW / 2, 230);
  ctx.restore();
}

// --- Tela de fim de jogo ---
function renderGameOver() {
  if (!game.over) return;
  ctx.fillStyle = "rgba(0,0,0,0.7)";
  ctx.fillRect(0, 0, CONFIG.VW, CONFIG.VH);
  const win = game.winner === "PLAYER";
  ctx.fillStyle = win ? CONFIG.COLORS.good : CONFIG.COLORS.bad;
  ctx.font = "bold 34px sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(win ? "VOCÊ VENCEU!" : "VOCÊ PERDEU", CONFIG.VW / 2, CONFIG.VH / 2 - 20);
  ctx.fillStyle = CONFIG.COLORS.text;
  ctx.font = "16px sans-serif";
  ctx.fillText("Toque para reiniciar", CONFIG.VW / 2, CONFIG.VH / 2 + 24);
}

// Etiqueta de estado (debug). Apague esta função ao finalizar a arte.
function drawStateTag(cx, y, text, color) {
  ctx.fillStyle = color;
  ctx.font = "10px monospace";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, cx, y);
}

// Util: retângulo arredondado (define o caminho; chame fill()/stroke() depois).
function roundRect(x, y, w, h, r) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

// Render mestre — ordem de camadas (fundo -> frente).
function render() {
  clear();
  renderArena();
  renderOpponent();   // ao fundo
  renderPlayer();     // primeiro plano
  renderHUD();        // por cima de tudo
  renderButtons();
  renderBanner();
  renderGameOver();
}


/* =====================================================================
   [8] LOOP PRINCIPAL — requestAnimationFrame com delta-time real.
   O delta (ms) torna a lógica de timing independente do FPS.
   ===================================================================== */
let lastTime = 0;

function frame(now) {
  if (!lastTime) lastTime = now;
  let dt = now - lastTime; // ms desde o último frame
  lastTime = now;

  // Trava o dt para evitar "saltos" após abas em segundo plano.
  if (dt > 50) dt = 50;

  update(dt);   // [5] lógica / física / timers
  render();     // [7] desenho

  requestAnimationFrame(frame);
}

// ---- Boot ----
resize();
buttons = buildButtons();
initRive();          // [9] inicializa as animações (no-op se o Rive faltar)
opponentEnterIdle();
requestAnimationFrame(frame);

// Recalcula botões/escala quando a viewport muda.
window.addEventListener("resize", () => { resize(); buttons = buildButtons(); });
