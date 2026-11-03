/* DigiOps 短信模板字符保存校验 —— 原型交互
 * 校验规则：仅允许 GSM-7 基础字符集 + 扩展字符集；变量 #xxx# 不参与校验。
 * 前端在保存时校验一次；模拟后端接口再校验一次（直调接口也拦得住）。
 */

const GSM7_BASIC =
  '@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞ\x1bÆæßÉ !"#¤%&\'()*+,-./0123456789:;<=>?¡' +
  'ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà';
const GSM7_EXT = '^{}\\[~]|€';
const ALLOWED = new Set((GSM7_BASIC + GSM7_EXT).split(''));

const CHAR_META = {
  '—': { name: '长破折号', fix: '-' },
  '–': { name: '短破折号', fix: '-' },
  '…': { name: '省略号', fix: '...' },
  '‘': { name: '弯单引号', fix: "'" },
  '’': { name: '弯单引号', fix: "'" },
  '“': { name: '弯双引号', fix: '"' },
  '”': { name: '弯双引号', fix: '"' },
  '　': { name: '全角空格', fix: '空格' },
  '\u00a0': { name: '不间断空格', fix: '普通空格' },
  '\u2007': { name: '数字空格', fix: '普通空格' },
  '\u202f': { name: '窄不间断空格', fix: '普通空格' },
  '\u200b': { name: '零宽空格', fix: '删除' },
  '\u200c': { name: '零宽连接符', fix: '删除' },
  '\u200d': { name: '零宽连接符', fix: '删除' },
  '\ufeff': { name: '零宽不换行空格', fix: '删除' }
};

const EMOJI_RE = /\p{Extended_Pictographic}/u;
const CJK_RE = /[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]/;
const FULLWIDTH_RE = /[\uff00-\uffef\u3000-\u303f]/;

function describeChar(ch) {
  if (CHAR_META[ch]) return { ...CHAR_META[ch], code: 'U+' + ch.codePointAt(0).toString(16).toUpperCase().padStart(4, '0') };
  if (EMOJI_RE.test(ch)) return { name: 'emoji 表情', fix: '删除或改英文表述', code: 'U+' + ch.codePointAt(0).toString(16).toUpperCase() };
  if (CJK_RE.test(ch)) return { name: '中文字符', fix: '改英文表述', code: 'U+' + ch.codePointAt(0).toString(16).toUpperCase().padStart(4, '0') };
  if (FULLWIDTH_RE.test(ch)) return { name: '全角符号', fix: '改英文标点', code: 'U+' + ch.codePointAt(0).toString(16).toUpperCase().padStart(4, '0') };
  return { name: '非英文短信字符', fix: '改英文表述', code: 'U+' + ch.codePointAt(0).toString(16).toUpperCase().padStart(4, '0') };
}

