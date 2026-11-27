/**
 * 微信游戏圈数据解密：客户端调用 wx.getGameClubData 一次拉取
 *   type 1: 加入游戏圈时间（秒级时间戳，>0 即已入圈）
 *   type 4: 当天(自然日)点赞帖子数
 *   type 5: 当天(自然日)评论帖子数
 *   type 6: 当天(自然日)发表帖子数
 * 用登录时存下的 session_key 解密后返回给客户端，累计与领奖随存档结算。
 *
 * 集合：cunkou_wxSessions（userId 唯一索引）
 */

const crypto = require('crypto');
const { httpError } = require('./http');
const { getApp } = require('./db');
const { getCollectionName } = require('./config');

const TYPE_JOIN_TIME = 1;
const TYPE_DAY_LIKES = 4;
const TYPE_DAY_COMMENTS = 5;
const TYPE_DAY_POSTS = 6;

function getSessionCollection() {
  return getApp().database().collection(getCollectionName('wxSessions', 'wx'));
}

async function upsertWxSession(userId, sessionKey) {
  if (!sessionKey) return;
  const col = getSessionCollection();
  const now = Date.now();
  const res = await col.where({ userId }).limit(1).get();
  const existing = (res && Array.isArray(res.data) && res.data[0]) || null;
  if (existing && existing._id) {
    await col.doc(existing._id).update({ sessionKey, updatedAt: now });
    return;
  }
  await col.add({ userId, sessionKey, updatedAt: now });
}

async function readWxSessionKey(userId) {
  const res = await getSessionCollection().where({ userId }).limit(1).get();
  const doc = (res && Array.isArray(res.data) && res.data[0]) || null;
  return doc && typeof doc.sessionKey === 'string' ? doc.sessionKey : '';
}

function decrypt(sessionKey, encryptedData, iv) {
  try {
    const decipher = crypto.createDecipheriv(
      'aes-128-cbc',
      Buffer.from(sessionKey, 'base64'),
      Buffer.from(iv, 'base64'),
    );
    decipher.setAutoPadding(true);
    const text = Buffer.concat([
      decipher.update(Buffer.from(encryptedData, 'base64')),
      decipher.final(),
    ]).toString('utf8');
    return JSON.parse(text);
  } catch (error) {
    throw httpError(400, 'DECRYPT_FAIL', (error && error.message) || '游戏圈数据解密失败');
  }
}

function typeOf(entry) {
  const t = entry && entry.dataType;
  return typeof t === 'number' ? t : Number((t && t.type) || 0);
}

function intVal(list, targetType) {
  const item = list.find((entry) => typeOf(entry) === targetType);
  const n = Number(item && item.value);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
}

async function handleGameClubSync(req) {
  const { requireUser } = require('./auth');
  const { userId, platform } = requireUser(req);
  if (platform !== 'wx') throw httpError(400, 'NOT_WX', '游戏圈只在微信里可用');
  const body = req.body || {};
  const encryptedData = String(body.encryptedData || '').trim();
  const iv = String(body.iv || '').trim();
  if (!encryptedData || !iv) throw httpError(400, 'BAD_GAME_CLUB_PAYLOAD', 'encryptedData / iv 缺失');
  const sessionKey = await readWxSessionKey(userId);
  if (!sessionKey) throw httpError(400, 'NO_WX_SESSION', '微信 session 未就绪，请重新登录');
  const data = decrypt(sessionKey, encryptedData, iv);
  const list = Array.isArray(data && data.dataList) ? data.dataList : [];
  const joinTime = intVal(list, TYPE_JOIN_TIME);
  return {
    joined: joinTime > 0,
    joinTime,
    dayLikes: intVal(list, TYPE_DAY_LIKES),
    dayComments: intVal(list, TYPE_DAY_COMMENTS),
    dayPosts: intVal(list, TYPE_DAY_POSTS),
  };
}

module.exports = {
  upsertWxSession,
  handleGameClubSync,
};
