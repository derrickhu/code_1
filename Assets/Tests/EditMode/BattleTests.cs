using System.Linq;
using Liangshan.Sim;
using NUnit.Framework;

namespace Liangshan.Tests
{
    public class BattleTests
    {
        static readonly HeroId[] Lineup = { HeroId.HuaRong, HeroId.LingZhen, HeroId.GongSun, HeroId.WuSong };

        [Test]
        public void SummonCostsRiseAndEveryFifthAddsSlot()
        {
            var b = new Battle(1, Lineup) { Coins = 100000 };
            Assert.AreEqual(7, b.Slots.Count);
            int last = 0;
            for (int i = 0; i < Defs.SummonsPerSlot; i++)
            {
                int cost = b.SummonCost;
                Assert.Greater(cost, last);
                last = cost;
                Assert.IsNotNull(b.Summon());
            }
            Assert.AreEqual(8, b.Slots.Count);
            Assert.AreEqual(Layout.FrontRowY, b.Slots[7].Pos.Y);
        }

        [Test]
        public void OpeningWavesRampToMowingDensityWithConservedPool()
        {
            Assert.AreEqual(10, Defs.WaveCount(1));
            for (int w = 2; w <= 10; w++) Assert.Greater(Defs.WaveCount(w), Defs.WaveCount(w - 1));
            Assert.GreaterOrEqual(Defs.WaveCount(10), 90, "第10波接近百怪割草密度");
            Assert.Greater(Defs.Tough(1), Defs.Tough(6));
            Assert.That(Defs.Tough(6), Is.InRange(1.1f, 2.0f), "单怪厚度扎实，总血池与银两守恒");

            // 验证第1波小怪散着持续刷出（直到 ~21s+ 仍有新怪出门，杜绝 8s 出完后中间空一大截断档）
            var b = new Battle(1, Lineup, Defs.Level(1));
            int spawnedEarly = 0, spawnedMid = 0, spawnedLate = 0;
            for (int s = 1; s <= 23; s++)
            {
                int prev = b.Enemies.Count;
                for (int k = 0; k < 20; k++) b.Update(0.05f);
                int delta = b.Enemies.Count - prev;
                if (s <= 8) spawnedEarly += delta;
                else if (s <= 16) spawnedMid += delta;
                else spawnedLate += delta;
            }
            Assert.GreaterOrEqual(spawnedEarly, 2);
            Assert.GreaterOrEqual(spawnedMid, 2, "波中段必须持续有怪散着走下来，不得断档留空");
            Assert.GreaterOrEqual(spawnedLate, 2, "波尾段必须衔接下一波，不得空等十余秒");
        }

        [Test]
        public void StarMultipliersFollowDiminishingCurveAndMergeShocksNearWall()
        {
            Assert.AreEqual(1.0f, Defs.StarMul[0], 1e-4f);
            Assert.AreEqual(2.0f, Defs.StarMul[1], 1e-4f, "1→2星整整翻倍，性价比最高");
            Assert.Less(Defs.StarMul[2], Defs.StarMul[1] * 2f, "2→3星边际微敛，靠质变和词条放大");
            Assert.That(Defs.StarMul[3], Is.InRange(Defs.StarMul[2] * 1.15f, Defs.StarMul[2] * 1.45f), "4星遵循蔚蓝黄金衰减律，靠免费觉醒词条与大核载体拉开上限");
            var d = Defs.Hero(HeroId.HuaRong);
            Assert.AreEqual(1, d.Count, "1星标准单发起步，弹幕靠词条成长");
            Assert.AreEqual(d.Count, Defs.ShotsAt(d, 1));

            var b = new Battle(2, Lineup);
            b.Slots[0].Unit = new Unit { Hero = HeroId.ShiXiu, Star = 1 };
            b.Slots[1].Unit = new Unit { Hero = HeroId.ShiXiu, Star = 1 };
            var near = new Enemy { Id = 910, Def = Defs.Enemy(EnemyKind.Soldier), Hp = 500, MaxHp = 500, Pos = new V2(b.Slots[1].Pos.X, Layout.StopY), Attacking = true };
            b.Enemies.Add(near);
            Assert.IsTrue(b.Drop(0, 1));
            Assert.LessOrEqual(b.Slots[1].Unit.Cd, 0.3f, "合成落地立即重置冷却准备爆发");
            Assert.Greater(near.Pos.Y, Layout.StopY + 0.3f, "合成冲击震退贴墙敌军");
            Assert.Greater(near.Stun, 0.2f);
        }

        [Test]
        public void ShatterAndResonanceAmplifySynergyDamage()
        {
            var b = new Battle(5, new[] { HeroId.HuaRong, HeroId.RuanXiaoqi, HeroId.XieZhen, HeroId.ShiXiu });
            b.Slots[0].Unit = new Unit { Hero = HeroId.HuaRong, Star = 3 };
            b.Slots[1].Unit = new Unit { Hero = HeroId.XieZhen, Star = 1 };
            b.Perks["huarong_res"] = 1;
            b.Perks["huarong_shatter"] = 1;
            // 通过 Pick 刷新内部 _stat 表
            b.Choices = new[] { Defs.Perk("huarong_0") };
            b.Phase = Phase.Choosing;
            b.Pick(0);
            Assert.Greater(b.SlotHeroAtk(b.Slots[0]), b.HeroAtk(HeroId.HuaRong, 3) * 1.35f, "众星捧月按场上同职业人数放大主C攻击");

            var plain = new Enemy { Id = 920, Def = Defs.Enemy(EnemyKind.Soldier), Hp = 1e6f, MaxHp = 1e6f, Pos = new V2(0, 1f), Stun = 0f };
            var chilled = new Enemy { Id = 921, Def = Defs.Enemy(EnemyKind.Soldier), Hp = 1e6f, MaxHp = 1e6f, Pos = new V2(0, 1f), SlowT = 3f };
            b.Enemies.Add(plain);
            b.Enemies.Add(chilled);
            b.Shots.Add(new Shot { Id = 1, Kind = ShotKind.Arrow, Hero = HeroId.HuaRong, From = b.Slots[0].Pos, To = plain.Pos, TargetId = plain.Id, Dur = 0.01f, Damage = 100f });
            b.Shots.Add(new Shot { Id = 2, Kind = ShotKind.Arrow, Hero = HeroId.HuaRong, From = b.Slots[0].Pos, To = chilled.Pos, TargetId = chilled.Id, Dur = 0.01f, Damage = 100f });
            b.Update(0.02f);
            float plainLost = plain.MaxHp - plain.Hp;
            float chillLost = chilled.MaxHp - chilled.Hp;
            Assert.Greater(chillLost, plainLost * 1.7f, "破冰追击对受控敌人造成大幅额外伤害");
        }

        [Test]
        public void ArrowPierceFollowsTheLineAndSkipsTheSameRank()
        {
            var b = new Battle(1, new[] { HeroId.HuaRong, HeroId.XieZhen, HeroId.ShiXiu, HeroId.KongLiang });
            var soldier = Defs.Enemy(EnemyKind.Soldier);
            var first = new Enemy { Id = 1, Def = soldier, Hp = 1e6f, MaxHp = 1e6f, Pos = new V2(0f, 1f) };
            var beside = new Enemy { Id = 2, Def = soldier, Hp = 1e6f, MaxHp = 1e6f, Pos = new V2(1.35f, 1.08f) };
            var behind = new Enemy { Id = 3, Def = soldier, Hp = 1e6f, MaxHp = 1e6f, Pos = new V2(0.12f, 2.5f) };
            var further = new Enemy { Id = 4, Def = soldier, Hp = 1e6f, MaxHp = 1e6f, Pos = new V2(0.05f, 4.2f) };
            b.Enemies.Add(first);
            b.Enemies.Add(beside);
            b.Enemies.Add(behind);
            b.Enemies.Add(further);
            var from = new V2(0f, -5f);
            b.Shots.Add(new Shot
            {
                Id = 1, Kind = ShotKind.Arrow, Hero = HeroId.HuaRong, From = from, To = first.Pos, TargetId = first.Id,
                Dur = 0.01f, Damage = 100f, Pierce = 1,
            });
            b.Update(0.05f);
            Assert.Less(first.Hp, first.MaxHp, "第一目标被射中");
            Assert.AreEqual(beside.MaxHp, beside.Hp, "同一排旁边的人不算穿透");
            Assert.Less(behind.Hp, behind.MaxHp, "直线上身后那个人被贯穿");
            Assert.AreEqual(further.MaxHp, further.Hp, "穿透 +1 打到身后第一个就停");

            behind.Hp = behind.MaxHp;
            first.Hp = first.MaxHp;
            b.Shots.Add(new Shot
            {
                Id = 2, Kind = ShotKind.Arrow, Hero = HeroId.HuaRong, From = from, To = first.Pos, TargetId = first.Id,
                Dur = 0.01f, Damage = 100f, Pierce = 2,
            });
            b.Update(0.05f);
            Assert.Less(behind.Hp, behind.MaxHp);
            Assert.Less(further.Hp, further.MaxHp, "穿透 +2 才打到身后第二个");
            Assert.AreEqual(beside.MaxHp, beside.Hp);
        }

        [Test]
        public void PiercingArrowKeepsFlyingToTheSecondEnemy()
        {
            var b = new Battle(1, new[] { HeroId.HuaRong, HeroId.XieZhen, HeroId.ShiXiu, HeroId.KongLiang });
            var soldier = Defs.Enemy(EnemyKind.Soldier);
            var first = new Enemy { Id = 1, Def = soldier, Hp = 1e6f, MaxHp = 1e6f, Pos = new V2(0f, 1f) };
            var behind = new Enemy { Id = 2, Def = soldier, Hp = 1e6f, MaxHp = 1e6f, Pos = new V2(0.1f, 2.8f) };
            b.Enemies.Add(first);
            b.Enemies.Add(behind);
            var from = b.Slots[0].Pos;
            var shot = new Shot
            {
                Id = 7, Kind = ShotKind.Arrow, Hero = HeroId.HuaRong, From = from, To = first.Pos, TargetId = first.Id,
                Dur = 1f, Damage = 50f, Pierce = 1,
            };
            // 跟正式出手一样：落点收到身后那个人，飞行时间按这段路算。
            var dir = first.Pos - from;
            float dist = (float)System.Math.Sqrt(dir.X * dir.X + dir.Y * dir.Y);
            dir = new V2(dir.X / dist, dir.Y / dist);
            float along = (behind.Pos.X - from.X) * dir.X + (behind.Pos.Y - from.Y) * dir.Y;
            shot.To = from + dir * along;
            shot.Dur = 0.26f + along / 16f;
            b.Shots.Add(shot);
            b.Update(0.05f);
            float still = (shot.To.X - from.X) * dir.X + (shot.To.Y - from.Y) * dir.Y;
            Assert.Greater(still, dist + 0.8f, "飞过第一个人之后，箭还要往直线上的第二个人飞");
            Assert.AreEqual(first.MaxHp, first.Hp, "还在飞，不该提前结算");

            // 继续飞到擦过第一目标、但尚未抵达第二目标的中间时刻：第一目标必须当场受击并触发 Ev.Hit，第二目标尚未掉血！
            float midFrac = ((dist + 0.4f) / along);
            b.Events.Clear();
            b.Update(shot.Dur * midFrac - 0.05f);
            Assert.Less(first.Hp, first.MaxHp, "箭尖擦过第一目标时当场结算受击掉血");
            Assert.IsTrue(b.Events.Any(ev => ev.Type == Ev.Hit && ev.EnemyId == first.Id && ev.Shot == ShotKind.Arrow), "第一目标当场发出受击特效事件");
            Assert.AreEqual(behind.MaxHp, behind.Hp, "此时箭尚未飞抵身后第二目标");
            Assert.IsNotEmpty(b.Shots, "穿透箭仍在继续往前飞");

            // 飞完全程：第二目标也被贯穿并触发独立受击事件
            b.Events.Clear();
            b.Update(shot.Dur);
            Assert.Less(behind.Hp, behind.MaxHp, "箭飞抵第二目标时完成贯穿");
            Assert.IsTrue(b.Events.Any(ev => ev.Type == Ev.Hit && ev.EnemyId == behind.Id && ev.Shot == ShotKind.Arrow), "第二目标也发出独立受击特效事件");
        }

        [Test]
        public void XieZhenHasZeroPierceWithoutPerkEvenAtHighStar()
        {
            var b = new Battle(2, new[] { HeroId.XieZhen, HeroId.HuaRong, HeroId.ShiXiu, HeroId.KongLiang });
            var soldier = Defs.Enemy(EnemyKind.Soldier);
            var first = new Enemy { Id = 10, Def = soldier, Hp = 1e6f, MaxHp = 1e6f, Pos = new V2(b.Slots[0].Pos.X, 0.8f) };
            var behind = new Enemy { Id = 11, Def = soldier, Hp = 1e6f, MaxHp = 1e6f, Pos = new V2(b.Slots[0].Pos.X, 2.2f) };
            b.Enemies.Add(first);
            b.Enemies.Add(behind);

            // 即使解珍升到 2/3/4 星，只要没选「穿杨」穿透词条，射出的箭 Pierce 必须严格为 0，绝不偷穿身后怪！
            b.Slots[0].Unit = new Unit { Id = 1, Hero = HeroId.XieZhen, Star = 3, Cd = 0.01f };
            for (int i = 0; i < 60 && b.Shots.Count == 0; i++) b.Update(1f / 60f);
            Assert.IsNotEmpty(b.Shots);
            foreach (var s in b.Shots) Assert.AreEqual(0, s.Pierce, "未点穿透词条的解珍不得自带穿透");
            for (int i = 0; i < 60; i++) b.Update(1f / 60f);
            Assert.Less(first.Hp, first.MaxHp, "首目标正常命中");
            Assert.AreEqual(behind.MaxHp, behind.Hp, "未点穿透词条时身后目标绝不掉血");

            // 选了「穿杨」（xiezhen_3）词条后，解珍正式获得 +1 穿透，贯穿直线上身后敌人！
            b.Choices = new[] { Defs.Perk("xiezhen_3") };
            b.Phase = Phase.Choosing;
            b.Pick(0);
            b.Slots[0].Unit.Cd = 0.01f;
            for (int i = 0; i < 90; i++) b.Update(1f / 60f);
            Assert.Less(behind.Hp, behind.MaxHp, "选了穿杨词条后解珍正常贯穿身后目标");
        }

