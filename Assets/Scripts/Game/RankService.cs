using System;
using System.Collections;
using System.Collections.Generic;
using Liangshan.Sim;
using UnityEngine;

namespace Liangshan
{
    /// <summary>
    /// 排行榜数据服务：对接 CloudBase 云函数 cunkou-api（/rank/submit · /rank/list · /rank/like）。
    /// 榜面只含云端真实玩家和本机存档，不塞预设对手。弱网时沿用上次拉到的真榜，拉不到就只显示自己。
    /// </summary>
    public sealed class RankService : MonoBehaviour
    {
        public const int BoardStage = 0;
        public const int BoardPower = 1;
        public const int BoardArena = 2;
        public const int BoardEscort = 3;

        [Serializable]
        public sealed class CloudRow
        {
            public string userId;
            public string name;
            public string avatar;
            public int cleared;
            public int stars;
            public int power;
            public int hero;
            public int lordLv;
            public int equipSum;
            public int[] lineup;
            public int[] lineupLv;
            public int likes;
            public bool me;
        }

        [Serializable]
        sealed class CloudListData
        {
            public string board;
            public CloudRow[] top;
            public int rank;
            public int total;
        }

        [Serializable]
        sealed class CloudListReply
        {
            public bool ok;
            public CloudListData data;
        }

        [Serializable]
        sealed class SubmitBody
        {
            public string name;
            public string avatar;
            public int cleared;
            public int stars;
            public int power;
            public int hero;
            public int lordLv;
            public int equipSum;
            public int[] lineup;
            public int[] lineupLv;
        }

        [Serializable]
        sealed class QueryBody
        {
            public string board;
        }

        [Serializable]
        sealed class LikeBody
        {
            public string targetId;
        }

        public sealed class Entry
        {
            public string Id;
            public string Name;
            public int Gender; // 0 无, 1 男(♂), 2 女(♀)
            public int Cleared;
            public int Stars;
            public int Power;
            public HeroId Hero;
            public int LordLv;
            public int EquipSum;
            public HeroId[] Lineup;
            public int[] LineupLv;
            public int Likes;
            public bool IsMe;
            public bool IsCloud;
            public int TieOrder;
        }

        static RankService _it;
        static int _lastSubmittedStage = -1;
        static int _lastSubmittedPower = -1;
        static readonly Dictionary<string, CloudRow[]> RemoteCache = new Dictionary<string, CloudRow[]>();
        static readonly Dictionary<string, int> RemoteMyRank = new Dictionary<string, int>();
        static readonly Dictionary<string, float> RemoteFetchedAt = new Dictionary<string, float>();

        static RankService It
        {
            get
            {
                if (_it != null) return _it;
                var go = new GameObject("RankService");
                DontDestroyOnLoad(go);
                _it = go.AddComponent<RankService>();
                return _it;
            }
        }

        public static string MyName
        {
            get
            {
                var s = Profile.S;
                if (s != null && !string.IsNullOrWhiteSpace(s.Nick)) return s.Nick.Trim();
                string id = Backend.UserId;
                if (string.IsNullOrEmpty(id)) id = SystemInfo.deviceUniqueIdentifier ?? "liangshan";
                uint h = 2166136261;
                foreach (var ch in id) h = (h ^ ch) * 16777619;
                return "幸福村·" + (1000 + h % 9000);
            }
        }

        public static void SubmitIfChanged(bool force = false)
        {
            if (Profile.Volatile || Application.isBatchMode || Profile.S == null) return;
            var s = Profile.S;
            int p = Meta.TeamPower(s);
            if (!force && s.Cleared == _lastSubmittedStage && Mathf.Abs(p - _lastSubmittedPower) < 20) return;
            It.StartCoroutine(It.CoSubmit(s, p));
        }

        IEnumerator CoSubmit(SaveData s, int power)
        {
            var lu = Meta.Lineup(s);
            int[] luIds = new int[lu.Length];
            int[] luLvs = new int[lu.Length];
            for (int i = 0; i < lu.Length; i++)
            {
                luIds[i] = (int)lu[i];
                luLvs[i] = Mathf.Max(1, s.HeroLv[(int)lu[i]]);
            }
            int eqSum = 0;
            for (int i = 0; i < s.EquipLv.Length; i++) eqSum += s.EquipLv[i];
            int lordLv = Meta.LordLevel(s, out _);

            var body = new SubmitBody
            {
                name = MyName,
                avatar = "",
                cleared = s.Cleared,
                stars = Meta.TotalStars(s),
                power = power,
                hero = (int)Meta.StrongestHero(s),
                lordLv = lordLv,
                equipSum = eqSum,
                lineup = luIds,
                lineupLv = luLvs,
            };
            long status = 0;
            yield return Backend.CallRaw(CloudConfig.RankSubmitPath, JsonUtility.ToJson(body), (st, _, __) => status = st);
            if (status == 200)
            {
                _lastSubmittedStage = s.Cleared;
                _lastSubmittedPower = power;
            }
        }

