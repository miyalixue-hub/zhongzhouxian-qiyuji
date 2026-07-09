/**
 * core.js - 状态管理、页面切换、进度条、预览等核心逻辑
 * 提供 findById、$、$$ 等工具函数（全局可用）
 */

// ============ SPA视图切换 ============
        function showView(viewName) {
            document.getElementById('view-home').style.display = viewName === 'home' ? 'block' : 'none';
            document.getElementById('view-zhengyangmen').style.display = viewName === 'zhengyangmen' ? 'block' : 'none';
            window.scrollTo(0, 0);
        }

        function goBackToMap() {
            showView('home');
        }

        // 定义全局goToStation函数
        function goToStation() {
            showView('zhengyangmen');
            if (typeof showPage === 'function') {
                showPage(2);
            } else {
                console.error('[ERROR] showPage 不可用');
            }
        }
        window.goToStation = goToStation;


/**
         * 显示"即将开放"提示
         */
        function showToast() {
            var toast = document.getElementById('toast');
            toast.classList.add('show');
            setTimeout(function() {
                toast.classList.remove('show');
            }, 2000);
        }
        
        /**
         * 正阳门 - 跳转至神兽工坊
         */
        function goToStation() {
showView('zhengyangmen');
            // Start the creation flow from page-3 (story intro)
            if (typeof showPage === 'function') {
showPage(2);
            } else {
}
        }
        
        /**
         * 页面加载动画 - 进度条动画
         */
        window.addEventListener('load', function() {
            var fill = document.querySelector('.progress-fill');
            fill.style.width = '0%';
            setTimeout(function() {
                fill.style.width = '11.11%';
            }, 500);
        });

// ============ 工具函数 ============
        var $ = function(s) { return document.querySelector(s); };
        var $$ = function(s) { return document.querySelectorAll(s); };
        
        function showPage(n) {
            $$('.page-section').forEach(function(p) { p.classList.remove('active'); });
            var pageId = 'page-' + n;
            var t = $('#' + pageId);
            if (t) { 
                t.classList.add('active'); 
                state.currentPage = n; 
                updateProgressBar(); 
                updatePreview(); 
                updateRecipeBar();
                if (n === 9) { 
                    try {
                        generatePromptSummary();
} catch(e) {
                        console.error('[ERROR] generatePromptSummary failed:', e);
                        var pb = $('#page-9 .prompt-text');
                        if (pb) pb.innerHTML = '<span style="color:red;">错误: ' + e.message + '</span>';
                    }
                }
                // 切换页面后滚动到顶部，确保按钮可见
                setTimeout(function() { window.scrollTo({ top: 0, behavior: 'smooth' }); }, 50);
            }
        }
        
        function updateProgressBar() {
            var p = state.currentPage, el = $('#page-' + p);
            if (!el) return;
            var circles = el.querySelectorAll('.progress-circle'), labels = el.querySelectorAll('.progress-label');
            // 铛铛车页面使用独立进度条，不在此处理
            if (typeof p === 'string' && p.startsWith('4')) return;
            circles.forEach(function(c, i) {
                c.classList.remove('completed', 'active', 'pending');
                labels[i].classList.remove('active');
                if (i + 1 < p - 1) { c.classList.add('completed'); c.textContent = '✓'; }
                else if (i + 1 === p - 1) { c.classList.add('active'); c.textContent = i + 1; labels[i].classList.add('active'); }
                else { c.classList.add('pending'); c.textContent = i + 1; }
            });
        }
        
        function updatePreview() {
            var pa = $('.page-section.active .preview-area');
            if (!pa) return;
            var pl = pa.querySelector('.preview-label'), cs = pa.querySelector('.creature-svg');
            if (!cs) return;
            var color = state.selectedColors.length > 0 ? findById(colors, state.selectedColors[0]).hex : '#C45C5C';
            if (state.selectedCreature) { var cr = findById(creatures, state.selectedCreature); if (cr) color = cr.color; }
            if (pl) {
                var label = '📱 模型预览';
                if (state.currentPage === 4 && state.selectedCreature) label = '📱 ' + findById(creatures, state.selectedCreature).name + '模型预览';
                else if (state.currentPage === 5 && state.selectedPatterns.length > 0) label = '📱 ' + state.selectedPatterns.map(function(x) { return findById(patterns, x).name; }).join('、') + '装饰';
                else if (state.currentPage === 6 && state.selectedExpression) { var ex = findById(expressions, state.selectedExpression); label = '📱 ' + ex.name + '表情预览'; }
                else if (state.currentPage === 7 && state.selectedColors.length > 0) { var cnames = state.selectedColors.map(function(x) { return findById(colors, x) ? findById(colors, x).name : ''; }).filter(Boolean); label = '📱 模型预览 - ' + cnames.join('·'); }
                else if (state.currentPage === 8 && state.selectedElements.length > 0) { var el = findById(elements, state.selectedElements[0]); label = '📱 模型预览 - ' + el.name; }
                pl.textContent = label;
            }
            cs.querySelectorAll('ellipse, circle').forEach(function(el) {
                var f = el.getAttribute('fill');
                if (f && f !== 'white' && f !== '#333' && f !== 'none' && f !== '#E8E0D0' && !f.includes('rgba')) el.setAttribute('fill', color);
            });
        }
        
        function findById(arr, id) { for (var i = 0; i < arr.length; i++) if (arr[i].id === id) return arr[i]; return null; }

