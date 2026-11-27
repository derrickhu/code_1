using System;
using System.Collections.Generic;

namespace Liangshan.Sim
{
    /// <summary>
    /// 鼓励多玩的成长活动：七日目标、招募冲刺、每日福利。
    /// 奖励以招募令为主，卡关的玩家多出征几次也能攒券招人、升级再来。
    /// </summary>
    public static partial class Meta
    {
        public static int DayNo(SaveData s, int today) => s.Born == 0 ? 1 : today - (s.Born - 1) + 1;

        // ---------------- 七日目标 ----------------

        public enum Goal { Cleared, Life, Pulls, Owned, LvSum, LvMax, EquipSum, Talent, Chests }

        public sealed class GoalDef
        {
            public int Day;
            public string Name;
            public Goal Kind;
            public Act Act;
            public int Need;
            public Item[] Reward;
        }

        public const int SevenDays = 7, SevenPoints = 10;

        static GoalDef G(int day, string name, Goal kind, int need, Item a, Item b, Act act = Act.Battle) =>
            new GoalDef { Day = day, Name = name, Kind = kind, Act = act, Need = need, Reward = new[] { a, b } };

        static GoalDef L(int day, string name, Act act, int need, Item a, Item b) => G(day, name, Goal.Life, need, a, b, act);

        static Item Tk(int n) => new Item(Cur.Token, n);
        static Item Ig(int n) => new Item(Cur.Ingot, n);
        static Item Cp(int n) => new Item(Cur.Copper, n);
        static Item Fe(int n) => new Item(Cur.Iron, n);

        /// <summary>每天 5 个：通关进度、出征量、招募量、养成各一。数字按正常推进的玩家定，多玩的提前做完。</summary>
        public static readonly GoalDef[] Goals =
        {
            G(1, "主线通关第 3 关", Goal.Cleared, 3, Tk(2), Ig(50)),
            L(1, "累计守村 5 次", Act.Battle, 5, Tk(1), Cp(2000)),
            G(1, "累计摇人 10 次", Goal.Pulls, 10, Tk(2), Ig(50), Act.Recruit),
            L(1, "升级乡亲 3 次", Act.HeroUp, 3, Tk(1), Cp(2000)),
            G(1, "获得 5 个关卡宝箱", Goal.Chests, 5, Tk(1), Fe(20)),

            G(2, "主线通关第 6 关", Goal.Cleared, 6, Tk(2), Ig(80)),
            L(2, "累计获胜 12 次", Act.Win, 12, Tk(1), Fe(30)),
            L(2, "强化装备 10 次", Act.Forge, 10, Tk(1), Cp(3000)),
            L(2, "累计消耗体力 100 点", Act.Stamina, 100, Tk(2), new Item(Cur.Stamina, 30)),
            G(2, "点亮潜能 10 个", Goal.Talent, 10, Tk(1), Cp(3000), Act.Talent),

            G(3, "主线通关第 10 关", Goal.Cleared, 10, Tk(3), Ig(100)),
            L(3, "累计守村 25 次", Act.Battle, 25, Tk(2), Cp(4000)),
            G(3, "累计摇人 25 次", Goal.Pulls, 25, Tk(2), new Item(Cur.AnyShard, 10), Act.Recruit),
            G(3, "结识 8 位乡亲", Goal.Owned, 8, Tk(1), Ig(80), Act.Recruit),
            G(3, "获得 20 个关卡宝箱", Goal.Chests, 20, Tk(1), new Item(Cur.GearBox, 1)),

            G(4, "主线通关第 13 关", Goal.Cleared, 13, Tk(3), Ig(100)),
            L(4, "累计消耗体力 250 点", Act.Stamina, 250, Tk(2), new Item(Cur.Stamina, 30)),
            G(4, "装备总等级 40", Goal.EquipSum, 40, Tk(1), Fe(40), Act.Forge),
            G(4, "乡亲等级合计 40", Goal.LvSum, 40, Tk(2), Cp(5000), Act.HeroUp),
            L(4, "扫荡 5 次", Act.Sweep, 5, Tk(1), new Item(Cur.Silk, 300)),

            G(5, "主线通关第 16 关", Goal.Cleared, 16, Tk(3), Ig(120)),
            G(5, "累计摇人 45 次", Goal.Pulls, 45, Tk(2), new Item(Cur.AnyShard, 15), Act.Recruit),
            L(5, "累计守村 45 次", Act.Battle, 45, Tk(2), Cp(5000)),
            G(5, "任一乡亲达到 8 级", Goal.LvMax, 8, Tk(1), Ig(100), Act.HeroUp),
            L(5, "累计获胜 35 次", Act.Win, 35, Tk(1), Fe(40)),

            G(6, "主线通关第 18 关", Goal.Cleared, 18, Tk(3), Ig(150)),
            L(6, "累计消耗体力 450 点", Act.Stamina, 450, Tk(2), new Item(Cur.Stamina, 40)),
            G(6, "结识 11 位乡亲", Goal.Owned, 11, Tk(2), Ig(100), Act.Recruit),
            G(6, "点亮潜能 40 个", Goal.Talent, 40, Tk(1), Cp(6000), Act.Talent),
            G(6, "获得 40 个关卡宝箱", Goal.Chests, 40, Tk(1), new Item(Cur.GearBox, 1)),

            G(7, "主线通关第 20 关", Goal.Cleared, 20, Tk(4), Ig(200)),
            G(7, "累计摇人 70 次", Goal.Pulls, 70, Tk(3), new Item(Cur.AnyShard, 20), Act.Recruit),
            G(7, "乡亲等级合计 80", Goal.LvSum, 80, Tk(2), Cp(8000), Act.HeroUp),
            G(7, "装备总等级 80", Goal.EquipSum, 80, Tk(2), Fe(60), Act.Forge),
            L(7, "累计守村 70 次", Act.Battle, 70, Tk(2), Cp(8000)),
        };

