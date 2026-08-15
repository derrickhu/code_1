/**
 * ShaderSystem 内联 patch + PIXI.settings.ADAPTER 配置（对齐 game2D_huahua）
 * 必须在 new PIXI.Application() 之前执行
 */
import { ShaderSystem, BaseImageResource, Texture, BaseTexture } from '@pixi/core';
import { settings } from '@pixi/settings';
import { getNativePlatformApi } from '@/core/PlatformService';

declare const GameGlobal: any;

const _api: any = getNativePlatformApi();
if (_api) {
  try {
    let _useOffscreen = false;
    try {
      if (typeof _api.createOffscreenCanvas === 'function') {
        const _test = _api.createOffscreenCanvas({ type: '2d', width: 1, height: 1 });
        const _testCtx = _test.getContext('2d');
        if (_testCtx) _useOffscreen = true;
      }
    } catch (_) { /* */ }

    const _create2DCanvas = (w?: number, h?: number): any => {
      let c: any;
      if (_useOffscreen) {
        try {
          c = _api.createOffscreenCanvas({ type: '2d', width: w || 1, height: h || 1 });
        } catch (_) {
          c = _api.createCanvas();
        }
      } else {
        c = _api.createCanvas();
      }
      if (w !== undefined) c.width = w;
      if (h !== undefined) c.height = h;
      return c;
    };

    settings.ADAPTER = {
      createCanvas: _create2DCanvas,
      getCanvasRenderingContext2D: (): any => {
        try {
          const c = _create2DCanvas(1, 1);
          const ctx = c.getContext('2d');
          return ctx ? ctx.constructor : Object;
        } catch { return Object; }
      },
      getWebGLRenderingContext: (): any => {
        try {
          // 勿对 GameGlobal.canvas 提前 getContext('webgl')，iOS 会只读锁死导致 Pixi 崩溃
          const c = _api.createCanvas();
          const gl = c.getContext('webgl', { stencil: true, antialias: true, alpha: true, depth: true });
          return gl ? gl.constructor : Object;
        } catch { return Object; }
      },
      getNavigator: (): any => ({
        userAgent: 'wxgame',
        gpu: null,
      }),
      getBaseUrl: (): string => '',
      getFontFaceSet: (): any => null,
      fetch: ((_url: any, _opts?: any): any => {
        return Promise.reject(new Error('fetch not available in mini game'));
      }) as any,
      parseXML: ((_xml: string): any => null) as any,
    };
  } catch (e) {
    console.warn('[pixiPatch] ADAPTER 配置失败:', e);
  }
}

