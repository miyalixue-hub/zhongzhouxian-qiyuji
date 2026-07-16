/**
 * share-integration.js - 3D模型分享系统集成
 * 
 * 功能：
 *   1. 在打印体检报告完成后，在下载面板中添加"分享给朋友看"按钮
 *   2. 点击后自动下载 STL → 上传到后端修复 → 返回分享链接
 *   3. 展示分享链接供学生复制/分享
 * 
 * 依赖：
 *   - meshy-3d.js（state.meshyAllUrls, state.currentCreatureName 等）
 *   - 后端 API: http://81.70.177.110/api/work/upload
 * 
 * 使用方式：
 *   在研学网站 HTML 中，meshy-3d.js 之后加载本文件即可
 */

(function() {
  'use strict';

  // 后端地址（生产环境用域名，开发环境用 IP）
  var SHARE_API = 'https://share.mindbubble.cloud';

  // 是否已注入分享按钮
  var injected = false;

  /**
   * 注入分享按钮到下载面板
   * 在 downloadModelFile 函数执行后调用，或者在 showDownloadPanel 后调用
   */
  function injectShareButton() {
    if (injected) return;
    
    var dlPanel = document.getElementById('download-panel');
    if (!dlPanel) {
      console.warn('[Share] 找不到 download-panel');
      return;
    }

    // 检查是否已有分享按钮
    if (document.getElementById('btn-share-creature')) return;

    // 创建分享按钮
    var shareBtn = document.createElement('button');
    shareBtn.id = 'btn-share-creature';
    shareBtn.style.cssText = 'width:100%;margin-top:12px;padding:14px;background:linear-gradient(135deg,#4FC3F7,#29B6F6);color:white;border:none;border-radius:12px;font-size:15px;font-weight:600;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:8px;box-shadow:0 4px 12px rgba(79,195,247,0.3);transition:transform 0.2s;';
    shareBtn.innerHTML = '🔗 分享给朋友看';
    shareBtn.onclick = function() { uploadAndShare(); };
    shareBtn.onmouseenter = function() { this.style.transform = 'scale(1.02)'; };
    shareBtn.onmouseleave = function() { this.style.transform = 'scale(1)'; };

    // 插入到下载面板底部
    dlPanel.appendChild(shareBtn);
    injected = true;
    console.log('[Share] 分享按钮已注入');
  }

  /**
   * 上传 STL 到后端并生成分享链接
   */
  async function uploadAndShare() {
    var urls = state.meshyAllUrls || {};
    var stlUrl = urls.stl || urls['3mf']; // 优先 STL，没有则用 3MF
    
    if (!stlUrl) {
      showToastMessage('❌ 没有找到可上传的模型文件');
      return;
    }

    // 显示上传中状态
    var shareBtn = document.getElementById('btn-share-creature');
    var origHtml = shareBtn ? shareBtn.innerHTML : '';
    if (shareBtn) {
      shareBtn.disabled = true;
      shareBtn.innerHTML = '⏳ 正在上传...';
      shareBtn.style.opacity = '0.7';
    }

    try {
      // 1. 下载 STL 文件为 Blob
      showToastMessage('📥 正在下载模型文件...');
      var resp = await fetch(stlUrl);
      if (!resp.ok) throw new Error('下载模型失败: HTTP ' + resp.status);
      var blob = await resp.blob();
      
      // 确定文件扩展名
      var ext = stlUrl.toLowerCase().includes('.3mf') ? '3mf' : 'stl';
      var fileName = 'creature.' + ext;

      // 2. 收集元数据
      var creatureName = state.currentCreatureName || '我的守护神兽';
      var studentName = getStudentName();
      var artworkImageUrl = getArtworkImageUrl();

      // 3. 构建 FormData
      var formData = new FormData();
      formData.append('stl_file', blob, fileName);
      formData.append('student_name', studentName);
      formData.append('work_title', creatureName);
      formData.append('artwork_image_url', artworkImageUrl || '');

      // 4. 上传到后端
      showToastMessage('📤 正在上传并修复模型...');
      var uploadResp = await fetch(SHARE_API + '/api/work/upload', {
        method: 'POST',
        body: formData
      });

      if (!uploadResp.ok) {
        var errText = await uploadResp.text();
        throw new Error('上传失败: ' + errText);
      }

      var result = await uploadResp.json();
      
      if (!result.success) {
        throw new Error(result.message || '上传失败');
      }

      // 5. 构建分享链接
      var shareUrl = SHARE_API + result.shareUrl;
      
      console.log('[Share] 上传成功:', result);
      console.log('[Share] 分享链接:', shareUrl);

      // 6. 显示分享弹窗
      showShareResult(shareUrl, creatureName, studentName);

    } catch (err) {
      console.error('[Share] 上传失败:', err);
      showToastMessage('❌ 分享失败: ' + err.message);
      
      // 恢复按钮
      if (shareBtn) {
        shareBtn.disabled = false;
        shareBtn.innerHTML = origHtml || '🔗 分享给朋友看';
        shareBtn.style.opacity = '1';
      }
    }
  }

  /**
   * 显示分享成功弹窗
   */
  function showShareResult(shareUrl, title, studentName) {
    // 创建弹窗
    var overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.5);z-index:99999;display:flex;align-items:center;justify-content:center;padding:20px;';
    
    var modal = document.createElement('div');
    modal.style.cssText = 'background:white;border-radius:20px;padding:28px;max-width:400px;width:100%;box-shadow:0 20px 60px rgba(0,0,0,0.3);';
    
    modal.innerHTML = 
      '<div style="text-align:center;margin-bottom:20px;">' +
        '<div style="font-size:48px;margin-bottom:8px;">🎉</div>' +
        '<h3 style="margin:0 0 8px 0;color:#c04830;font-size:18px;">分享成功！</h3>' +
        '<p style="margin:0;color:#7a6a56;font-size:14px;">' + studentName + ' 的 ' + title + ' 已经可以分享给朋友啦</p>' +
      '</div>' +
      
      '<div style="background:#f9f5ed;border-radius:12px;padding:14px;margin-bottom:16px;">' +
        '<div style="font-size:12px;color:#7a6a56;margin-bottom:8px;">分享链接：</div>' +
        '<input type="text" value="' + shareUrl + '" readonly style="width:100%;padding:10px;border:1px solid #e8dcc4;border-radius:8px;font-size:12px;color:#333;box-sizing:border-box;" id="share-url-input">' +
      '</div>' +
      
      '<div style="display:flex;gap:10px;">' +
        '<button id="btn-copy-share" style="flex:1;padding:12px;background:#c04830;color:white;border:none;border-radius:10px;font-size:14px;font-weight:600;cursor:pointer;">📋 复制链接</button>' +
        '<button id="btn-close-share" style="flex:1;padding:12px;background:#e8dcc4;color:#7a6a56;border:none;border-radius:10px;font-size:14px;font-weight:600;cursor:pointer;">关闭</button>' +
      '</div>';
    
    overlay.appendChild(modal);
    document.body.appendChild(overlay);
    
    // 绑定事件
    document.getElementById('btn-copy-share').onclick = function() {
      var input = document.getElementById('share-url-input');
      input.select();
      input.setSelectionRange(0, 99999);
      
      try {
        document.execCommand('copy');
        this.innerHTML = '✅ 已复制';
        this.style.background = '#4CAF50';
        showToastMessage('✅ 链接已复制，快去分享给朋友吧！');
      } catch (e) {
        // 降级：尝试 Clipboard API
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
      if (e.target === overlay) {
        document.body.removeChild(overlay);
      }
    };

    // 恢复原按钮
    var shareBtn = document.getElementById('btn-share-creature');
    if (shareBtn) {
      shareBtn.disabled = false;
      shareBtn.innerHTML = '✅ 已分享';
      shareBtn.style.background = 'linear-gradient(135deg,#4CAF50,#66BB6A)';
      shareBtn.style.opacity = '1';
    }
  }

  /**
   * 获取学生姓名
   * 优先从 state 获取，否则提示用户输入
   */
  function getStudentName() {
    // 尝试从 state 获取
    if (state.studentName) return state.studentName;
    if (state.userName) return state.userName;
    
    // 尝试从 localStorage 获取
    var saved = localStorage.getItem('student_name');
    if (saved) return saved;
    
    // 提示用户输入
    var name = prompt('请输入你的名字（用于分享展示）：', '');
    if (name && name.trim()) {
      localStorage.setItem('student_name', name.trim());
      return name.trim();
    }
    
    return '小明'; // 默认值
  }

  /**
   * 获取手绘原稿图片 URL
   */
  function getArtworkImageUrl() {
    // 从 state 获取选中的 AI 生成图片
    if (state.selectedCandidate !== null && state.selectedCandidate !== undefined) {
      return state._generatedImageUrls[state.selectedCandidate] || '';
    }
    return '';
  }

  // ========== 自动注入逻辑 ==========
  
  // 方案1：监听 showDownloadPanel 函数，在其执行后注入按钮
  var origShowDownloadPanel = window.showDownloadPanel;
  if (origShowDownloadPanel) {
    window.showDownloadPanel = function() {
      origShowDownloadPanel.apply(this, arguments);
      setTimeout(injectShareButton, 300);
    };
  }
  
  // 方案2：监听 DOM 变化，当 download-panel 显示时注入
  var observer = new MutationObserver(function(mutations) {
    var dlPanel = document.getElementById('download-panel');
    if (dlPanel && dlPanel.style.display !== 'none') {
      injectShareButton();
    }
  });
  
  // 开始观察
  if (document.body) {
    observer.observe(document.body, { childList: true, subtree: true, attributes: true });
  } else {
    document.addEventListener('DOMContentLoaded', function() {
      observer.observe(document.body, { childList: true, subtree: true, attributes: true });
    });
  }

  // 导出到全局（供调试）
  window.ShareIntegration = {
    injectShareButton: injectShareButton,
    uploadAndShare: uploadAndShare,
    SHARE_API: SHARE_API
  };

  console.log('[Share] 分享模块已加载');

})();
