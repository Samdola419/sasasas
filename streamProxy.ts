import type { Request, Response, Router } from 'express';
import express from 'express';
import dns from 'dns/promises';
import net from 'net';

const UPSTREAM_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

// Domains and patterns used for popunders, ad overlays, tracking, anti-devtools, and sandbox traps
const BLOCKED_HOST_PATTERNS: RegExp[] = [
  /(^|\.)createlouisville\.org$/i,
  /(^|\.)tagivi\.com$/i,
  /(^|\.)nekostream\.site$/i,
  /(^|\.)histats\.com$/i,
  /(^|\.)statlytic\.net$/i,
  /(^|\.)acscdn\.com$/i,
  /(^|\.)alchemmauls\.com$/i,
  /(^|\.)hexa\.su$/i,
  /(^|\.)googletagmanager\.com$/i,
  /(^|\.)google-analytics\.com$/i,
  /(^|\.)googlesyndication\.com$/i,
  /(^|\.)doubleclick\.net$/i,
  /(^|\.)mc\.yandex\.ru$/i,
  /(^|\.)clarity\.ms$/i,
  /(^|\.)umami\.vidfast\.vc$/i,
  /(^|\.)popads\.net$/i,
  /(^|\.)popcash\.net$/i,
  /(^|\.)propellerads\.com$/i,
  /(^|\.)adsterra\.com$/i,
  /(^|\.)monetag\.com$/i,
  /(^|\.)onclickads\.net$/i,
  /(^|\.)alwingulla\.com$/i,
  /(^|\.)dtscout\.com$/i,
  /(^|\.)highperformanceformat\.com$/i,
  /(^|\.)topcreativeformat\.com$/i,
  /(^|\.)effectivegatecpm\.com$/i,
  /(^|\.)profitableratecpm\.com$/i,
  /(^|\.)adexchangeclear\.com$/i,
  /(^|\.)whos\.amung\.us$/i,
  /\.(rkp|xqb3|riet)$/i,
];

const BLOCKED_PATH_PATTERNS: RegExp[] = [
  /disable-devtool/i,
  /\/assets\/sbx\.js/i,
  /\/sandbox\.php/i,
  /\/mt\/(1ad|3p)\.js/i,
  /aclib\.js/i,
];

export function isBlockedAdOrTrapUrl(rawUrl: string): boolean {
  try {
    const u = new URL(rawUrl, 'https://placeholder.invalid');
    if (BLOCKED_HOST_PATTERNS.some((re) => re.test(u.hostname))) return true;
    if (BLOCKED_PATH_PATTERNS.some((re) => re.test(u.pathname))) return true;
  } catch {
    // ignore malformed
  }
  return false;
}

function isPrivateIp(ip: string): boolean {
  const clean = ip.replace(/^::ffff:/i, '');
  if (clean === '::1' || clean === '0:0:0:0:0:0:0:1' || clean === '0.0.0.0') return true;
  if (net.isIPv4(clean)) {
    const parts = clean.split('.').map(Number);
    if (parts[0] === 10 || parts[0] === 127 || parts[0] === 0) return true;
    if (parts[0] === 169 && parts[1] === 254) return true;
    if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return true;
    if (parts[0] === 192 && parts[1] === 168) return true;
    if (parts[0] === 100 && parts[1] >= 64 && parts[1] <= 127) return true;
    return false;
  }
  if (net.isIPv6(clean)) {
    const low = clean.toLowerCase();
    return low.startsWith('fc') || low.startsWith('fd') || low.startsWith('fe80:') || low === '::';
  }
  return false;
}

async function assertPublicTarget(urlObj: URL): Promise<void> {
  if (urlObj.protocol !== 'http:' && urlObj.protocol !== 'https:') {
    throw new Error('Invalid protocol');
  }
  const host = urlObj.hostname.toLowerCase();
  if (
    !host ||
    host === 'localhost' ||
    host.endsWith('.local') ||
    host.endsWith('.internal') ||
    host.endsWith('.localhost')
  ) {
    throw new Error('Private hostname blocked');
  }
  if (net.isIP(host)) {
    if (isPrivateIp(host)) throw new Error('Private IP blocked');
    return;
  }
  const addrs = await dns.lookup(host, { all: true }).catch(() => []);
  if (!addrs.length) throw new Error('DNS lookup failed');
  for (const a of addrs) {
    if (isPrivateIp(a.address)) throw new Error('Resolved private IP blocked');
  }
}

export function encodeOriginToken(origin: string): string {
  return Buffer.from(origin, 'utf8').toString('base64url');
}

export function decodeOriginToken(token: string): string | null {
  try {
    const raw = Buffer.from(token, 'base64url').toString('utf8');
    const u = new URL(raw);
    if ((u.protocol !== 'https:' && u.protocol !== 'http:') || u.origin !== raw) return null;
    return u.origin;
  } catch {
    return null;
  }
}

