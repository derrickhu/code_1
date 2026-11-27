using MCPForUnity.Editor.Services;
using UnityEditor;
using UnityEngine;

namespace Liangshan.EditorTools
{
    [InitializeOnLoad]
    public static class McpAutoConnect
    {
        static McpAutoConnect()
        {
            EditorApplication.delayCall += async () =>
            {
                if (Application.isBatchMode) return;
                if (!MCPServiceLocator.Bridge.IsRunning)
                {
                    bool ok = await MCPServiceLocator.Bridge.StartAsync();
                    Debug.Log($"[McpAutoConnect] HTTP session start: {ok}");
                }
            };
        }
    }
}
