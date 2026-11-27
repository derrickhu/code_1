using System;
using System.Linq;
using Liangshan.Sim;
using NUnit.Framework;

namespace Liangshan.Tests
{
    public class MetaTests
    {
        [Test]
        public void NewSaveOwnsFourCommonStartersAndAllArraysSized()
        {
            var s = Meta.NewSave(1000);
            Assert.AreEqual(Defs.HeroCount, s.HeroLv.Length);
            Assert.AreEqual(Defs.LevelCount, s.Stars.Length);
            Assert.AreEqual(Defs.Enemies.Length, s.Seen.Length);
            for (int h = 0; h < Defs.HeroCount; h++)
                Assert.AreEqual(Meta.Starters.Contains((HeroId)h) ? 1 : 0, s.HeroLv[h]);
            CollectionAssert.AreEqual(Meta.Starters, Meta.Lineup(s));
            foreach (var h in Meta.Starters) Assert.AreEqual(2, Defs.Hero(h).Rarity, Defs.Hero(h).Name);
            Assert.AreEqual(4, Meta.Starters.Select(h => Defs.Hero(h).Kind).Distinct().Count());
            Assert.AreEqual(50, Defs.LevelCount);
            Assert.AreEqual(Meta.StaminaMax, s.Stamina);
        }

        [Test]
        public void FirstClearUnlocksRampFromCommonToLegendary()
        {
            int last = 2, firstLegend = 0;
            for (int n = 1; n <= Defs.LevelCount; n++)
            {
                var h = Meta.UnlockAt(n);
                if (!h.HasValue) continue;
                int r = Defs.Hero(h.Value).Rarity;
                Assert.GreaterOrEqual(r, last, "第" + n + "关");
                last = r;
                if (r == 4 && firstLegend == 0) firstLegend = n;
            }
            Assert.That(firstLegend, Is.InRange(12, 20), "传说首通保送提前，配合第6关招募池首日即可体验大招");

            var s = Meta.NewSave(0);
            for (int seed = 1; seed <= 20; seed++)
                Assert.IsFalse(Meta.Recruit(s, 10, new Rng(seed)).Any(p => Defs.Hero(p.Hero).Rarity == 4));
            Assert.AreEqual(0, s.Pity);
        }

        [Test]
        public void LevelUpSpendsShardsAndCopperAndUnlocksTalent()
        {
            var s = Meta.NewSave(0);
            var a = Meta.Starters[0];
            int ai = (int)a, bi = (int)Meta.Starters[1];
            Assert.IsFalse(Meta.LevelUp(s, a));
            Assert.IsFalse(Meta.LevelUp(s, HeroId.HuaRong));
            s.Shards[ai] = 100;
            s.Copper = 100000;
            float before = Meta.BuildLoadout(s).HeroDmg[ai];
            for (int i = 0; i < 4; i++) Assert.IsTrue(Meta.LevelUp(s, a));
            Assert.AreEqual(5, s.HeroLv[ai]);
            Assert.AreEqual(100 - (3 + 4 + 5 + 6), s.Shards[ai]);
            var lo = Meta.BuildLoadout(s);
            Assert.Greater(lo.HeroDmg[ai], before);
            Assert.AreEqual(5, lo.Lv[ai]);
            Assert.IsFalse(lo.Passive[ai]);
            Assert.IsFalse(lo.Passive[bi]);
            s.HeroLv[(int)HeroId.WuYong] = 9;
            Assert.IsFalse(Meta.BuildLoadout(s).Passive[(int)HeroId.WuYong], "吴用 9 级绝技还没开");
            s.HeroLv[(int)HeroId.WuYong] = 10;
            Assert.IsTrue(Meta.BuildLoadout(s).Passive[(int)HeroId.WuYong], "全员统一 10 级自动获得本命绝技");
            Assert.AreEqual(Meta.PassiveLv, Meta.PassiveUnlock(HeroId.HuaRong));
            Assert.Greater(lo.CritDmg, Meta.BaseCritDmg);
            Assert.AreEqual(4, s.Task[(int)Act.HeroUp]);
            Assert.AreEqual(4, s.Life[(int)Act.HeroUp]);
        }

        [Test]
        public void ForgeCappedByProgress()
        {
            var s = Meta.NewSave(0);
            s.Iron = 10000;
            s.Copper = 10000000;
            while (Meta.Forge(s, 0)) { }
            Assert.AreEqual(Meta.EquipMax(s), s.EquipLv[0]);
            s.Cleared = 20;
            Assert.IsTrue(Meta.Forge(s, 0));
            var lo = Meta.BuildLoadout(s);
            Assert.Greater(lo.Atk, Meta.BaseAtk + 10);
            Assert.AreEqual(1f, lo.RoleDmg[(int)Role.Fighter], 1e-4f);
            s.EquipLv[0] = 10;
            Assert.AreEqual(1f + Meta.BreakDmg, Meta.BuildLoadout(s).RoleDmg[(int)Role.Fighter], 1e-4f);
        }

        [Test]
        public void FirstClearRewardsAndUnlockOnce()
        {
            var s = Meta.NewSave(0);
            s.Cleared = 2;
            var st = Defs.Level(3);
            var r = Meta.BattleRewards(s, st, true, 10, 1f, 0, new Rng(1));
            Assert.IsTrue(r.First);
            Assert.AreEqual(3, r.Stars);
            Assert.AreEqual(2, Meta.StarsFor(0.8f));
            Assert.AreEqual(1, Meta.StarsFor(0.3f));
            Assert.IsNull(r.Unlock);
            Assert.Greater(r.Get(Cur.Ingot), 0);
            Assert.Greater(r.Get(Cur.Token), 0);
            Meta.Give(s, r);
            Meta.FinishMain(s, st, true, r);
            Assert.IsFalse(Meta.Owned(s, HeroId.RuanXiaoqi));
            Assert.AreEqual(3, s.Cleared);
            Assert.AreEqual(4, s.Selected);
            Assert.AreEqual(1, s.Speed15);

            var again = Meta.BattleRewards(s, st, true, 10, 0.2f, 0, new Rng(2));
            Assert.IsFalse(again.First);
            Assert.IsNull(again.Unlock);
            Assert.AreEqual(0, again.Get(Cur.Ingot));
            Meta.FinishMain(s, st, true, again);
            Assert.AreEqual(3, s.Stars[2]);
        }

        [Test]
        public void LossGivesPartialCopperOnly()
        {
            var s = Meta.NewSave(0);
            var r = Meta.BattleRewards(s, Defs.Level(1), false, 6, 0, 0, new Rng(1));
            Assert.Greater(r.Get(Cur.Copper), 0);
            Assert.AreEqual(1, r.Items.Count);
            Assert.IsFalse(r.First);
        }

        [Test]
        public void RecruitPityAndTenPullGuarantee()
        {
            var s = Meta.NewSave(0);
            s.Cleared = Meta.OrangeOpen;
            bool orange = false;
            for (int i = 0; i < Meta.OrangePity && !orange; i++)
                orange = Meta.Recruit(s, 1, new Rng(1000 + i)).Any(p => Defs.Hero(p.Hero).Rarity == 4);
            Assert.IsTrue(orange);

            for (int seed = 1; seed <= 60; seed++)
            {
                var t = Meta.NewSave(0);
                if (seed > 30) Meta.SetWish(t, HeroId.WuSong);
                var res = Meta.Recruit(t, 10, new Rng(seed));
                Assert.AreEqual(10, res.Count);
                Assert.IsTrue(res.Any(p => Defs.Hero(p.Hero).Rarity >= 3));
                foreach (var p in res) Assert.IsTrue(p.New || p.Shards > 0);
                int maxCount = res.GroupBy(p => p.Hero).Max(g => g.Count());
                Assert.LessOrEqual(maxCount, seed > 30 ? 3 : 2, "十连防同人扎堆连刷");
                int maxRar = res.Max(p => Defs.Hero(p.Hero).Rarity);
                Assert.AreEqual(maxRar, Defs.Hero(res[9].Hero).Rarity, "十连最高稀有度压轴收官");
            }
        }

