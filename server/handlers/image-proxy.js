export default async function handler(req, res) {
  try {
    const { u } = req.query || {};
    if (!u || typeof u !== 'string') {
      res.statusCode = 400;
      res.end('Missing url');
      return;
    }

    let url;
    try {
      url = new URL(u);
    } catch {
      res.statusCode = 400;
      res.end('Invalid url');
      return;
    }

    const hostOk = /\.supabase\.co$/i.test(url.hostname)
      || /firebasestorage\.googleapis\.com$/i.test(url.hostname)
      || /storage\.googleapis\.com$/i.test(url.hostname);
    const pathOk = /\/storage\/v1\/object\/public\/productimages\//i.test(url.pathname)
      || /\/o\/productimages%2F/i.test(url.pathname)
      || /\/o\/productimages\//i.test(url.pathname);
    if (!hostOk || !pathOk) {
      res.statusCode = 400;
      res.end('Blocked host or path');
      return;
    }

    const upstream = await fetch(url.toString(), { method: 'GET' });
    if (!upstream.ok) {
      res.statusCode = upstream.status;
      res.end(`Upstream error: ${upstream.status}`);
      return;
    }

    const srcType = upstream.headers.get('content-type') || '';
    let contentType = srcType;
    if (!/^image\//i.test(srcType)) {
      const pathname = url.pathname.toLowerCase();
      if (pathname.endsWith('.jpg') || pathname.endsWith('.jpeg')) contentType = 'image/jpeg';
      else if (pathname.endsWith('.png')) contentType = 'image/png';
      else if (pathname.endsWith('.gif')) contentType = 'image/gif';
      else if (pathname.endsWith('.webp')) contentType = 'image/webp';
      else contentType = 'image/jpeg';
    }

    res.statusCode = 200;
    res.setHeader('Content-Type', contentType);
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    res.setHeader('Cache-Control', 'public, max-age=604800, s-maxage=604800, stale-while-revalidate=86400');

    const reader = upstream.body;
    if (reader && typeof reader.pipe === 'function') {
      reader.pipe(res);
      return;
    }

    const buf = Buffer.from(await upstream.arrayBuffer());
    res.end(buf);
  } catch {
    res.statusCode = 500;
    res.end('Proxy error');
  }
}
