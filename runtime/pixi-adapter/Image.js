/**
 * Image 构造函数模拟
 */

const platform = require('./platform');

function Image() {
  return platform.createImage();
}

module.exports = Image;
