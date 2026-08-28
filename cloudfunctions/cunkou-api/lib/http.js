const { getGameKey } = require('./config');

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type,Authorization',
  'Access-Control-Max-Age': '86400',
};

function respond(statusCode, body, extraHeaders = {}) {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      ...CORS_HEADERS,
      ...extraHeaders,
    },
    body: typeof body === 'string' ? body : JSON.stringify(body),
    isBase64Encoded: false,
  };
}

function preflight() {
  return {
    statusCode: 204,
    headers: { ...CORS_HEADERS },
    body: '',
    isBase64Encoded: false,
  };
}

function parseEvent(event) {
  event = event || {};
  if (event.httpMethod) {
    const method = String(event.httpMethod).toUpperCase();
    let rawBody = event.body || '';
    if (event.isBase64Encoded && rawBody) {
      try {
        rawBody = Buffer.from(rawBody, 'base64').toString('utf8');
      } catch (_) {}
    }

    let body = {};
    if (rawBody) {
      try {
        body = JSON.parse(rawBody);
      } catch (_) {
        body = {};
      }
    }

    return {
      method,
      path: normalizePath(event.path || '/'),
      body,
      headers: lowercaseHeaders(event.headers || {}),
      query: event.queryStringParameters || {},
      raw: event,
    };
  }

  const action = String(event.action || '').replace(/^\/+/, '');
  return {
    method: 'POST',
    path: action ? `/${action}` : '/',
    body: event.body || {},
    headers: lowercaseHeaders(event.headers || {}),
    query: {},
    raw: event,
  };
}

function normalizePath(path) {
  if (!path) return '/';
  let p = String(path);
  if (!p.startsWith('/')) p = `/${p}`;
  const apiPrefix = `${getGameKey()}-api`;
  // HTTP 挂载路径可能是 cunkou-api（驼峰），GAME_KEY 归一化后是小写 pettower
  p = p.replace(new RegExp(`^/(?:${escapeRegExp(apiPrefix)})(?=/|$)`, 'i'), '');
  if (p === '') p = '/';
  if (p.length > 1 && p.endsWith('/')) p = p.slice(0, -1);
  return p;
}

function lowercaseHeaders(headers) {
  const out = {};
  for (const key of Object.keys(headers || {})) {
    out[key.toLowerCase()] = headers[key];
  }
  return out;
}

function httpError(status, code, message) {
  const err = new Error(message || code);
  err.status = status;
  err.code = code;
  return err;
}

function escapeRegExp(text) {
  return String(text).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

module.exports = {
  respond,
  preflight,
  parseEvent,
  httpError,
};
