using System;

namespace Liangshan.Sim
{
    /// <summary>关卡三宝箱、天书、杏黄旗、装备品质、聚义宴、扫荡、寨主等级。</summary>
    public static partial class Meta
    {
        // ---------------- 关卡三宝箱 ----------------

        public static readonly string[] LevelChestCond = { "通关", "50%血量通关", "满血通关" };
        public static readonly float[] LevelChestWall = { 0f, 0.5f, 0.999f };

        public static bool LevelChestGot(SaveData s, int level, int k) => (s.LevelChest[level - 1] & (1 << k)) != 0;

        /// <summary>星级已经够、还没打开。通关 1 星开木箱，半血 2 星开银箱，满血 3 星开金箱。</summary>
        public static bool CanOpenLevelChest(SaveData s, int level, int k)
        {
            if (k < 0 || k > 2 || level < 1 || level > s.Stars.Length) return false;
            if (LevelChestGot(s, level, k)) return false;
            return s.Stars[level - 1] >= k + 1;
        }

        /// <summary>玩家在主界面自己开。随机碎片落到当前阵容里的一位好汉。</summary>
        public static Rewards OpenLevelChest(SaveData s, int level, int k, Rng rng)
        {
            if (!CanOpenLevelChest(s, level, k)) return null;
            s.LevelChest[level - 1] |= 1 << k;
            var lineup = Lineup(s);
            var got = new Rewards();
            foreach (var it in LevelChestReward(level, k).Items)
            {
                var give = it.Cur == Cur.AnyShard ? new Item(Cur.Shard, it.N, lineup[rng.Int(lineup.Length)]) : it;
                got.Add(give.Cur, give.N, give.Hero);
                Give(s, give);
            }
            return got;
        }

        public static int LevelChestLeft(SaveData s, int level)
        {
            int n = 0;
            for (int k = 0; k < 3; k++) if (!LevelChestGot(s, level, k)) n++;
            return n;
        }

        /// <summary>第 n 关第 k 个宝箱。逢 5 的关卡满血箱换成玄女天书和玄铁。</summary>
        public static Rewards LevelChestReward(int n, int k)
        {
            var r = new Rewards();
            int ch = (n - 1) / Defs.LevelsPerChapter + 1;
            bool big = n % 5 == 0;
            switch (k)
            {
                case 0:
                    r.Add(Cur.Copper, 500 + 50 * n);
                    r.Add(Cur.Iron, 4 + n / 4);
                    r.Add(Cur.AnyShard, 2 + ch);
                    break;
                case 1:
                    r.Add(Cur.Page, 10 + n / 2);
                    r.Add(Cur.Silk, 100 + 10 * n);
                    r.Add(Cur.AnyShard, 3 + ch);
                    r.Add(Cur.Copper, 800 + 60 * n);
                    break;
                default:
                    if (big)
                    {
                        r.Add(Cur.Meteor, 2 + ch);
                        r.Add(Cur.Tome, ch <= 2 ? 2 : 3);
                    }
                    else r.Add(Cur.Page, 25 + n);
                    r.Add(Cur.Ingot, big ? 150 : 100);
                    r.Add(Cur.Silk, 200 + 20 * n);
                    r.Add(Cur.GearBox, 1);
                    r.Add(Cur.AnyShard, 4 + ch);
                    break;
            }
            return r;
        }

        // ---------------- 扫荡 ----------------

        /// <summary>三个宝箱都拿到的关卡可以扫荡：花体力直接拿一局胜利的常规奖励。</summary>
        public static bool CanSweep(SaveData s, int level) => level <= s.Cleared && s.LevelChest[level - 1] == 7;

        public static Rewards Sweep(SaveData s, LevelDef st, Rng rng)
        {
            if (!CanSweep(s, st.No) || !Spend(s, Cur.Stamina, BattleStamina)) return null;
            var r = BattleRewards(s, st, true, st.Waves, 1f, 0, rng);
            Give(s, r);
            s.Battles++;
            s.Wins++;
            Progress(s, Act.Battle);
            Progress(s, Act.Win);
            Progress(s, Act.Sweep);
            return r;
        }

        // ---------------- 天书（寨主技能） ----------------

        public const int PageMax = 30;
        public static int PageCost(int lv) => 10 + 5 * lv;
        public static int PageCopper(int lv) => 500 + 200 * lv;
        public const float PageLord = 0.06f, PageDmg = 0.005f;

        public static bool CanPage(SaveData s) => s.PageLv < PageMax && s.Pages >= PageCost(s.PageLv) && s.Copper >= PageCopper(s.PageLv);

