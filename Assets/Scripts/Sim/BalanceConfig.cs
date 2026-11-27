using System;
using System.Collections.Generic;

namespace Liangshan.Sim
{
    /// <summary>局内银两经济与生辰纲老虎机参数（纯 C# 可序列化，供 Sim、JSON 配置与编辑器数值中心共用）。</summary>
    [Serializable]
    public sealed class EconomyBalance
    {
        /// <summary>开局初始银两（100 银两对应开局固定召唤 3 人：10+20+30=60，余 40）。</summary>
        public int StartCoins = 100;
        /// <summary>每累计招募几次（含免费）扩充 1 个城墙站位格（默认 5，与统帅脚下 0/5 进度一致）。</summary>
        public int SummonsPerSlot = 5;
        /// <summary>累计召唤满几次后解锁局内「强化」按钮。</summary>
        public int EnhanceUnlockSummons = 5;

        /// <summary>第 1~N 次花钱召唤的价格表（纯查表不走线性公式；27 格覆盖开满 12 个城墙槽所需的 25 次召唤及后期补位合成）。</summary>
        public int[] SummonTable =
        {
            10, 20, 30, 45, 60, 80, 90, 110, 130,
            150, 160, 175, 190, 200, 215, 235, 260, 290,
            320, 360, 410, 470, 540, 630, 750, 1100, 1800
        };
        /// <summary>已弃用线性超表加价（保留字段兼容旧 JSON，默认 0，实际固定取表尾值）。</summary>
        public int SummonOverflowLinear = 0;
        public int SummonOverflowQuad = 0;

        /// <summary>第 1~N 次局内购买强化词条的价格表（纯查表不走线性公式）。</summary>
        public int[] EnhanceTable = { 100, 200, 400, 600, 1000, 1500, 1800, 2500, 3000 };
        /// <summary>已弃用强化超表线性递增（保留字段兼容旧 JSON，默认 0，实际固定取表尾值）。</summary>
        public int EnhanceOverflowStep = 0;

        /// <summary>普通小兵击杀银两基础倍率（1.0 = 按面板 Coin 原值直掉，不做隐藏乘算）。</summary>
        public float KillCoinMul = 1.0f;
        /// <summary>普通小兵每推进 1 波的击杀赏银递增比例（0.0 = 全波次同兵种固定掉同样银两，不做波次加成）。</summary>
        public float KillCoinWaveSlope = 0.0f;
        /// <summary>精英与首领阵亡直接掉落赏银倍率（1.0 = 按面板 Coin 原值直掉）。</summary>
        public float BigKillCoinMul = 1.0f;

        /// <summary>每撑过/击退一波发放的守城军饷基数（第 w 波结束进 w+1 波时发放：WaveBonusBase + WaveBonusPerWave × w）。</summary>
        public int WaveBonusBase = 40;
        public int WaveBonusPerWave = 52;

        /// <summary>首领血量压至第 1、第 2 阈值时当场爆出阶段钱袋（消除打首领零收入断档）。</summary>
        public float BossDropHp1 = 0.70f;
        public float BossDropHp2 = 0.35f;
        public int BossDropCoinBase = 160;
        public int BossDropCoinPerWave = 20;

        /// <summary>生辰纲老虎机单格基础银两与每波递增值（ReelSilver = ReelSilverBase + Wave × ReelSilverPerWave）。</summary>
        public int ReelSilverBase = 55;
        public int ReelSilverPerWave = 10;
        /// <summary>生辰纲全部同色时的银两翻倍倍率（2.0 = 同色翻倍）。</summary>
        public float ReelJackpotMul = 2.0f;
        /// <summary>非保底时自然摇出全部同色天胡的概率。</summary>
        public float ReelNaturalJackpotChance = 0.08f;
        /// <summary>单格摇出「好汉强化」而非「银两」的概率。</summary>
        public float ReelPerkCellChance = 0.35f;
        public int ReelNormalCells = 4;
        public int ReelBossCells = 5;
        public int ReelPerkMax = 2;
        public int ReelPerkJackpot = 2;
    }

    /// <summary>局内战斗乘区、合成保护、词条放大与统帅剑气参数。</summary>
    [Serializable]
    public sealed class CombatBalance
    {
        /// <summary>1~4 星合成伤害倍率曲线。</summary>
        public float[] StarMul = { 1f, 2.0f, 3.3f, 4.2f };
        /// <summary>1~4 星合成攻速倍率曲线。</summary>
        public float[] StarSpeed = { 1f, 1.04f, 1.10f, 1.20f };

        /// <summary>开局前几次合成 2 星时，若场上输出位不足 EarlyCarryMinOnField 人，则保护不变出辅助。</summary>
        public int EarlyCarryMergeProtectCount = 2;
        public int EarlyCarryMinOnField = 3;

        /// <summary>普通数值词条放大倍率（确保买词条显著优于无脑堆低星人数）。</summary>
        public float PerkDmgBoost = 1.85f;
        public float PerkAreaBoost = 1.54f;
        public float PerkSpeedBoost = 1.38f;
        public float PerkCritBoost = 1.25f;

