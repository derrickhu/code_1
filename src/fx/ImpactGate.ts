/**
 * 落点门闩。引擎先结算伤害，观战层后飞弹。
 * 打在目标上的爆、死、飘字必须等这扇门打开，不能跟弹道抢先。
 */
export type ImpactKey = `e:${number}` | `h:${string}`;

export function enemyImpactKey(id: number): ImpactKey {
  return `e:${id}`;
}

export function heroImpactKey(id: string): ImpactKey {
  return `h:${id}`;
}

export class ImpactGate {
  private readonly inbound = new Map<ImpactKey, number>();
  private readonly delayed = new Map<ImpactKey, (() => void)[]>();
  private readonly linger = new Set<ImpactKey>();
  /** 已经见底倒下：后面几发不再把尸体钉在场上 */
  private readonly gone = new Set<ImpactKey>();

  begin(key: ImpactKey): void {
    this.inbound.set(key, (this.inbound.get(key) ?? 0) + 1);
  }

  /** 还有弹没落到这个目标上，或刚倒下还在淡出 */
  holding(key: ImpactKey): boolean {
    if (this.gone.has(key)) return this.linger.has(key);
    return (this.inbound.get(key) ?? 0) > 0 || this.linger.has(key);
  }

  /** 弹还在路上：挂起。已经打上了 / 已经倒下：立刻 false，调用方自己放 */
  defer(key: ImpactKey, fn: () => void): boolean {
    if (this.gone.has(key)) return false;
    if ((this.inbound.get(key) ?? 0) <= 0) return false;
    const list = this.delayed.get(key) ?? [];
    list.push(fn);
    this.delayed.set(key, list);
    return true;
  }

  /** 这一发落地。最后一发才交出挂起的死亡 / 掉废品 */
  settle(key: ImpactKey): (() => void)[] {
    const next = (this.inbound.get(key) ?? 1) - 1;
    if (next > 0) {
      this.inbound.set(key, next);
      return [];
    }
    this.inbound.delete(key);
    return this.takeDelayed(key);
  }

  /** 画面血已经见底：死可以放了，不必等后面几发 */
  release(key: ImpactKey): (() => void)[] {
    this.gone.add(key);
    return this.takeDelayed(key);
  }

  markLinger(key: ImpactKey): void {
    this.linger.add(key);
  }

  clearLinger(key: ImpactKey): void {
    this.linger.delete(key);
  }

  reset(): void {
    this.inbound.clear();
    this.delayed.clear();
    this.linger.clear();
    this.gone.clear();
  }

  private takeDelayed(key: ImpactKey): (() => void)[] {
    const extra = this.delayed.get(key) ?? [];
    this.delayed.delete(key);
    return extra;
  }
}
