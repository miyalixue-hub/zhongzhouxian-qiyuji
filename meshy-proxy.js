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
 *      wrangler secret put ACCESS_PASSWORD
 *   4. 部署: wrangler deploy
 * 
 * 安全说明：
 *   - API Key 存储在 Worker Secrets，前端不接触密钥
 *   - CORS 限制为 mindbubble.cloud 和 pages.dev
 *   - 基础限流防止滥用
 *   - 访问密码验证（ACCESS_PASSWORD），前端需先验证获取 token
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
  '2d': 20,      // 2D 图片生成（每分钟20次）
  '3d': 5,       // 3D 模型生成
  'default': 30  // 其他接口
};

// 滑动窗口限流（修复：使用数组记录每次请求时间戳，窗口过期自动清理）
const rateLimitStore = new Map();

function checkRateLimit(ip, type) {
  const key = `${ip}:${type}`;
  const now = Date.now();
  const windowMs = 60 * 1000; // 1分钟窗口
  const limit = RATE_LIMIT[type] || RATE_LIMIT.default;
  
  let timestamps = rateLimitStore.get(key);
  
  // 清理过期时间戳（只保留最近1分钟内的）
  if (timestamps) {
    timestamps = timestamps.filter(t => now - t < windowMs);
  } else {
    timestamps = [];
  }
  
  // 检查是否超过限制
  if (timestamps.length >= limit) {
    rateLimitStore.set(key, timestamps);
    console.log(`[RateLimit] BLOCKED ${key}: ${timestamps.length}/${limit} requests in window`);
    return false;
  }
  
  // 记录本次请求
  timestamps.push(now);
  rateLimitStore.set(key, timestamps);
  console.log(`[RateLimit] ALLOWED ${key}: ${timestamps.length}/${limit} requests in window`);
  return true;
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

// Token 有效期：30天（适合"输入一次一直用"的场景）
const TOKEN_EXPIRY_MS = 30 * 24 * 60 * 60 * 1000;

// 生成 HMAC token
async function generateToken(password) {
  const encoder = new TextEncoder();
  const payload = { exp: Date.now() + TOKEN_EXPIRY_MS };
  const payloadB64 = btoa(JSON.stringify(payload));
  const key = await crypto.subtle.importKey(
    'raw', encoder.encode(password), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, encoder.encode(payloadB64));
  const sigB64 = btoa(String.fromCharCode(...new Uint8Array(sig)));
  return payloadB64 + '.' + sigB64;
}

// 验证 token
async function verifyToken(token, password) {
  try {
    const [payloadB64, sigB64] = token.split('.');
    if (!payloadB64 || !sigB64) return false;
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
      'raw', encoder.encode(password), { name: 'HMAC', hash: 'SHA-256' }, false, ['verify']
    );
    const sig = Uint8Array.from(atob(sigB64), c => c.charCodeAt(0));
    const valid = await crypto.subtle.verify('HMAC', key, sig, encoder.encode(payloadB64));
    if (!valid) return false;
    const payload = JSON.parse(atob(payloadB64));
    return payload.exp > Date.now();
  } catch (e) {
    return false;
  }
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
      // ========== 密码认证 ==========
      if (path === '/api/auth' && request.method === 'POST') {
        const password = env.ACCESS_PASSWORD;
        if (!password) {
          return new Response(JSON.stringify({ error: '服务端未配置访问密码' }), {
            status: 500,
            headers: { 'Content-Type': 'application/json', ...corsHeaders }
          });
        }
        const body = await request.json();
        if (body.password !== password) {
          return new Response(JSON.stringify({ error: '密码错误' }), {
            status: 401,
            headers: { 'Content-Type': 'application/json', ...corsHeaders }
          });
        }
        const token = await generateToken(password);
        return new Response(JSON.stringify({ token, exp: Date.now() + TOKEN_EXPIRY_MS }), {
          status: 200,
          headers: { 'Content-Type': 'application/json', ...corsHeaders }
        });
      }

      // ========== Token 验证（2D/3D 接口需要） ==========
      const protectedPaths = ['/api/2d/generate', '/api/image-to-3d'];
      if (protectedPaths.some(p => path === p || path.startsWith(p + '/'))) {
        const password = env.ACCESS_PASSWORD;
        if (password) {
          const authHeader = request.headers.get('Authorization') || '';
          const token = authHeader.replace('Bearer ', '');
          if (!token || !(await verifyToken(token, password))) {
            return new Response(JSON.stringify({ error: '未授权，请先输入访问密码', code: 'AUTH_REQUIRED' }), {
              status: 401,
              headers: { 'Content-Type': 'application/json', ...corsHeaders }
            });
          }
        }
      }

      // ========== 2D 图片生成（火山引擎 Seedream）==========
      if (path === '/api/2d/generate' && request.method === 'POST') {
        console.log(`[2D] Request from ${clientIp}, path: ${path}`);
        
        if (!checkRateLimit(clientIp, '2d')) {
          console.log(`[2D] RATE LIMITED ${clientIp}`);
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
        console.log(`[2D] Calling Seedream API for ${clientIp}, model: ${body.model || 'unknown'}`);
        
        // 添加超时控制（60秒）
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 60000);
        
        try {
          const response = await fetch('https://ark.cn-beijing.volces.com/api/v3/images/generations', {
            method: 'POST',
            headers: {
              'Authorization': 'Bearer ' + apiKey,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify(body),
            signal: controller.signal
          });
          
          clearTimeout(timeoutId);
          console.log(`[2D] Seedream response status: ${response.status}`);
          const responseBody = await response.text();
          console.log(`[2D] Response body length: ${responseBody.length}`);
          
          // 如果不是200，记录详细错误
          if (!response.ok) {
            console.error(`[2D] Seedream error: ${responseBody.substring(0, 500)}`);
          }
          
          return new Response(responseBody, {
            status: response.status,
            headers: { 'Content-Type': 'application/json', ...corsHeaders }
          });
        } catch (err) {
          clearTimeout(timeoutId);
          if (err.name === 'AbortError') {
            console.error(`[2D] Timeout: Seedream API took more than 60s`);
            return new Response(JSON.stringify({ 
              error: '生成超时，请稍后重试',
              code: 'TIMEOUT'
            }), {
              status: 504,
              headers: { 'Content-Type': 'application/json', ...corsHeaders }
            });
          }
          console.error(`[2D] Fetch error: ${err.message}`);
          throw err;
        }
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
