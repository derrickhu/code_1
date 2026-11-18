using System.Collections.Generic;

namespace Liangshan.Sim
{
    /// <summary>合成升星解锁的一条攻击质变。数值是累加的：3 星同时拥有 2 星和 3 星那两条。</summary>
    public sealed class StarTrait
    {
        public int Star;
        public string Name, Desc;
        public float Area, Crit, Stun, StunP, Chan, Buff, Cd, Pull, Reach;
        public int Pierce, Shots;
        public bool Qi, After, Twin, Split;
    }

    /// <summary>合成后累计生效的质变。</summary>
    public struct StarFx
    {
        public float Area, Crit, Stun, StunP, Chan, Buff, Cd, Pull, Reach;
        public int Pierce, Shots;
        public bool Qi, After, Twin, Split;
    }

    public static class StarTraits
    {
        static readonly StarTrait[] Arrow =
        {
            new StarTrait { Star = 2, Name = "穿云", Desc = "弹体穿透 +1 个敌人", Pierce = 1 },
            new StarTrait { Star = 3, Name = "百步穿杨", Desc = "暴击率 +22%", Crit = 0.22f },
            new StarTrait { Star = 4, Name = "贯日觉醒", Desc = "穿透再 +1，暴击率再 +18%", Pierce = 1, Crit = 0.18f },
        };

        /// <summary>单点狙杀型射手（解珍、燕青）：没选「穿杨 / 破甲箭」穿透强化词条前严格不自带穿透，升星给暴击与攻速爆发！</summary>
        static readonly StarTrait[] SniperArrow =
        {
            new StarTrait { Star = 2, Name = "鹰眸", Desc = "暴击率 +18%", Crit = 0.18f },
            new StarTrait { Star = 3, Name = "追猎", Desc = "技能冷却 -15%，暴击率再 +15%", Cd = 0.15f, Crit = 0.15f },
            new StarTrait { Star = 4, Name = "贯甲神射", Desc = "每次出手多射 1 发，暴击率再 +18%", Shots = 1, Crit = 0.18f },
        };

        static readonly StarTrait[] Bomb =
        {
            new StarTrait { Star = 2, Name = "大装药", Desc = "爆炸范围 +25%", Area = 0.25f },
            new StarTrait { Star = 3, Name = "子母弹", Desc = "落地再炸出 3 颗小弹", Split = true },
            new StarTrait { Star = 4, Name = "震村巨响", Desc = "爆炸 30% 几率震晕 0.6 秒", Stun = 0.6f, StunP = 0.3f },
        };

        static readonly StarTrait[] Blade =
        {
            new StarTrait { Star = 2, Name = "破势", Desc = "挥击范围 +30%", Area = 0.30f },
            new StarTrait { Star = 3, Name = "破空劲气", Desc = "首击破空斩出劲风刃气，贯穿整列造成 65% 伤害", Qi = true },
            new StarTrait { Star = 4, Name = "碎甲重斩", Desc = "暴击率 +18%，命中 35% 几率震晕 0.6 秒", Crit = 0.18f, Stun = 0.6f, StunP = 0.35f },
        };

        static readonly StarTrait[] Spear =
        {
            new StarTrait { Star = 2, Name = "破阵", Desc = "冲击加宽 30%", Area = 0.3f },
            new StarTrait { Star = 3, Name = "长驱", Desc = "贯穿距离 +2，25% 几率震住 0.5 秒", Reach = 2f, Stun = 0.5f, StunP = 0.25f },
            new StarTrait { Star = 4, Name = "二段追击", Desc = "紧跟着再追一击，60% 伤害", Twin = true },
        };

        static readonly StarTrait[] Slam =
        {
            new StarTrait { Star = 2, Name = "裂地", Desc = "砸地范围 +25%", Area = 0.25f },
            new StarTrait { Star = 3, Name = "余震", Desc = "落地再震一次，范围更大，50% 伤害", After = true },
            new StarTrait { Star = 4, Name = "山崩", Desc = "命中 35% 几率震晕 0.6 秒", Stun = 0.6f, StunP = 0.35f },
        };

        static readonly StarTrait[] Stone =
        {
            new StarTrait { Star = 2, Name = "连珠", Desc = "多弹跳 1 次", Pierce = 1 },
            new StarTrait { Star = 3, Name = "拍脑门", Desc = "命中 25% 几率拍晕 0.6 秒", Stun = 0.6f, StunP = 0.25f },
            new StarTrait { Star = 4, Name = "漫天连弹", Desc = "再多弹跳 2 次", Pierce = 2 },
        };

