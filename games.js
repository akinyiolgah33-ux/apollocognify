
let gameInstance = null;
let gameModal = null;
let currentKeydownHandler = null;
let currentAnimationFrameId = null;

function formatGameTimer(seconds) {
    const safeSeconds = Math.max(0, Math.floor(seconds));
    const mins = Math.floor(safeSeconds / 60).toString().padStart(2, '0');
    const secs = (safeSeconds % 60).toString().padStart(2, '0');
    return `${mins}:${secs}`;
}

function getConfiguredGameDurationSeconds() {
    const select = document.getElementById('game-duration-select');
    const selectedMinutes = Number.parseInt(select?.value || '', 10);
    const storedMinutes = Number.parseInt(localStorage.getItem('cognify-game-duration-minutes') || '15', 10);
    const minutes = Number.isFinite(selectedMinutes) && selectedMinutes > 0
        ? selectedMinutes
        : (Number.isFinite(storedMinutes) && storedMinutes > 0 ? storedMinutes : 15);

    if (select && select.value !== String(minutes)) {
        select.value = String(minutes);
    }
    localStorage.setItem('cognify-game-duration-minutes', String(minutes));
    return minutes * 60;
}

function updateGameTimerDisplays(seconds) {
    const timerText = formatGameTimer(seconds);
    const modalTimer = document.getElementById('game-time-left');
    const inlineTimer = document.getElementById('game-timer-display');
    if (modalTimer) modalTimer.textContent = timerText;
    if (inlineTimer) inlineTimer.textContent = timerText;
}

function startGameTimer(durationSeconds) {
    if (window.currentGameTimer) {
        clearInterval(window.currentGameTimer);
        window.currentGameTimer = null;
    }

    const endTime = Date.now() + durationSeconds * 1000;
    updateGameTimerDisplays(durationSeconds);

    window.currentGameTimer = setInterval(() => {
        const remainingSeconds = Math.max(0, Math.ceil((endTime - Date.now()) / 1000));
        updateGameTimerDisplays(remainingSeconds);

        if (remainingSeconds <= 0) {
            clearInterval(window.currentGameTimer);
            window.currentGameTimer = null;
            if (typeof closeGame === 'function') closeGame();
        }
    }, 1000);
}

document.addEventListener('change', (event) => {
    if (event.target?.id === 'game-duration-select') {
        updateGameTimerDisplays(getConfiguredGameDurationSeconds());
    }
});

function start3DGame(type, targetContainer, options = {}) {
    const inline = options.inline === true;
    gameModal = document.getElementById('game-modal');
    const container = targetContainer || document.getElementById('game-container');
    if (!container) return;

    if (inline) {
        if (gameModal) gameModal.style.display = 'none';
    } else if (gameModal) {
        gameModal.style.display = 'flex';
    }

    container.innerHTML = '';

    const durationSeconds = getConfiguredGameDurationSeconds();
    startGameTimer(durationSeconds);

    const onResize = () => {
        if (!container.isConnected) return;
        const canvas = container.querySelector('canvas');
        if (canvas && gameInstance?.renderer) {
            const w = container.clientWidth;
            const h = container.clientHeight;
            gameInstance.renderer.setSize(w, h);
            if (gameInstance.camera) {
                gameInstance.camera.aspect = w / h;
                gameInstance.camera.updateProjectionMatrix();
            }
        }
    };
    window.removeEventListener('resize', window._cognifyGameResize);
    window._cognifyGameResize = onResize;
    window.addEventListener('resize', onResize);

    if (type === 'snake') initSnake(container);
    else if (type === 'stickman') initStickman(container);

    setTimeout(onResize, 100);
}

function closeGame() {
    const stage = document.getElementById('passtime-game-stage');
    if (stage) stage.innerHTML = '';

    if (gameModal) {
        gameModal.style.display = 'none';
    } else {
        const m = document.getElementById('game-modal');
        if (m) m.style.display = 'none';
    }

    if (window.currentGameTimer) {
        clearInterval(window.currentGameTimer);
        window.currentGameTimer = null;
    }
    if (currentAnimationFrameId) {
        cancelAnimationFrame(currentAnimationFrameId);
        currentAnimationFrameId = null;
    }
    if (currentKeydownHandler) {
        window.removeEventListener('keydown', currentKeydownHandler);
        window.removeEventListener('keyup', currentKeydownHandler);
        currentKeydownHandler = null;
    }
    if (gameInstance) {
        if (typeof gameInstance.destroy === 'function') {
            gameInstance.destroy();
        }
        gameInstance = null;
    }
    if (stage && !stage.innerHTML.trim()) {
        stage.innerHTML = '<div class="game-stage-placeholder">Choose a game to start here in the panel, or open it fullscreen.</div>';
    }
}

