using Liangshan.Sim;

namespace Liangshan
{
    /// <summary>
    /// 每个好汉的攻击声：出手那一下和打中那一下。局里和首页出征都走这张表。
    /// 按职业分音色家族，一耳朵就能分出是谁在打：
    /// 近战是低沉的挥砍破风 + 砍肉闷响；弓手是弓弦 + 箭入肉；法师是嗡鸣聚气的施法声 + 属性落点；
    /// 投弹是抛掷破风 + 爆炸；控制是甩鞭、撒粉、阵法。全部压在中低频，连发也不刺耳。
    /// </summary>
    public static class HeroSfx
    {
        public static void Cast(HeroDef d, float scale = 1f)
        {
            switch (d.Id)
            {
                case HeroId.ShiXiu: Sfx.Play(Snd.Sword, 0.6f * scale, 1.05f); return;
                case HeroId.GuanSheng: Sfx.Play(Snd.Sword, 0.7f * scale, 0.8f); return;
                case HeroId.LiKui: Sfx.Play(Snd.Sword, 0.6f * scale, 0.85f); return;
                case HeroId.LuZhiShen: Sfx.Play(Snd.Staff, 0.4f * scale, 0.8f); return;
                case HeroId.XieBao: Sfx.Play(Snd.Jab, 0.4f * scale, 1.2f); return;
                case HeroId.ZhangQing: Sfx.Play(Snd.Jab, 0.4f * scale, 1.35f); return;
                case HeroId.GongSun: Sfx.Play(Snd.Spell, 0.4f * scale, 1.15f); return;
                case HeroId.FanRui: Sfx.Play(Snd.Spell, 0.4f * scale, 0.9f); return;
                case HeroId.QiaoDaoqing: Sfx.Play(Snd.Spell, 0.4f * scale, 0.85f); return;
                case HeroId.ShanTinggui: Sfx.Play(Snd.Spell, 0.4f * scale, 1.05f); return;
                case HeroId.MaLing: Sfx.Play(Snd.Spell, 0.45f * scale, 0.95f); return;
                case HeroId.ZhuWu: Sfx.Play(Snd.Spell, 0.4f * scale, 1.2f); return;
                case HeroId.SunErniang: Sfx.Play(Snd.Gust, 0.35f * scale, 1.25f); return;
                case HeroId.RuanXiaoqi: Sfx.Play(Snd.Whip, 0.28f * scale, 0.8f); return;
            }
            switch (d.Shot)
            {
                case ShotKind.Arrow: Sfx.Play(Snd.Bow, 0.3f * scale); break;
                case ShotKind.Stone: Sfx.Play(Snd.Jab, 0.4f * scale, 1.3f); break;
                case ShotKind.Bomb:
                case ShotKind.MiniBomb: Sfx.Play(Snd.Jab, 0.4f * scale, 0.75f); break;
                case ShotKind.Fireball: Sfx.Play(Snd.Jab, 0.45f * scale, 0.65f); break;
                case ShotKind.Spear: Sfx.Play(Snd.Thrust, 0.45f * scale); break;
                case ShotKind.Lasso: Sfx.Play(Snd.Whip, 0.3f * scale); break;
                case ShotKind.Punch: Sfx.Play(Snd.Jab, 0.55f * scale); break;
                case ShotKind.Wind: Sfx.Play(Snd.Gust, 0.35f * scale); break;
                case ShotKind.Lightning:
                case ShotKind.Beam: Sfx.Play(Snd.Spell, 0.4f * scale); break;
                case ShotKind.Slam: Sfx.Play(Snd.Staff, 0.4f * scale, 0.8f); break;
            }
        }

        public static void Ult(UltKind u)
        {
            switch (u)
            {
                case UltKind.Snipe: Sfx.Play(Snd.UltArrow, 0.8f); break;
                case UltKind.Thunder: Sfx.Play(Snd.UltThunder, 0.8f); break;
                case UltKind.Frost: Sfx.Play(Snd.UltWater, 0.75f, 1.15f); break;
                case UltKind.Sweep: Sfx.Play(Snd.UltFist, 0.9f, 0.8f); break;
                case UltKind.Bind: Sfx.Play(Snd.Lasso, 0.7f, 0.85f); Sfx.Play(Snd.UltFist, 0.6f); break;
                case UltKind.Tornado: Sfx.Play(Snd.UltWind, 0.8f); break;
                case UltKind.Meteor: Sfx.Play(Snd.UltBomb, 0.85f); break;
                case UltKind.Heal: Sfx.Play(Snd.Heal, 0.7f); break;
                case UltKind.Haste: Sfx.Play(Snd.Horse, 0.8f); Sfx.Play(Snd.Wave, 0.5f, 1.3f); break;
                default: Sfx.Play(Snd.Jackpot, 0.6f); break;
            }
        }

