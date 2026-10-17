'use strict';
// 포트 바인드가 금지된 샌드박스에서 같은 HTTP 처리기를 IPC로 시험한다.
// 부모가 지정한 임시 HOME/HUD_ROOT만 사용한다. 운영 서버에 연결하지 않는다.
const http = require('http');
const { EventEmitter } = require('events');
let route;
http.createServer = handler => {
    route = handler;
    return { listen(port, host, ready) { ready(); process.send({ ready: true }); return this; } };
};
process.on('message', message => {
    if (!route || !message || typeof message.path !== 'string') return;
    const req = new EventEmitter();
    req.method = 'GET'; req.url = message.path;
    let status = 200, headers = {};
    route(req, {
        writeHead(code, values) { status = code; headers = Object.fromEntries(Object.entries(values).map(([key, value]) => [key.toLowerCase(), value])); },
        end(body) { process.send({ id: message.id, status, headers, body: String(body || '') }); },
    });
    req.emit('end');
});
require('./server');
