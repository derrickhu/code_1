using Liangshan.Sim;

namespace Liangshan
{
    /// <summary>
    /// 全 32 位好汉「稀有·史诗·传说」三阶专属兵器出手、命中、大招与辅助加持声效表（局内与首页出征演示同源）：
    /// 射手：猎弓木箭 -> 穿云破空银箭 -> 鎏金机巧三连弩；
    /// 长柄：钩镰破马 -> 寒霜蛇矛 -> 黄金麒麟枪；
    /// 近战：寒钢快刀 -> 打虎重拳 / 旋风双斧 / 铜环禅杖 -> 青龙偃月重劈；
    /// 炮手：黑铁火雷 -> 虎蹲重炮 / 粗陶猛火油罐 -> 霹雳狼牙火陨；
    /// 法控与辅助：金砖镇魔、青玉飞石、烈焰/圣水射线、天罡雷链、旋风咒、八阵古磬、渔网水浪、蒙汗药雾、红锦缚龙索。
    /// </summary>
    public static class HeroSfx
    {
        public static void Cast(HeroDef d, float scale = 1f)
        {
            switch (d.Id)
            {
                // 射手系：燕青机巧三连弩 / 花荣穿云强弓 / 解珍穿林猎弓 / 解宝倒钩钢叉 / 张清没羽飞石
                case HeroId.YanQing: Sfx.Play(Snd.Crossbow, 0.56f * scale, 1.0f); return;
                case HeroId.HuaRong: Sfx.Play(Snd.Bow, 0.54f * scale, 1.05f); return;
                case HeroId.XieZhen: Sfx.Play(Snd.Bow, 0.50f * scale, 0.95f); return;
                case HeroId.XieBao: Sfx.Play(Snd.Thrust, 0.48f * scale, 1.16f); return;
                case HeroId.ZhangQing: Sfx.Play(Snd.Dart, 0.50f * scale, 1.08f); return;

                // 长柄突刺系：卢俊义麒麟重枪 / 林冲寒星蛇矛 / 徐宁钩镰枪
                case HeroId.LuJunyi: Sfx.Play(Snd.Thrust, 0.56f * scale, 0.88f); return;
                case HeroId.LinChong: Sfx.Play(Snd.Thrust, 0.54f * scale, 0.98f); return;
                case HeroId.XuNing: Sfx.Play(Snd.Thrust, 0.48f * scale, 1.08f); return;

                // 近战劈砸系：关胜偃月重刀 / 鲁智深铜环禅杖 / 李逵旋风双斧 / 武松铁拳 / 石秀快刀
                case HeroId.GuanSheng: Sfx.Play(Snd.Sword, 0.65f * scale, 0.80f); return;
                case HeroId.LuZhiShen: Sfx.Play(Snd.Staff, 0.56f * scale, 0.92f); return;
                case HeroId.LiKui: Sfx.Play(Snd.Axe, 0.55f * scale, 0.96f); return;
                case HeroId.WuSong: Sfx.Play(Snd.Jab, 0.56f * scale, 0.95f); return;
                case HeroId.ShiXiu: Sfx.Play(Snd.Sword, 0.52f * scale, 1.08f); return;

                // 炮手爆破系：秦明烈焰狼牙锤挥召 / 凌振重炮出膛 / 魏定国引信掷油瓮 / 孔亮引信掷火雷
                case HeroId.QinMing: Sfx.Play(Snd.MaceCast, 0.58f * scale, 1.0f); return;
                case HeroId.LingZhen: Sfx.Play(Snd.CannonFire, 0.56f * scale, 1.0f); return;
                case HeroId.WeiDingguo: Sfx.Play(Snd.FuseThrow, 0.52f * scale, 0.90f); return;
                case HeroId.KongLiang: Sfx.Play(Snd.FuseThrow, 0.48f * scale, 1.05f); return;

                // 法师与控制系：公孙胜掌心聚雷 / 樊瑞呼风 / 乔道清喷火 / 单廷珪激流 / 马灵祭金砖 / 朱武布阵 / 扈三娘甩鞭 / 孙二娘掷药包 / 阮小七撒渔网
                case HeroId.GongSun: Sfx.Play(Snd.ThunderCast, 0.52f * scale, 1.0f); return;
                case HeroId.FanRui: Sfx.Play(Snd.Gust, 0.50f * scale, 0.92f); return;
                case HeroId.QiaoDaoqing: Sfx.Play(Snd.FireBeam, 0.48f * scale, 1.05f); return;
                case HeroId.ShanTinggui: Sfx.Play(Snd.Water, 0.46f * scale, 1.06f); return;
                case HeroId.MaLing: Sfx.Play(Snd.Spell, 0.48f * scale, 0.96f); return;
                case HeroId.ZhuWu: Sfx.Play(Snd.Spell, 0.48f * scale, 0.90f); return;
                case HeroId.HuSanniang: Sfx.Play(Snd.Whip, 0.54f * scale, 1.0f); return;
                case HeroId.SunErniang: Sfx.Play(Snd.Dart, 0.48f * scale, 0.92f); return;
                case HeroId.RuanXiaoqi: Sfx.Play(Snd.NetCast, 0.50f * scale, 1.0f); return;
            }
            switch (d.Shot)
            {
                case ShotKind.Arrow: Sfx.Play(Snd.Bow, 0.48f * scale); break;
                case ShotKind.Stone: Sfx.Play(Snd.Dart, 0.46f * scale, 1.08f); break;
                case ShotKind.Bomb:
                case ShotKind.MiniBomb: Sfx.Play(Snd.FuseThrow, 0.46f * scale, 0.96f); break;
                case ShotKind.Fireball: Sfx.Play(Snd.MaceCast, 0.52f * scale, 0.96f); break;
                case ShotKind.Spear: Sfx.Play(Snd.Thrust, 0.50f * scale); break;
                case ShotKind.Lasso: Sfx.Play(Snd.Whip, 0.50f * scale); break;
                case ShotKind.Punch: Sfx.Play(Snd.Jab, 0.52f * scale); break;
                case ShotKind.Wind: Sfx.Play(Snd.Gust, 0.45f * scale); break;
                case ShotKind.Lightning: Sfx.Play(Snd.ThunderCast, 0.50f * scale); break;
                case ShotKind.Beam: Sfx.Play(Snd.FireBeam, 0.45f * scale); break;
                case ShotKind.Slam: Sfx.Play(Snd.Staff, 0.52f * scale, 0.92f); break;
            }
        }

