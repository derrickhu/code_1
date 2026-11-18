using System.IO;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;

namespace Liangshan.EditorTools
{
    /// <summary>命令行：-executeMethod Liangshan.EditorTools.ProjectSetup.BuildMac</summary>
    public static class ProjectSetup
    {
        const string ScenePath = "Assets/Scenes/Main.scene";

        [MenuItem("村口大战外星人/初始化场景")]
        public static void EnsureScene()
        {
            if (!File.Exists(ScenePath))
            {
                Directory.CreateDirectory("Assets/Scenes");
                var scene = EditorSceneManager.NewScene(NewSceneSetup.EmptyScene, NewSceneMode.Single);
                EditorSceneManager.SaveScene(scene, ScenePath);
                AssetDatabase.Refresh();
            }
            EditorBuildSettings.scenes = new[] { new EditorBuildSettingsScene(ScenePath, true) };
        }

        [MenuItem("村口大战外星人/打包 Mac 演示版")]
        public static void BuildMac()
        {
            EnsureScene();
            PlayerSettings.fullScreenMode = FullScreenMode.Windowed;
            PlayerSettings.defaultScreenWidth = 540;
            PlayerSettings.defaultScreenHeight = 960;
            PlayerSettings.resizableWindow = true;
            PlayerSettings.runInBackground = true;
            ArtPacks.Build(BuildTarget.StandaloneOSX);

            var options = new BuildPlayerOptions
            {
                scenes = new[] { ScenePath },
                locationPathName = "Build/Liangshan.app",
                target = BuildTarget.StandaloneOSX,
                options = BuildOptions.None,
            };
            var report = BuildPipeline.BuildPlayer(options);
            Debug.Log($"[构建] 结果 {report.summary.result}，耗时 {report.summary.totalTime}，大小 {report.summary.totalSize / 1024 / 1024} MB");
            if (Application.isBatchMode)
                EditorApplication.Exit(report.summary.result == UnityEditor.Build.Reporting.BuildResult.Succeeded ? 0 : 1);
        }
    }
}
