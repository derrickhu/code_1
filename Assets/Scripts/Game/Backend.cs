using System;
using System.Collections;
using System.Reflection;
using System.Text;
using UnityEngine;
using UnityEngine.Networking;

namespace Liangshan
{
    /// <summary>云端存档只有一个 key：save，值是 SaveData 的 JSON 原文。</summary>
    [Serializable]
    public sealed class CloudPayload
    {
        public string save;
    }

    [Serializable]
    public sealed class CloudRemote
    {
        public long updatedAt;
        public CloudPayload payload;
    }

    [Serializable]
    public sealed class CloudData
    {
        public string token;
        public string userId;
        public string platform;
        public long expiresAt;
        public bool exists;
        public long updatedAt;
        public CloudPayload payload;
        public CloudRemote remote;
    }

    [Serializable]
    public sealed class CloudReply
    {
        public bool ok;
        public string code;
        public string error;
        public CloudData data;
    }

    [Serializable]
    public sealed class PushBody
    {
        public int schemaVersion;
        public long updatedAt;
        public long baseRemoteUpdatedAt;
        public string clientFingerprint;
        public CloudPayload payload;
    }

    /// <summary>登录拿 JWT，之后每次请求带 Bearer；401 清 token 重登一次。真机走 wx.login，其它环境用本机匿名 ID。</summary>
    public static class Backend
    {
        [Serializable]
        sealed class LoginBody
        {
            public string platform;
            public string code;
            public string anonId;
        }

        [Serializable]
        sealed class StoredToken
        {
            public string token;
            public string userId;
            public string platform;
            public long expiresAt;
        }

        static StoredToken _tok;

        public static string UserId => _tok != null ? _tok.userId : "";

        static bool UseWx => !Application.isEditor && WxType() != null;
        static string PlatformCode => UseWx ? "wx" : "anon";

        public static long NowMs() => DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();

        public static IEnumerator EnsureToken(Action<string> done)
        {
            long now = NowMs();
            if (_tok != null && _tok.expiresAt - now > 60000L) { done(null); yield break; }
            StoredToken cached = LoadToken();
            if (cached != null && cached.expiresAt - now > 60000L)
            {
                _tok = cached;
                done(null);
                yield break;
            }

            var body = new LoginBody { platform = PlatformCode };
            if (UseWx)
            {
                string code = null, fail = null;
                bool back = false;
                WxLogin(c => { code = c; back = true; }, e => { fail = e; back = true; });
                float until = Time.realtimeSinceStartup + CloudConfig.RequestTimeoutSec;
                while (!back && Time.realtimeSinceStartup < until) yield return null;
                if (string.IsNullOrEmpty(code))
                {
                    done("wx.login gave no code: " + (fail ?? "timeout"));
                    yield break;
                }
                body.code = code;
            }
            else body.anonId = AnonId();

            long status = 0;
            CloudReply reply = null;
            yield return Post(CloudConfig.LoginPath, JsonUtility.ToJson(body), null, (s, r) => { status = s; reply = r; });
            if (status != 200 || reply == null || !reply.ok || reply.data == null || string.IsNullOrEmpty(reply.data.token))
            {
                done(Describe(status, reply));
                yield break;
            }
            _tok = new StoredToken
            {
                token = reply.data.token,
                userId = reply.data.userId ?? "",
                platform = string.IsNullOrEmpty(reply.data.platform) ? body.platform : reply.data.platform,
                expiresAt = reply.data.expiresAt
            };
            PlayerPrefs.SetString(CloudConfig.TokenKey, JsonUtility.ToJson(_tok));
            PlayerPrefs.Save();
            Debug.Log("[Backend] login ok userId=" + _tok.userId);
            done(null);
        }

        public static IEnumerator Call(string path, string json, Action<long, CloudReply, string> done)
        {
            string err = null;
            yield return EnsureToken(e => err = e);
            if (err != null) { done(0, null, err); yield break; }

            long status = 0;
            CloudReply reply = null;
            yield return Post(path, json, _tok.token, (s, r) => { status = s; reply = r; });
            if (status == 401)
            {
                ClearToken();
                yield return EnsureToken(e => err = e);
                if (err != null) { done(401, reply, err); yield break; }
                yield return Post(path, json, _tok.token, (s, r) => { status = s; reply = r; });
            }
            bool ok = status == 200 && reply != null && reply.ok;
            done(status, reply, ok ? null : Describe(status, reply));
        }

        public static IEnumerator CallRaw(string path, string json, Action<long, string, string> done)
        {
            string err = null;
            yield return EnsureToken(e => err = e);
            if (err != null) { done(0, null, err); yield break; }

            long status = 0;
            string text = null;
            yield return PostText(path, json, _tok.token, (s, t) => { status = s; text = t; });
            if (status == 401)
            {
                ClearToken();
                yield return EnsureToken(e => err = e);
                if (err != null) { done(401, text, err); yield break; }
                yield return PostText(path, json, _tok.token, (s, t) => { status = s; text = t; });
            }
            done(status, text, status == 200 ? null : "HTTP " + status);
        }

        public static void ClearToken()
        {
            _tok = null;
            PlayerPrefs.DeleteKey(CloudConfig.TokenKey);
        }

