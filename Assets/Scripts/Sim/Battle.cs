using System;
using System.Collections.Generic;

namespace Liangshan.Sim
{
    public sealed class Unit
    {
        public int Id;
        public HeroId Hero;
        public int Star = 1;
        public float Cd;
        public bool Burst;
        /// <summary>被首领飞锤砸晕，期间不出手。</summary>
        public float Stun;
        /// <summary>吴用的祝福：生效后接下来 BlessN 次出手，每次出手后的冷却 ÷ BlessMul。</summary>
        public int BlessN;
        public float BlessMul = 1f;
        /// <summary>法球还在路上的秒数。落地那一刻才生效，并把正在走的冷却立刻缩短。</summary>
        public float BlessWait;
        /// <summary>时迁「易容百搭」状态：可与任意同星级其他好汉直接合成。</summary>
        public bool Wild;
        /// <summary>该单位累计普攻轮次（用于三合一觉醒「每3轮额外流星齐射/刀气乱舞」节拍触发）。</summary>
        public int Casts;
        public HeroDef Def => Defs.Hero(Hero);
    }

    /// <summary>法师的持续施法：每 Every 秒跳一次，直到 Left 用完或施法者离场、被晕。</summary>
    public sealed class Channel
    {
        public Unit Unit;
        public int Slot, Target, Ticks;
        public float Next, Every, Damage;
        /// <summary>「爆发」「最强」带来的弹道放大；Sure 为这一轮必定暴击。</summary>
        public float Scale = 1;
        public bool Sure;
    }

    public sealed class Slot
    {
        public int Index;
        public V2 Pos;
        public Unit Unit;
    }

    public sealed class Enemy
    {
        public int Id;
        public EnemyDef Def;
        public float Hp, MaxHp;
        public float Tough = 1;
        public V2 Pos;
        public float LaneX;
        public float SlowT, Stun, AtkCd;
        public bool Attacking, Dead, Escaped;
        public float HitT;
        /// <summary>首领或普通关第4波守关主统领（承担压血阶段赏银与本局唯一生辰纲掉落）。</summary>
        public float SkillT, ChargeT, Shield;
        public int BossDrops;
        public bool ShieldUsed, IsStageLeader;
        /// <summary>小兵特技：水鬼潜水、妖道作法、斥候闪身的计时；藤牌剩余格挡；敢死刀手无敌狂奔；黄安战鼓加速。</summary>
        public float AbilT, DiveT, RageT, HasteT;
        public int Guard;
        public bool Raged;
        /// <summary>灼烧：剩余时长、每秒伤害、下一跳计时、点火的好汉、是否附带60%减疗。破绽：剩余时长、受伤加成。</summary>
        public float BurnT, BurnDps, BurnTick, VulnT, Vuln;
        public HeroId BurnBy;
        public bool AntiHeal;
        public bool Diving => DiveT > 0;
        public bool Big => Def.Big;
        public bool Mounted => Def.Kind == EnemyKind.Cavalry || Def.Kind == EnemyKind.ChainHorse || Def.Kind == EnemyKind.HuYan || Def.Kind == EnemyKind.ZengKui;
    }

    public enum ShotKind { Arrow, Bomb, MiniBomb, Bolt, Lightning, Punch, Stone, Spear, Slam, Wind, Frost, Hammer, Ball, Fireball, Lasso, Slash, Beam, Boulder, Qi }

    public sealed class Shot
    {
        public int Id;
        public ShotKind Kind;
        public HeroId Hero;
        public V2 From, To;
        /// <summary>锁定的第一个目标的最近位置。穿透时 To 在他身后，索敌回退不能跟着落到点走。</summary>
        public V2 Aim;
        public float T, Dur;
        public float Damage, Radius;
        public int TargetId = -1;
        public int Pierce;
        public bool Crit, Ult, Split;
        /// <summary>弹道显示放大倍数：「爆发」打出的巨型一击、「最强」那一位的攻击。</summary>
        public float Scale = 1;
        public float Stun, StunChance, Knock, Slow;
        /// <summary>长枪往目标身后多贯穿的距离（3 星「长驱」）。</summary>
        public float Reach;
        /// <summary>飞石已经打过的敌人。</summary>
        public List<int> Hit;
    }

    public enum Ev
    {
        Summon, Merge, Move, SlotAdded, Fire, Hit, Damage, Kill, WallHit, Ult, WaveStart, BossComing, EliteComing,
        Rage, PorterKilled, PorterEscaped, Enhance, Victory, Defeat, Revive, Coin, Reels, BossSkill, Explode, UnitStun,
        /// <summary>精英、首领倒下掉出生辰纲。</summary>
        Treasure,
        /// <summary>这一波打空了，Value 是波次。</summary>
        WaveClear,
        /// <summary>合成出满星，弹出额外技能三选一。</summary>
        StarPick,
        Heal,
        /// <summary>寨主放技能：半圆里的人都打到，剑气朝最密的人群飞。</summary>
        LordSkill,
        /// <summary>辅助放技能。Slot 是施法者；祝福时 EnemyId 是被祝福的格子。</summary>
        Buff,
        /// <summary>寨墙首次掉到半血，杏黄旗震慑全场。Radius 是眩晕秒数。</summary>
        Rally,
        /// <summary>「爆发」：这一下打出巨型一击。Slot 是出手的格子。</summary>
        Surge,
        /// <summary>妖道作法给身边官军回血，Radius 是范围。</summary>
        EnemyHeal,
        /// <summary>藤牌挡下一击，Value 是剩余格挡次数。</summary>
        Guard,
        /// <summary>斥候闪身躲开，Pos 是闪到的位置。</summary>
        Blink,
        /// <summary>敢死刀手残血狂暴。</summary>
        Berserk,
        /// <summary>好汉集齐三词条自动触发本命奥义觉醒。</summary>
        Awaken,
    }

    public enum BossSkill { Hammer = 1, Charge, Summon, Ball, Shield, Drum, Leap, Ram, Volley }

    public struct BattleEvent
    {
        public Ev Type;
        public V2 Pos;
        public V2 From;
        public int Slot, Value, EnemyId;
        public HeroId Hero;
        public ShotKind Shot;
        public float Radius;
        public bool Crit;
    }

    public enum Phase { Running, Choosing, Reels, Defeat, Victory }

    /// <summary>生辰纲老虎机只出银两和好汉强化：不送好汉（会占满格子卡住合成）、不送免费强化次数、不修墙。</summary>
    public enum Reel { Silver, Perk }

    public sealed class Battle
    {
        public readonly HeroId[] Lineup;
        public readonly Loadout Lo;
        public readonly List<Slot> Slots = new List<Slot>();
        public readonly List<Enemy> Enemies = new List<Enemy>();
        public readonly List<Shot> Shots = new List<Shot>();
        public readonly List<Channel> Channels = new List<Channel>();
        public readonly List<BattleEvent> Events = new List<BattleEvent>();
        public readonly Dictionary<string, int> Perks = new Dictionary<string, int>();
        public readonly float[] DamageBy = new float[Defs.HeroCount];
        public readonly float[] UltTimer = new float[Defs.HeroCount];
        /// <summary>寨主技能：距下次释放的秒数、累计伤害、释放次数。</summary>
        public float LordT = Defs.LordFirstCast, LordDur = Defs.LordFirstCast, LordDamage;
        public int LordCasts;
        public readonly HashSet<EnemyKind> Seen = new HashSet<EnemyKind>();
        readonly float[,] _stat = new float[Defs.HeroCount, Defs.EffCount];
        readonly bool[] _starDone = new bool[Defs.HeroCount];
        readonly bool[] _ultOn = new bool[Defs.HeroCount];
        readonly bool[] _awakened = new bool[Defs.HeroCount];
        readonly float[] _bondRoleDmg = new float[Defs.RoleCount];
        float _roleSynergy, _bondElite, _bondCrit, _bondFlyCav;

        public Phase Phase = Phase.Running;
        public float Time;
        public readonly LevelDef Stage;
        public int Coins;
        /// <summary>已经记在账上、但银币还在飞，不能拿去召唤、强化。飞到就放开。</summary>
        public int HeldCoins { get; private set; }
        public int SpendableCoins => Math.Max(0, Coins - HeldCoins);

        /// <summary>银币离手：先从可花的钱里扣下，飞到银币点再放开。</summary>
        public void HoldCoins(int amount)
        {
            if (amount > 0) HeldCoins += amount;
        }

        public void ReleaseCoins(int amount)
        {
            if (amount > 0) HeldCoins = Math.Max(0, HeldCoins - amount);
        }

        public void FlushHeldCoins() => HeldCoins = 0;
        public float Wall, WallMax;
        /// <summary>Summons 只算花钱召唤（定价用）；Recruited 含老虎机送的（扩格用）。</summary>
        public int Summons, Recruited, Enhances, Kills;
        public int Wave;
        public bool Rage;
        public bool RevivedOnce, RerolledOnce, SwappedOnce, OfferTakeAll;
        /// <summary>玩家手动点击敌军设置的集火准星目标 ID（≤0 为自动索敌）。</summary>
        public int FocusEnemyId = -1;
        public PerkDef[] Choices;
        /// <summary>自检用：下一次强化固定发这几张，发完即清。正式对局保持空。</summary>
        public PerkDef[] ShotChoices;
        /// <summary>不为空时 Choices 是这位好汉的满星额外技能。</summary>
        public HeroId? StarPick;
        public int PendingReels, JackpotReels;
        public int PortersKilled, ElitesKilled, BossesKilled;
        /// <summary>本局各渠道银两产出统计（击杀、波次守城犒赏、首领阶段钱袋、生辰纲转盘），供遥测与数值中心核验。</summary>
        public int CoinsFromKills, CoinsFromWaves, CoinsFromBossPhase, CoinsFromReels;
        /// <summary>急攻（日行千里）、神兵（打造神兵）剩余时间与倍率。</summary>
        public float HasteT, HasteMul = 1f, ForgeT, ForgeV;
        /// <summary>辅助光环：攻速、伤害、冷却转速、击杀银两加成、每 4 秒利息比例。</summary>
        public float Aura, DmgAura, ChargeAura, CoinAura, Interest;
        float _interestT;
        int _highStars, _twoStarMerges, _treasureDropped;
        bool _owePity;

        readonly Rng _rng;
        int _nextId = 1;
        readonly List<(float at, EnemyKind kind, int gate)> _queue = new List<(float, EnemyKind, int)>();

        public Battle(int seed, HeroId[] lineup, LevelDef stage = null, Loadout lo = null)
        {
            _rng = new Rng(seed);
            Lineup = lineup;
            Lo = lo ?? Loadout.Plain(lineup);
            Stage = stage ?? Defs.Levels[0];
            Coins = Stage.StartCoins + Lo.StartCoins;
            Wall = WallMax = Stage.WallHp * Lo.WallMul;
            _roleSynergy = Defs.RoleSynergyBonus(lineup);
            foreach (var bd in Defs.ActiveBonds(lineup))
            {
                if (bd.RoleTarget.HasValue) _bondRoleDmg[(int)bd.RoleTarget.Value] += bd.Dmg;
                else for (int r = 0; r < _bondRoleDmg.Length; r++) _bondRoleDmg[r] += bd.Dmg;
                _bondElite += bd.Elite;
                _bondCrit += bd.Crit;
                _bondFlyCav += bd.FlyCav;
            }
            for (int i = 0; i < Layout.BaseSlots; i++) AddSlot();
            foreach (var id in Lo.StartPerks)
            {
                var p = Defs.Perk(id);
                if (p == null || Level(id) >= p.Max) continue;
                Perks[id] = Level(id) + 1;
            }
            RebuildStats();
        }

        public Rng Rng => _rng;
        public int SummonCost => Defs.SummonCost(Summons);
        public int EnhanceCost => Defs.EnhanceCost(Enhances);
        public int SummonsToNextSlot => Slots.Count >= Layout.MaxSlots ? 0 : Defs.SummonsPerSlot - Recruited % Defs.SummonsPerSlot;
        public float WaveProgress => Wave == 0 ? 0 : M.Clamp01(WaveAge / Defs.WaveTime);
        public bool AllSpawned => Wave >= Stage.Waves && _queue.Count == 0;
        /// <summary>这一波开始的时刻。清场后下一波会提前来，所以不能用 波次 × WaveTime 推算。</summary>
        public float WaveStartT;
        public float WaveAge => Time - WaveStartT;
        /// <summary>这一波的兵已经出完、场上也打空了：波与波之间的空档。</summary>
        public bool Lull => Wave > 0 && _queue.Count == 0 && Enemies.Count == 0;
        /// <summary>下一波还有几秒（已是最后一波为 -1）。</summary>
        public float NextWaveIn
        {
            get
            {
                if (Wave >= Stage.Waves) return -1f;
                float due = WaveStartT + Defs.WaveTime;
                if (Lull) due = Math.Min(due, Math.Max(WaveStartT + Defs.WaveMinTime, Time + Defs.ClearBreath - _clearT));
                return Math.Max(0f, due - Time);
            }
        }
        float _clearT;
        bool _cleared;
        public int Level(string perk) => Perks.TryGetValue(perk, out var n) ? n : 0;
        /// <summary>大招只有传说好汉有，要在强化三选一里抽到「大招」卡才解锁。</summary>
        public bool HasUlt(HeroId h) => _ultOn[(int)h];
        public bool IsAwakened(HeroId h) => _awakened[(int)h];
        public bool InLineup(HeroId h) => Array.IndexOf(Lineup, h) >= 0;
        public bool StarTaken(HeroId h) => _starDone[(int)h];

        /// <summary>这位好汉身上某种效果的总量：已选强化 × 等级 + 10 级被动 + 15 级「爆发」加成（20 级起抹除取舍卡负面减损）。</summary>
        public float Stat(HeroId h, Eff e) => _stat[(int)h, (int)e];

        void RebuildStats()
        {
            Array.Clear(_stat, 0, _stat.Length);
            foreach (var kv in Perks)
            {
                var p = Defs.Perk(kv.Key);
                if (p == null) continue;
                _stat[(int)p.Hero, (int)p.Eff] += p.V * kv.Value;
                if (p.Has2 && (p.V2 > 0 || Lo.Lv[(int)p.Hero] < Meta.NoPenaltyLv))
                    _stat[(int)p.Hero, (int)p.Eff2] += p.V2 * kv.Value;
            }
            for (int h = 0; h < Defs.HeroCount; h++)
            {
                var opt = Meta.OptPerk((HeroId)h, 1);
                if (opt != null && Level(opt.Id) > 0 && Lo.Lv[h] >= Meta.SurgePlusLv)
                    _stat[h, (int)opt.Eff] += opt.Eff == Eff.Surge ? Defs.SurgePlusChance : opt.V;
                if (!Lo.Passive[h]) continue;
                var d = Defs.Heroes[h];
                _stat[h, (int)d.PassiveEff] += d.PassiveV;
            }
        }

        void Emit(Ev t, V2 pos = default, int slot = -1, int value = 0, HeroId hero = HeroId.HuaRong)
            => Events.Add(new BattleEvent { Type = t, Pos = pos, Slot = slot, Value = value, Hero = hero });

        Slot AddSlot()
        {
            var s = new Slot { Index = Slots.Count, Pos = Layout.SlotPos(Slots.Count) };
            Slots.Add(s);
            return s;
        }

        Slot SlotOf(HeroId h)
        {
            Slot best = null;
            foreach (var s in Slots)
                if (s.Unit != null && s.Unit.Hero == h && (best == null || s.Unit.Star > best.Unit.Star)) best = s;
            return best;
        }

        // ---------------- 玩家操作 ----------------

        public bool HasEmptySlot()
        {
            foreach (var s in Slots) if (s.Unit == null) return true;
            return false;
        }

        public bool CanSummon => Phase == Phase.Running && SpendableCoins >= SummonCost && HasEmptySlot();

        public Slot Summon(bool free = false, int star = 1)
        {
            if (Phase != Phase.Running && !free) return null;
            if (!HasEmptySlot()) return null;
            if (!free)
            {
                if (SpendableCoins < SummonCost) return null;
                Coins -= SummonCost;
            }
            var empty = new List<Slot>();
            foreach (var s in Slots) if (s.Unit == null) empty.Add(s);
            var slot = empty[_rng.Int(empty.Count)];
            var hero = Lineup[_rng.Int(Lineup.Length)];
            bool wild = hero == HeroId.ShiQian && star < 4 && _rng.Chance(0.28f);
            float firstCd = Defs.Hero(hero).Buff.HasValue ? 2.2f : 0.8f;
            slot.Unit = new Unit { Id = _nextId++, Hero = hero, Star = star, Cd = firstCd, Wild = wild };
            if (!free) Summons++;
            Recruited++;
            Emit(Ev.Summon, slot.Pos, slot.Index, star, slot.Unit.Hero);
            if (Recruited % Defs.SummonsPerSlot == 0 && Slots.Count < Layout.MaxSlots)
            {
                var ns = AddSlot();
                Emit(Ev.SlotAdded, ns.Pos, ns.Index);
            }
            return slot;
        }

        public bool CanMerge(int a, int b)
        {
            if (a == b || a < 0 || b < 0 || a >= Slots.Count || b >= Slots.Count) return false;
            var ua = Slots[a].Unit;
            var ub = Slots[b].Unit;
            return ua != null && ub != null && ua.Star == ub.Star && ua.Star < 4
                && (ua.Hero == ub.Hero || ua.Wild || ub.Wild);
        }

        /// <summary>场上某格是否存在至少一个可合成配对（驱动脚下常驻金色呼吸光圈）。</summary>
        public bool HasMergePartner(int slot)
        {
            if (slot < 0 || slot >= Slots.Count || Slots[slot].Unit == null || Slots[slot].Unit.Star >= 4) return false;
            for (int j = 0; j < Slots.Count; j++)
                if (j != slot && CanMerge(slot, j)) return true;
            return false;
        }

