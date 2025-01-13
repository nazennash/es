// src/components/PuzzleImageUploader.jsx
import React, { useState } from 'react';
import { storage } from '../firebase';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';

const PuzzleImageUploader = ({ onImageProcessed }) => {
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);

  const processImage = async (file) => {
    setUploading(true);
    try {
      const storageRef = ref(storage, `puzzle-images/${Date.now()}-${file.name}`);
      await uploadBytes(storageRef, file);
      const imageUrl = await getDownloadURL(storageRef);
      
      // Process image and create 3D model
      const imageData = await createImageData(file);
      const modelData = await generate3DModel(imageData);
      
      onImageProcessed({
        imageUrl,
        modelData,
        dimensions: { width: imageData.width, height: imageData.height }
      });
    } catch (error) {
      console.error('Error processing image:', error);
    } finally {
      setUploading(false);
    }
  };

  const createImageData = async (file) => {
    return new Promise((resolve) => {
      const reader = new FileReader();
      const img = new Image();
      
      reader.onload = (e) => {
        img.onload = () => {
          const canvas = document.createElement('canvas');
          const ctx = canvas.getContext('2d');
          canvas.width = img.width;
          canvas.height = img.height;
          ctx.drawImage(img, 0, 0);
          
          resolve({
            data: ctx.getImageData(0, 0, img.width, img.height),
            width: img.width,
            height: img.height
          });
        };
        img.src = e.target.result;
      };
      reader.readAsDataURL(file);
    });
  };

  return (
    <div className="upload-container p-6 bg-white rounded-lg shadow">
      <input
        type="file"
        accept="image/*"
        onChange={(e) => processImage(e.target.files[0])}
        className="hidden"
        id="image-upload"
      />
      <label
        htmlFor="image-upload"
        className="block w-full p-4 text-center border-2 border-dashed border-gray-300 rounded cursor-pointer hover:border-blue-500 transition-colors"
      >
        {uploading ? (
          <div className="space-y-2">
            <div className="loading-spinner"></div>
            <p>Processing image... {progress}%</p>
          </div>
        ) : (
          <p>Click or drag image here to upload</p>
        )}
      </label>
    </div>
  );
};

export default PuzzleImageUploader;