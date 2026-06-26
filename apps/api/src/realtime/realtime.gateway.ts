import { createRealtimeEvent } from "@orbit/realtime";
import { demoIds, slideChangedPayloadSchema } from "@orbit/shared";
import {
  ConnectedSocket,
  MessageBody,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer
} from "@nestjs/websockets";
import { Server, Socket } from "socket.io";

@WebSocketGateway({
  cors: {
    credentials: true,
    origin: process.env.WEB_ORIGIN ?? "http://localhost:5173"
  }
})
export class RealtimeGateway {
  @WebSocketServer()
  server!: Server;

  @SubscribeMessage("project:join")
  handleProjectJoin(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: { projectId?: string; userId?: string }
  ) {
    const roomId = body.projectId ?? demoIds.projectId;
    void client.join(roomId);

    const event = createRealtimeEvent({
      type: "project-joined",
      roomId,
      userId: body.userId ?? demoIds.userId,
      payload: { projectId: roomId }
    });

    this.server.to(roomId).emit("project-joined", event);
    return event;
  }

  @SubscribeMessage("slide:changed")
  handleSlideChanged(@MessageBody() body: unknown) {
    const payload = slideChangedPayloadSchema.parse(body);
    const event = createRealtimeEvent({
      type: "slide-changed",
      roomId: demoIds.projectId,
      sessionId: demoIds.sessionId,
      payload
    });

    this.server.to(event.roomId).emit("slide-changed", event);
    return event;
  }
}