        public static void Hit(HeroDef d, bool crit, float scale = 1f)
        {
            float v = (crit ? 1.4f : 1f) * scale;
            switch (d.Id)
            {
                case HeroId.ShiXiu: Sfx.Play(Snd.Dao, 0.5f * v); return;
                case HeroId.GuanSheng: Sfx.Play(Snd.Dao, 0.55f * v, 0.8f); return;
                case HeroId.LiKui: Sfx.Play(Snd.Chop, 0.6f * v); return;
                case HeroId.XieBao: Sfx.Play(Snd.SpearHit, 0.35f * v, 1.15f); return;
                case HeroId.MaLing: Sfx.Play(Snd.GoldSlam, 0.5f * v); return;
                case HeroId.QiaoDaoqing: Sfx.Play(Snd.Bomb, 0.25f * v, 1.35f); return;
                case HeroId.ShanTinggui: Sfx.Play(Snd.Water, 0.3f * v, 1.2f); return;
                case HeroId.FanRui: Sfx.Play(Snd.Whirl, 0.35f * v); return;
                case HeroId.SunErniang: Sfx.Play(Snd.Poison, 0.45f * v); return;
                case HeroId.RuanXiaoqi: Sfx.Play(Snd.Water, 0.4f * v); return;
                case HeroId.ZhuWu:
                case HeroId.WuYong: Sfx.Play(Snd.Magic, 0.35f * v, 1.1f); return;
                case HeroId.AnDaoquan: Sfx.Play(Snd.Heal, 0.3f * v); return;
            }
            switch (d.Shot)
            {
                case ShotKind.Arrow: Sfx.Play(Snd.ArrowHit, 0.25f * v); break;
                case ShotKind.Stone: Sfx.Play(Snd.ArrowHit, 0.25f * v, 1.25f); break;
                case ShotKind.Bomb: Sfx.Play(Snd.Bomb, 0.45f * v); break;
                case ShotKind.MiniBomb: Sfx.Play(Snd.Bomb, 0.3f * v, 1.25f); break;
                case ShotKind.Fireball: Sfx.Play(Snd.Bomb, 0.4f * v, 1.15f); break;
                case ShotKind.Lightning: Sfx.Play(Snd.Thunder, (crit ? 0.7f : 0.35f) * scale); break;
                case ShotKind.Punch: Sfx.Play(Snd.Fist, 0.6f * v); break;
                case ShotKind.Slam: Sfx.Play(Snd.Fist, 0.55f * v, 0.75f); break;
                case ShotKind.Spear: Sfx.Play(Snd.SpearHit, 0.4f * v); break;
                case ShotKind.Lasso: Sfx.Play(Snd.Lasso, 0.4f * v); break;
                case ShotKind.Beam: Sfx.Play(Snd.Bomb, 0.25f * v, 1.35f); break;
                case ShotKind.Wind: Sfx.Play(Snd.Whirl, 0.3f * v); break;
            }
        }

        /// <summary>辅助定时放的技能（不打怪的那一下）。</summary>
        public static void Buff(HeroDef d, float scale = 1f)
        {
            switch (d.Buff)
            {
                case UltKind.Rush: Sfx.Play(Snd.Horse, 0.6f * scale); break;
                case UltKind.Forge: Sfx.Play(Snd.Forge, 0.6f * scale); break;
                case UltKind.Mend: Sfx.Play(Snd.Heal, 0.45f * scale); break;
                case UltKind.Bless: Sfx.Play(Snd.Magic, 0.45f * scale); break;
                case UltKind.Steal: Sfx.Play(Snd.Coin, 0.45f * scale, 1.1f); break;
                case UltKind.Interest: Sfx.Play(Snd.Coin, 0.45f * scale, 0.85f); break;
                default: Sfx.Play(Snd.Jackpot, 0.4f * scale, 1.2f); break;
            }
        }
    }
}
