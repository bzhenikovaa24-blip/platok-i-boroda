import { Logger } from '@nestjs/common';
import { ConnectedSocket, MessageBody, OnGatewayDisconnect, SubscribeMessage, WebSocketGateway } from '@nestjs/websockets';
import { WebSocket } from 'ws';

interface Room {
  code: string;
  host: WebSocket;
  guest: WebSocket | null;
}

@WebSocketGateway({ path: '/ws' })
export class NetGateway implements OnGatewayDisconnect {
  private readonly logger = new Logger('Net');
  private readonly rooms = new Map<string, Room>();
  private readonly roomOf = new Map<WebSocket, Room>();

  private send(ws: WebSocket | null, event: string, data: unknown) {
    if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ event, data }));
  }

  private newCode(): string {
    for (;;) {
      const code = String(Math.floor(1000 + Math.random() * 9000));
      if (!this.rooms.has(code)) return code;
    }
  }

  @SubscribeMessage('host')
  host(@ConnectedSocket() ws: WebSocket) {
    this.leave(ws);
    const room: Room = { code: this.newCode(), host: ws, guest: null };
    this.rooms.set(room.code, room);
    this.roomOf.set(ws, room);
    this.logger.log(`Создана комната ${room.code}`);
    return { event: 'room', data: { code: room.code, role: 'host' } };
  }

  @SubscribeMessage('join')
  join(@ConnectedSocket() ws: WebSocket, @MessageBody() data: { code?: string }) {
    const room = this.rooms.get(String(data?.code || '').trim());
    if (!room) return { event: 'error', data: { message: 'Комната не найдена' } };
    if (room.guest && room.guest !== ws) return { event: 'error', data: { message: 'В комнате уже двое' } };
    this.leave(ws);
    room.guest = ws;
    this.roomOf.set(ws, room);
    this.send(room.host, 'peer', { joined: true });
    this.logger.log(`В комнату ${room.code} зашёл второй игрок`);
    return { event: 'room', data: { code: room.code, role: 'guest' } };
  }

  @SubscribeMessage('state')
  state(@ConnectedSocket() ws: WebSocket, @MessageBody() data: unknown) {
    const room = this.roomOf.get(ws);
    if (room && room.host === ws) this.send(room.guest, 'state', data);
  }

  @SubscribeMessage('input')
  input(@ConnectedSocket() ws: WebSocket, @MessageBody() data: unknown) {
    const room = this.roomOf.get(ws);
    if (room && room.guest === ws) this.send(room.host, 'input', data);
  }

  @SubscribeMessage('event')
  relay(@ConnectedSocket() ws: WebSocket, @MessageBody() data: unknown) {
    const room = this.roomOf.get(ws);
    if (!room) return;
    this.send(room.host === ws ? room.guest : room.host, 'event', data);
  }

  handleDisconnect(ws: WebSocket) {
    this.leave(ws);
  }

  private leave(ws: WebSocket) {
    const room = this.roomOf.get(ws);
    if (!room) return;
    this.roomOf.delete(ws);
    if (room.host === ws) {
      this.send(room.guest, 'left', { who: 'host' });
      if (room.guest) this.roomOf.delete(room.guest);
      this.rooms.delete(room.code);
    } else if (room.guest === ws) {
      room.guest = null;
      this.send(room.host, 'left', { who: 'guest' });
    }
  }
}
