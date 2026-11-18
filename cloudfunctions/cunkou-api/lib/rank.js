const { httpError } = require('./http');
const { requireUser } = require('./auth');
const { getApp } = require('./db');
const { getCollectionName } = require('./config');

/**
 * 排行榜（集合 cunkou_rank，一人一条，按 userId 唯一）：
 * - board = "stage"：按 stageScore（cleared * 1000 + stars）降序、同分按先达成在前
 * - board = "power"：按 power 降序、同分按先达成在前
 * - 支持点赞互动（/rank/like）
 */

const LIST_LIMIT = 50;
const MAX_STAGE = 200;
const MAX_POWER = 99999999;

function db() {
  return getApp().database();
}

function cleanName(n) {
  const v = Array.from(String(n || '').replace(/[\u0000-\u001f<>]/g, '').trim()).slice(0, 12).join('');
  return v || '热心村民';
}

function cleanAvatar(u) {
  const v = String(u || '').trim();
  if (!/^https:\/\/\S{8,2000}$/.test(v)) return '';
  return v;
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

  const col = db().collection(getCollectionName('rank', platform));
  const prev = await findMine(col, userId);
  const now = Date.now();
  // 若主线分数与战力均未提高，保留原先达成时间戳，保证先通关者排前
  const prevStage = (prev && Number(prev.stageScore)) || 0;
  const prevPower = (prev && Number(prev.power)) || 0;
  const stageAt = stageScore > prevStage ? now : ((prev && Number(prev.stageAt)) || now);
  const powerAt = power > prevPower ? now : ((prev && Number(prev.powerAt)) || now);

  const doc = {
    userId,
    name: cleanName(body.name),
    avatar: cleanAvatar(body.avatar) || (prev && cleanAvatar(prev.avatar)) || '',
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
}

async function handleRankList(req) {
  const { userId, platform } = requireUser(req);
  const body = req.body || {};
  const board = String(body.board || 'stage') === 'power' ? 'power' : 'stage';
  const scoreField = board === 'power' ? 'power' : 'stageScore';
  const timeField = board === 'power' ? 'powerAt' : 'stageAt';

  const col = db().collection(getCollectionName('rank', platform));
  const _ = db().command;

  const topRes = await col
    .orderBy(scoreField, 'desc')
    .orderBy(timeField, 'asc')
    .limit(LIST_LIMIT)
    .get();

  const rawRows = (topRes && Array.isArray(topRes.data)) ? topRes.data : [];
  const top = rawRows.map((r) => ({
    userId: String(r.userId || ''),
    name: cleanName(r.name),
    avatar: cleanAvatar(r.avatar),
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
      const myTime = Number(me[timeField]) || 0;
      const higher = await col.where({ [scoreField]: _.gt(myScore) }).count();
      const earlier = await col.where({ [scoreField]: myScore, [timeField]: _.lt(myTime) }).count();
      rank = ((higher && higher.total) || 0) + ((earlier && earlier.total) || 0) + 1;
    }
  }
  const count = await col.count();
  return {
    board,
    top,
    rank,
    total: (count && count.total) || 0,
  };
}

async function handleRankLike(req) {
  const { platform } = requireUser(req);
  const body = req.body || {};
  const targetId = String(body.targetId || '').trim().slice(0, 80);
  if (!targetId) return { ok: true, likes: 0 };
  const col = db().collection(getCollectionName('rank', platform));
  const _ = db().command;
  const row = await findMine(col, targetId);
  if (!row || !row._id) return { ok: true, likes: 0 };
  await col.doc(row._id).update({ likes: _.inc(1) });
  return { ok: true, likes: (Number(row.likes) || 0) + 1 };
}

module.exports = {
  handleRankSubmit,
  handleRankList,
  handleRankLike,
};
