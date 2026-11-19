const { httpError } = require('./http');
const { requireUser } = require('./auth');
const { getApp } = require('./db');
const { getCollectionName } = require('./config');

/**
 * 排行榜（集合 cunkou_rank / cunkou_tt_rank，一人一条，按 userId 唯一）：
 * - board = "stage"：按 stageScore（cleared * 1000 + stars）降序、同分按先达成在前
 * - board = "power"：按 power 降序、同分按先达成在前
 * - 支持微信真实头像（https://thirdwx.qlogo.cn / wx.qlogo.cn 等）与昵称、性别同步
 * - 支持点赞互动（/rank/like）
 * - 首次访问若集合尚未创建，自动 createCollection 兜底
 */

const LIST_LIMIT = 50;
const MAX_STAGE = 200;
const MAX_POWER = 99999999;

function db() {
  return getApp().database();
}

function isCollectionMissingError(err) {
  if (!err) return false;
  const msg = String(err.message || err.errMsg || '');
  const code = err.code || err.errCode;
  return (
    code === 'DATABASE_COLLECTION_NOT_EXIST' ||
    code === -502005 ||
    msg.includes('DATABASE_COLLECTION_NOT_EXIST') ||
    msg.includes('Db or Table not exist') ||
    msg.includes('collection not exists')
  );
}

async function withCollection(colName, fn) {
  const database = db();
  try {
    return await fn(database.collection(colName), database);
  } catch (err) {
    if (isCollectionMissingError(err) && typeof database.createCollection === 'function') {
      try {
        await database.createCollection(colName);
      } catch (_) {}
      return await fn(database.collection(colName), database);
    }
    throw err;
  }
}

function cleanName(n) {
  const v = Array.from(String(n || '').replace(/[\u0000-\u001f<>]/g, '').trim()).slice(0, 16).join('');
  return v || '热心村民';
}

function isDefaultGeneratedName(n) {
  return /^幸福村·\d{4}$/.test(String(n || '').trim());
}

function cleanAvatar(u) {
  let v = String(u || '').trim();
  if (v.startsWith('http://thirdwx.qlogo.cn/') || v.startsWith('http://wx.qlogo.cn/') || v.startsWith('http://mmbiz.qpic.cn/')) {
    v = 'https://' + v.slice('http://'.length);
  }
  if (!/^https:\/\/\S{8,2000}$/.test(v)) return '';
  return v;
}

function cleanGender(g) {
  const n = Math.floor(Number(g) || 0);
  return n === 1 || n === 2 ? n : 0;
}

function cleanLineup(raw) {
  if (!Array.isArray(raw)) return [];
  return raw.slice(0, 4).map((x) => Math.max(0, Math.min(64, Math.floor(Number(x) || 0))));
}

async function findMine(col, userId) {
  const res = await col.where({ userId }).limit(1).get();
  return res && Array.isArray(res.data) ? res.data[0] : null;
}

async function handleRankSubmit(req) {
  const { userId, platform } = requireUser(req);
  const body = req.body || {};
  const cleared = Math.max(0, Math.min(MAX_STAGE, Math.floor(Number(body.cleared) || 0)));
  const stars = Math.max(0, Math.min(MAX_STAGE * 3, Math.floor(Number(body.stars) || 0)));
  const power = Math.max(0, Math.min(MAX_POWER, Math.floor(Number(body.power) || 0)));
  const hero = Math.max(0, Math.min(64, Math.floor(Number(body.hero) || 0)));
  const lordLv = Math.max(1, Math.min(200, Math.floor(Number(body.lordLv) || 1)));
  const equipSum = Math.max(0, Math.min(2000, Math.floor(Number(body.equipSum) || 0)));
  const stageScore = cleared * 1000 + stars;
  const colName = getCollectionName('rank', platform);

  return await withCollection(colName, async (col) => {
    const prev = await findMine(col, userId);
    const now = Date.now();
    const prevStage = (prev && Number(prev.stageScore)) || 0;
    const prevPower = (prev && Number(prev.power)) || 0;
    const stageAt = stageScore > prevStage ? now : ((prev && Number(prev.stageAt)) || now);
    const powerAt = power > prevPower ? now : ((prev && Number(prev.powerAt)) || now);

    const incomingName = cleanName(body.name);
    const prevName = prev && prev.name ? cleanName(prev.name) : '';
    const finalName = (prevName && !isDefaultGeneratedName(prevName) && isDefaultGeneratedName(incomingName))
      ? prevName
      : incomingName;

    const incomingAvatar = cleanAvatar(body.avatar);
    const prevAvatar = prev ? cleanAvatar(prev.avatar) : '';
    const incomingGender = cleanGender(body.gender);
    const prevGender = prev ? cleanGender(prev.gender) : 0;

    const doc = {
      userId,
      name: finalName,
      avatar: incomingAvatar || prevAvatar || '',
      gender: incomingGender || prevGender || 0,
      cleared: Math.max(cleared, (prev && Number(prev.cleared)) || 0),
      stars: Math.max(stars, (prev && Number(prev.stars)) || 0),
      stageScore: Math.max(stageScore, prevStage),
      power: Math.max(power, prevPower),
      hero,
      lordLv,
      equipSum,
      lineup: cleanLineup(body.lineup),
      lineupLv: cleanLineup(body.lineupLv),
      likes: Math.max(0, Number(prev && prev.likes) || 0),
      stageAt,
      powerAt,
      updatedAt: now,
    };

    if (prev && prev._id) await col.doc(prev._id).update(doc);
    else await col.add(doc);
    return { ok: true };
  });
}

