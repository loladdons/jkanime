/**
 * Jkanime adapter for the app (lol.json + CommonJS).
 * Capabilities: getNews, getHome, getDiscoverFilters, getDiscover, search, getMeta, getStreams
 *
 * IDs:
 *   - Anime:   slug                 e.g. "spy-x-family"
 *   - Episode: slug/N               e.g. "spy-x-family/3"
 */

var BASE = 'https://jkanime.net';
var CDN  = 'https://cdn.jkdesu.com';
var UA   = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// ─── helpers ────────────────────────────────────────────────────────────────

function headers(extra) {
  var h = {
    'User-Agent': UA,
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'es-419,es;q=0.9,en;q=0.8',
    'Referer': BASE + '/'
  };
  if (extra) {
    for (var k in extra) h[k] = extra[k];
  }
  return h;
}

function absUrl(u) {
  if (!u) return '';
  u = String(u).trim();
  if (!u) return '';
  if (u.indexOf('//') === 0) return 'https:' + u;
  if (u.indexOf('http') === 0) return u;
  if (u.charAt(0) === '/') return BASE + u;
  return BASE + '/' + u;
}

function absImg(u) {
  if (!u) return '';
  u = String(u).trim();
  if (!u) return '';
  if (u.indexOf('http') === 0 || u.indexOf('//') === 0) return absUrl(u);
  // relative image paths on jkanime often live on cdn.jkdesu.com
  if (u.indexOf('assets/') === 0 || u.indexOf('/assets/') === 0) {
    return CDN + (u.charAt(0) === '/' ? u : '/' + u);
  }
  return absUrl(u);
}