        [Test]
        public void SummonAndEnhancePricesFollowTable()
        {
            CollectionAssert.AreEqual(
                new[] { 10, 20, 30, 45, 60, 80, 90, 110, 130, 150, 160, 175, 190, 200, 215, 235, 260, 290, 320, 360, 410, 470, 540, 630, 750, 1100, 1800 },
                Enumerable.Range(0, 27).Select(Defs.SummonCost).ToArray());
            // 纯查表不走线性加价：超出表长固定取最后一格
            Assert.AreEqual(1800, Defs.SummonCost(27));
            Assert.AreEqual(1800, Defs.SummonCost(35));
            CollectionAssert.AreEqual(new[] { 100, 200, 400, 600, 1000, 1500, 1800, 2500, 3000 }, Enumerable.Range(0, 9).Select(Defs.EnhanceCost).ToArray());
            Assert.AreEqual(3000, Defs.EnhanceCost(9));
            Assert.AreEqual(3000, Defs.EnhanceCost(15));
            // 开局 100 银两固定召唤 3 人（10+20+30=60，余 40 < 第 4 抽 45）
            var open = new Battle(1, Lineup);
            Assert.AreEqual(100, open.Coins);
            for (int i = 0; i < 3; i++) Assert.IsNotNull(open.Summon());
            Assert.IsFalse(open.CanSummon, "开局保持固定召唤 3 人不变");
        }

        [Test]
        public void FlyingCoinsStayUnspendableUntilReleased()
        {
            var b = new Battle(1, Lineup);
            for (int i = 0; i < 3; i++) Assert.IsNotNull(b.Summon());
            Assert.AreEqual(40, b.SpendableCoins);
            b.Coins += 20;
            b.HoldCoins(20);
            Assert.AreEqual(60, b.Coins);
            Assert.AreEqual(40, b.SpendableCoins);
            Assert.IsFalse(b.CanSummon, "银币还在飞，不能拿去召唤");
            Assert.IsNull(b.Summon());
            Assert.AreEqual(60, b.Coins, "没召唤成功不能扣钱");
            b.ReleaseCoins(20);
            Assert.AreEqual(60, b.SpendableCoins);
            Assert.IsTrue(b.CanSummon);
            Assert.IsNotNull(b.Summon());
            Assert.AreEqual(15, b.Coins);
        }

        [Test]
        public void LordSkillHitsOnlyInsideTheShownRange()
        {
            var b = new Battle(3, Lineup);
            var near = new Enemy { Id = 900, Def = Defs.Enemy(EnemyKind.Soldier), Hp = 1e6f, MaxHp = 1e6f, Pos = new V2(-3, Layout.StopY), Attacking = true };
            var far = new Enemy { Id = 901, Def = Defs.Enemy(EnemyKind.Shield), Hp = 1e6f, MaxHp = 1e6f, Pos = new V2(3, 4.5f) };
            Assert.IsTrue(Layout.InLordRange(near.Pos));
            Assert.IsFalse(Layout.InLordRange(far.Pos));
            b.Enemies.Add(near);
            b.Enemies.Add(far);
            b.LordT = 0.01f;
            for (int i = 0; i < 80; i++) { b.Update(1f / 30f); b.Events.Clear(); }
            Assert.AreEqual(1, b.LordCasts);
            Assert.Less(near.Hp, near.MaxHp);
            Assert.AreEqual(far.MaxHp, far.Hp);
            Assert.Greater(b.LordDamage, b.LordPower * 0.9f);
            Assert.AreEqual(Defs.LordCdBase, b.LordT, 2.8f);
        }

        [Test]
        public void LordSwordFliesAtTheCrowdNotTheNearestLoner()
        {
            var b = new Battle(3, Lineup);
            var loner = new Enemy { Id = 1, Def = Defs.Enemy(EnemyKind.Soldier), Hp = 1e6f, MaxHp = 1e6f, Pos = new V2(-0.4f, Layout.WallRowY + 1.1f), Attacking = true };
            var c1 = new Enemy { Id = 2, Def = Defs.Enemy(EnemyKind.Soldier), Hp = 1e6f, MaxHp = 1e6f, Pos = new V2(0.8f, Layout.WallRowY + 2.4f), Attacking = true };
            var c2 = new Enemy { Id = 3, Def = Defs.Enemy(EnemyKind.Soldier), Hp = 1e6f, MaxHp = 1e6f, Pos = new V2(1.5f, Layout.WallRowY + 2.6f), Attacking = true };
            var c3 = new Enemy { Id = 4, Def = Defs.Enemy(EnemyKind.Soldier), Hp = 1e6f, MaxHp = 1e6f, Pos = new V2(1.1f, Layout.WallRowY + 3.1f), Attacking = true };
            foreach (var e in new[] { loner, c1, c2, c3 })
            {
                Assert.IsTrue(Layout.InLordRange(e.Pos));
                b.Enemies.Add(e);
            }
            b.LordT = 0.01f;
            b.Update(0.05f);
            Assert.AreEqual(1, b.LordCasts);
            var crowd = new V2((0.8f + 1.5f + 1.1f) / 3f, Layout.WallRowY + (2.4f + 2.6f + 3.1f) / 3f);
            var wave = b.Shots.Single(s => s.Kind == ShotKind.Slash);
            Assert.Less((wave.To - crowd).Len, (wave.To - loner.Pos).Len, "剑气落点靠近人群，不追更近的落单者");
            for (int t = 0; t < 20; t++) b.Update(0.05f);
            Assert.AreEqual(4, new[] { loner, c1, c2, c3 }.Count(e => e.Hp < 1e6f), "半圆里的人都会被扩散剑气扫中打到");
        }

        [Test]
        public void LordCooldownRestartsWhenTheSemicircleStaysEmpty()
        {
            var b = new Battle(1, Lineup);
            bool restarted = false;
            for (int i = 0; i < 180; i++)
            {
                b.Update(0.1f);
                Assert.AreEqual(Phase.Running, b.Phase);
                foreach (var e in b.Enemies)
                {
                    e.Pos = new V2(0, 6f);
                    e.Hp = e.MaxHp;
                    e.Dead = false;
                }
                if (b.LordCasts == 0 && b.LordT > Defs.LordCdBase * 0.5f) restarted = true;
            }
            Assert.AreEqual(0, b.LordCasts);
            Assert.IsTrue(restarted);
        }

        [Test]
        public void MergeNeedsSameHeroAndStarAndRaisesStar()
        {
            var b = new Battle(2, Lineup);
            b.Slots[0].Unit = new Unit { Hero = HeroId.HuaRong, Star = 1 };
            b.Slots[1].Unit = new Unit { Hero = HeroId.HuaRong, Star = 1 };
            b.Slots[2].Unit = new Unit { Hero = HeroId.WuSong, Star = 1 };
            b.Slots[3].Unit = new Unit { Hero = HeroId.HuaRong, Star = 2 };
            Assert.IsFalse(b.CanMerge(0, 2));
            Assert.IsFalse(b.CanMerge(0, 3));
            Assert.IsTrue(b.CanMerge(0, 1));
            b.Drop(0, 1);
            Assert.IsNull(b.Slots[0].Unit);
            Assert.AreEqual(2, b.Slots[1].Unit.Star);
            Assert.IsTrue(b.Slots[1].Unit.Burst);
        }

        [Test]
        public void FullStarCannotMerge()
        {
            var b = new Battle(3, Lineup);
            b.Slots[0].Unit = new Unit { Hero = HeroId.GongSun, Star = 4 };
            b.Slots[1].Unit = new Unit { Hero = HeroId.GongSun, Star = 4 };
            Assert.IsFalse(b.CanMerge(0, 1));
            b.Drop(0, 1);
            Assert.AreEqual(4, b.Slots[0].Unit.Star);
        }

        [Test]
        public void EnhanceOffersThreeChoicesAndPauses()
        {
            var b = new Battle(4, Lineup) { Coins = 1000 };
            Assert.IsTrue(b.Enhance());
            Assert.AreEqual(Phase.Choosing, b.Phase);
            Assert.AreEqual(3, b.Choices.Length);
            float t = b.Time;
            b.Update(1f);
            Assert.AreEqual(t, b.Time);
            var picked = b.Choices[0];
            b.Pick(0);
            Assert.AreEqual(Phase.Running, b.Phase);
            Assert.AreEqual(1, b.Level(picked.Id));
        }

        [Test]
        public void EnhanceOnlyOffersLineupHeroesRegularPerks()
        {
            var b = new Battle(6, Lineup) { Coins = 100000 };
            for (int k = 0; k < 6; k++)
            {
                Assert.IsTrue(b.Enhance());
                foreach (var p in b.Choices)
                {
                    Assert.IsFalse(p.Star);
                    Assert.IsTrue(b.InLineup(p.Hero));
                }
                b.Pick(0);
            }
        }

        [Test]
        public void LevelOptionsOnlyEnterThePoolOnceUnlocked()
        {
            bool Offers(int lv, int opt)
            {
                var lo = Loadout.Plain(Lineup);
                for (int h = 0; h < lo.Lv.Length; h++) lo.Lv[h] = lv;
                for (int seed = 1; seed <= 30; seed++)
                {
                    var b = new Battle(seed, Lineup, null, lo) { Coins = 100000 };
                    for (int k = 0; k < 6 && b.Enhance(); k++)
                    {
                        if (b.Choices.Any(p => p.Opt == opt)) return true;
                        b.Pick(0);
                    }
                }
                return false;
            }
            Assert.IsFalse(Offers(Meta.SurgeLv - 1, 1));
            Assert.IsTrue(Offers(Meta.SurgeLv, 1));
            Assert.IsFalse(Offers(Meta.TopLv - 1, 2));
            Assert.IsTrue(Offers(Meta.TopLv, 2));
        }

        [Test]
        public void FirstFullStarMergeOffersStarSkillsOnce()
        {
            var b = new Battle(7, new[] { HeroId.HuaRong, HeroId.HuaRong, HeroId.HuaRong, HeroId.HuaRong });
            b.Slots[0].Unit = new Unit { Hero = HeroId.HuaRong, Star = 3 };
            b.Slots[1].Unit = new Unit { Hero = HeroId.HuaRong, Star = 3 };
            Assert.IsTrue(b.Drop(0, 1));
            Assert.AreEqual(4, b.Slots[1].Unit.Star);
            Assert.AreEqual(Phase.Choosing, b.Phase);
            Assert.AreEqual(HeroId.HuaRong, b.StarPick);
            Assert.AreEqual(3, b.Choices.Length);
            foreach (var p in b.Choices) Assert.IsTrue(p.Star);
            b.Reroll();
            Assert.IsTrue(b.Choices[0].Star);
            b.Pick(1);
            Assert.AreEqual(Phase.Running, b.Phase);
            Assert.IsTrue(b.StarTaken(HeroId.HuaRong));

            b.Slots[2].Unit = new Unit { Hero = HeroId.HuaRong, Star = 3 };
            b.Slots[3].Unit = new Unit { Hero = HeroId.HuaRong, Star = 3 };
            b.Drop(2, 3);
            Assert.AreEqual(Phase.Running, b.Phase);
        }

        [Test]
        public void ElitesAndBossesAlwaysDropTreasureBossIsJackpot()
        {
            var b = new Battle(8, Lineup, Defs.Level(5));
            Assert.AreEqual(0, b.Stage.PorterWaves.Length);
            var boss = Defs.Enemy(Defs.Level(5).BossKind);
            b.Enemies.Add(new Enemy { Id = 999, Def = boss, Hp = 1, MaxHp = 1, Pos = new V2(0, 3) });
            b.Slots[0].Unit = new Unit { Hero = HeroId.GongSun, Star = 4 };
            for (int i = 0; i < 300 && b.Phase == Phase.Running; i++) b.Update(1f / 30f);
            Assert.AreEqual(Phase.Reels, b.Phase);
            Assert.IsFalse(b.NextIsJackpot, "首领掉落宝箱应为真实随机摇奖，不再写死必中全同色");
            var r = b.SpinReels();
            Assert.AreEqual(5, r.Length);
            Assert.LessOrEqual(b.ReelPerks.Length, 2, "单次摇奖强化严控最多2条，绝不一次爆多条飞天");
            var forced = b.SpinReels(true);
            Assert.IsTrue(Battle.IsAllSame(forced), "鸿运重转必出全同色大奖");
            b.ApplyReels(forced);

            // 验证多次摇奖具备真实随机性（既有银两+好汉混合局，且滚轮好汉头像与发出的强化一一对应）
            bool sawMixed = false;
            for (int seed = 1; seed <= 40; seed++)
            {
                var sb = new Battle(seed, Lineup, Defs.Level(5)) { Phase = Phase.Reels, PendingReels = 1 };
                Put(sb, 0, Lineup[0]);
                var sr = sb.SpinReels();
                if (!Battle.IsAllSame(sr)) sawMixed = true;
                Assert.LessOrEqual(sb.ReelPerks.Length, 2);
                if (sb.ReelPerks.Length > 0)
                {
                    var grantedHeroes = new System.Collections.Generic.HashSet<HeroId>(sb.ReelPerks.Select(p => p.Hero));
                    for (int i = 0; i < sr.Length; i++)
                        if (sr[i] == Reel.Perk) Assert.IsTrue(grantedHeroes.Contains(sb.ReelCellHeroes[i]));
                }
            }
            Assert.IsTrue(sawMixed, "老虎机应高概率摇出银两与好汉混合结果");
        }

