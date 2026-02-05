// Constants
const ACCEL = 800;
const FRICTION = 0.92;
const MAX_SPEED = 600;
const STOP_SPEED = 25;
const ROLL_SPEED = 55;
const TILT_TH = 420;
const GAIN_BASE = 18;
const GAIN_ROUGH_MULT = 1.8;
const COOL_DECAY_RUN = 28;
const DECAY_STOP = 55;
const DECAY_NORMAL_RUN = 3;
const FRICTION_DIZZY = 0.965;

// DOM Elements
const canvas = document.getElementById('game-canvas');
const ctx = canvas.getContext('2d');
const timeDisplay = document.getElementById('time-display');
const stateDisplay = document.getElementById('state-display');
const dizzyBarFill = document.getElementById('dizzy-bar-fill');
const startScreen = document.getElementById('start-screen');
const gameOverScreen = document.getElementById('game-over-screen');
const startBtn = document.getElementById('start-btn');
const btnModeBtn = document.getElementById('btn-mode-btn');
const restartBtn = document.getElementById('restart-btn');
const goRestartBtn = document.getElementById('go-restart-btn');
const fallbackControls = document.getElementById('fallback-controls');
const dizzyPopup = document.getElementById('dizzy-popup');

// Game State
let gameState = 'INIT'; // INIT, PLAY, OVER
let lastTime = 0;
let timeElapsed = 0;
let particles = [];
let dizzyPopupTimer = 0;

// Player
const player = {
    x: 180,
    y: 580,
    vx: 0,
    vy: 0,
    r: 16,
    angle: 0, // For visual rotation
    state: 'STAND', // STAND, ROLL, DIZZY
    dizzyGauge: 0,
    onCool: false,
    onRough: false
};

// Map Data - Fun Version
const goal = { x: 180, y: 140, r: 24 };

// Fun Zig-Zag Map
const rectWalls = [
    // Outer Walls (handled by logic, but added here if visual only? No, logic uses strict bounds)
    // We only define Obstacles here.

    // 1. The Split Block (Center bottom)
    {x: 140, y: 480, w: 80, h: 20},

    // 2. Slalom Left (From Left Wall)
    {x: 0,   y: 380, w: 200, h: 20},

    // 3. Slalom Right (From Right Wall)
    {x: 160, y: 280, w: 200, h: 20},

    // 4. Central Pillar (moved down to not block goal)
    {x: 160, y: 200, w: 40, h: 40},
];

const coolZones = [
    // Start Area
    {x: 100, y: 560, w: 160, h: 60},

    // Safe Turn Left
    {x: 220, y: 390, w: 80, h: 50},

    // Safe Turn Right
    {x: 60,  y: 290, w: 80, h: 50},

    // Goal Approach
    {x: 120, y: 40,  w: 120, h: 100},
];

const roughZones = [
    // Rough patches on the edges of the slalom
    {x: 210, y: 360, w: 150, h: 20},
    {x: 0,   y: 300, w: 150, h: 20},
];

const HUD_H = 90;
const WIDTH = 360;
const HEIGHT = 640;

// Input State
let input = {
    gamma: 0,
    beta: 0,
    useFallback: false,
    keys: { up: false, down: false, left: false, right: false }
};

// Setup Canvas
function resize() {
    const dpr = window.devicePixelRatio || 1;
    // Fix layout size first
    let cw = window.innerWidth;
    let ch = window.innerHeight;

    // Constrain aspect ratio if needed, or just fit
    // We want to fit the logic 360x640 into the screen.
    // CSS handles object-fit, but we need the internal resolution to match dpr.

    canvas.width = 360 * dpr;
    canvas.height = 640 * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0); // Reset and scale

    // Note: The logic assumes 360x640.
    // We don't change internal logic size, CSS scales it.
}
window.addEventListener('resize', resize);
// Initial delay to ensure size is correct on mobile load
setTimeout(resize, 100);

// Input Handlers
function handleOrientation(event) {
    if (input.useFallback) return;
    // Some browsers return null
    if (event.gamma === null || event.beta === null) return;
    input.gamma = event.gamma;
    input.beta = event.beta;
}

