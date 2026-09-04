/**
 * 存档：村民名单、进化、星级、村庄等级、四种资源、弹子、推图进度、布阵。
 *
 * 一条硬口径（§5）：**货币只有四种** —— 废铁 / 零件 / 工分 / 村庄经验。
 * 弹子是次数不是货币，所以它跟资源分开存，也不进货币条。
 * 想加第五种之前先回去看反目标第五条。
 *
 * 这一版把上一版的字段全换了（改装件、门路研发、难度阶梯、废品堆全部下线），
 * 所以老存档不迁移、直接重置：`REV` 不匹配就当新档。
 * 迁移的成本远高于收益 —— 上一版的养成对象（27 件破烂的星级）
 * 在这一版压根不存在，硬折算只会折出一个玩家看不懂的开局。
 */
import { SAVE_KEY } from '@/config/CloudConfig';
import { PersistService } from '@/core/PersistService';
import {
  PELLET_AD, PELLET_AD_DAILY, PELLET_CLEAR, PELLET_FIRST, PELLET_LOSE,
  SETTLE_SCRAP, creditPity, mulberry32, pelletCap, pelletRegenMin, shoot,
  type ShotResult,
} from '@/balance/stall';
import {
  CALL_COST, addVillageExp, clampVillageLv, evoOf, nextEvoCost,
  rollCall, squadCap, starsOf,
  type Progress,
} from '@/balance/village';
import {
  DEFAULT_SQUAD, STAR_MAX, VILLAGERS, VILLAGER_BY_ID,
} from '@/balance/villagers';
import { STAGE_COUNT, clampStage } from '@/balance/stages';
import { CELL_COUNT, LANE_COUNT } from '@/balance/combat';

const KEY = SAVE_KEY;

/** 存档格式版本。改字段就往上加一，老档直接重置 */
const REV = 3;

/** 战场上一个人的位置。存下来是为了下一关不用重排 */
export interface Slot {
  id: string;
  lane: number;
  cell: number;
}

export interface RunMemory {
  rev: number;

  /* ---- 养成 ---- */
  villageLv: number;
  villageExp: number;
  /** 已入伙的村民 id，按入伙顺序 */
  roster: string[];
  /** 每人几阶（1~3） */
  evo: Record<string, number>;
  /** 每人几颗星 */
  stars: Record<string, number>;
  scrap: number;
  parts: number;
  credits: number;

  /* ---- 弹弓摊 ---- */
  /** 手上还有几发 */
  pellets: number;
  /** 上次结算离线回弹的时刻 */
  pelletAtMs: number;
  /** 摊子的工分保底计数（离上次出工分过了几发） */
  stallPity: number;
  /** 今天摊子广告看了几次，以及那是哪一天 */
  adCount: number;
  adDay: string;

  /* ---- 推图 ---- */
  stageId: number;
  stageTop: number;
  /** 每关拿到过的最高星评 */
  stageStars: Record<number, number>;

  /* ---- 布阵 ---- */
  /** 上一次的排法。开下一关时直接铺上 */
  layout: Slot[];

  /* ---- 其他 ---- */
  /** 一共喊过几次人。前 4 次必出新人的保底靠它 */
  callCount: number;
  /** 见过的人，点亮图鉴用（含已经不在名单里的，虽然目前不会掉人） */
  seenIds: string[];
}

function empty(): RunMemory {
  return {
    rev: REV,
    villageLv: 1,
    villageExp: 0,
    roster: [...DEFAULT_SQUAD],
    evo: {},
    stars: {},
    scrap: 0,
    parts: 0,
    credits: 0,
    pellets: 6,
    pelletAtMs: Date.now(),
    stallPity: 0,
    adCount: 0,
    adDay: '',
    stageId: 1,
    stageTop: 1,
    stageStars: {},
    layout: [],
    callCount: 0,
    seenIds: [...DEFAULT_SQUAD],
  };
}

function validIds(raw: unknown, fallback: readonly string[]): string[] {
  if (!Array.isArray(raw)) return [...fallback];
  const out = raw.filter(
    (id): id is string => typeof id === 'string' && VILLAGER_BY_ID[id] !== undefined,
  );
  return out.length > 0 ? [...new Set(out)] : [...fallback];
}