        /// <summary>取舍卡【齐射/连斩】（数量+2）的单发伤害折减比例（负值）与【大开大合】的范围加成/频率代价。</summary>
        public float WideMultiDmgPenalty = -0.28f;
        public float WideAreaBonus = 0.65f;
        public float WideAreaSpeedPenalty = -0.15f;

        /// <summary>5 级「爆发」、15 级「爆发进阶」、20 级「最强一击」参数。</summary>
        public float SurgeChance = 0.40f;
        public float SurgeDmg = 3.60f;
        public float SurgePlusChance = 0.10f;
        public float TopDmg = 1.45f;

        /// <summary>三合一奥义觉醒独立加成。</summary>
        public float AwakenDmgBonus = 0.45f;
        public float AwakenSpeedBonus = 0.20f;
        public float AwakenAuraBonus = 0.40f;
        /// <summary>传说大招继承本好汉已选专属词条层数的每层增伤比例。</summary>
        public float UltPerkStackBonus = 0.12f;

        /// <summary>统帅宋江「替天行道」基础伤害倍率、冷却秒数、开场首放秒数与剑气推进速度(格/秒)。</summary>
        public float LordPctBase = 1.8f;
        public float LordCdBase = 40f;
        public float LordFirstCast = 21f;
        public float LordWaveSpeed = 12.5f;

        /// <summary>全局武器弹道耗时倍率（1.0=标准；调大整体放慢更看清神兵轨迹，调小整体加快）。</summary>
        public float ProjPace = 1.0f;
        /// <summary>全局刀剑枪斧特效时长倍率（1.0=标准；统一控制弧形刀光、破阵枪罡、月牙斩与旋转节奏）。</summary>
        public float VfxPace = 1.0f;
        /// <summary>普攻最短真实出手间隔下限(秒)：防止后期极端攻速把 4 帧动作压成鬼畜闪烁，超出下限的溢出攻速 1:1 无损折算为单发伤害。</summary>
        public float MinAtkInterval = 0.55f;

        /// <summary>箭矢弹道（花荣/燕青/解珍/解宝）：起手基础秒数 + 距离/飞行速度(格/秒)，4.5格约 0.55s。</summary>
        public float ArrowBase = 0.26f;
        public float ArrowSpeed = 15.5f;

        /// <summary>长枪突刺弹道（林冲/卢俊义/徐宁/杨志）：比箭略凌厉但绝不瞬移，4.5格约 0.52s。</summary>
        public float SpearBase = 0.26f;
        public float SpearSpeed = 17.5f;

        /// <summary>刀/剑/斧/拳近战飞掷弹道（李逵/石秀/杨雄/武松等）：近身利落、远投看清回旋，4.5格约 0.60s。</summary>
        public float MeleeBase = 0.28f;
        public float MeleeSpeed = 14.0f;

        /// <summary>重兵腾空劈砸弹道（关胜青龙偃月刀/鲁智深禅杖）：势大力沉高高跃劈，4.5格约 0.71s。</summary>
        public float SlamBase = 0.36f;
        public float SlamSpeed = 13.0f;

        /// <summary>刀气/剑气波贴地推进耗时(秒)。</summary>
        public float QiDur = 0.52f;

        /// <summary>飞石弹道（张清没羽飞石）：起手秒数 + 距离/飞行速度，4.5格约 0.53s。</summary>
        public float StoneBase = 0.26f;
        public float StoneSpeed = 16.5f;

        /// <summary>法师·天雷引落耗时与雷链弹跳间隔（公孙胜）：配合 0.40s 雷霆劈落序列帧与双层跳跃电弧。</summary>
        public float LightningDur = 0.16f;
        public float LightningChainGap = 0.08f;

        /// <summary>法师·镇魔金砖天降基础耗时（马灵，总耗时 = MageDropDur + 距离/StoneSpeed，4.5格约 0.53s）。</summary>
        public float MageDropDur = 0.26f;

        /// <summary>法师/控制·风咒/八阵图/迷烟/渔网弹道（樊瑞/朱武/孙二娘/阮小七）：4.5格约 0.59s。</summary>
        public float WindBase = 0.30f;
        public float WindSpeed = 15.5f;

        /// <summary>法师·持续射线流光流速（乔道清火焰射线/单廷珪圣水射线，越小火舌水波越清晰）。</summary>
        public float BeamFlowSpeed = 1.8f;

        /// <summary>火器·重炮高抛与火陨坠落弹道（凌振/魏定国/孔亮/秦明）。</summary>
        public float BombBase = 0.55f;
        public float BombSpeed = 20.0f;
        public float FireballBase = 0.40f;
        public float FireballSpeed = 17.0f;

        /// <summary>控制·缚龙索抛投弹道（扈三娘）：4.5格约 0.59s。</summary>
        public float LassoBase = 0.32f;
        public float LassoSpeed = 16.5f;
    }

