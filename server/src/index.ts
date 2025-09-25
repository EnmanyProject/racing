import path from 'node:path';
import express from 'express';
import http from 'node:http';
import cors from 'cors';
import { Server } from 'socket.io';
import GameLoop from './gameLoop';

const PORT = Number(process.env.PORT) || 4000;
const CLIENT_DIST = path.resolve(__dirname, '..', '..', 'client', 'dist');

const app = express();
app.use(cors());
app.use(express.json());

if (process.env.NODE_ENV === 'production') {
  app.use(express.static(CLIENT_DIST));
  app.get('*', (_req, res) => {
    res.sendFile(path.join(CLIENT_DIST, 'index.html'));
  });
}

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*'
  }
});

const loop = new GameLoop();
loop.start();

loop.on('state', (state) => {
  io.emit('state', state);
});

loop.on('progress', (payload) => {
  io.emit('raceProgress', payload);
});

io.on('connection', (socket) => {
  const authId = typeof socket.handshake.auth?.playerId === 'string' ? socket.handshake.auth.playerId : undefined;
  const playerId = authId && authId.trim().length > 0 ? authId : socket.id;
  const player = loop.addPlayer(playerId);

  socket.emit('state', loop.getState());
  socket.emit('welcome', { id: player.id, nickname: player.nickname, selectionId: player.selectionId });

  socket.on('player:update', ({ nickname }: { nickname: string }) => {
    if (typeof nickname === 'string' && nickname.trim().length >= 2) {
      loop.updateNickname(playerId, nickname.trim());
    }
  });

  socket.on('player:select', ({ lizardId }: { lizardId: string }) => {
    loop.chooseLizard(playerId, lizardId);
  });

  socket.on('boost', ({ lizardId }: { lizardId: string }) => {
    const result = loop.applyBoost(playerId, lizardId);
    socket.emit('boost:result', result);
  });

  socket.on('disconnect', () => {
    loop.markDisconnected(playerId);
  });
});

server.listen(PORT, () => {
  console.log(`Gecko Sprint server ready on :${PORT}`);
});
