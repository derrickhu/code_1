using System;
using System.Collections;
using System.Collections.Generic;
using UnityEngine;
using UnityEngine.Networking;

namespace Liangshan
{
    /// <summary>
    /// 按需加载的大图：角色帧（hero_x / en_x 一人一包）和战场背景（一图一包）。
    /// 源图在 Assets/ArtCdn，打包时按原尺寸、ASTC 4x4 做成 AssetBundle 放进 StreamingAssets/art，
    /// 微信包里从 CDN 拉；地址含 StreamingAssets，插件会缓存到本地，文件名带内容 hash，换图就换地址。
    /// 编辑器里直接读 Assets/ArtCdn，不用打包。
    /// </summary>
    public sealed class ArtPack : MonoBehaviour
    {
        const string Dir = "art";
        const string EditorDir = "Assets/ArtCdn";
        const int MaxLoading = 4;
        const int Tries = 3;
        const float RetryCooldown = 8f;

        sealed class Pack
        {
            public string Name, File;
            public long Bytes;
            public bool Loaded, Loading, Prefetched;
            public float RetryAt;
            public UnityWebRequest Req;
            public readonly Dictionary<string, Sprite> Sprites = new Dictionary<string, Sprite>();
            public readonly Dictionary<string, Sprite[]> Clips = new Dictionary<string, Sprite[]>();
            public readonly List<Action> Waiters = new List<Action>();
#if UNITY_EDITOR
            public readonly List<string> Paths = new List<string>();
#endif
        }

        static readonly Dictionary<string, Pack> Packs = new Dictionary<string, Pack>();
        static readonly Queue<Pack> Waiting = new Queue<Pack>();
        static readonly Queue<Pack> PrefetchQueue = new Queue<Pack>();
        static ArtPack _i;
        static bool _indexed;
        static int _loading;
        static bool _prefetching;

        /// <summary>每次有包装上或卸掉就加一，界面据此判断要不要换图。</summary>
        public static int Version { get; private set; }

        public static void Init(GameObject host)
        {
            if (_i == null) _i = host.AddComponent<ArtPack>();
            Index();
        }

        /// <summary>图名归哪个包：去掉帧号和动作名。hero_lu_walk_3 → hero_lu，battle_bg_ch2 → battle_bg_ch2。</summary>
        public static string PackOf(string sprite)
        {
            int u = sprite.LastIndexOf('_');
            if (u > 0 && u < sprite.Length - 1 && IsDigits(sprite, u + 1)) sprite = sprite.Substring(0, u);
            if (sprite.EndsWith("_walk")) return sprite.Substring(0, sprite.Length - 5);
            if (sprite.EndsWith("_fly")) return sprite.Substring(0, sprite.Length - 4);
            return sprite;
        }

        static bool IsDigits(string s, int from)
        {
            for (int i = from; i < s.Length; i++)
                if (s[i] < '0' || s[i] > '9') return false;
            return true;
        }

        public static bool Has(string pack)
        {
            Index();
            return pack != null && Packs.ContainsKey(pack);
        }

        /// <summary>不归包管的名字也算就绪。</summary>
        public static bool Ready(string pack) => !Has(pack) || Packs[pack].Loaded;

        public static bool Ready(IEnumerable<string> packs)
        {
            foreach (var p in packs)
                if (!Ready(p)) return false;
            return true;
        }

        /// <summary>这张图在某个包里（不管装没装上）。</summary>
        public static bool Owns(string sprite) => Has(PackOf(sprite));

        public static Sprite Find(string sprite)
        {
            if (!Packs.TryGetValue(PackOf(sprite), out var p) || !p.Loaded) return null;
            return p.Sprites.TryGetValue(sprite, out var s) ? s : null;
        }

        /// <summary>name_0..N 一段帧；包没装上返回 null。</summary>
        public static Sprite[] Clip(string pack, string prefix)
        {
            if (!Packs.TryGetValue(pack, out var p) || !p.Loaded) return null;
            if (p.Clips.TryGetValue(prefix, out var c)) return c;
            var list = new List<Sprite>();
            for (int i = 0; i < 16 && p.Sprites.TryGetValue(prefix + "_" + i, out var s); i++) list.Add(s);
            return p.Clips[prefix] = list.ToArray();
        }

        public static void Ensure(string pack, Action done = null) => Ensure(new[] { pack }, done);

        /// <summary>把这些包装上，全部结束（含失败）后回调；已经都在就当场回调。</summary>
        public static void Ensure(IEnumerable<string> packs, Action done = null)
        {
            Index();
            var need = new List<Pack>();
            foreach (var n in packs)
                if (n != null && Packs.TryGetValue(n, out var p) && !p.Loaded && !need.Contains(p)) need.Add(p);
            need.RemoveAll(p => !p.Loading && Time.realtimeSinceStartup < p.RetryAt);
            if (need.Count == 0)
            {
                done?.Invoke();
                return;
            }
            int left = need.Count;
            foreach (var p in need)
            {
                p.Waiters.Add(() => { if (--left == 0) done?.Invoke(); });
                if (!p.Loading) Start(p);
            }
        }

        /// <summary>这些包的下载进度 0..1，按字节加权。</summary>
        public static float Progress(IEnumerable<string> packs)
        {
            double all = 0, got = 0;
            foreach (var n in packs)
            {
                if (n == null || !Packs.TryGetValue(n, out var p)) continue;
                double b = Math.Max(1, p.Bytes);
                all += b;
                if (p.Loaded) got += b;
                else if (p.Req != null) got += b * p.Req.downloadProgress;
            }
            return all <= 0 ? 1f : (float)(got / all);
        }

