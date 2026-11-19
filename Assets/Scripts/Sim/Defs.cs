using System.Collections.Generic;

namespace Liangshan.Sim
{
    /// <summary>存档按下标存好汉，只能往后加。</summary>
    public enum HeroId
    {
        HuaRong, LingZhen, GongSun, WuSong, ZhangQing, LinChong, LuZhiShen, WuYong,
        LuJunyi, GuanSheng, YanQing, FanRui, HuSanniang, AnDaoquan, DaiZong, QinMing,
        LiKui, QiaoDaoqing, ZhuWu, XuNing, ShanTinggui, WeiDingguo,
        ShiXiu, XieZhen, XieBao, MaLing, KongLiang, TangLong, SunErniang, RuanXiaoqi, ShiQian, JiangJing,
    }

    public enum Role { Archer, Bomber, Mage, Fighter, Support, Control }

    /// <summary>强化、被动的效果种类。数值含义见 Defs.EffText。</summary>
    public enum Eff { Dmg, Speed, Count, Area, Chain, Crit, Stun, Slow, Elite, UltCd, UltPow, Range, Split, Aura, Coin, Fly, Cav, Surge, Top, Blast, Burn, Vuln, Reach, Shatter, Exec, Resonance }

    /// <summary>强化卡的类型：数值（纯加成）、取舍（有代价，同组互斥）、质变（改变攻击方式）、进阶（要先有对应质变）。</summary>
    public enum PerkKind { Value, Trade, Morph, Adv }

    /// <summary>传说好汉的大招，和辅助的技能（Bless 之后几种只给辅助用）。</summary>
    public enum UltKind
    {
        Thunder, Frost, Sweep, Haste, Heal, Bind, Snipe, Tornado, Meteor,
        Bless, Rush, Mend, Forge, Steal, Interest,
    }

    /// <summary>辅助在场时的光环，按场上该好汉星级累加。</summary>
    public enum AuraKind { None, Speed, Dmg, Charge, Heal, Coin, Interest }

    public sealed class HeroDef
    {
        public HeroId Id;
        public string Name, Nick, Art, Desc;
        public Role Kind;
        /// <summary>2 蓝（稀有）3 紫（史诗）4 橙（传说）。</summary>
        public int Rarity;
        public string Element = "物理";

        /// <summary>
        /// 技能：弹道种类、每发伤害系数（好汉攻击力的倍数）、冷却秒数、射程（近战才有限制）。
        /// 冷却按职业拉开：射手约 2 秒一轮齐射，战士 3~4 秒一套连击，炮手 5 秒，控制 6 秒，法师 12~15 秒一次持续施法，辅助 18~28 秒一次加持。
        /// </summary>
        public ShotKind Shot;
        public float Coef, Interval, Range = 99, Radius = 0.4f, Knock, Stun, StunChance, Slow;
        public int Count = 1, Chain;
        public string AtkName, AtkIcon, Noun;
        /// <summary>弹道、命中特效的色调（空 = 弹道自带颜色）。</summary>
        public string Tint;
        /// <summary>这位好汉自己的兵器弹道图（空 = 按弹道种类的通用图），图里兵器尖朝上；ProjSpin 为飞行中打旋。</summary>
        public string Proj;
        public bool ProjSpin;
        public float ProjSize = 1f;
        /// <summary>穿透递增伤害（如花荣每穿 1 怪增伤 18%）、天生持续灼烧/毒素倍率、是否附带 60% 减疗。</summary>
        public float PierceGrow, Dot;
        public bool AntiHeal;
        /// <summary>法师持续施法：持续秒数、每跳间隔；Coef 是每跳的伤害。</summary>
        public float Chan, Tick;
        /// <summary>辅助的技能：不打伤害，给友军加持。BuffV 是效果量。</summary>
        public UltKind? Buff;
        public float BuffV;

        /// <summary>大招：只有传说好汉有，局内强化抽到「大招」卡才解锁。UltCoef 是好汉攻击力的倍数。</summary>
        public UltKind Ult;
        public string UltName, UltIcon, UltTip;
        public float UltCoef, UltCd, UltRadius = 1.6f, UltStun;
        public int UltN = 1;

        /// <summary>10 级解锁的被动。</summary>
        public string PassiveName;
        public Eff PassiveEff;
        public float PassiveV;

        public AuraKind Aura;
        public float AuraV;

        public string Role => Defs.RoleName(Kind);
        public bool Physical => Element == "物理";
        public bool Melee => Range < 50;
        /// <summary>输出位：保底规则里辅助不算。</summary>
        public bool Carry => Kind != Sim.Role.Support;
        public string RarityName => Rarity >= 4 ? "传说" : Rarity == 3 ? "史诗" : "稀有";
        public bool HasUlt => Rarity >= 4;
        /// <summary>每秒对单体的期望输出（× 攻击力），战力估算与数值表核验用（持续施法计入完整施法周期 Interval + Chan）。</summary>
        public float Dps => Buff.HasValue ? 0 : Coef * Count * (Chan > 0 ? Chan / Tick : 1f) / (Interval + Chan);
    }

    public enum StageMode { Main, Daily, Escort }

    /// <summary>一波的兵种配比：累计阈值，Base + Grow × 波次，From 波起出现。</summary>
    public struct TroopMix
    {
        public EnemyKind Kind;
        public float Base, Grow;
        public int From;
        public TroopMix(EnemyKind k, float b, float g, int from) { Kind = k; Base = b; Grow = g; From = from; }
    }

    /// <summary>一关的配置。</summary>
    public sealed class LevelDef
    {
        public int No, Chapter, Index;
        public string Name, Intro, Bg = "battle_bg";
        public int Waves = 10, BossWave = 4, RageWave = 8;
        public int[] EliteWaves = { }, PorterWaves = { };
        public int PorterCount = 1;
        public EnemyKind[] EliteKinds = { EnemyKind.Elite };
        public EnemyKind BossKind = EnemyKind.Boss;
        public float BossMul = 1, HpMul = 1, AtkMul = 1, CountMul = 1;
        public TroopMix[] Troops = Defs.Mix1;
        /// <summary>关卡增益：某一职业伤害提高。</summary>
        public Role? BuffRole;
        public float BuffPct;
        public float WallHp = 6000;
        public int StartCoins = 100;
        public StageMode Mode = StageMode.Main;
        public string Title => Mode == StageMode.Main ? $"第{No}关 · {Name}" : Name;
        public string BossName => Defs.Enemy(BossKind).Name;
        public bool IsChapterBoss => Index == 5 || Index == 10;
        /// <summary>本关主统领（逢5/10关为守关大首领，普通关为第4波领军精英统领，用于城门前展示与敌情）。</summary>
        public EnemyKind LeaderKind => BossWave > 0 ? BossKind : (EliteKinds != null && EliteKinds.Length > 0 ? EliteKinds[0] : EnemyKind.Elite);
        public string BuffText => BuffRole.HasValue ? $"{Defs.RoleName(BuffRole.Value)}伤害 +{(int)(BuffPct * 100 + 0.5f)}%" : "";
    }

    public enum EnemyKind
    {
        Soldier, Shield, Cavalry, Crossbow, Elite, Porter, Boss,
        Hawk, Armored, FireBomb, ChainHorse, Luan, ShiWen, HuYan, GaoQiu,
        Diver, Farmer, Hound, Rattan, Taoist, Berserker, Catapult, Lantern, Scout, Brute,
        HeTao, ZhuChaofeng, ZengKui, HanTao, LiuMenglong,
        WaterChief, CrossbowCapt, GoldenEagle, IronPagoda, HighPriest, GiantBrute, FireCart,
    }

    public enum EnemyRank { Minion, Elite, Boss }

    public sealed class EnemyDef
    {
        public EnemyKind Kind;
        public string Name, Art, Desc;
        public float Hp, Speed, WallDps, Size;
        public int Coin;
        /// <summary>远程兵停在这条线上放箭，不贴墙。</summary>
        public float StopY;
        public EnemyRank Rank;
        public bool Flying;
        /// <summary>受物理伤害减免；受法术（火、雷、风）伤害加成；被射手克制。</summary>
        public float PhysResist, MagicWeak, ArcherWeak;
        public bool Big => Rank != EnemyRank.Minion;
        public bool IsBoss => Rank == EnemyRank.Boss;
    }

    /// <summary>好汉专属强化。Star 为满星额外技能，只在合成满星时三选一；Ult 是传说好汉的「大招」卡，混在强化三选一里随机出。</summary>
    public sealed class PerkDef
    {
        public string Id, Name, Desc;
        public HeroId Hero;
        public int Max = 1;
        public float Weight = 1;
        public Eff Eff;
        public float V;
        public bool Star, Ult;
        /// <summary>好汉等级解锁的选项：1 = 5 级解锁的「爆发」，2 = 20 级解锁的「最强」；没到等级不进卡池。</summary>
        public int Opt;
        public PerkKind Kind;
        /// <summary>取舍卡的代价（V2 为负）。</summary>
        public bool Has2;
        public Eff Eff2;
        public float V2;
        /// <summary>进阶卡的前置强化；同一好汉 Group 相同的卡只能拿一张。</summary>
        public string Req, Group;
    }

    /// <summary>战场坐标：1 单位 = 设计稿 100 像素，原点在 1080×1920 正中，y 朝上。</summary>
    public static class Layout
    {
        public const float HalfW = 5.4f;
        public const float WallRowY = -5.05f;
        public const float FrontRowY = -3.85f;
        public const float StopY = -3.05f;
        public const float SpawnY = 7.9f;
        /// <summary>出了寨门、走过这条线才会被锁定，让官军先涌进场地。</summary>
        public const float EngageY = 5.2f;
        /// <summary>替天行道的黄半圆：圆心在城墙中点，半径到战场左右边，只朝上。点选范围和实际命中用同一条。</summary>
        public static bool InLordRange(V2 p)
        {
            float dx = p.X;
            float dy = p.Y - WallRowY;
            if (dy < 0f) return false;
            return dx * dx + dy * dy <= HalfW * HalfW;
        }

        /// <summary>剑气从寨墙中点出手，刃口一路飞到半圆边上。</summary>
        public static readonly V2 LordOrigin = new V2(0f, WallRowY);

        /// <summary>刃口从寨主扫到 p 的秒数。伤害和画面都按这个时刻落下。</summary>
        public static float LordHitDelay(V2 p) => (p - LordOrigin).Len / Defs.LordWaveSpeed;

        /// <summary>剑气整段飞行时间：刃口到半圆边。</summary>
        public static float LordFlightTime => HalfW / Defs.LordWaveSpeed;

        public const float SlotGap = 1.36f;
        public const int BaseSlots = 7;
        public const int MaxSlots = 12;
        public const float RoadHalfW = 2.85f;
        public static readonly float[] GateX = { -3.05f, 3.05f };

        /// <summary>按纵坐标收束石板路半宽：刚出城门时对齐门洞，踏上大路后严格留在两侧路肩以内。</summary>
        public static float RoadMaxX(float y, float size = 1f)
        {
            float road = System.Math.Max(0.8f, RoadHalfW - size * 0.22f);
            if (y <= SpawnY - 1.35f) return road;
            float gate = GateX[1] + 0.16f;
            float t = M.Clamp01((y - (SpawnY - 1.35f)) / 0.85f);
            return road + (gate - road) * t;
        }

        public static V2 SlotPos(int i)
        {
            if (i < BaseSlots) return new V2((i - 3) * SlotGap, WallRowY);
            int[] cols = { 3, 1, 5, 2, 4 };
            return new V2((cols[i - BaseSlots] - 3) * SlotGap, FrontRowY);
        }
    }