/** 去掉变量占位符（#xxx#）后再校验；返回 { illegal:[{char,...}], total } */
function analyzeContent(text) {
  const withoutVars = text.replace(/#[^#\n]{1,32}#/g, '');
  const seen = new Map();
  let total = 0;
  for (const ch of withoutVars) {
    if (ALLOWED.has(ch)) continue;
    total += 1;
    if (!seen.has(ch)) seen.set(ch, describeChar(ch));
  }
  return { illegal: [...seen.entries()].map(([char, meta]) => ({ char, ...meta })), total };
}

/* ---------- 模拟后端：保存接口（自带二次校验） ---------- */
const mockServer = {
  async saveTemplate(payload) {
    await new Promise((r) => setTimeout(r, 420));
    const { illegal, total } = analyzeContent(payload.content || '');
    if (!payload.businessId) return { code: 400, message: 'BusinessID 不能为空' };
    if (!payload.name) return { code: 400, message: '模板名称不能为空' };
    if (!payload.content) return { code: 400, message: '消息内容不能为空' };
    if (illegal.length) {
      return {
        code: 422,
        message: `保存失败：内容含 ${illegal.length} 个不支持的字符`,
        data: {
          illegalChars: illegal.map((x) => x.char),
          totalOccurrences: total
        }
      };
    }
    return {
      code: 0,
      message: '保存成功',
      data: { templateId: 'TP' + new Date().toISOString().slice(0, 10).replace(/-/g, '') + '001' }
    };
  }
};

/* ---------- DOM ---------- */
const $ = (s) => document.querySelector(s);
const els = {
  businessId: $('#businessId'),
  tplName: $('#tplName'),
  content: $('#content'),
  counter: $('#charCount'),
  wrap: $('#textareaWrap'),
  err: $('#fieldError'),
  bubble: $('#phoneBubble'),
  save: $('#saveBtn'),
  cancel: $('#cancelBtn'),
  title: $('#pageTitle'),
  toast: $('#toastWrap'),
  modalMask: $('#modalMask'),
  modalBody: $('#modalBody'),
  modalTitle: $('#modalTitle'),
  apiLog: $('#apiLog')
};

const SAMPLE_VALUES = {
  '#客户姓名#': 'AKOSUA',
  '#手机号#': '024XXXXXXX',
  '#额度#': 'GHS 1,800',
  '#产品名#': 'MoMoBoost',
  '#到期日#': '2026-11-30'
};

function renderPreview() {
  let text = els.content.value.trim();
  if (!text) { els.bubble.textContent = '请输入消息内容'; return; }
  text = text.replace(/#[^#\n]{1,32}#/g, (m) => SAMPLE_VALUES[m] || m.replace(/#/g, ''));
  els.bubble.textContent = text;
}

function updateCounter() { els.counter.textContent = String(els.content.value.length); }

function clearError() {
  els.err.hidden = true;
  els.err.innerHTML = '';
  els.wrap.classList.remove('error');
}

function showError(illegal, total) {
  const MAX_SHOW = 10;
  const shown = illegal.slice(0, MAX_SHOW);
  const rest = illegal.length - shown.length;
  const chars = shown.map((x) => {
    const invisible = /\s/.test(x.char) || /\u200b|\u200c|\u200d|\ufeff/.test(x.char);
    return invisible ? `[${x.code} ${x.name}]` : `「${escapeHtml(x.char)}」`;
  }).join('') + (rest > 0 ? ` 等 ${rest} 个` : '');
  els.err.innerHTML = `内容含不支持的特殊字符：${chars}`;
  els.err.hidden = false;
  els.wrap.classList.add('error');
  els.content.focus();
}

function escapeHtml(s) { return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }

let toastTimer = null;
function toast(msg, type = 'ok') {
  const el = document.createElement('div');
  el.className = 'toast' + (type === 'error' ? ' error' : '');
  el.innerHTML = `<span class="t-ico">${type === 'error' ? '!' : '✓'}</span><span>${escapeHtml(msg)}</span>`;
  els.toast.appendChild(el);
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.remove(), 2600);
}

function collectPayload() {
  return {
    businessId: els.businessId.value,
    name: els.tplName.value.trim(),
    channel: document.querySelector('input[name="channel"]:checked')?.value,
    contentType: document.querySelector('input[name="ctype"]:checked')?.value,
    content: els.content.value
  };
}

async function handleSave() {
  clearError();
  const payload = collectPayload();
  // 必填校验
  if (!payload.businessId) { toast('请选择 BusinessID', 'error'); els.businessId.focus(); return; }
  if (!payload.name) { toast('请输入模板名称', 'error'); els.tplName.focus(); return; }
  if (!payload.content.trim()) {
    els.err.hidden = false;
    els.err.innerHTML = '此项为必填项';
    els.wrap.classList.add('error');
    els.content.focus();
    return;
  }
  // ① 前端校验
  const { illegal, total } = analyzeContent(payload.content);
  if (illegal.length) {
    showError(illegal, total);
    toast(`保存失败：内容含 ${illegal.length} 个不支持的字符`, 'error');
    return;
  }
  // ② 后端校验（同一份规则，模拟接口）
  els.save.disabled = true;
  els.save.textContent = '保存中…';
  try {
    const res = await mockServer.saveTemplate(payload);
    if (res.code !== 0) {
      // 理论上前端已拦住，这里兜底演示后端口径
      if (res.data?.illegalChars?.length) showError(res.data.illegalChars.map((c) => ({ char: c })), res.data.totalOccurrences);
      toast(res.message, 'error');
      return;
    }
    toast(`保存成功，模板编号 ${res.data.templateId}`);
  } finally {
    els.save.disabled = false;
    els.save.textContent = '保存';
  }
}

/* 直接调接口（跳过前端）：演示后端二次校验 */
async function directApi() {
  const payload = collectPayload();
  const res = await mockServer.saveTemplate(payload);
  els.apiLog.hidden = false;
  els.apiLog.textContent = 'POST /digiops/template/add\n' + JSON.stringify(
    { request: { businessId: payload.businessId, name: payload.name, content: payload.content }, response: res },
    null, 2
  );
  els.modalTitle.textContent = res.code === 0 ? '接口返回 200（保存成功）' : `接口返回 ${res.code}（被后端拦截）`;
  els.modalBody.textContent = JSON.stringify(res, null, 2);
  els.modalMask.hidden = false;
}

/* ---------- 模式切换：新建 / 编辑存量 ---------- */
const EDIT_SEED = {
  businessId: 'MTN_UG_Phone',
  name: '存量营销模板_20261025',
  content: "Good news! You're pre-qualified for up to GHS 1,800 with MoMoBoost. No paperwork needed — Dial *170# option 5 > 3 > 4 to optin and claim it now."
};

function setMode(mode) {
  document.querySelectorAll('.mode-btn').forEach((b) => b.classList.toggle('active', b.dataset.mode === mode));
  clearError();
  if (mode === 'edit') {
    els.title.textContent = '编辑模版';
    els.businessId.value = EDIT_SEED.businessId;
    els.tplName.value = EDIT_SEED.name;
    els.content.value = EDIT_SEED.content;
    toast('已载入存量模板（含「—」，保存会被拦截）', 'error');
  } else {
    els.title.textContent = '新建模版';
    els.businessId.value = '';
    els.tplName.value = '';
    els.content.value = '';
  }
  updateCounter(); renderPreview();
}

/* ---------- 事件绑定 ---------- */
els.content.addEventListener('input', () => {
  updateCounter(); renderPreview();
  clearError();
  els.err.hidden = true;
});
els.save.addEventListener('click', handleSave);
els.cancel.addEventListener('click', () => { if (confirm('确认取消？未保存内容将丢失')) setMode('create'); });
$('#backBtn').addEventListener('click', () => toast('原型演示：返回列表未实现'));
$('#modeSwitch').addEventListener('click', (e) => {
  const btn = e.target.closest('.mode-btn');
  if (btn) setMode(btn.dataset.mode);
});
$('#hideMenuBtn').addEventListener('click', () => document.querySelector('.app').classList.toggle('collapsed'));

// 插入变量：仅展示，不提供点击插入交互（避免前端误读交互口径）

// 演示填充
const FILLS = {
  accident: EDIT_SEED.content,
  mixed: '您好，您的额度是 GHS 1,800 😀 请尽快使用…',
  clean: 'GHS 1,800 ready with MoMoBoost. No fee until you borrow - checking is always free.',
  variable: 'Hello #客户姓名#, your limit is #额度#. Dial *170# option 5 > 3 > 4.'
};
document.querySelectorAll('[data-fill]').forEach((btn) => {
  btn.addEventListener('click', () => {
    els.content.value = FILLS[btn.dataset.fill];
    updateCounter(); renderPreview(); clearError();
  });
});
$('#directApiBtn').addEventListener('click', directApi);
$('#modalClose').addEventListener('click', () => (els.modalMask.hidden = true));
$('#modalOk').addEventListener('click', () => (els.modalMask.hidden = true));

// 时钟（Uganda Time = UTC+3，原型固定演示日期起步）
let tick = new Date('2026-11-03T11:32:18');
setInterval(() => {
  tick = new Date(tick.getTime() + 1000);
  const p = (n) => String(n).padStart(2, '0');
  $('#clock').textContent = `${tick.getFullYear()}/${p(tick.getMonth() + 1)}/${p(tick.getDate())} ${p(tick.getHours())}:${p(tick.getMinutes())}:${p(tick.getSeconds())}`;
}, 1000);

updateCounter(); renderPreview();
