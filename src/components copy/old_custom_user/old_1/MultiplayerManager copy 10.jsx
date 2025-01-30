import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass';
import { Camera, Check, Info, Clock, ZoomIn, ZoomOut, Maximize2, RotateCcw, Image, Play, Pause, Share, Users } from 'lucide-react';
import { initializeApp } from 'firebase/app';
import { getDatabase, ref, set, onValue, remove, update, push, onDisconnect } from 'firebase/database';
import { v4 as uuidv4 } from 'uuid';

// Firebase configuration
const firebaseConfig = {
  apiKey: "your-api-key",
  authDomain: "your-auth-domain",
  databaseURL: "your-database-url",
  projectId: "your-project-id",
  storageBucket: "your-storage-bucket",
  messagingSenderId: "your-messaging-sender-id",
  appId: "your-app-id"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const database = getDatabase(app);

// Difficulty presets
const DIFFICULTY_SETTINGS = {
  easy: { grid: { x: 3, y: 2 }, snapDistance: 0.4, rotationEnabled: false },
  medium: { grid: { x: 4, y: 3 }, snapDistance: 0.3, rotationEnabled: true },
  hard: { grid: { x: 5, y: 4 }, snapDistance: 0.2, rotationEnabled: true },
  expert: { grid: { x: 6, y: 5 }, snapDistance: 0.15, rotationEnabled: true }
};

// Achievement definitions and Sound System class remain the same
[Previous Achievement and Sound System code...]

const PuzzleGame = () => {
  // Additional state for multiplayer
  const [gameId, setGameId] = useState(null);
  const [playerId, setPlayerId] = useState(null);
  const [players, setPlayers] = useState({});
  const [isHost, setIsHost] = useState(false);
  const [showShareModal, setShowShareModal] = useState(false);
  
  // Previous state management code remains the same
  [Previous state management code...]

  // Create a new multiplayer game session
  const createMultiplayerGame = async () => {
    const newGameId = uuidv4();
    const newPlayerId = uuidv4();
    
    setGameId(newGameId);
    setPlayerId(newPlayerId);
    setIsHost(true);
    
    const gameRef = ref(database, `games/${newGameId}`);
    await set(gameRef, {
      state: 'waiting',
      host: newPlayerId,
      created: Date.now(),
      players: {
        [newPlayerId]: {
          id: newPlayerId,
          name: `Player ${Object.keys(players).length + 1}`,
          isHost: true,
          lastActive: Date.now()
        }
      },
      puzzle: {
        difficulty: 'medium',
        pieces: [],
        completedPieces: 0,
        totalPieces: 0
      }
    });
    
    // Setup disconnect cleanup
    const playerRef = ref(database, `games/${newGameId}/players/${newPlayerId}`);
    onDisconnect(playerRef).remove();
    
    setShowShareModal(true);
  };

  // Join an existing multiplayer game
  const joinMultiplayerGame = async (gameId) => {
    const newPlayerId = uuidv4();
    setPlayerId(newPlayerId);
    setGameId(gameId);
    
    const playerRef = ref(database, `games/${gameId}/players/${newPlayerId}`);
    await set(playerRef, {
      id: newPlayerId,
      name: `Player ${Object.keys(players).length + 1}`,
      isHost: false,
      lastActive: Date.now()
    });
    
    // Setup disconnect cleanup
    onDisconnect(playerRef).remove();
  };

  // Leave multiplayer game
  const leaveMultiplayerGame = async () => {
    if (!gameId || !playerId) return;
    
    const playerRef = ref(database, `games/${gameId}/players/${playerId}`);
    await remove(playerRef);
    
    if (isHost) {
      const gameRef = ref(database, `games/${gameId}`);
      await remove(gameRef);
    }
    
    setGameId(null);
    setPlayerId(null);
    setIsHost(false);
    setPlayers({});
  };

  // Sync game state with Firebase
  useEffect(() => {
    if (!gameId) return;
    
    const gameRef = ref(database, `games/${gameId}`);
    const unsubscribe = onValue(gameRef, (snapshot) => {
      const gameData = snapshot.val();
      if (!gameData) return;
      
      setPlayers(gameData.players || {});
      
      // Sync puzzle state
      if (gameData.puzzle) {
        // Update puzzle pieces positions and states
        puzzlePiecesRef.current.forEach((piece, index) => {
          if (gameData.puzzle.pieces[index]) {
            const pieceData = gameData.puzzle.pieces[index];
            piece.position.copy(new THREE.Vector3(
              pieceData.position.x,
              pieceData.position.y,
              pieceData.position.z
            ));
            piece.rotation.z = pieceData.rotation;
            piece.userData.isPlaced = pieceData.isPlaced;
            if (piece.material.uniforms) {
              piece.material.uniforms.correctPosition.value = pieceData.isPlaced ? 1.0 : 0.0;
            }
          }
        });
        
        setCompletedPieces(gameData.puzzle.completedPieces);
        setProgress((gameData.puzzle.completedPieces / gameData.puzzle.totalPieces) * 100);
      }
      
      if (gameData.state) {
        setGameState(gameData.state);
        setIsTimerRunning(gameData.state === 'playing');
      }
    });
    
    return () => unsubscribe();
  }, [gameId]);

  // Update piece positions in Firebase
  const updatePiecePosition = async (piece, index) => {
    if (!gameId) return;
    
    const pieceRef = ref(database, `games/${gameId}/puzzle/pieces/${index}`);
    await update(pieceRef, {
      position: {
        x: piece.position.x,
        y: piece.position.y,
        z: piece.position.z
      },
      rotation: piece.rotation.z,
      isPlaced: piece.userData.isPlaced
    });
  };

  // Modified handleMouseMove to sync piece positions
  const handleMouseMove = (event) => {
    if (!isDragging || !selectedPieceRef.current) return;
    
    // Previous mouse move logic...
    [Previous mouse move code...]
    
    // Sync position with Firebase
    const pieceIndex = puzzlePiecesRef.current.indexOf(selectedPieceRef.current);
    updatePiecePosition(selectedPieceRef.current, pieceIndex);
  };

  // Modified handleMouseUp to sync final piece position
  const handleMouseUp = () => {
    if (!selectedPieceRef.current) return;
    
    // Previous mouse up logic...
    [Previous mouse up code...]
    
    // Sync position with Firebase
    const pieceIndex = puzzlePiecesRef.current.indexOf(selectedPieceRef.current);
    updatePiecePosition(selectedPieceRef.current, pieceIndex);
    
    if (selectedPieceRef.current.userData.isPlaced) {
      // Update completed pieces count in Firebase
      update(ref(database, `games/${gameId}/puzzle`), {
        completedPieces: completedPieces + 1
      });
    }
  };

  // Modified createPuzzlePieces to sync with Firebase
  const createPuzzlePieces = async (imageUrl) => {
    // Previous piece creation logic...
    [Previous piece creation code...]
    
    if (gameId) {
      // Save initial piece states to Firebase
      const pieceStates = puzzlePiecesRef.current.map(piece => ({
        position: {
          x: piece.position.x,
          y: piece.position.y,
          z: piece.position.z
        },
        rotation: piece.rotation.z,
        isPlaced: piece.userData.isPlaced
      }));
      
      await update(ref(database, `games/${gameId}/puzzle`), {
        pieces: pieceStates,
        totalPieces: gridSize.x * gridSize.y,
        completedPieces: 0
      });
    }
  };

  return (
    <div className="w-full h-screen flex flex-col bg-gray-900">
      {/* Header with controls */}
      <div className="p-4 bg-gray-800 flex items-center justify-between">
        <div className="flex items-center gap-4">
          {/* Previous controls... */}
          [Previous controls code...]
          
          {/* Multiplayer controls */}
          {!gameId ? (
            <div className="flex items-center gap-2">
              <button
                onClick={createMultiplayerGame}
                className="flex items-center gap-2 px-4 py-2 bg-green-600 
                          hover:bg-green-700 rounded-lg text-white transition-colors"
              >
                <Users className="w-5 h-5" />
                <span>Create Game</span>
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowShareModal(true)}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 
                          hover:bg-blue-700 rounded-lg text-white transition-colors"
              >
                <Share className="w-5 h-5" />
                <span>Share</span>
              </button>
              <button
                onClick={leaveMultiplayerGame}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 
                          rounded-lg text-white transition-colors"
              >
                Leave Game
              </button>
            </div>
          )}
        </div>

        {/* Player list */}
        {gameId && (
          <div className="flex items-center gap-4 px-4 py-2 bg-gray-700 rounded-lg">
            <Users className="w-5 h-5 text-gray-400" />
            <div className="flex gap-2">
              {Object.values(players).map((player) => (
                <div
                  key={player.id}
                  className={`px-2 py-1 rounded ${
                    player.isHost ? 'bg-blue-600' : 'bg-gray-600'
                  }`}
                >
                  {player.name}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Share Modal */}
      {showShareModal && (
        <div className="fixed inset-0 flex items-center justify-center 
                      bg-black bg-opacity-50 z-50">
          <div className="bg-gray-800 p-6 rounded-lg shadow-xl">
            <h3 className="text-xl text-white mb-4">Share Game</h3>
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={`${window.location.origin}?game=${gameId}`}
                readOnly
                className="px-4 py-2 bg-gray-700 text-white rounded-lg w-96"
              />
              <button
                onClick={() => {
                  navigator.clipboard.writeText(
                    `${window.location.origin}?game=${gameId}`
                  );
                }}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 
                          rounded-lg text-white transition-colors"
              >
                Copy
              </button>
            </div>
            <button
              onClick={() => setShowShareModal(false)}
              className="mt-4 px-4 py-2 bg-gray-700 hover:bg-gray-600 
                        rounded-lg text-white transition-colors w-full"
            >
              Close
            </button>
          </div>
        </div>
      )}

      {/* Previous puzzle area and overlays... */}
      [Previous puzzle area and overlay code...]
    </div>
  );
};

export default PuzzleGame;