        [Test]
        public void MainLevelsHaveOneBossAndDropTreasureTwice()
        {
            var seenElites = new System.Collections.Generic.HashSet<EnemyKind>();
            foreach (var st in Defs.Levels)
            {
                if (st.IsChapterBoss)
                {
                    Assert.AreEqual(4, st.BossWave, st.Name);
                    CollectionAssert.AreEqual(new[] { 9 }, st.EliteWaves, st.Name);
                }
                else
                {
                    Assert.AreEqual(0, st.BossWave, st.Name + " 普通关不出大首领，由双精英挑大梁");
                    CollectionAssert.AreEqual(new[] { 4, 9 }, st.EliteWaves, st.Name);
                }
                foreach (var ek in st.EliteKinds) seenElites.Add(ek);
            }
            Assert.AreEqual(9, seenElites.Count, "全部9种特色精英均在50关主线中实际登场");

            var b = new Battle(3, Lineup, Defs.Level(10));
            var boss = new Enemy { Id = 999, Def = Defs.Enemy(Defs.Level(10).BossKind), Hp = 1e6f, MaxHp = 1e6f, Pos = new V2(0, 7) };
            b.Enemies.Add(boss);
            for (int i = 0; i < 30; i++) b.Update(1f / 30f);
            Assert.AreEqual(boss.Def.Speed * Defs.BossPace, 7 - boss.Pos.Y, 0.01f, "首领压阵要稳步逼近");
            // 对标蔚蓝星球：第4波登场的首领走 ~32s（第5波中段）推进至路中，走 ~72s（第7波）抵近寨墙施压
            var marchBoss = new Enemy { Id = 1000, Def = Defs.Enemy(Defs.Level(5).BossKind), Hp = 1e6f, MaxHp = 1e6f, Pos = new V2(0, Layout.SpawnY) };
            var bMarch = new Battle(7, Lineup, Defs.Level(5));
            bMarch.Wall = bMarch.WallMax = 1e9f;
            bMarch.Enemies.Add(marchBoss);
            for (int i = 0; i < 32 * 30; i++) bMarch.Update(1f / 30f);
            Assert.LessOrEqual(marchBoss.Pos.Y, 3.4f, "首领在第5波中段应已走到接近战场中间");
            for (int i = 0; i < 42 * 30; i++) bMarch.Update(1f / 30f);
            float bossStop = marchBoss.Def.StopY + marchBoss.Def.Size * 0.18f;
            Assert.LessOrEqual(marchBoss.Pos.Y, bossStop + 0.05f, "首领在第7波应抵达寨墙根构成真实压迫");

            // 普通关第4波守关主精英倒下必掉唯一一次生辰纲，第9波压轴精英只给赏银不再出第二个生辰纲
            var bNormal = new Battle(5, Lineup, Defs.Level(12));
            var leadElite = new Enemy { Id = 997, Def = Defs.Enemy(Defs.Level(12).LeaderKind), Hp = 1, MaxHp = 1, Pos = new V2(0, 3), IsStageLeader = true };
            bNormal.Enemies.Add(leadElite);
            bNormal.Slots[0].Unit = new Unit { Hero = HeroId.XieZhen, Star = 4 };
            for (int i = 0; i < 120 && bNormal.Phase == Phase.Running; i++) bNormal.Update(1f / 30f);
            Assert.IsTrue(leadElite.Dead);
            Assert.AreEqual(Phase.Reels, bNormal.Phase, "普通关第4波守关主精英倒下掉落唯一生辰纲");
            Assert.IsFalse(bNormal.NextIsJackpot);
            bNormal.ApplyReels(bNormal.SpinReels());

            var bElite = new Battle(4, Lineup, Defs.Level(5));
            var elite = new Enemy { Id = 998, Def = Defs.Enemy(EnemyKind.Elite), Hp = 1, MaxHp = 1, Pos = new V2(0, 3) };
            bElite.Enemies.Add(elite);
            bElite.Slots[0].Unit = new Unit { Hero = HeroId.GongSun, Star = 4 };
            for (int i = 0; i < 120; i++) bElite.Update(1f / 30f);
            Assert.IsTrue(elite.Dead);
            Assert.AreEqual(0, bElite.PendingReels, "第9波常规精英阵亡不得再掉落第二个生辰纲");
            Assert.AreEqual(Phase.Running, bElite.Phase);
        }

        [Test]
        public void StagesIntroduceMonstersGraduallyAndCapPerStageTypes()
        {
            var allMinions = new System.Collections.Generic.HashSet<EnemyKind>();
            foreach (var st in Defs.Levels)
            {
                Assert.LessOrEqual(st.Troops.Length, 2, $"第{st.No}关特色小兵不超过2种（加基础官兵最多3种）");
                var b = new Battle(1, Lineup, st);
                var roster = b.StageRoster();
                Assert.LessOrEqual(roster.Count, 5, $"第{st.No}关本关怪物总数不扎堆");

                var w1 = Defs.WaveTroops(st, 1, new Rng(11));
                Assert.IsTrue(w1.All(k => k == EnemyKind.Soldier), $"第{st.No}关第1波只出基础官兵，后续波次再逐步混入新怪");
                foreach (var m in st.Troops) allMinions.Add(m.Kind);
            }
            Assert.AreEqual(1, Defs.Level(1).Troops.Length, "第1关只解锁盾兵1种特色怪");
            Assert.AreEqual(1, Defs.Level(2).Troops.Length, "第2关只解锁骑兵1种特色怪");
            Assert.GreaterOrEqual(allMinions.Count, 14, "全5章逐步覆盖全部特色兵种");
        }

        [Test]
        public void ReelsJackpotDoublesSilver()
        {
            var b = new Battle(5, Lineup) { Phase = Phase.Reels, PendingReels = 1 };
            int before = b.Coins;
            b.ApplyReels(new[] { Reel.Silver, Reel.Silver, Reel.Silver, Reel.Silver });
            Assert.AreEqual(before + b.ReelSilver * 8, b.Coins);
            Assert.AreEqual(Phase.Running, b.Phase);
        }

        [Test]
        public void ReelsOnlyGiveSilverAndPerksNeverHeroes()
        {
            for (int seed = 0; seed < 300; seed++)
            {
                var b = new Battle(seed, Lineup);
                Put(b, 0, Lineup[0]);
                b.Phase = Phase.Reels;
                b.PendingReels = 1;
                if (seed % 3 == 0) b.JackpotReels = 1;
                int units = b.Slots.Count(s => s.Unit != null), slots = b.Slots.Count, perks = b.Perks.Values.Sum();
                float wall = b.Wall;
                int coins = b.Coins;
                var r = b.SpinReels();
                Assert.IsTrue(r.All(x => x == Reel.Silver || x == Reel.Perk));
                int given = b.ReelPerks.Length;
                bool all = r.All(x => x == r[0]);
                Assert.LessOrEqual(given, all && r[0] == Reel.Perk ? Battle.ReelPerkJackpot : Battle.ReelPerkMax);
                b.ApplyReels(r);
                Assert.AreEqual(units, b.Slots.Count(s => s.Unit != null), "生辰纲不送好汉，不能把格子占满");
                Assert.AreEqual(slots, b.Slots.Count);
                Assert.AreEqual(wall, b.Wall);
                Assert.AreEqual(perks + given, b.Perks.Values.Sum());
                Assert.GreaterOrEqual(b.Coins, coins);
                Assert.AreEqual(Phase.Running, b.Phase);
            }
        }

        [Test]
        public void GoodBotClearsFirstStageMostOfTheTime()
        {
            int wins = 0;
            for (int seed = 1; seed <= 10; seed++)
            {
                var b = new Battle(seed, Meta.Starters);
                var bot = new Bot(2);
                while (b.Phase != Phase.Victory && b.Phase != Phase.Defeat && b.Time < 400)
                {
                    bot.Step(b, 1f / 30f);
                    b.Update(1f / 30f);
                    b.Events.Clear();
                }
                if (b.Phase == Phase.Victory) wins++;
            }
            Assert.GreaterOrEqual(wins, 7);
        }

        [Test]
        public void IdleSummonerLoses()
        {
            var b = new Battle(9, Meta.Starters);
            var bot = new Bot(0);
            while (b.Phase != Phase.Victory && b.Phase != Phase.Defeat && b.Time < 400)
            {
                bot.Step(b, 1f / 30f);
                b.Update(1f / 30f);
                b.Events.Clear();
            }
            Assert.AreEqual(Phase.Defeat, b.Phase);
        }

        [Test]
        public void CooldownsDifferByRoleAndOnlyLegendsHaveUlts()
        {
            Assert.LessOrEqual(Defs.Hero(HeroId.HuaRong).Interval, 2.5f);
            Assert.GreaterOrEqual(Defs.Hero(HeroId.FanRui).Interval, 12f);
            Assert.Greater(Defs.Hero(HeroId.FanRui).Chan, 0);
            foreach (var d in Defs.Heroes)
            {
                if (d.Kind == Role.Mage && d.Chan > 0) Assert.GreaterOrEqual(d.Interval, 10f, d.Name);
                if (d.Kind == Role.Support)
                {
                    Assert.IsTrue(d.Buff.HasValue, d.Name);
                    Assert.AreEqual(0f, d.Coef, d.Name);
                }
                else if (d.Id != HeroId.YanQing)
                {
                    Assert.AreEqual(1, d.Count, $"{d.Name} 1星基础应为极简1发，把弹幕增长留给强化词条");
                }
                Assert.AreEqual(d.Rarity >= 4, Defs.UltPerk(d.Id) != null, d.Name);
            }
            Assert.AreEqual(3, Defs.Hero(HeroId.YanQing).Count, "仅燕青保留轻弩三连发特色");
        }

        static Unit Put(Battle b, int slot, HeroId h, int star = 1)
        {
            var u = new Unit { Hero = h, Star = star, Cd = 0 };
            b.Slots[slot].Unit = u;
            return u;
        }

        static Enemy Dummy(Battle b, float x = 0, float y = 3f, float hp = 1e9f)
        {
            var e = new Enemy { Id = 900 + b.Enemies.Count, Def = Defs.Enemy(EnemyKind.Soldier), Hp = hp, MaxHp = hp, Pos = new V2(x, y), Attacking = true };
            b.Enemies.Add(e);
            return e;
        }

        [Test]
        public void LegendUltUnlocksAtLevelFiveFromEnhanceCard()
        {
            // 1~4 级传说尚未解锁大招卡进池
            var loLow = Loadout.Plain(Lineup);
            loLow.Lv[(int)HeroId.GongSun] = Meta.UltLv - 1;
            var bLow = new Battle(4, Lineup, null, loLow);
            Put(bLow, 0, HeroId.GongSun);
            for (int i = 0; i < 20; i++)
            {
                bLow.Coins = 1000000;
                if (!bLow.Enhance()) break;
                Assert.IsFalse(bLow.Choices.Any(p => p.Ult), "未满5级的传说好汉不出大招卡");
                bLow.Pick(0);
            }

            // 升至 5 级后大招卡进入强化池
            var lo = Loadout.Plain(Lineup);
            lo.Lv[(int)HeroId.GongSun] = Meta.UltLv;
            var b = new Battle(4, Lineup, null, lo);
            Put(b, 0, HeroId.GongSun);
            Assert.IsFalse(b.HasUlt(HeroId.GongSun));
            bool seen = false;
            for (int i = 0; i < 60 && !b.HasUlt(HeroId.GongSun); i++)
            {
                b.Coins = 1000000;
                Assert.IsTrue(b.Enhance());
                int k = System.Array.FindIndex(b.Choices, p => p.Ult);
                Assert.IsFalse(b.Choices.Any(p => p.Eff == Eff.UltCd && !p.Ult), "大招没解锁前不出大招冷却卡");
                if (k >= 0) seen = true;
                b.Pick(k >= 0 ? k : 0);
            }
            Assert.IsTrue(seen);
            Assert.IsTrue(b.HasUlt(HeroId.GongSun));
            Assert.IsFalse(b.HasUlt(HeroId.HuaRong));
        }

        [Test]
        public void MageChannelsSeveralTicksPerCast()
        {
            var lu = new[] { HeroId.HuaRong, HeroId.LingZhen, HeroId.FanRui, HeroId.WuSong };
            var b = new Battle(5, lu);
            Put(b, 0, HeroId.FanRui);
            Dummy(b);
            int fires = 0, ticks = 0;
            for (int i = 0; i < 30 * 5; i++)
            {
                b.Update(1f / 30f);
                foreach (var e in b.Events)
                {
                    if (e.Type == Ev.Fire && e.Slot == 0) fires++;
                    if (e.Type == Ev.Hit && e.Hero == HeroId.FanRui) ticks++;
                }
                b.Events.Clear();
            }
            Assert.AreEqual(1, fires, "持续型法师 5 秒内只出手一次");
            Assert.GreaterOrEqual(ticks, 8, "一次施法持续跳多下");
        }

        [Test]
        public void SingleProjectileBaseDoublesCleanlyWithCountPerkAndAwakenVolley()
        {
            // 1. 验证孔亮1星仅投掷1枚火雷，选「双响火雷(Count+1)」后变为2枚且单发零暗扣（总伤害实打实翻倍）
            var lu = new[] { HeroId.KongLiang, HeroId.XieZhen, HeroId.ShiXiu, HeroId.MaLing };
            var b0 = new Battle(21, lu);
            Put(b0, 0, HeroId.KongLiang, 1);
            var foe0 = Dummy(b0, 0, 2.5f);
            b0.Update(0.05f);
            Assert.AreEqual(1, b0.Shots.Count(s => s.Hero == HeroId.KongLiang), "孔亮1星0词条每次只投1枚独火雷");
            float baseShotDmg = b0.Shots.First(s => s.Hero == HeroId.KongLiang).Damage;

            var b1 = new Battle(21, lu);
            Put(b1, 0, HeroId.KongLiang, 1);
            Dummy(b1, 0, 2.5f);
            b1.Choices = new[] { Defs.Perk("kongliang_0") }; // 双响火雷 Count+1
            b1.Phase = Phase.Choosing;
            b1.Pick(0);
            b1.Update(0.05f);
            var shots1 = b1.Shots.Where(s => s.Hero == HeroId.KongLiang).ToList();
            Assert.AreEqual(2, shots1.Count, "拿1张双响火雷后投出2枚");
            Assert.GreaterOrEqual(shots1.Sum(s => s.Damage), baseShotDmg * 1.99f, "废除15%暗扣后，1→2枚真实总伤翻倍");

            // 2. 验证三合一奥义觉醒后第3轮普攻额外迸发流星火雨弹幕
            b1.Choices = new[] { Defs.Perk("kongliang_morph") };
            b1.Phase = Phase.Choosing;
            b1.Pick(0);
            b1.Choices = new[] { Defs.Perk("kongliang_adv") };
            b1.Phase = Phase.Choosing;
            b1.Pick(0);
            Assert.IsTrue(b1.IsAwakened(HeroId.KongLiang));
            b1.Shots.Clear();
            b1.Slots[0].Unit.Casts = 2;
            b1.Slots[0].Unit.Cd = 0f;
            b1.Update(0.05f);
            Assert.GreaterOrEqual(b1.Shots.Count(s => s.Kind == ShotKind.MiniBomb && s.Hero == HeroId.KongLiang), 4, "觉醒后第3轮额外倾泻流星小火雷");
        }