        /// <summary>梁山换将令：每局 1 次，将场上任意 ≥2 星好汉当场重随为阵容中的同星输出位（根治高星辅助卡手痛点）。</summary>
        public bool CanSwapUnit(int slot)
        {
            if (Phase != Phase.Running || SwappedOnce || slot < 0 || slot >= Slots.Count) return false;
            var u = Slots[slot].Unit;
            if (u == null || u.Star < 2) return false;
            foreach (var h in Lineup) if (Defs.Hero(h).Carry && h != u.Hero) return true;
            return false;
        }

        public bool SwapUnit(int slot)
        {
            if (!CanSwapUnit(slot)) return false;
            var s = Slots[slot];
            int star = s.Unit.Star;
            var cur = s.Unit.Hero;
            var pool = new List<HeroId>();
            foreach (var h in Lineup) if (Defs.Hero(h).Carry && h != cur) pool.Add(h);
            if (pool.Count == 0) return false;
            var next = pool[_rng.Int(pool.Count)];
            SwappedOnce = true;
            s.Unit = new Unit { Id = _nextId++, Hero = next, Star = star, Cd = 0.2f, Burst = true };
            Emit(Ev.Merge, s.Pos, slot, star, next);
            if (star == 4 && !_starDone[(int)next]) OpenStar(next, s);
            return true;
        }

        int CarryUnitsOnField(int excludeSlot = -1)
        {
            int n = 0;
            for (int i = 0; i < Slots.Count; i++)
                if (i != excludeSlot && Slots[i].Unit != null && Slots[i].Unit.Def.Carry) n++;
            return n;
        }

        /// <summary>
        /// 合成结果随机。保底：开局前几次合 2 星若场上输出位不足则防变辅助；第一个三星以上若是辅助，下一个三星以上必出输出位。
        /// </summary>
        HeroId MergeResult(int star, int targetSlot = -1)
        {
            var h = Lineup[_rng.Int(Lineup.Length)];
            if (star == 2)
            {
                _twoStarMerges++;
                var cb = Balance.Current.Combat;
                if (!Defs.Hero(h).Carry && _twoStarMerges <= cb.EarlyCarryMergeProtectCount && CarryUnitsOnField(targetSlot) < cb.EarlyCarryMinOnField)
                {
                    var carries = new List<HeroId>();
                    foreach (var x in Lineup) if (Defs.Hero(x).Carry) carries.Add(x);
                    if (carries.Count > 0) h = carries[_rng.Int(carries.Count)];
                }
                return h;
            }
            if (star < 3) return h;
            if (_owePity && !Defs.Hero(h).Carry)
            {
                var carries = new List<HeroId>();
                foreach (var x in Lineup) if (Defs.Hero(x).Carry) carries.Add(x);
                if (carries.Count > 0) h = carries[_rng.Int(carries.Count)];
            }
            _highStars++;
            if (_highStars == 1 && !Defs.Hero(h).Carry) _owePity = true;
            else if (Defs.Hero(h).Carry) _owePity = false;
            return h;
        }

        /// <summary>拖 a 到 b：同名同星合成，b 变成随机一位上阵好汉的高一星；空格就挪过去；不同的两格互换。</summary>
        public bool Drop(int a, int b)
        {
            if (Phase != Phase.Running || a == b || a < 0 || b < 0 || a >= Slots.Count || b >= Slots.Count) return false;
            var sa = Slots[a];
            var sb = Slots[b];
            if (sa.Unit == null) return false;
            if (CanMerge(a, b))
            {
                int star = sb.Unit.Star + 1;
                var heroA = sa.Unit.Hero;
                var heroB = sb.Unit.Hero;
                bool supMerge = sa.Unit.Def.Kind == Role.Support || sb.Unit.Def.Kind == Role.Support;
                var supHero = sa.Unit.Def.Kind == Role.Support ? heroA : heroB;
                sa.Unit = null;
                var mergedHero = MergeResult(star, b);
                bool wild = mergedHero == HeroId.ShiQian && star < 4 && _rng.Chance(0.28f);
                sb.Unit = new Unit { Id = _nextId++, Hero = mergedHero, Star = star, Cd = 0.25f, Burst = true, Wild = wild };
                MergeShockwave(sb.Pos, star);
                Emit(Ev.Merge, sb.Pos, b, star, sb.Unit.Hero);
                // 反痛点：辅助好汉参与合成时当场爆出即时收益，合掉辅助永远不亏！
                if (supMerge)
                {
                    int supBonus = 14 * star;
                    Coins += supBonus;
                    Emit(Ev.Coin, sb.Pos, b, supBonus, supHero);
                    if (supHero == HeroId.AnDaoquan)
                        HealWall(WallMax * 0.06f * star, sb.Pos, supHero);
                    else if (supHero == HeroId.TangLong)
                    {
                        ForgeT = Math.Max(ForgeT, 5f);
                        ForgeV = Math.Max(ForgeV, 0.35f);
                    }
                    else
                    {
                        sb.Unit.BlessN = 4;
                        sb.Unit.BlessMul = 1.6f;
                        sb.Unit.BlessWait = 0f;
                        Events.Add(new BattleEvent { Type = Ev.Buff, Pos = sb.Pos, Slot = b, EnemyId = b, Value = 4, Hero = supHero });
                    }
                }
                foreach (var h in Lineup)
                {
                    int coin = (int)Stat(h, Eff.Coin);
                    if (coin <= 0 || SlotOf(h) == null) continue;
                    Coins += coin;
                    Emit(Ev.Coin, sb.Pos, b, coin, h);
                }
                if (star == 4 && !_starDone[(int)sb.Unit.Hero]) OpenStar(sb.Unit.Hero, sb);
                return true;
            }
            var t = sb.Unit;
            sb.Unit = sa.Unit;
            sa.Unit = t;
            Emit(Ev.Move, sb.Pos, b);
            return true;
        }

        void OpenStar(HeroId h, Slot at)
        {
            _starDone[(int)h] = true;
            var pool = Defs.PerksOf(h, true);
            pool.RemoveAll(p => Level(p.Id) >= p.Max || UltLocked(p));
            if (pool.Count == 0) return;
            Choices = pool.ToArray();
            StarPick = h;
            Phase = Phase.Choosing;
            Emit(Ev.StarPick, at.Pos, at.Index, 4, h);
        }

        /// <summary>合成冲击（对标蔚蓝星球应急合击）：近墙敌军被震退微晕，满星觉醒时全防线震退救急。</summary>
        void MergeShockwave(V2 at, int star)
        {
            bool full = star >= 4;
            float maxY = Layout.StopY + (full ? 3.2f : 2.1f);
            float maxX = full ? 99f : 1.75f + 0.3f * star;
            float knock = full ? 0.9f : 0.45f + 0.12f * star;
            float stun = full ? 0.65f : 0.3f;
            foreach (var e in Enemies)
            {
                if (e.Dead || e.Escaped || e.Pos.Y > maxY || Math.Abs(e.Pos.X - at.X) > maxX) continue;
                if (!e.Def.IsBoss) e.Stun = Math.Max(e.Stun, e.Big ? stun * 0.5f : stun);
                ApplyKnock(e, knock);
            }
        }

        public bool CanEnhance => Phase == Phase.Running && SpendableCoins >= EnhanceCost && RollChoices(false) != null;

        public bool Enhance()
        {
            if (Phase != Phase.Running || SpendableCoins < EnhanceCost) return false;
            bool forced = ShotChoices != null && ShotChoices.Length > 0;
            var c = forced ? ShotChoices : RollChoices(true);
            ShotChoices = null;
            if (c == null) return false;
            Coins -= EnhanceCost;
            Enhances++;
            Choices = c;
            StarPick = null;
            OfferTakeAll = forced ? false : _rng.Chance(0.18f);
            Phase = Phase.Choosing;
            return true;
        }

        public void Reroll()
        {
            if (Phase != Phase.Choosing || StarPick.HasValue) return;
            RerolledOnce = true;
            Choices = RollChoices(true) ?? Choices;
        }

        public void Pick(int i)
        {
            if (Phase != Phase.Choosing || Choices == null || i < 0 || i >= Choices.Length) return;
            Grant(Choices[i]);
            Choices = null;
            StarPick = null;
            OfferTakeAll = false;
            Phase = Phase.Running;
        }

        /// <summary>鸿运三选一「全都要」：一次性收下当前全部 3 张强化卡。</summary>
        public void PickAll()
        {
            if (Phase != Phase.Choosing || Choices == null || StarPick.HasValue) return;
            var all = Choices;
            Choices = null;
            OfferTakeAll = false;
            foreach (var p in all) Grant(p);
            Phase = Phase.Running;
        }

        void Grant(PerkDef p)
        {
            Perks[p.Id] = Level(p.Id) + 1;
            if (p.Ult)
            {
                _ultOn[(int)p.Hero] = true;
                UltTimer[(int)p.Hero] = 1.5f;
            }
            RebuildStats();
            Emit(Ev.Enhance, default, -1, p.Ult ? 2 : p.Star ? 1 : 0, p.Hero);
            if (!p.Ult && !p.Star) CheckAwaken(p.Hero);
        }

        /// <summary>2026 标杆「三合一自动合成奥义」：集齐质变+进阶+任一专属（3级）或累计4级常规词条，免费自动觉醒名场面奥义！</summary>
        void CheckAwaken(HeroId h)
        {
            if (_awakened[(int)h]) return;
            int total = 0;
            bool hasMorph = false, hasAdv = false;
            foreach (var kv in Perks)
            {
                if (kv.Value <= 0) continue;
                var q = Defs.Perk(kv.Key);
                if (q == null || q.Hero != h || q.Star || q.Ult) continue;
                total += kv.Value;
                if (q.Kind == PerkKind.Morph) hasMorph = true;
                if (q.Kind == PerkKind.Adv) hasAdv = true;
            }
            if ((hasMorph && hasAdv && total >= 3) || total >= 4)
            {
                _awakened[(int)h] = true;
                var sl = SlotOf(h);
                Emit(Ev.Awaken, sl?.Pos ?? default, sl?.Index ?? -1, total, h);
            }
        }

        /// <summary>只强化大招的卡，在大招卡抽到之前不出（辅助的「效果」强化同时管技能，不受限）。</summary>
        bool UltLocked(PerkDef p) =>
            !p.Ult && (p.Eff == Eff.UltPow || p.Eff == Eff.UltCd) && Defs.Hero(p.Hero).Kind != Role.Support && !HasUlt(p.Hero);

        PerkDef[] RollChoices(bool consume)
        {
            var pool = new List<PerkDef>();
            foreach (var p in Defs.Perks)
            {
                if (p.Star || Level(p.Id) >= p.Max || !InLineup(p.Hero) || UltLocked(p)) continue;
                if (p.Ult && (SlotOf(p.Hero) == null || Lo.Lv[(int)p.Hero] < Meta.UltLv)) continue;
                if (p.Opt == 1 && Lo.Lv[(int)p.Hero] < Meta.SurgeLv || p.Opt == 2 && Lo.Lv[(int)p.Hero] < Meta.TopLv) continue;
                if (p.Req != null && Level(p.Req) == 0 || GroupTaken(p)) continue;
                pool.Add(p);
            }
            if (pool.Count == 0) return null;
            if (!consume) return new PerkDef[0];

            // 伪随机发牌保护：前两次低费强化若城墙上已有至少 2 名好汉，只从已在场好汉中出牌，开局绝不空抓。
            if (Enhances < 2)
            {
                var onField = pool.FindAll(p => SlotOf(p.Hero) != null);
                if (onField.Count >= 3) pool = onField;
            }
            var pick = new List<PerkDef>();
            while (pick.Count < 3 && pool.Count > 0)
            {
                float sum = 0;
                foreach (var p in pool) sum += Weight(p);
                float r = _rng.F() * sum;
                int k = 0;
                for (; k < pool.Count - 1; k++)
                {
                    r -= Weight(pool[k]);
                    if (r <= 0) break;
                }
                pick.Add(pool[k]);
                pool.RemoveAt(k);
            }
            return pick.ToArray();
        }

        /// <summary>同一好汉同组的取舍卡（重手 / 快手）拿了一张，另一张不再出。</summary>
        public bool GroupTaken(PerkDef p)
        {
            if (p.Group == null) return false;
            foreach (var kv in Perks)
            {
                if (kv.Value <= 0 || kv.Key == p.Id) continue;
                var q = Defs.Perk(kv.Key);
                if (q != null && q.Hero == p.Hero && q.Group == p.Group) return true;
            }
            return false;
        }

        /// <summary>场上星级越高的好汉权重越高；已拿满 5 级词条后适度收敛权重；有控制队友时提高联动卡权重，残血时提高翻盘卡权重。</summary>
        float Weight(PerkDef p)
        {
            var s = SlotOf(p.Hero);
            int best = s?.Unit.Star ?? 0;
            float w = p.Weight * (best == 0 ? 0.28f : 1f + best * 0.3f);
            int have = 0;
            foreach (var kv in Perks)
                if (kv.Value > 0 && Defs.Perk(kv.Key)?.Hero == p.Hero) have += kv.Value;
            if (have >= 5) w *= 0.62f;
            if (p.Eff == Eff.Shatter && HasControlInLineup()) w *= 1.45f;
            if (p.Eff == Eff.Resonance && RoleUnitsOnField(Defs.Hero(p.Hero).Kind) >= 2) w *= 1.45f;
            if (p.Eff == Eff.Exec && Wall < WallMax * 0.65f) w *= 1.6f;
            return w;
        }

        bool HasControlInLineup()
        {
            foreach (var h in Lineup)
            {
                var d = Defs.Hero(h);
                if (d.Kind == Role.Control || d.Slow > 0 || d.Stun > 0 || d.UltStun > 0) return true;
            }
            return false;
        }

        public int RoleUnitsOnField(Role r)
        {
            int n = 0;
            foreach (var s in Slots) if (s.Unit != null && s.Unit.Def.Kind == r) n++;
            return Math.Min(6, n);
        }

        /// <summary>逢 5、逢 10 的首领关升级为 5 格黄金生辰纲老虎机，常规关为 4 格。</summary>
        public int ReelCount => Stage != null && Stage.IsChapterBoss
            ? Balance.Current.Economy.ReelBossCells
            : Balance.Current.Economy.ReelNormalCells;

        /// <summary>
        /// 老虎机（对标《永远的蔚蓝星球》真实随机摇奖）：
        /// 常规 4 格、首领关 5 格，每格独立随机出银两或好汉头像（不再强制首领必出全同色）。
        /// 1~2 格好汉汇总发 1 条对应好汉强化，≥3 格好汉最多发 2 条强化（严控上限绝不一次爆多条飞天）；全银两按 ReelJackpotMul 翻倍。
        /// </summary>
        public Reel[] SpinReels(bool forceJackpot = false)
        {
            if (Phase != Phase.Reels) return null;
            int cnt = ReelCount;
            var r = new Reel[cnt];
            bool jackpot = forceJackpot || JackpotReels > 0 || _rng.Chance(Balance.Current.Economy.ReelNaturalJackpotChance);
            Reel Roll() => _rng.Chance(PerkCellChance) ? Reel.Perk : Reel.Silver;
            var first = Roll();
            for (int i = 0; i < cnt; i++) r[i] = jackpot ? first : Roll();
            int perkCells = Array.FindAll(r, x => x == Reel.Perk).Length;
            int want = perkCells <= 0 ? 0
                : perkCells <= 2 ? Math.Min(1, ReelPerkMax)
                : (jackpot && first == Reel.Perk ? ReelPerkJackpot : Math.Min(2, ReelPerkMax));
            var pool = want > 0 ? RollChoices(true) : null;
            if (pool != null && pool.Length > 1 && perkCells >= 2)
                Array.Sort(pool, (a, b) => ReelPerkPriority(b).CompareTo(ReelPerkPriority(a)));
            int got = pool == null ? 0 : Math.Min(want, pool.Length);
            ReelPerks = new PerkDef[got];
            for (int i = 0; i < got; i++) ReelPerks[i] = pool[i];
            // 强化抽不出来（都满级了）的格子折成银两。
            ReelExtraSilver = (want - got) * ReelSilver;

            ReelCellHeroes = new HeroId[cnt];
            int seenPerk = 0;
            for (int i = 0; i < cnt; i++)
            {
                if (r[i] != Reel.Perk || got == 0)
                {
                    ReelCellHeroes[i] = Lineup[0];
                    continue;
                }
                int pickIdx = got == 1 ? 0 : (seenPerk < perkCells - 1 ? 0 : 1);
                ReelCellHeroes[i] = ReelPerks[Math.Min(pickIdx, got - 1)].Hero;
                seenPerk++;
            }
            return r;
        }

        static int ReelPerkPriority(PerkDef p)
        {
            if (p == null) return 0;
            if (p.Ult) return 4;
            if (p.Kind == PerkKind.Adv) return 3;
            if (p.Kind == PerkKind.Morph) return 2;
            return 1;
        }

