// src/utils/modelGenerator.js
import * as THREE from 'three';

export const generate3DModel = (imageData) => {
  return new Promise((resolve) => {
    const { data, width, height } = imageData;
    const geometry = new THREE.PlaneGeometry(1, height / width, 32, 32);
    
    // Generate height map from image brightness
    const heightMap = new Float32Array(width * height);
    for (let i = 0; i < data.data.length; i += 4) {
      const brightness = (data.data[i] + data.data[i + 1] + data.data[i + 2]) / 3;
      heightMap[i / 4] = brightness / 255;
    }
    
    // Apply height map to geometry
    const positions = geometry.attributes.position.array;
    for (let i = 0; i < positions.length; i += 3) {
      const index = Math.floor(i / 3);
      positions[i + 2] = heightMap[index] * 0.1;
    }
    geometry.attributes.position.needsUpdate = true;
    
    resolve(geometry);
  });
};

export const generatePuzzlePieces = (geometry, difficulty) => {
  const pieces = [];
  const segmentsX = difficulty;
  const segmentsY = difficulty;
  
  for (let i = 0; i < segmentsX; i++) {
    for (let j = 0; j < segmentsY; j++) {
      const pieceGeometry = geometry.clone();
      // Cut out piece from original geometry
      const bounds = {
        x: { min: i / segmentsX, max: (i + 1) / segmentsX },
        y: { min: j / segmentsY, max: (j + 1) / segmentsY }
      };
      
      // Apply jigsaw-like edges
      applyJigsawEdges(pieceGeometry, bounds, i, j, segmentsX, segmentsY);
      pieces.push({
        geometry: pieceGeometry,
        originalPosition: new THREE.Vector3(
          (i - segmentsX / 2) / segmentsX,
          (j - segmentsY / 2) / segmentsY,
          0
        )
      });
    }
  }
  
  return pieces;
};

const applyJigsawEdges = (geometry, bounds, i, j, segmentsX, segmentsY) => {
  // Implementation of jigsaw edge generation
  // This creates interlocking pieces
  const positions = geometry.attributes.position.array;
  const uvs = geometry.attributes.uv.array;
  
  // Add connector shapes to edges
  if (i < segmentsX - 1) addHorizontalConnector(positions, bounds, true);
  if (j < segmentsY - 1) addVerticalConnector(positions, bounds, true);
  if (i > 0) addHorizontalConnector(positions, bounds, false);
  if (j > 0) addVerticalConnector(positions, bounds, false);
  
  geometry.attributes.position.needsUpdate = true;
  geometry.attributes.uv.needsUpdate = true;
};