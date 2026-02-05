const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");

const HUD_H = 90;
const LOGICAL_W = 360;
const LOGICAL_H = 640;

const ACCEL = 800;
const FRICTION = 0.92;
const FRICTION_DIZZY = 0.965;
const MAX_SPEED = 600;
const STOP_SPEED = 25;
const ROLL_SPEED = 55;

const TILT_TH = 420;
const GAIN_BASE = 18;
const GAIN_ROUGH_MULT = 1.8;
const COOL_DECAY_RUN = 28;
const DECAY_STOP = 55;
const DECAY_NORMAL_RUN = 3;

const rectWalls = [
  { x: 90, y: 520, w: 240, h: 16 },
  { x: 30, y: 450, w: 220, h: 16 },
  { x: 110, y: 380, w: 220, h: 16 },
  { x: 30, y: 310, w: 220, h: 16 },
  { x: 110, y: 240, w: 220, h: 16 },
  { x: 30, y: 170, w: 220, h: 16 },
  { x: 110, y: 100, w: 220, h: 16 },
  { x: 260, y: 430, w: 16, h: 140 },
  { x: 80, y: 260, w: 16, h: 140 },
  { x: 260, y: 90, w: 16, h: 140 }
];

const coolZones = [
  { x: 40, y: 560, w: 90, h: 40 },
  { x: 250, y: 470, w: 70, h: 60 },
  { x: 40, y: 260, w: 70, h: 70 },
  { x: 240, y: 120, w: 80, h: 50 }
];

const roughZones = [
  { x: 140, y: 560, w: 200, h: 40 },
  { x: 40, y: 410, w: 280, h: 35 },
  { x: 40, y: 220, w: 280, h: 35 }
];

const goal = { x: 300, y: 60, r: 22 };

const ui = {
  time: document.getElementById("time"),
  state: document.getElementById("state"),
  dizzy: document.getElementById("dizzy-bar"),
  restart: document.getElementById("restart"),
  overlay: document.getElementById("overlay"),
  enable: document.getElementById("enable"),
  clear: document.getElementById("clear"),
  clearTime: document.getElementById("clear-time"),
  retry: document.getElementById("retry"),
  virtual: document.getElementById("virtual")
};

let dpr = window.devicePixelRatio || 1;
let scale = 1;

const state = {
  x: 60,
  y: 580,
  vx: 0,
  vy: 0,
  r: 16,
  ax: 0,
  ay: 0,
  angle: 0,
  dizzyGauge: 0,
  mode: "STAND",
  isDizzy: false,
  dizzyPop: 0,
  time: 0,
  running: false,
  cleared: false
};

const input = {
  gamma: 0,
  beta: 0,
  usingSensor: false,
  usingVirtual: false,
  virtualX: 0,
  virtualY: 0
};

const particles = {
  sparkles: [],
  dust: [],
  confetti: []
};

let lastTime = 0;

