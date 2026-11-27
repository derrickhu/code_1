using System.Collections.Generic;

namespace Liangshan.Sim
{
    /// <summary>存档按下标存乡亲，只能往后加。</summary>
    public enum HeroId
    {
        HuaRong, LingZhen, GongSun, WuSong, ZhangQing, LinChong, LuZhiShen, WuYong,
        LuJunyi, GuanSheng, YanQing, FanRui, HuSanniang, AnDaoquan, DaiZong, QinMing,
        LiKui, QiaoDaoqing, ZhuWu, XuNing, ShanTinggui, WeiDingguo,
        ShiXiu, XieZhen, XieBao, MaLing, KongLiang, TangLong, SunErniang, RuanXiaoqi, ShiQian, JiangJing,
    }

    public enum Role { Archer, Bomber, Mage, Fighter, Support, Control }

    /// <summary>强化、被动的效果种类。数值含义见 Defs.EffText。</summary>
    public enum Eff
    {
        Dmg, Speed, Count, Area, Chain, Crit, Stun, Slow, Elite, UltCd, UltPow, Range, Split,
        Aura, Coin, Fly, Cav, Surge, Top, Blast, Burn, Vuln, Reach, Shatter, Exec, Resonance,
        Conduct, Refract,
    }

    /// <summary>强化卡的类型：数值（纯加成）、取舍（有代价，同组互斥）、质变（改变攻击方式）、进阶（要先有对应质变）。</summary>
    public enum PerkKind { Value, Trade, Morph, Adv }

    /// <summary>传说乡亲的大招，和辅助的技能（Bless 之后几种只给辅助用）。</summary>
    public enum UltKind
    {
        Thunder, Frost, Sweep, Haste, Heal, Bind, Snipe, Tornado, Meteor,
        Bless, Rush, Mend, Forge, Steal, Interest,
    }

    /// <summary>辅助在场时的光环，按场上该乡亲星级累加。</summary>
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
        /// 技能：弹道种类、每发伤害系数（村长攻击力的倍数）、冷却秒数、射程（近战才有限制）。
        /// </summary>
        public ShotKind Shot;
        public float Coef, Interval, Range = 99, Radius = 0.4f, Knock, Stun, StunChance, Slow;
        public int Count = 1, Chain;
        public string AtkName, AtkIcon, Noun;
        /// <summary>弹道、命中特效的色调（空 = 弹道自带颜色）。</summary>
        public string Tint;
        /// <summary>这位乡亲自己的兵器弹道图（空 = 按弹道种类的通用图），图里兵器尖朝上；ProjSpin 为飞行中打旋。</summary>
        public string Proj;
        public bool ProjSpin;
        public float ProjSize = 1f;
        /// <summary>穿透递增伤害、天生持续灼烧/辣毒倍率、是否附带 60% 减疗。</summary>
        public float PierceGrow, Dot;
        public bool AntiHeal;
        /// <summary>奇人持续施法：持续秒数、每跳间隔；Coef 是每跳的伤害。</summary>
        public float Chan, Tick;
        /// <summary>辅助的技能：不打伤害，给友军加持。BuffV 是效果量。</summary>
        public UltKind? Buff;
        public float BuffV;

        /// <summary>大招：只有传说乡亲有，局内强化抽到「大招」卡才解锁。UltCoef 是乡亲攻击力的倍数。</summary>
        public UltKind Ult;
        public string UltName, UltIcon, UltTip;
        public float UltCoef, UltCd, UltRadius = 1.6f, UltStun;
        public int UltN = 1;

