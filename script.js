
const $ = id => document.getElementById(id);

const ADMIN = "Anujin";
const ADMIN_PASSWORD = "Admin1234";

let mode = "login";
let currentUser = null;

function getUsers() {
  return JSON.parse(localStorage.getItem("neonstack_users") || "{}");
}

function saveUsers(users) {
  localStorage.setItem("neonstack_users", JSON.stringify(users));
}

function showScreen(screen) {
  ["auth", "player", "admin"].forEach(id => {
    $(id).classList.toggle("hidden", id !== screen);
  });
  $("logout").classList.toggle("hidden", screen === "auth");
  $("session").textContent =
    screen === "auth" ? "NOT SIGNED IN" :
    screen === "admin" ? "ADMIN SESSION" : "PLAYER SESSION";
}

function message(text, success = false) {
  $("message").textContent = text;
  $("message").style.color = success ? "#5de5d2" : "#ff6da8";
}

$("login-tab").onclick = () => setMode("login");
$("signup-tab").onclick = () => setMode("signup");

function setMode(nextMode) {
  mode = nextMode;
  $("login-tab").classList.toggle("active", mode === "login");
  $("signup-tab").classList.toggle("active", mode === "signup");
  $("auth-submit").textContent =
    mode === "login" ? "Log in →" : "Create account →";
  message("");
}

$("auth-form").addEventListener("submit", event => {
  event.preventDefault();

  const name = $("username").value.trim();
  const password = $("password").value;

  if (!name || !password) return;

  if (name.toLowerCase() === ADMIN.toLowerCase()) {
    if (password !== ADMIN_PASSWORD) {
      message("Incorrect admin password.");
      return;
    }
    currentUser = "admin";
    showScreen("admin");
    renderAdmin();
    return;
  }

  const users = getUsers();
  const key = name.toLowerCase();

  if (mode === "signup") {
    if (users[key]) {
      message("That name is already taken.");
      return;
    }

    users[key] = {
      name,
      password,
      best: 0,
      games: 0,
      joined: new Date().toLocaleDateString()
    };

    saveUsers(users);
    currentUser = key;
    openPlayer();
  } else {
    if (!users[key] || users[key].password !== password) {
      message("Incorrect name or password.");
      return;
    }
    currentUser = key;
    openPlayer();
  }
});

$("logout").onclick = () => {
  stopGame();
  currentUser = null;
  showScreen("auth");
  $("username").value = "";
  $("password").value = "";
};

function openPlayer() {
  showScreen("player");
  $("player-name").textContent = getUsers()[currentUser].name;
  score = 0;
  lines = 0;
  level = 1;
  seconds = 0;
  updateStats();
  renderLeaderboard();
  initGame();
  $("overlay").classList.remove("hidden");
  $("overlay").innerHTML =
    '<h2>Ready to stack?</h2><button id="start" class="primary">Start game</button>';
  $("start").onclick = startGame;
}

function escapeHTML(text) {
  return text.replace(/[&<>"']/g, c => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;",
    '"': "&quot;", "'": "&#39;"
  }[c]));
}

function updateStats() {
  const user = getUsers()[currentUser];
  $("score").textContent = score.toLocaleString();
  $("best").textContent = Math.max(user?.best || 0, score).toLocaleString();
  $("lines").textContent = lines;
  $("level").textContent = level;
  $("time").textContent =
    String(Math.floor(seconds / 60)).padStart(2, "0") + ":" +
    String(seconds % 60).padStart(2, "0");
}

function renderLeaderboard() {
  const users = Object.values(getUsers())
    .sort((a, b) => b.best - a.best)
    .slice(0, 5);

  $("leaderboard").innerHTML = users.length
    ? users.map((user, i) =>
      `<div class="leader-row">
        <span>${i + 1}. ${escapeHTML(user.name)}</span>
        <span>${user.best.toLocaleString()}</span>
      </div>`
    ).join("")
    : "<p>No scores yet. Be the first!</p>";
}

function renderAdmin() {
  const users = Object.values(getUsers()).sort((a, b) => b.best - a.best);
  const top = users[0];

  $("users-count").textContent = users.length;
  $("games-count").textContent = users.reduce((n, u) => n + u.games, 0);
  $("top-score").textContent = (top?.best || 0).toLocaleString();
  $("top-player").textContent = top ? top.name : "No scores yet";

  $("users-table").innerHTML = users.map((user, i) => `
    <tr>
      <td>${i + 1}</td>
      <td>${escapeHTML(user.name)}</td>
      <td>${user.best.toLocaleString()}</td>
      <td>${user.games}</td>
      <td>${escapeHTML(user.joined)}</td>
    </tr>
  `).join("");
}

