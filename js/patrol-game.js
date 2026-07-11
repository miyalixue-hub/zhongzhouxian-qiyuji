/**
 * patrol-game.js - 3D模型生成等待小游戏：神兽巡桥
 * 独立等待互动模块，不修改 Meshy API 调用或轮询逻辑。
 */
(function() {
    var canvas, ctx, wrap, root, overlay;
    var scoreEl, timeEl, heartsEl, titleEl, copyEl;
    var startBtn, pauseBtn, restartBtn;
    var W = 320, H = 360;
    var player = { x: W / 2, y: H - 48, r: 14, targetX: W / 2 };
    var items = [];
    var effects = [];
    var keys = { left: false, right: false };
    var score = 0;
    var hearts = 3;
    var timeLeft = 30;
    var elapsed = 0;
    var spawnTimer = 0;
    var running = false;
    var paused = false;
    var visible = false;
    var lastTime = 0;

    var itemTypes = [
        { kind: 'water', color: '#4a7fb5', value: 10, bad: false, weight: 0.42 },
        { kind: 'cloud', color: '#ffffff', value: 20, bad: false, weight: 0.22 },
        { kind: 'gold', color: '#d4a843', value: 30, bad: false, weight: 0.16 },
        { kind: 'wave', color: '#2d2d2d', value: 0, bad: true, weight: 0.20 }
    ];

    function initPatrolGame() {
        root = document.getElementById('patrol-game');
        canvas = document.getElementById('patrol-canvas');
        wrap = document.getElementById('patrol-canvas-wrap');
        if (!root || !canvas || !wrap) return;

        ctx = canvas.getContext('2d');
        W = canvas.width;
        H = canvas.height;
        player.x = W / 2;
        player.y = H - 48;
        player.targetX = W / 2;

        overlay = document.getElementById('patrol-overlay');
        scoreEl = document.getElementById('patrol-score');
        timeEl = document.getElementById('patrol-time');
        heartsEl = document.getElementById('patrol-hearts');
        titleEl = document.getElementById('patrol-overlay-title');
        copyEl = document.getElementById('patrol-overlay-copy');
        startBtn = document.getElementById('patrol-start-btn');
        pauseBtn = document.getElementById('patrol-pause-btn');
        restartBtn = document.getElementById('patrol-restart-btn');

        if (startBtn) startBtn.addEventListener('click', resetGame);
        if (restartBtn) restartBtn.addEventListener('click', resetGame);
        if (pauseBtn) {
            pauseBtn.addEventListener('click', function() {
                if (!running) return;
                paused = !paused;
                pauseBtn.textContent = paused ? '继续' : '暂停';
            });
        }

        window.addEventListener('keydown', function(event) {
            if (event.key === 'ArrowLeft' || event.key === 'a') keys.left = true;
            if (event.key === 'ArrowRight' || event.key === 'd') keys.right = true;
        });
        window.addEventListener('keyup', function(event) {
            if (event.key === 'ArrowLeft' || event.key === 'a') keys.left = false;
            if (event.key === 'ArrowRight' || event.key === 'd') keys.right = false;
        });

        wrap.addEventListener('pointerdown', function(event) {
            if (!running) return;
            wrap.setPointerCapture(event.pointerId);
            player.targetX = pointerToCanvasX(event);
        });
        wrap.addEventListener('pointermove', function(event) {
            if (!running) return;
            player.targetX = pointerToCanvasX(event);
        });

        draw();
        updateStats();
        observeVisibility();
    }

    function observeVisibility() {
        syncVisibility();
        var page = document.getElementById('page-11');
        var printOptions = document.getElementById('print-options');
        var viewer = document.getElementById('model-viewer-3d');
        var observer = new MutationObserver(syncVisibility);
        if (page) observer.observe(page, { attributes: true, attributeFilter: ['class', 'style'] });
        if (printOptions) observer.observe(printOptions, { attributes: true, attributeFilter: ['style', 'class'] });
        if (viewer) observer.observe(viewer, { attributes: true, attributeFilter: ['class'] });
        window.addEventListener('hashchange', syncVisibility);
        setInterval(syncVisibility, 1200);
    }

    function syncVisibility() {
        if (!root) return;
        var page = document.getElementById('page-11');
        var printOptions = document.getElementById('print-options');
        var retryArea = document.getElementById('meshy-retry-area');
        var pageActive = !!(page && page.classList.contains('active'));
        var printVisible = !!(printOptions && getComputedStyle(printOptions).display !== 'none');
        var retryVisible = !!(retryArea && getComputedStyle(retryArea).display !== 'none');
        var shouldShow = pageActive && !printVisible && !retryVisible;

        root.style.display = shouldShow ? 'block' : 'none';
        visible = shouldShow;
        if (!visible) {
            paused = true;
            if (pauseBtn) pauseBtn.textContent = '继续';
        }
    }

    function pointerToCanvasX(event) {
        var rect = canvas.getBoundingClientRect();
        return ((event.clientX - rect.left) / rect.width) * W;
    }

    function resetGame() {
        score = 0;
        hearts = 3;
        timeLeft = 30;
        elapsed = 0;
        spawnTimer = 0;
        items.length = 0;
        effects.length = 0;
        player.x = W / 2;
        player.targetX = W / 2;
        running = true;
        paused = false;
        if (pauseBtn) pauseBtn.textContent = '暂停';
        if (overlay) overlay.classList.add('hidden');
        lastTime = performance.now();
        updateStats();
        requestAnimationFrame(loop);
    }

    function updateStats() {
        if (scoreEl) scoreEl.textContent = score;
        if (timeEl) timeEl.textContent = Math.max(0, Math.ceil(timeLeft));
        if (heartsEl) heartsEl.textContent = hearts;
    }

    function chooseType() {
        var roll = Math.random();
        var acc = 0;
        for (var i = 0; i < itemTypes.length; i++) {
            acc += itemTypes[i].weight;
            if (roll <= acc) return itemTypes[i];
        }
        return itemTypes[0];
    }

    function spawnItem() {
        var type = chooseType();
        items.push({
            kind: type.kind,
            color: type.color,
            value: type.value,
            bad: type.bad,
            x: 28 + Math.random() * (W - 56),
            y: -24,
            r: type.bad ? 17 : 15,
            vy: 85 + Math.random() * 72 + elapsed * 1.1,
            spin: Math.random() * Math.PI
        });
    }

    function loop(now) {
        if (!running) return;
        var dt = Math.min(0.033, (now - lastTime) / 1000 || 0);
        lastTime = now;

        if (!paused && visible) {
            elapsed += dt;
            timeLeft -= dt;
            spawnTimer -= dt;
            if (spawnTimer <= 0) {
                spawnItem();
                spawnTimer = Math.max(0.32, 0.78 - elapsed * 0.012);
            }
            update(dt);
        }

        draw();
        updateStats();

        if (timeLeft <= 0) {
            endGame('神兽继续守桥中', '本轮镇水值 ' + score + '，模型还没好就再巡一次。');
            return;
        }
        if (hearts <= 0) {
            endGame('桥下浊浪太急', '本轮镇水值 ' + score + '。调整一下节奏，再守一次桥。');
            return;
        }
        requestAnimationFrame(loop);
    }

    function update(dt) {
        if (keys.left) player.targetX -= 320 * dt;
        if (keys.right) player.targetX += 320 * dt;
        player.targetX = Math.max(18, Math.min(W - 18, player.targetX));
        player.x += (player.targetX - player.x) * Math.min(1, 15 * dt);

        for (var i = items.length - 1; i >= 0; i--) {
            var item = items[i];
            item.y += item.vy * dt;
            item.spin += dt * 3;
            var hit = Math.hypot(item.x - player.x, item.y - player.y) < item.r + player.r * 0.9;
            if (hit) {
                if (item.bad) {
                    hearts -= 1;
                    burst(item.x, item.y, '浊浪', '#2d2d2d', true);
                } else {
                    score += item.value;
                    burst(item.x, item.y, '+' + item.value, item.color, false);
                }
                items.splice(i, 1);
            } else if (item.y > H + 30) {
                items.splice(i, 1);
            }
        }
        updateEffects(dt);
    }

    function endGame(title, copy) {
        running = false;
        paused = false;
        if (titleEl) titleEl.textContent = title;
        if (copyEl) copyEl.textContent = copy;
        if (startBtn) startBtn.textContent = '再巡一次';
        if (overlay) overlay.classList.remove('hidden');
    }

    function burst(x, y, text, color, bad) {
        var sparks = [];
        var count = bad ? 5 : 9;
        for (var i = 0; i < count; i++) {
            sparks.push({ angle: (Math.PI * 2 * i) / count, speed: 22 + (i % 3) * 9 });
        }
        effects.push({ x: x, y: y, text: text, color: color, bad: bad, life: 0.72, maxLife: 0.72, sparks: sparks });
    }

    function updateEffects(dt) {
        for (var i = effects.length - 1; i >= 0; i--) {
            effects[i].life -= dt;
            effects[i].y -= dt * 24;
            if (effects[i].life <= 0) effects.splice(i, 1);
        }
    }

    function drawBackground() {
        var grad = ctx.createLinearGradient(0, 0, 0, H);
        grad.addColorStop(0, '#f9efd2');
        grad.addColorStop(0.55, '#ead7ab');
        grad.addColorStop(1, '#d4c092');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, W, H);

        ctx.globalAlpha = 0.38;
        ctx.strokeStyle = '#7c9574';
        ctx.lineWidth = 2;
        for (var y = 42; y < H; y += 42) {
            ctx.beginPath();
            for (var x = -20; x <= W + 20; x += 24) {
                var yy = y + Math.sin((x + elapsed * 18) / 32) * 5;
                if (x === -20) ctx.moveTo(x, yy);
                else ctx.lineTo(x, yy);
            }
            ctx.stroke();
        }
        ctx.globalAlpha = 1;

        ctx.fillStyle = 'rgba(255,250,235,0.65)';
        ctx.fillRect(0, H - 62, W, 62);
        ctx.strokeStyle = 'rgba(76,55,34,0.34)';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(0, H - 70);
        ctx.lineTo(W, H - 70);
        ctx.stroke();
        for (var bx = 16; bx < W; bx += 34) {
            ctx.fillStyle = 'rgba(76,55,34,0.26)';
            ctx.fillRect(bx, H - 70, 5, 16);
        }
    }

    function drawPlayer() {
        ctx.save();
        ctx.translate(player.x, player.y);
        ctx.scale(0.56, 0.56);
        ctx.shadowColor = 'rgba(54,38,20,0.28)';
        ctx.shadowBlur = 14;
        ctx.shadowOffsetY = 6;

        var teal = '#2e7f82';
        var tealDark = '#1f5964';
        var cream = '#f2e7cc';
        var clay = '#b96b45';
        var leaf = '#5e7f45';
        var leafDark = '#3f5e35';

        ctx.fillStyle = '#e7c69a';
        ctx.strokeStyle = clay;
        ctx.lineWidth = 2.2;
        sideFin(-1);
        sideFin(1);

        ctx.fillStyle = teal;
        ctx.strokeStyle = tealDark;
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.ellipse(0, 9, 43, 49, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = cream;
        ctx.strokeStyle = 'rgba(91,75,51,0.45)';
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        ctx.ellipse(0, 20, 34, 26, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        for (var ly = 8; ly <= 31; ly += 8) {
            ctx.beginPath();
            ctx.moveTo(-28, ly);
            ctx.quadraticCurveTo(0, ly + 4, 28, ly);
            ctx.stroke();
        }

        ctx.fillStyle = leaf;
        ctx.strokeStyle = leafDark;
        ctx.lineWidth = 1.4;
        for (var i = 0; i < 12; i++) {
            var a = Math.PI + (i / 11) * Math.PI;
            leafShape(Math.cos(a) * 33, -6 + Math.sin(a) * 10, a + Math.PI / 2, 5, 13);
        }

        ctx.fillStyle = teal;
        ctx.strokeStyle = tealDark;
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.arc(0, -32, 38, Math.PI, 0);
        ctx.lineTo(38, -17);
        ctx.quadraticCurveTo(0, 3, -38, -17);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = cream;
        ctx.strokeStyle = 'rgba(91,75,51,0.38)';
        ctx.lineWidth = 1.8;
        ctx.beginPath();
        ctx.ellipse(0, -14, 34, 16, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = leaf;
        ctx.strokeStyle = leafDark;
        for (var j = 0; j < 9; j++) {
            leafShape(-28 + j * 7, -58 - Math.abs(j - 4) * 1.2, (j - 4) * 0.13, 5, 15);
        }

        ctx.fillStyle = clay;
        ctx.strokeStyle = '#8a442c';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(0, -83);
        ctx.lineTo(13, -52);
        ctx.lineTo(-13, -52);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        ctx.shadowBlur = 0;
        ctx.fillStyle = '#181611';
        ctx.beginPath();
        ctx.arc(-17, -25, 3.4, 0, Math.PI * 2);
        ctx.arc(17, -25, 3.4, 0, Math.PI * 2);
        ctx.fill();

        ctx.strokeStyle = clay;
        ctx.lineWidth = 3;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(-26, -14);
        ctx.quadraticCurveTo(-60, -12, -74, -34);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(26, -14);
        ctx.quadraticCurveTo(60, -12, 74, -34);
        ctx.stroke();
        ctx.lineCap = 'butt';

        ctx.strokeStyle = '#6b563f';
        ctx.lineWidth = 5;
        ctx.beginPath();
        ctx.moveTo(-28, -1);
        ctx.lineTo(28, 47);
        ctx.stroke();
        ctx.fillStyle = '#8c6b4d';
        ctx.strokeStyle = '#5c422d';
        ctx.lineWidth = 1.5;
        ctx.fillRect(25, 28, 22, 18);
        ctx.strokeRect(25, 28, 22, 18);

        ctx.fillStyle = 'rgba(238,200,135,0.6)';
        for (var p = 0; p < 26; p++) {
            var tx = -30 + ((p * 17) % 61);
            var ty = -52 + ((p * 29) % 83);
            if (Math.hypot(tx / 43, (ty - 4) / 56) < 1) ctx.fillRect(tx, ty, 1.2, 1.2);
        }
        ctx.restore();
    }

    function sideFin(dir) {
        ctx.beginPath();
        ctx.moveTo(dir * 38, -18);
        ctx.lineTo(dir * 66, -30);
        ctx.lineTo(dir * 48, -2);
        ctx.lineTo(dir * 67, 10);
        ctx.lineTo(dir * 36, 16);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
    }

    function leafShape(x, y, rot, rx, ry) {
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(rot);
        ctx.beginPath();
        ctx.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.restore();
    }

    function drawItem(item) {
        ctx.save();
        ctx.translate(item.x, item.y);
        ctx.rotate(Math.sin(item.spin) * 0.12);
        ctx.shadowColor = 'rgba(54,38,20,0.2)';
        ctx.shadowBlur = 8;
        ctx.shadowOffsetY = 3;

        if (item.kind === 'water') {
            ctx.fillStyle = item.color;
            ctx.beginPath();
            ctx.moveTo(0, -17);
            ctx.bezierCurveTo(16, 0, 12, 18, 0, 18);
            ctx.bezierCurveTo(-12, 18, -16, 0, 0, -17);
            ctx.fill();
            ctx.fillStyle = 'rgba(255,255,255,0.65)';
            ctx.beginPath();
            ctx.arc(-5, 1, 3, 0, Math.PI * 2);
            ctx.fill();
        } else if (item.kind === 'cloud') {
            ctx.fillStyle = item.color;
            ctx.strokeStyle = '#d8c9aa';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.arc(-10, 4, 9, 0, Math.PI * 2);
            ctx.arc(0, -2, 12, 0, Math.PI * 2);
            ctx.arc(12, 5, 8, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();
        } else if (item.kind === 'gold') {
            ctx.fillStyle = item.color;
            star(0, 0, 6, 18, 8);
            ctx.fill();
        } else {
            ctx.fillStyle = item.color;
            ctx.beginPath();
            ctx.arc(0, 0, 16, 0, Math.PI * 2);
            ctx.fill();
            ctx.strokeStyle = 'rgba(255,255,255,0.25)';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.arc(-4, -2, 8, 0.3, Math.PI * 1.5);
            ctx.stroke();
        }
        ctx.restore();
    }

    function star(x, y, inner, outer, points) {
        ctx.beginPath();
        for (var i = 0; i < points * 2; i++) {
            var radius = i % 2 === 0 ? outer : inner;
            var angle = -Math.PI / 2 + i * Math.PI / points;
            var px = x + Math.cos(angle) * radius;
            var py = y + Math.sin(angle) * radius;
            if (i === 0) ctx.moveTo(px, py);
            else ctx.lineTo(px, py);
        }
        ctx.closePath();
    }

    function drawEffects() {
        for (var i = 0; i < effects.length; i++) {
            var fx = effects[i];
            var t = 1 - fx.life / fx.maxLife;
            var alpha = Math.max(0, fx.life / fx.maxLife);
            ctx.save();
            ctx.globalAlpha = alpha;
            ctx.fillStyle = fx.color;
            ctx.strokeStyle = 'rgba(255,255,255,0.88)';
            ctx.lineWidth = 3;
            ctx.font = '700 20px KaiTi, STKaiti, serif';
            ctx.textAlign = 'center';
            ctx.strokeText(fx.text, fx.x, fx.y - 10 - t * 12);
            ctx.fillText(fx.text, fx.x, fx.y - 10 - t * 12);
            for (var s = 0; s < fx.sparks.length; s++) {
                var spark = fx.sparks[s];
                var dist = spark.speed * t;
                var sx = fx.x + Math.cos(spark.angle) * dist;
                var sy = fx.y + Math.sin(spark.angle) * dist;
                if (fx.bad) {
                    ctx.fillStyle = 'rgba(45,45,45,0.55)';
                    ctx.beginPath();
                    ctx.arc(sx, sy, 2.5, 0, Math.PI * 2);
                    ctx.fill();
                } else {
                    ctx.strokeStyle = fx.color;
                    ctx.lineWidth = 2;
                    ctx.beginPath();
                    ctx.moveTo(sx - 4, sy);
                    ctx.lineTo(sx + 4, sy);
                    ctx.moveTo(sx, sy - 4);
                    ctx.lineTo(sx, sy + 4);
                    ctx.stroke();
                }
            }
            ctx.restore();
        }
    }

    function draw() {
        if (!ctx) return;
        drawBackground();
        for (var i = 0; i < items.length; i++) drawItem(items[i]);
        drawPlayer();
        drawEffects();
        if (paused && running && visible) {
            ctx.fillStyle = 'rgba(255,250,239,0.62)';
            ctx.fillRect(0, 0, W, H);
            ctx.fillStyle = '#352819';
            ctx.font = '700 24px KaiTi, STKaiti, serif';
            ctx.textAlign = 'center';
            ctx.fillText('巡桥暂停', W / 2, H / 2);
        }
    }

    document.addEventListener('DOMContentLoaded', initPatrolGame);
    window.PatrolGame = { init: initPatrolGame, reset: resetGame, sync: syncVisibility };
})();
