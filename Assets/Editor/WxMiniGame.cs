using System;
using System.IO;
using System.Reflection;
using UnityEditor;
using UnityEngine;

namespace Liangshan.EditorTools
{
    /// <summary>
    /// 命令行：-executeMethod Liangshan.EditorTools.WxMiniGame.Export
    /// 产物在 wechat-minigame/minigame/，用微信开发者工具打开这一层。
    /// </summary>
    public static class WxMiniGame
    {
        const string ConfigPath = "Assets/WX-WASM-SDK-V2/Editor/MiniGameConfig.asset";

        [MenuItem("村口大战外星人/导出微信小游戏")]
        public static void Export()
        {
            int code = ExportCore() ? 0 : 1;
            if (Application.isBatchMode)
                EditorApplication.Exit(code);
        }

        public static bool ExportCore()
        {
            try
            {
                ActivateWeChat();
                EnsureConfig();
                long packs = ArtPacks.Build(EditorUserBuildSettings.activeBuildTarget);
                Debug.Log($"[微信] 图包 {packs / 1048576f:0.0} MB。首包和图包都在 CDN：导出后跑 node tools/upload_cdn.mjs。");
                Debug.Log("[微信] 开始转换，第一次编 WASM 要比较久。");
                object result = Invoke("WeChatWASM.WXConvertCore", "DoExport", new object[] { true });
                bool ok = result != null && result.ToString() == "SUCCEED";
                Debug.Log("[微信] 转换结果：" + (result ?? "没找到转换接口"));
                bool exported = ok && Directory.Exists(Path.Combine(ProjectRoot, "wechat-minigame", "minigame"));
                if (exported) ApplyLoadingCover();
                return exported && CheckGameJs();
            }
            catch (Exception e)
            {
                Debug.LogError("[微信] 转换失败：" + e);
                return false;
            }
        }

        static string ProjectRoot => Path.GetFullPath(Path.Combine(Application.dataPath, ".."));

        static void EnsureConfig()
        {
            var config = AssetDatabase.LoadAssetAtPath<ScriptableObject>(ConfigPath);
            if (config == null)
                throw new Exception("缺少 " + ConfigPath);
            var so = new SerializedObject(config);
            Set(so, "ProjectConf.projectName", CloudConfig.GameKey);
            Set(so, "ProjectConf.Appid", CloudConfig.AppId);
            Set(so, "ProjectConf.CDN", CloudConfig.AssetCdn);
            Set(so, "ProjectConf.relativeDST", "wechat-minigame");
            Set(so, "ProjectConf.DST", Path.Combine(ProjectRoot, "wechat-minigame"));
            // 0 = 首包走 CDN。wasm（约 3MB）+ 首包（约 26MB）已经顶满代码包 30MB，再放进 data-package 分包传不上去。
            Set(so, "ProjectConf.assetLoadType", 0);
            // 压缩的首包启动时会被插件解压后整份写进用户文件缓存。保持不压缩，CDN 上放 .bin.txt。
            Set(so, "ProjectConf.compressDataPackage", false);
            Set(so, "ProjectConf.Orientation", 0);
            so.ApplyModifiedPropertiesWithoutUndo();
            EditorUtility.SetDirty(config);
            AssetDatabase.SaveAssets();
        }

        /// <summary>微信默认封面是橙色进度页。导出后换成首页底图，印上游戏名和健康游戏忠告。</summary>
        static void ApplyLoadingCover()
        {
            string script = Path.Combine(ProjectRoot, "tools", "wechat_loading_cover.py");
            var psi = new System.Diagnostics.ProcessStartInfo
            {
                FileName = "python3",
                Arguments = "\"" + script + "\"",
                WorkingDirectory = ProjectRoot,
                UseShellExecute = false,
                RedirectStandardOutput = true,
                RedirectStandardError = true,
            };
            using (var p = System.Diagnostics.Process.Start(psi))
            {
                string stdout = p.StandardOutput.ReadToEnd();
                string stderr = p.StandardError.ReadToEnd();
                p.WaitForExit();
                if (!string.IsNullOrEmpty(stdout)) Debug.Log("[微信] " + stdout.Trim());
                if (p.ExitCode != 0)
                    Debug.LogError("[微信] 启动封面没换上：" + stderr);
            }
        }