        [Test]
        public void WuYongBlessKicksInWhenTheOrbLandsAndHalvesEachInterval()
        {
            var b = new Battle(6, Lineup);
            var wy = Put(b, 0, HeroId.WuYong);
            var archer = Put(b, 1, HeroId.HuaRong);
            var plain = Put(b, 2, HeroId.HuaRong);
            Dummy(b);
            wy.Cd = 999f;
            archer.Cd = 4f;
            archer.BlessN = 3;
            archer.BlessMul = 2f;
            archer.BlessWait = 0.5f;

            b.Update(0.25f);
            Assert.AreEqual(3, archer.BlessN, "法球没落地前不消耗层数");
            float before = archer.Cd;
            b.Update(0.3f);
            Assert.Less(archer.Cd, before * 0.5f + 0.01f, "法球落地那一刻正在走的冷却立刻减半");
            Assert.AreEqual(3, archer.BlessN);

            archer.Cd = 0.001f;
            plain.Cd = 0.001f;
            b.Update(0.01f);
            Assert.AreEqual(2, archer.BlessN, "每次出手消耗一层");
            Assert.AreEqual(plain.Cd * 0.5f, archer.Cd, 0.02f, "受祝福的这一次出手间隔减半");
        }

        [Test]
        public void WuYongBlessesACarryAndSpeedsItsCooldown()
        {
            var b = new Battle(6, Lineup);
            var wy = Put(b, 0, HeroId.WuYong);
            var archer = Put(b, 1, HeroId.HuaRong);
            archer.Cd = 5f;
            Dummy(b);
            bool selfCast = false, targetBuffed = false;
            for (int i = 0; i < 30 && (!selfCast || !targetBuffed); i++)
            {
                b.Update(1f / 30f);
                selfCast |= b.Events.Any(e => e.Type == Ev.Buff && e.Slot == 0 && e.EnemyId == -1);
                targetBuffed |= b.Events.Any(e => e.Type == Ev.Buff && e.EnemyId == 1);
                b.Events.Clear();
            }
            Assert.IsTrue(selfCast, "吴用自身也应发出施法动作与法阵事件，绝不能原地站桩无反应");
            Assert.IsTrue(targetBuffed);
            Assert.Greater(wy.Casts, 0);
            Assert.AreEqual(3, archer.BlessN);
            Assert.Greater(archer.BlessMul, 1.5f);

            // 场上唯一输出已有剩余祝福层数时，吴用再次冷却转好也应能正常出手刷新，不得哑火卡死
            wy.Cd = 0.01f;
            archer.Cd = 5f;
            archer.BlessN = 1;
            b.Update(0.05f);
            Assert.AreEqual(3, archer.BlessN, "队友已有祝福层数时吴用仍可正常出手刷新至满层");
        }

        [Test]
        public void DaiZongCutsTeammateCooldowns()
        {
            var lu = new[] { HeroId.HuaRong, HeroId.LingZhen, HeroId.FanRui, HeroId.WuSong };
            var b = new Battle(7, lu);
            var mage = Put(b, 1, HeroId.FanRui);
            Dummy(b);
            b.Update(1f / 30f);
            b.Events.Clear();
            float before = mage.Cd;
            Assert.Greater(before, 10f);
            Put(b, 0, HeroId.DaiZong);
            b.Update(1f / 30f);
            Assert.Less(mage.Cd, before * 0.75f);
        }

        [Test]
        public void MeleeSwingTravelsToTheTargetAndHitsOnArrival()
        {
            Assert.That(Battle.MeleeDur, Is.InRange(0.15f, 0.4f), "太快看不见刀在走，太慢不像砍");

            var b = new Battle(1, Lineup);
            var slot = b.Slots[0];
            slot.Unit = new Unit { Hero = HeroId.ShiXiu, Star = 1 };
            var foe = new Enemy { Id = 900, Def = Defs.Enemy(EnemyKind.Soldier), Hp = 1e6f, MaxHp = 1e6f, Pos = new V2(slot.Pos.X, Layout.StopY), Attacking = true };
            b.Enemies.Add(foe);
            Shot cut = null;
            for (int i = 0; i < 120 && cut == null; i++)
            {
                b.Update(1f / 60f);
                cut = b.Shots.FirstOrDefault(s => s.Kind == ShotKind.Punch && s.Hero == HeroId.ShiXiu);
            }
            Assert.IsNotNull(cut);
            Assert.AreEqual(Battle.ShotDur(ShotKind.Punch, V2.Dist(slot.Pos, foe.Pos)), cut.Dur, 1e-4f);
            Assert.AreEqual(foe.MaxHp, foe.Hp, "刀还在路上就不该掉血");
            float flown = 0f;
            while (b.Shots.Contains(cut) && flown < 1.5f)
            {
                Assert.AreEqual(foe.MaxHp, foe.Hp);
                b.Update(1f / 60f);
                flown += 1f / 60f;
            }
            Assert.Less(foe.Hp, foe.MaxHp);
            Assert.AreEqual(cut.Dur, flown, 2f / 60f);

            // 中场 4.5 格处：长枪比箭略快但绝不能像原先 0.22s 那样过快瞬移，且支持通过数值面板 ProjPace 统一热调
            const float mid = 4.5f;
            float arrowDur = Battle.ShotDur(ShotKind.Arrow, mid);
            float spearDur = Battle.ShotDur(ShotKind.Spear, mid);
            float meleeDur = Battle.ShotDur(ShotKind.Punch, mid);
            float slamDur = Battle.ShotDur(ShotKind.Slam, mid);
            float mageDrop = Battle.ShotDur(ShotKind.Stone, mid, true);
            float windDur = Battle.ShotDur(ShotKind.Wind, mid);
            float lightDur = Battle.ShotDur(ShotKind.Lightning, 0f);
            Assert.That(spearDur, Is.InRange(arrowDur * 0.80f, arrowDur * 1.05f), "长枪虽凌厉，但不得远快于箭矢");
            Assert.GreaterOrEqual(meleeDur, 0.50f);
            Assert.GreaterOrEqual(slamDur, meleeDur);
            Assert.GreaterOrEqual(mageDrop, 0.50f, "法师金砖从天砸落需沉稳看清");
            Assert.GreaterOrEqual(windDur, 0.58f, "风法/阵法弹道需舒展清晰");
            Assert.GreaterOrEqual(lightDur, 0.15f, "天雷引落需留足蓄势时间");
            try
            {
                var cfg = Balance.ExportCurrent();
                cfg.Combat.ProjPace = 1.5f;
                cfg.Combat.VfxPace = 1.3f;
                cfg.Combat.LordWaveSpeed = 10f;
                cfg.Combat.MageDropDur = 0.50f;
                cfg.Combat.BeamFlowSpeed = 1.4f;
                Balance.Apply(cfg);
                Assert.AreEqual(spearDur * 1.5f, Battle.ShotDur(ShotKind.Spear, mid), 1e-4f);
                Assert.AreEqual((0.50f + mid / 16.5f) * 1.5f, Battle.ShotDur(ShotKind.Stone, mid, true), 1e-4f);
                Assert.AreEqual(1.3f, Defs.VfxPace, 1e-4f);
                Assert.AreEqual(10f, Defs.LordWaveSpeed, 1e-4f);
                Assert.AreEqual(1.4f, Defs.BeamFlowSpeed, 1e-4f);
            }
            finally
            {
                Balance.ResetToDefault();
            }
        }

        [Test]
        public void TradeCardsExcludeEachOtherAndAdvancedNeedsTheMorph()
        {
            var b = new Battle(1, Lineup);
            b.Slots[0].Unit = new Unit { Hero = HeroId.HuaRong, Star = 1 };
            var heavy = Defs.Perk("huarong_heavy");
            var quick = Defs.Perk("huarong_quick");
            var morph = Defs.Perk("huarong_morph");
            var adv = Defs.Perk("huarong_adv");
            Assert.AreEqual(Eff.Blast, morph.Eff);
            bool Offered(PerkDef p)
            {
                for (int k = 0; k < 400; k++)
                {
                    b.Coins = 99999;
                    b.Enhances = 0;
                    if (!b.Enhance()) return false;
                    bool hit = b.Choices.Contains(p);
                    b.Choices = null;
                    b.Phase = Phase.Running;
                    if (hit) return true;
                }
                return false;
            }
            void Take(PerkDef p)
            {
                b.Choices = new[] { p };
                b.Phase = Phase.Choosing;
                b.Pick(0);
            }
            Assert.IsFalse(Offered(adv), "没有质变时不出进阶");
            Assert.IsTrue(Offered(quick));
            float dmg0 = b.HeroDmgMul(HeroId.HuaRong), spd0 = b.HeroSpeedMul(HeroId.HuaRong);
            Take(heavy);
            Assert.Greater(b.HeroDmgMul(HeroId.HuaRong), dmg0, "重手加伤害");
            Assert.Less(b.HeroSpeedMul(HeroId.HuaRong), spd0, "重手的代价是攻速");
            Assert.IsFalse(Offered(quick), "重手和快手二选一");
            Take(morph);
            Assert.IsTrue(Offered(adv), "拿了质变后出进阶");
        }

        [Test]
        public void BurnTicksOverItsDuration()
        {
            var b = new Battle(1, Lineup);
            var foe = new Enemy { Id = 900, Def = Defs.Enemy(EnemyKind.Soldier), Hp = 1e6f, MaxHp = 1e6f, Pos = new V2(0f, 2f), Stun = 99f };
            b.Enemies.Add(foe);
            foe.BurnT = Defs.BurnDur;
            foe.BurnDps = 100f;
            foe.BurnTick = Defs.BurnEvery;
            for (int i = 0; i < 240; i++) b.Update(1f / 60f);
            Assert.AreEqual(1e6f - 100f * Defs.BurnDur, foe.Hp, 100f * Defs.BurnEvery + 1f, "灼烧 3 秒共掉约 BurnDps × 3");
            Assert.LessOrEqual(foe.BurnT, 0f);
        }

        [Test]
        public void EveryHeroUnlocksATraitAtEachMergedStar()
        {
            foreach (var d in Defs.Heroes)
                for (int star = 2; star <= 4; star++)
                {
                    var t = StarTraits.At(d, star);
                    Assert.IsNotNull(t, $"{d.Name} {star} 星");
                    Assert.IsNotEmpty(t.Name);
                    Assert.IsNotEmpty(t.Desc);
                }
            Assert.IsNull(StarTraits.At(Defs.Hero(HeroId.ShiXiu), 1));
        }

        [Test]
        public void ThreeStarBladeSendsQiDownTheColumn()
        {
            Shot Swing(int star, out Battle b)
            {
                b = new Battle(1, Lineup);
                var slot = b.Slots[0];
                slot.Unit = new Unit { Hero = HeroId.ShiXiu, Star = star };
                b.Enemies.Add(new Enemy { Id = 900, Def = Defs.Enemy(EnemyKind.Soldier), Hp = 1e6f, MaxHp = 1e6f, Pos = new V2(0f, Layout.StopY), Attacking = true });
                Shot cut = null;
                for (int i = 0; i < 120; i++)
                {
                    b.Update(1f / 60f);
                    cut = b.Shots.FirstOrDefault(s => s.Kind == ShotKind.Punch);
                    if (cut != null) break;
                }
                while (cut != null && b.Shots.Contains(cut)) b.Update(1f / 60f);
                return b.Shots.FirstOrDefault(s => s.Kind == ShotKind.Qi);
            }
            Assert.IsNull(Swing(2, out _), "2 星还没有刀气");
            var qi = Swing(3, out var b3);
            Assert.IsNotNull(qi, "3 星挥刀带一道刀气");
            Assert.Greater(qi.To.Y, qi.From.Y, "刀气往敌阵方向飞");
            var behind = new Enemy { Id = 901, Def = Defs.Enemy(EnemyKind.Soldier), Hp = 1e6f, MaxHp = 1e6f, Pos = new V2(qi.From.X, qi.From.Y + 2f) };
            b3.Enemies.Add(behind);
            for (int i = 0; i < 120 && b3.Shots.Contains(qi); i++) b3.Update(1f / 60f);
            Assert.Less(behind.Hp, behind.MaxHp, "刀气打到身后同一列的敌人");
        }

        [Test]
        public void ForceWinEndsAtFullWall()
        {
            var b = new Battle(1, Lineup);
            b.Wall = 10;
            b.Enemies.Add(new Enemy());
            b.Shots.Add(new Shot());
            b.Phase = Phase.Choosing;
            b.PendingReels = 1;
            b.ForceWin();
            Assert.AreEqual(Phase.Victory, b.Phase);
            Assert.AreEqual(b.WallMax, b.Wall);
            Assert.AreEqual(0, b.Enemies.Count);
            Assert.AreEqual(0, b.Shots.Count);
            Assert.AreEqual(0, b.PendingReels);
            Assert.IsTrue(b.Events.Any(e => e.Type == Ev.Victory));
            b.ForceWin();
            Assert.AreEqual(Phase.Victory, b.Phase);
        }

        [Test]
        public void ForceLoseBreaksTheWallOnTheCurrentWave()
        {
            var b = new Battle(1, Lineup);
            var foe = new Enemy();
            b.Enemies.Add(foe);
            b.Shots.Add(new Shot());
            b.Wave = 4;
            b.Phase = Phase.Running;
            b.ForceLose();
            Assert.AreEqual(Phase.Defeat, b.Phase);
            Assert.AreEqual(0, b.Wall);
            Assert.AreEqual(4, b.Wave);
            Assert.AreSame(foe, b.Enemies[0]);
            Assert.AreEqual(0, b.Shots.Count);
            Assert.IsTrue(b.Events.Any(e => e.Type == Ev.Defeat));
            b.ForceWin();
            Assert.AreEqual(Phase.Defeat, b.Phase);

            var early = new Battle(2, Lineup);
            early.ForceLose();
            Assert.AreEqual(1, early.Wave);
            Assert.AreEqual(Phase.Defeat, early.Phase);
        }

