/**
 * interactions.js - 用户交互、按钮事件、卡片选择、天赋签
 * 包含 init() 主入口和所有事件绑定
 */

        function init() {
            console.log('[INIT] Starting initialization...');
            try {
            showPage(0);
            console.log('[INIT] showPage(0) OK, currentPage=' + state.currentPage);
            // 修改page-4的卡片点击事件，区分神兽和铛铛车
            var creatureCards = document.querySelectorAll('#page-4 .option-card');
            console.log('[INIT] Found ' + creatureCards.length + ' creature cards');
            creatureCards.forEach(function(card) {
                card.addEventListener('click', function() {
                    var allCards = document.querySelectorAll('#page-4 .option-card');
                    for (var j = 0; j < allCards.length; j++) allCards[j].classList.remove('selected');
                    this.classList.add('selected');
                    var id = this.dataset.id;
                    if (id === 'dangdangche') {
                        // 选择铛铛车，进入铛铛车流程
                        state.isTramMode = true;
                        state.selectedCreature = null;
                    } else {
                        // 选择神兽
                        state.isTramMode = false;
                        state.selectedCreature = id;
                    }
                    updateNextButton();
                    updateRecipeBar();
                    updatePreview();
                });
            });
            handleSingle('.expression-card', 'selectedExpression');
            // 颜色多选
            var ch = document.createElement('div'); ch.className = 'selection-hint'; ch.id = 'color-hint'; ch.textContent = '💡 可选择1-3种颜色，分别对应身体/头部/角';
            var cg = $('#page-5 .color-grid');
            if (cg) cg.parentNode.insertBefore(ch, cg);
            handleMulti('.color-card', 'selectedColors', 3, '#color-hint');
            
            // 纹饰多选
            var ph = document.createElement('div'); ph.className = 'selection-hint'; ph.id = 'pattern-hint'; ph.textContent = '💡 可选择1-3种纹饰';
            var pg = $('#page-3 .pattern-grid');
            if (pg) pg.parentNode.insertBefore(ph, pg);
            handleMulti('.pattern-card', 'selectedPatterns', 3, '#pattern-hint');
            
            // 附加元素多选
            ph = document.createElement('div'); ph.className = 'selection-hint'; ph.id = 'element-hint'; ph.textContent = '💡 可选择1-3个附加元素';
            var eg = $('#page-8 .elements-grid');
            if (eg) eg.parentNode.insertBefore(ph, eg);
            handleMulti('.element-card', 'selectedElements', 3, '#element-hint');
            
            // P1开始按钮
            var startBtn = $('#btn-start-p1');
            if (startBtn) startBtn.addEventListener('click', function() {
                state.selectedCreature = 'gongfu';
                var fc = $('#page-4 .option-card');
                if (fc) fc.classList.add('selected');
                showPage(4); updateNextButton(); updateRecipeBar(); updatePreview();
            });

            // P1副按钮 - 显示即将开放提示
            var mapBtn = $('#btn-map-story');
            if (mapBtn) mapBtn.addEventListener('click', showToast);
            var zymBtn = $('#btn-zym-story');
            if (zymBtn) zymBtn.addEventListener('click', showToast);
            
            // 封面页进入按钮
            var coverBtn = $('#btn-enter-cover');
            // btn-enter-cover 已使用内联 onclick="showPage(4)"，无需额外绑定
            
            // P2 回到首页按钮
            var homeBtn = $('#btn-home-p2');
            if (homeBtn) homeBtn.addEventListener('click', function() { showPage(0); });
            
            // 前进按钮 (pages 4-7: 选择神兽→贴纹饰→姿态表情→传统色)
            for (var pg2 = 4; pg2 <= 7; pg2++) {
                var el = $('#page-' + pg2);
                if (!el) continue;
                var nb = el.querySelector('.btn-next');
                if (nb) nb.addEventListener('click', function() {
                    if (!this.disabled) {
                        var pageId = this.closest('.page-section').id;
                        // page-4 特殊处理：铛铛车走4a，神兽走5
                        if (pageId === 'page-4') {
                            if (state.isTramMode) {
                                showPage('4a');
                            } else {
                                showPage(5);
                            }
                        } else {
                            var currentP = parseInt(pageId.replace('page-', ''));
                            showPage(currentP + 1);
                        }
                    }
                });
            }
            
            // 返回按钮 (pages 3-8: 神兽流程中的返回)
            for (var pg3 = 3; pg3 <= 8; pg3++) {
                var el = $('#page-' + pg3);
                if (!el) continue;
                var bb = el.querySelector('.btn-back');
                if (bb) bb.addEventListener('click', function() {
                    var currentP = parseInt(this.closest('.page-section').id.replace('page-', ''));
                    showPage(currentP - 1);
                });
            }
            
            // page-9的返回按钮（预览卡片区）- 根据模式动态返回
            var btnBack7 = document.getElementById('btn-back-7');
            if (btnBack7) btnBack7.addEventListener('click', function() {
                goBackFromPreview();
            });
            
            // 全局返回函数：铛铛车模式返回装饰选择页，神兽模式返回元素选择页
            window.goBackFromPreview = function() {
                if (state.isTramMode) {
                    showPage('4c');
                } else {
                    showPage(8);
                }
            };
            
            // page-10的返回按钮 - 总是返回page-9
            var p10back = document.getElementById('btn-back-8');
            if (p10back) p10back.addEventListener('click', function() {
                showPage(9);
            });
            
            // P9生成按钮
            var genBtn = $('#page-9 .btn-generate');
            if (genBtn) genBtn.addEventListener('click', function() { generatePromptSummary(); showPage(10); setTimeout(generateCandidates, 300); });
            // P8 confirm button
            var confirmBtn = $('#btn-confirm-image');
            if (confirmBtn) confirmBtn.addEventListener('click', function() {
                if (state.selectedCandidate !== undefined && state.selectedCandidate !== null) {
                    showPage(11);
                    setTimeout(start3DGeneration, 300);
                }
            });
            
            // P9 back button (生成完成后才能点)
            var p9backBtn = $('#btn-back-9');
            if (p9backBtn) p9backBtn.addEventListener('click', function() {
                if (!this.disabled) showPage(10);
            });
            // P9 "去保存和分享" button (生成完成后才能点)
            var p9homeBtn = $('#btn-home-p9');
            if (p9homeBtn) p9homeBtn.addEventListener('click', function() {
                if (!this.disabled) {
                    showPage(12);
                    populateCompletionPage();
                }
            });
            
            // 3D模型重试按钮
            var meshyRetryBtn = document.getElementById('btn-meshy-retry');
            if (meshyRetryBtn) meshyRetryBtn.addEventListener('click', function() {
                // 隐藏重试按钮、状态面板和缩略图
                var retryArea = document.getElementById('meshy-retry-area');
                if (retryArea) retryArea.style.display = 'none';
                var statusPanel = document.getElementById('meshy-live-status');
                if (statusPanel) { statusPanel.style.display = 'none'; statusPanel.style.background = '#FFF8E1'; statusPanel.style.borderColor = '#e6a700'; }
                var thumbEl = document.getElementById('meshy-thumbnail');
                if (thumbEl) { thumbEl.style.display = 'none'; thumbEl.removeAttribute('src'); }
                start3DGeneration();
            });
            
            // 直接下载STL按钮（model-viewer加载慢时的备选方案）
            var directStlBtn = document.getElementById('btn-download-stl-direct');
            if (directStlBtn) directStlBtn.addEventListener('click', function() {
                handleDownloadSTL();
            });
            
            // P9 buttons
            var restartBtn = $('#btn-restart-3d');
            if (restartBtn) restartBtn.addEventListener('click', resetAndGoHome);
            var print3dBtn = $('#btn-3d-print');
            if (print3dBtn) print3dBtn.addEventListener('click', handlePrintToPrinter);
            var downloadStlBtn = $('#btn-download-stl');
            if (downloadStlBtn) downloadStlBtn.addEventListener('click', handleDownloadSTL);
            var saveProfile3dBtn = $('#btn-save-profile-3d');
            if (saveProfile3dBtn) saveProfile3dBtn.addEventListener('click', saveToAlbum);

            // P10 buttons
            var saveAlbumBtn = $('#btn-save-album');
            if (saveAlbumBtn) saveAlbumBtn.addEventListener('click', saveToAlbum);
            var shareParentBtn = $('#btn-share-parent');
            if (shareParentBtn) shareParentBtn.addEventListener('click', shareToParents);
            var footerMapBtn = $('#btn-footer-map');
            if (footerMapBtn) footerMapBtn.addEventListener('click', function() { goBackToMap(); });
            var footerRestartBtn = $('#btn-footer-restart');
            if (footerRestartBtn) footerRestartBtn.addEventListener('click', resetAndGoHome);

            // P11首页按钮
            var homeBtn = $('#page-11 .btn-home');
            if (homeBtn) homeBtn.addEventListener('click', resetAndGoHome);

            // ============ 铛铛车流程事件处理 ============
            
            // 铛铛车颜色选择 (page-4a)
            var tramColorCards = document.querySelectorAll('[data-tram-color]');
            tramColorCards.forEach(function(card) {
                card.addEventListener('click', function() {
                    var allCards = document.querySelectorAll('[data-tram-color]');
                    for (var j = 0; j < allCards.length; j++) allCards[j].classList.remove('selected');
                    this.classList.add('selected');
                    state.tramColor = this.dataset.tramColor;
                    var btn = document.getElementById('btn-next-4a');
                    if (btn) btn.disabled = false;
                });
            });
            
            // 铛铛车年代选择 (page-4b)
            var tramEraCards = document.querySelectorAll('[data-tram-era]');
            tramEraCards.forEach(function(card) {
                card.addEventListener('click', function() {
                    var allCards = document.querySelectorAll('[data-tram-era]');
                    for (var j = 0; j < allCards.length; j++) allCards[j].classList.remove('selected');
                    this.classList.add('selected');
                    state.tramEra = this.dataset.tramEra;
                    var btn = document.getElementById('btn-next-4b');
                    if (btn) btn.disabled = false;
                });
            });
            
            // 铛铛车装饰选择 (page-4c) - 多选
            var tramDecorCards = document.querySelectorAll('[data-tram-decor]');
            tramDecorCards.forEach(function(card) {
                card.addEventListener('click', function() {
                    var decorId = this.dataset.tramDecor;
                    var idx = state.tramDecors.indexOf(decorId);
                    if (idx > -1) {
                        state.tramDecors.splice(idx, 1);
                        this.classList.remove('selected');
                    } else {
                        state.tramDecors.push(decorId);
                        this.classList.add('selected');
                    }
                });
            });
            
            // 铛铛车页面导航按钮
            var btnNext4a = document.getElementById('btn-next-4a');
            if (btnNext4a) {
                btnNext4a.addEventListener('click', function() {
                    if (!this.disabled) {
                        showPage('4b');
                    }
                });
            }
            
            var btnBack4a = document.getElementById('btn-back-4a');
            if (btnBack4a) btnBack4a.addEventListener('click', function() {
                showPage(4); // 返回选择页面
            });
            
            var btnNext4b = document.getElementById('btn-next-4b');
            if (btnNext4b) btnNext4b.addEventListener('click', function() {
                if (!this.disabled) showPage('4c');
            });
            
            var btnBack4b = document.getElementById('btn-back-4b');
            if (btnBack4b) btnBack4b.addEventListener('click', function() {
                showPage('4a');
            });
            
            var btnNext4c = document.getElementById('btn-next-4c');
            if (btnNext4c) btnNext4c.addEventListener('click', function() {
                // 直接进入铛铛车确认提示词页面（复用page-9的结构，但用铛铛车数据）
                state.currentPage = '9-tram';
                showTramPromptPage();
            });
            
            var btnBack4c = document.getElementById('btn-back-4c');
            if (btnBack4c) btnBack4c.addEventListener('click', function() {
                showPage('4b');
            });
            } catch(e) {
                console.error('[INIT ERROR]', e);
                var banner = document.createElement('div');
                banner.style.cssText = 'position:fixed;top:0;left:0;right:0;background:#ff4444;color:white;padding:12px;z-index:999999;font-size:14px;text-align:center;';
                banner.textContent = '初始化错误: ' + e.message + ' - 请刷新页面或联系管理员';
                banner.onclick = function(){ this.style.display='none'; };
                document.body.appendChild(banner);
            }
        }
        
        // 显示铛铛车确认提示词页面
        function showTramPromptPage() {
            // 复用page-9的结构，但显示铛铛车信息
            var page9 = document.getElementById('page-9');
            if (!page9) return;
            
            // 修改页面标题和内容
            var title = page9.querySelector('.page-title');
            if (title) title.textContent = '确认铛铛车提示词';
            
            var subtitle = page9.querySelector('.page-subtitle');
            if (subtitle) subtitle.textContent = '确认你的铛铛车设计，准备生成';
            
            // 更新进度条为铛铛车流程
            var progressBar = page9.querySelector('.progress-bar');
            if (progressBar) {
                progressBar.innerHTML = '<div class="progress-step"><div class="progress-circle completed">✓</div><div class="progress-label">车身颜色</div></div>' +
                    '<div class="progress-step"><div class="progress-circle completed">✓</div><div class="progress-label">车型年代</div></div>' +
                    '<div class="progress-step"><div class="progress-circle completed">✓</div><div class="progress-label">装饰细节</div></div>' +
                    '<div class="progress-step"><div class="progress-circle active">4</div><div class="progress-label active">确认提示词</div></div>';
            }
            
            // 更新提示标签区域
            var promptTags = page9.querySelector('.prompt-tags');
            if (promptTags) {
                promptTags.innerHTML = ''; // 清空，由generateTramPromptData填充
            }
            
            // 生成铛铛车提示词
            generateTramPromptSummary();
            
            // 修改生成按钮文字
            var genBtn = page9.querySelector('.btn-generate');
            if (genBtn) genBtn.textContent = '🎨 开始AI生成';
            
            // 修改提示文字
            var tipText = page9.querySelector('.tip-text');
            if (tipText) tipText.textContent = '🎯 点击下方按钮开始AI生成你的铛铛车';
            
            // 显示page-9
            state.currentPage = 9;
            document.querySelectorAll('.page-section').forEach(function(p) { p.classList.remove('active'); });
            page9.classList.add('active');
            // 确保预览区刷新：显示铛铛车图片而非默认怪兽SVG
            if (typeof updatePreview === 'function') updatePreview();
            window.scrollTo({ top: 0, behavior: 'smooth' });
        }
        
        // 生成铛铛车提示词
        function generateTramPromptSummary() {
            var promptDiv = document.querySelector('#page-9 .prompt-text');
            if (!promptDiv) return;
            
            // 获取颜色名称
            var colorName = '经典绿';
            var colorHex = '#2E7D32';
            if (state.tramColor) {
                var tc = tramColors.find(function(c) { return c.id === state.tramColor; });
                if (tc) {
                    colorName = tc.name;
                    colorHex = tc.hex;
                }
            }
            
            // 获取年代名称
            var eraName = '1924年老式';
            if (state.tramEra) {
                var te = tramEras.find(function(e) { return e.id === state.tramEra; });
                if (te) eraName = te.name;
            }
            
            // 获取装饰名称
            var decorNames = [];
            if (state.tramDecors && state.tramDecors.length > 0) {
                state.tramDecors.forEach(function(d) {
                    var td = tramDecors.find(function(x) { return x.id === d; });
                    if (td) decorNames.push(td.name);
                });
            }
            
            var prompt = '中国传统手绘风格，北京正阳门前的有轨铛铛车，' + eraName + '，' + colorName + '车身';
            if (decorNames.length > 0) {
                prompt += '，' + decorNames.join('、');
            }
            prompt += '，背景是正阳门城楼和前门大街，水墨淡彩风格，传统工笔画质感，8k高清';
            
            var summaryHtml = '<div class="tram-prompt-summary">';
            summaryHtml += '<h3>🚃 铛铛车设计摘要</h3>';
            summaryHtml += '<div class="prompt-row"><span class="prompt-label">车身颜色:</span> <span style="color:' + colorHex + ';">●</span> ' + colorName + '</div>';
            summaryHtml += '<div class="prompt-row"><span class="prompt-label">车型年代:</span> ' + eraName + '</div>';
            if (decorNames.length > 0) {
                summaryHtml += '<div class="prompt-row"><span class="prompt-label">装饰细节:</span> ' + decorNames.join('、') + '</div>';
            }
            summaryHtml += '<div class="prompt-text-final">' + prompt + '</div>';
            summaryHtml += '</div>';
            
            promptDiv.innerHTML = summaryHtml;
            
            // 修改生成按钮文字
            var genBtn = document.querySelector('#page-9 .btn-generate');
            if (genBtn) genBtn.textContent = '🎨 生成铛铛车';
        }
        

        // ============ P10: 完成页功能 ============
        function populateCompletionPage() {
            var svgWrap = document.getElementById('creature-card-svg-wrap');
            var nameEl = document.getElementById('creature-card-name');
            var tagsEl = document.getElementById('creature-card-tags');
            if (!svgWrap || !nameEl || !tagsEl) return;

            // 铛铛车模式
            if (state.isTramMode) {
                // 铛铛车SVG
                var tc = tramColors.find(function(c) { return c.id === state.tramColor; }) || tramColors[0];
                svgWrap.innerHTML = '<svg width="160" height="120" viewBox="0 0 140 80">' +
                    '<rect x="10" y="20" width="120" height="35" rx="5" fill="' + tc.hex + '"/>' +
                    '<rect x="18" y="25" width="20" height="18" rx="2" fill="white" opacity="0.8"/>' +
                    '<rect x="42" y="25" width="20" height="18" rx="2" fill="white" opacity="0.8"/>' +
                    '<rect x="66" y="25" width="20" height="18" rx="2" fill="white" opacity="0.8"/>' +
                    '<rect x="90" y="25" width="20" height="18" rx="2" fill="white" opacity="0.8"/>' +
                    '<rect x="8" y="12" width="124" height="12" rx="3" fill="#1B5E20"/>' +
                    '<circle cx="30" cy="60" r="8" fill="#333"/><circle cx="110" cy="60" r="8" fill="#333"/>' +
                    '<circle cx="30" cy="60" r="4" fill="#666"/><circle cx="110" cy="60" r="4" fill="#666"/>' +
                    '<line x1="70" y1="12" x2="70" y2="2" stroke="#555" stroke-width="2"/>' +
                    '<circle cx="70" cy="2" r="3" fill="#FFC107"/>' +
                    '</svg>';
                
                var te = tramEras.find(function(e) { return e.id === state.tramEra; }) || tramEras[0];
                nameEl.textContent = '我的铛铛车';
                
                // Build tags for tram
                var tags = [];
                tags.push({text: tc.name + '车身', type: 'normal'});
                tags.push({text: te.name, type: 'normal'});
                if (state.tramDecors && state.tramDecors.length > 0) {
                    var decorNames = [];
                    state.tramDecors.forEach(function(d) {
                        var td = tramDecors.find(function(x) { return x.id === d; });
                        if (td) decorNames.push(td.name);
                    });
                    if (decorNames.length > 0) tags.push({text: '装饰：' + decorNames.join('、'), type: 'gold'});
                }
                tagsEl.innerHTML = tags.map(function(t) {
                    return '<span class="creature-card-tag' + (t.type === 'gold' ? ' gold' : '') + '">' + t.text + '</span>';
                }).join('');
                return;
            }

            // Get the creature SVG from the 3D model result
            var modelSvg = document.querySelector('#model-3d-result');
            if (modelSvg) {
                svgWrap.innerHTML = modelSvg.outerHTML.replace('width="100"', 'width="160"').replace('height="100"', 'height="160"');
            } else {
                svgWrap.innerHTML = '<svg width="160" height="160" viewBox="0 0 120 120"><ellipse cx="60" cy="75" rx="35" ry="28" fill="#C45C5C"/><circle cx="60" cy="48" r="26" fill="#C45C5C"/><ellipse cx="34" cy="28" rx="12" ry="18" fill="#C45C5C"/><ellipse cx="86" cy="28" rx="12" ry="18" fill="#C45C5C"/><circle cx="50" cy="45" r="7" fill="white"/><circle cx="70" cy="45" r="7" fill="white"/><circle cx="51" cy="46" r="4" fill="#333"/><circle cx="71" cy="46" r="4" fill="#333"/><ellipse cx="60" cy="56" rx="5" ry="4" fill="#333"/><path d="M50 62 Q60 70 70 62" stroke="#333" stroke-width="2" fill="none"/></svg>';
            }

            // Set creature name
            var creatureName = '';
            if (state.selectedCreature) {
                var cr = findById(creatures, state.selectedCreature);
                if (cr) creatureName = cr.name;
            }
            nameEl.textContent = creatureName || '我的神兽';

            // Build tags
            var tags = [];
            if (state.selectedCreature) {
                var cr2 = findById(creatures, state.selectedCreature);
                if (cr2) tags.push({text: cr2.desc, type: 'normal'});
            }
            if (state.selectedPatterns && state.selectedPatterns.length > 0) {
                var pnames = state.selectedPatterns.map(function(p) { var pp = findById(patterns, p); return pp ? pp.name : ''; }).filter(Boolean);
                if (pnames.length > 0) tags.push({text: '纹饰：' + pnames.join('、'), type: 'normal'});
            }
            if (state.selectedExpression) {
                var ex = findById(expressions, state.selectedExpression);
                if (ex) tags.push({text: ex.emoji + ' ' + ex.name, type: 'gold'});
            }
            if (state.selectedColors && state.selectedColors.length > 0) {
                var cnames = state.selectedColors.map(function(c) { var cc = findById(colors, c); return cc ? cc.name : ''; }).filter(Boolean);
                if (cnames.length > 0) tags.push({text: '色彩：' + cnames.join('、'), type: 'gold'});
            }
            if (state.selectedElements && state.selectedElements.length > 0) {
                var enames = state.selectedElements.map(function(e) { var ee = findById(elements, e); return ee ? ee.name : ''; }).filter(Boolean);
                if (enames.length > 0) tags.push({text: '元素：' + enames.join('、'), type: 'normal'});
            }

            tagsEl.innerHTML = tags.map(function(t) {
                return '<span class="creature-card-tag' + (t.type === 'gold' ? ' gold' : '') + '">' + t.text + '</span>';
            }).join('');
        }

        function saveToAlbum() {
            var canvas = document.createElement('canvas');
            canvas.width = 750;
            canvas.height = 1000;
            var ctx = canvas.getContext('2d');

            // Background
            ctx.fillStyle = '#FAF8F0';
            ctx.fillRect(0, 0, 750, 1000);

            // Decorative border
            ctx.strokeStyle = '#c04830';
            ctx.lineWidth = 3;
            ctx.strokeRect(20, 20, 710, 960);
            ctx.strokeStyle = '#b8943e';
            ctx.lineWidth = 1;
            ctx.strokeRect(25, 25, 700, 950);

            // Title
            ctx.font = 'bold 36px KaiTi, STKaiti, serif';
            ctx.fillStyle = '#3a2a1a';
            ctx.textAlign = 'center';
            ctx.fillText('中轴奇游记·神兽档案', 375, 70);

            // Separator
            ctx.strokeStyle = '#c04830';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(100, 90);
            ctx.lineTo(650, 90);
            ctx.stroke();

            // Draw creature SVG as image
            var svgWrap = document.getElementById('creature-card-svg-wrap');
            var svgEl = svgWrap ? svgWrap.querySelector('svg') : null;
            if (svgEl) {
                var svgData = new XMLSerializer().serializeToString(svgEl);
                var img = new Image();
                img.onload = function() {
                    ctx.drawImage(img, 225, 120, 300, 300);
                    drawRestOfCard(ctx, canvas);
                };
                img.src = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svgData)));
            } else {
                drawRestOfCard(ctx, canvas);
            }
        }

        function drawRestOfCard(ctx, canvas) {
            // Creature name
            ctx.font = 'bold 30px KaiTi, STKaiti, serif';
            ctx.fillStyle = '#3a2a1a';
            ctx.textAlign = 'center';
            var creatureName = '';
            if (state.selectedCreature) {
                var cr = findById(creatures, state.selectedCreature);
                if (cr) creatureName = cr.name;
            }
            ctx.fillText(creatureName || '我的神兽', 375, 480);

            // Separator
            ctx.strokeStyle = '#b8943e';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(200, 500);
            ctx.lineTo(550, 500);
            ctx.stroke();

            // Attributes
            ctx.font = '22px KaiTi, STKaiti, serif';
            ctx.fillStyle = '#3a2a1a';
            var y = 540;
            if (state.selectedCreature) {
                var cr2 = findById(creatures, state.selectedCreature);
                if (cr2) { ctx.fillText('种类：' + cr2.desc, 375, y); y += 38; }
            }
            if (state.selectedPatterns && state.selectedPatterns.length > 0) {
                var pnames = state.selectedPatterns.map(function(p) { var pp = findById(patterns, p); return pp ? pp.name : ''; }).filter(Boolean);
                if (pnames.length > 0) { ctx.fillText('纹饰：' + pnames.join('、'), 375, y); y += 38; }
            }
            if (state.selectedExpression) {
                var ex = findById(expressions, state.selectedExpression);
                if (ex) { ctx.fillText('表情：' + ex.emoji + ' ' + ex.name, 375, y); y += 38; }
            }
            if (state.selectedColors && state.selectedColors.length > 0) {
                var cnames = state.selectedColors.map(function(c) { var cc = findById(colors, c); return cc ? cc.name : ''; }).filter(Boolean);
                if (cnames.length > 0) { ctx.fillText('颜色：' + cnames.join('、'), 375, y); y += 38; }
            }
            if (state.selectedElements && state.selectedElements.length > 0) {
                var enames = state.selectedElements.map(function(e) { var ee = findById(elements, e); return ee ? ee.name : ''; }).filter(Boolean);
                if (enames.length > 0) { ctx.fillText('元素：' + enames.join('、'), 375, y); y += 38; }
            }

            // Bottom info
            ctx.font = '16px KaiTi, STKaiti, serif';
            ctx.fillStyle = '#7a6a56';
            ctx.fillText('北京中轴线 · 正阳门·神兽工坊', 375, 900);
            ctx.fillText(new Date().toLocaleDateString('zh-CN'), 375, 930);

            // Trigger download
            canvas.toBlob(function(blob) {
                var url = URL.createObjectURL(blob);
                var a = document.createElement('a');
                a.href = url;
                a.download = '我的神兽_' + (creatureName || '档案') + '.png';
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                URL.revokeObjectURL(url);
                showSaveSuccess();
            }, 'image/png');
        }

        function showSaveSuccess() {
            var toast = document.createElement('div');
            toast.className = 'save-success-toast';
            toast.innerHTML = '✅ 已保存到相册<br><span style="font-size:13px;opacity:0.8;">长按图片可保存到本地</span>';
            document.body.appendChild(toast);
            setTimeout(function() { toast.remove(); }, 2500);
        }

        // 生成打印说明文件（包含神兽参数，用于对接3D打印服务）
        function handleDownloadSTL() {
            var creatureName = '';
            if (state.selectedCreature) {
                var cr = findById(creatures, state.selectedCreature);
                if (cr) creatureName = cr.name;
            }
            var fileName = '神兽_' + (creatureName || '模型');
            
            // 如果有 Meshy 生成的真实3D模型，下载 STL + GLB 文件
            if (state.meshyModelUrl || state.meshyStlUrl) {
                showToastMessage('⏳ 正在下载3D模型文件...');
                
                // 下载STL文件（用于3D打印）
                var stlDownloaded = false;
                var glbDownloaded = false;
                var downloadCount = (state.meshyStlUrl ? 1 : 0) + (state.meshyModelUrl ? 1 : 0);
                
                function checkAllDone() {
                    if (stlDownloaded && glbDownloaded) {
                        showToastMessage('✅ 3D模型文件已全部下载');
                    }
                }
                
                // 下载 STL/3MF（根据实际URL判断格式）
                if (state.meshyStlUrl) {
                    (function() {
                        // 根据URL判断文件扩展名
                        var stlExt = state.meshyStlUrl.indexOf('.3mf') !== -1 ? '.3mf' : '.stl';
                        fetch(state.meshyStlUrl)
                            .then(function(resp) {
                                if (!resp.ok) throw new Error('打印文件下载失败');
                                return resp.blob();
                            })
                            .then(function(blob) {
                                var blobUrl = URL.createObjectURL(blob);
                                var a = document.createElement('a');
                                a.href = blobUrl;
                                a.download = fileName + stlExt;
                                document.body.appendChild(a);
                                a.click();
                                document.body.removeChild(a);
                                URL.revokeObjectURL(blobUrl);
                                stlDownloaded = true;
                                checkAllDone();
                            })
                            .catch(function(err) {
                                console.error('打印文件下载失败:', err);
                                // 降级：直接打开链接
                                var a = document.createElement('a');
                                a.href = state.meshyStlUrl;
                                a.download = fileName + stlExt;
                                a.target = '_blank';
                                document.body.appendChild(a);
                                a.click();
                                document.body.removeChild(a);
                                stlDownloaded = true;
                                checkAllDone();
                            });
                    })();
                } else {
                    stlDownloaded = true;
                }
                
                // 下载 GLB（用于预览，延迟500ms避免浏览器阻止多文件下载）
                if (state.meshyModelUrl) {
                    setTimeout(function() {
                        fetch(state.meshyModelUrl)
                            .then(function(resp) {
                                if (!resp.ok) throw new Error('GLB下载失败');
                                return resp.blob();
                            })
                            .then(function(blob) {
                                var blobUrl = URL.createObjectURL(blob);
                                var a = document.createElement('a');
                                a.href = blobUrl;
                                a.download = fileName + '.glb';
                                document.body.appendChild(a);
                                a.click();
                                document.body.removeChild(a);
                                URL.revokeObjectURL(blobUrl);
                                glbDownloaded = true;
                                checkAllDone();
                            })
                            .catch(function(err) {
                                console.error('GLB下载失败:', err);
                                var a = document.createElement('a');
                                a.href = state.meshyModelUrl;
                                a.download = fileName + '.glb';
                                a.target = '_blank';
                                document.body.appendChild(a);
                                a.click();
                                document.body.removeChild(a);
                                glbDownloaded = true;
                                checkAllDone();
                            });
                    }, 500);
                } else {
                    glbDownloaded = true;
                }
                
                // 同时下载打印工单（延迟1秒）
                setTimeout(function() {
                    downloadPrintWorkOrder(creatureName, fileName);
                }, 1000);
                return;
            }
            
            // 没有 Meshy 模型时，仅下载打印工单文本
            downloadPrintWorkOrder(creatureName, fileName);
            showToastMessage('📄 打印工单已下载');
        }
        
        // 下载打印工单文本文件
        function downloadPrintWorkOrder(creatureName, fileName) {
            var patternNames = [];
            if (state.selectedPatterns && state.selectedPatterns.length > 0) {
                state.selectedPatterns.forEach(function(p) {
                    var pp = findById(patterns, p);
                    if (pp) patternNames.push(pp.name);
                });
            }
            var expressionName = '';
            if (state.selectedExpression) {
                var ex = findById(expressions, state.selectedExpression);
                if (ex) expressionName = ex.name;
            }
            var colorNames = [];
            if (state.selectedColors && state.selectedColors.length > 0) {
                state.selectedColors.forEach(function(c) {
                    var cc = findById(colors, c);
                    if (cc) colorNames.push(cc.name + '(' + cc.hex + ')');
                });
            }
            var elementNames = [];
            if (state.selectedElements && state.selectedElements.length > 0) {
                state.selectedElements.forEach(function(e) {
                    var ee = findById(elements, e);
                    if (ee) elementNames.push(ee.name);
                });
            }
            var aiPrompt = state._lastAiPrompt || '';
            var hasRealModel = !!state.meshyModelUrl;

            var content = '=== 中轴奇游记·神兽3D打印工单 ===\n\n';
            content += '神兽名称：' + (creatureName || '未命名') + '\n';
            content += '纹饰风格：' + (patternNames.join('、') || '无') + '\n';
            content += '表情姿态：' + (expressionName || '未选择') + '\n';
            content += '传统色彩：' + (colorNames.join('、') || '未选择') + '\n';
            content += '附加元素：' + (elementNames.join('、') || '无') + '\n';
            content += 'AI提示词：' + (aiPrompt || '无') + '\n\n';
            content += '=== 3D模型 ===\n';
            content += '模型来源：' + (hasRealModel ? 'Meshy AI 生成' : '示意图（未生成真实3D模型）') + '\n';
            if (hasRealModel) {
                content += '模型格式：GLB\n';
                content += '模型下载地址：' + state.meshyModelUrl + '\n';
            }
            content += '\n=== 打印参数 ===\n';
            content += '适配打印机：拓竹A2L\n';
            content += '建议层高：0.2mm\n';
            content += '建议填充：15%\n';
            content += '建议材料：PLA\n';
            content += '预估时间：约45分钟\n\n';
            content += '生成时间：' + new Date().toLocaleString('zh-CN') + '\n';
            content += '来源：中轴奇游记·正阳门神兽工坊\n';

            var blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
            var url = URL.createObjectURL(blob);
            var a = document.createElement('a');
            a.href = url;
            a.download = fileName + '_打印工单.txt';
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        }

        // 发送到打印机（提示引导）
        function handlePrintToPrinter() {
            var panel = document.createElement('div');
            panel.className = 'share-fallback-panel';
            panel.innerHTML = '<div class="share-fallback-content">' +
                '<h3>🖨️ 3D打印服务</h3>' +
                '<p style="font-size:14px;color:#3a2a1a;line-height:1.8;">' +
                '请将下载的打印工单文件发送给工作人员，<br/>' +
                '我们将使用<strong>拓竹A2L打印机</strong>为你制作实体模型。</p>' +
                '<div style="background:#FFF8E1;border-radius:8px;padding:12px;margin:12px 0;font-size:13px;color:#7a6a56;">' +
                '💡 提示：先点击"下载STL文件"获取打印工单<br/>' +
                '预计打印时间约45分钟</div>' +
                '<button class="btn-copy-url" onclick="this.parentNode.parentNode.parentNode.remove()" style="background:#c04830;color:white;border:none;padding:10px 24px;border-radius:8px;font-size:14px;cursor:pointer;">我知道了</button>' +
                '</div>';
            document.body.appendChild(panel);
            panel.addEventListener('click', function(e) { if (e.target === panel) panel.remove(); });
        }

        function showToastMessage(message) {
            var toast = document.createElement('div');
            toast.className = 'save-success-toast';
            toast.innerHTML = message;
            document.body.appendChild(toast);
            setTimeout(function() { toast.remove(); }, 2500);
        }

        function shareToParents() {
            if (navigator.share) {
                navigator.share({
                    title: '我的中轴奇游记·神兽档案',
                    text: '我在中轴奇游记创建了一只专属神兽！快来看看！',
                    url: window.location.href
                }).catch(function(err) {
                    if (err.name !== 'AbortError') {
                        showShareFallback();
                    }
                });
            } else {
                showShareFallback();
            }
        }

        function showShareFallback() {
            var sharePanel = document.createElement('div');
            sharePanel.className = 'share-fallback-panel';
            sharePanel.innerHTML = '<div class="share-fallback-content">' +
                '<h3>📤 分享给家长</h3>' +
                '<p>长按复制链接，发送给爸爸妈妈：</p>' +
                '<div class="share-url-box">' + window.location.href + '</div>' +
                '<button class="btn-copy-url" id="btn-copy-url-action">📋 复制链接</button>' +
                '<button class="btn-close-share" id="btn-close-share-action">关闭</button>' +
                '</div>';
            document.body.appendChild(sharePanel);

            document.getElementById('btn-copy-url-action').addEventListener('click', function() { copyURL(); });
            document.getElementById('btn-close-share-action').addEventListener('click', function() { sharePanel.remove(); });
            sharePanel.addEventListener('click', function(e) { if (e.target === sharePanel) sharePanel.remove(); });
        }

        function copyURL() {
            var url = window.location.href;
            if (navigator.clipboard) {
                navigator.clipboard.writeText(url).then(function() {
                    var btn = document.getElementById('btn-copy-url-action');
                    if (btn) { btn.textContent = '✅ 已复制！'; setTimeout(function() { btn.textContent = '📋 复制链接'; }, 2000); }
                });
            } else {
                var input = document.createElement('input');
                input.value = url;
                input.style.position = 'fixed';
                input.style.left = '-9999px';
                document.body.appendChild(input);
                input.select();
                document.execCommand('copy');
                document.body.removeChild(input);
                var btn = document.getElementById('btn-copy-url-action');
                if (btn) { btn.textContent = '✅ 已复制！'; setTimeout(function() { btn.textContent = '📋 复制链接'; }, 2000); }
            }
        }

        // Expose showPage for SPA navigation from home view
        window.showPage = showPage;
        // Expose state globally so oracle system (outside IIFE) can write fortune to it
        window.appState = state;
        // Expose generatePromptSummary so oracle event handlers can call it
        window.generatePromptSummary = generatePromptSummary;
        // Expose API key dialog and SVG fallback for inline onclick handlers
        window.showApiKeyDialog = showApiKeyDialog;
        window.showMeshyKeyDialog = showMeshyKeyDialog;
        window.generateSVGFallback = generateSVGFallback;

        if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
        else init();

        // ===== 神兽天赋签系统 =====
        const oracleData = {
            nature: [
                '天生好奇，见到什么都要凑过去闻一闻',
                '性格憨厚，走路慢吞吞但特别可靠',
                '机灵古怪，总能想出别人想不到的办法',
                '勇敢无畏，遇到危险总是冲在最前面',
                '贪吃成性，路过厨房就走不动路',
                '爱睡懒觉，晴天喜欢在屋顶晒太阳',
                '温柔善良，看到受伤的小鸟会心疼',
                '调皮捣蛋，最爱偷偷藏起别人的东西'
            ],
            power: [
                '能召唤细雨，让 dry 的土地重新湿润',
                '脚踩生风，跑起来比马还快',
                '力大无穷，能搬动比自己大十倍的石头',
                '会隐身术，想玩捉迷藏时最厉害',
                '能变小，小到可以钻进钥匙孔',
                '能吐水，像消防栓一样扑灭火灾',
                '能听懂动物的语言，和鸟儿聊天',
                '能预知天气，下雨前一天就知道了'
            ],
            hobby: [
                '喜欢在屋顶晒太阳，一看就是一下午',
                '最爱吃糖葫芦，尤其是山楂味的',
                '偷偷收集铜钱，床底下藏了一大罐',
                '在城楼上数星星，每晚都数到睡着',
                '喜欢听故事，尤其是老爷爷讲古',
                '爱在护城河边钓鱼，虽然总是钓不到',
                '喜欢在胡同里探险，每个角落都熟悉',
                '爱画画，用爪子在沙地上画各种图案'
            ],
            origin: [
                '生于清晨第一缕阳光中，带着朝露的气息',
                '诞生于雷雨交加之夜，伴随着闪电降临',
                '伴随春风而来，桃花盛开的那天醒来',
                '从正阳门的石缝里钻出来，带着古老的记忆',
                '在月圆之夜凝聚月光而成，全身银光闪闪',
                '从一幅古画中走出，带着千年的色彩',
                '在孩童的笑声中诞生，天生就喜欢热闹',
                '从护城河的水底浮起，带着水草的清香'
            ]
        };
        
        let fortune = {
            nature: '',
            power: '',
            hobby: '',
            origin: '',
            story: ''
        };
        
        function drawOracle() {
            // Randomly select from each dimension
            fortune.nature = oracleData.nature[Math.floor(Math.random() * oracleData.nature.length)];
            fortune.power = oracleData.power[Math.floor(Math.random() * oracleData.power.length)];
            fortune.hobby = oracleData.hobby[Math.floor(Math.random() * oracleData.hobby.length)];
            fortune.origin = oracleData.origin[Math.floor(Math.random() * oracleData.origin.length)];
            
            // Generate story
            fortune.story = `这只神兽${fortune.origin}。它${fortune.nature}，拥有${fortune.power}的能力。平时${fortune.hobby}，是正阳门下独一无二的存在。`;
            
            // Display result
            document.getElementById('oracle-nature').textContent = '天性：' + fortune.nature;
            document.getElementById('oracle-power').textContent = '神力：' + fortune.power;
            document.getElementById('oracle-hobby').textContent = '爱好：' + fortune.hobby;
            document.getElementById('oracle-origin').textContent = '来历：' + fortune.origin;
            document.getElementById('oracle-story').textContent = fortune.story;
            
            // Show result, hide tube
            document.getElementById('oracle-tube-wrapper').style.display = 'none';
            document.getElementById('oracle-result').style.display = 'block';
            
            // Update global appState so generatePromptSummary() can read fortune
            if (window.appState) {
                window.appState.fortune = fortune;
} else {
                console.error('[ERROR] window.appState not found!');
            }
        }
        
        function showOracleScreen() {
            document.getElementById('oracle-screen').style.display = 'flex';
            document.getElementById('oracle-tube-wrapper').style.display = 'block';
            document.getElementById('oracle-result').style.display = 'none';
        }
        
        function hideOracleScreen() {
            document.getElementById('oracle-screen').style.display = 'none';
        }

        
        // ===== Oracle Event Handlers =====
        document.addEventListener('DOMContentLoaded', function() {
            // P6 next button - show oracle screen
            var p6NextBtn = document.getElementById('btn-next-6');
            if (p6NextBtn && p6NextBtn.textContent.includes('抽取天赋签')) {
                p6NextBtn.addEventListener('click', function(e) {
                    e.preventDefault();
                    e.stopPropagation();
                    showOracleScreen();
                });
            }
            
            // Oracle tube click - shake and draw
            var tubeWrapper = document.getElementById('oracle-tube-wrapper');
            if (tubeWrapper) {
                tubeWrapper.addEventListener('click', function() {
                    var tube = document.getElementById('oracle-tube');
                    if (tube && !tube.classList.contains('shaking')) {
                        tube.classList.add('shaking');
                        setTimeout(function() {
                            tube.classList.remove('shaking');
                            drawOracle();
                        }, 1800);
                    }
                });
            }
            
            // View prompt button - go to P7
            var viewPromptBtn = document.getElementById('btn-view-prompt');
            if (viewPromptBtn) {
                viewPromptBtn.addEventListener('click', function() {
                    hideOracleScreen();
                    showPage(9);
                    generatePromptSummary();
                });
            }

            // ===== 铛铛车提示词页 =====
            function showTramPromptPage() {
                var page9 = document.getElementById('page-9');
                if (!page9) return;
                var title = page9.querySelector('.page-title');
                if (title) title.textContent = '确认铛铛车提示词';
                var subtitle = page9.querySelector('.page-subtitle');
                if (subtitle) subtitle.textContent = '确认你的铛铛车设计，准备生成';
                var progressBar = page9.querySelector('.progress-bar');
                if (progressBar) {
                    progressBar.innerHTML = '<div class="progress-step"><div class="progress-circle completed">✓</div><div class="progress-label">车身颜色</div></div>' +
                        '<div class="progress-step"><div class="progress-circle completed">✓</div><div class="progress-label">车型年代</div></div>' +
                        '<div class="progress-step"><div class="progress-circle completed">✓</div><div class="progress-label">装饰细节</div></div>' +
                        '<div class="progress-step"><div class="progress-circle active">4</div><div class="progress-label active">确认提示词</div></div>';
                }
                var promptTags = page9.querySelector('.prompt-tags');
                if (promptTags) promptTags.innerHTML = '';
                generateTramPromptSummary();
                var genBtn = page9.querySelector('.btn-generate');
                if (genBtn) genBtn.textContent = '🎨 开始AI生成';
                var tipText = page9.querySelector('.tip-text');
                if (tipText) tipText.textContent = '🎯 点击下方按钮开始AI生成你的铛铛车';
                state.currentPage = 9;
                document.querySelectorAll('.page-section').forEach(function(p) { p.classList.remove('active'); });
                page9.classList.add('active');
                // 确保预览区刷新：显示铛铛车图片而非默认怪兽SVG
                if (typeof updatePreview === 'function') updatePreview();
                window.scrollTo({ top: 0, behavior: 'smooth' });
            }

            function generateTramPromptSummary() {
                var promptDiv = document.querySelector('#page-9 .prompt-text');
                if (!promptDiv) return;
                var colorName = '经典绿';
                var colorHex = '#2E7D32';
                if (state.tramColor) {
                    var tc = tramColors.find(function(c) { return c.id === state.tramColor; });
                    if (tc) { colorName = tc.name; colorHex = tc.hex; }
                }
                var eraName = '1924年老式';
                if (state.tramEra) {
                    var te = tramEras.find(function(e) { return e.id === state.tramEra; });
                    if (te) eraName = te.name;
                }
                var decorNames = [];
                if (state.tramDecors && state.tramDecors.length > 0) {
                    state.tramDecors.forEach(function(d) {
                        var td = tramDecors.find(function(x) { return x.id === d; });
                        if (td) decorNames.push(td.name);
                    });
                }
                var prompt = '中国传统手绘风格，北京正阳门前的有轨铛铛车，' + eraName + '，' + colorName + '车身';
                if (decorNames.length > 0) prompt += '，' + decorNames.join('、');
                prompt += '，背景是正阳门城楼和前门大街，水墨淡彩风格，传统工笔画质感，8k高清';
                var summaryHtml = '<div class="tram-prompt-summary">';
                summaryHtml += '<h3>🚃 铛铛车设计摘要</h3>';
                summaryHtml += '<div class="prompt-row"><span class="prompt-label">车身颜色:</span> <span style="color:' + colorHex + ';">●</span> ' + colorName + '</div>';
                summaryHtml += '<div class="prompt-row"><span class="prompt-label">车型年代:</span> ' + eraName + '</div>';
                if (decorNames.length > 0) summaryHtml += '<div class="prompt-row"><span class="prompt-label">装饰细节:</span> ' + decorNames.join('、') + '</div>';
                summaryHtml += '<div class="prompt-text-final">' + prompt + '</div>';
                summaryHtml += '</div>';
                promptDiv.innerHTML = summaryHtml;
                var genBtn = document.querySelector('#page-9 .btn-generate');
                if (genBtn) genBtn.textContent = '🎨 生成铛铛车';
            }

            // ===== 完成页功能 =====
            function populateCompletionPage() {
                var svgWrap = document.getElementById('creature-card-svg-wrap');
                var nameEl = document.getElementById('creature-card-name');
                var tagsEl = document.getElementById('creature-card-tags');
                if (!svgWrap || !nameEl || !tagsEl) return;
                if (state.isTramMode) {
                    var tc = tramColors.find(function(c) { return c.id === state.tramColor; }) || tramColors[0];
                    svgWrap.innerHTML = '<svg width="160" height="120" viewBox="0 0 140 80">' +
                        '<rect x="10" y="20" width="120" height="35" rx="5" fill="' + tc.hex + '"/>' +
                        '<rect x="18" y="25" width="20" height="18" rx="2" fill="white" opacity="0.8"/>' +
                        '<rect x="42" y="25" width="20" height="18" rx="2" fill="white" opacity="0.8"/>' +
                        '<rect x="66" y="25" width="20" height="18" rx="2" fill="white" opacity="0.8"/>' +
                        '<rect x="90" y="25" width="20" height="18" rx="2" fill="white" opacity="0.8"/>' +
                        '<rect x="8" y="12" width="124" height="12" rx="3" fill="#1B5E20"/>' +
                        '<circle cx="30" cy="60" r="8" fill="#333"/><circle cx="110" cy="60" r="8" fill="#333"/>' +
                        '<circle cx="30" cy="60" r="4" fill="#666"/><circle cx="110" cy="60" r="4" fill="#666"/>' +
                        '<line x1="70" y1="12" x2="70" y2="2" stroke="#555" stroke-width="2"/>' +
                        '<circle cx="70" cy="2" r="3" fill="#FFC107"/>' +
                        '</svg>';
                    var te = tramEras.find(function(e) { return e.id === state.tramEra; }) || tramEras[0];
                    nameEl.textContent = '我的铛铛车';
                    var tags = [];
                    tags.push({text: tc.name + '车身', type: 'normal'});
                    tags.push({text: te.name, type: 'normal'});
                    if (state.tramDecors && state.tramDecors.length > 0) {
                        var decorNames = [];
                        state.tramDecors.forEach(function(d) {
                            var td = tramDecors.find(function(x) { return x.id === d; });
                            if (td) decorNames.push(td.name);
                        });
                        if (decorNames.length > 0) tags.push({text: '装饰：' + decorNames.join('、'), type: 'gold'});
                    }
                    tagsEl.innerHTML = tags.map(function(t) {
                        return '<span class="creature-card-tag' + (t.type === 'gold' ? ' gold' : '') + '">' + t.text + '</span>';
                    }).join('');
                    return;
                }
                var modelSvg = document.querySelector('#model-3d-result');
                if (modelSvg) {
                    svgWrap.innerHTML = modelSvg.outerHTML.replace('width="100"', 'width="160"').replace('height="100"', 'height="160"');
                } else {
                    svgWrap.innerHTML = '<svg width="160" height="160" viewBox="0 0 120 120"><ellipse cx="60" cy="75" rx="35" ry="28" fill="#C45C5C"/><circle cx="60" cy="48" r="26" fill="#C45C5C"/><ellipse cx="34" cy="28" rx="12" ry="18" fill="#C45C5C"/><ellipse cx="86" cy="28" rx="12" ry="18" fill="#C45C5C"/><circle cx="50" cy="45" r="7" fill="white"/><circle cx="70" cy="45" r="7" fill="white"/><circle cx="50" cy="45" r="3.5" fill="#3a2a1a"/><circle cx="70" cy="45" r="3.5" fill="#3a2a1a"/><ellipse cx="60" cy="58" rx="4" ry="2.5" fill="#8B4513"/></svg>';
                }
                var cr = state.selectedCreature ? findById(creatures, state.selectedCreature) : null;
                nameEl.textContent = cr ? cr.name : '我的神兽';
                var tags = [];
                if (cr) tags.push({text: cr.desc, type: 'gold'});
                if (state.selectedPatterns && state.selectedPatterns.length > 0) {
                    var pnames = state.selectedPatterns.map(function(p) { var pp = findById(patterns, p); return pp ? pp.name : ''; }).filter(Boolean);
                    if (pnames.length > 0) tags.push({text: '纹饰：' + pnames.join('、'), type: 'normal'});
                }
                if (state.selectedExpression) {
                    var ex = findById(expressions, state.selectedExpression);
                    if (ex) tags.push({text: ex.emoji + ' ' + ex.name, type: 'normal'});
                }
                if (state.selectedColors && state.selectedColors.length > 0) {
                    var cnames = state.selectedColors.map(function(c) { var cc = findById(colors, c); return cc ? cc.name : ''; }).filter(Boolean);
                    if (cnames.length > 0) tags.push({text: '配色：' + cnames.join('、'), type: 'normal'});
                }
                if (state.selectedElements && state.selectedElements.length > 0) {
                    var enames = state.selectedElements.map(function(e) { var ee = findById(elements, e); return ee ? ee.name : ''; }).filter(Boolean);
                    if (enames.length > 0) tags.push({text: '元素：' + enames.join('、'), type: 'normal'});
                }
                tagsEl.innerHTML = tags.map(function(t) {
                    return '<span class="creature-card-tag' + (t.type === 'gold' ? ' gold' : '') + '">' + t.text + '</span>';
                }).join('');
            }

            function saveToAlbum() {
                var canvas = document.createElement('canvas');
                canvas.width = 750; canvas.height = 1000;
                var ctx = canvas.getContext('2d');
                ctx.fillStyle = '#FAF8F0';
                ctx.fillRect(0, 0, 750, 1000);
                ctx.strokeStyle = '#c04830'; ctx.lineWidth = 3; ctx.strokeRect(20, 20, 710, 960);
                ctx.strokeStyle = '#b8943e'; ctx.lineWidth = 1; ctx.strokeRect(25, 25, 700, 950);
                ctx.font = 'bold 36px KaiTi, STKaiti, serif'; ctx.fillStyle = '#3a2a1a'; ctx.textAlign = 'center';
                ctx.fillText('中轴奇游记·神兽档案', 375, 70);
                ctx.strokeStyle = '#c04830'; ctx.lineWidth = 2;
                ctx.beginPath(); ctx.moveTo(100, 90); ctx.lineTo(650, 90); ctx.stroke();
                var svgWrap = document.getElementById('creature-card-svg-wrap');
                var svgEl = svgWrap ? svgWrap.querySelector('svg') : null;
                if (svgEl) {
                    var svgData = new XMLSerializer().serializeToString(svgEl);
                    var img = new Image();
                    img.onload = function() { ctx.drawImage(img, 225, 120, 300, 300); drawRestOfCard(ctx, canvas); };
                    img.src = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svgData)));
                } else { drawRestOfCard(ctx, canvas); }
            }

            function drawRestOfCard(ctx, canvas) {
                ctx.font = 'bold 30px KaiTi, STKaiti, serif'; ctx.fillStyle = '#3a2a1a'; ctx.textAlign = 'center';
                var creatureName = '';
                if (state.selectedCreature) { var cr = findById(creatures, state.selectedCreature); if (cr) creatureName = cr.name; }
                ctx.fillText(creatureName || '我的神兽', 375, 480);
                ctx.strokeStyle = '#b8943e'; ctx.lineWidth = 1;
                ctx.beginPath(); ctx.moveTo(200, 500); ctx.lineTo(550, 500); ctx.stroke();
                ctx.font = '22px KaiTi, STKaiti, serif'; ctx.fillStyle = '#3a2a1a';
                var y = 540;
                if (state.selectedCreature) { var cr2 = findById(creatures, state.selectedCreature); if (cr2) { ctx.fillText('种类：' + cr2.desc, 375, y); y += 38; } }
                if (state.selectedPatterns && state.selectedPatterns.length > 0) {
                    var pnames = state.selectedPatterns.map(function(p) { var pp = findById(patterns, p); return pp ? pp.name : ''; }).filter(Boolean);
                    if (pnames.length > 0) { ctx.fillText('纹饰：' + pnames.join('、'), 375, y); y += 38; }
                }
                if (state.selectedExpression) { var ex = findById(expressions, state.selectedExpression); if (ex) { ctx.fillText('表情：' + ex.emoji + ' ' + ex.name, 375, y); y += 38; } }
                if (state.selectedColors && state.selectedColors.length > 0) {
                    var cnames = state.selectedColors.map(function(c) { var cc = findById(colors, c); return cc ? cc.name : ''; }).filter(Boolean);
                    if (cnames.length > 0) { ctx.fillText('颜色：' + cnames.join('、'), 375, y); y += 38; }
                }
                if (state.selectedElements && state.selectedElements.length > 0) {
                    var enames = state.selectedElements.map(function(e) { var ee = findById(elements, e); return ee ? ee.name : ''; }).filter(Boolean);
                    if (enames.length > 0) { ctx.fillText('元素：' + enames.join('、'), 375, y); y += 38; }
                }
                ctx.font = '16px KaiTi, STKaiti, serif'; ctx.fillStyle = '#7a6a56';
                ctx.fillText('北京中轴线 · 正阳门·神兽工坊', 375, 900);
                ctx.fillText(new Date().toLocaleDateString('zh-CN'), 375, 930);
                canvas.toBlob(function(blob) {
                    var url = URL.createObjectURL(blob);
                    var a = document.createElement('a');
                    a.href = url; a.download = '我的神兽_' + (creatureName || '档案') + '.png';
                    document.body.appendChild(a); a.click(); document.body.removeChild(a);
                    URL.revokeObjectURL(url);
                    showSaveSuccess();
                }, 'image/png');
            }

            function showSaveSuccess() {
                var toast = document.createElement('div');
                toast.className = 'save-success-toast';
                toast.innerHTML = '✅ 已保存到相册<br><span style="font-size:13px;opacity:0.8;">长按图片可保存到本地</span>';
                document.body.appendChild(toast);
                setTimeout(function() { toast.remove(); }, 2500);
            }

            function shareToParents() {
                if (navigator.share) {
                    navigator.share({ title: '我的中轴奇游记·神兽档案', text: '我在中轴奇游记创建了一只专属神兽！快来看看！', url: window.location.href })
                    .catch(function(err) { if (err.name !== 'AbortError') showShareFallback(); });
                } else { showShareFallback(); }
            }

            function showShareFallback() {
                var sharePanel = document.createElement('div');
                sharePanel.className = 'share-fallback-panel';
                sharePanel.innerHTML = '<div class="share-fallback-content">' +
                    '<h3>📤 分享给家长</h3>' +
                    '<p>长按复制链接，发送给爸爸妈妈：</p>' +
                    '<div class="share-url-box">' + window.location.href + '</div>' +
                    '<button class="btn-copy-url" id="btn-copy-url-action">📋 复制链接</button>' +
                    '<button class="btn-close-share" id="btn-close-share-action">关闭</button>' +
                    '</div>';
                document.body.appendChild(sharePanel);
                document.getElementById('btn-copy-url-action').addEventListener('click', function() { copyURL(); });
                document.getElementById('btn-close-share-action').addEventListener('click', function() { sharePanel.remove(); });
                sharePanel.addEventListener('click', function(e) { if (e.target === sharePanel) sharePanel.remove(); });
            }

            function copyURL() {
                var url = window.location.href;
                if (navigator.clipboard) {
                    navigator.clipboard.writeText(url).then(function() {
                        var btn = document.getElementById('btn-copy-url-action');
                        if (btn) { btn.textContent = '✅ 已复制！'; setTimeout(function() { btn.textContent = '📋 复制链接'; }, 2000); }
                    });
                } else {
                    var input = document.createElement('input');
                    input.value = url; input.style.position = 'fixed'; input.style.left = '-9999px';
                    document.body.appendChild(input); input.select(); document.execCommand('copy');
                    document.body.removeChild(input);
                    var btn = document.getElementById('btn-copy-url-action');
                    if (btn) { btn.textContent = '✅ 已复制！'; setTimeout(function() { btn.textContent = '📋 复制链接'; }, 2000); }
                }
            }

            // ===== 神兽天赋签系统 =====
            var oracleData = {
                nature: ['天生好奇，见到什么都要凑过去闻一闻','性格憨厚，走路慢吞吞但特别可靠','机灵古怪，总能想出别人想不到的办法','勇敢无畏，遇到危险总是冲在最前面','贪吃成性，路过厨房就走不动路','爱睡懒觉，晴天喜欢在屋顶晒太阳','温柔善良，看到受伤的小鸟会心疼','调皮捣蛋，最爱偷偷藏起别人的东西'],
                power: ['能召唤细雨，让干涸的土地重新湿润','脚踩生风，跑起来比马还快','力大无穷，能搬动比自己大十倍的石头','会隐身术，想玩捉迷藏时最厉害','能变小，小到可以钻进钥匙孔','能吐水，像消防栓一样扑灭火灾','能听懂动物的语言，和鸟儿聊天','能预知天气，下雨前一天就知道了'],
                hobby: ['喜欢在屋顶晒太阳，一看就是一下午','最爱吃糖葫芦，尤其是山楂味的','偷偷收集铜钱，床底下藏了一大罐','在城楼上数星星，每晚都数到睡着','喜欢听故事，尤其是老爷爷讲古','爱在护城河边钓鱼，虽然总是钓不到','喜欢在胡同里探险，每个角落都熟悉','爱画画，用爪子在沙地上画各种图案'],
                origin: ['生于清晨第一缕阳光中，带着朝露的气息','诞生于雷雨交加之夜，伴随着闪电降临','伴随春风而来，桃花盛开的那天醒来','从正阳门的石缝里钻出来，带着古老的记忆','在月圆之夜凝聚月光而成，全身银光闪闪','从一幅古画中走出，带着千年的色彩','在孩童的笑声中诞生，天生就喜欢热闹','从护城河的水底浮起，带着水草的清香']
            };
            var fortune = { nature: '', power: '', hobby: '', origin: '', story: '' };

            function drawOracle() {
                fortune.nature = oracleData.nature[Math.floor(Math.random() * oracleData.nature.length)];
                fortune.power = oracleData.power[Math.floor(Math.random() * oracleData.power.length)];
                fortune.hobby = oracleData.hobby[Math.floor(Math.random() * oracleData.hobby.length)];
                fortune.origin = oracleData.origin[Math.floor(Math.random() * oracleData.origin.length)];
                fortune.story = '这只神兽' + fortune.origin + '。它' + fortune.nature + '，拥有' + fortune.power + '的能力。平时' + fortune.hobby + '，是正阳门下独一无二的存在。';
                document.getElementById('oracle-nature').textContent = '天性：' + fortune.nature;
                document.getElementById('oracle-power').textContent = '神力：' + fortune.power;
                document.getElementById('oracle-hobby').textContent = '爱好：' + fortune.hobby;
                document.getElementById('oracle-origin').textContent = '来历：' + fortune.origin;
                document.getElementById('oracle-story').textContent = fortune.story;
                document.getElementById('oracle-tube-wrapper').style.display = 'none';
                document.getElementById('oracle-result').style.display = 'block';
                if (window.appState) window.appState.fortune = fortune;
            }

            function showOracleScreen() {
                document.getElementById('oracle-screen').style.display = 'flex';
                document.getElementById('oracle-tube-wrapper').style.display = 'block';
                document.getElementById('oracle-result').style.display = 'none';
            }

            function hideOracleScreen() {
                document.getElementById('oracle-screen').style.display = 'none';
            }

            // Expose globals
            window.showPage = showPage;
            window.appState = state;
            window.generatePromptSummary = generatePromptSummary;
            window.generateSVGFallback = generateSVGFallback;
        });