        public static float PerkCellChance => Balance.Current.Economy.ReelPerkCellChance;
        public static int ReelPerkMax => Balance.Current.Economy.ReelPerkMax;
        public static int ReelPerkJackpot => Balance.Current.Economy.ReelPerkJackpot;
        public bool NextIsJackpot => JackpotReels > 0;
        /// <summary>每格银两：收敛尾盘泡沫，够玩家爽快连点 1 强化 + 1~2 召唤而不冲垮经济约束。</summary>
        public int ReelSilver
        {
            get
            {
                var eco = Balance.Current.Economy;
                return Math.Max(0, eco.ReelSilverBase + Wave * eco.ReelSilverPerWave);
            }
        }
        /// <summary>这一转定下的强化。</summary>
        public PerkDef[] ReelPerks { get; private set; } = new PerkDef[0];
        /// <summary>每个滚轮格对应的好汉头像（仅当该格为 Reel.Perk 时使用，与上方发出的强化卡严格一一对应）。</summary>
        public HeroId[] ReelCellHeroes { get; private set; } = new HeroId[0];
        public int ReelExtraSilver { get; private set; }

        public static bool IsAllSame(Reel[] r)
        {
            if (r == null || r.Length == 0) return false;
            for (int i = 1; i < r.Length; i++) if (r[i] != r[0]) return false;
            return true;
        }

        /// <summary>是否触发「超爽!!!」高光（全格相同、双强化大运、或 5 格凑出三银两+对子好汉满堂红）。</summary>
        public static bool IsBigReelWin(Reel[] r)
        {
            if (r == null || r.Length == 0) return false;
            if (IsAllSame(r)) return true;
            int perkCells = Array.FindAll(r, x => x == Reel.Perk).Length;
            int silverCells = r.Length - perkCells;
            return perkCells >= 3 || (perkCells >= 2 && silverCells >= 3);
        }

        /// <summary>这一转一共给多少银两。</summary>
        public int ReelSilverOf(Reel[] r)
        {
            bool all = IsAllSame(r);
            int n = Array.FindAll(r, x => x == Reel.Silver).Length;
            float mul = all ? Balance.Current.Economy.ReelJackpotMul : (n >= 3 ? 1.55f : n == 2 ? 1.2f : 1f);
            return (int)Math.Round(n * ReelSilver * mul) + ReelExtraSilver;
        }

        public void ApplyReels(Reel[] r)
        {
            int silver = ReelSilverOf(r);
            Coins += silver;
            CoinsFromReels += silver;
            foreach (var p in ReelPerks) Grant(p);
            ReelPerks = new PerkDef[0];
            ReelCellHeroes = new HeroId[0];
            ReelExtraSilver = 0;
            PendingReels = Math.Max(0, PendingReels - 1);
            if (JackpotReels > 0) JackpotReels--;
            Phase = Phase.Running;
        }

        /// <summary>GM 跳过这一局：满血三星，清掉场上的兵和弹道，走真正的胜利结算。</summary>
        public void ForceWin()
        {
            if (Phase == Phase.Victory || Phase == Phase.Defeat) return;
            Wall = WallMax;
            Enemies.Clear();
            Shots.Clear();
            Channels.Clear();
            PendingReels = 0;
            Phase = Phase.Victory;
            Emit(Ev.Victory);
        }

        /// <summary>GM 直接战败：寨墙归零，停在当前波次，走真正的失败结算。</summary>
        public void ForceLose()
        {
            if (Phase == Phase.Victory || Phase == Phase.Defeat) return;
            Wall = 0;
            Shots.Clear();
            Channels.Clear();
            PendingReels = 0;
            if (Wave < 1) Wave = 1;
            Phase = Phase.Defeat;
            Emit(Ev.Defeat);
        }

        public void Revive()
        {
            if (Phase != Phase.Defeat || RevivedOnce) return;
            RevivedOnce = true;
            Wall = WallMax * 0.5f;
            foreach (var e in Enemies)
            {
                if (e.Pos.Y < Layout.StopY + 2.5f)
                {
                    e.Pos.Y = Math.Min(Layout.SpawnY, e.Pos.Y + (e.Big ? 1.2f : 3f));
                    e.Attacking = false;
                    e.Stun = 1.2f;
                }
            }
            Phase = Phase.Running;
            Emit(Ev.Revive);
        }

        // ---------------- 推进 ----------------

        public void Update(float dt)
        {
            if (Phase != Phase.Running) return;
            Time += dt;
            if (HasteT > 0) { HasteT -= dt; if (HasteT <= 0) HasteMul = 1f; }
            if (ForgeT > 0) ForgeT -= dt;
            UpdateAuras(dt);
            UpdateWaves(dt);
            UpdateEnemies(dt);
            UpdateDots(dt);
            UpdateUnits(dt);
            UpdateChannels(dt);
            UpdateUlts(dt);
            UpdateLord(dt);
            UpdateShots(dt);
            Enemies.RemoveAll(e => e.Dead || e.Escaped);

            if (Wall <= 0)
            {
                Wall = 0;
                Phase = Phase.Defeat;
                Emit(Ev.Defeat);
                return;
            }
            if (PendingReels > 0)
            {
                Phase = Phase.Reels;
                Emit(Ev.Reels);
                return;
            }
            if (AllSpawned && Enemies.Count == 0 && Shots.Count == 0 && Channels.Count == 0)
            {
                Phase = Phase.Victory;
                Emit(Ev.Victory);
            }
        }

        void UpdateAuras(float dt)
        {
            float spd = 0, dmg = 0, charge = 0, coin = 0, interest = 0;
            Slot banker = null;
            foreach (var s in Slots)
            {
                var u = s.Unit;
                if (u == null || u.Stun > 0) continue;
                var d = u.Def;
                if (d.Aura == AuraKind.None) continue;
                float v = d.AuraV * u.Star * (1f + Stat(u.Hero, Eff.Aura));
                switch (d.Aura)
                {
                    case AuraKind.Speed: spd += v; break;
                    case AuraKind.Dmg: dmg += v; break;
                    case AuraKind.Charge: charge += v; break;
                    case AuraKind.Coin: coin += v; break;
                    case AuraKind.Interest: interest += v; banker = s; break;
                }
            }
            Aura = Math.Min(0.5f, spd);
            DmgAura = Math.Min(0.4f, dmg);
            ChargeAura = Math.Min(0.3f, charge);
            CoinAura = Math.Min(1f, coin);
            Interest = Math.Min(0.08f, interest);
            if (Interest <= 0 || Wave == 0) { _interestT = 0; return; }
            _interestT += dt;
            if (_interestT < 4f) return;
            _interestT -= 4f;
            int gain = M.Clamp((int)Math.Round(Coins * Interest), 4, 30);
            Coins += gain;
            Emit(Ev.Coin, banker.Pos, banker.Index, gain, banker.Unit.Hero);
        }

        /// <summary>
        /// 一波最长 WaveTime 秒；兵出完、场上打空后先报「击退」，喘 ClearBreath 秒就提前来下一波（但一波至少 WaveMinTime 秒）。
        /// </summary>
        void UpdateWaves(float dt)
        {
            if (Wave == 0)
            {
                Wave = 1;
                WaveStartT = 0f;
                StartWave(1);
            }
            if (Lull)
            {
                if (!_cleared)
                {
                    _cleared = true;
                    if (Wave < Stage.Waves) Emit(Ev.WaveClear, default, -1, Wave);
                }
                _clearT += dt;
            }
            else _clearT = 0f;
            bool due = WaveAge >= Defs.WaveTime || Lull && _clearT >= Defs.ClearBreath && WaveAge >= Defs.WaveMinTime;
            if (due && Wave < Stage.Waves)
            {
                if (Stage.Mode != StageMode.Escort)
                {
                    int wBonus = Defs.WaveClearBonus(Wave);
                    if (wBonus > 0)
                    {
                        Coins += wBonus;
                        CoinsFromWaves += wBonus;
                        Emit(Ev.Coin, Layout.LordOrigin, -1, wBonus);
                    }
                }
                Wave++;
                WaveStartT = Time;
                _clearT = 0f;
                _cleared = false;
                StartWave(Wave);
            }
            for (int i = _queue.Count - 1; i >= 0; i--)
            {
                if (_queue[i].at > Time) continue;
                Spawn(_queue[i].kind, _queue[i].gate);
                _queue.RemoveAt(i);
            }
            foreach (var p in _bruteDrops)
                for (int k = 0; k < 3; k++)
                {
                    float bx = Layout.RoadMaxX(p.Y + 0.3f, 0.95f);
                    var s = Spawn(EnemyKind.Soldier, -1, new V2(M.Clamp(p.X + (k - 1) * 0.55f, -bx, bx), p.Y + 0.3f));
                    s.LaneX = M.Clamp(p.X + (k - 1) * 0.8f, -bx, bx);
                }
            _bruteDrops.Clear();
            foreach (var p in _giantBruteDrops)
                for (int k = 0; k < 4; k++)
                {
                    float bx = Layout.RoadMaxX(p.Y + 0.35f, 1.0f);
                    float ox = (k - 1.5f) * 0.52f;
                    var s = Spawn(EnemyKind.Berserker, -1, new V2(M.Clamp(p.X + ox, -bx, bx), p.Y + 0.35f));
                    s.LaneX = M.Clamp(p.X + ox * 1.35f, -bx, bx);
                }
            _giantBruteDrops.Clear();
        }

        /// <summary>力士与背嵬巨力士倒下的位置，下一帧从背篓里跳出步卒/敢死刀手（不能在伤害结算中途改敌人列表）。</summary>
        readonly List<V2> _bruteDrops = new List<V2>();
        readonly List<V2> _giantBruteDrops = new List<V2>();

        public EnemyKind EliteKind(int w)
        {
            int k = Array.IndexOf(Stage.EliteWaves, w);
            var kinds = Stage.EliteKinds;
            return kinds[(k < 0 ? 0 : k) % kinds.Length];
        }

        void StartWave(int w)
        {
            float t0 = Time;
            var troops = Defs.WaveTroops(Stage, w, _rng);
            // 整波怪散着持续往下走（尤其前几波均匀散开铺满石板路，杜绝一波出完后中间空一大截断档）。
            int total = troops.Count;
            float startOff = 0.35f;
            float endOff = Math.Max(startOff + 2f, Defs.WaveTime - 1.6f);
            float step = total <= 1 ? 0f : (endOff - startOff) / (total - 1f);
            float jitter = Math.Min(0.65f, step * 0.36f);
            for (int i = 0; i < total; i++)
            {
                var kind = troops[i];
                float at = t0 + startOff + i * step + _rng.Range(-jitter, jitter);
                int gate = (i + w) % 2;
                if (_rng.Chance(0.28f)) gate = 1 - gate;
                int pack = kind == EnemyKind.Hound ? 2 : 1;
                for (int k = 0; k < pack; k++) _queue.Add((Math.Max(t0 + 0.1f, at + k * 0.32f), kind, gate));
            }
            if (Array.IndexOf(Stage.EliteWaves, w) >= 0)
            {
                var ek = EliteKind(w);
                bool wave4Lead = Stage.BossWave == 0 && Stage.Mode == StageMode.Main && w == Balance.Current.WaveStage.MainBossWave;
                _queue.Add((t0 + (wave4Lead ? 0.8f : 1.0f), ek, wave4Lead ? w % 2 : _rng.Int(2)));
                Events.Add(new BattleEvent { Type = Ev.EliteComing, Slot = (int)ek, Value = w });
            }
            if (Array.IndexOf(Stage.PorterWaves, w) >= 0)
                for (int i = 0; i < Stage.PorterCount; i++)
                    _queue.Add((t0 + 3f + i * 2.2f, EnemyKind.Porter, _rng.Int(2)));
            if (w == Stage.BossWave)
            {
                _queue.Add((t0 + 0.8f, Stage.BossKind, w % 2));
                Events.Add(new BattleEvent { Type = Ev.BossComing, Slot = (int)Stage.BossKind, Value = w });
            }
            if (w == Stage.RageWave)
            {
                Rage = true;
                Emit(Ev.Rage, default, -1, w);
            }
            _queue.Sort((x, y) => y.at.CompareTo(x.at));
            Emit(Ev.WaveStart, default, -1, w);
        }

        Enemy Spawn(EnemyKind kind, int gate, V2? at = null)
        {
            var def = Defs.Enemy(kind);
            bool stageLead = def.IsBoss || (!at.HasValue && def.Rank == EnemyRank.Elite && Stage.BossWave == 0
                && Stage.Mode == StageMode.Main && Wave == Balance.Current.WaveStage.MainBossWave);
            float tough = def.Big ? 1f : Defs.Tough(Wave);
            float hp = def.Hp * Defs.HpScale(Wave) * tough * Stage.HpMul * (stageLead ? Stage.BossMul : 1f);
            int g = gate < 0 ? _rng.Int(2) : gate;
            float gx = Layout.GateX[g];
            float rMax = Math.Max(0.8f, Layout.RoadHalfW - def.Size * 0.22f);
            float lane = stageLead
                ? _rng.Range(-0.35f, 0.35f)
                : g == 0 ? _rng.Range(-rMax, Math.Min(0.95f, rMax)) : _rng.Range(-Math.Min(0.95f, rMax), rMax);
            var e = new Enemy
            {
                Id = _nextId++, Def = def, Hp = hp, MaxHp = hp, Tough = tough,
                Pos = at ?? new V2(gx + _rng.Range(-0.18f, 0.18f), Layout.SpawnY + _rng.Range(0.08f, 0.32f)),
                LaneX = lane,
                AtkCd = _rng.Range(0.2f, 1f),
                SkillT = 4f,
                IsStageLeader = stageLead,
            };
            if (kind == EnemyKind.GaoQiu) e.Shield = hp * 0.2f;
            if (kind == EnemyKind.FireCart) e.Shield = hp * 0.12f;
            if (kind == EnemyKind.Rattan || kind == EnemyKind.IronPagoda) e.Guard = 2;
            if (kind == EnemyKind.Diver || kind == EnemyKind.WaterChief || kind == EnemyKind.Taoist || kind == EnemyKind.HighPriest)
                e.AbilT = _rng.Range(1f, 3f);
            Seen.Add(kind);
            Enemies.Add(e);
            return e;
        }

        /// <summary>这个敌人贴墙后每秒打掉多少寨墙（狂暴已算进去）。</summary>
        public float EnemyWallDps(Enemy e) => e.Def.WallDps * e.Tough * (Rage ? Balance.Current.WaveStage.RageAtkMul : 1f) * Stage.AtkMul;

        /// <summary>本关核心怪物（控制在 3~4 种，新兵种逐关解锁，绝不一屏塞满六七种）。</summary>
        public List<EnemyKind> StageRoster()
        {
            var list = new List<EnemyKind>();
            void Add(EnemyKind k) { if (!list.Contains(k)) list.Add(k); }
            Add(EnemyKind.Soldier);
            var mix = new List<TroopMix>(Stage.Troops);
            mix.Sort((a, b) => a.From != b.From ? a.From.CompareTo(b.From) : b.Base.CompareTo(a.Base));
            foreach (var m in mix) if (m.From <= Stage.Waves) Add(m.Kind);
            if (Stage.PorterWaves.Length > 0) Add(EnemyKind.Porter);
            else if (Stage.EliteWaves.Length > 0)
            {
                foreach (var k in Stage.EliteKinds) Add(k);
            }
            if (Stage.BossWave > 0 && Stage.BossWave <= Stage.Waves)
            {
                if (Stage.BossKind == EnemyKind.HeTao && Stage.No >= 5) Add(EnemyKind.Diver);
                if (Stage.BossKind == EnemyKind.HuYan) Add(EnemyKind.Cavalry);
                Add(Stage.BossKind);
            }
            return list;
        }

        float EnemySpeed(Enemy e)
        {
            float pace = e.Def.IsBoss ? Defs.BossPace : (e.IsStageLeader ? Math.Min(1f, 0.295f / Math.Max(0.12f, e.Def.Speed) * Defs.BossPace) : 1f);
            float s = e.Def.Speed * (Rage ? Balance.Current.WaveStage.RageSpeedMul : 1f) * pace;
            if (e.SlowT > 0) s *= 0.55f;
            if (e.ChargeT > 0) s *= 5f;
            if (e.Def.Kind == EnemyKind.ShiWen && e.Hp < e.MaxHp * 0.5f) s *= 1.3f;
            if (e.RageT > 0) s *= 2.5f;
            if (e.HasteT > 0) s *= 1.2f;
            return s;
        }