        [Test]
        public void WildcardSupportMergeBonusAndSwapOrderSolveSupportBrick()
        {
            var lu = new[] { HeroId.HuaRong, HeroId.WuYong, HeroId.ShiQian, HeroId.WuSong };
            var b = new Battle(11, lu);
            // 1. 百搭时迁可与任意同星不同名好汉合成，且辅助参与合成当场爆银两并赋加速
            b.Slots[0].Unit = new Unit { Id = 1, Hero = HeroId.ShiQian, Star = 1, Wild = true };
            b.Slots[1].Unit = new Unit { Id = 2, Hero = HeroId.HuaRong, Star = 1 };
            Assert.IsTrue(b.CanMerge(0, 1));
            Assert.IsTrue(b.HasMergePartner(0));
            int coins0 = b.Coins;
            Assert.IsTrue(b.Drop(0, 1));
            Assert.AreEqual(2, b.Slots[1].Unit.Star);
            Assert.Greater(b.Coins, coins0 + 20, "辅助参与合成当场额外爆银两");
            Assert.AreEqual(4, b.Slots[1].Unit.BlessN, "辅助参与合成赋予新单位加速祝福");

            // 2. 梁山换将令：将场上 3 星辅助当场重随为同星输出好汉，每局仅限 1 次
            b.Slots[2].Unit = new Unit { Id = 3, Hero = HeroId.WuYong, Star = 3 };
            Assert.IsTrue(b.CanSwapUnit(2));
            Assert.IsTrue(b.SwapUnit(2));
            Assert.AreEqual(3, b.Slots[2].Unit.Star);
            Assert.IsTrue(b.Slots[2].Unit.Def.Carry, "换将令必出输出位好汉");
            Assert.IsFalse(b.CanSwapUnit(2), "每局仅可使用 1 次换将令");
        }

        [Test]
        public void NearWallEmergencyAndFocusFirePreventBossTunnelVision()
        {
            var b = new Battle(12, Lineup);
            Put(b, 0, HeroId.HuaRong, 1);
            var farBoss = new Enemy { Id = 101, Def = Defs.Enemy(EnemyKind.Boss), Hp = 1e6f, MaxHp = 1e6f, Pos = new V2(0, 4.2f) };
            var wallChewer = new Enemy { Id = 102, Def = Defs.Enemy(EnemyKind.Hound), Hp = 1e6f, MaxHp = 1e6f, Pos = new V2(0, Layout.StopY), Attacking = true };
            var manualTarget = new Enemy { Id = 103, Def = Defs.Enemy(EnemyKind.Taoist), Hp = 1e6f, MaxHp = 1e6f, Pos = new V2(1.5f, 3.5f) };
            b.Enemies.AddRange(new[] { farBoss, wallChewer, manualTarget });

            b.Update(0.05f);
            Assert.IsTrue(b.Shots.Any(s => s.TargetId == wallChewer.Id), "墙根拆家快怪优先级高于远端刚出门的首领");

            b.Shots.Clear();
            b.Slots[0].Unit.Cd = 0f;
            b.FocusEnemyId = manualTarget.Id;
            b.Update(0.05f);
            Assert.IsTrue(b.Shots.Any(s => s.TargetId == manualTarget.Id), "玩家点击集火目标拥有最高优先级");
        }

        [Test]
        public void ThreeInOneAwakeningAndLv20PenaltyRemovalAndAdjacencyWork()
        {
            var lo = Loadout.Plain(new[] { HeroId.WuSong, HeroId.LuZhiShen, HeroId.LinChong, HeroId.WuYong });
            lo.Lv[(int)HeroId.WuSong] = Meta.NoPenaltyLv;
            var b = new Battle(15, lo.Lineup, Defs.Level(5), lo);
            Assert.AreEqual(5, b.ReelCount, "逢5首领关升级为5格黄金老虎机");
            Assert.AreEqual(4, new Battle(15, lo.Lineup, Defs.Level(2), lo).ReelCount);

            Put(b, 0, HeroId.WuSong, 2);
            Put(b, 1, HeroId.WuYong, 1);
            Assert.Greater(b.AdjSpeedMul(b.Slots[0]), 1.1f, "吴用相邻格获得攻速加成");

            float spd0 = b.HeroSpeedMul(HeroId.WuSong);
            // 20级武松拿「千钧之力」不再扣攻速
            b.Choices = new[] { Defs.Perk("wusong_heavy") };
            b.Phase = Phase.Choosing;
            b.Pick(0);
            Assert.GreaterOrEqual(b.HeroSpeedMul(HeroId.WuSong), spd0 - 1e-4f, "20级抹除取舍卡减速代价");

            // 再拿质变+进阶凑齐 3 张词条，自动免费触发名场面奥义觉醒
            b.Choices = new[] { Defs.Perk("wusong_morph") };
            b.Phase = Phase.Choosing;
            b.Pick(0);
            Assert.IsFalse(b.IsAwakened(HeroId.WuSong));
            float dmgBefore = b.HeroDmgMul(HeroId.WuSong);
            b.Choices = new[] { Defs.Perk("wusong_adv") };
            b.Phase = Phase.Choosing;
            b.Pick(0);
            Assert.IsTrue(b.IsAwakened(HeroId.WuSong), "凑齐质变+进阶+专属共3张词条自动觉醒本命奥义");
            Assert.IsTrue(b.Events.Any(e => e.Type == Ev.Awaken && e.Hero == HeroId.WuSong));
            Assert.Greater(b.HeroDmgMul(HeroId.WuSong), dmgBefore * 1.25f);
        }

        [Test]
        public void OutOfBattleAndInBattleAttackAndHitDamageMatchExactly()
        {
            // 验证局外好汉详情页显示的攻击力/单发伤害 与 局内1星0词条面板及真实命中伤害 100% 同源一致（彻底根除 294 vs 56 割裂）
            foreach (var n in new[] { 1, 8, 20 })
            {
                var s = Meta.ExpectedSave(n);
                var lo = Meta.BuildLoadout(s);
                // 使用第1关（无任何职业环境Buff）纯粹核对面板与首击伤害
                var b = new Battle(42, lo.Lineup, Defs.Level(1), lo);
                for (int i = 0; i < lo.Lineup.Length; i++)
                {
                    var h = lo.Lineup[i];
                    var d = Defs.Hero(h);
                    Put(b, i, h, 1);
                    int outAtk = Meta.HeroDisplayAtk(s, h);
                    int inAtk = (int)System.Math.Round(b.SlotHeroAtk(b.Slots[i]));
                    Assert.AreEqual(outAtk, inAtk, $"存档阶段{n} {d.Name} 局外面板攻击({outAtk}) 必须等于局内1星面板攻击({inAtk})");

                    if (d.Carry && d.Chan <= 0)
                    {
                        b.Enemies.Clear();
                        b.Shots.Clear();
                        var dummy = new Enemy { Id = 800 + i, Def = Defs.Enemy(EnemyKind.Soldier), Hp = 1e6f, MaxHp = 1e6f, Pos = new V2(b.Slots[i].Pos.X, Layout.StopY), Attacking = true };
                        b.Enemies.Add(dummy);
                        b.Slots[i].Unit.Cd = 0f;
                        // 暂时清零暴击率以精确比对不暴击单发白字伤害
                        float savedCrit = lo.Crit;
                        lo.Crit = 0f;
                        b.Update(0.02f);
                        lo.Crit = savedCrit;
                        var sh = b.Shots.FirstOrDefault(x => x.Hero == h);
                        Assert.IsNotNull(sh, d.Name);
                        float rawShotDmg = sh.Crit ? sh.Damage / lo.CritDmg : sh.Damage;
                        Assert.AreEqual(b.SlotHeroAtk(b.Slots[i]) * d.Coef, rawShotDmg, 0.5f, $"{d.Name} 真实发射伤害必须等于 面板攻击 × 技能系数");
                    }
                }
            }
        }

        [Test]
        public void OpeningMinionsRequireMultipleHitsAndEnhancesAreMandatoryToClear()
        {
            // 1. 杜绝开场一刀秒：在各章节标准养成下，第1波普通官兵面对1星0词条射手需 2.4~4.5 击，面对1星战士/炮手/法师也绝不能满血一击秒杀
            foreach (var stageNo in new[] { 1, 5, 10, 20, 35 })
            {
                var s = Meta.ExpectedSave(stageNo);
                var lo = Meta.BuildLoadout(s);
                var st = Defs.Level(stageNo);
                var b = new Battle(1, lo.Lineup, st, lo);
                b.Update(0.5f); // 触发第1波刷怪
                float soldierHp = Defs.Enemy(EnemyKind.Soldier).Hp * Defs.HpScale(1) * Defs.Tough(1) * st.HpMul;
                foreach (var h in lo.Lineup)
                {
                    var d = Defs.Hero(h);
                    if (!d.Carry || d.Chan > 0) continue;
                    // 1) 纯白字不暴击单发：任何关卡任何职业1星0词条绝不能满血1下秒杀外星小兵
                    float rawHit = Meta.HeroBaseAtk(lo, h) * lo.SkillPow[(int)h] * d.Coef * d.Count;
                    Assert.GreaterOrEqual(soldierHp / rawHit, 1.35f,
                        $"第{stageNo}关 1星 {d.Name} 绝不能1下秒满血小兵，实际={soldierHp / rawHit:F2}");
                    // 2) 计入攻速、暴击期望与真实出手间隔后的单怪击杀耗时：射手在全50关始终维持 2.8~9.5 秒点杀节奏，不刮痧也不秒杀
                    if (d.Kind == Role.Archer)
                    {
                        float critExp = 1f + System.Math.Min(0.8f, lo.Crit + (lo.Passive[(int)h] && d.PassiveEff == Eff.Crit ? d.PassiveV : 0f)) * (lo.CritDmg - 1f);
                        float effVolley = rawHit * critExp * lo.AllSpeed * lo.HeroSpeed[(int)h];
                        float ttk = (soldierHp / effVolley) * d.Interval;
                        Assert.That(ttk, Is.InRange(2.8f, 9.5f), $"第{stageNo}关 1星射手 {d.Name} 等效点杀耗时应在 2.8~9.5s 之间，实际={ttk:F2}s");
                    }
                }
            }

            // 2. 局内策略必要性：如果只召唤+无脑合成（Bot 1，完全不买强化词条），在首领关大概率崩盘失败！
            int noEnhanceWins = 0;
            for (int seed = 1; seed <= 10; seed++)
            {
                var s = Meta.ExpectedSave(10);
                var lo = Meta.BuildLoadout(s);
                var b = new Battle(seed, lo.Lineup, Defs.Level(10), lo);
                var mergeOnlyBot = new Bot(1);
                while (b.Phase != Phase.Victory && b.Phase != Phase.Defeat && b.Time < 500)
                {
                    mergeOnlyBot.Step(b, 1f / 30f);
                    b.Update(1f / 30f);
                    b.Events.Clear();
                }
                if (b.Phase == Phase.Victory) noEnhanceWins++;
            }
            Assert.LessOrEqual(noEnhanceWins, 2, $"不买局内强化词条光靠铺人合成不该混过首领关，实际胜场={noEnhanceWins}/10");
        }

        [Test]
        public void HeroSkillBehaviorMatchesDescriptions()
        {
            // 1. 溅射/近战暴击保留 Crit 标记；击退是持续平滑滑退而非单帧瞬移
            var lo = Loadout.Plain(new[] { HeroId.ShiXiu, HeroId.XieZhen, HeroId.HuSanniang, HeroId.TangLong });
            lo.Crit = 1f; // 100% 暴击核验 Splash Crit 透传
            var b = new Battle(7, lo.Lineup, Defs.Level(1), lo);
            Put(b, 0, HeroId.ShiXiu, 3);
            var foe1 = new Enemy { Id = 910, Def = Defs.Enemy(EnemyKind.Soldier), Hp = 1e6f, MaxHp = 1e6f, Pos = new V2(b.Slots[0].Pos.X, Layout.StopY), Attacking = true };
            var foe2 = new Enemy { Id = 911, Def = Defs.Enemy(EnemyKind.Soldier), Hp = 1e6f, MaxHp = 1e6f, Pos = new V2(b.Slots[0].Pos.X + 0.5f, Layout.StopY), Attacking = true };
            var hawk = new Enemy { Id = 912, Def = Defs.Enemy(EnemyKind.Hawk), Hp = 1e6f, MaxHp = 1e6f, Pos = new V2(b.Slots[0].Pos.X, Layout.StopY + 0.5f) };
            b.Enemies.AddRange(new[] { foe1, foe2, hawk });
            b.Slots[0].Unit.Cd = 0f;
            b.Update(0.02f);
            var cut = b.Shots.First(s => s.Kind == ShotKind.Punch);
            b.Events.Clear();
            while (b.Shots.Contains(cut)) b.Update(1f / 60f);
            var qi = b.Shots.First(s => s.Kind == ShotKind.Qi);
            Assert.AreEqual(cut.Damage / lo.CritDmg * 0.65f, qi.Damage, 0.05f, "3星刀气伤害严格等于单刀基础伤害的 65%");
            Assert.IsTrue(b.Events.Any(e => e.Type == Ev.Damage && e.EnemyId == foe1.Id && e.Crit), "石秀暴击必须打出暴击飘字");
            Assert.IsTrue(b.Events.Any(e => e.Type == Ev.Damage && e.EnemyId == foe2.Id && e.Crit), "小范围溅射目标同样获得暴击标记");
            Assert.Greater(foe1.Pos.Y - Layout.StopY, 0.30f, "命中后产生肉眼清晰可见的击退距离");
            Assert.IsFalse(foe1.Attacking, "击退打断啃墙状态");

            // 2. 3星近战绝不对飞行怪空挥
            b.Enemies.Clear();
            b.Shots.Clear();
            b.Enemies.Add(hawk);
            b.Slots[0].Unit.Cd = 0f;
            b.Update(0.05f);
            Assert.IsEmpty(b.Shots, "近战打不到飞行敌人，不应朝飞行怪空挥");

            // 3. 20级即免除取舍强化负面代价（与里程碑说明一致）
            Assert.AreEqual(20, Meta.NoPenaltyLv);

            // 4. 扈三娘 4星落点震慑周围敌人；汤隆 1星打造神兵为 +40% 起
            var b2 = new Battle(9, lo.Lineup, Defs.Level(1), Loadout.Plain(lo.Lineup));
            Put(b2, 0, HeroId.HuSanniang, 4);
            Put(b2, 1, HeroId.TangLong, 1);
            var mainT = new Enemy { Id = 920, Def = Defs.Enemy(EnemyKind.Soldier), Hp = 1e6f, MaxHp = 1e6f, Pos = new V2(0f, 0f) };
            var nearT = new Enemy { Id = 921, Def = Defs.Enemy(EnemyKind.Soldier), Hp = 1e6f, MaxHp = 1e6f, Pos = new V2(0.8f, 0f) };
            b2.Enemies.AddRange(new[] { mainT, nearT });
            b2.Slots[0].Unit.Cd = 0f;
            b2.Slots[1].Unit.Cd = 0f;
            b2.Update(0.02f);
            Assert.AreEqual(0.4f, b2.ForgeV, 0.01f, "汤隆1星神兵加成严格从 40% 起步");
            for (int f = 0; f < 60 && b2.Shots.Count > 0; f++) b2.Update(1f / 60f);
            Assert.Greater(nearT.Stun, 0f, "扈三娘4星天罗地网落点震慑周围敌人");
        }

