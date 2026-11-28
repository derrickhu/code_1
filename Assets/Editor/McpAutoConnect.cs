using MCPForUnity.Editor.Services;
using UnityEditor;
using UnityEngine;

namespace Liangshan.EditorTools
{
    [InitializeOnLoad]
    public static class McpAutoConnect
    {
        static double _nextTry;
        static bool _connecting;

        static McpAutoConnect()
        {
            EditorApplication.update += Tick;
        }

        static async void Tick()
        {
            if (Application.isBatchMode || _connecting) return;
            if (EditorApplication.timeSinceStartup < _nextTry) return;
            _nextTry = EditorApplication.timeSinceStartup + 3.0;
            if (!MCPServiceLocator.Bridge.IsRunning)
            {
                _connecting = true;
                try
                {
                    bool ok = await MCPServiceLocator.Bridge.StartAsync();
                    if (ok) Debug.Log("[McpAutoConnect] HTTP session connected.");
                }
                catch { }
                finally { _connecting = false; }
            }
        }
    }
}
