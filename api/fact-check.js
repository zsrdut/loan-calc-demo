// api/fact-check.js —— Fact 外部检查接收端（Vercel Edge，无依赖）
export const config = { runtime: 'edge' };

const SECRET = process.env.FACT_WEBHOOK_SECRET || '';
const TARGET = process.env.FACT_TARGET_URL || '';
const TIMEOUT_MS = 3000;

async function sign(raw) {
  const key = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(SECRET),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  );
  const buf = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(raw));
  const bytes = new Uint8Array(buf);
  let hex = '';
  for (const b of bytes) {
    hex += b.toString(16).padStart(2, '0');
  }
  return hex;
}

async function probe(url, keyword) {
  const ctrl = new AbortController();
  const timer = setTimeout(function () { ctrl.abort(); }, TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: ctrl.signal, redirect: 'follow' });
    if (res.ok === false) {
      return { ok: false, code: res.status };
    }
    if (keyword) {
      const body = await res.text();
      if (body.includes(keyword) === false) {
        return { ok: false, code: 200 };
      }
    }
    return { ok: true, code: res.status };
  } catch (e) {
    return { ok: false, code: 0 };
  } finally {
    clearTimeout(timer);
  }
}

export default async function handler(request) {
  const raw = await request.text();
  const got = request.headers.get('x-loop-signature') || '';
  const expect = 'sha256=' + await sign(raw);
  const bad = SECRET ? got !== expect : true;
  if (bad) {
    return Response.json({ status: 'failed', message: 'signature mismatch' }, { status: 401 });
  }

  const host = request.headers.get('host');
  const target = TARGET || 'https://' + host;
  const home = await probe(target, '月供');

  const status = home.ok ? 'passed' : 'failed';
  const message = home.ok ? '首页可访问且含关键词' : '首页异常，HTTP ' + home.code;
  return Response.json({ status: status, message: message, target: target }, { status: 200 });
}