async function handleRankList(req) {
  const { userId, platform } = requireUser(req);
  const body = req.body || {};
  const board = String(body.board || 'stage') === 'power' ? 'power' : 'stage';
  const scoreField = board === 'power' ? 'power' : 'stageScore';
  const timeField = board === 'power' ? 'powerAt' : 'stageAt';
  const colName = getCollectionName('rank', platform);

  return await withCollection(colName, async (col, database) => {
    const _ = database.command;
    let rawRows = [];
    try {
      const topRes = await col
        .orderBy(scoreField, 'desc')
        .orderBy(timeField, 'asc')
        .limit(LIST_LIMIT)
        .get();
      rawRows = (topRes && Array.isArray(topRes.data)) ? topRes.data : [];
    } catch (_) {
      // 若数据库未建复合索引，退化为单字段降序拉前 100 名后内存按达成时间升序稳定排序
      const fallbackRes = await col
        .orderBy(scoreField, 'desc')
        .limit(100)
        .get();
      rawRows = (fallbackRes && Array.isArray(fallbackRes.data)) ? fallbackRes.data : [];
      rawRows.sort((a, b) => {
        const ds = (Number(b[scoreField]) || 0) - (Number(a[scoreField]) || 0);
        if (ds !== 0) return ds;
        return (Number(a[timeField]) || 0) - (Number(b[timeField]) || 0);
      });
      rawRows = rawRows.slice(0, LIST_LIMIT);
    }

    const top = rawRows.map((r) => ({
      userId: String(r.userId || ''),
      name: cleanName(r.name),
      avatar: cleanAvatar(r.avatar),
      gender: cleanGender(r.gender),
      cleared: Number(r.cleared) || 0,
      stars: Number(r.stars) || 0,
      power: Number(r.power) || 0,
      hero: Number(r.hero) || 0,
      lordLv: Number(r.lordLv) || 1,
      equipSum: Number(r.equipSum) || 0,
      lineup: Array.isArray(r.lineup) ? r.lineup : [],
      lineupLv: Array.isArray(r.lineupLv) ? r.lineupLv : [],
      likes: Math.max(0, Number(r.likes) || 0),
      me: r.userId === userId,
    }));

    let rank = 0;
    const me = await findMine(col, userId);
    if (me) {
      const at = top.findIndex((r) => r.me);
      if (at >= 0) {
        rank = at + 1;
      } else {
        const myScore = Number(me[scoreField]) || 0;
        const higher = await col.where({ [scoreField]: _.gt(myScore) }).count();
        rank = ((higher && higher.total) || 0) + 1;
      }
    }
    const count = await col.count();
    return {
      board,
      top,
      rank,
      total: (count && count.total) || 0,
    };
  });
}

async function handleRankLike(req) {
  const { platform } = requireUser(req);
  const body = req.body || {};
  const targetId = String(body.targetId || '').trim().slice(0, 80);
  if (!targetId) return { ok: true, likes: 0 };
  const colName = getCollectionName('rank', platform);
  return await withCollection(colName, async (col, database) => {
    const _ = database.command;
    const row = await findMine(col, targetId);
    if (!row || !row._id) return { ok: true, likes: 0 };
    await col.doc(row._id).update({ likes: _.inc(1) });
    return { ok: true, likes: (Number(row.likes) || 0) + 1 };
  });
}

module.exports = {
  handleRankSubmit,
  handleRankList,
  handleRankLike,
};
