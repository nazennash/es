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
  apiKey: "AIzaSyAuzyxG9Cs1ma9chjR-uJZegoMAc1Vp2Ig",
  authDomain: "nash-ac5c0.firebaseapp.com",
  projectId: "nash-ac5c0",
  storageBucket: "nash-ac5c0.firebasestorage.app",
  messagingSenderId: "49955314335",
  appId: "1:49955314335:web:e12140aa04351c658060aa",
  measurementId: "G-Y1LW4LFGR2",
  databaseURL: "https://nash-ac5c0-default-rtdb.firebaseio.com/",
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
// Achievement definitions
const ACHIEVEMENTS = [
  { id: 'speed_demon', name: 'Speed Demon', description: 'Complete puzzle under 2 minutes', icon: '⚡' },
  { id: 'perfectionist', name: 'Perfectionist', description: 'Complete without misplacing pieces', icon: '✨' },
  { id: 'persistent', name: 'Persistent', description: 'Complete on expert difficulty', icon: '🏆' }
];

// Sound System Class
class SoundSystem {
  constructor() {
    this.context = new (window.AudioContext || window.webkitAudioContext)();
    this.sounds = {};
    this.enabled = true;
  }

  async initialize() {
    this.sounds.pickup = this.createToneBuffer(440, 0.1);
    this.sounds.place = this.createToneBuffer(880, 0.15);
    this.sounds.complete = this.createToneBuffer([523.25, 659.25, 783.99], 0.3);
  }

  createToneBuffer(frequency, duration) {
    const sampleRate = this.context.sampleRate;
    const buffer = this.context.createBuffer(1, duration * sampleRate, sampleRate);
    const data = buffer.getChannelData(0);
    const frequencies = Array.isArray(frequency) ? frequency : [frequency];

    for (let i = 0; i < buffer.length; i++) {
      let sample = 0;
      frequencies.forEach(freq => {
        sample += Math.sin(2 * Math.PI * freq * i / sampleRate);
      });
      data[i] = sample / frequencies.length * Math.exp(-3 * i / buffer.length);
    }
    return buffer;
  }

  play(soundName) {
    if (!this.enabled || !this.sounds[soundName]) return;
    const source = this.context.createBufferSource();
    source.buffer = this.sounds[soundName];
    source.connect(this.context.destination);
    source.start();
  }

  toggle() {
    this.enabled = !this.enabled;
    return this.enabled;
  }
}

// Add near the top of the file
class ParticleSystem {
  constructor(scene) {
    this.particles = [];
    this.scene = scene;
    
    const geometry = new THREE.BufferGeometry();
    const material = new THREE.PointsMaterial({
      size: 0.05,
      map: new THREE.TextureLoader().load('/api/placeholder/32/32'),
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    });
    
    this.particleSystem = new THREE.Points(geometry, material);
    scene.add(this.particleSystem);
  }
  