function numMap(raw: unknown, lo: number, hi: number): Record<string, number> {
  const out: Record<string, number> = {};
  if (!raw || typeof raw !== 'object') return out;
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (!VILLAGER_BY_ID[k]) continue;
    const n = Math.floor(Number(v) || 0);
    if (n > lo) out[k] = Math.min(hi, n);
  }
  return out;
}

function validLayout(raw: unknown, roster: readonly string[]): Slot[] {
  if (!Array.isArray(raw)) return [];
  const owned = new Set(roster);
  const used = new Set<string>();
  const out: Slot[] = [];
  for (const r of raw) {
    const s = r as Partial<Slot>;
    if (typeof s.id !== 'string' || !owned.has(s.id)) continue;
    const lane = Math.floor(Number(s.lane) || 0);
    const cell = Math.floor(Number(s.cell) || 0);
    if (lane < 0 || lane >= LANE_COUNT || cell < 0 || cell >= CELL_COUNT) continue;
    const key = `${lane},${cell}`;
    if (used.has(key) || out.some((o) => o.id === s.id)) continue;
    used.add(key);
    out.push({ id: s.id, lane, cell });
  }
  return out;
}

export function loadMemory(): RunMemory {
  try {
    const raw = PersistService.readRaw(KEY);
    if (!raw) return empty();
    const p = JSON.parse(raw) as Partial<RunMemory>;
    // 上一版的存档字段这一版全没有，硬折算只会折出看不懂的开局
    if (Number(p.rev) !== REV) return empty();

    const roster = validIds(p.roster, DEFAULT_SQUAD);
    const stageTop = clampStage(p.stageTop);
    const mem: RunMemory = {
      rev: REV,
      villageLv: clampVillageLv(p.villageLv),
      villageExp: Math.max(0, Number(p.villageExp) || 0),
      roster,
      evo: numMap(p.evo, 1, 3),
      stars: numMap(p.stars, 0, STAR_MAX),
      scrap: Math.max(0, Number(p.scrap) || 0),
      parts: Math.max(0, Number(p.parts) || 0),
      credits: Math.max(0, Number(p.credits) || 0),
      pellets: Math.max(0, Number(p.pellets) || 0),
      pelletAtMs: Math.max(0, Number(p.pelletAtMs) || Date.now()),
      stallPity: Math.max(0, Number(p.stallPity) || 0),
      adCount: Math.max(0, Number(p.adCount) || 0),
      adDay: typeof p.adDay === 'string' ? p.adDay : '',
      stageTop,
      stageId: Math.min(clampStage(p.stageId), stageTop),
      stageStars: (() => {
        const out: Record<number, number> = {};
        const src = p.stageStars;
        if (src && typeof src === 'object') {
          for (const [k, v] of Object.entries(src as Record<string, unknown>)) {
            const id = Number(k);
            if (id >= 1 && id <= STAGE_COUNT) {
              out[id] = Math.max(0, Math.min(3, Math.floor(Number(v) || 0)));
            }
          }
        }
        return out;
      })(),
      layout: validLayout(p.layout, roster),
      callCount: Math.max(0, Number(p.callCount) || 0),
      seenIds: validIds(p.seenIds, roster),
    };
    return mem;
  } catch {
    return empty();
  }
}

function persist(next: RunMemory): RunMemory {
  const out = { ...next, rev: REV };
  try {
    PersistService.writeRaw(KEY, JSON.stringify(out));
  } catch {
    /* 模拟器偶发写失败，不挡继续玩 */
  }
  return out;
}

/** 存档摊成引擎和面板都能读的 Progress */
export function progressOf(mem: RunMemory): Progress {
  return {
    villageLv: mem.villageLv,
    villageExp: mem.villageExp,
    roster: mem.roster,
    evo: mem.evo,
    stars: mem.stars,
    scrap: mem.scrap,
    parts: mem.parts,
    credits: mem.credits,
  };
}

/** 这一局能上几个人 */
export function capOf(mem: RunMemory): number {
  return squadCap(mem.villageLv);
}


/* ---------------- 弹子 ---------------- */