export function toProxyUrl(targetUrl: string): string {
  const u = new URL(targetUrl);
  const tok = encodeOriginToken(u.origin);
  return `/_p/${tok}${u.pathname}${u.search}${u.hash}`;
}

const SANDBOX_INLINE_RE =
  /p1 GK|shown_at|unloaded_at|\.riet|\.xqb3|\.rkp|rngyyDpC5ns|1414\.hexa\.su|alchemmauls|aclib\.runPop|acscdn\.com|_Hasync|Histats\.com|DisableDevtool|disable-devtool|sbx\.js|statlytic/i;

function buildClientShieldScript(upstreamOrigin: string, b64Token: string, virtualPathAndQuery: string): string {
  const blockHostJson = JSON.stringify(BLOCKED_HOST_PATTERNS.map((r) => r.source));
  const blockPathJson = JSON.stringify(BLOCKED_PATH_PATTERNS.map((r) => r.source));

  return `<script data-amstream-shield="1">
(function () {
  if (window.__AMSTREAM_SHIELD_LOADED__) return;
  window.__AMSTREAM_SHIELD_LOADED__ = true;

  var UPSTREAM_ORIGIN = ${JSON.stringify(upstreamOrigin)};
  var UPSTREAM_HOST = new URL(UPSTREAM_ORIGIN).hostname;
  var PROXY_PREFIX = ${JSON.stringify(`/_p/${b64Token}`)};
  var VIRTUAL_URL = ${JSON.stringify(virtualPathAndQuery)};
  var ORIGIN_BASE = location.origin;

  var AD_HOST_RES = (${blockHostJson}).map(function (s) { return new RegExp(s, 'i'); });
  var AD_PATH_RES = (${blockPathJson}).map(function (s) { return new RegExp(s, 'i'); });

  // 1. Restore virtual upstream pathname so React Router / Next.js routes cleanly
  var origReplaceState = history.replaceState.bind(history);
  var origPushState = history.pushState.bind(history);
  try {
    if (location.pathname.indexOf(PROXY_PREFIX) === 0 && VIRTUAL_URL) {
      origReplaceState(history.state, '', VIRTUAL_URL);
    }
  } catch (_) {}

  history.pushState = function (st, title, nextUrl) {
    try { return origPushState(st, title, nextUrl); } catch (_) {}
  };
  history.replaceState = function (st, title, nextUrl) {
    try { return origReplaceState(st, title, nextUrl); } catch (_) {}
  };

  function encodeB64Url(str) {
    var bytes = new TextEncoder().encode(str);
    var bin = '';
    for (var i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
    return btoa(bin).replace(/\\+/g, '-').replace(/\\//g, '_').replace(/=+$/g, '');
  }

  function isAdUrl(raw) {
    if (!raw || typeof raw !== 'string') return false;
    try {
      var u = new URL(raw, UPSTREAM_ORIGIN);
      if (AD_HOST_RES.some(function (re) { return re.test(u.hostname); })) return true;
      if (AD_PATH_RES.some(function (re) { return re.test(u.pathname); })) return true;
    } catch (_) {}
    return false;
  }

  function shouldDirect(u) {
    var h = u.hostname.toLowerCase();
    if (
      h === 'fonts.googleapis.com' ||
      h === 'fonts.gstatic.com' ||
      h === 'image.tmdb.org' ||
      h === 'images.metahub.space' ||
      h === 'wsrv.nl' ||
      h === 'api.themoviedb.org' ||
      h === 'sub.wyzie.ru' ||
      h === 'graphql.anilist.co'
    ) {
      return true;
    }
    if (u.origin !== UPSTREAM_ORIGIN && /\\.(m3u8|ts|m4s|mp4|webm|aac|key|vtt|srt|jpg|jpeg|png|webp|svg)(\\?|$)/i.test(u.pathname)) {
      return true;
    }
    return false;
  }

  function rewriteRequestUrl(raw) {
    if (!raw || typeof raw !== 'string') return raw;
    var trimmed = raw.trim();
    if (!trimmed || /^(data:|blob:|javascript:|about:|mailto:|#)/i.test(trimmed)) return raw;
    if (trimmed.indexOf('/_p/') === 0 || trimmed.indexOf(ORIGIN_BASE + '/_p/') === 0) return raw;
    if (trimmed.indexOf('/api/movies') === 0 || trimmed.indexOf('/api/tv') === 0 || trimmed.indexOf('/api/rooms/') === 0 || trimmed.indexOf('/megaplay.html') === 0) {
      return raw;
    }

    if (isAdUrl(trimmed)) return '__AMSTREAM_BLOCKED__';

    try {
      // Root-relative paths belong to the proxied upstream origin!
      if (trimmed.charAt(0) === '/' && trimmed.charAt(1) !== '/') {
        return PROXY_PREFIX + trimmed;
      }
      var abs = new URL(trimmed, UPSTREAM_ORIGIN);
      if (abs.origin === ORIGIN_BASE) {
        // If code already constructed ORIGIN_BASE + '/api/...' via window.location.origin
        if (abs.pathname.indexOf('/_p/') === 0) return abs.href;
        return PROXY_PREFIX + abs.pathname + abs.search + abs.hash;
      }
      if (shouldDirect(abs)) return abs.href;
      if (abs.protocol === 'http:' || abs.protocol === 'https:') {
        return '/_p/' + encodeB64Url(abs.origin) + abs.pathname + abs.search + abs.hash;
      }
    } catch (_) {}
    return raw;
  }

  // 2. Neutralize Sandbox Detection completely
  try {
    Object.defineProperty(Document.prototype, 'domain', {
      configurable: true,
      get: function () { return UPSTREAM_HOST; },
      set: function () { return true; }
    });
  } catch (_) {}
  try {
    Object.defineProperty(document, 'domain', {
      configurable: true,
      get: function () { return UPSTREAM_HOST; },
      set: function () { return true; }
    });
  } catch (_) {}

  try {
    var fakePointerLock = function () { return Promise.resolve(); };
    if (Element.prototype) Element.prototype.requestPointerLock = fakePointerLock;
    if (HTMLElement.prototype) HTMLElement.prototype.requestPointerLock = fakePointerLock;
    if (document) {
      document.exitPointerLock = function () {};
      Object.defineProperty(document, 'pointerLockElement', { configurable: true, get: function () { return null; } });
    }
  } catch (_) {}

  try {
    var origHasAttr = Element.prototype.hasAttribute;
    Element.prototype.hasAttribute = function (name) {
      if (String(name).toLowerCase() === 'sandbox' && this && this.tagName === 'IFRAME') return false;
      return origHasAttr.apply(this, arguments);
    };
    var origGetAttr = Element.prototype.getAttribute;
    Element.prototype.getAttribute = function (name) {
      if (String(name).toLowerCase() === 'sandbox' && this && this.tagName === 'IFRAME') return null;
      return origGetAttr.apply(this, arguments);
    };
  } catch (_) {}

  try {
    if (window.PluginArray && PluginArray.prototype && PluginArray.prototype.namedItem) {
      var origNamedItem = PluginArray.prototype.namedItem;
      PluginArray.prototype.namedItem = function (name) {
        if (/chrome pdf viewer/i.test(String(name || ''))) return null;
        return origNamedItem.apply(this, arguments);
      };
    }
  } catch (_) {}

  try {
    Object.defineProperty(window, 'SandboxDetector', {
      configurable: false,
      writable: false,
      value: {
        DEFAULT_MESSAGE: '',
        isTopLevel: function () { return true; },
        detect: function () { return Promise.resolve(false); },
        run: function (opts) {
          var o = opts || {};
          if (typeof o.onAllowed === 'function') o.onAllowed();
          if (typeof o.onResult === 'function') o.onResult(false);
          return Promise.resolve(false);
        },
        showBlockMessage: function () {}
      }
    });
  } catch (_) {}

  // Pre-lock anti-devtool & adcash hooks
  try {
    Object.defineProperty(window, 'DisableDevtool', {
      configurable: false,
      writable: false,
      value: function () {}
    });
  } catch (_) {}
  try {
    Object.defineProperty(window, 'aclib', {
      configurable: false,
      writable: false,
      value: {
        runPop: function () {},
        runAutoTag: function () {},
        runBanner: function () {},
        runInPagePush: function () {},
        runInterstitial: function () {}
      }
    });
  } catch (_) {}

  // 3. Kill 100% of Popups, Popunders, Form-Submits, and Off-Site Redirects
  var stubWin = {
    closed: false,
    focus: function () {},
    blur: function () {},
    close: function () {},
    postMessage: function () {},
    document: { write: function () {}, open: function () {}, close: function () {} },
    location: { href: '', replace: function () {}, assign: function () {} }
  };
  try {
    Object.defineProperty(window, 'open', {
      configurable: false,
      writable: false,
      value: function () { return stubWin; }
    });
  } catch (_) {
    window.open = function () { return stubWin; };
  }

  try {
    var origSubmit = HTMLFormElement.prototype.submit;
    HTMLFormElement.prototype.submit = function () {
      var t = String(this.getAttribute('target') || '').toLowerCase();
      var a = String(this.getAttribute('action') || '');
      if (t === '_blank' || t === '_top' || t === '_parent' || isAdUrl(a)) return;
      return origSubmit.apply(this, arguments);
    };
    if (HTMLFormElement.prototype.requestSubmit) {
      var origReqSubmit = HTMLFormElement.prototype.requestSubmit;
      HTMLFormElement.prototype.requestSubmit = function () {
        var t = String(this.getAttribute('target') || '').toLowerCase();
        var a = String(this.getAttribute('action') || '');
        if (t === '_blank' || t === '_top' || t === '_parent' || isAdUrl(a)) return;
        return origReqSubmit.apply(this, arguments);
      };
    }
  } catch (_) {}

  try {
    var origAnchorClick = HTMLAnchorElement.prototype.click;
    HTMLAnchorElement.prototype.click = function () {
      var href = String(this.getAttribute('href') || '');
      var target = String(this.getAttribute('target') || '').toLowerCase();
      if (target === '_blank' || target === '_top' || target === '_parent' || isAdUrl(href) || /^https?:/i.test(href)) {
        return;
      }
      return origAnchorClick.apply(this, arguments);
    };
  } catch (_) {}

  window.addEventListener('click', function (e) {
    var node = e.target;
    while (node && node !== document) {
      if (node.tagName === 'A') {
        var href = String(node.getAttribute('href') || '');
        var target = String(node.getAttribute('target') || '').toLowerCase();
        if (target === '_blank' || target === '_top' || target === '_parent' || isAdUrl(href) || /^https?:/i.test(href)) {
          e.preventDefault();
          e.stopImmediatePropagation();
          return false;
        }
      }
      node = node.parentElement;
    }
  }, true);

  window.addEventListener('auxclick', function (e) {
    var node = e.target;
    while (node && node !== document) {
      if (node.tagName === 'A') {
        e.preventDefault();
        e.stopImmediatePropagation();
        return false;
      }
      node = node.parentElement;
    }
  }, true);

  // 4. Route fetch / XHR / dynamic script / iframe / link / media seamlessly through /_p/
  function maybeExtractChapters(text) {
    if (!text || typeof text !== 'string') return;
    if (text.indexOf('"intro"') === -1 && text.indexOf('"outro"') === -1) return;
    try {
      var parsed = JSON.parse(text);
      if (parsed && typeof parsed === 'object' && (parsed.intro || parsed.outro)) {
        var intro = parsed.intro && Number(parsed.intro.end) > Number(parsed.intro.start || 0)
          ? { start: Number(parsed.intro.start) || 0, end: Number(parsed.intro.end) }
          : null;
        var outro = parsed.outro && Number(parsed.outro.end) > Number(parsed.outro.start || 0)
          ? { start: Number(parsed.outro.start) || 0, end: Number(parsed.outro.end) }
          : null;
        if (intro || outro) {
          emitParentEvent({ event: 'CHAPTERS', intro: intro, outro: outro });
        }
      }
    } catch (_) {}
  }

  var nativeFetch = window.fetch;
  if (nativeFetch) {
    window.fetch = function (input, init) {
      var reqUrl = '';
      try {
        if (typeof input === 'string') {
          var rw = rewriteRequestUrl(input);
          if (rw === '__AMSTREAM_BLOCKED__') return Promise.resolve(new Response('', { status: 204 }));
          input = rw;
          reqUrl = rw;
        } else if (input && typeof input === 'object' && input.url) {
          var rwObj = rewriteRequestUrl(input.url);
          if (rwObj === '__AMSTREAM_BLOCKED__') return Promise.resolve(new Response('', { status: 204 }));
          if (rwObj !== input.url) input = new Request(rwObj, input);
          reqUrl = rwObj;
        }
      } catch (_) {}
      var p = nativeFetch.call(this, input, init);
      if (reqUrl && /getSources|sources|episode|skip/i.test(reqUrl)) {
        p.then(function (resp) {
          try {
            if (resp && resp.ok && resp.clone) {
              resp.clone().text().then(maybeExtractChapters).catch(function () {});
            }
          } catch (_) {}
        }).catch(function () {});
      }
      return p;
    };
  }

  var nativeXhrOpen = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function (method, url) {
    var rw = rewriteRequestUrl(String(url || ''));
    if (rw === '__AMSTREAM_BLOCKED__') {
      rw = 'data:text/plain,';
    }
    this.__amstreamUrl = rw;
    var args = [method, rw];
    for (var i = 2; i < arguments.length; i++) args.push(arguments[i]);
    return nativeXhrOpen.apply(this, args);
  };

  var nativeXhrSend = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.send = function () {
    try {
      if (this.__amstreamUrl && /getSources|sources|episode|skip/i.test(this.__amstreamUrl) && !this.__amstreamHooked) {
        this.__amstreamHooked = true;
        this.addEventListener('load', function () {
          try {
            if (typeof this.responseText === 'string') maybeExtractChapters(this.responseText);
          } catch (_) {}
        });
      }
    } catch (_) {}
    return nativeXhrSend.apply(this, arguments);
  };

  function wrapSrcDescriptor(Proto, prop) {
    try {
      var desc = Object.getOwnPropertyDescriptor(Proto, prop);
      if (!desc || !desc.set || !desc.get) return;
      Object.defineProperty(Proto, prop, {
        configurable: true,
        enumerable: true,
        get: function () { return desc.get.call(this); },
        set: function (val) {
          var s = String(val || '');
          var rw = rewriteRequestUrl(s);
          if (rw === '__AMSTREAM_BLOCKED__') {
            return desc.set.call(this, Proto === HTMLIFrameElement.prototype ? 'about:blank' : 'data:text/javascript,');
          }
          return desc.set.call(this, rw);
        }
      });
    } catch (_) {}
  }

  wrapSrcDescriptor(HTMLScriptElement.prototype, 'src');
  wrapSrcDescriptor(HTMLIFrameElement.prototype, 'src');
  wrapSrcDescriptor(HTMLLinkElement.prototype, 'href');
  wrapSrcDescriptor(HTMLMediaElement.prototype, 'src');
  wrapSrcDescriptor(HTMLSourceElement.prototype, 'src');

  var nativeSetAttr = Element.prototype.setAttribute;
  Element.prototype.setAttribute = function (name, val) {
    var low = String(name || '').toLowerCase();
    if ((low === 'src' || low === 'href') && (this.tagName === 'SCRIPT' || this.tagName === 'IFRAME' || this.tagName === 'LINK' || this.tagName === 'VIDEO' || this.tagName === 'SOURCE')) {
      var rw = rewriteRequestUrl(String(val || ''));
      if (rw === '__AMSTREAM_BLOCKED__') {
        val = this.tagName === 'IFRAME' ? 'about:blank' : 'data:text/javascript,';
      } else {
        val = rw;
      }
    }
    return nativeSetAttr.call(this, name, val);
  };

  // Strip dynamic ad script insertions even if inline/external
  function sanitizeNode(node) {
    if (!node || node.nodeType !== 1) return false;
    if (node.tagName === 'SCRIPT') {
      var s = String(node.getAttribute('src') || node.src || '');
      if (s && isAdUrl(s)) return true;
      var txt = node.textContent || '';
      if (txt && /aclib\\.runPop|DisableDevtool|shown_at|unloaded_at|rngyyDpC5ns|_Hasync/i.test(txt)) return true;
    }
    if (node.tagName === 'IFRAME') {
      node.removeAttribute('sandbox');
      var isrc = String(node.getAttribute('src') || node.src || '');
      if (isrc && isAdUrl(isrc)) return true;
    }
    return false;
  }

  ['appendChild', 'insertBefore', 'append', 'prepend'].forEach(function (fn) {
    try {
      var orig = Node.prototype[fn];
      if (!orig) return;
      Node.prototype[fn] = function () {
        for (var i = 0; i < arguments.length; i++) {
          if (sanitizeNode(arguments[i])) return arguments[i];
        }
        return orig.apply(this, arguments);
      };
    } catch (_) {}
  });

  // 5. Watch Room Sync Telemetry & Remote Control Bridge for <video> players
  var hookedVideos = typeof WeakSet !== 'undefined' ? new WeakSet() : null;
  var activeVideo = null;
  var lastTimeSent = 0;
  var pendingSeekTime = null;

  function emitParentEvent(payload) {
    try {
      if (window.parent && window.parent !== window) {
        window.parent.postMessage(payload, '*');
      }
    } catch (_) {}
  }

  function hookVideo(v) {
    if (!v || (hookedVideos && hookedVideos.has(v))) return;
    if (hookedVideos) hookedVideos.add(v);
    activeVideo = v;

    var sendReady = function () {
      if (typeof pendingSeekTime === 'number' && v.readyState >= 1) {
        try { v.currentTime = Math.max(0, pendingSeekTime); } catch (_) {}
        pendingSeekTime = null;
      }
      emitParentEvent({ event: 'PLAYER_READY', time: v.currentTime || 0, duration: v.duration || 0 });
    };
    if (v.readyState >= 1) sendReady();
    v.addEventListener('loadedmetadata', sendReady);
    v.addEventListener('canplay', sendReady);
    v.addEventListener('play', function () {
      activeVideo = v;
      emitParentEvent({ event: 'play', time: v.currentTime || 0, duration: v.duration || 0 });
    });
    v.addEventListener('pause', function () {
      emitParentEvent({ event: 'pause', time: v.currentTime || 0, duration: v.duration || 0 });
    });
    v.addEventListener('seeked', function () {
      emitParentEvent({ event: 'seek', time: v.currentTime || 0, duration: v.duration || 0 });
    });
    v.addEventListener('ended', function () {
      emitParentEvent({ event: 'complete', time: v.duration || v.currentTime || 0, duration: v.duration || 0 });
    });
    v.addEventListener('timeupdate', function () {
      activeVideo = v;
      var now = Date.now();
      if (now - lastTimeSent < 450) return;
      lastTimeSent = now;
      emitParentEvent({ event: 'time', time: v.currentTime || 0, duration: v.duration || 0 });
    });
  }

  function scanVideos() {
    try {
      var vids = document.querySelectorAll('video');
      for (var i = 0; i < vids.length; i++) hookVideo(vids[i]);
    } catch (_) {}
  }

  document.addEventListener('DOMContentLoaded', function () {
    scanVideos();
    try {
      new MutationObserver(scanVideos).observe(document.documentElement, { childList: true, subtree: true });
    } catch (_) {}
  });

  window.addEventListener('message', function (e) {
    if (e.source === window) return;
    var d = e.data;
    if (typeof d === 'string') {
      try { d = JSON.parse(d); } catch (_) {}
    }
    // Bubble player events up through nested proxied frames
    if (e.source !== window.parent && d && typeof d === 'object') {
      emitParentEvent(d);
      return;
    }
    if (e.source === window.parent && d && typeof d === 'object') {
      var v = activeVideo || document.querySelector('video');
      var ev = String(d.event || d.action || '').toLowerCase();
      if (v) {
        if (ev === 'play') { try { v.play().catch(function(){}); } catch (_) {} }
        else if (ev === 'pause') { try { v.pause(); } catch (_) {} }
        else if (ev === 'seek' && typeof d.time === 'number') {
          if (v.readyState >= 1) {
            try { v.currentTime = Math.max(0, d.time); } catch (_) {}
          } else {
            pendingSeekTime = Math.max(0, d.time);
          }
        }
        else if (ev === 'volume') {
          var vol = Math.max(0, Math.min(1, Number(d.volume ?? d.value) || 0));
          try { v.muted = vol === 0; v.volume = vol; } catch (_) {}
        }
      } else if (ev === 'seek' && typeof d.time === 'number') {
        pendingSeekTime = Math.max(0, d.time);
      }
      // Forward down to any child frames
      var frames = document.querySelectorAll('iframe');
      for (var i = 0; i < frames.length; i++) {
        try { frames[i].contentWindow.postMessage(d, '*'); } catch (_) {}
      }
    }
  });
})();
</script>`;
}

