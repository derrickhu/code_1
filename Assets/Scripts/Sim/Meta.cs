using System;
using System.Collections.Generic;

namespace Liangshan.Sim
{
    /// <summary>局外养成折算成一局战斗里的加成。</summary>
    public sealed class Loadout
    {
        public HeroId[] Lineup;
        /// <summary>寨主攻击力：所有好汉伤害 = 攻击力 × 好汉系数。</summary>
        public float Atk = Meta.BaseAtk, Crit = Meta.BaseCrit, CritDmg = Meta.BaseCritDmg;
        /// <summary>好汉等级带来的：伤害、攻速、技能冷却倍率、技能伤害倍率。</summary>
        public float[] HeroDmg, HeroSpeed, SkillCd, SkillPow;
        public bool[] Passive;
        /// <summary>好汉等级：决定局内卡池里有没有这位好汉的「爆发」「最强」选项。</summary>
        public int[] Lv;
        /// <summary>按职业的伤害加成（装备突破）。</summary>
        public float[] RoleDmg;
        public float AllSpeed = 1, WallMul = 1, WallResist, UltCd = 1;
        /// <summary>寨主技能：伤害倍率（× 攻击力）、冷却秒数、上阵好汉平均等级带来的威力倍率。</summary>
        public float LordPct = Defs.LordPctBase, LordCd = Defs.LordCdBase, LordMul = 1;
        /// <summary>天书下卷：剑气连斩次数、命中眩晕秒数、对精英首领倍率。</summary>
        public int LordHits = 1;
        public float LordStun, LordBig = 1;
        /// <summary>杏黄旗与兽魂图腾词条：全军伤害、对精英、对首领、前3波、对受控敌军加成；旗技震慑秒数。</summary>
        public float DmgMul = 1, EliteDmg = 1, BossDmg = 1, EarlyWaveDmg, ControlDmg, FlagStun;
        public int StartCoins;
        public readonly List<string> StartPerks = new List<string>();

        public static Loadout Plain(HeroId[] lineup)
        {
            var lo = new Loadout { Lineup = lineup };
            int n = Defs.HeroCount;
            lo.HeroDmg = new float[n];
            lo.HeroSpeed = new float[n];
            lo.SkillCd = new float[n];
            lo.SkillPow = new float[n];
            lo.Passive = new bool[n];
            lo.Lv = new int[n];
            for (int i = 0; i < n; i++)
                lo.HeroDmg[i] = lo.HeroSpeed[i] = lo.SkillCd[i] = lo.SkillPow[i] = 1f;
            lo.RoleDmg = new float[Defs.RoleCount];
            for (int i = 0; i < lo.RoleDmg.Length; i++) lo.RoleDmg[i] = 1f;
            return lo;
        }
    }

    /// <summary>存档。字段全公开，方便 JsonUtility 读写。</summary>
    [Serializable]
    public sealed class SaveData
    {
        public int Version = 1;
        public int Ingots, Copper, Iron, Tokens;
        public int Stamina = Meta.StaminaMax;
        public long StaminaAt;
        public int[] HeroLv = new int[0], Shards = new int[0];
        public int[] Lineup;
        /// <summary>三套阵容方案，每套 4 位；Preset 为当前方案。</summary>
        public int[] Presets;
        public int Preset;
        /// <summary>三套方案的自定义名字。空着就显示「方案1」这样的默认名。</summary>
        public string[] PresetNames;
        public int Cleared, Selected = 1;
        /// <summary>寨主天赋已点亮的节点数。</summary>
        public int Talent;
        public int[] Stars = new int[0];
        public int[] EquipLv = new int[0];
        public int RecruitLv = 1, RecruitExp, Pity, Pulls;
        /// <summary>图鉴：0 未遇到 1 已遇到 2 已领奖。</summary>
        public int[] Seen = new int[0];
        public int[] ChestClaimed = new int[0];
        public int Day;
        public int[] Task = new int[0];
        public int TaskClaimed, AdIngots, AdStamina, AdRecruit, AdIdle, DailyTries, EscortTries, ShopStamina;
        public int SignDays, SignDay;
        public long IdleAt;
        public int Speed15, TutorialDone, Wins, Battles;
        public int Sound = 1, Music = 1;
        /// <summary>每关三个宝箱（通关 / 半血通关 / 满血通关）的领取位。</summary>
        public int[] LevelChest = new int[0];
        public int Pages, Tomes, Silk, Meteor, GearBoxes;
        /// <summary>天书上卷等级、下卷已参悟的节点数。</summary>
        public int PageLv, TomeNodes;
        /// <summary>杏黄旗：等级、五条词条（kind*4+品质+1，0 为未开）、锁定位。</summary>
        public int FlagLv, FlagLock;
        public int[] FlagAffix = new int[0];
        /// <summary>六件装备的品质 0 普通 … 3 传说。</summary>
        public int[] EquipQ = new int[0];
        /// <summary>今日已领的聚义宴（按时段的位）。</summary>
        public int Meals;
        /// <summary>开档那天的日期序号 + 1（0 为老存档还没记）。七日目标、招募冲刺都从这天算。</summary>
        public int Born;
        /// <summary>各项行为的累计次数（按 Act），七日目标用。</summary>
        public int[] Life = new int[0];
        /// <summary>今日已开的活跃宝箱位。</summary>
        public int ActBox;
        /// <summary>七日目标：已领的目标位、已开的积分宝箱位。</summary>
        public long SevenGot;
        public int SevenBox;
        /// <summary>招募冲刺：当前轮次 + 1、本轮各项行为次数、已领的档位和任务位。</summary>
        public int SprintRound, SprintTier, SprintTask;
        public int[] SprintAct = new int[0];
        /// <summary>上次领每日福利的日期序号 + 1。</summary>
        public int WelfareDay;
        /// <summary>洗炼石、寻宝锤、天罡战氅等级、心愿好汉（0 未选，>0 为 HeroId+1）。</summary>
        public int RefineStones, Hammers, CloakLv, WishHero;
        /// <summary>兽魂图腾背包与六部位镶嵌槽（6×4=24）。</summary>
        public List<TotemData> Totems = new List<TotemData>();
        public int[] TotemEquipped = new int[0];
        public int NextTotemId = 1, TotemPity;
        /// <summary>聚义信物已消耗点数、每周半价碎片计数、跳过招募动画、整日2倍速日期、今日无损撤退与广告计数、首次出橙标记。</summary>
        public int CreditSpent, ShardWeek, SkipRecruitAnim, Speed2Day, FreeRetreats, AdStart2Star, AdTakeAll, LegendPulled;
        /// <summary>最近一次主线战败的关卡号。援军开局只在这一关还没打过时出现。</summary>
        public int LostStage;
        public int[] WeeklyShardBought = new int[0];
        /// <summary>排行榜主线进度奖励领取位、今日已点赞次数、玩家自定义/微信名号与头像。</summary>
        public int RankClaimed, RankLikes, Gender, WxAuthed;
        public string Nick = "", Avatar = "";
        /// <summary>敌军图鉴三大分类（小怪/精英/首领）收集宝箱已领取位。</summary>
        public int CodexBox;
        /// <summary>抖音专属福利：上次领取侧边栏复访奖励的日期序号 + 1；桌面快捷方式一次性奖励标记。</summary>
        public int DySidebarDay, DyShortcutGot;
        /// <summary>抖音订阅消息记录：巡村满仓提醒订阅日 + 1、签到提醒订阅日 + 1、累计授权次数（仅服务状态标记，无物质奖励诱导）。</summary>
        public int DySubPatrolDay, DySubSignDay, DySubTotal;
    }

    public enum Cur { Ingot, Copper, Iron, Token, Stamina, Shard, Page, Tome, Silk, Meteor, GearBox, AnyShard, Refine, Hammer }

    public struct Item
    {
        public Cur Cur;
        public int N;
        public HeroId Hero;
        public Item(Cur c, int n, HeroId h = HeroId.HuaRong) { Cur = c; N = n; Hero = h; }
    }

    public sealed class Rewards
    {
        public readonly List<Item> Items = new List<Item>();
        public HeroId? Unlock;
        public int Stars;
        public bool First;
        /// <summary>关卡宝箱改在主界面另开，结算不再往这里塞东西。</summary>
        public int ChestBits;
        public readonly List<Item> ChestItems = new List<Item>();

        public void Add(Cur c, int n, HeroId h = HeroId.HuaRong)
        {
            if (n <= 0) return;
            for (int i = 0; i < Items.Count; i++)
                if (Items[i].Cur == c && (c != Cur.Shard || Items[i].Hero == h)) { Items[i] = new Item(c, Items[i].N + n, h); return; }
            Items.Add(new Item(c, n, h));
        }

        public int Get(Cur c)
        {
            int n = 0;
            foreach (var it in Items) if (it.Cur == c) n += it.N;
            return n;
        }
    }

    public struct Pull
    {
        public HeroId Hero;
        public int Shards;
        public bool New;
    }

    public sealed class EquipDef
    {
        public string Name, Icon, Stat;
        public float Per, Cap;
        public bool Pct = true;
        /// <summary>突破加成的职业。</summary>
        public Role Role;
    }

    /// <summary>任务计数的行为。前 6 个的顺序和老存档的每日任务进度一致，别插队。</summary>
    public enum Act { Battle, Win, HeroUp, Forge, Ad, Recruit, Stamina, Sweep, Login, Talent }

    public sealed class TaskDef
    {
        public string Name;
        public Act Kind;
        public int Need, Points;
        public Item Reward;
    }

    public static partial class Meta
    {
        public const int MaxHeroLv = 30;
        public const int StaminaMax = 60;
        public const int StaminaSec = 300;
        public const int BattleStamina = 5;
        public const int AdIngotsMax = 5, AdStaminaMax = 3, AdRecruitMax = 3, AdIdleMax = 3, DailyTriesMax = 2, EscortTriesMax = 2, ShopStaminaMax = 2;
        public const int TalentStep = 5;
        public const float BaseAtk = 50f, BaseCrit = 0.05f, BaseCritDmg = 1.5f;
        /// <summary>任意好汉每升一级，全军暴击伤害 +1%。</summary>
        public const float CritDmgPerLv = 0.01f;
        public const int IdleCapHours = 8;

