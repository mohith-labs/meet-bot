import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayInit,
  OnGatewayConnection,
  OnGatewayDisconnect,
  MessageBody,
  ConnectedSocket,
} from '@nestjs/websockets';
import { Logger, UnauthorizedException } from '@nestjs/common';
import { Server, Socket } from 'socket.io';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { ApiKeysService } from '../api-keys/api-keys.service';

interface AuthenticatedSocket extends Socket {
  userId?: string;
  userEmail?: string;
}

@WebSocketGateway({
  path: '/ws',
  cors: {
    origin: '*',
    credentials: true,
  },
})
export class TranscriptGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(TranscriptGateway.name);
  private readonly subscriptions = new Map<string, Set<string>>(); // meetingId -> Set<socketId>

  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly apiKeysService: ApiKeysService,
  ) {}

  afterInit(server: Server) {
    this.logger.log('WebSocket Gateway initialized');
  }

  async handleConnection(client: AuthenticatedSocket) {
    try {
      const token =
        client.handshake.auth?.token ||
        client.handshake.headers?.authorization?.replace('Bearer ', '');
      const apiKey =
        client.handshake.auth?.apiKey ||
        (client.handshake.headers?.['x-api-key'] as string);

      if (token) {
        const payload = this.jwtService.verify(token, {
          secret: this.configService.get<string>(
            'JWT_SECRET',
            'your-super-secret-key-change-in-production',
          ),
        });
        client.userId = payload.sub;
        client.userEmail = payload.email;
      } else if (apiKey) {
        const result = await this.apiKeysService.validateApiKey(apiKey);
        if (!result) {
          throw new UnauthorizedException('Invalid API key');
        }
        client.userId = result.userId;
        client.userEmail = result.user.email;
      } else {
        throw new UnauthorizedException('No authentication provided');
      }

      this.logger.log(
        `Client connected: ${client.id} (user: ${client.userEmail})`,
      );
      client.emit('connected', {
        message: 'Connected to Meeting Bot WebSocket',
        socketId: client.id,
      });
    } catch (error) {
      this.logger.warn(
        `Client ${client.id} authentication failed: ${error.message}`,
      );
      client.emit('error', { message: 'Authentication failed' });
      client.disconnect();
    }
  }

  handleDisconnect(client: AuthenticatedSocket) {
    this.logger.log(`Client disconnected: ${client.id}`);

    // Remove client from all subscriptions
    for (const [meetingId, subscribers] of this.subscriptions.entries()) {
      subscribers.delete(client.id);
      if (subscribers.size === 0) {
        this.subscriptions.delete(meetingId);
      }
    }
  }

  @SubscribeMessage('subscribe')
  handleSubscribe(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: { meetingId?: string; platform?: string; nativeMeetingId?: string },
  ) {
    const meetingKey =
      data.meetingId || `${data.platform}/${data.nativeMeetingId}`;

    if (!meetingKey) {
      return { event: 'error', data: { message: 'meetingId or platform/nativeMeetingId required' } };
    }

    if (!this.subscriptions.has(meetingKey)) {
      this.subscriptions.set(meetingKey, new Set());
    }

    this.subscriptions.get(meetingKey).add(client.id);
    client.join(`meeting:${meetingKey}`);

    this.logger.log(
      `Client ${client.id} subscribed to meeting: ${meetingKey}`,
    );

    return {
      event: 'subscribed',
      data: { meetingId: meetingKey, message: 'Subscribed to transcript updates' },
    };
  }

  @SubscribeMessage('unsubscribe')
  handleUnsubscribe(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: { meetingId?: string; platform?: string; nativeMeetingId?: string },
  ) {
    const meetingKey =
      data.meetingId || `${data.platform}/${data.nativeMeetingId}`;

    if (meetingKey && this.subscriptions.has(meetingKey)) {
      this.subscriptions.get(meetingKey).delete(client.id);
      client.leave(`meeting:${meetingKey}`);
    }

    return {
      event: 'unsubscribed',
      data: { meetingId: meetingKey },
    };
  }

  @SubscribeMessage('ping')
  handlePing(@ConnectedSocket() client: AuthenticatedSocket) {
    return { event: 'pong', data: { timestamp: new Date().toISOString() } };
  }

  /**
   * Broadcast a mutable transcript event to all clients subscribed to a meeting.
   * Called internally by the bot service when a new transcript segment arrives.
   */
  broadcastTranscriptMutable(
    meetingKey: string,
    segment: {
      id: string;
      text: string;
      speaker: string;
      language: string;
      startTime: number;
      endTime: number;
      completed: boolean;
    },
  ) {
    this.server.to(`meeting:${meetingKey}`).emit('transcript.mutable', {
      meetingId: meetingKey,
      segment,
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * Broadcast a meeting status change to all subscribed clients.
   */
  broadcastMeetingStatus(
    meetingKey: string,
    status: string,
    metadata?: Record<string, any>,
  ) {
    this.server.to(`meeting:${meetingKey}`).emit('meeting.status', {
      meetingId: meetingKey,
      status,
      ...metadata,
      timestamp: new Date().toISOString(),
    });
  }
}
