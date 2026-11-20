// SETTINGS is generated from the same route inventory as the HTML and sitemap.
const canonicalHost = new URL(SETTINGS.origin).hostname;
const apexHost = canonicalHost.replace(/^www\./, '');
const directoryAliases = Object.fromEntries(
  Object.keys(SETTINGS.pages).filter(path => path.endsWith('/')).flatMap(path => [
    [path + 'index.html', path], ...(path === '/' ? [] : [[path.slice(0, -1), path]])
  ])
);
const retired = new Set(SETTINGS.retiredRoutes);

function redirect(url, target, includeQuery = true) {
  const destination = new URL(target, url);
  destination.search = includeQuery ? url.search : '';
  return Response.redirect(destination, 301);
}

async function servePage(request, env, key, status = 200) {
  const asset = new URL(key, request.url);
  const response = await env.ASSETS.fetch(new Request(asset, { method: request.method === 'HEAD' ? 'HEAD' : 'GET' }));
  if (!response.ok) return new Response('Page asset unavailable', { status: 500 });
  const headers = new Headers(response.headers);
  headers.set('Content-Type', 'text/html; charset=utf-8');
  headers.delete('Content-Disposition');
  headers.set('Cache-Control', 'no-cache');
  return new Response(response.body, { status, headers });
}

// Authenticated, server-to-server Meta CAPI for confirmed CRM outcomes.
// Disabled until both secrets are configured in Cloudflare Pages.
// Do NOT invoke this endpoint directly from website/browser JavaScript.
const META_DATASET_ID = '1870143103988077';
const META_GRAPH_VERSION = 'v25.0';
const CAPI_ALLOWED_EVENTS = new Set(['Lead', 'Purchase']);
function jsonResponse(status, result) {
  return new Response(JSON.stringify(result), {
    status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }
  });
}
async function hashIdentity(value) {
  const bytes = new TextEncoder().encode(value.trim().toLowerCase());
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, '0')).join('');
}
async function handleMetaCapi(request, env, url) {
  if (url.hostname !== canonicalHost) return jsonResponse(404, { error: 'Not found' });
  if (request.method !== 'POST') return jsonResponse(405, { error: 'Method not allowed' });
  if (!env.META_CAPI_ACCESS_TOKEN || !env.META_CAPI_CRM_SECRET) {
    return jsonResponse(503, { error: 'CAPI not configured' });
  }
  const auth = request.headers.get('Authorization') || '';
  if (auth !== 'Bearer ' + env.META_CAPI_CRM_SECRET) {
    return jsonResponse(401, { error: 'Unauthorized' });
  }
  const length = Number(request.headers.get('Content-Length') || 0);
  if (length > 8192) return jsonResponse(413, { error: 'Payload too large' });
  let payload;
  try {
    const body = await request.text();
    if (body.length > 8192) throw new Error('Too large');
    payload = JSON.parse(body);
  } catch {
    return jsonResponse(400, { error: 'Invalid JSON' });
  }
  if (!payload || typeof payload !== 'object' || Array.isArray(payload) ||
      payload.marketing_consent !== true ||
      !CAPI_ALLOWED_EVENTS.has(payload.event_name) ||
      typeof payload.event_id !== 'string' || !/^[a-zA-Z0-9_-]{8,120}$/.test(payload.event_id)) {
    return jsonResponse(400, { error: 'Invalid event or marketing consent absent' });
  }
  const eventTime = Number(payload.event_time);
  const now = Math.floor(Date.now() / 1000);
  if (!Number.isInteger(eventTime) || eventTime > now + 300 || eventTime < now - 604800) {
    return jsonResponse(400, { error: 'Invalid event time' });
  }
  const email = typeof payload.email === 'string' ? payload.email.trim().toLowerCase() : '';
  const phone = typeof payload.phone === 'string' ? payload.phone.replace(/\D/g, '') : '';
  if ((!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) && phone.length < 8) {
    return jsonResponse(400, { error: 'Valid email or phone required for matching' });
  }
  const userData = {};
  if (email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) userData.em = [await hashIdentity(email)];
  if (phone.length >= 8 && phone.length <= 16) userData.ph = [await hashIdentity(phone)];
  if (Object.keys(userData).length === 0) return jsonResponse(400, { error: 'No valid matching identifier' });
  // CRM lifecycle milestones are not automatically browser website actions.
  // They must not reuse browser event IDs unless the event is genuinely identical.
  const event = {
    event_name: payload.event_name,
    event_time: eventTime,
    event_id: payload.event_id,
    action_source: 'system_generated',
    user_data: userData
  };
  if (payload.event_name === 'Purchase') {
    const value = Number(payload.value);
    if (!Number.isFinite(value) || value <= 0 || value > 100000000 ||
        payload.currency !== 'MYR') return jsonResponse(400, { error: 'Valid MYR purchase value required' });
    event.custom_data = { currency: 'MYR', value };
  }
  const apiUrl = 'https://graph.facebook.com/' + META_GRAPH_VERSION + '/' + META_DATASET_ID + '/events';
  let response;
  try {
    response = await fetch(apiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + env.META_CAPI_ACCESS_TOKEN },
      body: JSON.stringify({ data: [event], ...(env.META_CAPI_TEST_EVENT_CODE ? { test_event_code: env.META_CAPI_TEST_EVENT_CODE } : {}) })
    });
  } catch {
    return jsonResponse(502, { error: 'Meta API unavailable' });
  }
  if (!response.ok) return jsonResponse(502, { error: 'Meta rejected event', meta_status: response.status });
  const receipt = await response.json().catch(() => null);
  if (receipt?.events_received !== 1) return jsonResponse(502, { error: 'Meta receipt unconfirmed' });
  return jsonResponse(200, { accepted: true, event_id: event.event_id });
}