        /// <summary>
        /// 首包固定走 CDN：webgl 目录下的 {md5}.webgl.data.unityweb.bin.txt，地址是 DATA_CDN 加文件名。
        /// 图包和曲子在 StreamingAssets，同一条上传脚本一起传。
        /// </summary>
        static bool CheckGameJs()
        {
            string root = Path.Combine(ProjectRoot, "wechat-minigame");
            string js = File.ReadAllText(Path.Combine(root, "minigame", "game.js"));
            string gameJson = File.ReadAllText(Path.Combine(root, "minigame", "game.json"));
            bool sub = js.Contains("loadDataPackageFromSubpackage: true");
            bool raw = js.Contains("compressDataPackage: false");
            bool cdn = js.Contains(CloudConfig.AssetCdn);
            bool declared = gameJson.Contains("data-package");
            bool folder = Directory.Exists(Path.Combine(root, "minigame", "data-package"));
            string dataFile = "";
            long dataBytes = 0;
            foreach (var file in Directory.GetFiles(Path.Combine(root, "webgl"), "*.webgl.data.unityweb.bin.txt"))
            {
                var info = new FileInfo(file);
                if (info.Length > dataBytes)
                {
                    dataBytes = info.Length;
                    dataFile = info.Name;
                }
            }
            Debug.Log($"[微信] 首包走CDN={!sub}，不压缩首包={raw}，资源CDN={cdn}，首包文件={dataFile}（{dataBytes / 1048576f:0.0}MB）");
            if (sub) Debug.LogError("[微信] 首包还在代码分包里，包体会超过 30MB。");
            if (declared || folder) Debug.LogError("[微信] minigame 里还留着 data-package，上传时仍会计入代码包。");
            if (dataFile.Length == 0) Debug.LogError("[微信] webgl 目录没有首包文件，CDN 上没有东西可拉。");
            if (!cdn) Debug.LogError("[微信] game.js 里没有资源 CDN 地址。");
            if (!raw) Debug.LogError("[微信] 首包被压成了 .br，和 CDN 上的 .bin.txt 对不上。");
            return cdn && raw && !sub && !declared && !folder && dataFile.Length > 0;
        }

        /// <summary>微信子平台没 Active 时转换 SDK 不编译；Mac 演示包会把当前平台切走，导出前切回来。</summary>
        static void ActivateWeChat()
        {
            try
            {
                var group = (BuildTargetGroup)Enum.Parse(typeof(BuildTargetGroup), "MiniGame");
                var target = (BuildTarget)Enum.Parse(typeof(BuildTarget), "WeixinMiniGame");
                if (EditorUserBuildSettings.activeBuildTarget != target)
                    EditorUserBuildSettings.SwitchActiveBuildTarget(group, target);
            }
            catch (Exception e)
            {
                Debug.LogWarning("[微信] 切换 MiniGame 平台失败，请在 Build Settings 里把微信小游戏点成 Active：" + e.Message);
            }
            var settings = AssetDatabase.LoadAllAssetsAtPath("ProjectSettings/ProjectSettings.asset");
            if (settings != null && settings.Length > 0)
            {
                var so = new SerializedObject(settings[0]);
                var sub = so.FindProperty("activeSubplatform");
                if (sub != null)
                {
                    sub.intValue = 1;
                    so.ApplyModifiedPropertiesWithoutUndo();
                }
            }
            PlayerSettings.productName = "CunKou";
            PlayerSettings.companyName = "Luckygua";
        }

        static object Invoke(string typeName, string method, object[] args)
        {
            foreach (var asm in AppDomain.CurrentDomain.GetAssemblies())
            {
                var t = asm.GetType(typeName);
                if (t == null) continue;
                var m = t.GetMethod(method, BindingFlags.Public | BindingFlags.Static);
                if (m == null) continue;
                return m.Invoke(null, args);
            }
            return null;
        }

        static void Set(SerializedObject so, string path, object value)
        {
            var parts = path.Split('.');
            var p = so.FindProperty(parts[0]);
            for (int i = 1; i < parts.Length && p != null; i++)
                p = p.FindPropertyRelative(parts[i]);
            if (p == null) return;
            if (value is string s) p.stringValue = s;
            else if (value is int n) p.intValue = n;
            else if (value is bool b) p.boolValue = b;
        }
    }
}
