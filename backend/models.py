from pydantic import BaseModel
from typing import Optional, Literal
from enum import Enum


class PlayerColor(str, Enum):
    WHITE = "white"
    BLACK = "black"


class GameStatus(str, Enum):
    WAITING = "waiting"
    ACTIVE = "active"
    FINISHED = "finished"


class MoveData(BaseModel):
    from_square: str
    to_square: str
    promotion: Optional[str] = None


class GameState(BaseModel):
    fen: str
    current_turn: PlayerColor
    move_history: list[str] = []
    status: GameStatus = GameStatus.WAITING
    winner: Optional[PlayerColor] = None


class Player(BaseModel):
    id: str
    color: Optional[PlayerColor] = None
    connected: bool = True


class Room(BaseModel):
    room_id: str
    players: list[Player] = []
    game_state: Optional[GameState] = None
    created_at: float


class CreateRoomResponse(BaseModel):
    room_id: str
    message: str


class JoinRoomResponse(BaseModel):
    success: bool
    room_id: str
    color: Optional[PlayerColor] = None
    message: str


class WebSocketMessage(BaseModel):
    type: str
    data: Optional[dict] = None
