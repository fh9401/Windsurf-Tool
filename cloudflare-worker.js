// Cloudflare Workers 反向代理脚本
// 用于国内访问 Firebase API
// 支持多种请求格式：
// 1. form-urlencoded + URL参数 (accountSwitcher.js)
// 2. JSON + body参数 (accountQuery.js, accountLogin.js)

addEventListener('fetch', event => {
  event.respondWith(handleRequest(event.request))
})

async function handleRequest(request) {
  // 处理 OPTIONS 预检请求
  if (request.method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type'
      }
    })
  }

  // 只允许 POST 请求
  if (request.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 })
  }

  try {
    const url = new URL(request.url)
    const contentType = request.headers.get('content-type') || ''
    
    let grant_type, refresh_token, api_key
    
    // 方式1: form-urlencoded + URL参数 (accountSwitcher.js)
    // POST /token?key=xxx
    // Content-Type: application/x-www-form-urlencoded
    // Body: grant_type=refresh_token&refresh_token=xxx
    if (contentType.includes('application/x-www-form-urlencoded')) {
      // 从 URL 参数获取 API key
      api_key = url.searchParams.get('key')
      
      // 从 body 解析 form data
      const formData = await request.text()
      const params = new URLSearchParams(formData)
      grant_type = params.get('grant_type')
      refresh_token = params.get('refresh_token')
    } 
    // 方式2: JSON + body参数 (accountQuery.js, accountLogin.js)
    // POST /
    // Content-Type: application/json
    // Body: {"grant_type":"refresh_token","refresh_token":"xxx","api_key":"xxx"}
    else {
      const body = await request.json()
      grant_type = body.grant_type
      refresh_token = body.refresh_token
      api_key = body.api_key
    }

    // 验证必需参数
    if (!api_key) {
      return new Response(JSON.stringify({ error: 'Missing API key' }), {
        status: 400,
        headers: { 
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        }
      })
    }

    if (!grant_type || !refresh_token) {
      return new Response(JSON.stringify({ error: 'Missing grant_type or refresh_token' }), {
        status: 400,
        headers: { 
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        }
      })
    }

    // 构建 Firebase API 请求
    const firebaseUrl = `https://securetoken.googleapis.com/v1/token?key=${api_key}`
    
    const firebaseFormData = new URLSearchParams()
    firebaseFormData.append('grant_type', grant_type)
    firebaseFormData.append('refresh_token', refresh_token)

    // 转发请求到 Firebase
    const response = await fetch(firebaseUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'x-client-version': 'Chrome/JsCore/11.0.0/FirebaseCore-web'
      },
      body: firebaseFormData.toString()
    })

    // 返回响应
    const data = await response.json()
    
    return new Response(JSON.stringify(data), {
      status: response.status,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type'
      }
    })
  } catch (error) {
    return new Response(JSON.stringify({ 
      error: error.message,
      stack: error.stack 
    }), {
      status: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      }
    })
  }
}
