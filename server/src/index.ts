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

loop.on('playerResult', ({ playerId, result }) => {
  const sockets = io.sockets.sockets;
  for (const [, socket] of sockets) {
    const authId = typeof socket.handshake.auth?.playerId === 'string' ? socket.handshake.auth.playerId : undefined;
    const socketPlayerId = authId && authId.trim().length > 0 ? authId : socket.id;
    if (socketPlayerId === playerId) {
      socket.emit('player:result', result);
      break;
    }
  }
});

io.on('connection', (socket) => {
  const authId = typeof socket.handshake.auth?.playerId === 'string' ? socket.handshake.auth.playerId : undefined;
  const playerId = authId && authId.trim().length > 0 ? authId : socket.id;
  const player = loop.addPlayer(playerId);

  socket.emit('state', loop.getState());
  socket.emit('welcome', {
    id: player.id,
    nickname: player.nickname,
    selectionId: player.selectionId,
    wallet: player.wallet,
    referralCode: player.referralCode,
    referralCount: player.referralCount ?? 0,
    dailyTicketClaimed: player.dailyTicketClaimed
  });

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

  // Wallet operations
  socket.on('wallet:claim', () => {
    const currentPlayer = loop.getPlayer(playerId);
    if (currentPlayer) {
      const success = loop.claimDailyTicket(currentPlayer);
      socket.emit('wallet:claim:result', {
        success,
        wallet: currentPlayer.wallet,
        dailyTicketClaimed: currentPlayer.dailyTicketClaimed
      });
    }
  });

  socket.on('wallet:buyTickets', ({ count }: { count: number }) => {
    const success = loop.buyTickets(playerId, count);
    const currentPlayer = loop.getPlayer(playerId);
    socket.emit('wallet:buyTickets:result', {
      success,
      wallet: currentPlayer?.wallet
    });
  });

  socket.on('referral:apply', ({ code }: { code: string }) => {
    const success = loop.applyReferral(playerId, code);
    const currentPlayer = loop.getPlayer(playerId);
    socket.emit('referral:apply:result', {
      success,
      wallet: currentPlayer?.wallet,
      referredBy: currentPlayer?.referredBy
    });
  });

  socket.on('player:getResult', () => {
    const result = loop.getPlayerResult(playerId);
    socket.emit('player:result', result);
  });

  socket.on('player:getWallet', () => {
    const currentPlayer = loop.getPlayer(playerId);
    socket.emit('player:wallet', currentPlayer?.wallet);
  });

  socket.on('disconnect', () => {
    loop.markDisconnected(playerId);
  });
});

server.listen(PORT, () => {
  console.log(`Gecko Sprint server ready on :${PORT}`);
});
