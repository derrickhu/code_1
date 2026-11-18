using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Text;
using UnityEditor;
using UnityEngine;

namespace Liangshan.EditorTools
{
    /// <summary>
    /// 把 Assets/ArtCdn 的大图按 ArtPack.PackOf 分组打成 AssetBundle（一角色一包、一背景一包），
    /// 放进 StreamingAssets/art，并在 Resources/ArtPacks.txt 写清单（包名、带 hash 的文件名、字节数）。
    /// 包里的贴图用 ArtImporter 给的平台设置：微信 ASTC 4x4、原尺寸。Mac 包和微信包各打各的。
    /// </summary>
    public static class ArtPacks
    {
        public const string Src = "Assets/ArtCdn";
        const string Out = "Assets/StreamingAssets/art";
        const string IndexPath = "Assets/Resources/ArtPacks.txt";

        [MenuItem("村口大战外星人/打图包（当前平台）")]
        public static void BuildActive() => Build(EditorUserBuildSettings.activeBuildTarget);

        /// <summary>返回图包总字节数；失败抛异常。</summary>
        public static long Build(BuildTarget target)
        {
            var groups = new SortedDictionary<string, List<string>>();
            foreach (var f in Directory.GetFiles(Src))
            {
                if (f.EndsWith(".meta") || Path.GetFileName(f).StartsWith(".")) continue;
                string pack = ArtPack.PackOf(Path.GetFileNameWithoutExtension(f));
                if (!groups.TryGetValue(pack, out var list)) groups[pack] = list = new List<string>();
                list.Add(f.Replace('\\', '/'));
            }
            foreach (var pack in groups.Keys)
                if ((pack.StartsWith("hero_") || pack.StartsWith("en_")) && !File.Exists("Assets/Resources/Art/" + pack + ".png"))
                    Debug.LogWarning("[图包] " + pack + " 没有立绘 Resources/Art/" + pack + ".png，包没到时没东西顶");

            var builds = groups.Select(g => new AssetBundleBuild
            {
                assetBundleName = g.Key.ToLowerInvariant(),
                assetNames = g.Value.ToArray(),
                addressableNames = g.Value.Select(Path.GetFileNameWithoutExtension).ToArray(),
            }).ToArray();

            string cache = Path.Combine("Library", "ArtPacks", target.ToString());
            Directory.CreateDirectory(cache);
            var manifest = BuildPipeline.BuildAssetBundles(cache, builds,
                BuildAssetBundleOptions.ChunkBasedCompression | BuildAssetBundleOptions.AppendHashToAssetBundleName, target);
            if (manifest == null) throw new System.Exception("[图包] BuildAssetBundles 失败");

            var byLower = groups.Keys.ToDictionary(k => k.ToLowerInvariant());
            if (Directory.Exists(Out)) Directory.Delete(Out, true);
            if (File.Exists(Out + ".meta")) File.Delete(Out + ".meta");
            Directory.CreateDirectory(Out);
            var index = new StringBuilder();
            long total = 0;
            foreach (var file in manifest.GetAllAssetBundles().OrderBy(x => x))
            {
                int u = file.LastIndexOf('_');
                string pack = byLower[file.Substring(0, u)];
                string dst = Path.Combine(Out, file);
                File.Copy(Path.Combine(cache, file), dst, true);
                long bytes = new FileInfo(dst).Length;
                total += bytes;
                index.Append(pack).Append('\t').Append(file).Append('\t').Append(bytes).Append('\n');
            }
            File.WriteAllText(IndexPath, index.ToString());
            AssetDatabase.Refresh();
            Debug.Log($"[图包] {target}：{groups.Count} 个包，共 {total / 1048576f:0.0} MB → {Out}");
            return total;
        }
    }
}