function initFallback() {
    input.useFallback = true;
    fallbackControls.style.display = 'flex';

    const btns = document.querySelectorAll('.dpad-btn');
    btns.forEach(btn => {
        const dir = btn.dataset.dir;
        const start = (e) => { e.preventDefault(); input.keys[dir] = true; };
        const end = (e) => { e.preventDefault(); input.keys[dir] = false; };
        btn.addEventListener('touchstart', start, {passive: false});
        btn.addEventListener('touchend', end, {passive: false});
        btn.addEventListener('mousedown', start);
        btn.addEventListener('mouseup', end);
        btn.addEventListener('mouseleave', end);
    });

    // Keyboard support
    window.addEventListener('keydown', e => {
        if(e.key === 'ArrowUp') input.keys.up = true;
        if(e.key === 'ArrowDown') input.keys.down = true;
        if(e.key === 'ArrowLeft') input.keys.left = true;
        if(e.key === 'ArrowRight') input.keys.right = true;
    });
    window.addEventListener('keyup', e => {
        if(e.key === 'ArrowUp') input.keys.up = false;
        if(e.key === 'ArrowDown') input.keys.down = false;
        if(e.key === 'ArrowLeft') input.keys.left = false;
        if(e.key === 'ArrowRight') input.keys.right = false;
    });
}

// Start Game Flow
startBtn.addEventListener('click', () => {
    // Check if iOS
    if (typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function') {
        DeviceOrientationEvent.requestPermission()
            .then(permissionState => {
                if (permissionState === 'granted') {
                    window.addEventListener('deviceorientation', handleOrientation);
                    startGame();
                } else {
                    alert("センサー許可が拒否されました。ボタンモードで開始します。");
                    initFallback();
                    startGame();
                }
            })
            .catch(e => {
                console.error(e);
                initFallback();
                startGame();
            });
    } else {
        // Non-iOS or Android Chrome
        if (window.DeviceOrientationEvent) {
             window.addEventListener('deviceorientation', handleOrientation);
        }
        startGame();

        // Sensor check watchdog
        setTimeout(() => {
            // If after 1 second, values are still exactly 0, prompts user or just enables buttons
            if (input.gamma === 0 && input.beta === 0) {
                 // Don't auto-switch force, but show controls just in case?
                 // Let's rely on the user choosing button mode if it doesn't work,
                 // or we can auto-show them.
                 // For now, let's auto-enable fallback if we suspect it failed.
                 // initFallback();
            }
        }, 1000);
    }
});

btnModeBtn.addEventListener('click', () => {
    initFallback();
    startGame();
});


function resetGame() {
    player.x = 180;
    player.y = 580;
    player.vx = 0;
    player.vy = 0;
    player.state = 'STAND';
    player.dizzyGauge = 0;
    player.angle = 0;
    timeElapsed = 0;
    particles = [];
    dizzyPopup.style.display = 'none';
    dizzyPopupTimer = 0;

    // Clear keys
    input.keys = { up: false, down: false, left: false, right: false };
}

function startGame() {
    startScreen.style.display = 'none';
    gameOverScreen.style.display = 'none';
    resize(); // Force resize on start
    resetGame();
    gameState = 'PLAY';
    lastTime = performance.now();
    requestAnimationFrame(loop);
}

restartBtn.addEventListener('click', () => {
    resetGame();
    gameState = 'PLAY';
});
goRestartBtn.addEventListener('click', () => {
    startGame();
});

// Physics Helpers
function clamp(val, min, max) {
    return Math.min(Math.max(val, min), max);
}

// Collisions
function checkRectCollision(px, py, rect) {
    let cx = clamp(px, rect.x, rect.x + rect.w);
    let cy = clamp(py, rect.y, rect.y + rect.h);

    let dx = px - cx;
    let dy = py - cy;
    let dist = Math.hypot(dx, dy);

    if (dist < player.r) {
        let nx = dx / dist;
        let ny = dy / dist;
        if (dist === 0) { nx = 0; ny = -1; }
        let pen = player.r - dist;
        return { collision: true, nx, ny, pen };
    }
    return { collision: false };
}

