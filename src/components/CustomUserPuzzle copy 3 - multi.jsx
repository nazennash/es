import React, { useEffect, useRef, useState, useCallback } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass';
// import { Camera, Check, Info, Clock, ZoomIn, ZoomOut, Maximize2, RotateCcw, Image } from 'lucide-react';
// import { Camera, Check, Info, Clock, ZoomIn, ZoomOut, Maximize2, RotateCcw, Image, 
//   Play, Pause, Users, Link, Copy } from 'lucide-react';
import { 
    Camera, Check, Info, Clock, ZoomIn, ZoomOut, Maximize2, RotateCcw, Image, 
    Play, Pause, Users, Link, Copy, MessageCircle, CheckCircle2, Trophy
  } from 'lucide-react';
import { database, ref, set, onValue, update, nanoid } from '../firebase';
// import { Camera, Check, Info, Clock, Trophy, Settings, Volume2, VolumeX } from 'lucide-react';

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
    this.renderOrder = 999; // Ensure cursor renders on top
  }
}

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

// Sound effects using Web Audio API
class SoundSystem {
  constructor() {
    this.context = new (window.AudioContext || window.webkitAudioContext)();
    this.sounds = {};
    this.enabled = true;
  }

  async initialize() {
    // Create oscillator-based sound effects
    this.sounds.pickup = this.createToneBuffer(440, 0.1);
    this.sounds.place = this.createToneBuffer(880, 0.15);
    this.sounds.complete = this.createToneBuffer([523.25, 659.25, 783.99], 0.3);
  }

  createToneBuffer(frequency, duration) {
    const sampleRate = this.context.sampleRate;
    const buffer = this.context.createBuffer(1, duration * sampleRate, sampleRate);
    const data = buffer.getChannelData(0);

    // Convert frequency to array if single number
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

// Enhanced particle system with multiple effects
class EnhancedParticleSystem {
  constructor(scene) {
    this.scene = scene;
    this.particleSystems = new Map();
    this.initialize();
  }

  initialize() {
    // Create different particle effects
    this.createParticleSystem('place', {
      size: 0.05,
      count: 30,
      color: 0x4CAF50,
      lifetime: 1.0
    });

    this.createParticleSystem('complete', {
      size: 0.08,
      count: 100,
      color: 0xFFC107,
      lifetime: 2.0
    });

    this.createParticleSystem('trail', {
      size: 0.03,
      count: 50,
      color: 0x2196F3,
      lifetime: 0.5
    });
  }

  createParticleSystem({ size, count, color, lifetime }) {
    const geometry = new THREE.BufferGeometry();
    const material = new THREE.PointsMaterial({
      size,
      map: this.createParticleTexture(),
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      color
    });

    const system = {
      points: new THREE.Points(geometry, material),
      particles: [],
      lifetime
    };

    this.scene.add(system.points);
    return system;
  }

  createParticleTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 32;
    canvas.height = 32;
    const ctx = canvas.getContext('2d');
    
    const gradient = ctx.createRadialGradient(16, 16, 0, 16, 16, 16);
    gradient.addColorStop(0, 'rgba(255,255,255,1)');
    gradient.addColorStop(1, 'rgba(255,255,255,0)');
    
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 32, 32);
    
    const texture = new THREE.Texture(canvas);
    texture.needsUpdate = true;
    return texture;
  }

  emit(type, position, options = {}) {
    const system = this.particleSystems.get(type);
    if (!system) return;

    const count = options.count || system.count;
    for (let i = 0; i < count; i++) {
      const velocity = new THREE.Vector3(
        (Math.random() - 0.5) * options.spread || 0.2,
        (Math.random() - 0.5) * options.spread || 0.2,
        Math.random() * options.spread || 0.2
      );

      system.particles.push({
        position: position.clone(),
        velocity,
        life: system.lifetime
      });
    }
  }

  update(deltaTime) {
    this.particleSystems.forEach(system => {
      system.particles = system.particles.filter(particle => {
        particle.life -= deltaTime;
        particle.position.add(particle.velocity.multiplyScalar(deltaTime));
        return particle.life > 0;
      });

      const positions = new Float32Array(system.particles.length * 3);
      system.particles.forEach((particle, i) => {
        positions[i * 3] = particle.position.x;
        positions[i * 3 + 1] = particle.position.y;
        positions[i * 3 + 2] = particle.position.z;
      });

      system.points.geometry.setAttribute(
        'position',
        new THREE.BufferAttribute(positions, 3)
      );
    });
  }
}

