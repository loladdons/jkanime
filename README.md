# Jkanime — Repo adaptado

Plugin de **jkanime.net** listo para tu app.

## Qué incluye

| Función | Descripción |
|---------|-------------|
| **Novedades** (`getNews`) | Últimos episodios para el launcher |
| **Home** (`getHome`) | Hero de últimos episodios + filas: En emisión, Animes, Películas |
| **Descubrir** | Filtros (tipo, estado, orden) + directorio paginado |
| **Buscar** | AJAX + fallback HTML `/buscar/` |
| **Ficha** (`getMeta`) | Título, póster, sinopsis, géneros, temporadas y episodios (paginación AJAX) |
| **Player** (`getStreams`) | Servidores (remote base64, `var video`, Nozomi/gsplay) |
| **Biblioteca / Ajustes** | Gestionados por la app; el repo declara `config` (servidor preferido, máx. episodios) |
| **Tema** | Azul cian `#00A8E8` |

## Instalación

1. Sube esta carpeta a un repositorio público de GitHub.
2. En la app instala con: `tu-usuario/tu-repo`  
   (o la URL del `lol.json`).

## Archivos

```
lol.json      Manifest de tu app
plugin.js     Lógica (CommonJS)
icon.png      Icono
README.md     Este archivo
```

## Notas

- jkanime.net usa Cloudflare; si algún método falla de forma intermitente, reintenta o haz pull-to-refresh.
- Los IDs de anime son el **slug** (`spy-x-family`). Los episodios usan `slug/N` (`spy-x-family/3`).
- En **Ajustes del repo** puedes elegir servidor preferido y cuántos episodios mostrar en Home.
