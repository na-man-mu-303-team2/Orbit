export type ConnectedRealtimeUser = {
  id: string;
  connectedAt: string;
  transport: string;
  environment: {
    browserLabel: string;
  };
};

export type CanvasShape = {
  roomId: string;
  id: string;
  kind: "rect" | "circle";
  x: number;
  y: number;
  width?: number;
  height?: number;
  radius?: number;
  fill?: string;
};

export type CanvasRoom = {
  roomId: string;
  password: string;
  shapes: Map<string, CanvasShape>;
  createdAt: string;
};

const canvasRooms = new Map<string, CanvasRoom>();

export function createCanvasRoom(
  roomId: string,
  password: string,
  createdAt = new Date().toISOString()
): CanvasRoom {
  const room: CanvasRoom = {
    roomId,
    password,
    shapes: createInitialShapes(roomId),
    createdAt
  };

  canvasRooms.set(roomId, room);
  return room;
}

export function getCanvasRoom(roomId: string): CanvasRoom | undefined {
  return canvasRooms.get(roomId);
}

export function verifyCanvasRoomPassword(
  roomId: string,
  password: string
): boolean {
  return canvasRooms.get(roomId)?.password === password;
}

export function getCanvasState(roomId: string): CanvasShape[] {
  return [...(canvasRooms.get(roomId)?.shapes.values() ?? [])];
}

export function updateCanvasShape(shape: CanvasShape): boolean {
  const room = canvasRooms.get(shape.roomId);
  if (!room) {
    return false;
  }

  room.shapes.set(shape.id, shape);
  return true;
}

function createInitialShapes(roomId: string): Map<string, CanvasShape> {
  return new Map<string, CanvasShape>([
    [
      "rect_1",
      {
        roomId,
        id: "rect_1",
        kind: "rect",
        x: 120,
        y: 120,
        width: 160,
        height: 96,
        fill: "#f97316"
      }
    ],
    [
      "circle_1",
      {
        roomId,
        id: "circle_1",
        kind: "circle",
        x: 420,
        y: 220,
        radius: 48,
        fill: "#38bdf8"
      }
    ]
  ]);
}
