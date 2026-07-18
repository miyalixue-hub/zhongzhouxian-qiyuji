/**
 * share-integration.js - Cloudflare KV 分享系统 v2.1
 * 
 * v2.1 新增：
 *   - 预存测试模型快捷分享按钮（免生成、免费）
 *   - 正常分享流程（从已生成的2D/3D数据上传）
 */

(function() {
  'use strict';

  var SHARE_API = 'https://api.mindbubble.cloud';
  var SHARE_PAGE_BASE = 'https://zhongzhouxian-qiyuji.pages.dev/share.html';

  // 预存的测试3D模型（公开GLB，免Meshy积分）
  var TEST_3D_URL = 'https://modelviewer.dev/shared-assets/models/Astronaut.glb';

  /**
   * 预存测试模型分享（快捷按钮用）
   */
  async function quickTestShare() {
    var shareBtn = document.getElementById('btn-test-share');
    var origHtml = shareBtn ? shareBtn.innerHTML : '';
    if (shareBtn) { shareBtn.disabled = true; shareBtn.innerHTML = '⏳ 生成中...'; }

    try {
      var authHeader = getAuthHeader();
      if (!authHeader) {
        showToastMessage(' 请先验证密码');
        var authed = await ensureAuthenticated();
        if (!authed) { restoreBtn(shareBtn, origHtml); return; }
        authHeader = getAuthHeader();
      }

      var resp = await fetch(SHARE_API + '/api/share/upload', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': authHeader
        },
        body: JSON.stringify({
          type: '3d',
          name: '测试神兽（预存模型）',
          data: TEST_3D_URL
        })
      });

      if (!resp.ok) {
        var errText = await resp.text();
        throw new Error('上传失败: ' + errText);
      }

      var result = await resp.json();
      if (!result.success) throw new Error(result.error || '上传失败');

      var shareUrl = SHARE_PAGE_BASE + '?id=' + result.shareId;
      console.log('[Share] 预存测试分享:', shareUrl);
      showShareResult(shareUrl, '测试神兽（预存模型）', '测试用户', '3d');

    } catch (err) {
      console.error('[Share] 测试分享失败:', err);
      alert('[调试] 预存模型分享失败：\n' + err.message);
      restoreBtn(shareBtn, origHtml);
    }
  }

  /**
   * 正常分享流程（上传已生成的2D/3D内容）
   */
  async function uploadAndShare() {
    var shareBtn = document.getElementById('btn-share-creature');
    var origHtml = shareBtn ? shareBtn.innerHTML : '';
    if (shareBtn) { shareBtn.disabled = true; shareBtn.innerHTML = '⏳ 正在准备...'; shareBtn.style.opacity = '0.7'; }

    try {
      var creatureName = state.currentCreatureName || '我的守护神兽';
      var studentName = getStudentName();
      var type, data, name;

      var hasImage = state.selectedCandidate !== null && 
                     state.selectedCandidate !== undefined &&
                     state._generatedImageUrls[state.selectedCandidate];
      var urls = state.meshyAllUrls || {};
      var glbUrl = state.meshyModelUrl || urls.glb || '';
      var stlUrl = urls.stl || urls['3mf'] || '';

      if (hasImage && !stlUrl) {
        type = '2d';
        var imgDataUri = state._generatedImageUrls[state.selectedCandidate];
        data = imgDataUri.replace(/^data:image\/[a-z]+;base64,/, '');
        name = studentName + '的' + creatureName;
        console.log('[Share] 分享2D图片, base64长度:', data.length);
      } else if (glbUrl) {
        type = '3d';
        data = glbUrl;
        name = studentName + '的' + creatureName;
        console.log('[Share] 分享3D模型 GLB');
      } else if (stlUrl) {
        type = '3d';
        data = stlUrl;
        name = studentName + '的' + creatureName;
        console.log('[Share] 分享3D模型 STL');
      } else {
        showToastMessage('❌ 没有可分享的内容，请先生成图片或3D模型');
        restoreBtn(shareBtn, origHtml);
        return;
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
        headers: {
          'Content-Type': 'application/json',
          'Authorization': authHeader
        },
        body: JSON.stringify({ type: type, name: name, data: data })
      });

      if (!resp.ok) {
        var errText = await resp.text();
        var errData;
        try { errData = JSON.parse(errText); } catch(e) { errData = { error: errText }; }
        throw new Error(errData.error || '上传失败 (HTTP ' + resp.status + ')');
      }

      var result = await resp.json();
      if (!result.success) throw new Error(result.error || '上传失败');

      var shareUrl = SHARE_PAGE_BASE + '?id=' + result.shareId;
      console.log('[Share] 上传成功:', result);
      console.log('[Share] 分享链接:', shareUrl);
      showShareResult(shareUrl, creatureName, studentName, type);

    } catch (err) {
      console.error('[Share] 上传失败:', err);
      showToastMessage('❌ 分享失败: ' + err.message);
      restoreBtn(shareBtn, origHtml);
    }
  }

  function restoreBtn(btn, origHtml) {
    if (btn) { btn.disabled = false; btn.innerHTML = origHtml || '🔗 分享给朋友看'; btn.style.opacity = '1'; }
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
          showToastMessage('⚠️ 复制失败，请手动选择链接复制');
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

  function getStudentName() {
    if (state.studentName) return state.studentName;
    if (state.userName) return state.userName;
    var saved = localStorage.getItem('student_name');
    if (saved) return saved;
    var name = prompt('请输入你的名字（用于分享展示）：', '');
    if (name && name.trim()) { localStorage.setItem('student_name', name.trim()); return name.trim(); }
    return '小明';
  }

  // ========== 绑定按钮 ==========
  function bindShareButtons() {
    var shareBtn = document.getElementById('btn-share-creature');
    if (shareBtn) {
      shareBtn.onclick = function() { uploadAndShare(); };
      shareBtn.onmouseenter = function() { if (!this.disabled) this.style.transform = 'scale(1.02)'; };
      shareBtn.onmouseleave = function() { this.style.transform = 'scale(1)'; };
      console.log('[Share] 分享按钮已绑定 (v2.1)');
    }

    // 创建预存测试按钮（插在分享按钮后面）
    var testBtn = document.createElement('button');
    testBtn.id = 'btn-test-share';
    testBtn.innerHTML = '🧪 用预存模型测试';
    testBtn.style.cssText = 'width:100%;margin-top:8px;padding:12px;background:linear-gradient(135deg,#FFA726,#FF7043);color:white;border:none;border-radius:12px;font-size:13px;font-weight:600;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:6px;box-shadow:0 4px 12px rgba(255,112,67,0.3);transition:transform 0.2s;opacity:0.9;';
    testBtn.onclick = function() { quickTestShare(); };
    testBtn.onmouseenter = function() { if (!this.disabled) this.style.transform = 'scale(1.02)'; };
    testBtn.onmouseleave = function() { this.style.transform = 'scale(1)'; };
    testBtn.title = '使用预存3D模型快速测试分享功能，免生成、免费';

    if (shareBtn) {
      shareBtn.parentNode.insertBefore(testBtn, shareBtn.nextSibling);
    } else {
      var panel = document.getElementById('download-panel');
      if (panel) panel.appendChild(testBtn);
    }

    console.log('[Share] 预存测试按钮已创建');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bindShareButtons);
  } else {
    bindShareButtons();
  }

  window.ShareIntegration = {
    uploadAndShare: uploadAndShare,
    quickTestShare: quickTestShare,
    SHARE_API: SHARE_API
  };

  console.log('[Share] 分享模块已加载 v2.1');

})();