        // ---------------- 存档 ----------------

        /// <summary>开局四位稀有好汉，战士、射手、法师、炮手各一；史诗、传说靠主线首通和招募逐步入伙。</summary>
        public static readonly HeroId[] Starters = { HeroId.XieZhen, HeroId.KongLiang, HeroId.MaLing, HeroId.ShiXiu };

        static int[] StarterLineup()
        {
            var r = new int[Starters.Length];
            for (int i = 0; i < r.Length; i++) r[i] = (int)Starters[i];
            return r;
        }

        public static SaveData NewSave(long now)
        {
            var s = new SaveData { Ingots = 300, Copper = 1500, Tokens = 5, RefineStones = 4, Hammers = 3, StaminaAt = now, IdleAt = now, Lineup = StarterLineup() };
            Normalize(s);
            foreach (var h in Starters) s.HeroLv[(int)h] = 1;
            var rng = new Rng(20261112);
            RollTotem(s, 2, rng, 0);
            RollTotem(s, 1, rng, 1);
            return s;
        }

        static int[] Fit(int[] a, int n)
        {
            if (a != null && a.Length == n) return a;
            var r = new int[n];
            if (a != null) Array.Copy(a, r, Math.Min(n, a.Length));
            return r;
        }

        /// <summary>老存档补齐数组长度，加了新好汉、新关卡也能读。</summary>
        public static void Normalize(SaveData s)
        {
            s.HeroLv = Fit(s.HeroLv, Defs.HeroCount);
            s.Shards = Fit(s.Shards, Defs.HeroCount);
            s.Stars = Fit(s.Stars, Defs.LevelCount);
            s.EquipLv = Fit(s.EquipLv, Equips.Length);
            s.Seen = Fit(s.Seen, Defs.Enemies.Length);
            s.ChestClaimed = Fit(s.ChestClaimed, Defs.Chapters.Length);
            s.Task = Fit(s.Task, ActCount);
            s.Life = Fit(s.Life, ActCount);
            s.SprintAct = Fit(s.SprintAct, ActCount);
            s.LevelChest = Fit(s.LevelChest, Defs.LevelCount);
            s.FlagAffix = Fit(s.FlagAffix, FlagSlotsMax);
            s.EquipQ = Fit(s.EquipQ, Equips.Length);
            if (s.Totems == null) s.Totems = new List<TotemData>();
            s.TotemEquipped = Fit(s.TotemEquipped, TotemTotalSockets);
            s.WeeklyShardBought = Fit(s.WeeklyShardBought, Defs.HeroCount);
            if (s.NextTotemId < 1)
            {
                int mx = 0;
                foreach (var t in s.Totems) if (t.Id > mx) mx = t.Id;
                s.NextTotemId = mx + 1;
            }
            if (s.Lineup == null || s.Lineup.Length != 4) s.Lineup = StarterLineup();
            if (s.Presets == null || s.Presets.Length != PresetCount * 4)
            {
                s.Presets = new int[PresetCount * 4];
                for (int i = 0; i < PresetCount; i++) Array.Copy(s.Lineup, 0, s.Presets, i * 4, 4);
            }
            s.Preset = Math.Max(0, Math.Min(PresetCount - 1, s.Preset));
            if (s.PresetNames == null || s.PresetNames.Length != PresetCount)
            {
                var oldNames = s.PresetNames;
                s.PresetNames = new string[PresetCount];
                if (oldNames != null)
                    for (int i = 0; i < Math.Min(oldNames.Length, PresetCount); i++) s.PresetNames[i] = oldNames[i] ?? "";
            }
            for (int i = 0; i < PresetCount; i++) if (s.PresetNames[i] == null) s.PresetNames[i] = "";
            s.Selected = Math.Max(1, Math.Min(s.Selected, Math.Min(Defs.LevelCount, s.Cleared + 1)));
            if (s.RecruitLv < 1) s.RecruitLv = 1;
        }

        public static void RollDay(SaveData s, int day)
        {
            if (s.Born == 0) s.Born = day + 1;
            RollSprint(s, day);
            int week = Math.Max(0, DayNo(s, day) - 1) / 7 + 1;
            if (s.ShardWeek != week)
            {
                s.ShardWeek = week;
                if (s.WeeklyShardBought != null)
                    for (int i = 0; i < s.WeeklyShardBought.Length; i++) s.WeeklyShardBought[i] = 0;
            }
            if (s.Day == day) return;
            s.Day = day;
            for (int i = 0; i < s.Task.Length; i++) s.Task[i] = 0;
            s.TaskClaimed = 0;
            s.ActBox = 0;
            s.AdIngots = s.AdStamina = s.AdRecruit = s.AdIdle = s.DailyTries = s.EscortTries = s.ShopStamina = s.Meals = 0;
            s.FreeRetreats = s.AdStart2Star = s.AdTakeAll = s.RankLikes = 0;
            Progress(s, Act.Login);
        }

        public static void RegenStamina(SaveData s, long now)
        {
            if (s.Stamina >= StaminaMax) { s.StaminaAt = now; return; }
            long ticks = (now - s.StaminaAt) / StaminaSec;
            if (ticks <= 0) return;
            s.Stamina = (int)Math.Min(StaminaMax, s.Stamina + ticks);
            s.StaminaAt = s.Stamina >= StaminaMax ? now : s.StaminaAt + ticks * StaminaSec;
        }

        public static int StaminaWait(SaveData s, long now) => s.Stamina >= StaminaMax ? 0 : (int)(StaminaSec - (now - s.StaminaAt) % StaminaSec);

        public static int Have(SaveData s, Cur c)
        {
            switch (c)
            {
                case Cur.Ingot: return s.Ingots;
                case Cur.Copper: return s.Copper;
                case Cur.Iron: return s.Iron;
                case Cur.Token: return s.Tokens;
                case Cur.Stamina: return s.Stamina;
                case Cur.Page: return s.Pages;
                case Cur.Tome: return s.Tomes;
                case Cur.Silk: return s.Silk;
                case Cur.Meteor: return s.Meteor;
                case Cur.GearBox: return s.GearBoxes;
                case Cur.Refine: return s.RefineStones;
                case Cur.Hammer: return s.Hammers;
                default: return 0;
            }
        }

        public static void Give(SaveData s, Item it)
        {
            switch (it.Cur)
            {
                case Cur.Ingot: s.Ingots += it.N; break;
                case Cur.Copper: s.Copper += it.N; break;
                case Cur.Iron: s.Iron += it.N; break;
                case Cur.Token: s.Tokens += it.N; break;
                case Cur.Stamina: s.Stamina += it.N; break;
                case Cur.Shard: s.Shards[(int)it.Hero] += it.N; break;
                case Cur.Page: s.Pages += it.N; break;
                case Cur.Tome: s.Tomes += it.N; break;
                case Cur.Silk: s.Silk += it.N; break;
                case Cur.Meteor: s.Meteor += it.N; break;
                case Cur.GearBox: s.GearBoxes += it.N; break;
                case Cur.Refine: s.RefineStones += it.N; break;
                case Cur.Hammer: s.Hammers += it.N; break;
                case Cur.AnyShard: s.Shards[s.Lineup[(s.Battles + s.Pulls + it.N) % s.Lineup.Length]] += it.N; break;
            }
        }

        public static void Give(SaveData s, Rewards r, int mul = 1)
        {
            foreach (var it in r.Items) Give(s, new Item(it.Cur, it.N * mul, it.Hero));
            if (r.Unlock.HasValue && s.HeroLv[(int)r.Unlock.Value] == 0) s.HeroLv[(int)r.Unlock.Value] = 1;
        }

        public static bool Spend(SaveData s, Cur c, int n)
        {
            if (Have(s, c) < n) return false;
            Give(s, new Item(c, -n));
            if (c == Cur.Stamina) Progress(s, Act.Stamina, n);
            return true;
        }

        public static HeroId[] Lineup(SaveData s)
        {
            var r = new HeroId[s.Lineup.Length];
            for (int i = 0; i < r.Length; i++) r[i] = (HeroId)s.Lineup[i];
            return r;
        }

        public const int PresetCount = 3;

        /// <summary>把好汉放到第 slot 位；他已在阵上就和原位互换。同步写回当前方案。</summary>
        public static void SetLineup(SaveData s, int slot, HeroId h)
        {
            if (!Owned(s, h) || slot < 0 || slot >= s.Lineup.Length) return;
            int at = Array.IndexOf(s.Lineup, (int)h);
            if (at >= 0) s.Lineup[at] = s.Lineup[slot];
            s.Lineup[slot] = (int)h;
            Array.Copy(s.Lineup, 0, s.Presets, s.Preset * 4, 4);
        }

        /// <summary>切换阵容方案：当前阵容存回原方案，读出新方案（没拥有或重复的位置用当前阵容补）。</summary>
        public static void UsePreset(SaveData s, int i)
        {
            if (i < 0 || i >= PresetCount || i == s.Preset) return;
            Array.Copy(s.Lineup, 0, s.Presets, s.Preset * 4, 4);
            s.Preset = i;
            var next = new int[4];
            Array.Copy(s.Presets, i * 4, next, 0, 4);
            for (int k = 0; k < 4; k++)
            {
                int h = next[k];
                bool bad = h < 0 || h >= Defs.HeroCount || s.HeroLv[h] == 0 || Array.IndexOf(next, h) < k;
                if (!bad) continue;
                foreach (var c in s.Lineup)
                    if (Array.IndexOf(next, c) < 0) { next[k] = c; break; }
            }
            s.Lineup = next;
            Array.Copy(s.Lineup, 0, s.Presets, i * 4, 4);
        }

        public static string PresetName(SaveData s, int i)
        {
            if (s.PresetNames != null && i >= 0 && i < s.PresetNames.Length)
            {
                string n = s.PresetNames[i];
                if (!string.IsNullOrWhiteSpace(n)) return n.Trim();
            }
            return "方案" + (i + 1);
        }

