using System.Collections.Generic;
using System.Text.RegularExpressions;
using Liangshan.Sim;
using UnityEngine;

namespace Liangshan
{
    /// <summary>敌人说明：局内点怪的信息卡、「本关敌情」面板与「敌军图鉴 / 敌军详情」共用。</summary>
    public static class EnemyText
    {
        public static string RankName(EnemyDef d) => d.IsBoss ? "首领" : d.Big ? "精英" : "小怪";

        public static Color RankColor(EnemyDef d) => d.IsBoss ? Pal.Hex("FF4B40") : d.Big ? Pal.Hex("A84CFF") : Pal.Hex("5888B8");

        /// <summary>图鉴格卡与详情页左上角的主定位角标（对标参考图：肉盾怪橙、高速怪紫、远程怪绿、飞行怪蓝等；普通步卒留白更清爽）。</summary>
        public static (string text, Color color)? PrimaryBadge(EnemyDef d)
        {
            if (d.Kind == EnemyKind.Porter) return ("财宝怪", Pal.Hex("D4921C"));
            if (d.Flying) return ("飞行怪", Pal.Hex("3B8CD4"));
            if (d.Kind == EnemyKind.FireBomb) return ("自爆怪", Pal.Hex("DF5B2C"));
            if (d.Kind == EnemyKind.Taoist || d.Kind == EnemyKind.HighPriest) return ("治疗怪", Pal.Hex("2CA46C"));
            if (d.StopY > Layout.StopY + 0.5f) return ("远程怪", Pal.Hex("2CA46C"));
            if (d.Kind == EnemyKind.Cavalry || d.Kind == EnemyKind.ChainHorse || d.Kind == EnemyKind.Hound
                || d.Kind == EnemyKind.Scout || d.Speed >= 0.58f)
                return ("高速怪", Pal.Hex("8A56E2"));
            if (d.Kind == EnemyKind.Diver || d.Kind == EnemyKind.WaterChief || d.Kind == EnemyKind.Berserker)
                return ("奇袭怪", Pal.Hex("C88022"));
            if (d.PhysResist > 0 || d.Kind == EnemyKind.Brute || d.Kind == EnemyKind.GiantBrute || d.Kind == EnemyKind.Elite || d.Hp >= 200f)
            {
                if (d.IsBoss) return ("统领首领", Pal.Hex("D65238"));
                return ("肉盾怪", Pal.Hex("E27828"));
            }
            if (d.IsBoss) return ("统领首领", Pal.Hex("D65238"));
            return null;
        }

        /// <summary>一眼能看出打法的标签：高速、远程、飞行、重甲、自爆……</summary>
        public static List<(string text, Color color)> Tags(EnemyDef d)
        {
            var t = new List<(string, Color)>();
            if (d.Flying) t.Add(("飞行怪", Pal.Hex("3B8ED8")));
            else if (d.Speed >= 0.58f || d.Kind == EnemyKind.ChainHorse) t.Add(("高速怪", Pal.Hex("8652D6")));
            if (d.StopY > Layout.StopY + 0.5f && !d.Flying) t.Add(("远程怪", Pal.Hex("2E9B68")));
            if (d.PhysResist > 0) t.Add(("肉盾怪", Pal.Hex("E27828")));
            if (d.Kind == EnemyKind.FireBomb || d.Kind == EnemyKind.Lantern) t.Add(("自爆", Pal.Hex("DF682C")));
            if (d.Kind == EnemyKind.Rattan || d.Kind == EnemyKind.Diver || d.Kind == EnemyKind.WaterChief || d.Kind == EnemyKind.Scout)
                t.Add(("难缠", Pal.Hex("C48824")));
            if (d.Kind == EnemyKind.Taoist || d.Kind == EnemyKind.HighPriest) t.Add(("治疗", Pal.Hex("2E9B68")));
            if (d.Kind == EnemyKind.Porter) t.Add(("宝箱", Pal.Hex("D49A1A")));
            return t;
        }

        /// <summary>深底面板用的克制提示。</summary>
        public static string Counter(EnemyDef d)
        {
            var parts = new List<string>();
            if (d.PhysResist > 0) parts.Add($"物理伤害 <color=#FF7868>-{d.PhysResist * 100:0}%</color>");
            if (d.MagicWeak > 0) parts.Add($"元素伤害 <color=#7DE35A>+{d.MagicWeak * 100:0}%</color>");
            if (d.ArcherWeak > 0) parts.Add($"射手伤害 <color=#7DE35A>+{d.ArcherWeak * 100:0}%</color>");
            if (d.Flying) parts.Add("<color=#FFB85C>近战无法命中</color>");
            return string.Join("，", parts);
        }

