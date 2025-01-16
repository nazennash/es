import React, { useState, useEffect, useRef } from 'react';
import { getStorage, ref as storageRef, uploadBytes, getDownloadURL } from 'firebase/storage';
import { getDatabase, ref as dbRef, set, onValue, update, get, runTransaction } from 'firebase/database';
import { ZoomIn, ZoomOut, RotateCw, RotateCcw, Share2, Play, Users, Download, LogOut, Home } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Bar } from 'react-chartjs-2';
import 'chart.js/auto';
import html2canvas from 'html2canvas';

const MultiplayerPuzzle = () => {
  // Base state management
  const [gameState, setGameState] = useState({
    gameId: window.location.pathname.split('/').pop() || `game-${Date.now()}`,
    imageUrl: '',
    isHost: false,
    difficulty: 3,
    timer: 0,
    imageSize: { width: 0, height: 0 },
    startTime: null,
    lastUpdateTime: null,
    isCompleted: false
  });

  // UI state management
  const [ui, setUi] = useState({
    zoom: 1,
    selectedPiece: null,
    draggedPiece: null,
    error: null,
    showPlayers: true,
    loading: true,
    gridDimensions: { width: 0, height: 0 },
    cellDimensions: { width: 0, height: 0 }
  });

  // Game-specific state
  const [pieces, setPieces] = useState([]);
  const [players, setPlayers] = useState({});
  const [isGameStarted, setIsGameStarted] = useState(false);
  const [winner, setWinner] = useState(null);
  const [showShareModal, setShowShareModal] = useState(false);

  // Refs and services
  const puzzleContainerRef = useRef(null);
  const timerRef = useRef(null);
  const storage = getStorage();
  const database = getDatabase();
  const navigate = useNavigate();

  // User data management
  const userData = JSON.parse(localStorage.getItem('authUser'));
  const userId = userData?.uid || `user-${Date.now()}`;
  const userName = userData?.displayName || userData?.email || `Player ${Math.floor(Math.random() * 1000)}`;

  // Firebase references
  const gameRef = dbRef(database, `games/${gameState.gameId}`);

  // Utility functions
  const getHighestScoringPlayer = () => {
    return Object.values(players).reduce((highest, current) => {
      return (!highest || current.score > highest.score) ? current : highest;
    }, null);
  };

  const calculateCompletionPercentage = () => {
    if (!pieces.length) return 0;
    return (pieces.filter(p => p.isPlaced).length / pieces.length) * 100;
  };

  // Timer management
  useEffect(() => {
    let interval;
    
    const updateTimer = async () => {
      if (!isGameStarted || gameState.isCompleted || !gameState.startTime) return;
      
      const newTimer = Math.floor((Date.now() - gameState.startTime) / 1000);
      await runTransaction(gameRef, (currentData) => {
        if (!currentData) return null;
        return { ...currentData, timer: newTimer };
      });
      
      setGameState(prev => ({ ...prev, timer: newTimer }));
    };

    if (isGameStarted && gameState.startTime) {
      interval = setInterval(updateTimer, 1000);
    }

    return () => {
      if (interval) clearInterval(interval);
    };
  }, [isGameStarted, gameState.startTime, gameState.isCompleted]);

  // Game initialization
  useEffect(() => {
    let unsubscribe;

    const initializeGame = async () => {
      try {
        const snapshot = await get(gameRef);
        const data = snapshot.val();

        if (!data) {
          // New game setup
          await set(gameRef, {
            players: {
              [userId]: {
                id: userId,
                name: userName,
                score: 0,
                color: `#${Math.floor(Math.random()*16777215).toString(16)}`,
                isHost: true,
                lastActive: Date.now()
              }
            },
            imageUrl: '',
            isGameStarted: false,
            timer: 0,
            difficulty: gameState.difficulty,
            startTime: null,
            imageSize: gameState.imageSize,
            isCompleted: false
          });
          setGameState(prev => ({ ...prev, isHost: true }));
        } else {
          // Join existing game
          const playerData = {
            id: userId,
            name: userName,
            score: 0,
            color: `#${Math.floor(Math.random()*16777215).toString(16)}`,
            isHost: false,
            lastActive: Date.now()
          };

          if (!data.players?.[userId]) {
            await update(gameRef, {
              [`players/${userId}`]: playerData
            });
          }

          setGameState(prev => ({
            ...prev,
            difficulty: data.difficulty || 3,
            isHost: data.players?.[userId]?.isHost || false,
            startTime: data.startTime,
            imageSize: data.imageSize || { width: 0, height: 0 },
            isCompleted: data.isCompleted || false
          }));
        }

        setUi(prev => ({ ...prev, loading: false }));
      } catch (err) {
        console.error('Game initialization error:', err);
        setUi(prev => ({
          ...prev,
          loading: false,
          error: { type: 'error', message: 'Failed to initialize game' }
        }));
      }
    };

    // Real-time game state listener
    const setupGameListener = () => {
      unsubscribe = onValue(gameRef, (snapshot) => {
        const data = snapshot.val();
        if (!data) return;

        setGameState(prev => ({
          ...prev,
          imageUrl: data.imageUrl || '',
          difficulty: data.difficulty || 3,
          timer: data.timer || 0,
          isCompleted: data.isCompleted || false
        }));

        setPlayers(data.players || {});
        setPieces(data.pieces || []);
        setIsGameStarted(data.isGameStarted || false);

        if (data.winner) {
          setWinner(data.winner);
          setShowShareModal(true);
        }
      });
    };

    initializeGame();
    setupGameListener();

    // Cleanup
    return () => {
      if (unsubscribe) unsubscribe();
      if (timerRef.current) clearInterval(timerRef.current);
      
      const cleanup = async () => {
        try {
          await runTransaction(gameRef, (currentData) => {
            if (!currentData) return null;
            const { [userId]: removedPlayer, ...remainingPlayers } = currentData.players || {};
            return {
              ...currentData,
              players: remainingPlayers
            };
          });
        } catch (err) {
          console.error('Cleanup error:', err);
        }
      };

      cleanup();
    };
  }, [gameState.gameId]);

  // Piece movement handler
  const handleDrop = async (x, y) => {
    if (!ui.draggedPiece) return;

    try {
      await runTransaction(gameRef, (currentData) => {
        if (!currentData) return null;

        const updatedPieces = currentData.pieces.map(p => {
          if (p.id === ui.draggedPiece.id) {
            const isCorrect = x === p.correct.x && 
                            y === p.correct.y && 
                            p.rotation % 360 === 0;
            
            return { ...p, current: { x, y }, isPlaced: isCorrect };
          }
          return p;
        });

        const piece = updatedPieces.find(p => p.id === ui.draggedPiece.id);
        const currentScore = currentData.players[userId]?.score || 0;

        return {
          ...currentData,
          pieces: updatedPieces,
          players: {
            ...currentData.players,
            [userId]: {
              ...currentData.players[userId],
              score: piece?.isPlaced ? currentScore + 1 : currentScore
            }
          }
        };
      });

      setUi(prev => ({ ...prev, draggedPiece: null }));
    } catch (err) {
      console.error('Piece movement error:', err);
      setUi(prev => ({
        ...prev,
        error: { type: 'error', message: 'Failed to move piece' },
        draggedPiece: null
      }));
    }
  };

  // Piece rotation handler
  const handleRotate = async (direction) => {
    if (!ui.selectedPiece) return;

    try {
      await runTransaction(gameRef, (currentData) => {
        if (!currentData) return null;

        const updatedPieces = currentData.pieces.map(p => {
          if (p.id === ui.selectedPiece.id) {
            const newRotation = p.rotation + (direction === 'left' ? -90 : 90);
            const isCorrect = p.correct.x === p.current.x && 
                            p.correct.y === p.current.y && 
                            newRotation % 360 === 0;
            
            return { ...p, rotation: newRotation, isPlaced: isCorrect };
          }
          return p;
        });

        const piece = updatedPieces.find(p => p.id === ui.selectedPiece.id);
        const currentScore = currentData.players[userId]?.score || 0;

        return {
          ...currentData,
          pieces: updatedPieces,
          players: {
            ...currentData.players,
            [userId]: {
              ...currentData.players[userId],
              score: piece?.isPlaced ? currentScore + 1 : currentScore
            }
          }
        };
      });
    } catch (err) {
      console.error('Piece rotation error:', err);
      setUi(prev => ({
        ...prev,
        error: { type: 'error', message: 'Failed to rotate piece' }
      }));
    }
  };

  // Game initialization handler
  const initializePuzzle = async () => {
    if (!gameState.imageUrl || !gameState.isHost) return;

    try {
      setUi(prev => ({ ...prev, loading: true, error: null }));
      
      const newPieces = Array(gameState.difficulty * gameState.difficulty)
        .fill(null)
        .map((_, index) => {
          const correctX = Math.floor(index / gameState.difficulty);
          const correctY = index % gameState.difficulty;
          return {
            id: `piece-${correctX}-${correctY}`,
            correct: { x: correctX, y: correctY },
            current: { 
              x: Math.floor(Math.random() * gameState.difficulty), 
              y: Math.floor(Math.random() * gameState.difficulty) 
            },
            rotation: Math.floor(Math.random() * 4) * 90,
            isPlaced: false
          };
        });

      const startTime = Date.now();

      await set(gameRef, {
        ...gameState,
        pieces: newPieces,
        isGameStarted: true,
        startTime,
        timer: 0,
        lastUpdateTime: startTime
      });

      setUi(prev => ({ ...prev, loading: false }));
    } catch (err) {
      console.error('Puzzle initialization error:', err);
      setUi(prev => ({
        ...prev,
        loading: false,
        error: { type: 'error', message: 'Failed to start game' }
      }));
    }
  };

  // Image upload handler
  const handleImageUpload = async (event) => {
    if (!gameState.isHost) return;
    
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      setUi(prev => ({ ...prev, loading: true, error: null }));
      
      const imageRef = storageRef(storage, `puzzle-images/${gameState.gameId}/${file.name}`);
      const snapshot = await uploadBytes(imageRef, file);
      const url = await getDownloadURL(snapshot.ref);
      
      const img = new Image();
      
      img.onload = async () => {
        try {
          await update(gameRef, {
            imageUrl: url,
            imageSize: {
              width: img.width,
              height: img.height
            }
          });
          
          setUi(prev => ({ ...prev, loading: false }));
        } catch (err) {
          throw new Error('Failed to update game with image information');
        }
      };
      
      img.onerror = () => {
        throw new Error('Failed to load image');
      };
      
      img.src = url;
    } catch (err) {
      console.error('Image upload error:', err);
      setUi(prev => ({
        ...prev,
        error: { type: 'error', message: err.message || 'Failed to upload image' },
        loading: false
      }));
    }
  };

  // Share functionality
  const ShareModal = () => (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white p-6 rounded-lg shadow-xl max-w-md w-full">
        <h3 className="text-xl font-bold mb-4">Share Your Achievement</h3>
        <div className="space-y-4">
          <button
            onClick={shareToFacebook}
            className="w-full p-3 bg-blue-600 text-white rounded hover:bg-blue-700"
          >
            Share on Facebook
          </button>
          <button
            onClick={shareToTwitter}
            className="w-full p-3 bg-sky-400 text-white rounded hover:bg-sky-500"
          >
            Share on Twitter
          </button>
          <button
            onClick={shareToWhatsApp}
            className="w-full p-3 bg-green-500 text-white rounded hover:bg-green-600"
          >
            Share on WhatsApp
          </button>
          <button
            onClick={downloadPuzzleImage}
            className="w-full p-3 bg-gray-200 text-gray-800 rounded hover:bg-gray-300 flex items-center justify-center gap-2"
          >
            <Download className="h-4 w-4" /> Download Image
          </button>
        </div>
        <button
          onClick={() => setShowShareModal(false)}
          className="mt-4 w-full p-2 border border-gray-300 rounded hover:bg-gray-50"
        >
          Close
        </button>
      </div>
    </div>
  );

  // Winner notification component
  const WinnerNotification = ({ winner }) => (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items