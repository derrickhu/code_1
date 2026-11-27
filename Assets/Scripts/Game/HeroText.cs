using Liangshan.Sim;

namespace Liangshan
{
    /// <summary>好汉技能说明：局内信息面板和局外好汉详情共用。传入 Battle 时带上本局强化后的数值。</summary>
    public static class HeroText
    {
        public static string O(object s) => $"<color=#FFC83D>{s}</color>";
        /// <summary>黑曜石暗底面板上的次级战术高亮关键字（赛博冰青）。</summary>
        public static string OnLight(string s) => s.Replace("<color=#FFC83D>", "<color=#00E5FF>").Replace("<color=#F5C84B>", "<color=#00E5FF>");
        static string P(float v) => $"{v * 100:0.#}%";
        static string Sec(float v) => O(v.ToString("0.#") + "秒");

        public static string Atk(HeroDef d, Battle b = null, float panelAtk = 0f, int star = 0)
        {
            if (d.Buff.HasValue) return Buff(d, b, star);
            var h = d.Id;
            int count = b?.CountOf(h) ?? d.Count;
            int chain = b?.ChainOf(h) ?? d.Chain;
            float area = b?.AreaOf(h) ?? 1f;
            float stun, chance;
            if (b != null) (stun, chance) = b.StunOf(h);
            else { stun = d.Stun > 0 ? d.Stun : 0.8f; chance = d.Stun > 0 && d.StunChance <= 0 ? 1f : d.StunChance; }
            float slow = b?.SlowOf(h) ?? d.Slow;
            string hitNote = panelAtk > 0.5f ? $"（{O(Ui.Num(System.Math.Max(1, (int)System.Math.Round(panelAtk * d.Coef))))}）" : "";
            string dmg = $"{O(P(d.Coef))}攻击力{hitNote}的{d.Element}伤害";
            string t;
            if (d.Chan > 0)
            {
                float chan = d.Chan + (b != null ? Defs.ChanPerCount * b.Stat(h, Eff.Count) : 0);
                string head = $"持续施法{Sec(chan)}，每{O(d.Tick.ToString("0.##"))}秒";
                float cond = b != null ? b.Stat(h, Eff.Conduct) : 0f;
                int refN = b != null ? (int)System.Math.Round(b.Stat(h, Eff.Refract)) : 0;
                switch (d.Shot)
                {
                    case ShotKind.Beam:
                        t = $"{head}灼烧射线上的敌人，目标受到{dmg}，沿途敌人受{O("80%")}"
                            + (refN > 0 ? $"，并向周围折射{O(refN)}道副光束（{O("62%")}伤害）" : "");
                        break;
                    case ShotKind.Lightning:
                        t = $"{head}一道高压电弧随机劈向前排，造成{dmg}" + (chain > 0 ? $"并逐跳连锁{O(chain)}个敌人" : "");
                        break;
                    case ShotKind.Wind:
                        t = $"{head}在目标处绞杀，目标受到{dmg}，半径{O((d.Radius * area).ToString("0.##"))}内敌人受{O(d.Kind == Role.Mage ? "80%" : "55%")}伤害";
                        break;
                    default:
                        string bNote = cond >= 0.8f ? "（弹跳不衰减并激起震波）" : $"（每跳保留{O("82%")}伤害）";
                        t = $"{head}在敌人头顶结阵，召磁砖从天而降砸下，造成{dmg}" + (chain > 0 ? $"，再弹射{O(chain)}次{bNote}" : "");
                        break;

                }
            }
            else
            {
                string noun = d.Noun ?? "攻击";
                float cond = b != null ? b.Stat(h, Eff.Conduct) : 0f;
                switch (d.Shot)
                {
                    case ShotKind.Arrow:
                        t = count <= 1
                            ? $"向前排射出{O(1)}发{noun}，造成{dmg}"
                            : $"向前排射出{O(count)}发{noun}，每发造成{dmg}";
                        if (chain > 0)
                            t += $"，穿透{O(chain)}个敌人" + (d.PierceGrow > 0 ? $"（每穿透1敌伤害+{O(P(d.PierceGrow))}）" : "");
                        break;
                    case ShotKind.Bomb:
                        t = $"投掷{O(count)}枚{noun}，对半径{O((d.Radius * area).ToString("0.##"))}内的敌人造成{dmg}并震退";
                        break;
                    case ShotKind.Fireball:
                        t = $"轰落{O(count)}颗{noun}，落地爆炸对半径{O((d.Radius * area).ToString("0.##"))}内的敌人造成{dmg}并震退";
                        break;
                    case ShotKind.Lightning:
                    {
                        string hopNote = cond >= 1.8f ? "（超导无衰减，终点爆紫电雷池）" : cond >= 0.8f ? $"（每跳保留{O("92%")}伤害）" : $"（每跳保留{O("82%")}递减）";
                        t = count <= 1
                            ? $"召下一道高压电弧劈中敌人，造成{dmg}" + (chain > 0 ? $"，再逐跳连锁{O(chain)}个敌人{hopNote}" : "")
                            : $"召下{O(count)}道高压电弧劈中敌人，每道造成{dmg}" + (chain > 0 ? $"并逐跳连锁{O(chain)}个敌人{hopNote}" : "");

                        break;
                    }
                    case ShotKind.Punch:
                        t = count <= 1
                            ? $"向近身目标及身边外星军（半径{O((d.Radius * area).ToString("0.##"))}）挥出{O(1)}记{noun}，造成{dmg}并击退"
                            : $"向近身目标及身边外星军（半径{O((d.Radius * area).ToString("0.##"))}）连出{O(count)}记{noun}，每次造成{dmg}并击退";
                        break;
                    case ShotKind.Slam:
                        t = $"重砸震击半径{O((d.Radius * area).ToString("0.##"))}内的敌人，造成{dmg}并击退";
                        break;
                    case ShotKind.Spear:
                    {
                        bool fullRear = b != null && b.Stat(h, Eff.Reach) > 3f;
                        string rearNote = fullRear ? "（全额伤害）" : $"（身后受{O("70%")}伤害）";
                        t = $"长柄{noun}贯穿目标和身后一列敌人{rearNote}，造成{dmg}" + (d.Knock > 0 ? "并击退" : "");
                        break;
                    }
                    case ShotKind.Stone:
                    {
                        if (d.Kind == Role.Mage)
                        {
                            float wRad = (d.Radius * area) * (cond >= 1.8f ? 1.30f : cond >= 0.8f ? 1.15f : 1.0f);
                            string wPct = cond >= 1.8f ? O("100%") : cond >= 0.8f ? O("88%") : O("75%");
                            string bNote = cond >= 0.8f ? "（弹跳无衰减）" : $"（每跳保留{O("85%")}伤害）";
                            t = $"祭出{O(count)}块{noun}从天砸落，造成{dmg}，并激起半径{O(wRad.ToString("0.##"))}的电磁震波轰击周围外星军（{wPct}伤害）"
                                + (chain > 0 ? $"，再弹射{O(chain)}次{bNote}" : "");
                        }
                        else
                        {
                            string sNote = cond >= 0.8f ? "（弹跳无衰减并爆碎星）" : $"（每跳保留{O("80%")}伤害）";
                            t = $"掷出{O(count)}枚{noun}造成{dmg}" + (chain > 0 ? $"，再弹射{O(chain)}次{sNote}" : "");
                        }

                        break;
                    }
                    case ShotKind.Lasso:
                        t = $"甩出套索缚住{O(count)}个敌人，造成{dmg}并定身{Sec(stun)}，高压电击余劲波及周围敌人（{O("65%")}伤害）";

                        break;
                    default:
                        t = $"气浪卷向敌群，对目标造成{dmg}，周围敌人受一半伤害";
                        break;
                }
                if (d.Dot > 0)
                {
                    string dotKind = d.Element == "火系" ? "灼烧" : "辣毒";
                    t += $"，并附加{Sec(Defs.BurnDur)}{O(P(d.Dot))}{dotKind}" + (d.AntiHeal ? $"（纳米修复降低{O("60%")}）" : "");
                }
            }
            if (d.Shot != ShotKind.Lasso && chance > 0)
                t += chance >= 1f ? $"，击晕{Sec(stun)}" : $"，{O(P(chance))}几率击晕{Sec(stun)}";
            if (slow > 0) t += $"，减速{Sec(slow)}";
            string aura = Aura(d, b);
            if (aura.Length > 0) t += "\n" + aura;
            return t;
        }

