import React, { useState, useEffect, useRef, useCallback } from 'react';
import { GoogleGenAI } from "@google/genai";
import LZString from 'lz-string';
import QRCode from 'qrcode';
import { ChessGame, Position, PieceType, Color, Piece } from './engine';

// Backend server URL - Uses Vite environment variable
// Set VITE_BACKEND_URL in .env file or Vercel environment variables
const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'https://cb.gowshik.online';
const WS_URL = BACKEND_URL.replace('http', 'ws');

// Type declaration for BarcodeDetector
declare global {
  interface Window {
    BarcodeDetector: typeof BarcodeDetector;
  }
  class BarcodeDetector {
    constructor(options?: { formats: string[] });
    detect(image: ImageBitmapSource): Promise<{ rawValue: string }[]>;
    static getSupportedFormats(): Promise<string[]>;
  }
}

// --- Icons & Assets ---
const PieceIcon = ({ type, color, className }: { type: PieceType; color: Color; className?: string }) => {
  const isWhite = color === 'w';
  const fill = isWhite ? "#fff" : "#000";
  const stroke = isWhite ? "#000" : "#fff";
  const strokeWidth = isWhite ? "1.5" : "1";
  
  // High-quality chess piece SVG paths based on classic Staunton design
  const pieces: Record<PieceType, React.ReactNode> = {
    p: ( // Pawn
      <g>
        <circle cx="22.5" cy="9" r="2.5" />
        <path d="M15.5 18.5 c0-2 1.5-3 3-3.5 c-1-1-1.5-2.5-1.5-4 c0-2.5 2.5-4.5 5.5-4.5 c3 0 5.5 2 5.5 4.5 c0 1.5-.5 3-1.5 4 c1.5.5 3 1.5 3 3.5" />
        <path d="M12 24 h21 v-3 h-21 z" />
        <path d="M14 21 h17 v-2 h-17 z" />
      </g>
    ),
    r: ( // Rook
      <g>
        <path d="M9,39 L36,39 L36,36 L9,36 L9,39 z" />
        <path d="M12.5,32 L14.5,29 L30.5,29 L32.5,32 L12.5,32 z" />
        <path d="M12,36 L12,32 L33,32 L33,36 L12,36 z" />
        <path d="M14,29.5 L14,16.5 L31,16.5 L31,29.5 L14,29.5 z" />
        <path d="M14,16.5 L11,14 L34,14 L31,16.5 L14,16.5 z" />
        <path d="M11,14 L11,9 L15,9 L15,11 L20,11 L20,9 L25,9 L25,11 L30,11 L30,9 L34,9 L34,14 L11,14 z" />
      </g>
    ),
    n: ( // Knight
      <g>
        <path d="M 22,10 C 32.5,11 38.5,18 38,39 L 15,39 C 15,30 25,32.5 23,18" />
        <path d="M 24,18 C 24.38,20.91 18.45,25.37 16,27 C 13,29 13.18,31.34 11,31 C 9.958,30.06 12.41,27.96 11,28 C 10,28 11.19,29.23 10,30 C 9,30 5.997,31 6,26 C 6,24 12,14 12,14 C 12,14 13.89,12.1 14,10.5 C 13.27,9.506 13.5,8.5 13.5,7.5 C 14.5,6.5 16.5,10 16.5,10 L 18.5,10 C 18.5,10 19.28,8.008 21,7 C 22,7 22,10 22,10" />
        <path d="M 9.5 25.5 A 0.5 0.5 0 1 1 8.5,25.5 A 0.5 0.5 0 1 1 9.5 25.5 z" />
        <path d="M 15 15.5 A 0.5 1.5 0 1 1 14,15.5 A 0.5 1.5 0 1 1 15 15.5 z" transform="matrix(0.866,0.5,-0.5,0.866,9.693,-5.173)" />
      </g>
    ),
    b: ( // Bishop
      <g>
        <path d="M9,36 c3.39-0.97 10.11,0.43 13.5-2 c3.39,2.43 10.11,1.03 13.5,2 L36,36 L9,36 z" />
        <path d="M15,32 c2.5,2.5 12.5,2.5 15,0 c0.5-1.5 0-2 0-2 c0-2.5-2.5-4-2.5-4 c5.5-1.5 6-11.5-5-15.5 c-11,4-10.5,14-5,15.5 c0,0-2.5,1.5-2.5,4 c0,0-0.5,0.5 0,2 z" />
        <path d="M25,8 A2.5,2.5 0 1 1 20,8 A2.5,2.5 0 1 1 25,8 z" />
        <path d="M17.5,26 L27.5,26 M15,30 L30,30 M22.5,15.5 L22.5,20.5 M20,18 L25,18" fill="none" strokeLinejoin="miter" />
      </g>
    ),
    q: ( // Queen
      <g>
        <circle cx="6" cy="12" r="2.75" />
        <circle cx="14" cy="9" r="2.75" />
        <circle cx="22.5" cy="8" r="2.75" />
        <circle cx="31" cy="9" r="2.75" />
        <circle cx="39" cy="12" r="2.75" />
        <path d="M9,26 C17.5,24.5 30,24.5 36,26 L38.5,13.5 L31,25 L30.7,10.9 L25.5,24.5 L22.5,10 L19.5,24.5 L14.3,10.9 L14,25 L6.5,13.5 L9,26 z" />
        <path d="M9,26 C9,28-1.5,30 9,29.5 C17.5,30 30,30.5 36,29.5 C46,30 36,28 36,26 C30,24.5 17.5,24.5 9,26 z" />
        <path d="M9,29.5 C9,30.5 17.5,33 22.5,33.5 C27.5,33 36,30.5 36,29.5 C30,30.5 17.5,30.5 9,29.5 z" />
        <path d="M10.5,33.5 C15.5,36.5 29.5,36.5 34.5,33.5" fill="none" />
        <path d="M11,38.5 A35,35 1 0 0 34,38.5 L34,35.5 A35,35 1 0 1 11,35.5 L11,38.5 z" />
      </g>
    ),
    k: ( // King
      <g>
        <path d="M22.5,11.63 L22.5,6" strokeLinejoin="miter" />
        <path d="M20,8 L25,8" strokeLinejoin="miter" />
        <path d="M22.5,25 C22.5,25 27,17.5 25.5,14.5 C25.5,14.5 24.5,12 22.5,12 C20.5,12 19.5,14.5 19.5,14.5 C18,17.5 22.5,25 22.5,25" />
        <path d="M12.5,37 C18,40.5 27,40.5 32.5,37 L32.5,30 C32.5,30 41.5,25.5 38.5,19.5 C34.5,13 25,16 22.5,23.5 L22.5,27 L22.5,23.5 C20,16 10.5,13 6.5,19.5 C3.5,25.5 12.5,30 12.5,30 L12.5,37 z" />
        <path d="M12.5,30 C18,27 27,27 32.5,30" fill="none" />
        <path d="M12.5,33.5 C18,30.5 27,30.5 32.5,33.5" fill="none" />
        <path d="M12.5,37 C18,34 27,34 32.5,37" fill="none" />
      </g>
    ),
  };

  return (
    <svg 
      viewBox="0 0 45 45" 
      fill={fill} 
      stroke={stroke} 
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className} 
      style={{ 
        filter: `drop-shadow(1px 2px 3px rgba(0,0,0,0.4))`,
      }}
    >
      {pieces[type]}
    </svg>
  );
};

const Spinner = () => (
  <svg className="animate-spin h-5 w-5 text-[#81b64c]" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
  </svg>
);

// QR Code Display Component
const QRCodeDisplay = ({ data, size = 200 }: { data: string; size?: number }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  
  useEffect(() => {
    if (canvasRef.current && data) {
      QRCode.toCanvas(canvasRef.current, data, {
        width: size,
        margin: 2,
        color: {
          dark: '#1a1916',
          light: '#ffffff'
        },
        errorCorrectionLevel: 'L'
      });
    }
  }, [data, size]);
  
  return <canvas ref={canvasRef} className="rounded-xl" />;
};