    public static class Defs
    {
        /// <summary>
        /// 伤害系数 Coef 是好汉攻击力的倍数（寨主初始攻击 50）。每位好汉一个带冷却的技能，冷却越长单次越重，
        /// 同稀有度各职业每秒输出相近：射手单体稳定，战士近身爆发，炮手、法师吃范围，控制伤害低但控场，辅助不打伤害只加持。
        /// 稀有度越高同职业输出约高两成；传说好汉另有大招，要在局内强化里抽到才解锁。
        /// </summary>
        public static readonly HeroDef[] Heroes =
        {
            // ---------- 初始四人与早期入伙 ----------
            new HeroDef { Id = HeroId.HuaRong, Name = "华木匠", Nick = "气钉神手", Kind = Sim.Role.Archer, Rarity = 3, Art = "hero_huarong",
                Shot = ShotKind.Arrow, Coef = 1.42f, Interval = 2.0f, Chain = 1, PierceGrow = 0.18f, AtkName = "高压射钉", AtkIcon = "wp_nail", Proj = "wp_nail", ProjSize = 0.68f, Tint = "B45CFF", Noun = "钢钉",
                PassiveName = "百步穿钉", PassiveEff = Eff.Crit, PassiveV = 0.18f, Desc = "改装高压射钉枪穿透外星军，每穿一敌伤害递增" },
            new HeroDef { Id = HeroId.LingZhen, Name = "凌焊神", Nick = "野生发明家", Kind = Sim.Role.Bomber, Rarity = 3, Art = "hero_lingzhen", Element = "火系",
                Shot = ShotKind.Bomb, Coef = 2.85f, Interval = 4.6f, Radius = 1.25f, Knock = 0.32f, AtkName = "煤气罐炮", AtkIcon = "wp_gascan", Proj = "wp_gascan", ProjSize = 1.15f, Tint = "B45CFF", Noun = "重炮",
                PassiveName = "焊装扩容", PassiveEff = Eff.Area, PassiveV = 0.25f, Desc = "土法焊接煤气罐迫击炮，大口径震退外星潮" },
            new HeroDef { Id = HeroId.GongSun, Name = "孙电工", Nick = "万伏雷神", Kind = Sim.Role.Mage, Rarity = 4, Art = "hero_gongsun", Element = "电系",
                Shot = ShotKind.Lightning, Coef = 2.60f, Interval = 8.5f, Radius = 0.8f, Chain = 4, AtkName = "高压电弧", AtkIcon = "fx_zap", Tint = "FFE252", Noun = "电弧",
                Ult = UltKind.Thunder, UltName = "拉闸放雷", UltIcon = "fx_lightning", UltCoef = 2.8f, UltCd = 30, UltN = 8, UltStun = 1f, UltRadius = 1.15f,
                UltTip = "8道万伏雷暴劈向敌群\n每道麻痹1秒",
                PassiveName = "并网增幅", PassiveEff = Eff.Chain, PassiveV = 2, Desc = "背负双塔超导变压器引万伏电弧连环弹射，克制重甲" },
            new HeroDef { Id = HeroId.WuSong, Name = "武教练", Nick = "散打拳王", Kind = Sim.Role.Fighter, Rarity = 3, Art = "hero_wusong",
                Shot = ShotKind.Punch, Coef = 2.95f, Interval = 2.7f, Range = 4.8f, Radius = 0.92f, Knock = 0.65f, AtkName = "重炮铁拳", AtkIcon = "wp_ironfist", Proj = "wp_ironfist", Tint = "FFB038", Noun = "铁拳",
                PassiveName = "专打硬茬", PassiveEff = Eff.Elite, PassiveV = 0.6f, Desc = "冠军重拳势大力沉，震退贴墙外星军" },
            new HeroDef { Id = HeroId.ZhangQing, Name = "张雀神", Nick = "麻将宗师", Kind = Sim.Role.Archer, Rarity = 3, Art = "hero_zhangqing",
                Shot = ShotKind.Stone, Coef = 1.15f, Interval = 2.0f, Radius = 0.32f, Chain = 2, AtkName = "雀神飞牌", AtkIcon = "fx_rock0", Tint = "38E898", Noun = "麻将牌",
                PassiveName = "听牌自摸", PassiveEff = Eff.Chain, PassiveV = 2, Desc = "甩出麻将牌在外星人脑门之间连环弹射" },
            new HeroDef { Id = HeroId.LinChong, Name = "林班长", Nick = "液氮兵王", Kind = Sim.Role.Fighter, Rarity = 4, Art = "hero_linchong",
                Shot = ShotKind.Spear, Coef = 3.40f, Interval = 3.2f, Range = 6.2f, Radius = 0.55f, Knock = 0.30f, AtkName = "液氮冰炮", AtkIcon = "wp_snakespear", Proj = "wp_snakespear", Tint = "4CE8FF", Noun = "寒流",
                Ult = UltKind.Frost, UltName = "冷库全开", UltIcon = "fx_ice", UltCoef = 13.5f, UltCd = 30, UltRadius = 1.9f, UltStun = 2.5f,
                UltTip = "极寒液氮冰封大片敌人\n冻住2.5秒",
                PassiveName = "退伍兵王", PassiveEff = Eff.Crit, PassiveV = 0.2f, Desc = "背负双联液氮罐喷射超导寒流贯穿整列，攻击距离远" },
            new HeroDef { Id = HeroId.LuZhiShen, Name = "鲁大力", Nick = "筑路猛汉", Kind = Sim.Role.Fighter, Rarity = 3, Art = "hero_luzhishen",
                Shot = ShotKind.Slam, Coef = 3.80f, Interval = 3.5f, Range = 5.2f, Radius = 1.2f, Knock = 0.55f, AtkName = "千斤夯锤", AtkIcon = "wp_staff", Proj = "wp_staff", Tint = "B88CFF", Noun = "夯锤",
                PassiveName = "天生神力", PassiveEff = Eff.Speed, PassiveV = 0.2f, Desc = "筑路打夯大石锤腾空砸地，大范围震退" },
            new HeroDef { Id = HeroId.WuYong, Name = "吴校长", Nick = "蒲扇智囊", Kind = Sim.Role.Support, Rarity = 3, Art = "hero_wuyong", Element = "风系",
                Shot = ShotKind.Wind, Interval = 28f, Buff = UltKind.Bless, BuffV = 1f, AtkName = "摇扇鼓劲", AtkIcon = "ic_fan", Tint = "66E4FF", Noun = "凉风",
                Aura = AuraKind.Speed, AuraV = 0.04f,
                PassiveName = "勤俭持村", PassiveEff = Eff.Coin, PassiveV = 15, Desc = "摇扇鼓舞输出乡亲加攻速，在场提升全村攻速" },

            // ---------- 传说 ----------
            new HeroDef { Id = HeroId.LuJunyi, Name = "卢宗师", Nick = "醒狮武王", Kind = Sim.Role.Fighter, Rarity = 4, Art = "hero_lujunyi",
                Shot = ShotKind.Spear, Coef = 3.70f, Interval = 3.2f, Range = 6.0f, Radius = 0.8f, Knock = 0.32f, AtkName = "醒狮金棍", AtkIcon = "wp_spear", Proj = "wp_spear", Tint = "FFD448", Noun = "金棍",
                Ult = UltKind.Sweep, UltName = "横扫村口", UltIcon = "fx_wave", UltCoef = 10.0f, UltCd = 30, UltN = 5,
                UltTip = "金龙电光棍横扫防线前一整排\n五段击飞",
                PassiveName = "醒狮宗师", PassiveEff = Eff.Crit, PassiveV = 0.15f, Desc = "金狮披挂加持高压电光武棍宽幅横扫，一次挑翻一列" },
            new HeroDef { Id = HeroId.GuanSheng, Name = "关大爷", Nick = "镇村刀神", Kind = Sim.Role.Fighter, Rarity = 4, Art = "hero_guansheng",
                Shot = ShotKind.Slam, Coef = 4.35f, Interval = 3.5f, Range = 5.4f, Radius = 1.3f, Knock = 0.55f, AtkName = "热熔重刀", AtkIcon = "wp_broadsword", Proj = "wp_broadsword", Tint = "FF6A1E", Noun = "大刀",
                Ult = UltKind.Sweep, UltName = "社火刀阵", UltIcon = "fx_shock", UltCoef = 11.5f, UltCd = 30, UltN = 5,
                UltTip = "超导热熔重刀横扫防线前\n五段重劈",
                PassiveName = "老当益壮", PassiveEff = Eff.Elite, PassiveV = 0.5f, Desc = "背插社火双旗挥烧红弹簧钢重刀腾空劈斩，范围大伤害高" },
            new HeroDef { Id = HeroId.YanQing, Name = "小燕子", Nick = "改装极客", Kind = Sim.Role.Archer, Rarity = 4, Art = "hero_yanqing",
                Shot = ShotKind.Arrow, Coef = 0.58f, Interval = 1.9f, Count = 3, AtkName = "三联钉枪", AtkIcon = "wp_railnail", Proj = "wp_railnail", ProjSize = 0.72f, Tint = "FFD84A", Noun = "钢钉",
                Ult = UltKind.Snipe, UltName = "超距狙击", UltIcon = "fx_goldarrow", UltCoef = 11f, UltCd = 30,
                UltTip = "锁定场上最强外星头目\n一发重创",
                PassiveName = "双翼供弹", PassiveEff = Eff.Speed, PassiveV = 0.2f, Desc = "双翼无人机辅助三联电磁射钉，场上满四位再添一钉" },
            new HeroDef { Id = HeroId.FanRui, Name = "樊飞手", Nick = "狂风飞手", Kind = Sim.Role.Mage, Rarity = 4, Art = "hero_fanrui", Element = "风系",
                Shot = ShotKind.Wind, Coef = 0.88f, Interval = 12.0f, Chan = 3f, Tick = 0.25f, Radius = 1.1f, Slow = 1.5f, AtkName = "旋风涡流", AtkIcon = "fx_wind_shell", Noun = "涡流", Tint = "5EE8FF",
                Ult = UltKind.Tornado, UltName = "十级狂飙", UltIcon = "fx_spin_vortex", UltCoef = 9.0f, UltCd = 30, UltRadius = 2.2f, UltStun = 1f,
                UltTip = "巨型八旋翼无人机卷起敌群\n眩晕1秒",
                PassiveName = "涡轮增压", PassiveEff = Eff.Dmg, PassiveV = 0.2f, Desc = "操控巨型八旋翼植保机吹出强风持续绞杀，范围减速" },
            new HeroDef { Id = HeroId.HuSanniang, Name = "胡三妹", Nick = "套马飒姐", Kind = Sim.Role.Control, Rarity = 4, Art = "hero_husanniang",
                Shot = ShotKind.Lasso, Coef = 2.90f, Interval = 5.2f, Stun = 1.6f, AtkName = "电磁红索", AtkIcon = "wp_lasso", Proj = "wp_lasso", ProjSpin = true, Noun = "套索", Tint = "FF3E38",
                Ult = UltKind.Bind, UltName = "五花大绑", UltIcon = "wp_lasso", UltCoef = 6.6f, UltCd = 30, UltN = 5, UltStun = 2.5f,
                UltTip = "同时套住5个外星人\n优先精英首领",
                PassiveName = "套马巧劲", PassiveEff = Eff.Stun, PassiveV = 0.4f, Desc = "电磁绞盘驱动发光红索精准锁敌，连外星首领也能捆住" },
            new HeroDef { Id = HeroId.AnDaoquan, Name = "安神医", Nick = "赤脚神医", Kind = Sim.Role.Support, Rarity = 4, Art = "hero_andaoquan", Element = "风系",
                Shot = ShotKind.Wind, Interval = 20f, Buff = UltKind.Mend, BuffV = 0.08f, AtkName = "醒脑修墙", AtkIcon = "ic_heart", Noun = "汤药", Tint = "8FF0A0",
                Aura = AuraKind.Heal,
                Ult = UltKind.Heal, UltName = "妙手加固", UltIcon = "ic_heart", UltCoef = 0.3f, UltCd = 40,
                UltTip = "村口防线回复30%\n解除全部晕眩",
                PassiveName = "祖传秘方", PassiveEff = Eff.Aura, PassiveV = 0.5f, Desc = "翠玉药葫芦与悬浮金针抢修村口防线，解除乡亲晕眩" },
            new HeroDef { Id = HeroId.DaiZong, Name = "戴领舞", Nick = "广场舞王", Kind = Sim.Role.Support, Rarity = 4, Art = "hero_daizong",
                Shot = ShotKind.Stone, Interval = 20f, Buff = UltKind.Rush, BuffV = 0.3f, AtkName = "动感节拍", AtkIcon = "ic_fast", Noun = "节拍", Tint = "FFD84A",
                Aura = AuraKind.Charge, AuraV = 0.04f,
                Ult = UltKind.Haste, UltName = "最炫神曲", UltIcon = "ic_fast", UltCd = 35,
                UltTip = "全村攻速+60%\n持续8秒",
                PassiveName = "领舞气场", PassiveEff = Eff.Aura, PassiveV = 0.5f, Desc = "悬浮低音炮音响阵劲曲带动全队缩短冷却，技能转得更快" },
            new HeroDef { Id = HeroId.QinMing, Name = "秦厂长", Nick = "花炮狂人", Kind = Sim.Role.Bomber, Rarity = 4, Art = "hero_qinming", Element = "火系",
                Shot = ShotKind.Fireball, Coef = 3.40f, Interval = 4.5f, Radius = 1.3f, Dot = 0.45f, AtkName = "高爆礼花", AtkIcon = "wp_firework", Proj = "wp_firework", ProjSize = 1.05f, Tint = "FFD24A", Noun = "礼花",
                Ult = UltKind.Meteor, UltName = "除夕总攻", UltIcon = "wp_firework", UltCoef = 3.8f, UltCd = 30, UltN = 10, UltRadius = 1.2f,
                UltTip = "漫天砸落10颗巨型礼花弹\n轰炸敌群",
                PassiveName = "黑药加量", PassiveEff = Eff.Area, PassiveV = 0.25f, Desc = "背负金龙礼花巢轰出庆典重型礼花弹，大招十发洗地" },

            // ---------- 史诗 ----------
            new HeroDef { Id = HeroId.LiKui, Name = "李铁牛", Nick = "油锯猛汉", Kind = Sim.Role.Fighter, Rarity = 3, Art = "hero_likui",
                Shot = ShotKind.Punch, Coef = 2.95f, Interval = 2.9f, Range = 4.8f, Radius = 1.05f, Knock = 0.52f, AtkName = "旋风油锯", AtkIcon = "wp_axe_spin", Proj = "wp_axe", ProjSpin = true, Tint = "FF6E1A", Noun = "油锯",
                PassiveName = "双锯开山", PassiveEff = Eff.Area, PassiveV = 0.3f, Desc = "双持大马力伐木油锯呼啸切割，击退近墙外星军" },
            new HeroDef { Id = HeroId.QiaoDaoqing, Name = "乔老板", Nick = "烈火烤王", Kind = Sim.Role.Mage, Rarity = 3, Art = "hero_qiaodaoqing", Element = "火系",
                Shot = ShotKind.Beam, Coef = 0.58f, Interval = 11.5f, Chan = 3f, Tick = 0.2f, Radius = 0.45f, AtkName = "炙烤火舌", AtkIcon = "fx_fireball", Noun = "火舌", Tint = "FF8A2A",
                PassiveName = "猛火炙烤", PassiveEff = Eff.Crit, PassiveV = 0.15f, Desc = "喷出高温烤枪火舌持续融甲，火伤克制重甲" },
            new HeroDef { Id = HeroId.ZhuWu, Name = "朱棋王", Nick = "残局大爷", Kind = Sim.Role.Control, Rarity = 3, Art = "hero_zhuwu", Element = "风系",
                Shot = ShotKind.Wind, Coef = 1.9f, Interval = 6.0f, Radius = 1.6f, Slow = 3f, AtkName = "楚河棋阵", AtkIcon = "wp_chess", Proj = "wp_chess", ProjSpin = true, ProjSize = 0.90f, Noun = "棋阵", Tint = "66B8FF",
                PassiveName = "老谋深算", PassiveEff = Eff.Slow, PassiveV = 1f, Desc = "展开强磁象棋大阵困住敌群，长时间减速" },
            new HeroDef { Id = HeroId.XuNing, Name = "徐农机", Nick = "铁臂机手", Kind = Sim.Role.Control, Rarity = 3, Art = "hero_xuning",
                Shot = ShotKind.Spear, Coef = 2.95f, Interval = 4.6f, Range = 6.0f, Radius = 0.6f, Slow = 2f, AtkName = "液压抓钳", AtkIcon = "wp_hookspear", Proj = "wp_hookspear", Noun = "抓钳", Tint = "FFD27A",
                PassiveName = "专拆底盘", PassiveEff = Eff.Cav, PassiveV = 0.5f, Desc = "重型挖掘机液压钢抓钳拖慢敌军，专克飞艇与机甲兽" },
            new HeroDef { Id = HeroId.ShanTinggui, Name = "单消防", Nick = "高压水手", Kind = Sim.Role.Mage, Rarity = 3, Art = "hero_shantinggui", Element = "水系",
                Shot = ShotKind.Beam, Coef = 0.54f, Interval = 11.5f, Chan = 3f, Tick = 0.2f, Radius = 0.5f, Slow = 1.5f, AtkName = "高压水柱", AtkIcon = "fx_icecrystal", Noun = "水柱", Tint = "6FC8FF",
                PassiveName = "增压水泵", PassiveEff = Eff.Dmg, PassiveV = 0.2f, Desc = "大功率水炮冲刷一整条直线，沿途强力减速" },
            new HeroDef { Id = HeroId.WeiDingguo, Name = "魏油匠", Nick = "热油掌柜", Kind = Sim.Role.Bomber, Rarity = 3, Art = "hero_weidingguo", Element = "火系",
                Shot = ShotKind.Bomb, Coef = 1.85f, Interval = 4.5f, Radius = 1.15f, Dot = 0.70f, AntiHeal = true, AtkName = "滚烫油罐", AtkIcon = "wp_oilpot", Proj = "wp_oilpot", ProjSize = 1.10f, Noun = "油罐", Tint = "FF6422",
                PassiveName = "火上浇油", PassiveEff = Eff.Burn, PassiveV = 0.45f, Desc = "投出滚烫红油罐铺开火海，持续灼烧并抑制纳米修复" },

            // ---------- 稀有 ----------
            new HeroDef { Id = HeroId.ShiXiu, Name = "王铁柱", Nick = "快刀屠夫", Kind = Sim.Role.Fighter, Rarity = 2, Art = "hero_shixiu",
                Shot = ShotKind.Punch, Coef = 1.85f, Interval = 2.2f, Range = 4.8f, Radius = 0.72f, Knock = 0.34f, AtkName = "剔骨快刀", AtkIcon = "wp_dao", Proj = "wp_dao", ProjSize = 0.94f, Tint = "CBE8FF", Noun = "快刀",
                PassiveName = "刀法利落", PassiveEff = Eff.Crit, PassiveV = 0.2f, Desc = "宽背精钢剔骨斩骨刀凌厉劈斩，暴击极高" },
            new HeroDef { Id = HeroId.XieZhen, Name = "二狗子", Nick = "弹弓皮猴", Kind = Sim.Role.Archer, Rarity = 2, Art = "hero_xiezhen",
                Shot = ShotKind.Arrow, Coef = 1.18f, Interval = 1.9f, AtkName = "穿云钢珠", AtkIcon = "wp_pellet", Proj = "wp_pellet", ProjSize = 0.30f, Tint = "9ED8FF", Noun = "钢珠",
                PassiveName = "打鸟专家", PassiveEff = Eff.Fly, PassiveV = 0.5f, Desc = "钛合金弹弓精准点射，专克空中飞碟" },
            new HeroDef { Id = HeroId.XieBao, Name = "王大壮", Nick = "辣叉壮汉", Kind = Sim.Role.Archer, Rarity = 2, Art = "hero_xiebao",
                Shot = ShotKind.Arrow, Coef = 1.15f, Interval = 2.1f, Chain = 1, Dot = 0.35f, AtkName = "魔鬼辣叉", AtkIcon = "wp_fork", Proj = "wp_fork", ProjSize = 0.88f, Tint = "FF4222", Noun = "辣叉",
                PassiveName = "双倍辣毒", PassiveEff = Eff.Chain, PassiveV = 1, Desc = "蘸满特辣红油的不锈钢农叉穿透外星人并附带持续辣毒" },
            new HeroDef { Id = HeroId.MaLing, Name = "马包工", Nick = "红砖队长", Kind = Sim.Role.Mage, Rarity = 2, Art = "hero_maling", Element = "磁系",
                Shot = ShotKind.Stone, Coef = 2.00f, Interval = 3.8f, Radius = 0.45f, Stun = 0.8f, StunChance = 0.35f, AtkName = "磁化红砖", AtkIcon = "wp_goldbrick", Proj = "wp_goldbrick", ProjSpin = true, Noun = "红砖", Tint = "FFD24A",
                PassiveName = "砌墙快手", PassiveEff = Eff.Speed, PassiveV = 0.2f, Desc = "甩出电磁实心红砖从天砸落，高几率拍晕外星人" },
            new HeroDef { Id = HeroId.KongLiang, Name = "陈喜子", Nick = "炮仗小哥", Kind = Sim.Role.Bomber, Rarity = 2, Art = "hero_kongliang", Element = "火系",
                Shot = ShotKind.Bomb, Coef = 1.82f, Interval = 3.7f, Radius = 0.95f, AtkName = "大二踢脚", AtkIcon = "wp_cracker", Proj = "wp_cracker", ProjSize = 1.02f, Tint = "FF3B2E", Noun = "炮仗",
                PassiveName = "添药加响", PassiveEff = Eff.Area, PassiveV = 0.22f, Desc = "掷出大号双响二踢脚，炸翻扎堆小灰人" },
            new HeroDef { Id = HeroId.TangLong, Name = "唐五金", Nick = "维修老铁", Kind = Sim.Role.Support, Rarity = 2, Art = "hero_tanglong",
                Shot = ShotKind.Stone, Interval = 24f, Buff = UltKind.Forge, BuffV = 0.4f, AtkName = "家伙改装", AtkIcon = "wp_jian", Noun = "扳手", Tint = "A8AEB8",
                Aura = AuraKind.Dmg, AuraV = 0.03f,
                PassiveName = "五金世家", PassiveEff = Eff.Aura, PassiveV = 0.5f, Desc = "定时加固家伙提升伤害，在场提高全村伤害" },
            new HeroDef { Id = HeroId.SunErniang, Name = "孙辣妹", Nick = "辣坊老板娘", Kind = Sim.Role.Control, Rarity = 2, Art = "hero_sunerniang", Element = "风系",
                Shot = ShotKind.Wind, Coef = 1.67f, Interval = 6.0f, Radius = 1.3f, Slow = 2f, Stun = 1.2f, StunChance = 0.5f, AtkName = "魔鬼辣雾", AtkIcon = "wp_chili", Proj = "wp_chili", ProjSpin = true, ProjSize = 0.86f, Noun = "辣粉", Tint = "FF4824",
                PassiveName = "特辣配方", PassiveEff = Eff.Stun, PassiveV = 0.15f, Desc = "一瓢魔鬼辣椒粉呛晕一片外星人" },
            new HeroDef { Id = HeroId.RuanXiaoqi, Name = "阮老七", Nick = "鱼塘塘主", Kind = Sim.Role.Control, Rarity = 2, Art = "hero_ruanxiaoqi",
                Shot = ShotKind.Wind, Coef = 1.3f, Interval = 6.0f, Radius = 1.3f, Stun = 1.2f, AtkName = "深水大网", AtkIcon = "wp_net", Proj = "wp_net", ProjSpin = true, Noun = "渔网", Tint = "5AD8FF",
                PassiveName = "撒网老手", PassiveEff = Eff.Area, PassiveV = 0.3f, Desc = "加厚尼龙大网撒下，定住一片外星杂兵" },
            new HeroDef { Id = HeroId.ShiQian, Name = "小迁子", Nick = "闪送小哥", Kind = Sim.Role.Support, Rarity = 2, Art = "hero_shiqian",
                Shot = ShotKind.Arrow, Interval = 15f, Buff = UltKind.Steal, BuffV = 1f, AtkName = "顺手拆件", AtkIcon = "wp_jian", Tint = "FF5842", Noun = "能量币",
                Aura = AuraKind.Coin, AuraV = 0.1f,
                PassiveName = "走街串巷", PassiveEff = Eff.Aura, PassiveV = 0.5f, Desc = "顺走能量币并拆松强敌护甲，在场击杀多掉能量币" },
            new HeroDef { Id = HeroId.JiangJing, Name = "蒋会计", Nick = "铁算会计", Kind = Sim.Role.Support, Rarity = 2, Art = "hero_jiangjing",
                Shot = ShotKind.Stone, Interval = 18f, Buff = UltKind.Interest, BuffV = 0.18f, AtkName = "经费补贴", AtkIcon = "ic_coins", Noun = "利息", Tint = "FFD24A",
                Aura = AuraKind.Interest, AuraV = 0.01f,
                PassiveName = "精打细算", PassiveEff = Eff.Aura, PassiveV = 0.5f, Desc = "结算补贴利息并鼓舞攻速，在场能量币生利息" },
        };