        [Test]
        public void StaminaRegensAndDayRollResetsDailies()
        {
            var s = Meta.NewSave(0);
            Assert.IsTrue(Meta.Spend(s, Cur.Stamina, 20));
            s.StaminaAt = 0;
            Meta.RegenStamina(s, Meta.StaminaSec * 7 + 10);
            Assert.AreEqual(Meta.StaminaMax - 13, s.Stamina);
            Meta.RegenStamina(s, Meta.StaminaSec * 1000);
            Assert.AreEqual(Meta.StaminaMax, s.Stamina);

            s.Day = 5;
            Meta.Progress(s, Act.Battle, 3);
            Assert.IsTrue(Meta.ClaimTask(s, 1));
            Assert.IsFalse(Meta.ClaimTask(s, 2), "出征 6 次还没到");
            s.DailyTries = 2;
            Meta.RollDay(s, 6);
            Assert.AreEqual(0, s.Task[(int)Act.Battle]);
            Assert.AreEqual(0, s.TaskClaimed);
            Assert.AreEqual(0, s.DailyTries);
            Assert.IsTrue(Meta.TaskDone(s, 0), "跨天自动算登录");
        }

        [Test]
        public void DailyTasksFillActiveBoxesAndPlayingMorePaysMore()
        {
            var s = Meta.NewSave(0);
            Meta.RollDay(s, 3);
            Assert.IsFalse(Meta.CanActBox(s, 0));
            int tokens0 = s.Tokens;
            foreach (var t in Meta.Tasks) Meta.Progress(s, t.Kind, t.Need);
            for (int i = 0; i < Meta.Tasks.Length; i++) Assert.IsTrue(Meta.ClaimTask(s, i));
            Assert.GreaterOrEqual(Meta.ActPoints(s), Meta.ActBoxNeed[Meta.ActBoxNeed.Length - 1], "全做完要能开满活跃宝箱");
            for (int k = 0; k < Meta.ActBoxNeed.Length; k++) Assert.IsNotNull(Meta.OpenActBox(s, k));
            Assert.IsNull(Meta.OpenActBox(s, 0), "同一天只开一次");
            Assert.GreaterOrEqual(s.Tokens - tokens0, 8, "肝满一天至少 8 张招募令");
        }

        [Test]
        public void SevenDayGoalsUnlockByDayAndLastBoxGivesHero()
        {
            var s = Meta.NewSave(0);
            Meta.RollDay(s, 100);
            Assert.AreEqual(1, Meta.DayNo(s, 100));
            s.Cleared = 30;
            int day2 = Array.FindIndex(Meta.Goals, g => g.Day == 2 && g.Kind == Meta.Goal.Cleared);
            Assert.IsTrue(Meta.GoalDone(s, day2));
            Assert.IsNull(Meta.ClaimGoal(s, day2, 100), "第二天的目标第一天不能领");
            Assert.IsNotNull(Meta.ClaimGoal(s, day2, 101));
            Assert.IsNull(Meta.ClaimGoal(s, day2, 101), "只能领一次");

            Assert.GreaterOrEqual(Meta.Goals.Length * Meta.SevenPoints, Meta.SevenBoxNeed[Meta.SevenBoxNeed.Length - 1], "全部目标的积分要够开最后一箱");
            for (int d = 1; d <= Meta.SevenDays; d++) Assert.AreEqual(5, Array.FindAll(Meta.Goals, g => g.Day == d).Length);
            s.SevenGot = (1L << Meta.Goals.Length) - 1;
            Assert.IsFalse(Meta.Owned(s, Meta.SevenHero));
            for (int k = 0; k < Meta.SevenBoxNeed.Length - 1; k++) Assert.IsNotNull(Meta.OpenSevenBox(s, k, out _));
            Assert.IsNotNull(Meta.OpenSevenBox(s, Meta.SevenBoxNeed.Length - 1, out var hero));
            Assert.AreEqual(Meta.SevenHero, hero);
            Assert.IsTrue(Meta.Owned(s, Meta.SevenHero));
            Assert.IsTrue(Meta.SevenFinished(s));
        }

        [Test]
        public void RecruitSprintCountsThisRoundAndResetsWeekly()
        {
            var s = Meta.NewSave(0);
            Meta.RollDay(s, 50);
            s.Tokens = 200;
            Meta.Recruit(s, 10, new Rng(3));
            Meta.Recruit(s, 10, new Rng(4));
            Assert.AreEqual(20, Meta.SprintPulls(s));
            Assert.IsNotNull(Meta.ClaimSprintTier(s, 0));
            Assert.IsNotNull(Meta.ClaimSprintTier(s, 1));
            Assert.IsFalse(Meta.CanSprintTier(s, 2));

            for (int i = 0; i < 5; i++) Meta.FinishMain(s, Defs.Level(1), false, new Rewards());
            Assert.AreEqual(1, s.LostStage);
            Assert.IsTrue(Meta.CanSprintTask(s, 0), "输了也算出征");
            Assert.IsTrue(Meta.ClaimSprintTask(s, 0).HasValue);

            Meta.RollDay(s, 50 + Meta.SprintDays - 1);
            Assert.AreEqual(20, Meta.SprintPulls(s), "同一轮里不清零");
            Meta.RollDay(s, 50 + Meta.SprintDays);
            Assert.AreEqual(0, Meta.SprintPulls(s));
            Assert.AreEqual(0, s.SprintTier);
            Assert.AreEqual(0, s.SprintTask);
        }

        [Test]
        public void WelfareOncePerDay()
        {
            var s = Meta.NewSave(0);
            Assert.IsNotNull(Meta.ClaimWelfare(s, 9));
            Assert.IsNull(Meta.ClaimWelfare(s, 9));
            Assert.IsTrue(Meta.CanWelfare(s, 10));
        }

        [Test]
        public void IdleCapsAtEightHours()
        {
            var s = Meta.NewSave(0);
            s.IdleAt = 0;
            var r = Meta.CollectIdle(s, 3600 * 30);
            Assert.AreEqual((int)(Meta.IdleCopperPerHour(s) * Meta.IdleCapHours), r.Get(Cur.Copper));
            Assert.AreEqual(3600 * 30, s.IdleAt);
        }

        [Test]
        public void ChapterChestNeedsStarsAndOpensOnce()
        {
            var s = Meta.NewSave(0);
            Assert.IsFalse(Meta.CanOpenChest(s, 1, 0));
            for (int i = 0; i < 4; i++) s.Stars[i] = 3;
            Assert.IsTrue(Meta.CanOpenChest(s, 1, 0));
            Assert.IsFalse(Meta.CanOpenChest(s, 1, 1));
            int ingots = s.Ingots;
            Assert.IsNotNull(Meta.OpenChest(s, 1, 0));
            Assert.Greater(s.Ingots, ingots);
            Assert.IsNull(Meta.OpenChest(s, 1, 0));
        }

        [Test]
        public void LevelsHaveChapterBossesAndRisingDifficulty()
        {
            for (int c = 0; c < Defs.Chapters.Length; c++)
            {
                var boss = Defs.Level(c * 10 + 10);
                Assert.IsTrue(boss.IsChapterBoss);
                Assert.AreEqual(Defs.Chapters[c].Boss, boss.BossKind);
                Assert.IsTrue(Defs.Enemy(boss.BossKind).IsBoss);
                var mid = Defs.Level(c * 10 + 5);
                Assert.AreEqual(Defs.Chapters[c].MidBoss, mid.BossKind);
                Assert.AreNotEqual(Defs.Chapters[c].Boss, Defs.Chapters[c].MidBoss);
                Assert.IsTrue(Defs.Enemy(mid.BossKind).IsBoss);
            }
            for (int n = 2; n <= Defs.LevelCount; n++)
                Assert.AreNotEqual(Defs.Level(n - 1).LeaderKind, Defs.Level(n).LeaderKind, "第" + n + "关主统领不该跟上关一样");
            Assert.AreEqual(10, Defs.Enemies.Count(e => e.IsBoss));
            Assert.AreEqual(9, Defs.Enemies.Count(e => e.Rank == EnemyRank.Elite), "9种特色精英恰好铺满3×3图鉴");
            Assert.GreaterOrEqual(Defs.Enemies.Count(e => e.Rank == EnemyRank.Minion && e.Kind != EnemyKind.Porter), 17);
            for (int k = 0; k < Defs.Enemies.Length; k++) Assert.AreEqual(k, (int)Defs.Enemies[k].Kind);
            for (int n = 2; n <= Defs.LevelCount; n++)
                Assert.GreaterOrEqual(Defs.Level(n).HpMul, Defs.Level(n - 1).HpMul * 0.98f, "第" + n + "关");
        }