// --- Snake Logic ---
function initSnake(container) {
    container.innerHTML = '';
    const canvas = document.createElement('canvas');
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    // Set logical resolution
    canvas.width = 800;
    canvas.height = 600;
    
    // Fit canvas dynamically
    const updateSize = () => {
        const aspect = 800 / 600;
        const rect = container.getBoundingClientRect();
        const containerAspect = rect.width / rect.height;
        if (containerAspect > aspect) {
            canvas.style.width = (rect.height * aspect) + 'px';
            canvas.style.height = rect.height + 'px';
        } else {
            canvas.style.width = rect.width + 'px';
            canvas.style.height = (rect.width / aspect) + 'px';
        }
    };
    window.addEventListener('resize', updateSize);
    setTimeout(updateSize, 0);

    container.appendChild(canvas);
    container.style.display = 'flex';
    container.style.justifyContent = 'center';
    container.style.alignItems = 'center';
    container.style.background = '#000';

    const ctx = canvas.getContext('2d');

    const NEON_COLORS = [
        '#00ffff', // Electric blue
        '#ff00ff', // Hot pink
        '#00ff00', // Lime green
        '#ffa500'  // Fiery orange
    ];

    let snake_pos = [100, 50];
    let snake_body = [[100, 50], [90, 50], [80, 50]];
    let snake_direction = 'RIGHT';
    let change_to = snake_direction;
    let score = 0;
    let speed = 15; // 15 frames per second

    let food_pos = [
        Math.floor(Math.random() * (canvas.width / 10)) * 10,
        Math.floor(Math.random() * (canvas.height / 10)) * 10
    ];
    let food_spawn = true;
    let running = true;
    
    let lastTime = performance.now();
    let frameInterval = 1000 / speed;
    let raf = null;
    let scoreColor = NEON_COLORS[Math.floor(Math.random() * NEON_COLORS.length)];

    function keydown(e) {
        if (e.code === 'ArrowUp' || e.code === 'KeyW') change_to = 'UP';
        if (e.code === 'ArrowDown' || e.code === 'KeyS') change_to = 'DOWN';
        if (e.code === 'ArrowLeft' || e.code === 'KeyA') change_to = 'LEFT';
        if (e.code === 'ArrowRight' || e.code === 'KeyD') change_to = 'RIGHT';
    }
    
    // We bind directly and unbind on destroy, as requested
    currentKeydownHandler = keydown;
    window.addEventListener('keydown', currentKeydownHandler);

    function gameOver() {
        running = false;
        ctx.fillStyle = 'red';
        ctx.font = 'bold 48px Arial';
        ctx.textAlign = 'center';
        ctx.fillText('GAME OVER', canvas.width / 2, canvas.height / 2);
    }

    function loop(t) {
        if (!running) return;
        raf = requestAnimationFrame(loop);

        if (t - lastTime < frameInterval) return;
        lastTime = t;

        if (change_to === 'UP' && snake_direction !== 'DOWN') snake_direction = 'UP';
        if (change_to === 'DOWN' && snake_direction !== 'UP') snake_direction = 'DOWN';
        if (change_to === 'LEFT' && snake_direction !== 'RIGHT') snake_direction = 'LEFT';
        if (change_to === 'RIGHT' && snake_direction !== 'LEFT') snake_direction = 'RIGHT';

        if (snake_direction === 'UP') snake_pos[1] -= 10;
        if (snake_direction === 'DOWN') snake_pos[1] += 10;
        if (snake_direction === 'LEFT') snake_pos[0] -= 10;
        if (snake_direction === 'RIGHT') snake_pos[0] += 10;

        snake_body.unshift([...snake_pos]);

        if (snake_pos[0] === food_pos[0] && snake_pos[1] === food_pos[1]) {
            score += 10;
            if (typeof window._onSnakeLengthUpdate === 'function') {
                window._onSnakeLengthUpdate(score);
            }
            food_spawn = false;
            scoreColor = NEON_COLORS[Math.floor(Math.random() * NEON_COLORS.length)];
        } else {
            snake_body.pop();
        }

        if (!food_spawn) {
            food_pos = [
                Math.floor(Math.random() * (canvas.width / 10)) * 10,
                Math.floor(Math.random() * (canvas.height / 10)) * 10
            ];
            food_spawn = true;
        }

        ctx.fillStyle = '#000';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        for (let i = 0; i < snake_body.length; i++) {
            let pos = snake_body[i];
            ctx.fillStyle = '#00ff00';
            ctx.fillRect(pos[0], pos[1], 10, 10);
            
            if (i === 0) {
                // Eyes (White)
                ctx.fillStyle = '#fff';
                let ex1, ey1, ex2, ey2;
                // Mouth (Black)
                let mx, my, mw, mh;
                // Tongue (Red)
                let tx, ty, tw, th;
                let fx1, fy1, fx2, fy2; // Fork of the tongue

                if (snake_direction === 'RIGHT') {
                    ex1 = pos[0]+5; ey1 = pos[1]+2; ex2 = pos[0]+5; ey2 = pos[1]+6;
                    mx = pos[0]+8; my = pos[1]+2; mw = 2; mh = 6;
                    tx = pos[0]+10; ty = pos[1]+4; tw = 3; th = 2;
                    fx1 = tx+3; fy1 = ty-1; fx2 = tx+3; fy2 = ty+1;
                } else if (snake_direction === 'LEFT') {
                    ex1 = pos[0]+3; ey1 = pos[1]+2; ex2 = pos[0]+3; ey2 = pos[1]+6;
                    mx = pos[0]; my = pos[1]+2; mw = 2; mh = 6;
                    tx = pos[0]-3; ty = pos[1]+4; tw = 3; th = 2;
                    fx1 = tx-1; fy1 = ty-1; fx2 = tx-1; fy2 = ty+1;
                } else if (snake_direction === 'UP') {
                    ex1 = pos[0]+2; ey1 = pos[1]+3; ex2 = pos[0]+6; ey2 = pos[1]+3;
                    mx = pos[0]+2; my = pos[1]; mw = 6; mh = 2;
                    tx = pos[0]+4; ty = pos[1]-3; tw = 2; th = 3;
                    fx1 = tx-1; fy1 = ty-1; fx2 = tx+1; fy2 = ty-1;
                } else if (snake_direction === 'DOWN') {
                    ex1 = pos[0]+2; ey1 = pos[1]+5; ex2 = pos[0]+6; ey2 = pos[1]+5;
                    mx = pos[0]+2; my = pos[1]+8; mw = 6; mh = 2;
                    tx = pos[0]+4; ty = pos[1]+10; tw = 2; th = 3;
                    fx1 = tx-1; fy1 = ty+3; fx2 = tx+1; fy2 = ty+3;
                }

                ctx.fillRect(ex1, ey1, 2, 2);
                ctx.fillRect(ex2, ey2, 2, 2);
                
                ctx.fillStyle = '#000';
                ctx.fillRect(ex1, ey1, 1, 1); // pupils
                ctx.fillRect(ex2, ey2, 1, 1);
                ctx.fillRect(mx, my, mw, mh); // mouth
                
                ctx.fillStyle = '#ff0000';
                ctx.fillRect(tx, ty, tw, th); // tongue base
                ctx.fillRect(fx1, fy1, 2, 2); // tongue fork 1
                ctx.fillRect(fx2, fy2, 2, 2); // tongue fork 2
            }
        }

        ctx.fillStyle = '#ff0000';
        ctx.fillRect(food_pos[0], food_pos[1], 10, 10);

        if (snake_pos[0] < 0 || snake_pos[0] >= canvas.width) gameOver();
        if (snake_pos[1] < 0 || snake_pos[1] >= canvas.height) gameOver();

        for (let i = 1; i < snake_body.length; i++) {
            if (snake_pos[0] === snake_body[i][0] && snake_pos[1] === snake_body[i][1]) {
                gameOver();
            }
        }

        ctx.fillStyle = scoreColor;
        ctx.font = 'bold 24px Arial';
        ctx.textAlign = 'left';
        ctx.fillText(`Score: ${score}`, 10, 30);
    }

    raf = requestAnimationFrame(loop);

    gameInstance = {
        destroy: () => {
            running = false;
            cancelAnimationFrame(raf);
            window.removeEventListener('keydown', currentKeydownHandler);
            window.removeEventListener('resize', updateSize);
            currentKeydownHandler = null;
        }
    };
}