        /// <summary>辅助的技能：给队友加持，不打伤害。对标《蔚蓝星球》直白人话：传入 star 时直接显示当前星级的确切数值，不写难懂公式。</summary>
        static string Buff(HeroDef d, Battle b, int star = 0)
        {
            int st = System.Math.Max(1, star);
            float starBoost = star > 0 ? 1f + StarTraits.Fx(d, st).Buff : 1f;
            float boost = (b?.BuffBoost(d.Id) ?? 1f) * starBoost;
            string t;
            switch (d.Buff.Value)
            {
                case UltKind.Bless:
                {
                    int hits = 2 + st;
                    string who = star >= 3 ? $"随机 {O(2)} 位输出乡亲" : $"随机输出乡亲" + (star == 0 ? $"（{O("3星")}起同时鼓劲2位）" : "");
                    string cnt = star > 0 ? $"{O(hits + "次")}" : $"{O("3次")}（每升1星再+1次）";
                    string cut = O(P(1f - 1f / (1f + d.BuffV * boost)));
                    t = $"摇扇鼓舞{who}：凉风吹到时，冷却立刻缩短 {cut}。\n之后 {cnt}，出手间隔缩短 {cut}";
                    break;
                }
                case UltKind.Rush:
                {
                    float cut = System.Math.Min(0.8f, (d.BuffV + 0.1f * (st - 1)) * boost);
                    t = $"放响动感节拍，其余乡亲的技能与大招冷却立即缩短 {O(P(cut))}" + (star == 0 ? $"（每升1星再 {O("+10%")}）" : "");
                    break;
                }
                case UltKind.Mend:
                {
                    float heal = d.BuffV * st * (1f + (b?.Stat(d.Id, Eff.Aura) ?? 0f)) * boost;
                    t = $"施针抢修防线，为村口防线回复 {O(P(heal))} 最大生命" + (star == 0 ? "（随星级成倍提升）" : "") + "，并解除全场乡亲晕眩";
                    break;
                }
                case UltKind.Forge:
                {
                    float dmgUp = d.BuffV * (0.9f + 0.1f * st) * boost;
                    t = $"拧紧螺母改装家伙：{Sec(8)}内全村乡亲伤害提升 {O("+" + P(dmgUp))}" + (star == 0 ? "（星级越高增幅越大）" : "");
                    break;
                }
                case UltKind.Steal:
                {
                    int baseCoin = (int)System.Math.Round((28 + 12 * st + (b?.Wave ?? 1) * 5) * boost);
                    string coinTxt = b != null || star > 0 ? $"{O(baseCoin + " 能量币")}" : $"{O("40+ 能量币")}（随星级与波次递增）";
                    t = $"骑电驴顺手拆件，立即顺走 {coinTxt}，并拆松最强外星军护甲 {Sec(Defs.VulnDur)}（使其受伤 {O("+25%")}）";
                    break;
                }
                case UltKind.Interest:
                    t = $"拨响金算盘立即结算当前能量币 {O(P(d.BuffV * boost))} 的补贴红利（保底 {O("45")}，最高 {O("260")} 能量币），并鼓舞全村攻速 {O("+25%")} 持续 {Sec(5)}";
                    break;
                default: t = ""; break;
            }
            string aura = Aura(d, b);
            if (aura.Length > 0) t += "\n" + aura;
            return t;
        }

