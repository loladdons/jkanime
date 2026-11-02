/**
 * Jkanime adapter — versión corregida
 * cheerio = globalThis.__cheerio  |  fetch del runtime de la app
 * getDiscover(opts) con opts = { page, tipo, estado, orden, ... }
 */

var BASE = 'https://jkanime.net';
var CDN  = 'https://cdn.jkdesu.com';
var UA   = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

// Fuerza carga de cheerio en el runtime (busca el string "cheerio")
var __needCheerio = typeof cheerio;

function getCheerio() {
  if (typeof globalThis !== 'undefined' && globalThis.__cheerio && typeof globalThis.__cheerio.load === 'function') {
    return globalThis.__cheerio;
  }
  if (typeof cheerio !== 'undefined' && cheerio && typeof cheerio.load === 'function') {
    return cheerio;
  }
  return null;
}

function H(extra) {
  var h = {
    'User-Agent': UA,
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
    'Accept-Language': 'es-ES,es;q=0.9,en;q=0.8',
    'Referer': BASE + '/',
    'Cache-Control': 'no-cache'
  };
  if (extra) for (var k in extra) h[k] = extra[k];
  return h;
}

function abs(u) {
  if (!u) return '';
  u = String(u).trim().replace(/^url\(['"]?/, '').replace(/['"]?\)$/, '');
  if (!u) return '';
  if (u.indexOf('//') === 0) return 'https:' + u;
  if (/^https?:/i.test(u)) return u;
  if (u.charAt(0) === '/') return BASE + u;
  if (u.indexOf('assets/') === 0) return CDN + '/' + u;
  return BASE + '/' + u;
}

function absImg(u) {
  if (!u) return '';
  u = String(u).trim();
  if (!u || u.indexOf('data:') === 0) return '';
  if (u.indexOf('assets/') === 0 || u.indexOf('/assets/') === 0) {
    return CDN + (u.charAt(0) === '/' ? u : '/' + u);
  }
  return abs(u);
}

function clean(t) {
  if (!t) return '';
  return String(t).replace(/\s+/g, ' ').trim();
}

function slugFromHref(href) {
  if (!href) return '';
  var path = String(href)
    .replace(/^https?:\/\/(www\.)?jkanime\.net/i, '')
    .replace(/^\//, '')
    .replace(/\/$/, '');
  var parts = path.split('/').filter(Boolean);
  if (parts.length >= 2 && /^\d+$/.test(parts[parts.length - 1])) parts.pop();
  if (parts.length && /^(especial|ova|pelicula)$/i.test(parts[parts.length - 1])) parts.pop();
  return parts.join('/') || (parts[0] || '');
}

function epFromHref(href) {
  if (!href) return null;
  var m = String(href).match(/\/(\d+)\/?(?:[?#]|$)/);
  return m ? parseInt(m[1], 10) : null;
}

function isCfChallenge(html) {
  if (!html || html.length < 50) return true;
  var s = html.slice(0, 800).toLowerCase();
  return s.indexOf('just a moment') >= 0 ||
    s.indexOf('cf-browser-verification') >= 0 ||
    s.indexOf('challenge-platform') >= 0 ||
    s.indexOf('_cf_chl') >= 0;
}

function fetchText(url, opts) {
  opts = opts || {};
  return fetch(url, {
    method: opts.method || 'GET',
    headers: H(opts.headers),
    body: opts.body || undefined,
    redirect: 'follow'
  }).then(function (res) {
    return res.text().then(function (body) {
      return { status: res.status, ok: res.ok, body: body, url: res.url || url };
    });
  });
}

function fetchJsonSafe(url, opts) {
  return fetchText(url, opts).then(function (r) {
    if (isCfChallenge(r.body)) return null;
    try {
      return JSON.parse(r.body);
    } catch (e) {
      return null;
    }
  }).catch(function () { return null; });
}

function parseLatestFromHtml(html) {
  var items = [];
  var seen = {};
  var ch = getCheerio();

  if (ch && !isCfChallenge(html)) {
    try {
      var $ = ch.load(html);
      $('.listadoanime-home a.bloqq, a.bloqq').each(function () {
        var $a = $(this);
        var href = $a.attr('href') || '';
        var slug = slugFromHref(href);
        if (!slug) return;
        var title = clean($a.find('h5').first().text()) || clean($a.attr('title')) || slug;
        var epTxt = clean($a.find('h6').first().text());
        var epNum = epFromHref(href);
        if (epNum == null && epTxt) {
          var n = epTxt.replace(/[^\d]/g, '');
          if (n) epNum = parseInt(n, 10);
        }
        var poster =
          $a.find('.anime__sidebar__comment__item__pic img').attr('src') ||
          $a.find('img').attr('src') ||
          $a.find('img').attr('data-src') ||
          '';
        var key = slug + '/' + (epNum || 0);
        if (seen[key]) return;
        seen[key] = true;
        items.push({
          id: epNum != null ? slug + '/' + epNum : slug,
          title: title + (epNum != null ? ' — Ep. ' + epNum : ''),
          poster: absImg(poster),
          backdrop: absImg(poster),
          type: 'series',
          season: 1,
          episode: epNum,
          extra: { animeId: slug, episode: epNum }
        });
      });
    } catch (e) {}
  }

  if (items.length === 0 && html && !isCfChallenge(html)) {
    var re = /href="(https?:\/\/jkanime\.net\/([^"\/]+)\/(\d+)\/?)"[^>]*>[\s\S]*?<h5[^>]*>([^<]+)<\/h5>[\s\S]*?<h6[^>]*>([^<]*)<\/h6>/gi;
    var m;
    while ((m = re.exec(html)) !== null) {
      var slug = m[2];
      var ep = parseInt(m[3], 10);
      var title = clean(m[4]);
      var key = slug + '/' + ep;
      if (seen[key]) continue;
      seen[key] = true;
      items.push({
        id: slug + '/' + ep,
        title: title + ' — Ep. ' + ep,
        poster: '',
        type: 'series',
        season: 1,
        episode: ep,
        extra: { animeId: slug, episode: ep }
      });
    }
  }

  return items;
}

function parseDirectoryFromHtml(html) {
  var items = [];
  var seen = {};
  var ch = getCheerio();

  if (ch && html && !isCfChallenge(html)) {
    try {
      var $ = ch.load(html);

      $('.g-0').each(function () {
        var $c = $(this);
        var $a = $c.find('a').first();
        var href = $a.attr('href') || $c.find('h5 a').attr('href') || '';
        var slug = slugFromHref(href);
        if (!slug || seen[slug]) return;
        var title = clean($c.find('h5 a').text()) || clean($c.find('h5').text()) || clean($a.attr('title'));
        if (!title) return;
        var poster = $c.find('img').attr('src') || $c.find('img').attr('data-src') || '';
        seen[slug] = true;
        items.push({
          id: slug,
          title: title,
          poster: absImg(poster),
          backdrop: absImg(poster),
          type: /pel[ií]cula|movie/i.test(title) ? 'movie' : 'series'
        });
      });

      if (items.length === 0) {
        $('.anime__item').each(function () {
          var $c = $(this);
          var href = $c.find('a').first().attr('href') || '';
          var slug = slugFromHref(href);
          if (!slug || seen[slug]) return;
          var title = clean($c.find('h5').text()) || clean($c.find('.title').text());
          if (!title) return;
          var poster = $c.find('img').attr('src') || $c.find('img').attr('data-src') || '';
          seen[slug] = true;
          items.push({
            id: slug,
            title: title,
            poster: absImg(poster),
            backdrop: absImg(poster),
            type: 'series'
          });
        });
      }

      if (items.length === 0) {
        $('a[href*="jkanime.net/"], a[href^="/"]').each(function () {
          var href = $(this).attr('href') || '';
          if (/\/(buscar|directorio|genero|letra|horario|login)/i.test(href)) return;
          var slug = slugFromHref(href);
          if (!slug || slug.indexOf('/') >= 0 || seen[slug]) return;
          if (slug.length < 2) return;
          var title = clean($(this).find('h5').text()) || clean($(this).attr('title')) || clean($(this).text());
          if (!title || title.length < 2 || title.length > 120) return;
          var poster = $(this).find('img').attr('src') || $(this).find('img').attr('data-src') || '';
          seen[slug] = true;
          items.push({
            id: slug,
            title: title,
            poster: absImg(poster),
            type: 'series'
          });
        });
      }
    } catch (e) {}
  }

  if (items.length === 0 && html && !isCfChallenge(html)) {
    var re = /href="(?:https?:\/\/jkanime\.net)?\/([a-z0-9][a-z0-9\-]+)\/?"[^>]*>[\s\S]{0,400}?src="([^"]+)"/gi;
    var m;
    while ((m = re.exec(html)) !== null) {
      var slug = m[1];
      if (/^(buscar|directorio|genero|letra|horario|login|ajax|assets|cdn)$/i.test(slug)) continue;
      if (seen[slug]) continue;
      seen[slug] = true;
      items.push({
        id: slug,
        title: slug.replace(/-/g, ' ').replace(/\b\w/g, function (c) { return c.toUpperCase(); }),
        poster: absImg(m[2]),
        type: 'series'
      });
      if (items.length >= 40) break;
    }
  }

  return items;
}

function parseSearchAjax(data) {
  var list = [];
  if (!data) return list;
  if (Array.isArray(data)) list = data;
  else if (Array.isArray(data.animes)) list = data.animes;
  else if (Array.isArray(data.data)) list = data.data;
  else if (Array.isArray(data.results)) list = data.results;

  return list.map(function (a) {
    var slug = a.slug || a.id || '';
    if (typeof slug === 'string' && /^https?:/i.test(slug)) slug = slugFromHref(slug);
    slug = String(slug).replace(/^\/|\/$/g, '');
    if (!slug) return null;
    return {
      id: slug,
      title: clean(a.title || a.name || slug),
      poster: absImg(a.image || a.thumbnail || a.poster || a.img || ''),
      type: 'series',
      overview: clean(a.synopsis || a.description || ''),
      year: a.year ? String(a.year) : null
    };
  }).filter(Boolean);
}

function getNews() {
  return fetchText(BASE + '/').then(function (r) {
    if (isCfChallenge(r.body)) return [];
    var latest = parseLatestFromHtml(r.body);
    var by = {};
    latest.forEach(function (it) {
      var aid = (it.extra && it.extra.animeId) || String(it.id).split('/')[0];
      if (!by[aid]) by[aid] = it;
    });
    return Object.keys(by).map(function (k) { return by[k]; }).slice(0, 24);
  }).catch(function () { return []; });
}

function getHome() {
  var maxEp = 18;
  try {
    var cfg = (typeof globalThis !== 'undefined' && globalThis.__nuvioConfig && globalThis.__nuvioConfig.current) || {};
    if (cfg.max_episodes_home) maxEp = parseInt(cfg.max_episodes_home, 10) || 18;
  } catch (e) {}

  return fetchText(BASE + '/').then(function (homeRes) {
    var html = homeRes.body || '';
    var latest = isCfChallenge(html) ? [] : parseLatestFromHtml(html).slice(0, maxEp);

    var urls = [
      BASE + '/directorio/?filtro=fecha&tipo=TV&estado=1&fecha=none&temporada=none&orden=desc',
      BASE + '/directorio/animes/',
      BASE + '/directorio/peliculas/'
    ];

    return Promise.all(urls.map(function (u) {
      return fetchText(u).then(function (r) {
        if (isCfChallenge(r.body)) return [];
        return parseDirectoryFromHtml(r.body);
      }).catch(function () { return []; });
    })).then(function (lists) {
      var enEmision = lists[0] || [];
      var animes = lists[1] || [];
      var pelis = lists[2] || [];
      var rows = [];

      if (latest.length) {
        rows.push({
          id: 'ultimos',
          title: 'Últimos episodios',
          type: 'hero',
          imageStyle: 'backdrop',
          items: latest
        });
      }
      if (enEmision.length) {
        rows.push({
          id: 'emision',
          title: 'En emisión',
          type: 'row',
          imageStyle: 'poster',
          items: enEmision.slice(0, 30)
        });
      }
      if (animes.length) {
        rows.push({
          id: 'animes',
          title: 'Animes',
          type: 'row',
          imageStyle: 'poster',
          items: animes.slice(0, 30)
        });
      }
      if (pelis.length) {
        rows.push({
          id: 'peliculas',
          title: 'Películas',
          type: 'row',
          imageStyle: 'poster',
          items: pelis.slice(0, 30)
        });
      }

      if (rows.length === 0 && html && !isCfChallenge(html)) {
        var dir = parseDirectoryFromHtml(html);
        if (dir.length) {
          rows.push({
            id: 'home',
            title: 'Destacados',
            type: 'hero',
            imageStyle: 'backdrop',
            items: dir.slice(0, 24)
          });
        }
      }

      return rows;
    });
  }).catch(function () { return []; });
}

function getDiscoverFilters() {
  return [
    {
      id: 'tipo',
      title: 'Tipo',
      options: [
        { id: 'none', name: 'Todos' },
        { id: 'TV', name: 'TV / Serie' },
        { id: 'Pelicula', name: 'Película' },
        { id: 'OVA', name: 'OVA' },
        { id: 'Especial', name: 'Especial' }
      ]
    },
    {
      id: 'estado',
      title: 'Estado',
      options: [
        { id: 'none', name: 'Todos' },
        { id: '1', name: 'En emisión' },
        { id: '2', name: 'Finalizado' }
      ]
    },
    {
      id: 'orden',
      title: 'Orden',
      options: [
        { id: 'desc', name: 'Más recientes' },
        { id: 'asc', name: 'Más antiguos' }
      ]
    }
  ];
}

function getDiscover(opts) {
  opts = opts || {};
  var page = parseInt(opts.page, 10) || 1;
  var tipo = opts.tipo || opts.type || opts.filter || 'none';
  var estado = opts.estado || opts.status || 'none';
  var orden = opts.orden || opts.order || 'desc';
  if (tipo === 'Todos' || tipo === 'all') tipo = 'none';
  if (estado === 'Todos' || estado === 'all') estado = 'none';

  var qs =
    'filtro=fecha&tipo=' + encodeURIComponent(tipo) +
    '&estado=' + encodeURIComponent(estado) +
    '&fecha=none&temporada=none&orden=' + encodeURIComponent(orden);

  var url = page > 1
    ? BASE + '/directorio/' + page + '/?' + qs
    : BASE + '/directorio/?' + qs;

  return fetchText(url).then(function (r) {
    if (isCfChallenge(r.body)) {
      var alt = BASE + '/directorio/?' + qs + (page > 1 ? '&p=' + page : '');
      return fetchText(alt).then(function (r2) {
        if (isCfChallenge(r2.body)) return { items: [], hasMore: false };
        var items = parseDirectoryFromHtml(r2.body);
        return { items: items, hasMore: items.length >= 12 };
      });
    }
    var items = parseDirectoryFromHtml(r.body);
    return { items: items, hasMore: items.length >= 12 };
  }).catch(function () {
    return { items: [], hasMore: false };
  });
}

function search(query) {
  if (!query || !String(query).trim()) return Promise.resolve([]);
  var q = String(query).trim();

  var ajaxUrl = BASE + '/ajax/ajax_search/?q=' + encodeURIComponent(q);
  return fetchJsonSafe(ajaxUrl, {
    headers: {
      'X-Requested-With': 'XMLHttpRequest',
      'Accept': 'application/json, text/javascript, */*; q=0.01',
      'Referer': BASE + '/'
    }
  }).then(function (data) {
    var items = parseSearchAjax(data);
    if (items.length) return items;

    var url = BASE + '/buscar/' + encodeURIComponent(q).replace(/%20/g, '+') + '/';
    return fetchText(url).then(function (r) {
      if (isCfChallenge(r.body)) return [];
      return parseDirectoryFromHtml(r.body);
    });
  }).catch(function () {
    var url = BASE + '/buscar/' + encodeURIComponent(q).replace(/%20/g, '+') + '/';
    return fetchText(url).then(function (r) {
      if (isCfChallenge(r.body)) return [];
      return parseDirectoryFromHtml(r.body);
    }).catch(function () { return []; });
  });
}

function getMeta(id, options) {
  options = options || {};
  if (!id) return Promise.resolve(null);

  var parts = String(id).split('/');
  var slug = parts[0];
  var wantedEp = parts[1] ? parseInt(parts[1], 10) : (options.episode != null ? parseInt(options.episode, 10) : null);

  return fetchText(BASE + '/' + slug + '/').then(function (r) {
    var html = r.body || '';
    if (isCfChallenge(html)) return null;

    var ch = getCheerio();
    var title = slug;
    var poster = '';
    var overview = '';
    var genres = [];
    var type = 'series';
    var animeId = '';

    if (ch) {
      try {
        var $ = ch.load(html);
        title =
          clean($('h1').first().text()) ||
          clean($('.anime__details__title h3').text()) ||
          clean($('meta[property="og:title"]').attr('content')) ||
          slug;
        poster =
          $('meta[property="og:image"]').attr('content') ||
          $('.anime__details__pic img').attr('src') ||
          '';
        var bg = $('.anime__details__pic').attr('style') || '';
        if (!poster && bg) {
          var bm = bg.match(/url\(['"]?([^'")]+)/);
          if (bm) poster = bm[1];
        }
        overview =
          clean($('meta[name="description"]').attr('content')) ||
          clean($('.anime__details__text p').first().text()) ||
          clean($('#sinopsis').text()) ||
          '';
        $('.anime__details__widget li a, a[href*="/genero"]').each(function () {
          var g = clean($(this).text());
          if (g && g.length < 40 && genres.indexOf(g) < 0) genres.push(g);
        });
        var widget = clean($('.anime__details__widget').text()).toLowerCase();
        if (widget.indexOf('pelicula') >= 0 || widget.indexOf('película') >= 0) type = 'movie';
        animeId =
          $('[data-anime]').first().attr('data-anime') ||
          $('div.ml-2').attr('data-anime') ||
          '';
      } catch (e) {}
    }

    if (!animeId) {
      var m = html.match(/ajax\/pagination_episodes\/(\d+)/) ||
              html.match(/ajax\/last_episode\/(\d+)/) ||
              html.match(/data-anime=["'](\d+)["']/);
      if (m) animeId = m[1];
    }
    if (title === slug) {
      var tm = html.match(/<h1[^>]*>([^<]+)<\/h1>/i) || html.match(/og:title"\s+content="([^"]+)"/i);
      if (tm) title = clean(tm[1]);
    }
    if (!poster) {
      var pm = html.match(/og:image"\s+content="([^"]+)"/i);
      if (pm) poster = pm[1];
    }
    if (!overview) {
      var om = html.match(/name="description"\s+content="([^"]+)"/i);
      if (om) overview = clean(om[1]);
    }

    var pageNums = [1];
    var pageRe = /#pag(\d+)/g;
    var pm2;
    while ((pm2 = pageRe.exec(html)) !== null) {
      var n = parseInt(pm2[1], 10);
      if (n > 0 && pageNums.indexOf(n) < 0) pageNums.push(n);
    }
    pageNums.sort(function (a, b) { return a - b; });
    if (pageNums.length > 10) pageNums = pageNums.slice(0, 10);

    function loadEpPage(p) {
      if (!animeId) return Promise.resolve([]);
      var u = BASE + '/ajax/pagination_episodes/' + animeId + '/' + p + '/';
      return fetchJsonSafe(u, {
        headers: {
          'X-Requested-With': 'XMLHttpRequest',
          'Accept': 'application/json, text/javascript, */*; q=0.01',
          'Referer': BASE + '/' + slug + '/'
        }
      }).then(function (arr) {
        if (!arr) return [];
        if (!Array.isArray(arr)) {
          if (arr.data && Array.isArray(arr.data)) arr = arr.data;
          else return [];
        }
        return arr.map(function (info) {
          var num = parseInt(info.number || info.episode || 0, 10);
          if (!num) return null;
          var img = info.image
            ? CDN + '/assets/images/animes/video/image_thumb/' + info.image
            : poster;
          return {
            id: slug + '/' + num,
            number: num,
            title: 'Episodio ' + num,
            still: absImg(img),
            overview: ''
          };
        }).filter(Boolean);
      }).catch(function () { return []; });
    }

    return Promise.all(pageNums.map(loadEpPage)).then(function (groups) {
      var episodes = [];
      var seen = {};
      groups.forEach(function (g) {
        g.forEach(function (e) {
          if (!seen[e.number]) {
            seen[e.number] = true;
            episodes.push(e);
          }
        });
      });
      episodes.sort(function (a, b) { return a.number - b.number; });

      if (episodes.length === 0 && ch) {
        try {
          var $2 = ch.load(html);
          $2('a[href*="/' + slug + '/"]').each(function () {
            var href = $2(this).attr('href') || '';
            var num = epFromHref(href);
            if (num == null || seen[num]) return;
            seen[num] = true;
            episodes.push({
              id: slug + '/' + num,
              number: num,
              title: 'Episodio ' + num,
              still: absImg(poster),
              overview: ''
            });
          });
          episodes.sort(function (a, b) { return a.number - b.number; });
        } catch (e) {}
      }

      if (type === 'movie' && episodes.length === 0) {
        episodes.push({
          id: slug + '/1',
          number: 1,
          title: title,
          still: absImg(poster),
          overview: overview
        });
      }

      var meta = {
        id: slug,
        title: title,
        poster: absImg(poster),
        backdrop: absImg(poster),
        overview: overview,
        type: type,
        genres: genres,
        seasons: [{ number: 1, title: 'Temporada 1', episodes: episodes }],
        extra: { animeId: animeId, slug: slug }
      };
      if (wantedEp != null) {
        meta.season = 1;
        meta.episode = wantedEp;
      }
      return meta;
    });
  }).catch(function () { return null; });
}

function b64decode(str) {
  try {
    if (typeof atob === 'function') return atob(str);
  } catch (e) {}
  var chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=';
  var output = '';
  str = String(str).replace(/=+$/, '');
  for (var bc = 0, bs, buffer, idx = 0; (buffer = str.charAt(idx++)); ~buffer && (bs = bc % 4 ? bs * 64 + buffer : buffer, bc++ % 4) ? (output += String.fromCharCode(255 & (bs >> ((-2 * bc) & 6)))) : 0) {
    buffer = chars.indexOf(buffer);
  }
  return output;
}

function getStreams(id, typeOrOpts, season, episode) {
  if (!id) return Promise.resolve([]);

  var parts = String(id).split('/');
  var slug = parts[0];
  var ep = parts[1] ? parseInt(parts[1], 10) : null;

  if (typeOrOpts && typeof typeOrOpts === 'object') {
    if (typeOrOpts.episode != null) ep = parseInt(typeOrOpts.episode, 10);
  } else if (episode != null) {
    ep = parseInt(episode, 10);
  }
  if (ep == null || isNaN(ep)) ep = 1;

  var pageUrl = BASE + '/' + slug + '/' + ep + '/';

  return fetchText(pageUrl).then(function (r) {
    var html = r.body || '';
    if (isCfChallenge(html)) return [];

    var streams = [];
    var seen = {};

    function add(name, url, quality) {
      if (!url || seen[url]) return;
      if (/^javascript:/i.test(url)) return;
      seen[url] = true;
      streams.push({
        name: name || 'Servidor',
        url: url,
        quality: quality || '',
        language: 'Subtitulado',
        provider: name || 'Jkanime',
        isHls: /\.m3u8(\?|$)/i.test(url),
        headers: { 'Referer': BASE + '/', 'User-Agent': UA }
      });
    }

    try {
      var reBlock = /\[[\s\n]*\{[\s\S]*?"remote"\s*:\s*"[^"]+"[\s\S]*?\}[\s\S]*?\]/g;
      var bm;
      while ((bm = reBlock.exec(html)) !== null) {
        try {
          var arr = JSON.parse(bm[0]);
          if (!Array.isArray(arr)) continue;
          arr.forEach(function (s, idx) {
            var remote = s.remote || s.url || '';
            if (!remote) return;
            var decoded = remote;
            try {
              if (!/^https?:/i.test(remote) && remote.indexOf('//') !== 0) {
                decoded = b64decode(remote);
              }
            } catch (e2) {}
            decoded = abs(decoded);
            add(s.server || s.name || ('Servidor ' + (idx + 1)), decoded, s.quality || '');
          });
        } catch (e3) {}
      }
    } catch (e) {}

    try {
      var vm = html.match(/var\s+video\s*=\s*\[([\s\S]*?)\];/);
      if (vm) {
        var urlRe = /["'](https?:\/\/[^"']+)["']/g;
        var um;
        var i = 0;
        while ((um = urlRe.exec(vm[1])) !== null) {
          i++;
          add('Video ' + i, um[1]);
        }
      }
    } catch (e) {}

    var gsKeys = [];
    var gsRe = /gsplay\/player\.html#([A-Za-z0-9_\-]+)/g;
    var gm;
    while ((gm = gsRe.exec(html)) !== null) {
      if (gsKeys.indexOf(gm[1]) < 0) gsKeys.push(gm[1]);
    }

    var chain = Promise.resolve();
    gsKeys.slice(0, 5).forEach(function (key) {
      chain = chain.then(function () {
        return fetch(BASE + '/gsplay/api.php', {
          method: 'POST',
          headers: H({
            'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
            'X-Requested-With': 'XMLHttpRequest',
            'Origin': BASE,
            'Accept': 'application/json, text/javascript, */*; q=0.01'
          }),
          body: 'v=' + encodeURIComponent(key)
        }).then(function (res) {
          return res.text().then(function (t) {
            try {
              var j = JSON.parse(t);
              var file = j.file || j.url || j.source || '';
              if (file) add('Nozomi', abs(file));
            } catch (e) {}
          });
        }).catch(function () {});
      });
    });

    return chain.then(function () {
      try {
        var cfg = (typeof globalThis !== 'undefined' && globalThis.__nuvioConfig && globalThis.__nuvioConfig.current) || {};
        var pref = (cfg.preferred_server || '').toLowerCase();
        if (pref && pref !== 'cualquiera') {
          streams.sort(function (a, b) {
            var an = (a.name || '').toLowerCase().indexOf(pref) >= 0 ? 0 : 1;
            var bn = (b.name || '').toLowerCase().indexOf(pref) >= 0 ? 0 : 1;
            return an - bn;
          });
        }
      } catch (e) {}
      return streams;
    });
  }).catch(function () { return []; });
}

module.exports = {
  getNews: getNews,
  getHome: getHome,
  getDiscoverFilters: getDiscoverFilters,
  getDiscover: getDiscover,
  search: search,
  getMeta: getMeta,
  getStreams: getStreams
};
