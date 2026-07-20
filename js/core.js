/**
 * core.js - 状态管理、页面切换、进度条、预览等核心逻辑
 * 提供 findById、$、$$ 等工具函数（全局可用）
 */

// ============ SPA视图切换 ============
        function showView(viewName) {
            document.getElementById('view-home').style.display = viewName === 'home' ? 'block' : 'none';
            document.getElementById('view-zhengyangmen').style.display = viewName === 'zhengyangmen' ? 'block' : 'none';
            // 切换到正阳门时隐藏旅程区域
            if (viewName === 'zhengyangmen') {
                var jw = document.getElementById('journey-wrapper');
                if (jw) jw.style.display = 'none';
                var da = document.getElementById('journey-dialogue-area');
                if (da) da.style.display = 'none';
            }
            window.scrollTo(0, 0);
            // home视图：journey-wrapper默认可见，home-story默认隐藏（已在HTML中设置）
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
        window.showView = showView;
        window.goBackToMap = goBackToMap;
        window.showToast = showToast;


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
         * NPC铛铛车对话轮播
         */
        var npcDialogues = [
            '小探险家，点正阳门开始冒险吧！',
            '正阳门下藏着两只镇水神兽，你找到了吗？',
            '集齐9站印章，你就是中轴小卫士！',
            '你知道吗？北京城的中轴线长达7.8公里！',
            '万宁桥下700岁的石狮子，在等你去发现哦！',
            '每座古迹都有一个故事，等你来解锁～'
        ];
        var npcIndex = 0;
        function cycleNpcDialogue() {
            npcIndex = (npcIndex + 1) % npcDialogues.length;
            var el = document.getElementById('npc-text');
            if (!el) return;
            el.classList.add('npc-text-changing');
            el.textContent = npcDialogues[npcIndex];
            setTimeout(function() {
                el.classList.remove('npc-text-changing');
            }, 300);
        }
        
        /**
         * 正阳门 - 跳转至神兽工坊（健壮版本：视图切换与页面切换解耦）
         */
        function goToStation() {
            console.log('[goToStation] 开始跳转');
            // 第一步：强制切换视图（不依赖任何其他函数）
            var home = document.getElementById('view-home');
            var zyg = document.getElementById('view-zhengyangmen');
            if (home) home.style.display = 'none';
            if (zyg) {
                zyg.style.display = 'block';
                void zyg.offsetHeight; // 强制回流
            }
            window.scrollTo(0, 0);
            console.log('[goToStation] 视图切换完成, zyg display=' + (zyg ? zyg.style.display : 'null'));

            // 第二步：切换页面（带容错）
            try {
                if (typeof showPage === 'function') {
                    showPage(2);
                    console.log('[goToStation] showPage(2) 完成');
                } else {
                    console.error('[goToStation] showPage 不可用，手动激活page-2');
                    var p2 = document.getElementById('page-2');
                    if (p2) {
                        document.querySelectorAll('.page-section').forEach(function(p) { p.classList.remove('active'); });
                        p2.classList.add('active');
                    }
                }
            } catch(e) {
                console.error('[goToStation] showPage报错:', e);
                // 最后兜底：直接激活page-2
                try {
                    var p2b = document.getElementById('page-2');
                    if (p2b) {
                        document.querySelectorAll('.page-section').forEach(function(p) { p.classList.remove('active'); });
                        p2b.classList.add('active');
                        console.log('[goToStation] 兜底激活page-2完成');
                    }
                } catch(e2) {
                    console.error('[goToStation] 兜底也失败:', e2);
                }
            }
        }
        
        /**
         * 页面加载动画 - 进度条动画
         */
        window.addEventListener('load', function() {
            var fill = document.querySelector('.progress-fill');
            if (fill) {
                fill.style.width = '0%';
                setTimeout(function() {
                    fill.style.width = '11.11%';
                }, 500);
            }
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
                    // 镇水兽模式进入page-9时隐藏返回按钮（仅铛铛车模式显示）
                    var btnBackDecor = document.getElementById('btn-back-to-decor');
                    if (btnBackDecor) btnBackDecor.style.display = 'none';
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
            var cs = pa.querySelector('.creature-svg');
            if (!cs) return;
            
            var color = state.selectedColors.length > 0 ? findById(colors, state.selectedColors[0]).hex : '#C45C5C';
            if (state.selectedCreature) { var cr = findById(creatures, state.selectedCreature); if (cr) color = cr.color; }
            
            // 更新神兽图片
            var creatureImg = pa.querySelector('#preview-creature-image');
            var creatureSvg = pa.querySelector('.creature-svg');
            if (creatureImg && creatureSvg) {
                if (state.isTramMode) {
                    // 铛铛车模式：显示铛铛车图片
                    var tramCreature = findById(creatures, 'dangdangche');
                    if (tramCreature && tramCreature.image) {
                        creatureImg.src = tramCreature.image;
                        creatureImg.style.display = 'block';
                        creatureSvg.style.display = 'none';
                    } else {
                        creatureImg.style.display = 'none';
                        creatureSvg.style.display = 'block';
                    }
                } else if (state.selectedCreature) {
                    var creature = findById(creatures, state.selectedCreature);
                    if (creature && creature.image) {
                        creatureImg.src = creature.image;
                        creatureImg.style.display = 'block';
                        creatureSvg.style.display = 'none';
                    } else {
                        creatureImg.style.display = 'none';
                        creatureSvg.style.display = 'block';
                        creatureSvg.querySelectorAll('ellipse, circle').forEach(function(el) {
                            var f = el.getAttribute('fill');
                            if (f && f !== 'white' && f !== '#333' && f !== 'none' && f !== '#E8E0D0' && !f.includes('rgba')) el.setAttribute('fill', color);
                        });
                    }
                } else {
                    creatureImg.style.display = 'none';
                    creatureImg.src = '';
                    creatureSvg.style.display = 'block';
                    creatureSvg.querySelectorAll('ellipse, circle').forEach(function(el) {
                        var f = el.getAttribute('fill');
                        if (f && f !== 'white' && f !== '#333' && f !== 'none' && f !== '#E8E0D0' && !f.includes('rgba')) el.setAttribute('fill', color);
                    });
                }
            }
            
            // 更新选择清单
            var list = pa.querySelector('.preview-selection-list');
            if (list) {
                var items = [];
                
                // 神兽/铛铛车
                if (state.isTramMode) {
                    items.push({
                        icon: '🚃',
                        label: '车型',
                        value: '铛铛车'
                    });
                } else if (state.selectedCreature) {
                    var creature = findById(creatures, state.selectedCreature);
                    if (creature) {
                        items.push({
                            icon: '',
                            label: '神兽',
                            value: creature.name
                        });
                    }
                }
                
                // 纹样
                if (state.selectedPatterns && state.selectedPatterns.length > 0) {
                    var patternNames = state.selectedPatterns.map(function(p) {
                        var x = findById(patterns, p);
                        return x ? x.name : '';
                    }).filter(Boolean);
                    if (patternNames.length > 0) {
                        items.push({
                            icon: '🎨',
                            label: '纹样',
                            value: patternNames.join('、')
                        });
                    }
                }
                
                // 颜色
                if (state.selectedColors && state.selectedColors.length > 0) {
                    var colorNames = state.selectedColors.map(function(c) {
                        var x = findById(colors, c);
                        return x ? x.name : '';
                    }).filter(Boolean);
                    if (colorNames.length > 0) {
                        items.push({
                            icon: '🎨',
                            label: '颜色',
                            value: colorNames.join('·')
                        });
                    }
                }
                
                // 元素
                if (state.selectedElements && state.selectedElements.length > 0) {
                    var elementNames = state.selectedElements.map(function(e) {
                        var x = findById(elements, e);
                        return x ? x.name : '';
                    }).filter(Boolean);
                    if (elementNames.length > 0) {
                        items.push({
                            icon: '✨',
                            label: '元素',
                            value: elementNames.join('、')
                        });
                    }
                }
                
                // 渲染列表
                if (items.length > 0) {
                    list.innerHTML = items.map(function(item) {
                        return '<div class="preview-selection-item">' +
                            '<div class="preview-selection-icon">' + item.icon + '</div>' +
                            '<div class="preview-selection-content">' +
                            '<div class="preview-selection-label">' + item.label + '</div>' +
                            '<div class="preview-selection-value">' + item.value + '</div>' +
                            '</div></div>';
                    }).join('');
                } else {
                    list.innerHTML = '<div style="color:#999;font-size:13px;text-align:center;padding:20px;">暂无选择</div>';
                }
            }
            
            // 更新技能描述
            var skillEl = pa.querySelector('.preview-skill');
            if (skillEl) {
                var skillText = '守护桥梁的小神兽';
                if (state.selectedCreature) {
                    var creature = findById(creatures, state.selectedCreature);
                    if (creature && creature.skill) {
                        skillText = creature.skill;
                    } else if (creature && creature.name) {
                        skillText = creature.name + '的小神兽';
                    }
                }
                if (state.selectedElements && state.selectedElements.length > 0) {
                    var elementNames = state.selectedElements.map(function(e) {
                        var x = findById(elements, e);
                        return x ? x.name : '';
                    }).filter(Boolean);
                    if (elementNames.length > 0) {
                        skillText = '掌握' + elementNames.join('、') + '之力的小神兽';
                    }
                }
                skillEl.textContent = skillText;
            }
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
                creature: { label: state.isTramMode ? "铛铛车" : (state.selectedCreature ? (findById(creatures, state.selectedCreature) ? findById(creatures, state.selectedCreature).name : null) : null) },
                pattern: { label: state.selectedPatterns && state.selectedPatterns.length > 0 ? state.selectedPatterns.map(function(p) { var x = findById(patterns, p); return x ? x.name : ''; }).filter(Boolean).join('·') : null },
                face: { label: null },
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
            
            // === 第3步：颜色覆盖（步骤4及之后显示，覆盖默认色） ===
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
            
            // 步骤3+: 配色
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
                case 'limb':
                    svgContent = '<path d="M34,72 Q46,66 58,72 Q70,78 84,72" stroke="' + strokeColor + '" stroke-width="2.2" fill="none"/>' +
                               '<path d="M36,82 Q48,76 60,82 Q72,88 86,82" stroke="' + strokeColor + '" stroke-width="2.2" fill="none"/>' +
                               '<path d="M40,60 L40,90 M50,58 L50,91 M60,58 L60,92 M70,58 L70,90" stroke="' + strokeColor + '" stroke-width="1.2" opacity="0.8"/>';
                    break;
                case 'mouth_horn':
                    svgContent = '<path d="M28,54 Q48,28 74,34 Q60,48 94,42 Q72,56 98,68 Q64,64 42,84 Q44,64 28,54" stroke="' + strokeColor + '" stroke-width="2" fill="none"/>' +
                               '<path d="M38,58 L88,48 M40,62 L78,62 M44,66 L90,74" stroke="' + strokeColor + '" stroke-width="1.4" opacity="0.85"/>';
                    break;
                case 'mane':
                    svgContent = '<path d="M26,58 Q46,48 66,58 Q82,66 100,54" stroke="' + strokeColor + '" stroke-width="2.2" fill="none"/>' +
                               '<path d="M28,64 Q48,54 68,64 Q84,72 102,60" stroke="' + strokeColor + '" stroke-width="1.8" fill="none"/>' +
                               '<path d="M30,70 Q50,62 70,70 Q84,78 98,68" stroke="' + strokeColor + '" stroke-width="1.4" fill="none"/>';
                    break;
                case 'ear':
                    svgContent = '<path d="M22,72 Q42,44 70,54 Q94,62 98,44 Q112,66 88,86 Q58,100 22,88" stroke="' + strokeColor + '" stroke-width="2" fill="none"/>' +
                               '<path d="M34,78 Q46,66 58,74 Q48,86 34,78" stroke="' + strokeColor + '" stroke-width="1.5" fill="none"/>' +
                               '<circle cx="42" cy="76" r="9" stroke="' + strokeColor + '" stroke-width="1.6" fill="none"/>';
                    break;
                case 'eye':
                    svgContent = '<path d="M36,54 Q56,34 78,48 Q72,70 48,72 Q34,66 36,54" stroke="' + strokeColor + '" stroke-width="2" fill="none"/>' +
                               '<circle cx="62" cy="72" r="10" stroke="' + strokeColor + '" stroke-width="1.8" fill="none"/>' +
                               '<circle cx="62" cy="72" r="4" fill="' + fillColor + '"/>' +
                               '<path d="M44,44 Q62,34 88,48" stroke="' + strokeColor + '" stroke-width="1.5" fill="none"/>';
                    break;
                case 'head_horn':
                    svgContent = '<path d="M58,28 Q78,36 70,58 Q64,76 82,92" stroke="' + strokeColor + '" stroke-width="2" fill="none"/>' +
                               '<path d="M48,58 Q60,70 76,66" stroke="' + strokeColor + '" stroke-width="1.6" fill="none"/>' +
                               '<path d="M46,78 Q58,88 78,86" stroke="' + strokeColor + '" stroke-width="1.6" fill="none"/>';
                    break;
                case 'back_cloud':
                    svgContent = '<path d="M18,82 Q34,58 54,70 Q66,52 84,64 Q100,54 110,70" stroke="' + strokeColor + '" stroke-width="2.2" fill="none"/>' +
                               '<path d="M28,84 Q44,74 56,84 Q68,94 82,82 Q96,72 104,84" stroke="' + strokeColor + '" stroke-width="1.8" fill="none"/>';
                    break;
                case 'neck_mane':
                    svgContent = '<path d="M24,50 Q52,34 86,42 Q70,50 108,56 Q74,62 104,76 Q62,74 34,90" stroke="' + strokeColor + '" stroke-width="2" fill="none"/>' +
                               '<path d="M34,52 Q62,48 94,56 M30,62 Q60,60 98,68 M28,72 Q58,74 90,84" stroke="' + strokeColor + '" stroke-width="1.3" fill="none" opacity="0.85"/>';
                    break;
            }
            return svgContent;
        }

        function getDecorSvg(elementId) {
            var svgContent = '';
            switch(elementId) {
                case 'cloud_base':
                    svgContent = '<ellipse cx="60" cy="112" rx="35" ry="6" fill="#8B2020" opacity="0.3"/>' +
                               '<path d="M28,112 Q40,104 52,112 Q64,120 76,112 Q88,104 92,112" stroke="#C45C5C" stroke-width="2.5" fill="none" opacity="0.7"/>' +
                               '<path d="M32,108 Q44,100 56,108 Q68,116 80,108" stroke="#D4A843" stroke-width="1.5" fill="none" opacity="0.5"/>' +
                               '<path d="M38,114 Q50,110 62,114 Q74,118 86,114" stroke="#C45C5C" stroke-width="1" fill="none" opacity="0.4"/>';
                    break;
                case 'map_base':
                    svgContent = '<rect x="30" y="106" width="60" height="14" fill="#5C3A21" rx="2" opacity="0.35"/>' +
                               '<rect x="33" y="107" width="54" height="10" fill="#D4C4A0" rx="1" opacity="0.5"/>' +
                               '<line x1="45" y1="112" x2="75" y2="112" stroke="#C45C5C" stroke-width="1.5" stroke-dasharray="3,1.5" opacity="0.6"/>' +
                               '<circle cx="60" cy="112" r="2" fill="#C45C5C" opacity="0.5"/>';
                    break;
                case 'brick_platform':
                    svgContent = '<rect x="28" y="104" width="64" height="16" fill="#6B7B8C" rx="1" opacity="0.4"/>' +
                               '<line x1="28" y1="108" x2="92" y2="108" stroke="#556677" stroke-width="0.8" opacity="0.5"/>' +
                               '<line x1="28" y1="112" x2="92" y2="112" stroke="#556677" stroke-width="0.8" opacity="0.5"/>' +
                               '<line x1="28" y1="116" x2="92" y2="116" stroke="#556677" stroke-width="0.8" opacity="0.5"/>' +
                               '<circle cx="30" cy="106" r="2.5" fill="#6B7B8C" opacity="0.4"/>' +
                               '<circle cx="90" cy="106" r="2.5" fill="#6B7B8C" opacity="0.4"/>';
                    break;
                case 'marble_base':
                    svgContent = '<path d="M30,116 L90,116 L93,110 L27,110 Z" fill="#E8E8E8" opacity="0.45"/>' +
                               '<path d="M34,110 L86,110 L88,105 L32,105 Z" fill="#F0F0F0" opacity="0.35"/>' +
                               '<path d="M36,105 Q42,101 48,105 Q54,101 60,105 Q66,101 72,105 Q78,101 84,105" stroke="#D0D0D0" stroke-width="1.2" fill="none" opacity="0.6"/>' +
                               '<path d="M38,102 Q44,99 50,102 Q56,99 62,102 Q68,99 74,102 Q80,99 86,102" stroke="#D0D0D0" stroke-width="0.8" fill="none" opacity="0.4"/>';
                    break;
                case 'glazed_base':
                    svgContent = '<polygon points="60,100 78,107 78,117 60,124 42,117 42,107" fill="#D4A843" opacity="0.3"/>' +
                               '<polygon points="60,102 74,108 74,116 60,122 46,116 46,108" fill="#C4A830" opacity="0.2"/>' +
                               '<line x1="44" y1="110" x2="76" y2="110" stroke="#2D8B5E" stroke-width="1.5" opacity="0.4"/>' +
                               '<line x1="46" y1="114" x2="74" y2="114" stroke="#D4A843" stroke-width="1" opacity="0.35"/>';
                    break;
                case 'name_stone':
                    svgContent = '<rect x="32" y="102" width="56" height="18" fill="#8B8070" rx="1" opacity="0.35"/>' +
                               '<rect x="36" y="105" width="48" height="12" fill="#A09888" rx="1" opacity="0.25"/>' +
                               '<text x="60" y="115" text-anchor="middle" fill="#6B5B4B" font-size="7" font-weight="bold" opacity="0.5">神兽</text>';
                    break;
            }
            return svgContent;
        }

        // ============ 重置并返回首页 ============
        function resetAndGoHome() {
            state.selectedCreature = null;
            state.selectedPatterns = [];
            state.selectedColors = [];
            state.selectedElements = [];
            state.selectedCandidate = null;
            state.isTramMode = false;
            state.tramColor = null;
            state.tramEra = null;
            state.tramDecors = [];
            var selectedCards = $$('.option-card.selected, .pattern-card.selected, .color-card.selected, .element-card.selected');
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