        /// <summary>七日积分宝箱，最后一箱送传说好汉。</summary>
        public static readonly int[] SevenBoxNeed = { 50, 100, 175, 250, 350 };
        public const HeroId SevenHero = HeroId.GuanSheng;
        public const int SevenHeroShards = 30;

        public static Item[] SevenBoxReward(int k)
        {
            switch (k)
            {
                case 0: return new[] { Tk(3), Ig(100) };
                case 1: return new[] { Tk(5), new Item(Cur.GearBox, 1) };
                case 2: return new[] { Tk(5), new Item(Cur.Tome, 2), Ig(150) };
                case 3: return new[] { Tk(8), new Item(Cur.Meteor, 3) };
                default: return new[] { new Item(Cur.Shard, SevenHeroShards, SevenHero), Tk(10) };
            }
        }

        public static int GoalValue(SaveData s, GoalDef g)
        {
            switch (g.Kind)
            {
                case Goal.Cleared: return s.Cleared;
                case Goal.Life: return s.Life[(int)g.Act];
                case Goal.Pulls: return s.Pulls;
                case Goal.Talent: return s.Talent;
                case Goal.Owned:
                {
                    int n = 0;
                    foreach (var lv in s.HeroLv) if (lv > 0) n++;
                    return n;
                }
                case Goal.LvSum:
                {
                    int n = 0;
                    foreach (var lv in s.HeroLv) n += lv;
                    return n;
                }
                case Goal.LvMax:
                {
                    int n = 0;
                    foreach (var lv in s.HeroLv) n = Math.Max(n, lv);
                    return n;
                }
                case Goal.EquipSum:
                {
                    int n = 0;
                    foreach (var lv in s.EquipLv) n += lv;
                    return n;
                }
                default:
                {
                    int n = 0;
                    foreach (var bits in s.LevelChest)
                        for (int k = 0; k < 3; k++) if ((bits & (1 << k)) != 0) n++;
                    return n;
                }
            }
        }

        public static bool GoalOpen(SaveData s, int i, int today) => Goals[i].Day <= DayNo(s, today);
        public static bool GoalDone(SaveData s, int i) => GoalValue(s, Goals[i]) >= Goals[i].Need;
        public static bool GoalTaken(SaveData s, int i) => (s.SevenGot & (1L << i)) != 0;
        public static bool CanGoal(SaveData s, int i, int today) => GoalOpen(s, i, today) && GoalDone(s, i) && !GoalTaken(s, i);

        public static Item[] ClaimGoal(SaveData s, int i, int today)
        {
            if (!CanGoal(s, i, today)) return null;
            s.SevenGot |= 1L << i;
            foreach (var it in Goals[i].Reward) Give(s, it);
            return Goals[i].Reward;
        }

