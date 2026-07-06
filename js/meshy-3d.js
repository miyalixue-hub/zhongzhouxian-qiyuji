/**
 * meshy-3d.js - Meshy 3D生成、模型加载、STL下载
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
                '<b>API Key:</b> ' + (MESHY_CONFIG.apiKey ? MESHY_CONFIG.apiKey.substring(0, 8) + '...' : '未设置') + '<br/>' +
                '<b>代理地址:</b> ' + MESHY_CONFIG.proxyUrl + '<br/>' +
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
        
        function start3DGeneration() {
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
            
            // 检查 Meshy API Key
            if (!MESHY_CONFIG.apiKey) {
                console.warn('[Meshy] 未配置 API Key，使用降级SVG模型');
                showMeshyKeyDialog(function() {
                    // 用户输入后重试
                    start3DGeneration();
                });
                return;
            }
            
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
                    topology: MESHY_CONFIG.topology,
                    target_polycount: MESHY_CONFIG.targetPolycount,
                    should_texture: MESHY_CONFIG.shouldTexture,
                    enable_pbr: MESHY_CONFIG.enablePbr,
                    target_formats: ['glb', 'stl', '3mf']
                };
                console.log('[Meshy] 提交 image-to-3d 任务（base64模式）');
                
                return fetch(MESHY_CONFIG.proxyUrl + '/api/image-to-3d', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'X-Meshy-Key': MESHY_CONFIG.apiKey
                    },
                    body: JSON.stringify(requestBody)
                }).then(function(resp) {
                    return resp.text().then(function(text) {
                        console.log('[Meshy] 响应状态:', resp.status, '响应内容:', text.substring(0, 500));
                        var data;
                        try { data = JSON.parse(text); } catch(e) { data = null; }
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
                var detail = '错误: ' + (err.message || String(err)) + '\n';
                detail += '代理: ' + MESHY_CONFIG.proxyUrl + '\n';
                detail += 'Key: ' + (MESHY_CONFIG.apiKey ? MESHY_CONFIG.apiKey.substring(0,8) + '...' : '无') + '\n';
                detail += '图片: ' + (imageUrl ? imageUrl.substring(0,50) + '...' : '无');
                try { showMeshyDebug('提交阶段错误', err.message || String(err), ''); } catch(e2) {}
                alert('🔍 3D生成失败详情:\n\n' + detail);
                showToastMessage('⚠️ 3D生成失败：' + err.message);
                // 显示重试按钮
                var retryArea = document.getElementById('meshy-retry-area');
                if (retryArea) retryArea.style.display = 'block';
                var statusPanel = document.getElementById('meshy-live-status');
                var statusText = document.getElementById('meshy-status-text');
                var statusDetail = document.getElementById('meshy-status-detail');
                if (statusPanel) { statusPanel.style.background = '#FFEBEE'; statusPanel.style.borderColor = '#C62828'; statusPanel.style.display = 'block'; }
                if (statusText) statusText.innerHTML = '❌ 提交失败';
                if (statusDetail) statusDetail.innerHTML = err.message || String(err);
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
                fetch(MESHY_CONFIG.proxyUrl + '/api/image-to-3d/' + taskId, {
                    method: 'GET',
                    headers: {
                        'X-Meshy-Key': MESHY_CONFIG.apiKey
                    }
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
                        
                        // 加载3D模型到 viewer
                        loadMeshyModel(state.meshyModelUrl);
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
                
                var loadFired = false;
                
                modelEl.addEventListener('load', function onLoad() {
                    if (loadFired) return;
                    loadFired = true;
                    modelEl.removeEventListener('load', onLoad);
                    modelEl.removeEventListener('error', onError);
                    clearTimeout(loadTimeout);
                    clearTimeout(hintTimeout);
                    console.log('[Meshy] 3D模型加载完成');
                    
                    // 切换到 3D 交互视图（用visibility替代display，避免web component初始化问题）
                    if (thumbEl) thumbEl.style.display = 'none';
                    modelEl.style.visibility = 'visible';
                    modelEl.style.position = 'relative';
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
                    
                    showToastMessage('✅ 3D模型加载完成！可旋转查看');
                });
                
                modelEl.addEventListener('error', function onError(e) {
                    if (loadFired) return;
                    loadFired = true;
                    modelEl.removeEventListener('load', onLoad);
                    modelEl.removeEventListener('error', onError);
                    clearTimeout(loadTimeout);
                    clearTimeout(hintTimeout);
                    console.error('[Meshy] 模型加载失败:', e);
                    showToastMessage('⚠️ 3D预览加载失败，已显示预览图。可下载打印文件');
                    showThumbnailFallback();
                });
                
                // 15秒提示
                var hintTimeout = setTimeout(function() {
                    if (!loadFired) {
                        showToastMessage('⏳ 3D模型仍在加载中，预览图已显示...');
                    }
                }, 15000);
                
                // 90秒超时：保留预览图而非默认SVG
                var loadTimeout = setTimeout(function() {
                    if (loadFired) return;
                    loadFired = true;
                    modelEl.removeEventListener('load', onLoad);
                    modelEl.removeEventListener('error', onError);
                    console.warn('[Meshy] model-viewer 加载超时(90s)，保留预览图');
                    showToastMessage('⚠️ 3D交互加载超时，已保留预览图。可下载打印文件');
                    showThumbnailFallback();
                }, 90000);
                
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
        
        // 显示 Meshy API Key 输入对话框
        function showMeshyKeyDialog(onSuccess) {
            var existing = document.getElementById('meshy-key-dialog');
            if (existing) existing.remove();
            
            var overlay = document.createElement('div');
            overlay.id = 'meshy-key-dialog';
            overlay.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.5);z-index:10000;display:flex;align-items:center;justify-content:center;';
            overlay.innerHTML = '<div style="background:#FAF8F0;border-radius:16px;padding:24px;max-width:420px;width:90%;box-shadow:0 8px 32px rgba(0,0,0,0.3);">' +
                '<h3 style="margin:0 0 12px;color:#3a2a1a;font-size:16px;">🎮 设置 3D 模型生成密钥</h3>' +
                '<p style="font-size:12px;color:#7a6a56;line-height:1.6;margin-bottom:8px;">需要 Meshy API Key 才能将神兽变成3D模型。<br/>获取方式：登录 <a href="https://www.meshy.ai/settings/api" target="_blank" style="color:#c04830;">meshy.ai/settings/api</a></p>' +
                '<div style="background:#FFF8E1;border-radius:8px;padding:10px;margin-bottom:12px;font-size:11px;color:#7a6a56;line-height:1.5;">' +
                '💡 Meshy Pro 会员每天有免费积分额度<br/>' +
                '🔒 密钥仅保存在你的浏览器中，不会上传服务器</div>' +
                '<label style="font-size:12px;color:#3a2a1a;font-weight:600;display:block;margin-bottom:4px;">Meshy API Key</label>' +
                '<input id="meshy-key-input" type="password" placeholder="输入 Meshy Key (如 msy_xxx...)" value="' + (MESHY_CONFIG.apiKey || '') + '" style="width:100%;padding:10px 12px;border:1.5px solid #e8dcc4;border-radius:8px;font-size:14px;outline:none;margin-bottom:12px;box-sizing:border-box;" />' +
                '<label style="font-size:12px;color:#3a2a1a;font-weight:600;display:block;margin-bottom:4px;">代理服务器地址 <span style="font-weight:400;color:#7a6a56;">(Cloudflare Worker URL)</span></label>' +
                '<input id="meshy-proxy-input" type="text" placeholder="https://your-worker.workers.dev" value="' + (MESHY_CONFIG.proxyUrl || '') + '" style="width:100%;padding:10px 12px;border:1.5px solid #e8dcc4;border-radius:8px;font-size:13px;outline:none;margin-bottom:16px;box-sizing:border-box;" />' +
                '<div id="meshy-test-result" style="display:none;margin-bottom:12px;padding:10px;border-radius:8px;font-size:12px;line-height:1.5;"></div>' +
                '<div style="display:flex;gap:10px;">' +
                '<button id="meshy-key-cancel" style="flex:1;padding:10px;border:1.5px solid #e8dcc4;background:white;border-radius:8px;font-size:14px;cursor:pointer;">取消</button>' +
                '<button id="meshy-key-test" style="flex:1;padding:10px;border:1.5px solid #c04830;background:white;color:#c04830;border-radius:8px;font-size:14px;cursor:pointer;font-weight:bold;">🔍 测试连接</button>' +
                '<button id="meshy-key-save" style="flex:1;padding:10px;border:none;background:#c04830;color:white;border-radius:8px;font-size:14px;cursor:pointer;font-weight:bold;">保存并开始</button>' +
                '</div></div>';
            document.body.appendChild(overlay);
            
            document.getElementById('meshy-key-cancel').onclick = function() { 
                overlay.remove(); 
                showFallbackSVG();
            };
            document.getElementById('meshy-key-test').onclick = function() {
                var key = document.getElementById('meshy-key-input').value.trim();
                var proxy = document.getElementById('meshy-proxy-input').value.trim();
                var resultDiv = document.getElementById('meshy-test-result');
                if (!key) {
                    resultDiv.style.display = 'block';
                    resultDiv.style.background = '#FFEBEE';
                    resultDiv.style.color = '#C62828';
                    resultDiv.textContent = '❌ 请先输入 API Key';
                    return;
                }
                if (!proxy) {
                    resultDiv.style.display = 'block';
                    resultDiv.style.background = '#FFEBEE';
                    resultDiv.style.color = '#C62828';
                    resultDiv.textContent = '❌ 请先输入代理服务器地址';
                    return;
                }
                resultDiv.style.display = 'block';
                resultDiv.style.background = '#FFF8E1';
                resultDiv.style.color = '#856404';
                resultDiv.textContent = '⏳ 正在测试连接...';
                
                fetch(proxy + '/api/balance', {
                    method: 'GET',
                    headers: { 'X-Meshy-Key': key }
                })
                .then(function(resp) { return resp.text().then(function(text) { return { status: resp.status, text: text }; }); })
                .then(function(result) {
                    try {
                        var data = JSON.parse(result.text);
                        if (result.status === 200) {
                            var credits = data.balance !== undefined ? data.balance : '未知';
                            resultDiv.style.background = '#E8F5E9';
                            resultDiv.style.color = '#2E7D32';
                            resultDiv.innerHTML = '✅ <b>连接成功！</b><br/>可用积分: ' + credits + '<br/>状态: 正常';
                        } else if (result.status === 401) {
                            resultDiv.style.background = '#FFEBEE';
                            resultDiv.style.color = '#C62828';
                            resultDiv.innerHTML = '❌ <b>认证失败</b><br/>API Key 无效或已过期<br/>请检查后重试';
                        } else if (result.status === 402) {
                            resultDiv.style.background = '#FFEBEE';
                            resultDiv.style.color = '#C62828';
                            resultDiv.innerHTML = '❌ <b>积分不足</b><br/>Meshy 积分已用完<br/>请充值后再试';
                        } else {
                            resultDiv.style.background = '#FFEBEE';
                            resultDiv.style.color = '#C62828';
                            resultDiv.innerHTML = '❌ <b>请求失败</b><br/>HTTP ' + result.status + '<br/>' + (data.message || data.error || result.text).substring(0, 100);
                        }
                    } catch(e) {
                        resultDiv.style.background = '#FFEBEE';
                        resultDiv.style.color = '#C62828';
                        resultDiv.innerHTML = '❌ <b>解析失败</b><br/>HTTP ' + result.status + '<br/>响应: ' + result.text.substring(0, 150);
                    }
                })
                .catch(function(err) {
                    resultDiv.style.background = '#FFEBEE';
                    resultDiv.style.color = '#C62828';
                    resultDiv.innerHTML = '❌ <b>网络错误</b><br/>无法连接到代理服务器<br/>请检查代理地址是否正确<br/><span style="font-size:10px;opacity:0.7;">' + err.message + '</span>';
                });
            };
            document.getElementById('meshy-key-save').onclick = function() {
                var key = document.getElementById('meshy-key-input').value.trim();
                var proxy = document.getElementById('meshy-proxy-input').value.trim();
                if (key) {
                    MESHY_CONFIG.apiKey = key;
                    localStorage.setItem('meshy_api_key', key);
                }
                if (proxy) {
                    MESHY_CONFIG.proxyUrl = proxy;
                    localStorage.setItem('meshy_proxy_url', proxy);
                }
                overlay.remove();
                if (typeof onSuccess === 'function') onSuccess();
            };
            overlay.onclick = function(e) { 
                if (e.target === overlay) {
                    overlay.remove();
                    showFallbackSVG();
                }
            };
            setTimeout(function() { 
                var inp = document.getElementById('meshy-key-input');
                if (inp) inp.focus();
            }, 100);
        }