if (!(ShaderSystem.prototype as any).__patched) {

const GLSL_TO_SINGLE_SETTERS: Record<string, (gl: any, loc: any, cv: any, v: any) => void> = {
  vec3(gl, loc, cv, v) { (cv[0]!==v[0]||cv[1]!==v[1]||cv[2]!==v[2])&&(cv[0]=v[0],cv[1]=v[1],cv[2]=v[2],gl.uniform3f(loc,v[0],v[1],v[2])); },
  int(gl, loc, _c, v) { gl.uniform1i(loc, v); },
  ivec2(gl, loc, _c, v) { gl.uniform2i(loc, v[0], v[1]); },
  ivec3(gl, loc, _c, v) { gl.uniform3i(loc, v[0], v[1], v[2]); },
  ivec4(gl, loc, _c, v) { gl.uniform4i(loc, v[0], v[1], v[2], v[3]); },
  uint(gl, loc, _c, v) { gl.uniform1ui(loc, v); },
  uvec2(gl, loc, _c, v) { gl.uniform2ui(loc, v[0], v[1]); },
  uvec3(gl, loc, _c, v) { gl.uniform3ui(loc, v[0], v[1], v[2]); },
  uvec4(gl, loc, _c, v) { gl.uniform4ui(loc, v[0], v[1], v[2], v[3]); },
  bvec2(gl, loc, _c, v) { gl.uniform2i(loc, v[0], v[1]); },
  bvec3(gl, loc, _c, v) { gl.uniform3i(loc, v[0], v[1], v[2]); },
  bvec4(gl, loc, _c, v) { gl.uniform4i(loc, v[0], v[1], v[2], v[3]); },
  mat2(gl, loc, _c, v) { gl.uniformMatrix2fv(loc, false, v); },
  mat4(gl, loc, _c, v) { gl.uniformMatrix4fv(loc, false, v); },
};
const GLSL_TO_ARRAY_SETTERS: Record<string, (gl: any, loc: any, cv: any, v: any) => void> = {
  float(gl, loc, _c, v) { gl.uniform1fv(loc, v); },
  vec2(gl, loc, _c, v) { gl.uniform2fv(loc, v); },
  vec3(gl, loc, _c, v) { gl.uniform3fv(loc, v); },
  vec4(gl, loc, _c, v) { gl.uniform4fv(loc, v); },
  int(gl, loc, _c, v) { gl.uniform1iv(loc, v); },
  ivec2(gl, loc, _c, v) { gl.uniform2iv(loc, v); },
  ivec3(gl, loc, _c, v) { gl.uniform3iv(loc, v); },
  ivec4(gl, loc, _c, v) { gl.uniform4iv(loc, v); },
  uint(gl, loc, _c, v) { gl.uniform1uiv(loc, v); },
  uvec2(gl, loc, _c, v) { gl.uniform2uiv(loc, v); },
  uvec3(gl, loc, _c, v) { gl.uniform3uiv(loc, v); },
  uvec4(gl, loc, _c, v) { gl.uniform4uiv(loc, v); },
  bool(gl, loc, _c, v) { gl.uniform1iv(loc, v); },
  bvec2(gl, loc, _c, v) { gl.uniform2iv(loc, v); },
  bvec3(gl, loc, _c, v) { gl.uniform3iv(loc, v); },
  bvec4(gl, loc, _c, v) { gl.uniform4iv(loc, v); },
  sampler2D(gl, loc, _c, v) { gl.uniform1iv(loc, v); },
  samplerCube(gl, loc, _c, v) { gl.uniform1iv(loc, v); },
  sampler2DArray(gl, loc, _c, v) { gl.uniform1iv(loc, v); },
};

function patchedSyncUniforms(group: any, uniformData: any, ud: any, uv: any, renderer: any): void {
  let textureCount = 0, v: any = null, cv: any = null;
  const gl = renderer.gl;
  for (const i in group.uniforms) {
    const data = uniformData[i], uvi = uv[i], udi = ud[i], gu = group.uniforms[i];
    if (!data) { if (gu.group === true) renderer.shader.syncUniformGroup(uvi); continue; }
    if (data.type==='float'&&data.size===1&&!data.isArray) { if(uvi!==udi.value){udi.value=uvi;gl.uniform1f(udi.location,uvi);} }
    else if (data.type==='bool'&&data.size===1&&!data.isArray) { if(uvi!==udi.value){udi.value=uvi;gl.uniform1i(udi.location,Number(uvi));} }
    else if ((data.type==='sampler2D'||data.type==='samplerCube'||data.type==='sampler2DArray')&&data.size===1&&!data.isArray) {
      renderer.texture.bind(uvi,textureCount); if(udi.value!==textureCount){udi.value=textureCount;gl.uniform1i(udi.location,textureCount);} textureCount++;
    } else if (data.type==='mat3'&&data.size===1&&!data.isArray) {
      gu.a!==void 0?gl.uniformMatrix3fv(udi.location,false,uvi.toArray(true)):gl.uniformMatrix3fv(udi.location,false,uvi);
    } else if (data.type==='vec2'&&data.size===1&&!data.isArray) {
      if(gu.x!==void 0){cv=udi.value;v=uvi;(cv[0]!==v.x||cv[1]!==v.y)&&(cv[0]=v.x,cv[1]=v.y,gl.uniform2f(udi.location,v.x,v.y));}
      else{cv=udi.value;v=uvi;(cv[0]!==v[0]||cv[1]!==v[1])&&(cv[0]=v[0],cv[1]=v[1],gl.uniform2f(udi.location,v[0],v[1]));}
    } else if (data.type==='vec4'&&data.size===1&&!data.isArray) {
      if(gu.width!==void 0){cv=udi.value;v=uvi;(cv[0]!==v.x||cv[1]!==v.y||cv[2]!==v.width||cv[3]!==v.height)&&(cv[0]=v.x,cv[1]=v.y,cv[2]=v.width,cv[3]=v.height,gl.uniform4f(udi.location,v.x,v.y,v.width,v.height));}
      else{cv=udi.value;v=uvi;(cv[0]!==v[0]||cv[1]!==v[1]||cv[2]!==v[2]||cv[3]!==v[3])&&(cv[0]=v[0],cv[1]=v[1],cv[2]=v[2],cv[3]=v[3],gl.uniform4f(udi.location,v[0],v[1],v[2],v[3]));}
    } else { (data.size===1&&!data.isArray?GLSL_TO_SINGLE_SETTERS:GLSL_TO_ARRAY_SETTERS)[data.type].call(null,gl,udi.location,udi.value,uvi); }
  }
}

Object.assign(ShaderSystem.prototype, {
  __patched: true,
  systemCheck() { /* 禁用 eval 检测 */ },
  syncUniforms(group: any, glProgram: any) {
    const self = this as any;
    patchedSyncUniforms(group, self.shader.program.uniformData, glProgram.uniformData, group.uniforms, self.renderer);
  },
});

const _isRealDevice = (() => {
  try {
    const p: any = getNativePlatformApi();
    if (!p) return false;
    return p.getSystemInfoSync().platform !== 'devtools';
  } catch { return false; }
})();

if (_isRealDevice) {
  const whitePixels = new Uint8Array(16 * 16 * 4);
  whitePixels.fill(255);
  const whiteBT = BaseTexture.fromBuffer(whitePixels, 16, 16);
  const whiteTex = new Texture(whiteBT);
  (whiteTex as any).destroy = () => {};
  try { Object.defineProperty(Texture, '_WHITE', { value: whiteTex, writable: true, configurable: true }); } catch (_e) { /* */ }
  try { Object.defineProperty(Texture, 'WHITE', { get: () => whiteTex, configurable: true }); } catch (_e) { /* */ }

  const _origUpload = BaseImageResource.prototype.upload;
  let _inUpload = false;

  let _canReadPixels = false;
  try {
    const tc = settings.ADAPTER.createCanvas(4, 4);
    const tctx = tc.getContext('2d');
    if (tctx) {
      tctx.fillStyle = '#FF0000';
      tctx.fillRect(0, 0, 4, 4);
      const td = tctx.getImageData(0, 0, 1, 1).data;
      _canReadPixels = td[0] > 200 && td[3] > 200;
    }
  } catch (_) { /* */ }

  BaseImageResource.prototype.upload = function (
    renderer: any, baseTexture: any, glTexture: any, source?: any,
  ): boolean {
    if (_inUpload) {
      return _origUpload.call(this, renderer, baseTexture, glTexture, source);
    }
    _inUpload = true;

    try {
      source = source || this.source;
      const result = _origUpload.call(this, renderer, baseTexture, glTexture, source);

      if (_canReadPixels
          && source
          && source.width > 0 && source.height > 0
          && typeof source.getContext === 'function'
          && typeof source.toTempFilePathSync === 'function') {
        try {
          const ctx = source.getContext('2d');
          if (ctx && typeof ctx.getImageData === 'function') {
            const w = source.width;
            const h = source.height;
            const imageData = ctx.getImageData(0, 0, w, h);
            const pixels = new Uint8Array(imageData.data.buffer);
            const gl = renderer.gl;
            gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL,
              baseTexture.alphaMode > 0 ? 1 : 0);
            gl.texImage2D(gl.TEXTURE_2D, 0, glTexture.internalFormat,
              w, h, 0, baseTexture.format, glTexture.type, pixels);
          }
        } catch (_e) {
          /* 回退到原始 upload 结果 */
        }
      }

      return result;
    } finally {
      _inUpload = false;
    }
  };

}

} // end if !__patched
