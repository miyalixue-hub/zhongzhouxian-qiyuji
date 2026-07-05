/**
 * Cloudflare Worker - Meshy API 代理
 * 
 * 解决浏览器直接调用 Meshy API 的 CORS 限制问题。
 * 部署方式：
 *   1. 登录 https://dash.cloudflare.com
 *   2. Workers & Pages → Create Application → Create Worker
 *   3. 粘贴此代码 → Deploy
 *   4. 记下 Worker URL（如 https://meshy-proxy.xxx.workers.dev）
 *   5. 在 HTML 的 MESHY_CONFIG.proxyUrl 中填入此 URL
 * 
 * 安全说明：
 *   - Worker 只做请求转发，不存储任何 API Key
 *   - 用户的 Meshy API Key 通过请求头 X-Meshy-Key 传入
 *   - 建议生产环境添加 RATE_LIMIT 和域名白名单
 */

export default {
  async fetch(request) {
    // 处理 CORS 预检请求
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, X-Meshy-Key',
          'Access-Control-Max-Age': '86400',
        }
      });
    }

    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, X-Meshy-Key',
    };

    try {
      const url = new URL(request.url);
      const path = url.pathname;
      
      // 获取用户的 Meshy API Key（从请求头传入）
      const meshyKey = request.headers.get('X-Meshy-Key');
      if (!meshyKey) {
        return new Response(JSON.stringify({ error: 'Missing X-Meshy-Key header. Please enter your Meshy API Key.' }), {
          status: 401,
          headers: { 'Content-Type': 'application/json', ...corsHeaders }
        });
      }

      // 转发到 Meshy API
      const meshyBaseUrl = 'https://api.meshy.ai/openapi';
      let targetUrl;

      // 支持的路由：
      // POST /api/image-to-3d     → POST https://api.meshy.ai/openapi/v1/image-to-3d
      // GET  /api/image-to-3d/:id → GET  https://api.meshy.ai/openapi/v1/image-to-3d/:id
      // GET  /api/me              → GET  https://api.meshy.ai/openapi/v1/me (查询积分余额)
      
      if (path === '/api/image-to-3d' && request.method === 'POST') {
        targetUrl = meshyBaseUrl + '/v1/image-to-3d';
      } else if (path.match(/^\/api\/image-to-3d\/[\w-]+$/) && request.method === 'GET') {
        const taskId = path.split('/').pop();
        targetUrl = meshyBaseUrl + '/v1/image-to-3d/' + taskId;
      } else if (path === '/api/me' && request.method === 'GET') {
        targetUrl = meshyBaseUrl + '/v1/me';
      } else {
        return new Response(JSON.stringify({ error: 'Invalid route. Use POST /api/image-to-3d or GET /api/image-to-3d/{taskId}' }), {
          status: 404,
          headers: { 'Content-Type': 'application/json', ...corsHeaders }
        });
      }

      // 构建转发请求
      const forwardHeaders = {
        'Authorization': 'Bearer ' + meshyKey,
        'Content-Type': 'application/json',
      };

      const forwardInit = {
        method: request.method,
        headers: forwardHeaders,
      };

      // POST 请求需要转发 body
      if (request.method === 'POST') {
        forwardInit.body = await request.text();
      }

      // 调用 Meshy API
      const meshyResponse = await fetch(targetUrl, forwardInit);
      const responseBody = await meshyResponse.text();

      return new Response(responseBody, {
        status: meshyResponse.status,
        headers: {
          'Content-Type': 'application/json',
          ...corsHeaders
        }
      });

    } catch (err) {
      return new Response(JSON.stringify({ error: 'Proxy error: ' + err.message }), {
        status: 500,
        headers: { 'Content-Type': 'application/json', ...corsHeaders }
      });
    }
  }
};