        /// <summary>写下方案名。留空或写回默认名，就还叫方案。</summary>
        public static void SetPresetName(SaveData s, int i, string name)
        {
            if (i < 0 || i >= PresetCount) return;
            if (s.PresetNames == null || s.PresetNames.Length != PresetCount) s.PresetNames = new string[PresetCount];
            name = (name ?? "").Trim().Replace("\n", "").Replace("\r", "");
            if (name.Length > 6) name = name.Substring(0, 6);
            if (name == "方案" + (i + 1)) name = "";
            s.PresetNames[i] = name;
        }

        // ---------------- 好汉 ----------------

        public static bool Owned(SaveData s, HeroId h) => s.HeroLv[(int)h] > 0;
        public static int ShardCost(int lv) => 2 + lv;
        public static int CopperCost(int lv) => 100 + lv * 60 + lv * lv * 22;
        public static int DupShards(int rarity) => rarity >= 4 ? 10 : rarity == 3 ? 6 : 4;

        public static bool CanLevel(SaveData s, HeroId h)
        {
            int lv = s.HeroLv[(int)h];
            return lv > 0 && lv < MaxHeroLv && s.Shards[(int)h] >= ShardCost(lv) && s.Copper >= CopperCost(lv);
        }

        public static bool LevelUp(SaveData s, HeroId h)
        {
            if (!CanLevel(s, h)) return false;
            int lv = s.HeroLv[(int)h];
            s.Shards[(int)h] -= ShardCost(lv);
            s.Copper -= CopperCost(lv);
            s.HeroLv[(int)h] = lv + 1;
            Progress(s, Act.HeroUp);
            return true;
        }

        public static float LevelDmg(int lv) => 1f + 0.12f * (Math.Max(1, lv) - 1);

        /// <summary>好汉普攻伤害倍率：等级成长，10 级再 +20%。</summary>
        public static float HeroDmg(int lv) => LevelDmg(lv) * (lv >= 10 ? 1.2f : 1f);

        /// <summary>所有好汉等级之和带来的暴击伤害加成。</summary>
        public static float LevelCritDmg(SaveData s)
        {
            int sum = 0;
            foreach (var lv in s.HeroLv) if (lv > 1) sum += lv - 1;
            return sum * CritDmgPerLv;
        }

        public static string FirstPerk(HeroId h)
        {
            foreach (var p in Defs.Perks)
                if (p.Hero == h && !p.Star && !p.Ult) return p.Id;
            return null;
        }

        /// <summary>
        /// 好汉等级解锁表（对标《永远的蔚蓝星球》）：1 级基础技能，5 级解锁「爆发」（传说好汉同步解锁大招进卡池），
        /// 10 级被动质变，15 级「爆发」必暴且减冷却，20 级解锁「最强」且抹除所有取舍卡负面减伤代价，25、30 级突破。
        /// </summary>
        public static readonly int[] UnlockLv = { 1, 5, 10, 15, 20, 25, 30 };
        public const int UltLv = 5, SurgeLv = 5, PassiveLv = 10, SurgePlusLv = 15, TopLv = 20, NoPenaltyLv = 20;

        /// <summary>被动从几级开始生效。名字和 5 级选项撞车的，跟 5 级走，图标也在这一级点亮。</summary>
        public static int PassiveUnlock(HeroId h)
        {
            var surge = OptPerk(h, 1);
            return surge != null && surge.Name == Defs.Hero(h).PassiveName ? SurgeLv : PassiveLv;
        }

        /// <summary>里程碑里点到的技能。同一行可能有两个名字，同一个名字也可能出现在不同级。</summary>
        public enum TalentSkill { Attack, Ult, Passive, Surge, SurgePlus, Top, Other }

        /// <summary>
        /// 按这一行认技能，不能只按名字。吴用 5 级选项和 10 级被动都叫「锦囊妙计」，
        /// 15 级又提一次这个名字，说的是强化效果，不是被动。
        /// </summary>
        public static TalentSkill TalentSkillOf(HeroId h, int row, string name)
        {
            var d = Defs.Hero(h);
            switch (row)
            {
                case 0: return TalentSkill.Attack;
                case 1: return !string.IsNullOrEmpty(d.UltName) && name == d.UltName ? TalentSkill.Ult : TalentSkill.Surge;
                case 2: return TalentSkill.Passive;
                case 3: return TalentSkill.SurgePlus;
                case 4: return TalentSkill.Top;
                default:
                    if (name == d.AtkName) return TalentSkill.Attack;
                    if (!string.IsNullOrEmpty(d.UltName) && name == d.UltName) return TalentSkill.Ult;
                    if (name == d.PassiveName) return TalentSkill.Passive;
                    var top = OptPerk(h, 2);
                    if (top != null && name == top.Name) return TalentSkill.Top;
                    return TalentSkill.Other;
            }
        }

        public static PerkDef OptPerk(HeroId h, int opt)
        {
            foreach (var p in Defs.Perks) if (p.Hero == h && p.Opt == opt) return p;
            return null;
        }

        public static string Talent(HeroId h, int i)
        {
            var d = Defs.Hero(h);
            switch (i)
            {
                case 0: return $"解锁战斗技能「{d.AtkName}」";
                case 1: return d.HasUlt
                    ? $"解锁大招「{d.UltName}」与「{OptPerk(h, 1).Name}」（局内强化可抽到）"
                    : $"解锁「{OptPerk(h, 1).Name}」选项（局内强化可抽到）";
                case 2: return h == HeroId.YanQing
                    ? $"获得被动「{d.PassiveName}」，场上满4位时钢钉+1，伤害 +20%"
                    : PassiveUnlock(h) < PassiveLv
                        ? $"「{d.PassiveName}」伤害 +20%"
                        : $"获得被动「{d.PassiveName}」，伤害 +20%";
                case 3: return h == HeroId.HuaRong
                    ? $"场上满4位{d.Name}穿透+1，「{OptPerk(h, 1).Name}」必暴，冷却 -10%"
                    : d.Buff.HasValue ? $"「{OptPerk(h, 1).Name}」效果翻倍，技能冷却 -10%" : $"「{OptPerk(h, 1).Name}」必定暴击、几率 +10%，技能冷却 -10%";
                case 4: return $"解锁「{OptPerk(h, 2).Name}」选项，且取舍强化不再降低属性";
                case 5: return d.Buff.HasValue ? "技能效果 +15%，奥义增幅 +35%" : (d.HasUlt ? "技能伤害 +15%，大招冷却 -15%" : "技能伤害 +15%，三合一奥义伤害 +35%");
                default: return "攻击速度 +20%";
            }
        }

        /// <summary>好汉免费传功重置：退回 1 级，100% 全额返还已消耗的铜钱与该好汉碎片，换新主 C 零损耗。</summary>
        public static bool CanResetHero(SaveData s, HeroId h) => s.HeroLv[(int)h] > 1;

        public static bool ResetHero(SaveData s, HeroId h, out int refundCopper, out int refundShards)
        {
            refundCopper = refundShards = 0;
            int lv = s.HeroLv[(int)h];
            if (lv <= 1) return false;
            for (int k = 1; k < lv; k++)
            {
                refundCopper += CopperCost(k);
                refundShards += ShardCost(k);
            }
            s.HeroLv[(int)h] = 1;
            s.Copper += refundCopper;
            s.Shards[(int)h] += refundShards;
            return true;
        }

        public static int HeroPower(SaveData s, HeroId h) => HeroPowerAt(h, s.HeroLv[(int)h]);

        /// <summary>战力里的单位输出：辅助按固定值折算，带光环的再加一点。</summary>
        static float PowerDps(HeroDef d) => (d.Buff.HasValue ? 0.6f : d.Dps) + (d.Aura == AuraKind.None ? 0 : 0.3f);

        public static int HeroPowerAt(HeroId h, int lv)
        {
            var d = Defs.Hero(h);
            lv = Math.Max(1, lv);
            return (int)(PowerDps(d) * BaseAtk * HeroDmg(lv) * (lv >= 30 ? 1.2f : 1f) * (lv >= PassiveUnlock(h) ? 1.08f : 1f) * (lv >= SurgeLv ? 1.06f : 1f) * (lv >= TopLv ? 1.06f : 1f) * 10);
        }

        /// <summary>好汉 1 星真实基础攻击力（局外详情页与局内 1 星 0 词条面板完全同源一致）。</summary>
        public static float HeroBaseAtk(Loadout lo, HeroId h)
        {
            var d = Defs.Hero(h);
            float m = lo.Atk * lo.HeroDmg[(int)h] * lo.RoleDmg[(int)d.Kind] * lo.DmgMul;
            if (lo.Lineup != null && Array.IndexOf(lo.Lineup, h) >= 0)
            {
                float syn = Defs.RoleSynergyBonus(lo.Lineup);
                foreach (var bd in Defs.ActiveBonds(lo.Lineup))
                    if (!bd.RoleTarget.HasValue || bd.RoleTarget.Value == d.Kind) syn += bd.Dmg;
                m *= 1f + syn;
            }
            return m;
        }

        /// <summary>好汉局外展示攻击力（与局内 1 星 0 词条无本关增益时的面板攻击严格一致）。</summary>
        public static int HeroDisplayAtk(SaveData s, HeroId h)
        {
            var lo = BuildLoadout(s);
            return (int)Math.Round(HeroBaseAtk(lo, h) * lo.SkillPow[(int)h]);
        }

        /// <summary>升 1 级后增加的真实面板攻击力。</summary>
        public static int HeroNextAtkDelta(SaveData s, HeroId h)
        {
            int lv = s.HeroLv[(int)h];
            if (lv <= 0 || lv >= MaxHeroLv) return 0;
            int cur = HeroDisplayAtk(s, h);
            s.HeroLv[(int)h] = lv + 1;
            int nxt = HeroDisplayAtk(s, h);
            s.HeroLv[(int)h] = lv;
            return Math.Max(1, nxt - cur);
        }

