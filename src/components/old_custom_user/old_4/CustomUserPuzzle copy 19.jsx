import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';

const PuzzleGame = () => {
  const containerRef = useRef(null);
  const [image, setImage] = useState(null);
  const [loading, setLoading] = useState(false);
  const sceneRef = useRef(null);
  const cameraRef = useRef(null);
  const rendererRef = useRef(null);
  const controlsRef = useRef(null);
  const puzzlePiecesRef = useRef([]);
  const selectedPieceRef = useRef(null);
  const mousePosRef = useRef(new THREE.Vector2());
  const raycasterRef = useRef(new THREE.Raycaster());

  // Initialize Three.js scene
  useEffect(() => {
    if (!containerRef.current) return;

    // Scene setup
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xf0f0f0);
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
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(containerRef.current.clientWidth, containerRef.current.clientHeight);
    containerRef.current.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    // Controls setup
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controlsRef.current = controls;

    // Lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambientLight);

    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight.position.set(10, 10, 10);
    scene.add(directionalLight);

    // Animation loop
    const animate = () => {
      requestAnimationFrame(animate);
      controls.update();
      renderer.render(scene, camera);
    };
    animate();

    // Cleanup
    return () => {
      renderer.dispose();
      containerRef.current?.removeChild(renderer.domElement);
    };
  }, []);

  // Handle window resize
  useEffect(() => {
    const handleResize = () => {
      if (!containerRef.current || !cameraRef.current || !rendererRef.current) return;

      const width = containerRef.current.clientWidth;
      const height = containerRef.current.clientHeight;

      cameraRef.current.aspect = width / height;
      cameraRef.current.updateProjectionMatrix();
      rendererRef.current.setSize(width, height);
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Create puzzle pieces from image
  const createPuzzlePieces = async (imageUrl) => {
    if (!sceneRef.current) return;

    const texture = await new THREE.TextureLoader().loadAsync(imageUrl);
    const aspectRatio = texture.image.width / texture.image.height;
    
    // Create height map from image
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    canvas.width = texture.image.width;
    canvas.height = texture.image.height;
    ctx.drawImage(texture.image, 0, 0);
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    
    // Define puzzle grid
    const gridSize = { x: 3, y: 2 };
    const pieceSize = {
      x: 1 * aspectRatio / gridSize.x,
      y: 1 / gridSize.y
    };

    // Generate pieces
    for (let y = 0; y < gridSize.y; y++) {
      for (let x = 0; x < gridSize.x; x++) {
        // Create piece geometry
        const geometry = new THREE.PlaneGeometry(
          pieceSize.x * 0.95, 
          pieceSize.y * 0.95,
          32, // More segments for better extrusion detail
          32
        );
        
        // Create custom shader material for extrusion effect
        const material = new THREE.ShaderMaterial({
          uniforms: {
            map: { value: texture },
            heightMap: { value: texture }, // Using same texture for height, could be separate
            uvOffset: { value: new THREE.Vector2(x / gridSize.x, y / gridSize.y) },
            uvScale: { value: new THREE.Vector2(1 / gridSize.x, 1 / gridSize.y) },
            extrusionScale: { value: 0.15 } // Controls depth of relief
          },
          vertexShader: `
            varying vec2 vUv;
            varying vec3 vNormal;
            uniform vec2 uvOffset;
            uniform vec2 uvScale;
            uniform sampler2D heightMap;
            uniform float extrusionScale;

            void main() {
              vUv = uvOffset + uv * uvScale;
              
              // Sample height map for vertex displacement
              vec4 heightColor = texture2D(heightMap, vUv);
              float height = (heightColor.r + heightColor.g + heightColor.b) / 3.0;
              
              // Calculate displaced position
              vec3 newPosition = position;
              newPosition.z += height * extrusionScale;
              
              // Calculate normal for lighting
              float eps = 0.01;
              float heightU = texture2D(heightMap, vUv + vec2(eps, 0.0)).r;
              float heightV = texture2D(heightMap, vUv + vec2(0.0, eps)).r;
              
              vec3 normal = normalize(vec3(
                (height - heightU) / eps,
                (height - heightV) / eps,
                1.0
              ));
              
              vNormal = normalMatrix * normal;
              
              vec4 modelPosition = modelMatrix * vec4(newPosition, 1.0);
              vec4 viewPosition = viewMatrix * modelPosition;
              vec4 projectedPosition = projectionMatrix * viewPosition;
              
              gl_Position = projectedPosition;
            }
          `,
          fragmentShader: `
            uniform sampler2D map;
            varying vec2 vUv;
            varying vec3 vNormal;
            
            void main() {
              vec4 texColor = texture2D(map, vUv);
              
              // Basic lighting calculation
              vec3 light = normalize(vec3(1.0, 1.0, 2.0));
              float diff = max(dot(vNormal, light), 0.0);
              vec3 ambient = vec3(0.3);
              vec3 diffuse = vec3(0.7) * diff;
              
              gl_FragColor = vec4(texColor.rgb * (ambient + diffuse), texColor.a);
            }
          `
        });

        const piece = new THREE.Mesh(geometry, material);
        
        // Position piece
        piece.position.x = (x - gridSize.x / 2 + 0.5) * pieceSize.x;
        piece.position.y = (y - gridSize.y / 2 + 0.5) * pieceSize.y;
        piece.position.z = 0;

        // Store original position for snapping
        piece.userData.originalPosition = piece.position.clone();
        piece.userData.gridPosition = { x, y };

        sceneRef.current.add(piece);
        puzzlePiecesRef.current.push(piece);
      }
    }

    // Scramble pieces
    puzzlePiecesRef.current.forEach(piece => {
      piece.position.x += (Math.random() - 0.5) * 2;
      piece.position.y += (Math.random() - 0.5) * 2;
      piece.position.z += Math.random() * 0.5;
    });
  };

  // Handle image upload
  const handleImageUpload = (event) => {
    const file = event.target.files[0];
    if (!file) return;

    setLoading(true);
    const reader = new FileReader();
    reader.onload = (e) => {
      setImage(e.target.result);
      createPuzzlePieces(e.target.result).then(() => setLoading(false));
    };
    reader.readAsDataURL(file);
  };

  // Handle mouse/touch interaction
  useEffect(() => {
    if (!rendererRef.current) return;

    const handleMouseDown = (event) => {
      event.preventDefault();
      
      const rect = rendererRef.current.domElement.getBoundingClientRect();
      mousePosRef.current.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      mousePosRef.current.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

      raycasterRef.current.setFromCamera(mousePosRef.current, cameraRef.current);
      const intersects = raycasterRef.current.intersectObjects(puzzlePiecesRef.current);

      if (intersects.length > 0) {
        controlsRef.current.enabled = false;
        selectedPieceRef.current = intersects[0].object;
      }
    };

    const handleMouseMove = (event) => {
      if (!selectedPieceRef.current) return;

      const rect = rendererRef.current.domElement.getBoundingClientRect();
      mousePosRef.current.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      mousePosRef.current.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

      raycasterRef.current.setFromCamera(mousePosRef.current, cameraRef.current);
      const plane = new THREE.Plane(new THREE.Vector3(0, 0, 1));
      const intersectionPoint = new THREE.Vector3();
      raycasterRef.current.ray.intersectPlane(plane, intersectionPoint);
      
      selectedPieceRef.current.position.x = intersectionPoint.x;
      selectedPieceRef.current.position.y = intersectionPoint.y;
    };

    const handleMouseUp = () => {
      if (!selectedPieceRef.current) return;

      // Check if piece is close to its original position
      const originalPos = selectedPieceRef.current.userData.originalPosition;
      const currentPos = selectedPieceRef.current.position;
      const distance = originalPos.distanceTo(currentPos);

      if (distance < 0.3) {
        selectedPieceRef.current.position.copy(originalPos);
      }

      selectedPieceRef.current = null;
      controlsRef.current.enabled = true;
    };

    const element = rendererRef.current.domElement;
    element.addEventListener('mousedown', handleMouseDown);
    element.addEventListener('mousemove', handleMouseMove);
    element.addEventListener('mouseup', handleMouseUp);

    return () => {
      element.removeEventListener('mousedown', handleMouseDown);
      element.removeEventListener('mousemove', handleMouseMove);
      element.removeEventListener('mouseup', handleMouseUp);
    };
  }, []);

  return (
    <div className="w-full h-screen flex flex-col">
      <div className="p-4 bg-gray-100">
        <input
          type="file"
          accept="image/*"
          onChange={handleImageUpload}
          className="block w-full text-sm text-gray-500
            file:mr-4 file:py-2 file:px-4
            file:rounded-full file:border-0
            file:text-sm file:font-semibold
            file:bg-blue-50 file:text-blue-700
            hover:file:bg-blue-100"
        />
      </div>
      <div ref={containerRef} className="flex-1 relative">
        {loading && (
          <div className="absolute inset-0 flex items-center justify-center bg-white bg-opacity-75">
            <div className="text-xl">Loading puzzle...</div>
          </div>
        )}
      </div>
    </div>
  );
};

export default PuzzleGame;