        public static bool HookHide(Action hide)
        {
            var wx = WxType();
            if (wx == null || Application.isEditor || hide == null) return false;
            MethodInfo method = null;
            foreach (var m in wx.GetMethods())
                if (m.Name == "OnHide" && m.GetParameters().Length == 1) { method = m; break; }
            if (method == null) return false;
            var cbType = method.GetParameters()[0].ParameterType;
            if (!cbType.IsGenericType) return false;
            var arg = cbType.GetGenericArguments()[0];
            typeof(Backend).GetMethod(nameof(HookHideOf), BindingFlags.NonPublic | BindingFlags.Static)
                .MakeGenericMethod(arg)
                .Invoke(null, new object[] { method, hide });
            return true;
        }

        static void HookHideOf<T>(MethodInfo method, Action hide)
        {
            Action<T> cb = _ => hide();
            method.Invoke(null, new object[] { cb });
        }

        static IEnumerator Post(string path, string json, string token, Action<long, CloudReply> done)
        {
            yield return PostText(path, json, token, (status, text) =>
            {
                CloudReply reply = null;
                if (!string.IsNullOrEmpty(text))
                {
                    try { reply = JsonUtility.FromJson<CloudReply>(text); }
                    catch (Exception) { reply = null; }
                }
                done(status, reply);
            });
        }

        static IEnumerator PostText(string path, string json, string token, Action<long, string> done)
        {
            using (var req = new UnityWebRequest(CloudConfig.BaseUrl + path, "POST"))
            {
                req.uploadHandler = new UploadHandlerRaw(Encoding.UTF8.GetBytes(json ?? "{}"));
                req.downloadHandler = new DownloadHandlerBuffer();
                req.SetRequestHeader("Content-Type", "application/json");
                if (!string.IsNullOrEmpty(token)) req.SetRequestHeader("Authorization", "Bearer " + token);
                req.timeout = CloudConfig.RequestTimeoutSec;
                yield return req.SendWebRequest();
                done(req.responseCode, req.downloadHandler != null ? req.downloadHandler.text : null);
            }
        }

        static StoredToken LoadToken()
        {
            string raw = PlayerPrefs.GetString(CloudConfig.TokenKey, "");
            if (string.IsNullOrEmpty(raw)) return null;
            StoredToken t;
            try { t = JsonUtility.FromJson<StoredToken>(raw); }
            catch (Exception) { return null; }
            if (t == null || string.IsNullOrEmpty(t.token)) return null;
            if (!string.IsNullOrEmpty(t.platform) && t.platform != PlatformCode) return null;
            return t;
        }

        static string AnonId()
        {
            string id = PlayerPrefs.GetString(CloudConfig.AnonKey, "");
            if (!string.IsNullOrEmpty(id)) return id;
            id = "anon_" + NowMs().ToString("x") + "_" + Guid.NewGuid().ToString("N").Substring(0, 8);
            PlayerPrefs.SetString(CloudConfig.AnonKey, id);
            PlayerPrefs.Save();
            return id;
        }

        static string Describe(long status, CloudReply reply)
        {
            if (reply == null) return "HTTP " + status;
            return (reply.code ?? ("HTTP " + status)) + " " + (reply.error ?? "");
        }

        static Type WxType() => Type.GetType("WeChatWASM.WX, Wx") ?? Type.GetType("WeChatWASM.WX");

        static void WxLogin(Action<string> ok, Action<string> fail)
        {
            var wx = WxType();
            MethodInfo method = null;
            if (wx != null)
                foreach (var m in wx.GetMethods())
                    if (m.Name == "Login" && m.GetParameters().Length == 1) { method = m; break; }
            if (method == null)
            {
                fail("not minigame");
                return;
            }
            var optType = method.GetParameters()[0].ParameterType;
            var successType = MemberType(optType, "success");
            var failType = MemberType(optType, "fail");
            if (successType == null || failType == null || !successType.IsGenericType || !failType.IsGenericType)
            {
                fail("wx.login signature");
                return;
            }
            typeof(Backend).GetMethod(nameof(WxLoginOf), BindingFlags.NonPublic | BindingFlags.Static)
                .MakeGenericMethod(successType.GetGenericArguments()[0], failType.GetGenericArguments()[0])
                .Invoke(null, new object[] { method, ok, fail });
        }

        static void WxLoginOf<TOk, TFail>(MethodInfo method, Action<string> ok, Action<string> fail)
        {
            var optType = method.GetParameters()[0].ParameterType;
            var opt = Activator.CreateInstance(optType);
            Action<TOk> success = r => ok(MemberString(r, "code"));
            Action<TFail> failure = e => fail(MemberString(e, "errMsg") ?? "wx.login fail");
            SetMember(opt, "success", success);
            SetMember(opt, "fail", failure);
            method.Invoke(null, new object[] { opt });
        }

        static Type MemberType(Type type, string name)
        {
            var f = type.GetField(name);
            if (f != null) return f.FieldType;
            var p = type.GetProperty(name);
            return p != null ? p.PropertyType : null;
        }

        static void SetMember(object obj, string name, object value)
        {
            var f = obj.GetType().GetField(name);
            if (f != null) { f.SetValue(obj, value); return; }
            obj.GetType().GetProperty(name)?.SetValue(obj, value);
        }

        static string MemberString(object obj, string name)
        {
            if (obj == null) return null;
            var f = obj.GetType().GetField(name);
            if (f != null) return f.GetValue(obj) as string;
            return obj.GetType().GetProperty(name)?.GetValue(obj) as string;
        }
    }
}