        public static int TeamPower(SaveData s)
        {
            var lo = BuildLoadout(s);
            float p = 0;
            foreach (var h in lo.Lineup)
            {
                var d = Defs.Hero(h);
                p += PowerDps(d) * HeroBaseAtk(lo, h) * lo.SkillPow[(int)h] * lo.HeroSpeed[(int)h];
            }
            float crit = 1f + lo.Crit * (lo.CritDmg - 1f);
            float extra = 1f + (lo.EliteDmg - 1f) * 0.25f + (lo.BossDmg - 1f) * 0.25f;
            float lord = (lo.LordHits - 1) * 0.04f + (lo.LordStun > 0 ? 0.03f : 0) + (lo.LordBig - 1f) * 0.05f + (lo.FlagStun > 0 ? 0.03f : 0);
            return (int)(p * lo.AllSpeed * crit * 10 * extra * (1f + lord) + lo.WallMul * 300 / (1f - lo.WallResist));
        }

        // ---------------- 寨主天赋 ----------------

        public const int TalentMax = 150;
        public static int TalentCap(SaveData s) => Math.Min(TalentMax, 6 + s.Cleared * 3);
        public static int TalentCost(int i) => 60 + 15 * i;

        /// <summary>第 i 个节点（1 起）：每个 +1 攻击，逢 10 再 +5；另按 i%5 给一项副属性。</summary>
        public static int TalentAtk(int i) => 1 + (i % 10 == 0 ? 5 : 0);

        public enum TalentStat { CritDmg, Crit, Wall, Coins, Speed }

        public static TalentStat TalentKind(int i) => (TalentStat)(i % 5);

        public static float TalentValue(TalentStat k) =>
            k == TalentStat.Crit ? 0.004f : k == TalentStat.Wall ? 0.015f : k == TalentStat.Coins ? 4f : k == TalentStat.Speed ? 0.006f : 0.03f;

        public static string TalentStatName(TalentStat k) =>
            k == TalentStat.Crit ? "暴击率" : k == TalentStat.Wall ? "防线生命" : k == TalentStat.Coins ? "开局能量币" : k == TalentStat.Speed ? "攻击速度" : "暴击伤害";

        public static string TalentText(int i)
        {
            if (i % 10 == 0) return $"攻击力 +{TalentAtk(i)}，{Defs.LordSkillName}伤害 +{LordPctStep * 100:0}%";
            var k = TalentKind(i);
            float v = TalentValue(k);
            string sub = k == TalentStat.Coins ? $"{TalentStatName(k)} +{v:0}" : $"{TalentStatName(k)} +{v * 100:0.#}%";
            return $"攻击力 +{TalentAtk(i)}，{sub}";
        }

        /// <summary>前 n 个节点的总加成。逢 10 的节点副属性换成寨主技能伤害。</summary>
        public static void TalentSum(int n, out float atk, out float crit, out float critDmg, out float wall, out float coins, out float speed)
        {
            atk = n + n / 10 * 5;
            int Count(int r) => n / 5 + (r != 0 && n % 5 >= r ? 1 : 0);
            critDmg = (Count(0) - n / 10) * TalentValue(TalentStat.CritDmg);
            crit = Count(1) * TalentValue(TalentStat.Crit);
            wall = Count(2) * TalentValue(TalentStat.Wall);
            coins = Count(3) * TalentValue(TalentStat.Coins);
            speed = Count(4) * TalentValue(TalentStat.Speed);
        }

        // ---------------- 寨主技能 ----------------

        public const float LordPctStep = 0.5f;

        /// <summary>寨主技能伤害倍率（× 攻击力）：基础 200%，天赋每 10 个节点 +50%。</summary>
        public static float LordPct(int talent) => Defs.LordPctBase + LordPctStep * (talent / 10);

        /// <summary>寨主技能冷却：基础 40 秒，号角的大招冷却同样生效。</summary>
        public static float LordCd(float ultCdMul) => Defs.LordCdBase * ultCdMul;

        public static bool CanTalent(SaveData s) => s.Talent < TalentCap(s) && s.Copper >= TalentCost(s.Talent + 1);

        public static bool LearnTalent(SaveData s)
        {
            if (!CanTalent(s)) return false;
            s.Copper -= TalentCost(s.Talent + 1);
            s.Talent++;
            Progress(s, Act.Talent);
            return true;
        }

        // ---------------- 装备（寨主宋江） ----------------

        public static readonly EquipDef[] Equips =
        {
            new EquipDef { Name = "高音大喇叭", Icon = "eq_weapon", Stat = "攻击力", Per = 2f, Cap = 999, Pct = false, Role = Role.Fighter },
            new EquipDef { Name = "劳保安全帽", Icon = "eq_helmet", Stat = "防线生命", Per = 0.05f, Cap = 9, Role = Role.Control },
            new EquipDef { Name = "防刺迷彩服", Icon = "eq_armor", Stat = "防线减伤", Per = 0.015f, Cap = 0.45f, Role = Role.Bomber },
            new EquipDef { Name = "防滑解放鞋", Icon = "eq_boots", Stat = "攻击速度", Per = 0.025f, Cap = 9, Role = Role.Archer },
            new EquipDef { Name = "模范村长章", Icon = "eq_amulet", Stat = "暴击率", Per = 0.003f, Cap = 0.3f, Role = Role.Mage },
            new EquipDef { Name = "手摇警报器", Icon = "eq_horn", Stat = "大招冷却", Per = 0.015f, Cap = 0.4f, Role = Role.Support },
        };

        /// <summary>装备每 10 级突破一次，给对应职业 +4% 伤害。</summary>
        public const float BreakDmg = 0.04f;
        public static int Breaks(int lv) => lv / 10;

        public static int EquipMax(SaveData s) => Math.Min(40, 5 + s.Cleared * 7 / 10);
        public static int IronCost(int lv) => 3 + lv * 2;
        public static int EquipCopper(int lv) => 150 + lv * 80 + lv * lv * 10;

        /// <summary>每 10 级一次突破，突破后每级加成提高一成。</summary>
        public static float EquipValue(int slot, int lv, int quality = 0)
        {
            var d = Equips[slot];
            float v = 0;
            for (int i = 1; i <= lv; i++) v += d.Per * (1f + 0.1f * ((i - 1) / 10));
            return Math.Min(d.Cap, v * (1f + QualityBonus[Math.Max(0, Math.Min(3, quality))]));
        }

        public static string EquipText(int slot, int lv, int quality = 0)
        {
            var d = Equips[slot];
            float v = EquipValue(slot, lv, quality);
            string sign = slot == 2 || slot == 5 ? "-" : "+";
            return d.Pct ? $"{d.Stat} {sign}{v * 100:0.#}%" : $"{d.Stat} +{v:0}";
        }

        public static string BreakText(int slot, int lv)
        {
            var r = Equips[slot].Role;
            return $"{Defs.RoleName(r)}伤害 +{Breaks(lv) * BreakDmg * 100:0}%";
        }

        public static bool CanForge(SaveData s, int slot)
        {
            int lv = s.EquipLv[slot];
            return lv < EquipMax(s) && s.Iron >= IronCost(lv) && s.Copper >= EquipCopper(lv);
        }

        public static bool Forge(SaveData s, int slot)
        {
            if (!CanForge(s, slot)) return false;
            int lv = s.EquipLv[slot];
            s.Iron -= IronCost(lv);
            s.Copper -= EquipCopper(lv);
            s.EquipLv[slot] = lv + 1;
            Progress(s, Act.Forge);
            return true;
        }

        public static Loadout BuildLoadout(SaveData s, HeroId[] lineup = null)
        {
            var lo = Loadout.Plain(lineup ?? Lineup(s));
            for (int h = 0; h < Defs.HeroCount; h++)
            {
                int lv = Math.Max(1, s.HeroLv[h]);
                lo.HeroDmg[h] = HeroDmg(lv);
                lo.HeroSpeed[h] = lv >= 30 ? 1.2f : 1f;
                lo.SkillCd[h] = lv >= 15 ? 0.9f : 1f;
                lo.SkillPow[h] = lv >= 25 ? 1.15f : 1f;
                lo.Passive[h] = lv >= PassiveUnlock((HeroId)h);
                lo.Lv[h] = lv;
            }
            TalentSum(s.Talent, out var tAtk, out var tCrit, out var tCritDmg, out var tWall, out var tCoins, out var tSpeed);
            float Eq(int i) => EquipValue(i, s.EquipLv[i], s.EquipQ[i]);
            lo.Atk = BaseAtk + tAtk + Eq(0);
            lo.Crit = BaseCrit + tCrit + Eq(4);
            lo.CritDmg = BaseCritDmg + tCritDmg + LevelCritDmg(s);
            lo.WallMul = 1f + Eq(1) + tWall;
            lo.WallResist = Eq(2);
            lo.AllSpeed = 1f + Eq(3) + tSpeed;
            lo.StartCoins = (int)tCoins;
            lo.UltCd = 1f - Eq(5);
            lo.LordPct = LordPct(s.Talent);
            lo.LordCd = LordCd(lo.UltCd);
            float sumLv = 0;
            foreach (var h in lo.Lineup) sumLv += lo.HeroDmg[(int)h] * lo.HeroSpeed[(int)h] * lo.RoleDmg[(int)Defs.Hero(h).Kind];
            lo.LordMul = sumLv / lo.Lineup.Length * lo.AllSpeed;
            for (int i = 0; i < Equips.Length; i++)
                lo.RoleDmg[(int)Equips[i].Role] += Breaks(s.EquipLv[i]) * BreakDmg;
            ApplyExtras(s, lo);
            return lo;
        }

        // ---------------- 关卡 ----------------

        /// <summary>星级和关卡三宝箱同一套条件：通关 1 星，半血 2 星，满血 3 星。</summary>
        public static int StarsFor(float wallPct)
        {
            int n = 0;
            for (int k = 0; k < LevelChestWall.Length; k++) if (wallPct >= LevelChestWall[k]) n++;
            return Math.Max(1, n);
        }

