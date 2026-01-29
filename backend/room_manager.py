import random
import string
import time
from typing import Dict, Optional
from fastapi import WebSocket
from models import Room, Player, GameState, PlayerColor, GameStatus


class RoomManager:
    def __init__(self):
        self.rooms: Dict[str, Room] = {}
        self.connections: Dict[str, Dict[str, WebSocket]] = {}  # room_id -> {player_id: websocket}
        self.player_rooms: Dict[str, str] = {}  # player_id -> room_id
    
    def generate_room_id(self) -> str:
        """Generate a unique 4-digit room ID"""
        while True:
            room_id = ''.join(random.choices(string.digits, k=4))
            if room_id not in self.rooms:
                return room_id
    
    def create_room(self, player_id: str) -> Room:
        """Create a new room and add the creator as the first player"""
        room_id = self.generate_room_id()
        
        # First player gets white
        player = Player(id=player_id, color=PlayerColor.WHITE)
        
        room = Room(
            room_id=room_id,
            players=[player],
            game_state=None,
            created_at=time.time()
        )
        
        self.rooms[room_id] = room
        self.connections[room_id] = {}
        self.player_rooms[player_id] = room_id
        
        return room
    
    def join_room(self, room_id: str, player_id: str) -> tuple[bool, Optional[Room], str]:
        """Join an existing room"""
        if room_id not in self.rooms:
            return False, None, "Room not found"
        
        room = self.rooms[room_id]
        
        # Check if player is already in the room
        for player in room.players:
            if player.id == player_id:
                return True, room, "Already in room"
        
        if len(room.players) >= 2:
            return False, None, "Room is full"
        
        # Second player gets black
        player = Player(id=player_id, color=PlayerColor.BLACK)
        room.players.append(player)
        self.player_rooms[player_id] = room_id
        
        # Initialize game state when both players are present
        if len(room.players) == 2:
            room.game_state = GameState(
                fen="rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
                current_turn=PlayerColor.WHITE,
                move_history=[],
                status=GameStatus.ACTIVE
            )
        
        return True, room, "Joined successfully"
    
    def get_room(self, room_id: str) -> Optional[Room]:
        """Get room by ID"""
        return self.rooms.get(room_id)
    
    def get_player_room(self, player_id: str) -> Optional[Room]:
        """Get the room a player is in"""
        room_id = self.player_rooms.get(player_id)
        if room_id:
            return self.rooms.get(room_id)
        return None
    
    def get_player_color(self, room_id: str, player_id: str) -> Optional[PlayerColor]:
        """Get the color assigned to a player in a room"""
        room = self.get_room(room_id)
        if room:
            for player in room.players:
                if player.id == player_id:
                    return player.color
        return None
    
    async def connect(self, room_id: str, player_id: str, websocket: WebSocket):
        """Add a WebSocket connection for a player in a room"""
        await websocket.accept()
        
        if room_id not in self.connections:
            self.connections[room_id] = {}
        
        self.connections[room_id][player_id] = websocket
        print(f"[WS] Player {player_id[:8]}... connected to room {room_id}")
        print(f"[WS] Room {room_id} now has {len(self.connections[room_id])} WebSocket connections")
        print(f"[WS] Connected players: {list(self.connections[room_id].keys())}")
        
        # Update player connection status
        room = self.get_room(room_id)
        if room:
            print(f"[WS] Room has {len(room.players)} registered players")
            for player in room.players:
                if player.id == player_id:
                    player.connected = True
                    break
    
    def disconnect(self, room_id: str, player_id: str):
        """Remove a WebSocket connection"""
        if room_id in self.connections and player_id in self.connections[room_id]:
            del self.connections[room_id][player_id]
        
        # Update player connection status
        room = self.get_room(room_id)
        if room:
            for player in room.players:
                if player.id == player_id:
                    player.connected = False
                    break
    
    async def broadcast_to_room(self, room_id: str, message: dict, exclude_player: Optional[str] = None):
        """Send a message to all players in a room"""
        if room_id in self.connections:
            for player_id, websocket in self.connections[room_id].items():
                if exclude_player and player_id == exclude_player:
                    continue
                try:
                    await websocket.send_json(message)
                except Exception:
                    pass
    
    async def send_to_player(self, room_id: str, player_id: str, message: dict):
        """Send a message to a specific player"""
        if room_id in self.connections and player_id in self.connections[room_id]:
            try:
                await self.connections[room_id][player_id].send_json(message)
            except Exception:
                pass
    
    def update_game_state(self, room_id: str, fen: str, move: str):
        """Update the game state after a move"""
        room = self.get_room(room_id)
        if room and room.game_state:
            room.game_state.fen = fen
            room.game_state.move_history.append(move)
            # Toggle turn
            room.game_state.current_turn = (
                PlayerColor.BLACK if room.game_state.current_turn == PlayerColor.WHITE 
                else PlayerColor.WHITE
            )
    
    def end_game(self, room_id: str, winner: Optional[PlayerColor], reason: str):
        """End the game"""
        room = self.get_room(room_id)
        if room and room.game_state:
            room.game_state.status = GameStatus.FINISHED
            room.game_state.winner = winner
    
    def remove_room(self, room_id: str):
        """Remove a room"""
        if room_id in self.rooms:
            room = self.rooms[room_id]
            for player in room.players:
                if player.id in self.player_rooms:
                    del self.player_rooms[player.id]
            del self.rooms[room_id]
        
        if room_id in self.connections:
            del self.connections[room_id]
    
    def cleanup_old_rooms(self, max_age_hours: int = 24):
        """Remove rooms older than max_age_hours"""
        current_time = time.time()
        max_age_seconds = max_age_hours * 3600
        
        rooms_to_remove = []
        for room_id, room in self.rooms.items():
            if current_time - room.created_at > max_age_seconds:
                rooms_to_remove.append(room_id)
        
        for room_id in rooms_to_remove:
            self.remove_room(room_id)


# Global room manager instance
room_manager = RoomManager()
