const { handleLogin } = require('./lib/auth');
const { handlePull, handlePush } = require('./lib/save');
const { respond, parseEvent, preflight } = require('./lib/http');
const { getGameKey, getScopedGameKey } = require('./lib/config');

const ROUTES = {
  'GET /health': async () => ({
    ok: true,
    gameKey: getGameKey(),
    scopedGameKeys: { wx: getScopedGameKey('wx'), dy: getScopedGameKey('dy'), tap: getScopedGameKey('tap') },
    ts: Date.now(),
  }),
  'POST /health': async () => ({
    ok: true,
    gameKey: getGameKey(),
    scopedGameKeys: { wx: getScopedGameKey('wx'), dy: getScopedGameKey('dy'), tap: getScopedGameKey('tap') },
    ts: Date.now(),
  }),
  'POST /login': handleLogin,
  'POST /save/pull': handlePull,
  'POST /save/push': handlePush,
};

exports.main = async (event, context) => {
  try {
    if (event && event.httpMethod === 'OPTIONS') {
      return preflight();
    }

    const req = parseEvent(event);
    const key = `${req.method} ${req.path}`;
    const handler = ROUTES[key];
    if (!handler) {
      return respond(404, { ok: false, code: 'NOT_FOUND', error: `no route: ${key}` });
    }

    const result = await handler(req, context);
    if (result && typeof result === 'object' && 'statusCode' in result) {
      return result;
    }
    return respond(200, { ok: true, data: result });
  } catch (error) {
    const code = error && error.code ? error.code : 'INTERNAL';
    const status = error && error.status ? error.status : 500;
    const message = (error && error.message) || String(error);
    console.error('[cunkou-api] error:', code, message, error && error.stack);
    const out = { ok: false, code, error: message };
    if (error && error.data !== undefined) {
      out.data = error.data;
    }
    return respond(status, out);
  }
};
