/**
 * share-integration.js - Cloudflare KV 分享系统
 * 
 * 改动说明（v2.0）：
 *   - 后端从腾讯云迁移到 Cloudflare Worker + KV
 *   - 上传接口改为 /api/share/upload（JSON body）
 *   - 分享链接格式改为 https://zhongzhouxian-qiyuji.pages.dev/share.html?id=XXXXXXXX
 *   - 30天自动过期（KV TTL）
 */

(function() {
  'use strict';

  var SHARE_API = 'https://api.mindbubble.cloud';
  var SHARE_PAGE_BASE = 'https://zhongzhouxian-qiyuji.pages.dev/share.html';

  async function uploadAndShare() {
    var shareBtn = document.getElementById('btn-share-creature');
    var origHtml = shareBtn ? shareBtn.innerHTML : '';
    if (shareBtn) {
      shareBtn.disabled = true;
      shareBtn.innerHTML = '⏳ 正在准备...';
      shareBtn.style.opacity = '0.7';
    }

    try {
      // 收集数据
      var creatureName = state.currentCreatureName || '我的守护神兽';
      var studentName = getStudentName();
      var type, data, name;

      // 判断是分享2D图片还是3D模型
      // 优先检查2D图片（选中的候选图）
      var hasImage = state.selectedCandidate !== null && 
                     state.selectedCandidate !== undefined &&
                     state._generatedImageUrls[state.selectedCandidate];
      
      // 检查3D模型
      var urls = state.meshyAllUrls || {};
      var glbUrl = state.meshyModelUrl || urls.glb || '';
      var stlUrl = urls.stl || urls['3mf'] || '';

      if (hasImage && !stlUrl) {
        // 分享2D图片
        type = '2d';
        var imgDataUri = state._generatedImageUrls[state.selectedCandidate];
        // 提取base64部分（去掉 data:image/png;base64, 前缀）
        data = imgDataUri.replace(/^data:image\/[a-z]+;base64,/, '');
        name = studentName + '的' + creatureName;
        console.log('[Share] 分享2D图片, base64长度:', data.length);
      } else if (glbUrl) {
        // 分享3D模型（存GLB URL）
        type = '3d';
        data = glbUrl;
        name = studentName + '的' + creatureName;
        console.log('[Share] 分享3D模型 GLB URL');
      } else if (stlUrl) {
        // 只有STL/3MF URL，也当3D存
        type = '3d';
        data = stlUrl;
        name = studentName + '的' + creatureName;
        console.log('[Share] 分享3D模型 STL URL');
      } else {
        showToastMessage('❌ 没有可分享的内容，请先生成图片或3D模型');
        restoreShareBtn(shareBtn, origHtml);
        return;
      }

      if (shareBtn) {
        shareBtn.innerHTML = '⏳ 正在上传...';
      }
      showToastMessage('⏳ 正在上传到分享服务器...');

      // 获取认证token
      var authHeader = getAuthHeader();
      if (!authHeader) {
        // 需要先认证
        showToastMessage('🔑 请先验证密码');
        var authed = await ensureAuthenticated();
        if (!authed) {
          restoreShareBtn(shareBtn, origHtml);
          return;
        }
        authHeader = getAuthHeader();
      }

      // 上传
      var resp = await fetch(SHARE_API + '/api/share/upload', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': authHeader
        },
        body: JSON.stringify({
          type: type,
          name: name,
          data: data
        })
      });

      if (!resp.ok) {
        var errText = await resp.text();
        var errData;
        try { errData = JSON.parse(errText); } catch(e) { errData = { error: errText }; }
        throw new Error(errData.error || '上传失败 (HTTP ' + resp.status + ')');
      }

      var result = await resp.json();
      if (!result.success) {
        throw new Error(result.error || '上传失败');
      }

      var shareUrl = SHARE_PAGE_BASE + '?id=' + result.shareId;
      console.log('[Share] 上传成功:', result);
      console.log('[Share] 分享链接:', shareUrl);

      showShareResult(shareUrl, creatureName, studentName, type);

    } catch (err) {
      console.error('[Share] 上传失败:', err);
      showToastMessage('❌ 分享失败: ' + err.message);
      restoreShareBtn(shareBtn, origHtml);
    }
  }

  function restoreShareBtn(btn, origHtml) {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = origHtml || '🔗 分享给朋友看';
      btn.style.opacity = '1';
    }
  }

  function showShareResult(shareUrl, title, studentName, type) {
    var overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.5);z-index:99999;display:flex;align-items:center;justify-content:center;padding:20px;';
    
    var modal = document.createElement('div');
    modal.style.cssText = 'background:white;border-radius:20px;padding:28px;max-width:400px;width:100%;box-shadow:0 20px 60px rgba(0,0,0,0.3);';
    
    var typeLabel = type === '2d' ? '图片' : '3D模型';
    
    modal.innerHTML = 
      '<div style="text-align:center;margin-bottom:20px;">' +
        '<div style="font-size:48px;margin-bottom:8px;">🎉</div>' +
        '<h3 style="margin:0 0 8px 0;color:#c04830;font-size:18px;">分享成功！</h3>' +
        '<p style="margin:0;color:#7a6a56;font-size:14px;">' + studentName + ' 的' + typeLabel + '已可分享</p>' +
      '</div>' +
      '<div style="background:#f9f5ed;border-radius:12px;padding:14px;margin-bottom:16px;">' +
        '<div style="font-size:12px;color:#7a6a56;margin-bottom:8px;">分享链接（有效期30天）：</div>' +
        '<input type="text" value="' + shareUrl + '" readonly style="width:100%;padding:10px;border:1px solid #e8dcc4;border-radius:8px;font-size:12px;color:#333;box-sizing:border-box;" id="share-url-input">' +
      '</div>' +
      '<div style="display:flex;gap:10px;">' +
        '<button id="btn-copy-share" style="flex:1;padding:12px;background:#c04830;color:white;border:none;border-radius:10px;font-size:14px;font-weight:600;cursor:pointer;">📋 复制链接</button>' +
        '<button id="btn-close-share" style="flex:1;padding:12px;background:#e8dcc4;color:#7a6a56;border:none;border-radius:10px;font-size:14px;font-weight:600;cursor:pointer;">关闭</button>' +
      '</div>';
    
    overlay.appendChild(modal);
    document.body.appendChild(overlay);
    
    document.getElementById('btn-copy-share').onclick = function() {
      var input = document.getElementById('share-url-input');
      input.select();
      input.setSelectionRange(0, 99999);
      try {
        document.execCommand('copy');
        this.innerHTML = '✅ 已复制';
        this.style.background = '#4CAF50';
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
    
    document.getElementById('btn-close-share').onclick = function() {
      document.body.removeChild(overlay);
    };
    
    overlay.onclick = function(e) {
      if (e.target === overlay) document.body.removeChild(overlay);
    };

    // 更新原按钮状态
    var shareBtn = document.getElementById('btn-share-creature');
    if (shareBtn) {
      shareBtn.disabled = false;
      shareBtn.innerHTML = '✅ 已分享';
      shareBtn.style.background = 'linear-gradient(135deg,#4CAF50,#66BB6A)';
      shareBtn.style.opacity = '1';
    }
  }

  function getStudentName() {
    if (state.studentName) return state.studentName;
    if (state.userName) return state.userName;
    var saved = localStorage.getItem('student_name');
    if (saved) return saved;
    var name = prompt('请输入你的名字（用于分享展示）：', '');
    if (name && name.trim()) {
      localStorage.setItem('student_name', name.trim());
      return name.trim();
    }
    return '小明';
  }

  function bindShareButton() {
    var shareBtn = document.getElementById('btn-share-creature');
    if (shareBtn) {
      shareBtn.onclick = function() { uploadAndShare(); };
      shareBtn.onmouseenter = function() { if (!this.disabled) this.style.transform = 'scale(1.02)'; };
      shareBtn.onmouseleave = function() { this.style.transform = 'scale(1)'; };
      console.log('[Share] 分享按钮已绑定 (v2.0 KV)');
    } else {
      console.warn('[Share] 找不到 btn-share-creature 按钮');
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bindShareButton);
  } else {
    bindShareButton();
  }

  window.ShareIntegration = {
    uploadAndShare: uploadAndShare,
    SHARE_API: SHARE_API
  };

  console.log('[Share] 分享模块已加载 v2.0 (Cloudflare KV)');

})();
