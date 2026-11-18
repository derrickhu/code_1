using System;
using System.Collections.Generic;

namespace Liangshan.Sim
{
    [Serializable]
    public sealed class TotemData
    {
        public int Id;
        public int Beast;
        public int Slot;
        /// <summary>1 稀有(蓝) 2 史诗(紫) 3 传说(金) 4 绝世(橙红)。</summary>
        public int Rarity;
        public int Kind;
        public bool Locked;
    }

    /// <summary>
    /// 局外「兽魂图腾」与「天罡战氅」养成体系（对标《永远的蔚蓝星球》主公系统）：
    /// 六大装备部位各设 4 个图腾孔（共 24 孔），支持镶嵌、三合一升品合成、洗炼石重洗词条；
    /// 商城支持「心愿单 UP 招募」与「寻宝锤抽图腾」。
    /// </summary>
    public static partial class Meta
    {
        public const int TotemSocketsPerSlot = 4;
        public const int TotemTotalSockets = 6 * TotemSocketsPerSlot;
        public static readonly int[] TotemSocketUnlockCleared = { 0, 3, 8, 15 };

        public static readonly string[] BeastNames = { "中华大黄徽章", "铁掌藏獒徽章", "追风猎犬徽章", "村霸大鹅徽章", "镇塘金龟徽章", "战斗公鸡徽章" };
        public static readonly string[] BeastIcons = { "totem_tiger", "totem_bear", "totem_wolf", "totem_hawk", "totem_turtle", "totem_qilin" };
        public static readonly string[] TotemRarityNames = { "普通", "稀有", "史诗", "传说", "绝世" };
        public static readonly int[] TotemBaseAtk = { 0, 2, 5, 11, 22 };

        public const int TotemKindCount = 8 + Defs.RoleCount;

        static readonly float[][] TotemVals =
        {
            new[] { 0.04f, 0.07f, 0.11f, 0.16f }, // 0 全军伤害
            new[] { 0.10f, 0.18f, 0.28f, 0.42f }, // 1 替天行道剑气伤害
            new[] { 0.08f, 0.14f, 0.22f, 0.32f }, // 2 对前3波怪物伤害
            new[] { 0.10f, 0.18f, 0.28f, 0.40f }, // 3 对减速/眩晕怪物伤害
            new[] { 0.08f, 0.15f, 0.24f, 0.36f }, // 4 对精英与首领伤害
            new[] { 15f,   25f,   40f,   60f   }, // 5 开局初始银两
            new[] { 0.02f, 0.035f,0.055f,0.08f }, // 6 全军暴击率
            new[] { 0.02f, 0.04f, 0.06f, 0.09f }, // 7 寨墙受到伤害减免
            new[] { 0.06f, 0.11f, 0.18f, 0.26f }, // 8..13 职业伤害
        };

        public static float TotemVal(int kind, int rarity)
        {
            int r = Math.Max(1, Math.Min(4, rarity)) - 1;
            return TotemVals[Math.Min(kind, 8)][r];
        }

        public static string TotemFullName(TotemData t) =>
            $"{BeastNames[t.Beast % BeastNames.Length]}·{Equips[t.Slot % Equips.Length].Name}";

        public static string TotemIcon(TotemData t) => BeastIcons[t.Beast % BeastIcons.Length];

        public static int TotemAtk(TotemData t) => TotemBaseAtk[Math.Max(1, Math.Min(4, t.Rarity))];

        public static string TotemEffectText(TotemData t, bool richGreen = false)
        {
            float v = TotemVal(t.Kind, t.Rarity);
            string num = t.Kind == 5 ? $"+{v:0}" : $"+{v * 100:0.#}%";
            if (richGreen) num = $"<color=#1E9438>{num}</color>";
            switch (t.Kind)
            {
                case 0: return $"乡亲最终伤害 {num}";
                case 1: return $"村长「{Defs.LordSkillName}」伤害 {num}";
                case 2: return $"对前三波出现的外星军伤害 {num}";
                case 3: return $"对减速、眩晕状态外星军伤害 {num}";
                case 4: return $"对精英与首领外星军伤害 {num}";
                case 5: return $"开局初始能量币 {num}";
                case 6: return $"全村暴击率 {num}";
                case 7: return $"村口防线受到的伤害减免 {num}";
                default: return $"{Defs.RoleName((Role)(t.Kind - 8))}职业伤害 {num}";
            }
        }

