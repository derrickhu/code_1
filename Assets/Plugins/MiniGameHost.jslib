var MiniGameHostLib = {
  $MiniGameHost: {
    inited: false,
    fromSidebar: 0,
    ads: {},
    adBusy: false,
    armedSubScene: '',
    armedSubTmpls: null,
    armedSubAt: 0,
    lastSubConsumedAt: 0,
    armedDyProfileAt: 0,
    lastDyProfileAt: 0,
    touchStartX: 0,
    touchStartY: 0,
    wxBtn: null,

    normalizeAvatarUrl: function (u) {
      var v = String(u || '').trim();
      if (/^http:\/\/([a-z0-9-]+\.)?(qlogo\.cn|qpic\.cn|douyinpic\.com|byteimg\.com|byteacctimg\.com|toutiaostatic\.com|snssdk\.com|pstatp\.com)\//i.test(v)) {
        v = 'https://' + v.slice(7);
      }
      return v;
    },

    emitWxUser: function (u) {
      if (!u) return;
      var nick = String(u.nickName || '').trim();
      var av = this.normalizeAvatarUrl(u.avatarUrl || '');
      var gd = Number(u.gender || 0) || 0;
      if (!nick && !av) return;
      this.send('wx_userinfo', 1, JSON.stringify({
        nickName: nick,
        avatarUrl: av,
        gender: gd
      }));
    },

    destroyWxBtn: function () {
      if (this.wxBtn) {
        try {
          if (typeof this.wxBtn.destroy === 'function') this.wxBtn.destroy();
          else if (typeof this.wxBtn.hide === 'function') this.wxBtn.hide();
        } catch (e) {}
        this.wxBtn = null;
      }
    },

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

      try {
        if (typeof t.onTouchStart === 'function') {
          t.onTouchStart(function (res) {
            var p = res && res.touches && res.touches[0];
            if (p) {
              self.touchStartX = p.clientX || p.pageX || 0;
              self.touchStartY = p.clientY || p.pageY || 0;
            }
          });
        }
        if (typeof t.onTouchCancel === 'function') {
          t.onTouchCancel(function () {
            self.armedSubTmpls = null;
            self.armedDyProfileAt = 0;
          });
        }
        if (typeof t.onTouchEnd === 'function') {
          t.onTouchEnd(function (res) {
            var p = res && res.changedTouches && res.changedTouches[0];
            if (p) {
              var dx = (p.clientX || p.pageX || 0) - self.touchStartX;
              var dy = (p.clientY || p.pageY || 0) - self.touchStartY;
              if (dx * dx + dy * dy > 36 * 36) {
                self.armedSubTmpls = null;
                self.armedDyProfileAt = 0;
                return;
              }
            }
            if (self.armedDyProfileAt > 0) {
              var profAt = self.armedDyProfileAt;
              self.armedDyProfileAt = 0;
              if (Date.now() - profAt <= 2500) {
                self.lastDyProfileAt = Date.now();
                self.invokeDyUserProfile();
                return;
              }
            }
            if (self.armedSubTmpls === null) return;
            var tmpls = self.armedSubTmpls;
            var scene = self.armedSubScene || 'all';
            var armedAt = self.armedSubAt || 0;
            self.armedSubTmpls = null;
            if (Date.now() - armedAt > 2500) return;
            self.lastSubConsumedAt = Date.now();
            self.invokeSubscribe(scene, tmpls);
          });
        }
      } catch (e) {}
    },

    resolveTmplIds: function (scene, csv) {
      var out = [];
      var pushUnique = function (id) {
        if (!id) return;
        var s = String(id).trim();
        if (s && out.indexOf(s) < 0 && out.length < 3) out.push(s);
      };
      if (csv) {
        var parts = String(csv).split(',');
        for (var i = 0; i < parts.length; i++) pushUnique(parts[i]);
      }
      if (!out.length && typeof GameGlobal !== 'undefined' && GameGlobal.managerConfig && GameGlobal.managerConfig.SUBSCRIBE_TMPL_IDS) {
        var cfg = GameGlobal.managerConfig.SUBSCRIBE_TMPL_IDS;
        if (Array.isArray(cfg)) {
          for (var j = 0; j < cfg.length; j++) pushUnique(cfg[j]);
        } else if (typeof cfg === 'object') {
          if (scene === 'update') {
            pushUnique(cfg.update);
          } else if (scene === 'patrol') {
            pushUnique(cfg.patrol);
          } else if (scene === 'sign') {
            pushUnique(cfg.sign);
          } else {
            pushUnique(cfg.patrol);
            pushUnique(cfg.sign);
          }
        }
      }
      return out.slice(0, 3);
    },

    invokeSubscribe: function (scene, ids) {
      var t = this.tt();
      var list = Array.isArray(ids) ? ids.slice(0, 3) : [];
      if (!list.length) {
        var isDev = false;
        try {
          isDev = !!(t && t.getSystemInfoSync && String((t.getSystemInfoSync() || {}).platform || '').toLowerCase() === 'devtools');
        } catch (e0) {}
        if (isDev) {
          this.send('subscribe_res', 1, scene + '|devtools_sim');
        } else {
          this.send('subscribe_res', 0, 'no_tmpl_cfg');
        }
        return;
      }

      var onOk = function (res) {
        var accepted = [];
        if (res) {
          for (var i = 0; i < list.length; i++) {
            if (res[list[i]] === 'accept') accepted.push(list[i]);
          }
        }
        if (accepted.length > 0) {
          MiniGameHost.send('subscribe_res', 1, scene + '|' + accepted.join(','));
        } else {
          MiniGameHost.send('subscribe_res', 0, 'reject');
        }
      };
      var onFail = function (err) {
        var msg = err ? ((err.errCode || err.errNo || '') + ' ' + (err.errMsg || '')).trim() : 'subscribe_fail';
        MiniGameHost.send('subscribe_res', 0, msg);
      };

      try {
        if (typeof tt !== 'undefined' && tt && typeof tt.requestSubscribeMessage === 'function') {
          tt.requestSubscribeMessage({
            tmplIds: list,
            success: onOk,
            fail: onFail
          });
        } else if (t && typeof t.requestSubscribeMessage === 'function') {
          t.requestSubscribeMessage({
            tmplIds: list,
            success: onOk,
            fail: onFail
          });
        } else {
          this.send('subscribe_res', 0, 'unsupported');
        }
      } catch (e) {
        this.send('subscribe_res', 0, String(e));
      }
    },

    invokeDyUserProfile: function () {
      var t = this.tt();
      if (!t) {
        this.send('wx_userinfo', 0, 'not_dy');
        return;
      }
      var self = this;
      var fallbackGetInfo = function () {
        if (typeof t.getUserInfo !== 'function') {
          self.send('wx_userinfo', 0, 'no_api');
          return;
        }
        try {
          t.getUserInfo({
            withCredentials: false,
            success: function (res) {
              if (res && res.userInfo && (res.userInfo.nickName || res.userInfo.avatarUrl)) {
                self.emitWxUser(res.userInfo);
              } else {
                self.send('wx_userinfo', 0, 'empty');
              }
            },
            fail: function (err) {
              self.send('wx_userinfo', 0, (err && err.errMsg) || 'dy_userinfo_fail');
            }
          });
        } catch (e2) {
          self.send('wx_userinfo', 0, String(e2));
        }
      };

      if (typeof t.getUserProfile === 'function') {
        try {
          t.getUserProfile({
            force: true,
            desc: '用于展示守村排行榜头像与昵称',
            success: function (res) {
              if (res && res.userInfo && (res.userInfo.nickName || res.userInfo.avatarUrl)) {
                self.emitWxUser(res.userInfo);
              } else {
                fallbackGetInfo();
              }
            },
            fail: function (err) {
              var msg = (err && err.errMsg) ? String(err.errMsg) : '';
              if (msg.indexOf('cancel') >= 0 || msg.indexOf('deny') >= 0 || msg.indexOf('auth deny') >= 0) {
                self.send('wx_userinfo', 0, msg);
              } else {
                fallbackGetInfo();
              }
            }
          });
          return;
        } catch (e) {}
      }

      if (typeof t.authorize === 'function') {
        try {
          t.authorize({
            scope: 'scope.userInfo',
            success: fallbackGetInfo,
            fail: function (err) {
              self.send('wx_userinfo', 0, (err && err.errMsg) || 'dy_auth_deny');
            }
          });
          return;
        } catch (e3) {}
      }
      fallbackGetInfo();
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
          var code = (res && res.code) ? String(res.code) : '';
          var anon = (res && res.anonymousCode) ? String(res.anonymousCode) : '';
          if (code || anon) MiniGameHost.send('login', 1, code + '|' + anon);
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
  },

  MiniGame_ArmSubscribe: function (scenePtr, tmplCsvPtr) {
    MiniGameHost.ensureInit();
    var scene = UTF8ToString(scenePtr || 0) || 'all';
    var csv = UTF8ToString(tmplCsvPtr || 0) || '';
    MiniGameHost.armedSubScene = scene;
    MiniGameHost.armedSubTmpls = MiniGameHost.resolveTmplIds(scene, csv);
    MiniGameHost.armedSubAt = Date.now();
  },

  MiniGame_DisarmSubscribe: function () {
    MiniGameHost.armedSubTmpls = null;
  },

  MiniGame_RequestSubscribe: function (scenePtr, tmplCsvPtr) {
    MiniGameHost.ensureInit();
    if (Date.now() - (MiniGameHost.lastSubConsumedAt || 0) < 600) return;
    MiniGameHost.armedSubTmpls = null;
    var scene = UTF8ToString(scenePtr || 0) || 'all';
    var csv = UTF8ToString(tmplCsvPtr || 0) || '';
    MiniGameHost.invokeSubscribe(scene, MiniGameHost.resolveTmplIds(scene, csv));
  },

  MiniGame_WxTrySilentUserInfo: function () {
    var w = MiniGameHost.wxOnly();
    if (!w || typeof w.getSetting !== 'function' || typeof w.getUserInfo !== 'function') return;
    var checkAuth = function () {
      try {
        w.getSetting({
          success: function (res) {
            if (res && res.authSetting && res.authSetting['scope.userInfo']) {
              w.getUserInfo({
                lang: 'zh_CN',
                success: function (u) {
                  if (u && u.userInfo) MiniGameHost.emitWxUser(u.userInfo);
                }
              });
            }
          }
        });
      } catch (e) {}
    };
    try {
      if (typeof w.getPrivacySetting === 'function') {
        w.getPrivacySetting({
          success: function (p) {
            if (p && p.needAuthorization) return;
            checkAuth();
          },
          fail: checkAuth
        });
      } else {
        checkAuth();
      }
    } catch (e2) {
      checkAuth();
    }
  },

  MiniGame_WxMountUserInfoBtn: function (xNorm, yNorm, wNorm, hNorm) {
    MiniGameHost.destroyWxBtn();
    var w = MiniGameHost.wxOnly();
    if (!w || typeof w.createUserInfoButton !== 'function') return;
    try {
      var info = (typeof w.getWindowInfo === 'function' ? w.getWindowInfo() : (typeof w.getSystemInfoSync === 'function' ? w.getSystemInfoSync() : null)) || {};
      var sw = Number(info.windowWidth || info.screenWidth || 375);
      var sh = Number(info.windowHeight || info.screenHeight || 667);
      var left = Math.max(0, Math.round(xNorm * sw));
      var top = Math.max(0, Math.round(yNorm * sh));
      var width = Math.max(20, Math.round(wNorm * sw));
      var height = Math.max(20, Math.round(hNorm * sh));
      var btn = w.createUserInfoButton({
        type: 'text',
        text: '',
        lang: 'zh_CN',
        style: {
          left: left,
          top: top,
          width: width,
          height: height,
          backgroundColor: 'rgba(0,0,0,0)',
          borderColor: 'rgba(0,0,0,0)',
          borderWidth: 0,
          borderRadius: 0,
          textAlign: 'center',
          fontSize: 1,
          lineHeight: height
        }
      });
      if (btn && typeof btn.onTap === 'function') {
        btn.onTap(function (res) {
          if (res && res.userInfo && (res.userInfo.nickName || res.userInfo.avatarUrl)) {
            MiniGameHost.destroyWxBtn();
            MiniGameHost.emitWxUser(res.userInfo);
          } else {
            var msg = (res && res.errMsg) ? String(res.errMsg) : 'cancel';
            MiniGameHost.send('wx_userinfo', 0, msg);
          }
        });
      }
      MiniGameHost.wxBtn = btn;
    } catch (e) {
      console.warn('[WxUserInfo] createUserInfoButton failed:', e);
    }
  },

  MiniGame_WxDestroyUserInfoBtn: function () {
    MiniGameHost.destroyWxBtn();
  },

  MiniGame_WxRequestUserInfoDirect: function () {
    var w = MiniGameHost.wxOnly();
    if (!w) {
      MiniGameHost.send('wx_userinfo', 0, 'not_wx');
      return;
    }
    var doGet = function () {
      if (typeof w.getUserInfo !== 'function') {
        MiniGameHost.send('wx_userinfo', 0, 'no_api');
        return;
      }
      try {
        w.getUserInfo({
          lang: 'zh_CN',
          success: function (res) {
            if (res && res.userInfo) MiniGameHost.emitWxUser(res.userInfo);
            else MiniGameHost.send('wx_userinfo', 0, 'empty');
          },
          fail: function (err) {
            MiniGameHost.send('wx_userinfo', 0, (err && err.errMsg) || 'getUserInfo_fail');
          }
        });
      } catch (e) {
        MiniGameHost.send('wx_userinfo', 0, String(e));
      }
    };
    try {
      if (typeof w.requirePrivacyAuthorize === 'function') {
        w.requirePrivacyAuthorize({
          success: doGet,
          fail: function (err) {
            MiniGameHost.send('wx_userinfo', 0, (err && err.errMsg) || 'privacy_deny');
          }
        });
      } else {
        doGet();
      }
    } catch (e2) {
      doGet();
    }
  },

  MiniGame_DyTrySilentUserInfo: function () {
    var t = MiniGameHost.tt();
    if (!t || typeof t.getSetting !== 'function' || typeof t.getUserInfo !== 'function') return;
    try {
      t.getSetting({
        success: function (res) {
          if (res && res.authSetting && res.authSetting['scope.userInfo']) {
            t.getUserInfo({
              withCredentials: false,
              success: function (u) {
                if (u && u.userInfo) MiniGameHost.emitWxUser(u.userInfo);
              }
            });
          }
        }
      });
    } catch (e) {}
  },

  MiniGame_ArmDyUserProfile: function () {
    MiniGameHost.ensureInit();
    MiniGameHost.armedDyProfileAt = Date.now();
  },

  MiniGame_DisarmDyUserProfile: function () {
    MiniGameHost.armedDyProfileAt = 0;
  },

  MiniGame_RequestDyUserProfile: function () {
    MiniGameHost.ensureInit();
    if (Date.now() - (MiniGameHost.lastDyProfileAt || 0) < 600) return;
    MiniGameHost.armedDyProfileAt = 0;
    MiniGameHost.invokeDyUserProfile();
  },

  MiniGame_GetDeviceInfo: function (outBuf, bufLen) {
    var host = MiniGameHost.tt() || MiniGameHost.wxOnly();
    if (!host || typeof host.getSystemInfoSync !== 'function') return 0;
    try {
      var info = host.getSystemInfoSync() || {};
      var clean = function (s) {
        return String(s || '').replace(/[\|\r\n]/g, ' ').trim();
      };
      var str = clean(info.brand) + '|' + clean(info.model) + '|' + clean(info.system || info.platform) + '|' + clean(info.SDKVersion || info.sdkVersion);
      stringToUTF8(str, outBuf, bufLen);
      return 1;
    } catch (e) {
      return 0;
    }
  },

  MiniGame_WxLoadAvatar: function (reqIdPtr, urlPtr) {
    var reqId = UTF8ToString(reqIdPtr || 0) || '';
    var rawUrl = UTF8ToString(urlPtr || 0) || '';
    var url = MiniGameHost.normalizeAvatarUrl(rawUrl);
    var host = MiniGameHost.tt() || MiniGameHost.wxOnly();
    if (!host || !url || typeof host.createImage !== 'function' || typeof host.createCanvas !== 'function') {
      MiniGameHost.send('wx_avatar', 0, reqId + '|fallback');
      return;
    }
    try {
      var img = host.createImage();
      img.onload = function () {
        try {
          var sz = 96;
          var canvas = host.createCanvas();
          canvas.width = sz;
          canvas.height = sz;
          var ctx = canvas.getContext('2d');
          ctx.clearRect(0, 0, sz, sz);
          ctx.drawImage(img, 0, 0, sz, sz);
          var dataUrl = canvas.toDataURL('image/png');
          var prefix = 'base64,';
          var idx = dataUrl ? dataUrl.indexOf(prefix) : -1;
          if (idx >= 0) {
            MiniGameHost.send('wx_avatar', 1, reqId + '|' + dataUrl.slice(idx + prefix.length));
          } else {
            MiniGameHost.send('wx_avatar', 0, reqId + '|fallback');
          }
        } catch (eDraw) {
          MiniGameHost.send('wx_avatar', 0, reqId + '|fallback');
        }
      };
      img.onerror = function () {
        MiniGameHost.send('wx_avatar', 0, reqId + '|error');
      };
      img.src = url;
    } catch (e) {
      MiniGameHost.send('wx_avatar', 0, reqId + '|fallback');
    }
  }
};

autoAddDeps(MiniGameHostLib, '$MiniGameHost');
mergeInto(LibraryManager.library, MiniGameHostLib);
