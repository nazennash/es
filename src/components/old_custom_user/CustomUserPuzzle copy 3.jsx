import React, { useState, useEffect, useRef, useCallback } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';
import { DragControls } from 'three/examples/jsm/controls/DragControls';
import { ZoomIn, ZoomOut, RotateCw, Play, Home, Camera, Share2, Info, HelpCircle } from 'lucide-react';
import gsap from 'gsap';

// Constants
const EXTRUSION_DEPTH = 0.05;
const PIECE_GAP = 0.02;
const POSITION_TOLERANCE = 0.1;
const ROTATION_TOLERANCE = 0.1;
const DEFAULT_DIFFICULTY = 3;
const MIN_DIFFICULTY = 2;
const MAX_DIFFICULTY = 6;
const MAX_IMAGE_SIZE = 5 * 1024 * 1024; // 5MB
const GRID_COLOR_EMPTY = 0x0066ff;
const GRID_COLOR_FILLED = 0x00ff66;

const PhotoPuzzle3D = () => {
    // Game state
    const [gameState, setGameState] = useState({
        imageUrl: '',
        difficulty: DEFAULT_DIFFICULTY,
        timer: 0,
        isStarted: false,
        isCompleted: false,
        startTime: null,
        progress: 0
    });

    // Scene state
    const [sceneState, setSceneState] = useState({
        pieces: [],
        selectedPiece: null,
        isDragging: false,
        placementBoxes: []
    });

    // UI state
    const [ui, setUi] = useState({
        loading: false,
        error: null,
        showControls: true,
        showTutorial: !localStorage.getItem('tutorialShown'),
        thumbnailUrl: null
    });

    // Refs
    const mountRef = useRef(null);
    const sceneRef = useRef(null);
    const cameraRef = useRef(null);
    const rendererRef = useRef(null);
    const orbitControlsRef = useRef(null);
    const dragControlsRef = useRef(null);
    const gridRef = useRef(null);
    const timerRef = useRef(null);
    const animationFrameRef = useRef(null);

    // Create placement boxes
    const createPlacementBoxes = useCallback((difficulty) => {
        if (!sceneRef.current) return;

        // Remove existing boxes
        sceneState.placementBoxes.forEach(box => sceneRef.current.remove(box));

        const boxes = [];
        const boxSize = 1 / difficulty;
        const totalSize = 2; // Total grid size
        const startX = -totalSize / 2 + boxSize / 2;
        const startY = -totalSize / 2 + boxSize / 2;

        for (let i = 0; i < difficulty; i++) {
            for (let j = 0; j < difficulty; j++) {
                // Create box outline
                const geometry = new THREE.BoxGeometry(boxSize, boxSize, EXTRUSION_DEPTH);
                const edges = new THREE.EdgesGeometry(geometry);
                const box = new THREE.LineSegments(
                    edges,
                    new THREE.LineBasicMaterial({ 
                        color: GRID_COLOR_EMPTY,
                        linewidth: 2
                    })
                );

                // Position box
                const x = startX + i * boxSize;
                const y = startY + j * boxSize;
                box.position.set(x, y, -EXTRUSION_DEPTH/2);

                // Add metadata
                box.userData = {
                    isPlacementBox: true,
                    gridPosition: { x: i, y: j },
                    isFilled: false
                };

                sceneRef.current.add(box);
                boxes.push(box);
            }
        }

        setSceneState(prev => ({ ...prev, placementBoxes: boxes }));
    }, [sceneState.placementBoxes]);

    // Initialize scene with improved lighting
    const initScene = useCallback(() => {
        if (!mountRef.current) return;

        // Scene setup
        const scene = new THREE.Scene();
        scene.background = new THREE.Color(0xf5f5f5);
        sceneRef.current = scene;

        // Camera setup
        const camera = new THREE.PerspectiveCamera(
            75,
            mountRef.current.clientWidth / mountRef.current.clientHeight,
            0.1,
            1000
        );
        camera.position.set(0, 0, 5);
        cameraRef.current = camera;

        // Renderer setup
        const renderer = new THREE.WebGLRenderer({ 
            antialias: true,
            alpha: true
        });
        renderer.setSize(mountRef.current.clientWidth, mountRef.current.clientHeight);
        renderer.shadowMap.enabled = true;
        renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        mountRef.current.appendChild(renderer.domElement);
        rendererRef.current = renderer;

        // Enhanced lighting setup
        const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
        scene.add(ambientLight);

        const mainLight = new THREE.DirectionalLight(0xffffff, 0.8);
        mainLight.position.set(5, 5, 7);
        mainLight.castShadow = true;
        mainLight.shadow.camera.near = 0.1;
        mainLight.shadow.camera.far = 20;
        mainLight.shadow.camera.right = 10;
        mainLight.shadow.camera.left = -10;
        mainLight.shadow.camera.top = 10;
        mainLight.shadow.camera.bottom = -10;
        mainLight.shadow.mapSize.width = 2048;
        mainLight.shadow.mapSize.height = 2048;
        scene.add(mainLight);

        const fillLight = new THREE.DirectionalLight(0xffffff, 0.4);
        fillLight.position.set(-5, 3, 4);
        scene.add(fillLight);

        // Controls setup
        const orbitControls = new OrbitControls(camera, renderer.domElement);
        orbitControls.enableDamping = true;
        orbitControls.dampingFactor = 0.05;
        orbitControls.screenSpacePanning = true;
        orbitControls.minDistance = 3;
        orbitControls.maxDistance = 10;
        orbitControls.maxPolarAngle = Math.PI / 2;
        orbitControlsRef.current = orbitControls;

        // Create initial placement grid
        createPlacementBoxes(gameState.difficulty);

        // Animation loop
        const animate = () => {
            animationFrameRef.current = requestAnimationFrame(animate);
            orbitControls.update();
            renderer.render(scene, camera);
            gsap.ticker.tick();
        };
        animate();

        // Window resize handler
        const handleResize = () => {
            if (!mountRef.current) return;
            const width = mountRef.current.clientWidth;
            const height = mountRef.current.clientHeight;
            camera.aspect = width / height;
            camera.updateProjectionMatrix();
            renderer.setSize(width, height);
        };
        window.addEventListener('resize', handleResize);

        return () => {
            window.removeEventListener('resize', handleResize);
            if (animationFrameRef.current) {
                cancelAnimationFrame(animationFrameRef.current);
            }
            if (mountRef.current && renderer.domElement) {
                mountRef.current.removeChild(renderer.domElement);
            }
            renderer.dispose();
        };
    }, [gameState.difficulty, createPlacementBoxes]);

    // Create puzzle pieces with improved sizing
    const createPuzzlePieces = useCallback((texture) => {
        if (!sceneRef.current) return;

        // Clear existing pieces
        sceneState.pieces.forEach(piece => sceneRef.current.remove(piece));

        const pieces = [];
        const { difficulty } = gameState;
        const pieceSize = 1 / difficulty;
        const totalSize = 2; // Match with placement grid size
        const startX = -totalSize / 2 + pieceSize / 2;
        const startY = -totalSize / 2 + pieceSize / 2;

        // Create pieces
        for (let i = 0; i < difficulty; i++) {
            for (let j = 0; j < difficulty; j++) {
                // Create piece geometry with exact size match to placement boxes
                const geometry = new THREE.BoxGeometry(
                    pieceSize - PIECE_GAP,
                    pieceSize - PIECE_GAP,
                    EXTRUSION_DEPTH
                );

                // Create materials
                const materials = [
                    new THREE.MeshPhongMaterial({
                        map: texture,
                        shininess: 30
                    }),
                    new THREE.MeshPhongMaterial({
                        color: 0x808080,
                        shininess: 30
                    })
                ];

                // Create mesh
                const piece = new THREE.Mesh(geometry, materials);

                // Set correct position
                const correctX = startX + i * pieceSize;
                const correctY = startY + j * pieceSize;

                // Random initial position (in a circle around the puzzle)
                const angle = Math.random() * Math.PI * 2;
                const radius = 3;
                piece.position.set(
                    Math.cos(angle) * radius,
                    Math.sin(angle) * radius,
                    0
                );

                // UV mapping for texture
                const uvAttribute = piece.geometry.attributes.uv;
                for (let k = 0; k < uvAttribute.count; k++) {
                    uvAttribute.setXY(
                        k,
                        (i + uvAttribute.getX(k)) / difficulty,
                        1 - ((j + uvAttribute.getY(k)) / difficulty)
                    );
                }

                // Add metadata
                piece.userData = {
                    isPuzzlePiece: true,
                    isPlaced: false,
                    correctPosition: new THREE.Vector3(correctX, correctY, 0),
                    gridPosition: { x: i, y: j },
                    id: `piece-${i}-${j}`
                };

                piece.castShadow = true;
                piece.receiveShadow = true;

                sceneRef.current.add(piece);
                pieces.push(piece);
            }
        }

        // Setup drag controls
        if (dragControlsRef.current) {
            dragControlsRef.current.dispose();
        }

        const dragControls = new DragControls(pieces, cameraRef.current, rendererRef.current.domElement);
        
        dragControls.addEventListener('dragstart', (event) => {
            orbitControlsRef.current.enabled = false;
            const piece = event.object;
            
            // Highlight potential placement spots
            sceneState.placementBoxes.forEach(box => {
                box.material.color.setHex(GRID_COLOR_EMPTY);
            });

            gsap.to(piece.position, {
                z: 0.2,
                duration: 0.2,
                ease: "power2.out"
            });

            setSceneState(prev => ({
                ...prev,
                selectedPiece: piece,
                isDragging: true
            }));
        });

        dragControls.addEventListener('drag', (event) => {
            const piece = event.object;
            piece.position.z = 0.2; // Keep piece elevated while dragging

            // Highlight closest placement box
            const closestBox = findClosestPlacementBox(piece);
            if (closestBox) {
                sceneState.placementBoxes.forEach(box => {
                    box.material.color.setHex(
                        box === closestBox ? 0xffff00 : GRID_COLOR_EMPTY
                    );
                });
            }
        });

        dragControls.addEventListener('dragend', (event) => {
            orbitControlsRef.current.enabled = true;
            const piece = event.object;
            
            // Find closest placement box
            const closestBox = findClosestPlacementBox(piece);
            if (closestBox) {
                // Snap to box position
                gsap.to(piece.position, {
                    x: closestBox.position.x,
                    y: closestBox.position.y,
                    z: 0,
                    duration: 0.3,
                    ease: "back.out(2)",
                    onComplete: () => checkPiecePlacement(piece)
                });
            }

            setSceneState(prev => ({
                ...prev,
                isDragging: false
            }));
        });

        dragControlsRef.current = dragControls;
        setSceneState(prev => ({ ...prev, pieces }));

    }, [gameState.difficulty, sceneState.placementBoxes]);

    // Find closest placement box to piece
    const findClosestPlacementBox = useCallback((piece) => {
        if (!sceneState.placementBoxes.length) return null;

        let closestBox = null;
        let minDistance = Infinity;

        sceneState.placementBoxes.forEach(box => {
            const distance = piece.position.distanceTo(box.position);
            if (distance < minDistance && !box.userData.isFilled) {
                minDistance = distance;
                closestBox = box;
            }
        });

        return minDistance < 1 ? closestBox : null;
    }, [sceneState.placementBoxes]);

    // Check piece placement with enhanced feedback
    const checkPiecePlacement = useCallback((piece) => {
        if (!piece.userData?.correctPosition || piece.userData.isPlaced) return false;

        const positionCorrect = piece.position.distanceTo(piece.userData.correctPosition) < POSITION_TOLERANCE;
        const rotationCorrect = 
            Math.abs(piece.rotation.x % (Math.PI * 2)) < ROTATION_TOLERANCE &&
            Math.abs(piece.rotation.y % (Math.PI * 2)) < ROTATION_TOLERANCE &&
            Math.abs(piece.rotation.z % (Math.PI * 2)) < ROTATION_TOLERANCE;

        if (positionCorrect && rotationCorrect) {
            // Snap to exact position
            gsap.to(piece.position, {
                ...piece.userData.correctPosition,
                duration: 0.3,
                ease: "back.out(2)"
            });

            gsap.to(piece.rotation, {
                x: 0,
                y: 0,
                z: 0,
                duration: 0.3,
                ease: "back.out(2)"
            });

            // Update placement box
            const box = sceneState.placementBoxes.find(
                box => box.userData.gridPosition.x === piece.userData.gridPosition.x &&
                       box.userData.gridPosition.y === piece.userData.gridPosition.y
            );

            if (box) {
                box.material.color.setHex(GRID_COLOR_FILLED);
                box.userData.isFilled = true;
            }

            // Success effects
            piece.userData.isPlaced = true;

            // Create success flash effect
            const flashGeometry = piece.geometry.clone();
            const flashMaterial = new THREE.MeshBasicMaterial({
                color: 0x00ff00,
                transparent: true,
                opacity: 0.5
            });
            const flash = new THREE.Mesh(flashGeometry, flashMaterial);
            flash.position.copy(piece.position);
            sceneRef.current.add(flash);

            // Animate flash effect
            gsap.to(flashMaterial, {
                opacity: 0,
                duration: 1,
                ease: "power2.out",
                onComplete: () => {
                    sceneRef.current.remove(flash);
                    flash.geometry.dispose();
                    flashMaterial.dispose();
                }
            });

            // Update progress
            const progress = (sceneState.pieces.filter(p => p.userData.isPlaced).length / sceneState.pieces.length) * 100;
            setGameState(prev => ({ ...prev, progress }));

            // Check if puzzle is completed
            if (progress === 100) {
                handlePuzzleComplete();
            }

            return true;
        }

        return false;
    }, [sceneState.pieces, sceneState.placementBoxes]);

    // Tutorial component
    const Tutorial = () => (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white p-8 rounded-xl shadow-2xl max-w-lg w-full space-y-6">
                <h2 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
                    <HelpCircle className="h-6 w-6" />
                    How to Play
                </h2>
                <div className="space-y-4">
                    <div className="space-y-2">
                        <h3 className="font-semibold text-gray-700">Basic Controls</h3>
                        <ul className="list-disc list-inside text-gray-600">
                            <li>Click and drag pieces to move them</li>
                            <li>Use scroll wheel to zoom in/out</li>
                            <li>Right-click and drag to rotate view</li>
                            <li>Click a piece to select it</li>
                            <li>Press 'R' or use rotate button to rotate selected piece</li>
                        </ul>
                    </div>
                    <div className="space-y-2">
                        <h3 className="font-semibold text-gray-700">Placement Guide</h3>
                        <ul className="list-disc list-inside text-gray-600">
                            <li>Blue boxes show empty placement spots</li>
                            <li>Yellow highlight shows valid drop zones</li>
                            <li>Green boxes indicate correct placements</li>
                            <li>Pieces snap to nearest valid position</li>
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
    );

    // Effect hooks
    useEffect(() => {
        const cleanup = initScene();
        return () => {
            if (cleanup) cleanup();
            if (timerRef.current) clearInterval(timerRef.current);
        };
    }, [initScene]);

    useEffect(() => {
        if (gameState.isStarted && !gameState.isCompleted) {
            timerRef.current = setInterval(() => {
                setGameState(prev => ({
                    ...prev,
                    timer: Math.floor((Date.now() - prev.startTime) / 1000)
                }));
            }, 1000);
        }
        return () => {
            if (timerRef.current) clearInterval(timerRef.current);
        };
    }, [gameState.isStarted, gameState.isCompleted]);

    // Handle image upload
    const handleImageUpload = async (event) => {
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
            const textureLoader = new THREE.TextureLoader();
            
            const texture = await new Promise((resolve, reject) => {
                textureLoader.load(
                    imageUrl,
                    resolve,
                    undefined,
                    reject
                );
            });

            setGameState(prev => ({ ...prev, imageUrl }));
            createPuzzlePieces(texture);

            // Create thumbnail
            const thumbnailCanvas = document.createElement('canvas');
            thumbnailCanvas.width = 150;
            thumbnailCanvas.height = 150;
            const ctx = thumbnailCanvas.getContext('2d');
            ctx.drawImage(texture.image, 0, 0, thumbnailCanvas.width, thumbnailCanvas.height);
            setUi(prev => ({ ...prev, thumbnailUrl: thumbnailCanvas.toDataURL() }));

        } catch (err) {
            console.error('Image upload error:', err);
            setUi(prev => ({
                ...prev,
                error: err.message || 'Failed to upload image'
            }));
        } finally {
            setUi(prev => ({ ...prev, loading: false }));
        }
    };

    // Start game
    const startGame = useCallback(() => {
        if (!gameState.imageUrl) return;

        setGameState(prev => ({
            ...prev,
            isStarted: true,
            startTime: Date.now(),
            timer: 0,
            isCompleted: false,
            progress: 0
        }));

        // Reset piece positions
        const radius = 3;
        sceneState.pieces.forEach((piece, index) => {
            const angle = (index / sceneState.pieces.length) * Math.PI * 2;
            gsap.to(piece.position, {
                x: Math.cos(angle) * radius,
                y: Math.sin(angle) * radius,
                z: 0,
                duration: 0.5,
                ease: "back.out(1.2)",
                delay: index * 0.05
            });
        });
    }, [gameState.imageUrl, sceneState.pieces]);

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
                                    onChange={(e) => {
                                        const newDifficulty = parseInt(e.target.value);
                                        setGameState(prev => ({
                                            ...prev,
                                            difficulty: newDifficulty
                                        }));
                                        createPlacementBoxes(newDifficulty);
                                    }}
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
                                <ul className="text-sm text-gray-600 space-y-1">
                                    <li>• Drag pieces to move</li>
                                    <li>• Click to select</li>
                                    <li>• R to rotate selected</li>
                                    <li>• Mouse wheel to zoom</li>
                                    <li>• Right click to orbit</li>
                                </ul>
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
        </div>
    );
};

export default PhotoPuzzle3D;