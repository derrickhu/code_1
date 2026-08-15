/**
 * XMLHttpRequest 模拟
 * PixiJS 资源加载可能会用到
 */

const platform = require('./platform');

function _invoke(xhr, name) {
  const fn = xhr[name];
  if (typeof fn !== 'function') return;
  fn.call(xhr);
}

class XMLHttpRequest {
  constructor() {
    this.readyState = 0;
    this.status = 0;
    this.statusText = '';
    this.responseText = '';
    this.response = null;
    this.responseType = '';
    this.responseURL = '';
    this.withCredentials = false;
    this.timeout = 0;

    this._method = '';
    this._url = '';
    this._headers = {};

    this.onreadystatechange = null;
    this.onload = null;
    this.onerror = null;
    this.onabort = null;
    this.ontimeout = null;
    this.onprogress = null;
  }

  open(method, url) {
    this._method = method;
    this._url = url;
    this.readyState = 1;
  }

  setRequestHeader(key, value) {
    this._headers[key] = value;
  }

  getResponseHeader(key) {
    return this._responseHeaders ? this._responseHeaders[key.toLowerCase()] : null;
  }

  getAllResponseHeaders() {
    return '';
  }

  send(data) {
    const self = this;
    const responseType = this.responseType || 'text';
    const headers = {};
    for (const key in this._headers) {
      headers[key] = String(this._headers[key]);
    }
    const requestData = data == null || typeof data === 'string' || data instanceof ArrayBuffer
      ? (data || undefined)
      : JSON.stringify(data);

    const isGet = String(this._method || 'GET').toUpperCase() === 'GET';
    const isHttp = /^https?:\/\//i.test(this._url || '');
    if (isGet && isHttp && !requestData && platform.downloadFile && platform.getFileSystemManager) {
      platform.downloadFile({
        url: this._url,
        success(res) {
          const fs = platform.getFileSystemManager();
          self.status = res.statusCode || 200;
          self.statusText = String(self.status);
          self._responseHeaders = {};
          try {
            if (responseType === 'arraybuffer') {
              self.response = fs.readFileSync(res.tempFilePath);
            } else {
              const text = fs.readFileSync(res.tempFilePath, 'utf-8');
              self.responseText = text;
              self.response = responseType === 'json' ? JSON.parse(text) : text;
            }
          } catch (e) {
            self.status = 0;
            self.readyState = 4;
            _invoke(self, 'onreadystatechange');
            _invoke(self, 'onerror');
            return;
          }
          self.readyState = 4;
          _invoke(self, 'onreadystatechange');
          _invoke(self, 'onload');
        },
        fail() {
          self.status = 0;
          self.readyState = 4;
          _invoke(self, 'onreadystatechange');
          _invoke(self, 'onerror');
        },
      });
      return;
    }

    platform.request({
      url: this._url,
      method: this._method || 'GET',
      header: headers,
      data: requestData,
      responseType: responseType === 'arraybuffer' ? 'arraybuffer' : 'text',
      dataType: responseType === 'json' ? 'json' : undefined,
      success(res) {
        self.status = res.statusCode;
        self.statusText = res.statusCode + '';
        self._responseHeaders = res.header || {};

        if (responseType === 'arraybuffer') {
          self.response = res.data;
        } else if (responseType === 'json') {
          self.response = res.data;
          self.responseText = JSON.stringify(res.data);
        } else {
          self.responseText = res.data;
          self.response = res.data;
        }

        self.readyState = 4;
        _invoke(self, 'onreadystatechange');
        _invoke(self, 'onload');
      },
      fail() {
        self.status = 0;
        self.readyState = 4;
        _invoke(self, 'onreadystatechange');
        _invoke(self, 'onerror');
      },
    });
  }

  abort() {
    _invoke(this, 'onabort');
  }

  addEventListener(type, handler) {
    this['on' + type] = handler;
  }

  removeEventListener() {}
}

Object.defineProperty(XMLHttpRequest.prototype, Symbol.toStringTag, {
  value: 'XMLHttpRequest',
  configurable: true,
});

XMLHttpRequest.UNSENT = 0;
XMLHttpRequest.OPENED = 1;
XMLHttpRequest.HEADERS_RECEIVED = 2;
XMLHttpRequest.LOADING = 3;
XMLHttpRequest.DONE = 4;

module.exports = XMLHttpRequest;
