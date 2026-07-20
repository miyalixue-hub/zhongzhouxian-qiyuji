/**
 * config.js - API配置、全局常量、数据定义
 * 包含 AI_CONFIG、MESHY_CONFIG、state、creatures、patterns 等
 */

// ============ AI 图片生成配置 ============
        var AI_CONFIG = {
            // 火山引擎 Seedream 配置
            // API Key 由 Worker 服务端管理，前端不再存储密钥
            baseUrl: 'https://ark.cn-beijing.volces.com/api/v3',  // 保留作为备份，实际通过 Worker 代理调用
            model: 'doubao-seedream-5-0-260128',  // Seedream 5.0 Lite
            size: '1920x1920',  // Seedream 4.5 要求至少 3686400 像素 (1920x1920)
            
            // 腾讯云 COS 配置（用于持久化存储生成的图片）
            // 注意：COS密钥不硬编码在代码中，通过设置面板或 localStorage 配置
            cos: {
                secretId: localStorage.getItem('cos_secret_id') || '',
                secretKey: localStorage.getItem('cos_secret_key') || '',
                bucket: 'zhongzhouxian-1413555799',
                region: 'ap-guangzhou',
                basePath: 'assets/generated/'
            }
        };

// ============ Meshy 3D 生成配置 ============
        var MESHY_CONFIG = {
            // Cloudflare Worker 代理地址
            // API Key 由 Worker 服务端管理（存储在 Worker Secrets）
            proxyUrl: 'https://api.mindbubble.cloud',
            // 3D模型参数 - 方案A（meshy-6 + smart-topology，最高打印质量）
            aiModel: 'meshy-t2',            // 智能拓扑最新模型(m2026-07)，简洁拓扑+原生分件，最适合3D打印
            modelType: 'smart-topology',    // 简洁拓扑，原生分件
            topology: 'triangle',           // meshy-t2仅支持三角面（Smart Topology输出为triangle-only）
            targetPolycount: 15000,         // meshy-t2上限15000（标准线可设300000）
            shouldTexture: true,            // 生成纹理
            enablePbr: true,                // 生成PBR贴图
            symmetryMode: 'on',             // 强制对称，铛铛车左右对称
            shouldRemesh: true,             // 启用重拓扑
            // 轮询配置
            pollInterval: 5000,             // 每5秒轮询一次（meshy-6生成较慢）
            maxPollTime: 600000             // 最长等待10分钟
        };

        var state = { 
            currentPage: 1, 
            selectedCreature: null, 
            selectedPatterns: [], 
            selectedColors: [], 
            selectedElements: [], 
            selectedCandidate: null,
            // 铛铛车相关状态
            isTramMode: false,
            tramColor: null,
            tramEra: null,
            tramDecors: [],
            // AI 生成相关
            _lastAiPrompt: '',
            _generatedImageUrls: [],
            meshyModelUrl: null,
            meshyStlUrl: null,
            meshyAllUrls: null,
            meshyThumbnail: null,
            meshyTaskId: null,
            // 认证相关
            _authToken: null
        };

        // ============ Token 管理 ============
        function getStoredToken() {
            try {
                var raw = localStorage.getItem('auth_token');
                if (!raw) return null;
                var data = JSON.parse(raw);
                // 检查是否过期（提前1天刷新）
                if (data.exp && data.exp > Date.now() + 86400000) {
                    return data.token;
                }
                localStorage.removeItem('auth_token');
                return null;
            } catch(e) { return null; }
        }

        function storeToken(token, exp) {
            try {
                localStorage.setItem('auth_token', JSON.stringify({ token: token, exp: exp }));
            } catch(e) {}
        }

        function clearToken() {
            state._authToken = null;
            localStorage.removeItem('auth_token');
        }

        function getAuthHeader() {
            var token = state._authToken || getStoredToken();
            if (token) {
                state._authToken = token;
                return 'Bearer ' + token;
            }
            return null;
        }

        // 认证：确保有有效 token
        async function ensureAuthenticated() {
            if (getAuthHeader()) return true;
            // 弹出密码输入框
            return new Promise(function(resolve) {
                showPasswordDialog(resolve);
            });
        }

        // 密码输入对话框
        function showPasswordDialog(callback) {
            var existing = document.getElementById('auth-dialog');
            if (existing) existing.remove();
            
            var overlay = document.createElement('div');
            overlay.id = 'auth-dialog';
            overlay.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.5);z-index:10000;display:flex;align-items:center;justify-content:center;';
            overlay.innerHTML = '<div style="background:#FAF8F0;border-radius:16px;padding:24px;max-width:360px;width:90%;box-shadow:0 8px 32px rgba(0,0,0,0.3);">' +
                '<h3 style="margin:0 0 12px;color:#3a2a1a;font-size:16px;">🔑 请输入访问密码</h3>' +
                '<p style="font-size:12px;color:#7a6a56;line-height:1.6;margin-bottom:12px;">向老师获取密码后输入，验证后即可使用AI功能。</p>' +
                '<input id="auth-password-input" type="password" placeholder="输入访问密码" style="width:100%;padding:10px 12px;border:1.5px solid #e8dcc4;border-radius:8px;font-size:14px;outline:none;margin-bottom:8px;box-sizing:border-box;" />' +
                '<div id="auth-error-msg" style="color:#c04830;font-size:12px;display:none;margin-bottom:8px;"></div>' +
                '<div style="display:flex;gap:10px;">' +
                '<button id="auth-cancel-btn" style="flex:1;padding:10px;border:1.5px solid #e8dcc4;background:white;border-radius:8px;font-size:14px;cursor:pointer;">取消</button>' +
                '<button id="auth-submit-btn" style="flex:1;padding:10px;border:none;background:#c04830;color:white;border-radius:8px;font-size:14px;cursor:pointer;font-weight:bold;">验证</button>' +
                '</div></div>';
            document.body.appendChild(overlay);
            
            var input = document.getElementById('auth-password-input');
            input.focus();
            
            document.getElementById('auth-cancel-btn').onclick = function() {
                overlay.remove();
                callback(false);
            };
            
            function doSubmit() {
                var pwd = input.value.trim();
                if (!pwd) return;
                var proxyUrl = MESHY_CONFIG.proxyUrl || 'https://api.mindbubble.cloud';
                var btn = document.getElementById('auth-submit-btn');
                btn.disabled = true;
                btn.textContent = '验证中...';
                
                fetch(proxyUrl + '/api/auth', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ password: pwd })
                }).then(function(resp) {
                    return resp.json().then(function(data) {
                        if (resp.ok && data.token) {
                            state._authToken = data.token;
                            storeToken(data.token, data.exp);
                            overlay.remove();
                            callback(true);
                        } else {
                            var errMsg = document.getElementById('auth-error-msg');
                            errMsg.textContent = data.error || '验证失败';
                            errMsg.style.display = 'block';
                            btn.disabled = false;
                            btn.textContent = '验证';
                            input.value = '';
                            input.focus();
                        }
                    });
                }).catch(function(e) {
                    var errMsg = document.getElementById('auth-error-msg');
                    errMsg.textContent = '网络错误，请重试';
                    errMsg.style.display = 'block';
                    btn.disabled = false;
                    btn.textContent = '验证';
                });
            }
            
            document.getElementById('auth-submit-btn').onclick = doSubmit;
            input.onkeydown = function(e) {
                if (e.key === 'Enter') doSubmit();
            };
        }
        var creatures = [
            { id: 'gongfu', name: '镇水兽', desc: '龙生九子·趴伏镇守', pose: '敦厚壮实，四爪紧扣岸边岩石，趴伏镇守姿态', location: '正阳桥·正阳门箭楼南侧护城河', color: '#4A7FB5', image: 'https://zhongzhouxian-1413555799.cos.ap-guangzhou.myqcloud.com/assets/zhenshui_shou.png' },
            { id: 'xishui', name: '吸水兽', desc: '好吞吐·探身吸水', pose: '修长灵巧，悬挂在桥洞顶部，前身探向水面做吸水状', location: '正阳桥·桥洞券脸顶部', color: '#5B8C6B', image: 'https://zhongzhouxian-1413555799.cos.ap-guangzhou.myqcloud.com/assets/xishui_shou.png' },
            { id: 'dangdangche', name: '铛铛车', desc: '正阳门特色·有轨电车', color: '#2E7D32', image: 'https://miyalixue-hub.github.io/zhongzhouxian-qiyuji/assets/dangdangche.png?v=20260705' }
        ];
        
        // 铛铛车选项数据
        var tramColors = [
            { id: 'classic_green', name: '经典绿', hex: '#2E7D32', desc: '老北京有轨电车标志性绿色' },
            { id: 'china_red', name: '中国红', hex: '#C62828', desc: '喜庆版，适合节日主题' },
            { id: 'liuli_blue', name: '琉璃蓝', hex: '#1565C0', desc: '呼应琉璃厂文化' },
            { id: 'palace_yellow', name: '宫墙黄', hex: '#F9A825', desc: '皇家气质' }
        ];
        var tramEras = [
            { id: 'vintage_1924', name: '1924年老式', desc: '白皮车·木质车厢·开放式座位', visualDesc: '白色木质车身的早期有轨电车，开放式木质长条座椅，铁质辐条车轮，车顶装有铜质铃铛，车身有岁月斑驳痕迹，民国初年老北京风格' },
            { id: 'improved_1940', name: '1940s改良版', desc: '全封闭车窗·金属车身', visualDesc: '墨绿色全金属铆接车身的中期有轨电车，全封闭玻璃窗，橡胶轮胎，圆弧形车顶，Art Deco装饰风格线条，车头有圆形大灯' },
            { id: 'modern_retro', name: '现代复古版', desc: '保留经典元素·现代舒适感', visualDesc: '暗红色精致漆面搭配金色装饰线条的现代复刻有轨电车，大面积落地玻璃窗，车内有软垫座椅，车顶精致铜铃配LED氛围灯，兼具复古韵味与现代质感' }
        ];
        var tramDecors = [
            { id: 'roof_bell', name: '车顶铜铃', desc: '铛铛声的来源', promptDesc: '车顶前部有铜铃浮雕图案' },
            { id: 'front_lamp', name: '车头大灯', desc: '圆形老式车灯', promptDesc: '车头正前方安装有圆形老式大灯' },
            { id: 'side_painting', name: '侧面彩绘', desc: '中轴线图案/祥云/北京剪影', promptDesc: '车身两侧绘有精美传统彩绘图案' },
            { id: 'custom_plate', name: '车牌号码', desc: '自定义数字', promptDesc: '车身侧面带有车牌号码' }
        ];
        var patterns = [
            { id: 'limb', name: '肢部纹饰', meaning: '层叠水鳞·护体镇水', position: '四肢', desc: '层叠水鳞纹装饰在四肢上，如同护甲般环绕腿部',
              image: 'https://miyalixue-hub.github.io/zhongzhouxian-qiyuji/assets/pattern-limb.png' },
            { id: 'mouth_horn', name: '嘴角纹饰', meaning: '火焰吐息·威慑水患', position: '嘴角两侧', desc: '嘴角外展的火焰状纹饰，从嘴部向两侧延伸',
              image: 'https://miyalixue-hub.github.io/zhongzhouxian-qiyuji/assets/pattern-mouth_horn.png' },
            { id: 'mane', name: '鬃毛', meaning: '风动水纹·灵气流转', position: '颈部后方至背部', desc: '飘逸的鬃毛从颈后垂落至背部，带有水纹流动感',
              image: 'https://miyalixue-hub.github.io/zhongzhouxian-qiyuji/assets/pattern-mane.png' },
            { id: 'ear', name: '耳部纹饰', meaning: '旋涡听水·守望桥声', position: '耳朵及头部两侧', desc: '旋涡纹装饰在耳朵周围和头部两侧',
              image: 'https://miyalixue-hub.github.io/zhongzhouxian-qiyuji/assets/pattern-ear.png' },
            { id: 'eye', name: '眼部纹饰', meaning: '圆目凝神·明察水脉', position: '眼眶周围', desc: '旋涡状纹路环绕在眼睛周围，增强神态',
              image: 'https://miyalixue-hub.github.io/zhongzhouxian-qiyuji/assets/pattern-eye.png' },
            { id: 'head_horn', name: '头部倚角', meaning: '角冠护首·镇守桥门', position: '头顶/额头', desc: '角状装饰从头顶生出，向后弯曲，如同皇冠',
              image: 'https://miyalixue-hub.github.io/zhongzhouxian-qiyuji/assets/pattern-head_horn.png' },
            { id: 'back_cloud', name: '脊背云纹', meaning: '云气绕身·瑞意绵延', position: '背部脊线', desc: '云纹沿着背部脊线分布，如同祥云环绕',
              image: 'https://miyalixue-hub.github.io/zhongzhouxian-qiyuji/assets/pattern-back_cloud.png' },
            { id: 'neck_mane', name: '颈部鬃髯', meaning: '长髯迎风·神兽昂扬', position: '下巴至颈部', desc: '长须从下巴垂落至颈部，随风飘动',
              image: 'https://miyalixue-hub.github.io/zhongzhouxian-qiyuji/assets/pattern-neck_mane.png' }
        ];
        
        var colors = [{ id: 'zhusha', name: '朱砂红', hex: '#C45C5C', meaning: '辟邪纳福·热烈醒目', level: 'royal' }, { id: 'shiqing', name: '石青蓝', hex: '#4A7FB5', meaning: '矿物青色·沉静古雅', level: 'folk' }, { id: 'douqing', name: '豆青', hex: '#A8BFA3', meaning: '青瓷釉色·清新温润', level: 'folk' }, { id: 'liuli', name: '琉璃黄', hex: '#D4A843', meaning: '宫城琉璃·明亮珍贵', level: 'royal' }, { id: 'yuebai', name: '月白', hex: '#F0EDE5', meaning: '月色如瓷·清雅素净', level: 'folk' }, { id: 'mohei', name: '墨黑', hex: '#2D2D2D', meaning: '浓墨重彩·沉稳庄重', level: 'folk' }, { id: 'jin', name: '鎏金', hex: '#C5A355', meaning: '金碧辉煌·尊贵荣耀', level: 'royal' }, { id: 'yin', name: '铸银', hex: '#B0B0B0', meaning: '银光素雅·内敛含蓄', level: 'royal' }];
        var elements = [{ id: 'cloud_base', name: '云纹底座', desc: '传统祥云纹圆形托底，寓意神兽腾云驾雾' }, { id: 'map_base', name: '中轴线地图底座', desc: '长方形地图形底座，刻有从永定门到钟鼓楼的中轴线路线' }, { id: 'brick_platform', name: '青砖方台', desc: '仿明城墙青砖砌成的方形台基，四角有排水螭首' }, { id: 'marble_base', name: '汉白玉须弥座', desc: '仿故宫御路旁的白色大理石束腰底座，上层有莲瓣纹' }, { id: 'glazed_base', name: '琉璃砖砌底座', desc: '仿天坛黄绿琉璃砖堆砌的八角形台基，色彩绚丽' }, { id: 'name_stone', name: '神兽名刻底座', desc: '正面刻有神兽名字的长方形石碑底座，可自定义刻字' }];