        public static bool TotemSocketOpen(SaveData s, int socket) =>
            socket >= 0 && socket < TotemSocketsPerSlot && s.Cleared >= TotemSocketUnlockCleared[socket];

        public static TotemData FindTotem(SaveData s, int id)
        {
            if (id <= 0 || s.Totems == null) return null;
            for (int i = 0; i < s.Totems.Count; i++)
                if (s.Totems[i].Id == id) return s.Totems[i];
            return null;
        }

        public static bool IsTotemEquipped(SaveData s, int id)
        {
            if (id <= 0 || s.TotemEquipped == null) return false;
            for (int i = 0; i < s.TotemEquipped.Length; i++)
                if (s.TotemEquipped[i] == id) return true;
            return false;
        }

        public static int EquippedSocketOf(SaveData s, int id)
        {
            if (id <= 0 || s.TotemEquipped == null) return -1;
            for (int i = 0; i < s.TotemEquipped.Length; i++)
                if (s.TotemEquipped[i] == id) return i;
            return -1;
        }

        public static TotemData RollTotem(SaveData s, int rarity, Rng rng, int fixedSlot = -1)
        {
            if (s.NextTotemId < 1) s.NextTotemId = 1;
            int slot = fixedSlot >= 0 ? fixedSlot : rng.Int(Equips.Length);
            var t = new TotemData
            {
                Id = s.NextTotemId++,
                Beast = rng.Int(BeastNames.Length),
                Slot = slot,
                Rarity = Math.Max(1, Math.Min(4, rarity)),
                Kind = rng.Int(TotemKindCount),
            };
            s.Totems.Add(t);
            return t;
        }

        /// <summary>镶嵌图腾到对应部位的第一个空槽（满槽时替换第 0 槽）；若已镶嵌则卸下。</summary>
        public static bool ToggleInlayTotem(SaveData s, int totemId)
        {
            var t = FindTotem(s, totemId);
            if (t == null) return false;
            int cur = EquippedSocketOf(s, totemId);
            if (cur >= 0)
            {
                s.TotemEquipped[cur] = 0;
                return true;
            }
            int baseIdx = t.Slot * TotemSocketsPerSlot;
            int target = -1;
            for (int k = 0; k < TotemSocketsPerSlot; k++)
            {
                if (!TotemSocketOpen(s, k)) continue;
                if (s.TotemEquipped[baseIdx + k] == 0) { target = baseIdx + k; break; }
            }
            if (target < 0) target = baseIdx;
            s.TotemEquipped[target] = t.Id;
            return true;
        }

        public static int RefineStoneCost(int rarity) => rarity <= 2 ? 1 : rarity == 3 ? 2 : 3;

        /// <summary>洗炼史诗及以上品质图腾，重随一条不同的词条。</summary>
        public static bool CanRefineTotem(SaveData s, TotemData t) =>
            t != null && t.Rarity >= 2 && !t.Locked && s.RefineStones >= RefineStoneCost(t.Rarity);

        public static bool RefineTotem(SaveData s, int totemId, Rng rng)
        {
            var t = FindTotem(s, totemId);
            if (!CanRefineTotem(s, t)) return false;
            s.RefineStones -= RefineStoneCost(t.Rarity);
            int next = rng.Int(TotemKindCount - 1);
            if (next >= t.Kind) next++;
            t.Kind = next;
            return true;
        }

