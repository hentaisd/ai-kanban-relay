const { WebSocketServer } = require('ws');
const http = require('http');

const PORT = process.env.PORT || 8080;
const clients = new Set();

const server = http.createServer((req, res) => {
  if (req.url === '/health' || req.url === '/') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ 
      status: 'ok', 
      service: 'ai-kanban-relay',
      clients: clients.size,
      timestamp: new Date().toISOString()
    }));
    return;
  }
  res.writeHead(404);
  res.end('Not found');
});

const wss = new WebSocketServer({ server });

wss.on('connection', (ws, req) => {
  const clientIp = req.socket.remoteAddress;
  console.log(`[+] Cliente conectado: ${clientIp} (${clients.size + 1} total)`);
  
  clients.add(ws);

  ws.on('message', (data) => {
    const msg = data.toString();
    console.log(`[msg] ${msg.slice(0, 100)}...`);
    
    for (const client of clients) {
      if (client !== ws && client.readyState === 1) {
        client.send(msg);
      }
    }
  });

  ws.on('close', () => {
    clients.delete(ws);
    console.log(`[-] Cliente desconectado (${clients.size} total)`);
  });

  ws.on('error', () => {
    clients.delete(ws);
  });

  ws.send(JSON.stringify({ type: 'connected', clients: clients.size }));
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Relay WebSocket corriendo en puerto ${PORT}`);
});
