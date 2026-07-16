/**
 * AI 魔法师训练营 · 中轴奇游记 — 分享页
 *
 * 功能：
 *  1. 从 URL 参数 ?id=xxx 获取作品 ID
 *  2. 调用后端 API 获取作品数据（当前用占位数据演示）
 *  3. 渲染 2D 图片
 *  4. Three.js 加载并展示 STL 3D 模型（自动旋转 + 手势拖拽）
 *  5. 下载 STL 文件
 */

(function () {
  'use strict';

  // ======================== 配置 ========================
  // TODO: 对接后端后替换为真实 API 地址
  const API_BASE = '';  // 例如 'https://api.example.com'
  const API_WORK_DETAIL = API_BASE + '/api/work/detail';       // GET ?id=xxx
  const API_STL_DOWNLOAD = API_BASE + '/api/work/stl';         // GET ?id=xxx → 返回文件流

  // ======================== 占位图 Data URI ========================
  const PLACEHOLDER_2D = 'data:image/svg+xml,' + encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600" viewBox="0 0 800 600">' +
    '<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">' +
    '<stop offset="0%" stop-color="#E3F2FD"/><stop offset="100%" stop-color="#BBDEFB"/>' +
    '</linearGradient></defs>' +
    '<rect width="800" height="600" fill="url(#g)"/>' +
    '<text x="400" y="280" text-anchor="middle" font-family="sans-serif" font-size="48" fill="#4FC3F7">🐉</text>' +
    '<text x="400" y="340" text-anchor="middle" font-family="sans-serif" font-size="20" fill="#90A4AE">手绘作品图片</text>' +
    '</svg>'
  );

  // 占位 STL —— 一个简单立方体，Three.js STL 二进制格式
  // 如果后端无 STL 文件，用此占位模型演示 3D 旋转效果
  function createPlaceholderSTL() {
    // 创建一个简单几何体作为占位 3D 模型
    const geometry = new THREE.IcosahedronGeometry(1.2, 1);
    return geometry;
  }

  // ======================== 工具函数 ========================

  /** 获取 URL 参数 */
  function getUrlParam(name) {
    const params = new URLSearchParams(window.location.search);
    return params.get(name);
  }

  /** 模拟 API 请求（对接后端时替换） */
  async function fetchWorkData(id) {
    // ====== 对接真实 API 时，取消以下注释并删除模拟数据 ======
    // const res = await fetch(`${API_WORK_DETAIL}?id=${encodeURIComponent(id)}`);
    // if (!res.ok) throw new Error('获取作品数据失败');
    // return await res.json();

    // 模拟数据（演示用）
    return {
      id: id || 'demo001',
      title: '龙角守护兽',
      subtitle: '这是小明创造的守护神兽',
      studentName: '小明',
      avatarLetter: '明',
      artworkImage: '',        // 2D 图片 URL，空则用占位图
      stlUrl: '',              // STL 文件 URL，空则用占位模型
      createdAt: '2025-01-15'
    };
  }

  // ======================== DOM 渲染 ========================

  function renderWork(data) {
    // 标题 & 副标题
    document.getElementById('work_title').textContent = data.title;
    document.getElementById('work_subtitle').textContent = data.subtitle;

    // 头像
    const avatar = document.getElementById('avatar');
    avatar.textContent = data.avatarLetter || (data.studentName ? data.studentName[0] : '我');

    // 2D 图片
    const img = document.getElementById('artwork_2d');
    img.src = data.artworkImage || PLACEHOLDER_2D;

    // 图片说明
    document.getElementById('image_caption').textContent =
      data.studentName ? `${data.studentName} 用画笔赋予神兽灵魂` : '用画笔赋予神兽灵魂';

    // 页面 title
    document.title = `${data.title} — AI 魔法师训练营`;

    // 微信分享 meta
    updateOGMeta(data);
  }

  function updateOGMeta(data) {
    const setMeta = (attr, val) => {
      let el = document.querySelector(`meta[property="${attr}"]`);
      if (el) el.setAttribute('content', val);
    };
    setMeta('og:title', `快来看看${data.studentName || '我'}创造的神兽：${data.title}！`);
    setMeta('og:description', data.subtitle);
    if (data.artworkImage) {
      setMeta('og:image', data.artworkImage);
    }
    setMeta('og:url', window.location.href);
  }

  // ======================== Three.js 3D 渲染 ========================

  let scene, camera, renderer, controls, modelMesh;
  const canvasEl = document.getElementById('model_canvas');
  const wrapperEl = document.getElementById('model_wrapper');
  const loadingEl = document.getElementById('model_loading');

  function initThree() {
    const width = wrapperEl.clientWidth;
    const height = wrapperEl.clientHeight;

    // 场景
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0xE3F2FD);

    // 相机
    camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 100);
    camera.position.set(0, 1.5, 4);

    // 渲染器
    renderer = new THREE.WebGLRenderer({
      canvas: canvasEl,
      antialias: true,
      alpha: false
    });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;

    // 灯光
    const ambient = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambient);

    const dirLight = new THREE.DirectionalLight(0xffffff, 1.0);
    dirLight.position.set(5, 8, 5);
    scene.add(dirLight);

    const fillLight = new THREE.DirectionalLight(0x4FC3F7, 0.3);
    fillLight.position.set(-3, 2, -3);
    scene.add(fillLight);

    // 轨道控制器（手势旋转）
    controls = new THREE.OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.autoRotate = true;
    controls.autoRotateSpeed = 3.0;
    controls.enablePan = false;
    controls.minDistance = 2;
    controls.maxDistance = 8;
    controls.maxPolarAngle = Math.PI * 0.85;

    // 地面网格（装饰）
    const gridHelper = new THREE.GridHelper(6, 12, 0xBBDEFB, 0xE1F5FE);
    gridHelper.position.y = -1.5;
    scene.add(gridHelper);

    // 响应窗口变化
    window.addEventListener('resize', onResize);

    // 开始渲染循环
    animate();
  }

  function onResize() {
    const width = wrapperEl.clientWidth;
    const height = wrapperEl.clientHeight;
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    renderer.setSize(width, height);
  }

  function animate() {
    requestAnimationFrame(animate);
    controls.update();
    renderer.render(scene, camera);
  }

  // ---------- 加载 3D 模型 ----------

  async function loadModel(data) {
    try {
      if (data.stlUrl) {
        // 从 URL 加载 STL 文件
        await loadSTLFromUrl(data.stlUrl);
      } else {
        // 使用占位模型
        loadPlaceholderModel();
      }
    } catch (err) {
      console.error('模型加载失败，使用占位模型:', err);
      loadPlaceholderModel();
    }
    hideLoading();
  }

  function loadPlaceholderModel() {
    const geometry = createPlaceholderSTL();
    const material = new THREE.MeshPhongMaterial({
      color: 0x4FC3F7,
      specular: 0x29B6F6,
      shininess: 60,
      flatShading: true
    });
    modelMesh = new THREE.Mesh(geometry, material);
    modelMesh.position.y = 0;
    scene.add(modelMesh);

    // 给占位模型一个可爱的上下浮动动画
    const baseY = 0;
    function floatAnim() {
      requestAnimationFrame(floatAnim);
      if (modelMesh) {
        modelMesh.position.y = baseY + Math.sin(Date.now() * 0.002) * 0.1;
      }
    }
    floatAnim();
  }

  async function loadSTLFromUrl(url) {
    return new Promise((resolve, reject) => {
      const loader = new THREE.STLLoader();
      loader.load(
        url,
        (geometry) => {
          // 自动居中和缩放
          geometry.computeBoundingBox();
          const box = geometry.boundingBox;
          const center = new THREE.Vector3();
          box.getCenter(center);
          geometry.translate(-center.x, -center.y, -center.z);

          const size = new THREE.Vector3();
          box.getSize(size);
          const maxDim = Math.max(size.x, size.y, size.z);
          const scale = 2.5 / maxDim;
          geometry.scale(scale, scale, scale);

          const material = new THREE.MeshPhongMaterial({
            color: 0x4FC3F7,
            specular: 0x29B6F6,
            shininess: 80,
            flatShading: false
          });
          modelMesh = new THREE.Mesh(geometry, material);
          scene.add(modelMesh);
          resolve();
        },
        undefined,
        (err) => reject(err)
      );
    });
  }

  function hideLoading() {
    loadingEl.classList.add('hidden');
  }

  // ======================== 下载 STL / 3MF ========================

  const btnDownloadSTL = document.getElementById('btn_download_stl');
  const btnDownload3MF = document.getElementById('btn_download_3mf');

  function handleDownload(format) {
    const workId = getUrlParam('id') || 'demo';

    // ====== 对接真实 API 时，取消以下注释 ======
    // const btn = format === '3mf' ? btnDownload3MF : btnDownloadSTL;
    // try {
    //   btn.disabled = true;
    //   const origText = btn.textContent;
    //   btn.textContent = '下载中…';
    //   const res = await fetch(`${API_BASE}/api/work/download?id=${encodeURIComponent(workId)}&format=${format}`);
    //   const blob = await res.blob();
    //   const a = document.createElement('a');
    //   a.href = URL.createObjectURL(blob);
    //   a.download = `神兽_${workId}.${format}`;
    //   a.click();
    //   URL.revokeObjectURL(a.href);
    // } catch (e) {
    //   alert('下载失败，请稍后再试');
    // } finally {
    //   btn.disabled = false;
    // }

    // 演示模式
    alert(`🐉 ${format.toUpperCase()} 文件将在对接后端后可下载\n\n作品 ID：${workId}\n格式：${format.toUpperCase()}`);
  }

  btnDownloadSTL.addEventListener('click', () => handleDownload('stl'));
  btnDownload3MF.addEventListener('click', () => handleDownload('3mf'));

  // ======================== 初始化 ========================

  async function init() {
    const workId = getUrlParam('id');

    try {
      // 获取作品数据
      const data = await fetchWorkData(workId);

      // 渲染页面内容
      renderWork(data);

      // 初始化 Three.js
      initThree();

      // 加载 3D 模型
      await loadModel(data);

    } catch (err) {
      console.error('初始化失败:', err);
      // 降级：仍然初始化场景
      initThree();
      loadPlaceholderModel();
      hideLoading();
    }
  }

  // 启动
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
