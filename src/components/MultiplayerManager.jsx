// src/components/MultiplayerManager.jsx
import React, { useEffect, useState } from 'react';
import { io } from 'socket.io-client';
import { getDatabase, ref, onValue, set } from 'firebase/database';
import { generateInviteLink } from '../utils/inviteHelper';

const MultiplayerManager = ({ puzzleId, isHost, onPieceMove, onPlayerJoin }) => {
  const [socket, setSocket] = useState(null);
  const [players, setPlayers] = useState([]);
  const [inviteLink, setInviteLink] = useState('');

  useEffect(() => {
    // Set up Firebase Realtime Database for puzzle state
    const db = getDatabase();
    const puzzleRef = ref(db, `puzzles/${puzzleId}`);

    // Set up Socket.IO connection
    const newSocket = io(process.env.REACT_APP_SOCKET_SERVER);
    setSocket(newSocket);

    if (isHost) {
      // Create new puzzle session
      const link = generateInviteLink(puzzleId);
      setInviteLink(link);
      
      // Initialize puzzle state
      set(puzzleRef, {
        pieces: [],
        players: [],
        status: 'active'
      });
    }

    // Listen for player movements
    newSocket.on('piece-moved', (data) => {
      onPieceMove(data.pieceId, data.position, data.rotation);
    });

    // Listen for player joins
    newSocket.on('player-joined', (player) => {
      setPlayers(prev => [...prev, player]);
      onPlayerJoin(player);
    });

    return () => {
      newSocket.disconnect();
    };
  }, [puzzleId, isHost]);

  const movePiece = (pieceId, position, rotation) => {
    socket.emit('move-piece', {
      puzzleId,
      pieceId,
      position,
      rotation
    });
  };

  return (
    <div className="multiplayer-container">
      {isHost && (
        <div className="invite-section p-4 bg-white rounded-lg shadow mb-4">
          <h3 className="text-lg font-semibold mb-2">Invite Players</h3>
          <div className="flex items-center space-x-2">
            <input
              type="text"
              value={inviteLink}
              readOnly
              className="flex-1 p-2 border rounded"
            />
            <button
              onClick={() => navigator.clipboard.writeText(inviteLink)}
              className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
            >
              Copy
            </button>
          </div>
        </div>
      )}

      <div className="players-list p-4 bg-white rounded-lg shadow">
        <h3 className="text-lg font-semibold mb-2">Current Players</h3>
        <div className="space-y-2">
          {players.map(player => (
            <div
              key={player.id}
              className="flex items-center space-x-2 p-2 bg-gray-50 rounded"
            >
              <div
                className="w-3 h-3 rounded-full"
                style={{ backgroundColor: player.color }}
              />
              <span>{player.name}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default MultiplayerManager;