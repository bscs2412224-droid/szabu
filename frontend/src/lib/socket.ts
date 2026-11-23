import { io } from 'socket.io-client';
import type { Socket } from 'socket.io-client';
import { API_ORIGIN } from './config';
import { savedToken } from './session';

// One live connection per signed-in user (Socket.IO). The server uses it to push new messages and
// Sent / Delivered / Read changes the moment they happen.
let socket: Socket | null = null;

export function getSocket(): Socket {
  if (!socket) {
    socket = io(API_ORIGIN || undefined, {
      path: '/socket.io',
      // read the token at every (re)connect so a fresh login is picked up
      auth: (send) => send({ token: savedToken() }),
      transports: ['websocket', 'polling'],
    });
  }
  return socket;
}

/** Log out: close the connection. The next login opens a new one. */
export function disconnectSocket(): void {
  socket?.disconnect();
  socket = null;
}
