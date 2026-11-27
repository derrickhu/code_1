using System;

namespace Liangshan.Sim
{
    /// <summary>1 级常驻的个人特性类别（数值小巧克制，不污染局外 1 星白板首击断言，又让每位乡亲从 1 级起就有独门脾气）。</summary>
    public enum TraitKind
    {
        LowHpDmg,       // 对血量 <40% 敌人增伤 V
        EliteBonus,     // 对精英、首领增伤 V
        FlyBonus,       // 对飞行敌人增伤 V
        CavBonus,       // 对飞艇、机甲兽增伤 V
        FirstPierceCrit,// 贯穿钉/寒流命中的首个目标暴击率 +V
        NthShotCrit,    // 每第 N 轮出手暴击率 +V
        KnockBonus,     // 击退距离 +V
        SplashSlow,     // 命中额外减速 V 秒
        DotBonus,       // 持续灼烧/辣毒 +V
        ZoneVuln,       // 命中附带 2.5 秒微易伤 +V
        AdjacentSpeed,  // 左右相邻乡亲攻速 +V（吴校长）
        WildMerge,      // 召唤与合成呈百搭态几率 V（小迁子）
        CleanseWall,    // 修墙额外回复并净除异常（安神医）
        UltAuraCd,      // 冷却光环同步作用于大招（戴领舞）
        CritDmgAura,    // 在场为全村暴击伤害 +V（唐五金）
        InterestCap,    // 利息结算上限提高 +V（蒋会计）
        PriorityElite,  // 套索与渔网优先锁定精英/飞碟（胡三妹/阮老七）
    }

    /// <summary>10 级自动拥有的本命绝技模板（12 大机制原型，彻底告别纯数值被动与抽卡看脸）。</summary>
    public enum SigKind
    {
        OnMerge,        // 参与合成时当场爆发（6 位辅助专属：鼓劲 / 修墙 / 减全队冷却 / 改装 / 拆件 / 结息）
        CountGE,        // 场上同名乡亲 ≥ N 位时激活常驻质变（小燕子多1钉、华木匠多1穿、陈喜子多1炮仗）
        StarSum,        // 场上同名乡亲总星级每 1 星提供 V 伤害增幅（孙电工、樊飞手，上限 12 星）
        TopStar,        // 场上最高星那一位独享统帅质变（卢宗师棍罡扩幅、关大爷斩首领狂暴）
        WallDrop,       // 防线每损失 10% 生命，全场同名乡亲立刻齐射反击（鲁大力连锤、李铁牛连锯）
        NearRage,       // 墙根警戒线内有外星军时进入怒战（武教练攻速爆发、王铁柱暴击爆发）
        HighHpBreak,    // 破势：对生命高于 50% 的外星军造成伤害 +V（林班长、徐农机）
        LowHpExec,      // 斩将：对生命低于 40% 的残血外星军造成伤害 +V
        OnDebuff,       // 追魂：对灼烧/中毒/减速/眩晕中的外星军伤害 +V（王大壮、魏油匠、孙辣妹、单消防、乔老板）
        EveryNCast,     // 节拍极意：每第 N 轮出手触发强化巨击/双发/必晕（凌焊神、张雀神、马包工、二狗子）
        OnStunBurst,    // 锁魂爆裂：控制命中时额外引爆追斩与破绽易伤（胡三妹、朱棋王、阮老七）
        DeployBurst,    // 天降神威：上阵或合成登场瞬间倾泻 3 枚礼花轰炸（秦厂长）
    }

    /// <summary>每位乡亲完整的四技能与 5~30 级定制突破档案（数值统一接入 BalanceConfig 数值管理中心）。</summary>
    public sealed class HeroKitDef
    {
        public HeroId Hero;

        // 槽位 2：1 级天生特性
        public string TraitName, TraitIcon, TraitDesc, TraitTpl;
        public TraitKind Trait;
        public float TraitV;
        public int TraitN;

        // 槽位 3：10 级自动获得的绝技
        public string SigName, SigIcon, SigDesc, SigTpl;
        public SigKind Sig;
        public int SigN;
        public float SigV, SigV2;

        // 槽位 4：5 级进池的终结技（传说为大招，史诗/稀有为奥义）
        public string FinisherName, FinisherIcon, FinisherDesc, FinisherTpl;

        // 15 级解锁的专属双词条强化选项卡（Opt = 3，双属性全部真实生效，与单属性普通卡形成差异化互补）
        public string Opt15Name, Opt15Desc, Opt15Tpl;
        public Eff Opt15Eff;
        public float Opt15V;
        public Eff Opt15Eff2;
        public float Opt15V2;

        // 20 / 25 / 30 级专属机制改写与突破说明
        public string Lv20Desc;
        public string Lv25Desc;
        public string Lv30Desc;
    }

    public static class HeroKits
    {
        public static readonly HeroKitDef[] All = Build();

        public static HeroKitDef Of(HeroId h) => All[(int)h];

        static string Pct(float v) => (int)Math.Round(v * 100f) + "%";
        static string Num(float v) => v.ToString("0.##");

