// 1. Imports
import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass';
import { Camera, Check, Info, Clock, ZoomIn, ZoomOut, Maximize2, RotateCcw, Image, Play, Pause, Share2, Download } from 'lucide-react';
import html2canvas from 'html2canvas';
import { auth, database } from '../../../firebase';
import { getFirestore, collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { ref, update, getDatabase, onValue, onDisconnect, remove, set, runTransaction, get, increment } from 'firebase/database';
import { motion, AnimatePresence } from 'framer-motion';
import { Tooltip } from 'react-tooltip';
import DifficultyBar, { difficulties } from '../../DifficultyBar';
import { nanoid } from 'nanoid';
import { toast } from 'react-hot-toast';

// Add new UI-specific imports
import { Loader2 } from 'lucide-react';

// 2. Constants
const DIFFICULTY_SETTINGS = {
  easy: { grid: { x: 3, y: 2 }, snapDistance: 0.4, rotationEnabled: false },
  medium: { grid: { x: 4, y: 3 }, snapDistance: 0.3, rotationEnabled: true },
  hard: { grid: { x: 5, y: 4 }, snapDistance: 0.2, rotationEnabled: true },
  expert: { grid: { x: 6, y: 5 }, snapDistance: 0.15, rotationEnabled: true }
};

const ACHIEVEMENTS = [
  { id: 'speed_demon', name: 'Speed Demon', description: 'Complete puzzle under 2 minutes', icon: '⚡' },
  { id: 'perfectionist', name: 'Perfectionist', description: 'Complete without misplacing pieces', icon: '✨' },
  { id: 'persistent', name: 'Persistent', description: 'Complete on expert difficulty', icon: '🏆' }
];

const GAME_STATES = {
  WAITING: 'waiting',
  STARTING: 'starting',
  PLAYING: 'playing',
  PAUSED: 'paused',
  COMPLETED: 'completed'
};

// 3. Helper Classes
class SoundSystem {
  constructor() {
    this.context = null;
    this.sounds = {};
    this.enabled = true;
    this.initialized = false;
  }

  async initializeContext() {
    if (this.initialized) return;
    
    try {
      this.context = new (window.AudioContext || window.webkitAudioContext)();
      await this.context.resume();
      await this.initialize();
      this.initialized = true;
    } catch (error) {
      console.error('Failed to initialize audio context:', error);
    }
  }

  async initialize() {
    if (!this.context) return;
    
    this.sounds.pickup = await this.createToneBuffer(440, 0.1);
    this.sounds.place = await this.createToneBuffer(880, 0.15);
    this.sounds.complete = await this.createToneBuffer([523.25, 659.25, 783.99], 0.3);
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

  async play(soundName) {
    if (!this.enabled || !this.sounds[soundName] || !this.context) return;
    
    // Ensure context is running
    if (this.context.state === 'suspended') {
      await this.context.resume();
    }
    
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

// 4. Shaders
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
    
    // Add hover glow effect
    vec3 addHoverGlow(vec3 color, float hover) {
      vec3 glowColor = vec3(0.4, 0.6, 1.0);
      return mix(color, glowColor, hover * 0.3);
    }
    
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
      
      finalColor = addHoverGlow(finalColor, selected);
      gl_FragColor = vec4(finalColor, texColor.a);
    }
  `
};

// 5. Helper functions (used within component)
const handlePieceSnap = (piece, particleSystem) => {
  const originalPos = piece.userData.originalPosition;
  const duration = 0.3;
  const startPos = piece.position.clone();
  const startTime = Date.now();
  
  const animate = () => {
    const progress = Math.min((Date.now() - startTime) / (duration * 1000), 1);
    const easeProgress = 1 - Math.pow(1 - progress, 3); // Cubic ease-out
    
    piece.position.lerpVectors(startPos, originalPos, easeProgress);
    
    if (progress < 1) {
      requestAnimationFrame(animate);
    } else {
      piece.position.copy(originalPos);
      if (particleSystem) {
        particleSystem.emit(piece.position, 30);
      }
    }
  };
  
  animate();
};

// Add DifficultySelector component
const DifficultySelector = ({ selectedDifficulty, onSelect }) => (
  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
    {difficulties.map((diff) => (
      <button
        key={diff.id}
        onClick={() => onSelect(diff)}
        className={`p-4 rounded-lg border-2 transition-all ${
          selectedDifficulty.id === diff.id
            ? 'border-blue-500 bg-blue-500/10'
            : 'border-gray-700 hover:border-blue-400'
        }`}
      >
        <h3 className="text-lg font-bold text-white">{diff.name}</h3>
        <p className="text-sm text-gray-400">{diff.description}</p>
        <div className="mt-2 text-xs text-gray-500">
          Grid: {diff.grid.x}x{diff.grid.y}
        </div>
      </button>
    ))}
  </div>
);

// Add UI enhancement components
const LoadingOverlay = ({ message = "Loading..." }) => (
  <motion.div
    initial={{ opacity: 0 }}
    animate={{ opacity: 1 }}
    exit={{ opacity: 0 }}
    className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50"
  >
    <div className="flex flex-col items-center gap-4">
      <Loader2 className="w-12 h-12 text-blue-500 animate-spin" />
      <p className="text-white text-lg font-medium">{message}</p>
    </div>
  </motion.div>
);

const PlayerCard = ({ player, score, isCurrentPlayer }) => (
  <motion.div
    initial={{ opacity: 0, y: 20 }}
    animate={{ opacity: 1, y: 0 }}
    className={`p-3 rounded-lg ${
      isCurrentPlayer ? 'bg-blue-600/20 border border-blue-500/50' : 'bg-gray-800/50'
    }`}
  >
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-2">
        <div className={`w-2 h-2 rounded-full ${
          player.status === 'online' ? 'bg-green-500' : 'bg-gray-500'
        }`} />
        <span className="text-white font-medium">{player.name}</span>
        {player.isHost && (
          <span className="px-2 py-0.5 bg-blue-600/50 rounded text-xs text-blue-200">Host</span>
        )}
      </div>
      <span className="text-gray-300">{score} pieces</span>
    </div>
  </motion.div>
);

// 6. Main Component
const PuzzleGame = ({ gameId: propGameId, isMultiPlayer, user }) => {
  // State declarations
  const [image, setImage] = useState(null);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [completedPieces, setCompletedPieces] = useState(0);
  const [totalPieces, setTotalPieces] = useState(0);
  const [timeElapsed, setTimeElapsed] = useState(0);
  const [isTimerRunning, setIsTimerRunning] = useState(false);
  const [gameState, setGameState] = useState('initial'); // 'initial', 'playing', 'paused'
  const [showThumbnail, setShowThumbnail] = useState(false);
  const [showShareModal, setShowShareModal] = useState(false);
  const [showDifficultyModal, setShowDifficultyModal] = useState(false); // Add this
  const [startTime, setStartTime] = useState(null);
  const [difficulty, setDifficulty] = useState('easy');
  const [gameId, setGameId] = useState(null);
  const [completedAchievements, setCompletedAchievements] = useState([]);
  const [selectedDifficulty, setSelectedDifficulty] = useState(difficulties[0]);
  const [players, setPlayers] = useState({});
  const [gameRef] = useState(ref(database, `games/${gameId}`));
  const [roomCode, setRoomCode] = useState(propGameId || null);
  const [isHost, setIsHost] = useState(false);
  const [playerScores, setPlayerScores] = useState({});
  const [lockedPieces, setLockedPieces] = useState({});
  const [otherPlayerCursors, setOtherPlayerCursors] = useState({});
  const [inviteLink, setInviteLink] = useState('');
  const [isCompetitive, setIsCompetitive] = useState(false);
  const [leaderboard, setLeaderboard] = useState([]);
  const [roomRef] = useState(ref(database, `rooms/${roomCode}`));

  console.log("Roomcode", roomCode);

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
  const puzzleContainerRef = useRef(null);
  const soundRef = useRef(null);

  const defaultCameraPosition = { x: 0, y: 0, z: 5 };
  const defaultControlsTarget = new THREE.Vector3(0, 0, 0);

  // Helper functions
  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const startGame = async () => {
    if (!image) {
      alert('Please upload an image first');
      return;
    }
    
    // Initialize audio on game start
    await initializeAudio();
    
    setGameState('playing');
    setIsTimerRunning(true);
    setStartTime(Date.now());
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
  
    // Increase the size of guides (using 98% of piece size for visual gap)
    for (let y = 0; y < gridSize.y; y++) {
      for (let x = 0; x < gridSize.x; x++) {
        const outlineGeometry = new THREE.EdgesGeometry(
          new THREE.PlaneGeometry(pieceSize.x * 0.98, pieceSize.y * 0.98)
        );
        const outlineMaterial = new THREE.LineBasicMaterial({ 
          color: 0x4a90e2,
          transparent: true,
          opacity: 0.5,
          linewidth: 2 // Note: linewidth may not work in WebGL
        });
        const outline = new THREE.LineSegments(outlineGeometry, outlineMaterial);
  
        // Position guides with proper spacing
        outline.position.x = (x - (gridSize.x - 1) / 2) * pieceSize.x;
        outline.position.y = (y - (gridSize.y - 1) / 2) * pieceSize.y;
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
    
    // Adjust base size to be larger
    const baseSize = 2.0; // Increased from default size
    
    const gridSize = selectedDifficulty.grid; // Reduced number of pieces for larger size
    const pieceSize = {
      x: (baseSize * aspectRatio) / gridSize.x,
      y: baseSize / gridSize.y
    };
  
    setTotalPieces(gridSize.x * gridSize.y);
    createPlacementGuides(gridSize, pieceSize);
  
    for (let y = 0; y < gridSize.y; y++) {
      for (let x = 0; x < gridSize.x; x++) {
        const geometry = new THREE.PlaneGeometry(
          pieceSize.x * 0.98, // Slightly smaller than guide for visual gap
          pieceSize.y * 0.98,
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
        
        // Position pieces with proper spacing
        piece.position.x = (x - (gridSize.x - 1) / 2) * pieceSize.x;
        piece.position.y = (y - (gridSize.y - 1) / 2) * pieceSize.y;
        piece.position.z = 0;
  
        piece.userData.originalPosition = piece.position.clone();
        piece.userData.gridPosition = { x, y };
        piece.userData.isPlaced = false;
  
        sceneRef.current.add(piece);
        puzzlePiecesRef.current.push(piece);
      }
    }
  
    // Adjust camera position for better view of larger pieces
    if (cameraRef.current) {
      cameraRef.current.position.z = 6; // Moved camera back to show larger pieces
    }
  
    // Scramble pieces with wider distribution
    puzzlePiecesRef.current.forEach(piece => {
      piece.position.x += (Math.random() - 0.5) * 4; // Increased scatter range
      piece.position.y += (Math.random() - 0.5) * 4;
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
      if (!particleSystemRef.current) return;

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
      synchronousCompletion();
    }
  }, [progress]);

  // Handle piece selection and movement
  useEffect(() => {
    if (!rendererRef.current || !sceneRef.current || !cameraRef.current) return;

    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();
    let isDragging = false;
    const dragPlane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
    const intersection = new THREE.Vector3();
    const offset = new THREE.Vector3();
    
    const handleMouseDown = (event) => {
      // Prevent interaction if game is not in playing state
      if (gameState !== 'playing') return;
      
      event.preventDefault();
      
      // Calculate mouse position in normalized device coordinates
      const rect = rendererRef.current.domElement.getBoundingClientRect();
      mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

      // Update the picking ray with the camera and mouse position
      raycaster.setFromCamera(mouse, cameraRef.current);

      // Find intersected objects
      const intersects = raycaster.intersectObjects(puzzlePiecesRef.current);

      if (intersects.length > 0) {
        const piece = intersects[0].object;
        
        // Skip if piece is already placed
        if (piece.userData.isPlaced) return;

        isDragging = true;
        selectedPieceRef.current = piece;
        controlsRef.current.enabled = false;

        // Calculate the intersection point on the drag plane
        raycaster.ray.intersectPlane(dragPlane, intersection);
        
        // Store offset for smooth dragging
        offset.copy(piece.position).sub(intersection);

        // Update shader uniforms
        if (piece.material.uniforms) {
          piece.material.uniforms.selected.value = 1.0;
        }

        // Bring piece to front
        piece.position.z = 0.1;
      }
    };

    const handleMouseMove = (event) => {
      // Prevent interaction if game is not in playing state
      if (gameState !== 'playing') return;
      
      if (!isDragging || !selectedPieceRef.current) return;

      // Update mouse position
      const rect = rendererRef.current.domElement.getBoundingClientRect();
      mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

      // Update the picking ray and find intersection with drag plane
      raycaster.setFromCamera(mouse, cameraRef.current);
      raycaster.ray.intersectPlane(dragPlane, intersection);

      // Update piece position with offset
      selectedPieceRef.current.position.copy(intersection.add(offset));
      
      // Check distance to original position for snapping feedback
      const originalPos = selectedPieceRef.current.userData.originalPosition;
      const distance = originalPos.distanceTo(selectedPieceRef.current.position);
      
      // Update shader feedback
      if (selectedPieceRef.current.material.uniforms) {
        if (distance < 0.3) {
          selectedPieceRef.current.material.uniforms.correctPosition.value = 
            1.0 - (distance / 0.3);
        } else {
          selectedPieceRef.current.material.uniforms.correctPosition.value = 0.0;
        }
      }
    };

    const handlePieceComplete = async (piece) => {
      if (!piece) return;
      
      // Ensure audio is initialized
      await initializeAudio();
      
      // Play sound effect
      soundRef.current?.play('place');
      
      // Visual effects
      particleSystemRef.current?.emit(piece.position, 30);
      
      // Add ripple effect
      const ripple = new THREE.Mesh(
        new THREE.CircleGeometry(0.1, 32),
        new THREE.MeshBasicMaterial({
          color: 0x4a90e2,
          transparent: true,
          opacity: 0.5
        })
      );
      
      ripple.position.copy(piece.position);
      ripple.position.z = 0.01;
      sceneRef.current.add(ripple);
    
      // Animate ripple
      const animate = () => {
        const scale = ripple.scale.x + 0.05;
        ripple.scale.set(scale, scale, 1);
        ripple.material.opacity -= 0.02;
        
        if (ripple.material.opacity > 0) {
          requestAnimationFrame(animate);
        } else {
          sceneRef.current.remove(ripple);
        }
      };
      
      animate();
  
      if (gameId) {
        update(ref(database, `games/${gameId}/scores/${auth.currentUser.uid}`), {
          piecesPlaced: increment(1),
          lastPlaced: serverTimestamp()
        });
      }
    };

    const handleMouseUp = () => {
      // Allow mouseUp to work even if not playing, to ensure cleanup
      if (!selectedPieceRef.current) return;
      
      // Reset piece state and position if game is not in playing mode
      if (gameState !== 'playing') {
        if (selectedPieceRef.current.material.uniforms) {
          selectedPieceRef.current.material.uniforms.selected.value = 0.0;
          selectedPieceRef.current.material.uniforms.correctPosition.value = 
            selectedPieceRef.current.userData.isPlaced ? 1.0 : 0.0;
        }
        selectedPieceRef.current.position.z = 0;
        selectedPieceRef.current = null;
        isDragging = false;
        controlsRef.current.enabled = true;
        return;
      }
      
      // Check if piece is close enough to its correct position
      const originalPos = selectedPieceRef.current.userData.originalPosition;
      const distance = originalPos.distanceTo(selectedPieceRef.current.position);

      if (distance < 0.3) {
        // Snap to position
        handlePieceSnap(selectedPieceRef.current, particleSystemRef.current);
        
        if (!selectedPieceRef.current.userData.isPlaced) {
          selectedPieceRef.current.userData.isPlaced = true;
          setCompletedPieces(prev => {
            const newCount = prev + 1;
            setProgress((newCount / totalPieces) * 100);
            return newCount;
          });
          handlePieceComplete(selectedPieceRef.current);
        }
      }

      // Reset piece state
      if (selectedPieceRef.current.material.uniforms) {
        selectedPieceRef.current.material.uniforms.selected.value = 0.0;
        selectedPieceRef.current.material.uniforms.correctPosition.value = 
          selectedPieceRef.current.userData.isPlaced ? 1.0 : 0.0;
      }

      // Reset z-position if not placed
      if (!selectedPieceRef.current.userData.isPlaced) {
        selectedPieceRef.current.position.z = 0;
      }
      
      // Clear selection and re-enable controls
      selectedPieceRef.current = null;
      isDragging = false;
      controlsRef.current.enabled = true;
    };

    // Add event listeners
    const element = rendererRef.current.domElement;
    element.addEventListener('mousedown', handleMouseDown);
    element.addEventListener('mousemove', handleMouseMove);
    element.addEventListener('mouseup', handleMouseUp);
    element.addEventListener('mouseleave', handleMouseUp);

    // Add cursor tracking
    element.addEventListener('mousemove', handleCursorTracking);

    // Cleanup
    return () => {
      element.removeEventListener('mousedown', handleMouseDown);
      element.removeEventListener('mousemove', handleMouseMove);
      element.removeEventListener('mouseup', handleMouseUp);
      element.removeEventListener('mouseleave', handleMouseUp);
      element.removeEventListener('mousemove', handleCursorTracking);
    };
  }, [gameState, totalPieces]);

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
        // setGameState('initial'); // Reset to initial state
        setGameState('playing'); // Reset to initial state
        setIsTimerRunning(true);
        // setIsTimerRunning(false);
        setCompletedPieces(0);
        setProgress(0);
        setTimeElapsed(0);
        // Reset any existing timer
        if (timerRef.current) {
          clearInterval(timerRef.current);
        }
      });
    };
    reader.readAsDataURL(file);
  };

  const capturePuzzleImage = async () => {
    if (!puzzleContainerRef.current) return null;
    try {
      const canvas = await html2canvas(puzzleContainerRef.current);
      return canvas.toDataURL('image/png');
    } catch (err) {
      console.error('Failed to capture puzzle image:', err);
      return null;
    }
  };
  
  const downloadPuzzleImage = async () => {
    const imageData = await capturePuzzleImage();
    if (!imageData) return;
  
    const link = document.createElement('a');
    link.href = imageData;
    link.download = `custom-puzzle-${Date.now()}.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };
  
  const shareToFacebook = () => {
    const url = encodeURIComponent(window.location.href);
    const text = encodeURIComponent(`I just completed a custom puzzle in ${formatTime(timeElapsed)}! Try creating your own!`);
    window.open(`https://www.facebook.com/sharer/sharer.php?u=${url}&quote=${text}`, '_blank');
  };
  
  const shareToTwitter = () => {
    const url = encodeURIComponent(window.location.href);
    const text = encodeURIComponent(`I just completed a custom puzzle in ${formatTime(timeElapsed)}! #PuzzleGame`);
    window.open(`https://twitter.com/intent/tweet?url=${url}&text=${text}`, '_blank');
  };
  
  const shareToWhatsApp = () => {
    const url = encodeURIComponent(window.location.href);
    const text = encodeURIComponent(`I just completed a custom puzzle in ${formatTime(timeElapsed)}! Create yours: `);
    window.open(`https://wa.me/?text=${text}%20${url}`, '_blank');
  };

  const ShareModal = () => (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50"
    >
      <div className="bg-gray-800 p-6 rounded-xl shadow-xl max-w-md w-full mx-4">
        <h3 className="text-xl font-bold mb-4 text-white">Share Your Achievement</h3>
        <div className="space-y-4">
          <button
            onClick={shareToFacebook}
            className="w-full p-3 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors"
          >
            Share on Facebook
          </button>
          <button
            onClick={shareToTwitter}
            className="w-full p-3 bg-sky-400 text-white rounded hover:bg-sky-500 transition-colors"
          >
            Share on Twitter
          </button>
          <button
            onClick={shareToWhatsApp}
            className="w-full p-3 bg-green-500 text-white rounded hover:bg-green-600 transition-colors"
          >
            Share on WhatsApp
          </button>
          <button
            onClick={downloadPuzzleImage}
            className="w-full p-3 bg-gray-700 text-white rounded hover:bg-gray-600 transition-colors flex items-center justify-center gap-2"
          >
            <Download className="h-4 w-4" /> Download Image
          </button>
        </div>
        <button
          onClick={() => setShowShareModal(false)}
          className="mt-4 w-full p-2 border border-gray-600 text-white rounded hover:bg-gray-700 transition-colors"
        >
          Close
        </button>
      </div>
    </motion.div>
  );

  // Add this handler
  const handleDifficultyChange = (newDifficulty) => {
    if (gameState === 'playing') {
      const confirmChange = window.confirm('Changing difficulty will reset the current puzzle. Continue?');
      if (!confirmChange) return;
    }
    
    setSelectedDifficulty(newDifficulty);
    setDifficulty(newDifficulty.id);
    if (image) {
      setLoading(true);
      createPuzzlePieces(image).then(() => {
        setLoading(false);
        setGameState('playing');
        setIsTimerRunning(true);
        setCompletedPieces(0);
        setProgress(0);
        setTimeElapsed(0);
      });
    }
    setShowDifficultyModal(false);
  };

  // Add this function inside the component
  // const handlePuzzleCompletion = async (puzzleData) => {
  //   if (!auth.currentUser) return;
    
  //   try {
  //     const db = getFirestore();
  //     await addDoc(collection(db, 'completed_puzzles'), {
  //       ...puzzleData,
  //       completedAt: serverTimestamp()
  //     });
  //   } catch (error) {
  //     console.error('Error saving puzzle completion:', error);
  //   }
  // };

  // Modify the completion effect
  useEffect(() => {
    if (progress === 100 && auth?.currentUser) {
      const completionData = {
        puzzleId: `custom_${Date.now()}`,
        userId: auth.currentUser.uid,
        playerName: auth.currentUser.displayName || 'Anonymous',
        startTime,
        difficulty,
        imageUrl: image,
        timer: timeElapsed,
        completedAt: new Date(),
        totalPieces,
        completedPieces
      };
      
      console.log('Puzzle Completion Data:', completionData);
      handlePuzzleCompletion(completionData);
      
      // Log achievement data
      const achievements = checkAchievements();
      console.log('Achievements Earned:', achievements);
      
      // Update game state
      if (gameId) {
        const gameUpdateData = {
          state: 'completed',
          completionTime: timeElapsed,
          achievements: achievements.map(a => a.id)
        };
        console.log('Game State Update:', gameUpdateData);
        updateGameState(gameUpdateData);
      }
    }
  }, [progress, startTime, difficulty, image, timeElapsed, totalPieces, completedPieces]);

  // Add synchronous completion handler
  const synchronousCompletion = async () => {
    try {
      console.log('Starting synchronous completion process...');
      
      // Wait for puzzle completion
      await handlePuzzleCompletion({
        puzzleId: `custom_${Date.now()}`,
        userId: auth?.currentUser?.uid,
        playerName: auth?.currentUser?.displayName || 'Anonymous',
        startTime,
        difficulty,
        imageUrl: image,
        timer: timeElapsed
      });
      
      // Wait for achievements check
      const achievements = checkAchievements();
      console.log('Processing achievements:', achievements);
      
      // Wait for game state update
      if (gameId) {
        await updateGameState({
          state: 'completed',
          completionTime: timeElapsed,
          achievements: achievements.map(a => a.id)
        });
      }
      
      console.log('Completion process finished successfully');
      setShowShareModal(true);
    } catch (error) {
      console.error('Error in completion process:', error);
    }
  };

  // Add sound initialization
  useEffect(() => {
    const soundSystem = new SoundSystem();
    soundRef.current = soundSystem;
    
    // Cleanup
    return () => {
      if (soundRef.current?.context) {
        soundRef.current.context.close();
      }
    };
  }, []);

  // Add sound initialization on first interaction
  const initializeAudio = async () => {
    if (soundRef.current && !soundRef.current.initialized) {
      await soundRef.current.initializeContext();
    }
  };

  // Add mouse interaction handling
  const setupMouseInteraction = () => {
    if (!rendererRef.current || !sceneRef.current || !cameraRef.current) return;
  
    const handlePieceInteraction = async (event, piece) => {
      if (!piece || piece.userData.isPlaced) return;
      
      // Ensure audio is initialized on first interaction
      await initializeAudio();
      
      // Update piece visual feedback
      if (piece.material.uniforms) {
        piece.material.uniforms.selected.value = 1.0;
      }
      
      // Play sound effect
      soundRef.current?.play('pickup');
    };
  
    // ... rest of mouse handling code ...
  };

  // Add achievement handling
  const checkAchievements = () => {
    const achievements = [];
    
    // Speed Demon achievement
    if (timeElapsed < 120) {
      achievements.push(ACHIEVEMENTS.find(a => a.id === 'speed_demon'));
    }
    
    // Perfectionist achievement
    if (!puzzlePiecesRef.current.some(p => p.userData.misplaced)) {
      achievements.push(ACHIEVEMENTS.find(a => a.id === 'perfectionist'));
    }
    
    // Persistent achievement
    if (difficulty === 'expert') {
      achievements.push(ACHIEVEMENTS.find(a => a.id === 'persistent'));
    }
    
    return achievements;
  };

  // Modify puzzle completion handler
  const handlePuzzleCompletion = async (completionData) => {
    if (!auth.currentUser) return;
    
    const achievements = checkAchievements();
    const db = getFirestore();
    
    try {
      await addDoc(collection(db, 'completed_puzzles'), {
        userId: auth.currentUser.uid,
        puzzleId: gameId,
        timeElapsed,
        difficulty,
        completedAt: serverTimestamp(),
        achievements: achievements.map(a => a.id)
      });
      
      // Play completion sound
      soundRef.current?.play('complete');
      
      // Show achievements
      setCompletedAchievements(achievements);
      
    } catch (error) {
      console.error('Error saving completion:', error);
    }
  };

  // Add game state management
  const initializeGameState = async () => {
    if (!auth.currentUser) return;
    
    const db = getDatabase();
    const gameRef = ref(db, `games/${gameId}`);
    
    try {
      await update(gameRef, {
        createdAt: serverTimestamp(),
        userId: auth.currentUser.uid,
        difficulty,
        state: 'initial'
      });
    } catch (error) {
      console.error('Error initializing game:', error);
    }
  };

  // Consolidated handlePieceMove implementation
  const handlePieceMove = (piece, position) => {
    if (!piece.id || (!gameId && !roomCode)) return;
    
    const pieceRef = ref(database, `${gameId ? 'games' : 'rooms'}/${gameId || roomCode}/pieces/${piece.id}`);
    
    runTransaction(pieceRef, (currentData) => {
      // Check if piece is locked by another player
      if (currentData?.lockedBy && currentData.lockedBy !== auth.currentUser.uid) {
        return; // Abort if locked by another player
      }
      
      // Check for newer updates
      if (currentData && currentData.timestamp > (piece.lastUpdate || 0)) {
        return; // Abort if newer update exists
      }
      
      return {
        position: {
          x: position.x,
          y: position.y,
          z: position.z
        },
        lockedBy: auth.currentUser.uid,
        lastMovedBy: auth.currentUser.uid,
        timestamp: serverTimestamp(),
        lastUpdate: Date.now()
      };
    }).catch(error => {
      console.error('Error updating piece position:', error);
    });
  };

  // Implement proper multiplayer initialization
  const initializeMultiplayer = async () => {
    if (!auth.currentUser) return;
    
    const newGameId = nanoid();
    setGameId(newGameId);
    
    const gameRef = ref(database, `games/${newGameId}`);
    await set(gameRef, {
      createdAt: serverTimestamp(),
      hostId: auth.currentUser.uid,
      status: GAME_STATES.WAITING,
      difficulty,
      imageUrl: image,
      players: {
        [auth.currentUser.uid]: {
          name: auth.currentUser.displayName || 'Anonymous',
          isHost: true,
          status: PLAYER_STATUS.ONLINE
        }
      }
    });
    
    // Setup presence system
    const presenceRef = ref(database, `.info/connected`);
    onValue(presenceRef, (snapshot) => {
      if (snapshot.val()) {
        const playerRef = ref(database, `games/${newGameId}/players/${auth.currentUser.uid}`);
        onDisconnect(playerRef).update({
          status: PLAYER_STATUS.OFFLINE,
          lastSeen: serverTimestamp()
        });
      }
    });
    
    return newGameId;
  };

  // Add proper cursor tracking
  const handleCursorTracking = (event) => {
    if (!gameId || !auth.currentUser || !containerRef.current) return;
    
    const rect = containerRef.current.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    const y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    
    const cursorRef = ref(database, `games/${gameId}/cursors/${auth.currentUser.uid}`);
    set(cursorRef, {
      x,
      y,
      timestamp: serverTimestamp(),
      playerName: auth.currentUser.displayName || 'Anonymous'
    });
    
    // Remove cursor data on disconnect
    onDisconnect(cursorRef).remove();
  };

  // Add this effect for real-time player sync
  useEffect(() => {
    if (!gameId) return;
  
    onValue(ref(database, `games/${gameId}/players`), (snapshot) => {
      if (snapshot.exists()) {
        setPlayers(snapshot.val());
      }
    });
  
    // Register current player
    const playerRef = ref(database, `games/${gameId}/players/${auth.currentUser.uid}`);
    set(playerRef, {
      id: auth.currentUser.uid,
      name: auth.currentUser.displayName || 'Anonymous',
      lastActive: Date.now()
    });
  
    // Remove player on disconnect
    onDisconnect(playerRef).remove();
  
    return () => {
      remove(playerRef);
    };
  }, [gameId]);
  
  // Modify piece movement handling to sync with other players
  // const handlePieceMove = (piece, position) => {
  //   if (!gameId || !piece.id) return;
    
  //   const pieceRef = ref(database, `games/${gameId}/pieces/${piece.id}`);
  //   runTransaction(pieceRef, (currentData) => {
  //     if (currentData && currentData.timestamp > (piece.lastUpdate || 0)) {
  //       return undefined; // Abort if newer update exists
  //     }
      
  //     return {
  //       position: {
  //         x: position.x,
  //         y: position.y,
  //         z: position.z
  //       },
  //       lastMovedBy: auth.currentUser.uid,
  //       timestamp: serverTimestamp(),
  //       lastUpdate: Date.now()
  //     };
  //   });
  // };
  
  // Add piece sync effect
  useEffect(() => {
    if (!gameId) return;
  
    onValue(ref(database, `games/${gameId}/pieces`), (snapshot) => {
      if (!snapshot.exists()) return;
      
      const pieces = snapshot.val();
      puzzlePiecesRef.current.forEach(piece => {
        if (pieces[piece.id] && !piece.userData.isPlaced) {
          const pieceData = pieces[piece.id];
          piece.position.set(
            pieceData.position.x,
            pieceData.position.y,
            pieceData.position.z
          );
        }
      });
    });
  }, [gameId]);

  // Add these new functions after the existing helper functions
  const createRoom = async () => {
    const newRoomCode = nanoid(6);
    const roomRef = ref(database, `rooms/${newRoomCode}`);
    await set(roomRef, {
      hostId: auth.currentUser.uid,
      created: serverTimestamp(),
      imageUrl: image,
      difficulty,
      status: 'waiting',
      maxPlayers: 4 // Add configurable max players
    });
    setRoomCode(newRoomCode);
    setIsHost(true);
    setInviteLink(generateInviteLink(newRoomCode));
    return newRoomCode;
  };

  const joinRoom = async (code) => {
    const roomRef = ref(database, `rooms/${code}`);
    const snapshot = await get(roomRef);
    if (!snapshot.exists()) {
      throw new Error('Room not found');
    }
    
    setRoomCode(code);
    const roomData = snapshot.val();
    setImage(roomData.imageUrl);
    setDifficulty(roomData.difficulty);
    return roomData;
  };

  // Add cursor tracking in the useEffect where you handle mouse events
  const updateCursorPosition = (event) => {
    if (!gameId || !auth.currentUser || !containerRef.current) return;
    
    const rect = containerRef.current.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    const y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    
    const cursorRef = ref(database, `games/${gameId}/cursors/${auth.currentUser.uid}`);
    update(cursorRef, {
      x,
      y,
      timestamp: Date.now(),
      playerName: auth.currentUser.displayName || 'Anonymous'
    });
  };

  // Modify the piece movement handling to include locking
  const handlePieceSelection = (piece) => {
    if (piece.userData.lockedBy && piece.userData.lockedBy !== auth.currentUser.uid) {
      return; // Piece is locked by another player
    }
    
    if (gameId && piece.id) {
      update(ref(database, `games/${gameId}/pieces/${piece.id}`), {
        lockedBy: auth.currentUser.uid,
        lockTime: Date.now()
      });
      
      setLockedPieces(prev => ({
        ...prev,
        [piece.id]: auth.currentUser.uid
      }));
    }
  };

  // Add this effect for cursor and piece lock syncing
  useEffect(() => {
    if (!gameId) return;
  
    // Sync cursors
    const cursorRef = ref(database, `games/${gameId}/cursors`);
    onValue(cursorRef, (snapshot) => {
      if (snapshot.exists()) {
        const cursors = snapshot.val();
        setOtherPlayerCursors(
          Object.entries(cursors)
            .filter(([id]) => id !== auth.currentUser.uid)
            .reduce((acc, [id, data]) => ({ ...acc, [id]: data }), {})
        );
      }
    });
  
    // Sync piece locks
    const locksRef = ref(database, `games/${gameId}/pieces`);
    onValue(locksRef, (snapshot) => {
      if (snapshot.exists()) {
        const pieces = snapshot.val();
        setLockedPieces(
          Object.entries(pieces)
            .filter(([_, data]) => data.lockedBy)
            .reduce((acc, [id, data]) => ({ ...acc, [id]: data.lockedBy }), {})
        );
      }
    });
  }, [gameId]);

  // Add scoring effect
  useEffect(() => {
    if (!gameId) return;
  
    const scoresRef = ref(database, `games/${gameId}/scores`);
    onValue(scoresRef, (snapshot) => {
      if (snapshot.exists()) {
        setPlayerScores(snapshot.val());
      }
    });
  }, [gameId]);

  // Add leaderboard update function
  const updateLeaderboard = () => {
    if (!gameId) return;
    
    const scores = Object.entries(playerScores)
      .map(([id, score]) => ({
        id,
        name: players[id]?.name || 'Unknown',
        score: score.piecesPlaced || 0,
        time: score.lastPlaced
      }))
      .sort((a, b) => b.score - a.score);
    
    update(ref(database, `games/${gameId}/leaderboard`), scores);
  };

  // Add this to useEffect for piece completion
  useEffect(() => {
    if (isCompetitive && gameId) {
      updateLeaderboard();
    }
  }, [completedPieces, isCompetitive, gameId]);

  // Modify handlePieceComplete to include scoring
  const handlePieceComplete = async (piece) => {
    if (!piece) return;
    
    // Ensure audio is initialized
    await initializeAudio();
    
    // Play sound effect
    soundRef.current?.play('place');
    
    // Visual effects
    particleSystemRef.current?.emit(piece.position, 30);
    
    // Add ripple effect
    const ripple = new THREE.Mesh(
      new THREE.CircleGeometry(0.1, 32),
      new THREE.MeshBasicMaterial({
        color: 0x4a90e2,
        transparent: true,
        opacity: 0.5
      })
    );
    
    ripple.position.copy(piece.position);
    ripple.position.z = 0.01;
    sceneRef.current.add(ripple);
  
    // Animate ripple
    const animate = () => {
      const scale = ripple.scale.x + 0.05;
      ripple.scale.set(scale, scale, 1);
      ripple.material.opacity -= 0.02;
      
      if (ripple.material.opacity > 0) {
        requestAnimationFrame(animate);
      } else {
        sceneRef.current.remove(ripple);
      }
    };
    
    animate();

    if (gameId) {
      update(ref(database, `games/${gameId}/scores/${auth.currentUser.uid}`), {
        piecesPlaced: increment(1),
        lastPlaced: serverTimestamp()
      });
    }
  };

  // Add reconnection handling
  useEffect(() => {
    if (!gameId) return;
  
    const connectionRef = ref(database, '.info/connected');
    onValue(connectionRef, async (snapshot) => {
      if (snapshot.val() === true) {
        // Reconnected - refresh game state
        const gameSnapshot = await get(ref(database, `games/${gameId}`));
        if (gameSnapshot.exists()) {
          const gameData = gameSnapshot.val();
          setGameState(gameData.state);
          setProgress(gameData.progress || 0);
          setTimeElapsed(gameData.timeElapsed || 0);
        }
      }
    });
  }, [gameId]);

  // Add these functions
  const generateInviteLink = (roomCode) => {
    const baseUrl = window.location.origin;
    return `${baseUrl}/join/${roomCode}`;
  };

  const copyInviteLink = () => {
    navigator.clipboard.writeText(inviteLink);
    // Show toast or notification
  };

  // Add room initialization effect
  useEffect(() => {
    if (!roomCode || !auth.currentUser) return;

    const initializeRoom = async () => {
      if (isHost) {
        // Create new room
        await set(roomRef, {
          hostId: auth.currentUser.uid,
          created: serverTimestamp(),
          status: GAME_STATES.WAITING,
          difficulty,
          players: {
            [auth.currentUser.uid]: {
              name: auth.currentUser.displayName || 'Anonymous',
              isHost: true
            }
          }
        });
      } else {
        // Join existing room
        const playerRef = ref(database, `rooms/${roomCode}/players/${auth.currentUser.uid}`);
        await set(playerRef, {
          name: auth.currentUser.displayName || 'Anonymous',
          isHost: false
        });
      }
    };

    initializeRoom();

    // Handle disconnection
    const playerRef = ref(database, `rooms/${roomCode}/players/${auth.currentUser.uid}`);
    onDisconnect(playerRef).remove();

    // Sync room state
    onValue(roomRef, (snapshot) => {
      if (snapshot.exists()) {
        const room = snapshot.val();
        setGameState(room.status);
        setPlayers(room.players || {});
        if (room.pieces) {
          syncPuzzlePieces(room.pieces);
        }
      }
    });

    return () => {
      // Cleanup room if host disconnects
      if (isHost) {
        remove(roomRef);
      } else {
        remove(playerRef);
      }
    };
  }, [roomCode, isHost]);

  // Add piece synchronization function
  const syncPuzzlePieces = (pieces) => {
    puzzlePiecesRef.current.forEach(piece => {
      const pieceData = pieces[piece.id];
      if (pieceData && !piece.userData.isPlaced) {
        piece.position.set(
          pieceData.position.x,
          pieceData.position.y,
          pieceData.position.z
        );
        if (pieceData.lockedBy) {
          piece.userData.lockedBy = pieceData.lockedBy;
        }
      }
    });
  };

  // Modify handlePieceMove for multiplayer
  // const handlePieceMove = (piece, position) => {
  //   if (!roomCode || !piece.id) return;
    
  //   const pieceRef = ref(database, `rooms/${roomCode}/pieces/${piece.id}`);
  //   runTransaction(pieceRef, (currentData) => {
  //     if (currentData?.lockedBy && currentData.lockedBy !== auth.currentUser.uid) {
  //       return; // Exit if the piece is locked by another player
  //     }
      
  //     return {
  //       position: {
  //         x: position.x,
  //         y: position.y,
  //         z: position.z
  //       },
  //       lockedBy: auth.currentUser.uid,
  //       lastUpdate: serverTimestamp()
  //     };
  //   }).catch(error => {
  //     console.error('Transaction error:', error);
  //   });
  // };
  

  // Add new constants for multiplayer status indicators
  const PLAYER_STATUS = {
    ONLINE: 'online',
    AWAY: 'away',
    OFFLINE: 'offline'
  };

  // Add this useEffect after your other useEffect declarations
  useEffect(() => {
    if (!auth.currentUser) return;
  
    // Initialize room-related functions and listeners
    const setupMultiplayerHandlers = async () => {
      try {
        if (isHost && !roomCode) {
          // Create new room if host
          const newRoomCode = await createRoom();
          if (newRoomCode) {
            // Set up initial room state
            const gameStateRef = ref(database, `rooms/${newRoomCode}/gameState`);
            await set(gameStateRef, {
              status: GAME_STATES.WAITING,
              startedAt: null,
              pieces: {},
              players: {
                [auth.currentUser.uid]: {
                  name: auth.currentUser.displayName || 'Anonymous',
                  isHost: true,
                  status: PLAYER_STATUS.ONLINE
                }
              }
            });
          }
        } else if (roomCode && !isHost) {
          // Join existing room if not host
          await joinRoom(roomCode);
        }
  
        // Set up cursor tracking
        if (containerRef.current) {
          containerRef.current.addEventListener('mousemove', updateCursorPosition);
        }
  
        // Set up piece selection handlers
        const pieceLockHandler = (piece) => {
          if (!piece) return;
          handlePieceSelection(piece);
        };
  
        // Add lock handler to each puzzle piece
        puzzlePiecesRef.current.forEach(piece => {
          piece.userData.onSelect = pieceLockHandler;
        });
  
        // Listen for room state changes
        if (roomCode) {
          const roomStateRef = ref(database, `rooms/${roomCode}`);
          onValue(roomStateRef, (snapshot) => {
            if (snapshot.exists()) {
              const roomData = snapshot.val();
              // Update local state based on room data
              setGameState(roomData.gameState?.status || GAME_STATES.WAITING);
              setPlayers(roomData.players || {});
              
              // Sync piece positions if they exist
              if (roomData.pieces) {
                syncPuzzlePieces(roomData.pieces);
              }
            }
          });
  
          // Set up presence system
          const presenceRef = ref(database, `.info/connected`);
          const playerRef = ref(database, `rooms/${roomCode}/players/${auth.currentUser.uid}`);
          
          onValue(presenceRef, (snapshot) => {
            if (snapshot.val()) {
              // Remove player data on disconnect
              onDisconnect(playerRef).remove();
              
              // Update player status
              update(playerRef, {
                status: PLAYER_STATUS.ONLINE,
                lastSeen: serverTimestamp()
              });
            }
          });
        }
      } catch (error) {
        console.error('Error setting up multiplayer handlers:', error);
        toast.error('Failed to initialize multiplayer features');
      }
    };
  
    setupMultiplayerHandlers();
  
    // Cleanup function
    return () => {
      if (containerRef.current) {
        containerRef.current.removeEventListener('mousemove', updateCursorPosition);
      }
  
      if (roomCode) {
        // Clean up room data if host
        if (isHost) {
          remove(ref(database, `rooms/${roomCode}`));
        } else {
          // Just remove player data if not host
          remove(ref(database, `rooms/${roomCode}/players/${auth.currentUser.uid}`));
        }
  
        // Clear cursor data
        remove(ref(database, `rooms/${roomCode}/cursors/${auth.currentUser.uid}`));
      }
  
      // Clear piece handlers
      puzzlePiecesRef.current.forEach(piece => {
        piece.userData.onSelect = null;
      });
    };
  }, [roomCode, isHost, auth.currentUser]);
  

  return (
    <div className="w-full h-screen flex flex-col bg-gradient-to-b from-gray-900 to-gray-800">
      {/* Enhanced Header */}
      <motion.header
        initial={{ y: -20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        className="p-4 bg-gray-800/90 backdrop-blur-sm border-b border-gray-700 z-10"
      >
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          {/* Game Controls */}
          <div className="flex items-center gap-4">
            {/* Upload Button */}
            <label 
              className="relative cursor-pointer group"
              data-tooltip-id="upload-tooltip"
              data-tooltip-content="Upload a new image to create puzzle"
            >
              <input
                type="file"
                accept="image/*"
                onChange={handleImageUpload}
                className="hidden"
              />
              <motion.div 
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 group-hover:bg-blue-700 
                          rounded-lg text-white transition-all duration-200 shadow-lg"
              >
                <Camera className="w-5 h-5" />
                <span className="font-medium">Upload Photo</span>
              </motion.div>
            </label>

            {/* Game Controls */}
            <div className="flex items-center gap-3">
              {gameState !== 'initial' && (
                <motion.button
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={togglePause}
                  className="p-2.5 bg-gray-700 text-white rounded-lg hover:bg-gray-600 transition-colors shadow-md"
                  data-tooltip-id="control-tooltip"
                  data-tooltip-content={gameState === 'playing' ? 'Pause Game' : 'Resume Game'}
                >
                  {gameState === 'playing' ? (
                    <Pause className="w-5 h-5" />
                  ) : (
                    <Play className="w-5 h-5" />
                  )}
                </motion.button>
              )}
              
              {gameState === 'initial' && (
                <motion.button
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={startGame}
                  className="p-2.5 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors shadow-md"
                  data-tooltip-id="start-tooltip"
                  data-tooltip-content="Start Game"
                >
                  <Play className="w-5 h-5" />
                </motion.button>
              )}

              {/* Timer Display */}
              <div className="flex items-center gap-2 text-white bg-gray-700/80 px-4 py-2 rounded-lg shadow-md">
                <Clock className="w-4 h-4 text-blue-400" />
                <span className="font-mono text-lg">{formatTime(timeElapsed)}</span>
              </div>

              {/* Add Difficulty Bar */}
              <DifficultyBar
                selectedDifficulty={selectedDifficulty}
                onSelect={handleDifficultyChange}
              />

              {/* Existing game controls */}
              {gameState !== 'initial' && (
                <button
                  onClick={togglePause}
                  className="p-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg transition-colors"
                >
                  {gameState === 'playing' ? <Pause /> : <Play />}
                </button>
              )}
            </div>
          </div>

          {/* Progress Section */}
          {totalPieces > 0 && (
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="flex items-center gap-4"
            >
              {/* ...existing progress UI... */}
              <div className="flex flex-col items-end">
                <div className="text-sm text-gray-400">Progress</div>
                <div className="text-lg font-bold text-white">
                  {completedPieces} / {totalPieces}
                </div>
              </div>
              <div className="w-40 h-3 bg-gray-700 rounded-full overflow-hidden shadow-inner">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${progress}%` }}
                  transition={{ duration: 0.5 }}
                  className="h-full bg-gradient-to-r from-blue-500 to-green-500 relative"
                >
                  <div className="absolute inset-0 bg-white opacity-20 animate-pulse" />
                </motion.div>
              </div>
              <AnimatePresence>
                {progress === 100 && (
                  <motion.div
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.8 }}
                    className="flex items-center gap-2 text-green-400 bg-green-900/30 px-4 py-2 rounded-lg"
                  >
                    <Check className="w-5 h-5" />
                    <span className="font-medium">Complete!</span>
                    <span className="text-green-300 font-mono">{formatTime(timeElapsed)}</span>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          )}
        </div>
      </motion.header>

      {/* Share Link and Players Panel */}
      {roomCode && (
        <div className="absolute left-4 top-20 bg-gray-800/95 backdrop-blur-sm rounded-lg shadow-xl p-4 w-72 border border-gray-700">
          {/* Share Link Section */}
          <div className="mb-4 pb-4 border-b border-gray-700">
            <h3 className="text-white font-semibold mb-2 flex items-center gap-2">
              <Share2 className="w-4 h-4 text-blue-400" />
              Invite Link
            </h3>
            <div className="flex gap-2">
              <input
                type="text"
                value={generateInviteLink(roomCode)}
                readOnly
                className="bg-gray-900 text-white px-3 py-1.5 rounded flex-1 text-sm font-mono truncate"
              />
              <button
                onClick={() => {
                  navigator.clipboard.writeText(generateInviteLink(roomCode));
                  toast.success('Link copied to clipboard!');
                }}
                className="px-3 py-1.5 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors text-sm whitespace-nowrap"
              >
                Copy Link
              </button>
            </div>
            <div className="mt-2 text-gray-400 text-xs">
              Share this link with friends to invite them to your puzzle room
            </div>
          </div>

          {/* Players List Section */}
          <div>
            <h3 className="text-white font-semibold mb-2 flex items-center gap-2">
              <Info className="w-4 h-4 text-blue-400" />
              Players ({Object.keys(players).length})
            </h3>
            <div className="space-y-2">
              {Object.entries(players).map(([id, player]) => (
                <div
                  key={id}
                  className="flex items-center justify-between bg-gray-700/50 rounded p-2"
                >
                  <div className="flex items-center gap-2">
                    <div className={`w-2 h-2 rounded-full ${
                      player.status === PLAYER_STATUS.ONLINE ? 'bg-green-500' :
                      player.status === PLAYER_STATUS.AWAY ? 'bg-yellow-500' :
                      'bg-gray-500'
                    }`} />
                    <span className="text-white text-sm">{player.name}</span>
                    {player.isHost && (
                      <span className="text-xs bg-blue-600 text-white px-1.5 py-0.5 rounded">
                        Host
                      </span>
                    )}
                  </div>
                  <div className="text-gray-400 text-sm">
                    {playerScores[id]?.piecesPlaced || 0} pieces
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Score Summary */}
          {isCompetitive && (
            <div className="mt-4 pt-4 border-t border-gray-700">
              <h4 className="text-white font-semibold mb-2">Leaderboard</h4>
              <div className="space-y-1">
                {leaderboard.slice(0, 3).map((entry, index) => (
                  <div
                    key={entry.id}
                    className="flex items-center justify-between text-sm"
                  >
                    <div className="flex items-center gap-2">
                      <span className={
                        index === 0 ? 'text-yellow-400' :
                        index === 1 ? 'text-gray-400' :
                        'text-amber-700'
                      }>
                        #{index + 1}
                      </span>
                      <span className="text-white">{entry.name}</span>
                    </div>
                    <span className="text-gray-400">{entry.score}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Enhanced Game Area */}
      <div className="flex-1 relative">
        {/* Main Canvas */}
        <div ref={containerRef} className="w-full h-full" />

        {/* Floating Panels */}
        <AnimatePresence>
          {showThumbnail && image && (
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="absolute left-4 top-20 p-3 bg-gray-800/95 backdrop-blur-sm rounded-xl border border-gray-700/50 shadow-xl"
            >
              {/* Reference Image */}
              <div className="relative group">
                <img
                  src={image}
                  alt="Reference"
                  className="w-48 h-auto rounded-lg transform transition-transform group-hover:scale-105"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent opacity-0 group-hover:opacity-100 transition-opacity rounded-lg">
                  <span className="absolute bottom-2 left-2 text-white/90 text-sm font-medium">
                    Reference Image
                  </span>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Camera Controls */}
        <div className="absolute right-4 top-4 flex flex-col gap-2">
          {[
            { icon: <ZoomIn className="w-5 h-5" />, action: handleZoomIn, tooltip: "Zoom In" },
            { icon: <ZoomOut className="w-5 h-5" />, action: handleZoomOut, tooltip: "Zoom Out" },
            { icon: <Maximize2 className="w-5 h-5" />, action: handleResetView, tooltip: "Reset View" },
            { icon: <RotateCcw className="w-5 h-5" />, action: handleResetGame, tooltip: "Reset Puzzle" },
            { icon: <Image className="w-5 h-5" />, action: () => setShowThumbnail(!showThumbnail), tooltip: "Toggle Reference" }
          ].map((control, index) => (
            <motion.button
              key={index}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={control.action}
              className="p-2.5 bg-gray-800/90 backdrop-blur-sm text-white rounded-lg 
                       hover:bg-gray-700 transition-colors shadow-lg"
              data-tooltip-id="control-tooltip"
              data-tooltip-content={control.tooltip}
            >
              {control.icon}
            </motion.button>
          ))}
        </div>

        {/* Player List for Multiplayer */}
        {isMultiPlayer && (
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            className="absolute left-4 top-4 w-64 bg-gray-800/95 backdrop-blur-sm rounded-xl border border-gray-700/50 shadow-xl p-4"
          >
            <h3 className="text-white font-semibold mb-3 flex items-center gap-2">
              <span>Players ({Object.keys(players).length})</span>
            </h3>
            <div className="space-y-2">
              {Object.entries(players).map(([id, player]) => (
                <PlayerCard
                  key={id}
                  player={player}
                  score={playerScores[id]?.piecesPlaced || 0}
                  isCurrentPlayer={id === auth.currentUser?.uid}
                />
              ))}
            </div>
          </motion.div>
        )}

        {/* Loading State */}
        <AnimatePresence>
          {loading && <LoadingOverlay />}
        </AnimatePresence>
      </div>

      {/* Enhanced Modals */}
      <AnimatePresence>
        {showShareModal && (
          // ...existing share modal with enhanced animations...
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50"
          >
            <motion.div
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.9, y: 20 }}
              className="bg-gray-800 p-6 rounded-xl shadow-xl max-w-md w-full mx-4"
            >
              <h3 className="text-xl font-bold mb-4 text-white">Share Your Achievement</h3>
              <div className="space-y-4">
                <button
                  onClick={shareToFacebook}
                  className="w-full p-3 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors"
                >
                  Share on Facebook
                </button>
                <button
                  onClick={shareToTwitter}
                  className="w-full p-3 bg-sky-400 text-white rounded hover:bg-sky-500 transition-colors"
                >
                  Share on Twitter
                </button>
                <button
                  onClick={shareToWhatsApp}
                  className="w-full p-3 bg-green-500 text-white rounded hover:bg-green-600 transition-colors"
                >
                  Share on WhatsApp
                </button>
                <button
                  onClick={downloadPuzzleImage}
                  className="w-full p-3 bg-gray-700 text-white rounded hover:bg-gray-600 transition-colors flex items-center justify-center gap-2"
                >
                  <Download className="h-4 w-4" /> Download Image
                </button>
              </div>
              <button
                onClick={() => setShowShareModal(false)}
                className="mt-4 w-full p-2 border border-gray-600 text-white rounded hover:bg-gray-700 transition-colors"
              >
                Close
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Tooltips */}
      <Tooltip id="tooltip" className="z-50" />
    </div>
  );
};

// 7. Export
export default PuzzleGame;