    /// <summary>波次刷怪节奏、怪物波次肉度与 50 关推进曲线参数。</summary>
    [Serializable]
    public sealed class WaveStageBalance
    {
        public int[] WaveCounts = { 10, 15, 22, 32, 45, 60, 76, 92, 108, 124 };
        public int WaveCountOverflowStep = 12;
        public float WaveTime = 24f;
        public float WaveMinTime = 7f;
        public float ClearBreath = 0.8f;

        /// <summary>波次血量递增斜率：HpScale(w) = 1 + HpScaleSlope × (w - 1)。第1波恒为1.0不变，中后期随27召唤+9强化满表战力同步抬升。</summary>
        public float HpScaleSlope = 1.00f;
        /// <summary>小兵全局基础厚度系数与前几波开场耐打修正（开场扎实耐打不秒怪，召唤与强化成型后爽快破敌）。</summary>
        public float Bulk = 1.78f;
        public float[] EarlyWaveTough = { 1.44f, 1.32f, 1.20f, 1.10f };

        /// <summary>首领行军移速倍率、狂暴波次与狂暴攻速/伤害倍率（对标蔚蓝星球：第4波登场→第5波推进至路中→第7波抵近寨墙施压）。</summary>
        public float BossPace = 0.55f;
        public int MainBossWave = 4;
        public int MainRageWave = 8;
        public float RageAtkMul = 1.5f;
        public float RageSpeedMul = 1.3f;

        /// <summary>寨墙基础血量与关卡推荐职业增伤幅度。</summary>
        public float WallBaseHp = 6000f;
        public float StageBuffNormal = 0.35f;
        public float StageBuffBoss = 0.50f;

        /// <summary>全局难度总推杆：1.0 为校准标准值；调小（如 0.90）全关卡怪血/拆墙同步降低 10%，调大（如 1.10）全关卡同步提升 10%，不破坏关间斜率。</summary>
        public float GlobalHpMul = 1.00f;
        public float GlobalAtkMul = 1.00f;

        /// <summary>50 关血量微调折线锚点与关间保底递增率（适度放宽约 8%~10% 容错，标准养成顺畅通关，跳过养成仍在第 4~5 关及各章受阻）。</summary>
        public float[] HpTuneStages = { 1f, 4f, 5f, 10f, 25f, 40f, 50f };
        public float[] HpTuneValues = { 1.46f, 2.02f, 2.24f, 2.64f, 2.08f, 2.44f, 2.50f };
        public float StageMinStep1To5 = 1.18f;
        public float StageMinStep6To15 = 1.12f;
        public float StageMinStep16Plus = 1.075f;
    }

    /// <summary>单名好汉的可调战斗数值行。</summary>
    [Serializable]
    public sealed class HeroBalanceRow
    {
        public string Id;
        public string Name;
        public int Rarity;
        public float Coef;
        public float Interval;
        public float Range;
        public float Radius;
        public int Count;
        public int Chain;
        public float Knock;
        public float Stun;
        public float StunChance;
        public float Slow;
        public float PierceGrow;
        public float Dot;
        public float Chan;
        public float Tick;
        public float BuffV;
        public float AuraV;
        public float UltCoef;
        public float UltCd;
        public float UltRadius;
        public float UltStun;
        public int UltN;
        public float PassiveV;
        /// <summary>旧 JSON 没有这列时为 false，导入时保留代码里的四技能出厂数值，避免被 0 清掉。</summary>
        public bool HasKit;
        public float TraitV;
        public int TraitN;
        public int SigN;
        public float SigV;
        public float SigV2;
        public float Opt15V;
        public float Opt15V2;
    }

    /// <summary>单种敌人/首领的可调战斗数值行。</summary>
    [Serializable]
    public sealed class EnemyBalanceRow
    {
        public string Kind;
        public string Name;
        public float Hp;
        public float Speed;
        public float WallDps;
        public float Size;
        public int Coin;
        public float StopY;
        public float PhysResist;
        public float MagicWeak;
        public float ArcherWeak;
    }

    /// <summary>完整数值配置根对象（对应 Assets/Resources/BalanceConfig.json）。</summary>
    [Serializable]
    public sealed class BalanceConfig
    {
        public int Version = 1;
        public EconomyBalance Economy = new EconomyBalance();
        public CombatBalance Combat = new CombatBalance();
        public WaveStageBalance WaveStage = new WaveStageBalance();
        public HeroBalanceRow[] Heroes = new HeroBalanceRow[0];
        public EnemyBalanceRow[] Enemies = new EnemyBalanceRow[0];
    }