function slugFromHref(href) {
  if (!href) return '';
  try {
    var path = href.replace(BASE, '').replace(/^https?:\/\/jkanime\.net/i, '');
    path = path.replace(/^\//, '').replace(/\/$/, '');
    // remove trailing episode number: slug/12  or slug/12/
    var parts = path.split('/').filter(Boolean);
    if (parts.length >= 2 && /^\d+$/.test(parts[parts.length - 1])) {
      parts.pop();
    }
    // also strip /especial/ /ova/ etc.
    return parts.join('/').replace(/\/(especial|ova|pelicula)$/i, '') || parts[0] || '';
  } catch (e) {
    return '';
  }
}

function parseEpisodeNum(href, text) {
  if (href) {
    var m = href.match(/\/(\d+)\/?$/);
    if (m) return parseInt(m[1], 10);
  }
  if (text) {
    var t = String(text).replace(/[^\d]/g, '');
    if (t) return parseInt(t, 10);
  }
  return null;
}

function cleanTitle(t) {
  if (!t) return 'Sin título';
  return String(t).replace(/\s+/g, ' ').trim();
}

function fetchHtml(url, opts) {
  opts = opts || {};
  return fetch(url, {
    method: opts.method || 'GET',
    headers: headers(opts.headers),
    body: opts.body || undefined,
    redirect: 'follow'
  }).then(function (res) {
    if (!res.ok) throw new Error('HTTP ' + res.status + ' ' + url);
    return res.text();
  });
}

function fetchJson(url, opts) {
  opts = opts || {};
  return fetch(url, {
    method: opts.method || 'GET',
    headers: headers(Object.assign({
      'Accept': 'application/json, text/javascript, */*; q=0.01',
      'X-Requested-With': 'XMLHttpRequest'
    }, opts.headers || {})),
    body: opts.body || undefined,
    redirect: 'follow'
  }).then(function (res) {
    if (!res.ok) throw new Error('HTTP ' + res.status + ' ' + url);
    return res.json();
  });
}

function cheerioLoad(html) {
  // cheerio is provided by the app runtime
  if (typeof cheerio !== 'undefined' && cheerio.load) return cheerio.load(html);
  if (typeof globalThis !== 'undefined' && globalThis.cheerio && globalThis.cheerio.load) {
    return globalThis.cheerio.load(html);
  }
  throw new Error('cheerio no disponible en el runtime');
}

function itemFromCard($el) {
  var $a = $el.is('a') ? $el : $el.find('a').first();
  var href = $a.attr('href') || $el.attr('href') || '';
  var slug = slugFromHref(href);
  if (!slug) return null;

  var title =
    cleanTitle($el.find('h5, h6, .title, .anime__item__text h5, .title_left').first().text()) ||
    cleanTitle($a.attr('title')) ||
    cleanTitle($el.find('img').attr('alt')) ||
    slug;

  var poster =
    $el.find('img').attr('src') ||
    $el.find('img').attr('data-src') ||
    $el.find('img').attr('data-original') ||
    '';

  var typeText = ($el.find('.anime__item__text span, .set-text, .tipo').text() || '').toLowerCase();
  var type = 'series';
  if (typeText.indexOf('pelicula') >= 0 || typeText.indexOf('película') >= 0 || typeText.indexOf('movie') >= 0) {
    type = 'movie';
  } else if (typeText.indexOf('ova') >= 0 || typeText.indexOf('especial') >= 0) {
    type = 'series';
  }

  var epText = $el.find('h6, .episode, .ep').first().text() || '';
  var year = null;
  var mYear = title.match(/\b(19|20)\d{2}\b/);
  if (mYear) year = mYear[0];

  return {
    id: slug,
    title: title,
    poster: absImg(poster),
    backdrop: absImg(poster),
    type: type,
    year: year,
    overview: '',
    genres: [],
    extra: { href: absUrl(href), epHint: epText }
  };
}

function parseDirectoryItems(html) {
  var $ = cheerioLoad(html);
  var items = [];
  var seen = {};

  // Common card selectors on jkanime directory / home
  var selectors = [
    'div.anime__item',
    'div.listadoanime-home a.bloqq',
    'div.row div.col-lg-2',
    'div.anime__page__content div.anime__item',
    'a.anime_item',
    '.listadoanime a'
  ];

  for (var s = 0; s < selectors.length; s++) {
    $(selectors[s]).each(function () {
      var it = itemFromCard($(this));
      if (it && it.id && !seen[it.id]) {
        seen[it.id] = true;
        items.push(it);
      }
    });
    if (items.length > 0) break;
  }

  // Fallback: any link that looks like an anime page
  if (items.length === 0) {
    $('a[href*="jkanime.net/"], a[href^="/"]').each(function () {
      var href = $(this).attr('href') || '';
      if (!href || href.indexOf('/buscar') >= 0 || href.indexOf('/directorio') >= 0) return;
      var it = itemFromCard($(this).parent().length ? $(this).parent() : $(this));
      if (!it) {
        var slug = slugFromHref(href);
        if (!slug || seen[slug]) return;
        var title = cleanTitle($(this).attr('title') || $(this).text());
        var img = $(this).find('img').attr('src') || $(this).find('img').attr('data-src') || '';
        if (!title || title.length < 2) return;
        it = { id: slug, title: title, poster: absImg(img), type: 'series' };
      }
      if (it && it.id && !seen[it.id]) {
        seen[it.id] = true;
        items.push(it);
      }
    });
  }

  return items;
}

function parseLatestEpisodes(html) {
  var $ = cheerioLoad(html);
  var items = [];
  var seen = {};

  // "Últimos episodios" blocks on homepage
  $('.listadoanime-home a.bloqq, .anime__sidebar__comment__item, a.bloqq').each(function () {
    var href = $(this).attr('href') || $(this).find('a').attr('href') || '';
    var slug = slugFromHref(href);
    if (!slug || seen[slug + href]) return;
    seen[slug + href] = true;

    var title = cleanTitle(
      $(this).find('h5').text() ||
      $(this).find('.anime__sidebar__comment__item__text h5').text() ||
      $(this).attr('title') ||
      ''
    );
    var epText = cleanTitle(
      $(this).find('h6').text() ||
      $(this).find('.episode').text() ||
      ''
    );
    var poster =
      $(this).find('img').attr('src') ||
      $(this).find('img').attr('data-src') ||
      '';

    var epNum = parseEpisodeNum(href, epText);
    var id = epNum != null ? slug + '/' + epNum : slug;

    items.push({
      id: id,
      title: title + (epNum != null ? ' — Ep. ' + epNum : (epText ? ' — ' + epText : '')),
      poster: absImg(poster),
      backdrop: absImg(poster),
      type: 'series',
      season: 1,
      episode: epNum,
      extra: { animeId: slug, episode: epNum }
    });
  });

  return items;
}

function b64decode(str) {
  try {
    if (typeof atob === 'function') return atob(str);
  } catch (e) {}
  // minimal polyfill
  var chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=';
  var output = '';
  str = String(str).replace(/=+$/, '');
  for (var bc = 0, bs, buffer, idx = 0; (buffer = str.charAt(idx++)); ~buffer && (bs = bc % 4 ? bs * 64 + buffer : buffer, bc++ % 4) ? output += String.fromCharCode(255 & (bs >> ((-2 * bc) & 6))) : 0) {
    buffer = chars.indexOf(buffer);
  }
  return output;
}

// ─── API ────────────────────────────────────────────────────────────────────

/**
 * Novedades para el launcher de la app.
 */
function getNews() {
  return fetchHtml(BASE + '/').then(function (html) {
    var latest = parseLatestEpisodes(html);
    // de-dup by anime slug, keep newest ep
    var byAnime = {};
    latest.forEach(function (it) {
      var aid = (it.extra && it.extra.animeId) || it.id.split('/')[0];
      if (!byAnime[aid]) byAnime[aid] = it;
    });
    var items = Object.keys(byAnime).map(function (k) { return byAnime[k]; });
    return items.slice(0, 24);
  }).catch(function () {
    return [];
  });
}

/**
 * Home del repo: hero + filas.
 */
function getHome() {
  var maxEp = 18;
  try {
    if (typeof config !== 'undefined' && config && config.max_episodes_home) {
      maxEp = parseInt(config.max_episodes_home, 10) || 18;
    }
  } catch (e) {}

  return fetchHtml(BASE + '/').then(function (html) {
    var latest = parseLatestEpisodes(html).slice(0, maxEp);
    var dirItems = parseDirectoryItems(html).slice(0, 24);

    // También pedimos directorio "en emisión" y películas en paralelo
    return Promise.all([
      fetchHtml(BASE + '/directorio/?filtro=fecha&tipo=TV&estado=1&fecha=none&temporada=none&orden=desc').then(parseDirectoryItems).catch(function () { return []; }),
      fetchHtml(BASE + '/directorio/peliculas/').then(parseDirectoryItems).catch(function () { return []; }),
      fetchHtml(BASE + '/directorio/animes/').then(parseDirectoryItems).catch(function () { return []; })
    ]).then(function (extra) {
      var enEmision = extra[0] || [];
      var pelis = extra[1] || [];
      var animes = extra[2] || [];

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
          items: enEmision.slice(0, 24)
        });
      }

      if (animes.length) {
        rows.push({
          id: 'animes',
          title: 'Animes',
          type: 'row',
          imageStyle: 'poster',
          items: animes.slice(0, 24)
        });
      }

      if (pelis.length) {
        rows.push({
          id: 'peliculas',
          title: 'Películas',
          type: 'row',
          imageStyle: 'poster',
          items: pelis.slice(0, 24)
        });
      }

      // Fallback si todo falló: lo que haya en la home
      if (rows.length === 0 && dirItems.length) {
        rows.push({
          id: 'home',
          title: 'Destacados',
          type: 'hero',
          imageStyle: 'backdrop',
          items: dirItems
        });
      }

      return rows;
    });
  }).catch(function (e) {
    return [];
  });
}