        public static int SevenPointsOf(SaveData s)
        {
            int n = 0;
            for (int i = 0; i < Goals.Length; i++) if (GoalTaken(s, i)) n += SevenPoints;
            return n;
        }

        public static bool CanSevenBox(SaveData s, int k) => (s.SevenBox & (1 << k)) == 0 && SevenPointsOf(s) >= SevenBoxNeed[k];

        /// <summary>开七日宝箱。最后一箱的好汉没拥有就直接入伙（返回 unlock），有了给碎片。</summary>
        public static Item[] OpenSevenBox(SaveData s, int k, out HeroId? unlock)
        {
            unlock = null;
            if (!CanSevenBox(s, k)) return null;
            s.SevenBox |= 1 << k;
            var r = SevenBoxReward(k);
            var got = new System.Collections.Generic.List<Item>();
            foreach (var it in r)
            {
                if (it.Cur == Cur.Shard && s.HeroLv[(int)it.Hero] == 0)
                {
                    s.HeroLv[(int)it.Hero] = 1;
                    unlock = it.Hero;
                    continue;
                }
                Give(s, it);
                got.Add(it);
            }
            return got.ToArray();
        }

        /// <summary>全部目标和宝箱都领完后收起入口。</summary>
        public static bool SevenFinished(SaveData s) => s.SevenBox == (1 << SevenBoxNeed.Length) - 1;

        public static int SevenBadge(SaveData s, int today)
        {
            int n = 0;
            for (int i = 0; i < Goals.Length; i++) if (CanGoal(s, i, today)) n++;
            for (int k = 0; k < SevenBoxNeed.Length; k++) if (CanSevenBox(s, k)) n++;
            return n;
        }

        public static int DayBadge(SaveData s, int day, int today)
        {
            int n = 0;
            for (int i = 0; i < Goals.Length; i++) if (Goals[i].Day == day && CanGoal(s, i, today)) n++;
            return n;
        }

        // ---------------- 招募冲刺 ----------------

        public const int SprintDays = 7;

        public static int SprintRoundOf(SaveData s, int today) => Math.Max(0, DayNo(s, today) - 1) / SprintDays;

        public static int SprintDaysLeft(SaveData s, int today) => SprintDays - Math.Max(0, DayNo(s, today) - 1) % SprintDays;

        static void RollSprint(SaveData s, int today)
        {
            int round = SprintRoundOf(s, today) + 1;
            if (s.SprintRound == round) return;
            s.SprintRound = round;
            s.SprintTier = s.SprintTask = 0;
            for (int i = 0; i < s.SprintAct.Length; i++) s.SprintAct[i] = 0;
        }

        /// <summary>本轮累计招募次数的档位：每档都返招募令，越往后越多。</summary>
        public static readonly int[] SprintTierNeed = { 10, 20, 30, 45, 60, 80, 100, 130 };

        public static Item[] SprintTierReward(int k)
        {
            switch (k)
            {
                case 0: return new[] { Tk(2), Ig(50) };
                case 1: return new[] { Tk(3), new Item(Cur.AnyShard, 10) };
                case 2: return new[] { Tk(3), Ig(100) };
                case 3: return new[] { Tk(4), new Item(Cur.GearBox, 1) };
                case 4: return new[] { Tk(5), new Item(Cur.AnyShard, 20) };
                case 5: return new[] { Tk(6), Ig(200) };
                case 6: return new[] { Tk(8), new Item(Cur.Tome, 2) };
                default: return new[] { Tk(10), new Item(Cur.AnyShard, 40) };
            }
        }

        /// <summary>冲刺任务：出征、获胜、消耗体力都送招募令，输了也算出征。</summary>
        public static readonly TaskDef[] SprintTasks =
        {
            new TaskDef { Name = "本轮守村 5 次", Kind = Act.Battle, Need = 5, Reward = Tk(1) },
            new TaskDef { Name = "本轮守村 15 次", Kind = Act.Battle, Need = 15, Reward = Tk(2) },
            new TaskDef { Name = "本轮守村 30 次", Kind = Act.Battle, Need = 30, Reward = Tk(3) },
            new TaskDef { Name = "本轮守村 50 次", Kind = Act.Battle, Need = 50, Reward = Tk(5) },
            new TaskDef { Name = "本轮获胜 10 次", Kind = Act.Win, Need = 10, Reward = Tk(2) },
            new TaskDef { Name = "本轮获胜 30 次", Kind = Act.Win, Need = 30, Reward = Tk(4) },
            new TaskDef { Name = "本轮消耗体力 50 点", Kind = Act.Stamina, Need = 50, Reward = Tk(1) },
            new TaskDef { Name = "本轮消耗体力 150 点", Kind = Act.Stamina, Need = 150, Reward = Tk(2) },
            new TaskDef { Name = "本轮消耗体力 300 点", Kind = Act.Stamina, Need = 300, Reward = Tk(4) },
            new TaskDef { Name = "本轮消耗体力 500 点", Kind = Act.Stamina, Need = 500, Reward = Tk(6) },
        };