    /// <summary>10 波经济预算快速推演结果（供编辑器数值中心实时预览与单测核验）。</summary>
    public struct EconomyEstimate
    {
        public int StartCoins;
        public int First5MinionCoins;
        public int TotalMinionCoins;
        public int WaveBonusCoins;
        public int BossPhaseCoins;
        public int BossDirectCoin;
        public int EliteDirectCoin;
        public int BossReelExpectedCoins;
        public int BossReelAllSilverCoins;
        public int EliteReelExpectedCoins;
        public int TotalRoutineCoins => StartCoins + TotalMinionCoins + WaveBonusCoins + BossPhaseCoins;
        public int TotalTreasureExpectedCoins => BossDirectCoin + BossReelExpectedCoins + EliteDirectCoin + EliteReelExpectedCoins;
        public int GrandTotalExpected => TotalRoutineCoins + TotalTreasureExpectedCoins;
        public float TreasureShare => GrandTotalExpected > 0 ? (float)TotalTreasureExpectedCoins / GrandTotalExpected : 0f;
    }

    /// <summary>全局数值管理中心入口：负责默认快照、配置热应用与经济推演。</summary>
    public static class Balance
    {
        static BalanceConfig _defaultSnapshot;
        public static BalanceConfig Current { get; private set; } = new BalanceConfig();

        /// <summary>在 Defs 静态表首次初始化完成后捕获出厂基准快照。</summary>
        internal static void InitWithCodeDefaults()
        {
            var cfg = new BalanceConfig();
            cfg.Heroes = ExportHeroes();
            cfg.Enemies = ExportEnemies();
            _defaultSnapshot = Clone(cfg);
            Current = Clone(cfg);
        }

        public static BalanceConfig CreateDefault()
        {
            Defs.EnsureInitialized();
            return Clone(_defaultSnapshot);
        }

        public static BalanceConfig ExportCurrent()
        {
            Defs.EnsureInitialized();
            var c = Clone(Current);
            c.Heroes = ExportHeroes();
            c.Enemies = ExportEnemies();
            return c;
        }

        /// <summary>将外部配置立即应用至全局内存表，并重算派生词条文案与 50 关曲线。</summary>
        public static void Apply(BalanceConfig cfg)
        {
            if (cfg == null) return;
            Defs.EnsureInitialized();
            Current = Clone(cfg);
            Sanitize(Current);
            ImportHeroes(Current.Heroes);
            ImportEnemies(Current.Enemies);
            Defs.RebuildDerived();
        }

        public static void ResetToDefault()
        {
            Defs.EnsureInitialized();
            Apply(_defaultSnapshot);
        }

        static void Sanitize(BalanceConfig c)
        {
            if (c.Economy == null) c.Economy = new EconomyBalance();
            if (c.Combat == null) c.Combat = new CombatBalance();
            if (c.WaveStage == null) c.WaveStage = new WaveStageBalance();
            if (c.Economy.SummonsPerSlot < 1) c.Economy.SummonsPerSlot = 1;
            if (c.Economy.EnhanceUnlockSummons < 0) c.Economy.EnhanceUnlockSummons = 0;
            if (c.Economy.SummonTable == null || c.Economy.SummonTable.Length == 0)
                c.Economy.SummonTable = new EconomyBalance().SummonTable;
            if (c.Economy.EnhanceTable == null || c.Economy.EnhanceTable.Length == 0)
                c.Economy.EnhanceTable = new EconomyBalance().EnhanceTable;
            if (c.Combat.StarMul == null || c.Combat.StarMul.Length < 4)
                c.Combat.StarMul = new CombatBalance().StarMul;
            if (c.Combat.StarSpeed == null || c.Combat.StarSpeed.Length < 4)
                c.Combat.StarSpeed = new CombatBalance().StarSpeed;
            var cd = new CombatBalance();
            if (c.Combat.LordWaveSpeed <= 0.5f) c.Combat.LordWaveSpeed = cd.LordWaveSpeed;
            if (c.Combat.ProjPace <= 0.1f) c.Combat.ProjPace = cd.ProjPace;
            if (c.Combat.VfxPace <= 0.1f) c.Combat.VfxPace = cd.VfxPace;
            if (c.Combat.MinAtkInterval <= 0.15f) c.Combat.MinAtkInterval = cd.MinAtkInterval;
            if (c.Combat.ArrowBase <= 0.02f) c.Combat.ArrowBase = cd.ArrowBase;
            if (c.Combat.ArrowSpeed <= 0.5f) c.Combat.ArrowSpeed = cd.ArrowSpeed;
            if (c.Combat.SpearBase <= 0.02f) c.Combat.SpearBase = cd.SpearBase;
            if (c.Combat.SpearSpeed <= 0.5f) c.Combat.SpearSpeed = cd.SpearSpeed;
            if (c.Combat.MeleeBase <= 0.02f) c.Combat.MeleeBase = cd.MeleeBase;
            if (c.Combat.MeleeSpeed <= 0.5f) c.Combat.MeleeSpeed = cd.MeleeSpeed;
            if (c.Combat.SlamBase <= 0.02f) c.Combat.SlamBase = cd.SlamBase;
            if (c.Combat.SlamSpeed <= 0.5f) c.Combat.SlamSpeed = cd.SlamSpeed;
            if (c.Combat.QiDur <= 0.05f) c.Combat.QiDur = cd.QiDur;
            if (c.Combat.StoneBase <= 0.02f) c.Combat.StoneBase = cd.StoneBase;
            if (c.Combat.StoneSpeed <= 0.5f) c.Combat.StoneSpeed = cd.StoneSpeed;
            if (c.Combat.LightningDur <= 0.04f) c.Combat.LightningDur = cd.LightningDur;
            if (c.Combat.LightningChainGap <= 0.03f) c.Combat.LightningChainGap = cd.LightningChainGap;
            if (c.Combat.MageDropDur <= 0.10f) c.Combat.MageDropDur = cd.MageDropDur;
            if (c.Combat.WindBase <= 0.02f) c.Combat.WindBase = cd.WindBase;
            if (c.Combat.WindSpeed <= 0.5f) c.Combat.WindSpeed = cd.WindSpeed;
            if (c.Combat.BeamFlowSpeed <= 0.1f) c.Combat.BeamFlowSpeed = cd.BeamFlowSpeed;
            if (c.Combat.BombBase <= 0.05f) c.Combat.BombBase = cd.BombBase;
            if (c.Combat.BombSpeed <= 0.5f) c.Combat.BombSpeed = cd.BombSpeed;
            if (c.Combat.FireballBase <= 0.05f) c.Combat.FireballBase = cd.FireballBase;
            if (c.Combat.FireballSpeed <= 0.5f) c.Combat.FireballSpeed = cd.FireballSpeed;
            if (c.Combat.LassoBase <= 0.02f) c.Combat.LassoBase = cd.LassoBase;
            if (c.Combat.LassoSpeed <= 0.5f) c.Combat.LassoSpeed = cd.LassoSpeed;
            if (c.WaveStage.WaveCounts == null || c.WaveStage.WaveCounts.Length == 0)
                c.WaveStage.WaveCounts = new WaveStageBalance().WaveCounts;
            if (c.WaveStage.EarlyWaveTough == null)
                c.WaveStage.EarlyWaveTough = new WaveStageBalance().EarlyWaveTough;
            if (c.WaveStage.GlobalHpMul <= 0.05f) c.WaveStage.GlobalHpMul = 1.0f;
            if (c.WaveStage.GlobalAtkMul <= 0.05f) c.WaveStage.GlobalAtkMul = 1.0f;
            if (c.WaveStage.HpTuneStages == null || c.WaveStage.HpTuneValues == null || c.WaveStage.HpTuneStages.Length != c.WaveStage.HpTuneValues.Length || c.WaveStage.HpTuneStages.Length == 0)
            {
                var d = new WaveStageBalance();
                c.WaveStage.HpTuneStages = d.HpTuneStages;
                c.WaveStage.HpTuneValues = d.HpTuneValues;
            }
        }