// Fast QR Scanner Component using BarcodeDetector API
const QRScanner = ({ onScan, onClose }: { onScan: (data: string) => void; onClose: () => void }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const detectorRef = useRef<BarcodeDetector | null>(null);
  const scanningRef = useRef(true);
  const [error, setError] = useState<string | null>(null);
  const [hasScanned, setHasScanned] = useState(false);

  useEffect(() => {
    let animationId: number;
    
    const startScanner = async () => {
      try {
        // Check if BarcodeDetector is supported
        if (!('BarcodeDetector' in window)) {
          setError('QR scanning not supported on this device. Please paste the code manually.');
          return;
        }
        
        // Create detector
        detectorRef.current = new window.BarcodeDetector({ formats: ['qr_code'] });
        
        // Get camera stream with optimized settings for fast scanning
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: 'environment',
            width: { ideal: 1280 },
            height: { ideal: 720 },
            frameRate: { ideal: 30 }
          }
        });
        
        streamRef.current = stream;
        
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
          
          // Start fast scanning loop
          const scan = async () => {
            if (!scanningRef.current || !videoRef.current || !detectorRef.current || hasScanned) return;
            
            try {
              const barcodes = await detectorRef.current.detect(videoRef.current);
              if (barcodes.length > 0 && barcodes[0].rawValue) {
                scanningRef.current = false;
                setHasScanned(true);
                // Immediate callback - no delay
                onScan(barcodes[0].rawValue);
                return;
              }
            } catch (e) {
              // Continue scanning on detection errors
            }
            
            // Request next frame immediately for fast response
            animationId = requestAnimationFrame(scan);
          };
          
          // Start scanning immediately
          scan();
        }
      } catch (err) {
        console.error('Scanner error:', err);
        setError('Could not access camera. Please check permissions or paste code manually.');
      }
    };
    
    startScanner();
    
    return () => {
      scanningRef.current = false;
      if (animationId) cancelAnimationFrame(animationId);
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
      }
    };
  }, [onScan, hasScanned]);

  return (
    <div className="fixed inset-0 bg-black/95 z-50 flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-white font-bold text-lg">Scan QR Code</h3>
          <button 
            onClick={onClose}
            className="text-gray-400 hover:text-white text-2xl"
          >
            ✕
          </button>
        </div>
        
        {error ? (
          <div className="bg-red-900/50 text-red-200 p-4 rounded-xl text-center">
            <p className="text-sm">{error}</p>
            <button 
              onClick={onClose}
              className="mt-4 px-6 py-2 bg-[#3a3937] text-white rounded-lg"
            >
              Close
            </button>
          </div>
        ) : (
          <>
            <div className="relative rounded-2xl overflow-hidden bg-black aspect-square">
              <video 
                ref={videoRef} 
                className="w-full h-full object-cover"
                playsInline
                muted
              />
              {/* Scanning overlay */}
              <div className="absolute inset-0 pointer-events-none">
                <div className="absolute inset-8 border-2 border-[#81b64c] rounded-xl">
                  <div className="absolute top-0 left-0 w-8 h-8 border-t-4 border-l-4 border-[#81b64c] rounded-tl-xl" />
                  <div className="absolute top-0 right-0 w-8 h-8 border-t-4 border-r-4 border-[#81b64c] rounded-tr-xl" />
                  <div className="absolute bottom-0 left-0 w-8 h-8 border-b-4 border-l-4 border-[#81b64c] rounded-bl-xl" />
                  <div className="absolute bottom-0 right-0 w-8 h-8 border-b-4 border-r-4 border-[#81b64c] rounded-br-xl" />
                </div>
                {/* Scanning line animation */}
                <div className="absolute left-8 right-8 top-8 h-0.5 bg-[#81b64c] animate-pulse opacity-75" 
                  style={{ 
                    animation: 'scan 1.5s ease-in-out infinite',
                  }} 
                />
              </div>
              {hasScanned && (
                <div className="absolute inset-0 bg-[#81b64c]/20 flex items-center justify-center">
                  <div className="bg-[#81b64c] rounded-full p-4">
                    <svg className="w-12 h-12 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                </div>
              )}
            </div>
            <p className="text-gray-400 text-sm text-center mt-4">
              Point your camera at the QR code
            </p>
          </>
        )}
      </div>
      <style>{`
        @keyframes scan {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(calc(100vw - 4rem - 64px)); }
        }
      `}</style>
    </div>
  );
};

