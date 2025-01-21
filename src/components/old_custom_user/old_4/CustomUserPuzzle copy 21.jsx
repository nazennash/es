import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass';
import { OutlinePass } from 'three/examples/jsm/postprocessing/OutlinePass';
import { 
  Camera, Check, Info, Clock, Trophy, Settings, 
  Volume2, VolumeX, ZoomIn, ZoomOut, RotateCcw,
  HelpCircle, Award, Medal
} from 'lucide-react';

// Constants and configurations
const DIFFICULTY_SETTINGS = {
  easy: { 
    grid: { x: 3, y: 2 }, 
    snapDistance: 0.4, 
    rotationEnabled: false,
    timeThresholds: { bronze: 120, silver: 90, gold: 60 }
  },
  medium: { 
    grid: { x: 4, y: 3 }, 
    snapDistance: 0.3, 
    rotationEnabled: true,
    timeThresholds: { bronze: 300, silver: 240, gold: 180 }
  },
  hard: { 
    grid: { x: 5, y: 4 }, 
    snapDistance: 0.2, 
    rotationEnabled: true,
    timeThresholds: { bronze: 600, silver: 480, gold: 360 }
  },
  expert: { 
    grid: { x: 6, y: 5 }, 
    snapDistance: 0.15, 
    rotationEnabled: true,
    timeThresholds: { bronze: 900, silver: 720, gold: 540 }
  }
};

const ACHIEVEMENTS = [
  {
    id: 'speed_demon',
    name: 'Speed Demon',
    description: 'Complete puzzle under time threshold',
    icon: '⚡',
    conditions: { timeUnder: 120 }
  },
  {
    id: 'perfectionist',
    name: 'Perfectionist',
    description: 'Complete without misplacing pieces',
    icon: '✨',
    conditions: { noMisplaces: true }
  },
  {
    id: 'master_puzzler',
    name: 'Master Puzzler',
    description: 'Complete on expert difficulty',
    icon: '🏆',
    conditions: { difficulty: 'expert' }
  }
];

