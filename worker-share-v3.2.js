/**
 * Cloudflare Worker - Unified API Proxy with Share Functionality
 * Version 3.2.0
 * 
 * Changes in v3.2:
 *   - Cache GLB binary in KV on upload for reliable 3D preview
 *   - proxy-model supports shareId param for cached model retrieval
 *   - Download handler serves cached GLB directly
 * 
 * Changes in v3.1:
 *   - Package upload: data can be object {images:[], models:[]} for 2D+3D bundle
 *   - Download handler: ?file= parameter for individual files from packages
 *   - New endpoint: POST /api/test-upload for pre-stored test packages
 * 
 * KV Namespace Required:
 *   - SHARE_STORAGE: stores shared content
 * 
 * Environment Variables:
 *   - MESHY_API_KEY, VOLCENGINE_API_KEY, ACCESS_PASSWORD
 */

var ALLOWED_ORIGINS = [
  'https://mindbubble.cloud',
  'https://zhongzhouxian-qiyuji.pages.dev',
  'http://localhost:8080',
  'http://localhost:5173',
  'http://127.0.0.1:8080',
  'http://127.0.0.1:5173'
];

var RATE_LIMIT = {
  '2d': 20,
  '3d': 5,
  'share-upload': 10,
  'default': 30
};

var SHARE_EXPIRY_SECONDS = 30 * 24 * 60 * 60;
var rateLimitStore = new Map();

function checkRateLimit(ip, type) {
  var key = ip + ':' + type;
  var now = Date.now();
  var windowMs = 60 * 1000;
  var limit = RATE_LIMIT[type] || RATE_LIMIT['default'];
  var timestamps = rateLimitStore.get(key);
  if (timestamps) {
    timestamps = timestamps.filter(function(t) { return now - t < windowMs; });
  } else {
    timestamps = [];
  }
  if (timestamps.length >= limit) {
    rateLimitStore.set(key, timestamps);
    return false;
  }
  timestamps.push(now);
  rateLimitStore.set(key, timestamps);
  return true;
}

function getCorsHeaders(request) {
  var origin = request.headers.get('Origin') || '';
  var allowedOrigin = ALLOWED_ORIGINS.indexOf(origin) >= 0 ? origin : ALLOWED_ORIGINS[0];
  return {
    'Access-Control-Allow-Origin': allowedOrigin,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin'
  };
}