        [Test]
        public void BalanceManagementSystemAndSmoothedEconomyWork()
        {
            // 1. 官兵固定掉落 16 银，所有怪物全波次赏银恒定（不做第1波或波次加成，所见即所得）；小兵有效血量单调上升
            var soldier = Defs.Enemy(EnemyKind.Soldier);
            Assert.AreEqual(16, soldier.Coin);
            for (int w = 1; w <= 10; w++)
                Assert.AreEqual(16, Defs.KillCoin(soldier, w, 0f), $"第{w}波官兵实掉银两应恒为16");
            foreach (var e in Defs.Enemies)
                Assert.AreEqual(e.Coin, Defs.KillCoin(e, 1, 0f), $"{e.Name} 面板赏银应等于局内实掉银两");
            for (int w = 2; w <= 10; w++)
                Assert.GreaterOrEqual(Defs.Tough(w) * Defs.HpScale(w), Defs.Tough(w - 1) * Defs.HpScale(w - 1) * 0.99f);

            // 2. 生辰纲去泡沫核验：第7波5格首领全银两大奖收敛至 ~1060 银两（不再爆 3800+），转盘占整局经济比重 < 30%
            var bBoss = new Battle(3, Lineup, Defs.Level(5)) { Wave = 7, Phase = Phase.Reels, PendingReels = 1 };
            int bossAllSilver = bBoss.ReelSilverOf(new[] { Reel.Silver, Reel.Silver, Reel.Silver, Reel.Silver, Reel.Silver });
            Assert.That(bossAllSilver, Is.InRange(700, 1300), $"首领全银两生辰纲应适度惊喜无泡沫，实际={bossAllSilver}");
            var est = Balance.EstimateTenWaveEconomy(true, 7);
            Assert.Less(est.TreasureShare, 0.30f, $"生辰纲+首领期望占比应低于30%，实际={est.TreasureShare:P1}");

            // 3. 首领压血分段爆钱袋 + 波次推进发放守城军饷
            var b = new Battle(5, Lineup, Defs.Level(1));
            b.Update(0.1f);
            // 推进过第 1 波时长触发进第 2 波发放军饷（清空场上官兵避免拆坏寨墙）
            for (int i = 0; i < 600 && b.Wave == 1; i++)
            {
                b.Enemies.Clear();
                b.Update(0.05f);
            }
            Assert.AreEqual(2, b.Wave);
            Assert.Greater(b.CoinsFromWaves, 0, "每撑过一波发放守城军饷");

            var boss = new Enemy { Id = 777, Def = Defs.Enemy(EnemyKind.Boss), Hp = 1000f, MaxHp = 1000f, Pos = new V2(0, 2f) };
            b.Enemies.Add(boss);
            b.Shots.Add(new Shot { Id = 1, Kind = ShotKind.Arrow, Hero = HeroId.HuaRong, From = default, To = boss.Pos, TargetId = boss.Id, Dur = 0.01f, Damage = 700f });
            b.Update(0.02f);
            Assert.AreEqual(2, boss.BossDrops, "首领压过 70% 与 35% 血线各爆一次阶段钱袋");
            Assert.Greater(b.CoinsFromBossPhase, 100);

            // 4. Resources/BalanceConfig.json 完整性与动态热改数值回退验证
            var txt = UnityEngine.Resources.Load<UnityEngine.TextAsset>("BalanceConfig");
            Assert.IsNotNull(txt, "缺少 Resources/BalanceConfig.json");
            var parsed = UnityEngine.JsonUtility.FromJson<BalanceConfig>(txt.text);
            Assert.IsNotNull(parsed);
            Assert.AreEqual(Defs.HeroCount, parsed.Heroes.Length);
            Assert.AreEqual(Defs.Enemies.Length, parsed.Enemies.Length);

            try
            {
                float trait = HeroKits.Of(HeroId.HuaRong).TraitV;
                var legacyCfg = Balance.CreateDefault();
                legacyCfg.Heroes[0].HasKit = false;
                legacyCfg.Heroes[0].TraitV = 0f;
                Balance.Apply(legacyCfg);
                Assert.AreEqual(trait, HeroKits.Of(HeroId.HuaRong).TraitV, 1e-4f, "旧表导入不能把特性数值清成 0");

                Balance.Apply(parsed);
                Assert.AreEqual(trait, HeroKits.Of(HeroId.HuaRong).TraitV, 1e-4f, "Resources/BalanceConfig.json 导入后四技能数值完整");

                float baseHp10 = Defs.StageHp(10);
                float baseAtk10 = Defs.StageAtk(10);
                var custom = Balance.CreateDefault();
                custom.Economy.StartCoins = 155;
                custom.Economy.EnhanceTable[0] = 66;
                custom.WaveStage.GlobalHpMul = 0.85f;
                custom.WaveStage.GlobalAtkMul = 0.90f;
                custom.Heroes[0].Coef = 2.22f;
                var xz = custom.Heroes.Single(h => h.Id == HeroId.XieZhen.ToString());
                Assert.IsTrue(xz.HasKit, "导出的数值表要带上四技能");
                Assert.AreEqual(HeroKits.Of(HeroId.XieZhen).SigV, xz.SigV, 1e-4f);
                xz.SigV = 3f;
                Balance.Apply(custom);
                Assert.AreEqual(baseHp10 * 0.85f, Defs.StageHp(10), 1e-3f, "GlobalHpMul 总推杆应按精确比例缩放全关卡怪血");
                Assert.AreEqual(baseAtk10 * 0.90f, Defs.StageAtk(10), 1e-3f, "GlobalAtkMul 总推杆应按精确比例缩放全关卡拆墙伤害");
                Assert.AreEqual(155, new Battle(1, Lineup).Coins);
                Assert.AreEqual(66, Defs.EnhanceCost(0));
                Assert.AreEqual(2.22f, Defs.Heroes[0].Coef, 1e-4f);
                Assert.AreEqual(3f, HeroKits.Of(HeroId.XieZhen).SigV, 1e-4f, "数值表要能改绝技数值");
                Assert.IsTrue(HeroKits.Of(HeroId.XieZhen).SigDesc.Contains("多射 3 枚"), HeroKits.Of(HeroId.XieZhen).SigDesc);
            }
            finally
            {
                Balance.ResetToDefault();
            }
            Assert.AreEqual(100, new Battle(1, Lineup).Coins);
            Assert.AreEqual(100, Defs.EnhanceCost(0));
        }

        [Test]
        public void FourSkillSystemSignaturesAndAoyiFinishersWork()
        {
            // 1. 吴用 10 级绝技「锦囊妙计」：合成时献计爆银 + 立即向输出位抛出祝福法球；20 级祝福在合成后继承
            var lu = new[] { HeroId.WuYong, HeroId.HuaRong, HeroId.LuZhiShen, HeroId.QinMing };
            var lo = Loadout.Plain(lu);
            for (int i = 0; i < lo.Lv.Length; i++) { lo.Lv[i] = 20; lo.Passive[i] = true; }
            var b = new Battle(12, lu, Defs.Level(1), lo);
            Put(b, 0, HeroId.WuYong, 1);
            Put(b, 1, HeroId.WuYong, 1);
            Put(b, 2, HeroId.HuaRong, 1);
            Dummy(b, 0f, 1.5f);
            int coins0 = b.Coins;
            Assert.IsTrue(b.Drop(0, 1));
            Assert.GreaterOrEqual(b.Coins, coins0 + 28 + 20, "吴用10级绝技参与合成额外献计+20银两");
            Assert.IsTrue(b.Events.Any(e => e.Type == Ev.Sig && e.Hero == HeroId.WuYong), "触发绝技事件与紫金阵印演出");
            Assert.IsTrue(b.Slots.Any(s => s.Unit != null && s.Unit.Def.Carry && s.Unit.BlessN >= 4), "吴用绝技立刻祝福场上输出好汉");

            // 20 级继承祝福：花荣带祝福层数与另一位花荣合成，新好汉保留祝福
            Put(b, 3, HeroId.HuaRong, 1);
            b.Slots[2].Unit.BlessN = 3;
            b.Slots[2].Unit.BlessMul = 2f;
            Assert.IsTrue(b.Drop(2, 3));
            if (b.Slots[3].Unit.Def.Carry)
                Assert.AreEqual(3, b.Slots[3].Unit.BlessN, "吴用20级改写：被祝福好汉合成后祝福层数无损继承");

            // 2. 鲁智深 10 级绝技「大闹五台山」：寨墙每掉 10% 生命立刻腾空砸地反击
            var b2 = new Battle(15, lu, Defs.Level(1), lo);
            Put(b2, 0, HeroId.LuZhiShen, 2);
            b2.Slots[0].Unit.Cd = 99f;
            var near = new Enemy { Id = 501, Def = Defs.Enemy(EnemyKind.Soldier), Hp = 5000f, MaxHp = 5000f, Pos = new V2(0f, Layout.StopY), Attacking = true, AtkCd = 0.01f };
            near.Tough = (b2.WallMax * 0.12f) / near.Def.WallDps;
            b2.Enemies.Add(near);
            b2.Update(0.05f);
            Assert.IsTrue(b2.Events.Any(e => e.Type == Ev.Sig && e.Hero == HeroId.LuZhiShen), "城墙掉血10%触发鲁智深绝技反击");
            Assert.IsTrue(b2.Shots.Any(s => s.Hero == HeroId.LuZhiShen), "鲁智深无视当前冷却当场砸出禅杖");

            // 3. 秦明 10 级绝技「霹雳火」：登场瞬间向敌群轰落 3 颗霹雳火陨
            var b3 = new Battle(18, new[] { HeroId.QinMing, HeroId.QinMing, HeroId.QinMing, HeroId.QinMing }, Defs.Level(1), lo) { Coins = 5000 };
            Dummy(b3, 0f, 2f);
            b3.Summon();
            Assert.AreEqual(3, b3.Shots.Count(s => s.Hero == HeroId.QinMing && s.Kind == ShotKind.Fireball), "秦明登场当场轰落3颗火陨");

            // 4. 非传说好汉 5 级起可在三选一直接抽到「本命奥义」终结技卡并当场觉醒轰出见面礼弹幕！
            var b4 = new Battle(22, lu, Defs.Level(1), lo);
            Put(b4, 0, HeroId.HuaRong, 2);
            Dummy(b4, 0f, 2.5f);
            var aoyiCard = Defs.FinisherPerk(HeroId.HuaRong);
            Assert.IsNotNull(aoyiCard);
            Assert.IsTrue(aoyiCard.Finisher);
            b4.Choices = new[] { aoyiCard };
            b4.Phase = Phase.Choosing;
            b4.Pick(0);
            Assert.IsTrue(b4.IsAwakened(HeroId.HuaRong), "抽到奥义卡当场觉醒");
            Assert.IsTrue(b4.Events.Any(e => e.Type == Ev.Awaken && e.Hero == HeroId.HuaRong));
            Assert.GreaterOrEqual(b4.Shots.Count(s => s.Hero == HeroId.HuaRong), 3, "奥义觉醒瞬间当场齐射贯阵箭雨");
        }