// Replace the existing puzzlePieceShader object with this simpler version
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
      
      // Basic lighting
      vec3 normal = normalize(vNormal);
      vec3 lightDir = normalize(vec3(5.0, 5.0, 5.0));
      float diff = max(dot(normal, lightDir), 0.0);
      
      // Selection highlight
      vec3 highlightColor = vec3(0.3, 0.6, 1.0);
      float highlightStrength = selected * 0.5 * (0.5 + 0.5 * sin(time * 3.0));
      
      // Correct position glow
      vec3 correctColor = vec3(0.2, 1.0, 0.3);
      float correctStrength = correctPosition * 0.5 * (0.5 + 0.5 * sin(time * 2.0));
      
      // Combine lighting
      vec3 finalColor = texColor.rgb * (vec3(0.3) + vec3(0.7) * diff);
      finalColor += highlightColor * highlightStrength + correctColor * correctStrength;
      
      gl_FragColor = vec4(finalColor, texColor.a);
    }
  `
};


// Particle system for visual effects
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

const PuzzleGame = () => {
  const containerRef = useRef(null);
  const [image, setImage] = useState(null);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [completedPieces, setCompletedPieces] = useState(0);
  const [totalPieces, setTotalPieces] = useState(0);
  const [timeElapsed, setTimeElapsed] = useState(0);
  const [isTimerRunning, setIsTimerRunning] = useState(false);
  const timerRef = useRef(null);
  const guideOutlinesRef = useRef([]);
  const [showThumbnail, setShowThumbnail] = useState(false);
  const defaultCameraPosition = { x: 0, y: 0, z: 5 };
  const defaultControlsTarget = new THREE.Vector3(0, 0, 0);

  const [gameState, setGameState] = useState('initial'); // 'initial', 'playing', 'paused'
  const [isMultiplayer, setIsMultiplayer] = useState(false);
  const [gameId, setGameId] = useState(null);
  const [players, setPlayers] = useState({});
  const [localPlayerId] = useState(nanoid());

  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState('');
  const [playerCursors, setPlayerCursors] = useState({});
  const [playerStats, setPlayerStats] = useState({});
  const [playerName, setPlayerName] = useState('');
  const [isReady, setIsReady] = useState(false);
  const [showChat, setShowChat] = useState(false);
  const chatRef = useRef(null);
  const playerColors = useRef({});

  /// multip-player

  // Generate random color for player
  const getPlayerColor = useCallback((playerId) => {
    if (!playerColors.current[playerId]) {
      const hue = Math.random() * 360;
      playerColors.current[playerId] = `hsl(${hue}, 70%, 50%)`;
    }
    return playerColors.current[playerId];
  }, []);

  // Enhanced multiplayer initialization
  const initializeMultiplayerGame = async (gameId, isHost = false) => {
    if (!playerName) {
      const name = prompt('Enter your name:') || 'Player ' + nanoid(4);
      setPlayerName(name);
    }

    const playerData = {
      id: localPlayerId,
      name: playerName || 'Player ' + nanoid(4),
      color: getPlayerColor(localPlayerId),
      isReady: false,
      stats: {
        piecesPlaced: 0,
        lastActive: Date.now()
      }
    };

    if (isHost) {
      await set(ref(database, `games/${gameId}`), {
        state: 'waiting',
        host: localPlayerId,
        settings: {
          difficulty: 'medium',
          allowRotation: true,
          timeLimit: null
        },
        players: {
          [localPlayerId]: playerData
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
        const playerPresenceRef = ref(database, `games/${gameId}/players/${localPlayerId}/presence`);
        onDisconnect(playerPresenceRef).remove();
        set(playerPresenceRef, true);
      }
    });
  };

  // Enhanced piece movement sync
  const syncPieceMovement = useCallback((piece, position, isPlaced = false) => {
    if (!isMultiplayer || !gameId) return;

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

    // Update player stats
    if (isPlaced) {
      const statsRef = ref(database, `games/${gameId}/players/${localPlayerId}/stats`);
      update(statsRef, {
        piecesPlaced: (playerStats[localPlayerId]?.piecesPlaced || 0) + 1,
        lastActive: timestamp
      });
    }
  }, [gameId, isMultiplayer, localPlayerId, playerName, playerStats]);

  // Chat functionality
  const sendMessage = () => {
    if (!newMessage.trim() || !gameId) return;

    const messageRef = ref(database, `games/${gameId}/messages`);
    const timestamp = Date.now();

    push(messageRef, {
      text: newMessage.trim(),
      playerId: localPlayerId,
      playerName: playerName,
      playerColor: getPlayerColor(localPlayerId),
      timestamp
    });

    setNewMessage('');
  };

  // Mouse position sync for cursors
  const syncMousePosition = useCallback((event) => {
    if (!isMultiplayer || !gameId || !containerRef.current) return;

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
  }, [gameId, isMultiplayer, localPlayerId, playerName, getPlayerColor]);

  // Update player cursors
  useEffect(() => {
    if (!isMultiplayer || !gameId) return;

    const cursorsRef = ref(database, `games/${gameId}/cursors`);
    return onValue(cursorsRef, (snapshot) => {
      const cursors = snapshot.val() || {};
      Object.entries(cursors).forEach(([playerId, cursorData]) => {
        if (playerId !== localPlayerId) {
          // Remove stale cursors (inactive for more than 5 seconds)
          if (Date.now() - cursorData.timestamp > 5000) {
            remove(ref(database, `games/${gameId}/cursors/${playerId}`));
            return;
          }

          if (!playerCursors[playerId]) {
            const cursor = new PlayerCursor(cursorData.color);
            sceneRef.current.add(cursor);
            setPlayerCursors(prev => ({ ...prev, [playerId]: cursor }));
          }

          const cursor = playerCursors[playerId];
          if (cursor) {
            cursor.position.set(
              cursorData.position.x * 5, // Scale to match scene size
              cursorData.position.y * 5,
              1
            );
          }
        }
      });
    });
  }, [gameId, isMultiplayer, localPlayerId, playerCursors]);
  
  
  // Three.js references
  const sceneRef = useRef(null);
  const cameraRef = useRef(null);
  const rendererRef = useRef(null);
  const composerRef = useRef(null);
  const controlsRef = useRef(null);
  const clockRef = useRef(new THREE.Clock());
  const particleSystemRef = useRef(null);
  const puzzlePiecesRef = useRef([]);
  const selectedPieceRef = useRef(null);

   // Camera control functions
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

  // Reset game function
  const handleResetGame = () => {
    if (!sceneRef.current || !image) return;
    
    setTimeElapsed(0);
    setCompletedPieces(0);
    setProgress(0);
    setIsTimerRunning(true);
    
    // Scramble pieces again
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

    // Reset camera view
    handleResetView();
  };

  // Timer formatting utility
  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  // Create visual guides for piece placement
  const createPlacementGuides = (gridSize, pieceSize) => {
    // Clear existing guides
    guideOutlinesRef.current.forEach(guide => sceneRef.current.remove(guide));
    guideOutlinesRef.current = [];

    for (let y = 0; y < gridSize.y; y++) {
      for (let x = 0; x < gridSize.x; x++) {
        // Create outline geometry
        const outlineGeometry = new THREE.EdgesGeometry(
          new THREE.PlaneGeometry(pieceSize.x * 0.95, pieceSize.y * 0.95)
        );
        const outlineMaterial = new THREE.LineBasicMaterial({ 
          color: 0x4a90e2,
          transparent: true,
          opacity: 0.5
        });
        const outline = new THREE.LineSegments(outlineGeometry, outlineMaterial);

        // Position the outline
        outline.position.x = (x - gridSize.x / 2 + 0.5) * pieceSize.x;
        outline.position.y = (y - gridSize.y / 2 + 0.5) * pieceSize.y;
        outline.position.z = -0.01; // Slightly behind pieces

        sceneRef.current.add(outline);
        guideOutlinesRef.current.push(outline);
      }
    }
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

  // Create puzzle pieces
  const createPuzzlePieces = async (imageUrl) => {
    if (!sceneRef.current) return;

    // Clear existing pieces
    puzzlePiecesRef.current.forEach(piece => {
      sceneRef.current.remove(piece);
    });
    puzzlePiecesRef.current = [];

    const texture = await new THREE.TextureLoader().loadAsync(imageUrl);
    const aspectRatio = texture.image.width / texture.image.height;
    
    // Define puzzle grid
    const gridSize = { x: 4, y: 3 };
    const pieceSize = {
      x: 1 * aspectRatio / gridSize.x,
      y: 1 / gridSize.y
    };

    setTotalPieces(gridSize.x * gridSize.y);

    // Create placement guides
    createPlacementGuides(gridSize, pieceSize);

    // Generate pieces
    for (let y = 0; y < gridSize.y; y++) {
      for (let x = 0; x < gridSize.x; x++) {
        // Create detailed geometry for relief effect
        const geometry = new THREE.PlaneGeometry(
          pieceSize.x * 0.95,
          pieceSize.y * 0.95,
          32,
          32
        );

        // Create material with custom shader
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
        
        // Set initial position
        piece.position.x = (x - gridSize.x / 2 + 0.5) * pieceSize.x;
        piece.position.y = (y - gridSize.y / 2 + 0.5) * pieceSize.y;
        piece.position.z = 0;

        // Store metadata
        piece.userData.originalPosition = piece.position.clone();
        piece.userData.gridPosition = { x, y };
        piece.userData.isPlaced = false;

        sceneRef.current.add(piece);
        puzzlePiecesRef.current.push(piece);
      }
    }

    // Start timer when pieces are created
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

    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();
    let isDragging = false;
    let dragPlane = new THREE.Plane();
    
    const handleMouseDown = (event) => {
      event.preventDefault();
      
      // Update mouse coordinates
      const rect = rendererRef.current.domElement.getBoundingClientRect();
      mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

      // Check for intersection with pieces
      raycaster.setFromCamera(mouse, cameraRef.current);
      const intersects = raycaster.intersectObjects(puzzlePiecesRef.current);

      if (intersects.length > 0) {
        isDragging = true;
        selectedPieceRef.current = intersects[0].object;
        controlsRef.current.enabled = false;

        // Update selection shader uniform
        selectedPieceRef.current.material.uniforms.selected.value = 1.0;
        
        // Create drag plane
        const normal = new THREE.Vector3(0, 0, 1);
        dragPlane.setFromNormalAndCoplanarPoint(
          normal,
          selectedPieceRef.current.position
        );
      }
    };

    const handleMouseMove = (event) => {
      if (!isDragging || !selectedPieceRef.current) return;

      // Update mouse position
      const rect = rendererRef.current.domElement.getBoundingClientRect();
      mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

      // Update piece position
      raycaster.setFromCamera(mouse, cameraRef.current);
      const intersectPoint = new THREE.Vector3();
      raycaster.ray.intersectPlane(dragPlane, intersectPoint);
      
      // Move piece
      selectedPieceRef.current.position.copy(intersectPoint);
      
      // Check proximity to correct position
      const originalPos = selectedPieceRef.current.userData.originalPosition;
      const distance = originalPos.distanceTo(selectedPieceRef.current.position);
      
      // Visual feedback for proximity
      if (distance < 0.3) {
        selectedPieceRef.current.material.uniforms.correctPosition.value = 
          1.0 - (distance / 0.3);
      } else {
        selectedPieceRef.current.material.uniforms.correctPosition.value = 0.0;
      }
    };

    const handleMouseUp = () => {
      if (!selectedPieceRef.current) return;

      // Check if piece is close to its correct position
      const originalPos = selectedPieceRef.current.userData.originalPosition;
      const distance = originalPos.distanceTo(selectedPieceRef.current.position);

      if (distance < 0.3) {
        // Snap to correct position
        selectedPieceRef.current.position.copy(originalPos);
        selectedPieceRef.current.rotation.z = 0;
        
        if (!selectedPieceRef.current.userData.isPlaced) {
          // Mark as placed and update progress
          selectedPieceRef.current.userData.isPlaced = true;
          setCompletedPieces(prev => {
            const newCount = prev + 1;
            setProgress((newCount / totalPieces) * 100);
            return newCount;
          });

          // Emit particles for celebration
          particleSystemRef.current.emit(selectedPieceRef.current.position, 30);
        }
      }

      // Reset selection state
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
  const handleImageUpload = (event) => {
    const file = event.target.files[0];
    if (!file) return;

    setLoading(true);
    const reader = new FileReader();
    reader.onload = (e) => {
      setImage(e.target.result);
      createPuzzlePieces(e.target.result).then(() => {
        setLoading(false);
        setCompletedPieces(0);
        setProgress(0);
      });
    };
    reader.readAsDataURL(file);
  };


  // added at 21.59
  // Game state management
  const startGame = () => {
    setGameState('playing');
    setIsTimerRunning(true);
  };

  const togglePause = () => {
    if (gameState === 'playing') {
      setGameState('paused');
      setIsTimerRunning(false);
      if (isMultiplayer) {
        updateGameState({ state: 'paused' });
      }
    } else if (gameState === 'paused') {
      setGameState('playing');
      setIsTimerRunning(true);
      if (isMultiplayer) {
        updateGameState({ state: 'playing' });
      }
    }
  };

  // Multiplayer functions
  const createMultiplayerGame = async () => {
    const newGameId = nanoid(6);
    setGameId(newGameId);
    setIsMultiplayer(true);

    const gameRef = ref(database, `games/${newGameId}`);
    await set(gameRef, {
      state: 'initial',
      image: image,
      players: {
        [localPlayerId]: {
          id: localPlayerId,
          pieces: []
        }
      },
      created: Date.now()
    });

    // Copy game link to clipboard
    const gameLink = `${window.location.origin}/puzzle/${newGameId}`;
    navigator.clipboard.writeText(gameLink);
  };

  const joinMultiplayerGame = async (joinGameId) => {
    setGameId(joinGameId);
    setIsMultiplayer(true);

    const gameRef = ref(database, `games/${joinGameId}/players/${localPlayerId}`);
    await set(gameRef, {
      id: localPlayerId,
      pieces: []
    });
  };

  // Firebase real-time updates
  useEffect(() => {
    if (!isMultiplayer || !gameId) return;

    const gameRef = ref(database, `games/${gameId}`);
    const unsubscribe = onValue(gameRef, (snapshot) => {
      const data = snapshot.val();
      if (!data) return;

      // Update game state
      setGameState(data.state);
      setPlayers(data.players || {});

      // Update piece positions if moved by other players
      if (data.pieces) {
        updatePiecePositions(data.pieces);
      }
    });

    return () => unsubscribe();
  }, [isMultiplayer, gameId]);

  // Update piece positions in multiplayer mode
  const updatePiecePositions = (pieces) => {
    if (!puzzlePiecesRef.current) return;

    Object.entries(pieces).forEach(([pieceId, pieceData]) => {
      const piece = puzzlePiecesRef.current.find(p => p.userData.id === pieceId);
      if (piece && pieceData.playerId !== localPlayerId) {
        piece.position.copy(new THREE.Vector3(...pieceData.position));
        piece.userData.isPlaced = pieceData.isPlaced;
      }
    });
  };

  // Sync piece movement to Firebase
  // const syncPieceMovement = (piece) => {
  //   if (!isMultiplayer || !gameId) return;

  //   const pieceRef = ref(database, `games/${gameId}/pieces/${piece.userData.id}`);
  //   set(pieceRef, {
  //     position: [piece.position.x, piece.position.y, piece.position.z],
  //     isPlaced: piece.userData.isPlaced,
  //     playerId: localPlayerId
  //   });
  // };

  

  return (
    <div className="w-full h-screen flex flex-col bg-gray-900">
      {/* Header with controls */}
      <div className="p-4 bg-gray-800 flex items-center justify-between">
        <div className="flex items-center gap-4">

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

          {/* Play/Pause and Multiplayer controls */}
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

          {/* Multiplayer controls */}
          <div className="flex items-center gap-2">
            {!isMultiplayer && (
              <button
                onClick={createMultiplayerGame}
                className="flex items-center gap-2 px-4 py-2 bg-purple-600 
                          hover:bg-purple-700 rounded-lg text-white"
              >
                <Users className="w-5 h-5" />
                <span>Create Multiplayer</span>
              </button>
            )}

            {isMultiplayer && gameId && (
              <div className="flex items-center gap-2">
                <div className="px-3 py-1 bg-gray-700 rounded-lg text-white flex items-center gap-2">
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
            )}
          </div>
        {/* </div> */}

          {/* Timer display */}
          <div className="flex items-center gap-2 text-white bg-gray-700 px-3 py-1 rounded-lg">
            <Clock className="w-4 h-4" />
            <span>{formatTime(timeElapsed)}</span>
          </div>
          
          <button className="p-2 text-gray-300 hover:text-white">
            <Info className="w-5 h-5" />
          </button>
        </div>

        {/* Progress indicator */}
        {totalPieces > 0 && (
          <div className="flex items-center gap-4">
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
          </div>
        )}
      </div>

      {/* Main puzzle area */}
      <div className="flex-1 relative">
      <div className="flex-1 relative" onMouseMove={syncMousePosition}>
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
          {/* Pause overlay */}
          {/* {gameState === 'paused' && (
            <div className="absolute inset-0 bg-black bg-opacity-50 flex items-center 
                          justify-center z-20">
              <div className="text-3xl text-white font-bold">PAUSED</div>
            </div>
          )} */}
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

        {/* Multiplayer sidebar */}
        {isMultiplayer && (
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
        )}
      </div>
    </div>
    </div>
  );
};

export default PuzzleGame;