        [Test]
        public void HeroRosterHasRaritiesRolesAndPerks()
        {
            Assert.AreEqual(32, Defs.HeroCount);
            for (int r = 2; r <= 4; r++) Assert.Greater(Defs.Heroes.Count(d => d.Rarity == r), 5);
            for (int r = 0; r < Defs.RoleCount; r++) Assert.GreaterOrEqual(Defs.Heroes.Count(d => (int)d.Kind == r), 4);
            foreach (var d in Defs.Heroes)
            {
                var regular = Defs.PerksOf(d.Id, false);
                Assert.AreEqual(2, regular.Count(p => p.Kind == PerkKind.Trade && p.Group == "pace"), d.Name + " 重手/快手");
                var morph = regular.Single(p => p.Kind == PerkKind.Morph);
                Assert.AreEqual(morph.Id, regular.Single(p => p.Kind == PerkKind.Adv).Req, d.Name + " 全职业皆具备质变→进阶进化链");
                Assert.AreEqual(14, regular.Count, d.Name);
                foreach (var p in regular.Where(p => p.Kind == PerkKind.Trade && p.Has2)) Assert.Less(p.V2, 0f, p.Name + " 取舍的代价是负的");
                if (d.Kind == Role.Mage || d.Kind == Role.Support || d.Kind == Role.Bomber || d.Kind == Role.Control)
                {
                    foreach (var p in Defs.Perks.Where(p => p.Hero == d.Id))
                        Assert.IsFalse(p.Desc != null && p.Desc.Contains("攻速 +") || (p.Desc != null && p.Desc.Contains("攻速 -")),
                            $"{d.Name}({d.Role}) 强化卡「{p.Name}」出现了违和的物理攻速词条：{p.Desc}");
                }
                Assert.IsNotNull(Meta.OptPerk(d.Id, 1), d.Name);
                Assert.IsNotNull(Meta.OptPerk(d.Id, 3), d.Name);
                Assert.IsNotNull(Defs.FinisherPerk(d.Id), d.Name + " 全员皆有第4终结技卡（大招或奥义）");
                foreach (System.Text.RegularExpressions.Match m in new System.Text.RegularExpressions.Regex("「(.*?)」").Matches(Meta.Talent(d.Id, 1)))
                    Assert.AreNotEqual(Meta.TalentSkill.Passive, Meta.TalentSkillOf(d.Id, 1, m.Groups[1].Value), d.Name + " 的 5 级技能被认成了 10 级绝技");
                for (int row = 0; row <= 4; row++)
                    foreach (System.Text.RegularExpressions.Match m in new System.Text.RegularExpressions.Regex("「(.*?)」").Matches(Meta.Talent(d.Id, row)))
                        if (m.Groups[1].Value != d.AtkName)
                            Assert.AreEqual(Meta.UnlockLv[row], SkillRowLevel(Meta.TalentSkillOf(d.Id, row, m.Groups[1].Value)),
                                d.Name + " Lv." + Meta.UnlockLv[row] + "「" + m.Groups[1].Value + "」");
                Assert.IsNotNull(Meta.OptPerk(d.Id, 2), d.Name);
                Assert.AreEqual(3, Defs.PerksOf(d.Id, true).Count, d.Name);
                Assert.IsNotNull(Meta.FirstPerk(d.Id));
            }
            Assert.AreEqual(Defs.Perks.Length, Defs.Perks.Select(p => p.Id).Distinct().Count());
            foreach (var d in Defs.Heroes)
            {
                var kit = HeroKits.Of(d.Id);
                var fourSkills = new[] { d.AtkName, kit.TraitName, kit.SigName, kit.FinisherName };
                Assert.AreEqual(4, fourSkills.Where(x => !string.IsNullOrEmpty(x)).Distinct().Count(), d.Name + " 四技能名字必须齐全且互不重复");
                var surge = Meta.OptPerk(d.Id, 1);
                var opt15 = Meta.OptPerk(d.Id, 3);
                Assert.IsFalse(LooksLikeSameSkill(surge.Name, d.AtkName), d.Name + " 5级选项「" + surge.Name + "」和开局技能「" + d.AtkName + "」是同一个");
                Assert.IsFalse(LooksLikeSameSkill(surge.Name, kit.SigName), d.Name + " 5级选项「" + surge.Name + "」和10级绝技「" + kit.SigName + "」撞名");
                Assert.IsFalse(LooksLikeSameSkill(opt15.Name, kit.SigName), d.Name + " 15级选项「" + opt15.Name + "」和10级绝技「" + kit.SigName + "」撞名");
                for (int row = 1; row <= 4; row++)
                    foreach (System.Text.RegularExpressions.Match m in new System.Text.RegularExpressions.Regex("「(.*?)」").Matches(Meta.Talent(d.Id, row)))
                        if (row < 4 || m.Groups[1].Value != d.AtkName)
                            Assert.IsFalse(LooksLikeSameSkill(m.Groups[1].Value, d.AtkName),
                                d.Name + " Lv." + Meta.UnlockLv[row] + " 又解锁了开局技能「" + d.AtkName + "」");
                foreach (var p in Defs.Perks.Where(p => p.Hero == d.Id && !p.Ult && !p.Finisher && p.Opt == 0))
                {
                    Assert.AreNotEqual(d.AtkName, p.Name, d.Name + " 强化「" + p.Name + "」和普攻同名");
                    Assert.AreNotEqual(kit.TraitName, p.Name, d.Name + " 强化「" + p.Name + "」和特性同名");
                    Assert.AreNotEqual(kit.SigName, p.Name, d.Name + " 强化「" + p.Name + "」和绝技同名");
                    Assert.AreNotEqual(kit.FinisherName, p.Name, d.Name + " 强化「" + p.Name + "」和终结技同名");
                }
            }
            Assert.IsTrue(Meta.Talent(HeroId.WuYong, 2).Contains("锦囊妙计"), "吴用 10 级获得绝技锦囊妙计");
            Assert.IsFalse(Meta.Talent(HeroId.WuYong, 1).Contains("锦囊妙计"), "吴用 5 级绝不再重复出现锦囊妙计");
            Assert.IsFalse(Meta.Talent(HeroId.WuYong, 3).Contains("锦囊妙计"), "吴用 15 级绝不再重复出现锦囊妙计");
            Assert.IsFalse(Meta.Talent(HeroId.GuanSheng, 1).Contains(Defs.Hero(HeroId.GuanSheng).AtkName), "青龙偃月刀开局就会，5 级不该再解锁");
        }

