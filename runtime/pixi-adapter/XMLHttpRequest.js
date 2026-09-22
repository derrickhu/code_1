/**
 * XMLHttpRequest 模拟
 *
 * 局内布阵会连拉 CDN 立绘。开发者工具里 wx.downloadFile / createImage(https)
 * 会走全局 XMLHttpRequest。若这里再调 downloadFile，就会套娃，
 * success 回包被 DevTools structured clone 时抛
 * SystemError: An object could not be cloned。
 *
 * 开发者工具：把请求交给覆盖前保存的宿主 XHR。
 * 真机：只走 wx.request / tt.request，绝不从这里再调 downloadFile。
 */

const platform = require('./platform');

function _invoke(xhr, name) {
  const fn = xhr[name];
  if (typeof fn !== 'function') return;
  try {
    fn.call(xhr);
  } catch (e) {
    try { console.warn('[xhr]', name, e && (e.message || e)); } catch (_) { /* */ }
  }
}

function _hostXhrCtor() {
  try {
    const Ctor = typeof GameGlobal !== 'undefined' ? GameGlobal.__hostXMLHttpRequest : null;
    if (typeof Ctor === 'function' && Ctor !== XMLHttpRequest) return Ctor;
  } catch (_) { /* */ }
  return null;
}

function _plainHeader(header) {
  const out = {};
  if (!header || typeof header !== 'object') return out;
  for (const key in header) {
    const v = header[key];
    if (v == null) continue;
    out[String(key).toLowerCase()] = String(v);
  }
  return out;
}

function _plainBuffer(data) {
  if (data == null) return null;
  if (typeof ArrayBuffer !== 'undefined' && data instanceof ArrayBuffer) {
    try { return data.slice(0); } catch (_) { return data; }
  }
  if (data && typeof ArrayBuffer !== 'undefined' && data.buffer instanceof ArrayBuffer) {
    try {
      return data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength);
    } catch (_) {
      return data.buffer;
    }
  }
  return data;
}

function _requestData(data) {
  if (data == null) return undefined;
  if (typeof data === 'string') return data;
  if (typeof ArrayBuffer !== 'undefined' && data instanceof ArrayBuffer) return data;
  try { return JSON.stringify(data); } catch (_) { return undefined; }
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
    this._host = null;

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
    const Host = _hostXhrCtor();
    if (Host) {
      this._sendHost(Host, data);
      return;
    }
    this._sendWx(data);
  }

  _sendHost(Host, data) {
    const self = this;
    let xhr;
    try {
      xhr = new Host();
    } catch (_) {
      this._sendWx(data);
      return;
    }
    this._host = xhr;
    try {
      xhr.open(this._method || 'GET', this._url);
    } catch (_) {
      this._fail();
      return;
    }
    if (this.timeout) {
      try { xhr.timeout = this.timeout; } catch (_) { /* */ }
    }
    if (this.responseType) {
      try { xhr.responseType = this.responseType; } catch (_) { /* */ }
    }
    for (const key in this._headers) {
      try { xhr.setRequestHeader(key, String(this._headers[key])); } catch (_) { /* */ }
    }
    xhr.onreadystatechange = function () {
      self.readyState = xhr.readyState;
      self.status = xhr.status || 0;
      self.statusText = xhr.statusText || String(self.status);
      if (xhr.readyState !== 4) {
        _invoke(self, 'onreadystatechange');
        return;
      }
      try {
        self.response = xhr.response;
        self.responseText = xhr.responseText || '';
      } catch (_) { /* responseType=arraybuffer 时读 responseText 会抛 */ }
      _invoke(self, 'onreadystatechange');
      if (self.status >= 200 && self.status < 400) _invoke(self, 'onload');
      else _invoke(self, 'onerror');
    };
    xhr.onerror = function () { self._fail(); };
    xhr.ontimeout = function () {
      _invoke(self, 'ontimeout');
      self._fail();
    };
    try {
      xhr.send(data == null ? null : data);
    } catch (_) {
      this._fail();
    }
  }

  _sendWx(data) {
    const self = this;
    const responseType = this.responseType || 'text';
    const wxResponseType = (responseType === 'arraybuffer' || responseType === 'blob')
      ? 'arraybuffer'
      : 'text';
    const requestData = _requestData(data);
    const opts = {
      url: String(this._url || ''),
      method: String(this._method || 'GET'),
      header: _plainHeader(this._headers),
      responseType: wxResponseType,
      success(res) {
        try {
          const status = Number(res && res.statusCode) || 0;
          self.status = status;
          self.statusText = String(status);
          self._responseHeaders = _plainHeader(res && res.header);
          const raw = res ? res.data : null;
          if (wxResponseType === 'arraybuffer') {
            self.response = _plainBuffer(raw);
            self.responseText = '';
          } else if (responseType === 'json') {
            self.response = typeof raw === 'string' ? (raw ? JSON.parse(raw) : null) : raw;
            self.responseText = typeof raw === 'string' ? raw : JSON.stringify(raw == null ? '' : raw);
          } else {
            const text = raw == null ? '' : String(raw);
            self.responseText = text;
            self.response = text;
          }
          self.readyState = 4;
          _invoke(self, 'onreadystatechange');
          if (status >= 200 && status < 400) _invoke(self, 'onload');
          else _invoke(self, 'onerror');
        } catch (_) {
          self._fail();
        }
      },
      fail() {
        self._fail();
      },
    };
    if (requestData !== undefined) opts.data = requestData;
    if (responseType === 'json') opts.dataType = 'json';
    platform.request(opts);
  }

  _fail() {
    this.status = 0;
    this.readyState = 4;
    _invoke(this, 'onreadystatechange');
    _invoke(this, 'onerror');
  }

  abort() {
    if (this._host) {
      try { this._host.abort(); } catch (_) { /* */ }
      this._host = null;
    }
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