        void UpdateEnemies(float dt)
        {
            float atkMul = (Rage ? Balance.Current.WaveStage.RageAtkMul : 1f) * Stage.AtkMul;
            int n = Enemies.Count;
            for (int i = 0; i < n; i++)
            {
                var e = Enemies[i];
                if (e.Dead) continue;
                if (e.HitT > 0) e.HitT -= dt;
                if (e.SlowT > 0) e.SlowT -= dt;
                if (e.ChargeT > 0) e.ChargeT -= dt;
                if (e.AbilT > 0) e.AbilT -= dt;
                if (e.DiveT > 0) e.DiveT -= dt;
                if (e.RageT > 0) e.RageT -= dt;
                if (e.HasteT > 0) e.HasteT -= dt;
                if (e.Def.IsBoss && e.Pos.Y < Layout.EngageY) BossSkills(e, dt);
                if (e.Stun > 0) { e.Stun -= dt; continue; }
                float stop = e.Def.StopY + (e.Big ? e.Def.Size * 0.18f : 0f);
                if ((e.Def.Kind == EnemyKind.Taoist || e.Def.Kind == EnemyKind.HighPriest) && e.AbilT <= 0 && e.Pos.Y < Layout.EngageY)
                    TaoistHeal(e, e.Def.Kind == EnemyKind.HighPriest);
                if (e.Pos.Y > stop)
                {
                    if ((e.Def.Kind == EnemyKind.Diver || e.Def.Kind == EnemyKind.WaterChief) && e.AbilT <= 0 && e.Pos.Y < Layout.EngageY)
                    {
                        e.AbilT = e.Def.Kind == EnemyKind.WaterChief ? 5.6f : 5f;
                        e.DiveT = 1.2f;
                        if (e.Def.Kind == EnemyKind.WaterChief)
                            e.Pos.Y = Math.Max(stop, e.Pos.Y - 0.55f);
                    }
                    e.Attacking = false;
                    float spd = EnemySpeed(e);
                    e.Pos.Y = Math.Max(stop, e.Pos.Y - spd * dt);
                    // 先直走出门洞，踏上石板路后再按受限转向角自然并入车道，杜绝斜向横飘。
                    if (e.Pos.Y <= Layout.SpawnY - 0.55f)
                    {
                        float maxLat = spd * dt * (e.Def.IsBoss ? 0.55f : 0.48f);
                        float wantDx = (e.LaneX - e.Pos.X) * M.Clamp01(dt * 1.15f);
                        e.Pos.X += M.Clamp(wantDx, -maxLat, maxLat);
                    }
                    float rMax = Layout.RoadMaxX(e.Pos.Y, e.Def.Size);
                    e.Pos.X = M.Clamp(e.Pos.X, -rMax, rMax);
                    continue;
                }
                if (e.Def.Kind == EnemyKind.Porter)
                {
                    e.Escaped = true;
                    Events.Add(new BattleEvent { Type = Ev.PorterEscaped, Pos = e.Pos, EnemyId = e.Id });
                    continue;
                }
                if (e.Def.Kind == EnemyKind.FireBomb || e.Def.Kind == EnemyKind.Lantern)
                {
                    e.Escaped = true;
                    HitWall(e.Def.WallDps * atkMul * e.Tough, e.Pos);
                    Events.Add(new BattleEvent { Type = Ev.Explode, Pos = e.Pos, EnemyId = e.Id, Radius = 1.2f });
                    continue;
                }
                e.Attacking = true;
                e.AtkCd -= dt;
                if (e.AtkCd > 0) continue;
                var kind = e.Def.Kind;
                bool boltUnit = kind == EnemyKind.Crossbow || kind == EnemyKind.CrossbowCapt || kind == EnemyKind.LiuMenglong;
                bool rockUnit = kind == EnemyKind.Catapult || kind == EnemyKind.FireCart;
                float period = boltUnit ? 1.6f : rockUnit ? 2.8f : 1f;
                e.AtkCd = period;
                float dmg = e.Def.WallDps * period * atkMul * e.Tough;
                if (kind == EnemyKind.ShiWen && e.Hp < e.MaxHp * 0.5f) dmg *= 1.25f;
                if (boltUnit || rockUnit)
                {
                    Shots.Add(new Shot
                    {
                        Id = _nextId++, Kind = kind == EnemyKind.FireCart ? ShotKind.Ball : rockUnit ? ShotKind.Boulder : ShotKind.Bolt,
                        From = e.Pos + new V2(0, rockUnit ? 0.5f : 0f),
                        To = new V2(e.Pos.X + (rockUnit ? _rng.Range(-1f, 1f) : 0f), Layout.WallRowY + 0.3f),
                        Dur = rockUnit ? 1.05f : 0.55f, Damage = dmg,
                    });
                    continue;
                }
                HitWall(dmg, e.Pos);
            }
            Separate(dt);
        }

        void BossSkills(Enemy e, float dt)
        {
            if (e.Def.Kind == EnemyKind.GaoQiu && !e.ShieldUsed && e.Hp < e.MaxHp * 0.5f)
            {
                e.ShieldUsed = true;
                e.Shield = e.MaxHp * 0.15f;
                Events.Add(new BattleEvent { Type = Ev.BossSkill, Pos = e.Pos, EnemyId = e.Id, Value = (int)BossSkill.Shield });
            }
            if (e.Stun > 0) return;
            e.SkillT -= dt;
            if (e.SkillT > 0) return;
            switch (e.Def.Kind)
            {
                case EnemyKind.Luan:
                {
                    var pool = new List<Slot>();
                    foreach (var s in Slots) if (s.Unit != null && s.Unit.Stun <= 0) pool.Add(s);
                    e.SkillT = 7f;
                    if (pool.Count == 0) return;
                    var t = pool[_rng.Int(pool.Count)];
                    Shots.Add(new Shot { Id = _nextId++, Kind = ShotKind.Hammer, From = e.Pos, To = t.Pos, TargetId = t.Index, Dur = 0.75f, Stun = 3f });
                    Events.Add(new BattleEvent { Type = Ev.BossSkill, Pos = e.Pos, EnemyId = e.Id, Slot = t.Index, Value = (int)BossSkill.Hammer });
                    return;
                }
                case EnemyKind.ShiWen:
                    e.SkillT = e.Hp < e.MaxHp * 0.5f ? 6f : 9f;
                    if (e.Attacking) return;
                    e.ChargeT = 0.35f;
                    Events.Add(new BattleEvent { Type = Ev.BossSkill, Pos = e.Pos, EnemyId = e.Id, Value = (int)BossSkill.Charge });
                    return;
                case EnemyKind.HuYan:
                    e.SkillT = 10f;
                    for (int i = 0; i < 3; i++)
                    {
                        float cy = Math.Min(Layout.SpawnY, e.Pos.Y + 0.6f);
                        float cm = Layout.RoadMaxX(cy, 1.15f);
                        var c = Spawn(EnemyKind.Cavalry, -1, new V2(M.Clamp(e.Pos.X + (i - 1) * 0.95f, -cm, cm), cy));
                        c.LaneX = M.Clamp(e.Pos.X + (i - 1) * 1.6f, -cm, cm);
                    }
                    Events.Add(new BattleEvent { Type = Ev.BossSkill, Pos = e.Pos, EnemyId = e.Id, Value = (int)BossSkill.Summon });
                    return;
                case EnemyKind.GaoQiu:
                    e.SkillT = 10f;
                    Shots.Add(new Shot
                    {
                        Id = _nextId++, Kind = ShotKind.Ball, From = e.Pos, To = new V2(e.Pos.X + _rng.Range(-1.5f, 1.5f), Layout.WallRowY + 0.3f),
                        Dur = 0.9f, Damage = e.Def.WallDps * 1.5f * Stage.AtkMul,
                    });
                    Events.Add(new BattleEvent { Type = Ev.BossSkill, Pos = e.Pos, EnemyId = e.Id, Value = (int)BossSkill.Ball });
                    return;
                case EnemyKind.HeTao:
                    e.SkillT = 9f;
                    var guardKind = Stage.No >= 5 ? EnemyKind.Diver : EnemyKind.Soldier;
                    for (int i = 0; i < 3; i++)
                    {
                        float dy = Math.Min(Layout.SpawnY, e.Pos.Y + 0.4f);
                        float dm = Layout.RoadMaxX(dy, 0.95f);
                        var d = Spawn(guardKind, -1, new V2(M.Clamp(e.Pos.X + (i - 1) * 0.95f, -dm, dm), dy));
                        d.LaneX = M.Clamp(e.Pos.X + (i - 1) * 1.6f, -dm, dm);
                    }
                    Events.Add(new BattleEvent { Type = Ev.BossSkill, Pos = e.Pos, EnemyId = e.Id, Value = (int)BossSkill.Summon });
                    return;
                case EnemyKind.Boss:
                    e.SkillT = 10f;
                    foreach (var o in Enemies)
                        if (!o.Dead && o != e && (o.Pos - e.Pos).Len2 < DrumRadius * DrumRadius) o.HasteT = 2f;
                    Events.Add(new BattleEvent { Type = Ev.BossSkill, Pos = e.Pos, EnemyId = e.Id, Value = (int)BossSkill.Drum, Radius = DrumRadius });
                    return;
                case EnemyKind.ZhuChaofeng:
                    e.SkillT = 15f;
                    e.Shield = Math.Max(e.Shield, e.MaxHp * 0.08f);
                    Events.Add(new BattleEvent { Type = Ev.BossSkill, Pos = e.Pos, EnemyId = e.Id, Value = (int)BossSkill.Shield });
                    return;
                case EnemyKind.ZengKui:
                {
                    e.SkillT = 9f;
                    float stop = e.Def.StopY + e.Def.Size * 0.18f;
                    if (e.Attacking || e.Pos.Y <= stop) return;
                    e.Pos.Y = Math.Max(stop, e.Pos.Y - 1.3f);
                    Events.Add(new BattleEvent { Type = Ev.BossSkill, Pos = e.Pos, EnemyId = e.Id, Value = (int)BossSkill.Leap });
                    return;
                }
                case EnemyKind.HanTao:
                    if (!e.Attacking) { e.SkillT = 1f; return; }
                    e.SkillT = 6f;
                    HitWall(e.Def.WallDps * 2.5f * Stage.AtkMul, e.Pos);
                    Events.Add(new BattleEvent { Type = Ev.BossSkill, Pos = e.Pos, EnemyId = e.Id, Value = (int)BossSkill.Ram });
                    return;
                case EnemyKind.LiuMenglong:
                    e.SkillT = 8f;
                    for (int i = 0; i < 5; i++)
                        Shots.Add(new Shot
                        {
                            Id = _nextId++, Kind = ShotKind.Bolt, From = e.Pos + new V2((i - 2) * 0.3f, 1.2f), T = -i * 0.08f,
                            To = new V2(M.Clamp(e.Pos.X + (i - 2) * 1.3f, -4f, 4f), Layout.WallRowY + 0.3f), Dur = 0.6f, Damage = e.Def.WallDps * 0.5f * Stage.AtkMul,
                        });
                    Events.Add(new BattleEvent { Type = Ev.BossSkill, Pos = e.Pos, EnemyId = e.Id, Value = (int)BossSkill.Volley });
                    return;
                default:
                    e.SkillT = 99f;
                    return;
            }
        }

        public const float DrumRadius = 3f, TaoistRadius = 2.5f;

        void TaoistHeal(Enemy e, bool boostHaste = false)
        {
            e.AbilT = 5f;
            float rad = boostHaste ? 2.9f : TaoistRadius;
            bool any = false;
            foreach (var o in Enemies)
            {
                if (o.Dead || (o.Pos - e.Pos).Len2 > rad * rad) continue;
                if (boostHaste && !o.Def.IsBoss) o.HasteT = Math.Max(o.HasteT, 2.5f);
                if (o.Hp >= o.MaxHp) continue;
                float healMul = o.AntiHeal && o.BurnT > 0 ? 0.4f : 1f;
                o.Hp = Math.Min(o.MaxHp, o.Hp + o.MaxHp * (o.Def.IsBoss ? 0.03f : o.Big ? 0.08f : 0.14f) * healMul);
                any = true;
            }
            if (any || boostHaste) Events.Add(new BattleEvent { Type = Ev.EnemyHeal, Pos = e.Pos, EnemyId = e.Id, Radius = rad });
        }

        void HitWall(float dmg, V2 pos)
        {
            dmg *= 1f - Lo.WallResist;
            Wall -= dmg;
            Events.Add(new BattleEvent { Type = Ev.WallHit, Pos = pos, Value = (int)dmg });
            if (!Rallied && Lo.FlagStun > 0 && Wall > 0 && Wall < WallMax * 0.5f) Rally();
        }

        public bool Rallied;

        void Rally()
        {
            Rallied = true;
            foreach (var e in Enemies)
                if (!e.Dead && !e.Escaped) e.Stun = Math.Max(e.Stun, e.Def.IsBoss ? Lo.FlagStun * 0.3f : Lo.FlagStun);
            Events.Add(new BattleEvent { Type = Ev.Rally, Pos = new V2(0, Layout.WallRowY), Radius = Lo.FlagStun });
        }

        void HealWall(float amount, V2 pos, HeroId h)
        {
            if (amount <= 0 || Wall >= WallMax) return;
            float add = Math.Min(WallMax - Wall, amount);
            Wall += add;
            Emit(Ev.Heal, pos, -1, (int)Math.Ceiling(add), h);
        }

        /// <summary>兵挤兵：轻推开，免得几十个叠成一坨。飞的不跟地上的挤。</summary>
        void Separate(float dt)
        {
            int n = Enemies.Count;
            for (int i = 0; i < n; i++)
            {
                var a = Enemies[i];
                for (int j = i + 1; j < n; j++)
                {
                    var b = Enemies[j];
                    if (a.Def.Flying != b.Def.Flying) continue;
                    float dx = b.Pos.X - a.Pos.X, dy = b.Pos.Y - a.Pos.Y;
                    float r = (a.Def.Size + b.Def.Size) * 0.27f;
                    float d2 = dx * dx + dy * dy;
                    if (d2 >= r * r || d2 < 1e-6f) continue;
                    float d = (float)Math.Sqrt(d2);
                    float push = (r - d) * 0.5f * Math.Min(1f, dt * 8f);
                    float nx = dx / d, ny = dy / d;
                    float wa = a.Big && !b.Big ? 0f : (a.Big ? 0.15f : 1f);
                    float wb = b.Big && !a.Big ? 0f : (b.Big ? 0.15f : 1f);
                    a.Pos.X -= nx * push * wa;
                    b.Pos.X += nx * push * wb;
                    if (!a.Attacking) a.Pos.Y -= ny * push * wa * 0.5f;
                    if (!b.Attacking) b.Pos.Y += ny * push * wb * 0.5f;
                }
                float am = Layout.RoadMaxX(a.Pos.Y, a.Def.Size);
                a.Pos.X = M.Clamp(a.Pos.X, -am, am);
            }
        }

        // ---------------- 好汉数值 ----------------

        /// <summary>局外 1 星基础攻击（含寨主攻击、等级、职业加成、全军增伤、上阵羁绊）× 局内强化 × 关卡增益 × 光环 × 本命觉醒。</summary>
        public float HeroDmgMul(HeroId h)
        {
            var d = Defs.Hero(h);
            float m = Lo.Atk * Lo.HeroDmg[(int)h] * Lo.RoleDmg[(int)d.Kind] * Lo.DmgMul;
            if (InLineup(h)) m *= 1f + _roleSynergy + _bondRoleDmg[(int)d.Kind];
            m *= Math.Max(0.3f, 1f + Stat(h, Eff.Dmg)) * (1f + DmgAura);
            if (_awakened[(int)h]) m *= 1f + Defs.AwakenDmgBonus;
            if (Stage.BuffRole.HasValue && d.Kind == Stage.BuffRole.Value) m *= 1f + Stage.BuffPct;
            if (ForgeT > 0) m *= 1f + ForgeV;
            return m;
        }

        /// <summary>好汉攻击：伤害倍率 × 星级 × 等级带来的技能伤害。技能一下（或法师一跳）的伤害再乘系数。</summary>
        public float HeroAtk(HeroId h, int star) => HeroDmgMul(h) * Defs.StarMul[star - 1] * Lo.SkillPow[(int)h];

        public float AtkPower(HeroId h, int star) => Defs.Hero(h).Coef * HeroAtk(h, star);

        /// <summary>某个具体格子上的好汉面板攻击（含最高星「最强一击」与「众星捧月」共鸣加成）。</summary>
        public float SlotHeroAtk(Slot s)
        {
            if (s?.Unit == null) return 0f;
            float a = HeroAtk(s.Unit.Hero, s.Unit.Star);
            if (SlotOf(s.Unit.Hero) == s)
            {
                float top = Stat(s.Unit.Hero, Eff.Top);
                if (top > 0) a *= 1f + top;
                float res = Stat(s.Unit.Hero, Eff.Resonance);
                if (res > 0) a *= 1f + res * RoleUnitsOnField(s.Unit.Def.Kind);
            }
            return a;
        }

        /// <summary>某位好汉本局已积累的专属常规词条层数（驱动大招动态继承增伤，上限计 8 层）。</summary>
        public int HeroPerkStacks(HeroId h)
        {
            int n = 0;
            foreach (var kv in Perks)
            {
                if (kv.Value <= 0) continue;
                var q = Defs.Perk(kv.Key);
                if (q != null && q.Hero == h && !q.Star && !q.Ult) n += kv.Value;
            }
            return Math.Min(8, n);
        }

        public int HeroUnitsOnField(HeroId h)
        {
            int n = 0;
            foreach (var s in Slots) if (s.Unit != null && s.Unit.Hero == h) n++;
            return n;
        }

        /// <summary>大招威力 = 好汉攻击 × 大招强化 × 本好汉已选词条层数动态继承（默认每层 +12%）；CastUlt 里再乘 UltCoef。</summary>
        public float UltPower(HeroId h, int star) => HeroAtk(h, star) * (1f + Stat(h, Eff.UltPow)) * (1f + Balance.Current.Combat.UltPerkStackBonus * HeroPerkStacks(h));

        /// <summary>技能冷却：职业决定基数（射手两秒、法师十几秒），等级和辅助的冷却强化再减。</summary>
        public float SkillCd(HeroId h)
        {
            var d = Defs.Hero(h);
            float cd = d.Interval * Lo.SkillCd[(int)h];
            if (d.Kind == Role.Support) cd *= 1f - Math.Min(0.6f, Stat(h, Eff.UltCd));
            return cd;
        }

        /// <summary>辅助技能的效果倍率。</summary>
        public float BuffBoost(HeroId h) => Lo.SkillPow[(int)h] * (1f + Stat(h, Eff.UltPow)) * (_awakened[(int)h] ? 1f + Defs.AwakenAuraBonus : 1f);

        public float HeroSpeedMul(HeroId h)
            => Lo.AllSpeed * Lo.HeroSpeed[(int)h] * Math.Max(0.3f, 1f + Stat(h, Eff.Speed)) * (1f + Aura) * (HasteT > 0 ? HasteMul : 1f) * (_awakened[(int)h] ? 1f + Defs.AwakenSpeedBonus : 1f);

