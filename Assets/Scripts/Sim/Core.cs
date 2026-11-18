using System;

namespace Liangshan.Sim
{
    public struct V2
    {
        public float X, Y;
        public V2(float x, float y) { X = x; Y = y; }
        public static V2 operator +(V2 a, V2 b) => new V2(a.X + b.X, a.Y + b.Y);
        public static V2 operator -(V2 a, V2 b) => new V2(a.X - b.X, a.Y - b.Y);
        public static V2 operator *(V2 a, float k) => new V2(a.X * k, a.Y * k);
        public float Len => (float)Math.Sqrt(X * X + Y * Y);
        public float Len2 => X * X + Y * Y;
        public V2 Norm { get { float l = Len; return l > 1e-5f ? new V2(X / l, Y / l) : new V2(0, 0); } }
        public static float Dist(V2 a, V2 b) => (a - b).Len;
        public static V2 Lerp(V2 a, V2 b, float k) => new V2(a.X + (b.X - a.X) * k, a.Y + (b.Y - a.Y) * k);
    }

    /// <summary>xorshift，同一个种子一局完全复现。</summary>
    public sealed class Rng
    {
        uint _s;
        public Rng(int seed) { _s = (uint)seed * 2654435761u + 1u; if (_s == 0) _s = 1; }

        public uint Next()
        {
            _s ^= _s << 13;
            _s ^= _s >> 17;
            _s ^= _s << 5;
            return _s;
        }

        public float F() => (Next() & 0xFFFFFF) / 16777216f;
        public float Range(float a, float b) => a + (b - a) * F();
        public int Int(int n) => n <= 0 ? 0 : (int)(Next() % (uint)n);
        public bool Chance(float p) => F() < p;
    }

    public static class M
    {
        public static float Clamp(float v, float a, float b) => v < a ? a : v > b ? b : v;
        public static float Clamp01(float v) => Clamp(v, 0, 1);
        public static int Clamp(int v, int a, int b) => v < a ? a : v > b ? b : v;
    }
}
