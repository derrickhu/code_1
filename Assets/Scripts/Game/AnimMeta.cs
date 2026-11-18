// 由 tools/anim_frames.py 生成，勿手改。
using System.Collections.Generic;

namespace Liangshan
{
    public static class AnimMeta
    {
        /// <summary>
        /// 角色画布中身体（第 0 帧脚底到头顶）占画布边长的比例、脚底离底边的比例、
        /// 两腿分界线的 x（画布比例）、胯部高度（占身体高）。
        /// </summary>
        public static readonly Dictionary<string, (float Body, float Foot, float LegCx, float LegTop)> Info =
            new Dictionary<string, (float, float, float, float)>
        {
            ["en_soldier"] = (0.8468f, 0.0173f, 0.5057f, 0.2209f),
            ["en_shield"] = (0.8538f, 0.0175f, 0.4717f, 0.3200f),
            ["en_cavalry"] = (0.8379f, 0.0165f, 0.5000f, 0.2200f),
            ["en_crossbow"] = (0.8517f, 0.0174f, 0.5000f, 0.2200f),
            ["en_elite"] = (0.8048f, 0.0143f, 0.4697f, 0.1600f),
            ["en_porter"] = (0.7468f, 0.0152f, 0.4912f, 0.1730f),
            ["en_boss"] = (0.8707f, 0.0108f, 0.5000f, 0.2200f),
            ["hero_huarong"] = (0.8718f, 0.0103f, 0.4902f, 0.1890f),
            ["hero_lingzhen"] = (0.8724f, 0.0097f, 0.4512f, 0.3200f),
            ["hero_gongsun"] = (0.7394f, 0.0094f, 0.5195f, 0.1876f),
            ["hero_wusong"] = (0.8526f, 0.0113f, 0.5039f, 0.3200f),
            ["hero_linchong"] = (0.8712f, 0.0102f, 0.5000f, 0.3123f),
            ["hero_luzhishen"] = (0.7515f, 0.0089f, 0.5010f, 0.2505f),
            ["hero_zhangqing"] = (0.8703f, 0.0107f, 0.4863f, 0.1600f),
            ["hero_wuyong"] = (0.8059f, 0.0088f, 0.5000f, 0.2200f),
            ["en_hawk"] = (0.5588f, 0.0147f, 0.5000f, 0.2200f),
            ["en_armored"] = (0.8567f, 0.0169f, 0.5000f, 0.2200f),
            ["en_firebomb"] = (0.8444f, 0.0173f, 0.5000f, 0.2200f),
            ["en_chainhorse"] = (0.4015f, 0.0089f, 0.4854f, 0.3200f),
            ["en_luan"] = (0.7121f, 0.0117f, 0.4909f, 0.1600f),
            ["en_shiwen"] = (0.7684f, 0.0113f, 0.5000f, 0.2200f),
            ["en_huyan"] = (0.8692f, 0.0110f, 0.4883f, 0.3200f),
            ["en_gaoqiu"] = (0.8704f, 0.0105f, 0.5000f, 0.2200f),
            ["hero_lujunyi"] = (0.6909f, 0.0124f, 0.4284f, 0.3200f),
            ["hero_guansheng"] = (0.7527f, 0.0081f, 0.4792f, 0.3200f),
            ["hero_yanqing"] = (0.8680f, 0.0119f, 0.4531f, 0.1600f),
            ["hero_fanrui"] = (0.7425f, 0.0081f, 0.5000f, 0.2200f),
            ["hero_husanniang"] = (0.7681f, 0.0097f, 0.5000f, 0.2200f),
            ["hero_andaoquan"] = (0.7055f, 0.0103f, 0.5000f, 0.2200f),
            ["hero_daizong"] = (0.8539f, 0.0114f, 0.5203f, 0.2488f),
            ["hero_qinming"] = (0.7417f, 0.0125f, 0.5013f, 0.2261f),
            ["hero_likui"] = (0.7931f, 0.0138f, 0.5247f, 0.2441f),
            ["hero_qiaodaoqing"] = (0.7188f, 0.0117f, 0.5000f, 0.2200f),
            ["hero_zhuwu"] = (0.8658f, 0.0130f, 0.4701f, 0.3200f),
            ["hero_xuning"] = (0.8709f, 0.0105f, 0.4811f, 0.1600f),
            ["hero_shantinggui"] = (0.8069f, 0.0116f, 0.4642f, 0.2409f),
            ["hero_weidingguo"] = (0.7572f, 0.0115f, 0.4974f, 0.2190f),
            ["hero_shixiu"] = (0.8289f, 0.0100f, 0.5000f, 0.2324f),
            ["hero_xiezhen"] = (0.8746f, 0.0086f, 0.5247f, 0.1600f),
            ["hero_xiebao"] = (0.7778f, 0.0098f, 0.5000f, 0.2200f),
            ["hero_maling"] = (0.8705f, 0.0108f, 0.4896f, 0.1600f),
            ["hero_kongliang"] = (0.8700f, 0.0110f, 0.4915f, 0.1600f),
            ["hero_tanglong"] = (0.7013f, 0.0094f, 0.5000f, 0.2200f),
            ["hero_sunerniang"] = (0.8708f, 0.0096f, 0.4844f, 0.1600f),
            ["hero_ruanxiaoqi"] = (0.8682f, 0.0116f, 0.5326f, 0.2602f),
            ["hero_shiqian"] = (0.8363f, 0.0118f, 0.4792f, 0.1808f),
            ["hero_jiangjing"] = (0.8537f, 0.0163f, 0.5150f, 0.1937f),
            ["en_diver"] = (0.8575f, 0.0155f, 0.5183f, 0.2026f),
            ["en_farmer"] = (0.8564f, 0.0157f, 0.5193f, 0.2007f),
            ["en_hound"] = (0.6634f, 0.0149f, 0.5000f, 0.2200f),
            ["en_rattan"] = (0.7603f, 0.0155f, 0.4951f, 0.2094f),
            ["en_taoist"] = (0.8488f, 0.0174f, 0.5000f, 0.2200f),
            ["en_berserker"] = (0.7921f, 0.0149f, 0.4927f, 0.1957f),
            ["en_catapult"] = (0.8401f, 0.0174f, 0.5000f, 0.2200f),
            ["en_lantern"] = (0.8163f, 0.0212f, 0.5000f, 0.2200f),
            ["en_scout"] = (0.8444f, 0.0173f, 0.5239f, 0.2213f),
            ["en_brute"] = (0.4661f, 0.0087f, 0.5000f, 0.1600f),
            ["en_hetao"] = (0.8692f, 0.0112f, 0.5000f, 0.2200f),
            ["en_zhucf"] = (0.8693f, 0.0109f, 0.4603f, 0.2689f),
            ["en_zengkui"] = (0.8398f, 0.0110f, 0.5000f, 0.2200f),
            ["en_hantao"] = (0.7575f, 0.0106f, 0.5000f, 0.2200f),
            ["en_liuml"] = (0.6027f, 0.0116f, 0.5000f, 0.2200f),
            ["en_waterchief"] = (0.8611f, 0.0152f, 0.5000f, 0.2200f),
            ["en_crossbowcapt"] = (0.7650f, 0.0144f, 0.4902f, 0.2111f),
            ["en_goldeneagle"] = (0.5000f, 0.0136f, 0.5000f, 0.2200f),
            ["en_ironpagoda"] = (0.8450f, 0.0145f, 0.5000f, 0.2200f),
            ["en_highpriest"] = (0.8619f, 0.0143f, 0.5000f, 0.2200f),
            ["en_giantbrute"] = (0.8100f, 0.0136f, 0.5000f, 0.2200f),
            ["en_firecart"] = (0.7055f, 0.0137f, 0.5000f, 0.2200f),
        };

        public const int Frames = 4;

        /// <summary>走路序列帧的基准帧率，和展示台 code_2 的 fps 相同。实际播放按移动速度对步；比它慢的（首领、精英）取对步帧率和它的几何平均。</summary>
        public const float WalkFps = 6f;

        /// <summary>再快 8 张图就糊了。当前最快的火药兵按步幅大约 20 帧/秒，上限留在这之上。</summary>
        public const float WalkFpsMax = 24f;
    }
}