        /// <summary>同一卡池里（含普通 Value 与重装取舍 Trade 跨类对比），任何词条绝不能在同属性维度上完全完爆另一条；且单发职业数量卡严格拉平。</summary>
        [Test]
        public void EnhancementCardsAreNotStrictlyDominated()
        {
            foreach (var d in Defs.Heroes)
            {
                foreach (bool star in new[] { false, true })
                {
                    var pool = Defs.PerksOf(d.Id, star)
                        .Where(p => (p.Kind == PerkKind.Value || p.Kind == PerkKind.Trade) && string.IsNullOrEmpty(p.Req))
                        .ToList();
                    for (int i = 0; i < pool.Count; i++)
                        for (int j = i + 1; j < pool.Count; j++)
                        {
                            var a = pool[i];
                            var b = pool[j];
                            if (!SameOffer(a, b)) continue;
                            if (Dominates(a, b))
                                Assert.Fail(d.Name + "「" + a.Name + "」完全压过「" + b.Name + "」（" + a.Eff + " " + a.V + " / " + b.Eff + " " + b.V + "）");
                            if (Dominates(b, a))
                                Assert.Fail(d.Name + "「" + b.Name + "」完全压过「" + a.Name + "」（" + b.Eff + " " + b.V + " / " + a.Eff + " " + a.V + "）");
                        }
                }
            }
            // 跨职业单发数量强化严格对标：解珍（射手）与石秀（战士）、公孙胜（法师）、凌振（炮手）全部对称
            foreach (var h in new[] { HeroId.XieZhen, HeroId.ShiXiu, HeroId.GongSun, HeroId.LingZhen, HeroId.HuSanniang })
            {
                var reg = Defs.PerksOf(h, false);
                var purePlus1 = reg.Single(p => p.Kind == PerkKind.Value && p.Opt == 0 && p.Eff == Eff.Count && !p.Has2);
                var widePlus2 = reg.Single(p => p.Kind == PerkKind.Trade && p.Id.EndsWith("_wide"));
                Assert.AreEqual(1f, purePlus1.V, 0.001f, Defs.Hero(h).Name + " 普通珍稀数量卡统一 +1 无惩罚");
                Assert.AreEqual(1, purePlus1.Max);
                Assert.AreEqual(2f, widePlus2.V, 0.001f, Defs.Hero(h).Name + " 重装齐发卡统一 +2");
                Assert.AreEqual(-0.28f, widePlus2.V2, 0.001f, Defs.Hero(h).Name + " 重装齐发卡统一 -28% 单发修正");
                Assert.AreEqual("volley", purePlus1.Group);
                Assert.AreEqual("volley", widePlus2.Group);
            }
            var rain = Defs.PerksOf(HeroId.XieZhen, true).Single(p => p.Name == "箭雨");
            var god = Defs.PerksOf(HeroId.XieZhen, true).Single(p => p.Name == "猎神");
            Assert.AreEqual(Eff.Count, rain.Eff, "解珍满星「箭雨」应改成多射箭，不再和「猎神」抢同一条箭伤害");
            Assert.AreNotEqual(god.Eff, rain.Eff);
        }

        static bool SameOffer(PerkDef a, PerkDef b)
        {
            var setA = a.Has2 ? new[] { a.Eff, a.Eff2 } : new[] { a.Eff };
            var setB = b.Has2 ? new[] { b.Eff, b.Eff2 } : new[] { b.Eff };
            if (a.Eff == b.Eff && !a.Has2 && !b.Has2) return true;
            if (a.Has2 && b.Has2) return (a.Eff == b.Eff && a.Eff2 == b.Eff2) || (a.Eff == b.Eff2 && a.Eff2 == b.Eff);
            // 跨单双词条检查：若单属性卡与带负面双属性卡共享同一主属性（如 +2 无惩罚 vs +1/-15%），也必须比对！
            var negCard = a.Has2 && a.V2 < 0 ? a : (b.Has2 && b.V2 < 0 ? b : null);
            var posCard = negCard == a ? b : (negCard == b ? a : null);
            return negCard != null && !posCard.Has2 && posCard.Eff == negCard.Eff;
        }

        static bool Dominates(PerkDef better, PerkDef worse)
        {
            if (better.Max < worse.Max) return false;
            var allEffs = new System.Collections.Generic.HashSet<Eff> { better.Eff, worse.Eff };
            if (better.Has2) allEffs.Add(better.Eff2);
            if (worse.Has2) allEffs.Add(worse.Eff2);
            bool anyStrict = better.Max > worse.Max;
            foreach (var e in allEffs)
            {
                float bv = StatOf(better, e);
                float wv = StatOf(worse, e);
                if (bv < wv - 1e-5f) return false;
                if (bv > wv + 1e-5f) anyStrict = true;
            }
            return anyStrict || (better.Has2 == worse.Has2 && Math.Abs(StatOf(better, worse.Eff) - worse.V) < 1e-5f);
        }

        static float StatOf(PerkDef p, Eff e)
        {
            if (p.Eff == e) return p.V;
            if (p.Has2 && p.Eff2 == e) return p.V2;
            return 0f;
        }

        /// <summary>完全同名、只差一个字，或只少一个字的简称，都会被读成同一招。</summary>
        static bool LooksLikeSameSkill(string a, string b)
        {
            if (string.IsNullOrEmpty(a) || string.IsNullOrEmpty(b)) return false;
            if (a == b) return true;
            if (a.Length == b.Length)
            {
                int diff = 0;
                for (int i = 0; i < a.Length; i++) if (a[i] != b[i]) diff++;
                if (diff <= 1) return true;
            }
            string shortN = a.Length < b.Length ? a : b;
            string longN = a.Length < b.Length ? b : a;
            return shortN.Length >= 2 && longN.Length == shortN.Length + 1 && longN.Contains(shortN);
        }

        [Test]
        public void TalentsCostCopperAndAddKingStats()
        {
            var s = Meta.NewSave(0);
            s.Copper = 1000000;
            var before = Meta.BuildLoadout(s);
            while (Meta.LearnTalent(s)) { }
            Assert.AreEqual(Meta.TalentCap(s), s.Talent);
            var lo = Meta.BuildLoadout(s);
            Assert.AreEqual(before.Atk + 6, lo.Atk, 0.01f);
            Assert.Greater(lo.Crit, before.Crit);
            Assert.Greater(lo.StartCoins, 0);
            s.Cleared = 10;
            Assert.IsTrue(Meta.LearnTalent(s));
        }

        [Test]
        public void ExpectedPowerMatchesExpectedSaveLoadout()
        {
            foreach (var n in new[] { 1, 5, 10, 20, 30, 40, 50 })
            {
                var s = Meta.ExpectedSave(n);
                var lo = Meta.BuildLoadout(s);
                var h = Meta.Starters[0];
                int lv = s.HeroLv[(int)h];
                float actual = Meta.PowerOf(lo, h) * Meta.UnlockFactor(lv);
                Assert.AreEqual(Meta.ExpectedPower(n), actual, Meta.ExpectedPower(n) * 0.05f, "第" + n + "关");
                float wall = lo.WallMul / (1f - lo.WallResist);
                Assert.AreEqual(Meta.ExpectedWall(n), wall, wall * 0.02f, "第" + n + "关寨墙");
            }
        }

        static int Wins(int level, SaveData s, int botSkill = 2, int trials = 8)
        {
            int w = 0;
            for (int seed = 1; seed <= trials; seed++)
            {
                var lo = Meta.BuildLoadout(s);
                var b = new Battle(seed, lo.Lineup, Defs.Level(level), lo);
                var bot = new Bot(botSkill);
                while (b.Phase != Phase.Victory && b.Phase != Phase.Defeat && b.Time < 600)
                {
                    bot.Step(b, 1f / 30f);
                    b.Update(1f / 30f);
                    b.Events.Clear();
                }
                if (b.Phase == Phase.Victory) w++;
            }
            return w;
        }

        [Test]
        public void ExpectedGrowthClearsKeyLevelsButSkippingGrowthFails()
        {
            // 打印全段关卡梯度与胜率遥测，核验对标《永远的蔚蓝星球》的节奏闭环
            var sb = new System.Text.StringBuilder();
            sb.AppendLine("=== BALANCE TELEMETRY ===");
            for (int lv = 1; lv <= 6; lv++)
                sb.AppendLine($"NewSave Stage {lv}: wins={Wins(lv, Meta.NewSave(0), 2, 10)}/10, StageHp={Defs.Level(lv).HpMul:F2}");
            foreach (var n in new[] { 1, 3, 5, 8, 10, 15, 20, 25, 30, 40, 50 })
            {
                int wExp = Wins(n, Meta.ExpectedSave(n), 2, 8);
                int wLag4 = n > 4 ? Wins(n, Meta.ExpectedSave(n - 4), 2, 8) : -1;
                int wNoPerk = Wins(n, Meta.ExpectedSave(n), 1, 8);
                sb.AppendLine($"Stage {n,2}: HpMul={Defs.Level(n).HpMul,7:F2} | ExpWins={wExp}/8 | Lag4Wins={wLag4}/8 | MergeOnlyNoPerk={wNoPerk}/8");
            }
            UnityEngine.Debug.Log(sb.ToString());

            foreach (var n in new[] { 5, 10, 15, 25, 40, 50 })
            {
                Assert.GreaterOrEqual(Wins(n, Meta.ExpectedSave(n)), 5, $"第{n}关按标准养成应能过");
                if (n >= 6)
                    Assert.LessOrEqual(Wins(n, Meta.ExpectedSave(n - 4)), 3, $"第{n}关落后4关的局外养成应明显卡关");
            }
        }