  // ... rest of the ParticleSystem implementation ...
}
const PuzzleGame = () => {
  // Additional state for multiplayer
  const [gameId, setGameId] = useState(null);
  const [playerId, setPlayerId] = useState(null);
  const [players, setPlayers] = useState({});
  const [isHost, setIsHost] = useState(false);
  const [showShareModal, setShowShareModal] = useState(false);
  
  // Previous state management code remains the same
  // State management
const [image, setImage] = useState(null);
const [loading, setLoading] = useState(false);
const [progress, setProgress] = useState(0);
const [completedPieces, setCompletedPieces] = useState(0);
const [totalPieces, setTotalPieces] = useState(0);
const [timeElapsed, setTimeElapsed] = useState(0);
const [isTimerRunning, setIsTimerRunning] = useState(false);
const [gameState, setGameState] = useState('initial'); // 'initial', 'playing', 'paused'
const [showThumbnail, setShowThumbnail] = useState(false);


// Refs
const containerRef = useRef(null);
const sceneRef = useRef(null);
const cameraRef = useRef(null);
const rendererRef = useRef(null);
const composerRef = useRef(null);
const controlsRef = useRef(null);
const clockRef = useRef(new THREE.Clock());
const particleSystemRef = useRef(null);
const puzzlePiecesRef = useRef([]);
const selectedPieceRef = useRef(null);
const timerRef = useRef(null);
const guideOutlinesRef = useRef([]);
const isDragging = useRef(false);

const defaultCameraPosition = { x: 0, y: 0, z: 5 };
const defaultControlsTarget = new THREE.Vector3(0, 0, 0);

// Add near the top with other state/ref declarations
const raycaster = useRef(new THREE.Raycaster());
const mouse = useRef(new THREE.Vector2());
const dragPlane = useRef(new THREE.Plane());

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
    const rect = rendererRef.current.domElement.getBoundingClientRect();
mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

raycaster.setFromCamera(mouse, cameraRef.current);
const intersectPoint = new THREE.Vector3();
raycaster.ray.intersectPlane(dragPlane, intersectPoint);

selectedPieceRef.current.position.copy(intersectPoint);

const originalPos = selectedPieceRef.current.userData.originalPosition;
const distance = originalPos.distanceTo(selectedPieceRef.current.position);

if (distance < 0.3) {
  selectedPieceRef.current.material.uniforms.correctPosition.value = 
    1.0 - (distance / 0.3);
} else {
  selectedPieceRef.current.material.uniforms.correctPosition.value = 0.0;
}
    
    // Sync position with Firebase
    const pieceIndex = puzzlePiecesRef.current.indexOf(selectedPieceRef.current);
    updatePiecePosition(selectedPieceRef.current, pieceIndex);
  };

  // Modified handleMouseUp to sync final piece position
  const handleMouseUp = () => {
    if (!selectedPieceRef.current) return;
    
    // Previous mouse up logic...
    const originalPos = selectedPieceRef.current.userData.originalPosition;
const distance = originalPos.distanceTo(selectedPieceRef.current.position);

if (distance < 0.3) {
  selectedPieceRef.current.position.copy(originalPos);
  selectedPieceRef.current.rotation.z = 0;
  
  if (!selectedPieceRef.current.userData.isPlaced) {
    selectedPieceRef.current.userData.isPlaced = true;
    setCompletedPieces(prev => {
      const newCount = prev + 1;
      setProgress((newCount / totalPieces) * 100);
      return newCount;
    });

    particleSystemRef.current.emit(selectedPieceRef.current.position, 30);
  }
}

selectedPieceRef.current.material.uniforms.selected.value = 0.0;
selectedPieceRef.current.material.uniforms.correctPosition.value = 
  selectedPieceRef.current.userData.isPlaced ? 1.0 : 0.0;
    
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
    if (!sceneRef.current) return;

puzzlePiecesRef.current.forEach(piece => {
  sceneRef.current.remove(piece);
});
puzzlePiecesRef.current = [];

const texture = await new THREE.TextureLoader().loadAsync(imageUrl);
const aspectRatio = texture.image.width / texture.image.height;

const gridSize = { x: 4, y: 3 };
const pieceSize = {
  x: 1 * aspectRatio / gridSize.x,
  y: 1 / gridSize.y
};

setTotalPieces(gridSize.x * gridSize.y);
createPlacementGuides(gridSize, pieceSize);

for (let y = 0; y < gridSize.y; y++) {
  for (let x = 0; x < gridSize.x; x++) {
    const geometry = new THREE.PlaneGeometry(
      pieceSize.x * 0.95,
      pieceSize.y * 0.95,
      32,
      32
    );

    const material = new THREE.ShaderMaterial({
      uniforms: {
        map: { value: texture },
        heightMap: { value: texture },
        uvOffset: { value: new THREE.Vector2(x / gridSize.x, y / gridSize.y) },
        uvScale: { value: new THREE.Vector2(1 / gridSize.x, 1 / gridSize.y) },
        extrusionScale: { value: 0.15 },
        selected: { value: 0.0 },
        correctPosition: { value: 0.0 },
        time: { value: 0.0 }
      },
      vertexShader: puzzlePieceShader.vertexShader,
      fragmentShader: puzzlePieceShader.fragmentShader,
      side: THREE.DoubleSide
    });

    const piece = new THREE.Mesh(geometry, material);
    
    piece.position.x = (x - gridSize.x / 2 + 0.5) * pieceSize.x;
    piece.position.y = (y - gridSize.y / 2 + 0.5) * pieceSize.y;
    piece.position.z = 0;

    piece.userData.originalPosition = piece.position.clone();
    piece.userData.gridPosition = { x, y };
    piece.userData.isPlaced = false;

    sceneRef.current.add(piece);
    puzzlePiecesRef.current.push(piece);
  }
}

// Scramble pieces
puzzlePiecesRef.current.forEach(piece => {
  piece.position.x += (Math.random() - 0.5) * 2;
  piece.position.y += (Math.random() - 0.5) * 2;
  piece.position.z += Math.random() * 0.5;
  piece.rotation.z = (Math.random() - 0.5) * 0.5;
});
    
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

// Image Upload Handler
const handleImageUpload = async (event) => {
  const file = event.target.files[0];
  if (!file) return;

  setLoading(true);
  const reader = new FileReader();
  
  reader.onload = async (e) => {
    setImage(e.target.result);
    await createPuzzlePieces(e.target.result);
    setLoading(false);
    setGameState('initial');
    setIsTimerRunning(false);
    setCompletedPieces(0);
    setProgress(0);
    setTimeElapsed(0);
    
    if (gameId) {
      await update(ref(database, `games/${gameId}`), {
        imageData: e.target.result,
        state: 'initial',
        puzzle: {
          pieces: [],
          completedPieces: 0,
          totalPieces: 0
        }
      });
    }
  };

  reader.onerror = () => {
    setLoading(false);
    console.error('Error reading file');
  };

  reader.readAsDataURL(file);
};

// Time Formatting
const formatTime = (seconds) => {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
};

// Game State Handlers
const startGame = () => {
  setGameState('playing');
  setIsTimerRunning(true);
  
  if (gameId) {
    update(ref(database, `games/${gameId}`), {
      state: 'playing',
      startTime: Date.now()
    });
  }
};

const togglePause = () => {
  const newState = gameState === 'playing' ? 'paused' : 'playing';
  setGameState(newState);
  setIsTimerRunning(newState === 'playing');
  
  if (gameId) {
    update(ref(database, `games/${gameId}`), {
      state: newState,
      lastUpdated: Date.now()
    });
  }
};
// Camera Control Handlers
const handleZoomIn = (cameraRef) => {
  if (cameraRef.current) {
    const newZ = Math.max(cameraRef.current.position.z - 1, 2);
    cameraRef.current.position.setZ(newZ);
  }
};

const handleZoomOut = (cameraRef) => {
  if (cameraRef.current) {
    const newZ = Math.min(cameraRef.current.position.z + 1, 10);
    cameraRef.current.position.setZ(newZ);
  }
};

const handleResetView = ({
  cameraRef,
  controlsRef,
  defaultCameraPosition,
  defaultControlsTarget
}) => {
  if (cameraRef.current && controlsRef.current) {
    cameraRef.current.position.set(
      defaultCameraPosition.x,
      defaultCameraPosition.y,
      defaultCameraPosition.z
    );
    controlsRef.current.target.copy(defaultControlsTarget);
    controlsRef.current.update();
  }
};

// Game Reset Handler
const handleResetGame = ({
  sceneRef,
  image,
  setTimeElapsed,
  setCompletedPieces,
  setProgress,
  setGameState,
  setIsTimerRunning,
  puzzlePiecesRef,
  totalPieces,
  handleResetView,
  gameId,
  database
}) => {
  if (!sceneRef.current || !image) return;
  
  setTimeElapsed(0);
  setCompletedPieces(0);
  setProgress(0);
  setGameState('initial');
  setIsTimerRunning(false);
  
  // Reset all puzzle pieces
  puzzlePiecesRef.current.forEach(piece => {
    piece.position.x = piece.userData.originalPosition.x + (Math.random() - 0.5) * 2;
    piece.position.y = piece.userData.originalPosition.y + (Math.random() - 0.5) * 2;
    piece.position.z = Math.random() * 0.5;
    piece.rotation.z = (Math.random() - 0.5) * 0.5;
    piece.userData.isPlaced = false;
    if (piece.material.uniforms) {
      piece.material.uniforms.correctPosition.value = 0;
    }
  });

  handleResetView();
  
  // Sync with multiplayer if active
  if (gameId) {
    const pieceStates = puzzlePiecesRef.current.map(piece => ({
      position: {
        x: piece.position.x,
        y: piece.position.y,
        z: piece.position.z
      },
      rotation: piece.rotation.z,
      isPlaced: false
    }));
    
    update(ref(database, `games/${gameId}`), {
      state: 'initial',
      puzzle: {
        pieces: pieceStates,
        completedPieces: 0,
        totalPieces: totalPieces
      }
    });
  }
};

// Window Resize Handler
const handleWindowResize = ({
  containerRef,
  cameraRef,
  rendererRef,
  composerRef
}) => {
  if (!containerRef.current || !cameraRef.current || !rendererRef.current) return;
  
  const width = containerRef.current.clientWidth;
  const height = containerRef.current.clientHeight;
  
  cameraRef.current.aspect = width / height;
  cameraRef.current.updateProjectionMatrix();
  
  rendererRef.current.setSize(width, height);
  if (composerRef.current) {
    composerRef.current.setSize(width, height);
  }
};

// React Effects
const useWindowResizeEffect = (handleWindowResize) => {
  useEffect(() => {
    window.addEventListener('resize', handleWindowResize);
    return () => window.removeEventListener('resize', handleWindowResize);
  }, [handleWindowResize]);
};

const useGameCompletionEffect = ({
  progress,
  setIsTimerRunning,
  gameId,
  timeElapsed,
  database
}) => {
  useEffect(() => {
    if (progress === 100) {
      setIsTimerRunning(false);
      if (gameId) {
        update(ref(database, `games/${gameId}`), {
          state: 'completed',
          completionTime: timeElapsed
        });
      }
    }
  }, [progress, gameId, timeElapsed, setIsTimerRunning, database]);
};

// Usage example in component:
/*
const PuzzleGame = () => {
  // ... state and ref declarations ...

  useWindowResizeEffect(() => 
    handleWindowResize({ 
      containerRef, 
      cameraRef, 
      rendererRef, 
      composerRef 
    })
  );

  useGameCompletionEffect({
    progress,
    setIsTimerRunning,
    gameId,
    timeElapsed,
    database
  });

  return (
    // ... JSX ...
  );
};
*/

  return (
    <div className="w-full h-screen flex flex-col bg-gray-900">
      {/* Header with controls */}
      <div className="p-4 bg-gray-800 flex items-center justify-between">
        <div className="flex items-center gap-4">
          {/* Previous controls... */}
            <label className="relative cursor-pointer">
            <input
              type="file"
              accept="image/*"
              onChange={handleImageUpload}
              className="hidden"
            />
            <div className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 
                          rounded-lg text-white transition-colors">
              <Camera className="w-5 h-5" />
              <span>Upload Photo</span>
            </div>
          </label>

          {/* Play/Pause controls */}
          <div className="flex items-center gap-2">
            {gameState !== 'initial' && (
              <button
                onClick={togglePause}
                className="p-2 bg-gray-700 text-white rounded-lg hover:bg-gray-600"
              >
                {gameState === 'playing' ? (
                  <Pause className="w-5 h-5" />
                ) : (
                  <Play className="w-5 h-5" />
                )}
              </button>
            )}
            
            {gameState === 'initial' && (
              <button
                onClick={startGame}
                className="p-2 bg-green-600 text-white rounded-lg hover:bg-green-700"
              >
                <Play className="w-5 h-5" />
              </button>
            )}
          </div>

          {/* Timer display */}
          <div className="flex items-center gap-2 text-white bg-gray-700 px-3 py-1 rounded-lg">
            <Clock className="w-4 h-4" />
            <span>{formatTime(timeElapsed)}</span>
          </div>

          <button className="p-2 text-gray-300 hover:text-white">
            <Info className="w-5 h-5" />
          </button>
          
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
            {/* Main puzzle area */}
      <div className="flex-1 relative">
        <div ref={containerRef} className="w-full h-full" />

        {/* Camera controls overlay */}
        <div className="absolute right-4 top-4 flex flex-col gap-2">
          <button
            onClick={handleZoomIn}
            className="p-2 bg-gray-800 text-white rounded-lg hover:bg-gray-700 transition-colors"
            title="Zoom In"
          >
            <ZoomIn className="w-5 h-5" />
          </button>
          <button
            onClick={handleZoomOut}
            className="p-2 bg-gray-800 text-white rounded-lg hover:bg-gray-700 transition-colors"
            title="Zoom Out"
          >
            <ZoomOut className="w-5 h-5" />
          </button>
          <button
            onClick={handleResetView}
            className="p-2 bg-gray-800 text-white rounded-lg hover:bg-gray-700 transition-colors"
            title="Reset View"
          >
            <Maximize2 className="w-5 h-5" />
          </button>
          <button
            onClick={handleResetGame}
            className="p-2 bg-gray-800 text-white rounded-lg hover:bg-gray-700 transition-colors"
            title="Reset Puzzle"
          >
            <RotateCcw className="w-5 h-5" />
          </button>
          <button
            onClick={() => setShowThumbnail(!showThumbnail)}
            className="p-2 bg-gray-800 text-white rounded-lg hover:bg-gray-700 transition-colors"
            title="Toggle Reference Image"
          >
            <Image className="w-5 h-5" />
          </button>
        </div>

        {/* Loading overlay */}
        {loading && (
          <div className="absolute inset-0 flex items-center justify-center 
                        bg-gray-900 bg-opacity-75 z-10">
            <div className="text-xl text-white">Loading puzzle...</div>
          </div>
        )}

        {/* Thumbnail overlay */}
        {showThumbnail && image && (
          <div className="absolute left-4 top-4 p-2 bg-gray-800 rounded-lg shadow-lg">
            <div className="relative">
              <img
                src={image}
                alt="Reference"
                className="w-48 h-auto rounded border border-gray-600"
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default PuzzleGame;