export default function App() {
  const [game, setGame] = useState(new ChessGame());
  const [board, setBoard] = useState(game.board);
  const [turn, setTurn] = useState(game.turn);
  const [selected, setSelected] = useState<Position | null>(null);
  const [validMoves, setValidMoves] = useState<Position[]>([]);
  const [winner, setWinner] = useState<Color | 'draw' | null>(null);
  const [flipped, setFlipped] = useState(false);
  const [lastMove, setLastMove] = useState<{from: Position, to: Position} | null>(null);
  
  // Move History Log (like chess.com)
  const [moveHistory, setMoveHistory] = useState<{moveNum: number, white: string, black: string}[]>([]);
  const moveHistoryRef = useRef<HTMLDivElement>(null);
  
  // AI State
  const [aiAnalysis, setAiAnalysis] = useState<string | null>(null);
  const [isAiThinking, setIsAiThinking] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isAnalysisOpen, setIsAnalysisOpen] = useState(false);

  // App Flow State
  const [view, setView] = useState<'home' | 'lobby' | 'game'>('home');
  const [lobbyMode, setLobbyMode] = useState<'host' | 'join'>('host');
  
  // Network Mode State
  const [isOnlineMode, setIsOnlineMode] = useState(false); // true = online server, false = local P2P
  const [networkAvailable, setNetworkAvailable] = useState(navigator.onLine);
  const [serverAvailable, setServerAvailable] = useState(false);
  
  // Connection State
  const [connectionStatus, setConnectionStatus] = useState<'disconnected' | 'connecting' | 'awaiting-response' | 'connected'>('disconnected');
  const [playerColor, setPlayerColor] = useState<Color>('w');
  const [localCode, setLocalCode] = useState<string>(''); // Code I generate
  const [remoteCodeInput, setRemoteCodeInput] = useState<string>(''); // Code I input
  const [codeCopied, setCodeCopied] = useState(false);
  const [showQRScanner, setShowQRScanner] = useState(false);
  const [showQRCode, setShowQRCode] = useState(true);
  
  // Room & Player State
  const [roomId, setRoomId] = useState<string>('');
  const [playerName, setPlayerName] = useState<string>('');
  const [opponentName, setOpponentName] = useState<string>('');
  const [players, setPlayers] = useState<{name: string, color: Color, status: 'waiting' | 'ready' | 'connected'}[]>([]);
  
  const peerRef = useRef<RTCPeerConnection | null>(null);
  const dataChannelRef = useRef<RTCDataChannel | null>(null);
  
  // Online Mode WebSocket
  const wsRef = useRef<WebSocket | null>(null);
  // Generate a unique player ID per session (not persisted, to allow multiple tabs)
  const playerIdRef = useRef<string>(crypto.randomUUID());

  // Generate a random room ID
  const generateRoomId = () => {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let result = '';
    for (let i = 0; i < 6; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
  };

  // Convert position to algebraic notation (e.g., e4, d5)
  const posToAlgebraic = (pos: Position): string => {
    return String.fromCharCode(97 + pos.col) + (8 - pos.row);
  };

  // Generate move notation (simplified algebraic notation)
  const generateMoveNotation = (
    piece: Piece,
    from: Position,
    to: Position,
    captured: Piece | null,
    isCheck: boolean,
    isCheckmate: boolean,
    isCastling: boolean
  ): string => {
    // Castling
    if (isCastling) {
      return to.col > from.col ? 'O-O' : 'O-O-O';
    }

    let notation = '';
    const pieceSymbols: Record<PieceType, string> = {
      'p': '', 'r': 'R', 'n': 'N', 'b': 'B', 'q': 'Q', 'k': 'K'
    };

    // Piece symbol (pawns have no symbol)
    if (piece.type !== 'p') {
      notation += pieceSymbols[piece.type];
    }

    // For pawns, show file when capturing
    if (piece.type === 'p' && captured) {
      notation += String.fromCharCode(97 + from.col);
    }

    // Capture symbol
    if (captured) {
      notation += 'x';
    }

    // Destination square
    notation += posToAlgebraic(to);

    // Promotion (always queen in our case)
    if (piece.type === 'p' && (to.row === 0 || to.row === 7)) {
      notation += '=Q';
    }

    // Check/Checkmate
    if (isCheckmate) {
      notation += '#';
    } else if (isCheck) {
      notation += '+';
    }

    return notation;
  };

  // Add move to history
  const addMoveToHistory = (notation: string, color: Color) => {
    setMoveHistory(prev => {
      const newHistory = [...prev];
      if (color === 'w') {
        newHistory.push({ moveNum: newHistory.length + 1, white: notation, black: '' });
      } else {
        if (newHistory.length > 0) {
          newHistory[newHistory.length - 1].black = notation;
        }
      }
      return newHistory;
    });
    // Auto-scroll to bottom
    setTimeout(() => {
      moveHistoryRef.current?.scrollTo({ top: moveHistoryRef.current.scrollHeight, behavior: 'smooth' });
    }, 50);
  };

  // Sync board state whenever game changes
  useEffect(() => {
    setBoard([...game.board.map(row => [...row])]);
    setTurn(game.turn);
    setWinner(game.winner);
  }, [game]);

  // Network availability detection
  useEffect(() => {
    const handleOnline = () => {
      setNetworkAvailable(true);
      checkServerAvailability();
    };
    const handleOffline = () => {
      setNetworkAvailable(false);
      setServerAvailable(false);
    };
    
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    
    // Initial server check
    checkServerAvailability();
    
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Check if backend server is available
  const checkServerAvailability = async () => {
    if (!navigator.onLine) {
      setServerAvailable(false);
      return;
    }
    try {
      const response = await fetch(`${BACKEND_URL}/health`, { 
        method: 'GET',
        signal: AbortSignal.timeout(3000)
      });
      setServerAvailable(response.ok);
    } catch {
      setServerAvailable(false);
    }
  };

  // --- Network Logic ---

  // Compress SDP to shorter code
  const compressSDP = (sdp: RTCSessionDescription | null) => {
    if (!sdp) return '';
    // Strip unnecessary fields to make code shorter
    const minimal = {
      t: sdp.type === 'offer' ? 'o' : 'a',
      s: sdp.sdp
    };
    return LZString.compressToEncodedURIComponent(JSON.stringify(minimal));
  };

  const decompressSDP = (code: string) => {
    try {
      const json = LZString.decompressFromEncodedURIComponent(code);
      if (!json) return null;
      const minimal = JSON.parse(json);
      return {
        type: minimal.t === 'o' ? 'offer' : 'answer',
        sdp: minimal.s
      };
    } catch {
      return null;
    }
  };

  const setupPeer = useCallback(() => {
    // Pure Offline Config: No ICE servers means we rely on local network candidates (Host/Candidates)
    const pc = new RTCPeerConnection({ iceServers: [] });
    peerRef.current = pc;

    pc.onicecandidate = (e) => {
      if (e.candidate === null) {
        // Gathering complete - use compressed format
        const compressed = compressSDP(pc.localDescription);
        setLocalCode(compressed);
      }
    };

    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'connected') {
        setConnectionStatus('connected');
        // Send player info
        setTimeout(() => {
          if (dataChannelRef.current?.readyState === 'open') {
            dataChannelRef.current.send(JSON.stringify({ 
              type: 'player-info', 
              name: playerName || (lobbyMode === 'host' ? 'Host' : 'Guest'),
              color: playerColor
            }));
          }
        }, 100);
        setView('game');
        // Auto-flip board based on player color
        setFlipped(playerColor === 'b');
      } else if (pc.connectionState === 'disconnected' || pc.connectionState === 'failed') {
        setConnectionStatus('disconnected');
        setPlayers([]);
        setErrorMsg("Connection Lost");
      }
    };

    return pc;
  }, [lobbyMode, playerName, playerColor]);

  // --- Online Mode Functions (Backend Server) ---
  
  const initOnlineHost = async () => {
    try {
      setView('lobby');
      setLobbyMode('host');
      setIsOnlineMode(true);
      setConnectionStatus('connecting');
      setPlayers([{ name: playerName || 'You (Host)', color: 'w', status: 'waiting' }]);
      setOpponentName('');
      resetGame(false);
      
      // Create room on server
      const response = await fetch(`${BACKEND_URL}/room/create?player_id=${playerIdRef.current}`, {
        method: 'POST'
      });
      const data = await response.json();
      
      setRoomId(data.room_id);
      setPlayerColor('w');
      setLocalCode(data.room_id); // Simple 4-digit code!
      
      // Connect WebSocket
      connectWebSocket(data.room_id);
    } catch (err) {
      console.error('Failed to create room:', err);
      setErrorMsg('Failed to create room. Check your connection.');
      setConnectionStatus('disconnected');
    }
  };

  const initOnlineJoin = async (code: string) => {
    try {
      setConnectionStatus('connecting');
      
      // Join room on server
      const response = await fetch(`${BACKEND_URL}/room/join/${code}?player_id=${playerIdRef.current}`, {
        method: 'POST'
      });
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.detail || 'Failed to join room');
      }
      
      const data = await response.json();
      console.log('Join response:', data);
      
      setRoomId(code);
      // Convert backend color format to frontend format
      const myColor: Color = data.color === 'black' ? 'b' : 'w';
      setPlayerColor(myColor);
      setPlayers(prev => [
        ...prev,
        { name: 'Host', color: 'w', status: 'ready' }
      ]);
      
      // Connect WebSocket
      connectWebSocket(code);
    } catch (err: any) {
      console.error('Failed to join room:', err);
      setErrorMsg(err.message || 'Failed to join room');
      setConnectionStatus('disconnected');
    }
  };

  const connectWebSocket = (roomCode: string) => {
    if (wsRef.current) {
      wsRef.current.close();
    }
    
    const ws = new WebSocket(`${WS_URL}/ws/${roomCode}?player_id=${playerIdRef.current}`);
    wsRef.current = ws;
    
    ws.onopen = () => {
      console.log('WebSocket connected');
    };
    
    ws.onmessage = (event) => {
      const msg = JSON.parse(event.data);
      handleWebSocketMessage(msg);
    };
    
    ws.onclose = () => {
      console.log('WebSocket disconnected');
      if (connectionStatus === 'connected') {
        setErrorMsg('Connection lost');
      }
    };
    
    ws.onerror = (error) => {
      console.error('WebSocket error:', error);
      setErrorMsg('Connection error');
    };
  };

  const handleWebSocketMessage = (msg: any) => {
    console.log('WebSocket message:', msg.type, msg.data);
    
    // Helper to convert backend color to frontend color
    const toColor = (c: string): Color => c === 'white' ? 'w' : 'b';
    
    switch (msg.type) {
      case 'connected':
        const connectedColor = toColor(msg.data.color);
        setPlayerColor(connectedColor);
        console.log('Connected as', connectedColor);
        // If game is already active (we're the second player), go directly to game
        if (msg.data.game_state && msg.data.game_state.status === 'active') {
          console.log('Game already active, starting...');
          setConnectionStatus('connected');
          setView('game');
          setFlipped(connectedColor === 'b');
        }
        break;
        
      case 'player_connected':
        console.log('Player connected:', msg.data);
        setOpponentName(msg.data.player_id?.slice(0, 8) || 'Opponent');
        const playerConnectedColor = toColor(msg.data.color);
        setPlayers(prev => {
          if (!prev.some(p => p.color === playerConnectedColor)) {
            return [...prev, { name: 'Opponent', color: playerConnectedColor, status: 'connected' }];
          }
          return prev.map(p => p.color === playerConnectedColor ? { ...p, status: 'connected' } : p);
        });
        break;
        
      case 'game_start':
        console.log('Game starting!');
        setConnectionStatus('connected');
        setView('game');
        setFlipped(playerColor === 'b');
        break;
        
      case 'move':
        // Apply opponent's move
        const fromCol = msg.data.from.charCodeAt(0) - 97;
        const fromRow = 8 - parseInt(msg.data.from[1]);
        const toCol = msg.data.to.charCodeAt(0) - 97;
        const toRow = 8 - parseInt(msg.data.to[1]);
        
        setGame(prevGame => {
          const piece = prevGame.getPiece({ row: fromRow, col: fromCol });
          const captured = prevGame.getPiece({ row: toRow, col: toCol });
          const movingColor = prevGame.turn;
          const isCastling = piece?.type === 'k' && Math.abs(toCol - fromCol) > 1;
          
          prevGame.move({ row: fromRow, col: fromCol }, { row: toRow, col: toCol });
          
          // Generate and record move notation
          if (piece) {
            const isCheck = prevGame.isCheck(prevGame.turn);
            const isCheckmate = prevGame.winner === movingColor;
            const notation = generateMoveNotation(
              piece, { row: fromRow, col: fromCol }, { row: toRow, col: toCol },
              captured, isCheck, isCheckmate, isCastling
            );
            addMoveToHistory(notation, movingColor);
          }
          
          setBoard([...prevGame.board.map(row => [...row])]);
          setTurn(prevGame.turn);
          setWinner(prevGame.winner);
          setLastMove({ from: { row: fromRow, col: fromCol }, to: { row: toRow, col: toCol } });
          setValidMoves([]);
          setSelected(null);
          return prevGame;
        });
        break;
        
      case 'restart':
        // Opponent requested restart
        resetGame(false);
        break;
        
      case 'game_over':
        if (msg.data.winner) {
          setWinner(msg.data.winner === 'white' ? 'w' : 'b');
        } else {
          setWinner('draw');
        }
        break;
        
      case 'player_disconnected':
        setErrorMsg('Opponent disconnected');
        setPlayers(prev => prev.map(p => 
          p.color === msg.data.color ? { ...p, status: 'waiting' } : p
        ));
        break;
        
      case 'draw_offer':
        // Show draw offer UI (can be enhanced)
        if (confirm('Opponent offers a draw. Accept?')) {
          wsRef.current?.send(JSON.stringify({ type: 'draw_accept', data: {} }));
        } else {
          wsRef.current?.send(JSON.stringify({ type: 'draw_decline', data: {} }));
        }
        break;
        
      case 'player-info':
        setOpponentName(msg.name);
        break;
    }
  };

  const sendOnlineMove = (from: Position, to: Position, fen: string) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      const fromSquare = String.fromCharCode(97 + from.col) + (8 - from.row);
      const toSquare = String.fromCharCode(97 + to.col) + (8 - to.row);
      
      wsRef.current.send(JSON.stringify({
        type: 'move',
        data: {
          from: fromSquare,
          to: toSquare,
          fen: fen
        }
      }));
    }
  };

  // --- Offline P2P Mode Functions ---

  const initHost = async () => {
    const newRoomId = generateRoomId();
    setRoomId(newRoomId);
    setView('lobby');
    setLobbyMode('host');
    setIsOnlineMode(false);
    setPlayerColor('w');
    setConnectionStatus('connecting');
    setLocalCode('');
    setRemoteCodeInput('');
    setPlayers([{ name: playerName || 'You (Host)', color: 'w', status: 'waiting' }]);
    setOpponentName('');
    resetGame(false);
    
    const pc = setupPeer();
    const dc = pc.createDataChannel("chess");
    setupDataChannel(dc);
    
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
  };

  const initJoin = async () => {
    setRoomId('');
    setView('lobby');
    setLobbyMode('join');
    setIsOnlineMode(false);
    setPlayerColor('b');
    setConnectionStatus('connecting');
    setLocalCode('');
    setRemoteCodeInput('');
    setPlayers([{ name: playerName || 'You (Guest)', color: 'b', status: 'waiting' }]);
    setOpponentName('');
    resetGame(false);
  };

  const processRemoteCode = async (code: string) => {
    try {
      const remoteDesc = decompressSDP(code.trim());
      if (!remoteDesc) throw new Error("Invalid Code Format");
      
      let pc = peerRef.current;
      if (!pc) pc = setupPeer();

      if (lobbyMode === 'join') {
        // Joiner receives Offer, creates Answer
        await pc.setRemoteDescription(new RTCSessionDescription(remoteDesc as RTCSessionDescriptionInit));
        pc.ondatachannel = (e) => setupDataChannel(e.channel);
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        setConnectionStatus('awaiting-response');
        // Add host to player list
        setPlayers(prev => {
          if (!prev.some(p => p.color === 'w')) {
            return [...prev, { name: 'Host', color: 'w', status: 'ready' }];
          }
          return prev;
        });
      } else {
        // Host receives Answer
        await pc.setRemoteDescription(new RTCSessionDescription(remoteDesc as RTCSessionDescriptionInit));
        setConnectionStatus('awaiting-response');
        // Add guest to player list
        setPlayers(prev => {
          if (!prev.some(p => p.color === 'b')) {
            return [...prev, { name: 'Guest', color: 'b', status: 'ready' }];
          }
          return prev;
        });
      }
    } catch (err) {
      console.error(err);
      setErrorMsg("Invalid Code. Try again.");
    }
  };

  const setupDataChannel = (dc: RTCDataChannel) => {
    dataChannelRef.current = dc;
    dc.onopen = () => {
      console.log("Data Channel Open");
      setPlayers(prev => prev.map(p => ({ ...p, status: 'connected' as const })));
    };
    dc.onmessage = (e) => {
      const msg = JSON.parse(e.data);
      if (msg.type === 'move') {
        const { from, to } = msg;
        // Apply move and force state updates
        setGame(prevGame => {
          const piece = prevGame.getPiece(from);
          const captured = prevGame.getPiece(to);
          const movingColor = prevGame.turn;
          const isCastling = piece?.type === 'k' && Math.abs(to.col - from.col) > 1;
          
          prevGame.move(from, to);
          
          // Generate and record move notation
          if (piece) {
            const isCheck = prevGame.isCheck(prevGame.turn);
            const isCheckmate = prevGame.winner === movingColor;
            const notation = generateMoveNotation(piece, from, to, captured, isCheck, isCheckmate, isCastling);
            addMoveToHistory(notation, movingColor);
          }
          
          // Force new references for all state
          setBoard([...prevGame.board.map(row => [...row])]);
          setTurn(prevGame.turn);
          setWinner(prevGame.winner);
          setLastMove({from, to});
          setValidMoves([]);
          setSelected(null);
          return prevGame;
        });
      } else if (msg.type === 'restart') {
        resetGame(false);
      } else if (msg.type === 'player-info') {
        setOpponentName(msg.name);
        setPlayers(prev => prev.map(p => 
          p.color === msg.color ? { ...p, name: msg.name, status: 'connected' as const } : p
        ));
      }
    };
  };

  const sendMove = (from: Position, to: Position) => {
    if (dataChannelRef.current?.readyState === 'open') {
      dataChannelRef.current.send(JSON.stringify({ type: 'move', from, to }));
    }
  };

  // --- Game Logic ---

  const handleSquareClick = (row: number, col: number) => {
    if (winner || isAiThinking) return;
    if (connectionStatus === 'connected' && turn !== playerColor) return;

    if (selected && validMoves.some(m => m.row === row && m.col === col)) {
      const piece = game.getPiece(selected);
      const captured = game.getPiece({ row, col });
      const movingColor = turn;
      const isCastling = piece?.type === 'k' && Math.abs(col - selected.col) > 1;
      
      const success = game.move(selected, { row, col });
      if (success) {
        const moveFrom = selected;
        const moveTo = { row, col };
        
        // Generate move notation
        const isCheck = game.isCheck(game.turn);
        const isCheckmate = game.winner === movingColor;
        const notation = generateMoveNotation(
          piece!, moveFrom, moveTo, captured, isCheck, isCheckmate, isCastling
        );
        addMoveToHistory(notation, movingColor);
        
        // Update all state
        setBoard([...game.board.map(r => [...r])]);
        setLastMove({from: moveFrom, to: moveTo});
        setTurn(game.turn);
        setWinner(game.winner);
        setSelected(null);
        setValidMoves([]);
        setAiAnalysis(null);
        // Send move to opponent
        if (connectionStatus === 'connected') {
          if (isOnlineMode) {
            sendOnlineMove(moveFrom, moveTo, game.getFen());
          } else {
            sendMove(moveFrom, moveTo);
          }
        }
        return;
      }
    }

    const piece = game.getPiece({ row, col });
    if (piece && piece.color === turn) {
      if (connectionStatus === 'connected' && piece.color !== playerColor) return;
      setSelected({ row, col });
      setValidMoves(game.getLegalMoves({ row, col }));
    } else {
      setSelected(null);
      setValidMoves([]);
    }
  };

  const resetGame = (sendSignal = true) => {
    const newGame = new ChessGame();
    setGame(newGame);
    setBoard(newGame.board);
    setTurn(newGame.turn);
    setWinner(null);
    setSelected(null);
    setValidMoves([]);
    setLastMove(null);
    setAiAnalysis(null);
    setErrorMsg(null);
    setMoveHistory([]); // Clear move history
    
    // Send restart signal based on connection mode
    if (sendSignal && connectionStatus === 'connected') {
      if (isOnlineMode && wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({ type: 'restart', data: {} }));
      } else if (!isOnlineMode && dataChannelRef.current?.readyState === 'open') {
        dataChannelRef.current.send(JSON.stringify({ type: 'restart' }));
      }
    }
  };

  // --- UI Components ---

  const copyToClipboard = async () => {
    try {
      await navigator.clipboard.writeText(localCode);
      setCodeCopied(true);
      setTimeout(() => setCodeCopied(false), 2000);
    } catch (err) {
      // Fallback: select text for manual copy
      const textArea = document.createElement('textarea');
      textArea.value = localCode;
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand('copy');
      document.body.removeChild(textArea);
      setCodeCopied(true);
      setTimeout(() => setCodeCopied(false), 2000);
    }
  };

  const pasteFromClipboard = async () => {
    try {
      const text = await navigator.clipboard.readText();
      setRemoteCodeInput(text);
    } catch (err) {
      // User will paste manually
    }
  };

  // --- Screens ---

  if (view === 'home') {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-[#302e2b] p-6 text-center">
        <h1 className="text-4xl font-bold text-white mb-2">GM Pocket Chess</h1>
        <p className="text-[#81b64c] font-semibold mb-2">Offline • Multiplayer • AI</p>
        
        {/* Network Status Indicator */}
        <div className={`flex items-center gap-2 mb-6 px-3 py-1.5 rounded-full text-xs font-medium ${networkAvailable && serverAvailable ? 'bg-green-900/40 text-green-400' : networkAvailable ? 'bg-yellow-900/40 text-yellow-400' : 'bg-red-900/40 text-red-400'}`}>
          <span className={`w-2 h-2 rounded-full ${networkAvailable && serverAvailable ? 'bg-green-400' : networkAvailable ? 'bg-yellow-400' : 'bg-red-400'}`}></span>
          {networkAvailable && serverAvailable ? 'Online Mode Available' : networkAvailable ? 'Server Unreachable' : 'Offline Mode'}
        </div>
        
        {/* Player Name Input */}
        <div className="w-full max-w-xs mb-6">
          <label className="text-xs text-gray-400 uppercase tracking-wide mb-1 block text-left">Your Name</label>
          <input 
            type="text"
            value={playerName}
            onChange={(e) => setPlayerName(e.target.value)}
            placeholder="Enter your name..."
            className="w-full px-4 py-3 bg-[#262421] border border-gray-600 rounded-xl text-white placeholder-gray-500 focus:border-[#81b64c] focus:outline-none"
            maxLength={20}
          />
        </div>
        
        <div className="flex flex-col gap-4 w-full max-w-xs">
          <button 
            onClick={() => { setView('game'); setConnectionStatus('disconnected'); setIsOnlineMode(false); }}
            className="w-full py-4 bg-[#81b64c] hover:bg-[#a3d160] text-white font-bold rounded-xl shadow-lg transition transform active:scale-95"
          >
            Play Local (Pass & Play)
          </button>
          
          {/* Online Multiplayer Section */}
          {networkAvailable && serverAvailable && (
            <>
              <div className="flex items-center gap-3">
                <div className="flex-1 h-px bg-gray-700"></div>
                <span className="text-xs text-[#81b64c] font-medium">🌐 ONLINE MULTIPLAYER</span>
                <div className="flex-1 h-px bg-gray-700"></div>
              </div>

              <button 
                onClick={initOnlineHost}
                className="w-full py-4 bg-gradient-to-r from-[#81b64c] to-[#6fa33e] hover:from-[#a3d160] hover:to-[#81b64c] text-white font-bold rounded-xl shadow-lg transition transform active:scale-95"
              >
                Create Online Room
              </button>
              
              <button 
                onClick={() => { setView('lobby'); setLobbyMode('join'); setIsOnlineMode(true); setRemoteCodeInput(''); setPlayers([{ name: playerName || 'You (Guest)', color: 'b', status: 'waiting' }]); }}
                className="w-full py-4 bg-gradient-to-r from-[#4a90a4] to-[#3d7a8c] hover:from-[#5ba8be] hover:to-[#4a90a4] text-white font-bold rounded-xl shadow-lg transition transform active:scale-95"
              >
                Join Online Room
              </button>
            </>
          )}
          
          {/* Offline P2P Section */}
          <div className="flex items-center gap-3 mt-2">
            <div className="flex-1 h-px bg-gray-700"></div>
            <span className="text-xs text-gray-500 font-medium">📱 LOCAL NETWORK</span>
            <div className="flex-1 h-px bg-gray-700"></div>
          </div>

          <button 
            onClick={initHost}
            className="w-full py-4 bg-[#3a3937] hover:bg-[#454441] text-white font-bold rounded-xl shadow-lg border border-gray-600 transition transform active:scale-95"
          >
            Create Room (Local P2P)
          </button>
          
          <button 
            onClick={initJoin}
            className="w-full py-4 bg-[#3a3937] hover:bg-[#454441] text-white font-bold rounded-xl shadow-lg border border-gray-600 transition transform active:scale-95"
          >
            Join Room (Local P2P)
          </button>
        </div>
        <p className="mt-8 text-xs text-gray-500">Install this app: Menu &gt; Add to Home Screen</p>
      </div>
    );
  }

  if (view === 'lobby') {
    // Online Mode Lobby
    if (isOnlineMode) {
      return (
        <div className="flex flex-col items-center justify-center min-h-screen bg-[#302e2b] text-white p-4">
          <div className="w-full max-w-sm">
            
            {/* Back Button */}
            <button 
              onClick={() => { setView('home'); wsRef.current?.close(); setPlayers([]); setRoomId(''); }} 
              className="text-gray-400 hover:text-white mb-6"
            >
              ← Back
            </button>

            {lobbyMode === 'host' ? (
              /* ONLINE HOST VIEW */
              <div className="text-center">
                <div className="flex items-center justify-center gap-2 mb-2">
                  <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse"></span>
                  <span className="text-xs text-green-400 font-medium">ONLINE MODE</span>
                </div>
                <h2 className="text-2xl font-bold mb-2">Online Room Created</h2>
                <p className="text-gray-400 text-sm mb-6">Share this 4-digit code with your friend</p>
                
                {/* Simple 4-digit Room Code */}
                <div className="bg-[#262421] rounded-2xl p-8 mb-6 border border-[#81b64c]">
                  <p className="text-xs text-[#81b64c] uppercase tracking-wider mb-4">Room Code</p>
                  {roomId ? (
                    <>
                      <div className="text-6xl font-mono font-bold tracking-[0.3em] text-white mb-6">
                        {roomId}
                      </div>
                      <button 
                        onClick={async () => {
                          await navigator.clipboard.writeText(roomId);
                          setCodeCopied(true);
                          setTimeout(() => setCodeCopied(false), 2000);
                        }}
                        className={`w-full py-3 rounded-xl font-bold transition ${
                          codeCopied 
                            ? 'bg-[#81b64c] text-white' 
                            : 'bg-[#3a3937] hover:bg-[#454441] text-white border border-gray-600'
                        }`}
                      >
                        {codeCopied ? '✓ Copied!' : '📋 Copy Code'}
                      </button>
                    </>
                  ) : (
                    <div className="flex items-center justify-center py-8">
                      <Spinner />
                      <span className="ml-3 text-gray-400">Creating room...</span>
                    </div>
                  )}
                </div>

                {/* Waiting for opponent */}
                <div className="bg-[#262421] rounded-2xl p-6 border border-[#3a3937]">
                  <div className="flex items-center justify-center gap-3">
                    <Spinner />
                    <span className="text-gray-400">Waiting for opponent to join...</span>
                  </div>
                </div>

                {errorMsg && (
                  <p className="mt-4 text-red-400 text-sm">{errorMsg}</p>
                )}
              </div>
            ) : (
              /* ONLINE JOIN VIEW */
              <div className="text-center">
                <div className="flex items-center justify-center gap-2 mb-2">
                  <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse"></span>
                  <span className="text-xs text-green-400 font-medium">ONLINE MODE</span>
                </div>
                <h2 className="text-2xl font-bold mb-2">Join Online Room</h2>
                <p className="text-gray-400 text-sm mb-6">Enter the 4-digit room code</p>
                
                {/* Enter 4-digit Code */}
                <div className="bg-[#262421] rounded-2xl p-6 mb-6 border border-[#3a3937]">
                  <p className="text-xs text-gray-500 uppercase tracking-wider mb-4">Room Code</p>
                  
                  <input
                    type="text"
                    value={remoteCodeInput}
                    onChange={(e) => setRemoteCodeInput(e.target.value.replace(/\D/g, '').slice(0, 4))}
                    placeholder="0000"
                    className="w-full text-center text-4xl font-mono font-bold tracking-[0.3em] px-4 py-4 bg-[#1a1916] border border-gray-700 rounded-xl text-white placeholder-gray-600 focus:border-[#81b64c] focus:outline-none mb-4"
                    maxLength={4}
                  />
                  
                  <button 
                    onClick={() => initOnlineJoin(remoteCodeInput)}
                    disabled={remoteCodeInput.length !== 4 || connectionStatus === 'connecting'}
                    className="w-full py-4 bg-[#81b64c] disabled:bg-gray-700 disabled:text-gray-500 text-white font-bold rounded-xl transition hover:bg-[#a3d160]"
                  >
                    {connectionStatus === 'connecting' ? (
                      <span className="flex items-center justify-center gap-2"><Spinner /> Joining...</span>
                    ) : (
                      'Join Room'
                    )}
                  </button>
                </div>

                {errorMsg && (
                  <p className="mt-4 text-red-400 text-sm">{errorMsg}</p>
                )}
              </div>
            )}
          </div>
        </div>
      );
    }
    
    // Offline P2P Lobby (existing code)
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-[#302e2b] text-white p-4">
        <div className="w-full max-w-sm">
          
          {/* Back Button */}
          <button 
            onClick={() => { setView('home'); peerRef.current?.close(); setPlayers([]); setCodeCopied(false); }} 
            className="text-gray-400 hover:text-white mb-6"
          >
            ← Back
          </button>

          {lobbyMode === 'host' ? (
            /* HOST VIEW */
            <div className="text-center">
              <h2 className="text-2xl font-bold mb-2">Create Room</h2>
              <p className="text-gray-400 text-sm mb-6">Share QR code or text code with your friend</p>
              
              {/* Room Code Display */}
              <div className="bg-[#262421] rounded-2xl p-6 mb-6 border border-[#3a3937]">
                <p className="text-xs text-gray-500 uppercase tracking-wider mb-4">Room Code</p>
                {localCode ? (
                  <>
                    {/* Toggle between QR and Text */}
                    <div className="flex gap-2 mb-4">
                      <button
                        onClick={() => setShowQRCode(true)}
                        className={`flex-1 py-2 rounded-lg text-sm font-medium transition ${
                          showQRCode ? 'bg-[#81b64c] text-white' : 'bg-[#1a1916] text-gray-400'
                        }`}
                      >
                        📱 QR Code
                      </button>
                      <button
                        onClick={() => setShowQRCode(false)}
                        className={`flex-1 py-2 rounded-lg text-sm font-medium transition ${
                          !showQRCode ? 'bg-[#81b64c] text-white' : 'bg-[#1a1916] text-gray-400'
                        }`}
                      >
                        📝 Text
                      </button>
                    </div>
                    
                    {showQRCode ? (
                      <div className="flex justify-center mb-4">
                        <QRCodeDisplay data={localCode} size={200} />
                      </div>
                    ) : (
                      <div className="bg-[#1a1916] rounded-xl p-4 mb-4">
                        <p className="text-xs font-mono text-gray-400 break-all leading-relaxed max-h-24 overflow-y-auto">
                          {localCode.slice(0, 50)}...
                        </p>
                      </div>
                    )}
                    <button 
                      onClick={copyToClipboard}
                      className={`w-full py-3 rounded-xl font-bold transition ${
                        codeCopied 
                          ? 'bg-[#81b64c] text-white' 
                          : 'bg-[#3a3937] hover:bg-[#454441] text-white border border-gray-600'
                      }`}
                    >
                      {codeCopied ? '✓ Copied!' : '📋 Copy Code'}
                    </button>
                  </>
                ) : (
                  <div className="flex items-center justify-center py-8">
                    <Spinner />
                    <span className="ml-3 text-gray-400">Generating code...</span>
                  </div>
                )}
              </div>

              {/* Enter Response Code */}
              <div className="bg-[#262421] rounded-2xl p-6 border border-[#3a3937]">
                <p className="text-xs text-gray-500 uppercase tracking-wider mb-3">Enter Friend's Response</p>
                
                {/* Scan QR Button */}
                <button
                  onClick={() => setShowQRScanner(true)}
                  className="w-full py-3 mb-3 bg-[#81b64c] hover:bg-[#a3d160] text-white font-bold rounded-xl transition flex items-center justify-center gap-2"
                >
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h2M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z" />
                  </svg>
                  Scan QR Code
                </button>
                
                <div className="flex items-center gap-3 mb-3">
                  <div className="flex-1 h-px bg-gray-700"></div>
                  <span className="text-xs text-gray-500">or paste manually</span>
                  <div className="flex-1 h-px bg-gray-700"></div>
                </div>
                
                <div className="flex gap-2 mb-3">
                  <input
                    type="text"
                    value={remoteCodeInput}
                    onChange={(e) => setRemoteCodeInput(e.target.value)}
                    placeholder="Paste response code..."
                    className="flex-1 px-4 py-3 bg-[#1a1916] border border-gray-700 rounded-xl text-white text-sm placeholder-gray-500 focus:border-[#81b64c] focus:outline-none"
                  />
                  <button 
                    onClick={pasteFromClipboard}
                    className="px-4 py-3 bg-[#3a3937] rounded-xl hover:bg-[#454441] border border-gray-600"
                  >
                    📋
                  </button>
                </div>
                <button 
                  onClick={() => processRemoteCode(remoteCodeInput)}
                  disabled={!remoteCodeInput}
                  className="w-full py-3 bg-[#3a3937] disabled:bg-gray-700 disabled:text-gray-500 text-white font-bold rounded-xl transition hover:bg-[#454441] border border-gray-600"
                >
                  Connect
                </button>
              </div>

              {errorMsg && (
                <p className="mt-4 text-red-400 text-sm">{errorMsg}</p>
              )}
            </div>
          ) : (
            /* JOIN VIEW */
            <div className="text-center">
              <h2 className="text-2xl font-bold mb-2">Join Room</h2>
              <p className="text-gray-400 text-sm mb-6">Scan or enter the host's room code</p>
              
              {/* Enter Host Code */}
              <div className="bg-[#262421] rounded-2xl p-6 mb-6 border border-[#3a3937]">
                <p className="text-xs text-gray-500 uppercase tracking-wider mb-3">Host's Room Code</p>
                
                {/* Scan QR Button */}
                <button
                  onClick={() => setShowQRScanner(true)}
                  className="w-full py-3 mb-3 bg-[#81b64c] hover:bg-[#a3d160] text-white font-bold rounded-xl transition flex items-center justify-center gap-2"
                >
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h2M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z" />
                  </svg>
                  Scan QR Code
                </button>
                
                <div className="flex items-center gap-3 mb-3">
                  <div className="flex-1 h-px bg-gray-700"></div>
                  <span className="text-xs text-gray-500">or paste manually</span>
                  <div className="flex-1 h-px bg-gray-700"></div>
                </div>
                
                <div className="flex gap-2 mb-3">
                  <input
                    type="text"
                    value={remoteCodeInput}
                    onChange={(e) => setRemoteCodeInput(e.target.value)}
                    placeholder="Paste room code..."
                    className="flex-1 px-4 py-3 bg-[#1a1916] border border-gray-700 rounded-xl text-white text-sm placeholder-gray-500 focus:border-[#81b64c] focus:outline-none"
                  />
                  <button 
                    onClick={pasteFromClipboard}
                    className="px-4 py-3 bg-[#3a3937] rounded-xl hover:bg-[#454441] border border-gray-600"
                  >
                    📋
                  </button>
                </div>
                <button 
                  onClick={() => processRemoteCode(remoteCodeInput)}
                  disabled={!remoteCodeInput}
                  className="w-full py-3 bg-[#3a3937] disabled:bg-gray-700 disabled:text-gray-500 text-white font-bold rounded-xl transition hover:bg-[#454441] border border-gray-600"
                >
                  Join
                </button>
              </div>

              {/* Response Code (shows after entering host code) */}
              {localCode && (
                <div className="bg-[#262421] rounded-2xl p-6 border border-[#81b64c]">
                  <p className="text-xs text-[#81b64c] uppercase tracking-wider mb-2">✓ Your Response Code</p>
                  <p className="text-gray-400 text-xs mb-4">Let the host scan this or copy and send</p>
                  
                  {/* Toggle between QR and Text */}
                  <div className="flex gap-2 mb-4">
                    <button
                      onClick={() => setShowQRCode(true)}
                      className={`flex-1 py-2 rounded-lg text-sm font-medium transition ${
                        showQRCode ? 'bg-[#81b64c] text-white' : 'bg-[#1a1916] text-gray-400'
                      }`}
                    >
                      📱 QR Code
                    </button>
                    <button
                      onClick={() => setShowQRCode(false)}
                      className={`flex-1 py-2 rounded-lg text-sm font-medium transition ${
                        !showQRCode ? 'bg-[#81b64c] text-white' : 'bg-[#1a1916] text-gray-400'
                      }`}
                    >
                      📝 Text
                    </button>
                  </div>
                  
                  {showQRCode ? (
                    <div className="flex justify-center mb-4">
                      <QRCodeDisplay data={localCode} size={200} />
                    </div>
                  ) : (
                    <div className="bg-[#1a1916] rounded-xl p-4 mb-4">
                      <p className="text-xs font-mono text-gray-400 break-all leading-relaxed max-h-24 overflow-y-auto">
                        {localCode.slice(0, 50)}...
                      </p>
                    </div>
                  )}
                  <button 
                    onClick={copyToClipboard}
                    className={`w-full py-3 rounded-xl font-bold transition ${
                      codeCopied 
                        ? 'bg-[#81b64c] text-white' 
                        : 'bg-[#3a3937] hover:bg-[#454441] text-white border border-gray-600'
                    }`}
                  >
                    {codeCopied ? '✓ Copied!' : '📋 Copy Response'}
                  </button>
                </div>
              )}

              {errorMsg && (
                <p className="mt-4 text-red-400 text-sm">{errorMsg}</p>
              )}
            </div>
          )}

          {/* Connection Status */}
          {connectionStatus === 'awaiting-response' && (
            <div className="mt-6 text-center">
              <div className="flex items-center justify-center gap-2">
                <Spinner />
                <span className="text-gray-400 text-sm">Connecting...</span>
              </div>
            </div>
          )}

          {/* Simple Instructions */}
          <div className="mt-8 text-center">
            <p className="text-xs text-gray-500">
              {lobbyMode === 'host' 
                ? "1. Share QR/code → 2. Scan response → 3. Connected!" 
                : "1. Scan host's QR → 2. Show your QR → 3. Connected!"}
            </p>
          </div>
        </div>
        
        {/* QR Scanner Modal */}
        {showQRScanner && (
          <QRScanner
            onScan={(data) => {
              setShowQRScanner(false);
              setRemoteCodeInput(data);
              // Auto-process immediately for fast connection
              setTimeout(() => processRemoteCode(data), 100);
            }}
            onClose={() => setShowQRScanner(false)}
          />
        )}
      </div>
    );
  }

  // --- Game View ---
  
  // Helpers
  const isOnline = connectionStatus === 'connected';
  const myColor = isOnline ? playerColor : 'w';
  const opponentColor = isOnline ? (playerColor === 'w' ? 'b' : 'w') : 'b';
  const getDeadPieces = (color: Color) => game.deadPieces.filter(p => p.color === color);
  const isMyTurn = !isOnline || turn === playerColor;

  // Avatar Component
  const Avatar = ({ color, name }: { color: Color, name: string }) => (
    <div className="flex items-center gap-3">
       <div className={`w-10 h-10 rounded-md flex items-center justify-center border-2 ${turn === color ? 'border-[#81b64c]' : 'border-transparent'} ${color === 'w' ? 'bg-gray-200' : 'bg-gray-700'}`}>
          <PieceIcon type='p' color={color} className="w-6 h-6" />
       </div>
       <div className="flex flex-col">
          <span className="text-gray-200 font-bold text-sm leading-tight">{name}</span>
          <div className="flex h-4 items-center">
             {getDeadPieces(color === 'w' ? 'b' : 'w').map((p, i) => (
                <span key={i} className="-ml-1">
                  <PieceIcon type={p.type} color={color === 'w' ? 'b' : 'w'} className="w-3 h-3" />
                </span>
             ))}
          </div>
       </div>
    </div>
  );

  return (
    <div className="flex flex-col min-h-screen bg-[#302e2b] font-sans text-[#c3c3c3] overflow-hidden">
      
      {/* Main Game Layout */}
      <div className="flex-1 flex flex-col max-w-lg mx-auto w-full p-2 justify-center">
        
        {/* Header / Back */}
        <div className="flex justify-between items-center mb-2 px-1">
          <button onClick={() => { setView('home'); resetGame(false); peerRef.current?.close(); wsRef.current?.close(); }} className="text-xs font-bold text-gray-500 hover:text-white">← EXIT GAME</button>
          {isOnline && (
            <span className={`text-xs font-bold tracking-wider ${isOnlineMode ? 'text-green-400' : 'text-[#81b64c]'}`}>
              ● {isOnlineMode ? 'ONLINE' : 'LOCAL'} CONNECTED
            </span>
          )}
        </div>

        {/* Waiting Banner - TOP */}
        {!isMyTurn && isOnline && !winner && (
          <div className="bg-[#262421] border border-[#81b64c] rounded-lg px-4 py-2 mb-2 flex items-center justify-center gap-2">
            <Spinner />
            <span className="text-[#81b64c] font-semibold text-sm">Waiting for Opponent's Move...</span>
          </div>
        )}

        {/* Your Turn Banner */}
        {isMyTurn && isOnline && !winner && (
          <div className="bg-[#81b64c] rounded-lg px-4 py-2 mb-2 flex items-center justify-center">
            <span className="text-white font-bold text-sm">⚡ Your Turn!</span>
          </div>
        )}

        {/* Top Player */}
        <div className="flex justify-between items-center mb-1 px-1">
           <Avatar color={opponentColor} name={isOnline ? (opponentName || "Opponent") : "Black"} />
           {winner && winner === opponentColor && <span className="text-[#81b64c] font-bold text-xs">WON</span>}
           {winner && winner !== opponentColor && winner !== 'draw' && <span className="text-red-500 font-bold text-xs">LOST</span>}
        </div>

        {/* Board Container with Lock */}
        <div className={`relative w-full aspect-square rounded-sm shadow-2xl overflow-hidden bg-[#302e2b] transition-all duration-300 ${!isMyTurn && isOnline ? 'opacity-80' : ''}`}>
          
          {/* Board Lock Overlay */}
          {!isMyTurn && isOnline && !winner && (
            <div className="absolute inset-0 z-30 bg-black/5 pointer-events-auto cursor-not-allowed"></div>
          )}

          {/* Actual Board */}
          <div 
             className={`grid grid-cols-8 grid-rows-8 w-full h-full ${!isMyTurn && isOnline ? 'pointer-events-none' : ''}`}
             style={{ transform: flipped ? 'rotate(180deg)' : 'none' }}
          >
            {Array(8).fill(null).map((_, r) => (
              Array(8).fill(null).map((_, c) => {
                const isDark = (r + c) % 2 === 1;
                const baseColor = isDark ? "bg-[#769656]" : "bg-[#eeeed2]";
                
                const isSelected = selected?.row === r && selected?.col === c;
                const isLastMoveFrom = lastMove?.from.row === r && lastMove?.from.col === c;
                const isLastMoveTo = lastMove?.to.row === r && lastMove?.to.col === c;
                const isHighlight = isSelected || isLastMoveFrom || isLastMoveTo;
                const bgColor = isHighlight ? (isDark ? "bg-[#bbcb2b]" : "bg-[#f7f769]") : baseColor;
                const piece = board[r][c];
                const isValid = validMoves.some(m => m.row === r && m.col === c);

                return (
                  <div 
                    key={`${r}-${c}`}
                    className={`relative flex items-center justify-center ${bgColor}`}
                    onClick={() => handleSquareClick(r, c)}
                    style={{ transform: flipped ? 'rotate(180deg)' : 'none' }}
                  >
                    {c === 0 && <span className={`absolute top-0.5 left-0.5 text-[10px] font-bold ${isDark ? 'text-[#eeeed2]' : 'text-[#769656]'}`} style={{opacity: 0.8}}>{8-r}</span>}
                    {r === 7 && <span className={`absolute bottom-0 right-0.5 text-[10px] font-bold ${isDark ? 'text-[#eeeed2]' : 'text-[#769656]'}`} style={{opacity: 0.8}}>{String.fromCharCode(97+c)}</span>}

                    {isValid && !piece && <div className="absolute w-[20%] h-[20%] bg-black/20 rounded-full"></div>}
                    {isValid && piece && <div className="absolute w-full h-full border-[6px] border-black/10 rounded-full"></div>}

                    {piece?.type === 'k' && game.isCheck(piece.color) && (
                       <div className="absolute inset-0 bg-red-600/50 rounded-full blur-md"></div>
                    )}

                    {piece && (
                      <div className="w-full h-full p-0.5">
                         <PieceIcon type={piece.type} color={piece.color} className="w-full h-full" />
                      </div>
                    )}
                  </div>
                );
              })
            ))}
          </div>
          
          {winner && (
            <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 bg-[#262421] text-white px-8 py-6 rounded-lg shadow-2xl border border-[#3a3937] z-40 flex flex-col items-center">
               <h2 className="text-2xl font-bold mb-4">{winner === 'draw' ? 'Draw' : `${winner === 'w' ? 'White' : 'Black'} Wins`}</h2>
               <button onClick={() => resetGame(true)} className="px-6 py-2 bg-[#81b64c] hover:bg-[#a3d160] rounded font-bold shadow-md">New Game</button>
            </div>
          )}
        </div>

        {/* Bottom Player */}
        <div className="flex justify-between items-center mt-1 mb-2 px-1">
           <Avatar color={myColor} name={isOnline ? (playerName || "You") : "White"} />
           {winner && winner === myColor && <span className="text-[#81b64c] font-bold text-xs">WON 🎉</span>}
           {winner && winner !== myColor && winner !== 'draw' && <span className="text-red-500 font-bold text-xs">LOST</span>}
        </div>

        {/* Move History Log (chess.com style) */}
        <div className="bg-[#262421] rounded-xl mb-2 border border-[#3a3937] overflow-hidden">
          <div className="flex items-center justify-between px-3 py-2 border-b border-[#3a3937]">
            <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">Move Log</span>
            <span className="text-xs text-gray-500">{moveHistory.length} moves</span>
          </div>
          <div 
            ref={moveHistoryRef}
            className="max-h-24 overflow-y-auto scrollbar-thin scrollbar-thumb-gray-700"
          >
            {moveHistory.length === 0 ? (
              <div className="text-center text-gray-500 text-xs py-3">
                No moves yet
              </div>
            ) : (
              <div className="grid grid-cols-[auto_1fr_1fr] text-xs">
                {moveHistory.map((move, idx) => (
                  <React.Fragment key={idx}>
                    <div className="px-3 py-1.5 text-gray-500 font-mono bg-[#1a1916]">
                      {move.moveNum}.
                    </div>
                    <div className={`px-3 py-1.5 font-mono ${idx === moveHistory.length - 1 && !move.black ? 'bg-[#81b64c]/20 text-[#81b64c]' : 'text-white'}`}>
                      {move.white}
                    </div>
                    <div className={`px-3 py-1.5 font-mono ${idx === moveHistory.length - 1 && move.black ? 'bg-[#81b64c]/20 text-[#81b64c]' : 'text-white'}`}>
                      {move.black || ''}
                    </div>
                  </React.Fragment>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Action Bar */}
        <div className="bg-[#262421] rounded-xl flex justify-around p-2 items-center h-16 shadow-lg border-t border-[#3a3937]">
           <button onClick={() => resetGame(true)} className="flex flex-col items-center gap-1 w-16 group">
              <div className="text-2xl text-gray-400 group-hover:text-white">➕</div>
              <span className="text-[10px] font-semibold text-gray-400">New</span>
           </button>

           <button onClick={() => setFlipped(!flipped)} className="flex flex-col items-center gap-1 w-16 group">
              <div className="text-2xl text-gray-400 group-hover:text-white">🔄</div>
              <span className="text-[10px] font-semibold text-gray-400">Flip</span>
           </button>

           {/* Analysis Button - only if AI key exists */}
           {process.env.API_KEY && (
             <button 
               onClick={async () => {
                 if (isAiThinking) return;
                 setIsAnalysisOpen(true);
                 setIsAiThinking(true);
                 try {
                   const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
                   const res = await ai.models.generateContent({
                     model: 'gemini-3-flash-preview',
                     contents: `Analyze FEN: ${game.getFen()}. Best move? Short.`,
                   });
                   setAiAnalysis(res.text);
                 } catch (e) { setAiAnalysis("AI Error"); }
                 setIsAiThinking(false);
               }} 
               className="flex flex-col items-center gap-1 w-16 group"
             >
                <div className="text-2xl text-[#81b64c]">✨</div>
                <span className="text-[10px] font-semibold text-[#81b64c]">AI</span>
             </button>
           )}
        </div>

        {isAnalysisOpen && (
          <div className="mt-2 bg-[#262421] p-3 rounded border border-[#3a3937] text-sm relative">
             <button onClick={() => setIsAnalysisOpen(false)} className="absolute top-1 right-2">✕</button>
             <p className="text-[#81b64c] font-bold mb-1">Coach:</p>
             <p>{isAiThinking ? "Thinking..." : aiAnalysis}</p>
          </div>
        )}
      </div>
    </div>
  );
}