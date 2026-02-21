const { WebSocketServer } = require('ws');
const http = require('http');

const PORT = process.env.PORT || 8080;
const clients = new Map();

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
  const peerId = req.headers['x-peer-id'] || 'unknown-' + Date.now();
  const peerName = decodeURIComponent(req.headers['x-peer-name'] || 'Anonymous');
  
  ws.peerId = peerId;
  ws.peerName = peerName;
  
  clients.set(peerId, ws);
  
  console.log(`[+] ${peerName} (${peerId}) conectado desde ${clientIp} (${clients.size} total)`);
  
  ws.send(JSON.stringify({ type: 'connected', clients: clients.size, peerId }));
  
  if (clients.size > 1) {
    const otherClient = [...clients.values()].find(c => c !== ws);
    if (otherClient) {
      otherClient.send(JSON.stringify({
        type: 'sync:request',
        peerId: peerId,
        peerName: peerName
      }));
      console.log(`[sync] Solicitando sync a ${otherClient.peerName} para ${peerName}`);
    }
  }
  
  ws.on('message', (data) => {
    try {
      const msg = JSON.parse(data.toString());
      const msgType = msg.type || 'unknown';
      
      if (msgType === 'sync:full') {
        const targetPeerId = msg.targetPeerId;
        if (targetPeerId && clients.has(targetPeerId)) {
          const targetWs = clients.get(targetPeerId);
          targetWs.send(data.toString());
          console.log(`[sync] Enviando ${Object.keys(msg.tasks || {}).length} tareas a ${targetPeerId}`);
        }
      } else {
        const logMsg = msgType.includes('sync') 
          ? `[${msgType}] de ${ws.peerName}`
          : `[${msgType}] ${msg.filename || msg.taskId || ''}`;
        console.log(`[msg] ${logMsg}`);
        
        for (const [pid, client] of clients) {
          if (pid !== peerId && client.readyState === 1) {
            client.send(data.toString());
          }
        }
      }
    } catch (err) {
      console.log(`[err] Error procesando mensaje: ${err.message}`);
    }
  });

  ws.on('close', () => {
    clients.delete(peerId);
    console.log(`[-] ${ws.peerName} (${peerId}) desconectado (${clients.size} total)`);
  });

  ws.on('error', () => {
    clients.delete(peerId);
  });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Relay WebSocket corriendo en puerto ${PORT}`);
});