// Custom shaders
const puzzlePieceShader = {
  vertexShader: `
    varying vec2 vUv;
    varying vec3 vNormal;
    varying vec3 vViewPosition;
    varying vec3 vWorldPosition;
    
    uniform vec2 uvOffset;
    uniform vec2 uvScale;
    uniform sampler2D heightMap;
    uniform float extrusionScale;
    uniform float time;
    uniform float selected;
    
    void main() {
      vUv = uvOffset + uv * uvScale;
      
      // Enhanced height mapping
      vec4 heightColor = texture2D(heightMap, vUv);
      float height = (heightColor.r + heightColor.g + heightColor.b) / 3.0;
      
      // Base height + extrusion
      vec3 newPosition = position;
      newPosition.z += 0.1 + height * extrusionScale;
      
      // Floating animation for unplaced pieces
      float floatOffset = (1.0 - selected) * sin(time * 2.0 + position.x * 4.0) * 0.05;
      newPosition.z += floatOffset;
      
      // Enhanced normal calculation
      float eps = 0.01;
      float heightU = texture2D(heightMap, vUv + vec2(eps, 0.0)).r;
      float heightV = texture2D(heightMap, vUv + vec2(0.0, eps)).r;
      
      vec3 normal = normalize(vec3(
        (height - heightU) / eps,
        (height - heightV) / eps,
        1.0
      ));
      
      vNormal = normalMatrix * normal;
      vec4 mvPosition = modelViewMatrix * vec4(newPosition, 1.0);
      vViewPosition = -mvPosition.xyz;
      vWorldPosition = (modelMatrix * vec4(newPosition, 1.0)).xyz;
      
      gl_Position = projectionMatrix * mvPosition;
    }
  `,
  fragmentShader: `
    uniform sampler2D map;
    uniform float selected;
    uniform float correctPosition;
    uniform float time;
    uniform vec3 highlightColor;
    uniform float highlightIntensity;
    
    varying vec2 vUv;
    varying vec3 vNormal;
    varying vec3 vViewPosition;
    varying vec3 vWorldPosition;
    
    void main() {
      vec4 texColor = texture2D(map, vUv);
      
      // Enhanced lighting setup
      vec3 normal = normalize(vNormal);
      vec3 viewDir = normalize(vViewPosition);
      
      // Key light
      vec3 lightPos = vec3(5.0, 5.0, 5.0);
      vec3 lightDir = normalize(lightPos);
      float diff = max(dot(normal, lightDir), 0.0);
      
      // Fill light
      vec3 fillLightPos = vec3(-3.0, -3.0, 3.0);
      vec3 fillLightDir = normalize(fillLightPos);
      float fillDiff = max(dot(normal, fillLightDir), 0.0) * 0.5;
      
      // Rim light
      float rimStrength = pow(1.0 - max(dot(viewDir, normal), 0.0), 3.0);
      
      // Specular highlight
      vec3 halfwayDir = normalize(lightDir + viewDir);
      float spec = pow(max(dot(normal, halfwayDir), 0.0), 32.0);
      
      // Edge detection
      float edgeWidth = 0.05;
      vec2 uvDelta = fwidth(vUv);
      vec2 uvEdge = smoothstep(vec2(0.0), uvDelta * 2.0, vUv) * 
                    smoothstep(vec2(0.0), uvDelta * 2.0, vec2(1.0) - vUv);
      float edge = min(uvEdge.x, uvEdge.y);
      
      // Selection effects
      vec3 selectionColor = vec3(0.3, 0.6, 1.0);
      float selectionStrength = selected * (0.5 + 0.5 * sin(time * 3.0));
      
      // Position feedback
      vec3 correctColor = vec3(0.2, 1.0, 0.3);
      float correctStrength = correctPosition * (0.5 + 0.5 * sin(time * 2.0));
      
      // Combine lighting
      vec3 ambient = vec3(0.4);
      vec3 diffuse = vec3(0.6) * (diff + fillDiff);
      vec3 rim = vec3(0.5, 0.5, 0.7) * rimStrength;
      vec3 specular = vec3(0.5) * spec;
      vec3 edgeColor = vec3(0.2) * (1.0 - edge);
      
      // Final color
      vec3 finalColor = texColor.rgb * (ambient + diffuse) + rim + specular + edgeColor;
      finalColor += selectionColor * selectionStrength + correctColor * correctStrength;
      
      // Enhance contrast and saturation
      finalColor = pow(finalColor, vec3(0.95));
      float luminance = dot(finalColor, vec3(0.299, 0.587, 0.114));
      finalColor = mix(finalColor, vec3(luminance), -0.2);
      
      // Add highlight glow
      finalColor += highlightColor * highlightIntensity;
      
      gl_FragColor = vec4(finalColor, 1.0);
    }
  `
};

// Sound system
class SoundSystem {
  constructor() {
    this.context = new (window.AudioContext || window.webkitAudioContext)();
    this.sounds = {};
    this.enabled = true;
    this.initialize();
  }