        /// <summary>推演用的入伙节奏：稀有→史诗→传说。结算不再直接送人，玩家拿首通招募令自己去擂鼓。</summary>
        static readonly (int lv, HeroId h)[] Unlocks =
        {
            (3, HeroId.RuanXiaoqi), (5, HeroId.TangLong), (7, HeroId.HuaRong), (9, HeroId.WuSong), (12, HeroId.LingZhen),
            (14, HeroId.WuYong), (16, HeroId.ZhuWu), (18, HeroId.LinChong), (25, HeroId.GongSun), (35, HeroId.HuSanniang), (45, HeroId.LuJunyi),
        };

        public static int UnlockLevelOf(HeroId h)
        {
            foreach (var u in Unlocks) if (u.h == h) return u.lv;
            return 0;
        }

        public static HeroId? UnlockAt(int level)
        {
            foreach (var u in Unlocks) if (u.lv == level) return u.h;
            return null;
        }

        public static Rewards BattleRewards(SaveData s, LevelDef st, bool win, int wave, float wallPct, int porters, Rng rng)
        {
            var r = new Rewards();
            int n = st.No;
            if (st.Mode == StageMode.Escort)
            {
                r.Add(Cur.Copper, porters * (60 + 15 * n));
                r.Add(Cur.Iron, porters / 3);
                return r;
            }
            if (st.Mode == StageMode.Daily)
            {
                float k = win ? 1f : Math.Max(0, wave - 1) / (float)st.Waves;
                r.Add(Cur.Token, win ? 3 : (int)(3 * k));
                r.Add(Cur.Iron, (int)((12 + n / 2) * k));
                r.Add(Cur.Ingot, win ? 60 : 0);
                return r;
            }
            if (!win)
            {
                float k = Math.Max(0, wave - 1) / (float)st.Waves * 0.5f;
                r.Add(Cur.Copper, (int)((300 + 70 * n) * k));
                return r;
            }
            r.Stars = StarsFor(wallPct);
            r.First = n > s.Cleared;
            r.Add(Cur.Copper, 300 + 70 * n);
            r.Add(Cur.Iron, 2 + n / 3);
            var lineup = Lineup(s);
            var h = lineup[rng.Int(lineup.Length)];
            r.Add(Cur.Shard, 2 + st.Chapter, h);
            if (r.First)
            {
                r.Add(Cur.Ingot, st.IsChapterBoss ? 150 : 50);
                r.Add(Cur.Token, st.IsChapterBoss ? 3 : 1);
            }
            return r;
        }

        /// <summary>结算一局主线：记星、推进度、解锁倍速。</summary>
        public static void FinishMain(SaveData s, LevelDef st, bool win, Rewards r)
        {
            s.Battles++;
            Progress(s, Act.Battle);
            if (!win)
            {
                if (st.Mode == StageMode.Main) s.LostStage = st.No;
                return;
            }
            s.Wins++;
            Progress(s, Act.Win);
            if (st.Mode != StageMode.Main) return;
            int i = st.No - 1;
            s.Stars[i] = Math.Max(s.Stars[i], r.Stars);
            if (st.No > s.Cleared)
            {
                s.Cleared = st.No;
                s.Selected = Math.Min(Defs.LevelCount, st.No + 1);
            }
            s.Speed15 = 1;
        }

        public static int ChapterStars(SaveData s, int chapter)
        {
            int sum = 0;
            for (int i = 0; i < Defs.LevelsPerChapter; i++) sum += s.Stars[(chapter - 1) * Defs.LevelsPerChapter + i];
            return sum;
        }

        public static readonly int[] ChestStars = { 10, 20, 30 };

        public static Rewards ChestReward(int chapter, int k)
        {
            var r = new Rewards();
            r.Add(Cur.Ingot, 80 + 60 * k + 20 * chapter);
            r.Add(Cur.Token, 1 + k);
            r.Add(Cur.Iron, 10 * (k + 1) + 5 * chapter);
            r.Add(Cur.Hammer, 1 + k);
            if (k >= 1) r.Add(Cur.Refine, 2 * k);
            return r;
        }

        public static bool CanOpenChest(SaveData s, int chapter, int k) =>
            (s.ChestClaimed[chapter - 1] & (1 << k)) == 0 && ChapterStars(s, chapter) >= ChestStars[k];

        public static Rewards OpenChest(SaveData s, int chapter, int k)
        {
            if (!CanOpenChest(s, chapter, k)) return null;
            s.ChestClaimed[chapter - 1] |= 1 << k;
            var r = ChestReward(chapter, k);
            Give(s, r);
            return r;
        }

        // ---------------- 擂鼓招募 ----------------

        public static int RecruitNeed(int lv) => 10 + lv * 10;
        public const int RecruitMaxLv = 10;

        /// <summary>传说好汉通关第 6 关即进入招募池（首张传说享受 15 抽新手破冰小保底），首日即可招募并升至 5 级解锁大招。</summary>
        public const int OrangeOpen = 6;
        public static bool OrangeOpened(SaveData s) => s.Cleared >= OrangeOpen;
        public static float OrangeRate(SaveData s) => OrangeOpened(s) ? 0.05f + 0.01f * (s.RecruitLv - 1) : 0f;
        public static float PurpleRate(SaveData s) => 0.30f + 0.01f * (s.RecruitLv - 1);
        public const int OrangePity = 40, FirstOrangePity = 15;

        public static HeroId? GetWish(SaveData s) =>
            s.WishHero > 0 && s.WishHero <= Defs.HeroCount ? (HeroId)(s.WishHero - 1) : (HeroId?)null;

        public static void SetWish(SaveData s, HeroId? h) =>
            s.WishHero = h.HasValue ? (int)h.Value + 1 : 0;

        /// <summary>分章节渐进扩充招募池，防止前期 32 位好汉一齐稀释碎片导致主力升不动。</summary>
        static bool InRecruitPool(SaveData s, HeroDef d)
        {
            if (s.Cleared >= 20) return true;
            if (s.Cleared >= 10)
                return d.Id <= HeroId.DaiZong || d.Id == HeroId.LiKui || d.Id == HeroId.ZhuWu || d.Id == HeroId.ShiXiu
                    || d.Id == HeroId.XieZhen || d.Id == HeroId.MaLing || d.Id == HeroId.KongLiang || d.Id == HeroId.TangLong
                    || d.Id == HeroId.RuanXiaoqi || d.Id == HeroId.ShiQian;
            // 第 1 章聚焦 14 位核心代表好汉（含百搭时迁与四大主力传说）
            switch (d.Id)
            {
                case HeroId.HuaRong:
                case HeroId.LingZhen:
                case HeroId.WuSong:
                case HeroId.LuZhiShen:
                case HeroId.WuYong:
                case HeroId.GongSun:
                case HeroId.LinChong:
                case HeroId.LuJunyi:
                case HeroId.QinMing:
                case HeroId.ShiXiu:
                case HeroId.XieZhen:
                case HeroId.MaLing:
                case HeroId.KongLiang:
                case HeroId.RuanXiaoqi:
                case HeroId.ShiQian:
                    return true;
                default:
                    return false;
            }
        }

        static HeroId PickOf(SaveData s, int rarity, Rng rng, HeroId? avoidPrev = null, int[] roundCounts = null)
        {
            var wish = GetWish(s);
            bool wishMatch = wish.HasValue && Defs.Hero(wish.Value).Rarity == rarity && (rarity < 4 || OrangeOpened(s));
            if (wishMatch)
            {
                int wc = roundCounts != null ? roundCounts[(int)wish.Value] : 0;
                if (rng.Chance(0.5f) && wc < 3 && (!avoidPrev.HasValue || avoidPrev.Value != wish.Value || wc == 0))
                    return wish.Value;
            }

            var pool = new List<HeroId>();
            foreach (var d in Defs.Heroes) if (d.Rarity == rarity && InRecruitPool(s, d)) pool.Add(d.Id);
            if (pool.Count == 0)
                foreach (var d in Defs.Heroes) if (d.Rarity == rarity) pool.Add(d.Id);

            // 心愿 50% 判定未中时从候选池剔除心愿好汉，修复「50% + 池内二次抽中 = 60%+」的叠加偏差
            if (wishMatch && pool.Count > 1)
            {
                var noWish = new List<HeroId>();
                foreach (var h in pool) if (h != wish.Value) noWish.Add(h);
                if (noWish.Count > 0) pool = noWish;
            }

            // 单轮十连防扎堆：非心愿同一好汉单轮最多出 2 次
            if (roundCounts != null && pool.Count > 1)
            {
                var underCap = new List<HeroId>();
                foreach (var h in pool) if (roundCounts[(int)h] < 2) underCap.Add(h);
                if (underCap.Count > 0) pool = underCap;
            }

            // 防相邻连号：避免连续两抽蹦出同一个好汉
            if (avoidPrev.HasValue && pool.Count > 1)
            {
                var noAdj = new List<HeroId>();
                foreach (var h in pool) if (h != avoidPrev.Value) noAdj.Add(h);
                if (noAdj.Count > 0) pool = noAdj;
            }

            return pool[rng.Int(pool.Count)];
        }

        /// <summary>在不改变抽出英雄集合的前提下，打散同名相邻并把本轮头号亮点留到第 10 席压轴。</summary>
        static void ArrangePullDrama(SaveData s, List<HeroId> picks)
        {
            int n = picks.Count;
            if (n < 4) return;

            int Score(HeroId h) => Defs.Hero(h).Rarity * 100 + (s.HeroLv[(int)h] == 0 ? 40 : 0);

            int bestIdx = 0, bestScore = -1;
            for (int i = 0; i < n; i++)
            {
                int sc = Score(picks[i]);
                if (sc >= bestScore) { bestScore = sc; bestIdx = i; }
            }
            HeroId finale = picks[bestIdx];
            var rest = new List<HeroId>(n - 1);
            for (int i = 0; i < n; i++) if (i != bestIdx) rest.Add(picks[i]);

            var ordered = new List<HeroId>(n);
            for (int slot = 0; slot < n - 1; slot++)
            {
                HeroId? prev = ordered.Count > 0 ? ordered[ordered.Count - 1] : (HeroId?)null;
                bool prevHigh = prev.HasValue && Defs.Hero(prev.Value).Rarity >= 3;
                int chosen = -1, bestCandScore = -9999;
                for (int j = 0; j < rest.Count; j++)
                {
                    var cand = rest[j];
                    int cs = 0;
                    if (prev.HasValue && cand == prev.Value) cs -= 1000;
                    if (slot == n - 2 && cand == finale) cs -= 800;
                    // 高品质与普通品质自然穿插，避免前 5 张挤成一排紫卡后半程全蓝泄气
                    bool candHigh = Defs.Hero(cand).Rarity >= 3;
                    if (prevHigh && !candHigh) cs += 30;
                    if (!prevHigh && candHigh && slot >= 2) cs += 25;
                    if (cs > bestCandScore) { bestCandScore = cs; chosen = j; }
                }
                ordered.Add(rest[chosen]);
                rest.RemoveAt(chosen);
            }
            ordered.Add(finale);

            for (int i = 0; i < n; i++) picks[i] = ordered[i];
        }

