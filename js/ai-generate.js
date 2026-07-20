/**
 * ai-generate.js - 火山引擎Seedream API调用、图片生成逻辑
 */

        // ============ AI 图片生成 API 层 ============
        
        // 调用火山引擎 Seedream 4.5 API 生成单张图片（通过 Worker 代理）
        async function callSeedreamAPI(prompt, options) {
            // 先确保已认证
            var authed = await ensureAuthenticated();
            if (!authed) throw new Error('需要输入访问密码才能使用AI功能');
            
            // 通过 Worker 代理调用，API Key 由服务端管理
            options = options || {};
            var proxyUrl = MESHY_CONFIG.proxyUrl || 'https://api.mindbubble.cloud';
            var requestBody = {
                model: AI_CONFIG.model,
                prompt: prompt,
                size: AI_CONFIG.size,
                response_format: 'url',
                watermark: false
            };
            // 如果有参考图，加入 image 字段（Seedream 4.5 支持图片URL数组，最多14张）
            if (options.refImages && options.refImages.length > 0) {
                requestBody.image = options.refImages;
            }
            var headers = { 'Content-Type': 'application/json' };
            var authHeader = getAuthHeader();
            if (authHeader) headers['Authorization'] = authHeader;
            
            // 带重试的请求函数
            async function fetchWithRetry(maxRetries = 3) {
                for (let attempt = 0; attempt <= maxRetries; attempt++) {
                    var response = await fetch(proxyUrl + '/api/2d/generate', {
                        method: 'POST',
                        headers: headers,
                        body: JSON.stringify(requestBody)
                    });
                    
                    if (response.ok) {
                        return await handleSeedreamResponse(response);
                    }
                    
                    var errText = '';
                    var errCode = '';
                    try { 
                        var errData = await response.json(); 
                        errText = (errData.error && errData.error.message) ? errData.error.message : (errData.error || JSON.stringify(errData));
                        errCode = errData.code || '';
                    } catch(e) { errText = response.statusText; }
                    
                    // Token 失效，清除后重试一次
                    if (response.status === 401 && errCode === 'AUTH_REQUIRED') {
                        clearToken();
                        var retryAuthed = await ensureAuthenticated();
                        if (retryAuthed) {
                            headers['Authorization'] = getAuthHeader();
                            continue;
                        }
                        throw new Error('访问密码验证失败');
                    }
                    // 检测服务端配置错误
                    if (response.status === 500 && /未配置/.test(errText)) {
                        throw new Error('服务端未配置API Key，请联系管理员');
                    }
                    // 检测限流 - 等待后重试
                    if (response.status === 429) {
                        if (attempt < maxRetries) {
                            console.log(`[2D] 遇到429限流，${3 * (attempt + 1)}秒后重试 (第${attempt + 1}次)...`);
                            await new Promise(r => setTimeout(r, 3000 * (attempt + 1)));
                            continue;
                        }
                        throw new Error('请求太频繁，请稍后再试');
                    }
                    throw new Error('API错误(' + response.status + '): ' + errText);
                }
            }
            return await fetchWithRetry();
        }
        
        async function handleSeedreamResponse(response) {
            var data = await response.json();
            if (data.data && data.data.length > 0 && data.data[0].url) {
                var url = data.data[0].url;
                // 立即将临时URL转为base64 data URI，避免URL过期
                try {
                    var imgResp = await fetch(url);
                    var blob = await imgResp.blob();
                    var dataUri = await new Promise(function(resolve, reject) {
                        var reader = new FileReader();
                        reader.onloadend = function() { resolve(reader.result); };
                        reader.onerror = function() { reject(new Error('base64转换失败')); };
                        reader.readAsDataURL(blob);
                    });
                    console.log('[Seedream] 图片已转为base64，长度:', dataUri.length);
                    return dataUri;
                } catch(e) {
                    console.warn('[Seedream] base64转换失败，使用原始URL:', e);
                    return url; // 降级：返回原始URL
                }
            }
            throw new Error('API返回数据异常');
        }
        
        // 为候选卡片创建loading状态HTML
        function createAILoadingHTML(styleName) {
            return '<div class="ai-loading">' +
                '<div class="spinner"></div>' +
                '<div class="loading-label">AI绘制中...</div>' +
                '</div>';
        }
        
        // 为候选卡片创建图片HTML
        function createAIImageHTML(url, styleName) {
            return '<img src="' + url + '" alt="' + styleName + '" loading="lazy" onerror="this.parentNode.innerHTML=\'<div class=&quot;ai-error&quot;>图片加载失败</div>\'"  />';
        }
        
        // 更新单个候选卡片UI（并行模式用）
        function _updateCandidateCard(grid, i, result) {
            var card = grid.querySelector('.candidate-card[data-index="' + i + '"]');
            if (!card) return;
            var imgContainer = card.querySelector('.candidate-image');
            if (result.success) {
                imgContainer.innerHTML = '<img src="' + result.url + '" alt="' + result.style.name + '" loading="lazy" style="width:100%;height:100%;object-fit:cover;border-radius:4px;" />';
                card.addEventListener('click', (function(idx, st) {
                    return function() {
                        var all = grid.querySelectorAll('.candidate-card');
                        for (var j = 0; j < all.length; j++) all[j].classList.remove('selected');
                        this.classList.add('selected');
                        state.selectedCandidate = idx;
                        var btn = document.getElementById('btn-confirm-image');
                        if (btn) btn.disabled = false;
                        var hint = document.getElementById('preview-hint-8');
                        if (hint) hint.textContent = '已选: 方案' + (idx+1) + ' · ' + st.name;
                    };
                })(result.index, result.style));
            } else {
                var isServerError = /服务端未配置|请联系管理员/.test(result.error || '');
                var isRateLimited = /请求太频繁|429/.test(result.error || '');
                var errLabel = isServerError ? '⚙️ 服务未配置' : (isRateLimited ? '⏳ 请求频繁' : '生成失败');
                imgContainer.innerHTML = '<div class="ai-error">' + errLabel + '<br/><span style="font-size:10px;opacity:0.7;">' + (result.error || '').substring(0, 30) + '</span></div>';
            }
        }

        // AI生成候选方案（通用）
        async function generateAICandidatesGeneric(grid, basePrompt, stylesConfig, refImages) {
            state._generatedImageUrls = [];
            
            // 创建loading卡片
            stylesConfig.forEach(function(style, i) {
                var card = document.createElement('div');
                card.className = 'candidate-card';
                card.dataset.index = i;
                var infoHTML = '';
                if (style.infoHTML) {
                    infoHTML = style.infoHTML;
                } else {
                    infoHTML = '<div class="candidate-info"><div class="candidate-name">' + (style.namePrefix || '方案') + (i+1) + ' · ' + style.name + '</div>' +
                        '<div class="candidate-style">' + style.desc + '</div></div>';
                }
                card.innerHTML = '<div class="candidate-image" style="background:' + style.bg + '">' +
                    createAILoadingHTML(style.name) +
                    '</div>' + infoHTML;
                grid.appendChild(card);
            });
            
            // 串行生成，每张间隔1秒（比原来2秒快，且不会被限流）
            var results = [];
            for (let i = 0; i < stylesConfig.length; i++) {
                let style = stylesConfig[i];
                var fullPrompt = basePrompt + style.suffix;
                
                // 第一张不等待，后续每张间隔1秒
                if (i > 0) {
                    console.log(`[2D] 等待1秒后生成第${i+1}个风格...`);
                    await new Promise(r => setTimeout(r, 1000));
                }
                
                var result = await callSeedreamAPI(fullPrompt, { refImages: refImages }).then(function(url) {
                    state._generatedImageUrls[i] = url;
                    // 缓存成功的AI图片URL到localStorage，供限流时作为示例图使用
                    try {
                        var cached = JSON.parse(localStorage.getItem('cached_ai_images') || '[]');
                        if (cached.indexOf(url) === -1) {
                            cached.push(url);
                            if (cached.length > 8) cached = cached.slice(cached.length - 8);
                            localStorage.setItem('cached_ai_images', JSON.stringify(cached));
                        }
                    } catch(e) { console.warn('[Cache] 缓存图片失败:', e); }
                    // 立即更新对应卡片
                    _updateCandidateCard(grid, i, { index: i, url: url, style: style, success: true });
                    return { index: i, url: url, style: style, success: true };
                }).catch(function(err) {
                    console.error('候选' + (i+1) + '生成失败:', err);
                    // 立即更新失败卡片
                    _updateCandidateCard(grid, i, { index: i, error: err.message, style: style, success: false });
                    return { index: i, error: err.message, style: style, success: false };
                });
                
                results.push(result);
            }
            var successCount = results.filter(function(r) { return r.success; }).length;
            
            // 全部失败时显示重试
            if (successCount === 0) {
                // 检测是否为服务端配置错误
                var hasServerError = results.some(function(r) {
                    return r.error && /服务端未配置|请联系管理员/.test(r.error);
                });
                // 检测限流
                var hasRateLimit = results.some(function(r) {
                    return r.error && /请求太频繁|429/.test(r.error);
                });
                
                if (hasServerError) {
                    grid.innerHTML = '<div style="grid-column:1/-1;text-align:center;padding:40px 20px;">' +
                        '<div style="font-size:40px;margin-bottom:12px;">⚙️</div>' +
                        '<div style="font-size:15px;color:#3a2a1a;margin-bottom:8px;font-weight:bold;">服务尚未配置</div>' +
                        '<div style="font-size:13px;color:#7a6a56;margin-bottom:16px;">请联系管理员配置 API Key</div>' +
                        '<button onclick="generateSVGFallback()" style="padding:12px 28px;background:white;color:#3a2a1a;border:1.5px solid #e8dcc4;border-radius:10px;font-size:14px;cursor:pointer;">使用示例图</button>' +
                        '</div>';
                } else if (hasRateLimit) {
                    grid.innerHTML = '<div style="grid-column:1/-1;text-align:center;padding:40px 20px;">' +
                        '<div style="font-size:40px;margin-bottom:12px;">⏳</div>' +
                        '<div style="font-size:15px;color:#3a2a1a;margin-bottom:8px;font-weight:bold;">请求太频繁</div>' +
                        '<div style="font-size:13px;color:#7a6a56;margin-bottom:16px;">请稍后再试</div>' +
                        '<button onclick="generateCandidates()" style="padding:10px 24px;background:#c04830;color:white;border:none;border-radius:8px;font-size:14px;cursor:pointer;margin-right:8px;">\uD83D\uDD04 重试</button>' +
                        '<button onclick="generateSVGFallback()" style="padding:10px 24px;background:white;color:#3a2a1a;border:1.5px solid #e8dcc4;border-radius:8px;font-size:14px;cursor:pointer;">使用示例图</button>' +
                        '</div>';
                } else {
                    grid.innerHTML = '<div style="grid-column:1/-1;text-align:center;padding:40px 20px;">' +
                        '<div style="font-size:40px;margin-bottom:12px;">\uD83C\uDFA8</div>' +
                        '<div style="font-size:14px;color:#7a6a56;margin-bottom:16px;">AI图片生成遇到问题</div>' +
                        '<button onclick="generateCandidates()" style="padding:10px 24px;background:#c04830;color:white;border:none;border-radius:8px;font-size:14px;cursor:pointer;margin-right:8px;">\uD83D\uDD04 重试</button>' +
                        '<button onclick="generateSVGFallback()" style="padding:10px 24px;background:white;color:#3a2a1a;border:1.5px solid #e8dcc4;border-radius:8px;font-size:14px;cursor:pointer;">使用示例图</button>' +
                        '</div>';
                }
            }
            
            return successCount;
        }
        
        // SVG占位图降级方案（优先使用缓存的AI图片）
        function generateSVGFallback() {
            var grid = document.getElementById('candidate-grid');
            if (!grid) return;
            grid.innerHTML = '';
            
            // 优先从localStorage获取缓存的AI生成图片
            var cachedUrls = [];
            try {
                cachedUrls = JSON.parse(localStorage.getItem('cached_ai_images') || '[]');
            } catch(e) { cachedUrls = []; }
            
            // 兜底：内置真实AI图片，确保限流时也有图可用
            var FALLBACK_IMAGES = [
                'assets/fallback-beast-1.jpg',
                'assets/fallback-beast-2.jpg',
                'assets/fallback-beast-3.jpg',
                'assets/fallback-beast-4.jpg'
            ];
            
            // 合并：缓存 + 兜底
            if (cachedUrls.length === 0) {
                cachedUrls = FALLBACK_IMAGES.slice();
            }
            
            if (cachedUrls.length > 0) {
                // 使用缓存的AI图片作为示例图
                state._generatedImageUrls = [];
                var styleNames = ['经典风格', '水墨风格', '华丽风格', '清新风格', '古朴风格', '彩绘风格', '梦幻风格', '写实风格'];
                var showCount = Math.min(cachedUrls.length, 4); // 最多显示4张
                
                for (var i = 0; i < showCount; i++) {
                    (function(idx) {
                        var url = cachedUrls[cachedUrls.length - showCount + idx];
                        state._generatedImageUrls[idx] = url;
                        var styleName = styleNames[idx] || '方案' + (idx + 1);
                        var card = document.createElement('div');
                        card.className = 'candidate-card';
                        card.dataset.index = idx;
                        card.innerHTML = '<div class="candidate-image" style="background:#f5f0e8;">' +
                            '<img src="' + url + '" alt="' + styleName + '" loading="lazy" style="width:100%;height:100%;object-fit:cover;border-radius:4px;" />' +
                            '</div>' +
                            '<div class="candidate-info"><div class="candidate-name">方案' + (idx+1) + ' · 历史作品</div>' +
                            '<div class="candidate-style">之前生成的AI图片</div></div>';
                        card.addEventListener('click', function() {
                            var all = grid.querySelectorAll('.candidate-card');
                            for (var j = 0; j < all.length; j++) all[j].classList.remove('selected');
                            this.classList.add('selected');
                            state.selectedCandidate = idx;
                            var btn = document.getElementById('btn-confirm-image');
                            if (btn) btn.disabled = false;
                            var hint = document.getElementById('preview-hint-8');
                            if (hint) hint.textContent = '已选: 方案' + (idx+1) + ' · 历史作品';
                        });
                        grid.appendChild(card);
                    })(i);
                }
                
                // 显示提示
                var notice = document.createElement('div');
                notice.style.cssText = 'grid-column:1/-1;text-align:center;padding:10px;font-size:12px;color:#7a6a56;background:#FFF8E1;border-radius:8px;margin-top:8px;';
                notice.innerHTML = '💡 以上为之前成功生成的AI图片，可直接用于3D建模';
                grid.appendChild(notice);
                return;
            }
            
            // 没有缓存图片时，使用SVG占位图
            if (state.isTramMode) {
                generateTramCandidatesSVG(grid);
            } else {
                generateBeastCandidatesSVG(grid);
            }
        }
        
        
        // ============ P8: 候选图片生成 ============
        // 主入口：候选图片生成（通过 Worker 代理调用，API Key 由服务端管理）
        async function generateCandidates() {
            var grid = document.getElementById('candidate-grid');
            if (!grid) return;
            grid.innerHTML = '';
            
            // API Key 由 Worker 服务端管理，直接尝试生成
            // 如果服务端未配置，会在请求时返回错误，由错误处理逻辑处理
            
            // 获取提示词
            var basePrompt = state._lastAiPrompt || '一只可爱的中国神话小神兽，中国传统风格，3D渲染，干净背景，儿童插画风格，高质量';
            
            if (state.isTramMode) {
                // 铛铛车AI生成（不传纹饰参考图）
                var tramStyles = [
                    { name: '经典复古', desc: '原汁原味老北京', suffix: '，复古怀旧风格，老照片质感，暖黄色调，1920年代老北京氛围', bg: 'linear-gradient(135deg, #E8F5E9, #C8E6C9)' },
                    { name: '现代简约', desc: '清新明快风格', suffix: '，现代简约插画风格，明亮清新的色彩，简洁线条，轻松愉快', bg: 'linear-gradient(135deg, #E3F2FD, #BBDEFB)' },
                    { name: '金色华贵', desc: '皇家气派', suffix: '，皇家宫廷风格，金黄色调，华丽精致，故宫元素装饰', bg: 'linear-gradient(135deg, #FFF8E1, #FFE082)' },
                    { name: '水墨丹青', desc: '传统国画风', suffix: '，中国传统水墨画风格，毛笔笔触，淡雅色调，国画质感', bg: 'linear-gradient(135deg, #f5f0e8, #e8dcc8)' }
                ];
                await generateAICandidatesGeneric(grid, basePrompt, tramStyles);
            } else {
                // 神兽AI生成：收集选中纹饰的参考图 URL
                var patternRefImages = [];
                if (state.selectedPatterns && state.selectedPatterns.length > 0) {
                    state.selectedPatterns.forEach(function(p) {
                        var pt = patterns.find(function(x) { return x.id === p; });
                        if (pt && pt.image) patternRefImages.push(pt.image);
                    });
                }
                console.log('[generateCandidates] 纹饰参考图:', patternRefImages);
                
                var beastStyles = [
                    { name: '古石刻韵', desc: '石雕斑驳质感', suffix: '，中国古代石雕质感，青石材质，表面有岁月斑驳的痕迹，石刻线条流畅，博物馆文物摄影风格，柔和灯光', bg: 'linear-gradient(135deg, #e8e4dc, #d4cfc5)' },
                    { name: '琉璃焕彩', desc: '宫城琉璃光泽', suffix: '，中国传统琉璃釉彩风格，表面有光泽质感，色彩明亮饱满，故宫琉璃瓦质感，光线折射微光', bg: 'linear-gradient(135deg, #fef9e7, #f5e6a3)' },
                    { name: '青铜古韵', desc: '青铜器古朴感', suffix: '，中国古代青铜器质感，铜绿色锈迹斑驳，金属光泽，饕餮纹饰风格，博物馆展柜灯光', bg: 'linear-gradient(135deg, #e8efe8, #b8c9b8)' },
                    { name: '水墨丹青', desc: '传统国画风', suffix: '，中国传统水墨画风格，毛笔笔触，宣纸质感，淡雅色调，留白意境', bg: 'linear-gradient(135deg, #f5f0e8, #e8dcc8)' }
                ];
                await generateAICandidatesGeneric(grid, basePrompt, beastStyles, patternRefImages);
            }
        }
        
        
        
        // 生成铛铛车候选方案
        function generateTramCandidatesSVG(grid) {
            // 获取铛铛车配置
            var tramColor = tramColors.find(function(c) { return c.id === state.tramColor; }) || tramColors[0];
            var tramEra = tramEras.find(function(e) { return e.id === state.tramEra; }) || tramEras[0];
            var decorNames = [];
            if (state.tramDecors && state.tramDecors.length > 0) {
                state.tramDecors.forEach(function(d) {
                    var td = tramDecors.find(function(x) { return x.id === d; });
                    if (td) decorNames.push(td.name);
                });
            }
            
            // 生成4个铛铛车候选方案
            var tramStyles = [
                { name: '经典复古', desc: '原汁原味老北京', bg: 'linear-gradient(135deg, #E8F5E9, #C8E6C9)' },
                { name: '现代简约', desc: '清新明快风格', bg: 'linear-gradient(135deg, #E3F2FD, #BBDEFB)' },
                { name: '金色华贵', desc: '皇家气派', bg: 'linear-gradient(135deg, #FFF8E1, #FFE082)' },
                { name: '水墨丹青', desc: '传统国画风', bg: 'linear-gradient(135deg, #f5f0e8, #e8dcc8)' }
            ];
            
            tramStyles.forEach(function(style, i) {
                var card = document.createElement('div');
                card.className = 'candidate-card';
                card.dataset.index = i;
                card.innerHTML = '<div class="candidate-image" style="background:' + style.bg + '">' +
                    '<svg width="140" height="80" viewBox="0 0 140 80">' +
                    // 车身
                    '<rect x="20" y="25" width="100" height="35" rx="5" fill="' + tramColor.hex + '"/>' +
                    // 车窗
                    '<rect x="28" y="30" width="18" height="18" rx="2" fill="white" opacity="0.8"/>' +
                    '<rect x="50" y="30" width="18" height="18" rx="2" fill="white" opacity="0.8"/>' +
                    '<rect x="72" y="30" width="18" height="18" rx="2" fill="white" opacity="0.8"/>' +
                    '<rect x="94" y="30" width="18" height="18" rx="2" fill="white" opacity="0.8"/>' +
                    // 车顶
                    '<rect x="15" y="18" width="110" height="10" rx="3" fill="#1B5E20"/>' +
                    // 车轮
                    '<circle cx="35" cy="65" r="8" fill="#333"/>' +
                    '<circle cx="105" cy="65" r="8" fill="#333"/>' +
                    '<circle cx="35" cy="65" r="4" fill="#666"/>' +
                    '<circle cx="105" cy="65" r="4" fill="#666"/>' +
                    // 集电杆
                    '<line x1="70" y1="18" x2="70" y2="5" stroke="#555" stroke-width="2"/>' +
                    '<circle cx="70" cy="4" r="3" fill="#FFC107"/>' +
                    // 车铃（如果选择了）
                    (state.tramDecors.indexOf('roof_bell') > -1 ? '<circle cx="120" cy="22" r="4" fill="#FFD700"/>' : '') +
                    // 车灯（如果选择了）
                    (state.tramDecors.indexOf('front_lamp') > -1 ? '<circle cx="25" cy="35" r="5" fill="#FFEB3B"/><circle cx="25" cy="35" r="3" fill="#FFF9C4"/>' : '') +
                    '</svg>' +
                    '</div>' +
                    '<div class="candidate-name">' + style.name + '</div>' +
                    '<div class="candidate-desc">' + tramEra.name + ' · ' + tramColor.name + '</div>' +
                    '<div class="candidate-tags">' +
                    (decorNames.length > 0 ? '<span class="tag">装饰: ' + decorNames.join('、') + '</span>' : '') +
                    '</div>';
                
                card.addEventListener('click', function() {
                    var all = grid.querySelectorAll('.candidate-card');
                    for (var j = 0; j < all.length; j++) all[j].classList.remove('selected');
                    this.classList.add('selected');
                    state.selectedCandidate = i;
                    state.tramCandidate = {
                        index: i,
                        style: style.name,
                        color: tramColor,
                        era: tramEra,
                        decors: decorNames
                    };
                    var btn = $('#btn-confirm-image');
                    if (btn) btn.disabled = false;
                    var hint = $('#preview-hint-8');
                    if (hint) hint.textContent = '已选: 方案' + (i+1) + ' · ' + style.name;
                });
                grid.appendChild(card);
            });
        }

        // 神兽SVG候选方案（降级方案，原generateCandidates逻辑）
        function generateBeastCandidatesSVG(grid) {
            var color = state.selectedColors.length > 0 ? findById(colors, state.selectedColors[0]).hex : '#C45C5C';
            var color2 = state.selectedColors.length > 1 ? findById(colors, state.selectedColors[1]).hex : color;
            var color3 = state.selectedColors.length > 2 ? findById(colors, state.selectedColors[2]).hex : color;
            var cr = findById(creatures, state.selectedCreature);
            var beastColor = cr ? cr.color : color;
            var ex = 'cute';  // 表情步骤已移除，SVG降级默认使用cute
            
            var styles = [
                { name: '水墨写意', desc: '传统国画风', bg: 'linear-gradient(135deg, #f5f0e8, #e8dcc8)' },
                { name: '彩色水墨', desc: '活泼撞色风', bg: 'linear-gradient(135deg, #fff0f0, #f0f0ff)' },
                { name: '金碧辉煌', desc: '宫廷华丽风', bg: 'linear-gradient(135deg, #fef9e7, #f5ecd0)' },
                { name: '青绿山水', desc: '清新淡雅风', bg: 'linear-gradient(135deg, #f0f7f0, #e0efe8)' }
            ];
            
            // expressions 已移除
            var eyeStyles = {
                cute: '<circle cx="43" cy="38" r="3" fill="#333"/><circle cx="59" cy="38" r="3" fill="#333"/>',
                fierce: '<path d="M38 36 L48 34" stroke="#333" stroke-width="2"/><path d="M52 34 L62 36" stroke="#333" stroke-width="2"/><circle cx="43" cy="38" r="2" fill="#333"/><circle cx="57" cy="38" r="2" fill="#333"/>',
                cool: '<circle cx="43" cy="38" r="3" fill="#333"/><circle cx="59" cy="38" r="3" fill="#333"/><path d="M40 33 L48 35" stroke="#333" stroke-width="1.5"/><path d="M52 35 L60 33" stroke="#333" stroke-width="1.5"/>',
                funny: '<circle cx="43" cy="38" r="3" fill="#333"/><ellipse cx="59" cy="38" rx="3" ry="4" fill="#333"/><path d="M55 55 Q60 62 65 55" stroke="#333" stroke-width="1.5" fill="#ff6b6b" opacity="0.6"/>'
            };
            
            var colorSets = [
                { body: beastColor, head: beastColor, horn: beastColor },
                { body: color, head: color2, horn: color3 },
                { body: '#C5A355', head: color, horn: '#C5A355' },
                { body: '#4A7FB5', head: '#6B9BC7', horn: '#4A7FB5' }
            ];
            
            styles.forEach(function(style, i) {
                var cs = colorSets[i];
                var card = document.createElement('div');
                card.className = 'candidate-card';
                card.dataset.index = i;
                card.innerHTML = '<div class="candidate-image" style="background:' + style.bg + '">' +
                    '<svg width="120" height="120" viewBox="0 0 100 100">' +
                    '<ellipse cx="50" cy="78" rx="28" ry="7" fill="#E8E0D0"/>' +
                    '<ellipse cx="50" cy="60" rx="24" ry="17" fill="' + cs.body + '"/>' +
                    '<circle cx="50" cy="40" r="17" fill="' + cs.head + '"/>' +
                    '<ellipse cx="32" cy="26" rx="7" ry="11" fill="' + cs.horn + '"/>' +
                    '<ellipse cx="68" cy="26" rx="7" ry="11" fill="' + cs.horn + '"/>' +
                    '<circle cx="42" cy="37" r="5" fill="white"/>' +
                    '<circle cx="58" cy="37" r="5" fill="white"/>' +
                    eyeStyles[ex] +
                    '<ellipse cx="50" cy="47" rx="4" ry="3" fill="#333"/>' +
                    
                    (state.selectedPatterns.length > 0 ? '<path d="M30 65 Q40 60 50 65 Q60 70 70 65" stroke="' + cs.body + '" stroke-width="2" fill="none" opacity="0.5"/>' : '') +
                    '</svg></div>' +
                    '<div class="candidate-info"><div class="candidate-name">方案' + (i+1) + ' · ' + style.name + '</div>' +
                    '<div class="candidate-style">' + style.desc + '</div></div>';
                
                card.addEventListener('click', function() {
                    var all = grid.querySelectorAll('.candidate-card');
                    for (var j = 0; j < all.length; j++) all[j].classList.remove('selected');
                    this.classList.add('selected');
                    state.selectedCandidate = i;
                    var btn = document.getElementById('btn-confirm-image');
                    if (btn) btn.disabled = false;
                    var p8svg = document.getElementById('preview-svg-8');
                    if (p8svg) {
                        var bp = document.getElementById('body-part-8'); if(bp) bp.setAttribute('fill', cs.body);
                        var hp = document.getElementById('head-part-8'); if(hp) hp.setAttribute('fill', cs.head);
                        var hl = document.getElementById('horn-left-8'); if(hl) hl.setAttribute('fill', cs.horn);
                        var hr = document.getElementById('horn-right-8'); if(hr) hr.setAttribute('fill', cs.horn);
                    }
                    var hint = document.getElementById('preview-hint-8');
                    if (hint) hint.textContent = '已选: 方案' + (i+1) + ' · ' + style.name;
                });
                grid.appendChild(card);
            });
        }
        
        
        
        
        // 生成铛铛车提示词数据
        function generateTramPromptData() {
            var tc = tramColors.find(function(c) { return c.id === state.tramColor; }) || tramColors[0];
            var te = tramEras.find(function(e) { return e.id === state.tramEra; }) || tramEras[0];
            var decorNames = [];
            var decorDescs = [];
            if (state.tramDecors && state.tramDecors.length > 0) {
                state.tramDecors.forEach(function(d) {
                    var td = tramDecors.find(function(x) { return x.id === d; });
                    if (td) {
                        decorNames.push(td.name);
                        decorDescs.push(td.promptDesc || td.name);
                    }
                });
            }
            
            var summonText = '我设计了一辆' + te.name + '铛铛车，' + tc.name + '车身' + (decorNames.length ? '，配备了' + decorNames.join('和') : '') + '，叮叮当当...';
            var aiPrompt = '一辆北京老式有轨铛铛车，' + te.name + '，' + te.visualDesc + '，' + tc.name + '车身（' + tc.hex + '），' + (decorDescs.length ? decorDescs.join('，') + '，' : '') + '纯白干净背景，车身为实心整体块状结构，侧面窗户为凹陷浮雕效果而非镂空，车轮清晰可见为独立圆柱体安装在车底，车头有圆形大灯，车顶平整，整体轮廓方正简洁，适合3D打印的实心模型风格，3D渲染风格，适合3D建模参考，8k高清，精致质感';
            
            var tags = document.querySelector('#page-9 .prompt-tags');
            if (tags) {
                tags.innerHTML = '<div class="prompt-tag-dynamic"><span class="prompt-tag-label">类型</span><span>铛铛车</span></div>' +
                    '<div class="prompt-tag-dynamic"><span class="prompt-tag-label">颜色</span><span>' + tc.name + ' ' + tc.hex + '</span></div>' +
                    '<div class="prompt-tag-dynamic"><span class="prompt-tag-label">年代</span><span>' + te.name + '</span></div>' +
                    (decorNames.length > 0 ? '<div class="prompt-tag-dynamic"><span class="prompt-tag-label">装饰</span><span>' + decorNames.join('、') + '</span></div>' : '');
            }
            
            var pb = document.querySelector('#page-9 .prompt-text');
            if (pb) {
                pb.innerHTML = '<span style="color:#3a2a1a;font-size:13px;line-height:1.8;display:block;">' + aiPrompt + '</span>';
                pb.style.display = 'block';
                pb.style.visibility = 'visible';
                pb.style.opacity = '1';
            }
            
            state._lastAiPrompt = aiPrompt;
            return { 
                summonText: summonText, 
                isTram: true, 
                tc: tc, 
                te: te, 
                decorNames: decorNames,
                cr: { name: '铛铛车' }
            };
        }

        // ============ 神兽模式：生成提示词摘要（用于 page-9 展示 + 供 generateCandidates 使用）============
        function generatePromptSummary() {
            // 铛铛车模式直接走已有逻辑
            if (state.isTramMode) {
                return generateTramPromptData();
            }

            // 神兽模式
            var cr = creatures.find(function(c) { return c.id === state.selectedCreature; });
            if (!cr) { cr = creatures[0]; }

            // 纹饰（带位置信息）
            var patternNames = [];
            var patternDescList = [];
            if (state.selectedPatterns && state.selectedPatterns.length > 0) {
                state.selectedPatterns.forEach(function(p) {
                    var pt = patterns.find(function(x) { return x.id === p; });
                    if (pt) {
                        patternNames.push(pt.name + '（' + pt.meaning + '）');
                        patternDescList.push(pt.position + '装饰着' + pt.desc);
                    }
                });
            }

            // 颜色
            var colorNames = [];
            var colorPromptParts = [];
            if (state.selectedColors && state.selectedColors.length > 0) {
                state.selectedColors.forEach(function(c) {
                    var cc = colors.find(function(x) { return x.id === c; });
                    if (cc) {
                        colorNames.push(cc.name + '（' + cc.hex + '）');
                        var levelText = cc.level === 'royal' ? '皇家御用色' : '民间传统色';
                        colorPromptParts.push(cc.name + '（' + levelText + '）');
                    }
                });
            }

            // 装饰元素
            var elemNames = [];
            var elemPromptParts = [];
            if (state.selectedElements && state.selectedElements.length > 0) {
                state.selectedElements.forEach(function(e) {
                    var ee = elements.find(function(x) { return x.id === e; });
                    if (ee) {
                        elemNames.push(ee.name);
                        if (ee.desc) elemPromptParts.push(ee.name + '（' + ee.desc + '）');
                        else elemPromptParts.push(ee.name);
                    }
                });
            }

            // 抽签结果（fortune）
            var fortune = state.fortune || {};
            var fortuneParts = [];
            if (fortune.nature) fortuneParts.push('天性' + fortune.nature);
            if (fortune.power) fortuneParts.push('拥有' + fortune.power + '的神力');
            if (fortune.hobby) fortuneParts.push('平时' + fortune.hobby);
            var fortuneDesc = fortuneParts.length ? fortuneParts.join('，') + '。' : '';

            var summonText = '我设计了一只' + cr.name + '，' + 
                (fortuneDesc ? fortuneDesc : '') +
                (patternDescList.length ? patternDescList.join('，') + '，' : '') + 
                (colorNames.length ? '配色为' + colorNames.join('、') + '，' : '') + 
                (elemNames.length ? '搭配' + elemNames.join('、') + '装饰。' : '');

            var aiPrompt = '一只可爱的中国神话小神兽「' + cr.name + '」（' + cr.desc + '）' +
                (cr.location ? '，守护在' + cr.location + '，' : '，') +
                (cr.pose ? cr.pose + '，' : '') +
                (fortune.nature ? '它' + fortune.nature + '，' : '') +
                (fortune.power ? '拥有' + fortune.power + '的神奇能力，' : '') +
                (fortune.hobby ? '平时喜欢' + fortune.hobby + '，' : '') +
                (patternDescList.length ? patternDescList.join('，') + '，纹样紧贴身体不要飘散在空中，' : '') +
                (colorPromptParts.length ? '主色调为' + colorPromptParts.join('、') + '，' : '') +
                (elemPromptParts.length ? '底座/配饰为' + elemPromptParts.join('、') + '，' : '') +
                '3D渲染，干净背景，儿童插画风格，高质量，温馨可爱';

            var tags = document.querySelector('#page-9 .prompt-tags');
            if (tags) {
                tags.innerHTML = '<div class="prompt-tag-dynamic"><span class="prompt-tag-label">类型</span><span>' + cr.name + '</span></div>' +
                    (fortune.nature ? '<div class="prompt-tag-dynamic"><span class="prompt-tag-label">天性</span><span>' + fortune.nature + '</span></div>' : '') +
                    (fortune.power ? '<div class="prompt-tag-dynamic"><span class="prompt-tag-label">神力</span><span>' + fortune.power + '</span></div>' : '') +
                    (patternNames.length ? '<div class="prompt-tag-dynamic"><span class="prompt-tag-label">纹饰</span><span>' + patternNames.join('、') + '</span></div>' : '') +
                    (colorNames.length ? '<div class="prompt-tag-dynamic"><span class="prompt-tag-label">颜色</span><span>' + colorNames.join('、') + '</span></div>' : '') +
                    (elemNames.length ? '<div class="prompt-tag-dynamic"><span class="prompt-tag-label">装饰</span><span>' + elemNames.join('、') + '</span></div>' : '');
            }

            var pb = document.querySelector('#page-9 .prompt-text');
            if (pb) {
                pb.innerHTML = '<span style="color:#3a2a1a;font-size:13px;line-height:1.8;display:block;">' + aiPrompt + '</span>';
                pb.style.display = 'block';
                pb.style.visibility = 'visible';
                pb.style.opacity = '1';
            }

            state._lastAiPrompt = aiPrompt;
            return {
                summonText: summonText,
                isTram: false,
                cr: cr,
                patternNames: patternNames,
                ex: 'cute',
                colorNames: colorNames,
                elemNames: elemNames
            };
        }