// ============ 底部实时预览区更新函数（累积式） ============
        // ============ 底部实时预览区更新函数（累积式） ============

        // ============ 配方卡更新函数 ============
        function updateRecipeBar() {
            // 找到当前活跃页面中的配方卡
            var activePage = document.querySelector('.page-section.active');
            if (!activePage) return;
            var bar = activePage.querySelector('.recipe-bar');
            if (!bar) return;
            var show = state.currentPage >= 4 && state.currentPage <= 8;
            if (show) { bar.classList.remove('hidden'); } else { bar.classList.add('hidden'); }
            var tags = {
                creature: { label: state.selectedCreature ? (findById(creatures, state.selectedCreature) ? findById(creatures, state.selectedCreature).name : null) : null },
                pattern: { label: state.selectedPatterns && state.selectedPatterns.length > 0 ? state.selectedPatterns.map(function(p) { var x = findById(patterns, p); return x ? x.name : ''; }).filter(Boolean).join('·') : null },
                face: { label: state.selectedExpression ? (findById(expressions, state.selectedExpression) ? findById(expressions, state.selectedExpression).emoji + ' ' + findById(expressions, state.selectedExpression).name : null) : null },
                color: { label: state.selectedColors && state.selectedColors.length > 0 ? state.selectedColors.map(function(c) { var x = findById(colors, c); return x ? x.name : ''; }).filter(Boolean).join('·') : null },
                decoration: { label: state.selectedElements && state.selectedElements.length > 0 ? state.selectedElements.map(function(e) { var x = findById(elements, e); return x ? x.name : ''; }).filter(Boolean).join('·') : null }
            };
            Object.keys(tags).forEach(function(key) {
                var tag = bar.querySelector('[data-step="' + key + '"]');
                if (!tag) return;
                var labelEl = tag.querySelector('.tag-label');
                if (tags[key].label) {
                    labelEl.textContent = tags[key].label;
                    tag.classList.add('active');
                } else {
                    labelEl.textContent = '未选择';
                    tag.classList.remove('active');
                }
            });
        }

        function updateBottomPreview() {
            var page = state.currentPage;
            if (page < 2 || page > 6) return;
            
            var previewContainer = $('#preview-creature-' + page);
            var hint = $('#preview-hint-' + page);
            if (!previewContainer) return;
            
            // === 第1步：神兽基础颜色（始终应用） ===
            var creatureColor = '#C45C5C';
            var creatureName = '';
            if (state.selectedCreature) {
                var creature = findById(creatures, state.selectedCreature);
                if (creature) {
                    creatureColor = creature.color;
                    creatureName = creature.name;
                }
            }
            
            // 先统一设置为神兽默认色
            var bodyPart = $('#body-part-' + page);
            var headPart = $('#head-part-' + page);
            var hornLeft = $('#horn-left-' + page);
            var hornRight = $('#horn-right-' + page);
            
            if (bodyPart) bodyPart.setAttribute('fill', creatureColor);
            if (headPart) headPart.setAttribute('fill', creatureColor);
            if (hornLeft) hornLeft.setAttribute('fill', creatureColor);
            if (hornRight) hornRight.setAttribute('fill', creatureColor);
            
            // === 第2步：纹饰叠加（步骤2及之后显示） ===
            var patternOverlay = $('#pattern-overlay-' + page);
            if (patternOverlay) {
                patternOverlay.innerHTML = '';
                if (state.selectedPatterns && state.selectedPatterns.length > 0 && page >= 3) {
                    state.selectedPatterns.forEach(function(patternId) {
                        var patternSvg = getPatternSvg(patternId, creatureColor);
                        if (patternSvg) patternOverlay.innerHTML += patternSvg;
                    });
                }
            }
            
            // === 第3步：表情姿态（步骤3及之后显示） ===
            previewContainer.classList.remove('pose-cute', 'pose-fierce', 'pose-cool', 'pose-funny');
            if (state.selectedExpression && page >= 4) {
                previewContainer.classList.add('pose-' + state.selectedExpression);
                updateCreatureFace(page);
            } else {
                // 清除表情特效
                var faceFx = $('#face-fx-' + page);
                if (faceFx) faceFx.innerHTML = '';
            }
            
            // === 第4步：颜色覆盖（步骤4及之后显示，覆盖默认色） ===
            if (state.selectedColors.length > 0 && page >= 5) {
                if (state.selectedColors[0]) {
                    var c0 = findById(colors, state.selectedColors[0]);
                    if (c0 && bodyPart) bodyPart.setAttribute('fill', c0.hex);
                }
                if (state.selectedColors[1]) {
                    var c1 = findById(colors, state.selectedColors[1]);
                    if (c1 && headPart) headPart.setAttribute('fill', c1.hex);
                }
                if (state.selectedColors[2]) {
                    var c2 = findById(colors, state.selectedColors[2]);
                    if (c2 && hornLeft) hornLeft.setAttribute('fill', c2.hex);
                    if (c2 && hornRight) hornRight.setAttribute('fill', c2.hex);
                }
            }
            
            // === 第5步：装饰元素（步骤5显示） ===
            var decorOverlay = $('#decor-overlay-' + page);
            if (decorOverlay) {
                decorOverlay.innerHTML = '';
                if (state.selectedElements && state.selectedElements.length > 0 && page >= 6) {
                    state.selectedElements.forEach(function(elementId) {
                        var decorSvg = getDecorSvg(elementId);
                        if (decorSvg) decorOverlay.innerHTML += decorSvg;
                    });
                }
            }
            
            // === 更新提示文字（累积式描述） ===
            updatePreviewHint(page, hint, creatureName);
        }
        
        // ============ 表情特效更新 ============
        function updateCreatureFace(page) {
            var faceFx = $('#face-fx-' + page);
            var svg = $('#preview-svg-' + page);
            if (!faceFx || !svg) return;
            
            faceFx.innerHTML = '';
            
            if (!state.selectedExpression) return;
            
            var svgContent = '';
            switch(state.selectedExpression) {
                case 'cute':
                    // 大眼睛高光 + 小爱心
                    svgContent = '<circle cx="48" cy="43" r="2.5" fill="white" opacity="0.9"/>' +
                                 '<circle cx="68" cy="43" r="2.5" fill="white" opacity="0.9"/>' +
                                 '<path d="M56 38 L58 35 L60 38 L62 35 L64 38" stroke="#FF6B8A" stroke-width="1.5" fill="none"/>';
                    // 修改嘴巴为小微笑
                    var mouth = svg.querySelector('.creature-mouth');
                    if (mouth) mouth.setAttribute('d', 'M53 63 Q60 67 67 63');
                    break;
                case 'fierce':
                    // 怒眉 + 尖牙
                    svgContent = '<line x1="42" y1="36" x2="54" y2="40" stroke="#333" stroke-width="2.5" stroke-linecap="round"/>' +
                                 '<line x1="78" y1="36" x2="66" y2="40" stroke="#333" stroke-width="2.5" stroke-linecap="round"/>' +
                                 '<path d="M52 62 L55 68 L58 62" fill="white" stroke="#333" stroke-width="1"/>' +
                                 '<path d="M62 62 L65 68 L68 62" fill="white" stroke="#333" stroke-width="1"/>';
                    var mouth = svg.querySelector('.creature-mouth');
                    if (mouth) mouth.setAttribute('d', 'M48 62 L60 65 L72 62');
                    break;
                case 'cool':
                    // 墨镜效果
                    svgContent = '<rect x="40" y="40" width="16" height="10" rx="3" fill="#333" opacity="0.85"/>' +
                                 '<rect x="64" y="40" width="16" height="10" rx="3" fill="#333" opacity="0.85"/>' +
                                 '<line x1="56" y1="45" x2="64" y2="45" stroke="#333" stroke-width="1.5"/>' +
                                 '<line x1="40" y1="45" x2="34" y2="42" stroke="#333" stroke-width="1.5"/>' +
                                 '<line x1="80" y1="45" x2="86" y2="42" stroke="#333" stroke-width="1.5"/>';
                    var mouth = svg.querySelector('.creature-mouth');
                    if (mouth) mouth.setAttribute('d', 'M52 62 Q58 64 66 60');
                    break;
                case 'funny':
                    // 吐舌头 + 星星眼
                    svgContent = '<path d="M56 64 Q60 75 64 64" fill="#FF6B8A" stroke="#E05570" stroke-width="0.8"/>' +
                                 '<path d="M46 42 L48 38 L50 42 L46 42" fill="#D4A843"/>' +
                                 '<path d="M70 42 L72 38 L74 42 L70 42" fill="#D4A843"/>';
                    var mouth = svg.querySelector('.creature-mouth');
                    if (mouth) mouth.setAttribute('d', 'M48 60 Q54 68 60 64 Q66 68 72 60');
                    break;
            }
            faceFx.innerHTML = svgContent;
        }
        
        // ============ 累积式提示文字 ============
        function updatePreviewHint(page, hint, creatureName) {
            if (!hint) return;
            
            var parts = [];
            
            // 步骤1+: 神兽名称
            if (creatureName) parts.push('🐾 ' + creatureName);
            
            // 步骤2+: 纹饰
            if (state.selectedPatterns && state.selectedPatterns.length > 0 && page >= 3) {
                var pNames = state.selectedPatterns.map(function(p) {
                    var x = findById(patterns, p); return x ? x.name : '';
                }).filter(Boolean);
                if (pNames.length) parts.push('✨ ' + pNames.join('、'));
            }
            
            // 步骤3+: 表情
            if (state.selectedExpression && page >= 4) {
                var ex = findById(expressions, state.selectedExpression);
                if (ex) parts.push(ex.emoji + ' ' + ex.name);
            }
            
            // 步骤4+: 配色
            if (state.selectedColors && state.selectedColors.length > 0 && page >= 5) {
                var cNames = state.selectedColors.map(function(x) {
                    return findById(colors, x) ? findById(colors, x).name : '';
                }).filter(Boolean);
                if (cNames.length) parts.push('🎨 ' + cNames.join('·'));
            }
            
            // 步骤5: 装饰
            if (state.selectedElements && state.selectedElements.length > 0 && page >= 6) {
                var eNames = state.selectedElements.map(function(e) {
                    return findById(elements, e) ? findById(elements, e).name : '';
                }).filter(Boolean);
                if (eNames.length) parts.push('🏷️ ' + eNames.join('、'));
            }
            
            if (parts.length > 0) {
                hint.innerHTML = parts.join(' <span style="color:rgba(196,92,92,0.3)">|</span> ');
            } else {
                hint.textContent = '👆 点击上方卡片开始创作';
            }
        }
        

