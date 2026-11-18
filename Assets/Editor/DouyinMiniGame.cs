using System;
using System.IO;
using UnityEditor;
using UnityEngine;

namespace Liangshan.EditorTools
{
    /// <summary>
    /// 抖音小游戏一键导出工具：
    /// 命令行：-executeMethod Liangshan.EditorTools.DouyinMiniGame.Export
    /// 产物在 douyin-minigame/，直接用「抖音开发者工具」导入该目录即可预览、真机扫码与上传提审。
    /// 首包与按需图包/音乐与微信端共用同一套 CloudBase CDN（导出后执行 node tools/upload_cdn.mjs 同步）。
    /// </summary>
    public static class DouyinMiniGame
    {
        static string ProjectRoot => Path.GetFullPath(Path.Combine(Application.dataPath, ".."));

        [MenuItem("村口大战外星人/导出抖音小游戏")]
        public static void Export()
        {
            int code = 1;
            try
            {
                bool wasmOk = WxMiniGame.ExportCore();
                if (!wasmOk)
                {
                    Debug.LogError("[抖音] 底层 WASM 构建未通过，中止生成抖音工程。");
                }
                else
                {
                    code = RunPackager() ? 0 : 1;
                }
            }
            catch (Exception e)
            {
                Debug.LogError("[抖音] 导出异常：" + e);
            }
            if (Application.isBatchMode)
                EditorApplication.Exit(code);
        }

        [MenuItem("村口大战外星人/重新生成抖音工程（复用现有WASM）")]
        public static void RepackExisting()
        {
            bool ok = RunPackager();
            if (Application.isBatchMode)
                EditorApplication.Exit(ok ? 0 : 1);
        }

        public static bool RunPackager()
        {
            string script = Path.Combine(ProjectRoot, "tools", "export_douyin.py");
            if (!File.Exists(script))
            {
                Debug.LogError("[抖音] 缺少打包脚本：" + script);
                return false;
            }
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
                if (!string.IsNullOrEmpty(stdout)) Debug.Log("[抖音] " + stdout.Trim());
                if (p.ExitCode != 0)
                {
                    Debug.LogError("[抖音] 打包失败：" + stderr);
                    return false;
                }
            }
            string dyGameJson = Path.Combine(ProjectRoot, "douyin-minigame", "game.json");
            string dyProjJson = Path.Combine(ProjectRoot, "douyin-minigame", "project.config.json");
            bool valid = File.Exists(dyGameJson) && File.Exists(dyProjJson)
                && File.ReadAllText(dyProjJson).Contains(CloudConfig.DouyinAppId);
            if (valid)
                Debug.Log("[抖音] 导出完成！请用抖音开发者工具导入目录：" + Path.Combine(ProjectRoot, "douyin-minigame") + "，并执行 node tools/upload_cdn.mjs 上传最新首包。");
            return valid;
        }
    }
}