function rewriteHtmlDocument(html: string, upstreamUrl: URL, virtualPathAndQuery: string): string {
  const b64 = encodeOriginToken(upstreamUrl.origin);
  const proxyPrefix = `/_p/${b64}`;

  // 1. Strip blocked external scripts, meta refreshes, noscripts, and hostile inline scripts
  let out = html
    .replace(/<meta[^>]*http-equiv\s*=\s*["']?refresh["']?[^>]*>/gi, '')
    .replace(/<noscript>[\s\S]*?<\/noscript>/gi, (block) =>
      /histats|stat/i.test(block) ? '' : block
    )
    .replace(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi, (full, attrs: string, body: string) => {
      const srcMatch = /\bsrc\s*=\s*["']([^"']+)["']/i.exec(attrs);
      if (srcMatch && isBlockedAdOrTrapUrl(srcMatch[1])) return '';
      if (!srcMatch && SANDBOX_INLINE_RE.test(body)) return '';
      return full;
    });

  // 2. Rewrite root-relative & same/known-provider URLs inside HTML attributes
  out = out.replace(
    /\b(src|href|data-api|poster|action)\s*=\s*(["'])([^"']+)\2/gi,
    (full, attr: string, quote: string, val: string) => {
      const trimmed = val.trim();
      if (!trimmed || /^(data:|blob:|javascript:|mailto:|#)/i.test(trimmed)) return full;
      if (trimmed.startsWith('/_p/')) return full;

      if (trimmed.startsWith('//')) {
        const httpsUrl = 'https:' + trimmed;
        if (isBlockedAdOrTrapUrl(httpsUrl)) return `${attr}=${quote}about:blank${quote}`;
        try {
          const u = new URL(httpsUrl);
          if (u.hostname === 'fonts.googleapis.com' || u.hostname === 'fonts.gstatic.com' || u.hostname === 'wsrv.nl') {
            return full;
          }
          return `${attr}=${quote}${toProxyUrl(u.href)}${quote}`;
        } catch {
          return full;
        }
      }

      if (trimmed.startsWith('/')) {
        return `${attr}=${quote}${proxyPrefix}${trimmed}${quote}`;
      }

      if (/^https?:\/\//i.test(trimmed)) {
        if (isBlockedAdOrTrapUrl(trimmed)) return `${attr}=${quote}about:blank${quote}`;
        try {
          const u = new URL(trimmed);
          if (
            u.origin === upstreamUrl.origin ||
            /(megaplay\.buzz|vidspark\.to|vidsrc\.su|vidlink\.pro|vidfast\.pro|vidsrc\.sh|vidsrc\.to|vidsrc\.me|stellarconductornexus\.com)/i.test(
              u.hostname
            )
          ) {
            return `${attr}=${quote}${toProxyUrl(u.href)}${quote}`;
          }
        } catch {
          // ignore
        }
      }
      return full;
    }
  );

  // 3. Ensure MegaPlay settings.base_url points through our proxy so jQuery $.ajax hits same-origin
  out = out.replace(
    /(base_url\s*:\s*['"])https?:\/\/megaplay\.buzz\/?(['"])/gi,
    `$1${proxyPrefix}/$2`
  );

  // 4. Inject shield at position 0 inside <head> (or start of document)
  const shield = buildClientShieldScript(upstreamUrl.origin, b64, virtualPathAndQuery);
  if (/<head(\s[^>]*)?>/i.test(out)) {
    out = out.replace(/<head(\s[^>]*)?>/i, (m) => `${m}\n${shield}`);
  } else {
    out = `${shield}\n${out}`;
  }

  return out;
}

function rewriteJsPayload(js: string, upstreamUrl: URL): string {
  const b64 = encodeOriginToken(upstreamUrl.origin);
  let out = js;

  // MegaPlay app.main.js: disable nekostream ad injector + force SandboxDetector.isTopLevel => true & noop block DOM
  if (upstreamUrl.hostname.includes('megaplay.buzz') && upstreamUrl.pathname.includes('app.main.js')) {
    out = out
      .replace(/nekostream\.site/gi, 'invalid.localhost')
      .replace(/function checkConditionsAndAddScript\(\)\{/g, 'function checkConditionsAndAddScript(){return;')
      .replace(/function addScriptDynamically\(([^)]*)\)\{/g, 'function addScriptDynamically($1){return;')
      .replace(/function o\(\)\{try\{return e\.parent===e\}catch\{return!1\}\}/g, 'function o(){return!0}')
      .replace(/function r\(e\)\{/g, 'function r(e){return;');
  }

  // MegaPlay e1-player.min.js: remove allowed hostname redirect so it works on localhost AND Cloud Run
  if (upstreamUrl.hostname.includes('megaplay.buzz') && upstreamUrl.pathname.includes('e1-player')) {
    out = out.replace(
      /window\.location\.replace\("https:\/\/megaplay\.buzz"\+window\.location\.pathname\+window\.location\.search\)/g,
      'void 0'
    );
  }

  // VidSrc.su: bypass sandbox & Android WebView checks cleanly (preserving valid JS syntax)
  if (upstreamUrl.hostname.includes('vidsrc.su')) {
    out = out
      .replace(/rn=\(\)=>\{if\(window\.self===window\.top\)return\{blocked:!1\};/g, 'rn=()=>{return{blocked:!1};')
      .replace(/window\.self!==window\.top/g, 'false');
  }

  // Generic sandbox & domain check bypass across all provider bundles (VidLink, VidSrc, VidFast, etc.)
  out = out
    .replace(/document\.domain\s*=\s*document\.domain/g, 'void 0')
    .replace(/\.hasAttribute\(\s*["']sandbox["']\s*\)/g, '.hasAttribute("__amstream_none__")')
    .replace(/\.getAttribute\(\s*["']sandbox["']\s*\)/g, '.getAttribute("__amstream_none__")');

  // Rewrite Next.js /_next/ publicPath & chunk base strings (avoid double prefixing)
  out = out.replace(/(["'])\/_next\//g, `$1/_p/${b64}/_next/`);

  return out;
}

function rewriteCssPayload(css: string, upstreamUrl: URL): string {
  const b64 = encodeOriginToken(upstreamUrl.origin);
  return css.replace(/url\(\s*(['"]?)(\/[^)'"]+)\1\s*\)/gi, (_m, q: string, p: string) => {
    if (p.startsWith('//') || p.startsWith('/_p/')) return _m;
    return `url(${q}/_p/${b64}${p}${q})`;
  });
}

async function handleProxyRequest(req: Request, res: Response, upstreamUrl: URL): Promise<void> {
  if (isBlockedAdOrTrapUrl(upstreamUrl.href)) {
    res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
    res.status(204).end();
    return;
  }

  await assertPublicTarget(upstreamUrl);

  // Build clean forwarded headers
  const fwdHeaders: Record<string, string> = {
    'User-Agent': UPSTREAM_UA,
    Accept: String(req.headers.accept || '*/*'),
    'Accept-Language': String(req.headers['accept-language'] || 'en-US,en;q=0.9'),
    Referer: upstreamUrl.origin + '/',
    Origin: upstreamUrl.origin,
  };

  if (req.headers['x-player-key']) fwdHeaders['x-player-key'] = String(req.headers['x-player-key']);
  if (req.headers['x-requested-with']) fwdHeaders['x-requested-with'] = String(req.headers['x-requested-with']);
  if (req.headers['content-type']) fwdHeaders['content-type'] = String(req.headers['content-type']);
  if (req.headers.range) fwdHeaders.range = String(req.headers.range);

  // Read raw body for non-GET/HEAD
  let bodyBuf: Buffer | undefined;
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    if (Buffer.isBuffer(req.body) && req.body.length > 0) {
      bodyBuf = req.body;
    } else if (req.body && typeof req.body === 'object' && Object.keys(req.body).length > 0) {
      bodyBuf = Buffer.from(JSON.stringify(req.body));
    } else if (typeof req.body === 'string' && req.body.length > 0) {
      bodyBuf = Buffer.from(req.body);
    }
  }

  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 15000);
  try {
    const upstreamRes = await fetch(upstreamUrl.href, {
      method: req.method,
      headers: fwdHeaders,
      body: bodyBuf as any,
      redirect: 'follow',
      signal: ctl.signal,
    });

    const finalUrl = new URL(upstreamRes.url || upstreamUrl.href);
    const contentType = upstreamRes.headers.get('content-type') || 'application/octet-stream';

    // Set permissive embed & CORS headers
    res.setHeader('X-AMStream-Proxy', '1');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, HEAD');
    res.setHeader('Access-Control-Allow-Headers', '*');
    res.setHeader('Content-Type', contentType);

    const acceptRanges = upstreamRes.headers.get('accept-ranges');
    if (acceptRanges) res.setHeader('Accept-Ranges', acceptRanges);
    const contentRange = upstreamRes.headers.get('content-range');
    if (contentRange) res.setHeader('Content-Range', contentRange);

    if (req.method === 'HEAD') {
      res.status(upstreamRes.status).end();
      return;
    }

    if (/text\/html/i.test(contentType)) {
      const rawHtml = await upstreamRes.text();
      const virtualPathAndQuery = finalUrl.pathname + finalUrl.search + finalUrl.hash;
      const rewritten = rewriteHtmlDocument(rawHtml, finalUrl, virtualPathAndQuery);
      res.setHeader('Cache-Control', 'no-store');
      res.status(upstreamRes.status).send(rewritten);
      return;
    }

    if (/(javascript|ecmascript)/i.test(contentType) || /\.m?js(\?|$)/i.test(finalUrl.pathname)) {
      const rawJs = await upstreamRes.text();
      const rewrittenJs = rewriteJsPayload(rawJs, finalUrl);
      res.setHeader('Cache-Control', 'public, max-age=1800');
      res.status(upstreamRes.status).send(rewrittenJs);
      return;
    }

    if (/text\/css/i.test(contentType) || /\.css(\?|$)/i.test(finalUrl.pathname)) {
      const rawCss = await upstreamRes.text();
      res.setHeader('Cache-Control', 'public, max-age=3600');
      res.status(upstreamRes.status).send(rewriteCssPayload(rawCss, finalUrl));
      return;
    }

    const buf = Buffer.from(await upstreamRes.arrayBuffer());
    const cc = upstreamRes.headers.get('cache-control');
    if (cc) res.setHeader('Cache-Control', cc);
    res.status(upstreamRes.status).send(buf);
  } finally {
    clearTimeout(timer);
  }
}

export function createStreamProxyRouter(): Router {
  const router = express.Router();
  router.use(express.raw({ type: '*/*', limit: '2mb' }));

  // OPTIONS preflight
  router.options('*', (_req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, HEAD');
    res.setHeader('Access-Control-Allow-Headers', '*');
    res.status(204).end();
  });

  // Path-preserving proxy: /_p/:b64/*
  router.all('/:b64/*', async (req, res) => {
    const origin = decodeOriginToken(String(req.params.b64 || ''));
    if (!origin) return res.status(400).send('Invalid proxy origin');

    const wildcardPath = String((req.params as any)[0] || '');
    const qsIdx = req.originalUrl.indexOf('?');
    const qs = qsIdx >= 0 ? req.originalUrl.slice(qsIdx) : '';
    let targetStr = `${origin}/${wildcardPath}${qs}`;

    try {
      const u = new URL(targetStr);
      // Automatically set bypass_host=1 for MegaPlay HTML stream routes
      if (u.hostname.includes('megaplay.buzz') && u.pathname.startsWith('/stream/') && !u.pathname.includes('getSources')) {
        u.searchParams.set('bypass_host', '1');
      }
      targetStr = u.href;
      await handleProxyRequest(req, res, new URL(targetStr));
    } catch (err: any) {
      if (!res.headersSent) {
        res.status(502).send(err?.message || 'Proxy upstream error');
      }
    }
  });

  // Root-of-origin proxy: /_p/:b64
  router.all('/:b64', async (req, res) => {
    const origin = decodeOriginToken(String(req.params.b64 || ''));
    if (!origin) return res.status(400).send('Invalid proxy origin');
    const qsIdx = req.originalUrl.indexOf('?');
    const qs = qsIdx >= 0 ? req.originalUrl.slice(qsIdx) : '';
    try {
      await handleProxyRequest(req, res, new URL(`${origin}/${qs}`));
    } catch (err: any) {
      if (!res.headersSent) {
        res.status(502).send(err?.message || 'Proxy upstream error');
      }
    }
  });

  return router;
}