        public static int SprintPulls(SaveData s) => s.SprintAct[(int)Act.Recruit];

        public static bool CanSprintTier(SaveData s, int k) => (s.SprintTier & (1 << k)) == 0 && SprintPulls(s) >= SprintTierNeed[k];

        public static Item[] ClaimSprintTier(SaveData s, int k)
        {
            if (!CanSprintTier(s, k)) return null;
            s.SprintTier |= 1 << k;
            var r = SprintTierReward(k);
            foreach (var it in r) Give(s, it);
            return r;
        }

        public static int SprintTaskCount(SaveData s, int i) => Math.Min(SprintTasks[i].Need, s.SprintAct[(int)SprintTasks[i].Kind]);
        public static bool SprintTaskTaken(SaveData s, int i) => (s.SprintTask & (1 << i)) != 0;
        public static bool CanSprintTask(SaveData s, int i) => !SprintTaskTaken(s, i) && s.SprintAct[(int)SprintTasks[i].Kind] >= SprintTasks[i].Need;

        public static Item? ClaimSprintTask(SaveData s, int i)
        {
            if (!CanSprintTask(s, i)) return null;
            s.SprintTask |= 1 << i;
            Give(s, SprintTasks[i].Reward);
            return SprintTasks[i].Reward;
        }

        public static int SprintTierBadge(SaveData s)
        {
            int n = 0;
            for (int k = 0; k < SprintTierNeed.Length; k++) if (CanSprintTier(s, k)) n++;
            return n;
        }

        public static int SprintTaskBadge(SaveData s)
        {
            int n = 0;
            for (int i = 0; i < SprintTasks.Length; i++) if (CanSprintTask(s, i)) n++;
            return n;
        }

        // ---------------- 每日福利 ----------------

        public static Item[] WelfareReward(SaveData s) => new[]
        {
            Tk(1), new Item(Cur.Stamina, 20), Cp(1000 + 100 * s.Cleared),
        };

        public static bool CanWelfare(SaveData s, int today) => s.WelfareDay != today + 1;

        public static bool CanAdWelfare(SaveData s, int today) => !CanWelfare(s, today) && s.AdWelfareDay != today + 1;

        public static Item[] ClaimWelfare(SaveData s, int today)
        {
            if (!CanWelfare(s, today)) return null;
            var r = WelfareReward(s);
            s.WelfareDay = today + 1;
            foreach (var it in r) Give(s, it);
            return r;
        }

        public static Item[] ClaimAdWelfare(SaveData s, int today)
        {
            if (!CanAdWelfare(s, today)) return null;
            var r = WelfareReward(s);
            s.AdWelfareDay = today + 1;
            foreach (var it in r) Give(s, it);
            return r;
        }

        // ---------------- 微信游戏圈（入圈领奖 + 累计链式解锁 + 今日互动日常，全部对齐 wx.getGameClubData 官方可查字段） ----------------

        public enum ClubMetric { Join, TotalLikes, TotalComments, DayLikes, DayComments, DayPosts }

        public sealed class ClubTaskDef
        {
            public int Id;
            public string Name;
            public ClubMetric Metric;
            public int Need;
            public bool Daily;
            public int PreId;
            public Item[] Rewards;
        }

