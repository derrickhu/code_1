namespace Liangshan
{
    /// <summary>好汉四帧：0/1 待机呼吸，2 蓄力，3 出手。战场格子和主界面用同一套，不要各写一个节拍。</summary>
    public static class HeroPose
    {
        public static int Frame(float time, int index, bool windup, bool release)
        {
            if (release) return 3;
            if (windup) return 2;
            return ((int)(time * 1.7f + index * 0.5f)) & 1;
        }
    }
}