        [Test]
        public void RoleAuthenticMageChainRefractSupportMorphAndShatterGateWork()
        {
            // 1) 公孙胜逐跳蛇形连锁与阶梯衰减（默认 0.82^hop -> 高压超导 +2 连锁 & 0.92^hop -> 紫电雷池 100% 无损 + 终点麻痹雷池）
            var luMage = new[] { HeroId.GongSun, HeroId.ShanTinggui, HeroId.WuYong, HeroId.ShiXiu };
            var lo = Loadout.Plain(luMage);
            lo.Crit = 0f;
            var b = new Battle(77, luMage, Defs.Level(1), lo);
            Put(b, 0, HeroId.GongSun, 1);
            b.Slots[0].Unit.Cd = 0.01f;
            var e0 = Dummy(b, -1.2f, 2.0f, 50000f);
            var e1 = Dummy(b, 0.0f, 2.2f, 50000f);
            var e2 = Dummy(b, 1.2f, 2.4f, 50000f);
            var e3 = Dummy(b, 2.2f, 2.6f, 50000f);

            // 初始 1 级公孙胜：主目标 + 连锁 1 跳（共打 2 人，第 2 跳伤害约为首跳的 82%）
            for (int step = 0; step < 30; step++) b.Update(0.05f);
            float d0 = 50000f - e0.Hp, d1 = 50000f - e1.Hp, d2 = 50000f - e2.Hp;
            Assert.Greater(d0, 10f, "主目标受天雷直击");
            Assert.That(d1 / d0, Is.InRange(0.76f, 0.95f), "第1次连锁跳跃按约 82% 阶梯递减（含感电易伤微调）");
            Assert.AreEqual(0f, d2, 0.01f, "未强化前仅连锁 1 人（共打 2 人），第 3 人不受击");

            // 升级「高压超导」+「紫电雷池」：连锁人数扩至 1+2=3 跳（共打 4 人），100% 无衰减且第 4 跳终点触发紫电雷池麻痹！
            void Grant(Battle bt, string id) { bt.Choices = new[] { Defs.Perk(id) }; bt.Phase = Phase.Choosing; bt.Pick(0); }
            e0.Hp = e1.Hp = e2.Hp = e3.Hp = 50000f;
            e0.VulnT = e1.VulnT = e2.VulnT = e3.VulnT = 0f;
            Grant(b, "gongsun_morph");
            Grant(b, "gongsun_adv");
            b.Slots[0].Unit.Cd = 0.01f;
            b.Events.Clear();
            bool sawThunderPool = false;
            for (int step = 0; step < 40; step++)
            {
                b.Update(0.05f);
                if (b.Events.Any(ev => ev.Type == Ev.Hit && ev.Shot == ShotKind.Lightning && ev.Value >= 100))
                {
                    sawThunderPool = true;
                    break;
                }
            }
            Assert.Greater(50000f - e3.Hp, (50000f - e0.Hp) * 0.95f, "紫电雷池实现全链路无衰减传导并附加终点雷池溅射");
            Assert.Greater(e3.Stun, 0.1f, "终点紫电雷池麻痹敌军");
            Assert.IsTrue(sawThunderPool, "向视图层发出紫电雷池终极特效事件");

            // 2) 单廷珪持续射线折射（「寒晶折射」从主目标身上向周围折射副光束）
            var bBeam = new Battle(88, luMage, Defs.Level(1), lo);
            Grant(bBeam, "shantinggui_morph");
            Put(bBeam, 1, HeroId.ShanTinggui, 1);
            bBeam.Slots[1].Unit.Cd = 0.01f;
            var bt0 = Dummy(bBeam, 0f, 2.0f, 50000f);
            var bt1 = Dummy(bBeam, 1.4f, 2.2f, 50000f);
            for (int step = 0; step < 15; step++) bBeam.Update(0.05f);
            Assert.Greater(50000f - bt0.Hp, 5f);
            Assert.Greater(50000f - bt1.Hp, 3f, "折射副光束同步灼烧/冻结主目标身旁敌军");

            // 3) 辅助职业强化：「广发锦囊」(Count) 扩充祝福目标数，「军师破阵」(Morph) 施法同步给强敌挂易伤
            var bSup = new Battle(99, luMage, Defs.Level(1), lo);
            Grant(bSup, "wuyong_3"); // 广发锦囊 Count +1
            Grant(bSup, "wuyong_morph"); // 军师破阵 Vuln +28%
            Put(bSup, 0, HeroId.WuYong, 1);
            Put(bSup, 1, HeroId.GongSun, 1);
            Put(bSup, 2, HeroId.ShiXiu, 1);
            var boss = Dummy(bSup, 0f, 2.0f, 80000f);
            bSup.Slots[0].Unit.Cd = 0.01f;
            bSup.Update(0.05f);
            Assert.AreEqual(2, bSup.Slots.Count(s => s.Unit != null && s.Unit.Def.Carry && s.Unit.BlessN > 0), "1星吴用点出广发锦囊后一次同时祝福 2 名输出主将");
            Assert.GreaterOrEqual(boss.Vuln, 0.28f - 1e-4f, "军师破阵在施放辅助技时同步给强敌挂上破绽易伤");

            // 4) 阵容条件过滤：纯菜刀无控阵容绝不发废卡「破冰追击」(Eff.Shatter)
            var noCtrlLu = new[] { HeroId.ShiXiu, HeroId.XieZhen, HeroId.LingZhen, HeroId.WuYong };
            var bGate = new Battle(101, noCtrlLu, Defs.Level(1), Loadout.Plain(noCtrlLu)) { Coins = 999999 };
            Assert.IsFalse(bGate.HasControlInLineup());
            for (int r = 0; r < 25 && bGate.Enhance(); r++)
            {
                Assert.IsFalse(bGate.Choices.Any(c => c.Eff == Eff.Shatter), "无减速/控制好汉时绝不污染发牌池刷出破冰追击");
                bGate.Pick(0);
            }
        }

        [Test]
        public void MageAoEAndCrossRoleStarterBalanceHold()
        {
            // 1) 马灵 1 星 0 词条起即为真实「落点金光震波」范围法师，且选「金印扩阵」(Eff.Area) 后真实扩张轰击半径！
            var lu = Meta.Starters; // 解珍 / 孔亮 / 马灵 / 石秀
            var lo = Loadout.Plain(lu);
            lo.Crit = 0f;
            var b = new Battle(33, lu, Defs.Level(1), lo);
            Put(b, 0, HeroId.MaLing, 1);
            b.Slots[0].Unit.Cd = 0.01f;
            var main = new Enemy { Id = 700, Def = Defs.Enemy(EnemyKind.Shield), Hp = 50000f, MaxHp = 50000f, Pos = new V2(0f, 1.8f) };
            var near = new Enemy { Id = 701, Def = Defs.Enemy(EnemyKind.Shield), Hp = 50000f, MaxHp = 50000f, Pos = new V2(0.75f, 1.85f) };
            var outer = new Enemy { Id = 702, Def = Defs.Enemy(EnemyKind.Shield), Hp = 50000f, MaxHp = 50000f, Pos = new V2(1.55f, 1.85f) };
            b.Enemies.AddRange(new[] { main, near, outer });

            for (int step = 0; step < 30 && b.Shots.Count == 0; step++) b.Update(0.02f);
            while (b.Shots.Count > 0) b.Update(0.02f);

            float dMain = 50000f - main.Hp;
            float dNear = 50000f - near.Hp;
            float dOuter = 50000f - outer.Hp;
            Assert.Greater(dMain, 100f, "马灵金砖直击盾兵享受法术破甲克制");
            Assert.That(dNear / dMain, Is.InRange(0.70f, 0.80f), "1星0词条马灵落地金光震波对周围敌军造成 75% 范围法伤");
            Assert.AreEqual(0f, dOuter, 0.01f, "未点范围词条前，1.55格外圈目标暂在初始震波之外");

            // 点出 1 层「金印扩阵」(Area +59%, Dmg +33%) 后，震波半径真实扩张覆盖外圈目标！
            main.Hp = near.Hp = outer.Hp = 50000f;
            main.Pos = new V2(0f, 1.8f);
            near.Pos = new V2(0.75f, 1.85f);
            outer.Pos = new V2(1.55f, 1.85f);
            main.Stun = near.Stun = outer.Stun = 9f;
            b.Choices = new[] { Defs.Perk("maling_1") }; // 金印扩阵
            b.Phase = Phase.Choosing;
            b.Pick(0);
            b.Slots[0].Unit.Cd = 0.01f;
            for (int step = 0; step < 30 && b.Shots.Count == 0; step++) b.Update(0.02f);
            while (b.Shots.Count > 0) b.Update(0.02f);
            Assert.Greater(50000f - outer.Hp, 80f, "升级「金印扩阵」后马灵震波半径真实扩张，外圈盾兵同步吃满金光轰击");

            // 2) 全员单将/马灵扎堆通关保障与同星级初始群伤跨职业平衡（马灵绝不再沦为石秀/孔亮的零头！）
            float SimStage1FixedDmg(HeroId h)
            {
                float sum = 0f;
                var hLu = new[] { h, HeroId.TangLong, HeroId.ShiQian, HeroId.JiangJing };
                for (int seed = 1; seed <= 6; seed++)
                {
                    var bt = new Battle(seed, hLu, Defs.Level(1), Loadout.Plain(hLu));
                    for (int k = 0; k < 5; k++) bt.Slots[k].Unit = new Unit { Hero = h, Star = 1, Cd = 0.2f * k };
                    for (int k = 5; k < 7; k++) bt.Slots[k].Unit = new Unit { Hero = h, Star = 2, Cd = 0.3f * k };
                    int g = 0;
                    while (bt.Phase != Phase.Victory && bt.Phase != Phase.Defeat && g++ < 16000)
                    {
                        if (bt.Phase == Phase.Reels) bt.ApplyReels(bt.SpinReels());
                        bt.Update(1f / 30f);
                        foreach (var ev in bt.Events)
                            if (ev.Type == Ev.Damage && ev.Hero == h) sum += ev.Value;
                        bt.Events.Clear();
                    }
                }
                return sum / 6f;
            }

            float dmgMaLing = SimStage1FixedDmg(HeroId.MaLing);
            float dmgKongLiang = SimStage1FixedDmg(HeroId.KongLiang);
            float dmgShiXiu = SimStage1FixedDmg(HeroId.ShiXiu);
            Assert.That(dmgMaLing / dmgKongLiang, Is.InRange(0.72f, 1.38f),
                $"同星级初始范围位马灵({dmgMaLing:F0})与孔亮({dmgKongLiang:F0})输出必须均衡");
            Assert.That(dmgMaLing / dmgShiXiu, Is.InRange(0.68f, 1.38f),
                $"同星级马灵({dmgMaLing:F0})与石秀({dmgShiXiu:F0})输出必须均衡，杜绝马灵刮痧");

            // 3) 第 1 关极端偏科检验：即便开局召唤几乎全是马灵（马灵 + 3辅助），第 1 关通关率依然稳健 >= 8/10
            int maLingHeavyWins = 0;
            var maLingHeavyLu = new[] { HeroId.MaLing, HeroId.TangLong, HeroId.ShiQian, HeroId.JiangJing };
            for (int seed = 1; seed <= 10; seed++)
            {
                var bt = new Battle(seed, maLingHeavyLu, Defs.Level(1), Loadout.Plain(maLingHeavyLu));
                var bot = new Bot(2);
                int g = 0;
                while (bt.Phase != Phase.Victory && bt.Phase != Phase.Defeat && g++ < 18000)
                {
                    bot.Step(bt, 1f / 30f);
                    bt.Update(1f / 30f);
                    bt.Events.Clear();
                }
                if (bt.Phase == Phase.Victory) maLingHeavyWins++;
            }
            Assert.GreaterOrEqual(maLingHeavyWins, 8, $"第1关即便主C只有马灵也应稳过（盾兵惧法），实际胜场={maLingHeavyWins}/10");
        }

