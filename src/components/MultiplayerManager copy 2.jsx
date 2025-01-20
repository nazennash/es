import React, { useEffect, useRef, useState, useCallback } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass';
import { nanoid } from 'nanoid';
import { 
  Camera, Check, Info, Clock, ZoomIn, ZoomOut, Maximize2, RotateCcw, Image, 
  Play, Pause, Users, Link, Copy, MessageCircle, CheckCircle2, Trophy
} from 'lucide-react';
import { 
  database, 
  ref, 
  set, 
  onValue, 
  update, 
  remove, 
  onDisconnect,
  push 
} from '../firebase';

// Player cursor visualization
class PlayerCursor extends THREE.Mesh {
  constructor(color) {
    const geometry = new THREE.RingGeometry(0.1, 0.12, 32);
    const material = new THREE.MeshBasicMaterial({ 
      color, 
      transparent: true, 
      opacity: 0.7,
      side: THREE.DoubleSide 
    });
    super(geometry, material);
    this.renderOrder = 999;
  }
}

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

const MultiplayerPuzzleGame = () => {

  // Base state (from single player)
  const [image, setImage] = useState(null);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [completedPieces, setCompletedPieces] = useState(0);
  const [totalPieces, setTotalPieces] = useState(0);
  const [timeElapsed, setTimeElapsed] = useState(0);
  const [isTimerRunning, setIsTimerRunning] = useState(false);
  const [gameState, setGameState] = useState('initial');
  const [showThumbnail, setShowThumbnail] = useState(false);

  // Multiplayer specific state
  const [isMultiplayer, setIsMultiplayer] = useState(true);
  const [gameId, setGameId] = useState(null);
  const [playerName, setPlayerName] = useState('');
  const [players, setPlayers] = useState({});
  const [isReady, setIsReady] = useState(false);
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState('');
  const [playerCursors, setPlayerCursors] = useState({});
  const [playerStats, setPlayerStats] = useState({});
  const playerColors = useRef({});

  const userData = JSON.parse(localStorage.getItem('authUser'));
  const userId = userData.uid;
  const userName = userData.displayName || userData.email;

  const user = { 
    id: userId || `user-${Date.now()}`, 
    name: userName || `Player ${Math.floor(Math.random() * 1000)}` 
  };

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
    const chatRef = useRef(null);
  
    const defaultCameraPosition = { x: 0, y: 0, z: 5 };
    const defaultControlsTarget = new THREE.Vector3(0, 0, 0);

  // Generate random color for player
  const getPlayerColor = useCallback((playerId) => {
    if (!playerColors.current[playerId]) {
      const hue = Math.random() * 360;
      playerColors.current[playerId] = `hsl(${hue}, 70%, 50%)`;
    }
    return playerColors.current[playerId];
  }, []);

  // Multiplayer initialization
  const initializeMultiplayerGame = async (gameId, isHost = false) => {
    if (!playerName) {
      const name = prompt('Enter your name:') || 'Player ' + nanoid(4);
      setPlayerName(name);
    }

    const playerData = {
      id: user.id,  // Changed from localPlayerId
      name: user.name,  // Changed from playerName
      color: getPlayerColor(user.id),
      isReady: false,
      stats: {
        piecesPlaced: 0,
        lastActive: Date.now()
      }
    };

    if (isHost) {
      await set(ref(database, `games/${gameId}`), {
        state: 'waiting',
        host: user.id,
        hostName: user.name,
        settings: {
          difficulty: 'medium',
          allowRotation: true,
          timeLimit: null
        },
        players: {
          [user.id]: playerData
        },
        created: Date.now()
      });
    } else {
      await update(ref(database, `games/${gameId}/players`), {
        [localPlayerId]: playerData
      });
    }

    // Set up presence system
    const presenceRef = ref(database, `.info/connected`);
    onValue(presenceRef, (snapshot) => {
      if (snapshot.val()) {
        const playerPresenceRef = ref(
          database, 
          `games/${gameId}/players/${localPlayerId}/presence`
        );
        onDisconnect(playerPresenceRef).remove();
        set(playerPresenceRef, true);
      }
    });
  };

  // Create new multiplayer game
  const createMultiplayerGame = async () => {
    const newGameId = nanoid(6);
    setGameId(newGameId);

    await initializeMultiplayerGame(newGameId, true);

    // Copy game link to clipboard
    const gameLink = `${window.location.origin}/puzzle/${newGameId}`;
    navigator.clipboard.writeText(gameLink);
  };

  // Join existing game
  const joinMultiplayerGame = async (joinGameId) => {
    setGameId(joinGameId);
    await initializeMultiplayerGame(joinGameId, false);
  };

  // Sync piece movement
  const syncPieceMovement = useCallback((piece, position, isPlaced = false) => {
    if (!gameId) return;

    const pieceRef = ref(database, `games/${gameId}/pieces/${piece.userData.id}`);
    const timestamp = Date.now();

    set(pieceRef, {
      position: [position.x, position.y, position.z],
      rotation: piece.rotation.z,
      isPlaced,
      lastUpdated: timestamp,
      playerId: localPlayerId,
      playerName: playerName
    });

    if (isPlaced) {
      const statsRef = ref(
        database, 
        `games/${gameId}/players/${localPlayerId}/stats`
      );
      update(statsRef, {
        piecesPlaced: (playerStats[localPlayerId]?.piecesPlaced || 0) + 1,
        lastActive: timestamp
      });
    }
  }, [gameId, localPlayerId, playerName, playerStats]);

  // Chat functionality
  const sendMessage = () => {
    if (!newMessage.trim() || !gameId) return;

    const messageRef = ref(database, `games/${gameId}/messages`);
    push(messageRef, {
      text: newMessage.trim(),
      playerId: localPlayerId,
      playerName: playerName,
      playerColor: getPlayerColor(localPlayerId),
      timestamp: Date.now()
    });

    setNewMessage('');
  };

  const startGame = () => {
    setGameState('playing');
    setIsTimerRunning(true);
  };

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
      setIsTimerRunning(false);
      if (gameId) {
        updateGameState({ state: 'paused' });
      }
    } else if (gameState === 'paused') {
      setGameState('playing');
      setIsTimerRunning(true);
      if (gameId) {
        updateGameState({ state: 'playing' });
      }
    }
  };

  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

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

  // Mouse position sync for cursors
  const syncMousePosition = useCallback((event) => {
    if (!gameId || !containerRef.current) return;

    const rect = containerRef.current.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    const y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

    const cursorRef = ref(database, `games/${gameId}/cursors/${localPlayerId}`);
    set(cursorRef, {
      position: { x, y },
      playerName,
      color: getPlayerColor(localPlayerId),
      timestamp: Date.now()
    });
  }, [gameId, localPlayerId, playerName, getPlayerColor]);

  // Firebase real-time updates
  useEffect(() => {
    if (!gameId) return;

    const gameRef = ref(database, `games/${gameId}`);
    const unsubscribe = onValue(gameRef, (snapshot) => {
      const data = snapshot.val();
      if (!data) return;

      setGameState(data.state);
      setPlayers(data.players || {});

      if (data.pieces) {
        Object.entries(data.pieces).forEach(([pieceId, pieceData]) => {
          if (pieceData.playerId !== localPlayerId) {
            const piece = puzzlePiecesRef.current?.find(
              p => p.userData.id === pieceId
            );
            if (piece) {
              piece.position.set(...pieceData.position);
              piece.rotation.z = pieceData.rotation;
              piece.userData.isPlaced = pieceData.isPlaced;
            }
          }
        });
      }
    });

    return () => unsubscribe();
  }, [gameId, localPlayerId]);

  // Update player cursors
  useEffect(() => {
    if (!gameId) return;

    const cursorsRef = ref(database, `games/${gameId}/cursors`);
    return onValue(cursorsRef, (snapshot) => {
      const cursors = snapshot.val() || {};
      
      Object.entries(cursors).forEach(([playerId, cursorData]) => {
        if (playerId !== localPlayerId) {
          if (Date.now() - cursorData.timestamp > 5000) {
            remove(ref(database, `games/${gameId}/cursors/${playerId}`));
            return;
          }

          if (!playerCursors[playerId]) {
            const cursor = new PlayerCursor(cursorData.color);
            sceneRef.current?.add(cursor);
            setPlayerCursors(prev => ({ ...prev, [playerId]: cursor }));
          }

          const cursor = playerCursors[playerId];
          if (cursor) {
            cursor.position.set(
              cursorData.position.x * 5,
              cursorData.position.y * 5,
              1
            );
          }
        }
      });
    });
  }, [gameId, localPlayerId, playerCursors]);

  // Chat messages
  useEffect(() => {
    if (!gameId) return;

    const messagesRef = ref(database, `games/${gameId}/messages`);
    return onValue(messagesRef, (snapshot) => {
      const messagesData = snapshot.val();
      if (messagesData) {
        const messagesList = Object.values(messagesData)
          .sort((a, b) => a.timestamp - b.timestamp);
        setMessages(messagesList);
      }
    });
  }, [gameId]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (gameId) {
        remove(ref(database, `games/${gameId}/players/${localPlayerId}`));
        remove(ref(database, `games/${gameId}/cursors/${localPlayerId}`));
      }
    };
  }, [gameId, localPlayerId]);

  // Add these inside the MultiplayerPuzzleGame component:

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
      0.5,
      0.4,
      0.85
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
      
      controls.update();
      particleSystemRef.current.update(deltaTime);
      
      puzzlePiecesRef.current.forEach(piece => {
        if (piece.material.uniforms) {
          piece.material.uniforms.time.value = clockRef.current.getElapsedTime();
        }
      });
      
      composer.render();
    };
    animate();

    // Window resize handler
    const handleResize = () => {
      const width = containerRef.current.clientWidth;
      const height = containerRef.current.clientHeight;

      camera.aspect = width / height;
      camera.updateProjectionMatrix();

      renderer.setSize(width, height);
      composer.setSize(width, height);
    };

    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      renderer.dispose();
      containerRef.current?.removeChild(renderer.domElement);
    };
  }, []);

  // Create placement guides
  const createPlacementGuides = useCallback((gridSize, pieceSize) => {
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
  }, []);

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
        piece.userData.id = `piece_${x}_${y}`;

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
      // Sync initial piece positions for multiplayer
      puzzlePiecesRef.current.forEach(piece => {
        syncPieceMovement(piece, piece.position);
      });
    }
  };

  // Handle piece selection and movement
  useEffect(() => {
    if (!rendererRef.current) return;

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
        const piece = intersects[0].object;
        
        // Check if piece is already claimed by another player in multiplayer
        if (gameId && piece.userData.lastMovedBy && 
            piece.userData.lastMovedBy !== localPlayerId && 
            Date.now() - piece.userData.lastMoveTime < 1000) {
          return;
        }

        isDragging = true;
        selectedPieceRef.current = piece;
        controlsRef.current.enabled = false;

        selectedPieceRef.current.material.uniforms.selected.value = 1.0;
        
        const normal = new THREE.Vector3(0, 0, 1);
        dragPlane.setFromNormalAndCoplanarPoint(normal, piece.position);

        // Mark piece as being moved by this player
        if (gameId) {
          piece.userData.lastMovedBy = localPlayerId;
          piece.userData.lastMoveTime = Date.now();
        }
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

      // Sync piece movement in multiplayer
      if (gameId) {
        syncPieceMovement(selectedPieceRef.current, intersectPoint);
      }
      
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

          // Sync piece placement in multiplayer
          if (gameId) {
            syncPieceMovement(
              selectedPieceRef.current, 
              originalPos, 
              true
            );
          }
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
  }, [gameId, localPlayerId, syncPieceMovement, totalPieces]);

  // Handle image upload
  const handleImageUpload = async (event) => {
    const file = event.target.files[0];
    if (!file) return;

    setLoading(true);
    const reader = new FileReader();

    reader.onload = async (e) => {
      setImage(e.target.result);
      await createPuzzlePieces(e.target.result);

      // Sync image to other players in multiplayer
      if (gameId) {
        await update(ref(database, `games/${gameId}`), {
          image: e.target.result
        });
      }

      setLoading(false);
      setCompletedPieces(0);
      setProgress(0);
    };

    reader.readAsDataURL(file);
  };
  return (
    <div className="w-full h-screen flex flex-col bg-gray-900">
      {/* Game header */}
      <div className="p-4 bg-gray-800 flex items-center justify-between">
        {/* Base controls section */}

<div className="flex items-center gap-4">
  {/* Image upload */}
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

  {/* Progress indicator */}
  <div className="flex flex-col items-end">
    <div className="text-sm text-gray-400">Progress</div>
    <div className="text-lg font-bold text-white">
      {completedPieces} / {totalPieces} pieces
    </div>
  </div>

  <div className="w-32 h-2 bg-gray-700 rounded-full overflow-hidden">
    <div
      className="h-full bg-blue-500 transition-all duration-300"
      style={{ width: `${progress}%` }}
    />
  </div>

  {progress === 100 && (
    <div className="flex items-center gap-2 text-green-400">
      <Check className="w-5 h-5" />
      <span>Complete! - {formatTime(timeElapsed)}</span>
    </div>
  )}

  {/* Camera controls */}
  <div className="flex items-center gap-2">
    <button
      onClick={handleZoomIn}
      className="p-2 bg-gray-700 text-white rounded-lg hover:bg-gray-600"
      title="Zoom In"
    >
      <ZoomIn className="w-5 h-5" />
    </button>
    <button
      onClick={handleZoomOut}
      className="p-2 bg-gray-700 text-white rounded-lg hover:bg-gray-600"
      title="Zoom Out"
    >
      <ZoomOut className="w-5 h-5" />
    </button>
    <button
      onClick={handleResetView}
      className="p-2 bg-gray-700 text-white rounded-lg hover:bg-gray-600"
      title="Reset View"
    >
      <Maximize2 className="w-5 h-5" />
    </button>
  </div>

  {/* Info button */}
  <button 
    className="p-2 text-gray-300 hover:text-white"
    title="Information"
  >
    <Info className="w-5 h-5" />
  </button>
</div>

{/* Divider */}
<div className="h-px bg-gray-700 mx-4" />
        
        {/* Multiplayer controls */}
        <div className="flex items-center gap-2">
          <div className="px-3 py-1 bg-gray-700 rounded-lg text-white 
                         flex items-center gap-2">
            <Users className="w-4 h-4" />
            <span>{Object.keys(players).length} Players</span>
          </div>
          <button
            onClick={() => {
              const gameLink = `${window.location.origin}/puzzle/${gameId}`;
              navigator.clipboard.writeText(gameLink);
            }}
            className="p-2 bg-gray-700 text-white rounded-lg hover:bg-gray-600"
            title="Copy game link"
          >
            <Copy className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Main game area */}
      <div className="flex-1 flex">
        {/* Puzzle canvas */}
        <div className="flex-1 relative" onMouseMove={syncMousePosition}>
          <div ref={containerRef} className="w-full h-full" />
          {/* ... Camera controls, etc. ... */}
        </div>

        {/* Multiplayer sidebar */}
        <div className="w-64 bg-gray-800 p-4 flex flex-col gap-4">
          {/* Players list */}
          <div className="bg-gray-700 rounded-lg p-3">
            <h3 className="text-white font-bold mb-2 flex items-center gap-2">
              <Users className="w-4 h-4" />
              Players
            </h3>
            <div className="space-y-2">
              {Object.entries(players).map(([id, player]) => (
                <div 
                  key={id} 
                  className="flex items-center gap-2 text-sm"
                  style={{ color: player.color }}
                >
                  <div className={`w-2 h-2 rounded-full ${
                    player.presence ? 'bg-green-500' : 'bg-gray-500'
                  }`} />
                  <span>{player.name}</span>
                  {player.isReady && <CheckCircle2 className="w-4 h-4" />}
                  <span className="text-gray-400 text-xs ml-auto">
                    {player.stats?.piecesPlaced || 0} pieces
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Ready button */}
          <button
            onClick={() => {
              setIsReady(!isReady);
              update(ref(database, `games/${gameId}/players/${localPlayerId}`), {
                isReady: !isReady
              });
            }}
            className={`py-2 px-4 rounded-lg transition-colors ${
              isReady 
                ? 'bg-green-600 hover:bg-green-700' 
                : 'bg-blue-600 hover:bg-blue-700'
            } text-white`}
          >
            {isReady ? 'Ready!' : 'Click when ready'}
          </button>

          {/* Chat */}
          <div className="flex-1 flex flex-col bg-gray-700 rounded-lg overflow-hidden">
            <div className="p-2 bg-gray-600 text-white font-bold flex items-center gap-2">
              <MessageCircle className="w-4 h-4" />
              Chat
            </div>
            <div 
              ref={chatRef}
              className="flex-1 p-2 space-y-2 overflow-y-auto"
            >
              {messages.map((msg, i) => (
                <div key={i} className="text-sm">
                  <span 
                    className="font-bold"
                    style={{ color: msg.playerColor }}
                  >
                    {msg.playerName}:
                  </span>
                  <span className="text-white ml-2">{msg.text}</span>
                </div>
              ))}
            </div>
            <div className="p-2 bg-gray-800">
              <input
                type="text"
                value={newMessage}
                onChange={(e) => setNewMessage(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && sendMessage()}
                placeholder="Type a message..."
                className="w-full px-2 py-1 rounded bg-gray-900 text-white 
                         border border-gray-700 focus:border-blue-500 
                         focus:outline-none"
              />
            </div>
          </div>

          {/* Game stats */}
          {progress === 100 && (
            <div className="bg-gray-700 rounded-lg p-3">
              <h3 className="text-white font-bold mb-2 flex items-center gap-2">
                <Trophy className="w-4 h-4" />
                Results
              </h3>
              <div className="space-y-1 text-sm text-white">
                {Object.entries(playerStats)
                  .sort((a, b) => b[1].piecesPlaced - a[1].piecesPlaced)
                  .map(([id, stats], index) => (
                    <div key={id} className="flex items-center gap-2">
                      <span className="text-gray-400">{index + 1}.</span>
                      <span style={{ color: getPlayerColor(id) }}>
                        {players[id]?.name}
                      </span>
                      <span className="ml-auto">
                        {stats.piecesPlaced} pieces
                      </span>
                    </div>
                  ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Overlays */}
      {loading && (
        <div className="absolute inset-0 flex items-center justify-center 
                      bg-gray-900 bg-opacity-75 z-10">
          <div className="text-xl text-white">Loading puzzle...</div>
        </div>
      )}

      {gameState === 'paused' && (
        <div className="absolute inset-0 bg-black bg-opacity-50 flex items-center 
                       justify-center z-20">
          <div className="text-3xl text-white font-bold">PAUSED</div>
        </div>
      )}

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
  );
};

export default MultiplayerPuzzleGame;