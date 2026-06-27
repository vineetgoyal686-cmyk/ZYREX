const path = require('path')
const http = require('http')
const fs = require('fs')
const zlib = require('zlib')

const DIST = path.join(__dirname, 'dist')
const PORT = parseInt(process.env.PORT || '4173', 10)

const MIME = {
  '.html': 'text/html',
  '.js':   'application/javascript',
  '.mjs':  'application/javascript',
  '.css':  'text/css',
  '.json': 'application/json',
  '.png':  'image/png',
  '.jpg':  'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif':  'image/gif',
  '.svg':  'image/svg+xml',
  '.ico':  'image/x-icon',
  '.woff': 'font/woff',
  '.woff2':'font/woff2',
  '.ttf':  'font/ttf',
  '.otf':  'font/otf',
  '.webp': 'image/webp',
  '.pdf':  'application/pdf',
}

const COMPRESSIBLE = new Set(['.html','.js','.mjs','.css','.json','.svg'])

// Vite output files have content hashes — cache 1 year
// HTML must never be cached (it's the SPA entry)
function cacheHeader(filePath) {
  const ext = path.extname(filePath).toLowerCase()
  if (ext === '.html') return 'no-cache, no-store, must-revalidate'
  // hashed assets in /assets/
  if (filePath.includes(path.join('dist', 'assets'))) return 'public, max-age=31536000, immutable'
  return 'public, max-age=3600'
}

function serveFile(filePath, req, res) {
  const ext = path.extname(filePath).toLowerCase()
  const mime = MIME[ext] || 'application/octet-stream'
  const cache = cacheHeader(filePath)
  const acceptsGzip = (req.headers['accept-encoding'] || '').includes('gzip')

  if (acceptsGzip && COMPRESSIBLE.has(ext)) {
    res.writeHead(200, {
      'Content-Type': mime,
      'Content-Encoding': 'gzip',
      'Cache-Control': cache,
      'Vary': 'Accept-Encoding',
    })
    fs.createReadStream(filePath).pipe(zlib.createGzip()).pipe(res)
  } else {
    res.writeHead(200, { 'Content-Type': mime, 'Cache-Control': cache })
    fs.createReadStream(filePath).pipe(res)
  }
}

const server = http.createServer((req, res) => {
  const url = req.url.split('?')[0]
  let filePath = path.join(DIST, url)

  if (fs.existsSync(filePath) && fs.statSync(filePath).isDirectory()) {
    filePath = path.join(filePath, 'index.html')
  }

  if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
    serveFile(filePath, req, res)
  } else {
    // SPA fallback
    const index = path.join(DIST, 'index.html')
    res.writeHead(200, { 'Content-Type': 'text/html', 'Cache-Control': 'no-cache, no-store, must-revalidate' })
    fs.createReadStream(index).pipe(res)
  }
})

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Zyhawk frontend running on port ${PORT}`)
})
