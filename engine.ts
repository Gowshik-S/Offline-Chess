export type PieceType = 'p' | 'r' | 'n' | 'b' | 'q' | 'k';
export type Color = 'w' | 'b';

export interface Piece {
  type: PieceType;
  color: Color;
  hasMoved?: boolean;
}

export type BoardState = (Piece | null)[][];

export interface Position {
  row: number;
  col: number;
}

export class ChessGame {
  board: BoardState;
  turn: Color;
  history: BoardState[];
  deadPieces: Piece[];
  winner: Color | 'draw' | null = null;

  constructor() {
    this.board = this.createInitialBoard();
    this.turn = 'w';
    this.history = [];
    this.deadPieces = [];
  }

  private createInitialBoard(): BoardState {
    const board: BoardState = Array(8).fill(null).map(() => Array(8).fill(null));
    const setupRow = (row: number, color: Color, pieces: PieceType[]) => {
      pieces.forEach((type, col) => {
        board[row][col] = { type, color, hasMoved: false };
      });
    };

    const backRow: PieceType[] = ['r', 'n', 'b', 'q', 'k', 'b', 'n', 'r'];
    const pawnRow: PieceType[] = Array(8).fill('p');

    setupRow(0, 'b', backRow);
    setupRow(1, 'b', pawnRow);
    setupRow(6, 'w', pawnRow);
    setupRow(7, 'w', backRow);

    return board;
  }

  getPiece(pos: Position): Piece | null {
    if (!this.isValidPos(pos)) return null;
    return this.board[pos.row][pos.col];
  }

  isValidPos(pos: Position): boolean {
    return pos.row >= 0 && pos.row < 8 && pos.col >= 0 && pos.col < 8;
  }

  // Basic move generation (without check validation)
  getPseudoLegalMoves(pos: Position, board: BoardState = this.board): Position[] {
    const piece = board[pos.row][pos.col];
    if (!piece) return [];

    const moves: Position[] = [];
    const { type, color } = piece;
    const direction = color === 'w' ? -1 : 1;

    const addIfValid = (r: number, c: number, captureOnly = false, moveOnly = false) => {
      if (!this.isValidPos({ row: r, col: c })) return false;
      const target = board[r][c];
      if (target && target.color === color) return false; // Blocked by own piece
      
      if (moveOnly && target) return false; // Must be empty
      if (captureOnly && !target) return false; // Must have enemy

      moves.push({ row: r, col: c });
      return !target; // Continue if empty
    };

    if (type === 'p') {
      // Forward 1
      if (addIfValid(pos.row + direction, pos.col, false, true)) {
        // Forward 2
        if (!piece.hasMoved && ((color === 'w' && pos.row === 6) || (color === 'b' && pos.row === 1))) {
          addIfValid(pos.row + direction * 2, pos.col, false, true);
        }
      }
      // Captures
      addIfValid(pos.row + direction, pos.col - 1, true, false);
      addIfValid(pos.row + direction, pos.col + 1, true, false);
    } 
    else if (type === 'n') {
      const offsets = [[-2, -1], [-2, 1], [-1, -2], [-1, 2], [1, -2], [1, 2], [2, -1], [2, 1]];
      offsets.forEach(([dr, dc]) => addIfValid(pos.row + dr, pos.col + dc));
    } 
    else if (type === 'k') {
      const offsets = [[-1, -1], [-1, 0], [-1, 1], [0, -1], [0, 1], [1, -1], [1, 0], [1, 1]];
      offsets.forEach(([dr, dc]) => addIfValid(pos.row + dr, pos.col + dc));
      // Castling (simplified: requires no check logic here, added in final validation)
       if (!piece.hasMoved) {
          // Kingside
          if (board[pos.row][7]?.type === 'r' && !board[pos.row][7]?.hasMoved) {
             if (!board[pos.row][5] && !board[pos.row][6]) moves.push({row: pos.row, col: 6});
          }
          // Queenside
          if (board[pos.row][0]?.type === 'r' && !board[pos.row][0]?.hasMoved) {
             if (!board[pos.row][1] && !board[pos.row][2] && !board[pos.row][3]) moves.push({row: pos.row, col: 2});
          }
       }
    } 
    else {
      // Sliding pieces (r, b, q)
      const directions = [];
      if (type === 'r' || type === 'q') directions.push([-1, 0], [1, 0], [0, -1], [0, 1]);
      if (type === 'b' || type === 'q') directions.push([-1, -1], [-1, 1], [1, -1], [1, 1]);

      directions.forEach(([dr, dc]) => {
        let r = pos.row + dr;
        let c = pos.col + dc;
        while (this.isValidPos({ row: r, col: c })) {
          const target = board[r][c];
          if (target) {
            if (target.color !== color) moves.push({ row: r, col: c });
            break;
          }
          moves.push({ row: r, col: c });
          r += dr;
          c += dc;
        }
      });
    }

    return moves;
  }

