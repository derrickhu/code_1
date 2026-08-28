const { httpError } = require('./http');
const { requireUser } = require('./auth');
const { getCollection } = require('./db');
const { getMaxBytes } = require('./config');

function isCollectionNotExistError(error) {
  const msg = String((error && error.message) || error || '');
  return /collection not exist|DATABASE_COLLECTION_NOT_EXIST|ResourceNotFound|Db or Table not exist/i.test(msg);
}

function emptyPullResult(userId, platform) {
  return {
    userId,
    platform,
    exists: false,
    schemaVersion: 0,
    updatedAt: 0,
    payload: {},
    payloadKeys: [],
  };
}

async function handlePull(req) {
  const { userId, platform } = requireUser(req);
  const col = getCollection(platform);
  let res;
  try {
    res = await col.where({ userId }).limit(1).get();
  } catch (error) {
    if (isCollectionNotExistError(error)) {
      return emptyPullResult(userId, platform);
    }
    throw error;
  }
  const doc = (res && Array.isArray(res.data) && res.data[0]) || null;
  if (!doc) {
    return {
      userId,
      platform,
      exists: false,
      schemaVersion: 0,
      updatedAt: 0,
      payload: {},
      payloadKeys: [],
    };
  }
  return {
    userId,
    platform,
    exists: true,
    schemaVersion: doc.schemaVersion || 0,
    updatedAt: doc.updatedAt || 0,
    payload: doc.payload || {},
    payloadKeys: Array.isArray(doc.payloadKeys) ? doc.payloadKeys : Object.keys(doc.payload || {}),
    clientFingerprint: doc.clientFingerprint || '',
  };
}

async function handlePush(req) {
  const { userId, platform } = requireUser(req);
  const body = req.body || {};
  const schemaVersion = Number(body.schemaVersion);
  const updatedAt = Number(body.updatedAt);
  const baseRemoteUpdatedAt = Number(body.baseRemoteUpdatedAt || 0);
  const payload = body.payload;
  const clientFingerprint = String(body.clientFingerprint || '').slice(0, 200);
  const force = body.force === true;

  if (!Number.isFinite(schemaVersion) || schemaVersion <= 0) {
    throw httpError(400, 'BAD_SCHEMA', 'schemaVersion 非法');
  }
  if (!Number.isFinite(updatedAt) || updatedAt <= 0) {
    throw httpError(400, 'BAD_UPDATED_AT', 'updatedAt 非法');
  }
  if (!Number.isFinite(baseRemoteUpdatedAt) || baseRemoteUpdatedAt < 0) {
    throw httpError(400, 'BAD_BASE_REMOTE_UPDATED_AT', 'baseRemoteUpdatedAt 非法');
  }
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw httpError(400, 'BAD_PAYLOAD', 'payload 必须是 object');
  }

  const size = Buffer.byteLength(JSON.stringify(payload), 'utf8');
  const maxBytes = getMaxBytes();
  if (size > maxBytes) {
    throw httpError(413, 'PAYLOAD_TOO_LARGE', `payload 超限: ${size}B > ${maxBytes}B`);
  }

  const payloadKeys = [];
  for (const key of Object.keys(payload)) {
    if (typeof payload[key] !== 'string') {
      throw httpError(400, 'BAD_PAYLOAD_VALUE', `payload[${key}] 必须是字符串`);
    }
    payloadKeys.push(key);
  }

  const col = getCollection(platform);
  let existing = null;
  try {
    const existingRes = await col.where({ userId }).limit(1).get();
    existing = (existingRes && Array.isArray(existingRes.data) && existingRes.data[0]) || null;
  } catch (error) {
    if (!isCollectionNotExistError(error)) {
      throw error;
    }
  }
  if (existing && !force) {
    const prevUpdatedAt = Number(existing.updatedAt) || 0;
    if (updatedAt < prevUpdatedAt || baseRemoteUpdatedAt < prevUpdatedAt) {
      throw Object.assign(
        httpError(409, 'STALE_UPDATE', `服务端已有更新版本 remote=${prevUpdatedAt} > local=${updatedAt}, base=${baseRemoteUpdatedAt}`),
        {
          data: {
            remote: {
              schemaVersion: existing.schemaVersion || 0,
              updatedAt: prevUpdatedAt,
              payload: existing.payload || {},
              payloadKeys: Array.isArray(existing.payloadKeys)
                ? existing.payloadKeys
                : Object.keys(existing.payload || {}),
            },
          },
        },
      );
    }
  }

  const now = Date.now();
  const docData = {
    userId,
    platform,
    schemaVersion,
    updatedAt,
    baseRemoteUpdatedAt,
    clientFingerprint,
    payload,
    payloadKeys,
    lastWriteAt: now,
  };

  if (existing && existing._id) {
    await col.doc(existing._id).update(docData);
    return { userId, updatedAt, savedAt: now, mode: 'update', sizeBytes: size };
  }

  const addRes = await col.add(docData);
  return {
    userId,
    updatedAt,
    savedAt: now,
    mode: 'insert',
    sizeBytes: size,
    _id: addRes && (addRes.id || addRes._id),
  };
}

module.exports = {
  handlePull,
  handlePush,
};