        /// <summary>抽 n 次：十连保底一个紫，首橙 15 抽破冰保底、常规四十抽保底橙；设了心愿单时同品质 50% 必中心愿好汉。</summary>
        public static List<Pull> Recruit(SaveData s, int n, Rng rng)
        {
            var picks = new List<HeroId>(n);
            var roundCounts = n > 1 ? new int[Defs.HeroCount] : null;
            HeroId? prevHero = null;
            bool purple = false;
            for (int i = 0; i < n; i++)
            {
                if (OrangeOpened(s)) s.Pity++;
                s.Pulls++;
                float r = rng.F();
                int rar = r < OrangeRate(s) ? 4 : r < OrangeRate(s) + PurpleRate(s) ? 3 : 2;
                int pityNeed = s.LegendPulled == 0 ? FirstOrangePity : OrangePity;
                if (OrangeOpened(s) && s.Pity >= pityNeed) rar = 4;
                if (n >= 10 && i == n - 1 && !purple && rar < 3) rar = 3;
                if (rar >= 3) purple = true;
                if (rar == 4) { s.Pity = 0; s.LegendPulled = 1; }

                var h = PickOf(s, rar, rng, prevHero, roundCounts);
                picks.Add(h);
                prevHero = h;
                if (roundCounts != null) roundCounts[(int)h]++;

                s.RecruitExp++;
                while (s.RecruitLv < RecruitMaxLv && s.RecruitExp >= RecruitNeed(s.RecruitLv))
                {
                    s.RecruitExp -= RecruitNeed(s.RecruitLv);
                    s.RecruitLv++;
                }
            }

            if (n >= 5) ArrangePullDrama(s, picks);

            var res = new List<Pull>(n);
            foreach (var h in picks)
            {
                int rar = Defs.Hero(h).Rarity;
                var p = new Pull { Hero = h };
                if (s.HeroLv[(int)h] == 0)
                {
                    s.HeroLv[(int)h] = 1;
                    p.New = true;
                }
                else
                {
                    p.Shards = DupShards(rar);
                    s.Shards[(int)h] += p.Shards;
                }
                res.Add(p);
            }
            Progress(s, Act.Recruit, n);
            return res;
        }

        // ---------------- 酒馆聚义信物（招募积分每周半价定向换碎片） ----------------

        public const int CreditsPerPull = 10, WeeklyHalfLimit = 10;

        public static int RecruitCredits(SaveData s) => Math.Max(0, s.Pulls * CreditsPerPull - s.CreditSpent);

        public static int BaseShardCreditPrice(int rarity) => rarity >= 4 ? 20 : rarity == 3 ? 12 : 8;

        public static int NextShardCreditPrice(SaveData s, HeroId h)
        {
            int baseP = BaseShardCreditPrice(Defs.Hero(h).Rarity);
            int bought = s.WeeklyShardBought != null && (int)h < s.WeeklyShardBought.Length ? s.WeeklyShardBought[(int)h] : 0;
            return bought < WeeklyHalfLimit ? baseP / 2 : baseP;
        }

        public static int HalfLeft(SaveData s, HeroId h)
        {
            int bought = s.WeeklyShardBought != null && (int)h < s.WeeklyShardBought.Length ? s.WeeklyShardBought[(int)h] : 0;
            return Math.Max(0, WeeklyHalfLimit - bought);
        }

        public static bool BuyHeroShardWithCredits(SaveData s, HeroId h, int count = 1)
        {
            if (!Owned(s, h) || count <= 0) return false;
            int total = 0;
            int bought = s.WeeklyShardBought[(int)h];
            int baseP = BaseShardCreditPrice(Defs.Hero(h).Rarity);
            for (int i = 0; i < count; i++)
                total += (bought + i) < WeeklyHalfLimit ? baseP / 2 : baseP;
            if (RecruitCredits(s) < total) return false;
            s.CreditSpent += total;
            s.WeeklyShardBought[(int)h] += count;
            s.Shards[(int)h] += count;
            return true;
        }

        // ---------------- 每日任务、签到、巡山 ----------------

        /// <summary>
        /// 出征、体力分好几档：玩得越多领得越多。每条另给活跃度，攒够开活跃宝箱。
        /// </summary>
        public static readonly TaskDef[] Tasks =
        {
            new TaskDef { Name = "登录游戏", Kind = Act.Login, Need = 1, Points = 10, Reward = new Item(Cur.Copper, 1000) },
            new TaskDef { Name = "守村出战 3 次", Kind = Act.Battle, Need = 3, Points = 10, Reward = new Item(Cur.Ingot, 30) },
            new TaskDef { Name = "守村出战 6 次", Kind = Act.Battle, Need = 6, Points = 10, Reward = new Item(Cur.Token, 1) },
            new TaskDef { Name = "守村出战 10 次", Kind = Act.Battle, Need = 10, Points = 15, Reward = new Item(Cur.Token, 1) },
            new TaskDef { Name = "获胜 3 次", Kind = Act.Win, Need = 3, Points = 10, Reward = new Item(Cur.Iron, 15) },
            new TaskDef { Name = "消耗体力 30 点", Kind = Act.Stamina, Need = 30, Points = 10, Reward = new Item(Cur.Stamina, 15) },
            new TaskDef { Name = "消耗体力 60 点", Kind = Act.Stamina, Need = 60, Points = 15, Reward = new Item(Cur.Token, 1) },
            new TaskDef { Name = "升级乡亲 1 次", Kind = Act.HeroUp, Need = 1, Points = 5, Reward = new Item(Cur.Copper, 1500) },
            new TaskDef { Name = "强化装备 2 次", Kind = Act.Forge, Need = 2, Points = 5, Reward = new Item(Cur.Iron, 15) },
            new TaskDef { Name = "敲锣摇人 3 次", Kind = Act.Recruit, Need = 3, Points = 10, Reward = new Item(Cur.Ingot, 50) },
            new TaskDef { Name = "观看广告 2 次", Kind = Act.Ad, Need = 2, Points = 10, Reward = new Item(Cur.Ingot, 60) },
        };

        public static readonly int[] ActBoxNeed = { 20, 40, 60, 80, 100 };

        public static Item[] ActBoxReward(int k)
        {
            switch (k)
            {
                case 0: return new[] { new Item(Cur.Copper, 2000), new Item(Cur.Iron, 10) };
                case 1: return new[] { new Item(Cur.Token, 1), new Item(Cur.Ingot, 30) };
                case 2: return new[] { new Item(Cur.Token, 2), new Item(Cur.Hammer, 1) };
                case 3: return new[] { new Item(Cur.AnyShard, 10), new Item(Cur.Refine, 2) };
                default: return new[] { new Item(Cur.Token, 2), new Item(Cur.Stamina, 30), new Item(Cur.GearBox, 1) };
            }
        }

        public static readonly int ActCount = Enum.GetValues(typeof(Act)).Length;

        public static void Progress(SaveData s, Act a, int n = 1)
        {
            int i = (int)a;
            if (s.Task == null || i >= s.Task.Length) return;
            s.Task[i] += n;
            if (i < s.Life.Length) s.Life[i] += n;
            if (i < s.SprintAct.Length) s.SprintAct[i] += n;
        }

        public static int TaskCount(SaveData s, int i) => Math.Min(Tasks[i].Need, s.Task[(int)Tasks[i].Kind]);
        public static bool TaskDone(SaveData s, int i) => s.Task[(int)Tasks[i].Kind] >= Tasks[i].Need;
        public static bool TaskTaken(SaveData s, int i) => (s.TaskClaimed & (1 << i)) != 0;

        public static bool ClaimTask(SaveData s, int i)
        {
            if (!TaskDone(s, i) || TaskTaken(s, i)) return false;
            s.TaskClaimed |= 1 << i;
            Give(s, Tasks[i].Reward);
            return true;
        }

        /// <summary>今日活跃度：已领任务的积分之和。</summary>
        public static int ActPoints(SaveData s)
        {
            int n = 0;
            for (int i = 0; i < Tasks.Length; i++) if (TaskTaken(s, i)) n += Tasks[i].Points;
            return n;
        }

        public static bool CanActBox(SaveData s, int k) => (s.ActBox & (1 << k)) == 0 && ActPoints(s) >= ActBoxNeed[k];

        public static Item[] OpenActBox(SaveData s, int k)
        {
            if (!CanActBox(s, k)) return null;
            s.ActBox |= 1 << k;
            var r = ActBoxReward(k);
            foreach (var it in r) Give(s, it);
            return r;
        }

        public static int TaskBadge(SaveData s)
        {
            int n = 0;
            for (int i = 0; i < Tasks.Length; i++) if (TaskDone(s, i) && !TaskTaken(s, i)) n++;
            for (int k = 0; k < ActBoxNeed.Length; k++) if (CanActBox(s, k)) n++;
            return n;
        }

        public static readonly Item[] SignRewards =
        {
            new Item(Cur.Ingot, 100), new Item(Cur.Token, 2), new Item(Cur.Copper, 3000), new Item(Cur.Iron, 30),
            new Item(Cur.Token, 3), new Item(Cur.Ingot, 300), new Item(Cur.Shard, 20, HeroId.ZhangQing),
        };

