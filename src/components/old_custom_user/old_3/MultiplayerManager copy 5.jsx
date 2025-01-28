import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass';
import { Camera, Check, Info, Clock, ZoomIn, ZoomOut, Maximize2, RotateCcw, Image, Play, Pause, Users, Share2, LogOut, Home } from 'lucide-react';
import { getStorage, ref as storageRef, uploadBytes, getDownloadURL } from 'firebase/storage';
import { getDatabase, ref as dbRef, set, onValue, update, get } from 'firebase/database';
import { useNavigate } from 'react-router-dom';

// Difficulty presets
const DIFFICULTY_SETTINGS = {
  easy: { grid: { x: 3, y: 2 }, snapDistance: 0.4, rotationEnabled: false },
  medium: { grid: { x: 4, y: 3 }, snapDistance: 0.3, rotationEnabled: true },
  hard: { grid: { x: 5, y: 4 }, snapDistance: 0.2, rotationEnabled: true },
  expert: { grid: { x: 6, y: 5 }, snapDistance: 0.15, rotationEnabled: true }
};

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

// Particle System
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
  
  emit(position, count = 20) {
    for (let i = 0; i < count; i++) {
      this.particles.push({
        position: position.clone(),
        velocity: new THREE.Vector3(
          (Math.random() - 0.5) * 0.2,
          (Math.random() - 0.5) * 0.2,
          Math.random() * 0.2
        ),
        life: 1.0
      });
    }
    this.updateGeometry();
  }
  
  update(deltaTime) {
    this.particles = this.particles.filter(particle => {
      particle.life -= deltaTime;
      particle.position.add(particle.velocity.clone().multiplyScalar(deltaTime));
      return particle.life > 0;
    });
    this.updateGeometry();
  }
  
  updateGeometry() {
    const positions = new Float32Array(this.particles.length * 3);
    this.particles.forEach((particle, i) => {
      positions[i * 3] = particle.position.x;
      positions[i * 3 + 1] = particle.position.y;
      positions[i * 3 + 2] = particle.position.z;
    });
    this.particleSystem.geometry.setAttribute(
      'position',
      new THREE.BufferAttribute(positions, 3)
    );
  }
}

