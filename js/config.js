/**
 * config.js - API配置、全局常量、数据定义
 * 包含 AI_CONFIG、MESHY_CONFIG、state、creatures、patterns 等
 */

// ============ AI 图片生成配置 ============
        var AI_CONFIG = {
            // 火山引擎 Ark API 配置
            // 获取 API Key: https://console.volcengine.com/ark/region:ark+cn-beijing/apikey
            apiKey: '',  // 通过设置面板或 localStorage 配置（安全：不硬编码）
            baseUrl: 'https://ark.cn-beijing.volces.com/api/v3',
            model: 'doubao-seedream-4-5-251128',  // Seedream 4.5
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
        
        // 从 localStorage 加载 API Key
        (function() {
            var savedKey = localStorage.getItem('ark_api_key');
            if (savedKey) AI_CONFIG.apiKey = savedKey;
        })();

// ============ Meshy 3D 生成配置 ============
        // ============ Meshy 3D 生成配置 ============
        var MESHY_CONFIG = {
            // Cloudflare Worker 代理地址（部署后填入）
            // 部署方式：参见仓库中 meshy-proxy.js 文件
            proxyUrl: localStorage.getItem('meshy_proxy_url') || 'https://red-snowflake-d56d.miya-lixue.workers.dev',
            // Meshy API Key（用户通过设置面板输入，存储在 localStorage）
            apiKey: localStorage.getItem('meshy_api_key') || '',
            // 3D模型参数
            aiModel: 'latest',         // 使用最新模型（Meshy 6）
            topology: 'triangle',      // 三角面片（适合3D打印）
            targetPolycount: 30000,    // 目标面数
            shouldTexture: true,       // 生成纹理
            enablePbr: true,           // 生成PBR贴图
            // 轮询配置
            pollInterval: 3000,        // 每3秒轮询一次
            maxPollTime: 300000        // 最长等待5分钟
        };

        var state = { 
            currentPage: 1, 
            selectedCreature: null, 
            selectedPatterns: [], 
            selectedExpression: null, 
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
            meshyTaskId: null
        };
        var creatures = [{ id: 'gongfu', name: '蚣蝮', desc: '镇水兽·龙生九子·趴伏桥头守望', color: '#4A7FB5' }, { id: 'xishui', name: '吸水兽', desc: '桥孔兽·好吞吐·蹲踞桥孔吐水', color: '#5B8C6B' }, { id: 'chaofeng', name: '嘲风', desc: '殿角兽·好望远', color: '#D4A843' }, { id: 'bixi', name: '赑屃', desc: '碑下兽·好负重', color: '#6B7B8C' }];
        
        // 铛铛车选项数据
        var tramColors = [
            { id: 'classic_green', name: '经典绿', hex: '#2E7D32', desc: '老北京有轨电车标志性绿色' },
            { id: 'china_red', name: '中国红', hex: '#C62828', desc: '喜庆版，适合节日主题' },
            { id: 'liuli_blue', name: '琉璃蓝', hex: '#1565C0', desc: '呼应琉璃厂文化' },
            { id: 'palace_yellow', name: '宫墙黄', hex: '#F9A825', desc: '皇家气质' }
        ];
        var tramEras = [
            { id: 'vintage_1924', name: '1924年老式', desc: '白皮车·木质车厢·开放式座位' },
            { id: 'improved_1940', name: '1940s改良版', desc: '全封闭车窗·金属车身' },
            { id: 'modern_retro', name: '现代复古版', desc: '保留经典元素·现代舒适感' }
        ];
        var tramDecors = [
            { id: 'roof_bell', name: '车顶铜铃', desc: '铛铛声的来源' },
            { id: 'front_lamp', name: '车头大灯', desc: '圆形老式车灯' },
            { id: 'side_painting', name: '侧面彩绘', desc: '中轴线图案/祥云/北京剪影' },
            { id: 'custom_plate', name: '车牌号码', desc: '自定义数字' }
        ];
        var patterns = [{ id: 'cloud', name: '云纹', meaning: '祥云瑞气·吉祥如意' }, { id: 'hui', name: '回纹', meaning: '连绵不断·富贵不断' }, { id: 'scale', name: '鳞纹', meaning: '龙鳞护体·坚不可摧' }, { id: 'ruyi', name: '如意纹', meaning: '事事如意·称心如意' }];
        var expressions = [{ id: 'cute', name: '呆萌', desc: '圆滚滚·笑眯眯', emoji: '😊' }, { id: 'fierce', name: '威武', desc: '怒目圆睁·气势十足', emoji: '😤' }, { id: 'cool', name: '帅气', desc: '昂首挺胸·神采飞扬', emoji: '😎' }, { id: 'funny', name: '搞笑', desc: '吐舌头·搞怪表情', emoji: '🤪' }];
        var colors = [{ id: 'zhusha', name: '朱砂红', hex: '#C45C5C', meaning: '辟邪纳福·热烈醒目' }, { id: 'shiqing', name: '石青蓝', hex: '#4A7FB5', meaning: '矿物青色·沉静古雅' }, { id: 'daiwa', name: '黛瓦灰', hex: '#6B7B8C', meaning: '城楼屋瓦·厚重含蓄' }, { id: 'liuli', name: '琉璃黄', hex: '#D4A843', meaning: '宫城琉璃·明亮珍贵' }, { id: 'yuebai', name: '月白', hex: '#F0EDE5', meaning: '月色如瓷·清雅素净' }, { id: 'mohei', name: '墨黑', hex: '#2D2D2D', meaning: '浓墨重彩·沉稳庄重' }, { id: 'jin', name: '鎏金', hex: '#C5A355', meaning: '金碧辉煌·尊贵荣耀' }, { id: 'yin', name: '铸银', hex: '#B0B0B0', meaning: '银光素雅·内敛含蓄' }];
        var elements = [{ id: 'cloud_base', name: '云纹底座' }, { id: 'map_base', name: '中轴线地图底座' }, { id: 'km_marker', name: '零公里标志' }, { id: 'plaque', name: '正阳门牌匾' }, { id: 'archaeology_tag', name: '考古铭牌' }, { id: 'custom_tag', name: '个性化铭牌' }];