        /// <summary>棋盘空间联动：智多星吴用左右相邻格的好汉额外获得 +16% 攻击速度。</summary>
        public float AdjSpeedMul(Slot s)
        {
            if (s?.Unit == null) return 1f;
            foreach (var o in Slots)
            {
                if (o == s || o.Unit == null || o.Unit.Stun > 0 || o.Unit.Hero != HeroId.WuYong) continue;
                if (Math.Abs(o.Pos.Y - s.Pos.Y) < 0.45f && Math.Abs(o.Pos.X - s.Pos.X) <= Layout.SlotGap * 1.15f)
                    return 1.16f;
            }
            return 1f;
        }

        public float HeroRange(HeroId h) => Defs.Hero(h).Range + Stat(h, Eff.Range);

        public float CritRate(HeroId h) => Math.Min(0.85f, Lo.Crit + _bondCrit + Stat(h, Eff.Crit));

        public float UltCd(HeroId h)
            => Defs.Hero(h).UltCd * Lo.UltCd * (Lo.Lv[(int)h] >= 25 ? 0.85f : 1f) * (1f - Math.Min(0.6f, Stat(h, Eff.UltCd)));

        /// <summary>控制效果：(时长, 几率)。自带必控（套索、渔网）的强化加时长，其余加几率。</summary>
        public (float dur, float chance) StunOf(HeroId h)
        {
            var d = Defs.Hero(h);
            float add = Stat(h, Eff.Stun);
            if (d.Stun > 0 && d.StunChance <= 0) return (d.Stun + add, 1f);
            float chance = d.StunChance + add;
            return (d.Stun > 0 ? d.Stun : 0.8f, Math.Min(1f, chance));
        }

        public float SlowOf(HeroId h) => Defs.Hero(h).Slow + Stat(h, Eff.Slow);
        public float AreaOf(HeroId h) => 1f + Stat(h, Eff.Area);
        public int CountOf(HeroId h)
        {
            int c = Defs.Hero(h).Count + (int)Stat(h, Eff.Count);
            if (h == HeroId.YanQing && Lo.Lv[(int)h] >= Meta.PassiveLv && HeroUnitsOnField(h) >= 4) c++;
            return c;
        }
        public int ChainOf(HeroId h)
        {
            int c = Defs.Hero(h).Chain + (int)Stat(h, Eff.Chain);
            if (h == HeroId.HuaRong && Lo.Lv[(int)h] >= Meta.SurgePlusLv && HeroUnitsOnField(h) >= 4) c++;
            return c;
        }

        Enemy PickTarget(HeroDef def, V2 from, int skip = -1, int star = 1)
        {
            if (FocusEnemyId > 0)
            {
                var fe = Find(FocusEnemyId);
                if (fe == null || fe.Dead || fe.Escaped) FocusEnemyId = -1;
            }
            bool melee = def.Melee;
            float maxY = melee ? Layout.StopY + HeroRange(def.Id) : 99f;
            Enemy best = null;
            float bestScore = float.MaxValue;
            foreach (var e in Enemies)
            {
                if (e.Dead || e.Diving || e.Id == skip || e.Pos.Y > maxY || e.Pos.Y > Layout.EngageY) continue;
                if (melee && e.Def.Flying) continue;
                float score = e.Pos.Y + Math.Abs(e.Pos.X - from.X) * 0.25f;
                // 玩家手动集火目标拥有最高优先级；其次优先清掉正在啃墙或踏入墙根警戒线的小怪（根治远端精英吸走火力漏近怪痛点）
                if (e.Id == FocusEnemyId) score -= 25f;
                else if (!e.Big && (e.Attacking || e.Pos.Y <= Layout.StopY + 1.15f)) score -= 7.2f;
                else if (e.Big || e.Def.Kind == EnemyKind.Porter) score -= 6f;
                if (def.Shot == ShotKind.Lasso && e.Big) score -= 4f;
                if (score < bestScore) { bestScore = score; best = e; }
            }
            return best;
        }

        /// <summary>吴用法球的起手凝珠时长与飞行时长（表现层照这个飞，落地时刻和生效时刻一致）。</summary>
        public const float BlessWindup = 0.36f;
        public static float BlessTravel(float dist) => Math.Clamp(0.95f + dist * 0.06f, 0.98f, 1.30f);
        public static float BlessArrive(V2 from, V2 to)
        {
            float dx = to.X - from.X, dy = to.Y - from.Y;
            return BlessWindup + BlessTravel((float)Math.Sqrt(dx * dx + dy * dy));
        }

        void UpdateUnits(float dt)
        {
            foreach (var s in Slots)
            {
                var u = s.Unit;
                if (u == null) continue;
                if (u.Stun > 0) { u.Stun -= dt; continue; }
                var def = u.Def;
                if (u.BlessWait > 0 && (u.BlessWait -= dt) <= 0 && u.BlessN > 0) u.Cd /= u.BlessMul;
                float spd = HeroSpeedMul(u.Hero) * AdjSpeedMul(s) * Defs.StarSpeed[u.Star - 1] * (1f + ChargeAura);
                u.Cd -= dt * spd;
                if (u.Cd > 0) continue;
                if (def.Buff.HasValue)
                {
                    u.Cd = Enemies.Count > 0 && CastBuff(s, u) ? SkillCd(u.Hero) * (1f - StarTraits.Fx(def, u.Star).Cd) : 0.5f;
                    continue;
                }
                if (Channeling(u)) { u.Cd = 0.1f; continue; }
                var target = PickTarget(def, s.Pos, -1, u.Star);
                if (target == null) { u.Cd = 0.1f; continue; }
                u.Cd = SkillCd(u.Hero) * (1f - StarTraits.Fx(def, u.Star).Cd);
                float dmg = AtkPower(u.Hero, u.Star);
                if (u.Burst) { dmg *= 2.2f; u.Burst = false; }
                if (u.BlessN > 0 && u.BlessWait <= 0)
                {
                    u.Cd /= u.BlessMul;
                    if (--u.BlessN == 0) u.BlessMul = 1f;
                }
                float scale = u.Star >= 4 ? 1.32f : u.Star == 3 ? 1.18f : u.Star == 2 ? 1.08f : 1f;
                if (SlotOf(u.Hero) == s)
                {
                    float top = Stat(u.Hero, Eff.Top);
                    if (top > 0) { dmg *= 1f + top; scale *= 1.2f; }
                    float res = Stat(u.Hero, Eff.Resonance);
                    if (res > 0)
                    {
                        int mates = RoleUnitsOnField(def.Kind);
                        if (mates > 0) { dmg *= 1f + res * mates; scale = Math.Max(scale, 1.18f); }
                    }
                }
                float surge = Stat(u.Hero, Eff.Surge);
                _sureCrit = false;
                if (surge > 0 && _rng.Chance(surge))
                {
                    dmg *= Defs.SurgeDmg;
                    scale *= 1.6f;
                    _sureCrit = Lo.Lv[(int)u.Hero] >= Meta.SurgePlusLv;
                    Emit(Ev.Surge, s.Pos, s.Index, 0, u.Hero);
                }
                int n0 = Shots.Count, c0 = Channels.Count;
                _critAdd = StarTraits.Fx(def, u.Star).Crit;
                Fire(s, u, target, dmg);
                _critAdd = 0f;
                for (int i = n0; i < Shots.Count; i++) Grow(Shots[i], scale);
                for (int i = c0; i < Channels.Count; i++) { Channels[i].Scale = scale; Channels[i].Sure = _sureCrit; }
                _sureCrit = false;
            }
        }

        static void Grow(Shot sh, float scale)
        {
            if (scale <= 1f) return;
            sh.Scale = scale;
            sh.Radius *= 1f + (scale - 1f) * 0.6f;
        }

        bool Channeling(Unit u)
        {
            foreach (var c in Channels) if (c.Unit == u) return true;
            return false;
        }

        void UpdateChannels(float dt)
        {
            for (int i = Channels.Count - 1; i >= 0; i--)
            {
                var c = Channels[i];
                var s = Slots[c.Slot];
                if (s.Unit != c.Unit || c.Unit.Stun > 0 || c.Ticks <= 0) { Channels.RemoveAt(i); continue; }
                c.Next -= dt;
                if (c.Next > 0) continue;
                c.Next += c.Every;
                c.Ticks--;
                int n0 = Shots.Count;
                _sureCrit = c.Sure;
                ChannelTick(s, c);
                _sureCrit = false;
                for (int k = n0; k < Shots.Count; k++) Grow(Shots[k], c.Scale);
            }
        }

        /// <summary>法师持续施法的一跳：射线贯穿一条线、天雷随机劈前排、旋风原地绞、金砖砸目标。</summary>
        void ChannelTick(Slot s, Channel c)
        {
            var d = c.Unit.Def;
            var h = c.Unit.Hero;
            var t = Find(c.Target);
            if (t == null || t.Pos.Y > Layout.EngageY)
            {
                t = PickTarget(d, s.Pos);
                if (t == null) { c.Ticks = 0; return; }
                c.Target = t.Id;
            }
            float v = c.Damage;
            bool crit = RollCrit(h, ref v);
            var fx = StarTraits.Fx(d, c.Unit.Star);
            var (stun, chance) = WithStar(StunOf(h), fx);
            float slow = SlowOf(h);
            float r = d.Radius * AreaOf(h) * (1f + fx.Area);
            switch (d.Shot)
            {
                case ShotKind.Beam:
                    Shots.Add(new Shot
                    {
                        Id = _nextId++, Kind = ShotKind.Beam, Hero = h, From = s.Pos, To = t.Pos, TargetId = t.Id, Dur = c.Every + 0.04f,
                        Damage = v, Radius = r, Crit = crit, Slow = slow, Stun = chance > 0 ? stun : 0, StunChance = chance,
                    });
                    break;
                case ShotKind.Lightning:
                {
                    var front = FrontTargets();
                    var p = front.Count > 0 ? front[_rng.Int(Math.Min(front.Count, 10))] : t;
                    Shots.Add(new Shot
                    {
                        Id = _nextId++, Kind = ShotKind.Lightning, Hero = h, From = p.Pos + new V2(0, 6), To = p.Pos, TargetId = p.Id,
                        Dur = 0.08f, Damage = v, Radius = r, Pierce = 1 + ChainOf(h) + fx.Pierce, Crit = crit, Slow = slow,
                        Stun = chance > 0 ? stun : 0, StunChance = chance,
                    });
                    break;
                }
                case ShotKind.Wind:
                    Shots.Add(new Shot
                    {
                        Id = _nextId++, Kind = ShotKind.Wind, Hero = h, From = t.Pos + new V2(0, 0.3f), To = t.Pos, TargetId = t.Id,
                        Dur = c.Every, Damage = v, Radius = r, Slow = slow, Crit = crit, Stun = chance > 0 ? stun : 0, StunChance = chance,
                    });
                    break;
                default:
                    Shots.Add(new Shot
                    {
                        Id = _nextId++, Kind = ShotKind.Stone, Hero = h, From = s.Pos, To = t.Pos, TargetId = t.Id,
                        Dur = 0.28f + V2.Dist(s.Pos, t.Pos) / 28f, Damage = v, Radius = d.Radius, Pierce = ChainOf(h) + fx.Pierce,
                        Stun = chance > 0 ? stun : 0, StunChance = chance, Crit = crit, Hit = new List<int>(),
                    });
                    break;
            }
        }

        /// <summary>升星的定身几率叠到强化给的上面：时长取大，几率相加。</summary>
        static (float, float) WithStar((float stun, float chance) b, StarFx fx)
        {
            if (fx.StunP <= 0) return b;
            return (Math.Max(b.stun, fx.Stun), Math.Min(1f, b.chance + fx.StunP));
        }

        /// <summary>辅助技能：不打伤害，给队友加成。时机不对返回 false，半秒后再试。</summary>
        bool CastBuff(Slot from, Unit u)
        {
            var d = u.Def;
            var h = u.Hero;
            float boost = BuffBoost(h) * (1f + StarTraits.Fx(d, u.Star).Buff);
            switch (d.Buff.Value)
            {
                case UltKind.Bless:
                {
                    var pool = new List<Slot>();
                    foreach (var s in Slots)
                        if (s.Unit != null && s.Unit.Def.Carry && s.Unit.BlessN == 0) pool.Add(s);
                    if (pool.Count == 0)
                    {
                        foreach (var s in Slots)
                            if (s.Unit != null && s.Unit.Def.Carry) pool.Add(s);
                    }
                    if (pool.Count == 0) return false;
                    u.Casts++;
                    Events.Add(new BattleEvent { Type = Ev.Buff, Slot = from.Index, Hero = h, Pos = from.Pos, EnemyId = -1 });
                    int n = u.Star >= 3 ? 2 : 1;
                    for (int i = 0; i < n && pool.Count > 0; i++)
                    {
                        int k = _rng.Int(pool.Count);
                        var s = pool[k];
                        pool.RemoveAt(k);
                        s.Unit.BlessN = 2 + u.Star;
                        s.Unit.BlessMul = 1f + d.BuffV * boost;
                        s.Unit.BlessWait = BlessArrive(from.Pos, s.Pos);
                        Events.Add(new BattleEvent { Type = Ev.Buff, Slot = from.Index, Hero = h, Pos = s.Pos, EnemyId = s.Index, Value = s.Unit.BlessN });
                    }
                    return true;
                }
                case UltKind.Rush:
                {
                    float k = Math.Min(0.8f, (d.BuffV + 0.1f * (u.Star - 1)) * boost);
                    foreach (var s in Slots)
                        if (s.Unit != null && s.Unit != u) s.Unit.Cd *= 1f - k;
                    foreach (var x in Lineup)
                        if (x != h) UltTimer[(int)x] *= 1f - k;
                    break;
                }
                case UltKind.Mend:
                    if (Wall > WallMax * 0.85f && !AnyStunned()) return false;
                    HealWall(WallMax * d.BuffV * u.Star * (1f + Stat(h, Eff.Aura)) * boost, from.Pos, h);
                    foreach (var s in Slots) if (s.Unit != null) s.Unit.Stun = 0;
                    break;
                case UltKind.Forge:
                    ForgeT = 8f;
                    ForgeV = d.BuffV * (0.9f + 0.1f * u.Star) * boost;
                    break;
                case UltKind.Steal:
                {
                    int coin = (int)Math.Round((28 + 12 * u.Star + Wave * 5) * boost);
                    Coins += coin;
                    Emit(Ev.Coin, from.Pos, from.Index, coin, h);
                    var mark = Strongest();
                    if (mark != null)
                    {
                        mark.Vuln = mark.VulnT > 0 ? Math.Max(mark.Vuln, 0.25f) : 0.25f;
                        mark.VulnT = Defs.VulnDur;
                        Events.Add(new BattleEvent { Type = Ev.Buff, Slot = from.Index, Hero = h, Pos = mark.Pos, EnemyId = -2, Value = mark.Id });
                    }
                    break;
                }
                case UltKind.Interest:
                {
                    int coin = M.Clamp((int)Math.Round(Coins * d.BuffV * boost), 45, 260);
                    Coins += coin;
                    HasteT = Math.Max(HasteT, 5f);
                    HasteMul = Math.Max(HasteMul, 1.25f);
                    Emit(Ev.Coin, from.Pos, from.Index, coin, h);
                    break;
                }
            }
            u.Casts++;
            Events.Add(new BattleEvent { Type = Ev.Buff, Slot = from.Index, Hero = h, Pos = from.Pos, EnemyId = -1 });
            return true;
        }

        bool _sureCrit;
        float _critAdd;

        bool RollCrit(HeroId h, ref float dmg)
        {
            if (!_sureCrit && !_rng.Chance(CritRate(h) + _critAdd)) return false;
            dmg *= Lo.CritDmg;
            return true;
        }