async function handleEnquiry(request, env, url) {
  if (url.origin !== SETTINGS.origin) return jsonResponse(404, {});
  if (!env.LEADS_DB) return jsonResponse(503, {available:false});
  try {
    if (request.method === 'GET') {
      await env.LEADS_DB.prepare('SELECT id FROM website_enquiries LIMIT 0').all();
      return jsonResponse(200, {available:true});
    }
    if (request.method !== 'POST') return jsonResponse(405, {});
    if (request.headers.get('Origin') !== SETTINGS.origin) return jsonResponse(403, {});
    if (!request.headers.get('Content-Type')?.startsWith('application/json')) return jsonResponse(415, {});
    const size = Number(request.headers.get('Content-Length'));
    if (!Number.isInteger(size) || size < 1 || size > 16384) return jsonResponse(413, {});
    let p;
    try { p = await request.json(); } catch { return jsonResponse(400, {}); }
    if (!p || !/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(p.id) ||
        !['campaign','machine_quote','location','pantry','operator'].includes(p.journey) ||
        !p.fields || typeof p.fields !== 'object' || Array.isArray(p.fields)) return jsonResponse(400, {});
    const entries = Object.entries(p.fields);
    if (entries.length > 18 || entries.some(([k,v]) => k.length > 72 || typeof v !== 'string' || v.length > 600) ||
        !p.fields['Your name']?.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(p.fields['Work email'])) return jsonResponse(400, {});
    const fieldData = JSON.stringify(p.fields);
    const label = k => {
      const v = p.analytics === true && p.attribution?.[k];
      return typeof v === 'string' && /^[\w .~+-]{1,100}$/.test(v) ? v : '(unknown)';
    };
    const db = env.LEADS_DB;
    await db.prepare('INSERT INTO website_enquiries (id,journey,fields_json,source,medium,campaign,analytics_consent,marketing_consent) VALUES (?,?,?,?,?,?,?,?) ON CONFLICT(id) DO NOTHING')
      .bind(p.id,p.journey,fieldData,label('source'),label('medium'),label('campaign'),Number(p.analytics === true),Number(p.marketing === true)).run();
    const row = await db.prepare('SELECT journey,fields_json FROM website_enquiries WHERE id=?').bind(p.id).first();
    if (row?.journey !== p.journey || row.fields_json !== fieldData) return jsonResponse(409, {});
    return jsonResponse(200, {delivered:true,id:p.id});
  } catch {
    return jsonResponse(503, {available:false});
  }
}

async function route(request, env) {
  const url = new URL(request.url);
  const path = url.pathname;
  if (path === '/api/enquiries') return handleEnquiry(request, env, url);
  if (path === '/api/meta-capi') return handleMetaCapi(request, env, url);
  const legacy = path === '/blog-post.html' ? url.searchParams.getAll('slug') : [];
  const legacyTarget = legacy.length === 1 && Object.hasOwn(SETTINGS.articleRedirects, legacy[0])
    ? SETTINGS.articleRedirects[legacy[0]] : null;
  const alias = Object.hasOwn(directoryAliases, path) ? directoryAliases[path] : null;

  if (url.hostname === apexHost) {
    return redirect(url, SETTINGS.origin + (legacyTarget || alias || path), !legacyTarget);
  }
  if (legacyTarget || alias) return redirect(url, legacyTarget || alias, !legacyTarget);
  if (retired.has(path)) return servePage(request, env, SETTINGS.pages['/404.html'], 410);
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    return new Response(null, { status: 405, headers: { Allow: 'GET, HEAD' } });
  }
  if (url.hostname !== canonicalHost && path === '/robots.txt') {
    return new Response('User-agent: *\nDisallow: /\n', { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
  }
  if (Object.hasOwn(SETTINGS.pages, path) && path !== '/404.html') {
    return servePage(request, env, SETTINGS.pages[path]);
  }
  if (/^\/assets\/[\w.-]+$/.test(path) || path === '/robots.txt' ||
      (path === '/sitemap.xml' && url.hostname === canonicalHost)) {
    const response = await env.ASSETS.fetch(request);
    if (response.status !== 404) return response;
  }
  return servePage(request, env, SETTINGS.pages['/404.html'], 404);
}

export default {
  async fetch(request, env) {
    const response = await route(request, env);
    if (new URL(request.url).hostname === canonicalHost && response.status < 400) return response;
    const headers = new Headers(response.headers);
    headers.set('X-Robots-Tag', 'noindex, nofollow');
    return new Response(response.body, { status: response.status, headers });
  }
};
