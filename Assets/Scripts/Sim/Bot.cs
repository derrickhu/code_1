namespace Liangshan.Sim
{
    /// <summary>自动玩家：数值验证和自动截图用。Skill 0 只会召唤，1 会合成，2 按《永远的蔚蓝星球》策略运营（先铺双2星、抢低费核心词条、联动破冰/共鸣升星）。</summary>
    public sealed class Bot
    {
        readonly int _skill;
        float _think;

        public Bot(int skill) { _skill = skill; }

        public void Step(Battle b, float dt)
        {
            if (b.Phase == Phase.Choosing)
            {
                int pick = 0;
                if (_skill >= 2)
                {
                    float best = -999f;
                    for (int i = 0; i < b.Choices.Length; i++)
                    {
                        var c = b.Choices[i];
                        var hd = Defs.Hero(c.Hero);
                        float score = BestStar(b, c.Hero) * (hd.Carry ? 5f : 1.5f) + (hd.Carry ? 9f : -2f);
                        if (c.Ult) score += 45f;
                        if (c.Kind == PerkKind.Adv) score += 18f;
                        else if (c.Kind == PerkKind.Morph) score += 12f;
                        if (c.Eff == Eff.Count || c.Eff == Eff.Conduct || c.Eff == Eff.Refract) score += 11f;
                        if (c.Eff == Eff.Surge || c.Eff == Eff.Top || c.Eff == Eff.Resonance) score += 9f;
                        if (c.Eff == Eff.Shatter || c.Eff == Eff.Exec) score += 7f;
                        if (c.Eff == Eff.Dmg || c.Eff == Eff.Area) score += 5f;
                        if (score > best) { best = score; pick = i; }
                    }
                }
                b.Pick(pick);
                return;
            }
            if (b.Phase == Phase.Reels)
            {
                b.ApplyReels(b.SpinReels());
                return;
            }
            if (b.Phase != Phase.Running) return;
            _think -= dt;
            if (_think > 0) return;
            _think = 0.32f;

            int units = Occupied(b);
            if (_skill >= 2 && !b.SwappedOnce)
            {
                for (int i = 0; i < b.Slots.Count; i++)
                {
                    var u = b.Slots[i].Unit;
                    if (u != null && u.Star >= 2 && u.Def.Kind == Role.Support && b.SwapUnit(i)) return;
                }
            }
            if (_skill >= 1 && TryMerge(b)) return;
            // 对标蔚蓝星球核心运营：先铺满 6 次召唤且场上站稳阵脚，随后当强化费明显优于高额召唤费时优先买词条
            if (_skill >= 2 && b.Recruited >= Defs.EnhanceUnlockSummons && units >= 4 && b.Summons >= 7)
            {
                int[] gates = { 7, 10, 13, 16, 19, 22, 24, 25, 26 };
                bool wantSaveForEnhance = b.Enhances < gates.Length && b.Summons >= gates[b.Enhances];
                if (b.Coins >= b.EnhanceCost && (wantSaveForEnhance || b.EnhanceCost <= b.SummonCost * 2.5f) && b.Enhance()) return;
                bool worthHolding = b.Enhances <= 3 || b.Coins >= b.EnhanceCost * 0.45f;
                if (wantSaveForEnhance && worthHolding && b.Wall > b.WallMax * 0.60f) return;
            }
            if (b.CanSummon) { b.Summon(); return; }
            if (_skill >= 2 && !b.HasEmptySlot() && b.Coins >= b.EnhanceCost) b.Enhance();
        }

        static int Occupied(Battle b)
        {
            int n = 0;
            foreach (var s in b.Slots) if (s.Unit != null) n++;
            return n;
        }

        static int BestStar(Battle b, HeroId h)
        {
            int best = 0;
            foreach (var s in b.Slots)
                if (s.Unit != null && s.Unit.Hero == h && s.Unit.Star > best) best = s.Unit.Star;
            return best;
        }

        static bool TryMerge(Battle b)
        {
            bool full = !b.HasEmptySlot();
            bool danger = b.Wall < b.WallMax * 0.45f;
            // 1→2 星 200% 翻倍零损耗，只要场上满 4 人就优先合出 2 星腾格子；
            // 2→3 星有边际衰减且可能变辅助：未满格时绝不轻易合掉 2 星远程输出（仅优先合掉 2 星辅助/控制，或战士博 3 星刀气）！
            for (int star = 3; star >= 1; star--)
            {
                if (!full && !danger && star == 1 && Occupied(b) < 4 && b.Coins >= b.SummonCost) continue;
                for (int i = 0; i < b.Slots.Count; i++)
                {
                    var u = b.Slots[i].Unit;
                    if (u == null || u.Star != star) continue;
                    if (!full && !danger && star >= 2 && u.Def.Carry && u.Def.Kind != Role.Fighter) continue;
                    for (int j = i + 1; j < b.Slots.Count; j++)
                        if (b.CanMerge(i, j)) return b.Drop(i, j);
                }
            }
            return false;
        }
    }
}