  async initialize() {
    this.sounds = {
      pickup: this.createToneBuffer(440, 0.1),
      place: this.createToneBuffer(880, 0.15),
      complete: this.createToneBuffer([523.25, 659.25, 783.99], 0.3),
      error: this.createToneBuffer([400, 200], 0.2),
      achievement: this.createToneBuffer([600, 800, 1000], 0.4)
    };
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

      const guide = new THREE.Mesh(guideGeometry, guideMaterial);
      guide.position.copy(piece.userData.originalPosition);
      guide.position.z = -0.01; // Slightly behind actual pieces
      
      this.guides.set(index, guide);
      this.scene.add(guide);

      // Create path line for piece movement prediction
      const pathGeometry = new THREE.BufferGeometry();
      const pathMaterial = new THREE.LineBasicMaterial({
        color: 0x4CAF50,
        transparent: true,
        opacity: 0.5,
        linewidth: 2
      });
      
      const pathLine = new THREE.Line(pathGeometry, pathMaterial);
      this.pathLines.set(index, pathLine);
      this.scene.add(pathLine);
    });
  }

  updateGuides(activePiece) {
    this.guides.forEach((guide, index) => {
      const piece = this.puzzlePieces[index];
      
      if (piece.userData.isPlaced) {
        guide.visible = false;
        this.pathLines.get(index).visible = false;
      } else {
        guide.visible = true;
        
        // Update path line if this is the active piece
        if (activePiece && piece === activePiece) {
          const pathLine = this.pathLines.get(index);
          pathLine.visible = true;
          
          // Calculate path points
          const startPos = activePiece.position;
          const endPos = guide.position;
          const controlPoint = new THREE.Vector3(
            (startPos.x + endPos.x) / 2,
            (startPos.y + endPos.y) / 2,
            startPos.z + 0.5
          );
          
          // Create smooth curve for path
          const curve = new THREE.QuadraticBezierCurve3(
            startPos,
            controlPoint,
            endPos
          );
          
          const points = curve.getPoints(20);
          pathLine.geometry.setFromPoints(points);
          
          // Calculate distance for highlight intensity
          const distance = startPos.distanceTo(endPos);
          const highlightIntensity = Math.max(0, 1 - (distance / 0.5));
          guide.material.uniforms.highlight.value = highlightIntensity;
          guide.material.uniforms.opacity.value = this.guideOpacity + (highlightIntensity * 0.2);
          
          // Update path line color based on proximity
          pathLine.material.color.setHSL(
            highlightIntensity * 0.3, // Green to yellow
            0.8,
            0.5
          );
        } else {
          this.pathLines.get(index).visible = false;
          guide.material.uniforms.highlight.value = 0;
          guide.material.uniforms.opacity.value = this.guideOpacity;
        }
      }
    });
  }

  showHint(pieceIndex) {
    const guide = this.guides.get(pieceIndex);
    if (guide) {
      // Create pulsing highlight effect
      const duration = 1000; // ms
      const startTime = Date.now();
      
      const pulseEffect = () => {
        const elapsed = Date.now() - startTime;
        if (elapsed < duration) {
          const intensity = 0.5 + 0.5 * Math.sin((elapsed / duration) * Math.PI * 4);
          guide.material.uniforms.highlight.value = intensity;
          guide.material.uniforms.opacity.value = this.guideOpacity + (intensity * 0.3);
          requestAnimationFrame(pulseEffect);
        } else {
          guide.material.uniforms.highlight.value = 0;
          guide.material.uniforms.opacity.value = this.guideOpacity;
        }
      };
      
      pulseEffect();
    }
  }

  toggleGuides(show) {
    this.guides.forEach(guide => {
      guide.visible = show;
    });
    this.pathLines.forEach(line => {
      line.visible = false;
    });
  }

  dispose() {
    this.guides.forEach(guide => {
      guide.geometry.dispose();
      guide.material.dispose();
      this.scene.remove(guide);
    });
    this.pathLines.forEach(line => {
      line.geometry.dispose();
      line.material.dispose();
      this.scene.remove(line);
    });
    this.guides.clear();
    this.pathLines.clear();
  }
}

// Achievement system
class AchievementSystem {
  constructor(onAchievement) {
    this.achievements = new Map(ACHIEVEMENTS.map(a => [a.id, { ...a, earned: false }]));
    this.onAchievement = onAchievement;
  }

  checkAchievements(stats) {
    this.achievements.forEach((achievement, id) => {
      if (!achievement.earned) {
        const earned = this.evaluateConditions(achievement.conditions, stats);
        if (earned) {
          achievement.earned = true;
          this.onAchievement(achievement);
        }
      }
    });
  }

  evaluateConditions(conditions, stats) {
    return Object.entries(conditions).every(([condition, value]) => {
      switch (condition) {
        case 'timeUnder':
          return stats.timeElapsed / 1000 < value;
        case 'noMisplaces':
          return stats.misplacedAttempts === 0;
        case 'difficulty':
          return stats.difficulty === value;
        default:
          return false;
      }
    });
  }

  getEarnedAchievements() {
    return Array.from(this.achievements.values()).filter(a => a.earned);
  }
}
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

// Particle system for visual effects
class ParticleSystem {
  constructor(scene) {
    this.scene = scene;
    this.systems = new Map();
    this.initialize();
  }

  initialize() {
    // Create different particle effects
    this.createParticleSystem('place', {
      size: 0.05,
      count: 30,
      color: 0x4CAF50,
      lifetime: 1.0,
      spread: 0.2
    });

    this.createParticleSystem('complete', {
      size: 0.08,
      count: 100,
      color: 0xFFC107,
      lifetime: 2.0,
      spread: 1.0
    });

    this.createParticleSystem('trail', {
      size: 0.03,
      count: 50,
      color: 0x2196F3,
      lifetime: 0.5,
      spread: 0.1
    });
  }

