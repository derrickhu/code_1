// 商业级 2D 特效 Uber Shader（兼容 WebGL / 微信小游戏 / Mac）
// 支持：
// 1. 可切换混合模式（_SrcBlend / _DstBlend：普通预乘透明 或 叠加发光）
// 2. 双层无缝噪声 UV 滚动 + 法线级流场扭曲（_NoiseTex, _Scroll, _Distort）
// 3. 软边缘噪波侵蚀溶解（_Dissolve, _EdgeSoft, _EdgeBoost）：刀光/火焰收尾自然碎散成火星，绝非死板降透明度
// 4. 双色调色阶映射（_Color 外焰/主色 + _CoreColor 高亮白芯，按贴图亮度自动分层，在浅黄砂岩地面也锐利不发灰）
// 5. UV 横向刷光裁剪（_Reveal, _TailFade）：供弧形刀光网格与流光束从头刷到尾、再从尾消散
Shader "Liangshan/FxUber"
{
    Properties
    {
        [PerRendererData] _MainTex ("Main Texture", 2D) = "white" {}
        _NoiseTex ("Tileable Noise (RG=Flow, B=FBM)", 2D) = "gray" {}
        _Color ("Outer Color", Color) = (1,1,1,1)
        _CoreColor ("Core Highlight", Color) = (1,1,1,1)
        _Scroll ("Scroll (xy=Layer1, zw=Layer2)", Vector) = (1.2, 0.4, -0.7, 1.1)
        _NoiseScale ("Noise Tiling (xy)", Vector) = (1.5, 1.5, 0, 0)
        _Distort ("UV Distortion", Float) = 0.08
        _Dissolve ("Dissolve (0..1)", Float) = 0.0
        _EdgeSoft ("Dissolve Softness", Float) = 0.18
        _EdgeBoost ("Burning Edge Boost", Float) = 1.6
        _CorePower ("Core Contrast", Float) = 2.0
        _Reveal ("Head Reveal (0..1)", Float) = 1.0
        _Tail ("Tail Erase (0..1)", Float) = 0.0
        _SrcBlend ("Src Blend", Float) = 5
        _DstBlend ("Dst Blend", Float) = 1
    }
    SubShader
    {
        Tags { "Queue"="Transparent" "RenderType"="Transparent" "IgnoreProjector"="True" "PreviewType"="Plane" "CanUseSpriteAtlas"="True" }
        Cull Off
        Lighting Off
        ZWrite Off
        Blend [_SrcBlend] [_DstBlend]

        Pass
        {
            CGPROGRAM
            #pragma vertex vert
            #pragma fragment frag
            #include "UnityCG.cginc"

            struct appdata
            {
                float4 vertex : POSITION;
                fixed4 color : COLOR;
                float2 uv : TEXCOORD0;
            };

            struct v2f
            {
                float4 pos : SV_POSITION;
                fixed4 color : COLOR;
                float2 uv : TEXCOORD0;
                float4 nuv : TEXCOORD1;
            };

            sampler2D _MainTex;
            sampler2D _NoiseTex;
            fixed4 _Color;
            fixed4 _CoreColor;
            float4 _Scroll;
            float4 _NoiseScale;
            float _Distort;
            float _Dissolve;
            float _EdgeSoft;
            float _EdgeBoost;
            float _CorePower;
            float _Reveal;
            float _Tail;

            v2f vert(appdata v)
            {
                v2f o;
                o.pos = UnityObjectToClipPos(v.vertex);
                o.uv = v.uv;
                o.color = v.color;
                float t = _Time.y;
                float2 sc = _NoiseScale.xy;
                o.nuv.xy = v.uv * sc + _Scroll.xy * t;
                o.nuv.zw = v.uv * (sc * 1.73) + _Scroll.zw * t;
                return o;
            }

            fixed4 frag(v2f i) : SV_Target
            {
                fixed3 n1 = tex2D(_NoiseTex, i.nuv.xy).rgb;
                fixed3 n2 = tex2D(_NoiseTex, i.nuv.zw).rgb;
                float2 flow = (float2(n1.r, n2.g) - 0.5) * 2.0;
                float fbm = saturate(n1.b * 0.6 + n2.b * 0.4);

                // 沿横向 UV (u: 0=尾 -> 1=头) 的刷光窗口
                float u = i.uv.x;
                float headMask = 1.0 - smoothstep(_Reveal - 0.08, _Reveal + 0.02, u);
                float tailMask = smoothstep(_Tail - 0.02, _Tail + 0.16, u);
                float window = headMask * tailMask;

                float2 duv = saturate(i.uv + flow * _Distort);
                fixed4 mainSample = tex2D(_MainTex, duv);
                float mask = mainSample.a * window;

                // 噪波侵蚀溶解：暗部与边缘先被噪波啃噬，交界处提亮成灼热亮边
                float field = mask * (0.55 + 0.65 * fbm);
                float thresh = _Dissolve * 1.18;
                float soft = max(0.02, _EdgeSoft);
                float alive = smoothstep(thresh, thresh + soft, field);
                float rim = smoothstep(thresh + soft * 1.8, thresh + soft * 0.25, field) * alive;

                float intensity = saturate(mainSample.r * (0.78 + 0.44 * n1.b));
                fixed3 col;
                if (_CorePower < 0.0)
                {
                    col = mainSample.rgb * _Color.rgb * (0.86 + 0.30 * fbm);
                    col *= (1.0 + rim * max(0.0, _EdgeBoost - 1.0) * 0.55);
                }
                else
                {
                    float coreK = pow(intensity, max(0.5, _CorePower));
                    col = lerp(_Color.rgb, _CoreColor.rgb, coreK);
                    col = lerp(col, _CoreColor.rgb, rim * saturate(_EdgeBoost - 1.0) * 0.65);
                    col *= (1.0 + rim * (_EdgeBoost - 1.0) * 0.45);
                }

                float outA = saturate(mask * alive * _Color.a * i.color.a);
                return fixed4(col * i.color.rgb, outA);
            }
            ENDCG
        }
    }
}
