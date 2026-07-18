/**
 * share-integration.js - Cloudflare KV 分享系统 v2.2
 * 
 * v2.2 新增：
 *   - 在风格选择页(page-9)也注入测试按钮，不用到下载面板就能测试分享
 *   - 下载面板的测试按钮保留
 */

(function() {
  'use strict';

  var SHARE_API = 'https://api.mindbubble.cloud';
  var SHARE_PAGE_BASE = 'https://zhongzhouxian-qiyuji.pages.dev/share.html';
  var TEST_3D_URL = 'https://modelviewer.dev/shared-assets/models/Astronaut.glb';

  // ========== 核心：上传并分享 ==========
  async function uploadAndShare() {
    var shareBtn = document.getElementById('btn-share-creature');
    var origHtml = shareBtn ? shareBtn.innerHTML : '';
    if (shareBtn) { shareBtn.disabled = true; shareBtn.innerHTML = '⏳ 正在准备...'; shareBtn.style.opacity = '0.7'; }

    try {
      var creatureName = state.currentCreatureName || '我的守护神兽';
      var studentName = getStudentName();
      var type, data, name;

      var hasImage = state.selectedCandidate !== null && state.selectedCandidate !== undefined &&
                     state._generatedImageUrls[state.selectedCandidate];
      var urls = state.meshyAllUrls || {};
      var glbUrl = state.meshyModelUrl || urls.glb || '';
      var stlUrl = urls.stl || urls['3mf'] || '';

      if (hasImage && !stlUrl) {
        type = '2d';
        var imgDataUri = state._generatedImageUrls[state.selectedCandidate];
        data = imgDataUri.replace(/^data:image\/[a-z]+;base64,/, '');
        name = studentName + '的' + creatureName;
      } else if (glbUrl) {
        type = '3d'; data = glbUrl; name = studentName + '的' + creatureName;
      } else if (stlUrl) {
        type = '3d'; data = stlUrl; name = studentName + '的' + creatureName;
      } else {
        showToastMessage('❌ 没有可分享的内容，请先生成图片或3D模型');
        restoreBtn(shareBtn, origHtml); return;
      }

      if (shareBtn) shareBtn.innerHTML = '⏳ 正在上传...';
      showToastMessage('⏳ 正在上传到分享服务器...');

      var authHeader = getAuthHeader();
      if (!authHeader) {
        showToastMessage(' 请先验证密码');
        var authed = await ensureAuthenticated();
        if (!authed) { restoreBtn(shareBtn, origHtml); return; }
        authHeader = getAuthHeader();
      }

      var resp = await fetch(SHARE_API + '/api/share/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': authHeader },
        body: JSON.stringify({ type: type, name: name, data: data })
      });

      if (!resp.ok) {
        var errText = await resp.text();
        var errData; try { errData = JSON.parse(errText); } catch(e) { errData = { error: errText }; }
        throw new Error(errData.error || '上传失败 (HTTP ' + resp.status + ')');
      }

      var result = await resp.json();
      if (!result.success) throw new Error(result.error || '上传失败');

      var shareUrl = SHARE_PAGE_BASE + '?id=' + result.shareId;
      console.log('[Share] 分享链接:', shareUrl);
      showShareResult(shareUrl, creatureName, studentName, type);

    } catch (err) {
      console.error('[Share] 上传失败:', err);
      showToastMessage('❌ 分享失败: ' + err.message);
      restoreBtn(shareBtn, origHtml);
    }
  }

  // ========== 预存模型快捷分享 ==========
  async function quickTestShare() {
    // 找任意可点击的按钮做loading状态
    var btn = document.getElementById('btn-test-share') || document.getElementById('btn-test-share-page9');
    var origHtml = btn ? btn.innerHTML : '';
    if (btn) { btn.disabled = true; btn.innerHTML = '⏳ 生成中...'; btn.style.opacity = '0.7'; }

    try {
      var authHeader = getAuthHeader();
      if (!authHeader) {
        showToastMessage(' 请先验证密码');
        var authed = await ensureAuthenticated();
        if (!authed) { restoreBtn(btn, origHtml); return; }
        authHeader = getAuthHeader();
      }

      var resp = await fetch(SHARE_API + '/api/share/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': authHeader },
        body: JSON.stringify({ type: '3d', name: '测试神兽（预存模型）', data: TEST_3D_URL })
      });

      if (!resp.ok) throw new Error('上传失败: ' + await resp.text());
      var result = await resp.json();
      if (!result.success) throw new Error(result.error || '上传失败');

      var shareUrl = SHARE_PAGE_BASE + '?id=' + result.shareId;
      console.log('[Share] 预存测试分享:', shareUrl);
      showShareResult(shareUrl, '测试神兽（预存模型）', '测试用户', '3d');

    } catch (err) {
      console.error('[Share] 测试分享失败:', err);
      alert('[调试] 预存模型分享失败：\n' + err.message);
      restoreBtn(btn, origHtml);
    }
  }

  function restoreBtn(btn, origHtml) {
    if (btn) { btn.disabled = false; btn.innerHTML = origHtml || '🧪 用预存模型测试'; btn.style.opacity = '1'; }
  }

  function getStudentName() {
    if (state.studentName) return state.studentName;
    if (state.userName) return state.userName;
    var saved = localStorage.getItem('student_name');
    if (saved) return saved;
    var name = prompt('请输入你的名字（用于分享展示）：', '');
    if (name && name.trim()) { localStorage.setItem('student_name', name.trim()); return name.trim(); }
    return '小明';
  }

  function showShareResult(shareUrl, title, studentName, type) {
    var overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.5);z-index:99999;display:flex;align-items:center;justify-content:center;padding:20px;';
    var modal = document.createElement('div');
    modal.style.cssText = 'background:white;border-radius:20px;padding:28px;max-width:420px;width:100%;box-shadow:0 20px 60px rgba(0,0,0,0.3);';
    var typeLabel = type === '2d' ? '图片' : '3D模型';

    modal.innerHTML =
      '<div style="text-align:center;margin-bottom:20px;">' +
        '<div style="font-size:48px;margin-bottom:8px;">🎉</div>' +
        '<h3 style="margin:0 0 8px 0;color:#c04830;font-size:18px;">分享成功！</h3>' +
        '<p style="margin:0;color:#7a6a56;font-size:14px;">' + studentName + ' 的' + typeLabel + '已可分享</p>' +
      '</div>' +
      '<div style="background:#f9f5ed;border-radius:12px;padding:14px;margin-bottom:16px;">' +
        '<div style="font-size:12px;color:#7a6a56;margin-bottom:8px;">分享链接（有效期30天）：</div>' +
        '<input type="text" value="' + shareUrl + '" readonly style="width:100%;padding:10px;border:1px solid #e8dcc4;border-radius:8px;font-size:11px;color:#333;box-sizing:border-box;" id="share-url-input">' +
      '</div>' +
      '<div style="display:flex;gap:10px;">' +
        '<button id="btn-copy-share" style="flex:1;padding:12px;background:#c04830;color:white;border:none;border-radius:10px;font-size:14px;font-weight:600;cursor:pointer;">📋 复制链接</button>' +
        '<button id="btn-close-share" style="flex:1;padding:12px;background:#e8dcc4;color:#7a6a56;border:none;border-radius:10px;font-size:14px;font-weight:600;cursor:pointer;">关闭</button>' +
      '</div>';

    overlay.appendChild(modal);
    document.body.appendChild(overlay);

    document.getElementById('btn-copy-share').onclick = function() {
      var input = document.getElementById('share-url-input');
      input.select(); input.setSelectionRange(0, 99999);
      try {
        document.execCommand('copy');
        this.innerHTML = '✅ 已复制'; this.style.background = '#4CAF50';
        showToastMessage('✅ 链接已复制！');
      } catch (e) {
        if (navigator.clipboard) {
          navigator.clipboard.writeText(shareUrl).then(function() {
            document.getElementById('btn-copy-share').innerHTML = '✅ 已复制';
            showToastMessage('✅ 链接已复制');
          });
        } else {
          showToastMessage('️ 复制失败，请手动选择链接复制');
        }
      }
    };
    document.getElementById('btn-close-share').onclick = function() { document.body.removeChild(overlay); };
    overlay.onclick = function(e) { if (e.target === overlay) document.body.removeChild(overlay); };

    var shareBtn = document.getElementById('btn-share-creature');
    if (shareBtn) {
      shareBtn.disabled = false; shareBtn.innerHTML = '✅ 已分享';
      shareBtn.style.background = 'linear-gradient(135deg,#4CAF50,#66BB6A)'; shareBtn.style.opacity = '1';
    }
  }

  // ========== 注入测试按钮 ==========
  function createTestBtn(id) {
    var btn = document.createElement('button');
    btn.id = id;
    btn.innerHTML = '🧪 用预存模型测试分享';
    btn.style.cssText = 'width:100%;margin-top:10px;padding:12px;background:linear-gradient(135deg,#FFA726,#FF7043);color:white;border:none;border-radius:12px;font-size:13px;font-weight:600;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:6px;box-shadow:0 4px 12px rgba(255,112,67,0.3);transition:transform 0.2s;';
    btn.onclick = function() { quickTestShare(); };
    btn.onmouseenter = function() { if (!this.disabled) this.style.transform = 'scale(1.02)'; };
    btn.onmouseleave = function() { this.style.transform = 'scale(1)'; };
    btn.title = '使用预存3D模型快速测试分享，免生成、免费';
    return btn;
  }

  function injectButtons() {
    // 1. 下载面板（page-11）
    var shareBtn = document.getElementById('btn-share-creature');
    if (shareBtn) {
      if (!document.getElementById('btn-test-share')) {
        var testBtn = createTestBtn('btn-test-share');
        shareBtn.parentNode.insertBefore(testBtn, shareBtn.nextSibling);
        console.log('[Share] 下载面板测试按钮已注入');
      }
      shareBtn.onclick = function() { uploadAndShare(); };
      shareBtn.onmouseenter = function() { if (!this.disabled) this.style.transform = 'scale(1.02)'; };
      shareBtn.onmouseleave = function() { this.style.transform = 'scale(1)'; };
    }

    // 2. 风格选择页（page-9）- 在跳过按钮旁边
    var skipBtn = Array.from(document.querySelectorAll('button')).find(function(b) {
      return b.textContent.indexOf('跳过') >= 0 && b.textContent.indexOf('测试用') >= 0;
    });
    if (skipBtn && !document.getElementById('btn-test-share-page9')) {
      var page9Btn = createTestBtn('btn-test-share-page9');
      skipBtn.parentNode.insertBefore(page9Btn, skipBtn.nextSibling);
      console.log('[Share] 风格选择页测试按钮已注入');
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', injectButtons);
  } else {
    injectButtons();
  }

  // 页面切换后重新注入（SPA模式）
  var origShowPage = window.showPage;
  if (typeof origShowPage === 'function') {
    window.showPage = function(n) {
      origShowPage(n);
      setTimeout(injectButtons, 500);
    };
  }

  window.ShareIntegration = {
    uploadAndShare: uploadAndShare,
    quickTestShare: quickTestShare,
    SHARE_API: SHARE_API
  };

  console.log('[Share] 分享模块已加载 v2.2');

})();