  createParticleSystem(name, config) {
    const geometry = new THREE.BufferGeometry();
    const material = new THREE.PointsMaterial({
      size: config.size,
      map: this.createParticleTexture(),
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      color: config.color
    });

    const system = {
      points: new THREE.Points(geometry, material),
      particles: [],
      config
    };

    this.scene.add(system.points);
    this.systems.set(name, system);
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
    const system = this.systems.get(type);
    if (!system) return;

    const count = options.count || system.config.count;
    const spread = options.spread || system.config.spread;

    for (let i = 0; i < count; i++) {
      const velocity = new THREE.Vector3(
        (Math.random() - 0.5) * spread,
        (Math.random() - 0.5) * spread,
        Math.random() * spread
      );

      system.particles.push({
        position: position.clone(),
        velocity,
        life: system.config.lifetime
      });
    }
  }

  update(deltaTime) {
    this.systems.forEach(system => {
      system.particles = system.particles.filter(particle => {
        particle.life -= deltaTime;
        particle.position.add(particle.velocity.multiplyScalar(deltaTime));
        particle.velocity.y -= deltaTime * 0.5; // Gravity
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

// Guide system for piece placement
class GuideSystem {
  constructor(scene, puzzlePieces) {
    this.scene = scene;
    this.puzzlePieces = puzzlePieces;
    this.guides = new Map();
    this.guideOpacity = 0.3;
    this.pathLines = new Map();
    this.initializeGuides();
  }

  initializeGuides() {
    this.puzzlePieces.forEach((piece, index) => {
      // Create guide for piece
      const guideGeometry = piece.geometry.clone();
      const guideMaterial = new THREE.ShaderMaterial({
        uniforms: {
          ...piece.material.uniforms,
          opacity: { value: this.guideOpacity },
          highlight: { value: 0.0 }
        },
        vertexShader: puzzlePieceShader.vertexShader,
        fragmentShader: puzzlePieceShader.fragmentShader,
        transparent: true,
        depthWrite: false



// Main PuzzleGame Component
const PuzzleGame = () => {
  // State management
  const [difficulty, setDifficulty] = useState('medium');
  const [showGuides, setShowGuides] = useState(true);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [image, setImage] = useState(null);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [completedPieces, setCompletedPieces] = useState(0);
  const [totalPieces, setTotalPieces] = useState(0);
  const [timeElapsed, setTimeElapsed] = useState(0);
  const [isTimerActive, setIsTimerActive] = useState(false);
  const [bestTimes, setBestTimes] = useState({
    easy: null,
    medium: null,
    hard: null,
    expert: null
  });
  const [showSettings, setShowSettings] = useState(false);
  const [showTutorial, setShowTutorial] = useState(false);
  const [achievements, setAchievements] = useState([]);
  const [showAchievement, setShowAchievement] = useState(null);

  // Refs for Three.js objects
  const containerRef = useRef(null);
  const sceneRef = useRef(null);
  const cameraRef = useRef(null);
  const rendererRef = useRef(null);
  const composerRef = useRef(null);
  const controlsRef = useRef(null);
  const clockRef = useRef(new THREE.Clock());
  const puzzlePiecesRef = useRef([]);
  const selectedPieceRef = useRef(null);
  const guidesRef = useRef(null);
  const particlesRef = useRef(null);
  const soundSystemRef = useRef(null);
  const achievementSystemRef = useRef(null);
  const timerRef = useRef(null);
  const statsRef = useRef({
    misplacedAttempts: 0,
    difficulty: 'medium',
    timeElapsed: 0
  });

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

    // Renderer setup with anti-aliasing and high pixel ratio
    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
      powerPreference: "high-performance"
    });
    renderer.setSize(containerRef.current.clientWidth, containerRef.current.clientHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    containerRef.current.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    // Post-processing setup
    const composer = new EffectComposer(renderer);
    const renderPass = new RenderPass(scene, camera);
    composer.addPass(renderPass);

    // Bloom effect for glow
    const bloomPass = new UnrealBloomPass(
      new THREE.Vector2(window.innerWidth, window.innerHeight),
      0.5, // Bloom strength
      0.4, // Radius
      0.85 // Threshold
    );
    composer.addPass(bloomPass);

    // Outline pass for piece selection
    const outlinePass = new OutlinePass(
      new THREE.Vector2(window.innerWidth, window.innerHeight),
      scene,
      camera
    );
    outlinePass.visibleEdgeColor = new THREE.Color(0x00ff00);
    outlinePass.hiddenEdgeColor = new THREE.Color(0x00ff00);
    outlinePass.edgeStrength = 3;
    outlinePass.edgeGlow = 0;
    composer.addPass(outlinePass);
    
    composerRef.current = composer;

    // Controls setup
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.maxDistance = 10;
    controls.minDistance = 2;
    controls.enablePan = true;
    controls.enableZoom = true;
    controls.autoRotate = false;
    controlsRef.current = controls;

    // Lighting setup
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.4);
    scene.add(ambientLight);

    const mainLight = new THREE.DirectionalLight(0xffffff, 0.8);
    mainLight.position.set(5, 5, 5);
    mainLight.castShadow = true;
    scene.add(mainLight);

    const fillLight = new THREE.DirectionalLight(0xffffff, 0.4);
    fillLight.position.set(-5, -5, 5);
    scene.add(fillLight);

    // Initialize systems
    soundSystemRef.current = new SoundSystem();
    particlesRef.current = new ParticleSystem(scene);
    achievementSystemRef.current = new AchievementSystem(handleAchievement);

    // Animation loop
    const animate = () => {
      requestAnimationFrame(animate);
      
      const deltaTime = clockRef.current.getDelta();
      
      // Update controls
      controls.update();
      
      // Update particles
      particlesRef.current.update(deltaTime);
      
      // Update shader uniforms
      puzzlePiecesRef.current.forEach(piece => {
        if (piece.material.uniforms) {
          piece.material.uniforms.time.value = clockRef.current.getElapsedTime();
        }
      });
      
      // Update guides
      if (guidesRef.current) {
        guidesRef.current.updateGuides(selectedPieceRef.current);
      }
      
      // Render scene with post-processing
      composer.render();
    };
    animate();

    // Cleanup
    return () => {
      // Stop animation loop
      renderer.setAnimationLoop(null);
      
      // Dispose of Three.js resources
      renderer.dispose();
      renderer.forceContextLoss();
      
      // Remove canvas
      if (containerRef.current?.contains(renderer.domElement)) {
        containerRef.current.removeChild(renderer.domElement);
      }
      
      // Clear puzzle pieces
      puzzlePiecesRef.current.forEach(piece => {
        piece.geometry.dispose();
        piece.material.dispose();
      });
      puzzlePiecesRef.current = [];
      
      // Dispose of guide system
      guidesRef.current?.dispose();
      
      // Clear timer
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    };
  }, []);

  // Handle window resize
  useEffect(() => {
    const handleResize = () => {
      if (!containerRef.current || !cameraRef.current || !rendererRef.current || !composerRef.current) return;

      const width = containerRef.current.clientWidth;
      const height = containerRef.current.clientHeight;

      // Update camera
      cameraRef.current.aspect = width / height;
      cameraRef.current.updateProjectionMatrix();

      // Update renderer and composer
      rendererRef.current.setSize(width, height);
      composerRef.current.setSize(width, height);
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Timer management
  const startTimer = useCallback(() => {
    const startTime = Date.now() - timeElapsed;
    setIsTimerActive(true);
    
    timerRef.current = setInterval(() => {
      const newTime = Date.now() - startTime;
      setTimeElapsed(newTime);
      statsRef.current.timeElapsed = newTime;
    }, 1000);
  }, [timeElapsed]);

  const stopTimer = useCallback(() => {
    clearInterval(timerRef.current);
    setIsTimerActive(false);
  }, []);

  const formatTime = (ms) => {
    const seconds = Math.floor((ms / 1000) % 60);
    const minutes = Math.floor((ms / 1000 / 60) % 60);
    return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  };

  // Achievement handling
  const handleAchievement = useCallback((achievement) => {
    setAchievements(prev => [...prev, achievement]);
    setShowAchievement(achievement);
    soundSystemRef.current?.play('achievement');
    
    setTimeout(() => {
      setShowAchievement(null);
    }, 3000);
  }, []);

  // Create puzzle pieces
  const createPuzzlePieces = async (imageUrl) => {
    if (!sceneRef.current) return;

    // Clear existing pieces and guides
    puzzlePiecesRef.current.forEach(piece => {
      sceneRef.current.remove(piece);
    });
    guidesRef.current?.dispose();
    puzzlePiecesRef.current = [];

    // Reset game state
    setTimeElapsed(0);
    statsRef.current = {
      misplacedAttempts: 0,
      difficulty,
      timeElapsed: 0
    };
    startTimer();

    // Load texture
    const texture = await new THREE.TextureLoader().loadAsync(imageUrl);
    const aspectRatio = texture.image.width / texture.image.height;
    
    // Get grid size from difficulty settings
    const gridSize = DIFFICULTY_SETTINGS[difficulty].grid;
    setTotalPieces(gridSize.x * gridSize.y);
    
    const pieceSize = {
      x: 1 * aspectRatio / gridSize.x,
      y: 1 / gridSize.y
    };

    // Generate pieces
    for (let y = 0; y < gridSize.y; y++) {
      for (let x = 0; x < gridSize.x; x++) {
        // Create geometry with more segments for better extrusion detail
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
            time: { value: 0.0 },
            highlightColor: { value: new THREE.Color(0x4CAF50) },
            highlightIntensity: { value: 0.0 }
          },
          vertexShader: puzzlePieceShader.vertexShader,
          fragmentShader: puzzlePieceShader.fragmentShader,
          side: THREE.DoubleSide,
          transparent: true
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
        piece.userData.index = puzzlePiecesRef.current.length;

        sceneRef.current.add(piece);
        puzzlePiecesRef.current.push(piece);
      }
    }

    // Initialize guide system
    guidesRef.current = new GuideSystem(sceneRef.current, puzzlePiecesRef.current);
    guidesRef.current.toggleGuides(showGuides);

    // Scramble pieces
    puzzlePiecesRef.current.forEach(piece => {
      // Random position within a reasonable area
      piece.position.x += (Math.random() - 0.5) * 2;
      piece.position.y += (Math.random() - 0.5) * 2;
      piece.position.z += Math.random() * 0.5;
      
      // Random rotation if enabled for current difficulty
      if (DIFFICULTY_SETTINGS[difficulty].rotationEnabled) {
        piece.rotation.z = (Math.random() - 0.5) * Math.PI / 2;
      }
    });
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

        // Play sound
        soundSystemRef.current?.play('pickup');

        // Update selection state
        selectedPieceRef.current.material.uniforms.selected.value = 1.0;
        
        // Create drag plane
        const normal = new THREE.Vector3(0, 0, 1);
        dragPlane.setFromNormalAndCoplanarPoint(
          normal,
          selectedPieceRef.current.position
        );

        // Emit trail particles
        particlesRef.current?.emit('trail', selectedPieceRef.current.position);
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
        
        // Emit trail particles while moving
        if (Math.random() > 0.7) { // Throttle particle emission
          particlesRef.current?.emit('trail', selectedPieceRef.current.position, {
            count: 2,
            spread: 0.05
          });
        }
        
        // Check proximity to correct position
        const originalPos = selectedPieceRef.current.userData.originalPosition;
        const distance = originalPos.distanceTo(selectedPieceRef.current.position);
        const snapDistance = DIFFICULTY_SETTINGS[difficulty].snapDistance;
        
        // Visual feedback for proximity
        if (distance < snapDistance * 1.5) {
          selectedPieceRef.current.material.uniforms.correctPosition.value = 
            1.0 - (distance / (snapDistance * 1.5));
            
          // Update highlight color based on proximity
          const hue = THREE.MathUtils.lerp(0.3, 0.15, distance / snapDistance);
          selectedPieceRef.current.material.uniforms.highlightColor.value.setHSL(hue, 1, 0.5);
          selectedPieceRef.current.material.uniforms.highlightIntensity.value = 
            0.3 * (1.0 - distance / snapDistance);
        } else {
          selectedPieceRef.current.material.uniforms.correctPosition.value = 0.0;
          selectedPieceRef.current.material.uniforms.highlightIntensity.value = 0.0;
        }

        // Update guide system
        guidesRef.current?.updateGuides(selectedPieceRef.current);
      };

      const handleMouseUp = () => {
        if (!selectedPieceRef.current) return;

        // Check if piece is close to correct position
        const originalPos = selectedPieceRef.current.userData.originalPosition;
        const distance = originalPos.distanceTo(selectedPieceRef.current.position);
        const snapDistance = DIFFICULTY_SETTINGS[difficulty].snapDistance;

        if (distance < snapDistance) {
          // Snap to correct position
          selectedPieceRef.current.position.copy(originalPos);
          if (DIFFICULTY_SETTINGS[difficulty].rotationEnabled) {
            selectedPieceRef.current.rotation.z = 0;
          }
          
          if (!selectedPieceRef.current.userData.isPlaced) {
            // Mark as placed and update progress
            selectedPieceRef.current.userData.isPlaced = true;
            setCompletedPieces(prev => {
              const newCount = prev + 1;
              setProgress((newCount / totalPieces) * 100);
              
              // Check for puzzle completion
              if (newCount === totalPieces) {
                handlePuzzleComplete();
              }
              
              return newCount;
            });

            // Effects for correct placement
            particlesRef.current?.emit('place', selectedPieceRef.current.position);
            soundSystemRef.current?.play('place');
          }
        } else {
          // Piece was misplaced
          statsRef.current.misplacedAttempts++;
          soundSystemRef.current?.play('error');
          
          // Shake effect for incorrect placement
          const startPos = selectedPieceRef.current.position.clone();
          const shakeStrength = 0.05;
          let shakeTime = 0;
          
          const shakeEffect = () => {
            shakeTime += 0.1;
            if (shakeTime < Math.PI) {
              selectedPieceRef.current.position.x = 
                startPos.x + Math.sin(shakeTime * 8) * shakeStrength * (1 - shakeTime / Math.PI);
              selectedPieceRef.current.position.y = 
                startPos.y + Math.cos(shakeTime * 8) * shakeStrength * (1 - shakeTime / Math.PI);
              requestAnimationFrame(shakeEffect);
            }
          };
          
          shakeEffect();
        }

        // Reset piece state
        selectedPieceRef.current.material.uniforms.selected.value = 0.0;
        selectedPieceRef.current.material.uniforms.correctPosition.value = 
          selectedPieceRef.current.userData.isPlaced ? 1.0 : 0.0;
        selectedPieceRef.current.material.uniforms.highlightIntensity.value = 0.0;
        
        // Update guide system
        guidesRef.current?.updateGuides(null);
        
        selectedPieceRef.current = null;
        isDragging = false;
        controlsRef.current.enabled = true;
      };

      // Add touch support
      const handleTouchStart = (event) => {
        event.preventDefault();
        const touch = event.touches[0];
        handleMouseDown({ 
          preventDefault: () => {},
          clientX: touch.clientX,
          clientY: touch.clientY
        });
      };

      const handleTouchMove = (event) => {
        event.preventDefault();
        const touch = event.touches[0];
        handleMouseMove({
          clientX: touch.clientX,
          clientY: touch.clientY
        });
      };

      const handleTouchEnd = (event) => {
        event.preventDefault();
        handleMouseUp();
      };

      const element = rendererRef.current.domElement;
      element.addEventListener('mousedown', handleMouseDown);
      element.addEventListener('mousemove', handleMouseMove);
      element.addEventListener('mouseup', handleMouseUp);
      element.addEventListener('mouseleave', handleMouseUp);
      element.addEventListener('touchstart', handleTouchStart);
      element.addEventListener('touchmove', handleTouchMove);
      element.addEventListener('touchend', handleTouchEnd);

      return () => {
        element.removeEventListener('mousedown', handleMouseDown);
        element.removeEventListener('mousemove', handleMouseMove);
        element.removeEventListener('mouseup', handleMouseUp);
        element.removeEventListener('mouseleave', handleMouseUp);
        element.removeEventListener('touchstart', handleTouchStart);
        element.removeEventListener('touchmove', handleTouchMove);
        element.removeEventListener('touchend', handleTouchEnd);
      };
    }, [difficulty]);