        /// <summary>快速推演标准 10 波主线关的银两收支构成，供策划调参时一秒核对日常与生辰纲比例。</summary>
        public static EconomyEstimate EstimateTenWaveEconomy(bool isChapterBoss = true, int bossKillWave = 7)
        {
            Defs.EnsureInitialized();
            var eco = Current.Economy;
            int soldierBase = Defs.Enemy(EnemyKind.Soldier).Coin;
            int first5 = 0, totalMinion = 0, waveBonus = 0;
            for (int w = 1; w <= 10; w++)
            {
                int cnt = Defs.WaveCount(w);
                // 混合特色兵种平均基础 Coin 约为官兵的 1.22 倍（前2波接近纯官兵）
                float avgBaseCoin = soldierBase * (w == 1 ? 1.0f : w <= 3 ? 1.14f : 1.24f);
                int perMinion = Math.Max(1, (int)Math.Round(avgBaseCoin * eco.KillCoinMul * (1f + eco.KillCoinWaveSlope * (w - 1))));
                int wCoins = cnt * perMinion;
                if (w <= 5) first5 += wCoins;
                totalMinion += wCoins;
                if (w < 10) waveBonus += Math.Max(0, eco.WaveBonusBase + eco.WaveBonusPerWave * w);
            }
            int p1 = eco.BossDropHp1 > 0f ? Math.Max(0, eco.BossDropCoinBase + eco.BossDropCoinPerWave * 5) : 0;
            int p2 = eco.BossDropHp2 > 0f ? Math.Max(0, eco.BossDropCoinBase + eco.BossDropCoinPerWave * 6) : 0;
            int cells = isChapterBoss ? eco.ReelBossCells : eco.ReelNormalCells;
            float silverChance = 1f - M.Clamp01(eco.ReelPerkCellChance);

            int bossCell = eco.ReelSilverBase + bossKillWave * eco.ReelSilverPerWave;
            int bossAllSilver = (int)Math.Round(cells * bossCell * eco.ReelJackpotMul);
            int bossReelExp = (int)Math.Round(silverChance * bossAllSilver);

            int bossBaseCoin = (int)Math.Round(Defs.Enemy(isChapterBoss ? EnemyKind.Boss : EnemyKind.HeTao).Coin * eco.BigKillCoinMul);
            int eliteBaseCoin = (int)Math.Round(Defs.Enemy(EnemyKind.Elite).Coin * eco.BigKillCoinMul);
            return new EconomyEstimate
            {
                StartCoins = eco.StartCoins,
                First5MinionCoins = first5,
                TotalMinionCoins = totalMinion,
                WaveBonusCoins = waveBonus,
                BossPhaseCoins = p1 + p2,
                BossDirectCoin = bossBaseCoin,
                EliteDirectCoin = eliteBaseCoin,
                BossReelExpectedCoins = bossReelExp,
                BossReelAllSilverCoins = bossAllSilver,
                EliteReelExpectedCoins = 0,
            };
        }