        public static HeroDef Hero(HeroId id) => Heroes[(int)id];
        public static int HeroCount => Heroes.Length;
        public static readonly int EffCount = System.Enum.GetValues(typeof(Eff)).Length;
        public const int RoleCount = 6;

        public static string RoleName(Role r)
        {
            switch (r)
            {
                case Sim.Role.Archer: return "射手";
                case Sim.Role.Bomber: return "炮手";
                case Sim.Role.Mage: return "奇人";
                case Sim.Role.Fighter: return "战士";
                case Sim.Role.Control: return "控制";
                default: return "辅助";
            }
        }

        /// <summary>职业图标与主色。</summary>
        public static string RoleIcon(Role r) => "role_" + ((int)r);
        public static readonly string[] RoleColors = { "4FA3E0", "E0753A", "9B6BE0", "D8463A", "4CB86A", "E0B23A" };

        public static readonly Role[] RoleOrder = { Sim.Role.Fighter, Sim.Role.Archer, Sim.Role.Mage, Sim.Role.Bomber, Sim.Role.Control, Sim.Role.Support };

        static EnemyDef E(EnemyKind k, string name, string art, float hp, float speed, float dps, float size, int coin, string desc,
            EnemyRank rank = EnemyRank.Minion, float stopY = Layout.StopY)
            => new EnemyDef { Kind = k, Name = name, Art = art, Hp = hp, Speed = speed, WallDps = dps, Size = size, Coin = coin, Desc = desc, Rank = rank, StopY = stopY };

        public static readonly EnemyDef[] Enemies =
        {
            E(EnemyKind.Soldier, "大眼小灰人", "en_soldier", 72, 0.424f, 12, 0.95f, 16, "最常见的外星先遣杂兵，需多番射击方能击退"),
            new EnemyDef { Kind = EnemyKind.Shield, Name = "磁盾外星兵", Art = "en_shield", Hp = 164, Speed = 0.292f, WallDps = 18, Size = 1.15f, Coin = 32,
                Desc = "举着能量合金盾，减免物理伤害，怕电火风奇人轰击", PhysResist = 0.25f, MagicWeak = 0.20f, StopY = Layout.StopY },
            E(EnemyKind.Cavalry, "飞艇突击兵", "en_cavalry", 64, 0.672f, 11, 1.15f, 24, "骑悬浮快艇跑得最快，冲到防线下才停"),
            E(EnemyKind.Crossbow, "等离子枪手", "en_crossbow", 56, 0.409f, 11, 0.95f, 22, "停在半路发射光弹，近战够不着", stopY: 0.6f),
            E(EnemyKind.Elite, "外星百夫长", "en_elite", 1020, 0.310f, 70, 1.6f, 200, "外星登陆队百夫长，血厚攻高", EnemyRank.Elite),
            E(EnemyKind.Porter, "样本搬运工", "en_porter", 480, 0.365f, 0, 1.25f, 120, "抱着母舰能量箱的运输工，只在截获补给时出现"),
            E(EnemyKind.Boss, "咕噜王", "en_boss", 5800, 0.295f, 185, 2.6f, 320, "外星先锋司令，震响增幅波令周围外星军加速", EnemyRank.Boss),
            new EnemyDef { Kind = EnemyKind.Hawk, Name = "侦察小飞碟", Art = "en_hawk", Hp = 46, Speed = 0.585f, WallDps = 11, Size = 0.9f, Coin = 20,
                Desc = "空中飞行单位，战士打不到，射手克制", Flying = true, ArcherWeak = 0.45f, StopY = Layout.StopY + 0.5f },
            new EnemyDef { Kind = EnemyKind.Armored, Name = "重甲罐头兵", Art = "en_armored", Hp = 180, Speed = 0.292f, WallDps = 20, Size = 1.15f, Coin = 40,
                Desc = "太空重甲：大幅减免物理伤害，怕电火风奇人能量", PhysResist = 0.45f, MagicWeak = 0.40f, StopY = Layout.StopY },
            E(EnemyKind.FireBomb, "抱罐自爆虫", "en_firebomb", 68, 0.585f, 195, 0.95f, 28, "冲到防线下自爆；半路击杀会炸伤身边外星军"),
            new EnemyDef { Kind = EnemyKind.ChainHorse, Name = "磁链机甲兽", Art = "en_chainhorse", Hp = 860, Speed = 0.351f, WallDps = 64, Size = 1.7f, Coin = 180,
                Desc = "磁链相连的重装战兽，物理减伤，抓钩与奇人克制", Rank = EnemyRank.Elite, PhysResist = 0.35f, MagicWeak = 0.20f, StopY = Layout.StopY },
            E(EnemyKind.Luan, "重锤机神", "en_luan", 6800, 0.295f, 180, 2.6f, 360, "外星重装机甲统领，掷出电磁飞锤砸晕守村乡亲", EnemyRank.Boss),
            E(EnemyKind.ShiWen, "光刃剑圣", "en_shiwen", 7600, 0.255f, 175, 2.6f, 400, "高阶外星剑圣，超光速冲锋突进，残血进入狂暴", EnemyRank.Boss),
            E(EnemyKind.HuYan, "铁骑舰长", "en_huyan", 8400, 0.285f, 180, 2.7f, 440, "外星铁骑统帅，不断折跃传送飞艇突击编队", EnemyRank.Boss),
            E(EnemyKind.GaoQiu, "波波大帝", "en_gaoqiu", 10200, 0.280f, 190, 2.6f, 480, "入侵地球的外星皇帝，抽射行星火球砸墙，带护盾", EnemyRank.Boss),
            E(EnemyKind.Diver, "相位潜行怪", "en_diver", 64, 0.482f, 12, 0.95f, 24, "时不时开启光学潜行，潜着时刀枪不入"),
            E(EnemyKind.Farmer, "克隆小绿人", "en_farmer", 48, 0.526f, 9, 0.9f, 14, "母舰批量打印的廉价克隆兵，嗷嗷叫着成群涌来"),
            E(EnemyKind.Hound, "机械三眼犬", "en_hound", 26, 0.833f, 6, 0.75f, 8, "两条一群四足狂奔，跑得飞快"),
            new EnemyDef { Kind = EnemyKind.Rattan, Name = "折光护盾兵", Art = "en_rattan", Hp = 80, Speed = 0.351f, WallDps = 15, Size = 1.05f, Coin = 30,
                Desc = "折光晶片能挡下最先的两次攻击，并减免物理伤害", PhysResist = 0.20f, StopY = Layout.StopY },
            E(EnemyKind.Taoist, "纳米医疗官", "en_taoist", 84, 0.365f, 10, 1.0f, 36, "站在后面释放纳米波，给身边外星军回血", stopY: 1.6f),
            E(EnemyKind.Berserker, "红温狂暴兵", "en_berserker", 112, 0.438f, 18, 1.0f, 32, "残血时红温过载：两秒内受伤减半，狂奔冲墙"),
            new EnemyDef { Kind = EnemyKind.Catapult, Name = "重型电浆车", Art = "en_catapult", Hp = 220, Speed = 0.234f, WallDps = 28, Size = 1.4f, Coin = 52,
                Desc = "远远停下抛射电浆巨弹砸墙，打不退", PhysResist = 0.25f, StopY = 2.8f },
            new EnemyDef { Kind = EnemyKind.Lantern, Name = "漂浮太空雷", Art = "en_lantern", Hp = 42, Speed = 0.380f, WallDps = 165, Size = 0.9f, Coin = 20,
                Desc = "飘到防线上就炸，战士够不着，射手克制", Flying = true, ArcherWeak = 0.45f, StopY = Layout.StopY + 0.5f },
            E(EnemyKind.Scout, "瞬移侦察兵", "en_scout", 54, 0.628f, 11, 0.9f, 22, "挨打时常常瞬移闪身躲开，往前一窜"),
            E(EnemyKind.Brute, "母巢运兵兽", "en_brute", 250, 0.278f, 24, 1.35f, 44, "背舱里藏着三个小灰人，打倒就跳出来"),
            E(EnemyKind.HeTao, "潜航督军", "en_hetao", 5200, 0.295f, 180, 2.6f, 300, "章鱼头外星督军，驾两栖母艇而来，召唤相位潜行怪", EnemyRank.Boss),
            E(EnemyKind.ZhuChaofeng, "星际氪金王", "en_zhucf", 6800, 0.285f, 175, 2.6f, 340, "星际土豪财阀，坐悬浮舱撒星币，张开金光护盾", EnemyRank.Boss),
            E(EnemyKind.ZengKui, "驯兽狂王", "en_zengkui", 7600, 0.235f, 175, 2.6f, 380, "四臂外星猎手，骑六足星兽扑跃突进", EnemyRank.Boss),
            new EnemyDef { Kind = EnemyKind.HanTao, Name = "破城钻头王", Art = "en_hantao", Hp = 8600, Speed = 0.285f, WallDps = 180, Size = 2.7f, Coin = 420,
                Desc = "外星重装破障统领，开巨型钻头车猛撞防线，物理减伤", Rank = EnemyRank.Boss, PhysResist = 0.35f, MagicWeak = 0.25f, StopY = Layout.StopY },
            E(EnemyKind.LiuMenglong, "诺亚登陆舰", "en_liuml", 10000, 0.265f, 190, 2.7f, 460, "多层装甲浮空登陆母舰，展开密集副炮齐射防线", EnemyRank.Boss, stopY: 0.4f),

            // ---------- 9大外星精英矩阵（与百夫长/磁链兽构成3×3满屏图鉴） ----------
            E(EnemyKind.WaterChief, "潜航蛙人长", "en_waterchief", 920, 0.365f, 72, 1.6f, 200, "外星潜航队头目，周期光学潜行刀枪不入并突进破墙", EnemyRank.Elite),
            new EnemyDef { Kind = EnemyKind.CrossbowCapt, Name = "重型光炮长", Art = "en_crossbowcapt", Hp = 880, Speed = 0.310f, WallDps = 62, Size = 1.6f, Coin = 200,
                Desc = "半路立盾架起双联等离子重炮连射防线，近战够不着，怕奇人轰击", Rank = EnemyRank.Elite, MagicWeak = 0.25f, StopY = 0.8f },
            new EnemyDef { Kind = EnemyKind.GoldenEagle, Name = "重装飞碟王", Art = "en_goldeneagle", Hp = 760, Speed = 0.510f, WallDps = 66, Size = 1.65f, Coin = 200,
                Desc = "披挂金钛装甲的巨型战斗飞碟高速扑村，战士打不到，射手克制", Rank = EnemyRank.Elite, Flying = true, ArcherWeak = 0.45f, StopY = Layout.StopY + 0.5f },
            new EnemyDef { Kind = EnemyKind.IronPagoda, Name = "泰坦重甲卫", Art = "en_ironpagoda", Hp = 1120, Speed = 0.295f, WallDps = 74, Size = 1.75f, Coin = 210,
                Desc = "超厚太空铠挡下最先的两次攻击，大幅减免物理伤害，怕电火风能量", Rank = EnemyRank.Elite, PhysResist = 0.45f, MagicWeak = 0.40f, StopY = Layout.StopY },
            new EnemyDef { Kind = EnemyKind.HighPriest, Name = "首席纳米官", Art = "en_highpriest", Hp = 860, Speed = 0.295f, WallDps = 52, Size = 1.6f, Coin = 200,
                Desc = "后排释放强效纳米波，给身边外星军回血并加速冲锋", Rank = EnemyRank.Elite, MagicWeak = 0.20f, StopY = 1.6f },
            new EnemyDef { Kind = EnemyKind.GiantBrute, Name = "巨型母巢甲", Art = "en_giantbrute", Hp = 1080, Speed = 0.300f, WallDps = 76, Size = 1.75f, Coin = 210,
                Desc = "重甲背舱里藏着红温狂暴兵，减免物理伤害，打倒就跳出来狂奔冲墙", Rank = EnemyRank.Elite, PhysResist = 0.25f, StopY = Layout.StopY },
            new EnemyDef { Kind = EnemyKind.FireCart, Name = "护盾巨炮车", Art = "en_firecart", Hp = 920, Speed = 0.220f, WallDps = 60, Size = 1.8f, Coin = 220,
                Desc = "远远停下抛射电浆巨弹砸墙，自带能量护盾并减免物理伤害，怕奇人轰击", Rank = EnemyRank.Elite, PhysResist = 0.30f, MagicWeak = 0.25f, StopY = 2.4f },
        };

