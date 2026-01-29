import React, { useState, useEffect, useRef, useCallback } from 'react';
import { GoogleGenAI } from "@google/genai";
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
  
  // Connection State
  const [connectionStatus, setConnectionStatus] = useState<'disconnected' | 'connecting' | 'awaiting-response' | 'connected'>('disconnected');
  const [playerColor, setPlayerColor] = useState<Color>('w');
  const [localCode, setLocalCode] = useState<string>(''); // Code I generate
  const [remoteCodeInput, setRemoteCodeInput] = useState<string>(''); // Code I input
  const [codeCopied, setCodeCopied] = useState(false);
  
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

  // Sync board state whenever game changes
  useEffect(() => {
    setBoard([...game.board.map(row => [...row])]);
    setTurn(game.turn);
    setWinner(game.winner);
  }, [game]);

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
          prevGame.move(from, to);
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
      const success = game.move(selected, { row, col });
      if (success) {
        const moveFrom = selected;
        const moveTo = { row, col };
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
          sendMove(moveFrom, moveTo);
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
    if (sendSignal && connectionStatus === 'connected' && dataChannelRef.current?.readyState === 'open') {
      dataChannelRef.current.send(JSON.stringify({ type: 'restart' }));
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
              <p className="text-gray-400 text-sm mb-6">Share the code below with your friend</p>
              
              {/* Room Code Display */}
              <div className="bg-[#262421] rounded-2xl p-6 mb-6 border border-[#3a3937]">
                <p className="text-xs text-gray-500 uppercase tracking-wider mb-2">Room Code</p>
                {localCode ? (
                  <>
                    <div className="bg-[#1a1916] rounded-xl p-4 mb-4">
                      <p className="text-xs font-mono text-gray-400 break-all leading-relaxed max-h-24 overflow-y-auto">
                        {localCode.slice(0, 50)}...
                      </p>
                    </div>
                    <button 
                      onClick={copyToClipboard}
                      className={`w-full py-3 rounded-xl font-bold text-lg transition ${
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
                  className="w-full py-3 bg-[#81b64c] disabled:bg-gray-700 disabled:text-gray-500 text-white font-bold rounded-xl transition hover:bg-[#a3d160]"
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
              <p className="text-gray-400 text-sm mb-6">Enter the host's room code</p>
              
              {/* Enter Host Code */}
              <div className="bg-[#262421] rounded-2xl p-6 mb-6 border border-[#3a3937]">
                <p className="text-xs text-gray-500 uppercase tracking-wider mb-3">Host's Room Code</p>
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
                  className="w-full py-3 bg-[#81b64c] disabled:bg-gray-700 disabled:text-gray-500 text-white font-bold rounded-xl transition hover:bg-[#a3d160]"
                >
                  Join
                </button>
              </div>

              {/* Response Code (shows after entering host code) */}
              {localCode && (
                <div className="bg-[#262421] rounded-2xl p-6 border border-[#81b64c]">
                  <p className="text-xs text-[#81b64c] uppercase tracking-wider mb-2">✓ Your Response Code</p>
                  <p className="text-gray-400 text-xs mb-3">Send this back to the host</p>
                  <div className="bg-[#1a1916] rounded-xl p-4 mb-4">
                    <p className="text-xs font-mono text-gray-400 break-all leading-relaxed max-h-24 overflow-y-auto">
                      {localCode.slice(0, 50)}...
                    </p>
                  </div>
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
                ? "1. Copy & share code → 2. Get response → 3. Connect" 
                : "1. Paste host's code → 2. Copy response → 3. Send to host"}
            </p>
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
        <div className="flex justify-between items-center mt-1 mb-4 px-1">
           <Avatar color={myColor} name={isOnline ? (playerName || "You") : "White"} />
           {winner && winner === myColor && <span className="text-[#81b64c] font-bold text-xs">WON 🎉</span>}
           {winner && winner !== myColor && winner !== 'draw' && <span className="text-red-500 font-bold text-xs">LOST</span>}
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