/**
 * 把离线攒的弹子结算到现在。
 *
 * 只回到 pelletCap，不许越过 —— 弹子是次数，攒着不玩没有额外好处，
 * 这是「每天回来打一会儿」和「攒一周一次性刷完」之间的那道闸。
 */
export function settlePellets(nowMs: number = Date.now()): RunMemory {
  const prev = loadMemory();
  const cap = pelletCap(prev.villageLv);
  if (prev.pelletAtMs <= 0) return persist({ ...prev, pelletAtMs: nowMs });
  const perMs = pelletRegenMin(prev.villageLv) * 60_000;
  const gained = Math.floor((nowMs - prev.pelletAtMs) / perMs);
  if (gained <= 0) return prev;
  const pellets = Math.min(cap, prev.pellets + gained);
  return persist({
    ...prev,
    pellets,
    // 余数留着，别让频繁进出把零头抹掉
    pelletAtMs: prev.pelletAtMs + gained * perMs,
  });
}

/** 打一发。没弹子返回 undefined */
export function shootStall(nowMs: number = Date.now()): {
  mem: RunMemory;
  result: ShotResult;
} | undefined {
  const prev = settlePellets(nowMs);
  if (prev.pellets <= 0) return undefined;

  const rng = mulberry32((nowMs ^ (prev.pellets * 2654435761)) >>> 0);
  const { result, pityCount } = shoot(rng, prev.villageLv, prev.stallPity);

  const grown = addVillageExp(progressOf(prev), Math.round(result.gain.exp));
  const mem = persist({
    ...prev,
    pellets: prev.pellets - 1,
    stallPity: pityCount,
    scrap: prev.scrap + Math.round(result.gain.scrap),
    parts: prev.parts + Math.round(result.gain.parts),
    credits: prev.credits + Math.round(result.gain.credits),
    villageLv: grown.lv,
    villageExp: grown.exp,
  });
  return { mem, result };
}

/** 摊子今天还能看几条广告 */
export function stallAdLeft(nowMs: number = Date.now()): number {
  const mem = loadMemory();
  const today = new Date(nowMs).toDateString();
  if (mem.adDay !== today) return PELLET_AD_DAILY;
  return Math.max(0, PELLET_AD_DAILY - mem.adCount);
}

/** 看完广告白送弹子。日限满了返回 undefined */
export function claimAdPellets(nowMs: number = Date.now()): RunMemory | undefined {
  const prev = settlePellets(nowMs);
  const today = new Date(nowMs).toDateString();
  const count = prev.adDay === today ? prev.adCount : 0;
  if (count >= PELLET_AD_DAILY) return undefined;
  return persist({
    ...prev,
    // 广告给的弹子允许顶到上限之上，否则满仓时广告位就废了
    pellets: prev.pellets + PELLET_AD,
    adDay: today,
    adCount: count + 1,
  });
}

/* ---------------- 喊人 ---------------- */

/**
 * 花工分喊一嗓子。工分不够返回 undefined。
 *
 * 掷骰用的是 balance/village.rollCall —— 和模拟器同一份，
 * 所以护栏里「手上正好没有克制这一章的门路」那种处境测的是真逻辑。
 */
export function callVillager(nowMs: number = Date.now()): {
  mem: RunMemory;
  got: string;
  isNew: boolean;
  starTo?: string;
} | undefined {
  const prev = loadMemory();
  if (prev.credits < CALL_COST) return undefined;

  const count = prev.callCount + 1;
  const rng = mulberry32((nowMs ^ (count * 40503)) >>> 0);
  const res = rollCall(progressOf(prev), count, rng, VILLAGERS.map((v) => v.id), STAR_MAX);

  const roster = res.isNew ? [...prev.roster, res.id] : prev.roster;
  const seen = new Set(prev.seenIds);
  seen.add(res.id);
  const stars = { ...prev.stars };
  if (!res.isNew && res.starTo) {
    stars[res.starTo] = starsOf(progressOf(prev), res.starTo) + 1;
  }

  const mem = persist({
    ...prev,
    credits: prev.credits - CALL_COST,
    callCount: count,
    roster,
    stars,
    scrap: prev.scrap + res.scrap,
    seenIds: [...seen],
  });
  return { mem, got: res.id, isNew: res.isNew, starTo: res.starTo };
}

