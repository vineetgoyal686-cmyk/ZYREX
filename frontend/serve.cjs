// SPA server — serves built files with fallback to index.html for all routes.
// Used in production (Railway) instead of `vite preview`.
const path = require('path')
const http = require('http')
const fs = require('fs')

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

const server = http.createServer((req, res) => {
  const url = req.url.split('?')[0]
  let filePath = path.join(DIST, url)

  // Directory index
  if (fs.existsSync(filePath) && fs.statSync(filePath).isDirectory()) {
    filePath = path.join(filePath, 'index.html')
  }

  if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
    const ext = path.extname(filePath).toLowerCase()
    const mime = MIME[ext] || 'application/octet-stream'
    res.writeHead(200, { 'Content-Type': mime })
    fs.createReadStream(filePath).pipe(res)
  } else {
    // SPA fallback — serve index.html for all unknown paths
    const index = path.join(DIST, 'index.html')
    res.writeHead(200, { 'Content-Type': 'text/html' })
    fs.createReadStream(index).pipe(res)
  }
})

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Zyhawk frontend running on port ${PORT}`)
})