        /// <summary>10 级解锁的绝技/被动。</summary>
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
        /// <summary>每秒对单体的期望输出（× 攻击力），战力估算与数值表核验用（持续施法英雄在施法期内即同步读秒 Interval 冷却，真实周期为 Max(Interval, Chan)）。</summary>
        public float Dps => Buff.HasValue ? 0 : Coef * Count * (Chan > 0 ? Chan / Tick : 1f) / System.Math.Max(Interval, Chan + 0.1f);
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
        /// <summary>本关主统领（逢5/10关为守关大首领，普通关为第4波领军精英统领，用于村口展示与敌情）。</summary>
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
        /// <summary>远程兵停在这条线上放光弹，不贴防线。</summary>
        public float StopY;
        public EnemyRank Rank;
        public bool Flying;
        /// <summary>受物理伤害减免；受奇人能量（电、火、风、水、磁）伤害加成；被射手克制。</summary>
        public float PhysResist, MagicWeak, ArcherWeak;
        public bool Big => Rank != EnemyRank.Minion;
        public bool IsBoss => Rank == EnemyRank.Boss;
    }

    /// <summary>乡亲专属强化。Star 为满星额外技能，只在合成满星时三选一；Ult 是传说乡亲的「大招」卡，Finisher 是史诗/稀有的「奥义」卡。</summary>
    public sealed class PerkDef
    {
        public string Id, Name, Desc;
        public HeroId Hero;
        public int Max = 1;
        public float Weight = 1;
        public Eff Eff;
        public float V;
        public bool Star, Ult, Finisher;
        /// <summary>乡亲等级解锁的选项：1 = 5 级解锁选项，2 = 20 级解锁选项，3 = 15 级解锁专属选项；没到等级不进卡池。</summary>
        public int Opt;
        public PerkKind Kind;
        /// <summary>取舍卡的代价（V2 为负）或双词条副加成。</summary>
        public bool Has2;
        public Eff Eff2;
        public float V2;
        /// <summary>进阶卡的前置强化；同一乡亲 Group 相同的卡只能拿一张。</summary>
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
        /// <summary>出了舱口、走过这条线才会被锁定，让外星军先涌进场地。</summary>
        public const float EngageY = 5.2f;
        /// <summary>全村集合的半圆声波范围：圆心在防线中点，半径到战场左右边，只朝上。</summary>
        public static bool InLordRange(V2 p)
        {
            float dx = p.X;
            float dy = p.Y - WallRowY;
            if (dy < 0f) return false;
            return dx * dx + dy * dy <= HalfW * HalfW;
        }

        /// <summary>冲击波从防线中点出手，锋面一路飞到半圆边上。</summary>
        public static readonly V2 LordOrigin = new V2(0f, WallRowY);

        /// <summary>冲击波锋面从老村长扫到 p 的秒数。伤害和画面都按这个时刻落下。</summary>
        public static float LordHitDelay(V2 p) => (p - LordOrigin).Len / Defs.LordWaveSpeed;

        /// <summary>冲击波整段飞行时间：锋面到半圆边。</summary>
        public static float LordFlightTime => HalfW / Defs.LordWaveSpeed;

        public const float SlotGap = 1.36f;
        public const int BaseSlots = 7;
        public const int MaxSlots = 12;
        public const float RoadHalfW = 2.85f;
        public static readonly float[] GateX = { -3.05f, 3.05f };

        /// <summary>按纵坐标收束村口大路半宽。</summary>
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
        /// 伤害系数 Coef 是乡亲攻击力的倍数（村长初始攻击 50）。每位乡亲四技能体系，数值对标最新平衡设计。
        /// </summary>
        public static readonly HeroDef[] Heroes =
        {
            // ---------- 初始四人与早期入伙 ----------
            new HeroDef { Id = HeroId.HuaRong, Name = "华木匠", Nick = "气钉神手", Kind = Sim.Role.Archer, Rarity = 3, Art = "hero_huarong",
                Shot = ShotKind.Arrow, Coef = 2.96f, Interval = 2.35f, Chain = 1, PierceGrow = 0.22f, AtkName = "高压射钉", AtkIcon = "wp_nail", Proj = "wp_nail", ProjSize = 0.68f, Tint = "B45CFF", Noun = "钢钉",
                PassiveName = "百步穿钉", PassiveEff = Eff.Crit, PassiveV = 0.18f, Desc = "改装高压射钉枪穿透外星军，每穿一敌伤害递增" },
            new HeroDef { Id = HeroId.LingZhen, Name = "凌焊神", Nick = "野生发明家", Kind = Sim.Role.Bomber, Rarity = 3, Art = "hero_lingzhen", Element = "火系",
                Shot = ShotKind.Bomb, Coef = 2.85f, Interval = 4.10f, Radius = 1.25f, Knock = 0.32f, AtkName = "煤气罐炮", AtkIcon = "wp_gascan", Proj = "wp_gascan", ProjSize = 1.15f, Tint = "B45CFF", Noun = "重炮",
                PassiveName = "焊装扩容", PassiveEff = Eff.Area, PassiveV = 0.25f, Desc = "土法焊接煤气罐迫击炮，大口径震退外星潮" },
            new HeroDef { Id = HeroId.GongSun, Name = "孙电工", Nick = "万伏雷神", Kind = Sim.Role.Mage, Rarity = 4, Art = "hero_gongsun", Element = "电系",
                Shot = ShotKind.Lightning, Coef = 2.78f, Interval = 3.60f, Radius = 0.88f, Chain = 1, AtkName = "高压电弧", AtkIcon = "fx_zap", Tint = "FFE252", Noun = "电弧",
                Ult = UltKind.Thunder, UltName = "拉闸放雷", UltIcon = "fx_lightning", UltCoef = 2.8f, UltCd = 30, UltN = 8, UltStun = 1f, UltRadius = 1.15f,
                UltTip = "8道万伏雷暴劈向敌群\n每道麻痹1秒",
                PassiveName = "并网增幅", PassiveEff = Eff.Chain, PassiveV = 2, Desc = "引一道高压电弧劈敌并跃迁传导，随强化进化连环电网" },
            new HeroDef { Id = HeroId.WuSong, Name = "武教练", Nick = "散打拳王", Kind = Sim.Role.Fighter, Rarity = 3, Art = "hero_wusong",
                Shot = ShotKind.Punch, Coef = 3.15f, Interval = 3.15f, Range = 4.8f, Radius = 0.92f, Knock = 0.65f, AtkName = "重炮铁拳", AtkIcon = "wp_ironfist", Proj = "wp_ironfist", Tint = "FFB038", Noun = "铁拳",
                PassiveName = "专打硬茬", PassiveEff = Eff.Elite, PassiveV = 0.6f, Desc = "冠军重拳势大力沉，震退贴墙外星军" },
            new HeroDef { Id = HeroId.ZhangQing, Name = "张雀神", Nick = "麻将宗师", Kind = Sim.Role.Archer, Rarity = 3, Art = "hero_zhangqing",
                Shot = ShotKind.Stone, Coef = 2.71f, Interval = 2.15f, Radius = 0.32f, Chain = 2, AtkName = "雀神飞牌", AtkIcon = "fx_rock0", Tint = "38E898", Noun = "麻将牌",
                PassiveName = "听牌自摸", PassiveEff = Eff.Chain, PassiveV = 2, Desc = "甩出麻将牌在外星人脑门之间连环弹射" },
            new HeroDef { Id = HeroId.LinChong, Name = "林班长", Nick = "液氮兵王", Kind = Sim.Role.Fighter, Rarity = 4, Art = "hero_linchong",
                Shot = ShotKind.Spear, Coef = 3.65f, Interval = 3.05f, Range = 6.2f, Radius = 0.76f, Knock = 0.30f, AtkName = "液氮冰炮", AtkIcon = "wp_snakespear", Proj = "wp_snakespear", Tint = "4CE8FF", Noun = "寒流",
                Ult = UltKind.Frost, UltName = "冷库全开", UltIcon = "fx_ice", UltCoef = 13.5f, UltCd = 30, UltRadius = 1.9f, UltStun = 2.5f,
                UltTip = "液氮寒潮冰封敌群\n冻住2.5秒",
                PassiveName = "退伍兵王", PassiveEff = Eff.Crit, PassiveV = 0.2f, Desc = "背负双联液氮罐喷射超导寒流贯穿整列，攻击距离远" },
            new HeroDef { Id = HeroId.LuZhiShen, Name = "鲁大力", Nick = "筑路猛汉", Kind = Sim.Role.Fighter, Rarity = 3, Art = "hero_luzhishen",
                Shot = ShotKind.Slam, Coef = 3.90f, Interval = 3.95f, Range = 5.2f, Radius = 1.2f, Knock = 0.55f, AtkName = "千斤夯锤", AtkIcon = "wp_staff", Proj = "wp_staff", Tint = "B88CFF", Noun = "夯锤",
                PassiveName = "天生神力", PassiveEff = Eff.Speed, PassiveV = 0.2f, Desc = "筑路打夯大石锤腾空砸地，大范围震退" },
            new HeroDef { Id = HeroId.WuYong, Name = "吴校长", Nick = "蒲扇智囊", Kind = Sim.Role.Support, Rarity = 3, Art = "hero_wuyong", Element = "风系",
                Shot = ShotKind.Wind, Interval = 28f, Buff = UltKind.Bless, BuffV = 1f, AtkName = "摇扇鼓劲", AtkIcon = "ic_fan", Tint = "66E4FF", Noun = "凉风",
                Aura = AuraKind.Speed, AuraV = 0.04f,
                PassiveName = "勤俭持村", PassiveEff = Eff.Coin, PassiveV = 15, Desc = "摇扇鼓舞输出乡亲加攻速，在场提升全村攻速" },

            // ---------- 传说 ----------
            new HeroDef { Id = HeroId.LuJunyi, Name = "卢宗师", Nick = "醒狮武王", Kind = Sim.Role.Fighter, Rarity = 4, Art = "hero_lujunyi",
                Shot = ShotKind.Spear, Coef = 3.88f, Interval = 3.20f, Range = 6.0f, Radius = 0.8f, Knock = 0.32f, AtkName = "醒狮金棍", AtkIcon = "wp_spear", Proj = "wp_spear", Tint = "FFD448", Noun = "金棍",
                Ult = UltKind.Sweep, UltName = "横扫村口", UltIcon = "fx_wave", UltCoef = 10.0f, UltCd = 30, UltN = 5,
                UltTip = "电光金棍横扫整排\n五段击飞",
                PassiveName = "醒狮宗师", PassiveEff = Eff.Crit, PassiveV = 0.15f, Desc = "金狮披挂加持高压电光武棍宽幅横扫，一次挑翻一列" },
            new HeroDef { Id = HeroId.GuanSheng, Name = "关大爷", Nick = "镇村刀神", Kind = Sim.Role.Fighter, Rarity = 4, Art = "hero_guansheng",
                Shot = ShotKind.Slam, Coef = 4.53f, Interval = 3.85f, Range = 5.4f, Radius = 1.3f, Knock = 0.55f, AtkName = "热熔重刀", AtkIcon = "wp_broadsword", Proj = "wp_broadsword", Tint = "FF6A1E", Noun = "大刀",
                Ult = UltKind.Sweep, UltName = "社火刀阵", UltIcon = "fx_shock", UltCoef = 11.5f, UltCd = 30, UltN = 5,
                UltTip = "热熔重刀横扫防线前\n五段重劈",
                PassiveName = "老当益壮", PassiveEff = Eff.Elite, PassiveV = 0.5f, Desc = "背插社火双旗挥烧红弹簧钢重刀腾空劈斩，范围大伤害高" },
            new HeroDef { Id = HeroId.YanQing, Name = "小燕子", Nick = "改装极客", Kind = Sim.Role.Archer, Rarity = 4, Art = "hero_yanqing",
                Shot = ShotKind.Arrow, Coef = 1.38f, Interval = 2.05f, Count = 3, AtkName = "三联钉枪", AtkIcon = "wp_railnail", Proj = "wp_railnail", ProjSize = 0.72f, Tint = "FFD84A", Noun = "钢钉",
                Ult = UltKind.Snipe, UltName = "超距狙击", UltIcon = "fx_goldarrow", UltCoef = 11f, UltCd = 30,
                UltTip = "锁定场上最强首领\n一发电磁重创",
                PassiveName = "双翼供弹", PassiveEff = Eff.Speed, PassiveV = 0.2f, Desc = "双翼无人机辅助三联电磁射钉，场上满四位再添一钉" },
            new HeroDef { Id = HeroId.FanRui, Name = "樊飞手", Nick = "狂风飞手", Kind = Sim.Role.Mage, Rarity = 4, Art = "hero_fanrui", Element = "风系",
                Shot = ShotKind.Wind, Coef = 1.02f, Interval = 12.0f, Chan = 3.75f, Tick = 0.25f, Radius = 1.25f, Slow = 1.5f, AtkName = "旋风涡流", AtkIcon = "fx_wind_shell", Noun = "涡流", Tint = "5EE8FF",
                Ult = UltKind.Tornado, UltName = "十级狂飙", UltIcon = "fx_spin_vortex", UltCoef = 9.0f, UltCd = 30, UltRadius = 2.2f, UltStun = 1f,
                UltTip = "八旋翼狂风卷起敌群\n眩晕1秒",
                PassiveName = "涡轮增压", PassiveEff = Eff.Dmg, PassiveV = 0.2f, Desc = "操控巨型八旋翼植保机吹出强风持续绞杀，范围减速" },
            new HeroDef { Id = HeroId.HuSanniang, Name = "胡三妹", Nick = "套马飒姐", Kind = Sim.Role.Control, Rarity = 4, Art = "hero_husanniang",
                Shot = ShotKind.Lasso, Coef = 3.01f, Interval = 3.45f, Radius = 1.05f, Stun = 1.6f, AtkName = "电磁红索", AtkIcon = "wp_lasso", Proj = "wp_lasso", ProjSpin = true, Noun = "套索", Tint = "FF3E38",
                Ult = UltKind.Bind, UltName = "五花大绑", UltIcon = "wp_lasso", UltCoef = 6.6f, UltCd = 30, UltN = 5, UltStun = 2.5f,
                UltTip = "同时套住5个外星人\n优先精英首领",
                PassiveName = "套马巧劲", PassiveEff = Eff.Stun, PassiveV = 0.4f, Desc = "电磁绞盘驱动发光红索锁敌并高压电击，连外星首领也能捆住" },
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
                Shot = ShotKind.Fireball, Coef = 3.40f, Interval = 4.45f, Radius = 1.3f, Dot = 0.45f, AtkName = "高爆礼花", AtkIcon = "wp_firework", Proj = "wp_firework", ProjSize = 1.05f, Tint = "FFD24A", Noun = "礼花",
                Ult = UltKind.Meteor, UltName = "除夕总攻", UltIcon = "wp_firework", UltCoef = 3.8f, UltCd = 30, UltN = 10, UltRadius = 1.2f,
                UltTip = "天降10颗高爆礼花\n轰炸敌群",
                PassiveName = "黑药加量", PassiveEff = Eff.Area, PassiveV = 0.25f, Desc = "背负金龙礼花巢轰出庆典重型礼花弹，大招十发洗地" },

            // ---------- 史诗 ----------
            new HeroDef { Id = HeroId.LiKui, Name = "李铁牛", Nick = "油锯猛汉", Kind = Sim.Role.Fighter, Rarity = 3, Art = "hero_likui",
                Shot = ShotKind.Punch, Coef = 3.10f, Interval = 3.20f, Range = 4.8f, Radius = 1.05f, Knock = 0.52f, AtkName = "旋风油锯", AtkIcon = "wp_axe_spin", Proj = "wp_axe", ProjSpin = true, Tint = "FF6E1A", Noun = "油锯",
                PassiveName = "双锯开山", PassiveEff = Eff.Area, PassiveV = 0.3f, Desc = "双持大马力伐木油锯呼啸切割，击退近墙外星军" },
            new HeroDef { Id = HeroId.QiaoDaoqing, Name = "乔老板", Nick = "烈火烤王", Kind = Sim.Role.Mage, Rarity = 3, Art = "hero_qiaodaoqing", Element = "火系",
                Shot = ShotKind.Beam, Coef = 0.62f, Interval = 10.4f, Chan = 3.6f, Tick = 0.2f, Radius = 0.66f, AtkName = "炙烤火舌", AtkIcon = "fx_fireball", Noun = "火舌", Tint = "FF8A2A",
                PassiveName = "猛火炙烤", PassiveEff = Eff.Crit, PassiveV = 0.15f, Desc = "喷出高温烤枪火舌持续融甲，火伤克制重甲" },
            new HeroDef { Id = HeroId.ZhuWu, Name = "朱棋王", Nick = "残局大爷", Kind = Sim.Role.Control, Rarity = 3, Art = "hero_zhuwu", Element = "风系",
                Shot = ShotKind.Wind, Coef = 2.10f, Interval = 5.4f, Radius = 1.55f, Slow = 3f, AtkName = "楚河棋阵", AtkIcon = "wp_chess", Proj = "wp_chess", ProjSpin = true, ProjSize = 0.90f, Noun = "棋阵", Tint = "66B8FF",
                PassiveName = "老谋深算", PassiveEff = Eff.Slow, PassiveV = 1f, Desc = "展开强磁象棋大阵困住敌群，长时间减速" },
            new HeroDef { Id = HeroId.XuNing, Name = "徐农机", Nick = "铁臂机手", Kind = Sim.Role.Control, Rarity = 3, Art = "hero_xuning",
                Shot = ShotKind.Spear, Coef = 2.65f, Interval = 4.35f, Range = 6.8f, Radius = 0.72f, Slow = 2f, AtkName = "液压抓钳", AtkIcon = "wp_hookspear", Proj = "wp_hookspear", Noun = "抓钳", Tint = "FFD27A",
                PassiveName = "专拆底盘", PassiveEff = Eff.Cav, PassiveV = 0.5f, Desc = "重型挖掘机液压钢抓钳拖慢敌军，专克飞艇与机甲兽" },
            new HeroDef { Id = HeroId.ShanTinggui, Name = "单消防", Nick = "高压水手", Kind = Sim.Role.Mage, Rarity = 3, Art = "hero_shantinggui", Element = "水系",
                Shot = ShotKind.Beam, Coef = 0.60f, Interval = 10.4f, Chan = 3.6f, Tick = 0.2f, Radius = 0.68f, Slow = 1.5f, AtkName = "高压水柱", AtkIcon = "fx_icecrystal", Noun = "水柱", Tint = "6FC8FF",
                PassiveName = "增压水泵", PassiveEff = Eff.Dmg, PassiveV = 0.2f, Desc = "大功率水炮冲刷一整条直线，沿途强力减速" },
            new HeroDef { Id = HeroId.WeiDingguo, Name = "魏油匠", Nick = "热油掌柜", Kind = Sim.Role.Bomber, Rarity = 3, Art = "hero_weidingguo", Element = "火系",
                Shot = ShotKind.Bomb, Coef = 2.05f, Interval = 4.05f, Radius = 1.15f, Dot = 0.60f, AntiHeal = true, AtkName = "滚烫油罐", AtkIcon = "wp_oilpot", Proj = "wp_oilpot", ProjSize = 1.10f, Noun = "油罐", Tint = "FF6422",
                PassiveName = "火上浇油", PassiveEff = Eff.Burn, PassiveV = 0.45f, Desc = "投出滚烫红油罐铺开火海，持续灼烧并抑制纳米修复" },

            // ---------- 稀有 ----------
            new HeroDef { Id = HeroId.ShiXiu, Name = "王铁柱", Nick = "快刀屠夫", Kind = Sim.Role.Fighter, Rarity = 2, Art = "hero_shixiu",
                Shot = ShotKind.Punch, Coef = 2.09f, Interval = 2.65f, Range = 4.8f, Radius = 0.72f, Knock = 0.34f, AtkName = "剔骨快刀", AtkIcon = "wp_dao", Proj = "wp_dao", ProjSize = 0.94f, Tint = "CBE8FF", Noun = "快刀",
                PassiveName = "刀法利落", PassiveEff = Eff.Crit, PassiveV = 0.2f, Desc = "宽背精钢剔骨斩骨刀凌厉劈斩，暴击极高" },
            new HeroDef { Id = HeroId.XieZhen, Name = "二狗子", Nick = "弹弓皮猴", Kind = Sim.Role.Archer, Rarity = 2, Art = "hero_xiezhen",
                Shot = ShotKind.Arrow, Coef = 2.40f, Interval = 2.20f, AtkName = "穿云钢珠", AtkIcon = "wp_pellet", Proj = "wp_pellet", ProjSize = 0.30f, Tint = "9ED8FF", Noun = "钢珠",
                PassiveName = "打鸟专家", PassiveEff = Eff.Fly, PassiveV = 0.5f, Desc = "钛合金弹弓精准点射，专克空中飞碟" },
            new HeroDef { Id = HeroId.XieBao, Name = "王大壮", Nick = "辣叉壮汉", Kind = Sim.Role.Archer, Rarity = 2, Art = "hero_xiebao",
                Shot = ShotKind.Arrow, Coef = 1.76f, Interval = 2.45f, Chain = 1, Dot = 0.35f, AtkName = "魔鬼辣叉", AtkIcon = "wp_fork", Proj = "wp_fork", ProjSize = 0.88f, Tint = "FF4222", Noun = "辣叉",
                PassiveName = "双倍辣毒", PassiveEff = Eff.Chain, PassiveV = 1, Desc = "蘸满特辣红油的不锈钢农叉穿透外星人并附带持续辣毒" },
            new HeroDef { Id = HeroId.MaLing, Name = "马包工", Nick = "红砖队长", Kind = Sim.Role.Mage, Rarity = 2, Art = "hero_maling", Element = "磁系",
                Shot = ShotKind.Stone, Coef = 2.27f, Interval = 3.30f, Radius = 0.98f, Stun = 0.8f, StunChance = 0.35f, AtkName = "磁化红砖", AtkIcon = "wp_goldbrick", Proj = "wp_goldbrick", ProjSpin = true, Noun = "红砖", Tint = "FFD24A",
                PassiveName = "砌墙快手", PassiveEff = Eff.Area, PassiveV = 0.25f, Desc = "甩出电磁实心红砖从天砸落，激起震波轰击一片并高几率拍晕" },
            new HeroDef { Id = HeroId.KongLiang, Name = "陈喜子", Nick = "炮仗小哥", Kind = Sim.Role.Bomber, Rarity = 2, Art = "hero_kongliang", Element = "火系",
                Shot = ShotKind.Bomb, Coef = 2.05f, Interval = 3.75f, Radius = 1.00f, AtkName = "大二踢脚", AtkIcon = "wp_cracker", Proj = "wp_cracker", ProjSize = 1.02f, Tint = "FF3B2E", Noun = "炮仗",
                PassiveName = "添药加响", PassiveEff = Eff.Area, PassiveV = 0.22f, Desc = "掷出大号双响二踢脚，炸翻扎堆小灰人" },
            new HeroDef { Id = HeroId.TangLong, Name = "唐五金", Nick = "维修老铁", Kind = Sim.Role.Support, Rarity = 2, Art = "hero_tanglong",
                Shot = ShotKind.Stone, Interval = 24f, Buff = UltKind.Forge, BuffV = 0.4f, AtkName = "家伙改装", AtkIcon = "wp_jian", Noun = "扳手", Tint = "A8AEB8",
                Aura = AuraKind.Dmg, AuraV = 0.03f,
                PassiveName = "五金世家", PassiveEff = Eff.Aura, PassiveV = 0.5f, Desc = "定时加固家伙提升伤害，在场提高全村伤害" },
            new HeroDef { Id = HeroId.SunErniang, Name = "孙辣妹", Nick = "辣坊老板娘", Kind = Sim.Role.Control, Rarity = 2, Art = "hero_sunerniang", Element = "风系",
                Shot = ShotKind.Wind, Coef = 1.67f, Interval = 5.6f, Radius = 1.3f, Slow = 2f, Stun = 1.2f, StunChance = 0.5f, AtkName = "魔鬼辣雾", AtkIcon = "wp_chili", Proj = "wp_chili", ProjSpin = true, ProjSize = 0.86f, Noun = "辣粉", Tint = "FF4824",
                PassiveName = "特辣配方", PassiveEff = Eff.Stun, PassiveV = 0.15f, Desc = "一瓢魔鬼辣椒粉呛晕一片外星人" },
            new HeroDef { Id = HeroId.RuanXiaoqi, Name = "阮老七", Nick = "鱼塘塘主", Kind = Sim.Role.Control, Rarity = 2, Art = "hero_ruanxiaoqi",
                Shot = ShotKind.Wind, Coef = 1.65f, Interval = 5.4f, Radius = 1.35f, Stun = 1.2f, AtkName = "深水大网", AtkIcon = "wp_net", Proj = "wp_net", ProjSpin = true, Noun = "渔网", Tint = "5AD8FF",
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
                Desc = "举着能量合金盾，减免物理伤害，怕电火风奇人轰击", PhysResist = 0.28f, MagicWeak = 0.30f, StopY = Layout.StopY },
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

        struct PerkSpec
        {
            public string Name;
            public Eff Eff, Eff2;
            public float V, V2;
            public int Max;
            public bool Has2, Raw;
        }

        static PerkSpec S(string name, Eff e, float v, int max = 1) =>
            new PerkSpec { Name = name, Eff = e, V = v, Max = max };

        static PerkSpec C(string name, Eff e, float v, Eff e2, float v2, int max = 1) =>
            new PerkSpec { Name = name, Eff = e, V = v, Has2 = true, Eff2 = e2, V2 = v2, Max = max, Raw = true };

        /// <summary>
        /// 每位乡亲 7 条核心专属（前 4 条进局内强化三选一，后 3 条为 4 星合成免费大奖）+ 等级解锁专属 + 职业定制取舍/流派质变链。
        /// 全职业严格遵循「同档等值预算 + 职业特性本味（奇人修连锁/折射/充能，辅助修扩格/加持/破绽）」。
        /// </summary>
        static PerkDef[] BuildPerks()
        {
            var list = new List<PerkDef>();
            void Add(HeroId h, params PerkSpec[] ps)
            {
                var d = Hero(h);
                string key = d.Art.Substring(5);
                for (int i = 0; i < ps.Length; i++)
                {
                    var sp = ps[i];
                    bool star = i >= 4;
                    var (e, v) = sp.Raw ? (sp.Eff, sp.V) : Adapt(d, sp.Eff, sp.V);
                    if (!star && !sp.Raw) v *= Boost(e);
                    Eff e2 = sp.Eff2;
                    float v2 = sp.V2;
                    string desc = sp.Has2
                        ? $"{SingleLineEff(h, e, v)}\n{SingleLineEff(h, e2, v2)}"
                        : EffText(h, e, v);
                    list.Add(new PerkDef
                    {
                        Id = key + "_" + i, Hero = h, Name = sp.Name, Eff = e, V = v,
                        Has2 = sp.Has2, Eff2 = e2, V2 = v2,
                        Max = star ? 1 : sp.Max, Star = star,
                        Group = !star && e == Eff.Count && !sp.Has2 && d.Kind != Sim.Role.Support && d.Chan <= 0 ? "volley" : null,
                        Weight = !star && e == Eff.Count && !sp.Has2 ? 0.80f : 1f,
                        Desc = desc,
                    });
                }
                bool sup = d.Kind == Sim.Role.Support;
                var kit = HeroKits.Of(h);
                string surge = OptNames.Surge[(int)h];
                list.Add(new PerkDef
                {
                    Id = key + "_surge", Hero = h, Name = surge, Opt = 1, Weight = 1.3f,
                    Eff = sup ? Eff.UltPow : Eff.Surge, V = sup ? 0.50f : SurgeChance,
                    Has2 = sup, Eff2 = Eff.UltCd, V2 = sup ? 0.22f : 0f,
                    Desc = sup ? "加持效力 +50%\n技能冷却 -22%" : $"{Pct(SurgeChance)} 触发巨型{d.Noun ?? "攻击"}\n该击伤害 +{Pct(SurgeDmg - 1f)}",
                });
                list.Add(new PerkDef
                {
                    Id = key + "_top", Hero = h, Name = sup ? "首席智囊" : "最强" + (d.Noun ?? "一击"), Opt = 2, Weight = 1.3f,
                    Eff = sup ? Eff.Aura : Eff.Top, V = sup ? 0.55f : TopDmg,
                    Has2 = sup, Eff2 = Eff.UltPow, V2 = sup ? 0.35f : 0f,
                    Desc = sup ? "在场光环 +55%\n加持效力 +35%" : $"场上最高星{d.Name}\n最终伤害 +{Pct(TopDmg)}",
                });
                list.Add(new PerkDef
                {
                    Id = key + "_opt15", Hero = h, Name = kit.Opt15Name, Opt = 3, Weight = 1.45f,
                    Eff = kit.Opt15Eff, V = kit.Opt15V,
                    Has2 = kit.Opt15V2 > 0f, Eff2 = kit.Opt15Eff2, V2 = kit.Opt15V2,
                    Desc = kit.Opt15Desc,
                });
                if (d.HasUlt)
                    list.Add(new PerkDef
                    {
                        Id = key + "_ult", Hero = h, Name = d.UltName, Eff = Eff.UltPow, Ult = true, Weight = 2.4f,
                        Desc = $"{d.UltTip}\n冷却 {d.UltCd:0} 秒",
                    });
                else
                    list.Add(new PerkDef
                    {
                        Id = key + "_aoyi", Hero = h, Name = AwakenName(h), Eff = sup ? Eff.Aura : Eff.Dmg, V = 0f,
                        Finisher = true, Weight = 2.4f,
                        Desc = sup
                            ? $"光环与加持 +{Pct(AwakenAuraBonus)}\n号令回转 +{Pct(AwakenSpeedBonus)}\n当场触发本命加持"
                            : d.Kind == Sim.Role.Mage
                                ? $"奇人终伤 +{Pct(AwakenDmgBonus)}\n充能速率 +{Pct(AwakenSpeedBonus)}\n每3轮追加超能轰击"
                                : $"最终伤害 +{Pct(AwakenDmgBonus)}\n{SpeedLabel(d.Kind)} +{Pct(AwakenSpeedBonus)}\n每3轮追加本命弹幕",
                    });
                AddPlays(list, d, key);
            }

            // ---------- 射手（5位：拉栓攻速 · 弹幕齐射 · 贯穿弹射 · 弱点暴击） ----------
            Add(HeroId.HuaRong,
                S("双排钉匣", Eff.Count, 1, 1), C("一钉双穿", Eff.Chain, 1, Eff.Dmg, 0.22f, 2), C("鲁班准星", Eff.Crit, 0.22f, Eff.Dmg, 0.26f, 1), S("气泵增压", Eff.Dmg, 0.25f, 2),
                S("匠心神射", Eff.Dmg, 0.8f, 1), S("连发射钉", Eff.Speed, 0.5f, 1), S("万钉如雨", Eff.Count, 1, 1));
            Add(HeroId.ZhangQing,
                C("连环摸牌", Eff.Chain, 2, Eff.Dmg, 0.20f, 2), C("杠上拍晕", Eff.Stun, 0.24f, Eff.Dmg, 0.26f, 1), S("红中发财", Eff.Dmg, 0.25f, 2), S("盲摸快手", Eff.Speed, 0.30f, 1),
                S("天胡牌雨", Eff.Chain, 3, 1), S("清一色", Eff.Dmg, 0.8f, 1), S("连庄不绝", Eff.Count, 1, 1));
            Add(HeroId.YanQing,
                S("扩容钉匣", Eff.Count, 2, 1), C("钨钢穿钉", Eff.Chain, 1, Eff.Dmg, 0.22f, 2), C("激光校准", Eff.Crit, 0.22f, Eff.Dmg, 0.26f, 1), S("电磁加速", Eff.Dmg, 0.25f, 2),
                S("万钉齐发", Eff.Count, 2, 1), S("弱点狙杀", Eff.UltPow, 1f, 1), S("无刷连发", Eff.Speed, 0.5f, 1));
            Add(HeroId.XieZhen,
                S("双珠齐射", Eff.Count, 1, 1), C("防空高手", Eff.Fly, 0.70f, Eff.Dmg, 0.24f, 1), S("牛筋皮兜", Eff.Dmg, 0.25f, 2), C("贯穿钢珠", Eff.Chain, 1, Eff.Dmg, 0.22f, 1),
                S("专打大怪", Eff.Elite, 1.5f, 1), S("猎神", Eff.Dmg, 0.8f, 1), S("箭雨", Eff.Count, 1, 1));
            Add(HeroId.XieBao,
                S("双叉齐投", Eff.Count, 1, 1), C("强力穿刺", Eff.Chain, 1, Eff.Dmg, 0.22f, 2), S("加粗钢叉", Eff.Dmg, 0.25f, 2), C("麻痹辣汁", Eff.Stun, 0.22f, Eff.Dmg, 0.26f, 1),
                S("一叉到底", Eff.Chain, 3, 1), S("猛男臂力", Eff.Dmg, 0.8f, 1), S("飞叉风暴", Eff.Count, 1, 1));

            // ---------- 炮手（4位：重炮口径 · 子母分裂 · 装填提速 · 焦土火海） ----------
            Add(HeroId.LingZhen,
                S("双联罐炮", Eff.Count, 1, 1), C("丙烷加压", Eff.Area, 0.36f, Eff.Dmg, 0.18f, 2), C("子母巨弹", Eff.Split, 1, Eff.Dmg, 0.18f, 1), S("焊枪改良", Eff.Dmg, 0.25f, 2),
                S("子母连环", Eff.Count, 1, 1), S("手工核弹", Eff.Dmg, 0.8f, 1), S("炮火连天", Eff.Speed, 0.5f, 1));
            Add(HeroId.QinMing,
                S("双管礼花", Eff.Count, 1, 1), C("绚烂炸裂", Eff.Area, 0.36f, Eff.Dmg, 0.18f, 2), S("高纯铝粉", Eff.Dmg, 0.25f, 2), S("快引火线", Eff.Speed, 0.30f, 1),
                S("盛世烟火", Eff.Dmg, 0.8f, 1), S("流星礼花", Eff.UltPow, 1f, 1), S("漫天花火", Eff.Area, 0.6f, 1));
            Add(HeroId.WeiDingguo,
                S("双罐齐投", Eff.Count, 1, 1), C("热油飞溅", Eff.Area, 0.36f, Eff.Dmg, 0.18f, 2), S("沸点红油", Eff.Dmg, 0.25f, 2), C("子母油罐", Eff.Split, 1, Eff.Dmg, 0.18f, 1),
                S("烈焰油海", Eff.Burn, 1.2f, 1), S("高温滚油", Eff.Dmg, 0.8f, 1), S("连环油瓮", Eff.Count, 1, 1));
            Add(HeroId.KongLiang,
                S("双响连掷", Eff.Count, 1, 1), C("加大药量", Eff.Area, 0.36f, Eff.Dmg, 0.18f, 2), C("子母礼炮", Eff.Split, 1, Eff.Dmg, 0.18f, 1), S("急促引线", Eff.Speed, 0.30f, 2),
                S("震耳欲聋", Eff.Dmg, 0.8f, 1), S("喜庆连爆", Eff.Count, 1, 1), S("满地红火", Eff.Area, 0.6f, 1));

            // ---------- 奇人（5位：连锁跃迁 · 射线折射 · 场域规模 · 蓄能充能 —— 零物理攻速词条！） ----------
            Add(HeroId.GongSun,
                S("双路电弧", Eff.Count, 1, 1), C("超压导电", Eff.Chain, 2, Eff.Dmg, 0.20f, 2), C("触电麻痹", Eff.Stun, 0.24f, Eff.Dmg, 0.26f, 1), S("升压线圈", Eff.Dmg, 0.25f, 2),
                S("全村电网", Eff.Chain, 4, 1), S("雷霆万钧", Eff.Dmg, 0.8f, 1), S("满负荷放电", Eff.UltPow, 1f, 1));
            Add(HeroId.FanRui,
                C("广角风场", Eff.Area, 0.36f, Eff.Dmg, 0.18f, 2), C("砂石卷击", Eff.Stun, 0.22f, Eff.Dmg, 0.26f, 1), S("碳纤桨叶", Eff.Dmg, 0.25f, 2), C("低压气团", Eff.Slow, 1.2f, Eff.Count, 1f, 1),
                S("超强风压", Eff.Dmg, 0.8f, 1), S("狂飙席卷", Eff.UltPow, 1f, 1), S("双倍旋翼", Eff.Area, 0.6f, 1));
            Add(HeroId.QiaoDaoqing,
                S("猛火喷嘴", Eff.Dmg, 0.25f, 2), C("宽幅烤架", Eff.Area, 0.36f, Eff.Dmg, 0.18f, 2), C("延时喷火", Eff.Count, 1.5f, Eff.Dmg, 0.20f, 1), S("加压充能", Eff.Speed, 0.30f, 1),
                S("炭火融金", Eff.Dmg, 0.8f, 1), S("爆烤全场", Eff.Area, 0.6f, 1), S("双倍火力", Eff.Count, 2f, 1));
            Add(HeroId.ShanTinggui,
                C("大口径", Eff.Area, 0.36f, Eff.Dmg, 0.18f, 2), C("冰井凉水", Eff.Slow, 1.2f, Eff.Dmg, 0.26f, 1), S("水压倍增", Eff.Dmg, 0.25f, 2), S("双泵充能", Eff.Speed, 0.30f, 1),
                S("怒涛冲刷", Eff.Count, 2f, 1), S("消防精英", Eff.Dmg, 0.8f, 1), S("巨浪滔天", Eff.Area, 0.6f, 1));
            Add(HeroId.MaLing,
                S("双手抛砖", Eff.Count, 1, 1), C("强磁扩场", Eff.Area, 0.38f, Eff.Dmg, 0.18f, 2), C("当头一砖", Eff.Stun, 0.22f, Eff.Dmg, 0.26f, 1), C("磁场弹跳", Eff.Chain, 1, Eff.Dmg, 0.22f, 2),
                S("包工神力", Eff.Dmg, 0.8f, 1), S("重砖破壳", Eff.Area, 0.6f, 1), S("流水递砖", Eff.Speed, 0.5f, 1));

            // ---------- 战士（7位：多段连斩 · 刀气棍芒 · 破甲重创 · 近战死斗） ----------
            Add(HeroId.WuSong,
                S("左右勾拳", Eff.Count, 1, 1), S("热身快拳", Eff.Speed, 0.30f, 2), S("重拳破甲", Eff.Elite, 0.85f, 1), S("钢筋铁骨", Eff.Dmg, 0.25f, 2),
                S("疾风摆拳", Eff.Speed, 0.5f, 1), S("金腰带", Eff.Dmg, 0.8f, 1), S("擂台制霸", Eff.Count, 1, 1));
            Add(HeroId.LinChong,
                C("加压喷管", Eff.Range, 1.6f, Eff.Dmg, 0.28f, 2), C("冷锋暴击", Eff.Crit, 0.22f, Eff.Dmg, 0.26f, 1), C("液氮挂霜", Eff.Slow, 1.5f, Eff.Dmg, 0.26f, 1), S("急冻齐射", Eff.Dmg, 0.25f, 2),
                S("冰封防线", Eff.Dmg, 0.8f, 1), S("极度深寒", Eff.UltPow, 1f, 1), S("连环寒潮", Eff.Speed, 0.5f, 1));
            Add(HeroId.LuZhiShen,
                C("大锤横扫", Eff.Area, 0.38f, Eff.Dmg, 0.18f, 2), S("抡锤生风", Eff.Speed, 0.30f, 2), S("碎甲重锤", Eff.Elite, 0.85f, 1), S("筑路怪力", Eff.Dmg, 0.25f, 2),
                S("力拔山兮", Eff.Speed, 0.5f, 1), S("巨锤开路", Eff.Dmg, 0.8f, 1), S("地动山摇", Eff.Area, 0.6f, 1));
            Add(HeroId.LuJunyi,
                C("横扫千军", Eff.Area, 0.38f, Eff.Dmg, 0.18f, 2), S("金棍无双", Eff.Dmg, 0.25f, 2), C("醒狮点睛", Eff.Crit, 0.22f, Eff.Dmg, 0.26f, 1), S("疾风快棍", Eff.Speed, 0.30f, 1),
                S("武林泰斗", Eff.Dmg, 0.8f, 1), S("电光破阵", Eff.UltPow, 1f, 1), S("游龙出洞", Eff.Speed, 0.5f, 1));
            Add(HeroId.GuanSheng,
                C("满月劈斩", Eff.Area, 0.38f, Eff.Dmg, 0.18f, 2), S("刀劈机甲", Eff.Elite, 0.85f, 1), S("热熔威风", Eff.Dmg, 0.25f, 2), S("流云快刀", Eff.Speed, 0.30f, 1),
                S("烈焰开山", Eff.Dmg, 0.8f, 1), S("社火压轴", Eff.UltPow, 1f, 1), S("刀风浩荡", Eff.Area, 0.6f, 1));
            Add(HeroId.LiKui,
                S("双锯齐轰", Eff.Count, 1, 1), C("加长锯板", Eff.Area, 0.38f, Eff.Dmg, 0.18f, 2), S("拉满油门", Eff.Speed, 0.30f, 2), S("合金锯链", Eff.Dmg, 0.25f, 2),
                S("专锯巨兽", Eff.Elite, 1.5f, 1), S("旋风链锯", Eff.Count, 1, 1), S("铁牛巨力", Eff.Dmg, 0.8f, 1));
            Add(HeroId.ShiXiu,
                S("左右快斩", Eff.Count, 1, 1), S("庖丁手法", Eff.Speed, 0.30f, 2), C("刀刀见骨", Eff.Crit, 0.22f, Eff.Dmg, 0.26f, 1), S("磨刀霍霍", Eff.Dmg, 0.25f, 2),
                S("金牌刀工", Eff.Dmg, 0.8f, 1), S("疾风乱斩", Eff.Speed, 0.5f, 1), S("破空斩击", Eff.Count, 1, 1));

            // ---------- 控制（5位：封路扩阵 · 硬控延长 · 破阵易伤 · 克制锁拿 —— 零纯控0伤废卡！） ----------
            Add(HeroId.HuSanniang,
                S("双索齐飞", Eff.Count, 1, 1), S("电磁劲绳", Eff.Dmg, 0.25f, 2), C("死结", Eff.Stun, 0.45f, Eff.Dmg, 0.26f, 1), C("套头目", Eff.Elite, 0.75f, Eff.Dmg, 0.22f, 1),
                S("连环套索", Eff.Count, 1, 1), S("生擒活捉", Eff.UltPow, 1f, 1), S("快手甩绳", Eff.Speed, 0.5f, 1));
            Add(HeroId.ZhuWu,
                C("扩盘", Eff.Area, 0.36f, Eff.Dmg, 0.18f, 2), C("连环杀招", Eff.Slow, 1.4f, Eff.Dmg, 0.24f, 2), C("当头炮", Eff.Stun, 0.22f, Eff.Dmg, 0.26f, 1), S("重炮将死", Eff.Dmg, 0.25f, 1),
                S("绝杀残局", Eff.Dmg, 0.8f, 1), S("天地棋盘", Eff.Area, 0.6f, 1), S("快棋", Eff.Speed, 0.5f, 1));
            Add(HeroId.XuNing,
                C("破甲钢钳", Eff.Cav, 0.75f, Eff.Dmg, 0.24f, 2), S("熟练操作", Eff.Dmg, 0.25f, 2), C("卡死履带", Eff.Stun, 0.24f, Eff.Dmg, 0.26f, 1), C("伸缩液压臂", Eff.Range, 1.6f, Eff.Dmg, 0.28f, 1),
                C("拆车专家", Eff.Cav, 1.2f, Eff.Dmg, 0.40f, 1), S("液压狂潮", Eff.Dmg, 0.8f, 1), S("高速回钳", Eff.Speed, 0.5f, 1));
            Add(HeroId.SunErniang,
                C("大勺扬粉", Eff.Area, 0.36f, Eff.Dmg, 0.18f, 2), C("呛鼻", Eff.Stun, 0.24f, Eff.Dmg, 0.26f, 1), S("朝天椒王", Eff.Dmg, 0.25f, 2), C("辣味弥漫", Eff.Slow, 1.4f, Eff.Dmg, 0.24f, 1),
                S("变态特辣", Eff.Stun, 0.45f, 1), S("红油翻滚", Eff.Dmg, 0.8f, 1), S("辣雾封路", Eff.Area, 0.6f, 1));
            Add(HeroId.RuanXiaoqi,
                C("加宽渔网", Eff.Area, 0.36f, Eff.Dmg, 0.18f, 2), C("收紧网绳", Eff.Stun, 0.45f, Eff.Dmg, 0.26f, 1), S("熟手抛网", Eff.Speed, 0.30f, 2), S("铅坠重击", Eff.Dmg, 0.25f, 1),
                S("网罗四方", Eff.Dmg, 0.8f, 1), S("满塘丰收", Eff.Area, 0.6f, 1), S("顺风撒网", Eff.Speed, 0.5f, 1));

            // ---------- 辅助（6位：广域传令 · 光环倍增 · 号令回转 · 聚财破绽 —— 零攻速/零平A伤害词条！） ----------
            Add(HeroId.WuYong,
                S("清风徐来", Eff.Aura, 0.50f, 2), S("枸杞提神", Eff.UltPow, 0.50f, 2), C("智囊节流", Eff.Aura, 0.32f, Eff.Coin, 28f, 1), C("广发凉风", Eff.Count, 1f, Eff.UltCd, 0.14f, 1),
                S("满堂高徒", Eff.Aura, 0.8f, 1), S("谆谆教诲", Eff.UltPow, 0.8f, 1), S("吴老校长", Eff.Count, 1f, 1));
            Add(HeroId.AnDaoquan,
                S("银针", Eff.Aura, 0.50f, 2), S("浓煎草药", Eff.UltPow, 0.50f, 2), S("急诊包扎", Eff.UltCd, 0.25f, 1), C("巡诊全村", Eff.Count, 1f, Eff.Aura, 0.28f, 1),
                S("妙手神针", Eff.Aura, 0.8f, 1), S("固若金汤", Eff.UltPow, 0.8f, 1), S("随叫随到", Eff.UltCd, 0.35f, 1));
            Add(HeroId.DaiZong,
                S("重低音", Eff.Aura, 0.50f, 2), S("踩点", Eff.Speed, 0.30f, 2), S("扩音喇叭", Eff.UltPow, 0.50f, 1), C("环绕音响", Eff.Count, 1f, Eff.UltCd, 0.15f, 1),
                S("领舞风范", Eff.Aura, 0.8f, 1), S("切歌加速", Eff.UltCd, 0.35f, 1), S("劲歌串烧", Eff.UltPow, 0.8f, 1));
            Add(HeroId.TangLong,
                S("机油润滑", Eff.Aura, 0.50f, 2), S("精钢螺母", Eff.UltPow, 0.50f, 2), S("电动扳手", Eff.UltCd, 0.25f, 1), C("匠心延保", Eff.Count, 1f, Eff.Aura, 0.28f, 1),
                S("全村换装", Eff.Aura, 0.8f, 1), S("千锤百炼", Eff.UltPow, 0.8f, 1), S("金牌匠人", Eff.UltCd, 0.35f, 1));
            Add(HeroId.ShiQian,
                S("顺手", Eff.Aura, 0.50f, 2), S("电驴狂飙", Eff.UltCd, 0.25f, 1), C("跑腿小费", Eff.Aura, 0.34f, Eff.Coin, 36f, 1), C("双线取件", Eff.Count, 1f, Eff.UltPow, 0.28f, 1),
                S("拆甲大师", Eff.Aura, 0.8f, 1), S("金牌骑手", Eff.UltPow, 0.8f, 1), S("准时必达", Eff.Coin, 55f, 1));
            Add(HeroId.JiangJing,
                S("复利", Eff.Aura, 0.50f, 2), S("金算珠", Eff.UltPow, 0.50f, 2), S("心算如飞", Eff.UltCd, 0.25f, 1), C("广开补贴", Eff.Count, 1f, Eff.Aura, 0.28f, 1),
                S("财源广进", Eff.Aura, 0.8f, 1), S("一本万利", Eff.UltPow, 0.8f, 1), S("金牌会计", Eff.UltCd, 0.35f, 1));
            return list.ToArray();
        }

        /// <summary>
        /// 按六大职业特性定制取舍卡、流派质变→进阶链与阵容战术卡。
        /// </summary>
        static void AddPlays(List<PerkDef> list, HeroDef d, string key)
        {
            string n = d.Noun ?? "攻击";
            string spdName = SpeedLabel(d.Kind);
            bool sup = d.Kind == Sim.Role.Support;
            PerkDef Trade(string id, string name, Eff e, float v, Eff e2, float v2, string group, string desc) => new PerkDef
            {
                Id = key + "_" + id, Hero = d.Id, Name = name, Kind = PerkKind.Trade, Eff = e, V = v, Has2 = v2 != 0, Eff2 = e2, V2 = v2,
                Group = group, Weight = 0.92f, Desc = desc,
            };

            if (sup)
            {
                list.Add(Trade("heavy", "厚积薄发", Eff.UltPow, 1.15f, Eff.Speed, -0.18f, "pace", "加持效力 +115%\n号令回转 -18%"));
                list.Add(Trade("quick", "急广播报", Eff.Speed, 0.90f, Eff.UltPow, -0.10f, "pace", "号令回转 +90%\n加持效力 -10%"));
                list.Add(Trade("wide", "全村动员", Eff.Count, 2f, Eff.Speed, -0.18f, null, $"{SupportCountLine(d.Id, 2f)}\n号令回转 -18%"));
                string sMorph = key + "_morph";
                list.Add(new PerkDef
                {
                    Id = sMorph, Hero = d.Id, Name = "弱点点名", Kind = PerkKind.Morph, Eff = Eff.Vuln, V = 0.28f,
                    Weight = 1.15f, Desc = "施放技能标记强敌\n附加 +28% 易伤",
                });
                list.Add(new PerkDef
                {
                    Id = key + "_adv", Hero = d.Id, Name = "集火指挥", Kind = PerkKind.Adv, Eff = Eff.Vuln, V = 0.22f, Req = sMorph,
                    Has2 = true, Eff2 = Eff.Aura, V2 = 0.35f,
                    Weight = 1.65f, Desc = "标记 2 人，易伤 50%\n在场光环 +35%",
                });
                list.Add(new PerkDef
                {
                    Id = key + "_sync", Hero = d.Id, Name = "众志成城", Kind = PerkKind.Value,
                    Eff = Eff.Aura, V = 0.42f, Has2 = true, Eff2 = Eff.UltPow, V2 = 0.42f,
                    Weight = 1.15f, Desc = "在场光环 +42%\n主动加持效力 +42%",
                });
                list.Add(new PerkDef
                {
                    Id = key + "_aid", Hero = d.Id, Name = "邻里互助", Kind = PerkKind.Value,
                    Eff = Eff.UltCd, V = 0.20f, Has2 = true, Eff2 = Eff.Aura, V2 = 0.35f,
                    Weight = 1.10f, Desc = "技能冷却 -20%\n在场光环 +35%",
                });
                return;
            }

            // 1) 职业本味节奏取舍（二选一互斥组 pace）
            if (d.Kind == Sim.Role.Mage)
            {
                list.Add(Trade("heavy", "超载蓄能", Eff.Dmg, 1.00f, Eff.Speed, -0.18f, "pace", $"奇人伤害 +100%\n{spdName} -18%"));
                list.Add(Trade("quick", "高频放电", Eff.Speed, 0.80f, Eff.Dmg, -0.12f, "pace", $"{spdName} +80%\n奇人伤害 -12%"));
            }
            else if (d.Kind == Sim.Role.Bomber)
            {
                list.Add(Trade("heavy", "大号装药", Eff.Dmg, 1.00f, Eff.Speed, -0.18f, "pace", $"{n}伤害 +100%\n{spdName} -18%"));
                list.Add(Trade("quick", "速装引信", Eff.Speed, 0.80f, Eff.Dmg, -0.12f, "pace", $"{spdName} +80%\n{n}伤害 -12%"));
            }
            else if (d.Kind == Sim.Role.Control)
            {
                list.Add(Trade("heavy", "重型封路", Eff.Dmg, 0.95f, Eff.Speed, -0.16f, "pace", $"{n}伤害 +95%\n{spdName} -16%"));
                list.Add(Trade("quick", "快手布控", Eff.Speed, 0.78f, Eff.Dmg, -0.12f, "pace", $"{spdName} +78%\n{n}伤害 -12%"));
            }
            else
            {
                list.Add(Trade("heavy", "千钧之力", Eff.Dmg, 1.00f, Eff.Speed, -0.18f, "pace", $"{n}伤害 +100%\n攻速 -18%"));
                list.Add(Trade("quick", "快如闪电", Eff.Speed, 0.80f, Eff.Dmg, -0.12f, "pace", $"攻速 +80%\n{n}伤害 -12%"));
            }

            // 2) 规模扩展取舍（wide）：全单发职业统一 +2 / -28% 标尺（与 +1 无惩罚卡归入 volley 互斥组）
            var cb = Balance.Current.Combat;
            float multiPen = cb.WideMultiDmgPenalty;
            if (d.Id == HeroId.YanQing)
                list.Add(Trade("wide", "暴雨钉幕", Eff.Count, 3f, Eff.Dmg, -0.18f, "volley", $"钢钉数量 +3\n单发伤害 -18%"));
            else if (d.Shot == ShotKind.Beam)
                list.Add(Trade("wide", "分流折射", Eff.Refract, 2f, Eff.Dmg, -0.15f, null, "折射副光束 +2 道\n主束伤害 -15%"));
            else if (d.Chan <= 0 && (d.Shot == ShotKind.Arrow || d.Shot == ShotKind.Bomb || d.Shot == ShotKind.Fireball
                || d.Shot == ShotKind.Punch || d.Shot == ShotKind.Lasso || d.Shot == ShotKind.Lightning || d.Shot == ShotKind.Stone))
            {
                string wName = d.Kind == Sim.Role.Fighter ? "疾风连斩"
                    : d.Kind == Sim.Role.Bomber ? "连环齐轰"
                    : d.Kind == Sim.Role.Mage ? "超能齐发"
                    : d.Shot == ShotKind.Lasso ? "天罗齐发" : "弹幕齐射";
                string wTop = d.Shot == ShotKind.Punch ? "每次多斩 +2 击"
                    : d.Shot == ShotKind.Lasso ? "套索多锁 +2 人"
                    : $"{n}数量 +2";
                list.Add(Trade("wide", wName, Eff.Count, 2f, Eff.Dmg, multiPen, "volley", $"{wTop}\n单次伤害 {Pct(multiPen)}"));
            }
            else
            {
                string aName = d.Kind == Sim.Role.Mage ? "广域风场" : d.Kind == Sim.Role.Control ? "广域封控" : "大开大合";
                list.Add(Trade("wide", aName, Eff.Area, cb.WideAreaBonus, Eff.Speed, cb.WideAreaSpeedPenalty, null, $"{n}范围 +{Pct(cb.WideAreaBonus)}\n{spdName} {Pct(cb.WideAreaSpeedPenalty)}"));
            }

            // 3) 职业专属流派质变 → 进阶二连卡
            bool fire = d.Element == "火系";
            Eff me = Eff.Vuln, ae = Eff.Vuln;
            string mname, mdesc, aname, adesc;
            float mv, av;
            switch (d.Shot)
            {
                case ShotKind.Lightning:
                    me = Eff.Conduct; ae = Eff.Conduct; mv = 1f; av = 1f;
                    mname = "高压超导"; mdesc = "电弧连锁 +2 人\n弹跳伤害衰减减半";
                    aname = "万伏雷池"; adesc = "电弧 100% 无损传导\n终点落雷范围麻痹";
                    break;
                case ShotKind.Stone when d.Kind == Sim.Role.Mage:
                    me = Eff.Conduct; ae = Eff.Conduct; mv = 1f; av = 1f;
                    mname = "电磁重砖"; mdesc = "弹射 +1 次且无衰减\n震波扩围，伤害 88%";
                    aname = "强磁镇压"; adesc = "震波 100% 全额伤害\n命中附加 +35% 易伤";
                    break;
                case ShotKind.Stone:
                    me = Eff.Conduct; ae = Eff.Conduct; mv = 1f; av = 1f;
                    mname = "连环飞牌"; mdesc = "弹跳伤害无衰减\n弹跳附带碎牌溅射";
                    aname = "杠上爆花"; adesc = "溅射范围扩大\n命中附加 +35% 易伤";
                    break;
                case ShotKind.Beam when !fire:
                    me = Eff.Refract; ae = Eff.Refract; mv = 1f; av = 1f;
                    mname = "高压分流"; mdesc = "命中主目标后\n折射 +1 道寒流光束";
                    aname = "冰脉贯流"; adesc = "折射光束再 +1 道\n命中附加 +30% 易伤";
                    break;
                case ShotKind.Wind when d.Kind == Sim.Role.Mage:
                    me = Eff.Burn; ae = Eff.Burn; mv = 0.65f; av = 0.95f;
                    mname = "涡流引力"; mdesc = "涡流持续向中心聚怪\n附加 65% 持续割裂";
                    aname = "千叶风暴"; adesc = "割裂伤害升至 160%\n敌军阵亡触发风爆";
                    break;
                case ShotKind.Arrow:
                    me = Eff.Blast; ae = Eff.Blast; mv = 0.55f; av = 1.05f;
                    mname = "爆裂" + n; mdesc = $"{n}命中后范围爆炸\n造成 55% 溅射伤害";
                    aname = "高能装药"; adesc = "爆炸范围 +35%\n爆炸伤害升至 160%";
                    break;
                case ShotKind.Spear:
                    me = Eff.Reach; ae = Eff.Reach; mv = 2.5f; av = 2f;
                    mname = "一击穿阵"; mdesc = "贯穿距离 +2.5\n一击捅穿整列敌军";
                    aname = "势如破竹"; adesc = "贯穿距离再 +2\n沿途全额伤害无衰减";
                    break;
                case ShotKind.Bomb:
                case ShotKind.Fireball:
                case ShotKind.Beam when fire:
                    me = Eff.Burn; ae = Eff.Burn; mv = 0.65f; av = 0.95f;
                    mname = "高温引燃"; mdesc = "命中灼烧敌人 3 秒\n共造成 65% 伤害";
                    aname = "连环爆燃"; adesc = "灼烧总伤升至 160%\n阵亡时引爆周围敌军";
                    break;
                case ShotKind.Wind:
                    me = Eff.Burn; ae = Eff.Burn; mv = 0.65f; av = 0.95f;
                    mname = "呛鼻辣雾"; mdesc = "命中使敌人受蚀 3 秒\n共造成 65% 伤害";
                    aname = "生化爆散"; adesc = "持续总伤升至 160%\n阵亡时传染周围敌军";
                    break;
                case ShotKind.Lasso:
                    me = Eff.Burn; ae = Eff.Burn; mv = 0.65f; av = 0.95f;
                    mname = "高压电索"; mdesc = "套索使敌过载 3 秒\n共造成 65% 伤害";
                    aname = "绞杀电网"; adesc = "过载总伤升至 160%\n阵亡迸发弧光溅射";
                    break;
                default:
                    me = Eff.Vuln; ae = Eff.Vuln; mv = 0.30f; av = 0.22f;
                    mname = "破甲重创"; mdesc = "命中破甲持续 4 秒\n所受伤害 +30%";
                    aname = "摧枯拉朽"; adesc = "破甲易伤大幅提升\n30% → 52%";
                    break;
            }
            string morph = key + "_morph";
            list.Add(new PerkDef { Id = morph, Hero = d.Id, Name = mname, Kind = PerkKind.Morph, Eff = me, V = mv, Weight = 1.15f, Desc = mdesc });
            list.Add(new PerkDef { Id = key + "_adv", Hero = d.Id, Name = aname, Kind = PerkKind.Adv, Eff = ae, V = av, Req = morph, Weight = 1.65f, Desc = adesc });

            // 4) 跨职业战术联动 & 残血收割词条
            if (d.Kind == Sim.Role.Control)
            {
                list.Add(new PerkDef { Id = key + "_shatter", Hero = d.Id, Name = "乘胜追击", Kind = PerkKind.Value, Eff = Eff.Vuln, V = 0.32f, Weight = 1.15f, Desc = "命中附加 +32% 易伤\n持续 4 秒" });
                bool hardStun = d.Stun > 0 && d.StunChance <= 0;
                bool slowOnly = d.Stun <= 0 && d.Slow > 0;
                list.Add(new PerkDef
                {
                    Id = key + "_exec", Hero = d.Id, Name = "画地为牢", Kind = PerkKind.Value,
                    Eff = slowOnly ? Eff.Slow : Eff.Stun, V = slowOnly ? 1.6f : (hardStun ? 0.55f : 0.25f),
                    Has2 = true, Eff2 = Eff.Vuln, V2 = 0.18f,
                    Max = 2, Weight = 1.0f,
                    Desc = (slowOnly ? "减速时间 +1.6 秒"
                        : hardStun ? "控制时间 +0.55 秒"
                        : "击晕几率 +25%") + "\n命中易伤 +18%",
                });
            }
            else
            {
                list.Add(new PerkDef { Id = key + "_shatter", Hero = d.Id, Name = "破冰追击", Kind = PerkKind.Value, Eff = Eff.Shatter, V = 0.65f, Weight = 1.15f, Desc = "对受控敌伤害 +65%\n对受控暴击率 +20%" });
                bool carry = d.Kind == Sim.Role.Fighter || d.Kind == Sim.Role.Archer || d.Kind == Sim.Role.Mage || d.Kind == Sim.Role.Bomber;
                if (carry && d.Rarity >= 3)
                    list.Add(new PerkDef { Id = key + "_res", Hero = d.Id, Name = "众星捧月", Kind = PerkKind.Value, Eff = Eff.Resonance, V = 0.24f, Weight = 1.15f, Desc = $"最高星{d.Name}专属\n每名{d.Role}加伤 +24%" });
                else
                    list.Add(new PerkDef { Id = key + "_exec", Hero = d.Id, Name = "致命收割", Kind = PerkKind.Value, Eff = Eff.Exec, V = 0.85f, Has2 = true, Eff2 = Eff.Crit, V2 = 0.15f, Weight = 1.1f, Desc = "半血以下敌伤 +85%\n暴击率 +15%" });
            }
        }

        /// <summary>局内普通强化要一眼看得出变强：伤害、范围、攻速类在表里的基础值上放大，确保拿钱买词条远优于无脑盲目召唤。</summary>
        static float Boost(Eff e)
        {
            var c = Balance.Current.Combat;
            return e == Eff.Dmg ? c.PerkDmgBoost : e == Eff.Area ? c.PerkAreaBoost : e == Eff.Speed ? c.PerkSpeedBoost : e == Eff.Crit ? c.PerkCritBoost : 1f;
        }

        /// <summary>5 级解锁的「爆发」；20 级解锁的「最强」。</summary>
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

        /// <summary>上阵异职业羁绊：2/3/4 种不同职业上阵时，全村最终伤害 +3% / +7% / +12%。</summary>
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

        /// <summary>按职业特性命名出手/施法速率：射手战士称攻速，炮手称装填速度，奇人称充能速率，控制称布控速度，辅助称号令回转。</summary>
        public static string SpeedLabel(Role r)
        {
            switch (r)
            {
                case Sim.Role.Mage: return "充能速率";
                case Sim.Role.Bomber: return "装填速度";
                case Sim.Role.Control: return "布控速度";
                case Sim.Role.Support: return "号令回转";
                default: return "攻速";
            }
        }

        public static string SupportCountLine(HeroId h, float v)
        {
            int k = System.Math.Max(1, (int)System.Math.Round(v));
            switch (h)
            {
                case HeroId.WuYong: return $"鼓劲目标 +{k} 名友军";
                case HeroId.AnDaoquan: return $"额外鼓舞 +{k} 名主力";
                case HeroId.DaiZong: return $"主力催速 +{k * 18}%";
                case HeroId.TangLong: return $"改装延长 +{k * 2.5f:0.#} 秒";
                case HeroId.ShiQian: return $"破绽标记 +{k} 名强敌";
                case HeroId.JiangJing: return $"鼓舞延长 +{k * 2.5f:0.#} 秒";
                default: return $"加持目标 +{k} 人";
            }
        }

        static string SingleLineEff(HeroId h, Eff e, float v)
        {
            if (e == Eff.Vuln) return $"命中易伤 +{Pct(v)}";
            return EffText(h, e, v).Replace("\n", "");
        }

        /// <summary>根据乡亲当前等级返回实时卡面说明：满 20 级解锁免除取舍负面后，动态隐去红色负面代价行。</summary>
        public static string PerkDesc(PerkDef p, int heroLv)
        {
            if (p == null) return "";
            if (p.Kind == PerkKind.Trade && p.Has2 && p.V2 < 0f && heroLv >= Meta.NoPenaltyLv && !string.IsNullOrEmpty(p.Desc))
            {
                int nl = p.Desc.IndexOf('\n');
                if (nl > 0) return p.Desc.Substring(0, nl);
            }
            return p.Desc;
        }

        /// <summary>没有大招的乡亲，大招类强化改成加伤害、充能/攻速；辅助不打伤害，伤害类强化改成加加持效力。</summary>
        static (Eff, float) Adapt(HeroDef d, Eff e, float v)
        {
            if (d.Kind == Sim.Role.Support)
            {
                if (e == Eff.Dmg || e == Eff.Elite) return (Eff.UltPow, System.Math.Min(v, 0.55f));
                return (e, v);
            }
            if (d.HasUlt) return (e, v);
            if (e == Eff.UltPow) return (Eff.Dmg, 0.8f);
            if (e == Eff.UltCd) return (Eff.Speed, 0.3f);
            return (e, v);
        }

        static string Pct(float v) => (int)System.Math.Round(v * 100) + "%";

        /// <summary>效果说明：强化卡、被动、乡亲详情共用（严格贴合六大职业本味术语）。</summary>
        public static string EffText(HeroId h, Eff e, float v)
        {
            var d = Hero(h);
            string n = d.Noun ?? "攻击";
            switch (e)
            {
                case Eff.Dmg: return d.Kind == Sim.Role.Mage ? $"奇人伤害 +{Pct(v)}" : $"{n}伤害 +{Pct(v)}";
                case Eff.Speed: return $"{SpeedLabel(d.Kind)} +{Pct(v)}";
                case Eff.Count:
                    if (d.Kind == Sim.Role.Support) return SupportCountLine(h, v);
                    if (d.Chan > 0) return $"持续施法 +{v * ChanPerCount:0.#} 秒";
                    if (d.Shot == ShotKind.Lasso) return $"套索多锁 +{v:0} 人";
                    if (d.Shot == ShotKind.Punch) return $"每次多斩 +{v:0} 击";
                    return $"{n}数量 +{v:0}";
                case Eff.Area: return $"{n}范围 +{Pct(v)}";
                case Eff.Chain:
                    if (d.Shot == ShotKind.Stone) return $"{n}弹射 +{v:0} 次";
                    if (d.Shot == ShotKind.Lightning) return $"{n}连锁 +{v:0} 人";
                    return $"{n}穿透 +{v:0} 人";
                case Eff.Crit: return $"暴击率 +{Pct(v)}";
                case Eff.Stun:
                    if (d.Stun > 0 && d.StunChance <= 0) return $"控制时间 +{v:0.##} 秒";
                    return $"击晕几率 +{Pct(v)}";
                case Eff.Slow: return d.Slow > 0 ? $"减速时间 +{v:0.#} 秒" : $"命中减速 {v:0.#} 秒";
                case Eff.Elite: return $"对精英首领伤 +{Pct(v)}";
                case Eff.UltCd: return d.Kind == Sim.Role.Support ? $"技能冷却 -{Pct(v)}" : $"大招冷却 -{Pct(v)}";
                case Eff.UltPow:
                    if (d.Kind != Sim.Role.Support) return $"大招伤害 +{Pct(v)}";
                    return d.HasUlt ? $"全技能效力 +{Pct(v)}" : $"加持效力 +{Pct(v)}";
                case Eff.Range: return $"攻击距离 +{v:0.#}";
                case Eff.Split:
                    string sub = n == "重炮" ? "子炮" : "小" + n;
                    return $"落地分裂 3 枚{sub}";
                case Eff.Coin: return $"每次合成 +{v:0} 能量币";
                case Eff.Fly: return $"对飞碟伤害 +{Pct(v)}";
                case Eff.Cav: return $"对飞艇机甲伤 +{Pct(v)}";
                case Eff.Surge: return $"{Pct(v)} 触发巨型{n}\n该击伤害 +{Pct(SurgeDmg - 1f)}";
                case Eff.Top: return $"场上最高星{d.Name}\n最终伤害 +{Pct(v)}";
                case Eff.Blast: return $"{n}命中后范围爆炸\n造成 {Pct(v)} 溅射伤害";
                case Eff.Burn: return $"命中持续灼伤 {BurnDur:0} 秒\n共造成 {Pct(v)} 伤害";
                case Eff.Vuln: return $"命中附加 +{Pct(v)} 易伤\n持续 {VulnDur:0} 秒";
                case Eff.Reach: return $"贯穿距离 +{v:0.#}";
                case Eff.Shatter: return $"对受控敌伤害 +{Pct(v)}\n对受控暴击率 +20%";
                case Eff.Exec: return $"半血以下敌伤 +{Pct(v)}\n暴击率 +15%";
                case Eff.Resonance: return $"最高星{d.Name}专属\n每名{d.Role}加伤 +{Pct(v)}";
                case Eff.Conduct: return d.Shot == ShotKind.Lightning ? "电弧传导衰减减半" : "弹跳无衰减并震波";
                case Eff.Refract: return $"折射副光束 +{v:0} 道";
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
            foreach (var p in Perks) if (p.Hero == h && p.Star == star && !p.Ult && !p.Finisher) r.Add(p);
            return r;
        }

        public static PerkDef UltPerk(HeroId h)
        {
            foreach (var p in Perks) if (p.Hero == h && p.Ult) return p;
            return null;
        }

        public static PerkDef FinisherPerk(HeroId h)
        {
            foreach (var p in Perks) if (p.Hero == h && (p.Ult || p.Finisher)) return p;
            return null;
        }

        public static PerkDef Perk(string id)
        {
            foreach (var p in Perks) if (p.Id == id) return p;
            return null;
        }

        /// <summary>合成星级曲线。</summary>
        public static float[] StarMul => Balance.Current.Combat.StarMul;
        public static float[] StarSpeed => Balance.Current.Combat.StarSpeed;
        /// <summary>奇人的「数量」强化：每级持续施法多这么多秒。</summary>
        public const float ChanPerCount = 0.75f;

        /// <summary>1 星即具备完整职业出招节奏。</summary>
        public static int ShotsAt(HeroDef d, int star) => System.Math.Max(1, d.Count);

        /// <summary>灼烧/中毒持续秒数、每跳间隔；破绽持续秒数。</summary>
        public const float BurnDur = 3f, BurnEvery = 0.5f, VulnDur = 4f;

        public static float WaveTime => Balance.Current.WaveStage.WaveTime;
        public static float WaveMinTime => Balance.Current.WaveStage.WaveMinTime;
        public static float ClearBreath => Balance.Current.WaveStage.ClearBreath;
        public const float PackSpreadMax = 4.2f;

        public static (float at, float share)[] WavePacks(int wave) => wave <= 2
            ? new[] { (0.3f, 0.55f), (6.5f, 0.45f) }
            : new[] { (0.3f, 0.38f), (5.8f, 0.34f), (11.5f, 0.28f) };

        /// <summary>老村长的战斗技能：自动释放，超分贝冲击波朝面前的外星军推过去（第1波尾声首放救场）。</summary>
        public const string LordSkillName = "全村集合";
        public static float LordPctBase => Balance.Current.Combat.LordPctBase;
        public static float LordCdBase => Balance.Current.Combat.LordCdBase;
        public static float LordFirstCast => Balance.Current.Combat.LordFirstCast;
        public static float LordWaveSpeed => Balance.Current.Combat.LordWaveSpeed;
        public static float ProjPace => Balance.Current.Combat.ProjPace;
        public static float VfxPace => Balance.Current.Combat.VfxPace;
        public static float MinAtkInterval => Balance.Current.Combat.MinAtkInterval;
        public static float BeamFlowSpeed => Balance.Current.Combat.BeamFlowSpeed;
        public const float LordHold = 2.5f;
        public static int SummonsPerSlot => Balance.Current.Economy.SummonsPerSlot;
        public static int EnhanceUnlockSummons => Balance.Current.Economy.EnhanceUnlockSummons;
        public const int LevelsPerChapter = 10;

        public static int SummonCost(int n)
        {
            var tbl = Balance.Current.Economy.SummonTable;
            if (tbl == null || tbl.Length == 0) return 10;
            return tbl[System.Math.Max(0, System.Math.Min(n, tbl.Length - 1))];
        }

        public static int EnhanceCost(int n)
        {
            var tbl = Balance.Current.Economy.EnhanceTable;
            if (tbl == null || tbl.Length == 0) return 100;
            return tbl[System.Math.Max(0, System.Math.Min(n, tbl.Length - 1))];
        }

        public static float HpScale(int wave) => 1f + Balance.Current.WaveStage.HpScaleSlope * (wave - 1);

        public static float Tough(int wave)
        {
            var ws = Balance.Current.WaveStage;
            var et = ws.EarlyWaveTough;
            float mul = et != null && wave >= 1 && wave <= et.Length ? et[wave - 1] : 1f;
            return ws.Bulk * mul;
        }

        public static float Bulk => Balance.Current.WaveStage.Bulk;

        public static int KillCoin(EnemyDef def, int wave, float coinAura)
        {
            var eco = Balance.Current.Economy;
            float raw = def.Big
                ? def.Coin * eco.BigKillCoinMul
                : def.Coin * eco.KillCoinMul * (1f + eco.KillCoinWaveSlope * System.Math.Max(0, wave - 1));
            return System.Math.Max(0, (int)System.Math.Round(raw * (1f + coinAura)));
        }

        public static int WaveClearBonus(int completedWave)
        {
            var eco = Balance.Current.Economy;
            return System.Math.Max(0, eco.WaveBonusBase + eco.WaveBonusPerWave * completedWave);
        }

        public static int BossPhaseDropCoin(int wave)
        {
            var eco = Balance.Current.Economy;
            return System.Math.Max(0, eco.BossDropCoinBase + eco.BossDropCoinPerWave * wave);
        }

        public static int WaveCount(int wave)
        {
            var ws = Balance.Current.WaveStage;
            var wc = ws.WaveCounts;
            return wave <= wc.Length ? wc[System.Math.Max(1, wave) - 1] : wc[wc.Length - 1] + ws.WaveCountOverflowStep * (wave - wc.Length);
        }

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

        static TroopMix[] StageTroops(int n)
        {
            switch (n)
            {
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

        static EnemyKind[] StageElites(int n)
        {
            switch (n)
            {
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

        public static readonly EnemyKind[] BossOrder =
        {
            EnemyKind.HeTao, EnemyKind.Boss, EnemyKind.ZhuChaofeng, EnemyKind.Luan, EnemyKind.ZengKui,
            EnemyKind.ShiWen, EnemyKind.HanTao, EnemyKind.HuYan, EnemyKind.LiuMenglong, EnemyKind.GaoQiu,
        };

        public sealed class ChapterDef
        {
            public string Name, Bg, Intro;
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

        static readonly int[] BossStageEliteWaves = { 9 };
        static readonly int[] NormalStageEliteWaves = { 4, 9 };
        public static float BossPace => Balance.Current.WaveStage.BossPace;
        static readonly Role[] BuffCycle = { Sim.Role.Mage, Sim.Role.Archer, Sim.Role.Fighter, Sim.Role.Bomber, Sim.Role.Control, Sim.Role.Archer, Sim.Role.Mage, Sim.Role.Fighter };

        static float SmoothStagePower(int n)
        {
            float p0 = Meta.ExpectedPower(System.Math.Max(1, n - 1)) * Meta.ExpectedRoster(System.Math.Max(1, n - 1));
            float p1 = Meta.ExpectedPower(n) * Meta.ExpectedRoster(n);
            float p2 = Meta.ExpectedPower(System.Math.Min(50, n + 1)) * Meta.ExpectedRoster(System.Math.Min(50, n + 1));
            return n == 1 ? p1 : (0.25f * p0 + 0.50f * p1 + 0.25f * p2);
        }

        static float StageHpBase(int n)
        {
            var ws = Balance.Current.WaveStage;
            float raw = HpTune(n) * SmoothStagePower(n) * StageEscalation(n);
            int idx = (n - 1) % LevelsPerChapter + 1;
            if (idx == 5) raw *= 1.07f;
            else if (idx == 10) raw *= 1.12f;
            if (n <= 1) return raw;
            float prev = StageHpBase(n - 1);
            float minStep = n <= 5 ? ws.StageMinStep1To5 : n <= 15 ? ws.StageMinStep6To15 : ws.StageMinStep16Plus;
            return System.Math.Max(raw, prev * minStep);
        }

        public static float StageHp(int n) => StageHpBase(n) * Balance.Current.WaveStage.GlobalHpMul;

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
            var ws = Balance.Current.WaveStage;
            float a = Meta.ExpectedWall(n) * (1.08f + 0.020f * (n - 1)) * ws.GlobalAtkMul;
            if (n == 4) a *= 1.22f;
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

        /// <summary>当 BalanceConfig 参数变更时重算四技能说明、派生词条表与 50 关关卡表。</summary>
        public static void RebuildDerived()
        {
            HeroKits.RefreshAll();
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
                    var elites = StageElites(n);
                    var oldKind = i == 10 ? ch.Boss : i >= 5 || c == 0 ? ch.MidBoss : Chapters[c - 1].Boss;
                    float oldMul = i == 10 ? (c == 0 ? 0.66f : c >= 4 ? 0.40f : c >= 3 ? 0.50f : 0.70f)
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

        /// <summary>民兵大比武：按当前进度出一关加强版，每天换增益。</summary>
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

        /// <summary>截获外星补给：六波，每波一串搬运工，打爆能量箱越多金币越多。</summary>
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
