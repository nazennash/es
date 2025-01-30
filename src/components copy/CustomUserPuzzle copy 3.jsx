// Complete optimized puzzle game implementation with all features
// Import statements remain at the top for clarity
import React, { useEffect, useRef, useState, useMemo, useCallback } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass';
import { Camera, Check, Info, Clock, ZoomIn, ZoomOut, Maximize2, RotateCcw, Image, Play, Pause, Share2, Download } from 'lucide-react';
import { debounce, throttle } from 'lodash';
import html2canvas from 'html2canvas';
import { auth } from '../firebase';
import { getFirestore, collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { ref, update, getDatabase } from 'firebase/database';
import { motion, AnimatePresence } from 'framer-motion';
import { Tooltip } from 'react-tooltip';
import DifficultyBar, { difficulties } from './DifficultyBar';

// Performance Configuration
const PERFORMANCE_CONFIG = {
  maxParticles: window.innerWidth < 768 ? 30 : 50,
  enableBloom: window.innerWidth > 1024,
  raycastThrottle: 16,
  useSharedUniforms: true,
  particlePoolSize: window.innerWidth < 768 ? 50 : 100,
  maxVisiblePieces: window.innerWidth < 768 ? 25 : 50,
  frustumCulling: true,
  lowEndDevice: window.innerWidth < 768 || !window.matchMedia('(min-device-memory: 4gb)').matches,
  textureQuality: window.innerWidth < 768 ? 0.5 : 1,
  maxFrameRate: window.innerWidth < 768 ? 30 : 60,
  useInstancing: window.innerWidth >= 1024,
  geometryDetail: window.innerWidth < 768 ? 8 : 32
};

// Game Constants
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

// Optimized Audio System with WebAudio API
class AudioManager {
  constructor() {
    this.context = null;
    this.buffers = new Map();
    this.gainNode = null;
    this.enabled = true;
    this.initialized = false;
    this.volume = 0.5;
  }

  async initialize() {
    if (this.initialized) return;
    
    try {
      this.context = new (window.AudioContext || window.webkitAudioContext)();
      this.gainNode = this.context.createGain();
      this.gainNode.connect(this.context.destination);
      this.gainNode.gain.value = this.volume;
      
      // Pre-load sound buffers
      await Promise.all([
        this.loadSound('pickup', 440),
        this.loadSound('place', 880),
        this.loadSound('complete', [523.25, 659.25, 783.99])
      ]);
      
      this.initialized = true;
    } catch (error) {
      console.error('Audio initialization failed:', error);
    }
  }

  async loadSound(name, frequencies) {
    const buffer = await this.createToneBuffer(frequencies);
    this.buffers.set(name, buffer);
  }

  createToneBuffer(frequencies) {
    const duration = 0.2;
    const sampleRate = this.context.sampleRate;
    const buffer = this.context.createBuffer(1, duration * sampleRate, sampleRate);
    const data = buffer.getChannelData(0);
    const freqArray = Array.isArray(frequencies) ? frequencies : [frequencies];

    for (let i = 0; i < buffer.length; i++) {
      let sample = 0;
      freqArray.forEach(freq => {
        sample += Math.sin(2 * Math.PI * freq * i / sampleRate);
      });
      data[i] = (sample / freqArray.length) * Math.exp(-3 * i / buffer.length);
    }
    return buffer;
  }

  async play(soundName) {
    if (!this.enabled || !this.initialized || !this.buffers.has(soundName)) return;

    try {
      if (this.context.state === 'suspended') {
        await this.context.resume();
      }

      const source = this.context.createBufferSource();
      source.buffer = this.buffers.get(soundName);
      source.connect(this.gainNode);
      source.start();
    } catch (error) {
      console.error('Error playing sound:', error);
    }
  }

  setVolume(value) {
    if (this.gainNode) {
      this.volume = Math.max(0, Math.min(1, value));
      this.gainNode.gain.setValueAtTime(this.volume, this.context.currentTime);
    }
  }

  toggle() {
    this.enabled = !this.enabled;
    return this.enabled;
  }
}

// Optimized Particle System with Object Pooling and Instancing
class ParticleSystem {
  constructor(scene) {
    this.scene = scene;
    this.particles = [];
    this.pool = [];
    
    // Create geometry and material once
    const geometry = new THREE.BufferGeometry();
    const material = new THREE.PointsMaterial({
      size: 0.05,
      map: new THREE.TextureLoader().load('/api/placeholder/32/32'),
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    });

    // Set up instanced particles
    this.positions = new Float32Array(PERFORMANCE_CONFIG.maxParticles * 3);
    this.colors = new Float32Array(PERFORMANCE_CONFIG.maxParticles * 3);
    this.scales = new Float32Array(PERFORMANCE_CONFIG.maxParticles);
    
    geometry.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(this.colors, 3));
    geometry.setAttribute('scale', new THREE.BufferAttribute(this.scales, 1));
    
    this.particleSystem = new THREE.Points(geometry, material);
    scene.add(this.particleSystem);

    // Initialize particle pool
    for (let i = 0; i < PERFORMANCE_CONFIG.particlePoolSize; i++) {
      this.pool.push(this.createParticle());
    }
  }

  createParticle() {
    return {
      position: new THREE.Vector3(),
      velocity: new THREE.Vector3(),
      color: new THREE.Color(),
      scale: 1,
      life: 0
    };
  }

  emit(position, count = Math.min(20, PERFORMANCE_CONFIG.maxParticles)) {
    for (let i = 0; i < count && this.particles.length < PERFORMANCE_CONFIG.maxParticles; i++) {
      const particle = this.pool.pop() || this.createParticle();
      
      // Reset particle properties
      particle.position.copy(position);
      particle.velocity.set(
        (Math.random() - 0.5) * 0.2,
        (Math.random() - 0.5) * 0.2,
        Math.random() * 0.2
      );
      particle.color.setHSL(Math.random(), 0.7, 0.7);
      particle.scale = Math.random() * 0.5 + 0.5;
      particle.life = 1.0;
      
      this.particles.push(particle);
    }
  }

  update(deltaTime) {
    let particleIndex = 0;
    
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const particle = this.particles[i];
      particle.life -= deltaTime;
      
      if (particle.life <= 0) {
        this.pool.push(particle);
        this.particles.splice(i, 1);
        continue;
      }
      
      // Update particle physics
      particle.position.addScaledVector(particle.velocity, deltaTime);
      particle.scale *= (1 - deltaTime * 0.5);
      
      // Update buffers
      const i3 = particleIndex * 3;
      this.positions[i3] = particle.position.x;
      this.positions[i3 + 1] = particle.position.y;
      this.positions[i3 + 2] = particle.position.z;
      
      this.colors[i3] = particle.color.r;
      this.colors[i3 + 1] = particle.color.g;
      this.colors[i3 + 2] = particle.color.b;
      
      this.scales[particleIndex] = particle.scale;
      
      particleIndex++;
    }
    
    // Update geometry attributes
    const geometry = this.particleSystem.geometry;
    geometry.attributes.position.needsUpdate = true;
    geometry.attributes.color.needsUpdate = true;
    geometry.attributes.scale.needsUpdate = true;
    geometry.setDrawRange(0, this.particles.length);
  }

  dispose() {
    this.scene.remove(this.particleSystem);
    this.particleSystem.geometry.dispose();
    this.particleSystem.material.dispose();
    if (this.particleSystem.material.map) {
      this.particleSystem.material.map.dispose();
    }
  }
}