        public static EnemyDef Enemy(EnemyKind k) => Enemies[(int)k];

        public static PerkDef[] Perks { get; private set; } = BuildPerks();

        /// <summary>
        /// 每位好汉 7 条：前 4 条进强化三选一（同一条可叠 Max 级），后 3 条是满星额外技能，合成满星时三选一、只给一次。
        /// 传说好汉再多一张「大招」卡，和普通强化一起随机出。
        /// </summary>
        static PerkDef[] BuildPerks()
        {
            var list = new List<PerkDef>();
            void Add(HeroId h, params (string name, Eff e, float v, int max)[] ps)
            {
                var d = Hero(h);
                string key = d.Art.Substring(5);
                for (int i = 0; i < ps.Length; i++)
                {
                    var (name, e, v, max) = ps[i];
                    bool star = i >= 4;
                    (e, v) = Adapt(d, e, v);
                    if (!star) v *= Boost(e);
                    list.Add(new PerkDef
                    {
                        Id = key + "_" + i, Hero = h, Name = name, Eff = e, V = v, Max = star ? 1 : max, Star = star,
                        Desc = EffText(h, e, v),
                    });
                }
                bool sup = d.Kind == Sim.Role.Support;
                string surge = OptNames.Surge[(int)h];
                list.Add(new PerkDef
                {
                    Id = key + "_surge", Hero = h, Name = surge, Opt = 1, Weight = 1.3f,
                    Eff = sup ? Eff.UltPow : Eff.Surge, V = sup ? 0.6f : SurgeChance,
                    Desc = sup ? $"「{d.AtkName}」\n效果 +60%" : $"{Pct(SurgeChance)}几率爆发成巨型{d.Noun ?? "攻击"}\n伤害 +{Pct(SurgeDmg - 1f)}",
                });
                list.Add(new PerkDef
                {
                    Id = key + "_top", Hero = h, Name = "最强" + (d.Noun ?? "一击"), Opt = 2, Weight = 1.3f,
                    Eff = sup ? Eff.UltCd : Eff.Top, V = sup ? 0.3f : TopDmg,
                    Desc = sup ? $"「{d.AtkName}」\n冷却 -30%" : $"场上最高星的{d.Name}\n伤害 +{Pct(TopDmg)}，体积 +20%",
                });
                if (d.HasUlt)
                    list.Add(new PerkDef
                    {
                        Id = key + "_ult", Hero = h, Name = d.UltName, Eff = Eff.UltPow, Ult = true, Weight = 2.4f,
                        Desc = $"{d.UltTip}\n冷却{d.UltCd:0}秒",
                    });
                AddPlays(list, d, key);
            }
            Add(HeroId.HuaRong, ("双排钉匣", Eff.Count, 1, 2), ("一钉双穿", Eff.Chain, 1, 2), ("鲁班准星", Eff.Crit, 0.2f, 1), ("气泵增压", Eff.Dmg, 0.35f, 2),
                ("匠心神射", Eff.Dmg, 1f, 1), ("连发射钉", Eff.Speed, 0.5f, 1), ("万钉齐发", Eff.UltPow, 1f, 1));
            Add(HeroId.LingZhen, ("双联罐炮", Eff.Count, 1, 2), ("丙烷加压", Eff.Area, 0.35f, 2), ("子母巨弹", Eff.Split, 1, 1), ("焊枪改良", Eff.Dmg, 0.35f, 2),
                ("子母连环", Eff.Count, 2, 1), ("手工核弹", Eff.Dmg, 1f, 1), ("炮火连天", Eff.UltCd, 0.3f, 1));
            Add(HeroId.GongSun, ("双路电弧", Eff.Count, 1, 2), ("超压导电", Eff.Chain, 2, 2), ("触电麻痹", Eff.Stun, 0.3f, 1), ("升压线圈", Eff.Dmg, 0.35f, 2),
                ("全村电网", Eff.Chain, 4, 1), ("雷霆万钧", Eff.Dmg, 1f, 1), ("满负荷放电", Eff.UltPow, 1f, 1));
            Add(HeroId.WuSong, ("左右勾拳", Eff.Count, 1, 2), ("热身快拳", Eff.Speed, 0.4f, 2), ("重拳破甲", Eff.Elite, 1f, 1), ("钢筋铁骨", Eff.Dmg, 0.35f, 2),
                ("疾风摆拳", Eff.Speed, 0.6f, 1), ("金腰带", Eff.Dmg, 1f, 1), ("擂台制霸", Eff.UltPow, 1f, 1));
            Add(HeroId.ZhangQing, ("连环摸牌", Eff.Chain, 2, 2), ("杠上拍晕", Eff.Stun, 0.3f, 1), ("红中发财", Eff.Dmg, 0.3f, 2), ("盲摸快手", Eff.Speed, 0.3f, 1),
                ("天胡牌雨", Eff.Chain, 4, 1), ("清一色", Eff.Dmg, 1f, 1), ("连庄不绝", Eff.UltPow, 1f, 1));
            Add(HeroId.LinChong, ("加压喷管", Eff.Range, 1.5f, 2), ("冷锋暴击", Eff.Crit, 0.25f, 1), ("液氮挂霜", Eff.Slow, 1.6f, 1), ("急冻齐射", Eff.Dmg, 0.35f, 2),
                ("冰封防线", Eff.Dmg, 1f, 1), ("极度深寒", Eff.UltPow, 1f, 1), ("连环寒潮", Eff.Speed, 0.5f, 1));
            Add(HeroId.LuZhiShen, ("大锤横扫", Eff.Area, 0.4f, 2), ("抡锤生风", Eff.Speed, 0.4f, 2), ("碎甲重锤", Eff.Elite, 1f, 1), ("筑路怪力", Eff.Dmg, 0.35f, 1),
                ("力拔山兮", Eff.UltPow, 1f, 1), ("巨锤开路", Eff.Dmg, 1f, 1), ("地动山摇", Eff.Area, 0.6f, 1));
            Add(HeroId.WuYong, ("清风徐来", Eff.Aura, 0.5f, 2), ("枸杞提神", Eff.Dmg, 0.6f, 2), ("经费节流", Eff.Coin, 15, 1), ("课间铃声", Eff.UltCd, 0.2f, 1),
                ("满堂高徒", Eff.Aura, 1f, 1), ("谆谆教诲", Eff.UltPow, 1f, 1), ("神清气爽", Eff.Speed, 0.5f, 1));

            Add(HeroId.LuJunyi, ("横扫千军", Eff.Area, 0.4f, 2), ("金棍无双", Eff.Dmg, 0.35f, 2), ("醒狮点睛", Eff.Crit, 0.2f, 1), ("疾风快棍", Eff.Speed, 0.3f, 1),
                ("武林泰斗", Eff.Dmg, 1f, 1), ("电光破阵", Eff.UltPow, 1f, 1), ("游龙出洞", Eff.Speed, 0.5f, 1));
            Add(HeroId.GuanSheng, ("满月劈斩", Eff.Area, 0.35f, 2), ("刀劈机甲", Eff.Elite, 1f, 1), ("热熔威风", Eff.Dmg, 0.35f, 2), ("流云快刀", Eff.Speed, 0.3f, 1),
                ("烈焰开山", Eff.Dmg, 1f, 1), ("社火压轴", Eff.UltPow, 1f, 1), ("刀风浩荡", Eff.Area, 0.6f, 1));
            Add(HeroId.YanQing, ("扩容钉匣", Eff.Count, 1, 2), ("钨钢穿钉", Eff.Chain, 1, 1), ("激光校准", Eff.Crit, 0.2f, 1), ("电磁加速", Eff.Dmg, 0.35f, 2),
                ("万钉齐发", Eff.Count, 2, 1), ("弱点狙杀", Eff.UltPow, 1f, 1), ("无刷连发", Eff.Speed, 0.5f, 1));
            Add(HeroId.FanRui, ("广角风场", Eff.Area, 0.35f, 2), ("砂石卷击", Eff.Stun, 0.3f, 1), ("碳纤桨叶", Eff.Dmg, 0.35f, 2), ("低压气团", Eff.Slow, 1f, 1),
                ("超强风压", Eff.Dmg, 1f, 1), ("狂飙席卷", Eff.UltPow, 1f, 1), ("双倍旋翼", Eff.Area, 0.6f, 1));
            Add(HeroId.HuSanniang, ("双索齐飞", Eff.Count, 1, 2), ("电磁劲绳", Eff.Dmg, 0.35f, 2), ("死结", Eff.Stun, 0.5f, 1), ("套头目", Eff.Elite, 0.6f, 1),
                ("连环套索", Eff.Count, 2, 1), ("生擒活捉", Eff.UltPow, 1f, 1), ("快手甩绳", Eff.Speed, 0.5f, 1));
            Add(HeroId.AnDaoquan, ("银针", Eff.Aura, 0.5f, 2), ("浓煎草药", Eff.Dmg, 0.5f, 1), ("急诊包扎", Eff.UltCd, 0.25f, 1), ("提神药膏", Eff.Speed, 0.3f, 1),
                ("妙手神针", Eff.Aura, 1f, 1), ("固若金汤", Eff.UltPow, 1f, 1), ("随叫随到", Eff.Speed, 0.5f, 1));
            Add(HeroId.DaiZong, ("重低音", Eff.Aura, 0.5f, 2), ("踩点", Eff.Speed, 0.4f, 2), ("扩音喇叭", Eff.Dmg, 0.5f, 1), ("切歌加速", Eff.UltCd, 0.25f, 1),
                ("领舞风范", Eff.Aura, 1f, 1), ("倍速热舞", Eff.Speed, 0.6f, 1), ("劲歌串烧", Eff.UltPow, 1f, 1));
            Add(HeroId.QinMing, ("双管礼花", Eff.Count, 1, 2), ("绚烂炸裂", Eff.Area, 0.35f, 2), ("高纯铝粉", Eff.Dmg, 0.35f, 2), ("快引火线", Eff.Speed, 0.3f, 1),
                ("盛世烟火", Eff.Dmg, 1f, 1), ("流星礼花", Eff.UltPow, 1f, 1), ("漫天花火", Eff.Area, 0.6f, 1));

            Add(HeroId.LiKui, ("双锯齐轰", Eff.Count, 1, 2), ("加长锯板", Eff.Area, 0.4f, 2), ("拉满油门", Eff.Speed, 0.35f, 2), ("合金锯链", Eff.Dmg, 0.35f, 1),
                ("专锯巨兽", Eff.Elite, 1.5f, 1), ("旋风链锯", Eff.UltPow, 1f, 1), ("铁牛巨力", Eff.Dmg, 1f, 1));
            Add(HeroId.QiaoDaoqing, ("猛火喷嘴", Eff.Dmg, 0.35f, 2), ("宽幅烤架", Eff.Area, 0.35f, 2), ("延时喷火", Eff.Count, 1, 1), ("加压气瓶", Eff.Speed, 0.3f, 1),
                ("炭火融金", Eff.Dmg, 1f, 1), ("爆烤全场", Eff.UltPow, 1f, 1), ("双倍火力", Eff.Count, 2, 1));
            Add(HeroId.ZhuWu, ("扩盘", Eff.Area, 0.35f, 2), ("连环杀招", Eff.Slow, 1f, 2), ("当头炮", Eff.Stun, 0.25f, 1), ("重炮将死", Eff.Dmg, 0.4f, 1),
                ("绝杀残局", Eff.UltPow, 1f, 1), ("天地棋盘", Eff.Area, 0.6f, 1), ("快棋", Eff.Speed, 0.5f, 1));
            Add(HeroId.XuNing, ("破甲钢钳", Eff.Cav, 0.5f, 2), ("熟练操作", Eff.Dmg, 0.35f, 2), ("卡死履带", Eff.Stun, 0.25f, 1), ("伸缩液压臂", Eff.Range, 1.5f, 1),
                ("拆车专家", Eff.Cav, 1.5f, 1), ("液压狂潮", Eff.UltPow, 1f, 1), ("高速回钳", Eff.Speed, 0.5f, 1));
            Add(HeroId.ShanTinggui, ("大口径", Eff.Area, 0.35f, 2), ("冰井凉水", Eff.Slow, 1f, 1), ("水压倍增", Eff.Dmg, 0.35f, 2), ("双泵联动", Eff.Speed, 0.3f, 1),
                ("怒涛冲刷", Eff.UltPow, 1f, 1), ("消防精英", Eff.Dmg, 1f, 1), ("巨浪滔天", Eff.Area, 0.6f, 1));
            Add(HeroId.WeiDingguo, ("双罐齐投", Eff.Count, 1, 2), ("热油飞溅", Eff.Area, 0.35f, 2), ("沸点红油", Eff.Dmg, 0.35f, 1), ("子母油罐", Eff.Split, 1, 1),
                ("烈焰油海", Eff.UltPow, 1f, 1), ("高温滚油", Eff.Dmg, 1f, 1), ("连环油瓮", Eff.Count, 2, 1));

            Add(HeroId.ShiXiu, ("左右快斩", Eff.Count, 1, 2), ("庖丁手法", Eff.Speed, 0.35f, 2), ("刀刀见骨", Eff.Crit, 0.2f, 1), ("磨刀霍霍", Eff.Dmg, 0.35f, 2),
                ("金牌刀工", Eff.Dmg, 1f, 1), ("疾风乱斩", Eff.Speed, 0.6f, 1), ("破空斩击", Eff.UltPow, 1f, 1));
            Add(HeroId.XieZhen, ("双珠齐射", Eff.Count, 1, 2), ("防空高手", Eff.Fly, 0.6f, 1), ("牛筋皮兜", Eff.Dmg, 0.35f, 2), ("贯穿钢珠", Eff.Chain, 1, 1),
                ("专打大怪", Eff.Elite, 1.5f, 1), ("神弹王", Eff.Dmg, 1f, 1), ("满天钢珠", Eff.UltPow, 1f, 1));
            Add(HeroId.XieBao, ("双叉齐投", Eff.Count, 1, 2), ("强力穿刺", Eff.Chain, 1, 2), ("加粗钢叉", Eff.Dmg, 0.35f, 2), ("麻痹辣汁", Eff.Stun, 0.2f, 1),
                ("一叉到底", Eff.Chain, 3, 1), ("猛男臂力", Eff.Dmg, 1f, 1), ("飞叉风暴", Eff.UltPow, 1f, 1));
            Add(HeroId.MaLing, ("双手抛砖", Eff.Count, 1, 2), ("实心烧结", Eff.Dmg, 0.35f, 2), ("当头一砖", Eff.Stun, 0.2f, 1), ("磁场弹跳", Eff.Chain, 1, 2),
                ("包工神力", Eff.Dmg, 1f, 1), ("重砖破壳", Eff.UltPow, 1f, 1), ("流水递砖", Eff.Speed, 0.6f, 1));
            Add(HeroId.KongLiang, ("双响连掷", Eff.Count, 1, 2), ("加大药量", Eff.Area, 0.35f, 2), ("子母礼炮", Eff.Split, 1, 1), ("急促引线", Eff.Speed, 0.3f, 2),
                ("震耳欲聋", Eff.Dmg, 1f, 1), ("喜庆连爆", Eff.UltPow, 1f, 1), ("满地红火", Eff.Area, 0.6f, 1));
            Add(HeroId.TangLong, ("机油润滑", Eff.Aura, 0.5f, 2), ("精钢螺母", Eff.Dmg, 0.5f, 1), ("破甲改装", Eff.Elite, 0.5f, 1), ("电动扳手", Eff.Speed, 0.3f, 1),
                ("全村换装", Eff.Aura, 1f, 1), ("千锤百炼", Eff.UltPow, 1f, 1), ("金牌匠人", Eff.Dmg, 1f, 1));
            Add(HeroId.SunErniang, ("大勺扬粉", Eff.Area, 0.35f, 2), ("呛鼻", Eff.Stun, 0.2f, 1), ("朝天椒王", Eff.Dmg, 0.4f, 2), ("辣味弥漫", Eff.Slow, 1f, 1),
                ("变态特辣", Eff.UltPow, 1f, 1), ("红油翻滚", Eff.Dmg, 1f, 1), ("辣雾封路", Eff.Area, 0.6f, 1));
            Add(HeroId.RuanXiaoqi, ("加宽渔网", Eff.Area, 0.35f, 2), ("收紧网绳", Eff.Stun, 0.5f, 1), ("熟手抛网", Eff.Speed, 0.3f, 2), ("铅坠重击", Eff.Dmg, 0.4f, 1),
                ("网罗四方", Eff.UltPow, 1f, 1), ("满塘丰收", Eff.Area, 0.6f, 1), ("顺风撒网", Eff.Speed, 0.6f, 1));
            Add(HeroId.ShiQian, ("顺手", Eff.Aura, 0.5f, 2), ("双线取件", Eff.Count, 1, 1), ("跑腿小费", Eff.Coin, 10, 1), ("电驴狂飙", Eff.Speed, 0.4f, 1),
                ("拆甲大师", Eff.Aura, 1f, 1), ("金牌骑手", Eff.UltPow, 1f, 1), ("准时必达", Eff.Dmg, 1f, 1));
            Add(HeroId.JiangJing, ("复利", Eff.Aura, 0.5f, 2), ("金算珠", Eff.Dmg, 0.5f, 1), ("心算如飞", Eff.UltCd, 0.25f, 1), ("双手拨珠", Eff.Speed, 0.3f, 1),
                ("财源广进", Eff.Aura, 1f, 1), ("一本万利", Eff.UltPow, 1f, 1), ("金牌会计", Eff.Speed, 0.6f, 1));
            return list.ToArray();
        }

