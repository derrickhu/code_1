/**
 * 画面上的血 / 壳。引擎先结算，观战层后飞弹，
 * 条必须跟弹着点走，不能出手的那一帧就掉。
 */
export interface ShownVitals {
  hp: number;
  extra: number;
}

export class VisualVitals {
  private readonly _shown = new Map<string, ShownVitals>();

  reset(): void {
    this._shown.clear();
  }

  seed(key: string, hp: number, extra: number, force = false): void {
    if (force || !this._shown.has(key)) {
      this._shown.set(key, { hp, extra });
    }
  }

  shown(key: string, fallback: ShownVitals): ShownVitals {
    return this._shown.get(key) ?? fallback;
  }

  drop(key: string): void {
    this._shown.delete(key);
  }

  /** 这一发真正打上：壳先吃，再扣血。dmg 已是引擎算过的生效量 */
  landEnemy(key: string, dmg: number): void {
    const v = this._shown.get(key);
    if (!v) return;
    if (v.extra <= 0) {
      v.hp = Math.max(0, v.hp - dmg);
      return;
    }
    const toShell = Math.min(v.extra, dmg);
    v.extra -= toShell;
    v.hp = Math.max(0, v.hp - (dmg - toShell));
  }

  landHero(key: string, through: number, absorbed: number): void {
    const v = this._shown.get(key);
    if (!v) return;
    v.extra = Math.max(0, v.extra - absorbed);
    v.hp = Math.max(0, v.hp - through);
  }

  healHero(key: string, amount: number, maxHp: number): void {
    const v = this._shown.get(key);
    if (!v) return;
    v.hp = Math.min(maxHp, v.hp + amount);
  }
}