        /// <summary>一键合成：每 3 个同品质、未镶嵌、未上锁的图腾（最高传说合绝世）合成为 1 个高一阶图腾。</summary>
        public static List<TotemData> MergeAllTotems(SaveData s, Rng rng)
        {
            var created = new List<TotemData>();
            for (int r = 1; r <= 3; r++)
            {
                while (true)
                {
                    var free = new List<TotemData>();
                    foreach (var t in s.Totems)
                        if (t.Rarity == r && !t.Locked && !IsTotemEquipped(s, t.Id)) free.Add(t);
                    if (free.Count < 3) break;
                    for (int i = 0; i < 3; i++) s.Totems.Remove(free[i]);
                    created.Add(RollTotem(s, r + 1, rng));
                }
            }
            return created;
        }

        public static bool CanMergeAnyTotem(SaveData s)
        {
            int[] cnt = new int[5];
            foreach (var t in s.Totems)
                if (t.Rarity >= 1 && t.Rarity <= 3 && !t.Locked && !IsTotemEquipped(s, t.Id))
                    if (++cnt[t.Rarity] >= 3) return true;
            return false;
        }

        // ---------------- 兽魂寻宝（图腾抽卡） ----------------

        public const int TotemPullIngot1 = 120, TotemPullIngot10 = 1080, TotemOrangePity = 30;

        public static List<TotemData> PullTotems(SaveData s, int n, Rng rng)
        {
            var list = new List<TotemData>();
            bool purple = false;
            for (int i = 0; i < n; i++)
            {
                s.TotemPity++;
                float r = rng.F();
                int rar = r < 0.02f ? 4 : r < 0.10f ? 3 : r < 0.42f ? 2 : 1;
                if (s.TotemPity >= TotemOrangePity && rar < 3) rar = 3;
                if (n >= 10 && i == n - 1 && !purple && rar < 2) rar = 2;
                if (rar >= 2) purple = true;
                if (rar >= 3) s.TotemPity = 0;
                list.Add(RollTotem(s, rar, rng));
            }
            return list;
        }

        // ---------------- 天罡战氅（寨主披风） ----------------

        public const int CloakMax = 15;
        public static int CloakSilkCost(int lv) => 180 + 120 * lv;
        public static int CloakCopperCost(int lv) => 1200 + 800 * lv;
        public static float CloakWallBonus(int lv) => 0.03f * lv;
        public static float CloakDmgBonus(int lv) => 0.02f * lv;

        public static bool CanCloakUp(SaveData s) =>
            s.CloakLv < CloakMax && s.Silk >= CloakSilkCost(s.CloakLv) && s.Copper >= CloakCopperCost(s.CloakLv);

        public static bool UpgradeCloak(SaveData s)
        {
            if (!CanCloakUp(s)) return false;
            s.Silk -= CloakSilkCost(s.CloakLv);
            s.Copper -= CloakCopperCost(s.CloakLv);
            s.CloakLv++;
            return true;
        }

        // ---------------- 汇总进战斗 Loadout ----------------

        static void ApplyTotemsAndCloak(SaveData s, Loadout lo)
        {
            if (s.CloakLv > 0)
            {
                lo.WallMul += CloakWallBonus(s.CloakLv);
                lo.DmgMul += CloakDmgBonus(s.CloakLv);
            }
            if (s.TotemEquipped == null) return;
            for (int i = 0; i < s.TotemEquipped.Length; i++)
            {
                int id = s.TotemEquipped[i];
                if (id <= 0) continue;
                var t = FindTotem(s, id);
                if (t == null) continue;
                lo.Atk += TotemAtk(t);
                float v = TotemVal(t.Kind, t.Rarity);
                switch (t.Kind)
                {
                    case 0: lo.DmgMul += v; break;
                    case 1: lo.LordPct *= 1f + v; break;
                    case 2: lo.EarlyWaveDmg += v; break;
                    case 3: lo.ControlDmg += v; break;
                    case 4: lo.EliteDmg += v; lo.BossDmg += v; break;
                    case 5: lo.StartCoins += (int)v; break;
                    case 6: lo.Crit += v; break;
                    case 7: lo.WallResist = Math.Min(0.65f, lo.WallResist + v); break;
                    default:
                        int role = t.Kind - 8;
                        if (role >= 0 && role < lo.RoleDmg.Length) lo.RoleDmg[role] += v;
                        break;
                }
            }
        }
    }
}
