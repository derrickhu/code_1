var MiniGameHostLib = {
  $MiniGameHost: {
    inited: false,
    fromSidebar: 0,
    ads: {},
    adBusy: false,

    tt: function () {
      if (typeof GameGlobal !== 'undefined' && GameGlobal.__tt) return GameGlobal.__tt;
      if (typeof tt !== 'undefined' && tt) return tt;
      return null;
    },

    wxOnly: function () {
      if (this.tt()) return null;
      if (typeof wx !== 'undefined' && wx) return wx;
      return null;
    },

    send: function (type, ok, data) {
      var payload = JSON.stringify({
        type: type,
        ok: ok ? 1 : 0,
        data: data == null ? '' : String(data)
      });
      try {
        if (typeof SendMessage === 'function') {
          SendMessage('DouyinBridge', 'OnJsEvent', payload);
          return;
        }
        if (typeof GameGlobal !== 'undefined' && GameGlobal.Module && typeof GameGlobal.Module.SendMessage === 'function') {
          GameGlobal.Module.SendMessage('DouyinBridge', 'OnJsEvent', payload);
        }
      } catch (e) {}
    },

    isSidebarOpts: function (res) {
      if (!res) return false;
      if (res.launchFrom === 'homepage' && res.location === 'sidebar_card') return true;
      if (res.scene === '021036' || res.scene === 21036) return true;
      if (res.query && (res.query.from === 'sidebar' || res.query.launch_from === 'homepage')) return true;
      return false;
    },

    ensureInit: function () {
      if (this.inited) return;
      this.inited = true;
      var t = this.tt();
      if (!t) return;
      var self = this;
      try {
        if (typeof t.getLaunchOptionsSync === 'function') {
          var launch = t.getLaunchOptionsSync();
          if (self.isSidebarOpts(launch)) self.fromSidebar = 1;
        }
      } catch (e) {}

      try {
        if (typeof t.onShow === 'function') {
          t.onShow(function (res) {
            if (self.isSidebarOpts(res)) {
              self.fromSidebar = 1;
              self.send('sidebar_show', 1, '');
            } else {
              self.send('app_show', 1, '');
            }
          });
        }
      } catch (e) {}

      try {
        if (typeof t.onHide === 'function') {
          t.onHide(function () {
            self.send('app_hide', 1, '');
          });
        }
      } catch (e) {}
    }
  },

  MiniGame_Init: function () {
    MiniGameHost.ensureInit();
  },

  MiniGame_GetHost: function () {
    MiniGameHost.ensureInit();
    if (MiniGameHost.tt()) return 1;
    if (MiniGameHost.wxOnly()) return 2;
    return 0;
  },

  MiniGame_IsDevtools: function () {
    var t = MiniGameHost.tt();
    if (!t || typeof t.getSystemInfoSync !== 'function') return 0;
    try {
      var info = t.getSystemInfoSync();
      return info && String(info.platform || '').toLowerCase() === 'devtools' ? 1 : 0;
    } catch (e) {
      return 0;
    }
  },

  MiniGame_IsLaunchedFromSidebar: function () {
    MiniGameHost.ensureInit();
    return MiniGameHost.fromSidebar ? 1 : 0;
  },

  MiniGame_GetSafeArea: function (outBuf, bufLen) {
    var t = MiniGameHost.tt();
    if (!t || typeof t.getSystemInfoSync !== 'function') return 0;
    try {
      var info = t.getSystemInfoSync() || {};
      var sw = Number(info.screenWidth || info.windowWidth || 0);
      var sh = Number(info.screenHeight || info.windowHeight || 0);
      if (sw < 1 || sh < 1) return 0;
      var sa = info.safeArea || {};
      var safeTop = Number(sa.top || info.statusBarHeight || 0);
      var safeBottom = sa.bottom ? Math.max(0, sh - Number(sa.bottom)) : 0;
      var menuBottom = 0;
      if (typeof t.getMenuButtonBoundingClientRect === 'function') {
        try {
          var rect = t.getMenuButtonBoundingClientRect();
          if (rect && rect.bottom > 0) menuBottom = Number(rect.bottom);
        } catch (e2) {}
      }
      var str = sw + ',' + sh + ',' + safeTop + ',' + safeBottom + ',' + menuBottom;
      stringToUTF8(str, outBuf, bufLen);
      return 1;
    } catch (e) {
      return 0;
    }
  },

  MiniGame_CheckSidebar: function () {
    var t = MiniGameHost.tt();
    if (!t || typeof t.checkScene !== 'function') {
      MiniGameHost.send('sidebar_sup', 0, 'no_api');
      return;
    }
    try {
      t.checkScene({
        scene: 'sidebar',
        success: function (res) {
          var ok = res && (res.isExist === true || res.isExist === 1);
          MiniGameHost.send('sidebar_sup', ok ? 1 : 0, '');
        },
        fail: function (err) {
          MiniGameHost.send('sidebar_sup', 0, (err && err.errMsg) || '');
        }
      });
    } catch (e) {
      MiniGameHost.send('sidebar_sup', 0, String(e));
    }
  },

  MiniGame_NavigateSidebar: function () {
    var t = MiniGameHost.tt();
    if (!t || typeof t.navigateToScene !== 'function') {
      MiniGameHost.send('sidebar_nav', 0, 'no_api');
      return;
    }
    try {
      t.navigateToScene({
        scene: 'sidebar',
        success: function () {
          MiniGameHost.send('sidebar_nav', 1, '');
        },
        fail: function (err) {
          MiniGameHost.send('sidebar_nav', 0, (err && err.errMsg) || 'navigate_fail');
        }
      });
    } catch (e) {
      MiniGameHost.send('sidebar_nav', 0, String(e));
    }
  },

  MiniGame_CheckShortcut: function () {
    var t = MiniGameHost.tt();
    if (!t || typeof t.checkShortcut !== 'function') {
      MiniGameHost.send('shortcut_state', 0, 'no_api');
      return;
    }
    try {
      t.checkShortcut({
        success: function (res) {
          var exist = !!(res && res.status && res.status.exist);
          MiniGameHost.send('shortcut_state', exist ? 1 : 0, '');
        },
        fail: function () {
          MiniGameHost.send('shortcut_state', 0, '');
        }
      });
    } catch (e) {
      MiniGameHost.send('shortcut_state', 0, '');
    }
  },

  MiniGame_AddShortcut: function () {
    var t = MiniGameHost.tt();
    if (!t || typeof t.addShortcut !== 'function') {
      MiniGameHost.send('shortcut_add', 0, '当前客户端暂不支持添加桌面');
      return;
    }
    try {
      t.addShortcut({
        success: function () {
          MiniGameHost.send('shortcut_add', 1, '');
        },
        fail: function (err) {
          MiniGameHost.send('shortcut_add', 0, (err && err.errMsg) || '添加桌面未完成');
        }
      });
    } catch (e) {
      MiniGameHost.send('shortcut_add', 0, String(e));
    }
  },

  MiniGame_Login: function () {
    var t = MiniGameHost.tt();
    if (!t || typeof t.login !== 'function') {
      MiniGameHost.send('login', 0, 'no_tt_login');
      return;
    }
    try {
      t.login({
        force: false,
        success: function (res) {
          var code = (res && (res.code || res.anonymousCode)) || '';
          if (code) MiniGameHost.send('login', 1, code);
          else MiniGameHost.send('login', 0, 'empty_code');
        },
        fail: function (err) {
          MiniGameHost.send('login', 0, (err && err.errMsg) || 'tt.login fail');
        }
      });
    } catch (e) {
      MiniGameHost.send('login', 0, String(e));
    }
  },

  MiniGame_ShowRewardedAd: function (unitPtr) {
    var t = MiniGameHost.tt();
    var unit = UTF8ToString(unitPtr || 0);
    if (!t || typeof t.createRewardedVideoAd !== 'function' || !unit) {
      MiniGameHost.send('ad_error', 0, 'no_rewarded_ad_api');
      return;
    }
    if (MiniGameHost.adBusy) return;
    try {
      var ad = MiniGameHost.ads[unit];
      if (!ad) {
        ad = t.createRewardedVideoAd({ adUnitId: unit });
        ad.onClose(function (res) {
          if (!MiniGameHost.adBusy) return;
          MiniGameHost.adBusy = false;
          var ended = !res || res.isEnded === true;
          MiniGameHost.send('ad_closed', ended ? 1 : 0, unit);
          try { ad.load(); } catch (e2) {}
        });
        ad.onError(function (err) {
          var msg = err ? ((err.errCode || '') + ' ' + (err.errMsg || '')).trim() : 'ad_error';
          console.warn('[DouyinAds] error:', msg);
        });
        MiniGameHost.ads[unit] = ad;
      }
      MiniGameHost.adBusy = true;
      var failShow = function (err) {
        MiniGameHost.adBusy = false;
        var msg = err ? ((err.errCode || '') + ' ' + (err.errMsg || '')).trim() : 'show_fail';
        MiniGameHost.send('ad_error', 0, msg);
      };
      ad.show().then(function () {
        MiniGameHost.send('ad_shown', 1, unit);
      }).catch(function () {
        ad.load().then(function () {
          return ad.show();
        }).then(function () {
          MiniGameHost.send('ad_shown', 1, unit);
        }).catch(failShow);
      });
    } catch (e) {
      MiniGameHost.adBusy = false;
      MiniGameHost.send('ad_error', 0, String(e));
    }
  },

  MiniGame_ShowInterstitialAd: function (unitPtr) {
    var t = MiniGameHost.tt();
    var unit = UTF8ToString(unitPtr || 0);
    if (!t || typeof t.createInterstitialAd !== 'function' || !unit) return;
    try {
      var iad = t.createInterstitialAd({ adUnitId: unit });
      var cleanup = function () {
        try { if (typeof iad.destroy === 'function') iad.destroy(); } catch (e2) {}
      };
      if (typeof iad.onClose === 'function') iad.onClose(cleanup);
      if (typeof iad.onError === 'function') iad.onError(cleanup);
      iad.load().then(function () {
        return iad.show();
      }).catch(cleanup);
    } catch (e) {}
  },

  MiniGame_VibrateShort: function (typePtr) {
    var t = MiniGameHost.tt();
    if (!t || typeof t.vibrateShort !== 'function') return;
    try {
      var tp = UTF8ToString(typePtr || 0) || 'medium';
      t.vibrateShort({ type: tp });
    } catch (e) {}
  }
};

autoAddDeps(MiniGameHostLib, '$MiniGameHost');
mergeInto(LibraryManager.library, MiniGameHostLib);