/* TETRIS GAME */

const ctx = $("board").getContext("2d");
const nextCtx = $("next").getContext("2d");
const COLS = 10, ROWS = 20, CELL = 30;

const shapes = {
  I: [[1, 1, 1, 1]],
  O: [[1, 1], [1, 1]],
  T: [[0, 1, 0], [1, 1, 1]],
  S: [[0, 1, 1], [1, 1, 0]],
  Z: [[1, 1, 0], [0, 1, 1]],
  J: [[1, 0, 0], [1, 1, 1]],
  L: [[0, 0, 1], [1, 1, 1]]
};

const colors = {
  I: "#5de5d2", O: "#f5ca69", T: "#b59cff",
  S: "#83e0a0", Z: "#ff6da8", J: "#70a8ff", L: "#ff9b67"
};

let board, piece, nextType;
let score = 0, lines = 0, level = 1, seconds = 0;
let running = false, paused = false, gameOver = false;
let lastTime = 0, dropCounter = 0, frameId = null, clockId = null;

function randomType() {
  return Object.keys(shapes)[Math.floor(Math.random() * 7)];
}

function initGame() {
  board = Array.from({ length: ROWS }, () => Array(COLS).fill(""));
  nextType = randomType();
  newPiece();
  draw();
  drawNext();
}

function newPiece() {
  const type = nextType;
  nextType = randomType();
  piece = {
    type,
    matrix: shapes[type].map(row => row.slice()),
    x: Math.floor((COLS - shapes[type][0].length) / 2),
    y: 0
  };
  drawNext();
  if (collide(piece.matrix, piece.x, piece.y)) finishGame();
}

function collide(matrix, x, y) {
  for (let r = 0; r < matrix.length; r++) {
    for (let c = 0; c < matrix[r].length; c++) {
      if (!matrix[r][c]) continue;
      const nx = x + c, ny = y + r;
      if (nx < 0 || nx >= COLS || ny >= ROWS) return true;
      if (ny >= 0 && board[ny][nx]) return true;
    }
  }
  return false;
}

function drawCell(context, x, y, color, size = CELL) {
  context.fillStyle = color;
  context.fillRect(x * size + 1, y * size + 1, size - 2, size - 2);
  context.fillStyle = "#ffffff30";
  context.fillRect(x * size + 2, y * size + 2, size - 4, 3);
}

function draw() {
  ctx.fillStyle = "#080b12";
  ctx.fillRect(0, 0, 300, 600);

  ctx.strokeStyle = "#1b2232";
  for (let x = 0; x <= COLS; x++) {
    ctx.beginPath();
    ctx.moveTo(x * CELL, 0);
    ctx.lineTo(x * CELL, 600);
    ctx.stroke();
  }
  for (let y = 0; y <= ROWS; y++) {
    ctx.beginPath();
    ctx.moveTo(0, y * CELL);
    ctx.lineTo(300, y * CELL);
    ctx.stroke();
  }

  board.forEach((row, y) => row.forEach((value, x) => {
    if (value) drawCell(ctx, x, y, colors[value]);
  }));

  if (piece) {
    piece.matrix.forEach((row, y) => row.forEach((value, x) => {
      if (value && piece.y + y >= 0) {
        drawCell(ctx, piece.x + x, piece.y + y, colors[piece.type]);
      }
    }));
  }
}

function drawNext() {
  nextCtx.clearRect(0, 0, 120, 120);
  const matrix = shapes[nextType];
  const size = 24;
  const ox = (120 - matrix[0].length * size) / 2;
  const oy = (120 - matrix.length * size) / 2;

  matrix.forEach((row, y) => row.forEach((value, x) => {
    if (!value) return;
    nextCtx.fillStyle = colors[nextType];
    nextCtx.fillRect(ox + x * size + 1, oy + y * size + 1, size - 3, size - 3);
  }));
}