        public static readonly ClubTaskDef[] ClubTasks =
        {
            new ClubTaskDef
            {
                Id = 0, Name = "加入微信游戏圈", Metric = ClubMetric.Join, Need = 1, Daily = false, PreId = -1,
                Rewards = new[] { Ig(200), Tk(3), new Item(Cur.GearBox, 1) },
            },
            new ClubTaskDef
            {
                Id = 1, Name = "累计点赞帖子 1 次", Metric = ClubMetric.TotalLikes, Need = 1, Daily = false, PreId = -1,
                Rewards = new[] { Tk(1), new Item(Cur.Page, 20), new Item(Cur.Stamina, 20) },
            },
            new ClubTaskDef
            {
                Id = 2, Name = "累计评论帖子 1 次", Metric = ClubMetric.TotalComments, Need = 1, Daily = false, PreId = -1,
                Rewards = new[] { Tk(1), new Item(Cur.Silk, 240), new Item(Cur.Iron, 25) },
            },
            new ClubTaskDef
            {
                Id = 3, Name = "累计点赞帖子 3 次", Metric = ClubMetric.TotalLikes, Need = 3, Daily = false, PreId = 1,
                Rewards = new[] { new Item(Cur.Hammer, 2), new Item(Cur.Page, 35), new Item(Cur.Iron, 30) },
            },
            new ClubTaskDef
            {
                Id = 4, Name = "累计点赞帖子 5 次", Metric = ClubMetric.TotalLikes, Need = 5, Daily = false, PreId = 3,
                Rewards = new[] { Tk(3), new Item(Cur.GearBox, 2), new Item(Cur.Meteor, 3) },
            },
            new ClubTaskDef
            {
                Id = 5, Name = "累计评论帖子 3 次", Metric = ClubMetric.TotalComments, Need = 3, Daily = false, PreId = 2,
                Rewards = new[] { new Item(Cur.Hammer, 2), new Item(Cur.Refine, 3), new Item(Cur.Silk, 360) },
            },
            new ClubTaskDef
            {
                Id = 6, Name = "累计评论帖子 5 次", Metric = ClubMetric.TotalComments, Need = 5, Daily = false, PreId = 5,
                Rewards = new[] { new Item(Cur.Tome, 2), Tk(5), new Item(Cur.Hammer, 3) },
            },
            new ClubTaskDef
            {
                Id = 7, Name = "今日点赞帖子 1 次", Metric = ClubMetric.DayLikes, Need = 1, Daily = true, PreId = 0,
                Rewards = new[] { new Item(Cur.Stamina, 20), Ig(30), new Item(Cur.Page, 10) },
            },
            new ClubTaskDef
            {
                Id = 8, Name = "今日评论帖子 1 次", Metric = ClubMetric.DayComments, Need = 1, Daily = true, PreId = 0,
                Rewards = new[] { new Item(Cur.Stamina, 20), Ig(40), new Item(Cur.Silk, 120) },
            },
            new ClubTaskDef
            {
                Id = 9, Name = "今日发表帖子 1 次", Metric = ClubMetric.DayPosts, Need = 1, Daily = true, PreId = 0,
                Rewards = new[] { Tk(1), new Item(Cur.Hammer, 1), new Item(Cur.Iron, 20) },
            },
        };

        public static void EnsureClubDay(SaveData s, int today)
        {
            if (s.ClubSyncDay == today + 1) return;
            s.ClubSyncDay = today + 1;
            s.ClubDayLikes = s.ClubDayComments = s.ClubDayPosts = 0;
            s.ClubDailyGot = 0;
        }

        public static bool SyncClubData(SaveData s, int today, bool joined, int dayLikes, int dayComments, int dayPosts)
        {
            EnsureClubDay(s, today);
            bool changed = false;
            if ((joined || dayLikes > 0 || dayComments > 0 || dayPosts > 0) && s.ClubJoined == 0)
            {
                s.ClubJoined = 1;
                changed = true;
            }
            if (dayLikes > s.ClubDayLikes)
            {
                s.ClubTotalLikes += dayLikes - s.ClubDayLikes;
                s.ClubDayLikes = dayLikes;
                changed = true;
            }
            if (dayComments > s.ClubDayComments)
            {
                s.ClubTotalComments += dayComments - s.ClubDayComments;
                s.ClubDayComments = dayComments;
                changed = true;
            }
            if (dayPosts > s.ClubDayPosts)
            {
                s.ClubTotalPosts += dayPosts - s.ClubDayPosts;
                s.ClubDayPosts = dayPosts;
                changed = true;
            }
            return changed;
        }

        /// <summary>仅限编辑器与微信开发者工具调试验收：模拟一次游戏圈真实数据返回（加圈 + 当日点赞/评论/发帖各 +1）。</summary>
        public static void SimulateClubStep(SaveData s, int today)
        {
            EnsureClubDay(s, today);
            SyncClubData(s, today, true, s.ClubDayLikes + 1, s.ClubDayComments + 1, s.ClubDayPosts + 1);
        }