function resolveCollisions() {
    // Outer walls
    if (player.x < player.r) {
        player.x = player.r;
        player.vx = Math.abs(player.vx) * 0.65;
    }
    if (player.x > WIDTH - player.r) {
        player.x = WIDTH - player.r;
        player.vx = -Math.abs(player.vx) * 0.65;
    }
    if (player.y < HUD_H + player.r) {
        player.y = HUD_H + player.r;
        player.vy = Math.abs(player.vy) * 0.65;
    }
    if (player.y > HEIGHT - player.r) {
        player.y = HEIGHT - player.r;
        player.vy = -Math.abs(player.vy) * 0.65;
    }

    // Obstacles
    rectWalls.forEach(w => {
        let res = checkRectCollision(player.x, player.y, w);
        if (res.collision) {
            player.x += res.nx * res.pen;
            player.y += res.ny * res.pen;

            let vn = player.vx * res.nx + player.vy * res.ny;

            if (vn < 0) {
                let vnx = vn * res.nx;
                let vny = vn * res.ny;
                let vtx = player.vx - vnx;
                let vty = player.vy - vny;

                let vn_new = -vn * 0.65;
                let vt_scale = 0.95;

                player.vx = vtx * vt_scale + res.nx * vn_new;
                player.vy = vty * vt_scale + res.ny * vn_new;
            }
        }
    });
}

function spawnParticle(x, y, type) {
    particles.push({
        x: x + (Math.random()-0.5)*20,
        y: y + (Math.random()-0.5)*20,
        vx: (Math.random()-0.5)*30,
        vy: (Math.random()-0.5)*30,
        life: 1.0,
        type: type
    });
}

// Main Loop
function loop(timestamp) {
    if (gameState !== 'PLAY') return;

    let dt = (timestamp - lastTime) / 1000;
    lastTime = timestamp;
    if (dt > 0.033) dt = 0.033;

    timeElapsed += dt;

    // --- Input Processing ---
    let ax = 0, ay = 0;
    if (input.useFallback) {
        if (input.keys.left) ax -= 1;
        if (input.keys.right) ax += 1;
        if (input.keys.up) ay -= 1;
        if (input.keys.down) ay += 1;

        if (ax !== 0 && ay !== 0) {
            ax *= 0.707;
            ay *= 0.707;
        }
        ax *= ACCEL;
        ay *= ACCEL;
    } else {
        ax = clamp(input.gamma, -45, 45) / 45 * ACCEL;
        ay = clamp(input.beta, -45, 45) / 45 * ACCEL;
    }

    if (player.state === 'DIZZY') {
        ax *= 0.4;
        ay *= 0.4;
    }

    // --- Physics ---
    player.vx += ax * dt;
    player.vy += ay * dt;

    let speed = Math.hypot(player.vx, player.vy);

    let fric = (player.state === 'DIZZY') ? FRICTION_DIZZY : FRICTION;
    let fFactor = Math.pow(fric, dt * 60);
    player.vx *= fFactor;
    player.vy *= fFactor;

    speed = Math.hypot(player.vx, player.vy);
    if (speed > MAX_SPEED) {
        let scale = MAX_SPEED / speed;
        player.vx *= scale;
        player.vy *= scale;
        speed = MAX_SPEED;
    }

    player.x += player.vx * dt;
    player.y += player.vy * dt;

    resolveCollisions();

    // --- Zones Check ---
    let cx = player.x;
    let cy = player.y;

    player.onCool = false;
    for (let z of coolZones) {
        if (cx > z.x && cx < z.x+z.w && cy > z.y && cy < z.y+z.h) {
            player.onCool = true;
            if (Math.random() < 0.3) spawnParticle(cx, cy, 'cool');
            break;
        }
    }

    player.onRough = false;
    for (let z of roughZones) {
        if (cx > z.x && cx < z.x+z.w && cy > z.y && cy < z.y+z.h) {
            player.onRough = true;
            if (speed > STOP_SPEED && Math.random() < 0.3) spawnParticle(cx, cy, 'rough');
            break;
        }
    }

    // --- Dizzy Logic ---
    let tiltStrength = (Math.abs(ax) + Math.abs(ay)); // ax,ay already scaled
    let isRunning = speed > STOP_SPEED;

    if (player.onCool) {
        player.dizzyGauge -= COOL_DECAY_RUN * dt;
    } else if (isRunning) {
        player.dizzyGauge -= DECAY_NORMAL_RUN * dt;
    }

    if (isRunning && tiltStrength > TILT_TH) {
        let mult = player.onRough ? GAIN_ROUGH_MULT : 1;
        player.dizzyGauge += GAIN_BASE * dt * mult;
    }

    if (!isRunning) {
        player.dizzyGauge -= DECAY_STOP * dt;
    }

    player.dizzyGauge = clamp(player.dizzyGauge, 0, 100);

    // State Transitions
    if (player.state === 'DIZZY') {
        if (player.dizzyGauge <= 35) {
            player.state = speed >= ROLL_SPEED ? 'ROLL' : 'STAND';
        }
    } else {
        if (player.dizzyGauge >= 100) {
            player.state = 'DIZZY';
            dizzyPopup.style.display = 'block';
            dizzyPopupTimer = 1.0;
            setTimeout(() => { dizzyPopup.style.display = 'none'; }, 1000);
        } else {
            player.state = speed >= ROLL_SPEED ? 'ROLL' : 'STAND';
        }
    }

    if (player.state === 'ROLL') {
        player.angle += speed * dt * 0.03;
    }

    // Goal Check
    let distGoal = Math.hypot(player.x - goal.x, player.y - goal.y);
    if (distGoal < player.r + goal.r) {
        gameClear();
        return;
    }

    draw();
    updateHUD();

    requestAnimationFrame(loop);
}

