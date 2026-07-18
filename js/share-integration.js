/**
 * share-integration.js - Package Share System v3.1
 * 
 * Features:
 *   - Package upload: 2D images + 3D models bundled together
 *   - QR code in result modal for parents to scan
 *   - Test package: pre-stored data for quick testing
 *   - Inject buttons on page-9 (style select) and page-11 (download panel)
 *   - Auto-authenticate (no password prompt for students)
 */

(function() {
  'use strict';

  var SHARE_API = 'https://api.mindbubble.cloud';
  var SHARE_PAGE_BASE = 'https://zhongzhouxian-qiyuji.pages.dev/share.html';
  var SHARE_API_PASSWORD = 'zhongzhou2026!!!';
  var TEST_3D_URL = 'https://modelviewer.dev/shared-assets/models/Astronaut.glb';
  var QR_LIB_URL = 'https://cdn.jsdelivr.net/npm/qrcode-generator@1.4.4/qrcode.min.js';

  // ========== Load QR library on demand ==========
  var qrLibLoaded = false;
  var qrCallbacks = [];

  function ensureQRLib(callback) {
    if (qrLibLoaded) { callback(); return; }
    qrCallbacks.push(callback);
    if (document.getElementById('qr-lib-script')) return;
    var s = document.createElement('script');
    s.id = 'qr-lib-script';
    s.src = QR_LIB_URL;
    s.onload = function() {
      qrLibLoaded = true;
      qrCallbacks.forEach(function(cb) { cb(); });
      qrCallbacks = [];
    };
    s.onerror = function() {
      // Fallback: show URL without QR
      qrCallbacks.forEach(function(cb) { cb(); });
      qrCallbacks = [];
    };
    document.head.appendChild(s);
  }

  // ========== Helper: extract base64 from a DOM <img> element via canvas ==========
  function extractFromDOM(imgEl, label) {
    try {
      if (!imgEl || !imgEl.complete || !imgEl.naturalWidth) {
        console.log('[Share] domExtract SKIP: img not ready, label=' + label);
        return null;
      }
      var canvas = document.createElement('canvas');
      canvas.width = imgEl.naturalWidth;
      canvas.height = imgEl.naturalHeight;
      var ctx = canvas.getContext('2d');
      ctx.drawImage(imgEl, 0, 0);
      var dataURL = canvas.toDataURL('image/png');
      console.log('[Share] domExtract OK: label=' + label + ', size=' + imgEl.naturalWidth + 'x' + imgEl.naturalHeight + ', b64len=' + dataURL.length);
      return dataURL;
    } catch(e) {
      console.error('[Share] domExtract FAILED: label=' + label + ', err=' + e.message);
      return null;
    }
  }

  // ========== Helper: convert any image source to base64 data URI ==========
  async function imageToBase64(src, label) {
    if (!src) { console.log('[Share] img2b64 SKIP: empty src'); return null; }
    // Already a data URI
    if (src.indexOf('data:image') === 0) return src;
    // HTTP URL → try Worker proxy first (avoids CORS issues with TOS etc.)
    if (src.indexOf('http') === 0) {
      try {
        var proxyUrl = SHARE_API + '/api/proxy-image?url=' + encodeURIComponent(src);
        var resp = await fetch(proxyUrl);
        if (resp.ok) {
          var json = await resp.json();
          if (json.base64) {
            console.log('[Share] img2b64: proxy OK for ' + label + ', size=' + json.size);
            return json.base64;
          }
        }
        console.log('[Share] img2b64: proxy failed status=' + resp.status + ' for ' + label);
      } catch(e) { console.log('[Share] img2b64: proxy error for ' + label + ': ' + e.message); }
    }
    return null;
  }

  // ========== Collect all content into a package ==========
  async function collectPackage(studentName, creatureName) {
    var images = [];
    var models = [];
    var name = studentName + '的' + creatureName;
    var styleNames = ['古石刻韵', '琉璃焕彩', '青铜古韵', '水墨丹青', '经典复古', '现代简约', '金色华贵', '传统风格'];

    // ============ Collect 2D images — DOM-first strategy ============
    // Root cause: state._generatedImageUrls stores TOS HTTP URLs (ark-acg-cn-beijing.tos)
    // Browser CORS blocks fetch of these URLs → all conversions fail.
    // Fix: Extract directly from DOM <img> elements (already loaded in browser).

    // Layer 1: Extract from DOM candidate-card images (MOST RELIABLE)
    var domImgs = document.querySelectorAll('.candidate-card .candidate-image img');
    console.log('[Share] Layer1 DOM candidate imgs: ' + domImgs.length);
    for (var d = 0; d < domImgs.length && images.length < 4; d++) {
      var imgEl = domImgs[d];
      var src = imgEl.getAttribute('src');
      if (!src || src === '' || src.indexOf('loading') >= 0) continue;
      // If already data URI, use directly
      if (src.indexOf('data:image') === 0) {
        images.push({ base64: src, name: styleNames[images.length] || ('方案' + (images.length + 1)), mime: 'image/png' });
        console.log('[Share] Layer1 dom direct data-uri OK: idx=' + images.length);
      } else {
        // Extract via canvas (browser already loaded this image)
        var b64 = extractFromDOM(imgEl, 'dom[' + d + ']');
        if (b64) {
          images.push({ base64: b64, name: styleNames[images.length] || ('方案' + (images.length + 1)), mime: 'image/png' });
        } else {
          console.log('[Share] Layer1 dom canvas extract failed for dom[' + d + ']');
        }
      }
    }

    // Layer 2: localStorage cached_ai_images
    if (images.length < 4) {
      try {
        var cached = JSON.parse(localStorage.getItem('cached_ai_images') || '[]');
        console.log('[Share] Layer2 localStorage cached: ' + cached.length + ' items');
        for (var c = cached.length - 1; c >= 0 && images.length < 4; c--) {
          var cachedItem = cached[c];
          if (!cachedItem) continue;
          if (typeof cachedItem === 'string' && cachedItem.indexOf('data:image') === 0) {
            images.push({ base64: cachedItem, name: styleNames[images.length] || ('方案' + (images.length + 1)), mime: 'image/png' });
            console.log('[Share] Layer2 cache direct data-uri OK');
          } else if (typeof cachedItem === 'string' && cachedItem.indexOf('http') === 0) {
            var b64 = await imageToBase64(cachedItem, 'cache[' + c + ']');
            if (b64) {
              images.push({ base64: b64, name: styleNames[images.length] || ('方案' + (images.length + 1)), mime: 'image/png' });
            }
          }
        }
      } catch(e) { console.warn('[Share] Layer2 localStorage read failed:', e.message); }
    }

    // Layer 3: state._generatedImageUrls (HTTP URLs — likely CORS fail, last resort)
    if (images.length < 4) {
      var stateUrls = state._generatedImageUrls || [];
      console.log('[Share] Layer3 state._generatedImageUrls: ' + stateUrls.length + ' items');
      for (var s = 0; s < stateUrls.length && images.length < 4; s++) {
        var u = stateUrls[s];
        if (!u) continue;
        if (typeof u === 'string' && u.indexOf('data:image') === 0) {
          images.push({ base64: u, name: styleNames[images.length] || ('方案' + (images.length + 1)), mime: 'image/png' });
        } else if (typeof u === 'string' && u.indexOf('http') === 0) {
          var b64 = await imageToBase64(u, 'state[' + s + ']');
          if (b64) {
            images.push({ base64: b64, name: styleNames[images.length] || ('方案' + (images.length + 1)), mime: 'image/png' });
          } else {
            console.log('[Share] Layer3 state fetch failed (expected CORS): state[' + s + ']');
          }
        }
      }
    }

    // Collect 3D models
    var urls = state.meshyAllUrls || {};
    if (urls.glb) {
      models.push({ url: urls.glb, format: 'glb', filename: name + '.glb' });
    }
    if (urls.stl) {
      models.push({ url: urls.stl, format: 'stl', filename: name + '.stl' });
    }
    if (urls['3mf']) {
      models.push({ url: urls['3mf'], format: '3mf', filename: name + '.3mf' });
    }

    // Fallback: use meshyModelUrl / meshyStlUrl if meshyAllUrls is incomplete
    if (models.length === 0) {
      if (state.meshyModelUrl) {
        models.push({ url: state.meshyModelUrl, format: 'glb', filename: name + '.glb' });
      }
      if (state.meshyStlUrl) {
        // Try to detect format from URL
        var fmt = 'stl';
        if (state.meshyStlUrl.indexOf('.3mf') >= 0) fmt = '3mf';
        models.push({ url: state.meshyStlUrl, format: fmt, filename: name + '.' + fmt });
      }
    }

    return {
      type: 'package',
      name: name,
      data: {
        images: images,
        models: models
      }
    };
  }

  // ========== Build test package ==========
  function buildTestPackage() {
    // Generate 4 simple colored test images as data URIs using canvas
    var colors = ['#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4'];
    var names = ['经典复古', '现代简约', '金色华贵', '水墨丹青'];
    var testImages = [];

    // Try to use canvas to generate colored images
    try {
      var canvas = document.createElement('canvas');
      canvas.width = 200;
      canvas.height = 200;
      var ctx = canvas.getContext('2d');

      for (var i = 0; i < 4; i++) {
        ctx.fillStyle = colors[i];
        ctx.fillRect(0, 0, 200, 200);
        ctx.fillStyle = 'white';
        ctx.font = 'bold 20px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(names[i], 100, 105);
        testImages.push({
          base64: canvas.toDataURL('image/png'),
          name: names[i],
          mime: 'image/png'
        });
      }
    } catch (e) {
      // Fallback: tiny placeholder
      for (var j = 0; j < 4; j++) {
        testImages.push({
          base64: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==',
          name: names[j],
          mime: 'image/png'
        });
      }
    }

    var testModels = [
      { url: TEST_3D_URL, format: 'glb', filename: '测试模型.glb' },
      { url: TEST_3D_URL, format: 'stl', filename: '测试模型.stl' },
      { url: TEST_3D_URL, format: '3mf', filename: '测试模型.3mf' }
    ];

    return {
      name: '测试神兽作品（预存）',
      data: {
        images: testImages,
        models: testModels
      }
    };
  }

  // ========== Upload to server ==========
  async function uploadPackage(pkg) {
    var authHeader = getAuthHeader();
    if (!authHeader) {
      showToastMessage('请先验证密码');
      var authed = await ensureAuthenticated();
      if (!authed) return null;
      authHeader = getAuthHeader();
    }

    var resp = await fetch(SHARE_API + '/api/share/upload', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': authHeader },
      body: JSON.stringify(pkg)
    });

    if (!resp.ok) {
      var errText = await resp.text();
      var errData;
      try { errData = JSON.parse(errText); } catch (e) { errData = { error: errText }; }
      throw new Error(errData.error || '上传失败 (HTTP ' + resp.status + ')');
    }

    var result = await resp.json();
    if (!result.success) throw new Error(result.error || '上传失败');
    return result;
  }

  // ========== Upload test package via test endpoint ==========
  async function uploadTestPackage() {
    var authHeader = getAuthHeader();
    if (!authHeader) {
      showToastMessage('请先验证密码');
      var authed = await ensureAuthenticated();
      if (!authed) return null;
      authHeader = getAuthHeader();
    }

    var resp = await fetch(SHARE_API + '/api/test-upload', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': authHeader },
      body: JSON.stringify({ name: '测试神兽作品（预存）' })
    });

    if (!resp.ok) throw new Error('测试上传失败: HTTP ' + resp.status);
    var result = await resp.json();
    if (!result.success) throw new Error(result.error || '测试上传失败');
    return result;
  }

  // ========== Show result with QR code ==========
  function showShareResult(shareUrl, title, studentName, isTest) {
    var overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.5);z-index:99999;display:flex;align-items:center;justify-content:center;padding:16px;';

    var modal = document.createElement('div');
    modal.style.cssText = 'background:white;border-radius:20px;padding:24px;max-width:380px;width:100%;box-shadow:0 20px 60px rgba(0,0,0,0.3);text-align:center;';

    var testBadge = isTest ? '<div style="display:inline-block;background:#FFA726;color:white;padding:2px 10px;border-radius:10px;font-size:11px;margin-bottom:8px;">测试模式</div>' : '';

    modal.innerHTML =
      testBadge +
      '<div style="font-size:40px;margin-bottom:6px;">🎉</div>' +
      '<h3 style="margin:0 0 4px 0;color:#1565C0;font-size:17px;">分享成功！</h3>' +
      '<p style="margin:0 0 16px 0;color:#78909C;font-size:13px;">' + esc(studentName) + ' 的作品已可分享</p>' +
      '<div id="qr-container" style="display:flex;justify-content:center;margin-bottom:16px;min-height:180px;align-items:center;">' +
        '<div style="color:#90A4AE;font-size:13px;">生成二维码中...</div>' +
      '</div>' +
      '<div style="background:#F5F5F5;border-radius:8px;padding:10px;margin-bottom:16px;">' +
        '<input type="text" value="' + shareUrl + '" readonly style="width:100%;padding:8px;border:1px solid #E0E0E0;border-radius:6px;font-size:11px;color:#333;box-sizing:border-box;text-align:center;" id="share-url-input">' +
      '</div>' +
      '<div style="display:flex;gap:10px;">' +
        '<button id="btn-copy-share" style="flex:1;padding:12px;background:#1976D2;color:white;border:none;border-radius:10px;font-size:14px;font-weight:600;cursor:pointer;">📋 复制链接</button>' +
        '<button id="btn-close-share" style="flex:1;padding:12px;background:#E3F2FD;color:#1565C0;border:none;border-radius:10px;font-size:14px;font-weight:600;cursor:pointer;">关闭</button>' +
      '</div>';

    overlay.appendChild(modal);
    document.body.appendChild(overlay);

    // Generate QR code
    ensureQRLib(function() {
      var qrContainer = document.getElementById('qr-container');
      if (!qrContainer) return;

      if (typeof qrcode === 'function') {
        try {
          var qr = qrcode(0, 'M');
          qr.addData(shareUrl);
          qr.make();
          qrContainer.innerHTML = qr.createImgTag(5, 8);
        } catch (e) {
          qrContainer.innerHTML = '<div style="color:#EF5350;font-size:12px;">二维码生成失败</div>';
        }
      } else {
        // Library failed to load, show message
        qrContainer.innerHTML = '<div style="color:#78909C;font-size:12px;padding:20px;">请复制链接分享给家长</div>';
      }
    });

    // Copy button
    document.getElementById('btn-copy-share').onclick = function() {
      var input = document.getElementById('share-url-input');
      input.select();
      input.setSelectionRange(0, 99999);
      try {
        document.execCommand('copy');
        this.innerHTML = '✅ 已复制';
        this.style.background = '#4CAF50';
        showToastMessage('✅ 链接已复制');
      } catch (e) {
        if (navigator.clipboard) {
          navigator.clipboard.writeText(shareUrl).then(function() {
            document.getElementById('btn-copy-share').innerHTML = '✅ 已复制';
            showToastMessage('✅ 链接已复制');
          });
        }
      }
    };

    // Close button
    document.getElementById('btn-close-share').onclick = function() {
      document.body.removeChild(overlay);
    };
    overlay.onclick = function(e) {
      if (e.target === overlay) document.body.removeChild(overlay);
    };

    // Update main share button if exists
    var shareBtn = document.getElementById('btn-share-creature');
    if (shareBtn && !isTest) {
      shareBtn.disabled = false;
      shareBtn.innerHTML = '✅ 已分享';
      shareBtn.style.background = 'linear-gradient(135deg,#4CAF50,#66BB6A)';
      shareBtn.style.opacity = '1';
    }
  }

  // ========== Main: Real share (collect all content) ==========
  async function uploadAndShare() {
    var shareBtn = document.getElementById('btn-share-creature');
    var origHtml = shareBtn ? shareBtn.innerHTML : '';
    if (shareBtn) {
      shareBtn.disabled = true;
      shareBtn.innerHTML = '⏳ 准备中...';
      shareBtn.style.opacity = '0.7';
    }

    try {
      var creatureName = state.currentCreatureName || '守护神兽';
      var studentName = getStudentName();

      showToastMessage('⏳ 正在打包作品...');

      // Check if we have any content to share
      var hasImages = (state._generatedImageUrls || []).some(function(u) { return !!u; });
      // Also check localStorage cache and DOM as potential image sources
      if (!hasImages) {
        var domImgsCheck = document.querySelectorAll('.candidate-card .candidate-image img');
        if (domImgsCheck.length > 0) hasImages = true;
      }
      if (!hasImages) {
        try {
          var cachedCheck = JSON.parse(localStorage.getItem('cached_ai_images') || '[]');
          if (cachedCheck.length > 0) hasImages = true;
        } catch(e) {}
      }
      var hasModels = !!(state.meshyModelUrl || state.meshyStlUrl || (state.meshyAllUrls && Object.keys(state.meshyAllUrls).length > 0));

      if (!hasImages && !hasModels) {
        showToastMessage('❌ 没有可分享的内容，请先生成图片或3D模型');
        restoreBtn(shareBtn, origHtml);
        return;
      }

      var pkg = await collectPackage(studentName, creatureName);
      showToastMessage('⏳ 正在上传 (' + pkg.data.images.length + '张图 + ' + pkg.data.models.length + '个模型)...');

      var result = await uploadPackage(pkg);
      if (!result) { restoreBtn(shareBtn, origHtml); return; }

      var shareUrl = SHARE_PAGE_BASE + '?id=' + result.shareId;
      console.log('[Share] 分享链接:', shareUrl);
      showShareResult(shareUrl, pkg.name, studentName, false);

    } catch (err) {
      console.error('[Share] 上传失败:', err);
      showToastMessage('❌ 分享失败: ' + err.message);
      restoreBtn(shareBtn, origHtml);
    }
  }

  // ========== Test share (pre-stored data) ==========
  async function quickTestShare() {
    var btn = document.getElementById('btn-test-share') || document.getElementById('btn-test-share-page9');
    var origHtml = btn ? btn.innerHTML : '';
    if (btn) {
      btn.disabled = true;
      btn.innerHTML = '⏳ 生成中...';
      btn.style.opacity = '0.7';
    }

    try {
      showToastMessage('⏳ 正在创建测试作品包...');
      var result = await uploadTestPackage();
      if (!result) { restoreBtn(btn, origHtml); return; }

      var shareUrl = SHARE_PAGE_BASE + '?id=' + result.shareId;
      console.log('[Share] 测试分享:', shareUrl);
      showShareResult(shareUrl, '测试神兽作品（预存）', '测试同学', true);
      restoreBtn(btn, origHtml);

    } catch (err) {
      console.error('[Share] 测试失败:', err);
      showToastMessage('❌ 测试失败: ' + err.message);
      restoreBtn(btn, origHtml);
    }
  }

  // ========== Helper functions ==========
  function restoreBtn(btn, origHtml) {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = origHtml || btn.innerHTML;
      btn.style.opacity = '1';
    }
  }

  function getStudentName() {
    if (state.studentName) return state.studentName;
    if (state.userName) return state.userName;
    var saved = localStorage.getItem('student_name');
    if (saved) return saved;
    return '小明';
  }

  function getAuthHeader() {
    var token = localStorage.getItem('share_auth_token');
    return token ? 'Bearer ' + token : '';
  }

  async function ensureAuthenticated() {
    // Check if we already have a valid token
    var existing = localStorage.getItem('share_auth_token');
    if (existing) return true;

    // Auto-authenticate using embedded password (no prompt)
    return new Promise(function(resolve) {
      fetch(SHARE_API + '/api/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: SHARE_API_PASSWORD })
      })
      .then(function(r) { return r.json(); })
      .then(function(result) {
        if (result.token) {
          localStorage.setItem('share_auth_token', result.token);
          resolve(true);
        } else {
          showToastMessage('❌ 认证失败');
          resolve(false);
        }
      })
      .catch(function() {
        showToastMessage('❌ 认证失败');
        resolve(false);
      });
    });
  }

  function showToastMessage(msg) {
    if (typeof window.showToastMessage === 'function') {
      window.showToastMessage(msg);
    } else {
      console.log('[Share]', msg);
    }
  }

  // ========== Create test button element ==========
  function createTestBtn(id) {
    var btn = document.createElement('button');
    btn.id = id;
    btn.innerHTML = '🧪 用预存数据测试分享';
    btn.style.cssText = 'width:100%;margin-top:10px;padding:12px;background:linear-gradient(135deg,#FFA726,#FF7043);color:white;border:none;border-radius:12px;font-size:13px;font-weight:600;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:6px;box-shadow:0 4px 12px rgba(255,112,67,0.3);transition:transform 0.2s;';
    btn.onclick = function() { quickTestShare(); };
    btn.onmouseenter = function() { if (!this.disabled) this.style.transform = 'scale(1.02)'; };
    btn.onmouseleave = function() { this.style.transform = 'scale(1)'; };
    btn.title = '使用预存的测试数据（4张图+3D模型）快速测试分享功能';
    return btn;
  }

  // ========== Inject buttons ==========
  function injectButtons() {
    // 1. Download panel (page-11)
    var shareBtn = document.getElementById('btn-share-creature');
    if (shareBtn) {
      if (!document.getElementById('btn-test-share')) {
        var testBtn = createTestBtn('btn-test-share');
        shareBtn.parentNode.insertBefore(testBtn, shareBtn.nextSibling);
        console.log('[Share] 下载面板测试按钮已注入');
      }
      // Override share button to use package upload
      shareBtn.onclick = function() { uploadAndShare(); };
      shareBtn.onmouseenter = function() { if (!this.disabled) this.style.transform = 'scale(1.02)'; };
      shareBtn.onmouseleave = function() { this.style.transform = 'scale(1)'; };
    }

    // 2. Style selection page (page-9)
    var skipBtn = Array.from(document.querySelectorAll('button')).find(function(b) {
      return b.textContent.indexOf('跳过') >= 0 && b.textContent.indexOf('测试用') >= 0;
    });
    if (skipBtn && !document.getElementById('btn-test-share-page9')) {
      var page9Btn = createTestBtn('btn-test-share-page9');
      skipBtn.parentNode.insertBefore(page9Btn, skipBtn.nextSibling);
      console.log('[Share] 风格选择页测试按钮已注入');
    }
  }

  // Init
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', injectButtons);
  } else {
    injectButtons();
  }

  // SPA page navigation
  var origShowPage = window.showPage;
  if (typeof origShowPage === 'function') {
    window.showPage = function(n) {
      origShowPage(n);
      setTimeout(injectButtons, 500);
    };
  }

  // Expose API
  window.ShareIntegration = {
    uploadAndShare: uploadAndShare,
    quickTestShare: quickTestShare,
    SHARE_API: SHARE_API
  };

  console.log('[Share] 分享模块 v3.1 (auto-auth + package + QR) 已加载');

  function esc(s) {
    if (!s) return '';
    return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,"&#39;");
  }

})();
