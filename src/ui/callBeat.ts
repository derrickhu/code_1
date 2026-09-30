import { CALL_DUP_SCRAP } from '@/balance/village';
import { VILLAGERS, getVillager } from '@/balance/villagers';

export type CallKind = 'join' | 'star' | 'scrap';

export interface CallBeat {
  kind: CallKind;
  /** 牌顶：王大锤来了 / 王大锤添了一颗星 */
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
      title: `${v.name}来了`,
      name: v.name,
      job: v.job,
      sub: `${rosterN}/${poolN} 人 · 从村道那边过来`,
      ok: '好',
    };
  }
  if (starTo) {
    const to = getVillager(starTo);
    const gained = starForm
      ? `${to.name}添了一颗星，换成了「${starForm}」`
      : `${to.name}添了一颗星，还捎来废铁`;
    return {
      kind: 'star',
      title: to.id === v.id ? `${to.name}添了一颗星` : `又来一个${v.name}`,
      name: v.name,
      job: v.job,
      sub: to.id === v.id
        ? (starForm ? `换成了「${starForm}」` : '还捎来废铁')
        : gained,
      ok: '好',
    };
  }
  return {
    kind: 'scrap',
    title: `${v.name}又来了`,
    name: v.name,
    job: v.job,
    sub: `捎来 ${CALL_DUP_SCRAP} 废铁`,
    ok: '好',
  };
}