        static HeroBalanceRow[] ExportHeroes()
        {
            var rows = new HeroBalanceRow[Defs.Heroes.Length];
            for (int i = 0; i < Defs.Heroes.Length; i++)
            {
                var d = Defs.Heroes[i];
                var kit = HeroKits.Of(d.Id);
                rows[i] = new HeroBalanceRow
                {
                    Id = d.Id.ToString(),
                    Name = d.Name,
                    Rarity = d.Rarity,
                    Coef = d.Coef,
                    Interval = d.Interval,
                    Range = d.Range,
                    Radius = d.Radius,
                    Count = d.Count,
                    Chain = d.Chain,
                    Knock = d.Knock,
                    Stun = d.Stun,
                    StunChance = d.StunChance,
                    Slow = d.Slow,
                    PierceGrow = d.PierceGrow,
                    Dot = d.Dot,
                    Chan = d.Chan,
                    Tick = d.Tick,
                    BuffV = d.BuffV,
                    AuraV = d.AuraV,
                    UltCoef = d.UltCoef,
                    UltCd = d.UltCd,
                    UltRadius = d.UltRadius,
                    UltStun = d.UltStun,
                    UltN = d.UltN,
                    PassiveV = d.PassiveV,
                    HasKit = true,
                    TraitV = kit.TraitV,
                    TraitN = kit.TraitN,
                    SigN = kit.SigN,
                    SigV = kit.SigV,
                    SigV2 = kit.SigV2,
                    Opt15V = kit.Opt15V,
                    Opt15V2 = kit.Opt15V2,
                };
            }
            return rows;
        }

        static void ImportHeroes(HeroBalanceRow[] rows)
        {
            if (rows == null) return;
            var map = new Dictionary<string, HeroDef>(StringComparer.OrdinalIgnoreCase);
            foreach (var h in Defs.Heroes) map[h.Id.ToString()] = h;
            foreach (var r in rows)
            {
                if (r == null || string.IsNullOrEmpty(r.Id) || !map.TryGetValue(r.Id, out var d)) continue;
                if (r.Rarity >= 2 && r.Rarity <= 4) d.Rarity = r.Rarity;
                d.Coef = r.Coef;
                if (r.Interval > 0.1f) d.Interval = r.Interval;
                if (r.Range > 0.1f) d.Range = r.Range;
                if (r.Radius > 0.05f) d.Radius = r.Radius;
                if (r.Count >= 1) d.Count = r.Count;
                d.Chain = Math.Max(0, r.Chain);
                d.Knock = Math.Max(0f, r.Knock);
                d.Stun = Math.Max(0f, r.Stun);
                d.StunChance = M.Clamp01(r.StunChance);
                d.Slow = Math.Max(0f, r.Slow);
                d.PierceGrow = Math.Max(0f, r.PierceGrow);
                d.Dot = Math.Max(0f, r.Dot);
                d.Chan = Math.Max(0f, r.Chan);
                if (d.Chan > 0f && r.Tick > 0.02f) d.Tick = r.Tick;
                d.BuffV = Math.Max(0f, r.BuffV);
                d.AuraV = Math.Max(0f, r.AuraV);
                d.UltCoef = Math.Max(0f, r.UltCoef);
                if (r.UltCd > 0.5f) d.UltCd = r.UltCd;
                if (r.UltRadius > 0.1f) d.UltRadius = r.UltRadius;
                d.UltStun = Math.Max(0f, r.UltStun);
                if (r.UltN >= 1) d.UltN = r.UltN;
                d.PassiveV = r.PassiveV;
                if (!r.HasKit) continue;
                var kit = HeroKits.Of(d.Id);
                kit.TraitV = r.TraitV;
                kit.TraitN = r.TraitN;
                kit.SigN = Math.Max(0, r.SigN);
                kit.SigV = r.SigV;
                kit.SigV2 = r.SigV2;
                kit.Opt15V = r.Opt15V;
                kit.Opt15V2 = r.Opt15V2;
            }
        }