        void Fire(Slot s, Unit u, Enemy target, float dmg)
        {
            var d = u.Def;
            var h = u.Hero;
            u.Casts++;
            Events.Add(new BattleEvent { Type = Ev.Fire, Slot = s.Index, Hero = h, Pos = target.Pos });
            int extra = (int)Stat(h, Eff.Count);
            if (h == HeroId.YanQing && Lo.Lv[(int)h] >= Meta.PassiveLv && HeroUnitsOnField(h) >= 4) extra++;
            var fx = StarTraits.Fx(d, u.Star);
            if (d.Chan > 0)
            {
                float chan = d.Chan + Defs.ChanPerCount * extra + fx.Chan + (_awakened[(int)h] ? 1.0f : 0f);
                Channels.Add(new Channel
                {
                    Unit = u, Slot = s.Index, Target = target.Id, Every = d.Tick, Damage = dmg,
                    Ticks = Math.Max(1, (int)Math.Round(chan / d.Tick)),
                });
                return;
            }
            int shots = Defs.ShotsAt(d, u.Star);
            if (shots < d.Count) dmg *= (float)Math.Pow((float)d.Count / shots, 0.75f);
            int count = shots + extra + fx.Shots;
            float each = dmg;
            float area = AreaOf(h) * (1f + fx.Area);
            int chain = ChainOf(h) + fx.Pierce;
            var (stun, chance) = WithStar(StunOf(h), fx);
            float slow = SlowOf(h);
            var used = new List<int>();
            switch (d.Shot)
            {
                case ShotKind.Arrow:
                    for (int i = 0; i < count; i++)
                    {
                        var t = i == 0 ? target : PickOther(target, used) ?? target;
                        used.Add(t.Id);
                        float v = each;
                        bool crit = RollCrit(h, ref v);
                        var shot = AddShot(ShotKind.Arrow, h, s.Pos, t, v, 0.35f, ShotDur(ShotKind.Arrow, V2.Dist(s.Pos, t.Pos)), crit);
                        shot.Pierce = chain;
                        shot.T = -i * 0.06f;
                        AimPierce(shot, s.Pos, t, chain);
                    }
                    break;
                case ShotKind.Bomb:
                case ShotKind.Fireball:
                    for (int i = 0; i < count; i++)
                    {
                        var t = i == 0 ? target : PickOther(target, used) ?? target;
                        used.Add(t.Id);
                        float v = each;
                        bool crit = RollCrit(h, ref v);
                        float dur = ShotDur(d.Shot, V2.Dist(s.Pos, t.Pos));
                        Shots.Add(new Shot
                        {
                            Id = _nextId++, Kind = d.Shot, Hero = h, From = s.Pos, To = Lead(t, dur), Dur = dur, T = -i * 0.09f,
                            Damage = v, Radius = d.Radius * area, Crit = crit, Split = Stat(h, Eff.Split) > 0 || fx.Split, Knock = d.Knock > 0 ? d.Knock : 0.12f,
                            Stun = fx.StunP > 0 ? fx.Stun : 0, StunChance = fx.StunP,
                        });
                    }
                    break;
                case ShotKind.Lightning:
                    for (int i = 0; i < count; i++)
                    {
                        var t = i == 0 ? target : PickOther(target, used) ?? target;
                        used.Add(t.Id);
                        float v = each;
                        bool crit = RollCrit(h, ref v);
                        Shots.Add(new Shot
                        {
                            Id = _nextId++, Kind = ShotKind.Lightning, Hero = h, From = s.Pos, To = t.Pos, TargetId = t.Id, T = -i * 0.09f,
                            Dur = ShotDur(ShotKind.Lightning, 0f), Damage = v, Radius = d.Radius * area, Pierce = 1 + chain, Crit = crit,
                            Stun = chance > 0 ? stun : 0, StunChance = chance, Slow = slow,
                        });
                    }
                    break;
                case ShotKind.Punch:
                case ShotKind.Slam:
                    for (int i = 0; i < count; i++)
                    {
                        float v = each;
                        bool crit = RollCrit(h, ref v);
                        float dur = ShotDur(d.Shot, 0f);
                        Shots.Add(new Shot
                        {
                            Id = _nextId++, Kind = d.Shot, Hero = h, From = s.Pos, To = target.Pos, TargetId = target.Id, T = -i * 0.15f,
                            Dur = dur, Damage = v, Radius = d.Radius * area, Knock = d.Knock * (1f + 0.5f * Stat(h, Eff.Area)), Crit = crit,
                            Stun = fx.StunP > 0 ? fx.Stun : 0, StunChance = fx.StunP,
                        });
                        if (i == 0 && fx.Qi)
                        {
                            var at = Lead(target, dur);
                            Shots.Add(new Shot
                            {
                                Id = _nextId++, Kind = ShotKind.Qi, Hero = h, From = at, To = new V2(at.X, Math.Min(Layout.SpawnY - 0.5f, at.Y + QiReach)),
                                T = -dur, Dur = 0.40f, Damage = each * 0.65f, Radius = 0.55f + d.Radius * 0.3f,
                            });
                        }
                        if (i == 0 && fx.After)
                            Shots.Add(new Shot
                            {
                                Id = _nextId++, Kind = ShotKind.Slam, Hero = h, From = s.Pos, To = target.Pos, TargetId = target.Id, T = -0.45f,
                                Dur = dur, Damage = each * 0.5f, Radius = d.Radius * area * 1.35f, Scale = 1.2f,
                                Stun = fx.StunP > 0 ? fx.Stun : 0, StunChance = fx.StunP,
                            });
                    }
                    break;
                case ShotKind.Spear:
                {
                    float v = each;
                    bool crit = RollCrit(h, ref v);
                    float dur = ShotDur(ShotKind.Spear, 0f);
                    Shots.Add(new Shot
                    {
                        Id = _nextId++, Kind = ShotKind.Spear, Hero = h, From = s.Pos, To = target.Pos, TargetId = target.Id,
                        Dur = dur, Damage = v, Radius = d.Radius * area, Crit = crit, Knock = d.Knock, Slow = slow,
                        Stun = chance > 0 ? stun : 0, StunChance = chance, Reach = fx.Reach + Stat(h, Eff.Reach),
                    });
                    if (fx.Twin)
                        Shots.Add(new Shot
                        {
                            Id = _nextId++, Kind = ShotKind.Spear, Hero = h, From = s.Pos, To = target.Pos, TargetId = target.Id, T = -0.28f,
                            Dur = dur, Damage = each * 0.6f, Radius = d.Radius * area, Slow = slow,
                            Stun = chance > 0 ? stun : 0, StunChance = chance, Reach = fx.Reach + Stat(h, Eff.Reach),
                        });
                    break;
                }
                case ShotKind.Stone:
                    for (int i = 0; i < count; i++)
                    {
                        var t = i == 0 ? target : PickOther(target, used) ?? target;
                        used.Add(t.Id);
                        float v = each;
                        bool crit = RollCrit(h, ref v);
                        Shots.Add(new Shot
                        {
                            Id = _nextId++, Kind = ShotKind.Stone, Hero = h, From = s.Pos, To = t.Pos, TargetId = t.Id, T = -i * 0.11f,
                            Dur = ShotDur(ShotKind.Stone, V2.Dist(s.Pos, t.Pos)), Damage = v, Radius = d.Radius, Pierce = chain,
                            Stun = chance > 0 ? stun : 0, StunChance = chance, Crit = crit, Hit = new List<int>(),
                        });
                    }
                    break;
                case ShotKind.Wind:
                {
                    float v = each;
                    bool crit = RollCrit(h, ref v);
                    Shots.Add(new Shot
                    {
                        Id = _nextId++, Kind = ShotKind.Wind, Hero = h, From = s.Pos, To = target.Pos, TargetId = target.Id,
                        Dur = ShotDur(ShotKind.Wind, V2.Dist(s.Pos, target.Pos)), Damage = v, Radius = d.Radius * area, Slow = slow, Crit = crit,
                        Stun = chance > 0 ? stun : 0, StunChance = chance,
                    });
                    break;
                }
                case ShotKind.Lasso:
                    for (int i = 0; i < count; i++)
                    {
                        var t = i == 0 ? target : PickOther(target, used);
                        if (t == null) break;
                        used.Add(t.Id);
                        float v = each;
                        bool crit = RollCrit(h, ref v);
                        Shots.Add(new Shot
                        {
                            Id = _nextId++, Kind = ShotKind.Lasso, Hero = h, From = s.Pos, To = t.Pos, TargetId = t.Id, T = -i * 0.09f,
                            Dur = ShotDur(ShotKind.Lasso, V2.Dist(s.Pos, t.Pos)), Damage = v, Radius = fx.Area > 0 ? 1.15f : 0.4f, Stun = stun + fx.Stun, StunChance = 1f, Crit = crit, Knock = fx.Pull,
                        });
                    }
                    break;
            }
            if (_awakened[(int)h] && u.Casts % 3 == 0) FireAwakenVolley(s, u, target, each, area, chain);
        }

        /// <summary>三合一合成奥义真实弹道蜕变：每第 3 轮普攻额外迸发一轮流派终极弹幕（流星火雨/贯穿剑气/万箭齐发/连环天雷）。</summary>
        void FireAwakenVolley(Slot s, Unit u, Enemy target, float each, float area, int chain)
        {
            var d = u.Def;
            var h = u.Hero;
            float mul = Lo.Lv[(int)h] >= 25 ? 1.35f : 1f;
            var front = FrontTargets();
            switch (d.Shot)
            {
                case ShotKind.Bomb:
                case ShotKind.Fireball:
                    for (int k = 0; k < 4; k++)
                    {
                        var t = front.Count > 0 ? front[_rng.Int(Math.Min(front.Count, 12))] : target;
                        var jitter = new V2(_rng.Range(-0.55f, 0.55f), _rng.Range(-0.35f, 0.35f));
                        Shots.Add(new Shot
                        {
                            Id = _nextId++, Kind = ShotKind.MiniBomb, Hero = h, From = s.Pos, To = Lead(t, 0.42f) + jitter,
                            T = -0.14f - k * 0.07f, Dur = 0.42f, Damage = each * 0.55f * mul, Radius = 0.85f * area, Knock = 0.1f,
                        });
                    }
                    break;
                case ShotKind.Arrow:
                    for (int k = 0; k < 3; k++)
                    {
                        var t = front.Count > 0 ? front[_rng.Int(Math.Min(front.Count, 10))] : target;
                        var sh = AddShot(ShotKind.Arrow, h, s.Pos, t, each * 0.65f * mul, 0.35f, 0.24f + V2.Dist(s.Pos, t.Pos) / 17f, false);
                        sh.Pierce = chain;
                        sh.T = -0.12f - k * 0.05f;
                        AimPierce(sh, s.Pos, t, sh.Pierce);
                    }
                    break;
                case ShotKind.Punch:
                case ShotKind.Slam:
                case ShotKind.Spear:
                    for (int k = -1; k <= 1; k += 2)
                    {
                        float x = M.Clamp(target.Pos.X + k * 0.7f, -Layout.RoadHalfW, Layout.RoadHalfW);
                        Shots.Add(new Shot
                        {
                            Id = _nextId++, Kind = ShotKind.Qi, Hero = h, From = new V2(x, target.Pos.Y),
                            To = new V2(x, Math.Min(Layout.SpawnY - 0.5f, target.Pos.Y + QiReach + 1.2f)),
                            T = -0.18f, Dur = 0.38f, Damage = each * 0.65f * mul, Radius = 0.75f,
                        });
                    }
                    break;
                case ShotKind.Lightning:
                case ShotKind.Stone:
                    for (int k = 0; k < 2; k++)
                    {
                        var t = front.Count > 0 ? front[_rng.Int(Math.Min(front.Count, 10))] : target;
                        Shots.Add(new Shot
                        {
                            Id = _nextId++, Kind = d.Shot, Hero = h, From = s.Pos, To = t.Pos, TargetId = t.Id,
                            T = -0.15f - k * 0.08f, Dur = 0.22f, Damage = each * 0.7f * mul, Radius = Math.Max(0.45f, d.Radius * area),
                            Pierce = 1 + chain, Hit = d.Shot == ShotKind.Stone ? new List<int>() : null,
                        });
                    }
                    break;
                default:
                    Shots.Add(new Shot
                    {
                        Id = _nextId++, Kind = ShotKind.Wind, Hero = h, From = s.Pos, To = target.Pos, TargetId = target.Id,
                        T = -0.16f, Dur = 0.26f, Damage = each * 0.75f * mul, Radius = d.Radius * area * 1.25f, Slow = 2f,
                    });
                    break;
            }
        }

        Enemy PickOther(Enemy first, List<int> used)
        {
            Enemy best = null;
            float bestY = float.MaxValue;
            foreach (var e in Enemies)
            {
                if (e.Dead || used.Contains(e.Id) || e == first || e.Pos.Y > Layout.EngageY) continue;
                if (e.Pos.Y < bestY) { bestY = e.Pos.Y; best = e; }
            }
            return best;
        }

        /// <summary>刀斧拳从好汉手上挥到敌人身上的时间。节奏沉稳有分量，看清回旋与弧线再落刀。</summary>
        public const float MeleeDur = 0.34f;

        /// <summary>普攻弹道飞完要的秒数。局内出手和主界面演示用同一套，别各写一个。</summary>
        public static float ShotDur(ShotKind k, float dist)
        {
            switch (k)
            {
                case ShotKind.Arrow: return 0.26f + dist / 16f;
                case ShotKind.Bomb: return 0.55f + dist / 22f;
                case ShotKind.Fireball: return 0.38f + dist / 18f;
                case ShotKind.MiniBomb: return 0.42f;
                case ShotKind.Lightning: return 0.12f;
                case ShotKind.Punch: return MeleeDur;
                case ShotKind.Slam: return 0.30f;
                case ShotKind.Spear: return 0.22f;
                case ShotKind.Stone: return 0.25f + dist / 17f;
                case ShotKind.Wind: return 0.28f + dist / 16f;
                case ShotKind.Lasso: return 0.30f + dist / 18f;
                case ShotKind.Qi: return 0.40f;
                default: return 0.4f;
            }
        }
        /// <summary>3 星「刀气」从落刀处往敌阵方向飞出的距离。</summary>
        public const float QiReach = 3.5f;
        /// <summary>「爆裂箭」的爆炸半径。</summary>
        public const float BlastR = 0.95f;

        V2 Lead(Enemy e, float t)
        {
            if (e.Stun > 0 || e.Attacking) return e.Pos;
            float y = Math.Max(e.Def.StopY, e.Pos.Y - EnemySpeed(e) * t);
            return new V2(e.Pos.X, y);
        }

        Shot AddShot(ShotKind k, HeroId h, V2 from, Enemy t, float dmg, float r, float dur, bool crit = false, bool ult = false)
        {
            var s = new Shot
            {
                Id = _nextId++, Kind = k, Hero = h, From = from, To = t.Pos, Aim = t.Pos, TargetId = t.Id, Dur = dur, Damage = dmg, Radius = r,
                Crit = crit, Ult = ult,
            };
            Shots.Add(s);
            return s;
        }

        Enemy Find(int id)
        {
            foreach (var e in Enemies) if (e.Id == id && !e.Dead) return e;
            return null;
        }

        void UpdateShots(float dt)
        {
            for (int i = Shots.Count - 1; i >= 0; i--)
            {
                var s = Shots[i];
                if (s.T < 0)
                {
                    s.T += dt;
                    continue;
                }
                s.T += dt;
                if (s.TargetId >= 0 && (s.Kind == ShotKind.Arrow || s.Kind == ShotKind.Stone || s.Kind == ShotKind.Wind || s.Kind == ShotKind.Lasso || s.Kind == ShotKind.Beam
                    || !s.Ult && (s.Kind == ShotKind.Punch || s.Kind == ShotKind.Slam)))
                {
                    var t = Find(s.TargetId);
                    if (t != null) s.Aim = t.Pos;
                    // 穿透箭的落点在直线上最后一个人。不能每帧吸回第一个人，否则箭飞到他身上就停了。
                    if (t != null && !ArrowAlreadyPastFirst(s, t)) s.To = t.Pos;
                }
                if (s.T < s.Dur) continue;
                Shots.RemoveAt(i);
                Land(s);
            }
        }

        void ApplyKnock(Enemy e, float dist)
        {
            if (dist <= 0f || e.Dead || e.Big || e.Def.Flying || e.Def.Kind == EnemyKind.Porter || e.Def.Kind == EnemyKind.Catapult || e.Def.Kind == EnemyKind.Brute) return;
            e.Pos.Y = Math.Min(Layout.SpawnY - 0.5f, e.Pos.Y + dist);
            e.Attacking = false;
        }

        void ApplySlow(Enemy e, Shot s)
        {
            if (s.Slow <= 0f) return;
            float bonus = 0f;
            if (e.Pos.Y <= Layout.StopY + 1.8f && Defs.Hero(s.Hero).Kind == Role.Control)
            {
                var p = Defs.Perk(Defs.Hero(s.Hero).Art.Substring(5) + "_exec");
                if (p != null && p.Eff == Eff.Slow) bonus = 1.0f * Level(p.Id);
            }
            e.SlowT = Math.Max(e.SlowT, s.Slow + bonus);
        }

        bool TryStun(Enemy e, Shot s, float bigMul = 0f)
        {
            if (s.Stun <= 0 || s.StunChance <= 0) return false;
            if (e.Big && bigMul <= 0) return false;
            float chance = s.StunChance;
            float dur = s.Stun;
            if (e.Pos.Y <= Layout.StopY + 1.8f && Defs.Hero(s.Hero).Kind == Role.Control)
            {
                int lv = Level(Defs.Hero(s.Hero).Art.Substring(5) + "_exec");
                if (lv > 0)
                {
                    var d = Defs.Hero(s.Hero);
                    if (d.Stun > 0 && d.StunChance <= 0) dur += 0.4f * lv;
                    else if (chance < 1f) chance = Math.Min(1f, chance * 2f);
                }
            }
            if (chance < 1f && !_rng.Chance(chance)) return false;
            e.Stun = Math.Max(e.Stun, e.Big ? dur * bigMul : dur);
            return true;
        }