function resizeCanvas() {
  dpr = window.devicePixelRatio || 1;
  const vh = window.innerHeight * 0.01;
  document.documentElement.style.setProperty("--vh", `${vh}px`);
  canvas.width = LOGICAL_W * dpr;
  canvas.height = LOGICAL_H * dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const availableH = window.innerHeight - HUD_H;
  scale = Math.min(window.innerWidth / LOGICAL_W, availableH / LOGICAL_H);
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function resetGame() {
  state.x = 60;
  state.y = 580;
  state.vx = 0;
  state.vy = 0;
  state.ax = 0;
  state.ay = 0;
  state.angle = 0;
  state.dizzyGauge = 0;
  state.mode = "STAND";
  state.isDizzy = false;
  state.dizzyPop = 0;
  state.time = 0;
  state.running = true;
  state.cleared = false;
  particles.sparkles = [];
  particles.dust = [];
  particles.confetti = [];
  ui.clear.classList.add("overlay--hidden");
}

function handleOrientation(event) {
  if (!input.usingSensor) {
    return;
  }
  input.gamma = event.gamma ?? 0;
  input.beta = event.beta ?? 0;
}

function setupVirtualControls() {
  const buttons = ui.virtual.querySelectorAll(".virtual__btn");
  const setDir = (dir, active) => {
    const value = active ? 1 : 0;
    if (dir === "left") {
      input.virtualX = -value;
    }
    if (dir === "right") {
      input.virtualX = value;
    }
    if (dir === "up") {
      input.virtualY = -value;
    }
    if (dir === "down") {
      input.virtualY = value;
    }
  };

  buttons.forEach((button) => {
    const dir = button.dataset.dir;
    const activate = () => setDir(dir, true);
    const deactivate = () => setDir(dir, false);
    button.addEventListener("touchstart", (event) => {
      event.preventDefault();
      activate();
    });
    button.addEventListener("touchend", (event) => {
      event.preventDefault();
      deactivate();
    });
    button.addEventListener("touchcancel", (event) => {
      event.preventDefault();
      deactivate();
    });
    button.addEventListener("mousedown", (event) => {
      event.preventDefault();
      activate();
    });
    button.addEventListener("mouseup", (event) => {
      event.preventDefault();
      deactivate();
    });
    button.addEventListener("mouseleave", deactivate);
  });
}

function enableVirtualControls() {
  input.usingVirtual = true;
  ui.virtual.classList.remove("virtual--hidden");
}

function disableOverlay() {
  ui.overlay.classList.add("overlay--hidden");
}

function requestSensorPermission() {
  const permission = DeviceOrientationEvent?.requestPermission;
  if (typeof permission === "function") {
    return permission();
  }
  return Promise.resolve("granted");
}

function startSensors() {
  input.usingSensor = true;
  window.addEventListener("deviceorientation", handleOrientation);
}

function updateAcceleration() {
  if (input.usingVirtual && !input.usingSensor) {
    state.ax = input.virtualX * ACCEL;
    state.ay = input.virtualY * ACCEL;
    return;
  }
  const gamma = clamp(input.gamma, -45, 45);
  const beta = clamp(input.beta, -45, 45);
  let ax = (gamma / 45) * ACCEL;
  let ay = (beta / 45) * ACCEL;
  if (state.isDizzy) {
    ax *= 0.4;
    ay *= 0.4;
  }
  state.ax = ax;
  state.ay = ay;
}

function applyPhysics(dt) {
  state.vx += state.ax * dt;
  state.vy += state.ay * dt;

  let speed = Math.hypot(state.vx, state.vy);
  if (speed > MAX_SPEED) {
    const scale = MAX_SPEED / speed;
    state.vx *= scale;
    state.vy *= scale;
    speed = MAX_SPEED;
  }

  const friction = state.isDizzy ? FRICTION_DIZZY : FRICTION;
  const frictionFactor = Math.pow(friction, dt * 60);
  state.vx *= frictionFactor;
  state.vy *= frictionFactor;

  state.x += state.vx * dt;
  state.y += state.vy * dt;

  resolveCollisions();

  speed = Math.hypot(state.vx, state.vy);
  state.angle += speed * dt * 0.03;

  updateDizzy(dt, speed);
  updateState(speed);
}

function updateState(speed) {
  if (state.isDizzy) {
    state.mode = "DIZZY";
    if (state.dizzyGauge <= 35) {
      state.isDizzy = false;
    }
  }
  if (!state.isDizzy) {
    state.mode = speed >= ROLL_SPEED ? "ROLL" : "STAND";
  }
  ui.state.textContent = state.mode;
}

function updateDizzy(dt, speed) {
  const isRunning = speed > STOP_SPEED;
  const tiltStrength = Math.abs(state.ax) + Math.abs(state.ay);
  const onCool = isOnZone(coolZones);
  const onRough = isOnZone(roughZones);

  if (onCool) {
    state.dizzyGauge -= COOL_DECAY_RUN * dt;
  } else if (isRunning) {
    state.dizzyGauge -= DECAY_NORMAL_RUN * dt;
  }

  if (isRunning && tiltStrength > TILT_TH) {
    state.dizzyGauge += GAIN_BASE * dt * (onRough ? GAIN_ROUGH_MULT : 1);
  }

  if (!isRunning) {
    state.dizzyGauge -= DECAY_STOP * dt;
  }

  state.dizzyGauge = clamp(state.dizzyGauge, 0, 100);
  ui.dizzy.style.width = `${state.dizzyGauge}%`;

  if (!state.isDizzy && state.dizzyGauge >= 100) {
    state.isDizzy = true;
    state.dizzyPop = 1.0;
  }
  if (state.dizzyPop > 0) {
    state.dizzyPop = Math.max(0, state.dizzyPop - dt);
  }
}

function isOnZone(list) {
  return list.some((zone) =>
    state.x > zone.x &&
    state.x < zone.x + zone.w &&
    state.y > zone.y &&
    state.y < zone.y + zone.h
  );
}

function resolveCollisions() {
  const minX = state.r;
  const maxX = LOGICAL_W - state.r;
  const minY = HUD_H + state.r;
  const maxY = LOGICAL_H - state.r;

  if (state.x < minX) {
    state.x = minX;
    bounceVelocity(1, 0);
  }
  if (state.x > maxX) {
    state.x = maxX;
    bounceVelocity(-1, 0);
  }
  if (state.y < minY) {
    state.y = minY;
    bounceVelocity(0, 1);
  }
  if (state.y > maxY) {
    state.y = maxY;
    bounceVelocity(0, -1);
  }

  rectWalls.forEach((wall) => resolveCircleRect(wall));
}

function resolveCircleRect(rect) {
  const closestX = clamp(state.x, rect.x, rect.x + rect.w);
  const closestY = clamp(state.y, rect.y, rect.y + rect.h);
  const dx = state.x - closestX;
  const dy = state.y - closestY;
  const dist = Math.hypot(dx, dy);

  if (dist >= state.r) {
    return;
  }

  let nx = 1;
  let ny = 0;
  if (dist > 0.001) {
    nx = dx / dist;
    ny = dy / dist;
  } else {
    if (Math.abs(dx) > Math.abs(dy)) {
      nx = Math.sign(dx) || 1;
      ny = 0;
    } else {
      nx = 0;
      ny = Math.sign(dy) || 1;
    }
  }

  const push = state.r - dist;
  state.x += nx * push;
  state.y += ny * push;
  bounceVelocity(nx, ny);
}

function bounceVelocity(nx, ny) {
  const vn = state.vx * nx + state.vy * ny;
  const vnx = vn * nx;
  const vny = vn * ny;
  const vtx = state.vx - vnx;
  const vty = state.vy - vny;
  state.vx = -vnx * 0.65 + vtx * 0.95;
  state.vy = -vny * 0.65 + vty * 0.95;
}

function checkGoal() {
  const dist = Math.hypot(state.x - goal.x, state.y - goal.y);
  if (!state.cleared && dist < state.r + goal.r) {
    state.cleared = true;
    particles.confetti = createConfetti();
    ui.clearTime.textContent = `Time: ${state.time.toFixed(1)}s`;
    ui.clear.classList.remove("overlay--hidden");
  }
}

function createConfetti() {
  const list = [];
  for (let i = 0; i < 140; i += 1) {
    list.push({
      x: LOGICAL_W / 2,
      y: LOGICAL_H / 2,
      vx: (Math.random() - 0.5) * 180,
      vy: (Math.random() - 0.5) * 220 - 80,
      life: 1.8 + Math.random() * 0.5,
      size: 4 + Math.random() * 3,
      color: `hsl(${Math.random() * 360}, 80%, 70%)`
    });
  }
  return list;
}

function updateParticles(dt, speed) {
  const onCool = isOnZone(coolZones);
  const onRough = isOnZone(roughZones);

  if (onCool) {
    particles.sparkles.push({
      x: state.x + (Math.random() - 0.5) * 30,
      y: state.y + 20 + Math.random() * 10,
      vy: -20 - Math.random() * 30,
      life: 0.9,
      size: 2 + Math.random() * 2
    });
  }

  if (onRough && speed > STOP_SPEED) {
    particles.dust.push({
      x: state.x - state.vx * 0.02 + (Math.random() - 0.5) * 10,
      y: state.y - state.vy * 0.02 + (Math.random() - 0.5) * 10,
      vx: (Math.random() - 0.5) * 40,
      vy: (Math.random() - 0.5) * 40,
      life: 0.6,
      size: 2 + Math.random() * 2
    });
  }

  particles.sparkles.forEach((p) => {
    p.y += p.vy * dt;
    p.life -= dt;
  });
  particles.sparkles = particles.sparkles.filter((p) => p.life > 0);

  particles.dust.forEach((p) => {
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.life -= dt;
  });
  particles.dust = particles.dust.filter((p) => p.life > 0);

  particles.confetti.forEach((p) => {
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.vy += 40 * dt;
    p.life -= dt;
  });
  particles.confetti = particles.confetti.filter((p) => p.life > 0);
}

function drawBackground() {
  ctx.fillStyle = "#fef9f2";
  ctx.fillRect(0, 0, LOGICAL_W, LOGICAL_H);

  ctx.fillStyle = "#e5d4c4";
  ctx.fillRect(0, HUD_H, LOGICAL_W, LOGICAL_H - HUD_H);

  coolZones.forEach((zone) => {
    ctx.fillStyle = "#a7e6b2";
    ctx.fillRect(zone.x, zone.y, zone.w, zone.h);
  });

  roughZones.forEach((zone) => {
    ctx.fillStyle = "#d6b58a";
    ctx.fillRect(zone.x, zone.y, zone.w, zone.h);
  });

  rectWalls.forEach((wall) => {
    ctx.fillStyle = "#c5a58a";
    ctx.fillRect(wall.x, wall.y, wall.w, wall.h);
  });

  ctx.strokeStyle = "#9e7b62";
  ctx.lineWidth = 4;
  ctx.strokeRect(state.r, HUD_H + state.r, LOGICAL_W - state.r * 2, LOGICAL_H - HUD_H - state.r * 2);

  ctx.beginPath();
  ctx.arc(goal.x, goal.y, goal.r, 0, Math.PI * 2);
  ctx.fillStyle = "#ffd86a";
  ctx.fill();
  ctx.strokeStyle = "#f2b642";
  ctx.lineWidth = 3;
  ctx.stroke();
}

function drawParticles() {
  particles.sparkles.forEach((p) => {
    ctx.globalAlpha = Math.max(0, p.life);
    ctx.fillStyle = "#ffffff";
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
    ctx.fill();
  });
  ctx.globalAlpha = 1;

  particles.dust.forEach((p) => {
    ctx.globalAlpha = Math.max(0, p.life);
    ctx.fillStyle = "#c59a6c";
    ctx.fillRect(p.x, p.y, p.size, p.size);
  });
  ctx.globalAlpha = 1;

  particles.confetti.forEach((p) => {
    ctx.globalAlpha = Math.max(0, p.life);
    ctx.fillStyle = p.color;
    ctx.fillRect(p.x, p.y, p.size, p.size);
  });
  ctx.globalAlpha = 1;
}

function drawCat() {
  ctx.save();
  let jitterX = 0;
  let jitterY = 0;
  if (state.isDizzy) {
    jitterX = Math.sin(Date.now() * 0.02) * 2;
    jitterY = Math.cos(Date.now() * 0.025) * 2;
  }
  ctx.translate(state.x + jitterX, state.y + jitterY);

  if (state.mode === "STAND") {
    drawCatStand();
  } else if (state.mode === "ROLL") {
    drawCatRoll();
  } else {
    drawCatDizzy();
  }

  ctx.restore();
}

function drawCatStand() {
  ctx.fillStyle = "#fef1d9";
  ctx.beginPath();
  ctx.ellipse(0, 0, 18, 14, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "#f3b4a6";
  ctx.beginPath();
  ctx.moveTo(-10, -10);
  ctx.lineTo(-16, -20);
  ctx.lineTo(-2, -14);
  ctx.closePath();
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(10, -10);
  ctx.lineTo(16, -20);
  ctx.lineTo(2, -14);
  ctx.closePath();
  ctx.fill();

  drawCatFace(false);
}

function drawCatRoll() {
  ctx.save();
  ctx.rotate(state.angle);
  ctx.fillStyle = "#ffe7c4";
  ctx.beginPath();
  ctx.arc(0, 0, 16, 0, Math.PI * 2);
  ctx.fill();

  drawCatFace(true);

  ctx.fillStyle = "#f3b4a6";
  ctx.beginPath();
  ctx.moveTo(14, 6);
  ctx.lineTo(24, 12);
  ctx.lineTo(14, 14);
  ctx.closePath();
  ctx.fill();

  ctx.restore();
}

function drawCatDizzy() {
  ctx.save();
  ctx.rotate(state.angle * 0.5);
  ctx.fillStyle = "#ffe7c4";
  ctx.beginPath();
  ctx.arc(0, 0, 16, 0, Math.PI * 2);
  ctx.fill();

  drawCatFace(true, true);
  ctx.restore();
}

function drawCatFace(isRolling, isDizzy = false) {
  ctx.fillStyle = "#6a4e4e";
  if (isDizzy) {
    drawSpiral(-6, -2);
    drawSpiral(6, -2);
  } else {
    ctx.beginPath();
    ctx.arc(-6, -2, 2.2, 0, Math.PI * 2);
    ctx.arc(6, -2, 2.2, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.strokeStyle = "#6a4e4e";
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(0, 4);
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(0, 6, 4, 0, Math.PI);
  ctx.stroke();

  ctx.fillStyle = "#f6a6b2";
  ctx.beginPath();
  ctx.arc(-8, 4, 2, 0, Math.PI * 2);
  ctx.arc(8, 4, 2, 0, Math.PI * 2);
  ctx.fill();

  if (isRolling) {
    ctx.strokeStyle = "#f3b4a6";
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(-4, -12);
    ctx.lineTo(-10, -18);
    ctx.moveTo(4, -12);
    ctx.lineTo(10, -18);
    ctx.stroke();
  }
}

function drawSpiral(x, y) {
  ctx.save();
  ctx.translate(x, y);
  ctx.strokeStyle = "#6a4e4e";
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  for (let i = 0; i < 8; i += 1) {
    const angle = i * 0.8;
    const radius = 0.6 * i;
    ctx.lineTo(Math.cos(angle) * radius, Math.sin(angle) * radius);
  }
  ctx.stroke();
  ctx.restore();
}

function drawDizzyPop() {
  if (state.dizzyPop <= 0) {
    return;
  }
  ctx.save();
  ctx.globalAlpha = Math.min(1, state.dizzyPop * 2);
  ctx.fillStyle = "rgba(255, 255, 255, 0.9)";
  ctx.strokeStyle = "#f4978e";
  ctx.lineWidth = 2;
  const w = 180;
  const h = 44;
  ctx.translate(LOGICAL_W / 2 - w / 2, LOGICAL_H / 2 - 120);
  ctx.beginPath();
  ctx.roundRect(0, 0, w, h, 16);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = "#f26d6d";
  ctx.font = "16px sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("目が回った！", w / 2, h / 2);
  ctx.restore();

  ctx.save();
  ctx.translate(LOGICAL_W - 36, HUD_H + 24);
  ctx.strokeStyle = "#8a5b6a";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(0, 0, 10, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(0, 0, 6, 0, Math.PI * 1.5);
  ctx.stroke();
  ctx.restore();
}

function draw() {
  drawBackground();
  drawParticles();
  drawCat();
  drawDizzyPop();
}

function update(dt) {
  if (!state.running || state.cleared) {
    return;
  }
  updateAcceleration();
  applyPhysics(dt);
  updateParticles(dt, Math.hypot(state.vx, state.vy));
  checkGoal();
  state.time += dt;
  ui.time.textContent = `${state.time.toFixed(1)}s`;
}

function loop(timestamp) {
  if (!lastTime) {
    lastTime = timestamp;
  }
  const rawDt = (timestamp - lastTime) / 1000;
  const dt = Math.min(rawDt, 0.033);
  lastTime = timestamp;

  update(dt);
  draw();
  requestAnimationFrame(loop);
}

function init() {
  resizeCanvas();
  setupVirtualControls();
  resetGame();
  state.running = false;
  ui.dizzy.style.width = "0%";
  window.addEventListener("resize", resizeCanvas);
  ui.restart.addEventListener("click", resetGame);
  ui.retry.addEventListener("click", () => {
    resetGame();
  });

  ui.enable.addEventListener("click", async () => {
    try {
      const result = await requestSensorPermission();
      if (result === "granted") {
        startSensors();
        disableOverlay();
        state.running = true;
        ui.virtual.classList.add("virtual--hidden");
        input.usingVirtual = false;
        return;
      }
    } catch (error) {
      console.warn("Sensor permission error", error);
    }
    disableOverlay();
    enableVirtualControls();
    state.running = true;
  });

  requestAnimationFrame(loop);
}

init();