  // Is the king of 'color' in check?
  isCheck(color: Color, board: BoardState = this.board): boolean {
    let kingPos: Position | null = null;
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        const p = board[r][c];
        if (p && p.type === 'k' && p.color === color) {
          kingPos = { row: r, col: c };
          break;
        }
      }
    }
    if (!kingPos) return true; // Should not happen unless king captured (illegal)

    // Check if any opponent piece can attack kingPos
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        const p = board[r][c];
        if (p && p.color !== color) {
          const moves = this.getPseudoLegalMoves({ row: r, col: c }, board);
          if (moves.some(m => m.row === kingPos!.row && m.col === kingPos!.col)) {
            return true;
          }
        }
      }
    }
    return false;
  }

  // Get strictly legal moves (filtering out ones that leave king in check)
  getLegalMoves(pos: Position): Position[] {
    const piece = this.getPiece(pos);
    if (!piece || piece.color !== this.turn) return [];

    const pseudoMoves = this.getPseudoLegalMoves(pos);
    return pseudoMoves.filter(move => {
      // Simulate move
      const newBoard = this.cloneBoard(this.board);
      const movedPiece = { ...newBoard[pos.row][pos.col]! };
      
      // Handle Castling Logic for Simulation
      if (movedPiece.type === 'k' && Math.abs(move.col - pos.col) > 1) {
         // Cannot castle out of, through, or into check
         if (this.isCheck(piece.color, this.board)) return false; 
         // Check "through" square
         const direction = move.col > pos.col ? 1 : -1;
         const midBoard = this.cloneBoard(this.board);
         midBoard[pos.row][pos.col + direction] = midBoard[pos.row][pos.col];
         midBoard[pos.row][pos.col] = null;
         if (this.isCheck(piece.color, midBoard)) return false;
      }

      newBoard[move.row][move.col] = movedPiece;
      newBoard[pos.row][pos.col] = null;

      return !this.isCheck(piece.color, newBoard);
    });
  }

  move(from: Position, to: Position): boolean {
    const legalMoves = this.getLegalMoves(from);
    if (!legalMoves.some(m => m.row === to.row && m.col === to.col)) return false;

    const piece = this.board[from.row][from.col]!;
    const target = this.board[to.row][to.col];

    // Handle Capture
    if (target) {
      this.deadPieces.push(target);
    }

    // Move
    this.board[to.row][to.col] = { ...piece, hasMoved: true };
    this.board[from.row][from.col] = null;

    // Handle Castling Move of Rook
    if (piece.type === 'k' && Math.abs(to.col - from.col) > 1) {
       const isKingside = to.col > from.col;
       const rookCol = isKingside ? 7 : 0;
       const rookTargetCol = isKingside ? 5 : 3;
       const rook = this.board[to.row][rookCol];
       if (rook) {
         this.board[to.row][rookTargetCol] = { ...rook, hasMoved: true };
         this.board[to.row][rookCol] = null;
       }
    }

    // Promotion (Auto Queen for simplicity)
    if (piece.type === 'p' && (to.row === 0 || to.row === 7)) {
      this.board[to.row][to.col]!.type = 'q';
    }

    // Switch turn
    this.turn = this.turn === 'w' ? 'b' : 'w';

    // Check Game Over
    if (this.isCheckMate()) {
      this.winner = this.turn === 'w' ? 'b' : 'w';
    } else if (this.isStaleMate()) {
      this.winner = 'draw';
    }

    return true;
  }

  isCheckMate(): boolean {
    if (!this.isCheck(this.turn)) return false;
    return this.hasNoMoves();
  }

  isStaleMate(): boolean {
    if (this.isCheck(this.turn)) return false;
    return this.hasNoMoves();
  }

  hasNoMoves(): boolean {
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        const p = this.board[r][c];
        if (p && p.color === this.turn) {
          if (this.getLegalMoves({ row: r, col: c }).length > 0) return false;
        }
      }
    }
    return true;
  }

  cloneBoard(board: BoardState): BoardState {
    return board.map(row => row.map(p => (p ? { ...p } : null)));
  }

  getFen(): string {
    let fen = "";
    for (let r = 0; r < 8; r++) {
      let empty = 0;
      for (let c = 0; c < 8; c++) {
        const p = this.board[r][c];
        if (!p) {
          empty++;
        } else {
          if (empty > 0) { fen += empty; empty = 0; }
          const char = p.color === 'w' ? p.type.toUpperCase() : p.type;
          fen += char;
        }
      }
      if (empty > 0) fen += empty;
      if (r < 7) fen += "/";
    }
    fen += ` ${this.turn} - - 0 1`; // Simplified tail
    return fen;
  }
}
