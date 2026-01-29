import React, { useState, useEffect, useRef, useCallback } from 'react';
import { GoogleGenAI } from "@google/genai";
import QRCode from 'qrcode';
import jsQR from 'jsqr';
import LZString from 'lz-string';
import { ChessGame, Position, PieceType, Color } from './engine';

// --- Icons & Assets ---
const PieceIcon = ({ type, color, className }: { type: PieceType; color: Color; className?: string }) => {
  const isWhite = color === 'w';
  const fill = isWhite ? "#f8f8f8" : "#1f1f1f"; 
  const stroke = isWhite ? "#1f1f1f" : "#f8f8f8";
  
  const paths: Record<PieceType, React.ReactNode> = {
    p: <path d="M12 2C10.9 2 10 2.9 10 4C10 5.1 10.9 6 12 6C13.1 6 14 5.1 14 4C14 2.9 13.1 2 12 2ZM9 7C7.3 7 6 8.3 6 10V12H18V10C18 8.3 16.7 7 15 7H9ZM7 14V18H17V14H7ZM5 20V22H19V20H5Z" />,
    r: <path d="M5 20V22H19V20H5ZM7 15V18H17V15H7ZM7 5V13H17V5H7ZM5 2V4H8V2H5ZM11 2V4H13V2H11ZM16 2V4H19V2H16Z" />,
    n: <path d="M17 19H7V21H17V19ZM16 17H8V15H16V17ZM15 6C15 6 15 5.2 14.5 4.5C14 3.8 13.1 3.5 13.1 3.5C13.1 3.5 12.8 2 10.5 2C8.3 2 8 3.5 8 3.5L7 7L9.5 9.5C9.5 9.5 9 11.5 8 13C6 15.5 8 15.5 8 15.5H15.5L17 7L15 6Z" />,
    b: <path d="M12 2L9 5L10 8L7 11V18H17V11L14 8L15 5L12 2ZM9 13H15V16H9V13ZM9 20V22H15V20H9Z" />,
    q: <path d="M5 20V22H19V20H5ZM7 18V15H17V18H7ZM9 11L7 6L10.5 8L12 2L13.5 8L17 6L15 11H9Z" />,
    k: <path d="M12 2V5H15V7H12V10H9V7H6V5H9V2H12ZM7 13V18H17V13L15 11H9L7 13ZM5 20V22H19V20H5Z" />,
  };
  return (
    <svg viewBox="0 0 24 24" fill={fill} stroke={stroke} strokeWidth="1.2" className={className} style={{ filter: 'drop-shadow(1px 2px 2px rgba(0,0,0,0.3))' }}>
      {paths[type]}
    </svg>
  );
};

const Spinner = () => (
  <svg className="animate-spin h-5 w-5 text-[#81b64c]" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
  </svg>
);