        public static void Ult(UltKind u)
        {
            switch (u)
            {
                case UltKind.Snipe: Sfx.Play(Snd.UltArrow, 0.88f); break;
                case UltKind.Thunder: Sfx.Play(Snd.UltThunder, 0.90f); break;
                case UltKind.Frost: Sfx.Play(Snd.UltWater, 0.86f, 1.04f); break;
                case UltKind.Sweep: Sfx.Play(Snd.UltFist, 0.92f, 0.95f); break;
                case UltKind.Bind: Sfx.Play(Snd.Whip, 0.78f, 0.92f); Sfx.Play(Snd.Lasso, 0.82f, 0.90f); break;
                case UltKind.Tornado: Sfx.Play(Snd.UltWind, 0.88f); break;
                case UltKind.Meteor: Sfx.Play(Snd.UltBomb, 0.90f); break;
                case UltKind.Heal: Sfx.Play(Snd.Heal, 0.85f); break;
                case UltKind.Haste: Sfx.Play(Snd.Horse, 0.85f); Sfx.Play(Snd.Wave, 0.62f, 1.08f); break;
                default: Sfx.Play(Snd.Jackpot, 0.72f); break;
            }
        }

        public static void Hit(HeroDef d, bool crit, float scale = 1f)
        {
            float v = (crit ? 1.28f : 1f) * scale;
            switch (d.Id)
            {
                // 射手系：品级与兵器材质命中分明（弩矢破甲 / 穿云贯甲 / 猎箭钉盾 / 毒叉刺肉 / 青石撞盔）
                case HeroId.YanQing: Sfx.Play(Snd.ArrowPierce, 0.50f * v, 1.08f); return;
                case HeroId.HuaRong: Sfx.Play(Snd.ArrowPierce, 0.54f * v, 0.98f); return;
                case HeroId.XieZhen: Sfx.Play(Snd.ArrowHit, 0.52f * v, 1.0f); return;
                case HeroId.XieBao: Sfx.Play(Snd.SpearHit, 0.46f * v, 1.14f); Sfx.Play(Snd.Poison, 0.24f * v, 1.18f); return;
                case HeroId.ZhangQing: Sfx.Play(Snd.JadePing, 0.52f * v, 1.0f); return;

                // 长柄突刺系
                case HeroId.LuJunyi: Sfx.Play(Snd.SpearHit, 0.56f * v, 0.86f); return;
                case HeroId.LinChong: Sfx.Play(Snd.SpearHit, 0.54f * v, 0.96f); return;
                case HeroId.XuNing: Sfx.Play(Snd.SpearHit, 0.48f * v, 1.06f); return;

                // 近战劈砸系
                case HeroId.GuanSheng: Sfx.Play(Snd.GlaiveCleave, 0.66f * v, 1.0f); return;
                case HeroId.LuZhiShen: Sfx.Play(Snd.Hammer, 0.60f * v, 0.94f); return;
                case HeroId.LiKui: Sfx.Play(Snd.Chop, 0.58f * v, 1.0f); return;
                case HeroId.WuSong: Sfx.Play(Snd.Fist, 0.62f * v, 1.0f); return;
                case HeroId.ShiXiu: Sfx.Play(Snd.Dao, 0.52f * v, 1.06f); return;

                // 炮手爆破系：火雷 -> 猛火油瓮碎燃 -> 重炮震雷 -> 狼牙火陨
                case HeroId.QinMing: Sfx.Play(Snd.MeteorHit, 0.66f * v, 1.0f); return;
                case HeroId.LingZhen: Sfx.Play(Snd.CannonBoom, 0.62f * v, 1.0f); return;
                case HeroId.WeiDingguo: Sfx.Play(Snd.OilJar, 0.58f * v, 1.0f); return;
                case HeroId.KongLiang: Sfx.Play(Snd.Bomb, 0.52f * v, 1.04f); return;

                // 法师、控制与辅助系（阮小七天罗地网命中对齐绳网束缚声，不再误播泼水声）
                case HeroId.GongSun: Sfx.Play(Snd.Thunder, 0.58f * v, 1.0f); return;
                case HeroId.MaLing: Sfx.Play(Snd.GoldSlam, 0.56f * v, 1.0f); return;
                case HeroId.QiaoDaoqing: Sfx.Play(Snd.FireBeam, 0.34f * v, 1.12f); return;
                case HeroId.ShanTinggui: Sfx.Play(Snd.Water, 0.36f * v, 1.12f); return;
                case HeroId.FanRui: Sfx.Play(Snd.Whirl, 0.38f * v, 1.0f); return;
                case HeroId.ZhuWu: Sfx.Play(Snd.ArraySeal, 0.52f * v, 1.0f); return;
                case HeroId.HuSanniang: Sfx.Play(Snd.Lasso, 0.52f * v, 1.0f); return;
                case HeroId.SunErniang: Sfx.Play(Snd.Poison, 0.50f * v, 1.0f); return;
                case HeroId.RuanXiaoqi: Sfx.Play(Snd.Lasso, 0.50f * v, 0.88f); return;
                case HeroId.WuYong: Sfx.Play(Snd.Magic, 0.42f * v, 1.0f); return;
                case HeroId.AnDaoquan: Sfx.Play(Snd.Heal, 0.40f * v, 1.0f); return;
            }
            switch (d.Shot)
            {
                case ShotKind.Arrow: Sfx.Play(Snd.ArrowHit, 0.48f * v); break;
                case ShotKind.Stone: Sfx.Play(Snd.JadePing, 0.48f * v); break;
                case ShotKind.Bomb: Sfx.Play(Snd.Bomb, 0.52f * v); break;
                case ShotKind.MiniBomb: Sfx.Play(Snd.ArrowBlast, 0.44f * v, 0.90f); break;
                case ShotKind.Fireball: Sfx.Play(Snd.MeteorHit, 0.58f * v); break;
                case ShotKind.Lightning: Sfx.Play(Snd.Thunder, 0.56f * v); break;
                case ShotKind.Punch: Sfx.Play(Snd.Fist, 0.58f * v); break;
                case ShotKind.Slam: Sfx.Play(Snd.Hammer, 0.58f * v, 0.92f); break;
                case ShotKind.Spear: Sfx.Play(Snd.SpearHit, 0.48f * v); break;
                case ShotKind.Lasso: Sfx.Play(Snd.Lasso, 0.48f * v); break;
                case ShotKind.Beam: Sfx.Play(Snd.FireBeam, 0.34f * v, 1.12f); break;
                case ShotKind.Wind: Sfx.Play(Snd.Whirl, 0.36f * v); break;
            }
        }

        /// <summary>辅助定时放的加持技能（不打怪的那一下）。</summary>
        public static void Buff(HeroDef d, float scale = 1f)
        {
            switch (d.Buff)
            {
                case UltKind.Rush: Sfx.Play(Snd.Horse, 0.65f * scale); break;
                case UltKind.Forge: Sfx.Play(Snd.Forge, 0.65f * scale); break;
                case UltKind.Mend: Sfx.Play(Snd.Heal, 0.55f * scale); break;
                case UltKind.Bless: Sfx.Play(Snd.Magic, 0.55f * scale); break;
                case UltKind.Steal: Sfx.Play(Snd.Coin, 0.55f * scale, 1.08f); break;
                case UltKind.Interest: Sfx.Play(Snd.Coin, 0.55f * scale, 0.92f); break;
                default: Sfx.Play(Snd.Magic, 0.50f * scale); break;
            }
        }
    }
}