// Shader for puzzle pieces
const puzzlePieceShader = {
  vertexShader: `
    varying vec2 vUv;
    varying vec3 vNormal;
    
    uniform vec2 uvOffset;
    uniform vec2 uvScale;
    
    void main() {
      vUv = uvOffset + uv * uvScale;
      vNormal = normalize(normalMatrix * normal);
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: `
    uniform sampler2D map;
    uniform float selected;
    uniform float correctPosition;
    uniform float time;
    
    varying vec2 vUv;
    varying vec3 vNormal;
    
    void main() {
      vec4 texColor = texture2D(map, vUv);
      vec3 normal = normalize(vNormal);
      vec3 lightDir = normalize(vec3(5.0, 5.0, 5.0));
      float diff = max(dot(normal, lightDir), 0.0);
      
      vec3 highlightColor = vec3(0.3, 0.6, 1.0);
      float highlightStrength = selected * 0.5 * (0.5 + 0.5 * sin(time * 3.0));
      
      vec3 correctColor = vec3(0.2, 1.0, 0.3);
      float correctStrength = correctPosition * 0.5 * (0.5 + 0.5 * sin(time * 2.0));
      
      vec3 finalColor = texColor.rgb * (vec3(0.3) + vec3(0.7) * diff);
      finalColor += highlightColor * highlightStrength + correctColor * correctStrength;
      
      gl_FragColor = vec4(finalColor, texColor.a);
    }
  `
};

const PuzzleGame = ({ puzzleId, gameId, isHost }) => {
  // State management
  const [image, setImage] = useState(null);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [completedPieces, setCompletedPieces] = useState(0);
  const [totalPieces, setTotalPieces] = useState(0);
  const [timeElapsed, setTimeElapsed] = useState(0);
  const [isTimerRunning, setIsTimerRunning] = useState(false);
  const [showThumbnail, setShowThumbnail] = useState(false);
  const [showPlayerList, setShowPlayerList] = useState(true);
  const [ui, setUi] = useState({
    error: null,
    notification: null
  });


  // Firebase setup
  const storage = getStorage();
  const database = getDatabase();
  const navigate = useNavigate();

  // Get user data from localStorage
  const userData = JSON.parse(localStorage.getItem('authUser'));
  const userId = userData?.uid || `user-${Date.now()}`;
  const userName = userData?.displayName || userData?.email || `Player ${Math.floor(Math.random() * 1000)}`;


  // State management includes both original and multiplayer states
  const [gameState, setGameState] = useState({
    gameId: gameId || window.location.pathname.split('/').pop() || `game-${Date.now()}`,
    imageUrl: '',
    isHost: isHost || false,
    difficulty: 3,
    timer: 0,
    imageSize: { width: 0, height: 0 },
    startTime: null,
    lastUpdateTime: null,
    gameStatus: 'waiting' // 'waiting', 'playing', 'paused', 'completed'
  });

  console.log(gameState)

  // Multiplayer states from Code 1
  const [players, setPlayers] = useState({});
  const [pieces, setPieces] = useState([]);
  const [winner, setWinner] = useState(null);
  const [showShareModal, setShowShareModal] = useState(false);


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

  const defaultCameraPosition = { x: 0, y: 0, z: 5 };
  const defaultControlsTarget = new THREE.Vector3(0, 0, 0);
  
  // Initialize Firebase game session
  useEffect(() => {
    const gameRef = dbRef(database, `games/${gameState.gameId}`);
    
    const initializeGame = async () => {
      try {
        const snapshot = await get(gameRef);
        const data = snapshot.val();
        
        if (!data) {
          // New game
          await set(gameRef, {
            players: {
              [userId]: {
                id: userId,
                name: userName,
                score: 0,
                color: `#${Math.floor(Math.random()*16777215).toString(16)}`,
                isHost: true,
                isActive: true,
                lastActive: Date.now()
              }
            },
            imageUrl: '',
            gameStatus: 'waiting',
            timer: 0,
            difficulty: gameState.difficulty,
            startTime: null,
            imageSize: gameState.imageSize,
            pieces: [],
            settings: DIFFICULTY_SETTINGS.medium
          });
          setGameState(prev => ({ ...prev, isHost: true }));
        } else {
          // Join existing game
          if (data.gameStatus !== 'waiting' && !data.players?.[userId]) {
            setUi(prev => ({
              ...prev,
              error: { type: 'error', message: 'Game already in progress' }
            }));
            return;
          }

          const playerUpdate = {
            [`players/${userId}`]: {
              id: userId,
              name: userName,
              score: 0,
              color: `#${Math.floor(Math.random()*16777215).toString(16)}`,
              isHost: false,
              isActive: true,
              lastActive: Date.now()
            }
          };
          await update(gameRef, playerUpdate);

          setGameState(prev => ({
            ...prev,
            difficulty: data.difficulty || 3,
            isHost: data.players?.[userId]?.isHost || false,
            startTime: data.startTime || null,
            imageSize: data.imageSize || { width: 0, height: 0 },
            gameStatus: data.gameStatus
          }));
        }
      } catch (err) {
        console.error('Failed to initialize game:', err);
        setUi(prev => ({
          ...prev,
          error: { type: 'error', message: 'Failed to join game' }
        }));
      }
    };

    // Set up real-time listeners
    const unsubscribe = onValue(gameRef, (snapshot) => {
      const data = snapshot.val();
      if (data) {
        updateGameStateFromSnapshot(data);
      }
    });

    initializeGame();

    // Cleanup
    return () => {
      unsubscribe();
      cleanupGameSession();
    };
  }, [gameState.gameId]);

   // Handle multiplayer piece updates
   // Game state update handler
  const updateGameStateFromSnapshot = (data) => {
    setGameState(prev => ({
      ...prev,
      imageUrl: data.imageUrl || '',
      difficulty: data.difficulty || 3,
      timer: data.timer || 0,
      gameStatus: data.gameStatus || 'waiting'
    }));
    setPlayers(data.players || {});
    setPieces(data.pieces || []);
    updatePuzzlePieces(data.pieces || []);
    handleGameStatusChange(data.gameStatus);
  };

  // Piece movement sync
  const updatePiecePosition = async (piece, position, rotation) => {
    if (!piece || gameState.gameStatus !== 'playing') return;

    try {
      const pieceUpdate = {
        [`games/${gameState.gameId}/pieces/${piece.id}`]: {
          ...piece,
          position: {
            x: position.x,
            y: position.y,
            z: position.z
          },
          rotation: {
            z: rotation.z
          },
          lastUpdatedBy: userId,
          lastUpdateTime: Date.now()
        }
      };
      await update(dbRef(database), pieceUpdate);
    } catch (err) {
      console.error('Failed to update piece position:', err);
    }
  };

  // Player activity tracking
  const updatePlayerActivity = async () => {
    try {
      const updates = {};
      updates[`games/${gameState.gameId}/players/${userId}/lastActive`] = Date.now();
      updates[`games/${gameState.gameId}/players/${userId}/isActive`] = true;
      await update(dbRef(database), updates);
    } catch (err) {
      console.error('Failed to update player activity:', err);
    }
  };

  // Host transfer
  const transferHostStatus = async (newHostId) => {
    try {
      const updates = {};
      // Remove host status from all players
      Object.keys(players).forEach(playerId => {
        updates[`games/${gameState.gameId}/players/${playerId}/isHost`] = false;
      });
      // Set new host
      updates[`games/${gameState.gameId}/players/${newHostId}/isHost`] = true;
      await update(dbRef(database), updates);
    } catch (err) {
      console.error('Failed to transfer host status:', err);
    }
  };

  const checkGameCompletion = async () => {
    if (!pieces.length) return;

    const allPiecesPlaced = pieces.every(piece => piece.isPlaced);
    if (allPiecesPlaced) {
      const winningPlayer = Object.values(players).reduce((highest, current) => {
        return (!highest || current.score > highest.score) ? current : highest;
      }, null);

      try {
        const updates = {
          [`games/${gameState.gameId}/gameStatus`]: 'completed',
          [`games/${gameState.gameId}/winner`]: winningPlayer,
          [`games/${gameState.gameId}/completionTime`]: Date.now()
        };
        await update(dbRef(database), updates);
        setWinner(winningPlayer);
        setShowShareModal(true);
      } catch (err) {
        console.error('Failed to update game completion:', err);
      }
    }
  };

  // Session cleanup
  const cleanupGameSession = async () => {
    try {
      const updates = {};
      updates[`games/${gameState.gameId}/players/${userId}`] = null;

      if (gameState.isHost) {
        // Transfer host status if there are other players
        const otherPlayers = Object.entries(players)
          .filter(([id]) => id !== userId);
        
        if (otherPlayers.length > 0) {
          const [newHostId] = otherPlayers[0];
          await transferHostStatus(newHostId);
        } else {
          // If no other players, remove the game
          await set(dbRef(database, `games/${gameState.gameId}`), null);
        }
      }

      await update(dbRef(database), updates);
    } catch (err) {
      console.error('Error during cleanup:', err);
    }
  };

  // Timer formatting
  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  // Game state management
  const startGame = async () => {
    if (!gameState.isHost) return;

    try {
      const updates = {
        [`games/${gameState.gameId}/gameStatus`]: 'playing',
        [`games/${gameState.gameId}/startTime`]: Date.now(),
        [`games/${gameState.gameId}/timer`]: 0
      };
      await update(dbRef(database), updates);
    } catch (err) {
      console.error('Failed to start game:', err);
    }
  };

  const pauseGame = async () => {
    if (!gameState.isHost) return;

    try {
      const updates = {
        [`games/${gameState.gameId}/gameStatus`]: 'paused',
        [`games/${gameState.gameId}/lastPauseTime`]: Date.now()
      };
      await update(dbRef(database), updates);
    } catch (err) {
      console.error('Failed to pause game:', err);
    }
  };

  const resumeGame = async () => {
    if (!gameState.isHost) return;

    try {
      const updates = {
        [`games/${gameState.gameId}/gameStatus`]: 'playing',
        [`games/${gameState.gameId}/lastResumeTime`]: Date.now()
      };
      await update(dbRef(database), updates);
    } catch (err) {
      console.error('Failed to resume game:', err);
    }
  };

  const PlayerList = () => (
    <div className="absolute left-4 top-4 bg-gray-800 p-4 rounded-lg shadow-lg">
      <h3 className="text-white font-bold mb-2 flex items-center gap-2">
        <Users className="w-4 h-4" />
        Players
      </h3>
      <div className="space-y-2">
        {Object.values(players).map(player => (
          <div 
            key={player.id}
            className="flex items-center gap-2 text-white"
          >
            <div 
              className="w-2 h-2 rounded-full"
              style={{ backgroundColor: player.color }}
            />
            <span>{player.name}</span>
            <span className="ml-auto">{player.score || 0}</span>
            {player.isHost && (
              <span className="text-xs bg-blue-500 px-1 rounded">Host</span>
            )}
          </div>
        ))}
      </div>
    </div>
  );

  const GameControls = () => (
    <div className="absolute bottom-4 left-4 flex gap-2">
      {gameState.isHost && (
        <>
          {gameState.gameStatus === 'waiting' && (
            <button
              onClick={startGame}
              className="p-2 bg-green-600 text-white rounded-lg hover:bg-green-700"
              title="Start Game"
            >
              <Play className="w-5 h-5" />
            </button>
          )}
          {gameState.gameStatus === 'playing' && (
            <button
              onClick={pauseGame}
              className="p-2 bg-yellow-600 text-white rounded-lg hover:bg-yellow-700"
              title="Pause Game"
            >
              <Pause className="w-5 h-5" />
            </button>
          )}
          {gameState.gameStatus === 'paused' && (
            <button
              onClick={resumeGame}
              className="p-2 bg-green-600 text-white rounded-lg hover:bg-green-700"
              title="Resume Game"
            >
              <Play className="w-5 h-5" />
            </button>
          )}
        </>
      )}
    </div>
  );

  const updateGameState = async (newState) => {
    if (!gameId) return;
    
    try {
      await update(ref(database, `games/${gameId}`), {
        ...newState,
        lastUpdated: Date.now()
      });
    } catch (error) {
      console.error('Error updating game state:', error);
    }
  };
  
  // Then modify the togglePause function to use it
  const togglePause = () => {
    if (gameState === 'playing') {
      setGameState('paused');
      setIsTimerRunning(true);
      // if (gameId) {
      //   updateGameState({ state: 'paused' });
      // }
    } else if (gameState === 'paused') {
      setGameState('playing');
      setIsTimerRunning(false);
      if (gameId) {
        updateGameState({ state: 'playing' });
      }
    }
  };

  // const togglePause = () => {
  //   if (gameState === 'playing') {
  //     setGameState('paused');
  //     setIsTimerRunning(false);
  //   } else if (gameState === 'paused') {
  //     setGameState('playing');
  //     setIsTimerRunning(true);
  //   }
  // };

  // Camera controls
  const handleZoomIn = () => {
    if (cameraRef.current) {
      const newZ = Math.max(cameraRef.current.position.z - 1, 2);
      cameraRef.current.position.setZ(newZ);
    }
  };

  const handleZoomOut = () => {
    if (cameraRef.current) {
      const newZ = Math.min(cameraRef.current.position.z + 1, 10);
      cameraRef.current.position.setZ(newZ);
    }
  };

  const handleResetView = () => {
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

  const handleResetGame = () => {
    if (!sceneRef.current || !image) return;
    
    setTimeElapsed(0);
    setCompletedPieces(0);
    setProgress(0);
    setIsTimerRunning(true);
    
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
  };

  // Create placement guides
  const createPlacementGuides = (gridSize, pieceSize) => {
    guideOutlinesRef.current.forEach(guide => sceneRef.current.remove(guide));
    guideOutlinesRef.current = [];

    for (let y = 0; y < gridSize.y; y++) {
      for (let x = 0; x < gridSize.x; x++) {
        const outlineGeometry = new THREE.EdgesGeometry(
          new THREE.PlaneGeometry(pieceSize.x * 0.95, pieceSize.y * 0.95)
        );
        const outlineMaterial = new THREE.LineBasicMaterial({ 
          color: 0x4a90e2,
          transparent: true,
          opacity: 0.5
        });
        const outline = new THREE.LineSegments(outlineGeometry, outlineMaterial);

        outline.position.x = (x - gridSize.x / 2 + 0.5) * pieceSize.x;
        outline.position.y = (y - gridSize.y / 2 + 0.5) * pieceSize.y;
        outline.position.z = -0.01;

        sceneRef.current.add(outline);
        guideOutlinesRef.current.push(outline);
      }
    }
  };

  // Create puzzle pieces
  const createPuzzlePieces = async (imageUrl) => {
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

    setTimeElapsed(0);
    setIsTimerRunning(true);

    // Scramble pieces
    puzzlePiecesRef.current.forEach(piece => {
      piece.position.x += (Math.random() - 0.5) * 2;
      piece.position.y += (Math.random() - 0.5) * 2;
      piece.position.z += Math.random() * 0.5;
      piece.rotation.z = (Math.random() - 0.5) * 0.5;
    });
  };

  // Initialize Three.js scene
  useEffect(() => {
    if (!containerRef.current) return;

    // Scene setup
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x1a1a1a);
    sceneRef.current = scene;

    // Camera setup
    const camera = new THREE.PerspectiveCamera(
      75,
      containerRef.current.clientWidth / containerRef.current.clientHeight,
      0.1,
      1000
    );
    camera.position.z = 5;
    cameraRef.current = camera;

    // Renderer setup
    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true
    });
    renderer.setSize(containerRef.current.clientWidth, containerRef.current.clientHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
    containerRef.current.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    // Post-processing
    const composer = new EffectComposer(renderer);
    composer.addPass(new RenderPass(scene, camera));
    composer.addPass(new UnrealBloomPass(
      new THREE.Vector2(window.innerWidth, window.innerHeight),
      0.5, // Bloom strength
      0.4, // Radius
      0.85 // Threshold
    ));
    composerRef.current = composer;

    // Controls
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.maxDistance = 10;
    controls.minDistance = 2;
    controlsRef.current = controls;

    // Lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.4);
    scene.add(ambientLight);

    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight.position.set(5, 5, 5);
    scene.add(directionalLight);

    // Particle system
    particleSystemRef.current = new ParticleSystem(scene);

    // Animation loop
    const animate = () => {
      requestAnimationFrame(animate);
      
      const deltaTime = clockRef.current.getDelta();
      
      // Update controls
      controls.update();
      
      // Update particles
      particleSystemRef.current.update(deltaTime);
      
      // Update shader uniforms
      puzzlePiecesRef.current.forEach(piece => {
        if (piece.material.uniforms) {
          piece.material.uniforms.time.value = clockRef.current.getElapsedTime();
        }
      });
      
      // Render scene
      composer.render();
    };
    animate();

    // Cleanup
    return () => {
      renderer.dispose();
      containerRef.current?.removeChild(renderer.domElement);
    };
  }, []);

  // Timer effect
  useEffect(() => {
    if (isTimerRunning) {
      timerRef.current = setInterval(() => {
        setTimeElapsed(prev => prev + 1);
      }, 1000);
    }

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    };
  }, [isTimerRunning]);

  // Stop timer when puzzle is complete
  useEffect(() => {
    if (progress === 100) {
      setIsTimerRunning(false);
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    }
  }, [progress]);

  // Handle piece selection and movement
  useEffect(() => {
    if (!rendererRef.current) return;

    const handlePieceMove = (piece, position) => {
      updatePiecePosition(piece, position, piece.rotation);
    };

    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();
    let isDragging = false;
    let dragPlane = new THREE.Plane();
    
    const handleMouseDown = (event) => {
      event.preventDefault();
      
      const rect = rendererRef.current.domElement.getBoundingClientRect();
      mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

      raycaster.setFromCamera(mouse, cameraRef.current);
      const intersects = raycaster.intersectObjects(puzzlePiecesRef.current);

      if (intersects.length > 0) {
        isDragging = true;
        selectedPieceRef.current = intersects[0].object;
        controlsRef.current.enabled = false;

        selectedPieceRef.current.material.uniforms.selected.value = 1.0;
        
        const normal = new THREE.Vector3(0, 0, 1);
        dragPlane.setFromNormalAndCoplanarPoint(
          normal,
          selectedPieceRef.current.position
        );
      }
    };

    const handleMouseMove = (event) => {
      if (!isDragging || !selectedPieceRef.current) return;

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
    };

    const handleMouseUp = () => {
      if (!selectedPieceRef.current) return;

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
      
      selectedPieceRef.current = null;
      isDragging = false;
      controlsRef.current.enabled = true;
    };

    const element = rendererRef.current.domElement;
    element.addEventListener('mousedown', handleMouseDown);
    element.addEventListener('mousemove', handleMouseMove);
    element.addEventListener('mouseup', handleMouseUp);
    element.addEventListener('mouseleave', handleMouseUp);

    return () => {
      element.removeEventListener('mousedown', handleMouseDown);
      element.removeEventListener('mousemove', handleMouseMove);
      element.removeEventListener('mouseup', handleMouseUp);
      element.removeEventListener('mouseleave', handleMouseUp);
    };
  }, [totalPieces]);

  // Handle image upload
  const handleImageUpload = async (event) => {
    if (!gameState.isHost) return;
    
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      setLoading(true);
      const imageRef = storageRef(storage, `puzzle-images/${gameState.gameId}/${file.name}`);
      const snapshot = await uploadBytes(imageRef, file);
      const url = await getDownloadURL(snapshot.ref);
      
      setImage(url);
      const pieces = await createPuzzlePieces(url);
      
      const updates = {
        [`games/${gameState.gameId}/imageUrl`]: url,
        [`games/${gameState.gameId}/pieces`]: pieces,
        [`games/${gameState.gameId}/isGameStarted`]: true,
        [`games/${gameState.gameId}/startTime`]: Date.now()
      };
      
      await update(dbRef(database), updates);
      setLoading(false);
    } catch (err) {
      console.error('Image upload error:', err);
      setLoading(false);
    }
  };

  const copyGameLink = async () => {
    const link = `${window.location.origin}/#/puzzle/multiplayer/${gameState.gameId}`;
    try {
      await navigator.clipboard.writeText(link);
      // You might want to add a UI notification here
      console.log('Game link copied:', link);
    } catch (err) {
      console.error('Failed to copy game link:', err);
    }
  };

  const ShareModal = () => (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white p-6 rounded-lg shadow-xl max-w-md w-full">
        <h3 className="text-xl font-bold mb-4">Share Your Game</h3>
        <div className="space-y-4">
          <button
            onClick={copyGameLink}
            className="w-full p-3 bg-blue-600 text-white rounded hover:bg-blue-700"
          >
            Copy Game Link
          </button>
          {/* Add social share buttons here if needed */}
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

  return (
    <div className="w-full h-screen flex flex-col bg-gray-900">
      {/* Header */}
      <div className="p-4 bg-gray-800 flex items-center justify-between">
        <div className="flex items-center gap-4">
          {gameState.isHost && gameState.gameStatus === 'waiting' && (
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
          )}

          <div className="flex items-center gap-2 text-white bg-gray-700 px-3 py-1 rounded-lg">
            <Clock className="w-4 h-4" />
            <span>{formatTime(timeElapsed)}</span>
          </div>

          {gameState.gameStatus === 'playing' && (
            <div className="text-white">
              {`Progress: ${Math.round(progress)}%`}
            </div>
          )}
        </div>

        <div className="flex gap-2">
          <button
            onClick={() => setShowPlayerList(!showPlayerList)}
            className="p-2 border rounded hover:bg-gray-700 text-white"
            title="Toggle Players"
          >
            <Users className="w-4 h-4" />
          </button>
          
          <button
            onClick={copyGameLink}
            className="p-2 border rounded hover:bg-gray-700 text-white"
            title="Share Game"
          >
            <Share2 className="w-4 h-4" />
          </button>

          <button
            onClick={() => navigate('/')}
            className="p-2 border rounded hover:bg-gray-700 text-white"
            title="Return Home"
          >
            <Home className="w-4 h-4" />
          </button>

          <button
            onClick={async () => {
              await cleanupGameSession();
              navigate('/');
            }}
            className="p-2 border rounded hover:bg-red-600 text-white"
            title="Leave Game"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Main puzzle area */}
      <div className="flex-1 relative">
        <div ref={containerRef} className="w-full h-full" />

        {players && Object.keys(players).length > 0 && (
          <div className="absolute right-4 top-4 bg-gray-800 p-4 rounded-lg">
            <h3 className="text-white font-bold mb-2">Players</h3>
            {Object.values(players).map(player => (
              <div key={player.id} className="flex items-center gap-2 text-white">
                <div className="w-2 h-2 rounded-full" style={{ backgroundColor: player.color }} />
                <span>{player.name}</span>
                <span className="ml-auto">{player.score || 0}</span>
              </div>
            ))}
          </div>
        )}

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
      {winner && <WinnerNotification winner={winner} />}
      {showShareModal && <ShareModal />}
    </div>
  );
};

export default PuzzleGame;