// Optimized Shaders
const puzzlePieceShader = {
  vertexShader: `
    precision highp float;
    
    uniform vec2 uvOffset;
    uniform vec2 uvScale;
    uniform float selected;
    uniform float time;
    
    varying vec2 vUv;
    varying vec3 vNormal;
    varying float vSelected;
    
    void main() {
      vUv = uvOffset + uv * uvScale;
      vNormal = normalize(normalMatrix * normal);
      vSelected = selected;
      
      vec3 pos = position;
      if (selected > 0.0) {
        pos.z += sin(time * 3.0) * 0.02;
      }
      
      gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
    }
  `,
  fragmentShader: `
    precision highp float;
    
    uniform sampler2D map;
    uniform float correctPosition;
    uniform float time;
    
    varying vec2 vUv;
    varying vec3 vNormal;
    varying float vSelected;
    
    void main() {
      vec4 texColor = texture2D(map, vUv);
      vec3 normal = normalize(vNormal);
      vec3 lightDir = normalize(vec3(5.0, 5.0, 5.0));
      float diff = max(dot(normal, lightDir), 0.0);
      
      // Base color with lighting
      vec3 color = texColor.rgb * (0.3 + 0.7 * diff);
      
      // Selection highlight
      if (vSelected > 0.0) {
        vec3 highlightColor = vec3(0.3, 0.6, 1.0);
        float highlight = 0.5 * (0.5 + 0.5 * sin(time * 3.0));
        color = mix(color, highlightColor, vSelected * highlight);
      }
      
      // Correct position highlight
      if (correctPosition > 0.0) {
        vec3 correctColor = vec3(0.2, 1.0, 0.3);
        color = mix(color, correctColor, correctPosition * 0.3);
      }
      
      gl_FragColor = vec4(color, texColor.a);
    }
  `
};