        public static bool CanSign(SaveData s, int day) => s.SignDay != day && s.SignDays < SignRewards.Length;

        public static Item? Sign(SaveData s, int day)
        {
            if (!CanSign(s, day)) return null;
            var it = SignRewards[s.SignDays];
            s.SignDays++;
            s.SignDay = day;
            if (it.Cur == Cur.Shard && s.HeroLv[(int)it.Hero] == 0)
            {
                s.HeroLv[(int)it.Hero] = 1;
                return it;
            }
            Give(s, it);
            return it;
        }

        public static int IdleCopperPerHour(SaveData s) => 400 + 90 * s.Cleared;
        public static float IdleIronPerHour(SaveData s) => 3 + s.Cleared / 4f;

        public static Rewards IdleRewards(SaveData s, double hours)
        {
            hours = Math.Max(0, Math.Min(IdleCapHours, hours));
            var r = new Rewards();
            r.Add(Cur.Copper, (int)(IdleCopperPerHour(s) * hours));
            r.Add(Cur.Iron, (int)(IdleIronPerHour(s) * hours));
            r.Add(Cur.Silk, (int)(IdleSilkPerHour(s) * hours));
            r.Add(Cur.Token, (int)(hours / 4));
            return r;
        }

        public static double IdleHours(SaveData s, long now) => Math.Min(IdleCapHours, Math.Max(0, now - s.IdleAt) / 3600.0);

        public static Rewards CollectIdle(SaveData s, long now)
        {
            var r = IdleRewards(s, IdleHours(s, now));
            Give(s, r);
            s.IdleAt = now;
            return r;
        }

        // ---------------- 图鉴 ----------------

        public static int CodexGroupOf(EnemyDef d) => d.IsBoss ? 2 : d.Big ? 1 : 0;

        public static int CodexReward(EnemyDef d) => d.IsBoss ? 100 : d.Big ? 50 : 20;

        public static (int seen, int total) CodexProgress(SaveData s, int group)
        {
            int seen = 0, total = 0;
            foreach (var d in Defs.Enemies)
            {
                if (CodexGroupOf(d) != group) continue;
                total++;
                if (s.Seen[(int)d.Kind] > 0) seen++;
            }
            return (seen, total);
        }

        /// <summary>各分类集齐一定数量后的里程碑宝箱门槛（约过半即可开，不必苦等最后一章）。</summary>
        public static int CodexBoxNeed(int group)
        {
            int total = 0;
            foreach (var d in Defs.Enemies) if (CodexGroupOf(d) == group) total++;
            return group == 0 ? Math.Min(total, 10) : Math.Min(total, 5);
        }

        public static Item[] CodexBoxRewards(int group) => group == 2
            ? new[] { new Item(Cur.Ingot, 300), new Item(Cur.Token, 2), new Item(Cur.Hammer, 2) }
            : group == 1
                ? new[] { new Item(Cur.Ingot, 160), new Item(Cur.Token, 1), new Item(Cur.Refine, 2) }
                : new[] { new Item(Cur.Ingot, 180), new Item(Cur.Token, 1) };

        public static bool CodexBoxTaken(SaveData s, int group) => (s.CodexBox & (1 << group)) != 0;

        public static bool CanClaimCodexBox(SaveData s, int group)
        {
            if (group < 0 || group >= 3 || CodexBoxTaken(s, group)) return false;
            return CodexProgress(s, group).seen >= CodexBoxNeed(group);
        }

        public static Item[] ClaimCodexBox(SaveData s, int group)
        {
            if (!CanClaimCodexBox(s, group)) return null;
            s.CodexBox |= 1 << group;
            var got = CodexBoxRewards(group);
            foreach (var it in got) Give(s, it);
            return got;
        }

        public static bool ClaimCodex(SaveData s, EnemyKind k)
        {
            if (s.Seen[(int)k] != 1) return false;
            s.Seen[(int)k] = 2;
            s.Ingots += CodexReward(Defs.Enemy(k));
            return true;
        }

        public static int CodexGroupBadge(SaveData s, int group)
        {
            int n = CanClaimCodexBox(s, group) ? 1 : 0;
            foreach (var d in Defs.Enemies)
                if (CodexGroupOf(d) == group && s.Seen[(int)d.Kind] == 1) n++;
            return n;
        }

        public static int CodexBadge(SaveData s) =>
            CodexGroupBadge(s, 0) + CodexGroupBadge(s, 1) + CodexGroupBadge(s, 2);

        public static void MarkSeen(SaveData s, IEnumerable<EnemyKind> kinds)
        {
            foreach (var k in kinds)
                if (s.Seen[(int)k] == 0) s.Seen[(int)k] = 1;
        }

        // ---------------- 商城 ----------------

        public sealed class ShopDef
        {
            public string Name, Icon;
            public Item Get;
            public int Price;
            /// <summary>0 元宝购买，1 看广告。</summary>
            public bool Ad;
        }

        public static ShopDef[] Shop(SaveData s) => new[]
        {
            new ShopDef { Name = "免费星钻", Icon = "ic_ingot", Get = new Item(Cur.Ingot, 60), Ad = true },
            new ShopDef { Name = "免费体力", Icon = "ic_wine", Get = new Item(Cur.Stamina, 30), Ad = true },
            new ShopDef { Name = "大喇叭券", Icon = "ic_token", Get = new Item(Cur.Token, 1), Price = 150 },
            new ShopDef { Name = "大喇叭券×10", Icon = "ic_token", Get = new Item(Cur.Token, 10), Price = 1350 },
            new ShopDef { Name = "破译扳手×2", Icon = "ic_hammer", Get = new Item(Cur.Hammer, 2), Price = 200 },
            new ShopDef { Name = "改装芯片×4", Icon = "ic_refine", Get = new Item(Cur.Refine, 4), Price = 120 },
            new ShopDef { Name = "一箱合金钢", Icon = "ic_iron", Get = new Item(Cur.Iron, 30 + s.Cleared), Price = 120 },
            new ShopDef { Name = "一卷防弹布", Icon = "ic_silk", Get = new Item(Cur.Silk, 400 + 20 * s.Cleared), Price = 100 },
        };

        // ---------------- 数值参考 ----------------

        static int ExpectedLv(int n) => Math.Min(MaxHeroLv, 1 + (n <= 10 ? (int)((n - 1) * 0.72f) : 6 + (int)((n - 10) * 0.60f)));
        static int ExpectedEquip(int n) => Math.Min(Math.Min(40, 5 + (n - 1) * 7 / 10), (int)((n - 1) * 0.85f));
        static int ExpectedEquipQ(int n) => n >= 36 ? 3 : n >= 20 ? 2 : n >= 6 ? 1 : 0;
        static int ExpectedTalent(int n) => Math.Min(Math.Min(TalentMax, 6 + (n - 1) * 3), (int)((n - 1) * 3.0f));
        static int ExpectedCloak(int n) => n <= 3 ? 0 : Math.Min(CloakMax, (n - 2) * 15 / 48);
        static int ExpectedPage(int n) => n <= 3 ? 0 : Math.Min(PageMax, (n - 2) * 30 / 48);
        static int ExpectedTotemRarityAt(int n, int k)
        {
            if (k == 0 && n >= 3) return n >= 36 ? 4 : n >= 20 ? 3 : 2; // 开档即赠 1 枚史诗兽魂
            int age = n - 3 - k * 2;
            return age >= 38 ? 4 : age >= 22 ? 3 : age >= 8 ? 2 : 1;
        }
        static int ExpectedTotemCount(int n)
        {
            if (n <= 2) return 0;
            int openPerSlot = 0;
            for (int k = 0; k < TotemSocketUnlockCleared.Length; k++)
                if (n - 1 >= TotemSocketUnlockCleared[k]) openPerSlot++;
            int want = 2 + (n - 2) * 22 / 46;
            return Math.Min(6 * openPerSlot, want);
        }

        /// <summary>打到第 n 关前首通解锁的好汉数。</summary>
        static int ExpectedUnlocked(int n)
        {
            int k = 0;
            foreach (var u in Unlocks) if (u.lv <= n - 1) k++;
            return k;
        }

        /// <summary>正常推进到第 n 关时的真实局外养成基准（含好汉等级、装备强化与品质、天赋、战氅、天书、兽魂图腾）：调难度曲线、写单测共用。</summary>
        public static SaveData ExpectedSave(int n)
        {
            var s = NewSave(0);
            int lv = ExpectedLv(n);
            foreach (var h in Starters) s.HeroLv[(int)h] = lv;
            foreach (var u in Unlocks)
                if (u.lv <= n - 1) s.HeroLv[(int)u.h] = Math.Max(1, lv - 4);
            for (int i = 0; i < Starters.Length; i++)
            {
                var role = Defs.Hero(Starters[i]).Kind;
                foreach (var u in Unlocks)
                    if (u.lv <= n - 1 && Defs.Hero(u.h).Kind == role && Defs.Hero(u.h).Rarity > Defs.Hero((HeroId)s.Lineup[i]).Rarity)
                        s.Lineup[i] = (int)u.h;
                s.HeroLv[s.Lineup[i]] = lv;
            }
            if (s.Presets != null) Array.Copy(s.Lineup, 0, s.Presets, s.Preset * 4, 4);
            s.Cleared = Math.Max(0, n - 1);
            int eq = ExpectedEquip(n), eqQ = ExpectedEquipQ(n);
            for (int i = 0; i < s.EquipLv.Length; i++) { s.EquipLv[i] = eq; s.EquipQ[i] = eqQ; }
            s.Talent = ExpectedTalent(n);
            s.CloakLv = ExpectedCloak(n);
            s.PageLv = ExpectedPage(n);

            s.Totems.Clear();
            Array.Clear(s.TotemEquipped, 0, s.TotemEquipped.Length);
            int tCnt = ExpectedTotemCount(n);
            for (int k = 0; k < tCnt; k++)
            {
                int slot = k % 6, sock = k / 6;
                int tRar = ExpectedTotemRarityAt(n, k);
                var td = new TotemData { Id = k + 1, Beast = slot, Slot = slot, Rarity = tRar, Kind = 0 };
                s.Totems.Add(td);
                s.TotemEquipped[slot * TotemSocketsPerSlot + sock] = td.Id;
            }
            s.NextTotemId = tCnt + 1;
            return s;
        }