        /// <summary>
        /// 有取舍的打法卡（参考视频「双枪射击」「钢芯弹头」「爆炸子弹」「火药升级」）：
        /// 重手 / 快手二选一；齐射或大开大合用伤害、攻速换覆盖面；质变改变攻击方式；进阶要先拿到质变。
        /// </summary>
        static void AddPlays(List<PerkDef> list, HeroDef d, string key)
        {
            string n = d.Noun ?? "攻击";
            bool sup = d.Kind == Sim.Role.Support;
            PerkDef Trade(string id, string name, Eff e, float v, Eff e2, float v2, string group, string desc) => new PerkDef
            {
                Id = key + "_" + id, Hero = d.Id, Name = name, Kind = PerkKind.Trade, Eff = e, V = v, Has2 = v2 != 0, Eff2 = e2, V2 = v2,
                Group = group, Weight = 0.9f, Desc = desc,
            };
            if (sup)
            {
                list.Add(Trade("heavy", "厚积薄发", Eff.UltPow, 0.8f, Eff.Speed, -0.3f, "pace", $"「{d.AtkName}」效果 +80%\n施放频率 -30%"));
                list.Add(Trade("quick", "随机应变", Eff.Speed, 0.6f, Eff.UltPow, -0.25f, "pace", $"「{d.AtkName}」频率 +60%\n效果 -25%"));
                list.Add(new PerkDef { Id = key + "_sync", Hero = d.Id, Name = "众志成城", Kind = PerkKind.Morph, Eff = Eff.Aura, V = 0.65f, Weight = 1.15f, Desc = "光环与加持效果 +65%\n全队输出乡亲协同强化" });
                return;
            }
            list.Add(Trade("heavy", "千钧之力", Eff.Dmg, 0.95f, Eff.Speed, -0.28f, "pace", $"{n}伤害 +95%\n攻速 -28%"));
            list.Add(Trade("quick", "快如闪电", Eff.Speed, 0.65f, Eff.Dmg, -0.22f, "pace", $"攻速 +65%\n{n}伤害 -22%"));
            bool many = d.Chan <= 0 && (d.Shot == ShotKind.Arrow || d.Shot == ShotKind.Bomb || d.Shot == ShotKind.Fireball || d.Shot == ShotKind.Punch || d.Shot == ShotKind.Lasso);
            var cb = Balance.Current.Combat;
            if (many && (d.Shot == ShotKind.Punch || d.Shot == ShotKind.Lasso))
                list.Add(Trade("wide", "连环追击", Eff.Count, 1, Eff.Dmg, -0.15f, null, (d.Shot == ShotKind.Punch ? "每次出手多斩 1 击" : "套索同时多锁 1 人") + "\n单次伤害 -15%"));
            else if (many)
                list.Add(Trade("wide", "齐射", Eff.Count, 2, Eff.Dmg, cb.WideMultiDmgPenalty, null, $"{n}数量 +2\n单发伤害 {Pct(cb.WideMultiDmgPenalty)}"));
            else if (d.Shot == ShotKind.Stone)
                list.Add(Trade("wide", "天女散花", Eff.Chain, 2, Eff.Dmg, -0.18f, null, $"{n}弹射 +2 次\n伤害 -18%"));
            else
                list.Add(Trade("wide", "大开大合", Eff.Area, cb.WideAreaBonus, Eff.Speed, cb.WideAreaSpeedPenalty, null, $"{n}范围 +{Pct(cb.WideAreaBonus)}\n攻速 {Pct(cb.WideAreaSpeedPenalty)}"));

            bool fire = d.Element == "火系";
            Eff me;
            string mname, mdesc, aname, adesc;
            float mv, av;
            switch (d.Shot)
            {
                case ShotKind.Arrow:
                    me = Eff.Blast; mv = 0.55f; av = 1.05f;
                    mname = "爆裂" + n; mdesc = $"{n}命中后爆炸\n周围敌人受 55% 伤害";
                    aname = "高能装药"; adesc = "爆炸范围 +35%\n爆炸伤害 55% → 160%";
                    break;
                case ShotKind.Spear:
                    me = Eff.Reach; mv = 2.5f; av = 2f;
                    mname = "一杆穿心"; mdesc = "贯穿距离 +2.5\n一击捅穿整列";
                    aname = "势如破竹"; adesc = "贯穿距离再 +2\n身后敌人也受全额伤害";
                    break;
                case ShotKind.Bomb:
                case ShotKind.Fireball:
                case ShotKind.Beam when fire:
                    me = Eff.Burn; mv = 0.65f; av = 0.95f;
                    mname = "高温引燃"; mdesc = "命中的敌人燃烧 3 秒\n共受 65% 伤害";
                    aname = "连环爆燃"; adesc = "灼烧伤害 65% → 160%\n燃烧敌人阵亡引爆周围";
                    break;
                case ShotKind.Wind:
                    me = Eff.Burn; mv = 0.65f; av = 0.95f;
                    mname = "呛鼻辣雾"; mdesc = "命中的敌人受蚀 3 秒\n共受 65% 伤害";
                    aname = "生化爆散"; adesc = "持续伤害 65% → 160%\n受蚀敌人阵亡传染爆散";
                    break;
                default:
                    me = Eff.Vuln; mv = 0.28f; av = 0.22f;
                    mname = "破甲重创"; mdesc = "命中的敌人 4 秒内\n受到所有伤害 +28%";
                    aname = "摧枯拉朽"; adesc = "破甲易伤\n28% → 50%";
                    break;
            }
            string morph = key + "_morph";
            list.Add(new PerkDef { Id = morph, Hero = d.Id, Name = mname, Kind = PerkKind.Morph, Eff = me, V = mv, Weight = 1.15f, Desc = mdesc });
            list.Add(new PerkDef { Id = key + "_adv", Hero = d.Id, Name = aname, Kind = PerkKind.Adv, Eff = me, V = av, Req = morph, Weight = 1.65f, Desc = adesc });

            // 跨职业联动 & 逆风翻盘词条：碎冰追击、众星捧月共鸣、绝境斩杀。
            if (d.Kind == Sim.Role.Control)
            {
                list.Add(new PerkDef { Id = key + "_shatter", Hero = d.Id, Name = "乘胜追击", Kind = PerkKind.Value, Eff = Eff.Vuln, V = 0.30f, Weight = 1.15f, Desc = "命中的敌人 4 秒内\n所受伤害 +30%" });
                bool hardStun = d.Stun > 0 && d.StunChance <= 0;
                bool slowOnly = d.Stun <= 0 && d.Slow > 0;
                list.Add(new PerkDef
                {
                    Id = key + "_exec", Hero = d.Id, Name = "死守防线", Kind = PerkKind.Value,
                    Eff = slowOnly ? Eff.Slow : Eff.Stun, V = slowOnly ? 1.0f : (hardStun ? 0.4f : 0.25f), Max = 2, Weight = 1.0f,
                    Desc = slowOnly ? "减速时间 +1 秒\n近墙外星军额外减速 1 秒"
                        : hardStun ? "定身时间 +0.4 秒\n近墙外星军额外定身 0.4 秒"
                        : "击晕几率 +25%\n近墙外星军触发率翻倍",
                });
            }
            else
            {
                list.Add(new PerkDef { Id = key + "_shatter", Hero = d.Id, Name = "破冰追击", Kind = PerkKind.Value, Eff = Eff.Shatter, V = 0.85f, Weight = 1.15f, Desc = "对减速、眩晕敌人\n伤害 +85%，暴击 +25%" });
                bool carry = d.Kind == Sim.Role.Fighter || d.Kind == Sim.Role.Archer || d.Kind == Sim.Role.Mage || d.Kind == Sim.Role.Bomber;
                if (carry && d.Rarity >= 3)
                    list.Add(new PerkDef { Id = key + "_res", Hero = d.Id, Name = "众星捧月", Kind = PerkKind.Value, Eff = Eff.Resonance, V = 0.22f, Weight = 1.15f, Desc = $"场上每有 1 个{d.Role}\n最高星{d.Name}伤害 +22%" });
                else
                    list.Add(new PerkDef { Id = key + "_exec", Hero = d.Id, Name = "绝地反击", Kind = PerkKind.Value, Eff = Eff.Exec, V = 0.85f, Weight = 1.1f, Desc = "对半血以下敌人伤害 +85%\n防线危急时全伤再 +35%" });
            }
        }