function generateShareId() {
  var chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
  var id = '';
  for (var i = 0; i < 8; i++) {
    id += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return id;
}

// Token management
var TOKEN_EXPIRY_MS = 30 * 24 * 60 * 60 * 1000;

async function generateToken(password) {
  var encoder = new TextEncoder();
  var payload = { exp: Date.now() + TOKEN_EXPIRY_MS };
  var payloadB64 = btoa(JSON.stringify(payload));
  var key = await crypto.subtle.importKey(
    'raw', encoder.encode(password), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  );
  var sig = await crypto.subtle.sign('HMAC', key, encoder.encode(payloadB64));
  var sigB64 = btoa(String.fromCharCode.apply(null, new Uint8Array(sig)));
  return payloadB64 + '.' + sigB64;
}

async function verifyToken(token, password) {
  try {
    var parts = token.split('.');
    var payloadB64 = parts[0];
    var sigB64 = parts[1];
    if (!payloadB64 || !sigB64) return false;
    var encoder = new TextEncoder();
    var key = await crypto.subtle.importKey(
      'raw', encoder.encode(password), { name: 'HMAC', hash: 'SHA-256' }, false, ['verify']
    );
    var sig = Uint8Array.from(atob(sigB64), function(c) { return c.charCodeAt(0); });
    var valid = await crypto.subtle.verify('HMAC', key, sig, encoder.encode(payloadB64));
    if (!valid) return false;
    var payload = JSON.parse(atob(payloadB64));
    return payload.exp > Date.now();
  } catch (e) {
    return false;
  }
}

export default {
  async fetch(request, env) {
    var corsHeaders = getCorsHeaders(request);
    
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }
    
    var url = new URL(request.url);
    var path = url.pathname;
    var clientIp = request.headers.get('CF-Connecting-IP') || 'unknown';
    
    try {
      // ========== Auth ==========
      if (path === '/api/auth' && request.method === 'POST') {
        var password = env.ACCESS_PASSWORD;
        if (!password) {
          return new Response(JSON.stringify({ error: 'ACCESS_PASSWORD not configured' }), {
            status: 500, headers: Object.assign({ 'Content-Type': 'application/json' }, corsHeaders)
          });
        }
        var body = await request.json();
        if (body.password !== password) {
          return new Response(JSON.stringify({ error: 'Invalid password' }), {
            status: 401, headers: Object.assign({ 'Content-Type': 'application/json' }, corsHeaders)
          });
        }
        var token = await generateToken(password);
        return new Response(JSON.stringify({ token: token, exp: Date.now() + TOKEN_EXPIRY_MS }), {
          status: 200, headers: Object.assign({ 'Content-Type': 'application/json' }, corsHeaders)
        });
      }

      // Protected paths check
      var protectedPaths = ['/api/2d/generate', '/api/image-to-3d', '/api/share/upload', '/api/test-upload'];
      if (protectedPaths.some(function(p) { return path === p || path.indexOf(p + '/') === 0; })) {
        var pwd = env.ACCESS_PASSWORD;
        if (pwd) {
          var authHeader = request.headers.get('Authorization') || '';
          var tok = authHeader.replace('Bearer ', '');
          if (!tok || !(await verifyToken(tok, pwd))) {
            return new Response(JSON.stringify({ error: 'Unauthorized', code: 'AUTH_REQUIRED' }), {
              status: 401, headers: Object.assign({ 'Content-Type': 'application/json' }, corsHeaders)
            });
          }
        }
      }

      // ========== SHARE: Upload ==========
      // POST /api/share/upload
      // Body: { type: "2d"|"3d"|"package", name: string, data: string|object }
      // For packages, data = { images: [{base64}], models: [{url, format, filename}] }
      // =========================================
      if (path === '/api/share/upload' && request.method === 'POST') {
        console.log('[Share] Upload from ' + clientIp);
        
        if (!checkRateLimit(clientIp, 'share-upload')) {
          return new Response(JSON.stringify({ error: 'Too frequent' }), {
            status: 429, headers: Object.assign({ 'Content-Type': 'application/json' }, corsHeaders)
          });
        }
        
        if (!env.SHARE_STORAGE) {
          return new Response(JSON.stringify({ error: 'Storage not configured' }), {
            status: 500, headers: Object.assign({ 'Content-Type': 'application/json' }, corsHeaders)
          });
        }
        
        var uploadBody = await request.json();
        var shareType = uploadBody.type;
        var shareName = uploadBody.name || 'untitled';
        var shareData = uploadBody.data;
        
        if (!shareType || shareData === undefined || shareData === null) {
          return new Response(JSON.stringify({ error: 'Missing type or data' }), {
            status: 400, headers: Object.assign({ 'Content-Type': 'application/json' }, corsHeaders)
          });
        }
        
        // Size check - handle both string and object data
        var dataStr = typeof shareData === 'string' ? shareData : JSON.stringify(shareData);
        if (dataStr.length > 20 * 1024 * 1024) {
          return new Response(JSON.stringify({ error: 'Data too large (max ~15MB)' }), {
            status: 413, headers: Object.assign({ 'Content-Type': 'application/json' }, corsHeaders)
          });
        }
        
        var shareId = generateShareId();
        var now = new Date().toISOString();
        
        var metadata = {
          id: shareId,
          type: shareType,
          name: shareName,
          createdAt: now,
          expiresAt: new Date(Date.now() + SHARE_EXPIRY_SECONDS * 1000).toISOString()
        };
        
        var kvKey = 'share:' + shareId;
        await env.SHARE_STORAGE.put(kvKey, JSON.stringify({
          meta: metadata,
          data: shareData
        }), {
          expirationTtl: SHARE_EXPIRY_SECONDS
        });
        
        console.log('[Share] Created ' + shareId + ' type=' + shareType);
        
        // Cache GLB model binary in separate KV key for share page preview & download
        if (shareType === 'package' && typeof shareData === 'object' && shareData.models) {
          var glbModel = shareData.models.find(function(m) { return m.format === 'glb'; });
          if (glbModel && glbModel.url) {
            try {
              console.log('[Share] Caching GLB model for ' + shareId);
              var glbResp = await fetch(glbModel.url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
              if (glbResp.ok) {
                var glbBin = await glbResp.arrayBuffer();
                await env.SHARE_STORAGE.put('model_bin:' + shareId, glbBin, {
                  expirationTtl: SHARE_EXPIRY_SECONDS
                });
                console.log('[Share] Cached GLB ' + glbBin.byteLength + ' bytes for ' + shareId);
              } else {
                console.warn('[Share] GLB fetch failed: ' + glbResp.status);
              }
            } catch (e) {
              console.warn('[Share] GLB cache error: ' + e.message);
            }
          }
        }
        
        return new Response(JSON.stringify({
          success: true,
          shareId: shareId,
          metadata: metadata
        }), {
          status: 200,
          headers: Object.assign({ 'Content-Type': 'application/json' }, corsHeaders)
        });
      }

      // ========== SHARE: Get ==========
      if (path.match(/^\/api\/share\/[A-Za-z0-9]{8}$/) && request.method === 'GET') {
        var getId = path.split('/')[3];
        
        if (!env.SHARE_STORAGE) {
          return new Response(JSON.stringify({ error: 'Storage not configured' }), {
            status: 500, headers: Object.assign({ 'Content-Type': 'application/json' }, corsHeaders)
          });
        }
        
        var stored = await env.SHARE_STORAGE.get('share:' + getId);
        if (!stored) {
          return new Response(JSON.stringify({ error: 'Not found or expired', code: 'NOT_FOUND' }), {
            status: 404, headers: Object.assign({ 'Content-Type': 'application/json' }, corsHeaders)
          });
        }
        
        var parsed = JSON.parse(stored);
        return new Response(JSON.stringify({
          success: true,
          metadata: parsed.meta,
          data: parsed.data
        }), {
          status: 200,
          headers: Object.assign({ 'Content-Type': 'application/json' }, corsHeaders)
        });
      }

      // ========== SHARE: Download ==========
      // GET /api/share/:id/download
      // For packages: ?file=image_N or ?file=stl or ?file=3mf or ?file=glb
      // For legacy: returns the single file
      // =========================================
      if (path.match(/^\/api\/share\/[A-Za-z0-9]{8}\/download$/) && request.method === 'GET') {
        var dlId = path.split('/')[3];
        var searchParams = url.searchParams;
        
        if (!env.SHARE_STORAGE) {
          return new Response(JSON.stringify({ error: 'Storage not configured' }), {
            status: 500, headers: Object.assign({ 'Content-Type': 'application/json' }, corsHeaders)
          });
        }
        
        var stored = await env.SHARE_STORAGE.get('share:' + dlId);
        if (!stored) {
          return new Response(JSON.stringify({ error: 'Not found or expired' }), {
            status: 404, headers: Object.assign({ 'Content-Type': 'application/json' }, corsHeaders)
          });
        }
        
        var parsed = JSON.parse(stored);
        var data = parsed.data;
        var meta = parsed.meta;
        var fileKey = searchParams.get('file');
        
        // ---- Package format ----
        if (meta.type === 'package' && typeof data === 'object' && data !== null) {
          if (!fileKey) {
            return new Response(JSON.stringify({ error: 'Specify ?file=image_N, ?file=stl, ?file=3mf, or ?file=glb' }), {
              status: 400, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
            });
          }
          
          // Image files: ?file=image_0, image_1, etc.
          if (fileKey.indexOf('image_') === 0) {
            var idx = parseInt(fileKey.split('_')[1]);
            var images = data.images || [];
            if (idx >= 0 && idx < images.length) {
              var imgObj = images[idx];
              var b64 = imgObj.base64 || '';
              // Handle both data URI and raw base64
              var rawB64 = b64;
              var mime = imgObj.mime || 'image/png';
              if (b64.indexOf('data:') === 0) {
                // Extract from data URI
                var commaIdx = b64.indexOf(',');
                rawB64 = b64.substring(commaIdx + 1);
                if (!mime && b64.indexOf(';base64,') > 0) {
                  mime = b64.substring(5, b64.indexOf(';'));
                }
              }
              // Strip any whitespace/newlines from base64
              rawB64 = rawB64.replace(/[\s\r\n]/g, '');
              // Add padding if needed
              while (rawB64.length % 4 !== 0) { rawB64 += '='; }
              try {
                var bin = Uint8Array.from(atob(rawB64), function(c) { return c.charCodeAt(0); });
              } catch (e) {
                return new Response(JSON.stringify({ error: 'Invalid base64 for image ' + fileKey + ': ' + e.message }), {
                  status: 500, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
                });
              }
              var fname = (meta.name || 'artwork') + '_' + (idx + 1) + '.' + (mime.split('/')[1] || 'png');
              return new Response(bin, {
                status: 200,
                headers: {
                  'Content-Type': mime,
                  'Content-Disposition': 'attachment; filename="' + encodeURIComponent(fname) + '"',
                  'Access-Control-Allow-Origin': '*',
                  'Access-Control-Expose-Headers': 'Content-Disposition'
                }
              });
            }
            return new Response(JSON.stringify({ error: 'Image not found: ' + fileKey }), {
              status: 404, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
            });
          }
          
          // 3D model files: ?file=stl, ?file=3mf, ?file=glb
          var models = data.models || [];
          var model = null;
          for (var mi = 0; mi < models.length; mi++) {
            if (models[mi].format === fileKey) { model = models[mi]; break; }
          }
          if (model && model.url) {
            // For GLB: try KV cache first (cached at upload time)
            if (fileKey === 'glb') {
              try {
                var cachedGlb = await env.SHARE_STORAGE.get('model_bin:' + dlId, 'arrayBuffer');
                if (cachedGlb) {
                  var glbFname = model.filename || 'model.glb';
                  return new Response(cachedGlb, {
                    status: 200,
                    headers: {
                      'Content-Type': 'model/gltf-binary',
                      'Content-Disposition': 'attachment; filename="' + encodeURIComponent(glbFname) + '"',
                      'Access-Control-Allow-Origin': '*',
                      'Access-Control-Expose-Headers': 'Content-Disposition',
                      'X-Cache': 'HIT'
                    }
                  });
                }
              } catch (e) {
                console.warn('[Download] GLB cache read error: ' + e.message);
              }
            }
            // Fallback: return URL as JSON
            return new Response(JSON.stringify({
              url: model.url,
              filename: model.filename || ('model.' + fileKey),
              format: fileKey
            }), {
              status: 200,
              headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
            });
          }
          return new Response(JSON.stringify({ error: 'Model not found: ' + fileKey }), {
            status: 404, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
          });
        }
        
        // ---- Legacy single-file format ----
        if (meta.type === '2d') {
          var binary = Uint8Array.from(atob(data), function(c) { return c.charCodeAt(0); });
          var fileName = (meta.name || 'share') + '.png';
          return new Response(binary, {
            status: 200,
            headers: {
              'Content-Type': 'image/png',
              'Content-Disposition': 'attachment; filename="' + encodeURIComponent(fileName) + '"',
              'Access-Control-Allow-Origin': '*'
            }
          });
        } else if (meta.type === '3d') {
          return new Response(null, {
            status: 302,
            headers: { 'Location': data, 'Access-Control-Allow-Origin': '*' }
          });
        }
        
        return new Response(JSON.stringify({ error: 'Unknown share type' }), {
          status: 400, headers: Object.assign({ 'Content-Type': 'application/json' }, corsHeaders)
        });
      }

      // ========== SHARE: Delete ==========
      if (path.match(/^\/api\/share\/[A-Za-z0-9]{8}$/) && request.method === 'DELETE') {
        var delId = path.split('/').pop();
        if (!env.SHARE_STORAGE) {
          return new Response(JSON.stringify({ error: 'Storage not configured' }), {
            status: 500, headers: Object.assign({ 'Content-Type': 'application/json' }, corsHeaders)
          });
        }
        await env.SHARE_STORAGE.delete('share:' + delId);
        return new Response(JSON.stringify({ success: true }), {
          status: 200, headers: Object.assign({ 'Content-Type': 'application/json' }, corsHeaders)
        });
      }

      // ========== TEST: Upload pre-stored test package ==========
      // POST /api/test-upload
      // Creates a test package with dummy images + Astronaut 3D model
      // =========================================
      if (path === '/api/test-upload' && request.method === 'POST') {
        console.log('[Test] Upload test package from ' + clientIp);
        
        if (!env.SHARE_STORAGE) {
          return new Response(JSON.stringify({ error: 'Storage not configured' }), {
            status: 500, headers: Object.assign({ 'Content-Type': 'application/json' }, corsHeaders)
          });
        }
        
        var testBody = await request.json().catch(function() { return {}; });
        var testName = testBody.name || '测试神兽作品';
        
        // Use provided test images or generate minimal 1x1 PNG placeholders
        var defaultColors = ['FF6B6B', '4ECDC4', '45B7D1', '96CEB4'];
        var defaultNames = ['经典复古', '现代简约', '金色华贵', '水墨丹青'];
        var testImages = [];
        
        if (testBody.images && Array.isArray(testBody.images)) {
          testImages = testBody.images;
        } else {
          // Generate minimal colored PNG placeholders using a 1x1 pixel approach
          // Actually, let's use simple SVG data URIs converted to a format the browser can display
          for (var ci = 0; ci < 4; ci++) {
            testImages.push({
              base64: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==',
              name: defaultNames[ci],
              mime: 'image/png'
            });
          }
        }
        
        // Test 3D model URLs
        var testModels = [
          { url: 'https://modelviewer.dev/shared-assets/models/Astronaut.glb', format: 'glb', filename: 'test_model.glb' },
          { url: 'https://modelviewer.dev/shared-assets/models/Astronaut.glb', format: 'stl', filename: 'test_model.stl' },
          { url: 'https://modelviewer.dev/shared-assets/models/Astronaut.glb', format: '3mf', filename: 'test_model.3mf' }
        ];
        
        var testData = {
          images: testImages,
          models: testModels,
          isTest: true
        };
        
        var testShareId = generateShareId();
        var testNow = new Date().toISOString();
        var testMetadata = {
          id: testShareId,
          type: 'package',
          name: testName,
          createdAt: testNow,
          expiresAt: new Date(Date.now() + SHARE_EXPIRY_SECONDS * 1000).toISOString()
        };
        
        await env.SHARE_STORAGE.put('share:' + testShareId, JSON.stringify({
          meta: testMetadata,
          data: testData
        }), {
          expirationTtl: SHARE_EXPIRY_SECONDS
        });
        
        console.log('[Test] Created test package ' + testShareId);
        
        return new Response(JSON.stringify({
          success: true,
          shareId: testShareId,
          metadata: testMetadata
        }), {
          status: 200,
          headers: Object.assign({ 'Content-Type': 'application/json' }, corsHeaders)
        });
      }

      // ========== 2D image generation (Seedream) ==========
      if (path === '/api/2d/generate' && request.method === 'POST') {
        if (!checkRateLimit(clientIp, '2d')) {
          return new Response(JSON.stringify({ error: 'Too many requests' }), {
            status: 429, headers: Object.assign({ 'Content-Type': 'application/json' }, corsHeaders)
          });
        }
        
        var apiKey = env.VOLCENGINE_API_KEY;
        if (!apiKey) {
          return new Response(JSON.stringify({ error: 'VOLCENGINE_API_KEY not configured' }), {
            status: 500, headers: Object.assign({ 'Content-Type': 'application/json' }, corsHeaders)
          });
        }
        
        var genBody = await request.json();
        if (!genBody.model) genBody.model = 'doubao-seedream-5-0-260128';
        
        var controller = new AbortController();
        var timeoutId = setTimeout(function() { controller.abort(); }, 90000);
        
        try {
          var response = await fetch('https://ark.cn-beijing.volces.com/api/v3/images/generations', {
            method: 'POST',
            headers: {
              'Authorization': 'Bearer ' + apiKey,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify(genBody),
            signal: controller.signal
          });
          
          clearTimeout(timeoutId);
          var responseBody = await response.text();
          
          return new Response(responseBody, {
            status: response.status,
            headers: Object.assign({ 'Content-Type': 'application/json' }, corsHeaders)
          });
        } catch (err) {
          clearTimeout(timeoutId);
          if (err.name === 'AbortError') {
            return new Response(JSON.stringify({ error: 'Generation timeout' }), {
              status: 504, headers: Object.assign({ 'Content-Type': 'application/json' }, corsHeaders)
            });
          }
          return new Response(JSON.stringify({ error: 'Proxy error: ' + err.message }), {
            status: 500, headers: Object.assign({ 'Content-Type': 'application/json' }, corsHeaders)
          });
        }
      }
      
      // ========== 3D model generation (Meshy proxy) ==========
      if (path.indexOf('/api/image-to-3d') === 0 || path === '/api/balance') {
        var meshyKey = env.MESHY_API_KEY;
        if (!meshyKey) {
          return new Response(JSON.stringify({ error: 'MESHY_API_KEY not configured' }), {
            status: 500, headers: Object.assign({ 'Content-Type': 'application/json' }, corsHeaders)
          });
        }
        
        if (path === '/api/image-to-3d' && request.method === 'POST') {
          if (!checkRateLimit(clientIp, '3d')) {
            return new Response(JSON.stringify({ error: 'Too frequent' }), {
              status: 429, headers: Object.assign({ 'Content-Type': 'application/json' }, corsHeaders)
            });
          }
        }
        
        var meshyBaseUrl = 'https://api.meshy.ai/openapi';
        var targetUrl;
        
        if (path === '/api/image-to-3d' && request.method === 'POST') {
          targetUrl = meshyBaseUrl + '/v1/image-to-3d';
        } else if (path.match(/^\/api\/image-to-3d\/[\w-]+$/) && request.method === 'GET') {
          var taskId = path.split('/').pop();
          targetUrl = meshyBaseUrl + '/v1/image-to-3d/' + taskId;
        } else if (path === '/api/balance' && request.method === 'GET') {
          targetUrl = meshyBaseUrl + '/v1/balance';
        } else {
          return new Response(JSON.stringify({ error: 'Invalid route' }), {
            status: 404, headers: Object.assign({ 'Content-Type': 'application/json' }, corsHeaders)
          });
        }
        
        var forwardHeaders = {
          'Authorization': 'Bearer ' + meshyKey,
          'Content-Type': 'application/json'
        };
        
        var forwardInit = { method: request.method, headers: forwardHeaders };
        if (request.method === 'POST') {
          forwardInit.body = await request.text();
        }
        
        var meshyResponse = await fetch(targetUrl, forwardInit);
        var meshyBody = await meshyResponse.text();
        
        return new Response(meshyBody, {
          status: meshyResponse.status,
          headers: Object.assign({ 'Content-Type': 'application/json' }, corsHeaders)
        });
      }
      
      // ========== Proxy image (for CORS-blocked URLs like TOS) ==========
      if (path === '/api/proxy-image' && request.method === 'GET') {
        var imgUrl = url.searchParams.get('url');
        if (!imgUrl) {
          return new Response(JSON.stringify({ error: 'Missing url parameter' }), {
            status: 400, headers: Object.assign({ 'Content-Type': 'application/json' }, corsHeaders)
          });
        }
        try {
          var imgResp = await fetch(imgUrl, { headers: { 'User-Agent': 'Mozilla/5.0' } });
          if (!imgResp.ok) {
            return new Response(JSON.stringify({ error: 'Fetch failed: ' + imgResp.status }), {
              status: imgResp.status, headers: Object.assign({ 'Content-Type': 'application/json' }, corsHeaders)
            });
          }
          var arrayBuffer = await imgResp.arrayBuffer();
          var bytes = new Uint8Array(arrayBuffer);
          var binary = '';
          for (var i = 0; i < bytes.length; i++) {
            binary += String.fromCharCode(bytes[i]);
          }
          var base64 = btoa(binary);
          var contentType = imgResp.headers.get('content-type') || 'image/png';
          return new Response(JSON.stringify({ 
            base64: 'data:' + contentType + ';base64,' + base64,
            contentType: contentType,
            size: bytes.length
          }), {
            headers: Object.assign({ 'Content-Type': 'application/json' }, corsHeaders)
          });
        } catch(e) {
          return new Response(JSON.stringify({ error: 'Proxy failed: ' + e.message }), {
            status: 500, headers: Object.assign({ 'Content-Type': 'application/json' }, corsHeaders)
          });
        }
      }

      // ========== Proxy model (GLB) for model-viewer (CORS) ==========
      if (path === '/api/proxy-model' && request.method === 'GET') {
        var modelUrl = url.searchParams.get('url');
        var proxyShareId = url.searchParams.get('shareId');
        if (!modelUrl && !proxyShareId) {
          return new Response(JSON.stringify({ error: 'Missing url or shareId parameter' }), {
            status: 400, headers: Object.assign({ 'Content-Type': 'application/json' }, corsHeaders)
          });
        }
        
        // Handle preflight for model binary
        if (request.headers.get('X-Preflight-Check') === '1') {
          return new Response(null, { status: 204, headers: corsHeaders });
        }
        
        // 1) Try KV cache first (cached at share creation time)
        if (proxyShareId && env.SHARE_STORAGE) {
          try {
            var cachedModel = await env.SHARE_STORAGE.get('model_bin:' + proxyShareId, 'arrayBuffer');
            if (cachedModel) {
              console.log('[ProxyModel] Cache HIT for ' + proxyShareId + ' size=' + cachedModel.byteLength);
              return new Response(cachedModel, {
                status: 200,
                headers: {
                  'Access-Control-Allow-Origin': '*',
                  'Access-Control-Allow-Methods': 'GET, OPTIONS',
                  'Access-Control-Allow-Headers': '*',
                  'Access-Control-Max-Age': '86400',
                  'Content-Type': 'model/gltf-binary',
                  'Cache-Control': 'public, max-age=86400',
                  'X-Cache': 'HIT'
                }
              });
            }
          } catch (e) {
            console.warn('[ProxyModel] Cache read error: ' + e.message);
          }
        }
        
        // 2) Fallback: direct fetch from URL
        if (!modelUrl) {
          return new Response(JSON.stringify({ error: 'No cached model and no url provided' }), {
            status: 404, headers: Object.assign({ 'Content-Type': 'application/json' }, corsHeaders)
          });
        }
        try {
          var modelResp = await fetch(modelUrl, { headers: { 'User-Agent': 'Mozilla/5.0' } });
          if (!modelResp.ok) {
            return new Response(JSON.stringify({ error: 'Fetch failed: ' + modelResp.status }), {
              status: modelResp.status, headers: Object.assign({ 'Content-Type': 'application/json' }, corsHeaders)
            });
          }
          // Stream binary GLB directly with CORS headers
          var modelHeaders = {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, OPTIONS',
            'Access-Control-Allow-Headers': '*',
            'Access-Control-Max-Age': '86400',
            'Content-Type': modelResp.headers.get('content-type') || 'model/gltf-binary',
            'Cache-Control': 'public, max-age=86400'
          };
          return new Response(modelResp.body, { headers: modelHeaders });
        } catch(e) {
          return new Response(JSON.stringify({ error: 'Model proxy failed: ' + e.message }), {
            status: 500, headers: Object.assign({ 'Content-Type': 'application/json' }, corsHeaders)
          });
        }
      }

      // ========== Health check ==========
      if (path === '/api/health') {
        return new Response(JSON.stringify({ 
          status: 'ok', 
          time: new Date().toISOString(),
          version: '3.2.0-model-cache'
        }), {
          headers: Object.assign({ 'Content-Type': 'application/json' }, corsHeaders)
        });
      }
      
      return new Response(JSON.stringify({ error: 'Unknown route' }), {
        status: 404, headers: Object.assign({ 'Content-Type': 'application/json' }, corsHeaders)
      });
      
    } catch (err) {
      return new Response(JSON.stringify({ error: 'Server error: ' + err.message }), {
        status: 500, headers: Object.assign({ 'Content-Type': 'application/json' }, corsHeaders)
      });
    }
  }
};
