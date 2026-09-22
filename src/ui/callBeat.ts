import { CALL_DUP_SCRAP } from '@/balance/village';
import { VILLAGERS, getVillager } from '@/balance/villagers';

export type CallKind = 'join' | 'star' | 'scrap';

export interface CallBeat {
  kind: CallKind;
  /** 牌顶：王大锤入伙了 / 又来一个王大锤 */
  title: string;
  name: string;
  /** 别人替不了的活 */
  job: string;
  sub: string;
  ok: string;
}

/**
 * 喊人揭晓文案。不是稀有度，是人到了村口。
 * 重复来的按 §4.3：捎了东西，不说碎片。
 */
export function callBeat(
  got: string,
  isNew: boolean,
  starTo: string | undefined,
  rosterN: number,
  poolN = VILLAGERS.length,
  /** 这颗星正好换了形态时传新形态名。换形态归星管，这块牌是它唯一的报喜口 */
  starForm?: string,
): CallBeat {
  const v = getVillager(got);
  if (isNew) {
    return {
      kind: 'join',
      title: `${v.name}入伙了`,
      name: v.name,
      job: v.job,
      sub: `${rosterN}/${poolN} 人 · 从村道那边过来`,
      ok: '好',
    };
  }
  if (starTo) {
    const to = getVillager(starTo);
    return {
      kind: 'star',
      title: `又来一个${v.name}`,
      name: v.name,
      job: v.job,
      sub: starForm
        ? `${to.name}多一颗星，焊成了「${starForm}」`
        : `捎了废铁 · ${to.name} 多一颗星`,
      ok: '好',
    };
  }
  return {
    kind: 'scrap',
    title: `又来一个${v.name}`,
    name: v.name,
    job: v.job,
    sub: `人满星了 · 折了 ${CALL_DUP_SCRAP} 废铁`,
    ok: '好',
  };
}