        /// <summary>局内普通强化要一眼看得出变强：伤害、范围、攻速类在表里的基础值上放大，确保拿钱买词条远优于无脑盲目召唤。</summary>
        static float Boost(Eff e)
        {
            var c = Balance.Current.Combat;
            return e == Eff.Dmg ? c.PerkDmgBoost : e == Eff.Area ? c.PerkAreaBoost : e == Eff.Speed ? c.PerkSpeedBoost : e == Eff.Crit ? c.PerkCritBoost : 1f;
        }

        /// <summary>5 级解锁的「爆发」：每次出手有几率打出巨型一击；15 级起触发率再加、必定暴击。20 级解锁的「最强」：场上星级最高的那一位加伤害。</summary>
        public static float SurgeChance => Balance.Current.Combat.SurgeChance;
        public static float SurgeDmg => Balance.Current.Combat.SurgeDmg;
        public static float SurgePlusChance => Balance.Current.Combat.SurgePlusChance;
        public static float TopDmg => Balance.Current.Combat.TopDmg;

        public static class OptNames
        {
            public static readonly string[] Surge =
        {
            "超压穿甲钉", "超压巨炮", "变压器暴走", "冠军重勾拳", "大牌压顶", "极寒冰柱", "万吨重锤", "勤俭持村",
            "醒狮电光棍", "烈焰狂斩", "电磁暴射", "旋翼风暴", "连环困索", "神医妙方", "劲曲高潮", "巨型礼花王",
            "暴走大油锯", "超温焊焰", "将死困局", "重型液压钳", "消防水龙", "沸腾大油瓮",
            "案板惊雷斩", "金刚大钢珠", "巨型魔鬼叉", "天降大板砖", "震村大礼炮", "神级大改装", "十里呛魂雾", "巨网罩全场", "极速顺手礼", "利滚利翻倍",
        };
            public static readonly string[] Awaken =
        {
            "一钉串糖葫芦", "土法重炮营", "全村超载电暴", "十八连环拳", "杠上开花雨", "绝对零度场", "倒拔电线杆", "桃李满村口",
            "醒狮镇山河", "刀神显威", "暴雨梨花钉", "超级台风眼", "天罗电磁索", "杏林春满园", "全村摇起来", "满天红火海",
            "后山油锯王", "孜然火焰山", "将军死胡同", "钳翻飞碟阵", "百米大水龙", "沸油泼天阵",
            "案板无影刀", "百步穿飞碟", "农家魔鬼叉", "万砖拍脑门", "开门满堂红", "神级手艺人", "十里呛魂香", "一网打尽光", "全村及时达", "算盘响黄金",
        };
        }

        public static string AwakenName(HeroId h) => OptNames.Awaken[(int)h];
        public static float AwakenDmgBonus => Balance.Current.Combat.AwakenDmgBonus;
        public static float AwakenSpeedBonus => Balance.Current.Combat.AwakenSpeedBonus;
        public static float AwakenAuraBonus => Balance.Current.Combat.AwakenAuraBonus;

        /// <summary>上阵异职业羁绊：2/3/4 种不同职业上阵时，全军最终伤害 +3% / +7% / +12%。</summary>
        public static int DistinctRoles(HeroId[] lineup, out int mask)
        {
            mask = 0;
            int n = 0;
            if (lineup == null) return 0;
            for (int i = 0; i < lineup.Length; i++)
            {
                int bit = 1 << (int)Hero(lineup[i]).Kind;
                if ((mask & bit) != 0) continue;
                mask |= bit;
                n++;
            }
            return n;
        }

        public static float RoleSynergyBonus(HeroId[] lineup)
        {
            int n = DistinctRoles(lineup, out _);
            return n >= 4 ? 0.12f : n == 3 ? 0.07f : n == 2 ? 0.03f : 0f;
        }

        public sealed class BondDef
        {
            public HeroId A, B;
            public string Name, Desc;
            public Role? RoleTarget;
            public float Dmg, Elite, Crit, FlyCav;
        }

        /// <summary>邻里搭档同场羁绊：两人同时在出战阵容中即永久生效。</summary>
        public static readonly BondDef[] Bonds =
        {
            new BondDef { A = HeroId.LuZhiShen, B = HeroId.LinChong, Name = "硬汉搭档", Desc = "战士伤害 +12%", RoleTarget = Sim.Role.Fighter, Dmg = 0.12f },
            new BondDef { A = HeroId.WuSong, B = HeroId.LuZhiShen, Name = "村口双猛", Desc = "对精英与首领伤害 +15%", Elite = 0.15f },
            new BondDef { A = HeroId.HuaRong, B = HeroId.YanQing, Name = "新老神射", Desc = "全村暴击率 +6%", Crit = 0.06f },
            new BondDef { A = HeroId.HuaRong, B = HeroId.ZhangQing, Name = "例无虚发", Desc = "射手伤害 +12%", RoleTarget = Sim.Role.Archer, Dmg = 0.12f },
            new BondDef { A = HeroId.XieZhen, B = HeroId.XieBao, Name = "村口双煞", Desc = "对飞碟与载具伤害 +20%", FlyCav = 0.20f },
            new BondDef { A = HeroId.GongSun, B = HeroId.FanRui, Name = "风雷科技", Desc = "奇人伤害 +12%", RoleTarget = Sim.Role.Mage, Dmg = 0.12f },
        };

        public static List<BondDef> ActiveBonds(HeroId[] lineup)
        {
            var r = new List<BondDef>();
            if (lineup == null) return r;
            foreach (var b in Bonds)
                if (System.Array.IndexOf(lineup, b.A) >= 0 && System.Array.IndexOf(lineup, b.B) >= 0) r.Add(b);
            return r;
        }

        /// <summary>没有大招的好汉，大招类强化改成加伤害、攻速；辅助不打伤害，伤害类强化改成加技能效果、减冷却。</summary>
        static (Eff, float) Adapt(HeroDef d, Eff e, float v)
        {
            if (d.Kind == Sim.Role.Support)
            {
                if (e == Eff.Dmg || e == Eff.Elite) return (Eff.UltPow, System.Math.Min(v, 0.5f));
                if (e == Eff.Count) return (Eff.UltCd, 0.2f);
                return (e, v);
            }
            if (d.HasUlt) return (e, v);
            if (e == Eff.UltPow) return (Eff.Dmg, 0.8f);
            if (e == Eff.UltCd) return (Eff.Speed, 0.3f);
            return (e, v);
        }

        static string Pct(float v) => (int)System.Math.Round(v * 100) + "%";

        /// <summary>效果说明：强化卡、被动、好汉详情共用。</summary>
        public static string EffText(HeroId h, Eff e, float v)
        {
            var d = Hero(h);
            string n = d.Noun ?? "攻击";
            switch (e)
            {
                case Eff.Dmg: return $"{n}伤害 +{Pct(v)}";
                case Eff.Speed: return $"攻速 +{Pct(v)}";
                case Eff.Count:
                    if (d.Chan > 0) return $"施法时间 +{v * ChanPerCount:0.#} 秒";
                    if (d.Shot == ShotKind.Lasso) return $"套索同时锁 +{v:0} 人";
                    if (d.Shot == ShotKind.Punch) return $"每次出手多斩 {v:0} 击";
                    return $"{n}数量 +{v:0}";
                case Eff.Area: return $"{n}范围 +{Pct(v)}";
                case Eff.Chain:
                    if (d.Shot == ShotKind.Stone) return $"{n}弹射 +{v:0} 次";
                    if (d.Shot == ShotKind.Lightning) return $"{n}连锁 +{v:0} 个敌人";
                    return $"{n}穿透 +{v:0} 个敌人";
                case Eff.Crit: return $"暴击率 +{Pct(v)}";
                case Eff.Stun:
                    if (d.Stun > 0 && d.StunChance <= 0) return $"控制时间 +{v:0.#} 秒";
                    return $"命中 {Pct(v)} 几率击晕";
                case Eff.Slow: return d.Slow > 0 ? $"减速时间 +{v:0.#} 秒" : $"命中减速 {v:0.#} 秒";
                case Eff.Elite: return $"对精英、首领\n伤害 +{Pct(v)}";
                case Eff.UltCd: return d.Kind == Sim.Role.Support ? $"技能冷却 -{Pct(v)}" : $"大招冷却 -{Pct(v)}";
                case Eff.UltPow:
                    if (d.Kind != Sim.Role.Support) return $"大招「{d.UltName}」\n伤害 +{Pct(v)}";
                    return d.HasUlt ? $"技能与大招\n效果 +{Pct(v)}" : $"「{d.AtkName}」\n效果 +{Pct(v)}";
                case Eff.Range: return $"攻击距离 +{v:0.#}";
                case Eff.Split: return $"{n}落地后\n再分裂 3 枚小{n}";
                case Eff.Coin: return $"每次合体额外\n获得 {v:0} 能量币";
                case Eff.Fly: return $"对飞行外星器\n伤害 +{Pct(v)}";
                case Eff.Cav: return $"对飞艇、机甲兽\n伤害 +{Pct(v)}";
                case Eff.Surge: return $"{Pct(v)}几率爆发成巨型{n}\n伤害 +{Pct(SurgeDmg - 1f)}";
                case Eff.Top: return $"场上最高星的{d.Name}\n伤害 +{Pct(v)}，体积 +20%";
                case Eff.Blast: return $"{n}命中后爆炸\n周围敌人受 {Pct(v)} 伤害";
                case Eff.Burn: return $"命中的敌人持续 {BurnDur:0} 秒\n共受 {Pct(v)} 伤害";
                case Eff.Vuln: return $"命中的敌人 {VulnDur:0} 秒内\n受到伤害 +{Pct(v)}";
                case Eff.Reach: return $"贯穿距离 +{v:0.#}";
                case Eff.Shatter: return $"对减速、眩晕敌人\n伤害 +{Pct(v)}，暴击 +25%";
                case Eff.Exec: return $"对半血以下敌人伤害 +{Pct(v)}\n防线危急时再 +35%";
                case Eff.Resonance: return $"每有 1 个同职业队友\n最高星{d.Name}伤害 +{Pct(v)}";
                default:
                    switch (d.Aura)
                    {
                        case AuraKind.Speed: return $"攻速光环 +{Pct(v)}";
                        case AuraKind.Dmg: return $"伤害光环 +{Pct(v)}";
                        case AuraKind.Charge: return $"冷却光环 +{Pct(v)}";
                        case AuraKind.Heal: return $"修墙量 +{Pct(v)}";
                        case AuraKind.Coin: return $"击杀能量币加成 +{Pct(v)}";
                        case AuraKind.Interest: return $"能量币利息 +{Pct(v)}";
                        default: return $"光环 +{Pct(v)}";
                    }
            }
        }

        public static List<PerkDef> PerksOf(HeroId h, bool star)
        {
            var r = new List<PerkDef>();
            foreach (var p in Perks) if (p.Hero == h && p.Star == star && !p.Ult) r.Add(p);
            return r;
        }

        public static PerkDef UltPerk(HeroId h)
        {
            foreach (var p in Perks) if (p.Hero == h && p.Ult) return p;
            return null;
        }

        public static PerkDef Perk(string id)
        {
            foreach (var p in Perks) if (p.Id == id) return p;
            return null;
        }

        /// <summary>
        /// 合成星级曲线（对标《永远的蔚蓝星球》实测黄金衰减律）：
        /// 1→2 星伤害整整翻倍（2.0x，零损耗腾格子，开局双 2 星性价比最高）；
        /// 3 星基础 3.30x（约理论值 82.5%，靠解锁 3 星核心形态质变与放大强化词条拉开上限）；
        /// 4 星满星觉醒 4.20x（合体巨型猛将 + 免费触发一次满星专属三选一 + 吃满「众星捧月 / 最强一击 / 大招与三合一奥义」乘区）。
        /// </summary>
        public static float[] StarMul => Balance.Current.Combat.StarMul;
        public static float[] StarSpeed => Balance.Current.Combat.StarSpeed;
        /// <summary>法师的「数量」强化：每级持续施法多这么多秒。</summary>
        public const float ChanPerCount = 0.75f;

        /// <summary>1 星即具备完整职业出招节奏，不再拆成按星级递增的冗长排队连击；多发弹幕由局内强化词条自由构筑。</summary>
        public static int ShotsAt(HeroDef d, int star) => System.Math.Max(1, d.Count);

        /// <summary>灼烧/中毒持续秒数、每跳间隔；破绽持续秒数。</summary>
        public const float BurnDur = 3f, BurnEvery = 0.5f, VulnDur = 4f;

        public static float WaveTime => Balance.Current.WaveStage.WaveTime;
        /// <summary>清场后自然衔接下一波，无需漫长空等或倒计时弹框。</summary>
        public static float WaveMinTime => Balance.Current.WaveStage.WaveMinTime;
        public static float ClearBreath => Balance.Current.WaveStage.ClearBreath;
        /// <summary>一股兵最多在这么几秒内全部出门。</summary>
        public const float PackSpreadMax = 4.2f;

        /// <summary>一波分多股逐步涌出，行军连贯自然，不扎堆成团。</summary>
        public static (float at, float share)[] WavePacks(int wave) => wave <= 2
            ? new[] { (0.3f, 0.55f), (6.5f, 0.45f) }
            : new[] { (0.3f, 0.38f), (5.8f, 0.34f), (11.5f, 0.28f) };

        /// <summary>老村长的战斗技能：自动释放，超分贝声波朝面前的外星军推过去（第1波尾声首放救场）。</summary>
        public const string LordSkillName = "全村集合";
        public static float LordPctBase => Balance.Current.Combat.LordPctBase;
        public static float LordCdBase => Balance.Current.Combat.LordCdBase;
        public static float LordFirstCast => Balance.Current.Combat.LordFirstCast;
        /// <summary>剑气刃口每秒走的格数。要快，慢了像一块布飘过去。</summary>
        public const float LordWaveSpeed = 16f;
        /// <summary>冷却转满时剑气够不着人，最多再等这么久；再没人就空过这一轮，圈重新转，不能停在满圈上。</summary>
        public const float LordHold = 2.5f;
        public static int SummonsPerSlot => Balance.Current.Economy.SummonsPerSlot;
        public static int EnhanceUnlockSummons => Balance.Current.Economy.EnhanceUnlockSummons;
        public const int LevelsPerChapter = 10;

        /// <summary>第 n+1 次召唤的价格：严格按召唤价格表取值，不走线性外推（超出表长时维持最后一格价格）。</summary>
        public static int SummonCost(int n)
        {
            var tbl = Balance.Current.Economy.SummonTable;
            if (tbl == null || tbl.Length == 0) return 10;
            return tbl[System.Math.Max(0, System.Math.Min(n, tbl.Length - 1))];
        }

        /// <summary>第 n+1 次局内强化的价格：严格按强化价格表取值，不走线性递增（超出表长时维持最后一格价格）。</summary>
        public static int EnhanceCost(int n)
        {
            var tbl = Balance.Current.Economy.EnhanceTable;
            if (tbl == null || tbl.Length == 0) return 100;
            return tbl[System.Math.Max(0, System.Math.Min(n, tbl.Length - 1))];
        }