        public static void FetchBoard(int board, bool forceRefresh, Action<List<Entry>, int> done)
        {
            string key = board == BoardPower ? "power" : "stage";
            // 截图 / 单测不走网络：只放本机存档，名次按「榜上只有自己」算。
            if (Profile.Volatile || Application.isBatchMode)
            {
                var local = BuildMerged(board, Array.Empty<CloudRow>(), 1, true, out int myRank);
                done?.Invoke(local, myRank);
                return;
            }
            if (!forceRefresh && RemoteCache.TryGetValue(key, out var cached) &&
                RemoteFetchedAt.TryGetValue(key, out float at) && Time.realtimeSinceStartup - at < 25f)
            {
                RemoteMyRank.TryGetValue(key, out int cachedRank);
                var merged = BuildMerged(board, cached, cachedRank, true, out int myRank);
                done?.Invoke(merged, myRank);
                return;
            }
            It.StartCoroutine(It.CoFetch(board, key, done));
        }

        IEnumerator CoFetch(int board, string key, Action<List<Entry>, int> done)
        {
            var s = Profile.S;
            if (s != null)
            {
                int p = Meta.TeamPower(s);
                if (s.Cleared != _lastSubmittedStage || Mathf.Abs(p - _lastSubmittedPower) >= 20)
                    yield return CoSubmit(s, p);
            }

            long status = 0;
            string text = null;
            yield return Backend.CallRaw(CloudConfig.RankListPath, JsonUtility.ToJson(new QueryBody { board = key }),
                (st, txt, _) => { status = st; text = txt; });

            CloudRow[] rows = null;
            int serverRank = 0;
            bool known = false;
            if (status == 200 && !string.IsNullOrEmpty(text))
            {
                try
                {
                    var reply = JsonUtility.FromJson<CloudListReply>(text);
                    if (reply != null && reply.ok && reply.data != null)
                    {
                        rows = reply.data.top ?? Array.Empty<CloudRow>();
                        serverRank = reply.data.rank;
                        known = true;
                        RemoteCache[key] = rows;
                        RemoteMyRank[key] = serverRank;
                        RemoteFetchedAt[key] = Time.realtimeSinceStartup;
                    }
                }
                catch (Exception) { rows = null; known = false; }
            }
            if (!known && RemoteCache.TryGetValue(key, out var old))
            {
                rows = old;
                RemoteMyRank.TryGetValue(key, out serverRank);
                known = true;
            }
            var list = BuildMerged(board, rows, serverRank, known, out int myRank);
            done?.Invoke(list, myRank);
        }

        public static Entry BuildMyEntry()
        {
            var s = Profile.S;
            var lu = Meta.Lineup(s);
            int[] lvs = new int[lu.Length];
            for (int i = 0; i < lu.Length; i++) lvs[i] = Mathf.Max(1, s.HeroLv[(int)lu[i]]);
            int eqSum = 0;
            for (int i = 0; i < s.EquipLv.Length; i++) eqSum += s.EquipLv[i];
            int extraLikes = PlayerPrefs.GetInt("cunkou_my_likes_bonus", 0);
            return new Entry
            {
                Id = "me",
                Name = MyName,
                Gender = 0,
                Cleared = s.Cleared,
                Stars = Meta.TotalStars(s),
                Power = Meta.TeamPower(s),
                Hero = Meta.StrongestHero(s),
                LordLv = Meta.LordLevel(s, out _),
                EquipSum = eqSum,
                Lineup = lu,
                LineupLv = lvs,
                Likes = extraLikes,
                IsMe = true,
                IsCloud = true,
                TieOrder = int.MaxValue, // 同分让先写上云端的玩家排前
            };
        }