        /// <summary>当数值管理中心修改了特性/绝技/大招/奥义/15级专属卡数值时，同步刷新全部说明文本。</summary>
        public static void RefreshAll()
        {
            if (All == null) return;
            foreach (var k in All)
            {
                if (k != null) Refresh(k);
            }
        }

        public static void Refresh(HeroKitDef k)
        {
            var d = Defs.Hero(k.Hero);
            k.TraitDesc = FormatTpl(k, k.TraitTpl);
            k.SigDesc = FormatTpl(k, k.SigTpl);
            k.Opt15Desc = FormatTpl(k, k.Opt15Tpl);
            if (d.HasUlt)
                k.FinisherDesc = $"{d.UltTip.Replace("\n", "，")}（冷却 {d.UltCd:0} 秒）";
            else if (!string.IsNullOrEmpty(k.FinisherTpl))
                k.FinisherDesc = FormatTpl(k, k.FinisherTpl);
        }

        static string FormatTpl(HeroKitDef k, string tpl)
        {
            if (string.IsNullOrEmpty(tpl)) return "";
            var cb = Balance.Current != null && Balance.Current.Combat != null ? Balance.Current.Combat : new CombatBalance();
            return tpl
                .Replace("{tv%}", Pct(k.TraitV))
                .Replace("{tv}", Num(k.TraitV))
                .Replace("{tn}", k.TraitN.ToString())
                .Replace("{sn}", k.SigN.ToString())
                .Replace("{sv%}", Pct(k.SigV))
                .Replace("{sv}", Num(k.SigV))
                .Replace("{sv2%}", Pct(k.SigV2))
                .Replace("{sv2}", Num(k.SigV2))
                .Replace("{sn_sv%}", Pct(k.SigN * k.SigV))
                .Replace("{ov%}", Pct(k.Opt15V))
                .Replace("{ov}", Num(k.Opt15V))
                .Replace("{ov2%}", Pct(k.Opt15V2))
                .Replace("{ov2}", Num(k.Opt15V2))
                .Replace("{awkDmg%}", Pct(cb.AwakenDmgBonus))
                .Replace("{awkSpd%}", Pct(cb.AwakenSpeedBonus))
                .Replace("{awkAura%}", Pct(cb.AwakenAuraBonus));
        }

        static HeroKitDef K(
            HeroId h,
            string traitName, string traitIcon, TraitKind trait, float tv, int tn, string traitTpl,
            string sigName, string sigIcon, SigKind sig, int sn, float sv, float sv2, string sigTpl,
            string finIcon, string finTpl,
            string o15Name, Eff o15Eff, float o15V, Eff o15Eff2, float o15V2, string o15Tpl,
            string lv20, string lv25, string lv30 = null)
        {
            var d = Defs.Hero(h);
            bool sup = d.Kind == Role.Support;
            var kit = new HeroKitDef
            {
                Hero = h,
                TraitName = traitName, TraitIcon = traitIcon, Trait = trait, TraitV = tv, TraitN = tn, TraitTpl = traitTpl,
                SigName = sigName, SigIcon = sigIcon, Sig = sig, SigN = sn, SigV = sv, SigV2 = sv2, SigTpl = sigTpl,
                FinisherName = d.HasUlt ? d.UltName : Defs.AwakenName(h),
                FinisherIcon = d.HasUlt ? d.UltIcon : finIcon,
                FinisherTpl = finTpl,
                Opt15Name = o15Name, Opt15Eff = o15Eff, Opt15V = o15V, Opt15Eff2 = o15Eff2, Opt15V2 = o15V2, Opt15Tpl = o15Tpl,
                Lv20Desc = lv20,
                Lv25Desc = lv25,
                Lv30Desc = lv30 ?? (sup ? $"「{d.AtkName}」冷却 -20%"
                    : d.Kind == Role.Mage ? $"「{d.AtkName}」充能速率 +20%"
                    : d.Kind == Role.Bomber ? $"「{d.AtkName}」装填速度 +20%"
                    : d.Kind == Role.Control ? $"「{d.AtkName}」布控速度 +20%"
                    : $"{d.Name}攻击速度 +20%"),
            };
            Refresh(kit);
            return kit;
        }