        static readonly float PlainCrit = 1f + BaseCrit * (BaseCritDmg - 1f);

        /// <summary>一位好汉的局外综合输出倍率（相对 1 级白板）：含武器、天赋、等级、职业突破、战氅、天书、战旗、兽魂图腾、攻速与暴击期望。</summary>
        public static float PowerOf(Loadout lo, HeroId h)
        {
            var d = Defs.Hero(h);
            float crit = 1f + Math.Min(0.8f, lo.Crit) * (lo.CritDmg - 1f);
            return lo.Atk / BaseAtk * lo.DmgMul * lo.HeroDmg[(int)h] * lo.HeroSpeed[(int)h] * lo.AllSpeed * lo.RoleDmg[(int)d.Kind] * crit / PlainCrit;
        }

        /// <summary>被动、技能冷却、开局强化、技能伤害这几档解锁的大致收益。</summary>
        public static float UnlockFactor(int lv) => (lv >= 5 ? 1.08f : 1f) * (lv >= 15 ? 1.11f : 1f) * (lv >= 20 ? 1.06f : 1f) * (lv >= 25 ? 1.15f : 1f);

        /// <summary>ExpectedSave(n) 的单个好汉输出倍率，不依赖关卡表，关卡表初始化时可以调。和 PowerOf(BuildLoadout(ExpectedSave(n))) 严格一致。</summary>
        public static float ExpectedPower(int n)
        {
            int lv = ExpectedLv(n);
            int lv2 = Math.Max(1, lv - 4);
            int eq = ExpectedEquip(n), eqQ = ExpectedEquipQ(n);
            int cloak = ExpectedCloak(n), page = ExpectedPage(n);
            int tCnt = ExpectedTotemCount(n);
            int tAtkSum = 0;
            float tDmgSum = 0f;
            for (int k = 0; k < tCnt; k++)
            {
                int r = ExpectedTotemRarityAt(n, k);
                tAtkSum += TotemBaseAtk[r];
                tDmgSum += TotemVal(0, r);
            }
            TalentSum(ExpectedTalent(n), out var tAtk, out var tCrit, out var tCritDmg, out _, out _, out var tSpeed);
            float atk = BaseAtk + tAtk + EquipValue(0, eq, eqQ) + tAtkSum;
            float dmgMul = 1f + PageDmg * page + CloakDmgBonus(cloak) + tDmgSum;
            float critRate = Math.Min(0.8f, BaseCrit + tCrit + EquipValue(4, eq, eqQ));
            float critDmg = BaseCritDmg + tCritDmg + (4 * (lv - 1) + ExpectedUnlocked(n) * (lv2 - 1)) * CritDmgPerLv;
            float crit = 1f + critRate * (critDmg - 1f);
            float speed = (lv >= 30 ? 1.2f : 1f) * (1f + EquipValue(3, eq, eqQ) + tSpeed);
            float role = 1f + Breaks(eq) * BreakDmg;
            return atk / BaseAtk * dmgMul * HeroDmg(lv) * speed * role * crit / PlainCrit * UnlockFactor(lv);
        }

        static float RarityWeight(int r) => r >= 4 ? 1.15f : r == 3 ? 1f : 0.76f;

        /// <summary>ExpectedSave(n) 出战阵容的品质系数：开局四个稀有偏弱，随史诗/传说入伙回到 1（以史诗为主的阵容为基准，封顶 0.96）。</summary>
        public static float ExpectedRoster(int n)
        {
            float sum = 0;
            foreach (var st in Starters)
            {
                var role = Defs.Hero(st).Kind;
                int best = Defs.Hero(st).Rarity;
                foreach (var u in Unlocks)
                    if (u.lv <= n - 1 && Defs.Hero(u.h).Kind == role) best = Math.Max(best, Defs.Hero(u.h).Rarity);
                sum += RarityWeight(best);
            }
            return Math.Min(0.96f, sum / 4f / ((3 * RarityWeight(3) + RarityWeight(4)) / 4f));
        }

        /// <summary>ExpectedSave(n) 的寨墙等效血量倍率（头盔、天赋、战氅加血，铠甲减伤）。</summary>
        public static float ExpectedWall(int n)
        {
            int eq = ExpectedEquip(n), eqQ = ExpectedEquipQ(n);
            int cloak = ExpectedCloak(n);
            TalentSum(ExpectedTalent(n), out _, out _, out _, out var tWall, out _, out _);
            return (1f + EquipValue(1, eq, eqQ) + tWall + CloakWallBonus(cloak)) / (1f - EquipValue(2, eq, eqQ));
        }

        // ---------------- 排行榜进度里程碑 & 荣耀称号 ----------------

        public const int RankLikesMax = 3;

        public sealed class RankMilestoneDef
        {
            public int Stage;
            public string Name;
            public Item[] Items;
        }

        public static readonly RankMilestoneDef[] RankMilestones =
        {
            new RankMilestoneDef { Stage = 2,  Name = "初守村口", Items = new[] { new Item(Cur.Ingot, 60),  new Item(Cur.Copper, 800) } },
            new RankMilestoneDef { Stage = 5,  Name = "智擒督军", Items = new[] { new Item(Cur.Ingot, 100), new Item(Cur.Token, 2) } },
            new RankMilestoneDef { Stage = 10, Name = "击退咕噜", Items = new[] { new Item(Cur.Ingot, 150), new Item(Cur.Hammer, 2) } },
            new RankMilestoneDef { Stage = 15, Name = "苞米大捷", Items = new[] { new Item(Cur.Ingot, 180), new Item(Cur.Token, 3) } },
            new RankMilestoneDef { Stage = 20, Name = "痛扁机神", Items = new[] { new Item(Cur.Ingot, 220), new Item(Cur.Refine, 4) } },
            new RankMilestoneDef { Stage = 25, Name = "夜市扬威", Items = new[] { new Item(Cur.Ingot, 260), new Item(Cur.Hammer, 3) } },
            new RankMilestoneDef { Stage = 30, Name = "横扫大集", Items = new[] { new Item(Cur.Ingot, 300), new Item(Cur.Token, 5) } },
            new RankMilestoneDef { Stage = 35, Name = "拆穿巨钻", Items = new[] { new Item(Cur.Ingot, 350), new Item(Cur.Refine, 6) } },
            new RankMilestoneDef { Stage = 40, Name = "风雪破舰", Items = new[] { new Item(Cur.Ingot, 420), new Item(Cur.Hammer, 5) } },
            new RankMilestoneDef { Stage = 50, Name = "护村总英雄", Items = new[] { new Item(Cur.Ingot, 600), new Item(Cur.Token, 10) } },
        };

        public static bool RankMilestoneGot(SaveData s, int i) => (s.RankClaimed & (1 << i)) != 0;

        public static bool CanClaimRankMilestone(SaveData s, int i) =>
            i >= 0 && i < RankMilestones.Length && s.Cleared >= RankMilestones[i].Stage && !RankMilestoneGot(s, i);

        public static int RankRewardBadge(SaveData s)
        {
            int n = 0;
            for (int i = 0; i < RankMilestones.Length; i++)
                if (CanClaimRankMilestone(s, i)) n++;
            return n;
        }

        public static List<Item> ClaimRankMilestone(SaveData s, int i)
        {
            var got = new List<Item>();
            if (!CanClaimRankMilestone(s, i)) return got;
            s.RankClaimed |= 1 << i;
            foreach (var it in RankMilestones[i].Items)
            {
                Give(s, it);
                got.Add(it);
            }
            return got;
        }

        public static List<Item> ClaimAllRankMilestones(SaveData s)
        {
            var merged = new List<Item>();
            for (int i = 0; i < RankMilestones.Length; i++)
            {
                if (!CanClaimRankMilestone(s, i)) continue;
                s.RankClaimed |= 1 << i;
                foreach (var it in RankMilestones[i].Items)
                {
                    Give(s, it);
                    int k = merged.FindIndex(x => x.Cur == it.Cur && x.Hero == it.Hero);
                    if (k >= 0) merged[k] = new Item(it.Cur, merged[k].N + it.N, it.Hero);
                    else merged.Add(it);
                }
            }
            return merged;
        }

        public static int TotalStars(SaveData s)
        {
            if (s.Stars == null) return 0;
            int sum = 0, n = Math.Min(s.Cleared, s.Stars.Length);
            for (int i = 0; i < n; i++) sum += s.Stars[i];
            return sum;
        }

        public static HeroId StrongestHero(SaveData s)
        {
            var lu = Lineup(s);
            HeroId best = lu[0];
            int bestP = -1;
            foreach (var h in lu)
            {
                int p = HeroPower(s, h);
                if (p > bestP) { bestP = p; best = h; }
            }
            for (int i = 0; i < Defs.HeroCount; i++)
            {
                if (!Owned(s, (HeroId)i)) continue;
                int p = HeroPower(s, (HeroId)i);
                if (p > bestP) { bestP = p; best = (HeroId)i; }
            }
            return best;
        }

        /// <summary>按榜单名次与进度授予荣耀称号与牌匾品阶（1 赤金 / 2 紫电 / 3 天青 / 4 翠玉）。</summary>
        public static (string Title, int Tier) HonorTitle(int rank, int cleared, int power)
        {
            if (rank == 1) return ("护村总英雄", 1);
            if (rank == 2) return ("十里八乡战神", 2);
            if (rank == 3) return ("守村急先锋", 3);
            if (cleared >= 42 || power >= 16000) return ("地球硬核狠人", 1);
            if (cleared >= 28 || power >= 9500) return ("银河劝退大师", 2);
            if (cleared >= 14 || power >= 4500) return ("民兵模范标兵", 3);
            if (cleared >= 5 || power >= 2000) return ("幸福村高手", 4);
            return ("护村新秀", 4);
        }
    }
}
