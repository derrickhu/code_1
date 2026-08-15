/**
 * navigator 对象模拟
 */

const platform = require('./platform');

let _sysInfo;
try {
  _sysInfo = platform.getSystemInfoSync();
} catch (e) {
  _sysInfo = {};
}

// 业界核心修复：鸿蒙 platform 为 'ohos'，很多引擎只判断 android/ios
// 需要在 userAgent 中统一输出 Android 标识，让 PixiJS 等框架正确识别为移动设备
const _platform = _sysInfo.platform || 'unknown';
const _isOHOS = _platform === 'ohos';
const _system = _sysInfo.system || '';

// 生成兼容 UA：鸿蒙走 Android UA（业界通用做法），确保引擎不误判为桌面
let _userAgent;
if (_isOHOS) {
  _userAgent = 'Mozilla/5.0 (Linux; Android 12; HarmonyOS; ' + (_sysInfo.model || 'HUAWEI') + ') AppleWebKit/537.36 (KHTML, like Gecko) MiniGame PixiJS/7';
} else if (_platform === 'android') {
  _userAgent = 'Mozilla/5.0 (Linux; Android; ' + (_sysInfo.model || '') + ') AppleWebKit/537.36 MiniGame PixiJS/7';
} else if (_platform === 'ios') {
  _userAgent = 'Mozilla/5.0 (iPhone; CPU iPhone OS) AppleWebKit/537.36 MiniGame PixiJS/7';
} else {
  _userAgent = 'Mozilla/5.0 (MiniGame; ' + _platform + ') PixiJS/7';
}

const navigator = {
  platform: _isOHOS ? 'Linux armv8l' : (_sysInfo.platform || 'unknown'),  // 鸿蒙伪装 Linux ARM
  language: _sysInfo.language || 'zh_CN',
  appVersion: '5.0 (MiniGame)',
  userAgent: _userAgent,
  onLine: true,
  maxTouchPoints: 10,
  vendor: '',
  product: '',
  productSub: '',
  hardwareConcurrency: 4,

  // PixiJS 可能会检查 gpu 信息
  gpu: '',
};

module.exports = navigator;
