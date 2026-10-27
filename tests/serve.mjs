import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { extname, join, normalize } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('../fixtures/', import.meta.url))
const types = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
}

createServer(async (request, response) => {
  const path = normalize(decodeURIComponent(new URL(request.url ?? '/', 'http://localhost').pathname))
  try {
    const body = await readFile(join(root, path))
    response.writeHead(200, { 'content-type': types[extname(path)] ?? 'application/octet-stream' })
    response.end(body)
  } catch {
    response.writeHead(404).end('not found')
  }
}).listen(Number(process.env.PORT ?? 4310))