/* ---------------- 进化 ---------------- */

/** 喂一阶。材料不够或已经三阶返回 undefined */
export function buyEvo(id: string): RunMemory | undefined {
  const prev = loadMemory();
  if (!prev.roster.includes(id)) return undefined;
  const now = evoOf(progressOf(prev), id);
  const cost = nextEvoCost(now);
  if (!cost) return undefined;
  if (prev.scrap < cost.scrap || prev.parts < cost.parts) return undefined;
  return persist({
    ...prev,
    scrap: prev.scrap - cost.scrap,
    parts: prev.parts - cost.parts,
    evo: { ...prev.evo, [id]: now + 1 },
  });
}

/* ---------------- 推图 ---------------- */

/** 换一关打。只能选已经解锁到的 */
export function setStageId(id: number): RunMemory {
  const prev = loadMemory();
  return persist({ ...prev, stageId: Math.min(clampStage(id), prev.stageTop) });
}

/** 记下这一次的排法，下一关直接铺上 */
export function saveLayout(layout: readonly Slot[]): RunMemory {
  const prev = loadMemory();
  return persist({ ...prev, layout: validLayout([...layout], prev.roster) });
}

/**
 * 打完一关。赢了解锁下一关、记最高星评，输赢都给弹子。
 *
 * 输了也给一发（PELLET_LOSE）：空手回村会让人干脆不打第二次，
 * 而这一版的失败是「漏怪」，玩家本来就知道自己差在哪儿，不需要再罚一次。
 */
export function settleStage(
  stageId: number,
  won: boolean,
  stars: number,
): { mem: RunMemory; pellets: number; scrap: number } {
  const prev = loadMemory();
  const id = clampStage(stageId);
  const first = won && !prev.stageStars[id];

  const pellets = won
    ? PELLET_CLEAR + (first ? PELLET_FIRST : 0)
    : PELLET_LOSE;
  const scrap = won ? SETTLE_SCRAP : 0;

  const stageTop = won ? Math.min(STAGE_COUNT, Math.max(prev.stageTop, id + 1)) : prev.stageTop;
  const best = Math.max(prev.stageStars[id] ?? 0, won ? stars : 0);

  const mem = persist({
    ...prev,
    pellets: prev.pellets + pellets,
    scrap: prev.scrap + scrap,
    stageTop,
    stageId: won ? Math.min(stageTop, id + 1) : id,
    stageStars: { ...prev.stageStars, [id]: best },
  });
  return { mem, pellets, scrap };
}

/** 一共拿了多少颗星。图鉴和进度条用 */
export function totalStars(mem: RunMemory): number {
  return Object.values(mem.stageStars).reduce((a, b) => a + b, 0);
}

/** GM：把目标关写进进度。不改资源 */
export function gmUnlockToStage(id: number): RunMemory {
  const prev = loadMemory();
  const want = clampStage(id);
  return persist({
    ...prev,
    stageTop: Math.max(prev.stageTop, want),
    stageId: want,
  });
}

/** GM：白给资源，用来试后期的养成 */
export function gmGrant(add: Partial<Pick<RunMemory,
  'scrap' | 'parts' | 'credits' | 'pellets'>>): RunMemory {
  const prev = loadMemory();
  return persist({
    ...prev,
    scrap: prev.scrap + (add.scrap ?? 0),
    parts: prev.parts + (add.parts ?? 0),
    credits: prev.credits + (add.credits ?? 0),
    pellets: prev.pellets + (add.pellets ?? 0),
  });
}

/** 摊子的工分保底还差几发。面板上要显示，否则保底等于不存在 */
export function stallPityLeft(mem: RunMemory): number {
  return Math.max(0, creditPity(mem.villageLv) - mem.stallPity);
}

/** 结算广告翻倍补的那一笔。只加废铁，不碰其他资源 */
export function addScrap(amount: number): RunMemory {
  const prev = loadMemory();
  return persist({ ...prev, scrap: prev.scrap + Math.max(0, Math.floor(amount)) });
}