/**
 * Filtros de Descubrir.
 */
function getDiscoverFilters() {
  return Promise.resolve([
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
        { id: 'asc', name: 'Más antiguos' },
        { id: 'nombre', name: 'Nombre A-Z' }
      ]
    }
  ]);
}

/**
 * Descubrir (directorio paginado).
 * filters: { tipo, estado, orden }
 * page: 1-based
 */
function getDiscover(filters, page) {
  filters = filters || {};
  page = page || 1;
  if (typeof filters === 'number') {
    page = filters;
    filters = {};
  }
  // App may pass (filters) only or (filters, page)
  if (arguments.length === 1 && filters && typeof filters.page !== 'undefined') {
    page = filters.page;
  }

  var tipo = filters.tipo || filters.type || 'none';
  var estado = filters.estado || filters.status || 'none';
  var orden = filters.orden || filters.order || 'desc';
  if (tipo === 'Todos') tipo = 'none';
  if (estado === 'Todos') estado = 'none';

  var url =
    BASE +
    '/directorio/?filtro=fecha&tipo=' +
    encodeURIComponent(tipo) +
    '&estado=' +
    encodeURIComponent(estado) +
    '&fecha=none&temporada=none&orden=' +
    encodeURIComponent(orden) +
    (page > 1 ? '&p=' + page : '');

  // Algunas versiones usan /directorio/page/N/
  if (page > 1) {
    url = BASE + '/directorio/' + page + '/?filtro=fecha&tipo=' + encodeURIComponent(tipo) +
      '&estado=' + encodeURIComponent(estado) + '&fecha=none&temporada=none&orden=' + encodeURIComponent(orden);
  }

  return fetchHtml(url).then(function (html) {
    var items = parseDirectoryItems(html);
    return {
      items: items,
      hasMore: items.length >= 12
    };
  }).catch(function () {
    return { items: [], hasMore: false };
  });
}