function merge() {
  piece.matrix.forEach((row, y) => row.forEach((value, x) => {
    if (value && piece.y + y >= 0) {
      board[piece.y + y][piece.x + x] = piece.type;
    }
  }));

  let cleared = 0;
  for (let y = ROWS - 1; y >= 0; y--) {
    if (board[y].every(Boolean)) {
      board.splice(y, 1);
      board.unshift(Array(COLS).fill(""));
      cleared++;
      y++;
    }
  }

  if (cleared) {
    lines += cleared;
    score += [0, 100, 300, 500, 800][cleared] * level;
    level = Math.floor(lines / 10) + 1;
  }

  updateStats();
  newPiece();
  draw();
}

function tick() {
  if (!running || paused || gameOver) return;
  if (!collide(piece.matrix, piece.x, piece.y + 1)) {
    piece.y++;
  } else {
    merge();
  }
  draw();
}

function move(dx) {
  if (!running || paused || gameOver) return;
  if (!collide(piece.matrix, piece.x + dx, piece.y)) {
    piece.x += dx;
    draw();
  }
}

function rotatePiece() {
  if (!running || paused || gameOver) return;
  const rotated = piece.matrix[0].map((_, i) =>
    piece.matrix.map(row => row[i]).reverse()
  );
  if (!collide(rotated, piece.x, piece.y)) {
    piece.matrix = rotated;
    draw();
  }
}

function softDrop() {
  if (!running || paused || gameOver) return;
  if (!collide(piece.matrix, piece.x, piece.y + 1)) {
    piece.y++;
    score++;
    updateStats();
  } else {
    merge();
  }
  draw();
}

function hardDrop() {
  if (!running || paused || gameOver) return;
  while (!collide(piece.matrix, piece.x, piece.y + 1)) {
    piece.y++;
    score += 2;
  }
  merge();
  draw();
}

function startGame() {
  stopGame();
  score = 0; lines = 0; level = 1; seconds = 0;
  paused = false; gameOver = false; running = true;
  initGame();
  updateStats();
  $("overlay").classList.add("hidden");
  $("pause").textContent = "Pause";
  lastTime = 0;
  dropCounter = 0;
  frameId = requestAnimationFrame(loop);
  clockId = setInterval(() => {
    if (running && !paused && !gameOver) {
      seconds++;
      updateStats();
    }
  }, 1000);
}

function loop(timestamp) {
  if (!running || paused || gameOver) return;
  if (!lastTime) lastTime = timestamp;
  dropCounter += timestamp - lastTime;
  lastTime = timestamp;

  if (dropCounter > Math.max(100, 750 - (level - 1) * 55)) {
    tick();
    dropCounter = 0;
  }

  draw();
  if (running && !paused && !gameOver) {
    frameId = requestAnimationFrame(loop);
  }
}

function finishGame() {
  if (gameOver) return;
  gameOver = true;
  running = false;
  clearInterval(clockId);

  $("overlay").classList.remove("hidden");
  $("overlay").innerHTML =
    `<h2>Game over!</h2><p>Your score: ${score.toLocaleString()}</p>
     <button id="start" class="primary">Play again</button>`;
  $("start").onclick = startGame;

  const users = getUsers();
  const user = users[currentUser];
  if (user) {
    user.best = Math.max(user.best, score);
    user.games++;
    saveUsers(users);
  }

  updateStats();
  renderLeaderboard();
}

function stopGame() {
  running = false;
  if (frameId) cancelAnimationFrame(frameId);
  if (clockId) clearInterval(clockId);
}

$("start").onclick = startGame;

$("pause").onclick = () => {
  if (!running || gameOver) return;
  paused = !paused;
  $("pause").textContent = paused ? "Resume" : "Pause";
  if (!paused) {
    lastTime = 0;
    frameId = requestAnimationFrame(loop);
  }
};

document.addEventListener("keydown", event => {
  if ($("player").classList.contains("hidden")) return;

  if (["ArrowLeft", "ArrowRight", "ArrowDown", "ArrowUp", " "].includes(event.key)) {
    event.preventDefault();
  }

  if (event.key === "ArrowLeft") move(-1);
  else if (event.key === "ArrowRight") move(1);
  else if (event.key === "ArrowDown") softDrop();
  else if (event.key === "ArrowUp") rotatePiece();
  else if (event.code === "Space") hardDrop();
  else if (event.key.toLowerCase() === "p") $("pause").click();
  else if (event.key.toLowerCase() === "r") startGame();
});
