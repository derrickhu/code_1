using System;
using System.Reflection;
using UnityEditor;
using UnityEngine;

namespace Liangshan.EditorTools
{
    /// <summary>把 Game 视图切到 1080×1920。Free Aspect 会跟着面板变成横屏，界面就会挤在一起。</summary>
    [InitializeOnLoad]
    static class PhoneGameView
    {
        const int W = 1080;
        const int H = 1920;

        static PhoneGameView()
        {
            if (Application.isBatchMode) return;
            EditorApplication.delayCall += () =>
            {
                try { Select(); }
                catch (Exception e) { Debug.LogWarning("[村口大战外星人] 未能切换 Game 视图：" + e.Message); }
            };
        }

        [MenuItem("村口大战外星人/Game视图改为手机竖屏")]
        public static void Select()
        {
            var asm = typeof(Editor).Assembly;
            var sizesType = asm.GetType("UnityEditor.GameViewSizes");
            var singleton = typeof(ScriptableSingleton<>).MakeGenericType(sizesType);
            var instance = singleton.GetProperty("instance").GetValue(null);
            var group = sizesType.GetMethod("GetGroup").Invoke(instance, new[] { sizesType.GetProperty("currentGroupType").GetValue(instance) });

            var groupType = group.GetType();
            int total = (int)groupType.GetMethod("GetTotalCount").Invoke(group, null);
            var getSize = groupType.GetMethod("GetGameViewSize");
            var sizeType = asm.GetType("UnityEditor.GameViewSize");
            int index = -1;
            for (int i = 0; i < total; i++)
            {
                var s = getSize.Invoke(group, new object[] { i });
                int w = (int)sizeType.GetProperty("width").GetValue(s);
                int h = (int)sizeType.GetProperty("height").GetValue(s);
                if (w == W && h == H) { index = i; break; }
            }
            if (index < 0)
            {
                var enumType = asm.GetType("UnityEditor.GameViewSizeType");
                var ctor = sizeType.GetConstructor(new[] { enumType, typeof(int), typeof(int), typeof(string) });
                var created = ctor.Invoke(new object[] { Enum.Parse(enumType, "FixedResolution"), W, H, "手机 1080x1920" });
                groupType.GetMethod("AddCustomSize").Invoke(group, new[] { created });
                index = (int)groupType.GetMethod("GetTotalCount").Invoke(group, null) - 1;
            }

            var gvType = asm.GetType("UnityEditor.GameView");
            var callback = gvType.GetMethod("SizeSelectionCallback", BindingFlags.Instance | BindingFlags.Public | BindingFlags.NonPublic);
            foreach (EditorWindow window in Resources.FindObjectsOfTypeAll(gvType))
            {
                callback.Invoke(window, new object[] { index, null });
                window.Repaint();
            }
        }
    }
}