function gameClear() {
    gameState = 'OVER';
    gameOverScreen.style.display = 'flex';
    document.getElementById('go-time').textContent = 'Time: ' + timeElapsed.toFixed(2) + 's';

    for(let i=0; i<100; i++) {
        spawnParticle(goal.x, goal.y, 'confetti');
    }
    draw();
}

function draw() {
    ctx.clearRect(0, 0, WIDTH, HEIGHT);

    // Map
    ctx.fillStyle = '#9fe';
    coolZones.forEach(z => ctx.fillRect(z.x, z.y, z.w, z.h));

    ctx.fillStyle = '#dcb';
    roughZones.forEach(z => ctx.fillRect(z.x, z.y, z.w, z.h));

    // Goal
    ctx.fillStyle = '#fd0';
    ctx.beginPath();
    ctx.arc(goal.x, goal.y, goal.r, 0, Math.PI*2);
    ctx.fill();
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.fillStyle = '#000';
    ctx.font = 'bold 12px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('GOAL', goal.x, goal.y);

    // Walls
    ctx.fillStyle = '#666';
    ctx.strokeStyle = '#444';
    ctx.lineWidth = 1;
    rectWalls.forEach(w => {
        ctx.fillRect(w.x, w.y, w.w, w.h);
        ctx.strokeRect(w.x, w.y, w.w, w.h);
    });

    // Player
    ctx.save();
    let drawX = player.x;
    let drawY = player.y;

    if (player.state === 'DIZZY') {
        drawX += Math.sin(Date.now() / 20) * 2;
        drawY += Math.cos(Date.now() / 20) * 2;
    }

    ctx.translate(drawX, drawY);
    ctx.rotate(player.angle);

    // Body
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(0, 0, player.r, 0, Math.PI*2);
    ctx.fill();
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 2;
    ctx.stroke();

    if (player.state === 'ROLL') {
        ctx.fillStyle = '#000';
        ctx.beginPath(); ctx.arc(6, -4, 2, 0, Math.PI*2); ctx.fill();
        ctx.beginPath(); ctx.arc(-6, -4, 2, 0, Math.PI*2); ctx.fill();
        ctx.beginPath(); ctx.arc(0, 2, 1, 0, Math.PI*2); ctx.fill();

        ctx.beginPath();
        ctx.moveTo(-10, 8);
        ctx.quadraticCurveTo(-18, 12, -12, 16);
        ctx.stroke();
    } else if (player.state === 'DIZZY') {
        ctx.strokeStyle = '#000';
        ctx.lineWidth = 1;
        ctx.beginPath();
        for(let i=0; i<10; i++) {
             let a = i/2; let r = i/2;
             ctx.lineTo(-6 + Math.cos(a)*r, -4 + Math.sin(a)*r);
        }
        ctx.stroke();
        ctx.beginPath();
        for(let i=0; i<10; i++) {
             let a = i/2; let r = i/2;
             ctx.lineTo(6 + Math.cos(a)*r, -4 + Math.sin(a)*r);
        }
        ctx.stroke();

        ctx.beginPath();
        ctx.moveTo(-4, 4);
        ctx.lineTo(0, 2);
        ctx.lineTo(4, 4);
        ctx.stroke();
    } else {
        ctx.rotate(-player.angle);

        ctx.fillStyle = '#fff';
        ctx.strokeStyle = '#000';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(-10, -10); ctx.lineTo(-14, -22); ctx.lineTo(-4, -14);
        ctx.fill(); ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(10, -10); ctx.lineTo(14, -22); ctx.lineTo(4, -14);
        ctx.fill(); ctx.stroke();

        ctx.beginPath(); ctx.arc(0, 0, player.r, 0, Math.PI*2); ctx.fill(); ctx.stroke();

        ctx.fillStyle = '#000';
        ctx.beginPath(); ctx.arc(5, -3, 2, 0, Math.PI*2); ctx.fill();
        ctx.beginPath(); ctx.arc(-5, -3, 2, 0, Math.PI*2); ctx.fill();

        ctx.fillStyle = '#f88';
        ctx.beginPath(); ctx.arc(9, 2, 3, 0, Math.PI*2); ctx.fill();
        ctx.beginPath(); ctx.arc(-9, 2, 3, 0, Math.PI*2); ctx.fill();

        ctx.strokeStyle = '#000';
        ctx.lineWidth = 1;
        ctx.beginPath(); ctx.arc(0, 2, 3, 0, Math.PI, false); ctx.stroke();
    }

    ctx.restore();

    // Particles
    updateAndDrawParticles();
}