        [Test]
        public void NewSaveHitsEarlyMetaGateAndInterStageSlopeNeverPlateaus()
        {
            // 1. 关间难度斜率铁律：第1~5关每关至少涨18%，第6~15关至少涨12%，全50关严格递增绝无水关
            for (int n = 2; n <= Defs.LevelCount; n++)
            {
                float ratio = Defs.Level(n).HpMul / Defs.Level(n - 1).HpMul;
                float minRatio = n <= 5 ? 1.179f : n <= 15 ? 1.119f : 1.074f;
                Assert.GreaterOrEqual(ratio, minRatio, $"第{n}关相比第{n - 1}关难度涨幅不足 ({ratio:F3})");
            }

            // 2. 局外促进局内铁律：纯1级白板存档能过第1关建立信心，但不做局外养成打到第4~5关必受阻卡墙
            var fresh = Meta.NewSave(0);
            Assert.GreaterOrEqual(Wins(1, fresh, 2, 10), 7, "新手首战按正确策略应稳过");
            Assert.LessOrEqual(Wins(4, fresh, 2, 10), 2, "完全不搞局外养成的1级白板不应轻松平推第4关");
            Assert.LessOrEqual(Wins(5, fresh, 2, 10), 1, "完全不搞局外养成的1级白板绝不能平推第5关首领");
            Assert.GreaterOrEqual(Wins(5, Meta.ExpectedSave(5), 2, 10), 6, "完成前4关正常局外养成后可攻克第5关首领");
        }

        [Test]
        public void MonsterResistanceRedlinesAndCounterplayHold()
        {
            // P-8 数值红线：抗性封顶50%，严禁恶心锁流派，同时保留鲜明克制策略
            foreach (var e in Defs.Enemies)
            {
                Assert.LessOrEqual(e.PhysResist, 0.50f, $"{e.Name} 物理抗性不得超过50%红线");
                Assert.GreaterOrEqual(e.MagicWeak, 0f, e.Name);
                Assert.GreaterOrEqual(e.ArcherWeak, 0f, e.Name);
            }
            Assert.Greater(Defs.Enemy(EnemyKind.Shield).PhysResist, 0.15f, "盾兵具备物理减伤，体现法师/火药破盾策略");
            Assert.Greater(Defs.Enemy(EnemyKind.Armored).MagicWeak, 0.30f, "铁甲兵怕法术，体现元素克制");
            Assert.Greater(Defs.Enemy(EnemyKind.Hawk).ArcherWeak, 0.35f, "飞行怪被射手显著克制");
        }

        [Test]
        public void LevelChestsFollowWallAndOpenOnce()
        {
            var s = Meta.NewSave(0);
            var st = Defs.Level(5);
            s.Cleared = 4;
            var r = Meta.BattleRewards(s, st, true, 10, 0.6f, 0, new Rng(1));
            Assert.AreEqual(0, r.ChestBits, "宝箱不进结算");
            Assert.AreEqual(0, r.ChestItems.Count);
            int copper = s.Copper;
            Meta.Give(s, r);
            Meta.FinishMain(s, st, true, r);
            Assert.AreEqual(copper + r.Get(Cur.Copper), s.Copper);
            Assert.AreEqual(0, s.Pages);
            Assert.AreEqual(2, s.Stars[4]);
            Assert.IsTrue(Meta.CanOpenLevelChest(s, 5, 0));
            Assert.IsTrue(Meta.CanOpenLevelChest(s, 5, 1));
            Assert.IsFalse(Meta.CanOpenLevelChest(s, 5, 2));
            var opened = Meta.OpenLevelChest(s, 5, 1, new Rng(1));
            Assert.IsNotNull(opened);
            Assert.IsFalse(opened.Items.Any(i => i.Cur == Cur.AnyShard), "随机碎片打开时落到具体好汉");
            Assert.Greater(s.Pages, 0);
            Assert.IsNull(Meta.OpenLevelChest(s, 5, 1, new Rng(2)));

            var full = Meta.BattleRewards(s, st, true, 10, 1f, 0, new Rng(2));
            Assert.AreEqual(0, full.ChestBits);
            Meta.Give(s, full);
            Meta.FinishMain(s, st, true, full);
            Assert.IsTrue(Meta.CanOpenLevelChest(s, 5, 2));
            Assert.IsNotNull(Meta.OpenLevelChest(s, 5, 0, new Rng(3)));
            Assert.IsNotNull(Meta.OpenLevelChest(s, 5, 2, new Rng(4)));
            Assert.AreEqual(0, Meta.LevelChestLeft(s, 5));
            Assert.Greater(s.Tomes, 0, "逢 5 的关满血箱给玄女天书");
            Assert.Greater(s.Meteor, 0);
            Assert.AreEqual(1, s.GearBoxes);
            Assert.IsTrue(Meta.CanSweep(s, 5));
            Assert.IsFalse(Meta.CanSweep(s, 4));
        }

        [Test]
        public void SweepSpendsStaminaAndGivesNoChests()
        {
            var s = Meta.NewSave(0);
            s.Cleared = 3;
            s.LevelChest[2] = 7;
            int st0 = s.Stamina, cu = s.Copper;
            var r = Meta.Sweep(s, Defs.Level(3), new Rng(1));
            Assert.IsNotNull(r);
            Assert.AreEqual(st0 - Meta.BattleStamina, s.Stamina);
            Assert.Greater(s.Copper, cu);
            Assert.AreEqual(0, r.ChestBits);
            Assert.IsNull(Meta.Sweep(s, Defs.Level(4), new Rng(1)));
        }

        [Test]
        public void TomeAndPagesBoostLordSkill()
        {
            var s = Meta.ExpectedSave(10);
            var lo0 = Meta.BuildLoadout(s);
            s.Pages = 1000;
            s.Copper = 100000;
            s.Tomes = 100;
            Assert.IsTrue(Meta.LearnPage(s));
            for (int i = 0; i < Meta.TomeNodes.Length; i++) Assert.IsTrue(Meta.LearnTome(s));
            Assert.IsFalse(Meta.LearnTome(s));
            var lo = Meta.BuildLoadout(s);
            Assert.Greater(lo.LordPct, lo0.LordPct);
            Assert.Greater(lo.DmgMul, 1f);
            Assert.AreEqual(3, lo.LordHits);
            Assert.Greater(lo.LordStun, 0f);
            Assert.Less(lo.LordCd, lo0.LordCd);
            Assert.Greater(Meta.TeamPower(s), Meta.TeamPower(Meta.ExpectedSave(10)));

            var b = new Battle(5, lo.Lineup, Defs.Level(10), lo);
            var e = new Enemy { Id = 900, Def = Defs.Enemy(EnemyKind.Soldier), Hp = 1e7f, MaxHp = 1e7f, Pos = new V2(0, Layout.StopY) };
            b.Enemies.Add(e);
            b.LordT = 0.01f;
            for (int i = 0; i < 90; i++) { b.Update(1f / 30f); b.Events.Clear(); }
            Assert.AreEqual(1, b.LordCasts);
            Assert.Greater(b.LordDamage, b.LordPower * 2.5f, "三连斩打三次");
        }

