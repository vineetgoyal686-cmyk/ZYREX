const http = require('http')
const fs = require('fs')
const path = require('path')

const PORT = process.env.PORT || 3000
const HTML = fs.readFileSync(path.join(__dirname, 'index.html'))
const SITEMAP = fs.readFileSync(path.join(__dirname, 'sitemap.xml'))

http.createServer((req, res) => {
  const url = req.url.split('?')[0]
  if (url === '/sitemap.xml') {
    res.writeHead(200, { 'Content-Type': 'application/xml; charset=utf-8' })
    res.end(SITEMAP)
  } else {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
    res.end(HTML)
  }
}).listen(PORT, '0.0.0.0', () => {
  console.log(`Landing page running on port ${PORT}`)
})