function updateAndDrawParticles() {
    for (let i = particles.length - 1; i >= 0; i--) {
        let p = particles[i];
        p.life -= 0.02;
        p.x += p.vx * 0.1;
        p.y += p.vy * 0.1;

        if (p.life <= 0) {
            particles.splice(i, 1);
            continue;
        }

        ctx.globalAlpha = p.life;
        if (p.type === 'cool') {
            ctx.fillStyle = '#fff';
            ctx.beginPath(); ctx.arc(p.x, p.y, 2, 0, Math.PI*2); ctx.fill();
        } else if (p.type === 'rough') {
            ctx.fillStyle = '#8b4513';
            ctx.fillRect(p.x, p.y, 3, 3);
        } else if (p.type === 'confetti') {
            ctx.fillStyle = `hsl(${Math.random()*360}, 100%, 50%)`;
            ctx.fillRect(p.x, p.y, 5, 5);
        }
        ctx.globalAlpha = 1.0;
    }
}

function updateHUD() {
    timeDisplay.textContent = 'TIME: ' + timeElapsed.toFixed(2);
    stateDisplay.textContent = player.state;
    if (player.state === 'DIZZY') stateDisplay.style.color = 'red';
    else if (player.state === 'ROLL') stateDisplay.style.color = '#00ff00';
    else stateDisplay.style.color = 'white';

    dizzyBarFill.style.width = player.dizzyGauge + '%';
    if (player.dizzyGauge > 80) dizzyBarFill.style.background = '#ff3333';
    else if (player.dizzyGauge > 50) dizzyBarFill.style.background = '#ffff33';
    else dizzyBarFill.style.background = '#33ff33';
}
