// 허브의 실제 HTTP·WS 처리기는 유지하고, 소켓 전송만 자식 프로세스 IPC로 대체한다.
const { EventEmitter } = require('node:events');
function installServerTransport() {
  const sockets = new Map();
  let handler, server;
  require('node:http').createServer = fn => {
    handler = fn;
    return { listen(_port, ready) { ready(); }, close() {} };
  };
  class WebSocket extends EventEmitter {}
  WebSocket.OPEN = 1;
  WebSocket.Server = class extends EventEmitter {
    constructor() { super(); server = this; }
    close() {}
  };
  const Module = require('node:module');
  const load = Module._load;
  Module._load = function(id, ...args) { return id === 'ws' ? WebSocket : load.call(this, id, ...args); };
  process.on('message', msg => {
    if (msg.kind === 'http') {
      let status = 200;
      handler({ url: msg.path, method: 'GET' }, {
        writeHead(code) { status = code; },
        end(body) { process.send({ kind: 'http', id: msg.id, status, body }); },
      });
    } else if (msg.kind === 'open') {
      const ws = new WebSocket(); ws.readyState = WebSocket.OPEN;
      ws.send = data => process.send({ kind: 'message', id: msg.id, data });
      ws.close = ws.terminate = () => { ws.readyState = 3; ws.emit('close'); sockets.delete(msg.id); };
      ws.ping = () => {};
      sockets.set(msg.id, ws);
      server.emit('connection', ws, {});
      process.send({ kind: 'open', id: msg.id });
    } else if (msg.kind === 'send') sockets.get(msg.id).emit('message', msg.data);
    else if (msg.kind === 'close') sockets.get(msg.id).close();
  });
}
function clientTransport(child) {
  let next = 0;
  const pending = new Map(), sockets = new Map();
  child.on('message', msg => {
    if (msg.kind === 'http') { pending.get(msg.id)(msg); pending.delete(msg.id); }
    else sockets.get(msg.id)?.emit(msg.kind, msg.data);
  });
  return {
    get: path => new Promise(resolve => { const id = ++next; pending.set(id, resolve); child.send({ kind: 'http', id, path }); }),
    WebSocket: class extends EventEmitter {
      constructor() { super(); this.id = ++next; sockets.set(this.id, this); child.send({ kind: 'open', id: this.id }); }
      send(data) { child.send({ kind: 'send', id: this.id, data }); }
      close() { child.send({ kind: 'close', id: this.id }); sockets.delete(this.id); }
    },
  };
}
module.exports = { installServerTransport, clientTransport };
