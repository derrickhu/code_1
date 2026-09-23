/**
 * 村子升了一级，玩家能指着说出来的那几件事。
 *
 * 每级都有下手、抗造 +3%。除此以外只报「这一下新出现的」：
 * 多带一个人、摊上新挂的靶、弹子能多存、工分更勤、料变多。
 * 不报已经有的东西。
 */
import {
  creditPity, pelletCap, targetLockUse, TARGETS, TARGET_UNLOCK_LV,
} from '@/balance/stall';
import {
  squadCap, VILLAGE_STEP_PCT, VILLAGE_LV_TUNED, yieldMul,
} from '@/balance/village';

const TARGET_NAME: Readonly<Record<string, string>> = {
  crate: '蓝筐',
  basin: '铁盆',
  horn: '喇叭',
};

export interface VillageRiseTarget {
  id: string;
  name: string;
  /** 打中得到什么，跟摊上锁着时写的是同一句 */
  use: string;
}

export interface VillageRise {
  from: number;
  to: number;
  /** 这一跳下手、抗造一共加了多少个百分点 */
  statPct: number;
  cap?: { from: number; to: number };
  targets: VillageRiseTarget[];
  /** 弹子上限、工分保底、产出变多。没有就不写 */
  notes: string[];
}

/** 从 from 升到 to（不含 from）。没升返回 undefined */
export function villageRise(from: number, to: number): VillageRise | undefined {
  const a = Math.floor(from);
  const b = Math.floor(to);
  if (!(b > a)) return undefined;

  const capFrom = squadCap(a);
  const capTo = squadCap(b);
  const targets: VillageRiseTarget[] = [];
  for (const def of TARGETS) {
    const at = TARGET_UNLOCK_LV[def.id] ?? 1;
    const use = targetLockUse(def.id);
    if (!use || at <= a || at > b) continue;
    targets.push({ id: def.id, name: TARGET_NAME[def.id] ?? def.name, use });
  }

  const notes: string[] = [];
  if (pelletCap(b) > pelletCap(a)) notes.push(`弹子能存 ${pelletCap(b)} 发`);
  if (creditPity(b) < creditPity(a)) notes.push('工分来得更勤');
  if (b > VILLAGE_LV_TUNED && a <= VILLAGE_LV_TUNED && yieldMul(b) > yieldMul(a)) {
    notes.push('摊子和过关带回来的料变多了');
  }

  return {
    from: a,
    to: b,
    statPct: (b - a) * VILLAGE_STEP_PCT,
    cap: capTo > capFrom ? { from: capFrom, to: capTo } : undefined,
    targets,
    notes,
  };
}

/** 牌子上的行。第一行永远是全员变硬，后面才是这一级新开的东西 */
export function villageRiseLines(rise: VillageRise): string[] {
  const lines = [`下手、抗造 +${rise.statPct}%`];
  if (rise.cap) lines.push(`出村能带 ${rise.cap.to} 人`);
  for (const t of rise.targets) lines.push(`摊上挂上${t.name}，${t.use}`);
  for (const n of rise.notes) lines.push(n);
  return lines;
}