        static HeroKitDef[] Build()
        {
            var a = new HeroKitDef[Defs.HeroCount];
            void Put(HeroKitDef k) => a[(int)k.Hero] = k;

            // ==================== 传说（10 位，第 4 技能为大招） ====================
            Put(K(HeroId.GongSun,
                "超导感电", "sk_trait_elem", TraitKind.ZoneVuln, 0.12f, 0, "电弧劈中的外星人感电 2.5 秒，所受伤害 +{tv%}",
                "并网增幅", "sk_sig_legion", SigKind.StarSum, 12, 0.04f, 0, "场上孙电工总星级每 1 星，电弧与大招伤害 +{sv%}（上限 {sn_sv%}）",
                null, null,
                "超导增压器", Eff.Count, 1f, Eff.Stun, 0.25f, "电弧数量 +{ov}\n麻痹几率 +{ov2%}",
                "释放「拉闸放雷」后 6 秒内，孙电工充能速率 +35%",
                "「拉闸放雷」冷却 -15%，技能伤害 +15%"));

            Put(K(HeroId.LinChong,
                "超导冰锋", "sk_trait_crit", TraitKind.FirstPierceCrit, 0.18f, 0, "液氮冰炮喷中的首个外星人暴击率 +{tv%}",
                "退伍兵王", "sk_sig_combo", SigKind.HighHpBreak, 0, 0.35f, 0, "破势：对生命高于 50% 的外星军，寒流与大招伤害 +{sv%}",
                null, null,
                "极寒急冻", Eff.Shatter, 0.60f, Eff.Crit, 0.22f, "对受控敌伤害 +{ov%}\n暴击率 +{ov2%}",
                "2 星及以上林班长合成登场时，立刻喷射 1 道超导裂空寒流",
                "「冷库全开」冷却 -15%，技能伤害 +15%"));

            Put(K(HeroId.LuJunyi,
                "狮王重劲", "sk_trait_exec", TraitKind.KnockBonus, 0.35f, 0, "醒狮金棍劲力雄浑，击退距离 +{tv%}",
                "醒狮宗师", "sk_sig_crown", SigKind.TopStar, 0, 0.28f, 0.20f, "场上最高星的卢宗师统御战局：伤害 +{sv%}，暴击率 +{sv2%}",
                null, null,
                "一棍镇门", Eff.Reach, 2.2f, Eff.Dmg, 0.45f, "贯穿距离 +{ov}\n金棍伤害 +{ov2%}",
                "释放「横扫村口」时，额外向敌群挥出 2 道黄金电光棍罡",
                "「横扫村口」冷却 -15%，技能伤害 +15%"));

            Put(K(HeroId.GuanSheng,
                "热熔断甲", "sk_trait_exec", TraitKind.LowHpDmg, 0.35f, 0, "对生命低于 40% 的外星军，热熔重刀斩杀伤害 +{tv%}",
                "老当益壮", "sk_sig_crown", SigKind.TopStar, 0, 0.30f, 0.25f, "场上最高星的关大爷威震敌胆：对全外星军伤害 +{sv%}，对首领额外 +{sv2%}",
                null, null,
                "镇村神威", Eff.Elite, 0.90f, Eff.Crit, 0.25f, "对精英首领伤 +{ov%}\n暴击率 +{ov2%}",
                "「社火刀阵」横扫期间，生命低于 12% 的普通外星杂兵直接劈飞秒杀",
                "「社火刀阵」冷却 -15%，技能伤害 +15%"));

            Put(K(HeroId.YanQing,
                "极客改装", "sk_trait_crit", TraitKind.NthShotCrit, 0.45f, 3, "三联钉枪每第 {tn} 轮齐射暴击率 +{tv%}",
                "双翼供弹", "sk_sig_legion", SigKind.CountGE, 4, 1f, 0, "场上同时存在 ≥{sn} 位小燕子时，全体小燕子每次齐射钢钉数量 +1",
                null, null,
                "超频供钉", Eff.Speed, 0.42f, Eff.Crit, 0.18f, "攻速 +{ov%}\n暴击率 +{ov2%}",
                "释放「超距狙击」后 5 秒内，全场小燕子攻速 +45%",
                "「超距狙击」冷却 -15%，技能伤害 +15%"));

            Put(K(HeroId.FanRui,
                "植保强风", "sk_trait_elem", TraitKind.SplashSlow, 0.8f, 0, "旋风涡流与狂飙减速时间额外延长 {tv} 秒",
                "涡轮增压", "sk_sig_legion", SigKind.StarSum, 12, 0.05f, 0, "场上樊飞手总星级每 1 星，涡流与大招伤害 +{sv%}（上限 {sn_sv%}）",
                null, null,
                "八翼风压", Eff.Area, 0.45f, Eff.Dmg, 0.45f, "涡流范围 +{ov%}\n奇人伤害 +{ov2%}",
                "「十级狂飙」龙卷范围再 +25%，并把周围外星军向风眼聚拢",
                "「十级狂飙」冷却 -15%，技能伤害 +15%"));

            Put(K(HeroId.HuSanniang,
                "红索擒首", "sk_trait_tactic", TraitKind.PriorityElite, 0.25f, 0, "电磁红索优先锁定精英与首领，并对其伤害 +{tv%}",
                "套马巧劲", "sk_sig_seal", SigKind.OnStunBurst, 0, 0.90f, 0.20f, "被套索捆住的外星军遭高压电击追伤（{sv%} 攻击伤害），4 秒内受伤 +{sv2%}",
                null, null,
                "双绞电磁索", Eff.Count, 1f, Eff.Stun, 0.45f, "套索多锁 +{ov} 人\n控制时间 +{ov2} 秒",
                "「五花大绑」套住的外星军易伤提升至 +30%，定身延长 0.5 秒",
                "「五花大绑」冷却 -15%，技能伤害 +15%"));

            Put(K(HeroId.AnDaoquan,
                "卫生急救", "sk_trait_tactic", TraitKind.CleanseWall, 0.02f, 0, "醒脑修墙额外多回复 {tv%} 防线上限，并立即清零全体乡亲晕眩",
                "祖传秘方", "sk_sig_merge", SigKind.OnMerge, 0, 0.03f, 0, "安神医参与合成升星时，额外多回复 {sv%}×新星级 防线生命（总计 8%×星级）",
                null, null,
                "金针强心", Eff.Aura, 0.55f, Eff.UltCd, 0.18f, "修墙量 +{ov%}\n技能冷却 -{ov2%}",
                "村口防线生命低于 40% 时，「醒脑修墙」回复量提升 40%",
                "「醒脑修墙」效果 +15%，「妙手加固」冷却 -15%"));

            Put(K(HeroId.DaiZong,
                "广场领舞", "sk_trait_tactic", TraitKind.UltAuraCd, 0.04f, 0, "戴领舞在场冷却光环同步加速全村大招回转",
                "领舞气场", "sk_sig_merge", SigKind.OnMerge, 0, 0.18f, 0, "戴领舞参与合成升星时，全村其余乡亲当前技能与大招冷却立刻缩短 {sv%}",
                null, null,
                "音响全开", Eff.UltCd, 0.24f, Eff.Coin, 32f, "技能冷却 -{ov%}\n每次合成 +{ov2} 能量币",
                "释放「最炫神曲」时，额外立刻缩短全村技能冷却 20%",
                "「动感节拍」效果 +15%，「最炫神曲」冷却 -15%"));

            Put(K(HeroId.QinMing,
                "庆典铝热", "sk_trait_elem", TraitKind.DotBonus, 0.12f, 0, "高爆礼花留下的星火灼烧总伤害额外 +{tv%}",
                "黑药加量", "sk_sig_crown", SigKind.DeployBurst, 3, 1.15f, 0, "秦厂长召唤入场或合成升星登场时，当场向敌群轰落 {sn} 颗高爆礼花（{sv}×攻击）",
                null, null,
                "子母礼花巢", Eff.Split, 1f, Eff.Dmg, 0.40f, "落地分裂 3 枚小礼花\n礼花伤害 +{ov2%}",
                "「除夕总攻」礼花数量 +2，灼烧外星军阵亡时引爆火环",
                "「除夕总攻」冷却 -15%，技能伤害 +15%"));

            // ==================== 史诗（12 位，第 4 技能为奥义） ====================
            Put(K(HeroId.HuaRong,
                "气动穿甲", "sk_trait_crit", TraitKind.FirstPierceCrit, 0.10f, 0, "高压射钉命中的首个目标暴击率 +{tv%}，每穿透 1 敌伤害递增 22%",
                "百步穿钉", "sk_sig_legion", SigKind.CountGE, 3, 1f, 0, "场上同时存在 ≥{sn} 位华木匠时，全体华木匠高压射钉穿透人数 +1",
                "sk_aoyi_arrow", "终伤 +{awkDmg%}，攻速 +{awkSpd%}；当场齐射贯阵钢钉雨，之后每 3 轮普攻额外迸发 3 枚穿甲追魂钉",
                "双泵快钉", Eff.Count, 1f, Eff.Crit, 0.22f, "钢钉数量 +{ov}\n暴击率 +{ov2%}",
                "场上满 4 位华木匠时穿透再 +1，穿透递增伤害升至 +26%",
                "「高压射钉」伤害 +15%，奥义「一钉串糖葫芦」追射伤害 +35%"));

            Put(K(HeroId.LingZhen,
                "超压气浪", "sk_trait_exec", TraitKind.KnockBonus, 0.12f, 0, "煤气罐炮冲击猛烈，震退距离 +{tv%}",
                "焊装扩容", "sk_sig_combo", SigKind.EveryNCast, 3, 1.45f, 0.35f, "每第 {sn} 轮发射升级为加厚大罐炮：伤害 ×{sv}，爆炸范围 +{sv2%}",
                "sk_aoyi_fire", "重炮终伤 +{awkDmg%}，装填速度 +{awkSpd%}；当场倾泻罐炮弹幕，之后每 3 轮普攻额外轰出 4 枚连环重炮",
                "高纯丙烷", Eff.Count, 1f, Eff.Dmg, 0.40f, "重炮数量 +{ov}\n重炮伤害 +{ov2%}",
                "「焊装扩容」巨炮触发节拍加快为每第 2 轮，必带震晕 0.5 秒",
                "「煤气罐炮」伤害 +15%，奥义「土法重炮营」弹幕伤害 +35%"));

            Put(K(HeroId.WuSong,
                "擂台重拳", "sk_trait_exec", TraitKind.EliteBonus, 0.12f, 0, "拳风刚猛无俦，对精英与首领伤害 +{tv%}",
                "专打硬茬", "sk_sig_bastion", SigKind.NearRage, 0, 0.32f, 0, "防线前警戒线内有外星军逼近时，武教练战意沸腾，攻速 +{sv%}",
                "sk_aoyi_blade", "终伤 +{awkDmg%}，攻速 +{awkSpd%}；当场轰出崩山双拳罡，之后每 3 轮普攻额外斩出双道裂地拳风",
                "散打连击", Eff.Crit, 0.25f, Eff.Speed, 0.35f, "暴击率 +{ov%}\n攻速 +{ov2%}",
                "近身怒战期间，武教练铁拳暴击率额外 +20%",
                "「重炮铁拳」伤害 +15%，奥义「十八连环拳」拳气伤害 +35%"));

            Put(K(HeroId.ZhangQing,
                "盲摸巧劲", "sk_trait_crit", TraitKind.NthShotCrit, 0.40f, 3, "雀神飞牌手法刁钻，每第 {tn} 轮甩牌暴击率 +{tv%}",
                "听牌自摸", "sk_sig_combo", SigKind.EveryNCast, 3, 2f, 0.6f, "每第 {sn} 轮甩出天胡大红中：多弹射 {sv} 次，命中必拍晕 {sv2} 秒",
                "sk_aoyi_arrow", "终伤 +{awkDmg%}，攻速 +{awkSpd%}；当场激射满天麻将牌雨，之后每 3 轮普攻额外连甩双发弹射飞牌",
                "清一色连弹", Eff.Chain, 2f, Eff.Dmg, 0.40f, "麻将牌弹射 +{ov} 次\n麻将牌伤害 +{ov2%}",
                "麻将牌每次弹射不再衰减至 80%，改为维持 95% 高额伤害",
                "「雀神飞牌」伤害 +15%，奥义「杠上开花雨」追击伤害 +35%"));

            Put(K(HeroId.LuZhiShen,
                "重锤裂地", "sk_trait_elem", TraitKind.SplashSlow, 1.0f, 0, "千斤夯锤震裂路面，被砸中的外星军额外减速 {tv} 秒",
                "天生神力", "sk_sig_bastion", SigKind.WallDrop, 10, 1.2f, 0, "防线每损失 10% 生命，场上全体鲁大力怒吼立刻腾空砸锤反击（{sv}×伤害）",
                "sk_aoyi_blade", "终伤 +{awkDmg%}，攻速 +{awkSpd%}；当场轰出裂地重锤罡气，之后每 3 轮普攻额外迸发双道破阵锤罡",
                "双倍夯击", Eff.Area, 0.48f, Eff.Slow, 1.2f, "夯锤范围 +{ov%}\n震荡减速 +{ov2} 秒",
                "村口防线低于 60% 生命时，鲁大力砸地范围 +30%",
                "「千斤夯锤」伤害 +15%，奥义「倒拔电线杆」锤罡伤害 +35%"));

            Put(K(HeroId.WuYong,
                "蒲扇指点", "sk_trait_tactic", TraitKind.AdjacentSpeed, 0.16f, 0, "蒲扇指点战局：吴校长左右相邻两格的乡亲常驻攻速 +{tv%}",
                "锦囊妙计", "sk_sig_merge", SigKind.OnMerge, 0, 20f, 0, "吴校长参与合成升星时，额外拨出 +{sv} 能量币，并立刻向 1 位输出乡亲送出鼓劲凉风",
                "sk_aoyi_aid", "光环与鼓劲效力 +{awkAura%}，号令回转 +{awkSpd%}；觉醒瞬间立刻为至多 2 位输出乡亲送上满层神速鼓劲",
                "课间加餐", Eff.Coin, 35f, Eff.UltPow, 0.35f, "每次合成 +{ov} 能量币\n鼓劲效力 +{ov2%}",
                "被鼓劲的乡亲参与合成升星时，剩余鼓劲层数无损继承给新乡亲",
                "「摇扇鼓劲」效果 +15%，奥义「桃李满村口」增益再 +25%"));

            Put(K(HeroId.LiKui,
                "锯齿撕甲", "sk_trait_exec", TraitKind.LowHpDmg, 0.30f, 0, "凶悍猛锯：对生命低于 40% 的外星军油锯伤害 +{tv%}",
                "双锯开山", "sk_sig_bastion", SigKind.WallDrop, 10, 1.15f, 0, "防线每损失 10% 生命，场上全体李铁牛狂怒立刻旋斩油锯清扫防线前（{sv}×伤害）",
                "sk_aoyi_blade", "终伤 +{awkDmg%}，攻速 +{awkSpd%}；当场劈出暴走旋风锯浪，之后每 3 轮普攻额外斩出双道旋风锯罡",
                "全油门双锯", Eff.Speed, 0.42f, Eff.Area, 0.30f, "攻速 +{ov%}\n油锯范围 +{ov2%}",
                "防线警戒线内有外星军时，李铁牛油锯回旋范围 +30%",
                "「旋风油锯」伤害 +15%，奥义「后山油锯王」锯罡伤害 +35%"));

            Put(K(HeroId.QiaoDaoqing,
                "高温融甲", "sk_trait_elem", TraitKind.DotBonus, 0.30f, 0, "炙烤火舌引燃猛火，命中附带持续灼烧（{tv%} 伤害）",
                "猛火炙烤", "sk_sig_seal", SigKind.OnDebuff, 0, 0.38f, 0, "火借风势：对正处于灼烧、减速状态的外星军，炙烤火舌伤害 +{sv%}",
                "sk_aoyi_spell", "奇人终伤 +{awkDmg%}，充能速率 +{awkSpd%}，持续施法延长 1 秒；觉醒当场激发猛火冲击波灼烧前排",
                "双枪猛烤", Eff.Refract, 1f, Eff.Dmg, 0.45f, "折射副火舌 +{ov} 道\n奇人伤害 +{ov2%}",
                "持续喷火结束那一刻，在终点炸开一团烈焰爆燃",
                "「炙烤火舌」伤害 +15%，奥义「孜然火焰山」持续时间再 +0.6 秒"));

            Put(K(HeroId.ZhuWu,
                "残局破绽", "sk_trait_tactic", TraitKind.ZoneVuln, 0.14f, 0, "踏入楚河棋阵的外星军阵脚大乱，2.5 秒内所受伤害 +{tv%}",
                "老谋深算", "sk_sig_seal", SigKind.OnStunBurst, 0, 0.65f, 0.8f, "楚河棋阵落下时当头将死：对中心敌军定身 {sv2} 秒并追加 {sv%} 棋阵伤害",
                "sk_aoyi_bind", "破阵终伤 +{awkDmg%}，布控速度 +{awkSpd%}；当场展开连环绝杀棋盘定身前排，之后每 3 轮普攻额外布下一座副棋阵",
                "双车错将", Eff.Area, 0.45f, Eff.Slow, 1.0f, "棋阵范围 +{ov%}\n减速时间 +{ov2} 秒",
                "楚河棋阵造成的破绽易伤提升至 +22%，持续延长 1.5 秒",
                "「楚河棋阵」伤害 +15%，奥义「将军死胡同」副阵范围 +35%"));

            Put(K(HeroId.XuNing,
                "液压拆甲", "sk_trait_exec", TraitKind.CavBonus, 0.55f, 0, "重型液压抓钳专拆底盘，对飞艇与机甲兽伤害 +{tv%}",
                "专拆底盘", "sk_sig_combo", SigKind.HighHpBreak, 0, 0.35f, 0, "迎头重钳：对生命高于 50% 的外星军，液压抓钳伤害 +{sv%}",
                "sk_aoyi_blade", "破阵终伤 +{awkDmg%}，布控速度 +{awkSpd%}；当场轰出液压裂阵钳芒，之后每 3 轮普攻额外挥出双道破车钢罡",
                "增压合金钳", Eff.Stun, 0.28f, Eff.Cav, 0.65f, "击晕几率 +{ov%}\n对飞艇机甲伤害 +{ov2%}",
                "液压抓钳命中飞艇与精英时，将其向村口外往回强拽 0.5 格",
                "「液压抓钳」伤害 +15%，奥义「钳翻飞碟阵」钳罡伤害 +35%"));

            Put(K(HeroId.ShanTinggui,
                "冰井水压", "sk_trait_elem", TraitKind.SplashSlow, 0.8f, 0, "高压深井水冰寒刺骨，减速持续时间额外 +{tv} 秒",
                "增压水泵", "sk_sig_seal", SigKind.OnDebuff, 0, 0.40f, 0, "水压叠涌：对处于减速、眩晕中的外星军，高压水柱伤害 +{sv%}",
                "sk_aoyi_spell", "奇人终伤 +{awkDmg%}，充能速率 +{awkSpd%}，持续施法延长 1 秒；觉醒当场激起寒水狂澜冻结前排",
                "分流双水枪", Eff.Refract, 1f, Eff.Slow, 1.2f, "折射副水柱 +{ov} 道\n减速时间 +{ov2} 秒",
                "被高压水柱持续冲刷的外星军，15% 几率凝结冰封 0.6 秒",
                "「高压水柱」伤害 +15%，奥义「百米大水龙」持续时间再 +0.6 秒"));

            Put(K(HeroId.WeiDingguo,
                "沸油蚀甲", "sk_trait_elem", TraitKind.DotBonus, 0.25f, 0, "滚烫红油黏附装甲，灼烧伤害 +{tv%} 并降低纳米医疗 60%",
                "火上浇油", "sk_sig_seal", SigKind.OnDebuff, 0, 0.45f, 0, "烈油助燃：对已处于灼烧状态的外星军，油罐直击伤害 +{sv%}",
                "sk_aoyi_fire", "重炮终伤 +{awkDmg%}，装填速度 +{awkSpd%}；灼烧外星军阵亡必连环引爆，且每 3 轮普攻额外抛投 4 枚滚烫小油弹",
                "特调猛火油", Eff.Burn, 0.85f, Eff.Area, 0.35f, "持续灼烧 +{ov%}\n油罐范围 +{ov2%}",
                "油罐爆炸范围 +25%，铺开的地面火海持续时间延长",
                "「滚烫油罐」伤害 +15%，奥义「沸油泼天阵」爆燃伤害 +35%"));

            // ==================== 稀有（10 位，第 4 技能为奥义） ====================
            Put(K(HeroId.ShiXiu,
                "庖丁狠刃", "sk_trait_exec", TraitKind.LowHpDmg, 0.15f, 0, "刀刀见骨：对生命低于 40% 的外星军快刀伤害 +{tv%}",
                "刀法利落", "sk_sig_bastion", SigKind.NearRage, 0, 0.22f, 1f, "防线前警戒线内有外星军逼近时，王铁柱舍命快斩，暴击率 +{sv%}",
                "sk_aoyi_blade", "终伤 +{awkDmg%}，攻速 +{awkSpd%}；当场斩出精钢十字刀气，之后每 3 轮普攻额外劈出双道破风刀芒",
                "快手双斩", Eff.Crit, 0.22f, Eff.Speed, 0.32f, "暴击率 +{ov%}\n攻速 +{ov2%}",
                "村口防线生命低于 50% 时，王铁柱最终伤害额外 +30%",
                "「剔骨快刀」伤害 +15%，奥义「案板无影刀」刀气伤害 +35%"));

            Put(K(HeroId.XieZhen,
                "防空神弹", "sk_trait_exec", TraitKind.FlyBonus, 0.35f, 0, "村口打鸟王专射飞碟，对小飞碟与太空雷伤害 +{tv%}",
                "打鸟专家", "sk_sig_combo", SigKind.EveryNCast, 3, 1f, 2f, "每第 {sn} 轮拉满皮筋夹双珠：当轮额外多射 {sv} 枚必暴追猎钢珠",
                "sk_aoyi_arrow", "终伤 +{awkDmg%}，攻速 +{awkSpd%}；当场狙射穿云破甲钢珠，之后每 3 轮普攻额外追射 1 枚必暴重型钢珠（优先飞碟与精英）",
                "钛金重弹珠", Eff.Dmg, 0.52f, Eff.Speed, 0.28f, "钢珠伤害 +{ov%}\n攻速 +{ov2%}",
                "每第 3 轮双珠齐射对精英与飞行外星军伤害再 +35%",
                "「穿云钢珠」伤害 +15%，奥义「百步穿飞碟」重珠伤害 +35%"));

            Put(K(HeroId.XieBao,
                "特辣蘸酱", "sk_trait_elem", TraitKind.DotBonus, 0.25f, 0, "不锈钢叉蘸满魔鬼辣油，穿透 1 人且辣毒额外 +{tv%}",
                "双倍辣毒", "sk_sig_seal", SigKind.OnDebuff, 0, 0.38f, 0, "伤口撒辣：对已中毒或减速的外星军，魔鬼辣叉直击伤害 +{sv%}",
                "sk_aoyi_arrow", "终伤 +{awkDmg%}，攻速 +{awkSpd%}；当场激射特辣飞叉雨，之后每 3 轮普攻额外甩出 3 柄贯阵辣叉",
                "倒刺猛辣叉", Eff.Chain, 1f, Eff.Burn, 0.55f, "辣叉穿透 +{ov} 人\n持续辣毒 +{ov2%}",
                "中辣毒外星军阵亡时，向周围溅开一团辣油雾传染周围外星军",
                "「魔鬼辣叉」伤害 +15%，奥义「农家魔鬼叉」飞叉伤害 +35%"));

            Put(K(HeroId.MaLing,
                "强磁巧劲", "sk_trait_crit", TraitKind.NthShotCrit, 0.18f, 3, "电磁手套蓄能流转，每第 {tn} 轮抛砖暴击率 +{tv%}",
                "砌墙快手", "sk_sig_combo", SigKind.EveryNCast, 3, 1.35f, 0.8f, "每第 {sn} 轮拍出加厚承重红砖：伤害 ×{sv}，范围扩大且多弹射 1 次必晕 {sv2} 秒",
                "sk_aoyi_spell", "奇人终伤 +{awkDmg%}，充能速率 +{awkSpd%}；当场天降连环红砖震压前排，之后每 3 轮施法额外砸落 3 块追魂红砖",
                "磁力连环砖", Eff.Area, 0.38f, Eff.Chain, 1f, "红砖范围 +{ov%}\n红砖弹射 +{ov2} 次",
                "被红砖拍晕的外星军 3 秒内所受伤害 +20%",
                "「磁化红砖」伤害 +15%，奥义「万砖拍脑门」追砸伤害 +35%"));

            Put(K(HeroId.KongLiang,
                "加料火药", "sk_trait_elem", TraitKind.DotBonus, 0.12f, 0, "大二踢脚内掺铝热火星，爆炸后灼烧外星军（{tv%} 伤害）",
                "添药加响", "sk_sig_legion", SigKind.CountGE, 3, 1f, 0, "场上同时存在 ≥{sn} 位陈喜子时，全体陈喜子每次投掷炮仗数量 +1",
                "sk_aoyi_fire", "重炮终伤 +{awkDmg%}，装填速度 +{awkSpd%}；当场倾泻漫天炮仗雨，之后每 3 轮普攻额外抛投 4 枚连响小炮仗",
                "迎宾双响炮", Eff.Area, 0.42f, Eff.Dmg, 0.40f, "炮仗范围 +{ov%}\n炮仗伤害 +{ov2%}",
                "场上满 4 位陈喜子时，爆炸范围再 +25%",
                "「大二踢脚」伤害 +15%，奥义「开门满堂红」连响炮仗伤害 +35%"));

            Put(K(HeroId.TangLong,
                "精工打磨", "sk_trait_tactic", TraitKind.CritDmgAura, 0.12f, 0, "五金老铁坐镇：唐五金在场时，全村暴击伤害额外 +{tv%}",
                "五金世家", "sk_sig_merge", SigKind.OnMerge, 0, 0.42f, 6f, "唐五金参与合成升星时，当场焊机全开：全村伤害 +{sv%} 持续 {sv2} 秒",
                "sk_aoyi_aid", "光环与改装效力 +{awkAura%}，号令回转 +{awkSpd%}；觉醒瞬间全村家伙精锻 10 秒，暴击与终伤齐升",
                "合金加固", Eff.Aura, 0.58f, Eff.Coin, 32f, "伤害光环 +{ov%}\n每次合成 +{ov2} 能量币",
                "「家伙改装」持续时间从 8 秒延长至 11 秒",
                "「家伙改装」效果 +15%，奥义「神级手艺人」增幅再 +25%"));

            Put(K(HeroId.SunErniang,
                "呛鼻辣油", "sk_trait_elem", TraitKind.ZoneVuln, 0.15f, 0, "魔鬼辣椒粉呛入呼吸阀，命中的外星军 2.5 秒内所受伤害 +{tv%}",
                "特辣配方", "sk_sig_seal", SigKind.OnDebuff, 0, 0.42f, 0, "辣上加辣：对已处于眩晕或减速的外星军，魔鬼辣雾伤害 +{sv%}",
                "sk_aoyi_bind", "破阵终伤 +{awkDmg%}，布控速度 +{awkSpd%}；当场爆开漫天红辣雾呛倒前排，之后每 3 轮普攻额外加扬一瓢浓辣烟",
                "陈年小米辣", Eff.Stun, 0.28f, Eff.Area, 0.32f, "击晕几率 +{ov%}\n辣粉范围 +{ov2%}",
                "被魔鬼辣雾呛晕的外星军，眩晕持续时间延长 0.4 秒",
                "「魔鬼辣雾」伤害 +15%，奥义「十里呛魂香」辣雾伤害 +35%"));

            Put(K(HeroId.RuanXiaoqi,
                "塘主老手", "sk_trait_tactic", TraitKind.PriorityElite, 0.30f, 0, "深水大网连低空飞碟与精英一并罩住，对其伤害 +{tv%}",
                "撒网老手", "sk_sig_seal", SigKind.OnStunBurst, 0, 0.75f, 0.18f, "尼龙大网收紧勒伤猎物：网住瞬间激起水花造成 {sv%} 伤害，并挂 {sv2%} 易伤",
                "sk_aoyi_bind", "破阵终伤 +{awkDmg%}，布控速度 +{awkSpd%}；当场撒开巨型铅坠大网困住敌潮，之后每 3 轮普攻额外补撒一张大网",
                "加铅沉底网", Eff.Stun, 0.45f, Eff.Area, 0.32f, "控制时间 +{ov} 秒\n渔网范围 +{ov2%}",
                "被渔网定身的外星军减速延长 1.5 秒",
                "「深水大网」伤害 +15%，奥义「一网打尽光」追网伤害 +35%"));

            Put(K(HeroId.ShiQian,
                "闪送百搭", "sk_trait_tactic", TraitKind.WildMerge, 0.28f, 0, "召唤与合成出小迁子时，{tv%} 几率呈「闪送百搭」态，可与任意同星乡亲合成",
                "走街串巷", "sk_sig_merge", SigKind.OnMerge, 0, 28f, 0.30f, "小迁子参与合成升星时，顺手拆回 {sv} 能量币，并立刻给最强外星军挂 {sv2%} 破绽易伤",
                "sk_aoyi_aid", "能量币光环与拆件收益 +{awkAura%}，号令回转 +{awkSpd%}；觉醒当场顺回一笔能量币并标记全场精英破绽",
                "极速跑单", Eff.Coin, 32f, Eff.Aura, 0.45f, "每次合成 +{ov} 能量币\n掉落光环 +{ov2%}",
                "「闪送百搭」触发几率从 28% 提升至 40%",
                "「顺手拆件」收益 +15%，奥义「全村及时达」能量币再 +25%"));

            Put(K(HeroId.JiangJing,
                "村账金盘", "sk_trait_tactic", TraitKind.InterestCap, 60f, 0, "铁算会计坐镇：单次经费补贴利息上限提高 +{tv} 能量币",
                "精打细算", "sk_sig_merge", SigKind.OnMerge, 0, 0.12f, 35f, "蒋会计参与合成升星时，当场按当前能量币结算一次 {sv%} 活期补贴（保底 {sv2} 能量币）",
                "sk_aoyi_aid", "利息光环与补贴效力 +{awkAura%}，号令回转 +{awkSpd%}；觉醒当场派发一笔丰厚能量币并鼓舞全村攻速 6 秒",
                "村集体分红", Eff.Aura, 0.55f, Eff.Coin, 32f, "利息光环 +{ov%}\n每次合成 +{ov2} 能量币",
                "释放「经费补贴」鼓舞全村攻速的持续时间延长至 7 秒",
                "「经费补贴」收益 +15%，奥义「算盘响黄金」补贴再 +25%"));

            return a;
        }
    }
}
