// src/components/MultiplayerManager.jsx
import React, { useEffect, useState } from 'react';
import { io } from 'socket.io-client';

const MultiplayerManager = ({ puzzleId, onPieceMove }) => {
  const [socket, setSocket] = useState(null);
  const [players, setPlayers] = useState([]);

  useEffect(() => {
    const newSocket = io('your-socket-server');
    
    newSocket.emit('join-puzzle', { puzzleId });
    
    newSocket.on('player-joined', (player) => {
      setPlayers(prev => [...prev, player]);
    });
    
    newSocket.on('piece-moved', (data) => {
      onPieceMove(data);
    });
    
    setSocket(newSocket);
    
    return () => newSocket.disconnect();
  }, [puzzleId]);

  return (
    <div className="player-list">
      <h3>Current Players:</h3>
      {players.map(player => (
        <div key={player.id}>{player.name}</div>
      ))}
    </div>
  );
};

export default MultiplayerManager;