        public static bool LearnPage(SaveData s)
        {
            if (!CanPage(s)) return false;
            s.Pages -= PageCost(s.PageLv);
            s.Copper -= PageCopper(s.PageLv);
            s.PageLv++;
            return true;
        }

        public static readonly (string Name, string Desc, int Cost)[] TomeNodes =
        {
            ("声波·二连", "全村集合连轰两道扩音声波", 2),
            ("声波·震慑", "扩音声波命中的非首领外星人眩晕 0.8 秒", 3),
            ("声波·破甲", "扩音声波对精英、首领伤害 +60%", 4),
            ("声波·疾", "全村集合冷却 -20%", 5),
            ("声波·三连", "全村集合连轰三道扩音声波", 6),
        };

        public static bool CanTome(SaveData s) => s.TomeNodes < TomeNodes.Length && s.Tomes >= TomeNodes[s.TomeNodes].Cost;

        public static bool LearnTome(SaveData s)
        {
            if (!CanTome(s)) return false;
            s.Tomes -= TomeNodes[s.TomeNodes].Cost;
            s.TomeNodes++;
            return true;
        }

        // ---------------- 杏黄旗 ----------------

        public const int FlagSlotsMax = 5, FlagMax = 10;
        public static int FlagSlots(int lv) => lv <= 0 ? 0 : Math.Min(FlagSlotsMax, 1 + lv / 2);
        public static int FlagMeteor(int lv) => lv + 1;
        public static int FlagCopper(int lv) => 2000 * (lv + 1);
        public static float FlagWall(int lv) => 0.02f * lv;
        public static float FlagStunSec(int lv) => lv <= 0 ? 0 : 2f + 0.2f * lv;
        public static int RerollCost(SaveData s)
        {
            int locked = 0;
            for (int i = 0; i < FlagSlotsMax; i++) if ((s.FlagLock & (1 << i)) != 0) locked++;
            return 200 + 200 * locked;
        }

        public const int FlagKinds = 6 + Defs.RoleCount;
        public static readonly string[] QualityName = { "普通", "精良", "史诗", "传说" };
        public static readonly float[] QualityBonus = { 0f, 0.15f, 0.3f, 0.5f };

        static readonly float[][] FlagVals =
        {
            new[] { 0.02f, 0.04f, 0.06f, 0.09f },
            new[] { 0.05f, 0.10f, 0.15f, 0.22f },
            new[] { 0.05f, 0.10f, 0.15f, 0.22f },
            new[] { 0.03f, 0.06f, 0.09f, 0.13f },
            new[] { 0.02f, 0.03f, 0.05f, 0.07f },
            new[] { 0.01f, 0.02f, 0.03f, 0.04f },
            new[] { 0.04f, 0.08f, 0.12f, 0.18f },
        };

        public static float FlagValue(int kind, int q) => FlagVals[Math.Min(kind, 6)][q];

        public static string FlagStatName(int kind) =>
            kind == 0 ? "全村伤害" : kind == 1 ? "对精英伤害" : kind == 2 ? "对首领伤害" : kind == 3 ? "防线生命" : kind == 4 ? "攻击速度" : kind == 5 ? "暴击率"
            : Defs.RoleName((Role)(kind - 6)) + "伤害";

        public static bool AffixOf(SaveData s, int slot, out int kind, out int q)
        {
            int v = s.FlagAffix[slot] - 1;
            kind = v / 4;
            q = v % 4;
            return v >= 0;
        }

        public static string AffixText(int kind, int q) => $"{FlagStatName(kind)} +{FlagValue(kind, q) * 100:0.#}%";

        static int RollAffix(int lv, Rng rng)
        {
            int kind = rng.Int(FlagKinds);
            float w0 = 55 - 2 * lv, w1 = 30, w2 = 12 + lv, w3 = 3 + lv;
            float r = rng.F() * (w0 + w1 + w2 + w3);
            int q = r < w0 ? 0 : r < w0 + w1 ? 1 : r < w0 + w1 + w2 ? 2 : 3;
            return kind * 4 + q + 1;
        }

        public static bool CanFlagUp(SaveData s) => s.FlagLv < FlagMax && s.Meteor >= FlagMeteor(s.FlagLv) && s.Copper >= FlagCopper(s.FlagLv);

        /// <summary>打造 / 升阶：新开的词条位随机一条。</summary>
        public static bool FlagUp(SaveData s, Rng rng)
        {
            if (!CanFlagUp(s)) return false;
            s.Meteor -= FlagMeteor(s.FlagLv);
            s.Copper -= FlagCopper(s.FlagLv);
            s.FlagLv++;
            for (int i = 0; i < FlagSlots(s.FlagLv); i++)
                if (s.FlagAffix[i] == 0) s.FlagAffix[i] = RollAffix(s.FlagLv, rng);
            return true;
        }

