import { Server, Socket } from 'socket.io';

export const setupPauseSockets = (io: Server) => {
  const broadcastLiveSyncCount = () => {
    try {
      const realCount = io.engine?.clientsCount || 0;
      io.emit('live_sync_count', { count: realCount });
    } catch (_) {}
  };

  io.on('connection', (socket: Socket) => {
    console.log(`🌿 Mindful presence connected: ${socket.id}`);
    broadcastLiveSyncCount();

    // Join user's individual room for targeted pause delivery
    socket.on('join_user_room', (userId: string) => {
      if (!userId) return;
      const clean = String(userId).trim();
      socket.join(clean);
      socket.join(clean.toLowerCase());
      const noAt = clean.replace('@', '').toLowerCase();
      socket.join(noAt);
      socket.join(`@${noAt}`);
      if (clean.includes('@') && clean.includes('.')) {
        const base = clean.split('@')[0].toLowerCase();
        socket.join(base);
        socket.join(`@${base}`);
      }
      console.log(`User joined mindful channels: ${clean}, ${noAt}, @${noAt}`);
    });

    // Broadcast presence ping
    socket.on('presence_heartbeat', (data: { userId: string; status: string }) => {
      socket.broadcast.emit('friend_presence_update', data);
    });

    // Non-judgmental early exit notification
    socket.on('step_away_early', (data: { messageId: string }) => {
      console.log(`User gracefully stepped away from pause: ${data.messageId}`);
    });

    socket.on('disconnect', () => {
      console.log(`Presence disconnected: ${socket.id}`);
      broadcastLiveSyncCount();
    });
  });
};
