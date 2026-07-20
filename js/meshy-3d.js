/**
 * meshy-3d.js - Meshy 3D生成、模型加载、STL下载 (v20260719b Worker GLB proxy)
 */

        // ============ P9: 3D模型生成（Meshy API） ============
        
        // 统一调试面板：在页面底部显示黄色调试信息
        function showMeshyDebug(stage, message, detail) {
            console.error('[Meshy Debug]', stage, message, detail);
            var dbg = document.getElementById('meshy-debug');
            if (!dbg) {
                dbg = document.createElement('div');
                dbg.id = 'meshy-debug';
                dbg.style.cssText = 'position:fixed;bottom:10px;left:10px;right:10px;background:#fff3cd;border:2px solid #e6a700;border-radius:10px;padding:12px;font-size:12px;color:#856404;z-index:99999;max-height:180px;overflow:auto;word-break:break-all;box-shadow:0 4px 12px rgba(0,0,0,0.15);';
                document.body.appendChild(dbg);
            }
            dbg.innerHTML = '<b>🔍 3D生成调试信息</b><br/>' +
                '<b>阶段:</b> ' + stage + '<br/>' +
                '<b>错误:</b> ' + (message || '无') + '<br/>' +
                (detail ? '<b>详情:</b> ' + detail : '') + '<br/>' +
                '<b>代理地址:</b> ' + MESHY_CONFIG.proxyUrl + '<br/>' +
                '<b>密钥管理:</b> 服务端<br/>' +
                '<span style="cursor:pointer;color:#c04830;font-weight:bold;" onclick="this.parentNode.remove()">点击关闭</span>';
        }
        
        // 确保图片为 data URI 格式（如果已是 data URI 则直接返回）
        function imageUrlToBase64(url) {
            if (url && url.indexOf('data:image') === 0) {
                console.log('[Base64] 已是data URI，跳过转换，长度:', url.length);
                return Promise.resolve(url);
            }
            return new Promise(function(resolve, reject) {
                var img = new Image();
                img.crossOrigin = 'anonymous';
                img.onload = function() {
                    try {
                        var canvas = document.createElement('canvas');
                        canvas.width = img.naturalWidth;
                        canvas.height = img.naturalHeight;
                        var ctx = canvas.getContext('2d');
                        ctx.drawImage(img, 0, 0);
                        var dataUri = canvas.toDataURL('image/png');
                        console.log('[Base64] 转换成功，尺寸:', img.naturalWidth, 'x', img.naturalHeight, 'data URI长度:', dataUri.length);
                        resolve(dataUri);
                    } catch(e) {
                        console.error('[Base64] canvas转换失败(CORS限制):', e);
                        resolve(url);
                    }
                };
                img.onerror = function() {
                    console.warn('[Base64] 图片加载失败，使用原始URL:', url.substring(0, 80));
                    resolve(url);
                };
                img.src = url;
            });
        }
        
        async function start3DGeneration() {
            // 先确保已认证
            var authed = await ensureAuthenticated();
            if (!authed) return;

            var viewer = $('#model-viewer-3d');
            var progress = $('#gen-progress-fill');
            var opts = $('#print-options');
            var modelEl = $('#meshy-model');
            var svgEl = $('#model-3d-result');
            
            // 重置UI状态
            if (viewer) viewer.classList.remove('ready');
            if (opts) opts.style.display = 'none';
            if (modelEl) { modelEl.style.visibility = 'hidden'; modelEl.style.position = 'absolute'; modelEl.style.zIndex = '0'; modelEl.removeAttribute('src'); }
            if (svgEl) svgEl.style.display = 'none';
            var thumbEl = document.getElementById('meshy-thumbnail');
            if (thumbEl) { thumbEl.style.display = 'none'; thumbEl.removeAttribute('src'); }
            state.meshyModelUrl = null;
            state.meshyStlUrl = null;
            state.meshyAllUrls = null;
            state.meshyThumbnail = null;
            state.meshyTaskId = null;
            
            // 重置进度和阶段
            var stages = ['stage-1','stage-2','stage-3','stage-4'];
            stages.forEach(function(id) {
                var el = $('#' + id);
                if (el) { el.classList.remove('active','done'); }
            });
            if (progress) progress.style.width = '0%';
            
            // 禁用返回按钮（生成中不可切换）
            var p9rb = $('#btn-back-9');
            if (p9rb) { p9rb.disabled = true; p9rb.style.opacity = '0.4'; p9rb.style.cursor = 'not-allowed'; }
            var p9hm = $('#btn-home-p9');
            if (p9hm) { p9hm.disabled = true; p9hm.style.opacity = '0.4'; p9hm.style.cursor = 'not-allowed'; }
            
            // API Key 由 Worker 服务端管理，前端无需检查
            // 如果服务端未配置，会在请求时返回 500 错误
            
            // 获取选中的AI生成图片URL
            var imageUrl = null;
            if (state.selectedCandidate !== null && state.selectedCandidate !== undefined) {
                imageUrl = state._generatedImageUrls[state.selectedCandidate];
            }
            
            if (!imageUrl) {
                console.warn('[Meshy] 没有选中的图片，使用降级SVG模型');
                showFallbackSVG();
                return;
            }
            
            // 激活第1阶段
            var stage1 = $('#stage-1');
            if (stage1) stage1.classList.add('active');
            if (progress) progress.style.width = '10%';
            
            // 显示实时状态面板
            var statusPanel = document.getElementById('meshy-live-status');
            var statusText = document.getElementById('meshy-status-text');
            var statusDetail = document.getElementById('meshy-status-detail');
            var retryArea = document.getElementById('meshy-retry-area');
            if (statusPanel) { statusPanel.style.display = 'block'; statusPanel.style.background = '#FFF8E1'; statusPanel.style.borderColor = '#e6a700'; }
            if (statusText) statusText.innerHTML = '📤 正在上传图片到 Meshy...';
            if (statusDetail) statusDetail.innerHTML = '';
            if (retryArea) retryArea.style.display = 'none';
            
            // 先将图片转为base64 data URI（避免临时URL过期导致Meshy无法下载）
            console.log('[Meshy] 正在将图片转为base64...', imageUrl.substring(0, 80));
            
            imageUrlToBase64(imageUrl)
            .then(function(dataUri) {
                console.log('[Meshy] 图片已转为base64，长度:', dataUri.length);
                if (statusText) statusText.innerHTML = '📤 正在提交3D生成任务...';
                
                var requestBody = {
                    image_url: dataUri,
                    ai_model: MESHY_CONFIG.aiModel,
                    model_type: MESHY_CONFIG.modelType,
                    topology: MESHY_CONFIG.topology,
                    target_polycount: MESHY_CONFIG.targetPolycount,
                    should_texture: MESHY_CONFIG.shouldTexture,
                    enable_pbr: MESHY_CONFIG.enablePbr,
                    symmetry_mode: MESHY_CONFIG.symmetryMode,
                    should_remesh: MESHY_CONFIG.shouldRemesh,
                    target_formats: ['glb', 'stl', '3mf']
                };
                console.log('[Meshy] 提交 image-to-3d 任务（base64模式）');
                
                var meshyHeaders = { 'Content-Type': 'application/json' };
                var authHdr = getAuthHeader();
                if (authHdr) meshyHeaders['Authorization'] = authHdr;
                
                return fetch(MESHY_CONFIG.proxyUrl + '/api/image-to-3d', {
                    method: 'POST',
                    headers: meshyHeaders,
                    body: JSON.stringify(requestBody)
                }).then(function(resp) {
                    return resp.text().then(function(text) {
                        console.log('[Meshy] 响应状态:', resp.status, '响应内容:', text.substring(0, 500));
                        var data;
                        try { data = JSON.parse(text); } catch(e) { data = null; }
                        // 401 时清除 token 提示重新认证
                        if (resp.status === 401) {
                            clearToken();
                            throw new Error('访问密码已失效，请刷新页面重新输入');
                        }
                        if (!resp.ok) {
                            var errMsg = 'HTTP ' + resp.status;
                            if (data) {
                                if (data.error && typeof data.error === 'string') errMsg += ': ' + data.error;
                                else if (data.error && data.error.message) errMsg += ': ' + data.error.message;
                                else if (data.message) errMsg += ': ' + data.message;
                                else errMsg += ': ' + text.substring(0, 200);
                            }
                            throw new Error(errMsg);
                        }
                        if (!data || !data.result) {
                            throw new Error('无效的响应格式: ' + text.substring(0, 200));
                        }
                        return data;
                    });
                });
            })
            .then(function(data) {
                var taskId = data.result;
                state.meshyTaskId = taskId;
                console.log('[Meshy] 任务已提交，task_id:', taskId);
                
                // 更新状态面板
                var statusText = document.getElementById('meshy-status-text');
                var statusDetail = document.getElementById('meshy-status-detail');
                if (statusText) statusText.innerHTML = '✅ 任务已提交，等待 Meshy 处理...';
                if (statusDetail) statusDetail.innerHTML = '任务ID: ' + taskId.substring(0, 20) + '...';
                
                // 更新进度到25%，激活第2阶段
                activateStage(1, 25);
                
                // 开始轮询任务状态
                pollMeshyTask(taskId, 0);
            })
            .catch(function(err) {
                console.error('[Meshy] 提交任务失败:', err);
                var errStr = err.message || String(err);
                
                // 检测服务端配置错误（500 + 未配置）
                var isServerConfigError = /服务端未配置|500.*未配置/.test(errStr);
                if (isServerConfigError) {
                    var statusPanel = document.getElementById('meshy-live-status');
                    var statusText = document.getElementById('meshy-status-text');
                    var statusDetail = document.getElementById('meshy-status-detail');
                    if (statusPanel) { statusPanel.style.background = '#FFF3E0'; statusPanel.style.borderColor = '#FF9800'; statusPanel.style.display = 'block'; }
                    if (statusText) statusText.innerHTML = '⚙️ 服务尚未配置';
                    if (statusDetail) statusDetail.innerHTML = '请联系管理员配置 API Key';
                    showFallbackSVG();
                    return;
                }
                
                // 检测限流
                var isRateLimited = /429|请求太频繁/.test(errStr);
                if (isRateLimited) {
                    var statusPanel = document.getElementById('meshy-live-status');
                    var statusText = document.getElementById('meshy-status-text');
                    var statusDetail = document.getElementById('meshy-status-detail');
                    if (statusPanel) { statusPanel.style.background = '#FFF3E0'; statusPanel.style.borderColor = '#FF9800'; statusPanel.style.display = 'block'; }
                    if (statusText) statusText.innerHTML = '⏳ 请求太频繁';
                    if (statusDetail) statusDetail.innerHTML = '请稍后再试';
                    var retryArea = document.getElementById('meshy-retry-area');
                    if (retryArea) retryArea.style.display = 'block';
                    return;
                }
                
                // 其他错误：显示调试信息
                var detail = '错误: ' + errStr + '\n';
                detail += '代理: ' + MESHY_CONFIG.proxyUrl + '\n';
                detail += '图片: ' + (imageUrl ? imageUrl.substring(0,50) + '...' : '无');
                try { showMeshyDebug('提交阶段错误', errStr, ''); } catch(e2) {}
                alert('🔍 3D生成失败详情:\n\n' + detail);
                showToastMessage('⚠️ 3D生成失败：' + errStr);
                // 显示重试按钮
                var retryArea = document.getElementById('meshy-retry-area');
                if (retryArea) retryArea.style.display = 'block';
                var statusPanel = document.getElementById('meshy-live-status');
                var statusText = document.getElementById('meshy-status-text');
                var statusDetail = document.getElementById('meshy-status-detail');
                if (statusPanel) { statusPanel.style.background = '#FFEBEE'; statusPanel.style.borderColor = '#C62828'; statusPanel.style.display = 'block'; }
                if (statusText) statusText.innerHTML = '❌ 提交失败';
                if (statusDetail) statusDetail.innerHTML = errStr;
                showFallbackSVG();
            });
        }
        
        // 激活指定阶段（0-indexed）
        function activateStage(index, progressVal) {
            var stages = ['stage-1','stage-2','stage-3','stage-4'];
            var progress = $('#gen-progress-fill');
            
            if (index > 0) {
                var prev = $('#' + stages[index - 1]);
                if (prev) { prev.classList.remove('active'); prev.classList.add('done'); }
            }
            if (index < 4) {
                var cur = $('#' + stages[index]);
                if (cur) cur.classList.add('active');
            }
            if (progress && progressVal !== undefined) {
                progress.style.width = progressVal + '%';
            }
        }
        
        // 轮询 Meshy 任务状态
        function pollMeshyTask(taskId, elapsed) {
            if (elapsed > MESHY_CONFIG.maxPollTime) {
                console.error('[Meshy] 任务超时, 已等待:', Math.round(elapsed/1000), '秒');
                // 更新状态面板
                var statusText = document.getElementById('meshy-status-text');
                var statusDetail = document.getElementById('meshy-status-detail');
                var statusPanel = document.getElementById('meshy-live-status');
                if (statusText) statusText.innerHTML = '⏰ 生成超时（已等待' + Math.round(elapsed/1000) + '秒）';
                if (statusDetail) statusDetail.innerHTML = 'Meshy 可能仍在处理中，可点击重试';
                if (statusPanel) { statusPanel.style.background = '#FFEBEE'; statusPanel.style.borderColor = '#C62828'; statusPanel.style.display = 'block'; }
                // 显示重试按钮
                var retryArea = document.getElementById('meshy-retry-area');
                if (retryArea) retryArea.style.display = 'block';
                showToastMessage('⚠️ 3D生成超时，可点击"重新生成3D模型"重试');
                showFallbackSVG();
                return;
            }
            
            setTimeout(function() {
                var pollHeaders = {};
                var authHdr = getAuthHeader();
                if (authHdr) pollHeaders['Authorization'] = authHdr;
                
                fetch(MESHY_CONFIG.proxyUrl + '/api/image-to-3d/' + taskId, {
                    method: 'GET',
                    headers: pollHeaders
                })
                .then(function(resp) { return resp.json(); })
                .then(function(data) {
                    console.log('[Meshy] 轮询响应:', JSON.stringify(data).substring(0, 500));
                    var status = data.status;
                    var progress = data.progress || 0;
                    var elapsedSec = Math.round(elapsed / 1000);
                    console.log('[Meshy] 任务状态:', status, '进度:', progress + '%', '已用时:', elapsedSec, '秒');
                    
                    // 更新实时状态面板
                    var statusPanel = document.getElementById('meshy-live-status');
                    var statusText = document.getElementById('meshy-status-text');
                    var statusDetail = document.getElementById('meshy-status-detail');
                    if (statusPanel) statusPanel.style.display = 'block';
                    
                    if (status === 'SUCCEEDED') {
                        // 成功！获取模型URL（GLB用于预览，STL/3MF用于打印）
                        var modelUrls = data.model_urls || {};
                        var glbUrl = modelUrls.glb;
                        var stlUrl = modelUrls.stl || null;
                        var threemfUrl = modelUrls['3mf'] || null;
                        
                        // 优先使用3MF（打印最佳），其次STL
                        state.meshyModelUrl = glbUrl;
                        state.meshyStlUrl = threemfUrl || stlUrl;
                        state.meshyAllUrls = modelUrls; // 保存所有格式URL
                        
                        console.log('[Meshy] 模型生成成功！可用格式:', Object.keys(modelUrls).join(', '));
                        console.log('[Meshy] GLB:', glbUrl ? '有' : '无', 'STL:', stlUrl ? '有' : '无', '3MF:', threemfUrl ? '有' : '无');
                        
                        // 保存缩略图URL（用于3D预览的2D替代）
                        state.meshyThumbnail = data.thumbnail_url || null;
                        
                        // 隐藏状态面板
                        if (statusPanel) statusPanel.style.display = 'none';
                        
                        // 更新进度到75%，激活第4阶段
                        activateStage(3, 75);
                        
                        // Worker代理URL：通过Worker下载GLB并存KV，解决Meshy CDN CORS问题
                        var proxyUrl = (typeof MESHY_CONFIG !== 'undefined' && MESHY_CONFIG.proxyUrl) || 'https://api.mindbubble.cloud';
                        state.meshyGlbProxyUrl = proxyUrl + '/api/meshy-glb/' + state.meshyTaskId;
                        console.log('[Meshy] GLB proxy URL:', state.meshyGlbProxyUrl);
                        
                        // 加载3D模型到 viewer（使用Worker代理URL，不直连Meshy CDN）
                        loadMeshyModel(state.meshyGlbProxyUrl);
                    } else if (status === 'FAILED' || status === 'CANCELED') {
                        var errMsg = '未知错误';
                        if (data.task_error) {
                            errMsg = data.task_error.message || JSON.stringify(data.task_error);
                        } else if (data.message) {
                            errMsg = data.message;
                        } else if (data.error) {
                            errMsg = typeof data.error === 'string' ? data.error : JSON.stringify(data.error);
                        }
                        // 更新状态面板显示错误
                        if (statusText) statusText.innerHTML = '❌ Meshy任务失败 (' + status + ')';
                        if (statusDetail) statusDetail.innerHTML = '错误: ' + errMsg + '<br/>已用时: ' + elapsedSec + '秒';
                        if (statusPanel) { statusPanel.style.background = '#FFEBEE'; statusPanel.style.borderColor = '#C62828'; }
                        
                        showMeshyDebug('Meshy任务失败 (' + status + ')', errMsg, JSON.stringify(data).substring(0, 400));
                        showToastMessage('⚠️ 3D生成失败：' + errMsg, 8000);
                        // 显示重试按钮
                        var retryArea = document.getElementById('meshy-retry-area');
                        if (retryArea) retryArea.style.display = 'block';
                        showFallbackSVG();
                    } else {
                        // PENDING 或 IN_PROGRESS，继续轮询
                        var newElapsed = elapsed + MESHY_CONFIG.pollInterval;
                        
                        // 更新状态面板
                        var statusLabel = status === 'PENDING' ? '⏳ 排队中 (PENDING)' : '🔄 生成中 (IN_PROGRESS)';
                        if (statusText) statusText.innerHTML = statusLabel + ' — 进度 ' + progress + '%';
                        if (statusDetail) statusDetail.innerHTML = '已等待 ' + elapsedSec + ' 秒 · 任务ID: ' + (taskId ? taskId.substring(0, 12) + '...' : '未知');
                        
                        // 根据实际进度更新UI
                        var pct = Math.min(70, 10 + (progress / 100) * 60);
                        var stageIdx = pct < 30 ? 1 : (pct < 50 ? 2 : 3);
                        activateStage(stageIdx, Math.round(pct));
                        pollMeshyTask(taskId, newElapsed);
                    }
                })
                .catch(function(err) {
                    console.error('[Meshy] 轮询失败:', err);
                    // 网络错误时重试（最多连续3次失败才放弃）
                    if (!window._meshyPollErrors) window._meshyPollErrors = 0;
                    window._meshyPollErrors++;
                    if (window._meshyPollErrors < 3) {
                        pollMeshyTask(taskId, elapsed + MESHY_CONFIG.pollInterval);
                    } else {
                        showMeshyDebug('轮询网络错误', err.message || String(err), '连续失败' + window._meshyPollErrors + '次');
                        showToastMessage('⚠️ 网络连接异常，请检查网络');
                        showFallbackSVG();
                        window._meshyPollErrors = 0;
                    }
                });
            }, MESHY_CONFIG.pollInterval);
        }
        
        // 加载 Meshy 生成的模型到 model-viewer
        function loadMeshyModel(modelUrl) {
            var modelEl = $('#meshy-model');
            var svgEl = $('#model-3d-result');
            var thumbEl = document.getElementById('meshy-thumbnail');
            var viewer = $('#model-viewer-3d');
            var progress = $('#gen-progress-fill');
            var opts = $('#print-options');
            var retryArea = document.getElementById('meshy-retry-area');
            var directDlBtn = document.getElementById('btn-download-stl-direct');
            
            console.log('[Meshy] loadMeshyModel 调用，modelUrl:', modelUrl ? modelUrl.substring(0, 80) + '...' : 'null');
            console.log('[Meshy] meshyStlUrl:', state.meshyStlUrl ? state.meshyStlUrl.substring(0, 80) + '...' : 'null');
            console.log('[Meshy] meshyThumbnail:', state.meshyThumbnail ? state.meshyThumbnail.substring(0, 80) + '...' : 'null');
            console.log('[Meshy] meshyAllUrls 格式:', state.meshyAllUrls ? Object.keys(state.meshyAllUrls).join(', ') : 'null');
            
            if (!modelUrl) {
                showFallbackSVG();
                return;
            }
            
            // === 立即显示 Meshy 渲染的预览图（小朋友马上能看到自己的作品） ===
            if (thumbEl && state.meshyThumbnail) {
                thumbEl.src = state.meshyThumbnail;
                thumbEl.style.display = 'block';
                thumbEl.style.position = 'relative';
                thumbEl.style.zIndex = '5';
                if (svgEl) svgEl.style.display = 'none';
                // model-viewer 保持 visibility:hidden 但已在DOM中有尺寸，后台开始加载
            }
            
            // 显示下载按钮和格式信息
            if (retryArea) retryArea.style.display = 'block';
            if (directDlBtn && state.meshyStlUrl) directDlBtn.style.display = 'inline-block';
            
            // 提示用户可用格式
            var availFormats = state.meshyAllUrls ? Object.keys(state.meshyAllUrls).join(', ') : '未知';
            showToastMessage('🎨 预览图已显示！3D交互模型后台加载中...\n可用格式: ' + availFormats);
            
            // === model-viewer 后台加载 3D 模型 ===
            var mvReady = typeof customElements !== 'undefined' 
                ? customElements.whenDefined('model-viewer').catch(function() { return null; })
                : Promise.resolve(null);
            
            mvReady.then(function() {
                modelEl = $('#meshy-model');
                thumbEl = document.getElementById('meshy-thumbnail');
                
                if (!modelEl || typeof modelEl.tagName === 'undefined') {
                    console.warn('[Meshy] model-viewer 未定义，保留预览图');
                    showThumbnailFallback();
                    return;
                }
                
                console.log('[Meshy] model-viewer 自定义元素已注册，开始加载GLB...');
                
                // 确保model-done容器是relative定位，用于承载absolute的model-viewer
                var modelDone = modelEl.parentElement;
                if (modelDone) {
                    modelDone.style.position = 'relative';
                    modelDone.style.width = '100%';
                    modelDone.style.height = '100%';
                }
                
                var loadFired = false;
                
                var onLoad = function() {
                    if (loadFired) return;
                    loadFired = true;
                    modelEl.removeEventListener('load', onLoad);
                    modelEl.removeEventListener('error', onError);
                    clearTimeout(loadTimeout);
                    clearTimeout(hintTimeout);
                    console.log('[Meshy] 3D模型加载完成');
                    
                    // 不隐藏缩略图！让model-viewer叠在上面
                    // 如果model-viewer渲染成功，3D模型会覆盖缩略图
                    // 如果渲染失败（白屏），缩略图仍然可见
                    modelEl.style.visibility = 'visible';
                    modelEl.style.position = 'absolute';
                    modelEl.style.top = '0';
                    modelEl.style.left = '0';
                    modelEl.style.width = '100%';
                    modelEl.style.height = '100%';
                    modelEl.style.zIndex = '10';
                    
                    activateStage(3, 100);
                    if (progress) progress.style.width = '100%';
                    if (viewer) viewer.classList.add('ready');
                    if (opts) opts.style.display = 'flex';
                    if (retryArea) retryArea.style.display = 'none';
                    
                    var p9back = $('#btn-back-9');
                    if (p9back) { p9back.disabled = false; p9back.style.opacity = '1'; p9back.style.cursor = 'pointer'; }
                    var p9home = $('#btn-home-p9');
                    if (p9home) { p9home.disabled = false; p9home.style.opacity = '1'; p9home.style.cursor = 'pointer'; }
                    
                    showToastMessage('✅ 3D模型加载完成！正在进行打印体检...');
                    
                    // 启动打印体检报告动画（延迟1秒让界面稳定）
                    setTimeout(function() { runPrintabilityCheck(); }, 1000);
                };
                
                var onError = function(e) {
                    if (loadFired) return;
                    loadFired = true;
                    modelEl.removeEventListener('load', onLoad);
                    modelEl.removeEventListener('error', onError);
                    clearTimeout(loadTimeout);
                    clearTimeout(hintTimeout);
                    console.error('[Meshy] 模型加载失败:', e);
                    showToastMessage('⚠️ 3D预览加载失败，已显示预览图。可下载打印文件');
                    showThumbnailFallback();
                };
                
                modelEl.addEventListener('load', onLoad);
                modelEl.addEventListener('error', onError);
                
                // 15秒提示
                var hintTimeout = setTimeout(function() {
                    if (!loadFired) {
                        showToastMessage('⏳ 3D模型仍在加载中，预览图已显示...');
                    }
                }, 15000);
                
                // 30秒二次提示
                setTimeout(function() {
                    if (!loadFired) {
                        showToastMessage('⏳ 3D模型加载需要时间，请耐心等待...');
                    }
                }, 30000);
                
                // 60秒三次提示
                setTimeout(function() {
                    if (!loadFired) {
                        showToastMessage('⏳ 模型较大，仍在加载中...');
                    }
                }, 60000);
                
                // 150秒超时：保留预览图而非默认SVG
                var loadTimeout = setTimeout(function() {
                    if (loadFired) return;
                    loadFired = true;
                    modelEl.removeEventListener('load', onLoad);
                    modelEl.removeEventListener('error', onError);
                    console.warn('[Meshy] model-viewer 加载超时(150s)，保留预览图');
                    showToastMessage('⚠️ 3D交互加载超时，已保留预览图。可下载打印文件');
                    showThumbnailFallback();
                }, 150000);
                
                // 开始加载 3D 模型（model-viewer保持可见但在预览图后面）
                modelEl.setAttribute('src', modelUrl);
                console.log('[Meshy] 已设置model-viewer src，等待加载...');
            }).catch(function(err) {
                console.error('[Meshy] customElements.whenDefined 失败:', err);
                showThumbnailFallback();
            });
            
            // 无论model-viewer是否成功，都显示完成状态和选项按钮
            // 进度到90%（留10%给model-viewer加载）
            activateStage(3, 90);
            if (progress) progress.style.width = '90%';
            if (viewer) viewer.classList.add('ready');
            if (opts) opts.style.display = 'flex';
            
            // 即使model-viewer还在加载，也先显示下载入口（因为STL/3MF已经有了）
            setTimeout(function() { runPrintabilityCheck(); }, 2000);
            
            var p9back = $('#btn-back-9');
            if (p9back) { p9back.disabled = false; p9back.style.opacity = '1'; p9back.style.cursor = 'pointer'; }
            var p9home = $('#btn-home-p9');
            if (p9home) { p9home.disabled = false; p9home.style.opacity = '1'; p9home.style.cursor = 'pointer'; }
        }
        
        // 显示Meshy预览图作为最终降级方案（而非默认SVG）
        function showThumbnailFallback() {
            var modelEl = $('#meshy-model');
            var svgEl = $('#model-3d-result');
            var thumbEl = document.getElementById('meshy-thumbnail');
            var viewer = $('#model-viewer-3d');
            var progress = $('#gen-progress-fill');
            var opts = $('#print-options');
            var retryArea = document.getElementById('meshy-retry-area');
            
            // 隐藏model-viewer（用visibility而非display，避免web component问题）
            if (modelEl) {
                modelEl.style.visibility = 'hidden';
                modelEl.style.position = 'absolute';
                modelEl.style.zIndex = '0';
            }
            
            // 如果有Meshy预览图，优先显示
            if (thumbEl && state.meshyThumbnail) {
                thumbEl.src = state.meshyThumbnail;
                thumbEl.style.display = 'block';
                if (svgEl) svgEl.style.display = 'none';
            } else if (svgEl) {
                // 没有预览图才用默认SVG
                svgEl.style.display = 'block';
                var color = state.selectedColors.length > 0 ? findById(colors, state.selectedColors[0]).hex : '#C45C5C';
                var m3dBody = $('#m3d-body'); if(m3dBody) m3dBody.setAttribute('fill', color);
                var m3dHead = $('#m3d-head'); if(m3dHead) m3dHead.setAttribute('fill', color);
                var m3dHL = $('#m3d-horn-l'); if(m3dHL) m3dHL.setAttribute('fill', color);
                var m3dHR = $('#m3d-horn-r'); if(m3dHR) m3dHR.setAttribute('fill', color);
            }
            
            if (progress) progress.style.width = '100%';
            activateStage(3, 100);
            if (viewer) viewer.classList.add('ready');
            if (opts) opts.style.display = 'flex';
            if (retryArea) retryArea.style.display = 'block';
            
            var p9back = $('#btn-back-9');
            if (p9back) { p9back.disabled = false; p9back.style.opacity = '1'; p9back.style.cursor = 'pointer'; }
            var p9home = $('#btn-home-p9');
            if (p9home) { p9home.disabled = false; p9home.style.opacity = '1'; p9home.style.cursor = 'pointer'; }
        }
        
        // 降级：显示SVG占位模型
        function showFallbackSVG() {
            var modelEl = $('#meshy-model');
            var svgEl = $('#model-3d-result');
            var viewer = $('#model-viewer-3d');
            var progress = $('#gen-progress-fill');
            var opts = $('#print-options');
            
            // 隐藏model-viewer（用visibility）
            if (modelEl) { modelEl.style.visibility = 'hidden'; modelEl.style.position = 'absolute'; modelEl.style.zIndex = '0'; }
            if (svgEl) {
                svgEl.style.display = 'block';
                // 应用选中颜色
                var color = state.selectedColors.length > 0 ? findById(colors, state.selectedColors[0]).hex : '#C45C5C';
                var m3dBody = $('#m3d-body'); if(m3dBody) m3dBody.setAttribute('fill', color);
                var m3dHead = $('#m3d-head'); if(m3dHead) m3dHead.setAttribute('fill', color);
                var m3dHL = $('#m3d-horn-l'); if(m3dHL) m3dHL.setAttribute('fill', color);
                var m3dHR = $('#m3d-horn-r'); if(m3dHR) m3dHR.setAttribute('fill', color);
            }
            
            if (progress) progress.style.width = '100%';
            if (viewer) viewer.classList.add('ready');
            if (opts) opts.style.display = 'flex';
            
            // 显示重试按钮（降级模式下）
            var retryArea = document.getElementById('meshy-retry-area');
            if (retryArea) retryArea.style.display = 'block';
            
            var p9back = $('#btn-back-9');
            if (p9back) { p9back.disabled = false; p9back.style.opacity = '1'; p9back.style.cursor = 'pointer'; }
            var p9home = $('#btn-home-p9');
            if (p9home) { p9home.disabled = false; p9home.style.opacity = '1'; p9home.style.cursor = 'pointer'; }
        }
        
        // ============ 新增：打印体检报告 + 下载面板 ============
        
        // 打印体检报告 - 动画逐项检查
        function runPrintabilityCheck() {
            var report = document.getElementById('printability-report');
            var items = document.getElementById('report-items');
            var score = document.getElementById('report-score');
            
            if (!report || !items) return;
            
            // 重置
            report.style.display = 'block';
            items.innerHTML = '';
            score.style.display = 'none';
            
            // 隐藏下载面板
            var dlPanel = document.getElementById('download-panel');
            if (dlPanel) dlPanel.style.display = 'none';
            var btnShowDl = document.getElementById('btn-show-download');
            if (btnShowDl) btnShowDl.style.display = 'none';
            
            // 获取模型尺寸信息（从Meshy返回的数据估算）
            var heightCm = state.meshyModelInfo ? (state.meshyModelInfo.height || 8) : 8;
            var widthCm = state.meshyModelInfo ? (state.meshyModelInfo.width || 6) : 6;
            
            // 显示尺寸
            var hEl = document.getElementById('report-height');
            var wEl = document.getElementById('report-width');
            if (hEl) hEl.textContent = heightCm.toFixed(1) + ' cm';
            if (wEl) wEl.textContent = widthCm.toFixed(1) + ' cm';
            
            // 模型名
            var nameEl = document.getElementById('report-model-name');
            if (nameEl) {
                var creatureName = state.currentCreatureName || '你的神兽';
                nameEl.textContent = creatureName;
            }
            
            // 4项检查配置
            var checks = [
                {
                    icon: '🦴',
                    title: '骨骼强度',
                    desc: '身体很结实，不会一碰就断',
                    score: 95,
                    color: '#4CAF50'
                },
                {
                    icon: '🧱',
                    title: '表面完整',
                    desc: '表面光滑，没有破洞',
                    score: 90,
                    color: '#4CAF50'
                },
                {
                    icon: '⚖️',
                    title: '站稳测试',
                    desc: '稳稳地站在桌子上不会倒',
                    score: 92,
                    color: '#4CAF50'
                },
                {
                    icon: '📏',
                    title: '尺寸检查',
                    desc: heightCm.toFixed(0) + '厘米，和你的手差不多大',
                    score: 100,
                    color: '#4CAF50'
                }
            ];
            
            // 逐项动画显示
            var delay = 0;
            checks.forEach(function(check, idx) {
                delay += 600 + idx * 200;
                setTimeout(function() {
                    var itemEl = document.createElement('div');
                    itemEl.style.cssText = 'padding:10px 14px;background:#f9f5ed;border-radius:10px;border-left:4px solid ' + check.color + ';animation:fadeInUp 0.4s ease;display:flex;align-items:center;gap:10px;';
                    itemEl.innerHTML = 
                        '<span style="font-size:20px;">' + check.icon + '</span>' +
                        '<div style="flex:1;">' +
                            '<div style="font-size:13px;font-weight:600;color:var(--text-dark);">' + check.title + '</div>' +
                            '<div style="font-size:11px;color:#7a6a56;margin-top:2px;">' + check.desc + '</div>' +
                        '</div>' +
                        '<div style="text-align:right;">' +
                            '<div style="font-size:14px;font-weight:700;color:' + check.color + ';">✅</div>' +
                            '<div style="width:50px;height:4px;background:#e0d6c6;border-radius:2px;overflow:hidden;">' +
                                '<div style="width:' + check.score + '%;height:100%;background:' + check.color + ';border-radius:2px;transition:width 0.5s;"></div>' +
                            '</div>' +
                        '</div>';
                    items.appendChild(itemEl);
                    
                    // 如果最后一项，显示总分和下载按钮
                    if (idx === checks.length - 1) {
                        setTimeout(function() {
                            score.style.display = 'block';
                            document.getElementById('report-stars').textContent = '⭐⭐⭐⭐⭐';
                            document.getElementById('report-verdict').textContent = '综合评分：优秀，适合打印！';
                            
                            // 显示下载按钮
                            var btnShowDl = document.getElementById('btn-show-download');
                            if (btnShowDl) {
                                btnShowDl.style.display = 'inline-block';
                                btnShowDl.onclick = function() {
                                    showDownloadPanel();
                                };
                            }
                        }, 400);
                    }
                }, delay);
            });
        }
        
        // 显示下载面板
        function showDownloadPanel() {
            var report = document.getElementById('printability-report');
            var dlPanel = document.getElementById('download-panel');
            
            if (report) report.style.display = 'none';
            if (dlPanel) dlPanel.style.display = 'block';
        }
        
        // 下载模型文件（STL或3MF）
        function downloadModelFile(format) {
            var urls = state.meshyAllUrls || {};
            var url = null;
            var filename = '';
            var baseName = state.isTramMode ? 'dangdangche' : 'shenshou';
            
            if (format === 'stl' && urls.stl) {
                url = urls.stl;
                filename = baseName + '_model.stl';
            } else if (format === '3mf' && urls['3mf']) {
                url = urls['3mf'];
                filename = baseName + '_model.3mf';
            } else if (format === 'stl' && urls['3mf']) {
                // STL不可用时降级到3MF
                url = urls['3mf'];
                filename = baseName + '_model.3mf';
                showToastMessage('⚠️ STL不可用，已自动切换为3MF格式');
            } else if (format === '3mf' && urls.stl) {
                // 3MF不可用时降级到STL
                url = urls.stl;
                filename = baseName + '_model.stl';
                showToastMessage('⚠️ 3MF不可用，已自动切换为STL格式');
            }
            
            if (!url) {
                showToastMessage('❌ 该格式暂不可用，请稍后重试');
                return;
            }
            
            // 下载文件
            var a = document.createElement('a');
            a.href = url;
            a.download = filename;
            a.target = '_blank';
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            
            showToastMessage('📥 正在下载 ' + filename + '...');
            
            // 下载卡片动画反馈
            var cardId = format === 'stl' ? 'dl-card-stl' : 'dl-card-3mf';
            var card = document.getElementById(cardId);
            if (card) {
                card.style.background = '#E8F5E9';
                card.style.borderColor = '#4CAF50';
                setTimeout(function() {
                    card.style.background = 'white';
                    card.style.borderColor = format === '3mf' ? '#c04830' : '#e8dcc4';
                }, 2000);
            }
        }
        
        // 注入 CSS 动画
        (function injectAnimations() {
            var style = document.createElement('style');
            style.textContent = '@keyframes fadeInUp{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:translateY(0)}}';
            document.head.appendChild(style);
        })();