        /// <summary>波次同种怪血量斜率：10波怪量暴涨近10倍、单怪血量涨约1.04倍，不买词条中后期崩盘，买齐词条爽快割草。</summary>
        public static float HpScale(int wave) => 1f + Balance.Current.WaveStage.HpScaleSlope * (wave - 1);

        /// <summary>小兵「厚度」：前4波平滑收敛过渡（杜绝第3波比第1波脆的倒挂，开场1星需多击点杀）。</summary>
        public static float Tough(int wave)
        {
            var ws = Balance.Current.WaveStage;
            var et = ws.EarlyWaveTough;
            float mul = et != null && wave >= 1 && wave <= et.Length ? et[wave - 1] : 1f;
            return ws.Bulk * mul;
        }

        public static float Bulk => Balance.Current.WaveStage.Bulk;

        /// <summary>击杀赏银：全波次按面板赏银恒定直掉（默认倍率 1.0、波次涨幅 0，不做局内波次兵种加成，所见即所得）。</summary>
        public static int KillCoin(EnemyDef def, int wave, float coinAura)
        {
            var eco = Balance.Current.Economy;
            float raw = def.Big
                ? def.Coin * eco.BigKillCoinMul
                : def.Coin * eco.KillCoinMul * (1f + eco.KillCoinWaveSlope * System.Math.Max(0, wave - 1));
            return System.Math.Max(0, (int)System.Math.Round(raw * (1f + coinAura)));
        }

        /// <summary>每撑过/击退一波发放的守城军饷（w 为刚刚完成的波次 1..Waves-1）。</summary>
        public static int WaveClearBonus(int completedWave)
        {
            var eco = Balance.Current.Economy;
            return System.Math.Max(0, eco.WaveBonusBase + eco.WaveBonusPerWave * completedWave);
        }

        /// <summary>首领血量压过阶段线时爆出的钱袋银两。</summary>
        public static int BossPhaseDropCoin(int wave)
        {
            var eco = Balance.Current.Economy;
            return System.Math.Max(0, eco.BossDropCoinBase + eco.BossDropCoinPerWave * wave);
        }

        /// <summary>每波小兵数：对标《永远的蔚蓝星球》割草曲线（第 1 波 10 只 → 第 10 波 95 只，共 482 只）。</summary>
        public static int WaveCount(int wave)
        {
            var ws = Balance.Current.WaveStage;
            var wc = ws.WaveCounts;
            return wave <= wc.Length ? wc[System.Math.Max(1, wave) - 1] : wc[wc.Length - 1] + ws.WaveCountOverflowStep * (wave - wc.Length);
        }

        // ---------------- 关卡渐进兵种编排（每关仅出 2~3 种小兵，新兵种逐关解锁、波内逐步登场） ----------------

        static TroopMix T(EnemyKind k, int from)
        {
            switch (k)
            {
                case EnemyKind.Catapult:
                case EnemyKind.Brute:
                case EnemyKind.Taoist:
                    return new TroopMix(k, 0.12f, 0.008f, from);
                case EnemyKind.FireBomb:
                case EnemyKind.Lantern:
                case EnemyKind.Armored:
                    return new TroopMix(k, 0.13f, 0.008f, from);
                case EnemyKind.Farmer:
                case EnemyKind.Hound:
                case EnemyKind.Cavalry:
                    return new TroopMix(k, 0.24f, 0.014f, from);
                default:
                    return new TroopMix(k, 0.20f, 0.012f, from);
            }
        }

        public static readonly TroopMix[] Mix1 = { T(EnemyKind.Shield, 2), T(EnemyKind.Cavalry, 4) };

        /// <summary>
        /// 按关卡精细编排本关兵种（不含基础官兵）：
        /// 第1~2关仅 1 种特色兵（共2种小兵），后续每关精选 2 种互补特色兵（共3种小兵）；
        /// 新怪物随关卡逐个首次亮相，波次内第1波纯官兵、第2波出副兵A、第4波出副兵B，绝不一窝蜂涌出六七种怪。
        /// </summary>
        static TroopMix[] StageTroops(int n)
        {
            switch (n)
            {
                // 第一章 金沙滩：逐关解锁 盾兵(1) → 骑兵(2) → 弩手(3) → 恶犬(4) → 水鬼(5)
                case 1: return new[] { T(EnemyKind.Shield, 3) };
                case 2: return new[] { T(EnemyKind.Cavalry, 2) };
                case 3: return new[] { T(EnemyKind.Shield, 2), T(EnemyKind.Crossbow, 4) };
                case 4: return new[] { T(EnemyKind.Cavalry, 2), T(EnemyKind.Hound, 4) };
                case 5: return new[] { T(EnemyKind.Shield, 2), T(EnemyKind.Diver, 3) };
                case 6: return new[] { T(EnemyKind.Cavalry, 2), T(EnemyKind.Crossbow, 4) };
                case 7: return new[] { T(EnemyKind.Hound, 2), T(EnemyKind.Shield, 4) };
                case 8: return new[] { T(EnemyKind.Diver, 2), T(EnemyKind.Crossbow, 4) };
                case 9: return new[] { T(EnemyKind.Cavalry, 2), T(EnemyKind.Diver, 4) };
                case 10: return new[] { T(EnemyKind.Shield, 2), T(EnemyKind.Crossbow, 4) };

                // 第二章 三打祝家庄：逐关解锁 庄客(11) → 鹰隼(12) → 藤牌手(14)
                case 11: return new[] { T(EnemyKind.Farmer, 2), T(EnemyKind.Shield, 4) };
                case 12: return new[] { T(EnemyKind.Hawk, 2), T(EnemyKind.Farmer, 4) };
                case 13: return new[] { T(EnemyKind.Hawk, 2), T(EnemyKind.Cavalry, 4) };
                case 14: return new[] { T(EnemyKind.Rattan, 2), T(EnemyKind.Crossbow, 4) };
                case 15: return new[] { T(EnemyKind.Rattan, 2), T(EnemyKind.Hawk, 4) };
                case 16: return new[] { T(EnemyKind.Farmer, 2), T(EnemyKind.Hound, 4) };
                case 17: return new[] { T(EnemyKind.Hawk, 2), T(EnemyKind.Crossbow, 4) };
                case 18: return new[] { T(EnemyKind.Rattan, 2), T(EnemyKind.Cavalry, 4) };
                case 19: return new[] { T(EnemyKind.Hawk, 2), T(EnemyKind.Shield, 4) };
                case 20: return new[] { T(EnemyKind.Rattan, 2), T(EnemyKind.Crossbow, 4) };

                // 第三章 夜打曾头市：逐关解锁 铁甲兵(21) → 斥候(23) → 敢死刀手(25) → 妖道(27)
                case 21: return new[] { T(EnemyKind.Armored, 2), T(EnemyKind.Crossbow, 4) };
                case 22: return new[] { T(EnemyKind.Armored, 2), T(EnemyKind.Hawk, 4) };
                case 23: return new[] { T(EnemyKind.Scout, 2), T(EnemyKind.Cavalry, 4) };
                case 24: return new[] { T(EnemyKind.Scout, 2), T(EnemyKind.Rattan, 4) };
                case 25: return new[] { T(EnemyKind.Berserker, 2), T(EnemyKind.Armored, 4) };
                case 26: return new[] { T(EnemyKind.Berserker, 2), T(EnemyKind.Hawk, 4) };
                case 27: return new[] { T(EnemyKind.Shield, 2), T(EnemyKind.Taoist, 3) };
                case 28: return new[] { T(EnemyKind.Armored, 2), T(EnemyKind.Taoist, 4) };
                case 29: return new[] { T(EnemyKind.Scout, 2), T(EnemyKind.Berserker, 4) };
                case 30: return new[] { T(EnemyKind.Armored, 2), T(EnemyKind.Berserker, 4) };

                // 第四章 大破连环马：逐关解锁 火药兵(31) → 力士(33) → 连环马精英(34) → 投石车(36)
                case 31: return new[] { T(EnemyKind.FireBomb, 2), T(EnemyKind.Cavalry, 4) };
                case 32: return new[] { T(EnemyKind.Armored, 2), T(EnemyKind.FireBomb, 4) };
                case 33: return new[] { T(EnemyKind.Brute, 2), T(EnemyKind.Crossbow, 4) };
                case 34: return new[] { T(EnemyKind.Cavalry, 2), T(EnemyKind.Brute, 4) };
                case 35: return new[] { T(EnemyKind.Armored, 2), T(EnemyKind.FireBomb, 4) };
                case 36: return new[] { T(EnemyKind.Shield, 2), T(EnemyKind.Catapult, 3) };
                case 37: return new[] { T(EnemyKind.Cavalry, 2), T(EnemyKind.Catapult, 4) };
                case 38: return new[] { T(EnemyKind.Berserker, 2), T(EnemyKind.FireBomb, 4) };
                case 39: return new[] { T(EnemyKind.Armored, 2), T(EnemyKind.Brute, 4) };
                case 40: return new[] { T(EnemyKind.Cavalry, 2), T(EnemyKind.Catapult, 4) };

                // 第五章 三败高太尉：逐关解锁 孔明灯(42)，精选双兵种高阶战术组合
                case 41: return new[] { T(EnemyKind.Cavalry, 2), T(EnemyKind.Diver, 4) };
                case 42: return new[] { T(EnemyKind.Cavalry, 2), T(EnemyKind.Lantern, 3) };
                case 43: return new[] { T(EnemyKind.Cavalry, 2), T(EnemyKind.Hawk, 4) };
                case 44: return new[] { T(EnemyKind.Cavalry, 2), T(EnemyKind.FireBomb, 4) };
                case 45: return new[] { T(EnemyKind.Armored, 2), T(EnemyKind.Taoist, 4) };
                case 46: return new[] { T(EnemyKind.Diver, 2), T(EnemyKind.Catapult, 4) };
                case 47: return new[] { T(EnemyKind.Berserker, 2), T(EnemyKind.Lantern, 4) };
                case 48: return new[] { T(EnemyKind.Scout, 2), T(EnemyKind.FireBomb, 4) };
                case 49: return new[] { T(EnemyKind.Brute, 2), T(EnemyKind.Taoist, 4) };
                default: return new[] { T(EnemyKind.Cavalry, 2), T(EnemyKind.Armored, 4) };
            }
        }

        /// <summary>
        /// 按 50 关章节与兵种特色精细编排精英统领（对标《永远的蔚蓝星球》）：
        /// - 普通关（非 5 倍数）：返回 [第4波守关主精英, 第9波压轴副精英]，相邻关卡主统领不重复；
        /// - 首领关（逢 5 / 10）：第4波由大首领亲自坐镇，此处返回 [第9波压轴副将精英]。
        /// 9 种精英在 5 大章节逐章亮相，与本关小怪克制属性呼应！
        /// </summary>
        static EnemyKind[] StageElites(int n)
        {
            switch (n)
            {
                // 第一章 金沙滩：禁军教头(1) + 水军统制(4亮相) + 神臂弩统领(8预告)
                case 1:  return new[] { EnemyKind.Elite, EnemyKind.Elite };
                case 2:  return new[] { EnemyKind.CrossbowCapt, EnemyKind.Elite };
                case 3:  return new[] { EnemyKind.Elite, EnemyKind.CrossbowCapt };
                case 4:  return new[] { EnemyKind.WaterChief, EnemyKind.Elite };
                case 5:  return new[] { EnemyKind.WaterChief };
                case 6:  return new[] { EnemyKind.WaterChief, EnemyKind.CrossbowCapt };
                case 7:  return new[] { EnemyKind.Elite, EnemyKind.WaterChief };
                case 8:  return new[] { EnemyKind.CrossbowCapt, EnemyKind.WaterChief };
                case 9:  return new[] { EnemyKind.WaterChief, EnemyKind.Elite };
                case 10: return new[] { EnemyKind.Elite };

                // 第二章 三打祝家庄：神臂弩统领 + 披甲金雕王(12随鹰隼亮相)
                case 11: return new[] { EnemyKind.CrossbowCapt, EnemyKind.Elite };
                case 12: return new[] { EnemyKind.GoldenEagle, EnemyKind.CrossbowCapt };
                case 13: return new[] { EnemyKind.CrossbowCapt, EnemyKind.GoldenEagle };
                case 14: return new[] { EnemyKind.Elite, EnemyKind.CrossbowCapt };
                case 15: return new[] { EnemyKind.GoldenEagle };
                case 16: return new[] { EnemyKind.WaterChief, EnemyKind.GoldenEagle };
                case 17: return new[] { EnemyKind.GoldenEagle, EnemyKind.CrossbowCapt };
                case 18: return new[] { EnemyKind.CrossbowCapt, EnemyKind.Elite };
                case 19: return new[] { EnemyKind.GoldenEagle, EnemyKind.WaterChief };
                case 20: return new[] { EnemyKind.CrossbowCapt };

                // 第三章 夜打曾头市：铁浮屠重卫(21随铁甲亮相) + 护法妖师(26/27随妖道亮相)
                case 21: return new[] { EnemyKind.IronPagoda, EnemyKind.CrossbowCapt };
                case 22: return new[] { EnemyKind.GoldenEagle, EnemyKind.IronPagoda };
                case 23: return new[] { EnemyKind.IronPagoda, EnemyKind.WaterChief };
                case 24: return new[] { EnemyKind.CrossbowCapt, EnemyKind.IronPagoda };
                case 25: return new[] { EnemyKind.IronPagoda };
                case 26: return new[] { EnemyKind.HighPriest, EnemyKind.GoldenEagle };
                case 27: return new[] { EnemyKind.IronPagoda, EnemyKind.HighPriest };
                case 28: return new[] { EnemyKind.HighPriest, EnemyKind.IronPagoda };
                case 29: return new[] { EnemyKind.IronPagoda, EnemyKind.HighPriest };
                case 30: return new[] { EnemyKind.HighPriest };

                // 第四章 大破连环马：连环铁骑(31) + 背嵬巨力士(33随力士亮相)
                case 31: return new[] { EnemyKind.ChainHorse, EnemyKind.IronPagoda };
                case 32: return new[] { EnemyKind.IronPagoda, EnemyKind.ChainHorse };
                case 33: return new[] { EnemyKind.GiantBrute, EnemyKind.ChainHorse };
                case 34: return new[] { EnemyKind.ChainHorse, EnemyKind.GiantBrute };
                case 35: return new[] { EnemyKind.ChainHorse };
                case 36: return new[] { EnemyKind.GiantBrute, EnemyKind.CrossbowCapt };
                case 37: return new[] { EnemyKind.ChainHorse, EnemyKind.GiantBrute };
                case 38: return new[] { EnemyKind.GiantBrute, EnemyKind.HighPriest };
                case 39: return new[] { EnemyKind.ChainHorse, EnemyKind.IronPagoda };
                case 40: return new[] { EnemyKind.GiantBrute };

                // 第五章 三败高太尉：神火轰天车(41压轴登场) + 全精英轮番会战
                case 41: return new[] { EnemyKind.FireCart, EnemyKind.WaterChief };
                case 42: return new[] { EnemyKind.GoldenEagle, EnemyKind.FireCart };
                case 43: return new[] { EnemyKind.FireCart, EnemyKind.GoldenEagle };
                case 44: return new[] { EnemyKind.ChainHorse, EnemyKind.FireCart };
                case 45: return new[] { EnemyKind.FireCart };
                case 46: return new[] { EnemyKind.FireCart, EnemyKind.WaterChief };
                case 47: return new[] { EnemyKind.GiantBrute, EnemyKind.GoldenEagle };
                case 48: return new[] { EnemyKind.FireCart, EnemyKind.HighPriest };
                case 49: return new[] { EnemyKind.IronPagoda, EnemyKind.GiantBrute };
                default: return new[] { EnemyKind.FireCart };
            }
        }