// Main Component
const PuzzleGame = () => {
  // State declarations
  const [image, setImage] = useState(null);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [completedPieces, setCompletedPieces] = useState(0);
  const [totalPieces, setTotalPieces] = useState(0);
  const [timeElapsed, setTimeElapsed] = useState(0);
  const [isTimerRunning, setIsTimerRunning] = useState(false);
  const [gameState, setGameState] = useState('initial');
  const [showThumbnail, setShowThumbnail] = useState(false);
  const [showShareModal, setShowShareModal] = useState(false);
  const [showDifficultyModal, setShowDifficultyModal] = useState(false);
  const [difficulty, setDifficulty] = useState('easy');
  const [selectedDifficulty, setSelectedDifficulty] = useState(difficulties[0]);
  const [achievements, setAchievements] = useState([]);
  const [showAchievements, setShowAchievements] = useState(false);

  // Refs
  const containerRef = useRef(null);
  const sceneRef = useRef(null);
  const cameraRef = useRef(null);
  const rendererRef = useRef(null);
  const composerRef = useRef(null);
  const controlsRef = useRef(null);
  const clockRef = useRef(new THREE.Clock());
  const particleSystemRef = useRef(null);
  const audioManagerRef = useRef(null);
  const puzzlePiecesRef = useRef([]);
  const selectedPieceRef = useRef(null);
  const raycasterRef = useRef(new THREE.Raycaster());
  const mouseRef = useRef(new THREE.Vector2());
  const timerRef = useRef(null);
  const frameRef = useRef(null);
  const frustumRef = useRef(new THREE.Frustum());

  // Memoized values
  const sharedUniforms = useMemo(() => ({
    time: { value: 0 },
    lightDirection: { value: new THREE.Vector3(5, 5, 5) }
  }), []);

  // Initialize game systems
  useEffect(() => {
    audioManagerRef.current = new AudioManager();
    audioManagerRef.current.initialize();

    return () => {
      if (audioManagerRef.current?.context) {
        audioManagerRef.current.context.close();
      }
    };
  }, []);

  // Setup scene and renderer
  const setupRenderer = useCallback(() => {
    if (!containerRef.current) return null;

    const renderer = new THREE.WebGLRenderer({
      antialias: !PERFORMANCE_CONFIG.lowEndDevice,
      powerPreference: 'high-performance',
      alpha: false
    });

    renderer.setSize(containerRef.current.clientWidth, containerRef.current.clientHeight);
    renderer.setPixelRatio(PERFORMANCE_CONFIG.lowEndDevice ? 1 : window.devicePixelRatio);
    renderer.shadowMap.enabled = !PERFORMANCE_CONFIG.lowEndDevice;
    
    return renderer;
  }, []);

  const setupScene = useCallback(() => {
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x1a1a1a);
    
    // Add ambient and directional light
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.4);
    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight.position.set(5, 5, 5);
    
    if (!PERFORMANCE_CONFIG.lowEndDevice) {
      directionalLight.castShadow = true;
      directionalLight.shadow.mapSize.width = 1024;
      directionalLight.shadow.mapSize.height = 1024;
    }
    
    scene.add(ambientLight);
    scene.add(directionalLight);
    
    return scene;
  }, []);

  const setupCamera = useCallback(() => {
    const camera = new THREE.PerspectiveCamera(
      75,
      containerRef.current.clientWidth / containerRef.current.clientHeight,
      0.1,
      1000
    );
    camera.position.z = 5;
    return camera;
  }, []);

  // Setup post-processing
  const setupPostProcessing = useCallback((renderer, scene, camera) => {
    if (!PERFORMANCE_CONFIG.enableBloom) return null;

    const composer = new EffectComposer(renderer);
    composer.addPass(new RenderPass(scene, camera));

    const bloomPass = new UnrealBloomPass(
      new THREE.Vector2(
        window.innerWidth * PERFORMANCE_CONFIG.textureQuality,
        window.innerHeight * PERFORMANCE_CONFIG.textureQuality
      ),
      0.5, 0.4, 0.85
    );
    composer.addPass(bloomPass);

    return composer;
  }, []);

  // Optimized animation loop
  const animate = useCallback(() => {
    if (!sceneRef.current || !cameraRef.current || !rendererRef.current) return;

    const deltaTime = Math.min(clockRef.current.getDelta(), 1 / PERFORMANCE_CONFIG.maxFrameRate);
    sharedUniforms.time.value = clockRef.current.getElapsedTime();

    // Update controls
    if (controlsRef.current) {
      controlsRef.current.update();
    }

    // Update visible pieces
    if (PERFORMANCE_CONFIG.frustumCulling) {
      frustumRef.current.setFromProjectionMatrix(
        new THREE.Matrix4().multiplyMatrices(
          cameraRef.current.projectionMatrix,
          cameraRef.current.matrixWorldInverse
        )
      );

      puzzlePiecesRef.current
        .filter(piece => frustumRef.current.intersectsObject(piece))
        .slice(0, PERFORMANCE_CONFIG.maxVisiblePieces)
        .forEach(piece => {
          if (piece.material.uniforms) {
            piece.material.uniforms.time.value = sharedUniforms.time.value;
          }
        });
    }

    // Update particles
    if (particleSystemRef.current && deltaTime > 1 / PERFORMANCE_CONFIG.maxFrameRate) {
      particleSystemRef.current.update(deltaTime);
    }

    // Render
    if (composerRef.current && PERFORMANCE_CONFIG.enableBloom) {
      composerRef.current.render();
    } else {
      rendererRef.current.render(sceneRef.current, cameraRef.current);
    }

    frameRef.current = requestAnimationFrame(animate);
  }, [sharedUniforms]);

  // Initialize game
  useEffect(() => {
    const renderer = setupRenderer();
    const scene = setupScene();
    const camera = setupCamera();
    const composer = setupPostProcessing(renderer, scene, camera);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.maxDistance = 10;
    controls.minDistance = 2;

    sceneRef.current = scene;
    cameraRef.current = camera;
    rendererRef.current = renderer;
    composerRef.current = composer;
    controlsRef.current = controls;
    particleSystemRef.current = new ParticleSystem(scene);

    containerRef.current?.appendChild(renderer.domElement);
    
    animate();

    return () => {
      cancelAnimationFrame(frameRef.current);
      cleanup();
      containerRef.current?.removeChild(renderer.domElement);
    };
  }, [setupRenderer, setupScene, setupCamera, setupPostProcessing, animate]);

  // Optimized window resize handling
  const handleResize = useMemo(() => 
    debounce(() => {
      if (!containerRef.current || !cameraRef.current || !rendererRef.current) return;

      const width = containerRef.current.clientWidth;
      const height = containerRef.current.clientHeight;

      cameraRef.current.aspect = width / height;
      cameraRef.current.updateProjectionMatrix();

      rendererRef.current.setSize(width, height);
      if (composerRef.current) {
        composerRef.current.setSize(width, height);
      }
    }, 250),
    []
  );

  useEffect(() => {
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [handleResize]);

  // Game state management
  const startGame = useCallback(async () => {
    if (!image) {
      alert('Please upload an image first');
      return;
    }

    setGameState('playing');
    setIsTimerRunning(true);
    setTimeElapsed(0);
    setProgress(0);
    setCompletedPieces(0);

    await audioManagerRef.current?.initialize();
  }, [image]);

  const pauseGame = useCallback(() => {
    setGameState('paused');
    setIsTimerRunning(false);
  }, []);

  const resumeGame = useCallback(() => {
    setGameState('playing');
    setIsTimerRunning(true);
  }, []);

  const resetGame = useCallback(() => {
    if (gameState === 'playing') {
      const shouldReset = window.confirm('Are you sure you want to reset the current puzzle?');
      if (!shouldReset) return;
    }

    setTimeElapsed(0);
    setProgress(0);
    setCompletedPieces(0);
    setGameState('initial');
    setIsTimerRunning(false);

    if (image) {
      createPuzzlePieces(image);
    }
  }, [gameState, image]);

  // Timer management
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

  // Puzzle piece creation and management
  const createPuzzlePieces = useCallback(async (imageUrl) => {
    if (!sceneRef.current) return;

    setLoading(true);

    try {
      // Clean up existing pieces
      puzzlePiecesRef.current.forEach(piece => {
        piece.geometry.dispose();
        piece.material.dispose();
        sceneRef.current.remove(piece);
      });
      puzzlePiecesRef.current = [];

      // Load and optimize texture
      const texture = await new THREE.TextureLoader().loadAsync(imageUrl);
      texture.generateMipmaps = !PERFORMANCE_CONFIG.lowEndDevice;
      texture.minFilter = PERFORMANCE_CONFIG.lowEndDevice ? THREE.LinearFilter : THREE.LinearMipmapLinearFilter;
      
      const aspectRatio = texture.image.width / texture.image.height;
      const baseSize = 2.0;
      const gridSize = DIFFICULTY_SETTINGS[difficulty].grid;
      const pieceSize = {
        x: (baseSize * aspectRatio) / gridSize.x,
        y: baseSize / gridSize.y
      };

      setTotalPieces(gridSize.x * gridSize.y);

      // Create shared geometry
      const geometry = new THREE.PlaneGeometry(
        pieceSize.x * 0.98,
        pieceSize.y * 0.98,
        PERFORMANCE_CONFIG.geometryDetail,
        PERFORMANCE_CONFIG.geometryDetail
      );

      // Create pieces
      for (let y = 0; y < gridSize.y; y++) {
        for (let x = 0; x < gridSize.x; x++) {
          const material = new THREE.ShaderMaterial({
            uniforms: {
              map: { value: texture },
              uvOffset: { value: new THREE.Vector2(x / gridSize.x, y / gridSize.y) },
              uvScale: { value: new THREE.Vector2(1 / gridSize.x, 1 / gridSize.y) },
              selected: { value: 0.0 },
              correctPosition: { value: 0.0 },
              ...sharedUniforms
            },
            vertexShader: puzzlePieceShader.vertexShader,
            fragmentShader: puzzlePieceShader.fragmentShader,
            side: THREE.DoubleSide
          });

          const piece = new THREE.Mesh(geometry, material);
          
          piece.position.x = (x - (gridSize.x - 1) / 2) * pieceSize.x;
          piece.position.y = (y - (gridSize.y - 1) / 2) * pieceSize.y;
          piece.position.z = 0;

          piece.userData = {
            originalPosition: piece.position.clone(),
            gridPosition: { x, y },
            isPlaced: false
          };

          sceneRef.current.add(piece);
          puzzlePiecesRef.current.push(piece);
        }
      }

      // Scramble pieces
      const scrambleRadius = Math.max(gridSize.x, gridSize.y) * pieceSize.x;
      puzzlePiecesRef.current.forEach((piece, index) => {
        const angle = (index / puzzlePiecesRef.current.length) * Math.PI * 2;
        const distance = Math.random() * scrambleRadius;
        piece.position.x += Math.cos(angle) * distance;
        piece.position.y += Math.sin(angle) * distance;
        piece.position.z = Math.random() * 0.5;
        
        if (DIFFICULTY_SETTINGS[difficulty].rotationEnabled) {
          piece.rotation.z = (Math.random() - 0.5) * Math.PI * 0.5;
        }
      });

      // Adjust camera
      if (cameraRef.current) {
        const zoomLevel = Math.max(6, Math.min(gridSize.x, gridSize.y) * 1.5);
        cameraRef.current.position.z = zoomLevel;
      }

      setLoading(false);
      setGameState('playing');
      setIsTimerRunning(true);

    } catch (error) {
      console.error('Error creating puzzle pieces:', error);
      setLoading(false);
      alert('Error creating puzzle. Please try again.');
    }
  }, [difficulty, sharedUniforms]);

  // Mouse interaction handling
  const handleMouseDown = useCallback((event) => {
    if (gameState !== 'playing') return;

    event.preventDefault();

    const rect = rendererRef.current.domElement.getBoundingClientRect();
    mouseRef.current.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    mouseRef.current.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

    raycasterRef.current.setFromCamera(mouseRef.current, cameraRef.current);

    const intersects = raycasterRef.current.intersectObjects(puzzlePiecesRef.current);

    if (intersects.length > 0) {
      const piece = intersects[0].object;
      if (!piece.userData.isPlaced) {
        selectedPieceRef.current = piece;
        controlsRef.current.enabled = false;
        
        if (piece.material.uniforms) {
          piece.material.uniforms.selected.value = 1.0;
        }
        
        piece.position.z = 0.1;
        audioManagerRef.current?.play('pickup');
      }
    }
  }, [gameState]);

  const handleMouseMove = useMemo(() => 
    throttle((event) => {
      if (gameState !== 'playing' || !selectedPieceRef.current) return;

      const rect = rendererRef.current.domElement.getBoundingClientRect();
      mouseRef.current.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      mouseRef.current.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

      raycasterRef.current.setFromCamera(mouseRef.current, cameraRef.current);

      const plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
      const intersection = new THREE.Vector3();
      
      raycasterRef.current.ray.intersectPlane(plane, intersection);
      selectedPieceRef.current.position.copy(intersection);

      // Check snap distance
      const originalPos = selectedPieceRef.current.userData.originalPosition;
      const distance = originalPos.distanceTo(selectedPieceRef.current.position);
      
      if (selectedPieceRef.current.material.uniforms) {
        selectedPieceRef.current.material.uniforms.correctPosition.value = 
          distance < DIFFICULTY_SETTINGS[difficulty].snapDistance ? 
          1.0 - (distance / DIFFICULTY_SETTINGS[difficulty].snapDistance) : 0;
      }
    }, PERFORMANCE_CONFIG.raycastThrottle),
    [gameState, difficulty]
  );

  const handleMouseUp = useCallback(() => {
    if (!selectedPieceRef.current) return;

    const piece = selectedPieceRef.current;
    const originalPos = piece.userData.originalPosition;
    const distance = originalPos.distanceTo(piece.position);

    if (distance < DIFFICULTY_SETTINGS[difficulty].snapDistance) {
      handlePieceSnap(piece);
      
      if (!piece.userData.isPlaced) {
        piece.userData.isPlaced = true;
        setCompletedPieces(prev => {
          const newCount = prev + 1;
          setProgress((newCount / totalPieces) * 100);
          return newCount;
        });
        audioManagerRef.current?.play('place');
      }
    }

    // Reset piece state
    if (piece.material.uniforms) {
      piece.material.uniforms.selected.value = 0.0;
      piece.material.uniforms.correctPosition.value = 
        piece.userData.isPlaced ? 1.0 : 0.0;
    }

    if (!piece.userData.isPlaced) {
      piece.position.z = 0;
    }

    selectedPieceRef.current = null;
    controlsRef.current.enabled = true;
  }, [difficulty, totalPieces]);

  // Cleanup function
  const cleanup = useCallback(() => {
    // Clear animation frame
    if (frameRef.current) {
      cancelAnimationFrame(frameRef.current);
    }

    // Clear timer
    if (timerRef.current) {
      clearInterval(timerRef.current);
    }

    // Dispose of Three.js objects
    puzzlePiecesRef.current.forEach(piece => {
      piece.geometry.dispose();
      piece.material.dispose();
      if (piece.material.uniforms?.map?.value) {
        piece.material.uniforms.map.value.dispose();
      }
    });

    if (particleSystemRef.current) {
      particleSystemRef.current.dispose();
    }

    if (rendererRef.current) {
      rendererRef.current.dispose();
    }

    if (composerRef.current) {
      composerRef.current.dispose();
    }

    // Clear audio context
    if (audioManagerRef.current?.context) {
      audioManagerRef.current.context.close();
    }

    // Remove event listeners
    window.removeEventListener('resize', handleResize);
  }, [handleResize]);

  // Handle image upload
  const handleImageUpload = useCallback(async (event) => {
    const file = event.target.files[0];
    if (!file) return;

    setLoading(true);
    try {
      const reader = new FileReader();
      const imageUrl = await new Promise((resolve, reject) => {
        reader.onload = e => resolve(e.target.result);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });

      setImage(imageUrl);
      await createPuzzlePieces(imageUrl);
    } catch (error) {
      console.error('Error loading image:', error);
      alert('Error loading image. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [createPuzzlePieces]);

  // Helper functions for UI
  const formatTime = useCallback((seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }, []);

  // UI Components
  const LoadingOverlay = () => (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 bg-black/75 flex items-center justify-center z-50"
    >
      <div className="text-center">
        <div className="w-16 h-16 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mb-4" />
        <div className="text-xl text-white">Loading puzzle...</div>
      </div>
    </motion.div>
  );

  const ControlPanel = () => (
    <motion.div 
      initial={{ y: -20, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      className="absolute right-4 top-4 flex flex-col gap-2"
    >
      <button onClick={() => cameraRef.current.position.z -= 1} className="control-btn">
        <ZoomIn className="w-5 h-5" />
      </button>
      <button onClick={() => cameraRef.current.position.z += 1} className="control-btn">
        <ZoomOut className="w-5 h-5" />
      </button>
      <button onClick={() => {
        if (cameraRef.current) {
          cameraRef.current.position.set(0, 0, 5);
          cameraRef.current.lookAt(0, 0, 0);
        }
      }} className="control-btn">
        <Maximize2 className="w-5 h-5" />
      </button>
      <button onClick={resetGame} className="control-btn">
        <RotateCcw className="w-5 h-5" />
      </button>
      <button 
        onClick={() => setShowThumbnail(!showThumbnail)} 
        className="control-btn"
      >
        <Image className="w-5 h-5" />
      </button>
    </motion.div>
  );

  // Render
  return (
    <div className="w-full h-screen bg-gray-900 relative">
      <div ref={containerRef} className="w-full h-full">
        {/* Main 3D Canvas */}
      </div>

      {/* Game UI */}
      <div className="absolute top-0 left-0 right-0 p-4 flex justify-between items-center bg-black/50">
        <div className="flex items-center gap-4">
          <input
            type="file"
            accept="image/*"
            onChange={handleImageUpload}
            className="hidden"
            id="image-upload"
          />
          <label
            htmlFor="image-upload"
            className="px-4 py-2 bg-blue-500 text-white rounded-lg cursor-pointer hover:bg-blue-600 transition-colors"
          >
            <Camera className="w-5 h-5 inline-block mr-2" />
            Upload Image
          </label>
          
          <div className="text-white">
            <Clock className="w-4 h-4 inline-block mr-2" />
            {formatTime(timeElapsed)}
          </div>
          
          {progress > 0 && (
            <div className="flex items-center gap-2">
              <div className="text-white">
                Progress: {completedPieces}/{totalPieces}
              </div>
              <div className="w-32 h-2 bg-gray-700 rounded-full overflow-hidden">
                <div 
                  className="h-full bg-green-500 transition-all duration-300"
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>
          )}
        </div>

        <div className="flex items-center gap-4">
          <DifficultyBar
            selectedDifficulty={selectedDifficulty}
            onSelect={setSelectedDifficulty}
          />
          
          {gameState !== 'initial' && (
            <button
              onClick={() => gameState === 'playing' ? pauseGame() : resumeGame()}
              className="p-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg transition-colors"
            >
              {gameState === 'playing' ? <Pause /> : <Play />}
            </button>
          )}
        </div>
      </div>

      {/* Control Panel */}
      <ControlPanel />

      {/* Reference Image */}
      {showThumbnail && image && (
        <motion.div
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.8 }}
          className="absolute left-4 bottom-4 p-2 bg-black/50 rounded-lg"
        >
          <img src={image} alt="Reference" className="w-48 h-auto rounded" />
        </motion.div>
      )}

      {/* Loading Overlay */}
      <AnimatePresence>
        {loading && <LoadingOverlay />}
      </AnimatePresence>

      {/* Game Complete Modal */}
      <AnimatePresence>
        {progress === 100 && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/75 flex items-center justify-center"
          >
            <motion.div
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              className="bg-gray-800 p-6 rounded-xl max-w-md w-full mx-4"
            >
              <h2 className="text-2xl font-bold text-white mb-4">
                Puzzle Complete!
              </h2>
              <p className="text-gray-300 mb-4">
                Time: {formatTime(timeElapsed)}
              </p>
              <div className="flex justify-end gap-4">
                <button
                  onClick={resetGame}
                  className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
                >
                  Play Again
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default PuzzleGame;