        [Test]
        public void FlagRerollKeepsLockedAffixAndAppliesStats()
        {
            var s = Meta.NewSave(0);
            s.Meteor = 100;
            s.Copper = 1000000;
            s.Silk = 100000;
            Assert.IsFalse(Meta.CanReroll(s));
            for (int i = 0; i < 8; i++) Assert.IsTrue(Meta.FlagUp(s, new Rng(i)));
            Assert.AreEqual(Meta.FlagSlotsMax, Meta.FlagSlots(s.FlagLv));
            for (int i = 0; i < Meta.FlagSlotsMax; i++) Assert.Greater(s.FlagAffix[i], 0);
            int keep = s.FlagAffix[0];
            Meta.ToggleLock(s, 0);
            int silk = s.Silk, cost = Meta.RerollCost(s);
            Assert.AreEqual(400, cost);
            for (int i = 0; i < 20; i++) Assert.IsTrue(Meta.Reroll(s, new Rng(100 + i)));
            Assert.AreEqual(keep, s.FlagAffix[0]);
            Assert.AreEqual(silk - 20 * cost, s.Silk);
            var lo = Meta.BuildLoadout(s);
            Assert.Greater(lo.WallMul, 1f + Meta.FlagWall(s.FlagLv) - 1e-4f);
            Assert.Greater(lo.FlagStun, 0f);
        }

        [Test]
        public void FlagRallyStunsFieldOnceWhenWallHalves()
        {
            var lo = Loadout.Plain(new[] { HeroId.HuaRong, HeroId.LingZhen, HeroId.GongSun, HeroId.WuSong });
            lo.FlagStun = 3f;
            var b = new Battle(7, lo.Lineup, Defs.Level(3), lo);
            var e = new Enemy { Id = 900, Def = Defs.Enemy(EnemyKind.Soldier), Hp = 1e7f, MaxHp = 1e7f, Pos = new V2(0, 3f) };
            b.Enemies.Add(e);
            b.Wall = b.WallMax * 0.52f;
            var shot = new Shot { Id = 1, Kind = ShotKind.Bolt, From = new V2(0, 3), To = new V2(0, Layout.WallRowY), Dur = 0.01f, Damage = b.WallMax * 0.05f };
            b.Shots.Add(shot);
            for (int i = 0; i < 3; i++) b.Update(1f / 30f);
            Assert.IsTrue(b.Rallied);
            Assert.IsTrue(b.Events.Any(x => x.Type == Ev.Rally));
            Assert.Greater(e.Stun, 2f);
        }

        [Test]
        public void GearBoxUpgradesOrMeltsAndBoostsEquip()
        {
            var s = Meta.NewSave(0);
            s.EquipLv[0] = 10;
            float atk0 = Meta.BuildLoadout(s).Atk;
            s.GearBoxes = 40;
            int iron = s.Iron, melted = 0;
            for (int i = 0; i < 40; i++)
            {
                var d = Meta.OpenGearBox(s, new Rng(i * 31 + 7)).Value;
                if (!d.Upgraded) melted += d.Iron;
            }
            Assert.IsNull(Meta.OpenGearBox(s, new Rng(1)));
            Assert.AreEqual(iron + melted, s.Iron);
            Assert.GreaterOrEqual(s.EquipQ.Count(q => q >= 1), 5);
            if (s.EquipQ[0] > 0) Assert.Greater(Meta.BuildLoadout(s).Atk, atk0);
        }

        [Test]
        public void MealsClaimByHourOncePerDay()
        {
            var s = Meta.NewSave(0);
            s.Day = 5;
            Assert.AreEqual(0, Meta.MealsReady(s, 5));
            Assert.AreEqual(2, Meta.MealsReady(s, 13));
            int st = s.Stamina;
            Assert.AreEqual(2 * Meta.MealStamina, Meta.EatMeals(s, 13));
            Assert.AreEqual(st + 2 * Meta.MealStamina, s.Stamina);
            Assert.AreEqual(0, Meta.MealsReady(s, 13));
            Assert.AreEqual(2, Meta.MealsReady(s, 22));
            Meta.RollDay(s, 6);
            Assert.AreEqual(4, Meta.MealsReady(s, 23));
        }

        [Test]
        public void OldSaveGetsNewArrays()
        {
            var s = new SaveData { LevelChest = null, FlagAffix = null, EquipQ = null, Totems = null, TotemEquipped = null };
            Meta.Normalize(s);
            Assert.AreEqual(Defs.LevelCount, s.LevelChest.Length);
            Assert.AreEqual(Meta.FlagSlotsMax, s.FlagAffix.Length);
            Assert.AreEqual(Meta.Equips.Length, s.EquipQ.Length);
            Assert.AreEqual(Meta.TotemTotalSockets, s.TotemEquipped.Length);
            Assert.IsNotNull(s.Totems);
        }

        [Test]
        public void TotemsInlayRefineMergeAndWishRecruitBoostPower()
        {
            var s = Meta.NewSave(0);
            s.Cleared = 20;
            s.RefineStones = 10;
            s.Hammers = 12;
            s.Silk = 2000;
            s.Copper = 50000;
            int pw0 = Meta.TeamPower(s);

            var pulls = Meta.PullTotems(s, 10, new Rng(77));
            Assert.AreEqual(10, pulls.Count);
            Assert.IsTrue(pulls.Any(t => t.Rarity >= 2), "十连寻宝必出史诗及以上图腾");

            var epic = s.Totems.First(t => t.Rarity >= 2);
            int oldKind = epic.Kind;
            Assert.IsTrue(Meta.RefineTotem(s, epic.Id, new Rng(88)));
            Assert.AreNotEqual(oldKind, epic.Kind, "洗炼必换新词条");
            Assert.IsTrue(Meta.ToggleInlayTotem(s, epic.Id));
            Assert.IsTrue(Meta.IsTotemEquipped(s, epic.Id));
            Assert.IsTrue(Meta.UpgradeCloak(s));
            Assert.Greater(Meta.TeamPower(s), pw0, "镶嵌图腾与升阶战氅提升全队战力");

            // 三合一合成
            var rng = new Rng(99);
            for (int i = 0; i < 3; i++) Meta.RollTotem(s, 1, rng, 0);
            var merged = Meta.MergeAllTotems(s, rng);
            Assert.GreaterOrEqual(merged.Count, 1);
            Assert.GreaterOrEqual(merged[0].Rarity, 2);

            // 心愿单 50% UP 验证
            Meta.SetWish(s, HeroId.HuaRong);
            int hits = 0, epics = 0;
            for (int i = 0; i < 40; i++)
                foreach (var p in Meta.Recruit(s, 10, new Rng(500 + i)))
                    if (Defs.Hero(p.Hero).Rarity == 3)
                    {
                        epics++;
                        if (p.Hero == HeroId.HuaRong) hits++;
                    }
            Assert.Greater(hits, epics * 0.35f, "心愿好汉显著提高同品质命中率");
        }

        [Test]
        public void SubsetFontsCoverAllCodeCharacters()
        {
            var heavy = UnityEngine.Resources.Load<UnityEngine.Font>("Fonts/Heavy");
            var bold = UnityEngine.Resources.Load<UnityEngine.Font>("Fonts/Bold");
            Assert.IsNotNull(heavy, "缺 Fonts/Heavy");
            Assert.IsNotNull(bold, "缺 Fonts/Bold");

            var missing = new System.Collections.Generic.HashSet<char>();
            string scriptsDir = System.IO.Path.Combine(UnityEngine.Application.dataPath, "Scripts");
            foreach (var file in System.IO.Directory.GetFiles(scriptsDir, "*.cs", System.IO.SearchOption.AllDirectories))
            {
                string txt = System.IO.File.ReadAllText(file);
                foreach (char c in txt)
                {
                    if (c <= 0x7E || char.IsWhiteSpace(c) || char.IsSurrogate(c)) continue;
                    if (!heavy.HasCharacter(c) || !bold.HasCharacter(c)) missing.Add(c);
                }
            }
            Assert.AreEqual(0, missing.Count, "子集字体缺字（需运行 python3 tools/build_font.py）：" + new string(missing.ToArray()));
        }

