import { describe, expect, it } from 'vitest';
import { COMBOS, comboOf, weldTalk } from '@/balance/combos';
import { getMod, shortModName } from '@/balance/mods';

describe('焊完说话', () => {
  it('凑成了点名出事，不把配方写进喊话', () => {
    const line = weldTalk('铁柱', ['pipe'], 'chainsaw');
    expect(line).toBe('铁柱叠出加长电锯——站后面锯一条线');
  });

  it('只焊到一半留气味，不点另一件的名', () => {
    const line = weldTalk('铁柱', [], 'pipe');
    expect(line).toBe('再焊点带齿的，这管子能加长');
    for (const name of ['电锯', '水管', shortModName(getMod('chainsaw').name)]) {
      expect(line).not.toContain(name);
    }
  });

  it('一件挂两组时不锁死是哪一组', () => {
    expect(weldTalk('三婶', [], 'blower')).toBe('风里再塞点东西，能一起出事');
    expect(weldTalk('三婶', [], 'wire')).toBe('再配点会响的或会割的，一条线能出事');
    expect(weldTalk('铁柱', [], 'quilt')).toBe('再叠一层，能多挨几下');
  });

  it('跟合体无关的件不说话', () => {
    expect(weldTalk('铁柱', [], 'shovel')).toBeUndefined();
  });

  it('已经有合体再焊半件，只报新件的气味', () => {
    const line = weldTalk('铁柱', ['pipe', 'chainsaw'], 'helmet');
    expect(line).toBe('再套层厚的，倒了还能躺着挨');
    expect(line).not.toContain('加长电锯');
  });

  it('每组合体都有气味，且气味不写另一件的短名', () => {
    for (const c of COMBOS) {
      expect(c.scents).toHaveLength(2);
      const a = shortModName(getMod(c.parts[0]).name);
      const b = shortModName(getMod(c.parts[1]).name);
      expect(c.scents[0]).not.toContain(b);
      expect(c.scents[1]).not.toContain(a);
      expect(comboOf(c.parts)?.id).toBe(c.id);
    }
  });
});