        [Test]
        public void AllHeroRoleAndRarityDpsParityHold()
        {
            // 全 26 位战斗/控制好汉（横跨 R2稀有 / R3史诗 / R4传说 × 射手/炮手/法师/战士/控制）无偏置基准校场 DPS 护栏
            float MeasureBenchDps(HeroId h, V2[] anchors, float simSec = 60f)
            {
                var lu = new[] { h, h, h, h }; // 同名阵容彻底剥离羁绊与多职业加成偏置
                var lo = Loadout.Plain(lu);
                lo.Crit = 0.05f;
                lo.CritDmg = 1.5f;
                var lv = new LevelDef
                {
                    No = 99, Chapter = 1, Index = 1, Name = "基准校场",
                    Waves = 1, BossWave = 0, RageWave = 99,
                    EliteWaves = System.Array.Empty<int>(), PorterWaves = System.Array.Empty<int>(),
                    CountMul = 0.01f, WallHp = 99999f, StartCoins = 0,
                    BuffRole = null, BuffPct = 0f,
                    Troops = new[] { new TroopMix(EnemyKind.Soldier, 1f, 0f, 1) }
                };
                var b = new Battle(17, lu, lv, lo);
                for (int w = 0; w < 600 && !b.AllSpawned; w++) { b.Enemies.Clear(); b.Update(0.05f); }
                b.Enemies.Clear();
                b.Shots.Clear();
                b.Channels.Clear();
                b.Events.Clear();
                b.DamageBy[(int)h] = 0f;

                var dummyDef = new EnemyDef
                {
                    Kind = EnemyKind.Soldier, Name = "木桩", Art = "en_soldier",
                    Hp = 1e7f, Speed = 0f, WallDps = 0f, Size = 1.0f, Coin = 0, Rank = EnemyRank.Minion, StopY = -99f
                };
                var dummies = new Enemy[anchors.Length];
                for (int i = 0; i < anchors.Length; i++)
                {
                    dummies[i] = new Enemy { Id = 5000 + i, Def = dummyDef, Hp = 1e7f, MaxHp = 1e7f, Pos = anchors[i] };
                    b.Enemies.Add(dummies[i]);
                }
                b.Slots[3].Unit = new Unit { Hero = h, Star = 1, Cd = 0.05f };

                int steps = (int)(simSec * 30f);
                for (int s = 0; s < steps; s++)
                {
                    b.Wall = b.WallMax;
                    for (int i = 0; i < dummies.Length; i++)
                    {
                        dummies[i].Pos = anchors[i];
                        if (dummies[i].Hp < 5e6f) dummies[i].Hp = 1e7f;
                    }
                    b.Update(1f / 30f);
                    b.Events.Clear();
                }
                return b.DamageBy[(int)h] / simSec;
            }

            float yFront = Layout.StopY + 0.35f;
            var singleAnchor = new[] { new V2(0f, yFront) };
            var pack5Anchors = new[]
            {
                new V2(0f, yFront),
                new V2(-0.52f, yFront + 0.15f),
                new V2(0.52f, yFront + 0.12f),
                new V2(-0.18f, yFront + 0.72f),
                new V2(0.28f, yFront + 0.85f),
            };

            var sb = new System.Text.StringBuilder("=== ALL 26 COMBAT/CONTROL HEROES DPS PARITY REPORT ===\n");
            var metrics = new System.Collections.Generic.List<(HeroDef d, float single, float wave5, float comp)>();
            foreach (var d in Defs.Heroes)
            {
                if (d.Kind == Role.Support)
                {
                    Assert.AreEqual(0f, d.Dps, $"{d.Name} 辅助职业面板直伤应为0");
                    continue;
                }
                float s1 = MeasureBenchDps(d.Id, singleAnchor);
                float w5 = MeasureBenchDps(d.Id, pack5Anchors);
                float comp = 0.45f * s1 + 0.55f * w5;
                Assert.Greater(s1, 12f, $"{d.Name} 单体实测DPS异常偏低");
                Assert.GreaterOrEqual(w5, s1 * 0.95f, $"{d.Name} 5目标实测DPS不应低于单体");
                metrics.Add((d, s1, w5, comp));
            }
            foreach (var m in metrics.OrderBy(x => x.d.Kind).ThenBy(x => x.d.Rarity).ThenBy(x => x.d.Id))
                sb.AppendLine($"{m.d.Name}\tR{m.d.Rarity}\t{m.d.Role}\tSingle={m.single:F1}\tWave5={m.wave5:F1}\tComp={m.comp:F1}");
            UnityEngine.Debug.Log(sb.ToString());
            Assert.AreEqual(26, metrics.Count, "必须完整覆盖全部 26 位非辅助战斗/控制好汉");

            // 1. 跨职业群伤铁三角（法师 / 炮手 / 战士）同品级横向对齐：R2、R3、R4 每一档内三职业 5 目标群伤均值偏差不超过 ±18%
            var aoeRoles = new[] { Role.Mage, Role.Bomber, Role.Fighter };
            for (int rar = 2; rar <= 4; rar++)
            {
                var roleMeans = aoeRoles.Select(r => (
                    role: r,
                    mean: metrics.Where(m => m.d.Kind == r && m.d.Rarity == rar).Average(m => m.wave5)
                )).ToList();
                float tierCenter = roleMeans.Average(x => x.mean);
                foreach (var rm in roleMeans)
                {
                    Assert.That(rm.mean / tierCenter, Is.InRange(0.82f, 1.18f),
                        $"R{rar} 群伤职业失衡：{Defs.RoleName(rm.role)} 5目标均值({rm.mean:F1})偏离同品级中枢({tierCenter:F1})超过 ±18%");
                }
            }

            // 2. 同品级同职业内部偏差约束：杜绝同档位出现强弱悬殊的废卡或超模卡
            foreach (var grp in metrics.GroupBy(m => (m.d.Kind, m.d.Rarity)))
            {
                if (grp.Count() < 2) continue;
                foreach (var item in grp)
                {
                    if (grp.Key.Kind == Role.Archer)
                    {
                        // 射手含极速单点狙杀（解珍）与双穿毒伤（解宝），综合战术DPS偏差不超过 ±22%
                        float meanComp = grp.Average(x => x.comp);
                        Assert.That(item.comp / meanComp, Is.InRange(0.78f, 1.22f),
                            $"同品级射手偏差过大：{item.d.Name}(R{item.d.Rarity}) 综合DPS={item.comp:F1}，同档均值={meanComp:F1}");
                    }
                    else if (grp.Key.Kind == Role.Control)
                    {
                        // 控制含大阵群控（朱武）与长枪破骑（徐宁），群伤偏差不超过 ±35%
                        float meanW5 = grp.Average(x => x.wave5);
                        Assert.That(item.wave5 / meanW5, Is.InRange(0.65f, 1.35f),
                            $"同品级控制偏差过大：{item.d.Name}(R{item.d.Rarity}) 群伤DPS={item.wave5:F1}，同档均值={meanW5:F1}");
                    }
                    else
                    {
                        float meanW5 = grp.Average(x => x.wave5);
                        Assert.That(item.wave5 / meanW5, Is.InRange(0.82f, 1.18f),
                            $"同品级{Defs.RoleName(grp.Key.Kind)}偏差过大：{item.d.Name}(R{item.d.Rarity}) 群伤DPS={item.wave5:F1}，同档均值={meanW5:F1}");
                    }
                }
            }

            // 3. 跨品级严格单调递增（R2 < R3 < R4）且梯度健康受控（既严禁品级倒挂，也严禁数值膨胀崩坏）
            foreach (var role in new[] { Role.Archer, Role.Bomber, Role.Mage, Role.Fighter, Role.Control })
            {
                float ScoreOf((HeroDef d, float single, float wave5, float comp) m)
                    => role == Role.Archer ? m.single : m.wave5;

                float r2Mean = metrics.Where(m => m.d.Kind == role && m.d.Rarity == 2).Average(ScoreOf);
                float r3Mean = metrics.Where(m => m.d.Kind == role && m.d.Rarity == 3).Average(ScoreOf);
                float r4Mean = metrics.Where(m => m.d.Kind == role && m.d.Rarity == 4).Average(ScoreOf);

                Assert.That(r3Mean / r2Mean, Is.InRange(1.18f, 1.90f),
                    $"{Defs.RoleName(role)} R3({r3Mean:F1})/R2({r2Mean:F1}) 品级梯度越界，实际比值={r3Mean / r2Mean:F2}");
                Assert.That(r4Mean / r3Mean, Is.InRange(1.12f, 1.85f),
                    $"{Defs.RoleName(role)} R4({r4Mean:F1})/R3({r3Mean:F1}) 品级梯度越界，实际比值={r4Mean / r3Mean:F2}");

                float r2Max = metrics.Where(m => m.d.Kind == role && m.d.Rarity == 2).Max(ScoreOf);
                float r4Min = metrics.Where(m => m.d.Kind == role && m.d.Rarity == 4).Min(ScoreOf);
                Assert.Greater(r4Min, r2Max * 1.15f, $"{Defs.RoleName(role)} 最低传说R4({r4Min:F1})必须显著高于最高稀有R2({r2Max:F1})");
            }

            // 4. 职业特色契约：射手在每一品级均为单体点杀之王；控制群伤稳定处在同品级主力群伤的 30%~68% 辅助控场区间
            for (int rar = 2; rar <= 4; rar++)
            {
                float archerSingle = metrics.Where(m => m.d.Kind == Role.Archer && m.d.Rarity == rar).Average(m => m.single);
                foreach (var other in new[] { Role.Bomber, Role.Mage, Role.Fighter, Role.Control })
                {
                    float otherSingle = metrics.Where(m => m.d.Kind == other && m.d.Rarity == rar).Average(m => m.single);
                    Assert.Greater(archerSingle, otherSingle,
                        $"R{rar} 射手单体均值({archerSingle:F1})必须高于 {Defs.RoleName(other)}({otherSingle:F1})，守住单点精英/飞禽核心定位");
                }

                float aoeMean = metrics.Where(m => aoeRoles.Contains(m.d.Kind) && m.d.Rarity == rar).Average(m => m.wave5);
                float ctrlMean = metrics.Where(m => m.d.Kind == Role.Control && m.d.Rarity == rar).Average(m => m.wave5);
                Assert.That(ctrlMean / aoeMean, Is.InRange(0.30f, 0.68f),
                    $"R{rar} 控制职业群伤占比({ctrlMean / aoeMean:P1})偏离 30%~68% 设计带");
            }
        }

        [Test]
        public void ExecAndControlPerksWorkCleanlyWithoutWallGimmicks()
        {
            // 1. 致命收割（原绝地反击）：单英雄独立生效（非跨英雄累加）、满墙血即完整生效，不再挂钩「寨墙危急」
            var lu = new[] { HeroId.MaLing, HeroId.XieZhen };
            var lo = Loadout.Plain(lu);
            lo.Crit = 0f;
            lo.CritDmg = 2f;
            var b = new Battle(20261124, lu, Defs.Level(1), lo);
            for (int w = 0; w < 600 && !b.AllSpawned; w++) { b.Enemies.Clear(); b.Update(0.05f); }
            b.Enemies.Clear();
            b.Wall = b.WallMax; // 满血寨墙（100%）

            var maExec = Defs.PerksOf(HeroId.MaLing, false).Single(p => p.Id.EndsWith("_exec"));
            Assert.AreEqual("致命收割", maExec.Name);
            b.Choices = new[] { maExec };
            b.Phase = Phase.Choosing;
            b.Pick(0);

            Assert.AreEqual(0.85f, b.Stat(HeroId.MaLing, Eff.Exec), 0.001f);
            Assert.AreEqual(0.15f, b.Stat(HeroId.MaLing, Eff.Crit), 0.001f);
            Assert.AreEqual(0f, b.Stat(HeroId.XieZhen, Eff.Exec), 0.001f, "单英雄强化仅作用于本英雄，不跨英雄串算");

            var dummyDef = new EnemyDef
            {
                Kind = EnemyKind.Soldier, Name = "木桩", Art = "en_soldier",
                Hp = 1e6f, Speed = 0f, WallDps = 0f, Size = 1.0f, Coin = 0, Rank = EnemyRank.Minion, StopY = -99f
            };
            var lowHpDummy = new Enemy { Id = 8801, Def = dummyDef, Hp = 300000f, MaxHp = 1000000f, Pos = new V2(0f, 1.5f) };
            b.Enemies.Add(lowHpDummy);
            b.Slots[3].Unit = new Unit { Hero = HeroId.MaLing, Star = 1, Cd = 0.02f };
            for (int i = 0; i < 40; i++) b.Update(0.05f);
            Assert.Greater(b.DamageBy[(int)HeroId.MaLing], Defs.Hero(HeroId.MaLing).Coef * b.HeroAtk(HeroId.MaLing, 1) * 1.70f,
                "满血寨墙下对半血以下敌人完整打出 +85% 致命收割增伤");

            // 2. 控制职业「画地为牢」：全图任意距离（含前场 y=3.5 远离寨墙处）均稳定提供控制延长与 +18% 命中易伤
            var ctrlLu = new[] { HeroId.ZhuWu };
            var ctrlLo = Loadout.Plain(ctrlLu);
            ctrlLo.Crit = 0f;
            ctrlLo.CritDmg = 2f;
            var bCtrl = new Battle(20261125, ctrlLu, Defs.Level(1), ctrlLo);
            for (int w = 0; w < 600 && !bCtrl.AllSpawned; w++) { bCtrl.Enemies.Clear(); bCtrl.Update(0.05f); }
            bCtrl.Enemies.Clear();
            var zhuExec = Defs.PerksOf(HeroId.ZhuWu, false).Single(p => p.Id.EndsWith("_exec"));
            Assert.AreEqual("画地为牢", zhuExec.Name);
            bCtrl.Choices = new[] { zhuExec };
            bCtrl.Phase = Phase.Choosing;
            bCtrl.Pick(0);

            var farEnemy = new Enemy { Id = 8802, Def = dummyDef, Hp = 500000f, MaxHp = 500000f, Pos = new V2(0f, 3.5f) };
            bCtrl.Enemies.Add(farEnemy);
            bCtrl.Slots[3].Unit = new Unit { Hero = HeroId.ZhuWu, Star = 1, Cd = 0.02f };
            for (int i = 0; i < 40; i++) bCtrl.Update(0.05f);

            Assert.Greater(farEnemy.SlowT, 2.5f, "前场远处照常获得完整减速延长，无需怪贴墙");
            Assert.GreaterOrEqual(farEnemy.Vuln, 0.18f, "命中同时挂上 +18% 破阵易伤");
        }

        [Test]
        public void InitialCooldownFloorOverflowSpeedAndXieZhenSnipeHold()
        {
            // 1. 情绪价值与攻速成长空间护栏：全部 32 位好汉 1 级初始冷却严禁低于 2.05s，杜绝开局“1 秒机关枪”透支后期爽感
            foreach (var d in Defs.Heroes)
                Assert.GreaterOrEqual(d.Interval, 2.05f - 1e-4f, $"{d.Name} 1级初始冷却({d.Interval:F2}s)过短，缺乏后期攻速提升空间");

            // 2. 解珍选「双弦猎箭(箭+1)」稳定射 2 箭；三合一奥义觉醒后第 3 轮不再乱洒 3 支散箭，而是精准锁定飞禽/精英追射 1 支放大重箭
            var lu = new[] { HeroId.XieZhen, HeroId.KongLiang, HeroId.MaLing, HeroId.ShiXiu };
            var b = new Battle(11, lu);
            b.Slots[0].Unit = new Unit { Hero = HeroId.XieZhen, Star = 1, Cd = 0f };
            b.Enemies.Add(new Enemy { Id = 901, Def = Defs.Enemy(EnemyKind.Soldier), Hp = 9999f, MaxHp = 9999f, Pos = new V2(0, 1.5f) });
            b.Enemies.Add(new Enemy { Id = 902, Def = Defs.Enemy(EnemyKind.Hawk), Hp = 9999f, MaxHp = 9999f, Pos = new V2(1.2f, 2.8f) });
            b.Choices = new[] { Defs.Perk("xiezhen_0") }; b.Phase = Phase.Choosing; b.Pick(0);
            b.Choices = new[] { Defs.Perk("xiezhen_morph") }; b.Phase = Phase.Choosing; b.Pick(0);
            b.Choices = new[] { Defs.Perk("xiezhen_adv") }; b.Phase = Phase.Choosing; b.Pick(0);
            Assert.IsTrue(b.IsAwakened(HeroId.XieZhen));

            b.Shots.Clear();
            b.Slots[0].Unit.Casts = 0;
            b.Slots[0].Unit.Cd = 0f;
            b.Update(0.02f);
            Assert.AreEqual(2, b.Shots.Count, "选箭+1后普通轮次严格射出2支箭");

            b.Shots.Clear();
            b.Slots[0].Unit.Casts = 2;
            b.Slots[0].Unit.Cd = 0f;
            b.Update(0.02f);
            Assert.AreEqual(3, b.Shots.Count, "觉醒第3轮为2支普箭+1支穿林破甲重矢，不冒出4~5支散箭");
            var heavy = b.Shots.OrderByDescending(s => s.Scale).First();
            Assert.Greater(heavy.Scale, 1.35f);
            Assert.AreEqual(902, heavy.TargetId, "穿林重矢优先狙杀飞禽鹰隼");

            // 3. 极端叠攻速保底护栏（0.55s）与 1:1 无损转伤害：8 倍攻速不鬼畜抽搐，溢出攻速全额化为重箭伤害
            var speedLu = new[] { HeroId.XieZhen, HeroId.XieZhen, HeroId.XieZhen, HeroId.XieZhen };
            var lo1 = Loadout.Plain(speedLu); lo1.Crit = 0f; lo1.AllSpeed = 2.0f; // 2.20 / 2.0 = 1.10s
            var lo2 = Loadout.Plain(speedLu); lo2.Crit = 0f; lo2.AllSpeed = 8.0f; // 2.20 / 8.0 = 0.275s -> 锁在 0.55s，单发伤害×2
            var b1 = new Battle(1, speedLu, Defs.Level(1), lo1);
            var b2 = new Battle(1, speedLu, Defs.Level(1), lo2);
            b1.Enemies.Clear(); b2.Enemies.Clear();
            b1.Enemies.Add(new Enemy { Id = 1, Def = Defs.Enemy(EnemyKind.Boss), Hp = 1e8f, MaxHp = 1e8f, Pos = new V2(0, 1f) });
            b2.Enemies.Add(new Enemy { Id = 1, Def = Defs.Enemy(EnemyKind.Boss), Hp = 1e8f, MaxHp = 1e8f, Pos = new V2(0, 1f) });
            b1.Slots[0].Unit = new Unit { Hero = HeroId.XieZhen, Star = 1, Cd = 0f };
            b2.Slots[0].Unit = new Unit { Hero = HeroId.XieZhen, Star = 1, Cd = 0f };
            b1.Update(0.01f); b2.Update(0.01f);
            float realCd2 = b2.Slots[0].Unit.Cd / b2.HeroSpeedMul(HeroId.XieZhen);
            Assert.AreEqual(Defs.MinAtkInterval, realCd2, 0.02f, "超高攻速真实间隔锁定在保底 0.55s");
            Assert.AreEqual(2.0f, b2.Shots[0].Damage / b1.Shots[0].Damage, 0.02f, "超出保底的2倍溢出攻速1:1无损折算为2倍单发伤害");
        }
    }
}
