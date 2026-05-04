// Multiplayer WebSocket server for the portfolio.
// Runs on port 5182, accepts connections from any browser tab,
// broadcasts the full snapshot of all connected players 8x/sec.
const { WebSocketServer } = require('ws');
const PORT = 5182;
const wss = new WebSocketServer({ port: PORT });

let nextId = 1;
const players = new Map();   // id → { ws, x, z, yaw }

wss.on('connection', (ws) => {
  const id = nextId++;
  players.set(id, { ws, x: 0, z: 0, yaw: 0 });
  ws.send(JSON.stringify({ type: 'welcome', id }));
  console.log(`[mp] player ${id} connected (total: ${players.size})`);

  ws.on('message', (raw) => {
    let msg;
    try { msg = JSON.parse(raw); } catch (e) { return; }
    if (msg.type === 'pos') {
      const p = players.get(id);
      if (p) { p.x = msg.x; p.z = msg.z; p.yaw = msg.yaw; }
    }
  });

  ws.on('close', () => {
    players.delete(id);
    console.log(`[mp] player ${id} disconnected (total: ${players.size})`);
  });
  ws.on('error', () => {});
});

// Broadcast the full snapshot 8x/sec
setInterval(() => {
  const snapshot = {
    type: 'state',
    players: Array.from(players.entries()).map(([id, p]) => ({ id, x: p.x, z: p.z, yaw: p.yaw })),
  };
  const data = JSON.stringify(snapshot);
  for (const p of players.values()) {
    if (p.ws.readyState === 1) p.ws.send(data);
  }
}, 125);

console.log(`[mp] WebSocket server listening on ws://localhost:${PORT}`);