        public static string Aura(HeroDef d, Battle b = null)
        {
            string v = O(P(d.AuraV));
            switch (d.Aura)
            {
                case AuraKind.Speed: return $"光环：在场每星为全村加{v}攻速" + (b != null ? $"（当前{O("+" + P(b.Aura))}）" : "");
                case AuraKind.Dmg: return $"光环：在场每星为全村加{v}伤害" + (b != null ? $"（当前{O("+" + P(b.DmgAura))}）" : "");
                case AuraKind.Charge: return $"光环：在场每星让全村冷却加快{v}" + (b != null ? $"（当前{O("+" + P(b.ChargeAura))}）" : "");
                case AuraKind.Coin: return $"光环：在场每星让击杀能量币加{v}" + (b != null ? $"（当前{O("+" + P(b.CoinAura))}）" : "");
                case AuraKind.Interest: return $"每4秒获得当前能量币{v}×星级的利息（{O("4~30")}）";
                default: return "";
            }
        }

        /// <summary>pow：大招威力倍率（强化加成）。</summary>
        public static string Ult(HeroDef d, float pow = 1f)
        {
            if (!d.HasUlt) return "仅传说乡亲拥有大招";
            string dmg = $"{O(P(d.UltCoef * pow))}攻击力";
            string n = O(d.UltN);
            switch (d.Ult)
            {
                case UltKind.Thunder: return $"{n}道万伏雷暴劈向敌群，每道造成{dmg}伤害并麻痹{Sec(d.UltStun)}";
                case UltKind.Frost: return $"极寒液氮冰封一片敌人，造成{dmg}伤害，冻住{Sec(d.UltStun)}";
                case UltKind.Sweep: return $"横扫防线前一整排，{n}段各造成{dmg}伤害并击飞";
                case UltKind.Haste: return $"全村攻速{O("+60%")}持续{Sec(8f * pow)}";
                case UltKind.Heal: return $"为村口防线回复{O(P(d.UltCoef * pow))}起最大生命（随星级提升），并解除所有乡亲的晕眩";
                case UltKind.Bind: return $"同时套住{n}个外星人（优先精英、首领），每个造成{dmg}伤害并定身{Sec(d.UltStun)}";
                case UltKind.Snipe: return $"锁定场上最强的外星头目，一发重钉造成{dmg}伤害";
                case UltKind.Tornado: return $"掀起巨型沙尘龙卷风，范围内敌人受到{dmg}伤害并被卷飞{Sec(d.UltStun)}";
                case UltKind.Meteor: return $"漫天砸落{n}颗巨型礼花弹，每颗造成{dmg}范围伤害";
            }
            return "";
        }

        public static string Passive(HeroDef d) => HeroKits.Of(d.Id).SigDesc;

        public static string Trait(HeroDef d) => HeroKits.Of(d.Id).TraitDesc;

        public static string Finisher(HeroDef d, float pow = 1f)
            => d.HasUlt ? Ult(d, pow) : HeroKits.Of(d.Id).FinisherDesc;

        public static string Tip(HeroDef d) =>
            d.Buff.HasValue ? "辅助：不打伤害，专给乡亲加持" :
            d.Melee ? "近战：打不到空中飞碟 · 精英与首领免疫击退" : d.Physical ? "物理：被太空重甲削弱" : "奇人：元素克制重甲";
    }
}