        static readonly Regex KeyRx = new Regex(@"(减免物理伤害|大幅减免物理伤害|物理伤害减半|物理减伤|怕电火风奇人轰击|怕电火风奇人能量|怕电火风能量|怕奇人轰击|抓钩与奇人克制|战士打不到|战士够不着|近战够不着|射手克制|冲到防线下自爆|炸伤身边外星军|飘到防线上就炸|潜着时刀枪不入|周期光学潜行刀枪不入|挡下最先的两次攻击|给身边外星军回血并加速冲锋|给身边外星军回血|受伤减半，狂奔冲墙|远远停下抛射电浆巨弹砸墙|自带能量护盾|自带护盾|打不退|瞬移闪身躲开|藏着三个小灰人|藏着红温狂暴兵|打倒就跳出来狂奔冲墙|打倒就跳出来|掷出电磁飞锤砸晕守村乡亲|超光速冲锋突进|残血进入狂暴|不断折跃传送飞艇突击编队|抽射行星火球砸墙，带护盾|召唤相位潜行怪|张开金光护盾|扑跃突进|猛撞防线|展开密集副炮齐射防线|连射防线|跑得最快|跑得飞快)");

        /// <summary>黑曜石暗底「本关敌情 / 敌军详情」用的机制高亮说明：关键机制词用醒目鎏金/霓虹翠绿标出。</summary>
        public static string SheetBody(EnemyDef d)
        {
            string desc = KeyRx.Replace(d.Desc, "<color=#FFC83D>$1</color>");
            var parts = new List<string>();
            if (d.PhysResist > 0) parts.Add($"对物理乡亲拥有 <color=#FF6858>{d.PhysResist * 100:0}%</color> 伤害减免");
            if (d.MagicWeak > 0) parts.Add($"受电/火/风奇人伤害 <color=#00F57A>+{d.MagicWeak * 100:0}%</color>");
            if (d.ArcherWeak > 0) parts.Add($"受射手乡亲伤害 <color=#00F57A>+{d.ArcherWeak * 100:0}%</color>");
            return parts.Count > 0 ? desc + "；" + string.Join("，", parts) : desc;
        }

        /// <summary>根据敌人弱点与机制，推荐 4 位最克制它的梁山好汉（用于敌军详情页）。</summary>
        public static HeroId[] RecommendedHeroes(EnemyDef d)
        {
            if (d.Flying)
                return new[] { HeroId.XieZhen, HeroId.HuaRong, HeroId.YanQing, HeroId.ZhangQing };
            if (d.Kind == EnemyKind.ChainHorse)
                return new[] { HeroId.XuNing, HeroId.GongSun, HeroId.QinMing, HeroId.HuSanniang };
            if (d.Kind == EnemyKind.Taoist || d.Kind == EnemyKind.HighPriest)
                return new[] { HeroId.WeiDingguo, HeroId.YanQing, HeroId.HuaRong, HeroId.QinMing };
            if (d.Kind == EnemyKind.GiantBrute)
                return new[] { HeroId.LingZhen, HeroId.LuZhiShen, HeroId.LiKui, HeroId.GuanSheng };
            if (d.Kind == EnemyKind.FireCart)
                return new[] { HeroId.YanQing, HeroId.GongSun, HeroId.QinMing, HeroId.LinChong };
            if (d.Kind == EnemyKind.WaterChief)
                return new[] { HeroId.GongSun, HeroId.ZhangQing, HeroId.HuSanniang, HeroId.RuanXiaoqi };
            if (d.PhysResist >= 0.25f || d.MagicWeak >= 0.30f)
                return new[] { HeroId.GongSun, HeroId.QinMing, HeroId.LingZhen, HeroId.FanRui };
            if (d.Kind == EnemyKind.Luan)
                return new[] { HeroId.AnDaoquan, HeroId.LinChong, HeroId.GuanSheng, HeroId.HuaRong };
            if (d.StopY > Layout.StopY + 0.5f)
                return new[] { HeroId.LingZhen, HeroId.QinMing, HeroId.HuaRong, HeroId.GongSun };
            if (d.Speed >= 0.58f || d.Kind == EnemyKind.Cavalry || d.Kind == EnemyKind.Scout)
                return new[] { HeroId.HuSanniang, HeroId.XuNing, HeroId.ZhuWu, HeroId.RuanXiaoqi };
            if (d.IsBoss || d.Big)
                return new[] { HeroId.WuSong, HeroId.LuZhiShen, HeroId.GuanSheng, HeroId.HuaRong };
            if (d.Kind == EnemyKind.Farmer || d.Kind == EnemyKind.Brute || d.Kind == EnemyKind.FireBomb)
                return new[] { HeroId.LingZhen, HeroId.LuZhiShen, HeroId.LiKui, HeroId.KongLiang };
            return new[] { HeroId.HuaRong, HeroId.WuSong, HeroId.LingZhen, HeroId.LuZhiShen };
        }
    }
}
