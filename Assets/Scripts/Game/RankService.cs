using System;
using System.Collections;
using System.Collections.Generic;
using Liangshan.Sim;
using UnityEngine;
using UnityEngine.Networking;

namespace Liangshan
{
    /// <summary>
    /// 排行榜数据服务：对接 CloudBase 云函数 cunkou-api（/rank/submit · /rank/list · /rank/like），
    /// 并支持微信小游戏真实昵称与头像静默同步、原生授权按钮及跨域名安全头像加载缓存。
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
            public int gender;
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
            public int gender;
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
            public string Avatar;
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
        static string _lastSubmittedName = "";
        static string _lastSubmittedAvatar = "";
        static bool _wxSilentChecked;
        static readonly Dictionary<string, CloudRow[]> RemoteCache = new Dictionary<string, CloudRow[]>();
        static readonly Dictionary<string, int> RemoteMyRank = new Dictionary<string, int>();
        static readonly Dictionary<string, float> RemoteFetchedAt = new Dictionary<string, float>();
        static readonly Dictionary<string, Sprite> AvatarSprites = new Dictionary<string, Sprite>();
        static readonly Dictionary<string, List<Action<Sprite>>> AvatarPending = new Dictionary<string, List<Action<Sprite>>>();

        public static event Action ProfileSynced;

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

        void Awake()
        {
            DouyinBridge.WxUserSynced -= ApplyWeChatUser;
            DouyinBridge.WxUserSynced += ApplyWeChatUser;
        }