/**
 * Búsqueda.
 */
function search(query) {
  if (!query || !String(query).trim()) return Promise.resolve([]);
  var q = String(query).trim();

  // 1) Intentar endpoint AJAX
  var ajaxUrl = BASE + '/ajax/ajax_search/?q=' + encodeURIComponent(q);
  return fetchJson(ajaxUrl).then(function (data) {
    var list = data.animes || data.data || data.results || data || [];
    if (!Array.isArray(list)) list = [];
    if (list.length === 0) throw new Error('empty ajax');
    return list.map(function (a) {
      var slug = a.slug || a.id || a.url || '';
      if (typeof slug === 'string' && slug.indexOf('http') === 0) slug = slugFromHref(slug);
      slug = String(slug).replace(/^\/|\/$/g, '');
      return {
        id: slug,
        title: cleanTitle(a.title || a.name || slug),
        poster: absImg(a.image || a.thumbnail || a.poster || a.img || ''),
        type: 'series',
        overview: a.synopsis || a.description || '',
        year: a.year ? String(a.year) : null
      };
    }).filter(function (x) { return x.id; });
  }).catch(function () {
    // 2) Fallback: página /buscar/
    var url = BASE + '/buscar/' + encodeURIComponent(q).replace(/%20/g, '+') + '/';
    return fetchHtml(url).then(function (html) {
      return parseDirectoryItems(html);
    }).catch(function () {
      return [];
    });
  });
}

/**
 * Ficha de contenido (anime completo + episodios).
 * id = slug  |  slug/episode
 */
