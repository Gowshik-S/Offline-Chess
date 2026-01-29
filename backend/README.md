# Chess Online Backend

FastAPI backend for online multiplayer chess with 4-digit room ID matchmaking.

## Features

- 🎮 4-digit room ID for easy sharing
- ⚡ Real-time WebSocket communication
- 🔄 Game state synchronization
- 💬 In-game chat
- 🏳️ Resign and draw offer support

## Setup

### 1. Create Virtual Environment

```bash
cd backend
python -m venv venv

# Windows
venv\Scripts\activate

# Linux/Mac
source venv/bin/activate
```

### 2. Install Dependencies

```bash
pip install -r requirements.txt
```

### 3. Run the Server

```bash
# Development
uvicorn main:app --reload --host 0.0.0.0 --port 8000

# Production
uvicorn main:app --host 0.0.0.0 --port 8000 --workers 4
```

## API Endpoints

### REST Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/` | Health check |
| GET | `/health` | Detailed health status |
| POST | `/room/create` | Create a new room |
| POST | `/room/join/{room_id}` | Join an existing room |
| GET | `/room/{room_id}` | Get room information |
| DELETE | `/room/{room_id}` | Delete a room |

### WebSocket Endpoint

**URL:** `ws://host:8000/ws/{room_id}?player_id={player_id}`

#### Message Types (Client → Server)

```json
// Make a move
{
  "type": "move",
  "data": {
    "from": "e2",
    "to": "e4",
    "fen": "updated_fen_string",
    "promotion": "q"  // optional
  }
}

// Resign
{
  "type": "resign",
  "data": {}
}

// Offer a draw
{
  "type": "draw_offer",
  "data": {}
}

// Accept a draw
{
  "type": "draw_accept",
  "data": {}
}

// Decline a draw
{
  "type": "draw_decline",
  "data": {}
}

// Chat message
{
  "type": "chat",
  "data": {
    "message": "Good game!"
  }
}

// Request game state sync
{
  "type": "sync_request",
  "data": {}
}
```

#### Message Types (Server → Client)

```json
// Connection confirmed
{
  "type": "connected",
  "data": {
    "player_id": "uuid",
    "color": "white",
    "room_id": "1234",
    "game_state": { ... }
  }
}

// Game started
{
  "type": "game_start",
  "data": {
    "game_state": { ... }
  }
}

// Opponent's move
{
  "type": "move",
  "data": {
    "from": "e7",
    "to": "e5",
    "fen": "updated_fen_string",
    "player": "black"
  }
}

// Game over
{
  "type": "game_over",
  "data": {
    "winner": "white",  // or "black" or null for draw
    "reason": "checkmate"  // or "resignation", "draw_agreement", etc.
  }
}

// Player connected/disconnected
{
  "type": "player_connected",  // or "player_disconnected"
  "data": {
    "player_id": "uuid",
    "color": "black"
  }
}

// Draw offer received
{
  "type": "draw_offer",
  "data": {
    "from": "black"
  }
}
```

## Game Flow

1. **Player 1** creates a room → receives 4-digit code
2. **Player 1** shares code with **Player 2**
3. **Player 2** joins with the code
4. Both connect via WebSocket
5. Game starts automatically when both are connected
6. Moves are sent in real-time via WebSocket
7. Game ends on checkmate, resignation, or draw agreement

## Deployment

### Using Docker

```dockerfile
FROM python:3.11-slim

WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

EXPOSE 8000
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
```

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | 8000 | Server port |
| `HOST` | 0.0.0.0 | Server host |

## Frontend Integration

```typescript
// Example frontend connection
const playerId = localStorage.getItem('playerId') || crypto.randomUUID();
const ws = new WebSocket(`ws://server:8000/ws/${roomId}?player_id=${playerId}`);

ws.onmessage = (event) => {
  const message = JSON.parse(event.data);
  
  switch (message.type) {
    case 'move':
      // Apply opponent's move
      break;
    case 'game_over':
      // Show game result
      break;
    // ... handle other message types
  }
};

// Send a move
ws.send(JSON.stringify({
  type: 'move',
  data: { from: 'e2', to: 'e4', fen: newFen }
}));
```