        void Land(Shot s)
        {
            switch (s.Kind)
            {
                case ShotKind.Slash:
                {
                    var t = Find(s.TargetId);
                    if (t == null) return;
                    DamageLord(t, s.Damage, s.Crit);
                    if (!t.Dead && !t.Def.IsBoss) TryStun(t, s);
                    Events.Add(new BattleEvent { Type = Ev.Hit, Pos = t.Pos, Shot = s.Kind, Radius = 0.6f, Crit = s.Crit, EnemyId = t.Id });
                    return;
                }
                case ShotKind.Bolt:
                case ShotKind.Ball:
                case ShotKind.Boulder:
                    HitWall(s.Damage, s.To);
                    if (s.Kind != ShotKind.Bolt) Events.Add(new BattleEvent { Type = Ev.Explode, Pos = s.To, Radius = s.Kind == ShotKind.Ball ? 1.4f : 0.9f });
                    return;
                case ShotKind.Hammer:
                {
                    var slot = s.TargetId >= 0 && s.TargetId < Slots.Count ? Slots[s.TargetId] : null;
                    if (slot?.Unit != null)
                    {
                        slot.Unit.Stun = Math.Max(slot.Unit.Stun, s.Stun);
                        Events.Add(new BattleEvent { Type = Ev.UnitStun, Pos = slot.Pos, Slot = slot.Index, Radius = s.Stun });
                    }
                    Events.Add(new BattleEvent { Type = Ev.Hit, Pos = s.To, Shot = s.Kind, Radius = 0.8f });
                    return;
                }
                case ShotKind.Arrow:
                {
                    var t = Find(s.TargetId);
                    var seek = s.Aim.X != 0f || s.Aim.Y != 0f ? s.Aim : s.To;
                    if (t == null) t = Nearest(seek, 0.6f);
                    var aim = t?.Pos ?? seek;
                    var dir = aim - s.From;
                    float dist = (float)Math.Sqrt(dir.Len2);
                    dir = dist > 0.01f ? dir * (1f / dist) : new V2(0, 1f);

                    if (t != null) Damage(t, s.Damage, s.Hero, s.Crit);
                    // 穿透只认射线上、排在第一目标身后的人。同一排并排的不算，打到第 pierce 个身后的就停。
                    var hit = LineBehind(s.From, aim, t?.Id ?? -1, s.Pierce);
                    var endPos = aim + dir * 0.35f;
                    int pierced = 0;
                    if (hit.Count > 0)
                    {
                        var hd = Defs.Hero(s.Hero);
                        for (int k = 0; k < hit.Count; k++)
                        {
                            var pe = hit[k];
                            float mul = hd.PierceGrow > 0 ? 1f + hd.PierceGrow * (k + 1) : 0.85f;
                            Damage(pe, s.Damage * mul, s.Hero, false);
                            Events.Add(new BattleEvent
                            {
                                Type = Ev.Hit, From = aim, Pos = pe.Pos, Hero = s.Hero,
                                Shot = ShotKind.Arrow, Radius = 0.35f, Crit = s.Crit, Value = k + 1, EnemyId = pe.Id
                            });
                            pierced++;
                        }
                        var last = hit[hit.Count - 1];
                        endPos = last.Pos;
                    }
                    float blast = Stat(s.Hero, Eff.Blast);
                    if (blast > 0)
                    {
                        var at = t?.Pos ?? seek;
                        float br = BlastR * (blast > 1f ? 1.35f : 1f);
                        Splash(s, at, br, s.Damage * blast, 0f);
                        Events.Add(new BattleEvent { Type = Ev.Explode, Pos = at, Radius = br, Value = 1, Hero = s.Hero });
                    }
                    Events.Add(new BattleEvent
                    {
                        Type = Ev.Hit, From = s.From, Pos = endPos, Hero = s.Hero,
                        Shot = ShotKind.Arrow, Radius = s.Radius, Crit = s.Crit || s.Ult,
                        Value = pierced > 0 ? -pierced : 0, EnemyId = t?.Id ?? -1
                    });
                    return;
                }
                case ShotKind.Beam:
                {
                    var a = s.From;
                    var ab = s.To - a;
                    float len2 = Math.Max(0.01f, ab.Len2);
                    foreach (var e in Enemies)
                    {
                        if (e.Dead || e.Pos.Y > Layout.EngageY) continue;
                        var ap = e.Pos - a;
                        float k = Math.Max(0f, Math.Min(1f, (ap.X * ab.X + ap.Y * ab.Y) / len2));
                        float rr = s.Radius + e.Def.Size * 0.2f;
                        if ((e.Pos - (a + ab * k)).Len2 > rr * rr) continue;
                        bool main = e.Id == s.TargetId;
                        Damage(e, main ? s.Damage : s.Damage * 0.6f, s.Hero, s.Crit && main);
                        ApplySlow(e, s);
                        TryStun(e, s);
                    }
                    Events.Add(new BattleEvent { Type = Ev.Hit, Pos = s.To, Hero = s.Hero, Shot = s.Kind, Radius = 0.35f, Crit = s.Crit });
                    return;
                }
                case ShotKind.Bomb:
                case ShotKind.MiniBomb:
                case ShotKind.Fireball:
                    Splash(s, s.To, s.Radius, s.Damage, s.Knock);
                    EmitHit(s, s.Radius);
                    if (s.Split)
                    {
                        for (int k = 0; k < 3; k++)
                        {
                            float ang = (float)(k * Math.PI * 2 / 3 + _rng.F());
                            var to = s.To + new V2((float)Math.Cos(ang), (float)Math.Sin(ang)) * _rng.Range(0.9f, 1.5f);
                            Shots.Add(new Shot { Id = _nextId++, Kind = ShotKind.MiniBomb, Hero = s.Hero, From = s.To, To = to, Dur = 0.35f, Damage = s.Damage * 0.4f, Radius = 0.6f });
                        }
                    }
                    return;
                case ShotKind.Lightning:
                {
                    Splash(s, s.To, s.Radius, s.Damage, 0);
                    EmitHit(s, s.Radius);
                    if (s.Pierce > 1)
                    {
                        var chain = Around(s.To, 2.4f, s.TargetId, s.Pierce - 1);
                        V2 from = s.To;
                        float delay = 0;
                        foreach (var e in chain)
                        {
                            delay += 0.06f;
                            Shots.Add(new Shot
                            {
                                Id = _nextId++, Kind = ShotKind.Lightning, Hero = s.Hero, From = from, To = e.Pos, TargetId = e.Id,
                                T = -delay, Dur = 0.05f, Damage = s.Damage * 0.6f, Radius = 0.45f, Pierce = 0, Stun = s.Stun, StunChance = s.StunChance, Slow = s.Slow,
                            });
                            from = e.Pos;
                        }
                    }
                    return;
                }
                case ShotKind.Punch:
                case ShotKind.Slam:
                    Splash(s, s.To, s.Radius, s.Damage, s.Knock, true);
                    EmitHit(s, s.Radius);
                    return;
                case ShotKind.Spear:
                {
                    // 一枪贯穿目标和它身后同一列的敌人；「枪出如龙」后身后的也吃全额。
                    float rear = s.Ult || Stat(s.Hero, Eff.Reach) > 3f ? 1f : 0.7f;
                    foreach (var e in Enemies)
                    {
                        if (e.Dead || e.Def.Flying) continue;
                        float half = s.Radius + e.Def.Size * 0.2f;
                        if (Math.Abs(e.Pos.X - s.To.X) > half || e.Pos.Y < s.To.Y - 0.5f || e.Pos.Y > s.To.Y + 2.2f + s.Reach) continue;
                        Damage(e, e.Id == s.TargetId ? s.Damage : s.Damage * rear, s.Hero, s.Crit && e.Id == s.TargetId);
                        ApplySlow(e, s);
                        TryStun(e, s, s.Ult ? 0.4f : 0f);
                        ApplyKnock(e, s.Knock);
                    }
                    EmitHit(s, s.Radius);
                    return;
                }
                case ShotKind.Stone:
                {
                    var t = Find(s.TargetId) ?? Nearest(s.To, 0.6f);
                    if (t != null)
                    {
                        Damage(t, s.Damage, s.Hero, s.Crit);
                        TryStun(t, s, s.Ult ? 0.5f : 0f);
                        s.Hit.Add(t.Id);
                    }
                    EmitHit(s, s.Radius);
                    if (s.Pierce > 0)
                    {
                        Enemy next = null;
                        float bd = 2.8f * 2.8f;
                        foreach (var e in Enemies)
                        {
                            if (e.Dead || s.Hit.Contains(e.Id) || e.Pos.Y > Layout.EngageY) continue;
                            float d = (e.Pos - s.To).Len2;
                            if (d < bd) { bd = d; next = e; }
                        }
                        if (next != null)
                            Shots.Add(new Shot
                            {
                                Id = _nextId++, Kind = ShotKind.Stone, Hero = s.Hero, From = s.To, To = next.Pos, TargetId = next.Id,
                                Dur = 0.22f, Damage = s.Damage * 0.8f, Radius = s.Radius, Pierce = s.Pierce - 1, Stun = s.Stun, StunChance = s.StunChance,
                                Hit = s.Hit, Ult = s.Ult,
                            });
                    }
                    return;
                }
                case ShotKind.Wind:
                {
                    foreach (var e in Enemies)
                    {
                        if (e.Dead) continue;
                        float rr = s.Radius + e.Def.Size * 0.25f;
                        if ((e.Pos - s.To).Len2 > rr * rr) continue;
                        Damage(e, e.Id == s.TargetId || s.Ult ? s.Damage : s.Damage * 0.5f, s.Hero, s.Crit && e.Id == s.TargetId);
                        ApplySlow(e, s);
                        TryStun(e, s);
                    }
                    EmitHit(s, s.Radius);
                    return;
                }
                case ShotKind.Lasso:
                {
                    var t = Find(s.TargetId) ?? Nearest(s.To, 0.8f);
                    if (t != null)
                    {
                        Damage(t, s.Damage, s.Hero, s.Crit);
                        TryStun(t, s, 0.4f);
                        ApplyKnock(t, s.Knock);
                        if (s.Radius > 0.6f)
                        {
                            foreach (var e in Enemies)
                            {
                                if (e.Dead || e == t) continue;
                                float rr = s.Radius + e.Def.Size * 0.2f;
                                if ((e.Pos - t.Pos).Len2 > rr * rr) continue;
                                Damage(e, s.Damage * 0.5f, s.Hero, false);
                                if (!e.Big) e.Stun = Math.Max(e.Stun, 0.6f);
                            }
                        }
                    }
                    EmitHit(s, s.Radius);
                    return;
                }
                case ShotKind.Qi:
                    // 刀气从落刀处沿整列往敌阵飞，路上碰到的都挨一下。
                    foreach (var e in Enemies)
                    {
                        if (e.Dead || e.Pos.Y > Layout.EngageY) continue;
                        float half = s.Radius + e.Def.Size * 0.2f;
                        if (Math.Abs(e.Pos.X - s.From.X) > half || e.Pos.Y < s.From.Y - 0.4f || e.Pos.Y > s.To.Y + 0.4f) continue;
                        Damage(e, s.Damage, s.Hero, false);
                    }
                    Events.Add(new BattleEvent { Type = Ev.Hit, Pos = s.To, Hero = s.Hero, Shot = s.Kind, Radius = s.Radius });
                    return;
                case ShotKind.Frost:
                    foreach (var e in Enemies)
                    {
                        if (e.Dead) continue;
                        float rr = s.Radius + e.Def.Size * 0.25f;
                        if ((e.Pos - s.To).Len2 > rr * rr) continue;
                        Damage(e, s.Damage, s.Hero, false);
                        if (!e.Big) e.Stun = Math.Max(e.Stun, s.Stun);
                        e.SlowT = Math.Max(e.SlowT, 3f);
                    }
                    EmitHit(s, s.Radius);
                    return;
            }
        }

        void EmitHit(Shot s, float r) => Events.Add(new BattleEvent { Type = Ev.Hit, Pos = s.To, Hero = s.Hero, Shot = s.Kind, Radius = r, Crit = s.Crit || s.Ult });

        Enemy Nearest(V2 p, float r)
        {
            Enemy best = null;
            float bd = r * r;
            foreach (var e in Enemies)
            {
                if (e.Dead) continue;
                float d = (e.Pos - p).Len2;
                if (d < bd) { bd = d; best = e; }
            }
            return best;
        }

        /// <summary>箭射出时把落点延伸到直线上最后一个会被贯穿的人（身后无人时也向前穿出一小截破风距离），飞行时间按这段路算。</summary>
        void AimPierce(Shot shot, V2 from, Enemy first, int pierce)
        {
            if (pierce <= 0 || first == null) return;
            var dir = first.Pos - from;
            float dist = (float)Math.Sqrt(dir.Len2);
            if (dist < 0.01f) return;
            dir *= 1f / dist;
            var line = LineBehind(from, first.Pos, first.Id, pierce);
            if (line.Count == 0)
            {
                // 即使发射瞬间身后暂时没扫到第二个怪，穿透箭也向前多飞穿 1.85 格，飞抵瞬间若有后排怪踏入箭路照样贯穿！
                float probe = dist + 1.85f;
                shot.To = from + dir * probe;
                shot.Dur = ShotDur(ShotKind.Arrow, probe);
                return;
            }
            var last = line[line.Count - 1];
            float reach = (last.Pos.X - from.X) * dir.X + (last.Pos.Y - from.Y) * dir.Y + 0.35f;
            if (reach <= dist + 0.2f) return;
            shot.To = from + dir * reach;
            shot.Dur = ShotDur(ShotKind.Arrow, reach + 0.25f);
        }

        /// <summary>落点已经设在第一个人后面，飞行中不要再改回他身上。</summary>
        bool ArrowAlreadyPastFirst(Shot s, Enemy first)
        {
            if (s.Kind != ShotKind.Arrow || s.Pierce <= 0) return false;
            var dir = first.Pos - s.From;
            float dist = (float)Math.Sqrt(dir.Len2);
            if (dist < 0.01f) return false;
            dir *= 1f / dist;
            float along = (s.To.X - s.From.X) * dir.X + (s.To.Y - s.From.Y) * dir.Y;
            return along > dist + 0.3f;
        }

        /// <summary>
        /// 沿 from→aim 的直线，排在落点身位之后的敌人，由近到远，最多 max 个。
        /// 同一排（沿射线没有拉开半个身位）不算；射线宽度按真实战场怪物体积放宽，杜绝身后怪擦肩漏穿！
        /// </summary>
        List<Enemy> LineBehind(V2 from, V2 aim, int skipId, int max)
        {
            var list = new List<Enemy>();
            if (max <= 0) return list;
            var dir = aim - from;
            float dist = (float)Math.Sqrt(dir.Len2);
            if (dist < 0.01f) dir = new V2(0f, 1f);
            else dir *= 1f / dist;
            const float minAhead = 0.42f;
            const float lane = 0.72f;
            foreach (var e in Enemies)
            {
                if (e.Dead || e.Diving || e.Id == skipId || e.Pos.Y > Layout.EngageY) continue;
                var relX = e.Pos.X - from.X;
                var relY = e.Pos.Y - from.Y;
                float along = relX * dir.X + relY * dir.Y;
                float side = relX * -dir.Y + relY * dir.X;
                if (along < dist + minAhead) continue;
                if (Math.Abs(side) > lane + e.Def.Size * 0.24f) continue;
                list.Add(e);
            }
            list.Sort((a, b) =>
            {
                float aa = (a.Pos.X - from.X) * dir.X + (a.Pos.Y - from.Y) * dir.Y;
                float bb = (b.Pos.X - from.X) * dir.X + (b.Pos.Y - from.Y) * dir.Y;
                return aa.CompareTo(bb);
            });
            if (list.Count > max) list.RemoveRange(max, list.Count - max);
            return list;
        }

        List<Enemy> Around(V2 p, float r, int skip, int max)
        {
            var list = new List<Enemy>();
            foreach (var e in Enemies)
                if (!e.Dead && e.Id != skip && (e.Pos - p).Len2 < r * r) list.Add(e);
            list.Sort((a, b) => (a.Pos - p).Len2.CompareTo((b.Pos - p).Len2));
            if (list.Count > max) list.RemoveRange(max, list.Count - max);
            return list;
        }

        void Splash(Shot s, V2 p, float r, float dmg, float knock, bool ground = false)
        {
            for (int i = 0; i < Enemies.Count; i++)
            {
                var e = Enemies[i];
                if (e.Dead || (ground && e.Def.Flying)) continue;
                float rr = r + e.Def.Size * 0.25f;
                if ((e.Pos - p).Len2 > rr * rr) continue;
                Damage(e, dmg, s.Hero, s.Crit);
                TryStun(e, s, s.Ult ? 0.4f : 0f);
                ApplySlow(e, s);
                ApplyKnock(e, knock);
            }
        }

        /// <summary>克制关系：重甲减物理、怕法术；飞行被射手克制。</summary>
        public static float Affinity(EnemyDef e, HeroDef h)
        {
            float m = 1f;
            if (h.Physical) m *= 1f - e.PhysResist;
            else m *= 1f + e.MagicWeak;
            if (h.Kind == Role.Archer) m *= 1f + e.ArcherWeak;
            return m;
        }

        void Damage(Enemy e, float dmg, HeroId h, bool crit)
        {
            if (e.Dead) return;
            dmg *= Affinity(e.Def, Defs.Hero(h));
            if (e.Big) dmg *= 1f + Stat(h, Eff.Elite) + _bondElite;
            if (e.Def.Flying) dmg *= 1f + Stat(h, Eff.Fly) + _bondFlyCav;
            if (e.Mounted) dmg *= 1f + Stat(h, Eff.Cav) + _bondFlyCav;
            if (e.SlowT > 0 || e.Stun > 0)
            {
                float sh = Stat(h, Eff.Shatter);
                dmg *= 1f + sh + Lo.ControlDmg;
                if (!crit && sh > 0 && _rng.Chance(0.25f)) { dmg *= Lo.CritDmg; crit = true; }
            }
            float exec = Stat(h, Eff.Exec);
            if (exec > 0)
            {
                if (e.Hp < e.MaxHp * 0.5f) dmg *= 1f + exec;
                if (Wall < WallMax * 0.5f) dmg *= 1.35f;
            }
            if (Wave <= 3 && Lo.EarlyWaveDmg > 0) dmg *= 1f + Lo.EarlyWaveDmg;
            dmg *= MetaMul(e);
            Deal(e, dmg, h, crit, false);
            if (e.Dead) return;
            var hd = Defs.Hero(h);
            float burn = hd.Dot + Stat(h, Eff.Burn);
            if (burn > 0)
            {
                float dps = dmg * burn / Defs.BurnDur;
                if (e.BurnT <= 0) { e.BurnDps = dps; e.BurnTick = Defs.BurnEvery; }
                else e.BurnDps = Math.Max(e.BurnDps, dps);
                e.BurnT = Defs.BurnDur;
                e.BurnBy = h;
                if (hd.AntiHeal) e.AntiHeal = true;
            }
            float vuln = Stat(h, Eff.Vuln);
            if (vuln > 0)
            {
                e.Vuln = e.VulnT > 0 ? Math.Max(e.Vuln, vuln) : vuln;
                e.VulnT = Defs.VulnDur;
            }
        }