function getMeta(id, options) {
  options = options || {};
  if (!id) return Promise.resolve(null);

  var parts = String(id).split('/');
  var slug = parts[0];
  var wantedEp = parts[1] ? parseInt(parts[1], 10) : (options.episode || null);

  var animeUrl = BASE + '/' + slug + '/';

  return fetchHtml(animeUrl).then(function (html) {
    var $ = cheerioLoad(html);

    var title =
      cleanTitle($('h1').first().text()) ||
      cleanTitle($('.anime__details__title h3').text()) ||
      cleanTitle($('meta[property="og:title"]').attr('content')) ||
      slug;

    var poster =
      $('meta[property="og:image"]').attr('content') ||
      $('.anime__details__pic img').attr('src') ||
      $('.anime__details__pic').css('background-image') ||
      '';
    if (poster && poster.indexOf('url(') === 0) {
      poster = poster.replace(/^url\(['"]?/, '').replace(/['"]?\)$/, '');
    }

    var overview =
      cleanTitle($('meta[name="description"]').attr('content')) ||
      cleanTitle($('.anime__details__text p, .sinopsis, #sinopsis').first().text()) ||
      '';

    var genres = [];
    $('.anime__details__widget li, .genre a, a[href*="/genero/"], a[href*="/genero"]').each(function () {
      var g = cleanTitle($(this).text());
      if (g && g.length < 40 && genres.indexOf(g) < 0) genres.push(g);
    });

    var type = 'series';
    var typeHint = ($('.anime__details__widget').text() || '').toLowerCase();
    if (typeHint.indexOf('pelicula') >= 0 || typeHint.indexOf('película') >= 0) type = 'movie';

    // anime numeric id for pagination
    var animeId =
      $('div.ml-2').attr('data-anime') ||
      $('[data-anime]').first().attr('data-anime') ||
      '';
    if (!animeId) {
      var m = html.match(/ajax\/pagination_episodes\/(\d+)/) ||
              html.match(/ajax\/last_episode\/(\d+)/) ||
              html.match(/ajax\/episodes\/(\d+)/);
      if (m) animeId = m[1];
    }

    // Collect episode pages
    var pageNums = [];
    $('a.numbers, .anime__pagination a, a[href*="#pag"]').each(function () {
      var h = $(this).attr('href') || '';
      var n = h.replace(/.*#pag/, '').replace(/\D/g, '');
      if (n) pageNums.push(parseInt(n, 10));
      var t = $(this).text().replace(/\D/g, '');
      if (t) pageNums.push(parseInt(t, 10));
    });
    if (pageNums.length === 0) pageNums = [1];
    pageNums = pageNums.filter(function (n, i, a) { return n > 0 && a.indexOf(n) === i; }).sort(function (a, b) { return a - b; });

    function loadEpPage(p) {
      if (!animeId) return Promise.resolve([]);
      var u = BASE + '/ajax/pagination_episodes/' + animeId + '/' + p + '/';
      return fetchJson(u).then(function (arr) {
        if (!Array.isArray(arr)) {
          if (arr && Array.isArray(arr.data)) arr = arr.data;
          else return [];
        }
        return arr.map(function (info) {
          var num = parseInt(info.number || info.episode || info.id, 10);
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
        }).filter(function (e) { return e.number > 0; });
      }).catch(function () {
        return [];
      });
    }

    // Load first few pages (or all if few)
    var pagesToLoad = pageNums.slice(0, 8); // cap to avoid too many requests
    return Promise.all(pagesToLoad.map(loadEpPage)).then(function (groups) {
      var episodes = [];
      var seenEp = {};
      groups.forEach(function (g) {
        g.forEach(function (e) {
          if (!seenEp[e.number]) {
            seenEp[e.number] = true;
            episodes.push(e);
          }
        });
      });
      episodes.sort(function (a, b) { return a.number - b.number; });

      // If no ajax episodes, try scraping episode list from HTML
      if (episodes.length === 0) {
        $('#episodes-content .epcontent a, .episodios a, a[href*="/' + slug + '/"]').each(function () {
          var href = $(this).attr('href') || '';
          var num = parseEpisodeNum(href, $(this).text());
          if (num == null || seenEp[num]) return;
          seenEp[num] = true;
          episodes.push({
            id: slug + '/' + num,
            number: num,
            title: 'Episodio ' + num,
            still: poster,
            overview: ''
          });
        });
        episodes.sort(function (a, b) { return a.number - b.number; });
      }

      // Movies: single "episode"
      if (type === 'movie' && episodes.length === 0) {
        episodes.push({ id: slug + '/1', number: 1, title: title, still: absImg(poster), overview: overview });
      }

      var meta = {
        id: slug,
        title: title,
        poster: absImg(poster),
        backdrop: absImg(poster),
        overview: overview,
        type: type,
        genres: genres,
        seasons: [
          {
            number: 1,
            title: 'Temporada 1',
            episodes: episodes
          }
        ],
        extra: { animeId: animeId, slug: slug }
      };

      if (wantedEp != null) {
        meta.season = 1;
        meta.episode = wantedEp;
      }

      return meta;
    });
  }).catch(function (e) {
    return null;
  });
}

/**
 * Servidores de un episodio.
 * id = slug  |  slug/N
 * También acepta (id, type, season, episode)
 */
function getStreams(id, type, season, episode) {
  if (!id) return Promise.resolve([]);

  // Normalizar argumentos
  var slug, ep;
  var parts = String(id).split('/');
  slug = parts[0];
  ep = parts[1] ? parseInt(parts[1], 10) : null;

  if (typeof type === 'object' && type !== null) {
    // getStreams(id, { season, episode })
    episode = type.episode || episode;
    season = type.season || season;
  }
  if (ep == null && episode != null) ep = parseInt(episode, 10);
  if (ep == null) ep = 1;

  var pageUrl = BASE + '/' + slug + '/' + ep + '/';

  return fetchHtml(pageUrl).then(function (html) {
    var streams = [];
    var seen = {};

    function add(name, url, quality, language) {
      if (!url || seen[url]) return;
      // skip obvious non-video
      if (url.indexOf('javascript:') === 0) return;
      seen[url] = true;
      streams.push({
        name: name || 'Servidor',
        url: url,
        quality: quality || '',
        language: language || 'Subtitulado',
        provider: name || 'Jkanime',
        isHls: /\.m3u8(\?|$)/i.test(url),
        headers: {
          'Referer': BASE + '/',
          'User-Agent': UA
        }
      });
    }

    // 1) servers array with base64 "remote"
    try {
      var reRemote = /\[\s*\{[\s\S]*?"remote"\s*:\s*"([^"]+)"[\s\S]*?\}\s*\]/g;
      var m;
      var foundBlocks = [];
      // broader: find JSON-like arrays containing "remote"
      var reBlock = /\[\s*\{[^\]]*?"remote"[^\]]*?\}[^\]]*?\]/g;
      var bm;
      while ((bm = reBlock.exec(html)) !== null) {
        foundBlocks.push(bm[0]);
      }
      foundBlocks.forEach(function (block) {
        try {
          // fix common escapes
          var jsonStr = block.replace(/'/g, '"');
          var arr = JSON.parse(jsonStr);
          if (!Array.isArray(arr)) return;
          arr.forEach(function (s, idx) {
            var remote = s.remote || s.url || s.file || '';
            if (!remote) return;
            var decoded = remote;
            try {
              // remote is often base64
              if (!/^https?:/i.test(remote) && !remote.startsWith('//')) {
                decoded = b64decode(remote);
              }
            } catch (e2) {}
            decoded = absUrl(decoded);
            var name = s.server || s.name || s.title || ('Servidor ' + (idx + 1));
            add(name, decoded, s.quality || '', s.lang || 'Subtitulado');
          });
        } catch (e3) {}
      });
    } catch (e) {}

    // 2) var video = [] pattern
    try {
      var videoMatch = html.match(/var\s+video\s*=\s*\[([\s\S]*?)\];/);
      if (videoMatch) {
        var inner = videoMatch[1];
        // extract quoted urls
        var urlRe = /["'](https?:\/\/[^"']+)["']/g;
        var um;
        var vi = 0;
        while ((um = urlRe.exec(inner)) !== null) {
          vi++;
          add('Video ' + vi, um[1]);
        }
        // also iframe src patterns inside
        var iframeRe = /src\s*=\s*["']([^"']+)["']/g;
        while ((um = iframeRe.exec(inner)) !== null) {
          vi++;
          add('Embed ' + vi, absUrl(um[1]));
        }
      }
    } catch (e) {}

    // 3) gsplay / Nozomi style keys in page
    try {
      var gsKeys = [];
      var gsRe = /gsplay\/player\.html#([A-Za-z0-9_\-]+)/g;
      var gm;
      while ((gm = gsRe.exec(html)) !== null) gsKeys.push(gm[1]);
      // also data-video attributes etc.
      var $ = null;
      try { $ = cheerioLoad(html); } catch (e) {}
      if ($) {
        $('[data-video], [data-src], iframe[src]').each(function () {
          var v = $(this).attr('data-video') || $(this).attr('data-src') || $(this).attr('src') || '';
          if (v && /gsplay|player\.html#/.test(v)) {
            var k = v.split('#').pop();
            if (k) gsKeys.push(k);
          }
        });
      }

      // Resolve Nozomi keys (sequential to keep it simple)
      var chain = Promise.resolve();
      gsKeys.slice(0, 6).forEach(function (key) {
        chain = chain.then(function () {
          return fetch(BASE + '/gsplay/api.php', {
            method: 'POST',
            headers: headers({
              'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
              'X-Requested-With': 'XMLHttpRequest',
              'Origin': BASE,
              'Accept': 'application/json, text/javascript, */*; q=0.01'
            }),
            body: 'v=' + encodeURIComponent(key)
          }).then(function (res) {
            if (!res.ok) return;
            return res.json().then(function (j) {
              var file = j.file || j.url || j.source || '';
              if (file) add('Nozomi', absUrl(file), '', 'Subtitulado');
            }).catch(function () {});
          }).catch(function () {});
        });
      });

      return chain.then(function () {
        return finalizeStreams(streams);
      });
    } catch (e) {
      return finalizeStreams(streams);
    }
  }).catch(function () {
    return [];
  });
}

function finalizeStreams(streams) {
  // Prefer user preferred server
  try {
    if (typeof config !== 'undefined' && config && config.preferred_server && config.preferred_server !== 'Cualquiera') {
      var pref = String(config.preferred_server).toLowerCase();
      streams.sort(function (a, b) {
        var an = (a.name || '').toLowerCase().indexOf(pref) >= 0 ? 0 : 1;
        var bn = (b.name || '').toLowerCase().indexOf(pref) >= 0 ? 0 : 1;
        return an - bn;
      });
    }
  } catch (e) {}
  return streams;
}

// CommonJS export expected by the app
module.exports = {
  getNews: getNews,
  getHome: getHome,
  getDiscoverFilters: getDiscoverFilters,
  getDiscover: getDiscover,
  search: search,
  getMeta: getMeta,
  getStreams: getStreams
};
