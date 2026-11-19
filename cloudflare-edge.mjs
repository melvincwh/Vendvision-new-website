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

async function route(request, env) {
  const url = new URL(request.url);
  const path = url.pathname;
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
