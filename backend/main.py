import uuid
import json
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from typing import Optional

from models import (
    CreateRoomResponse, 
    JoinRoomResponse, 
    PlayerColor,
    GameStatus,
    GameState
)
from room_manager import room_manager

app = FastAPI(
    title="Offline Chess - Online Mode API",
    description="Backend API for online multiplayer chess with room-based matchmaking",
    version="1.0.0"
)

# CORS middleware for mobile app access
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # In production, specify your app's origin
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/")
async def root():
    """Health check endpoint"""
    return {"status": "online", "message": "Chess server is running"}


@app.get("/health")
async def health_check():
    """Health check for monitoring"""
    return {"status": "healthy", "active_rooms": len(room_manager.rooms)}


@app.post("/room/create", response_model=CreateRoomResponse)
async def create_room(player_id: Optional[str] = None):
    """Create a new game room and get a 4-digit room ID"""
    if not player_id:
        player_id = str(uuid.uuid4())
    
    room = room_manager.create_room(player_id)
    
    return CreateRoomResponse(
        room_id=room.room_id,
        message=f"Room created. Share code {room.room_id} with your opponent."
    )


@app.post("/room/join/{room_id}", response_model=JoinRoomResponse)
async def join_room(room_id: str, player_id: Optional[str] = None):
    """Join an existing room using the 4-digit room ID"""
    if not player_id:
        player_id = str(uuid.uuid4())
    
    success, room, message = room_manager.join_room(room_id, player_id)
    
    if not success:
        raise HTTPException(status_code=400, detail=message)
    
    color = room_manager.get_player_color(room_id, player_id)
    
    return JoinRoomResponse(
        success=True,
        room_id=room_id,
        color=color,
        message=message
    )


@app.get("/room/{room_id}")
async def get_room_info(room_id: str):
    """Get information about a room"""
    room = room_manager.get_room(room_id)
    
    if not room:
        raise HTTPException(status_code=404, detail="Room not found")
    
    return {
        "room_id": room.room_id,
        "player_count": len(room.players),
        "status": room.game_state.status if room.game_state else GameStatus.WAITING,
        "game_state": room.game_state
    }


@app.delete("/room/{room_id}")
async def delete_room(room_id: str):
    """Delete a room"""
    room = room_manager.get_room(room_id)
    
    if not room:
        raise HTTPException(status_code=404, detail="Room not found")
    
    room_manager.remove_room(room_id)
    
    return {"message": "Room deleted successfully"}