        public static bool ClubOnceTaken(SaveData s, int id) => (s.ClubOnceGot & (1 << id)) != 0;

        public static bool ClubTaskTaken(SaveData s, int today, int i)
        {
            EnsureClubDay(s, today);
            var t = ClubTasks[i];
            return t.Daily ? (s.ClubDailyGot & (1 << t.Id)) != 0 : ClubOnceTaken(s, t.Id);
        }

        public static bool ClubTaskUnlocked(SaveData s, int i)
        {
            var t = ClubTasks[i];
            return t.PreId < 0 || ClubOnceTaken(s, t.PreId);
        }

        public static int ClubTaskValue(SaveData s, int today, int i)
        {
            EnsureClubDay(s, today);
            switch (ClubTasks[i].Metric)
            {
                case ClubMetric.Join: return s.ClubJoined != 0 ? 1 : 0;
                case ClubMetric.TotalLikes: return s.ClubTotalLikes;
                case ClubMetric.TotalComments: return s.ClubTotalComments;
                case ClubMetric.DayLikes: return s.ClubDayLikes;
                case ClubMetric.DayComments: return s.ClubDayComments;
                case ClubMetric.DayPosts: return s.ClubDayPosts;
                default: return 0;
            }
        }

        public static bool CanClaimClubTask(SaveData s, int today, int i) =>
            i >= 0 && i < ClubTasks.Length
            && ClubTaskUnlocked(s, i)
            && !ClubTaskTaken(s, today, i)
            && ClubTaskValue(s, today, i) >= ClubTasks[i].Need;

        public static List<Item> ClaimClubTask(SaveData s, int today, int i)
        {
            if (!CanClaimClubTask(s, today, i)) return null;
            var t = ClubTasks[i];
            if (t.Daily) s.ClubDailyGot |= 1 << t.Id;
            else s.ClubOnceGot |= 1 << t.Id;
            var got = new List<Item>(t.Rewards.Length);
            foreach (var it in t.Rewards)
            {
                Give(s, it);
                got.Add(it);
            }
            return got;
        }

        public static int ClubClaimableCount(SaveData s, int today)
        {
            EnsureClubDay(s, today);
            int n = 0;
            for (int i = 0; i < ClubTasks.Length; i++)
                if (CanClaimClubTask(s, today, i)) n++;
            return n;
        }

        public static bool ClubBadge(SaveData s, int today) =>
            ClubClaimableCount(s, today) > 0 || (s.ClubJoined == 0 && s.ClubSeen == 0);

        // ---------------- 抖音侧边栏复访与桌面快捷有礼 ----------------

        public static readonly Item[] DySidebarRewards =
        {
            Ig(30), new Item(Cur.Stamina, 20), Cp(500),
        };

        public static readonly Item[] DyShortcutRewards =
        {
            Ig(60), Tk(2),
        };

        public static bool CanDySidebar(SaveData s, int today) => s != null && s.DySidebarDay != today + 1;

        public static Item[] ClaimDySidebar(SaveData s, int today)
        {
            if (!CanDySidebar(s, today)) return null;
            s.DySidebarDay = today + 1;
            foreach (var it in DySidebarRewards) Give(s, it);
            return DySidebarRewards;
        }

        public static bool CanDyShortcut(SaveData s) => s != null && s.DyShortcutGot == 0;

        public static Item[] ClaimDyShortcut(SaveData s)
        {
            if (!CanDyShortcut(s)) return null;
            s.DyShortcutGot = 1;
            foreach (var it in DyShortcutRewards) Give(s, it);
            return DyShortcutRewards;
        }

        // ---------------- 抖音订阅消息状态记录（纯服务提醒，不挂钩道具奖励） ----------------

        public static bool HasDySubPatrolToday(SaveData s, int today) => s != null && s.DySubPatrolDay == today + 1;
        public static bool HasDySubSignToday(SaveData s, int today) => s != null && s.DySubSignDay == today + 1;

        public static void MarkDySubscribed(SaveData s, string scene, int today)
        {
            if (s == null) return;
            if (scene == "patrol") s.DySubPatrolDay = today + 1;
            else if (scene == "sign") s.DySubSignDay = today + 1;
            else
            {
                s.DySubPatrolDay = today + 1;
                s.DySubSignDay = today + 1;
            }
            s.DySubTotal++;
        }
    }
}