// ============ 按钮状态与选择处理 ============
        function updateNextButton() {
            var p = state.currentPage, el = $('#page-' + p);
            if (!el) return;
            var nb = el.querySelector('.btn-next');
            if (p === 2) if (nb) nb.disabled = !state.selectedCreature;
            else if (p === 3) if (nb) nb.disabled = state.selectedPatterns.length === 0;
            else if (p === 4) if (nb) nb.disabled = !state.selectedExpression;
            else if (p === 5) if (nb) nb.disabled = state.selectedColors.length === 0;
            else if (p === 6) if (nb) nb.disabled = state.selectedElements.length === 0;
            else if (p === 8) if (nb) nb.disabled = state.selectedElements.length === 0;
        }
        
        function handleSingle(sel, key) {
            var cards = $$(sel);
            for (var i = 0; i < cards.length; i++) {
                cards[i].addEventListener('click', function() {
                    var allCards = $$(sel);
                    for (var j = 0; j < allCards.length; j++) allCards[j].classList.remove('selected');
                    this.classList.add('selected');
                    state[key] = this.dataset.id;
                    updateNextButton(); updatePreview(); updateRecipeBar();
                });
            }
        }
        
        function handleMulti(sel, key, max, hintSel) {
            var hint = $(hintSel);
            var cards = $$(sel);
            for (var i = 0; i < cards.length; i++) {
                cards[i].addEventListener('click', function() {
                    var v = this.dataset.id, idx = state[key].indexOf(v);
                    if (idx > -1) { state[key].splice(idx, 1); this.classList.remove('selected'); }
                    else {
                        if (state[key].length >= max) { if (hint) { hint.textContent = '⚠️ 最多选择' + max + '个'; hint.classList.add('warning'); var h = hint; setTimeout(function() { h.textContent = '💡 已选择 ' + state[key].length + '/' + max + ' 个'; }, 1500); } return; }
                        state[key].push(v); this.classList.add('selected');
                    }
                    if (hint) { hint.textContent = '💡 已选择 ' + state[key].length + '/' + max + ' 个'; hint.classList.remove('warning'); }
                    updateNextButton(); updatePreview(); updateRecipeBar();
                });
            }
        }
        // ============ SVG 辅助函数 ============
        function getPatternSvg(patternId, color) {
            var strokeColor = 'rgba(255,215,0,0.85)';
            var fillColor = 'rgba(255,255,255,0.7)';
            var svgContent = '';
            switch(patternId) {
                case 'cloud':
                    svgContent = '<path d="M28,82 Q38,68 50,82 Q62,96 74,82 Q84,68 92,82" stroke="' + strokeColor + '" stroke-width="2.5" fill="none"/>' +
                               '<path d="M32,32 Q42,20 52,32 Q58,24 64,32" stroke="' + strokeColor + '" stroke-width="2.5" fill="none"/>' +
                               '<circle cx="42" cy="76" r="2" fill="' + fillColor + '"/>' +
                               '<circle cx="68" cy="76" r="2" fill="' + fillColor + '"/>';
                    break;
                case 'hui':
                    svgContent = '<path d="M28,78 L28,88 L38,88 L38,78 L48,78 L48,88 L58,88 L58,78 L68,78 L68,88 L78,88 L78,78 L88,78" stroke="' + strokeColor + '" stroke-width="2.5" fill="none"/>' +
                               '<path d="M32,38 L32,48 L42,48 L42,38 L52,38 L52,48 L62,48 L62,38 L72,38 L72,48" stroke="' + strokeColor + '" stroke-width="2.5" fill="none"/>';
                    break;
                case 'scale':
                    svgContent = '<circle cx="38" cy="72" r="6" fill="none" stroke="' + strokeColor + '" stroke-width="2"/>' +
                               '<circle cx="58" cy="72" r="6" fill="none" stroke="' + strokeColor + '" stroke-width="2"/>' +
                               '<circle cx="48" cy="60" r="6" fill="none" stroke="' + strokeColor + '" stroke-width="2"/>' +
                               '<circle cx="78" cy="72" r="6" fill="none" stroke="' + strokeColor + '" stroke-width="2"/>' +
                               '<circle cx="68" cy="60" r="6" fill="none" stroke="' + strokeColor + '" stroke-width="2"/>';
                    break;
                case 'ruyi':
                    svgContent = '<path d="M42,28 Q52,16 60,28 Q68,16 78,28" stroke="' + strokeColor + '" stroke-width="2.5" fill="none"/>' +
                               '<path d="M48,22 Q60,10 72,22" stroke="' + strokeColor + '" stroke-width="1.5" fill="none"/>' +
                               '<circle cx="60" cy="88" r="5" fill="' + strokeColor + '"/>' +
                               '<circle cx="60" cy="88" r="2.5" fill="' + fillColor + '"/>';
                    break;
            }
            return svgContent;
        }

        function getDecorSvg(elementId) {
            var svgContent = '';
            switch(elementId) {
                case 'cloud_base':
                    svgContent = '<path d="M20,105 Q35,95 50,105 Q65,115 80,105 Q95,95 100,105" stroke="rgba(196,92,92,0.5)" stroke-width="2" fill="none"/>';
                    break;
                case 'map_base':
                    svgContent = '<rect x="35" y="100" width="50" height="12" stroke="rgba(74,127,181,0.5)" stroke-width="1.5" fill="none" rx="2"/>' +
                               '<line x1="60" y1="100" x2="60" y2="112" stroke="rgba(74,127,181,0.5)" stroke-width="1" stroke-dasharray="2,1"/>';
                    break;
                case 'km_marker':
                    svgContent = '<circle cx="95" cy="25" r="10" fill="rgba(196,92,92,0.5)"/>' +
                               '<text x="95" y="29" text-anchor="middle" fill="white" font-size="8" font-weight="bold">中</text>';
                    break;
                case 'plaque':
                    svgContent = '<rect x="10" y="55" width="20" height="12" stroke="rgba(212,168,67,0.5)" stroke-width="1.5" fill="none"/>' +
                               '<line x1="14" y1="59" x2="26" y2="59" stroke="rgba(212,168,67,0.5)" stroke-width="0.8"/>';
                    break;
                case 'archaeology_tag':
                    svgContent = '<rect x="90" y="60" width="18" height="14" stroke="rgba(107,123,140,0.5)" stroke-width="1.5" fill="rgba(250,248,240,0.8)"/>' +
                               '<line x1="93" y1="64" x2="105" y2="64" stroke="rgba(107,123,140,0.5)" stroke-width="0.8"/>';
                    break;
                case 'custom_tag':
                    svgContent = '<rect x="5" y="65" width="22" height="10" stroke="rgba(212,168,67,0.5)" stroke-width="1" fill="rgba(250,248,240,0.8)" rx="2"/>' +
                               '<text x="16" y="73" text-anchor="middle" fill="rgba(212,168,67,0.8)" font-size="5">神兽</text>';
                    break;
            }
            return svgContent;
        }

        // ============ 重置并返回首页 ============
        function resetAndGoHome() {
            state.selectedCreature = null;
            state.selectedPatterns = [];
            state.selectedExpression = null;
            state.selectedColors = [];
            state.selectedElements = [];
            state.selectedCandidate = null;
            state.isTramMode = false;
            state.tramColor = null;
            state.tramEra = null;
            state.tramDecors = [];
            var selectedCards = $$('.option-card.selected, .pattern-card.selected, .expression-card.selected, .color-card.selected, .element-card.selected');
            for (var i = 0; i < selectedCards.length; i++) selectedCards[i].classList.remove('selected');
            var s = $('#result-showcase');
            if (s) s.remove();
            var cg2 = $('#candidate-grid');
            if (cg2) cg2.style.display = '';
            var cb = $('#btn-confirm-image');
            if (cb) cb.disabled = true;
            var p9rb = $('#btn-back-9');
            if (p9rb) { p9rb.disabled = true; p9rb.style.opacity = '0.4'; p9rb.style.cursor = 'not-allowed'; }
            var p9hm = $('#btn-home-p9');
            if (p9hm) { p9hm.disabled = true; p9hm.style.opacity = '0.4'; p9hm.style.cursor = 'not-allowed'; }
            showPage(0);
            goBackToMap();
        }