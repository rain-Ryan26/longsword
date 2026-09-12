import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
const root = path.dirname(fileURLToPath(import.meta.url));
const mime = {'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8','.ogg':'audio/ogg','.wav':'audio/wav','.mp3':'audio/mpeg'};
const server = http.createServer((req,res) => {
  let name; try { name = decodeURIComponent(new URL(req.url, 'http://localhost').pathname); } catch { res.writeHead(400).end(); return; }
  const file = path.resolve(root, '.' + (name === '/' ? '/index.html' : name));
  if (!file.startsWith(root + path.sep) || !['.html','.js','.css','.json','.ogg','.wav','.mp3'].includes(path.extname(file))) { res.writeHead(403).end(); return; }
  fs.readFile(file, (err, data) => { if (err) { res.writeHead(404).end('Not found'); return; } res.writeHead(200, {'Content-Type':mime[path.extname(file)],'Cache-Control':'no-store'}).end(data); });
});
const port = Number(process.env.PORT || 4173);
server.listen(port,'127.0.0.1', () => {
  const url=`http://127.0.0.1:${port}`;
  console.log(`longsword: ${url}`);
  if(process.argv.includes('--open')&&process.platform==='win32')execFile('rundll32.exe',['url.dll,FileProtocolHandler',url],{windowsHide:true},err=>{if(err)console.log('Please open the URL above in your browser.');});
});
server.on('error', err => { console.error(err.message); process.exitCode=1; });