        public static bool CanReroll(SaveData s)
        {
            if (s.FlagLv <= 0 || s.Silk < RerollCost(s)) return false;
            for (int i = 0; i < FlagSlots(s.FlagLv); i++) if ((s.FlagLock & (1 << i)) == 0) return true;
            return false;
        }

        /// <summary>洗练：没锁的词条全部重随。</summary>
        public static bool Reroll(SaveData s, Rng rng)
        {
            if (!CanReroll(s)) return false;
            s.Silk -= RerollCost(s);
            for (int i = 0; i < FlagSlots(s.FlagLv); i++)
                if ((s.FlagLock & (1 << i)) == 0) s.FlagAffix[i] = RollAffix(s.FlagLv, rng);
            return true;
        }

        public static void ToggleLock(SaveData s, int slot) => s.FlagLock ^= 1 << slot;

        // ---------------- 装备箱 ----------------

        public struct GearDrop
        {
            public int Slot, Quality, Iron;
            public bool Upgraded;
        }

        /// <summary>开一个装备箱：随机部位、品质（精良 65 / 史诗 28 / 传说 7）。比身上的好就换上，否则熔成精铁。</summary>
        public static GearDrop? OpenGearBox(SaveData s, Rng rng)
        {
            if (s.GearBoxes <= 0) return null;
            s.GearBoxes--;
            float r = rng.F() * 100;
            var d = new GearDrop { Slot = rng.Int(Equips.Length), Quality = r < 65 ? 1 : r < 93 ? 2 : 3 };
            if (d.Quality > s.EquipQ[d.Slot])
            {
                s.EquipQ[d.Slot] = d.Quality;
                d.Upgraded = true;
            }
            else
            {
                d.Iron = 8 * (d.Quality + 1);
                s.Iron += d.Iron;
            }
            return d;
        }

        // ---------------- 聚义宴（定时体力） ----------------

        public static readonly int[] MealHours = { 6, 12, 18, 21 };
        public const int MealStamina = 15;

        public static int MealsReady(SaveData s, int hour)
        {
            int n = 0;
            for (int i = 0; i < MealHours.Length; i++) if (hour >= MealHours[i] && (s.Meals & (1 << i)) == 0) n++;
            return n;
        }

        public static int EatMeals(SaveData s, int hour)
        {
            int n = 0;
            for (int i = 0; i < MealHours.Length; i++)
                if (hour >= MealHours[i] && (s.Meals & (1 << i)) == 0) { s.Meals |= 1 << i; n++; }
            s.Stamina += n * MealStamina;
            return n * MealStamina;
        }

        // ---------------- 巡山锦缎 ----------------

        public static float IdleSilkPerHour(SaveData s) => 20 + 2 * s.Cleared;

        // ---------------- 寨主等级（只做展示） ----------------

        public static int LordLevel(SaveData s, out float progress)
        {
            int exp = s.Wins * 20 + s.Cleared * 60 + s.Battles * 5;
            int lv = 1;
            while (exp >= 100 + 60 * (lv - 1)) { exp -= 100 + 60 * (lv - 1); lv++; }
            progress = exp / (float)(100 + 60 * (lv - 1));
            return lv;
        }

        // ---------------- 汇总到战斗 ----------------

        static void ApplyExtras(SaveData s, Loadout lo)
        {
            lo.LordPct *= 1f + PageLord * s.PageLv;
            lo.DmgMul = 1f + PageDmg * s.PageLv;
            if (s.TomeNodes >= 1) lo.LordHits = 2;
            if (s.TomeNodes >= 2) lo.LordStun = 0.8f;
            if (s.TomeNodes >= 3) lo.LordBig = 1.6f;
            if (s.TomeNodes >= 4) lo.LordCd *= 0.8f;
            if (s.TomeNodes >= 5) lo.LordHits = 3;

            lo.WallMul += FlagWall(s.FlagLv);
            lo.FlagStun = FlagStunSec(s.FlagLv);
            for (int i = 0; i < FlagSlots(s.FlagLv); i++)
            {
                if (!AffixOf(s, i, out int kind, out int q)) continue;
                float v = FlagValue(kind, q);
                switch (kind)
                {
                    case 0: lo.DmgMul += v; break;
                    case 1: lo.EliteDmg += v; break;
                    case 2: lo.BossDmg += v; break;
                    case 3: lo.WallMul += v; break;
                    case 4: lo.AllSpeed += v; break;
                    case 5: lo.Crit += v; break;
                    default: lo.RoleDmg[kind - 6] += v; break;
                }
            }
            ApplyTotemsAndCloak(s, lo);
        }
    }
}