        static EnemyBalanceRow[] ExportEnemies()
        {
            var rows = new EnemyBalanceRow[Defs.Enemies.Length];
            for (int i = 0; i < Defs.Enemies.Length; i++)
            {
                var e = Defs.Enemies[i];
                rows[i] = new EnemyBalanceRow
                {
                    Kind = e.Kind.ToString(),
                    Name = e.Name,
                    Hp = e.Hp,
                    Speed = e.Speed,
                    WallDps = e.WallDps,
                    Size = e.Size,
                    Coin = e.Coin,
                    StopY = e.StopY,
                    PhysResist = e.PhysResist,
                    MagicWeak = e.MagicWeak,
                    ArcherWeak = e.ArcherWeak,
                };
            }
            return rows;
        }

        static void ImportEnemies(EnemyBalanceRow[] rows)
        {
            if (rows == null) return;
            var map = new Dictionary<string, EnemyDef>(StringComparer.OrdinalIgnoreCase);
            foreach (var e in Defs.Enemies) map[e.Kind.ToString()] = e;
            foreach (var r in rows)
            {
                if (r == null || string.IsNullOrEmpty(r.Kind) || !map.TryGetValue(r.Kind, out var e)) continue;
                if (r.Hp >= 1f) e.Hp = r.Hp;
                if (r.Speed > 0.01f) e.Speed = r.Speed;
                e.WallDps = Math.Max(0f, r.WallDps);
                if (r.Size > 0.1f) e.Size = r.Size;
                e.Coin = Math.Max(0, r.Coin);
                e.StopY = r.StopY;
                e.PhysResist = Math.Max(0f, Math.Min(0.50f, r.PhysResist));
                e.MagicWeak = Math.Max(0f, r.MagicWeak);
                e.ArcherWeak = Math.Max(0f, r.ArcherWeak);
            }
        }

        static T[] CopyArr<T>(T[] src)
        {
            if (src == null) return null;
            var dst = new T[src.Length];
            Array.Copy(src, dst, src.Length);
            return dst;
        }