        [Test]
        public void TavernHalfPriceShardsFirstOrangePityAndFreeResetWork()
        {
            var s = Meta.NewSave(0);
            s.Cleared = Meta.OrangeOpen;
            // 首张传说享受 15 抽新手破冰保底
            bool gotOrange = false;
            for (int i = 0; i < Meta.FirstOrangePity; i++)
                if (Meta.Recruit(s, 1, new Rng(300 + i)).Any(p => Defs.Hero(p.Hero).Rarity == 4)) gotOrange = true;
            Assert.IsTrue(gotOrange, "第6关开放传说池后15抽内必破冰首张传说");
            Assert.AreEqual(Meta.FirstOrangePity * Meta.CreditsPerPull, Meta.RecruitCredits(s));

            // 酒馆半价兑换已拥有好汉碎片
            var starter = Meta.Starters[0];
            int sh0 = s.Shards[(int)starter];
            int halfPrice = Meta.BaseShardCreditPrice(Defs.Hero(starter).Rarity) / 2;
            Assert.AreEqual(halfPrice, Meta.NextShardCreditPrice(s, starter));
            Assert.IsTrue(Meta.BuyHeroShardWithCredits(s, starter, 5));
            Assert.AreEqual(sh0 + 5, s.Shards[(int)starter]);
            Assert.AreEqual(Meta.WeeklyHalfLimit - 5, Meta.HalfLeft(s, starter));

            // 免费无损传功重置：100% 退回铜钱与碎片
            s.Shards[(int)starter] += 30;
            s.Copper = 50000;
            int totalShards = s.Shards[(int)starter], totalCopper = s.Copper;
            Assert.IsTrue(Meta.LevelUp(s, starter));
            Assert.IsTrue(Meta.LevelUp(s, starter));
            Assert.AreEqual(3, s.HeroLv[(int)starter]);
            Assert.IsTrue(Meta.ResetHero(s, starter, out int rc, out int rs));
            Assert.AreEqual(1, s.HeroLv[(int)starter]);
            Assert.AreEqual(totalCopper, s.Copper, "铜钱 100% 全额退还");
            Assert.AreEqual(totalShards, s.Shards[(int)starter], "碎片 100% 全额退还");
            Assert.Greater(rc, 0);
            Assert.Greater(rs, 0);
        }

        [Test]
        public void PresetNameDefaultsToSchemeUntilRenamed()
        {
            var s = Meta.NewSave(0);
            Assert.AreEqual("方案1", Meta.PresetName(s, 0));
            Assert.AreEqual("方案2", Meta.PresetName(s, 1));
            Meta.SetPresetName(s, 1, "  夜战  ");
            Assert.AreEqual("夜战", Meta.PresetName(s, 1));
            Meta.SetPresetName(s, 1, "方案2");
            Assert.AreEqual("", s.PresetNames[1]);
            Assert.AreEqual("方案2", Meta.PresetName(s, 1));
            Meta.SetPresetName(s, 0, "一二三四五六七八");
            Assert.AreEqual("一二三四五六", Meta.PresetName(s, 0));
        }

        [Test]
        public void RankMilestonesHonorTitlesAndDailyResetWork()
        {
            var s = Meta.NewSave(0);
            Assert.AreEqual(0, Meta.RankRewardBadge(s));
            s.Cleared = 10;
            Assert.AreEqual(3, Meta.RankRewardBadge(s)); // 第 2、5、10 关三档可领
            int ingot0 = s.Ingots;
            var got1 = Meta.ClaimRankMilestone(s, 0);
            Assert.IsNotEmpty(got1);
            Assert.IsFalse(Meta.CanClaimRankMilestone(s, 0));
            Assert.AreEqual(2, Meta.RankRewardBadge(s));

            var gotRest = Meta.ClaimAllRankMilestones(s);
            Assert.IsNotEmpty(gotRest);
            Assert.AreEqual(0, Meta.RankRewardBadge(s));
            Assert.Greater(s.Ingots, ingot0 + 250);

            Assert.AreEqual(("护村总英雄", 1), Meta.HonorTitle(1, 48, 22000));
            Assert.AreEqual(("十里八乡战神", 2), Meta.HonorTitle(2, 45, 20000));
            Assert.AreEqual(("守村急先锋", 3), Meta.HonorTitle(3, 40, 18000));

            s.RankLikes = 3;
            Meta.RollDay(s, s.Day + 1);
            Assert.AreEqual(0, s.RankLikes, "跨天自动重置每日排行榜点赞奖励次数");
        }

        [Test]
        public void CodexGroupProgressAndMilestoneBoxRewardsWork()
        {
            var s = Meta.NewSave(0);
            Assert.AreEqual(0, Meta.CodexBadge(s));
            Assert.IsFalse(Meta.CanClaimCodexBox(s, 0));

            var minions = Defs.Enemies.Where(d => Meta.CodexGroupOf(d) == 0).Select(d => d.Kind).ToArray();
            int need = Meta.CodexBoxNeed(0);
            Meta.MarkSeen(s, minions.Take(need));
            Assert.AreEqual((need, minions.Length), Meta.CodexProgress(s, 0));
            Assert.IsTrue(Meta.CanClaimCodexBox(s, 0));
            Assert.AreEqual(need + 1, Meta.CodexGroupBadge(s, 0), "新解锁单卡红点 + 阶段宝箱红点");

            int ingots0 = s.Ingots, tokens0 = s.Tokens;
            var boxGot = Meta.ClaimCodexBox(s, 0);
            Assert.IsNotNull(boxGot);
            Assert.IsTrue(Meta.CodexBoxTaken(s, 0));
            Assert.IsFalse(Meta.CanClaimCodexBox(s, 0));
            Assert.Greater(s.Ingots, ingots0);
            Assert.Greater(s.Tokens, tokens0);
            Assert.AreEqual(need, Meta.CodexGroupBadge(s, 0));

            Assert.IsTrue(Meta.ClaimCodex(s, minions[0]));
            Assert.IsFalse(Meta.ClaimCodex(s, minions[0]));
            Assert.AreEqual(need - 1, Meta.CodexGroupBadge(s, 0));
        }

        [Test]
        public void AllSfxResourcesLoadCleanlyWithValidDuration()
        {
            string[] clips =
            {
                "array_seal", "arrow_blast", "arrow_hit", "arrow_pierce", "awaken", "axe", "axe_chop",
                "blade_hit", "blade_swing", "bow", "cannon_boom", "cannon_fire", "crit", "crossbow", "dart",
                "fire", "fire_beam", "fist", "fist_swing", "fuse_throw", "glaive_cleave", "gold_slam",
                "hammer", "horse", "ice_shatter", "jade_ping", "join", "kill_pop", "lasso", "lord_slash",
                "mace_cast", "magic_soft", "meteor_hit", "net_cast", "oil_jar", "poison_puff", "rank_up",
                "shield_block", "sig_trigger", "spear", "spear_thrust", "spell_cast", "spell_wind", "staff",
                "stone", "stun_bonk", "thunder_cast", "thunder_hit",
                "ui_card", "ui_close", "ui_coin", "ui_deny", "ui_drum", "ui_flip", "ui_forge", "ui_jackpot",
                "ui_levelup", "ui_open", "ui_reel", "ui_reel_stop", "ui_reveal", "ui_reward", "ui_slot_add",
                "ui_swap", "ui_tab", "ui_talent", "ui_tap", "ui_tick", "ui_unlock",
                "ult_arrow", "ult_cannon", "ult_drum", "ult_fire", "ult_heal", "ult_smash", "ult_thunder",
                "ult_water", "ult_whirl", "ult_wind", "warn_horn", "water", "whip",
            };
            foreach (var name in clips)
            {
                var clip = UnityEngine.Resources.Load<UnityEngine.AudioClip>("Sfx/" + name);
                Assert.IsNotNull(clip, $"缺失或导入失败音效: Resources/Sfx/{name}");
                Assert.Greater(clip.length, 0.03f, $"音效时长异常过短: {name} ({clip.length:F3}s)");
                Assert.LessOrEqual(clip.length, 1.50f, $"短音效时长超标: {name} ({clip.length:F3}s)");
            }
        }

