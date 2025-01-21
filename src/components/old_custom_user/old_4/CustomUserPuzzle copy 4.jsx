import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';
import { DragControls } from 'three/examples/jsm/controls/DragControls';
import { ZoomIn, ZoomOut, RotateCw, Play, Home, Camera, Share2, HelpCircle } from 'lucide-react';
import gsap from 'gsap';

// Constants
const EXTRUSION_DEPTH = 0.05;
const PIECE_GAP = 0.02;
const POSITION_TOLERANCE = 0.1;
const ROTATION_TOLERANCE = 0.1;
const DEFAULT_DIFFICULTY = 3;
const MIN_DIFFICULTY = 2;
const MAX_DIFFICULTY = 6;
const MAX_IMAGE_SIZE = 5 * 1024 * 1024;
const GRID_COLOR_EMPTY = 0x0066ff;
const GRID_COLOR_FILLED = 0x00ff66;
const GRID_COLOR_HIGHLIGHT = 0xffff00;

const PhotoPuzzle3D = () => {
    // Refs
    const mountRef = useRef(null);
    const rendererRef = useRef(null);
    const sceneRef = useRef(null);
    const cameraRef = useRef(null);
    const orbitControlsRef = useRef(null);
    const dragControlsRef = useRef(null);
    const animationFrameRef = useRef(null);
    const timerRef = useRef(null);
    const piecesRef = useRef([]);
    const placementBoxesRef = useRef([]);

    // Memoized initial state
    const initialGameState = useMemo(() => ({
        imageUrl: '',
        difficulty: DEFAULT_DIFFICULTY,
        timer: 0,
        isStarted: false,
        isCompleted: false,
        startTime: null,
        progress: 0
    }), []);

    const initialUiState = useMemo(() => ({
        loading: false,
        error: null,
        showTutorial: !localStorage.getItem('tutorialShown'),
        thumbnailUrl: null
    }), []);

    // State
    const [gameState, setGameState] = useState(initialGameState);
    const [ui, setUi] = useState(initialUiState);
    const [selectedPiece, setSelectedPiece] = useState(null);

    // Initialize scene - now with proper cleanup
    const initScene = useCallback(() => {
        if (!mountRef.current || sceneRef.current) return;

        // Scene
        const scene = new THREE.Scene();
        scene.background = new THREE.Color(0xf5f5f5);
        sceneRef.current = scene;

        // Camera
        const camera = new THREE.PerspectiveCamera(
            75,
            mountRef.current.clientWidth / mountRef.current.clientHeight,
            0.1,
            1000
        );
        camera.position.set(0, 0, 5);
        cameraRef.current = camera;

        // Renderer
        const renderer = new THREE.WebGLRenderer({
            antialias: true,
            powerPreference: "high-performance"
        });
        renderer.setSize(mountRef.current.clientWidth, mountRef.current.clientHeight);
        renderer.shadowMap.enabled = true;
        renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        mountRef.current.appendChild(renderer.domElement);
        rendererRef.current = renderer;

        // Lights
        const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
        scene.add(ambientLight);

        const mainLight = new THREE.DirectionalLight(0xffffff, 0.8);
        mainLight.position.set(5, 5, 7);
        mainLight.castShadow = true;
        mainLight.shadow.camera.near = 0.1;
        mainLight.shadow.camera.far = 20;
        mainLight.shadow.mapSize.width = 2048;
        mainLight.shadow.mapSize.height = 2048;
        scene.add(mainLight);

        // Controls
        const controls = new OrbitControls(camera, renderer.domElement);
        controls.enableDamping = true;
        controls.dampingFactor = 0.05;
        controls.minDistance = 3;
        controls.maxDistance = 10;
        orbitControlsRef.current = controls;

        // Animation loop with proper cleanup
        let animationFrameId;
        const animate = () => {
            animationFrameId = requestAnimationFrame(animate);
            controls.update();
            renderer.render(scene, camera);
        };
        animate();
        animationFrameRef.current = animationFrameId;

        // Resize handler
        const handleResize = () => {
            if (!mountRef.current) return;
            const width = mountRef.current.clientWidth;
            const height = mountRef.current.clientHeight;
            camera.aspect = width / height;
            camera.updateProjectionMatrix();
            renderer.setSize(width, height);
        };

        window.addEventListener('resize', handleResize);

        // Return cleanup function
        return () => {
            window.removeEventListener('resize', handleResize);
            if (animationFrameId) {
                cancelAnimationFrame(animationFrameId);
            }
            if (controls) {
                controls.dispose();
            }
            scene.traverse((object) => {
                if (object.geometry) {
                    object.geometry.dispose();
                }
                if (object.material) {
                    if (Array.isArray(object.material)) {
                        object.material.forEach(material => material.dispose());
                    } else {
                        object.material.dispose();
                    }
                }
            });
            renderer.dispose();
            if (mountRef.current?.contains(renderer.domElement)) {
                mountRef.current.removeChild(renderer.domElement);
            }
        };
    }, []);

    // Create placement boxes - optimized version
    const createPlacementBoxes = useCallback(() => {
        if (!sceneRef.current) return;

        // Clear existing boxes
        placementBoxesRef.current.forEach(box => {
            sceneRef.current.remove(box);
            box.geometry.dispose();
            box.material.dispose();
        });
        placementBoxesRef.current = [];

        const boxes = [];
        const boxSize = 1 / gameState.difficulty;
        const totalSize = 2;
        const startX = -totalSize / 2 + boxSize / 2;
        const startY = -totalSize / 2 + boxSize / 2;

        // Reuse geometry for all boxes
        const geometry = new THREE.BoxGeometry(boxSize, boxSize, EXTRUSION_DEPTH);
        const edges = new THREE.EdgesGeometry(geometry);

        for (let i = 0; i < gameState.difficulty; i++) {
            for (let j = 0; j < gameState.difficulty; j++) {
                const box = new THREE.LineSegments(
                    edges,
                    new THREE.LineBasicMaterial({ color: GRID_COLOR_EMPTY })
                );

                const x = startX + i * boxSize;
                const y = startY + j * boxSize;
                box.position.set(x, y, -EXTRUSION_DEPTH/2);

                box.userData = {
                    gridPosition: { x: i, y: j },
                    isFilled: false
                };

                sceneRef.current.add(box);
                boxes.push(box);
            }
        }

        placementBoxesRef.current = boxes;
        geometry.dispose();
        edges.dispose();
    }, [gameState.difficulty]);

    // Create puzzle pieces - optimized version
    const createPuzzlePieces = useCallback((texture) => {
        if (!sceneRef.current) return;

        // Clean up existing pieces
        piecesRef.current.forEach(piece => {
            sceneRef.current.remove(piece);
            piece.geometry.dispose();
            if (Array.isArray(piece.material)) {
                piece.material.forEach(mat => mat.dispose());
            } else {
                piece.material.dispose();
            }
        });
        piecesRef.current = [];

        const pieces = [];
        const { difficulty } = gameState;
        const pieceSize = 1 / difficulty;

        // Reuse geometry for all pieces
        const geometry = new THREE.BoxGeometry(
            pieceSize - PIECE_GAP,
            pieceSize - PIECE_GAP,
            EXTRUSION_DEPTH
        );

        for (let i = 0; i < difficulty; i++) {
            for (let j = 0; j < difficulty; j++) {
                const materials = [
                    new THREE.MeshPhongMaterial({
                        map: texture.clone(),
                        shininess: 30
                    }),
                    new THREE.MeshPhongMaterial({
                        color: 0x808080,
                        shininess: 30
                    })
                ];

                const piece = new THREE.Mesh(geometry, materials);

                // Set initial position in a circle
                const angle = (i * difficulty + j) * (Math.PI * 2) / (difficulty * difficulty);
                const radius = 3;
                piece.position.set(
                    Math.cos(angle) * radius,
                    Math.sin(angle) * radius,
                    0
                );

                // UV mapping
                const uvAttribute = piece.geometry.attributes.uv;
                for (let k = 0; k < uvAttribute.count; k++) {
                    uvAttribute.setXY(
                        k,
                        (i + uvAttribute.getX(k)) / difficulty,
                        1 - ((j + uvAttribute.getY(k)) / difficulty)
                    );
                }

                piece.userData = {
                    gridPosition: { x: i, y: j },
                    isPlaced: false,
                    correctPosition: new THREE.Vector3(
                        (-1 + pieceSize) + i * (pieceSize * 2),
                        (-1 + pieceSize) + j * (pieceSize * 2),
                        0
                    )
                };

                sceneRef.current.add(piece);
                pieces.push(piece);
            }
        }

        piecesRef.current = pieces;
        setupDragControls(pieces);
        geometry.dispose();
    }, [gameState.difficulty]);

    // Setup drag controls - separated for clarity
    const setupDragControls = useCallback((pieces) => {
        if (!cameraRef.current || !rendererRef.current) return;

        if (dragControlsRef.current) {
            dragControlsRef.current.dispose();
        }

        const dragControls = new DragControls(
            pieces,
            cameraRef.current,
            rendererRef.current.domElement
        );

        dragControls.addEventListener('dragstart', (event) => {
            if (orbitControlsRef.current) {
                orbitControlsRef.current.enabled = false;
            }
            setSelectedPiece(event.object);
        });

        dragControls.addEventListener('drag', (event) => {
            event.object.position.z = 0;
            highlightClosestBox(event.object);
        });

        dragControls.addEventListener('dragend', (event) => {
            if (orbitControlsRef.current) {
                orbitControlsRef.current.enabled = true;
            }
            snapToClosestBox(event.object);
            setSelectedPiece(null);
        });

        dragControlsRef.current = dragControls;
    }, []);

    // Highlight closest box during drag
    const highlightClosestBox = useCallback((piece) => {
        const closestBox = findClosestBox(piece);
        placementBoxesRef.current.forEach(box => {
            box.material.color.setHex(
                box === closestBox ? GRID_COLOR_HIGHLIGHT : GRID_COLOR_EMPTY
            );
        });
    }, []);

    // Find closest box to piece
    const findClosestBox = useCallback((piece) => {
        let closestBox = null;
        let minDistance = Infinity;

        placementBoxesRef.current.forEach(box => {
            if (!box.userData.isFilled) {
                const distance = piece.position.distanceTo(box.position);
                if (distance < minDistance) {
                    minDistance = distance;
                    closestBox = box;
                }
            }
        });

        return minDistance < 1 ? closestBox : null;
    }, []);

    // Snap piece to closest box
    const snapToClosestBox = useCallback((piece) => {
        const closestBox = findClosestBox(piece);
        if (!closestBox) return;

        gsap.to(piece.position, {
            x: closestBox.position.x,
            y: closestBox.position.y,
            z: 0,
            duration: 0.3,
            ease: "back.out(2)",
            onComplete: () => checkPlacement(piece, closestBox)
        });
    }, []);

    // Check piece placement
    const checkPlacement = useCallback((piece, box) => {
        const isCorrect = 
            piece.userData.gridPosition.x === box.userData.gridPosition.x &&
            piece.userData.gridPosition.y === box.userData.gridPosition.y;

        if (isCorrect) {
            piece.userData.isPlaced = true;
            box.userData.isFilled = true;
            box.material.color.setHex(GRID_COLOR_FILLED);

            // Update progress
            const placedCount = piecesRef.current.filter(p => p.userData.isPlaced).length;
            const progress = (placedCount / piecesRef.current.length) * 100;
            
            setGameState(prev => ({
                ...prev,
                progress,
                isCompleted: progress === 100
            }));

            // Success effect
            createSuccessEffect(piece);
        }
    }, []);

    // Create success effect
    const createSuccessEffect = useCallback((piece) => {
        if (!sceneRef.current) return;

        const flashMaterial = new THREE.MeshBasicMaterial({
            color: 0x00ff00,
            transparent: true,
            opacity: 0.5
        });

        const flash = new THREE.Mesh(piece.geometry.clone(), flashMaterial);
        flash.position.copy(piece.position);
        sceneRef.current.add(flash);

        gsap.to(flashMaterial, {
            opacity: 0,
            duration: 1,
            ease: "power2.out",
            onComplete: () => {
                sceneRef.current?.remove(flash);
                flash.geometry.dispose();
                flashMaterial.dispose();
            }
        });
    }, []);

    // Start game
    const startGame = useCallback(() => {
        setGameState(prev => ({
            ...prev,
            isStarted: true,
            startTime: Date.now(),
            timer: 0,
            isCompleted: false,
            progress: 0
        }));
    }, []);

    // Effect for scene initialization
    useEffect(() => {
        const cleanup = initScene();
        return cleanup;
    }, [initScene]);

    // Effect for timer
    useEffect(() => {
        if (gameState.isStarted && !gameState.isCompleted) {
            timerRef.current = setInterval(() => {
                setGameState(prev => ({
                    ...prev,
                    timer: Math.floor((Date.now() - prev.startTime) / 1000)
                }));
            }, 1000);

            return () => {
                if (timerRef.current) {
                    clearInterval(timerRef.current);
                }
            };
        }
    }, [gameState.isStarted, gameState.isCompleted]);

    // Handle image upload with optimized texture loading
    const handleImageUpload = useCallback(async (event) => {
        const file = event.target.files?.[0];
        if (!file) return;

        try {
            setUi(prev => ({ ...prev, loading: true, error: null }));

            if (file.size > MAX_IMAGE_SIZE) {
                throw new Error('Image must be smaller than 5MB');
            }

            if (!file.type.startsWith('image/')) {
                throw new Error('File must be an image');
            }

            const imageUrl = URL.createObjectURL(file);
            
            // Create texture loader
            const textureLoader = new THREE.TextureLoader();
            const texture = await new Promise((resolve, reject) => {
                textureLoader.load(
                    imageUrl,
                    (texture) => {
                        texture.minFilter = THREE.LinearFilter;
                        texture.magFilter = THREE.LinearFilter;
                        resolve(texture);
                    },
                    undefined,
                    reject
                );
            });

            // Create thumbnail
            const thumbnailCanvas = document.createElement('canvas');
            thumbnailCanvas.width = 150;
            thumbnailCanvas.height = 150;
            const ctx = thumbnailCanvas.getContext('2d');
            ctx.drawImage(texture.image, 0, 0, thumbnailCanvas.width, thumbnailCanvas.height);
            
            setGameState(prev => ({ ...prev, imageUrl }));
            setUi(prev => ({ ...prev, thumbnailUrl: thumbnailCanvas.toDataURL() }));
            
            // Create placement boxes first
            createPlacementBoxes();
            // Then create puzzle pieces
            createPuzzlePieces(texture);

        } catch (err) {
            console.error('Image upload error:', err);
            setUi(prev => ({
                ...prev,
                error: err.message || 'Failed to upload image'
            }));
        } finally {
            setUi(prev => ({ ...prev, loading: false }));
        }
    }, [createPlacementBoxes, createPuzzlePieces]);

    // Tutorial component - memoized to prevent recreation
    const Tutorial = useMemo(() => () => (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white p-8 rounded-xl shadow-2xl max-w-lg w-full space-y-6">
                <h2 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
                    <HelpCircle className="h-6 w-6" />
                    How to Play
                </h2>
                <div className="space-y-4">
                    <div className="space-y-2">
                        <h3 className="font-semibold text-gray-700">Controls</h3>
                        <ul className="text-sm text-gray-600 space-y-1">
                            <li>• Click and drag pieces to move them</li>
                            <li>• Scroll to zoom in/out</li>
                            <li>• Right-click and drag to rotate view</li>
                            <li>• Press R or use rotate button for piece rotation</li>
                        </ul>
                    </div>
                    <div className="space-y-2">
                        <h3 className="font-semibold text-gray-700">Placement Guide</h3>
                        <ul className="text-sm text-gray-600 space-y-1">
                            <li>• Blue boxes: Empty spots</li>
                            <li>• Yellow highlight: Valid drop zone</li>
                            <li>• Green boxes: Correct placements</li>
                            <li>• Pieces snap to nearest valid position</li>
                        </ul>
                    </div>
                </div>
                <button
                    onClick={() => {
                        setUi(prev => ({ ...prev, showTutorial: false }));
                        localStorage.setItem('tutorialShown', 'true');
                    }}
                    className="w-full bg-blue-500 hover:bg-blue-600 text-white px-6 py-3 rounded-lg transition-colors"
                >
                    Got it!
                </button>
            </div>
        </div>
    ), []);

    // Rotate selected piece
    const handleRotate = useCallback(() => {
        if (!selectedPiece) return;

        gsap.to(selectedPiece.rotation, {
            z: selectedPiece.rotation.z + Math.PI/2,
            duration: 0.3,
            ease: "power2.out"
        });
    }, [selectedPiece]);

    // Reset camera position
    const resetCamera = useCallback(() => {
        if (!cameraRef.current || !orbitControlsRef.current) return;

        gsap.to(cameraRef.current.position, {
            x: 0,
            y: 0,
            z: 5,
            duration: 1,
            ease: "power2.inOut"
        });

        gsap.to(orbitControlsRef.current.target, {
            x: 0,
            y: 0,
            z: 0,
            duration: 1,
            ease: "power2.inOut"
        });
    }, []);

    // Update difficulty
    const handleDifficultyChange = useCallback((newDifficulty) => {
        setGameState(prev => ({ ...prev, difficulty: newDifficulty }));
        createPlacementBoxes(newDifficulty);
    }, [createPlacementBoxes]);

    return (
        <div className="flex flex-col h-screen bg-gray-100">
            {/* Header */}
            <div className="flex justify-between items-center px-6 py-4 bg-white shadow-md">
                <h1 className="text-2xl font-bold text-gray-800">3D Photo Puzzle</h1>
                <div className="flex items-center gap-4">
                    <div className="text-lg font-semibold">
                        Time: {Math.floor(gameState.timer / 60)}:
                        {String(gameState.timer % 60).padStart(2, '0')}
                    </div>
                    <button
                        onClick={() => setUi(prev => ({ ...prev, showTutorial: true }))}
                        className="p-2 rounded-lg hover:bg-gray-100 transition-colors"
                        title="How to Play"
                    >
                        <HelpCircle className="h-5 w-5" />
                    </button>
                </div>
            </div>

            {/* Main content */}
            <div className="flex flex-1 overflow-hidden">
                {/* Side panel */}
                <div className="w-72 bg-white shadow-lg p-6 space-y-6 flex flex-col">
                    {/* Thumbnail */}
                    {ui.thumbnailUrl && (
                        <div className="space-y-2">
                            <h3 className="font-semibold text-gray-700">Reference Image</h3>
                            <div className="relative rounded-lg overflow-hidden shadow-md">
                                <img
                                    src={ui.thumbnailUrl}
                                    alt="Puzzle reference"
                                    className="w-full object-cover"
                                />
                            </div>
                        </div>
                    )}

                    {/* Progress */}
                    {gameState.isStarted && (
                        <div className="space-y-2">
                            <h3 className="font-semibold text-gray-700">Progress</h3>
                            <div className="h-4 bg-gray-200 rounded-full overflow-hidden">
                                <div
                                    className="h-full bg-green-500 transition-all duration-300 ease-out"
                                    style={{ width: `${gameState.progress}%` }}
                                />
                            </div>
                            <div className="text-sm text-gray-600 text-center">
                                {Math.round(gameState.progress)}% Complete
                            </div>
                        </div>
                    )}

                    {/* Controls */}
                    {!gameState.imageUrl ? (
                        <div className="flex-1 flex flex-col justify-center">
                            <label className="flex flex-col items-center gap-4 p-8 border-2 border-dashed border-gray-300 rounded-lg cursor-pointer hover:border-gray-400 transition-colors">
                                <Camera className="h-12 w-12 text-gray-400" />
                                <span className="text-sm text-gray-600">Upload an image to start</span>
                                <input
                                    type="file"
                                    accept="image/*"
                                    onChange={handleImageUpload}
                                    className="hidden"
                                />
                            </label>
                        </div>
                    ) : !gameState.isStarted ? (
                        <div className="space-y-4">
                            <div className="space-y-2">
                                <label className="text-sm font-medium text-gray-700">
                                    Difficulty
                                </label>
                                <select
                                    value={gameState.difficulty}
                                    onChange={(e) => handleDifficultyChange(parseInt(e.target.value))}
                                    className="w-full px-3 py-2 border rounded-lg"
                                >
                                    {Array.from(
                                        { length: MAX_DIFFICULTY - MIN_DIFFICULTY + 1 },
                                        (_, i) => MIN_DIFFICULTY + i
                                    ).map(level => (
                                        <option key={level} value={level}>
                                            {level}x{level} ({level * level} pieces)
                                        </option>
                                    ))}
                                </select>
                            </div>
                            <button
                                onClick={startGame}
                                className="w-full bg-blue-500 hover:bg-blue-600 text-white px-4 py-2 rounded-lg transition-colors"
                            >
                                <Play className="h-4 w-4 inline mr-2" />
                                Start Game
                            </button>
                        </div>
                    ) : (
                        <div className="space-y-4">
                            <div className="space-y-2">
                                <h3 className="font-semibold text-gray-700">Controls</h3>
                                <div className="grid grid-cols-2 gap-2">
                                    <button
                                        onClick={handleRotate}
                                        className="p-2 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors flex items-center justify-center"
                                        disabled={!selectedPiece}
                                    >
                                        <RotateCw className="h-4 w-4 mr-1" />
                                        Rotate
                                    </button>
                                    <button
                                        onClick={resetCamera}
                                        className="p-2 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors flex items-center justify-center"
                                    >
                                        <Home className="h-4 w-4 mr-1" />
                                        Reset View
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}
                </div>

                {/* 3D View */}
                <div className="flex-1 relative">
                    <div
                        ref={mountRef}
                        className="w-full h-full bg-gradient-to-b from-gray-100 to-gray-200"
                    />

                    {/* Loading overlay */}
                    {ui.loading && (
                        <div className="absolute inset-0 bg-black bg-opacity-50 flex items-center justify-center">
                            <div className="animate-spin rounded-full h-16 w-16 border-t-2 border-b-2 border-white"></div>
                        </div>
                    )}

                    {/* Error message */}
                    {ui.error && (
                        <div className="absolute top-4 right-4 bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded-lg">
                            {ui.error}
                        </div>
                    )}
                </div>
            </div>

            {/* Tutorial modal */}
            {ui.showTutorial && <Tutorial />}

            {/* Completion modal */}
            {gameState.isCompleted && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
                    <div className="bg-white p-8 rounded-xl shadow-2xl max-w-md w-full space-y-6">
                        <h2 className="text-2xl font-bold text-gray-800">
                            Puzzle Completed! 🎉
                        </h2>
                        <p className="text-gray-600">
                            Time: {Math.floor(gameState.timer / 60)}:
                            {String(gameState.timer % 60).padStart(2, '0')}
                        </p>
                        <button
                            onClick={() => window.location.reload()}
                            className="w-full bg-blue-500 hover:bg-blue-600 text-white px-6 py-3 rounded-lg transition-colors"
                        >
                            Play Again
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
};

export default PhotoPuzzle3D;