        /// <summary>除了这些都卸掉。调用前先把用到旧图的物体销毁。</summary>
        public static void Keep(ICollection<string> keep)
        {
            bool any = false;
            foreach (var p in Packs.Values)
            {
                if (!p.Loaded || keep.Contains(p.Name)) continue;
                p.Loaded = false;
                p.Sprites.Clear();
                p.Clips.Clear();
                any = true;
            }
            if (!any) return;
            Version++;
            if (_i) _i.StartCoroutine(Sweep());
        }

        static IEnumerator Sweep()
        {
            yield return null;
            Resources.UnloadUnusedAssets();
        }

        /// <summary>空闲时把下一局要用的包先下到本地缓存，不占显存。只在微信里有意义。</summary>
        public static void Prefetch(IEnumerable<string> packs)
        {
#if !UNITY_EDITOR && !UNITY_STANDALONE
            Index();
            foreach (var n in packs)
                if (n != null && Packs.TryGetValue(n, out var p) && !p.Loaded && !p.Loading && !p.Prefetched && !PrefetchQueue.Contains(p))
                    PrefetchQueue.Enqueue(p);
            if (!_prefetching && _i) _i.StartCoroutine(PrefetchLoop());
#endif
        }

        static IEnumerator PrefetchLoop()
        {
            _prefetching = true;
            while (PrefetchQueue.Count > 0)
            {
                while (_loading > 0) yield return null;
                var p = PrefetchQueue.Dequeue();
                if (p.Loaded || p.Loading || p.Prefetched) continue;
                using (var req = UnityWebRequest.Get(Url(p.File)))
                {
                    yield return req.SendWebRequest();
                    p.Prefetched = req.result == UnityWebRequest.Result.Success;
                }
            }
            _prefetching = false;
        }

        static void Start(Pack p)
        {
            p.Loading = true;
#if UNITY_EDITOR
            LoadInEditor(p);
#else
            if (_loading < MaxLoading && _i) _i.StartCoroutine(Load(p));
            else Waiting.Enqueue(p);
#endif
        }

        static void Finish(Pack p, bool ok)
        {
            p.Loading = false;
            p.Req = null;
            p.Loaded = ok;
            if (!ok) p.RetryAt = Time.realtimeSinceStartup + RetryCooldown;
            Version++;
            var w = p.Waiters.ToArray();
            p.Waiters.Clear();
            foreach (var a in w) a();
        }

#if UNITY_EDITOR
        static void LoadInEditor(Pack p)
        {
            foreach (var path in p.Paths)
            {
                var s = UnityEditor.AssetDatabase.LoadAssetAtPath<Sprite>(path);
                if (s) p.Sprites[s.name] = s;
            }
            Finish(p, p.Sprites.Count > 0);
        }
#endif

        static IEnumerator Load(Pack p)
        {
            _loading++;
            bool ok = false;
            for (int t = 0; t < Tries && !ok; t++)
            {
                if (t > 0) yield return new WaitForSecondsRealtime(t);
                using (var req = UnityWebRequestAssetBundle.GetAssetBundle(Url(p.File)))
                {
                    p.Req = req;
                    yield return req.SendWebRequest();
                    p.Req = null;
                    if (req.result != UnityWebRequest.Result.Success)
                    {
                        Debug.LogWarning("[图包] " + p.Name + " 没拉下来：" + req.error);
                        continue;
                    }
                    var ab = DownloadHandlerAssetBundle.GetContent(req);
                    if (ab == null) continue;
                    var all = ab.LoadAllAssetsAsync<Sprite>();
                    yield return all;
                    foreach (var o in all.allAssets)
                        if (o is Sprite s) p.Sprites[s.name] = s;
                    // 图已经在显存里了，包本身的数据不用留。
                    ab.Unload(false);
                    ok = p.Sprites.Count > 0;
                }
            }
            _loading--;
            Finish(p, ok);
            if (Waiting.Count > 0 && _i) _i.StartCoroutine(Load(Waiting.Dequeue()));
        }

        static string Url(string file)
        {
#if UNITY_STANDALONE
            string root = Application.streamingAssetsPath;
            if (!root.Contains("://")) root = "file://" + root;
            return root.TrimEnd('/') + "/" + Dir + "/" + file;
#else
            return CloudConfig.AssetCdn.TrimEnd('/') + "/StreamingAssets/" + Dir + "/" + file;
#endif
        }

        static void Index()
        {
            if (_indexed) return;
            _indexed = true;
#if UNITY_EDITOR
            if (!System.IO.Directory.Exists(EditorDir)) return;
            foreach (var f in System.IO.Directory.GetFiles(EditorDir))
            {
                if (f.EndsWith(".meta")) continue;
                string sprite = System.IO.Path.GetFileNameWithoutExtension(f);
                string name = PackOf(sprite);
                if (!Packs.TryGetValue(name, out var p)) Packs[name] = p = new Pack { Name = name };
                p.Paths.Add(f.Replace('\\', '/'));
            }
#else
            var txt = Resources.Load<TextAsset>("ArtPacks");
            if (txt == null)
            {
                Debug.LogError("缺 Resources/ArtPacks，角色帧和战场背景都出不来");
                return;
            }
            foreach (var line in txt.text.Split('\n'))
            {
                var c = line.Trim().Split('\t');
                if (c.Length < 3) continue;
                long.TryParse(c[2], out long bytes);
                Packs[c[0]] = new Pack { Name = c[0], File = c[1], Bytes = bytes };
            }
#endif
        }
    }
}