        [Test]
        public void AllPerkCardDescriptionsAreConciseAndNeverWrapAwkwardly()
        {
            string[] banned = { "寨墙危急", "近墙再", "近墙触发", "且显化", "进化亮青" };
            var errors = new System.Collections.Generic.List<string>();
            foreach (var p in Defs.Perks)
            {
                var hd = Defs.Hero(p.Hero);
                foreach (int lv in new[] { 1, 20 })
                {
                    string desc = Defs.PerkDesc(p, lv);
                    if (string.IsNullOrWhiteSpace(desc)) { errors.Add($"{hd.Name}「{p.Name}」说明为空"); continue; }
                    foreach (var bad in banned)
                        if (desc.Contains(bad)) errors.Add($"{hd.Name}「{p.Name}」含晦涩/冗余词「{bad}」：{desc}");

                    string[] lines = desc.Split('\n');
                    int maxLines = (p.Ult || p.Finisher) ? 3 : 2;
                    if (lines.Length > maxLines)
                        errors.Add($"{hd.Name}「{p.Name}」行数超标({lines.Length}>{maxLines})：{desc}");

                    foreach (var line in lines)
                    {
                        float units = 0f;
                        foreach (char ch in line.Trim())
                        {
                            if (ch == ' ') units += 0.30f;
                            else if (ch < 128) units += 0.55f;
                            else units += 1.0f;
                        }
                        if (units > 9.8f)
                            errors.Add($"{hd.Name}「{p.Name}」(Lv.{lv}) 单行过长({units:F1}>9.8)：「{line}」");
                    }
                }
            }
            Assert.IsEmpty(errors, string.Join("\n", errors));
        }

        [Test]
        public void AdPlacementsDailyLimitsAndWelfareBonusResetCleanly()
        {
            var s = Meta.NewSave(0);
            Meta.RollDay(s, 10);

            // 每日福利：未领免费份时不可先领广告加赠；领完免费份后可领 1 次广告加赠，次日自动恢复
            Assert.IsTrue(Meta.CanWelfare(s, 10));
            Assert.IsFalse(Meta.CanAdWelfare(s, 10));
            Assert.IsNull(Meta.ClaimAdWelfare(s, 10));

            int tok0 = s.Tokens, sta0 = s.Stamina, cop0 = s.Copper;
            var w1 = Meta.ClaimWelfare(s, 10);
            Assert.IsNotNull(w1);
            Assert.IsFalse(Meta.CanWelfare(s, 10));
            Assert.IsTrue(Meta.CanAdWelfare(s, 10));

            var w2 = Meta.ClaimAdWelfare(s, 10);
            Assert.IsNotNull(w2);
            Assert.IsFalse(Meta.CanAdWelfare(s, 10));
            Assert.IsNull(Meta.ClaimAdWelfare(s, 10));
            Assert.AreEqual(tok0 + 2, s.Tokens);
            Assert.AreEqual(sta0 + 40, s.Stamina);
            Assert.Greater(s.Copper, cop0 + 1900);

            // 各项新增每日广告计数在跨天时完整清零
            s.AdTotem = Meta.AdTotemMax;
            s.AdGearBox = Meta.AdGearBoxMax;
            s.AdDailyTries = Meta.AdDailyTriesMax;
            s.AdEscortTries = Meta.AdEscortTriesMax;
            s.AdInterstitial = Meta.InterstitialDailyMax;

            Meta.RollDay(s, 11);
            Assert.AreEqual(0, s.AdTotem);
            Assert.AreEqual(0, s.AdGearBox);
            Assert.AreEqual(0, s.AdDailyTries);
            Assert.AreEqual(0, s.AdEscortTries);
            Assert.AreEqual(0, s.AdInterstitial);
            Assert.IsTrue(Meta.CanWelfare(s, 11));
            Assert.IsFalse(Meta.CanAdWelfare(s, 11));
        }

        [Test]
        public void GameClubCumulativeAndDailyOfficialTasksHold()
        {
            var s = Meta.NewSave(0);
            Meta.RollDay(s, 20);

            // 初始仅开放：加入游戏圈(0)、累计点赞1次(1)、累计评论1次(2)；后续档位与今日日常均需前置解锁
            Assert.IsTrue(Meta.ClubTaskUnlocked(s, 0));
            Assert.IsTrue(Meta.ClubTaskUnlocked(s, 1));
            Assert.IsTrue(Meta.ClubTaskUnlocked(s, 2));
            Assert.IsFalse(Meta.ClubTaskUnlocked(s, 3));
            Assert.IsFalse(Meta.ClubTaskUnlocked(s, 7));

            // 第 20 天：入圈 + 点赞 2 次 + 评论 3 次；重复同步相同今日计数绝不双倍累加
            Assert.IsTrue(Meta.SyncClubData(s, 20, true, 2, 3, 0));
            Assert.IsFalse(Meta.SyncClubData(s, 20, true, 2, 3, 0));
            Assert.AreEqual(2, s.ClubTotalLikes);
            Assert.AreEqual(3, s.ClubTotalComments);

            // 领取【加入游戏圈】发放 200 元宝 + 3 招募令 + 1 装备箱，并解锁每日日常任务
            int ing0 = s.Ingots, tok0 = s.Tokens, box0 = s.GearBoxes;
            Assert.IsFalse(Meta.CanClaimClubTask(s, 20, 7));
            Assert.IsNotNull(Meta.ClaimClubTask(s, 20, 0));
            Assert.AreEqual(ing0 + 200, s.Ingots);
            Assert.AreEqual(tok0 + 3, s.Tokens);
            Assert.AreEqual(box0 + 1, s.GearBoxes);

            Assert.IsTrue(Meta.ClubTaskUnlocked(s, 7));
            Assert.IsTrue(Meta.CanClaimClubTask(s, 20, 7));
            Assert.IsNotNull(Meta.ClaimClubTask(s, 20, 7));
            Assert.IsFalse(Meta.CanClaimClubTask(s, 20, 7));

            // 点赞链：未领 1 次前不能跳领 3 次；领完 1 次后解锁 3 次并保留 2/3 进度
            Assert.IsFalse(Meta.CanClaimClubTask(s, 20, 3));
            Assert.IsNotNull(Meta.ClaimClubTask(s, 20, 1));
            Assert.IsTrue(Meta.ClubTaskUnlocked(s, 3));
            Assert.AreEqual(2, Meta.ClubTaskValue(s, 20, 3));

            // 跨到第 21 天：今日计数与日常领取位重置，历史累计完整保留；再赞 3 次 + 评 2 次达成双 5 终极档
            Meta.RollDay(s, 21);
            Assert.AreEqual(0, s.ClubDayLikes);
            Assert.AreEqual(2, s.ClubTotalLikes);

            int tomes0 = s.Tomes, meteor0 = s.Meteor;
            Assert.IsTrue(Meta.SyncClubData(s, 21, true, 3, 2, 1));
            Assert.AreEqual(5, s.ClubTotalLikes);
            Assert.AreEqual(5, s.ClubTotalComments);
            Assert.IsTrue(Meta.CanClaimClubTask(s, 21, 7));
            Assert.IsTrue(Meta.CanClaimClubTask(s, 21, 9));

            Assert.IsNotNull(Meta.ClaimClubTask(s, 21, 3));
            Assert.IsNotNull(Meta.ClaimClubTask(s, 21, 4));
            Assert.IsNotNull(Meta.ClaimClubTask(s, 21, 2));
            Assert.IsNotNull(Meta.ClaimClubTask(s, 21, 5));
            Assert.IsNotNull(Meta.ClaimClubTask(s, 21, 6));

            Assert.AreEqual(meteor0 + 3, s.Meteor);
            Assert.AreEqual(tomes0 + 2, s.Tomes);
        }

        static int SkillRowLevel(Meta.TalentSkill kind)
        {
            switch (kind)
            {
                case Meta.TalentSkill.Attack:
                case Meta.TalentSkill.Trait: return 1;
                case Meta.TalentSkill.Ult:
                case Meta.TalentSkill.Finisher:
                case Meta.TalentSkill.Surge: return Meta.SurgeLv;
                case Meta.TalentSkill.Passive: return Meta.PassiveLv;
                case Meta.TalentSkill.Opt15:
                case Meta.TalentSkill.SurgePlus: return Meta.SurgePlusLv;
                case Meta.TalentSkill.Top:
                case Meta.TalentSkill.Rewrite: return Meta.TopLv;
                default: return -1;
            }
        }
    }
}
