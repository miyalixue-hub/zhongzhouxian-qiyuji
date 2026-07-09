/**
 * Cloudflare Worker - 统一 API 代理
 * 
 * 功能：
 *   1. Meshy 3D 生成代理（/api/image-to-3d, /api/balance）
 *   2. 火山引擎 Seedream 2D 图片生成代理（/api/2d/generate）
 *   3. 密钥统一管理（存储在 Worker 环境变量/Secrets）
 *   4. CORS 来源限制（只允许指定域名）
 *   5. 基础限流（每台设备每分钟请求数限制）
 * 
 * 部署方式：
 *   1. 安装 Wrangler: npm install -g wrangler
 *   2. 登录: wrangler login
 *   3. 设置密钥: 
 *      wrangler secret put MESHY_API_KEY
 *      wrangler secret put VOLCENGINE_API_KEY
 *   4. 部署: wrangler deploy
 * 
 * 安全说明：
 *   - API Key 存储在 Worker Secrets，前端不接触密钥
 *   - CORS 限制为 mindbubble.cloud 和 pages.dev
 *   - 基础限流防止滥用
 */

// 允许的域名列表
const ALLOWED_ORIGINS = [
  'https://mindbubble.cloud',
  'https://zhongzhouxian-qiyuji.pages.dev',
  'http://localhost:8080',  // 本地开发
  'http://localhost:5173',  // Vite 开发
  'http://127.0.0.1:8080',
  'http://127.0.0.1:5173'
];

// 限流配置（每分钟每 IP 最大请求数）
const RATE_LIMIT = {
  '2d': 10,      // 2D 图片生成
  '3d': 5,       // 3D 模型生成
  'default': 30  // 其他接口
};

// 简单的内存限流（生产环境建议用 KV 存储）
const rateLimitStore = new Map();

function checkRateLimit(ip, type) {
  const key = `${ip}:${type}`;
  const now = Date.now();
  const windowMs = 60 * 1000; // 1分钟窗口
  const limit = RATE_LIMIT[type] || RATE_LIMIT.default;
  
  let record = rateLimitStore.get(key);
  if (!record || now - record.start > windowMs) {
    record = { start: now, count: 0 };
    rateLimitStore.set(key, record);
  }
  
  record.count++;
  return record.count <= limit;
}

function getCorsHeaders(request) {
  const origin = request.headers.get('Origin') || '';
  const allowedOrigin = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  
  return {
    'Access-Control-Allow-Origin': allowedOrigin,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin'
  };
}

function isAllowedOrigin(request) {
  const origin = request.headers.get('Origin') || '';
  // 允许无 Origin 的请求（如 curl 测试）
  if (!origin) return true;
  return ALLOWED_ORIGINS.includes(origin);
}

export default {
  async fetch(request, env) {
    const corsHeaders = getCorsHeaders(request);
    
    // 处理 CORS 预检请求
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }
    
    // 检查来源
    if (!isAllowedOrigin(request)) {
      return new Response(JSON.stringify({ error: 'Origin not allowed' }), {
        status: 403,
        headers: { 'Content-Type': 'application/json', ...corsHeaders }
      });
    }
    
    const url = new URL(request.url);
    const path = url.pathname;
    const clientIp = request.headers.get('CF-Connecting-IP') || 'unknown';
    
    try {
      // ========== 2D 图片生成（火山引擎 Seedream）==========
      if (path === '/api/2d/generate' && request.method === 'POST') {
        if (!checkRateLimit(clientIp, '2d')) {
          return new Response(JSON.stringify({ error: '请求太频繁，请稍后再试' }), {
            status: 429,
            headers: { 'Content-Type': 'application/json', ...corsHeaders }
          });
        }
        
        const apiKey = env.VOLCENGINE_API_KEY;
        if (!apiKey) {
          return new Response(JSON.stringify({ error: '服务端未配置火山引擎 API Key' }), {
            status: 500,
            headers: { 'Content-Type': 'application/json', ...corsHeaders }
          });
        }
        
        const body = await request.json();
        
        const response = await fetch('https://ark.cn-beijing.volces.com/api/v3/images/generations', {
          method: 'POST',
          headers: {
            'Authorization': 'Bearer ' + apiKey,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(body)
        });
        
        const responseBody = await response.text();
        return new Response(responseBody, {
          status: response.status,
          headers: { 'Content-Type': 'application/json', ...corsHeaders }
        });
      }
      
      // ========== 3D 模型生成（Meshy）==========
      if (path.startsWith('/api/image-to-3d') || path === '/api/balance') {
        const meshyKey = env.MESHY_API_KEY;
        if (!meshyKey) {
          return new Response(JSON.stringify({ error: '服务端未配置 Meshy API Key' }), {
            status: 500,
            headers: { 'Content-Type': 'application/json', ...corsHeaders }
          });
        }
        
        // 3D 生成需要更严格的限流
        if (path === '/api/image-to-3d' && request.method === 'POST') {
          if (!checkRateLimit(clientIp, '3d')) {
            return new Response(JSON.stringify({ error: '3D 生成请求太频繁，请稍后再试' }), {
              status: 429,
              headers: { 'Content-Type': 'application/json', ...corsHeaders }
            });
          }
        }
        
        const meshyBaseUrl = 'https://api.meshy.ai/openapi';
        let targetUrl;
        
        if (path === '/api/image-to-3d' && request.method === 'POST') {
          targetUrl = meshyBaseUrl + '/v1/image-to-3d';
        } else if (path.match(/^\/api\/image-to-3d\/[\w-]+$/) && request.method === 'GET') {
          const taskId = path.split('/').pop();
          targetUrl = meshyBaseUrl + '/v1/image-to-3d/' + taskId;
        } else if (path === '/api/balance' && request.method === 'GET') {
          targetUrl = meshyBaseUrl + '/v1/balance';
        } else {
          return new Response(JSON.stringify({ error: 'Invalid route' }), {
            status: 404,
            headers: { 'Content-Type': 'application/json', ...corsHeaders }
          });
        }
        
        const forwardHeaders = {
          'Authorization': 'Bearer ' + meshyKey,
          'Content-Type': 'application/json',
        };
        
        const forwardInit = {
          method: request.method,
          headers: forwardHeaders,
        };
        
        if (request.method === 'POST') {
          forwardInit.body = await request.text();
        }
        
        const meshyResponse = await fetch(targetUrl, forwardInit);
        const responseBody = await meshyResponse.text();
        
        return new Response(responseBody, {
          status: meshyResponse.status,
          headers: { 'Content-Type': 'application/json', ...corsHeaders }
        });
      }
      
      // ========== 健康检查 ==========
      if (path === '/api/health') {
        return new Response(JSON.stringify({ 
          status: 'ok', 
          time: new Date().toISOString(),
          version: '2.0.0'
        }), {
          headers: { 'Content-Type': 'application/json', ...corsHeaders }
        });
      }
      
      // 未知路由
      return new Response(JSON.stringify({ error: 'Unknown route' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json', ...corsHeaders }
      });
      
    } catch (err) {
      return new Response(JSON.stringify({ error: 'Proxy error: ' + err.message }), {
        status: 500,
        headers: { 'Content-Type': 'application/json', ...corsHeaders }
      });
    }
  }
};
