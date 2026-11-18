// 角色形变：以脚底为锚，胯部以上起伏（_Bob）、侧倾（_Shear）、整体压扁拉伸（_Sx/_Sy）。
// 脚始终钉在地上，走路时腿被拉长/压短，像骨骼动画那样“踩着地走”。
// 预乘输出：普通混合 One OneMinusSrcAlpha，叠加发光 One One。
Shader "Liangshan/SpriteBend"
{
    Properties
    {
        [PerRendererData] _MainTex ("Texture", 2D) = "white" {}
        _Color ("Tint", Color) = (1,1,1,1)
        [HideInInspector] _RendererColor ("RendererColor", Color) = (1,1,1,1)
        [HideInInspector] _Flip ("Flip", Vector) = (1,1,1,1)
        [PerRendererData] _Foot ("Foot", Float) = 0.01
        [PerRendererData] _Body ("Body", Float) = 0.85
        [PerRendererData] _Bob ("Bob", Float) = 0
        [PerRendererData] _Shear ("Shear", Float) = 0
        [PerRendererData] _Sx ("ScaleX", Float) = 1
        [PerRendererData] _Sy ("ScaleY", Float) = 1
        [PerRendererData] _LegL ("LegLiftL", Float) = 0
        [PerRendererData] _LegR ("LegLiftR", Float) = 0
        [PerRendererData] _LegTop ("LegTop", Float) = 0.3
        [PerRendererData] _LegCx ("LegCenterX", Float) = 0.5
        [PerRendererData] _Flash ("HitFlash", Float) = 0
        [PerRendererData] _FlashColor ("HitFlashColor", Color) = (1,1,1,1)
        [HideInInspector] _SrcBlend ("Src", Float) = 1
        [HideInInspector] _DstBlend ("Dst", Float) = 10
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
            #pragma vertex SpriteVert
            #pragma fragment frag
            #include "UnitySprites.cginc"

            float _Foot, _Body, _Bob, _Shear, _Sx, _Sy, _LegL, _LegR, _LegTop, _LegCx, _Flash;
            fixed4 _FlashColor;

            fixed4 frag(v2f IN) : SV_Target
            {
                float2 uv = IN.texcoord;
                uv.y = _Foot + (uv.y - _Foot) / _Sy;
                uv.x = 0.5 + (uv.x - 0.5) / _Sx;
                float h = (uv.y - _Foot) / _Body;
                uv.x -= _Shear * saturate(h);
                uv.y -= _Bob * smoothstep(0.06, 0.5, h);
                // 抬腿：腿部区域按左右分开，靴子往上收、越往胯部越不动（像膝盖弯起来）；另一条腿踩住地。
                float side = smoothstep(-0.015, 0.015, uv.x - _LegCx);
                float lift = lerp(_LegL, _LegR, side);
                float hl = (uv.y - _Foot) / _Body;
                float legW = 1.0 - smoothstep(0.0, _LegTop, hl);
                uv.y -= lift * legW;
                fixed4 tex = tex2D(_MainTex, uv);
                fixed4 c;
                // 受击是染色，不是整只换成纯色剪影：按原图亮度重新上色，明暗还在，但整只亮成受击色（蔚蓝星球那种亮红）。
                fixed3 baseRgb = tex.rgb * IN.color.rgb;
                fixed kFlash = saturate(_Flash);
                fixed luma = dot(baseRgb, fixed3(0.30, 0.59, 0.11));
                fixed3 tinted = saturate(_FlashColor.rgb * (0.45 + 0.9 * luma) + 0.08);
                c.rgb = lerp(baseRgb, tinted, kFlash * 0.85);
                c.a = tex.a * IN.color.a;
                float inside = step(0, uv.x) * step(uv.x, 1) * step(0, uv.y) * step(uv.y, 1);
                c.a *= inside;
                c.rgb *= c.a;
                return c;
            }
            ENDCG
        }
    }
}