        public static string NormalizeAvatarUrl(string u)
        {
            if (string.IsNullOrWhiteSpace(u)) return "";
            string v = u.Trim();
            if (v.StartsWith("http://thirdwx.qlogo.cn/", StringComparison.OrdinalIgnoreCase) ||
                v.StartsWith("http://wx.qlogo.cn/", StringComparison.OrdinalIgnoreCase) ||
                v.StartsWith("http://mmbiz.qpic.cn/", StringComparison.OrdinalIgnoreCase))
            {
                v = "https://" + v.Substring("http://".Length);
            }
            return v.StartsWith("https://", StringComparison.OrdinalIgnoreCase) ? v : "";
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

        public static string MyAvatar => Profile.S != null ? NormalizeAvatarUrl(Profile.S.Avatar) : "";
        public static int MyGender => Profile.S != null ? Profile.S.Gender : 0;
        public static bool HasWeChatProfile => Profile.S != null && (Profile.S.WxAuthed > 0 || !string.IsNullOrEmpty(MyAvatar));

        /// <summary>若玩家此前在微信已授权过 scope.userInfo，静默拉取最新微信昵称与头像，不主动弹隐私窗。</summary>
        public static void TrySilentSyncWeChatProfile()
        {
            if (Profile.Volatile || Application.isBatchMode || _wxSilentChecked) return;
            _wxSilentChecked = true;
            _ = It;
            DouyinBridge.WxTrySilentUserInfo();
        }

        public static void ApplyWeChatUser(DouyinBridge.WxUserPayload u)
        {
            if (u == null || Profile.S == null) return;
            var s = Profile.S;
            bool changed = false;
            string nick = (u.nickName ?? "").Trim();
            if (!string.IsNullOrEmpty(nick))
            {
                bool isGenericWx = nick == "微信用户";
                if (!isGenericWx || string.IsNullOrWhiteSpace(s.Nick))
                {
                    if (s.Nick != nick) { s.Nick = nick; changed = true; }
                }
            }
            string av = NormalizeAvatarUrl(u.avatarUrl);
            if (!string.IsNullOrEmpty(av) && s.Avatar != av)
            {
                s.Avatar = av;
                changed = true;
            }
            if ((u.gender == 1 || u.gender == 2) && s.Gender != u.gender)
            {
                s.Gender = u.gender;
                changed = true;
            }
            if (s.WxAuthed == 0)
            {
                s.WxAuthed = 1;
                changed = true;
            }
            if (!changed) return;
            Profile.Save();
            RemoteFetchedAt.Clear();
            SubmitIfChanged(true);
            ProfileSynced?.Invoke();
        }

        public static void LoadAvatar(string rawUrl, Action<Sprite> done)
        {
            string url = NormalizeAvatarUrl(rawUrl);
            if (string.IsNullOrEmpty(url) || Profile.Volatile || Application.isBatchMode)
            {
                done?.Invoke(null);
                return;
            }
            if (AvatarSprites.TryGetValue(url, out var cached) && cached != null)
            {
                done?.Invoke(cached);
                return;
            }
            if (AvatarPending.TryGetValue(url, out var waiters))
            {
                if (done != null) waiters.Add(done);
                return;
            }
            var list = new List<Action<Sprite>>();
            if (done != null) list.Add(done);
            AvatarPending[url] = list;

            if (DouyinBridge.IsWeChat && !Application.isEditor)
            {
                DouyinBridge.WxLoadAvatarBytes(url, bytes =>
                {
                    if (bytes != null && bytes.Length > 16)
                    {
                        var spr = BytesToSprite(bytes);
                        if (spr != null)
                        {
                            FinishAvatar(url, spr);
                            return;
                        }
                    }
                    It.StartCoroutine(It.CoDownloadAvatar(url));
                });
                return;
            }
            It.StartCoroutine(It.CoDownloadAvatar(url));
        }

        static Sprite BytesToSprite(byte[] bytes)
        {
            try
            {
                var tex = new Texture2D(2, 2, TextureFormat.RGBA32, false);
                if (!tex.LoadImage(bytes, true))
                {
                    Destroy(tex);
                    return null;
                }
                tex.wrapMode = TextureWrapMode.Clamp;
                tex.filterMode = FilterMode.Bilinear;
                return Sprite.Create(tex, new Rect(0, 0, tex.width, tex.height), new Vector2(0.5f, 0.5f), 100f);
            }
            catch (Exception)
            {
                return null;
            }
        }

        IEnumerator CoDownloadAvatar(string url)
        {
            Sprite spr = null;
            using (var req = UnityWebRequest.Get(url))
            {
                req.timeout = 8;
                yield return req.SendWebRequest();
                if (req.result == UnityWebRequest.Result.Success)
                {
                    var data = req.downloadHandler != null ? req.downloadHandler.data : null;
                    if (data != null && data.Length > 16)
                        spr = BytesToSprite(data);
                }
            }
            FinishAvatar(url, spr);
        }

        static void FinishAvatar(string url, Sprite spr)
        {
            if (spr != null) AvatarSprites[url] = spr;
            if (!AvatarPending.TryGetValue(url, out var waiters)) return;
            AvatarPending.Remove(url);
            for (int i = 0; i < waiters.Count; i++) waiters[i]?.Invoke(spr);
        }

        static bool NeedsSubmit(SaveData s, int power)
        {
            if (s.Cleared != _lastSubmittedStage) return true;
            if (Mathf.Abs(power - _lastSubmittedPower) >= 20) return true;
            if (_lastSubmittedName != MyName) return true;
            if (_lastSubmittedAvatar != MyAvatar) return true;
            return false;
        }

        public static void SubmitIfChanged(bool force = false)
        {
            if (Profile.Volatile || Application.isBatchMode || Profile.S == null) return;
            var s = Profile.S;
            int p = Meta.TeamPower(s);
            if (!force && !NeedsSubmit(s, p)) return;
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

            string subName = MyName;
            string subAvatar = MyAvatar;
            var body = new SubmitBody
            {
                name = subName,
                avatar = subAvatar,
                gender = MyGender,
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
                _lastSubmittedName = subName;
                _lastSubmittedAvatar = subAvatar;
                RemoteFetchedAt.Clear();
            }
        }

        public static void FetchBoard(int board, bool forceRefresh, Action<List<Entry>, int> done)
        {
            string key = board == BoardPower ? "power" : "stage";
            if (Profile.Volatile || Application.isBatchMode)
            {
                var local = BuildMerged(board, Array.Empty<CloudRow>(), 1, true, out int myRank);
                done?.Invoke(local, myRank);
                return;
            }
            TrySilentSyncWeChatProfile();
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
                if (NeedsSubmit(s, p))
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
                Avatar = MyAvatar,
                Gender = MyGender,
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
                TieOrder = int.MaxValue,
            };
        }

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
                    string cAv = NormalizeAvatarUrl(c.avatar);
                    if (string.IsNullOrEmpty(me.Avatar) && !string.IsNullOrEmpty(cAv))
                    {
                        me.Avatar = cAv;
                        if (Profile.S != null && string.IsNullOrEmpty(Profile.S.Avatar)) Profile.S.Avatar = cAv;
                    }
                    if (me.Gender == 0 && (c.gender == 1 || c.gender == 2)) me.Gender = c.gender;
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
                    Avatar = NormalizeAvatarUrl(c.avatar),
                    Gender = c.gender == 1 || c.gender == 2 ? c.gender : 0,
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