// --- 3D Cube Match Logic ---
function initStickman(container) {
    // 2D Canvas stickman duel — lightweight, responsive, and arcade-style
    container.innerHTML = '';
    const canvas = document.createElement('canvas');
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    canvas.width = Math.max(600, container.clientWidth);
    canvas.height = Math.max(360, container.clientHeight);
    container.appendChild(canvas);

    const ctx = canvas.getContext('2d');

    let last = performance.now();
    let raf = null;
    let running = true;

    function resize() {
        canvas.width = container.clientWidth;
        canvas.height = container.clientHeight;
    }
    window.addEventListener('resize', resize);

    // Simple physics-ish entities
    function makePlayer(x, y, color) {
        return {
            x, y, vx: 0, vy: 0, w: 28, h: 60,
            dir: 1, onGround: false, color,
            punchTimer: 0, punchReach: 36, health: 100,
            isAI: false
        };
    }

    const player = makePlayer(120, canvas.height - 120, '#0b6623');
    const enemy = makePlayer(canvas.width - 160, canvas.height - 120, '#222222');
    enemy.isAI = true;

    // Controls
    const keys = { left: false, right: false, up: false, punch: false };
    // Expose simple API for virtual on-screen controls
    window.setGameKey = function(k, v) { if (keys.hasOwnProperty(k)) keys[k] = !!v; };
    function keyHandler(e, down) {
        const set = (k, v) => { keys[k] = v; };
        if (e.code === 'ArrowLeft') set('left', down);
        if (e.code === 'ArrowRight') set('right', down);
        if (e.code === 'ArrowUp' || e.code === 'Space') set('up', down);
        if (e.code === 'KeyX') set('punch', down);
    }
    currentKeydownHandler = (e) => { if (e.type === 'keydown') keyHandler(e, true); else keyHandler(e, false); };
    window.addEventListener('keydown', currentKeydownHandler);
    window.addEventListener('keyup', currentKeydownHandler);

    // Helper drawing
    function drawStickman(ctx, ent) {
        const cx = ent.x, cy = ent.y;
        ctx.save();
        ctx.translate(cx, cy);
        ctx.scale(ent.dir, 1);

        // legs
        ctx.strokeStyle = ent.color; ctx.lineWidth = 4; ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(-6, 28); ctx.lineTo(0, 10); ctx.lineTo(6, 28); ctx.stroke();
        // body
        ctx.beginPath(); ctx.moveTo(0, 10); ctx.lineTo(0, -18); ctx.stroke();
        // head
        ctx.beginPath(); ctx.arc(0, -30, 10, 0, Math.PI * 2); ctx.fillStyle = ent.color; ctx.fill();
        // arm (simple punch animation)
        const punchProgress = Math.max(0, 1 - ent.punchTimer / 220);
        const armX = 10 + ent.punchReach * punchProgress;
        ctx.beginPath(); ctx.moveTo(0, -8); ctx.lineTo(armX, -8); ctx.stroke();

        // health bar
        ctx.fillStyle = '#222'; ctx.fillRect(-20, -48, 40, 6);
        ctx.fillStyle = ent.color; ctx.fillRect(-20, -48, 40 * (Math.max(0, ent.health) / 100), 6);

        ctx.restore();
    }

    function detectPunch(attacker, target) {
        if (attacker.punchTimer > 0) return false;
        const reach = attacker.punchReach * 0.9;
        const dx = (target.x - attacker.x) * attacker.dir;
        // target in front and close
        return dx > 0 && dx < reach && Math.abs(target.y - attacker.y) < 40;
    }

    // Basic AI for enemy: approach and punch occasionally
    let aiTimer = 0;

    function update(dt) {
        // gravity
        [player, enemy].forEach(ent => {
            ent.vy += 1200 * dt;
            ent.x += ent.vx * dt;
            ent.y += ent.vy * dt;
            // floor collision
            const floorY = canvas.height - 60;
            if (ent.y > floorY) { ent.y = floorY; ent.vy = 0; ent.onGround = true; } else ent.onGround = false;
            // friction
            ent.vx *= 0.88;
            // bound
            if (ent.x < 40) ent.x = 40;
            if (ent.x > canvas.width - 40) ent.x = canvas.width - 40;
        });

        // Player input
        const speed = 180;
        if (keys.left) { player.vx = -speed; player.dir = -1; }
        if (keys.right) { player.vx = speed; player.dir = 1; }
        if (!keys.left && !keys.right) player.vx *= 0.9;
        if (keys.up && player.onGround) { player.vy = -420; player.onGround = false; }
        if (keys.punch && player.punchTimer <= 0) { player.punchTimer = 220; }

        // Enemy AI
        aiTimer -= dt * 1000;
        if (aiTimer <= 0) {
            aiTimer = 500 + Math.random() * 1000;
            const dirToPlayer = player.x < enemy.x ? -1 : 1;
            enemy.dir = dirToPlayer;
            // decide action
            const dist = Math.abs(player.x - enemy.x);
            if (dist > 120) { enemy.vx = (player.x < enemy.x) ? -140 : 140; }
            else { enemy.vx = 0; if (Math.random() < 0.6) enemy.punchTimer = 220; if (Math.random() < 0.2 && enemy.onGround) enemy.vy = -380; }
        }

        // Punch timers and damage
        [player, enemy].forEach(att => {
            if (att.punchTimer > 0) {
                att.punchTimer -= dt * 1000;
                // at moment of punch apply damage
                if (att.punchTimer > 80 && att.punchTimer < 120) {
                    const target = (att === player) ? enemy : player;
                    const dx = Math.abs(target.x - att.x);
                    if (dx < att.punchReach) {
                        target.health -= 8 + Math.floor(Math.random() * 6);
                        target.vx += (att.dir) * 80; // knockback
                    }
                }
            }
        });

        // Simple win condition — fire hook once when player wins
        if (running && (player.health <= 0 || enemy.health <= 0)) {
            running = false;
            if (enemy.health <= 0 && typeof window._onStickmanWin === 'function') {
                window._onStickmanWin();
            }
        }
    }

    function render() {
        // background
        ctx.fillStyle = '#9be39b';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        // ground
        ctx.fillStyle = '#4b8b3b';
        ctx.fillRect(0, canvas.height - 60, canvas.width, 60);

        // decorative trees (simple)
        for (let i = 0; i < 6; i++) {
            ctx.fillStyle = '#2e7d32';
            const tx = (i * 200 + 40) % canvas.width;
            ctx.beginPath(); ctx.moveTo(tx, canvas.height - 60); ctx.lineTo(tx - 40, canvas.height - 120); ctx.lineTo(tx + 40, canvas.height - 120); ctx.closePath(); ctx.fill();
        }

        // draw entities
        drawStickman(ctx, player);
        drawStickman(ctx, enemy);

        // HUD
        ctx.fillStyle = '#111'; ctx.font = '16px Arial'; ctx.fillText('You', 14, 20); ctx.fillText('Enemy', canvas.width - 70, 20);
        ctx.fillStyle = player.color; ctx.fillRect(14, 26, 120 * (player.health / 100), 8);
        ctx.fillStyle = enemy.color; ctx.fillRect(canvas.width - 150, 26, 120 * (enemy.health / 100), 8);

        if (!running) {
            ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(0, 0, canvas.width, canvas.height);
            ctx.fillStyle = '#fff'; ctx.font = '36px Arial'; ctx.textAlign = 'center';
            const msg = (player.health <= 0) ? 'You Lost' : 'You Win!';
            ctx.fillText(msg, canvas.width / 2, canvas.height / 2 - 10);
            ctx.font = '18px Arial'; ctx.fillText('Press R to Restart', canvas.width / 2, canvas.height / 2 + 24);
        }
    }

    function loop(t) {
        const dt = Math.min(0.05, (t - last) / 1000);
        last = t;
        if (running) update(dt);
        render();
        raf = requestAnimationFrame(loop);
    }

    // Restart support
    function restart() {
        player.x = 120; player.y = canvas.height - 120; player.vx = player.vy = 0; player.health = 100;
        enemy.x = canvas.width - 160; enemy.y = canvas.height - 120; enemy.vx = enemy.vy = 0; enemy.health = 100;
        running = true; last = performance.now();
    }

    window.addEventListener('keydown', function onR(e) { if (e.code === 'KeyR') restart(); });

    // Pause/cleanup hook
    gameInstance = {
        destroy: () => {
            running = false;
            cancelAnimationFrame(raf);
            window.removeEventListener('resize', resize);
            window.removeEventListener('keydown', currentKeydownHandler);
            try { delete window.setGameKey; } catch(e) { window.setGameKey = undefined; }
        }
    };

    // start loop
    last = performance.now();
    raf = requestAnimationFrame(loop);
}