        static BalanceConfig Clone(BalanceConfig s)
        {
            if (s == null) return new BalanceConfig();
            var e = s.Economy ?? new EconomyBalance();
            var c = s.Combat ?? new CombatBalance();
            var w = s.WaveStage ?? new WaveStageBalance();
            var dst = new BalanceConfig
            {
                Version = s.Version,
                Economy = new EconomyBalance
                {
                    StartCoins = e.StartCoins,
                    SummonsPerSlot = e.SummonsPerSlot,
                    EnhanceUnlockSummons = e.EnhanceUnlockSummons,
                    SummonTable = CopyArr(e.SummonTable),
                    SummonOverflowLinear = e.SummonOverflowLinear,
                    SummonOverflowQuad = e.SummonOverflowQuad,
                    EnhanceTable = CopyArr(e.EnhanceTable),
                    EnhanceOverflowStep = e.EnhanceOverflowStep,
                    KillCoinMul = e.KillCoinMul,
                    KillCoinWaveSlope = e.KillCoinWaveSlope,
                    BigKillCoinMul = e.BigKillCoinMul,
                    WaveBonusBase = e.WaveBonusBase,
                    WaveBonusPerWave = e.WaveBonusPerWave,
                    BossDropHp1 = e.BossDropHp1,
                    BossDropHp2 = e.BossDropHp2,
                    BossDropCoinBase = e.BossDropCoinBase,
                    BossDropCoinPerWave = e.BossDropCoinPerWave,
                    ReelSilverBase = e.ReelSilverBase,
                    ReelSilverPerWave = e.ReelSilverPerWave,
                    ReelJackpotMul = e.ReelJackpotMul,
                    ReelNaturalJackpotChance = e.ReelNaturalJackpotChance,
                    ReelPerkCellChance = e.ReelPerkCellChance,
                    ReelNormalCells = e.ReelNormalCells,
                    ReelBossCells = e.ReelBossCells,
                    ReelPerkMax = e.ReelPerkMax,
                    ReelPerkJackpot = e.ReelPerkJackpot,
                },
                Combat = new CombatBalance
                {
                    StarMul = CopyArr(c.StarMul),
                    StarSpeed = CopyArr(c.StarSpeed),
                    EarlyCarryMergeProtectCount = c.EarlyCarryMergeProtectCount,
                    EarlyCarryMinOnField = c.EarlyCarryMinOnField,
                    PerkDmgBoost = c.PerkDmgBoost,
                    PerkAreaBoost = c.PerkAreaBoost,
                    PerkSpeedBoost = c.PerkSpeedBoost,
                    PerkCritBoost = c.PerkCritBoost,
                    WideMultiDmgPenalty = c.WideMultiDmgPenalty,
                    WideAreaBonus = c.WideAreaBonus,
                    WideAreaSpeedPenalty = c.WideAreaSpeedPenalty,
                    SurgeChance = c.SurgeChance,
                    SurgeDmg = c.SurgeDmg,
                    SurgePlusChance = c.SurgePlusChance,
                    TopDmg = c.TopDmg,
                    AwakenDmgBonus = c.AwakenDmgBonus,
                    AwakenSpeedBonus = c.AwakenSpeedBonus,
                    AwakenAuraBonus = c.AwakenAuraBonus,
                    UltPerkStackBonus = c.UltPerkStackBonus,
                    LordPctBase = c.LordPctBase,
                    LordCdBase = c.LordCdBase,
                    LordFirstCast = c.LordFirstCast,
                    LordWaveSpeed = c.LordWaveSpeed,
                    ProjPace = c.ProjPace,
                    VfxPace = c.VfxPace,
                    MinAtkInterval = c.MinAtkInterval,
                    ArrowBase = c.ArrowBase,
                    ArrowSpeed = c.ArrowSpeed,
                    SpearBase = c.SpearBase,
                    SpearSpeed = c.SpearSpeed,
                    MeleeBase = c.MeleeBase,
                    MeleeSpeed = c.MeleeSpeed,
                    SlamBase = c.SlamBase,
                    SlamSpeed = c.SlamSpeed,
                    QiDur = c.QiDur,
                    StoneBase = c.StoneBase,
                    StoneSpeed = c.StoneSpeed,
                    LightningDur = c.LightningDur,
                    LightningChainGap = c.LightningChainGap,
                    MageDropDur = c.MageDropDur,
                    WindBase = c.WindBase,
                    WindSpeed = c.WindSpeed,
                    BeamFlowSpeed = c.BeamFlowSpeed,
                    BombBase = c.BombBase,
                    BombSpeed = c.BombSpeed,
                    FireballBase = c.FireballBase,
                    FireballSpeed = c.FireballSpeed,
                    LassoBase = c.LassoBase,
                    LassoSpeed = c.LassoSpeed,
                },
                WaveStage = new WaveStageBalance
                {
                    WaveCounts = CopyArr(w.WaveCounts),
                    WaveCountOverflowStep = w.WaveCountOverflowStep,
                    WaveTime = w.WaveTime,
                    WaveMinTime = w.WaveMinTime,
                    ClearBreath = w.ClearBreath,
                    HpScaleSlope = w.HpScaleSlope,
                    Bulk = w.Bulk,
                    EarlyWaveTough = CopyArr(w.EarlyWaveTough),
                    BossPace = w.BossPace,
                    MainBossWave = w.MainBossWave,
                    MainRageWave = w.MainRageWave,
                    RageAtkMul = w.RageAtkMul,
                    RageSpeedMul = w.RageSpeedMul,
                    WallBaseHp = w.WallBaseHp,
                    StageBuffNormal = w.StageBuffNormal,
                    StageBuffBoss = w.StageBuffBoss,
                    GlobalHpMul = w.GlobalHpMul,
                    GlobalAtkMul = w.GlobalAtkMul,
                    HpTuneStages = CopyArr(w.HpTuneStages),
                    HpTuneValues = CopyArr(w.HpTuneValues),
                    StageMinStep1To5 = w.StageMinStep1To5,
                    StageMinStep6To15 = w.StageMinStep6To15,
                    StageMinStep16Plus = w.StageMinStep16Plus,
                },
            };
            if (s.Heroes != null)
            {
                dst.Heroes = new HeroBalanceRow[s.Heroes.Length];
                for (int i = 0; i < s.Heroes.Length; i++)
                {
                    var h = s.Heroes[i];
                    if (h == null) continue;
                    dst.Heroes[i] = new HeroBalanceRow
                    {
                        Id = h.Id, Name = h.Name, Rarity = h.Rarity, Coef = h.Coef, Interval = h.Interval,
                        Range = h.Range, Radius = h.Radius, Count = h.Count, Chain = h.Chain, Knock = h.Knock,
                        Stun = h.Stun, StunChance = h.StunChance, Slow = h.Slow, PierceGrow = h.PierceGrow,
                        Dot = h.Dot, Chan = h.Chan, Tick = h.Tick, BuffV = h.BuffV, AuraV = h.AuraV,
                        UltCoef = h.UltCoef, UltCd = h.UltCd, UltRadius = h.UltRadius, UltStun = h.UltStun,
                        UltN = h.UltN, PassiveV = h.PassiveV,
                        HasKit = h.HasKit, TraitV = h.TraitV, TraitN = h.TraitN,
                        SigN = h.SigN, SigV = h.SigV, SigV2 = h.SigV2,
                        Opt15V = h.Opt15V, Opt15V2 = h.Opt15V2,
                    };
                }
            }
            if (s.Enemies != null)
            {
                dst.Enemies = new EnemyBalanceRow[s.Enemies.Length];
                for (int i = 0; i < s.Enemies.Length; i++)
                {
                    var m = s.Enemies[i];
                    if (m == null) continue;
                    dst.Enemies[i] = new EnemyBalanceRow
                    {
                        Kind = m.Kind, Name = m.Name, Hp = m.Hp, Speed = m.Speed, WallDps = m.WallDps,
                        Size = m.Size, Coin = m.Coin, StopY = m.StopY, PhysResist = m.PhysResist,
                        MagicWeak = m.MagicWeak, ArcherWeak = m.ArcherWeak,
                    };
                }
            }
            return dst;
        }
    }
}