// --- QR Scanner Component ---
const QRScanner = ({ onScan, onCancel }: { onScan: (data: string) => void; onCancel: () => void }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    let stream: MediaStream | null = null;
    let animationId: number;

    const startCamera = async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.setAttribute("playsinline", "true");
          videoRef.current.play();
          requestAnimationFrame(tick);
        }
      } catch (err) {
        console.error("Camera error:", err);
        onCancel();
      }
    };

    const tick = () => {
      if (videoRef.current && videoRef.current.readyState === videoRef.current.HAVE_ENOUGH_DATA && canvasRef.current) {
        const canvas = canvasRef.current;
        const video = videoRef.current;
        canvas.height = video.videoHeight;
        canvas.width = video.videoWidth;
        const ctx = canvas.getContext("2d");
        if (ctx) {
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
          const code = jsQR(imageData.data, imageData.width, imageData.height, {
            inversionAttempts: "dontInvert",
          });
          if (code && code.data) {
            onScan(code.data);
            return;
          }
        }
      }
      animationId = requestAnimationFrame(tick);
    };

    startCamera();
    return () => {
      if (stream) stream.getTracks().forEach(t => t.stop());
      cancelAnimationFrame(animationId);
    };
  }, [onScan, onCancel]);

  return (
    <div className="fixed inset-0 z-[60] bg-[#262421] flex flex-col items-center justify-center p-4">
      <div className="text-white mb-6 text-center">
        <h3 className="text-xl font-bold mb-1">Scan QR Code</h3>
        <p className="text-gray-400 text-sm">Point at your friend's device</p>
      </div>
      <div className="relative w-64 h-64 bg-black rounded-lg overflow-hidden border-2 border-[#81b64c]">
        <video ref={videoRef} className="absolute inset-0 w-full h-full object-cover" />
        <canvas ref={canvasRef} className="hidden" />
        <div className="absolute top-0 left-0 w-8 h-8 border-t-4 border-l-4 border-[#81b64c]"></div>
        <div className="absolute top-0 right-0 w-8 h-8 border-t-4 border-r-4 border-[#81b64c]"></div>
        <div className="absolute bottom-0 left-0 w-8 h-8 border-b-4 border-l-4 border-[#81b64c]"></div>
        <div className="absolute bottom-0 right-0 w-8 h-8 border-b-4 border-r-4 border-[#81b64c]"></div>
      </div>
      <button onClick={onCancel} className="mt-8 px-8 py-3 bg-[#3a3937] text-white font-bold rounded-lg">Cancel</button>
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
  
  // AI State
  const [aiAnalysis, setAiAnalysis] = useState<string | null>(null);
  const [isAiThinking, setIsAiThinking] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isAnalysisOpen, setIsAnalysisOpen] = useState(false);

  // App Flow State
  const [view, setView] = useState<'home' | 'lobby' | 'game'>('home');
  const [lobbyMode, setLobbyMode] = useState<'host' | 'join'>('host');
  const [showHelp, setShowHelp] = useState(false);
  
  // Connection State
  const [connectionStatus, setConnectionStatus] = useState<'disconnected' | 'connecting' | 'awaiting-response' | 'connected'>('disconnected');
  const [playerColor, setPlayerColor] = useState<Color>('w');
  const [localCode, setLocalCode] = useState<string>(''); // Code I generate
  const [remoteCodeInput, setRemoteCodeInput] = useState<string>(''); // Code I input
  const [showScanner, setShowScanner] = useState(false);
  
  // Room & Player State
  const [roomId, setRoomId] = useState<string>('');
  const [playerName, setPlayerName] = useState<string>('');
  const [opponentName, setOpponentName] = useState<string>('');
  const [players, setPlayers] = useState<{name: string, color: Color, status: 'waiting' | 'ready' | 'connected'}[]>([]);
  
  const peerRef = useRef<RTCPeerConnection | null>(null);
  const dataChannelRef = useRef<RTCDataChannel | null>(null);

  // Generate a random room ID
  const generateRoomId = () => {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let result = '';
    for (let i = 0; i < 6; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
  };

  useEffect(() => {
    setBoard([...game.board.map(row => [...row])]);
    setTurn(game.turn);
    setWinner(game.winner);
  }, [game, turn]);

  // --- Network Logic ---

  const setupPeer = useCallback(() => {
    // Pure Offline Config: No ICE servers means we rely on local network candidates (Host/Candidates)
    const pc = new RTCPeerConnection({ iceServers: [] });
    peerRef.current = pc;

    pc.onicecandidate = (e) => {
      if (e.candidate === null) {
        // Gathering complete
        const sdp = JSON.stringify(pc.localDescription);
        const compressed = LZString.compressToBase64(sdp);
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
        if (lobbyMode === 'join') setFlipped(true);
      } else if (pc.connectionState === 'disconnected' || pc.connectionState === 'failed') {
        setConnectionStatus('disconnected');
        setPlayers([]);
        setErrorMsg("Connection Lost");
      }
    };

    return pc;
  }, [lobbyMode, playerName, playerColor]);

  const initHost = async () => {
    const newRoomId = generateRoomId();
    setRoomId(newRoomId);
    setView('lobby');
    setLobbyMode('host');
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
      const sdpStr = LZString.decompressFromBase64(code);
      if (!sdpStr) throw new Error("Invalid Code Format");
      const remoteDesc = JSON.parse(sdpStr);
      
      let pc = peerRef.current;
      if (!pc) pc = setupPeer();

      if (lobbyMode === 'join') {
        // Joiner receives Offer, creates Answer
        await pc.setRemoteDescription(new RTCSessionDescription(remoteDesc));
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
        await pc.setRemoteDescription(new RTCSessionDescription(remoteDesc));
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
        game.move(from, to);
        setLastMove({from, to});
        setTurn(game.turn);
        setValidMoves([]);
        setSelected(null);
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
      const success = game.move(selected, { row, col });
      if (success) {
        setLastMove({from: selected, to: {row, col}});
        setTurn(game.turn);
        if (connectionStatus === 'connected') sendMove(selected, { row, col });
        setSelected(null);
        setValidMoves([]);
        setAiAnalysis(null);
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
    if (sendSignal && connectionStatus === 'connected' && dataChannelRef.current?.readyState === 'open') {
      dataChannelRef.current.send(JSON.stringify({ type: 'restart' }));
    }
  };

  // --- UI Components ---

  const [qrUrl, setQrUrl] = useState<string>('');
  useEffect(() => {
    if (localCode) {
      QRCode.toDataURL(localCode, { margin: 1, width: 250, color: { dark: '#000000', light: '#ffffff' } })
        .then(setQrUrl).catch(console.error);
    } else {
      setQrUrl('');
    }
  }, [localCode]);

  const copyToClipboard = async () => {
    try {
      await navigator.clipboard.writeText(localCode);
      alert("Code Copied!");
    } catch (err) {
      console.error("Failed to copy", err);
    }
  };

  const pasteFromClipboard = async () => {
    try {
      const text = await navigator.clipboard.readText();
      setRemoteCodeInput(text);
      processRemoteCode(text);
    } catch (err) {
      alert("Please paste manually.");
    }
  };

  // --- Screens ---

  if (view === 'home') {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-[#302e2b] p-6 text-center">
        <h1 className="text-4xl font-bold text-white mb-2">GM Pocket Chess</h1>
        <p className="text-[#81b64c] font-semibold mb-8">Offline • Multiplayer • AI</p>
        
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
            onClick={() => { setView('game'); setConnectionStatus('disconnected'); }}
            className="w-full py-4 bg-[#81b64c] hover:bg-[#a3d160] text-white font-bold rounded-xl shadow-lg transition transform active:scale-95"
          >
            Play Local (Pass & Play)
          </button>
          
          <div className="border-t border-gray-700 my-2"></div>

          <button 
            onClick={initHost}
            className="w-full py-4 bg-[#3a3937] hover:bg-[#454441] text-white font-bold rounded-xl shadow-lg border border-gray-600 transition transform active:scale-95"
          >
            Create Room (Host)
          </button>
          
          <button 
            onClick={initJoin}
            className="w-full py-4 bg-[#3a3937] hover:bg-[#454441] text-white font-bold rounded-xl shadow-lg border border-gray-600 transition transform active:scale-95"
          >
            Join Room
          </button>
        </div>
        <p className="mt-8 text-xs text-gray-500">Install this app: Menu &gt; Add to Home Screen</p>
      </div>
    );
  }

  if (view === 'lobby') {
    const getStatusColor = (status: string) => {
      switch (status) {
        case 'connected': return 'bg-[#81b64c]';
        case 'ready': return 'bg-yellow-500';
        default: return 'bg-gray-500';
      }
    };

    const getStatusText = () => {
      switch (connectionStatus) {
        case 'connected': return '● Connected';
        case 'awaiting-response': return '◐ Awaiting Response...';
        case 'connecting': return '○ Waiting for player...';
        default: return '○ Disconnected';
      }
    };

    return (
      <div className="flex flex-col items-center min-h-screen bg-[#302e2b] text-white p-4 overflow-y-auto">
        {showScanner && <QRScanner onScan={(val) => { setShowScanner(false); processRemoteCode(val); }} onCancel={() => setShowScanner(false)} />}
        
        <div className="w-full max-w-md mt-4">
          <div className="flex justify-between items-center mb-4">
             <button onClick={() => { setView('home'); peerRef.current?.close(); setPlayers([]); }} className="text-gray-400 hover:text-white">← Back</button>
             <button onClick={() => setShowHelp(!showHelp)} className="text-[#81b64c] text-sm font-bold">Help?</button>
          </div>

          <h2 className="text-2xl font-bold mb-1">{lobbyMode === 'host' ? "Create Room" : "Join Room"}</h2>
          
          {/* Room Info Banner */}
          {lobbyMode === 'host' && roomId && (
            <div className="bg-[#262421] border border-[#81b64c] rounded-lg p-3 mb-4 flex items-center justify-between">
              <div>
                <span className="text-xs text-gray-400 uppercase">Room ID</span>
                <p className="text-2xl font-mono font-bold text-[#81b64c] tracking-widest">{roomId}</p>
              </div>
              <div className="text-right">
                <span className={`text-xs font-semibold ${connectionStatus === 'connected' ? 'text-[#81b64c]' : connectionStatus === 'awaiting-response' ? 'text-yellow-500' : 'text-gray-400'}`}>
                  {getStatusText()}
                </span>
              </div>
            </div>
          )}

          {/* Players in Room Section */}
          <div className="bg-[#262421] p-4 rounded-xl border border-[#3a3937] mb-4 shadow-md">
            <h3 className="text-[#81b64c] font-bold text-sm uppercase mb-3 flex items-center gap-2">
              <span>👥</span> Players in Room
              <span className="ml-auto text-xs font-normal text-gray-400">{players.length}/2</span>
            </h3>
            <div className="space-y-2">
              {players.length === 0 ? (
                <div className="text-center py-4 text-gray-500 text-sm">
                  <span className="animate-pulse">Waiting for players...</span>
                </div>
              ) : (
                players.map((player, idx) => (
                  <div key={idx} className="flex items-center gap-3 bg-[#3a3937] rounded-lg p-3">
                    <div className={`w-10 h-10 rounded-md flex items-center justify-center ${player.color === 'w' ? 'bg-gray-200' : 'bg-gray-700'}`}>
                      <PieceIcon type='k' color={player.color} className="w-6 h-6" />
                    </div>
                    <div className="flex-1">
                      <p className="font-semibold text-white text-sm">{player.name}</p>
                      <p className="text-xs text-gray-400">{player.color === 'w' ? 'White' : 'Black'}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`w-2 h-2 rounded-full ${getStatusColor(player.status)} ${player.status !== 'connected' ? 'animate-pulse' : ''}`}></span>
                      <span className="text-xs text-gray-400 capitalize">{player.status}</span>
                    </div>
                  </div>
                ))
              )}
              
              {/* Empty slot */}
              {players.length === 1 && (
                <div className="flex items-center gap-3 bg-[#3a3937]/50 rounded-lg p-3 border-2 border-dashed border-gray-600">
                  <div className="w-10 h-10 rounded-md flex items-center justify-center bg-gray-800">
                    <span className="text-gray-500 text-xl">?</span>
                  </div>
                  <div className="flex-1">
                    <p className="font-semibold text-gray-500 text-sm">Waiting for opponent...</p>
                    <p className="text-xs text-gray-600">{lobbyMode === 'host' ? 'Black' : 'White'}</p>
                  </div>
                  <Spinner />
                </div>
              )}
            </div>
          </div>

          <p className="text-sm text-gray-400 mb-4">
            {lobbyMode === 'host' 
              ? "Share your code, then enter your friend's response." 
              : "Enter Host's code, then share your response."}
          </p>

          {showHelp && (
            <div className="bg-[#3a3937] p-4 rounded-lg mb-6 text-xs text-gray-300 border-l-4 border-[#81b64c]">
              <p className="font-bold text-white mb-2">How to Connect:</p>
              <ol className="list-decimal pl-4 space-y-1">
                <li><strong>Host</strong> copies "Room Code" and sends it to <strong>Joiner</strong>.</li>
                <li><strong>Joiner</strong> pastes it into "Enter Host's Code".</li>
                <li><strong>Joiner</strong> gets a "Response Code" and sends it to <strong>Host</strong>.</li>
                <li><strong>Host</strong> pastes "Response Code" and clicks Connect.</li>
              </ol>
            </div>
          )}

          {/* Step 1: My Code */}
          <div className="bg-[#262421] p-4 rounded-xl border border-[#3a3937] mb-6 shadow-md">
            <h3 className="text-[#81b64c] font-bold text-sm uppercase mb-3">
              {lobbyMode === 'host' ? "1. Your Room Code" : "2. Your Response Code"}
            </h3>
            {localCode ? (
              <div className="flex flex-col items-center">
                 {/* QR Display */}
                 <div className="bg-white p-2 rounded-lg mb-3">
                   {qrUrl && <img src={qrUrl} className="w-48 h-48" alt="QR" />}
                 </div>
                 <div className="flex gap-2 w-full">
                    <button onClick={copyToClipboard} className="flex-1 py-3 bg-[#3a3937] rounded font-semibold text-sm hover:bg-[#454441] border border-gray-600">Copy Code</button>
                 </div>
                 <p className="text-xs text-gray-500 mt-2 text-center">
                   {lobbyMode === 'host' ? "Share this with your friend." : "Show this to the host."}
                 </p>
              </div>
            ) : (
               <div className="flex items-center justify-center h-48 bg-black/20 rounded-lg">
                 {lobbyMode === 'host' ? <Spinner /> : <span className="text-gray-500 text-sm p-4 text-center">Waiting for Host Code...</span>}
               </div>
            )}
          </div>

          {/* Step 2: Input Remote Code */}
          <div className="bg-[#262421] p-4 rounded-xl border border-[#3a3937] shadow-md">
            <h3 className="text-[#81b64c] font-bold text-sm uppercase mb-3">
              {lobbyMode === 'host' ? "2. Enter Friend's Response" : "1. Enter Host's Code"}
            </h3>
            <div className="flex flex-col gap-3">
               <div className="flex gap-2">
                 <button onClick={() => setShowScanner(true)} className="flex-1 py-3 bg-[#3a3937] rounded font-semibold text-sm flex items-center justify-center gap-2 hover:bg-[#454441] border border-gray-600">
                   📷 Scan QR
                 </button>
                 <button onClick={pasteFromClipboard} className="flex-1 py-3 bg-[#3a3937] rounded font-semibold text-sm hover:bg-[#454441] border border-gray-600">
                   📋 Paste
                 </button>
               </div>
               <textarea 
                  className="w-full bg-black/30 border border-gray-600 rounded p-2 text-xs font-mono h-20 text-gray-300 resize-none focus:border-[#81b64c] focus:outline-none"
                  placeholder={lobbyMode === 'host' ? "Paste response code here..." : "Paste room code here..."}
                  value={remoteCodeInput}
                  onChange={(e) => setRemoteCodeInput(e.target.value)}
               />
               <button 
                 onClick={() => processRemoteCode(remoteCodeInput)}
                 disabled={!remoteCodeInput}
                 className="w-full py-3 bg-[#81b64c] disabled:bg-gray-700 disabled:text-gray-500 text-white font-bold rounded-lg transition hover:bg-[#a3d160] shadow-lg"
               >
                 Connect
               </button>
            </div>
          </div>
        </div>
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
          <button onClick={() => { setView('home'); resetGame(false); peerRef.current?.close(); }} className="text-xs font-bold text-gray-500 hover:text-white">← EXIT GAME</button>
          {isOnline && <span className="text-xs text-[#81b64c] font-bold tracking-wider">● CONNECTED</span>}
        </div>

        {/* Top Player */}
        <div className="flex justify-between items-center mb-1 px-1">
           <Avatar color={opponentColor} name={isOnline ? (opponentName || "Opponent") : "Black"} />
           {winner && winner !== opponentColor && <span className="text-red-500 font-bold text-xs">LOST</span>}
        </div>

        {/* Board Container with Lock */}
        <div className={`relative w-full aspect-square rounded-sm shadow-2xl overflow-hidden bg-[#302e2b] transition-all duration-300 ${!isMyTurn && isOnline ? 'grayscale-[0.5] opacity-90' : ''}`}>
          
          {/* Waiting Overlay */}
          {!isMyTurn && isOnline && !winner && (
            <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/10 pointer-events-none">
                <div className="bg-black/70 text-white px-3 py-1 rounded-full text-xs font-bold shadow-lg backdrop-blur-sm border border-white/10">
                   Waiting for Opponent...
                </div>
            </div>
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
        <div className="flex justify-between items-center mt-1 mb-4 px-1">
           <Avatar color={myColor} name={isOnline ? (playerName || "You") : "White"} />
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