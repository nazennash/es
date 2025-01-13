import React, { useState } from 'react';
import { storage } from '../firebase';
import { ref, uploadBytesResumable, getDownloadURL } from 'firebase/storage';

const PuzzleImageUploader = ({ onImageProcessed }) => {
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState(null);

  const processImage = async (file) => {
    if (!file) return;
    
    setUploading(true);
    setError(null);
    
    try {
      // Validate image dimensions
      const dimensions = await getImageDimensions(file);
      if (dimensions.width < 400 || dimensions.height < 400) {
        throw new Error('Image must be at least 400x400 pixels');
      }

      // Create a reference to the file location
      const fileName = `${Date.now()}-${file.name}`;
      const storageRef = ref(storage, `puzzle-images/${fileName}`);
      
      // Create the upload task
      const uploadTask = uploadBytesResumable(storageRef, file);
      
      // Monitor upload progress
      uploadTask.on('state_changed', 
        (snapshot) => {
          const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
          setProgress(Math.round(progress));
        },
        (error) => {
          console.error('Upload error:', error);
          setError('Failed to upload image');
        }
      );

      // Wait for upload to complete
      await uploadTask;
      
      // Get the download URL
      let imageUrl = await getDownloadURL(storageRef);
      
      // Replace the Firebase Storage domain with our proxy
      imageUrl = imageUrl.replace(
        'https://firebasestorage.googleapis.com',
        window.location.origin
      );
      
      // Process image data
      const imageData = await createImageData(file);
      
      onImageProcessed({
        imageUrl,
        dimensions: {
          width: imageData.width,
          height: imageData.height,
          aspectRatio: imageData.width / imageData.height
        }
      });
      
      setProgress(100);
    } catch (error) {
      console.error('Error processing image:', error);
      setError(error.message);
    } finally {
      setUploading(false);
    }
  };

  const getImageDimensions = (file) => {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        resolve({
          width: img.width,
          height: img.height
        });
      };
      img.onerror = () => {
        reject(new Error('Failed to load image'));
      };
      img.src = URL.createObjectURL(file);
    });
  };

  const createImageData = async (file) => {
    return new Promise((resolve) => {
      const reader = new FileReader();
      const img = new Image();
      
      reader.onload = (e) => {
        img.onload = () => {
          // Create scaled version if image is too large
          const maxSize = 2048;
          let width = img.width;
          let height = img.height;
          
          if (width > maxSize || height > maxSize) {
            if (width > height) {
              height = (height / width) * maxSize;
              width = maxSize;
            } else {
              width = (width / height) * maxSize;
              height = maxSize;
            }
          }

          const canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;
          
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0, width, height);
          
          resolve({
            width,
            height,
            aspectRatio: width / height
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
        className={`block w-full p-4 text-center border-2 border-dashed rounded cursor-pointer transition-colors ${
          error ? 'border-red-300' : 'border-gray-300 hover:border-blue-500'
        }`}
      >
        {uploading ? (
          <div className="space-y-2">
            <div className="loading-spinner"></div>
            <p>Processing image... {progress}%</p>
          </div>
        ) : (
          <div className="space-y-2">
            <p>Click or drag image here to upload</p>
            <p className="text-sm text-gray-500">
              Minimum size: 400x400 pixels
            </p>
          </div>
        )}
      </label>
      
      {error && (
        <div className="mt-2 text-sm text-red-600">
          {error}
        </div>
      )}
    </div>
  );
};

export default PuzzleImageUploader;