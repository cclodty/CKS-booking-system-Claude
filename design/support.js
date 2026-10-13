/*
 * support.js：本地預覽用的 .dc.html 執行環境
 *
 * Claude Design 編輯器有自己的 support.js；這個檔案只用來在 repo 內直接以瀏覽器開啟畫板，
 * 畫板原始碼毋須修改。支援畫板用到的語法：
 *   {{路徑}} 取值、<sc-for list as>、<sc-if value>、<helmet>、
 *   DCLogic（props / state / setState / renderVals）、onClick / onChange 等事件。
 *
 * 網址參數可覆寫 data-props 的預設值，例如 Drawer.dc.html?mode=approval&conflict=true。
 * 加上 ?embed=1（或被同源頁面以 iframe 嵌入）則不顯示右下角的預覽工具列。
 */
(() => {
  'use strict';

  const SOURCE_ID = 'dc-source';
  const HTML_NS = 'http://www.w3.org/1999/xhtml';
  const ONLY_HOLE = /^\{\{([^{}]+)\}\}$/;
  const HOLE = /\{\{([^{}]+)\}\}/g;
  const LITERALS = { true: true, false: false, null: null, undefined: undefined };
  const PROPS = { value: true, checked: true, selected: true };

  // 把頁面其餘部分解析進 <template>，未套值的範本不會出現在真實 DOM。
  // （瀏覽器的預先載入掃描器仍可能請求一次 src="{{…}}" 圖片，失敗無妨。）
  const me = document.currentScript;
  if (document.readyState === 'loading' && me && !me.async && !me.defer) {
    document.write('<template id="' + SOURCE_ID + '">');
  }
  const hide = document.createElement('style');
  hide.textContent = 'x-dc{display:none}';
  document.head.appendChild(hide);

  class DCLogic {
    constructor(props) {
      this.props = props || {};
      this.state = {};
    }
    setState(update) {
      const patch = typeof update === 'function' ? update(this.state, this.props) : update;
      this.state = Object.assign({}, this.state, patch);
      if (this.__dcSchedule) this.__dcSchedule();
    }
    renderVals() {
      return {};
    }
  }
  window.DCLogic = DCLogic;

  // ---------- 取值 ----------

  function lookup(path, scope) {
    path = path.trim();
    if (Object.prototype.hasOwnProperty.call(LITERALS, path)) return LITERALS[path];
    if (/^-?\d+(\.\d+)?$/.test(path)) return Number(path);
    if (/^(['"]).*\1$/.test(path)) return path.slice(1, -1);
    const segs = path.split('.');
    let cur = scope[segs[0]];
    for (let i = 1; i < segs.length && cur != null; i++) cur = cur[segs[i]];
    return cur;
  }

  function holePath(value) {
    const m = ONLY_HOLE.exec(value || '');
    return m ? m[1] : value || '';
  }

  function toText(v) {
    return v == null || typeof v === 'function' ? '' : String(v);
  }

  function interpolate(str, scope) {
    return str.replace(HOLE, (_, path) => toText(lookup(path, scope)));
  }

  // ---------- 由範本產生虛擬節點 ----------

  function build(nodes, scope, out) {
    for (const node of nodes) {
      if (node.nodeType === 3) {
        out.push({ text: interpolate(node.data, scope) });
        continue;
      }
      if (node.nodeType !== 1) continue;
      const tag = node.localName;
      if (tag === 'helmet') continue;
      if (tag === 'sc-for') {
        const list = lookup(holePath(node.getAttribute('list')), scope);
        const as = node.getAttribute('as') || 'item';
        if (Array.isArray(list)) {
          for (const item of list) {
            const inner = Object.create(scope);
            inner[as] = item;
            build(node.childNodes, inner, out);
          }
        }
        continue;
      }
      if (tag === 'sc-if') {
        if (lookup(holePath(node.getAttribute('value')), scope)) build(node.childNodes, scope, out);
        continue;
      }
      if (tag === 'dc-import' || tag === 'x-import') {
        console.warn('[support.js] 本地預覽不支援 <' + tag + '>，已略過');
        continue;
      }
      out.push(element(node, scope));
    }
    return out;
  }

  function eventName(node, attr) {
    const ev = attr.slice(2);
    if (ev === 'change') {
      const tag = node.localName;
      const type = (node.getAttribute('type') || '').toLowerCase();
      if (tag === 'textarea' || (tag === 'input' && !['checkbox', 'radio', 'file'].includes(type))) return 'input';
    }
    if (ev === 'doubleclick') return 'dblclick';
    return ev;
  }

  function element(node, scope) {
    const v = { tag: node.localName, ns: node.namespaceURI, attrs: Object.create(null), props: {}, on: {}, kids: null };
    for (const a of node.attributes) {
      const name = a.name;
      if (name.startsWith('hint-')) continue;
      const m = ONLY_HOLE.exec(a.value);
      if (name.startsWith('on')) {
        const fn = m && lookup(m[1], scope);
        if (typeof fn === 'function') v.on[eventName(node, name)] = fn;
        continue;
      }
      if (!m) {
        v.attrs[name] = a.value.includes('{{') ? interpolate(a.value, scope) : a.value;
        continue;
      }
      const val = lookup(m[1], scope);
      if (PROPS[name] && v.ns === HTML_NS) {
        v.props[name] = name === 'value' ? toText(val) : !!val;
      } else if (typeof val === 'function') {
        continue;
      } else if (name.startsWith('aria-') || name.startsWith('data-')) {
        if (val != null) v.attrs[name] = String(val);
      } else if (val !== false && val != null) {
        v.attrs[name] = val === true ? '' : String(val);
      }
    }
    v.kids = build(node.childNodes, scope, []);
    return v;
  }

  // ---------- 套用到真實 DOM ----------

  let schedule = () => {};

  function listen(el, type) {
    el.__dcTypes = el.__dcTypes || {};
    if (el.__dcTypes[type]) return;
    el.__dcTypes[type] = true;
    el.addEventListener(type, ev => {
      const fn = el.__dcOn && el.__dcOn[type];
      if (!fn) return;
      fn(ev);
      schedule(); // 受控輸入：即使沒有 setState 亦重繪，令畫面與狀態一致
    });
  }

  function same(node, v) {
    if (v.text !== undefined) return node.nodeType === 3;
    return node.nodeType === 1 && node.localName === v.tag && node.namespaceURI === v.ns;
  }

  function create(v) {
    if (v.text !== undefined) return document.createTextNode(v.text);
    const el = v.ns === HTML_NS ? document.createElement(v.tag) : document.createElementNS(v.ns, v.tag);
    update(el, v);
    return el;
  }

  function update(el, v) {
    if (v.text !== undefined) {
      if (el.data !== v.text) el.data = v.text;
      return;
    }
    for (const a of Array.from(el.attributes)) {
      if (!(a.name in v.attrs)) el.removeAttribute(a.name);
    }
    for (const name in v.attrs) {
      if (el.getAttribute(name) !== v.attrs[name]) el.setAttribute(name, v.attrs[name]);
    }
    el.__dcOn = v.on;
    for (const type in v.on) listen(el, type);
    patchChildren(el, v.kids);
    for (const p in v.props) {
      if (el[p] !== v.props[p]) el[p] = v.props[p];
    }
  }

  function patchChildren(parent, kids) {
    for (let i = 0; i < kids.length; i++) {
      const cur = parent.childNodes[i];
      if (!cur) parent.appendChild(create(kids[i]));
      else if (same(cur, kids[i])) update(cur, kids[i]);
      else parent.replaceChild(create(kids[i]), cur);
    }
    while (parent.childNodes.length > kids.length) parent.removeChild(parent.lastChild);
  }

  // ---------- 啟動 ----------

  function fail(err) {
    console.error(err);
    const box = document.createElement('pre');
    box.style.cssText = 'margin:16px;padding:16px;border-radius:10px;background:#FDF1EF;color:#7A1A10;font:13px/1.6 ui-monospace,Consolas,monospace;white-space:pre-wrap';
    box.textContent = '畫板無法渲染：' + (err && err.stack ? err.stack : err);
    document.body.appendChild(box);
  }

  function parseParam(raw, spec) {
    const editor = spec && spec.editor;
    if (editor === 'boolean' || raw === 'true' || raw === 'false') return raw === 'true' || raw === '1';
    if (editor === 'number') return Number(raw);
    return raw;
  }

  function start() {
    const tpl = document.getElementById(SOURCE_ID);
    const src = tpl && tpl.content ? tpl.content : document;
    const xdc = src.querySelector('x-dc');
    const script = src.querySelector('script[data-dc-script]');
    if (!xdc || !script) return fail('找不到 <x-dc> 或 <script data-dc-script>');

    const helmet = xdc.querySelector('helmet');
    if (helmet) {
      for (const n of Array.from(helmet.children)) document.head.appendChild(document.importNode(n, true));
    }

    let declared = {};
    try {
      declared = JSON.parse(script.getAttribute('data-props') || '{}');
    } catch (e) {
      console.warn('[support.js] data-props 不是有效的 JSON', e);
    }
    const props = {};
    for (const k in declared) {
      if (k[0] !== '$' && declared[k] && 'default' in declared[k]) props[k] = declared[k].default;
    }
    const params = new URLSearchParams(location.search);
    params.forEach((raw, k) => {
      if (k !== 'embed') props[k] = parseParam(raw, declared[k]);
    });

    const preview = declared.$preview || {};
    if (!document.querySelector('meta[name="viewport"]')) {
      const vp = document.createElement('meta');
      vp.name = 'viewport';
      vp.content = preview.width > 500 ? 'width=' + preview.width : 'width=device-width, initial-scale=1';
      document.head.appendChild(vp);
    }

    let inst;
    try {
      const Component = compile(script.textContent);
      inst = new Component(props);
    } catch (e) {
      return fail(e);
    }

    const root = document.createElement('div');
    root.id = 'dc-root';
    document.body.appendChild(root);
    const nodes = Array.from(xdc.childNodes);

    const render = () => {
      let vals;
      try {
        vals = inst.renderVals() || {};
      } catch (e) {
        return fail(e);
      }
      patchChildren(root, build(nodes, Object.assign(Object.create(null), vals), []));
    };

    let pending = false;
    schedule = () => {
      if (pending) return;
      pending = true;
      queueMicrotask(() => {
        pending = false;
        render();
      });
    };
    inst.__dcSchedule = schedule;
    root.addEventListener('submit', e => e.preventDefault());

    render();
    if (typeof inst.componentDidMount === 'function') inst.componentDidMount();

    if (!params.has('embed') && !sameOriginFrame()) toolbar(declared, inst, render);
  }

  // 頁面的內容安全政策若禁止 eval，改以內嵌 <script> 執行畫板的 Component
  function compile(code) {
    try {
      return new Function('DCLogic', code + '\nreturn Component;')(DCLogic);
    } catch (e) {
      if (!(e instanceof EvalError)) throw e;
      const s = document.createElement('script');
      s.textContent = 'window.__dcComponent = (function (DCLogic) {\n' + code + '\nreturn Component;\n})(window.DCLogic);';
      document.head.appendChild(s);
      s.remove();
      if (!window.__dcComponent) throw e;
      return window.__dcComponent;
    }
  }

  // 總覽頁的縮圖與畫板同源；外層若是別的網站（例如 Claude 的檢視器）則照常顯示工具列
  function sameOriginFrame() {
    try {
      return !!window.frameElement;
    } catch (e) {
      return false;
    }
  }

  // 右下角預覽工具列：返回總覽、切換 data-props 情境
  function toolbar(declared, inst, render) {
    const css = document.createElement('style');
    css.textContent = [
      '#dc-root{width:fit-content;margin:0 auto}',
      '.dcp{position:fixed;right:12px;bottom:calc(12px + env(safe-area-inset-bottom, 0px));z-index:2147483647;display:flex;align-items:center;gap:10px;padding:6px 6px 6px 14px;border-radius:999px;background:#16222E;color:#FFFFFF;font:13px/1 system-ui,"PingFang TC","Microsoft JhengHei",sans-serif;box-shadow:0 6px 24px rgba(22,34,46,.25)}',
      '.dcp a{color:#FFFFFF;text-decoration:none;font-weight:700}',
      '.dcp label{display:flex;align-items:center;gap:6px;color:#CFD6DD}',
      '.dcp select{font:inherit;padding:3px 6px;border-radius:6px;border:0}',
      '.dcp input{width:16px;height:16px;margin:0;accent-color:#5FD0B6}',
      '.dcp button{width:28px;height:28px;border:0;border-radius:50%;background:#2B3A48;color:#FFFFFF;font:16px/1 system-ui;cursor:pointer}',
      '.dcp :focus-visible{outline:2px solid #5FD0B6;outline-offset:2px}'
    ].join('\n');
    document.head.appendChild(css);

    const bar = document.createElement('div');
    bar.className = 'dcp';
    bar.setAttribute('role', 'toolbar');
    bar.setAttribute('aria-label', '預覽工具');

    const back = document.createElement('a');
    back.href = 'index.html';
    back.textContent = '← 所有畫面';
    bar.appendChild(back);

    const syncUrl = () => {
      const q = new URLSearchParams();
      for (const k in declared) {
        if (k[0] !== '$' && inst.props[k] !== declared[k].default) q.set(k, String(inst.props[k]));
      }
      const s = q.toString();
      try {
        history.replaceState(null, '', location.pathname + (s ? '?' + s : ''));
      } catch (e) {
        // 部分沙盒環境不允許改網址；情境切換照常生效
      }
    };

    for (const k in declared) {
      const spec = declared[k];
      if (k[0] === '$' || !spec) continue;
      const label = document.createElement('label');
      label.append((spec.label || k) + ' ');
      let control;
      if (spec.editor === 'enum' && Array.isArray(spec.options)) {
        control = document.createElement('select');
        for (const opt of spec.options) {
          const o = document.createElement('option');
          o.value = o.textContent = opt;
          control.appendChild(o);
        }
        control.value = inst.props[k];
        control.addEventListener('change', () => {
          inst.props[k] = control.value;
          syncUrl();
          render();
        });
      } else if (spec.editor === 'boolean') {
        control = document.createElement('input');
        control.type = 'checkbox';
        control.checked = !!inst.props[k];
        control.addEventListener('change', () => {
          inst.props[k] = control.checked;
          syncUrl();
          render();
        });
      } else {
        continue;
      }
      label.appendChild(control);
      bar.appendChild(label);
    }

    const close = document.createElement('button');
    close.type = 'button';
    close.textContent = '×';
    close.setAttribute('aria-label', '隱藏預覽工具');
    close.addEventListener('click', () => bar.remove());
    bar.appendChild(close);

    document.body.appendChild(bar);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