        static readonly StarTrait[] Lightning =
        {
            new StarTrait { Star = 2, Name = "并网", Desc = "电弧多连 1 个敌人", Pierce = 1 },
            new StarTrait { Star = 3, Name = "麻痹", Desc = "命中 20% 几率麻痹 0.4 秒", Stun = 0.4f, StunP = 0.2f },
            new StarTrait { Star = 4, Name = "万伏超载", Desc = "施法时间 +1 秒", Chan = 1f },
        };

        static readonly StarTrait[] Wind =
        {
            new StarTrait { Star = 2, Name = "广域", Desc = "作用范围 +25%", Area = 0.25f },
            new StarTrait { Star = 3, Name = "定身", Desc = "命中 25% 几率定住 0.8 秒", Stun = 0.8f, StunP = 0.25f },
            new StarTrait { Star = 4, Name = "天罗", Desc = "作用范围再 +25%", Area = 0.25f },
        };

        static readonly StarTrait[] Beam =
        {
            new StarTrait { Star = 2, Name = "光柱", Desc = "射线加粗 40%", Area = 0.4f },
            new StarTrait { Star = 3, Name = "持续", Desc = "施法时间 +1 秒", Chan = 1f },
            new StarTrait { Star = 4, Name = "炽烈", Desc = "射线再粗 30%，施法再 +0.5 秒", Area = 0.3f, Chan = 0.5f },
        };

        static readonly StarTrait[] Lasso =
        {
            new StarTrait { Star = 2, Name = "缚紧", Desc = "定身时间 +0.5 秒", Stun = 0.5f },
            new StarTrait { Star = 3, Name = "拖拽", Desc = "套中的敌人被往回强拽 0.9 格", Pull = 0.9f },
            new StarTrait { Star = 4, Name = "天罗地网", Desc = "定身再 +0.6 秒，落点震慑周围敌人", Stun = 0.6f, Area = 0.35f },
        };

        static readonly StarTrait[] Support =
        {
            new StarTrait { Star = 2, Name = "精通", Desc = "技能效果 +20%", Buff = 0.2f },
            new StarTrait { Star = 3, Name = "熟练", Desc = "技能冷却 -20%", Cd = 0.2f },
            new StarTrait { Star = 4, Name = "宗师", Desc = "技能效果再 +40%", Buff = 0.4f },
        };

        /// <summary>这位好汉 2/3/4 星分别解锁什么。单发点杀型射手不硬塞免费穿透，只有天生穿透箭（花荣/解宝）或局内选穿透词条才穿怪。</summary>
        public static StarTrait[] Of(HeroDef d)
        {
            if (d.Buff.HasValue) return Support;
            switch (d.Shot)
            {
                case ShotKind.Arrow: return d.Chain > 0 ? Arrow : SniperArrow;
                case ShotKind.Bomb:
                case ShotKind.Fireball: return Bomb;
                case ShotKind.Punch: return Blade;
                case ShotKind.Spear: return Spear;
                case ShotKind.Slam: return Slam;
                case ShotKind.Stone: return Stone;
                case ShotKind.Lightning: return Lightning;
                case ShotKind.Wind: return Wind;
                case ShotKind.Beam: return Beam;
                case ShotKind.Lasso: return Lasso;
                default: return Support;
            }
        }

        /// <summary>升到这一星时新解锁的那条；1 星返回 null。</summary>
        public static StarTrait At(HeroDef d, int star)
        {
            foreach (var t in Of(d)) if (t.Star == star) return t;
            return null;
        }

        static readonly Dictionary<long, StarFx> _cache = new Dictionary<long, StarFx>();

        public static StarFx Fx(HeroDef d, int star)
        {
            long key = (long)d.Id * 8 + star;
            if (_cache.TryGetValue(key, out var fx)) return fx;
            fx = new StarFx();
            foreach (var t in Of(d))
            {
                if (t.Star > star) continue;
                fx.Area += t.Area;
                fx.Crit += t.Crit;
                fx.Stun += t.Stun;
                fx.StunP += t.StunP;
                fx.Chan += t.Chan;
                fx.Buff += t.Buff;
                fx.Cd += t.Cd;
                fx.Pull += t.Pull;
                fx.Reach += t.Reach;
                fx.Pierce += t.Pierce;
                fx.Shots += t.Shots;
                fx.Qi |= t.Qi;
                fx.After |= t.After;
                fx.Twin |= t.Twin;
                fx.Split |= t.Split;
            }
            _cache[key] = fx;
            return fx;
        }
    }
}