        /// <summary>每关都会来的首领，按章节顺序：每章先章中首领，再章末首领。</summary>
        public static readonly EnemyKind[] BossOrder =
        {
            EnemyKind.HeTao, EnemyKind.Boss, EnemyKind.ZhuChaofeng, EnemyKind.Luan, EnemyKind.ZengKui,
            EnemyKind.ShiWen, EnemyKind.HanTao, EnemyKind.HuYan, EnemyKind.LiuMenglong, EnemyKind.GaoQiu,
        };

        public sealed class ChapterDef
        {
            public string Name, Bg, Intro;
            /// <summary>Boss 守第 10 关，MidBoss 守第 5 关。其余关按 BossOrder 轮换，血量仍沿用原来的章节奏。</summary>
            public EnemyKind Boss, MidBoss;
            public TroopMix[] Mix;
            public EnemyKind[] Elites;
            public string[] Levels;
        }

        public static readonly ChapterDef[] Chapters =
        {
            new ChapterDef { Name = "村口遭遇战", Bg = "battle_bg", Boss = EnemyKind.Boss, MidBoss = EnemyKind.HeTao, Mix = Mix1, Elites = new[] { EnemyKind.Elite },
                Intro = "外星先遣队降临幸福村口",
                Levels = new[] { "村口牌坊", "老槐树下", "小卖部前", "晒谷大场", "村东鱼塘", "广播站口", "红砖水塔", "卫生室前", "农机大院", "幸福村口" } },
            new ChapterDef { Name = "后山苞米地", Bg = "battle_bg_ch2", Boss = EnemyKind.Luan, MidBoss = EnemyKind.ZhuChaofeng, Mix = Mix1, Elites = new[] { EnemyKind.Elite },
                Intro = "后山玉米地惊现侦察飞碟群",
                Levels = new[] { "麦田怪圈", "玉米垄道", "大南瓜地", "养鸡大棚", "看瓜窝棚", "红薯地头", "老打谷场", "石板小桥", "护林哨所", "后山晒场" } },
            new ChapterDef { Name = "大集夜市战", Bg = "battle_bg_ch3", Boss = EnemyKind.ShiWen, MidBoss = EnemyKind.ZengKui, Mix = Mix1, Elites = new[] { EnemyKind.Elite },
                Intro = "外星重甲军团趁夜突袭乡村大集",
                Levels = new[] { "村西集头", "烧烤夜市", "露天银幕", "乡村戏台", "供销超市", "卤味摊口", "五金杂货", "棋牌茶棚", "集市广场", "大集总站" } },
            new ChapterDef { Name = "风雪北山坡", Bg = "battle_bg_ch4", Boss = EnemyKind.HuYan, MidBoss = EnemyKind.HanTao, Mix = Mix1, Elites = new[] { EnemyKind.ChainHorse },
                Intro = "大雪封村，外星机甲踏雪压境",
                Levels = new[] { "雪乡山口", "冰封河道", "红灯笼巷", "暖棚菜地", "老酒坊前", "冻梨摊口", "除雪站台", "风雪晒场", "钢板防线", "北坡母巢" } },
            new ChapterDef { Name = "决战母舰下", Bg = "battle_bg_ch5", Boss = EnemyKind.GaoQiu, MidBoss = EnemyKind.LiuMenglong, Mix = Mix1, Elites = new[] { EnemyKind.ChainHorse },
                Intro = "外星母舰压顶，全村总动员反击",
                Levels = new[] { "雷暴村郊", "失重坡道", "激光防线", "信号铁塔", "能量裂谷", "防空土坡", "牵引光柱", "登舰跳板", "母舰舱口", "活捉波波王" } },
        };

        /// <summary>首领关（逢5/10）第 4 波出首领、第 9 波出精英；普通关（非5倍数）不出大首领，第 4 波守关主精英 + 第 9 波压轴精英双节点挑大梁！</summary>
        static readonly int[] BossStageEliteWaves = { 9 };
        static readonly int[] NormalStageEliteWaves = { 4, 9 };
        public static float BossPace => Balance.Current.WaveStage.BossPace;
        static readonly Role[] BuffCycle = { Sim.Role.Mage, Sim.Role.Archer, Sim.Role.Fighter, Sim.Role.Bomber, Sim.Role.Control, Sim.Role.Archer, Sim.Role.Mage, Sim.Role.Fighter };

        /// <summary>
        /// 第 n 关（1 起）的敌人血量倍率（对标《永远的蔚蓝星球》关卡推进与卡点曲线）：
        /// 1. 开局第 1 关普通官兵约 175 血（1星射手需3箭、战士/炮手/法师需2击），彻底告别开场一刀秒；
        /// 2. 紧跟完整局外养成曲线 ExpectedPower(n) 并叠加关间压力斜率，每关扎实递进，逢 5/10 首领关设明确策略与养成试金石；
        /// 3. 不做局外养成在 3~4 关即明显受阻，落后 4 关养成在任意章节均无法平推。
        /// </summary>
        static float SmoothStagePower(int n)
        {
            float p0 = Meta.ExpectedPower(System.Math.Max(1, n - 1)) * Meta.ExpectedRoster(System.Math.Max(1, n - 1));
            float p1 = Meta.ExpectedPower(n) * Meta.ExpectedRoster(n);
            float p2 = Meta.ExpectedPower(System.Math.Min(50, n + 1)) * Meta.ExpectedRoster(System.Math.Min(50, n + 1));
            return n == 1 ? p1 : (0.25f * p0 + 0.50f * p1 + 0.25f * p2);
        }

        public static float StageHp(int n)
        {
            var ws = Balance.Current.WaveStage;
            float raw = HpTune(n) * SmoothStagePower(n) * StageEscalation(n);
            int idx = (n - 1) % LevelsPerChapter + 1;
            if (idx == 5) raw *= 1.07f;
            else if (idx == 10) raw *= 1.12f;
            if (n <= 1) return raw;
            // 保证每关严格单调上升且前期斜率饱满（第1~5关每关至少+18%，第6~15关至少+12%，后续至少+7.5%紧咬养成）
            float prev = StageHp(n - 1);
            float minStep = n <= 5 ? ws.StageMinStep1To5 : n <= 15 ? ws.StageMinStep6To15 : ws.StageMinStep16Plus;
            return System.Math.Max(raw, prev * minStep);
        }

        static float HpTune(int n)
        {
            var ws = Balance.Current.WaveStage;
            return Curve(n, ws.HpTuneStages, ws.HpTuneValues);
        }

        static float StageEscalation(int n) => 1f + 0.26f * System.Math.Min(1f, (n - 1) / 5f) + 0.005f * (n - 1);

        static float Curve(int n, float[] xs, float[] ys)
        {
            if (n <= xs[0]) return ys[0];
            for (int i = 1; i < xs.Length; i++)
                if (n <= xs[i]) return ys[i - 1] + (ys[i] - ys[i - 1]) * (n - xs[i - 1]) / (xs[i] - xs[i - 1]);
            return ys[ys.Length - 1];
        }

        public static float StageAtk(int n)
        {
            float a = Meta.ExpectedWall(n) * (1.16f + 0.022f * (n - 1));
            // 第4关移速放慢后，白板号会靠多出来的走位时间滚起阵容。拆墙伤害略抬，让摸到寨墙的官军能把这关压回去。
            if (n == 4) a *= 1.18f;
            return a;
        }

        public static LevelDef[] Levels { get; private set; } = BuildLevels();
        public static int LevelCount => Levels.Length;
        public static LevelDef Level(int no) => Levels[System.Math.Max(1, System.Math.Min(no, Levels.Length)) - 1];

        static Defs()
        {
            Balance.InitWithCodeDefaults();
        }

        internal static void EnsureInitialized() { _ = Heroes.Length; }

        /// <summary>当 BalanceConfig 参数变更时重算派生词条表与 50 关关卡表。</summary>
        public static void RebuildDerived()
        {
            Perks = BuildPerks();
            Levels = BuildLevels();
        }

        static LevelDef[] BuildLevels()
        {
            var ws = Balance.Current.WaveStage;
            var eco = Balance.Current.Economy;
            var list = new List<LevelDef>();
            for (int c = 0; c < Chapters.Length; c++)
            {
                var ch = Chapters[c];
                for (int i = 1; i <= LevelsPerChapter; i++)
                {
                    int n = c * LevelsPerChapter + i;
                    bool chBoss = i == 5 || i == 10;
                    // 对标《永远的蔚蓝星球》双轨节奏：
                    // - 逢 5 / 10 首领关：第 4 波守关大首领亲自压阵（BossWave = 4），第 9 波出精英副将；
                    // - 普通关（非 5 倍数）：不出大首领（BossWave = 0），第 4 波由守关主精英领军（血量与赏银对齐原第 4 波统领节奏，掉唯一生辰纲），第 9 波再出压轴精英！
                    var elites = StageElites(n);
                    // 首领移速提升至对标《蔚蓝星球》（第4波出→第5波到路中→第7波压墙）后，按真实交战窗口校准第4波首领/统领血量倍率
                    var oldKind = i == 10 ? ch.Boss : i >= 5 || c == 0 ? ch.MidBoss : Chapters[c - 1].Boss;
                    float oldMul = i == 10 ? (c == 0 ? 0.54f : c >= 4 ? 0.40f : c >= 3 ? 0.50f : 0.70f)
                        : i == 5 ? (c == 0 ? 0.38f : 0.58f)
                        : c == 0 ? 0.76f : 0.58f;
                    var boss = i == 10 ? ch.Boss : ch.MidBoss;
                    var wave4Unit = chBoss ? boss : elites[0];
                    float bossMul = wave4Unit == oldKind ? oldMul : Enemy(oldKind).Hp * oldMul / Enemy(wave4Unit).Hp;
                    var d = new LevelDef
                    {
                        No = n, Chapter = c + 1, Index = i, Name = ch.Levels[i - 1], Bg = ch.Bg,
                        Intro = chBoss ? $"首领 {Enemy(boss).Name} 亲临，守住村口防线" : n == 1 ? "击退十波外星先遣军，村口防线不能倒" : ch.Intro,
                        BossWave = chBoss ? ws.MainBossWave : 0,
                        RageWave = ws.MainRageWave,
                        EliteWaves = chBoss ? BossStageEliteWaves : NormalStageEliteWaves,
                        EliteKinds = elites, Troops = StageTroops(n),
                        BossKind = boss,
                        BossMul = bossMul,
                        HpMul = StageHp(n), AtkMul = StageAtk(n),
                        WallHp = ws.WallBaseHp,
                        StartCoins = eco.StartCoins,
                        CountMul = 1f + 0.006f * (n - 1) + (i == 10 ? 0.06f : 0f),
                    };
                    if (n > 1)
                    {
                        d.BuffRole = BuffCycle[(n * 3 + c) % BuffCycle.Length];
                        d.BuffPct = chBoss ? ws.StageBuffBoss : ws.StageBuffNormal;
                    }
                    list.Add(d);
                }
            }
            return list.ToArray();
        }

        /// <summary>校场演武：按当前进度出一关加强版，每天换增益。</summary>
        public static LevelDef DailyStage(int cleared, int day)
        {
            int n = System.Math.Max(1, System.Math.Min(LevelCount, cleared + 2));
            var b = Level(n);
            var ws = Balance.Current.WaveStage;
            var eco = Balance.Current.Economy;
            var d = new LevelDef
            {
                No = n, Chapter = b.Chapter, Index = b.Index, Name = "民兵大比武", Bg = b.Bg, Intro = "守满十波，夺十里八乡头名",
                BossWave = ws.MainBossWave, RageWave = ws.MainRageWave,
                EliteWaves = BossStageEliteWaves, EliteKinds = new[] { b.EliteKinds[b.EliteKinds.Length - 1] }, Troops = b.Troops,
                BossKind = BossOrder[(day % BossOrder.Length + BossOrder.Length) % BossOrder.Length], BossMul = 1.15f,
                HpMul = b.HpMul * 1.08f, AtkMul = b.AtkMul, CountMul = b.CountMul + 0.08f,
                WallHp = ws.WallBaseHp, StartCoins = eco.StartCoins,
                BuffRole = BuffCycle[(day % BuffCycle.Length + BuffCycle.Length) % BuffCycle.Length], BuffPct = 0.6f,
                Mode = StageMode.Daily,
            };
            return d;
        }

        /// <summary>劫生辰纲：六波，每波一串挑担的，打得越多铜钱越多。</summary>
        public static LevelDef EscortStage(int cleared)
        {
            int n = System.Math.Max(1, System.Math.Min(LevelCount, cleared));
            var b = Level(n);
            var ws = Balance.Current.WaveStage;
            var eco = Balance.Current.Economy;
            return new LevelDef
            {
                No = n, Chapter = b.Chapter, Index = b.Index, Name = "截获外星补给", Bg = "battle_bg", Intro = "拦下样本搬运工，打爆能量箱越多金币越多",
                Waves = 6, BossWave = 0, RageWave = 5, EliteWaves = new[] { 4 }, PorterWaves = new[] { 1, 2, 3, 4, 5, 6 }, PorterCount = 3,
                EliteKinds = b.EliteKinds, Troops = Mix1, HpMul = b.HpMul * 0.9f, AtkMul = b.AtkMul, CountMul = 0.6f,
                WallHp = ws.WallBaseHp, StartCoins = eco.StartCoins,
                Mode = StageMode.Escort,
            };
        }

        /// <summary>每波的兵（不含精英、首领、生辰纲），按独立权重逐步混入，第1波纯基础步卒。</summary>
        public static List<EnemyKind> WaveTroops(LevelDef st, int wave, Rng rng)
        {
            var list = new List<EnemyKind>();
            int total = System.Math.Max(1, (int)System.Math.Round(WaveCount(wave) * st.CountMul));
            for (int i = 0; i < total; i++)
            {
                float r = rng.F(), acc = 0f;
                EnemyKind k = EnemyKind.Soldier;
                foreach (var m in st.Troops)
                {
                    if (wave < m.From) continue;
                    acc += m.Base + (wave - m.From) * m.Grow;
                    if (r < acc) { k = m.Kind; break; }
                }
                list.Add(k);
            }
            return list;
        }
    }
}