        /// <summary>
        /// 云端行 + 本机存档。known 为 false 表示这次没拉到榜（也没有缓存），名次返回 -1，榜面留空。
        /// 云端只回前 50 名；本机成绩排不进这 50 时，名次用服务端算好的 rank，不把自己插进榜面。
        /// </summary>
        static List<Entry> BuildMerged(int board, CloudRow[] cloud, int serverRank, bool known, out int myRank)
        {
            if (!known || cloud == null)
            {
                myRank = -1;
                return new List<Entry>();
            }

            var all = new List<Entry>(cloud.Length + 1);
            var me = BuildMyEntry();
            int remoteMyLikes = 0;
            int cloudCount = 0;

            for (int i = 0; i < cloud.Length; i++)
            {
                var c = cloud[i];
                if (c == null) continue;
                cloudCount++;
                if (c.me || (!string.IsNullOrEmpty(Backend.UserId) && c.userId == Backend.UserId))
                {
                    remoteMyLikes = Mathf.Max(remoteMyLikes, c.likes);
                    continue;
                }
                HeroId hero = (HeroId)Mathf.Clamp(c.hero, 0, Defs.HeroCount - 1);
                HeroId[] lu = ParseLineup(c.lineup, hero);
                int[] lvs = ParseLineupLv(c.lineupLv, lu.Length, Mathf.Max(1, c.cleared / 2 + 1));
                int bonus = LocalLikeBonus("c_" + c.userId);
                all.Add(new Entry
                {
                    Id = "c_" + c.userId,
                    Name = string.IsNullOrEmpty(c.name) ? "热心村民" : c.name,
                    Gender = 0,
                    Cleared = c.cleared,
                    Stars = c.stars,
                    Power = Mathf.Max(0, c.power),
                    Hero = hero,
                    LordLv = Mathf.Max(1, c.lordLv),
                    EquipSum = c.equipSum,
                    Lineup = lu,
                    LineupLv = lvs,
                    Likes = Mathf.Max(0, c.likes) + bonus,
                    IsMe = false,
                    IsCloud = true,
                    TieOrder = i,
                });
            }

            if (remoteMyLikes > me.Likes) me.Likes = remoteMyLikes;
            all.Add(me);

            if (board == BoardPower)
            {
                all.Sort((a, b) =>
                {
                    int cmp = b.Power.CompareTo(a.Power);
                    if (cmp != 0) return cmp;
                    cmp = b.Cleared.CompareTo(a.Cleared);
                    return cmp != 0 ? cmp : a.TieOrder.CompareTo(b.TieOrder);
                });
            }
            else
            {
                all.Sort((a, b) =>
                {
                    int cmp = b.Cleared.CompareTo(a.Cleared);
                    if (cmp != 0) return cmp;
                    cmp = b.Stars.CompareTo(a.Stars);
                    if (cmp != 0) return cmp;
                    cmp = b.Power.CompareTo(a.Power);
                    return cmp != 0 ? cmp : a.TieOrder.CompareTo(b.TieOrder);
                });
            }

            int localRank = 1;
            for (int i = 0; i < all.Count; i++)
                if (all[i].IsMe) { localRank = i + 1; break; }

            if (cloudCount >= 50 && localRank > 50)
            {
                all.RemoveAll(e => e.IsMe);
                myRank = serverRank > 0 ? serverRank : 0;
            }
            else myRank = localRank;

            if (all.Count > 50) all.RemoveRange(50, all.Count - 50);
            return all;
        }

        static HeroId[] ParseLineup(int[] raw, HeroId fallback)
        {
            if (raw != null && raw.Length == 4)
            {
                var r = new HeroId[4];
                for (int i = 0; i < 4; i++) r[i] = (HeroId)Mathf.Clamp(raw[i], 0, Defs.HeroCount - 1);
                return r;
            }
            return new[] { fallback, Meta.Starters[0], Meta.Starters[1], Meta.Starters[3] };
        }

        static int[] ParseLineupLv(int[] raw, int len, int fallbackLv)
        {
            var r = new int[len];
            for (int i = 0; i < len; i++)
                r[i] = raw != null && i < raw.Length && raw[i] > 0 ? raw[i] : fallbackLv;
            return r;
        }

        static string LikeDayKey => "cunkou_liked_" + Profile.Today;

        public static bool HasLikedToday(string entryId)
        {
            if (string.IsNullOrEmpty(entryId)) return false;
            string raw = PlayerPrefs.GetString(LikeDayKey, "");
            return raw.Contains("|" + entryId + "|");
        }

        static int LocalLikeBonus(string entryId) => PlayerPrefs.GetInt("cunkou_lk_" + entryId, 0);

        public static bool TryLike(Entry e, out List<Item> reward)
        {
            reward = null;
            if (e == null || HasLikedToday(e.Id)) return false;

            string cur = PlayerPrefs.GetString(LikeDayKey, "|");
            PlayerPrefs.SetString(LikeDayKey, cur + e.Id + "|");
            if (e.IsMe)
                PlayerPrefs.SetInt("cunkou_my_likes_bonus", PlayerPrefs.GetInt("cunkou_my_likes_bonus", 0) + 1);
            else
                PlayerPrefs.SetInt("cunkou_lk_" + e.Id, LocalLikeBonus(e.Id) + 1);
            e.Likes++;

            var s = Profile.S;
            if (s.RankLikes < Meta.RankLikesMax)
            {
                s.RankLikes++;
                reward = new List<Item> { new Item(Cur.Ingot, 10), new Item(Cur.Copper, 200) };
                foreach (var it in reward) Meta.Give(s, it);
                Profile.Save();
            }
            else PlayerPrefs.Save();

            if (e.IsCloud && !e.IsMe && e.Id.StartsWith("c_") && !Profile.Volatile && !Application.isBatchMode)
            {
                string uid = e.Id.Substring(2);
                It.StartCoroutine(It.CoLike(uid));
            }
            return true;
        }

        IEnumerator CoLike(string targetUserId)
        {
            yield return Backend.CallRaw(CloudConfig.RankLikePath, JsonUtility.ToJson(new LikeBody { targetId = targetUserId }), (_, __, ___) => { });
        }
    }
}