        /// <summary>灼烧/中毒每半秒跳一次；破绽倒计时。</summary>
        void UpdateDots(float dt)
        {
            for (int i = 0; i < Enemies.Count; i++)
            {
                var e = Enemies[i];
                if (e.Dead) continue;
                if (e.VulnT > 0) e.VulnT -= dt;
                if (e.BurnT <= 0) continue;
                e.BurnT -= dt;
                e.BurnTick -= dt;
                if (e.BurnTick > 0) continue;
                e.BurnTick += Defs.BurnEvery;
                Deal(e, e.BurnDps * Defs.BurnEvery, e.BurnBy, false, false, true);
            }
        }

        /// <summary>局外对精英/首领专属加成（全军增伤 Lo.DmgMul 已统一计入面板攻击 HeroDmgMul 与 LordPower）。</summary>
        float MetaMul(Enemy e) => e.Def.IsBoss ? Lo.BossDmg : e.Def.Rank == EnemyRank.Elite ? Lo.EliteDmg : 1f;

        /// <summary>寨主剑气：物理伤害，不吃好汉强化。</summary>
        void DamageLord(Enemy e, float dmg, bool crit)
        {
            if (e.Dead) return;
            if (e.Big) dmg *= Lo.LordBig;
            Deal(e, dmg * (1f - e.Def.PhysResist) * MetaMul(e), Lineup[0], crit, true);
        }

        void Deal(Enemy e, float dmg, HeroId h, bool crit, bool lord, bool dot = false)
        {
            if (e.Diving) return;
            if (e.RageT > 0) dmg *= 0.5f;
            if (e.VulnT > 0) dmg *= 1f + e.Vuln;
            if (e.Guard > 0 && !dot)
            {
                e.Guard--;
                e.HitT = 0.12f;
                Events.Add(new BattleEvent { Type = Ev.Guard, Pos = e.Pos, EnemyId = e.Id, Value = e.Guard });
                return;
            }
            if (!dot && e.Def.Kind == EnemyKind.Scout && e.AbilT <= 0 && !e.Attacking && _rng.Chance(0.25f))
            {
                e.AbilT = 1.5f;
                e.Pos.Y = Math.Max(e.Def.StopY, e.Pos.Y - 1.2f);
                float sm = Layout.RoadMaxX(e.Pos.Y, e.Def.Size);
                e.Pos.X = M.Clamp(e.Pos.X + _rng.Range(-0.75f, 0.75f), -sm, sm);
                Events.Add(new BattleEvent { Type = Ev.Blink, Pos = e.Pos, EnemyId = e.Id });
                return;
            }
            if (e.Def.Kind == EnemyKind.Berserker && !e.Raged && e.Hp - dmg < e.MaxHp * 0.3f)
            {
                e.Raged = true;
                e.RageT = 2f;
                dmg = Math.Min(dmg, e.Hp - 1f);
                Events.Add(new BattleEvent { Type = Ev.Berserk, Pos = e.Pos, EnemyId = e.Id });
            }
            if (e.Shield > 0)
            {
                float a = Math.Min(e.Shield, dmg);
                e.Shield -= a;
                dmg -= a;
                if (dmg <= 0) { e.HitT = 0.12f; return; }
            }
            float dealt = Math.Min(dmg, e.Hp);
            e.Hp -= dmg;
            if (!dot) e.HitT = 0.12f;
            if (lord) LordDamage += dealt;
            else DamageBy[(int)h] += dealt;
            Events.Add(new BattleEvent { Type = Ev.Damage, Pos = e.Pos, Value = (int)Math.Ceiling(dmg), Hero = h, Crit = crit, EnemyId = e.Id, Shot = lord ? ShotKind.Slash : default });
            if (e.Hp > 0)
            {
                if ((e.Def.IsBoss || e.IsStageLeader) && Stage.Mode != StageMode.Escort)
                {
                    var eco = Balance.Current.Economy;
                    while ((e.BossDrops == 0 && eco.BossDropHp1 > 0f && e.Hp <= e.MaxHp * eco.BossDropHp1)
                        || (e.BossDrops == 1 && eco.BossDropHp2 > 0f && e.Hp <= e.MaxHp * eco.BossDropHp2))
                    {
                        e.BossDrops++;
                        int pCoin = Defs.BossPhaseDropCoin(Wave);
                        if (pCoin > 0)
                        {
                            Coins += pCoin;
                            CoinsFromBossPhase += pCoin;
                            Emit(Ev.Coin, e.Pos, -1, pCoin);
                        }
                    }
                }
                return;
            }
            e.Dead = true;
            Kills++;
            int coin = Defs.KillCoin(e.Def, Wave, CoinAura);
            // 普通关第4波守关主精英对齐原第4波统领基础赏银，保证玩家单局经济曲线一分不少
            if (e.IsStageLeader && !e.Def.IsBoss)
            {
                var eco = Balance.Current.Economy;
                int leadBase = (int)Math.Round(340f * eco.BigKillCoinMul * (1f + CoinAura));
                if (leadBase > coin) coin = leadBase;
            }
            Coins += coin;
            CoinsFromKills += coin;
            Events.Add(new BattleEvent { Type = Ev.Kill, Pos = e.Pos, Value = coin, EnemyId = e.Id, Hero = h });
            if (e.BurnT > 0 && (Stat(e.BurnBy, Eff.Burn) > 1.0f || (_awakened[(int)e.BurnBy] && Defs.Hero(e.BurnBy).Element == "火系")))
            {
                Events.Add(new BattleEvent { Type = Ev.Explode, Pos = e.Pos, EnemyId = e.Id, Radius = 1.35f, Value = 1, Hero = e.BurnBy });
                Splash(new Shot { Hero = e.BurnBy }, e.Pos, 1.35f, Math.Max(e.BurnDps * 1.65f, HeroAtk(e.BurnBy, 1) * 1.15f), 0.16f);
            }
            switch (e.Def.Kind)
            {
                case EnemyKind.Porter:
                    PortersKilled++;
                    Events.Add(new BattleEvent { Type = Ev.PorterKilled, Pos = e.Pos, EnemyId = e.Id });
                    break;
                case EnemyKind.FireBomb:
                    Events.Add(new BattleEvent { Type = Ev.Explode, Pos = e.Pos, EnemyId = e.Id, Radius = 1.3f });
                    Splash(new Shot { Hero = h }, e.Pos, 1.3f, e.MaxHp * 3f, 0.3f);
                    break;
                case EnemyKind.Brute:
                    _bruteDrops.Add(e.Pos);
                    break;
                case EnemyKind.GiantBrute:
                    _giantBruteDrops.Add(e.Pos);
                    break;
            }
            if (e.Def.Rank == EnemyRank.Elite) ElitesKilled++;
            if (e.Def.IsBoss) BossesKilled++;
            // 生辰纲：单局仅第4波守关首领或普通关第4波守关主精英倒下掉唯一一次（真实随机摇奖，不再写死必中全同色），第9波压轴精英只掉赏银。
            if ((e.Def.IsBoss || e.IsStageLeader) && Stage.Mode != StageMode.Escort && _treasureDropped == 0)
            {
                _treasureDropped++;
                PendingReels++;
                Events.Add(new BattleEvent { Type = Ev.Treasure, Pos = e.Pos, EnemyId = e.Id, Value = 0 });
            }
        }

        // ---------------- 寨主技能 ----------------

        public float LordPower => Lo.Atk * Lo.LordPct * Lo.LordMul * Lo.DmgMul;
        /// <summary>天书连斩时每道剑气间隔秒数。</summary>
        public const float LordHitGap = 0.45f;

        void UpdateLord(float dt)
        {
            LordT -= dt;
            if (LordT > 0) return;
            var pool = new List<Enemy>();
            foreach (var e in Enemies)
            {
                if (e.Dead || e.Escaped || !Layout.InLordRange(e.Pos)) continue;
                pool.Add(e);
            }
            // 一直等的话，冷却圈会停在满圈上，看起来像卡住。过了宽限就空过这一轮，圈按下一轮冷却重新转。
            if (pool.Count == 0 && LordT > -Defs.LordHold) return;
            LordDur = Math.Max(0.5f, Lo.LordCd);
            LordT = LordDur;
            if (pool.Count == 0) return;
            var origin = Layout.LordOrigin;
            var aim = LordCrowdAim(pool);
            LordCasts++;
            int hits = Math.Max(1, Lo.LordHits);
            for (int k = 0; k < hits; k++)
                foreach (var e in pool)
                {
                    float dmg = LordPower;
                    bool crit = _rng.Chance(Math.Min(0.8f, Lo.Crit));
                    if (crit) dmg *= Lo.CritDmg;
                    Shots.Add(new Shot
                    {
                        Id = _nextId++, Kind = ShotKind.Slash, From = origin, To = aim, TargetId = e.Id,
                        T = -Layout.LordHitDelay(e.Pos) - k * LordHitGap,
                        Dur = 0.01f, Damage = dmg, Crit = crit, Ult = true,
                        Stun = Lo.LordStun, StunChance = Lo.LordStun > 0 ? 1f : 0f,
                    });
                }
            Events.Add(new BattleEvent { Type = Ev.LordSkill, Pos = origin, From = aim, Slot = hits, Value = LordCasts });
        }

        /// <summary>半圆里最密的一团人的中心。人少的那一侧即使更近也不抢剑气。</summary>
        static V2 LordCrowdAim(List<Enemy> pool)
        {
            var origin = Layout.LordOrigin;
            Enemy best = pool[0];
            int bestN = -1;
            float bestD = float.MaxValue;
            foreach (var a in pool)
            {
                int n = 0;
                foreach (var b in pool)
                    if ((a.Pos - b.Pos).Len2 <= 2.25f) n++;
                float d = (a.Pos - origin).Len2;
                if (n > bestN || (n == bestN && d < bestD)) { bestN = n; bestD = d; best = a; }
            }
            float sx = 0f, sy = 0f;
            int c = 0;
            foreach (var b in pool)
                if ((b.Pos - best.Pos).Len2 <= 2.25f) { sx += b.Pos.X; sy += b.Pos.Y; c++; }
            return new V2(sx / c, sy / c);
        }

        // ---------------- 大招 ----------------

        void UpdateUlts(float dt)
        {
            foreach (var hero in Lineup)
            {
                int h = (int)hero;
                if (!HasUlt(hero)) continue;
                var best = SlotOf(hero);
                if (best == null || best.Unit.Stun > 0) continue;
                UltTimer[h] -= dt * HeroSpeedMul(hero) * (1f + ChargeAura);
                if (UltTimer[h] > 0 || Enemies.Count == 0) continue;
                var def = Defs.Hero(hero);
                if (def.Ult == UltKind.Heal && Wall > WallMax * 0.85f && !AnyStunned()) { UltTimer[h] = 0.5f; continue; }
                var c = Densest(def.Melee ? Layout.StopY + HeroRange(hero) : 99f, def.Melee);
                if (c == null) { UltTimer[h] = 0.5f; continue; }
                UltTimer[h] = UltCd(hero);
                CastUlt(hero, best, c);
            }
        }

        bool AnyStunned()
        {
            foreach (var s in Slots) if (s.Unit != null && s.Unit.Stun > 0) return true;
            return false;
        }

        Enemy Densest(float maxY, bool ground)
        {
            Enemy best = null;
            int bestN = -1;
            foreach (var a in Enemies)
            {
                if (a.Dead || a.Pos.Y > maxY || a.Pos.Y > Layout.EngageY - 0.3f || (ground && a.Def.Flying)) continue;
                int n = 0;
                foreach (var b in Enemies)
                    if (!b.Dead && (a.Pos - b.Pos).Len2 < 2.25f) n++;
                if (a.Big) n += 4;
                if (n > bestN) { bestN = n; best = a; }
            }
            return best;
        }

        List<Enemy> FrontTargets()
        {
            var targets = new List<Enemy>(Enemies);
            targets.RemoveAll(e => e.Dead || e.Pos.Y > Layout.EngageY - 0.3f);
            targets.Sort((a, b) => a.Pos.Y.CompareTo(b.Pos.Y));
            return targets;
        }

        /// <summary>首领 &gt; 精英 &gt; 血最多。</summary>
        Enemy Strongest()
        {
            Enemy best = null;
            float bs = -1;
            foreach (var e in Enemies)
            {
                if (e.Dead || e.Pos.Y > Layout.EngageY - 0.3f) continue;
                float s = e.Hp + (e.Def.IsBoss ? 1e7f : e.Big ? 1e6f : 0);
                if (s > bs) { bs = s; best = e; }
            }
            return best;
        }

        void CastUlt(HeroId hero, Slot from, Enemy focus)
        {
            var u = from.Unit;
            var def = u.Def;
            float power = UltPower(hero, u.Star) * def.UltCoef;
            float boost = 1f + Stat(hero, Eff.UltPow);
            var at = focus.Pos;
            Events.Add(new BattleEvent { Type = Ev.Ult, Slot = from.Index, Hero = hero, Pos = at, Value = u.Star });
            switch (def.Ult)
            {
                case UltKind.Thunder:
                {
                    var targets = FrontTargets();
                    for (int i = 0; i < def.UltN; i++)
                    {
                        V2 p = i == 0 ? at : targets.Count > 0 ? targets[_rng.Int(Math.Min(targets.Count, 14))].Pos : at;
                        Shots.Add(new Shot
                        {
                            Id = _nextId++, Kind = ShotKind.Lightning, Hero = hero, From = p + new V2(0, 6), To = p, T = -i * 0.16f,
                            Dur = 0.08f, Damage = power, Radius = def.UltRadius, Stun = def.UltStun, StunChance = 1f, Ult = true,
                        });
                    }
                    break;
                }
                case UltKind.Frost:
                    Shots.Add(new Shot
                    {
                        Id = _nextId++, Kind = ShotKind.Frost, Hero = hero, From = from.Pos, To = at, Dur = 0.35f,
                        Damage = power, Radius = def.UltRadius, Stun = def.UltStun, Ult = true,
                    });
                    break;
                case UltKind.Sweep:
                    for (int i = 0; i < def.UltN; i++)
                    {
                        var p = new V2(-3.6f + i * 7.2f / Math.Max(1, def.UltN - 1), Layout.StopY + 1.1f);
                        Shots.Add(new Shot
                        {
                            Id = _nextId++, Kind = ShotKind.Slam, Hero = hero, From = from.Pos, To = p, T = -i * 0.1f, Dur = 0.1f,
                            Damage = power, Radius = 1.5f, Knock = 1.2f, Ult = true,
                        });
                    }
                    break;
                case UltKind.Haste:
                    HasteT = Math.Max(HasteT, 8f * boost);
                    HasteMul = Math.Max(HasteMul, 1.6f);
                    break;
                case UltKind.Heal:
                    HealWall(WallMax * def.UltCoef * boost * (0.9f + 0.1f * u.Star), from.Pos, hero);
                    foreach (var s in Slots) if (s.Unit != null) s.Unit.Stun = 0;
                    break;
                case UltKind.Bind:
                {
                    var targets = new List<Enemy>(Enemies);
                    targets.RemoveAll(e => e.Dead || e.Pos.Y > Layout.EngageY - 0.3f);
                    targets.Sort((a, b) => (b.Big ? 1 : 0).CompareTo(a.Big ? 1 : 0) != 0 ? (b.Big ? 1 : 0).CompareTo(a.Big ? 1 : 0) : a.Pos.Y.CompareTo(b.Pos.Y));
                    int n = def.UltN + (int)Stat(hero, Eff.Count);
                    for (int i = 0; i < n && i < targets.Count; i++)
                    {
                        var t = targets[i];
                        Shots.Add(new Shot
                        {
                            Id = _nextId++, Kind = ShotKind.Lasso, Hero = hero, From = from.Pos, To = t.Pos, TargetId = t.Id, T = -i * 0.07f,
                            Dur = 0.25f, Damage = power, Radius = 0.5f, Stun = def.UltStun + Stat(hero, Eff.Stun), StunChance = 1f, Ult = true,
                        });
                    }
                    break;
                }
                case UltKind.Snipe:
                {
                    var t = Strongest() ?? focus;
                    Shots.Add(new Shot
                    {
                        Id = _nextId++, Kind = ShotKind.Arrow, Hero = hero, From = from.Pos, To = t.Pos, TargetId = t.Id,
                        Dur = 0.3f, Damage = power, Radius = 0.5f, Crit = true, Ult = true,
                    });
                    break;
                }
                case UltKind.Tornado:
                    Shots.Add(new Shot
                    {
                        Id = _nextId++, Kind = ShotKind.Wind, Hero = hero, From = from.Pos, To = at, Dur = 0.45f,
                        Damage = power, Radius = def.UltRadius * (1f + Stat(hero, Eff.Area) * 0.5f), Slow = 3f,
                        Stun = def.UltStun, StunChance = 1f, Ult = true,
                    });
                    break;
                case UltKind.Meteor:
                {
                    var targets = FrontTargets();
                    for (int i = 0; i < def.UltN; i++)
                    {
                        V2 p = i == 0 ? at : targets.Count > 0 ? targets[_rng.Int(Math.Min(targets.Count, 12))].Pos : at;
                        Shots.Add(new Shot
                        {
                            Id = _nextId++, Kind = ShotKind.Fireball, Hero = hero, From = p + new V2(-1.2f, 6f), To = p, T = -i * 0.18f,
                            Dur = 0.5f, Damage = power, Radius = def.UltRadius, Knock = 0.4f, Ult = true,
                        });
                    }
                    break;
                }
            }
        }
    }
}
