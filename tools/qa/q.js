// tools/qa/q.js: one command to the QA driver (tools/qa/drv.js). node tools/qa/q.js <op> [args], e.g. x "GK.mode" (evaluate) | key KeyE 50 | hold KeyW,ShiftLeft 1500 | click "#b-start" | clickxy 640 360 | move 200 0 | shot qa-01 | log | srvlog 3000 | quit
// q js file.js  (eval a file's content)
const http = require('http'), fs = require('fs');
const [op, a, b] = process.argv.slice(2), CTRL = +process.env.CTRL || 9339;
let c;
switch (op) {
  case 'x': c = { op: 'eval', js: a }; break;
  case 'js': c = { op: 'eval', js: fs.readFileSync(a, 'utf8') }; break;
  case 'key': c = { op, code: a, ms: +b || 40 }; break;
  case 'down': case 'up': c = { op, code: a }; break;
  case 'hold': c = { op, codes: a.split(','), ms: +b || 500 }; break;
  case 'click': c = { op, sel: a }; break;
  case 'clickxy': c = { op: 'click', x: +a, y: +b }; break;
  case 'move': c = { op, dx: +a, dy: +b || 0, n: 6 }; break;
  case 'shot': c = { op, name: a }; break;
  case 'srvlog': c = { op, tail: +a || 4000, clear: b === 'clear' }; break;
  case 'nav': c = { op, url: a }; break;
  default: c = { op };
}
const req = http.request({ host: '127.0.0.1', port: CTRL, method: 'POST', path: '/' }, r => { let s = ''; r.on('data', d => s += d); r.on('end', () => { try { const v = JSON.parse(s); console.log(typeof v === 'string' ? v : JSON.stringify(v, null, op === 'log' ? 1 : 0)); } catch (e) { console.log(s); } }); });
req.on('error', e => console.log('ERR ' + e.message)); req.end(JSON.stringify(c));