@app.websocket("/ws/{room_id}")
async def websocket_endpoint(
    websocket: WebSocket, 
    room_id: str,
    player_id: str = Query(...)
):
    """
    WebSocket connection for real-time game communication
    
    Message types:
    - move: Send a chess move
    - chat: Send a chat message
    - resign: Resign from the game
    - draw_offer: Offer a draw
    - draw_accept: Accept a draw offer
    - draw_decline: Decline a draw offer
    """
    room = room_manager.get_room(room_id)
    
    if not room:
        await websocket.close(code=4004, reason="Room not found")
        return
    
    # Check if player is in the room
    player_in_room = any(p.id == player_id for p in room.players)
    if not player_in_room:
        await websocket.close(code=4003, reason="Player not in room")
        return
    
    await room_manager.connect(room_id, player_id, websocket)
    
    player_color = room_manager.get_player_color(room_id, player_id)
    
    # Send initial connection info
    await websocket.send_json({
        "type": "connected",
        "data": {
            "player_id": player_id,
            "color": player_color,
            "room_id": room_id,
            "game_state": room.game_state.model_dump() if room.game_state else None
        }
    })
    
    # Notify other players
    await room_manager.broadcast_to_room(
        room_id,
        {
            "type": "player_connected",
            "data": {"player_id": player_id, "color": player_color}
        },
        exclude_player=player_id
    )
    
    # If game is active and both players connected, notify everyone to start
    room = room_manager.get_room(room_id)
    if room and room.game_state and room.game_state.status == GameStatus.ACTIVE:
        connected_count = len(room_manager.connections.get(room_id, {}))
        print(f"Room {room_id}: {connected_count} players connected, game status: {room.game_state.status}")
        if connected_count == 2:
            print(f"Both players connected! Sending game_start to room {room_id}")
            await room_manager.broadcast_to_room(
                room_id,
                {
                    "type": "game_start",
                    "data": {
                        "game_state": room.game_state.model_dump()
                    }
                }
            )
    
    try:
        while True:
            data = await websocket.receive_json()
            message_type = data.get("type")
            message_data = data.get("data", {})
            
            if message_type == "move":
                # Handle chess move
                from_square = message_data.get("from")
                to_square = message_data.get("to")
                fen = message_data.get("fen")
                promotion = message_data.get("promotion")
                
                # Update game state
                move_notation = f"{from_square}{to_square}"
                if promotion:
                    move_notation += promotion
                
                room_manager.update_game_state(room_id, fen, move_notation)
                
                # Broadcast move to opponent
                await room_manager.broadcast_to_room(
                    room_id,
                    {
                        "type": "move",
                        "data": {
                            "from": from_square,
                            "to": to_square,
                            "fen": fen,
                            "promotion": promotion,
                            "player": player_color
                        }
                    },
                    exclude_player=player_id
                )
            
            elif message_type == "game_over":
                # Handle game end
                winner = message_data.get("winner")
                reason = message_data.get("reason", "unknown")
                
                winner_color = PlayerColor(winner) if winner else None
                room_manager.end_game(room_id, winner_color, reason)
                
                await room_manager.broadcast_to_room(
                    room_id,
                    {
                        "type": "game_over",
                        "data": {
                            "winner": winner,
                            "reason": reason
                        }
                    }
                )
            
            elif message_type == "resign":
                # Player resigns
                winner_color = PlayerColor.BLACK if player_color == PlayerColor.WHITE else PlayerColor.WHITE
                room_manager.end_game(room_id, winner_color, "resignation")
                
                await room_manager.broadcast_to_room(
                    room_id,
                    {
                        "type": "game_over",
                        "data": {
                            "winner": winner_color,
                            "reason": "resignation",
                            "resigned_player": player_color
                        }
                    }
                )
            
            elif message_type == "draw_offer":
                # Offer a draw
                await room_manager.broadcast_to_room(
                    room_id,
                    {
                        "type": "draw_offer",
                        "data": {"from": player_color}
                    },
                    exclude_player=player_id
                )
            
            elif message_type == "draw_accept":
                # Accept draw
                room_manager.end_game(room_id, None, "draw_agreement")
                
                await room_manager.broadcast_to_room(
                    room_id,
                    {
                        "type": "game_over",
                        "data": {
                            "winner": None,
                            "reason": "draw_agreement"
                        }
                    }
                )
            
            elif message_type == "draw_decline":
                # Decline draw
                await room_manager.broadcast_to_room(
                    room_id,
                    {
                        "type": "draw_declined",
                        "data": {"from": player_color}
                    },
                    exclude_player=player_id
                )
            
            elif message_type == "chat":
                # Chat message
                message = message_data.get("message", "")
                
                await room_manager.broadcast_to_room(
                    room_id,
                    {
                        "type": "chat",
                        "data": {
                            "from": player_color,
                            "message": message
                        }
                    },
                    exclude_player=player_id
                )
            
            elif message_type == "restart":
                # Restart game - reset game state and notify all players
                room = room_manager.get_room(room_id)
                if room:
                    room.game_state = GameState(
                        fen="rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
                        current_turn=PlayerColor.WHITE,
                        move_history=[],
                        status=GameStatus.ACTIVE
                    )
                    
                    # Notify all players including sender
                    await room_manager.broadcast_to_room(
                        room_id,
                        {
                            "type": "restart",
                            "data": {
                                "game_state": room.game_state.model_dump()
                            }
                        }
                    )
            
            elif message_type == "sync_request":
                # Request current game state sync
                room = room_manager.get_room(room_id)
                if room and room.game_state:
                    await websocket.send_json({
                        "type": "sync_response",
                        "data": {
                            "game_state": room.game_state.model_dump()
                        }
                    })
    
    except WebSocketDisconnect:
        room_manager.disconnect(room_id, player_id)
        
        # Notify other players about disconnection
        await room_manager.broadcast_to_room(
            room_id,
            {
                "type": "player_disconnected",
                "data": {"player_id": player_id, "color": player_color}
            }
        )
    
    except Exception as e:
        print(f"WebSocket error: {e}")
        room_manager.disconnect(room_id, player_id)


@app.on_event("startup")
async def startup_event():
    """Cleanup old rooms on startup"""
    room_manager.cleanup_old_rooms()


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
