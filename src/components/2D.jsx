import React, { useState, useEffect } from "react";
// import "./App.css"; // Create this file for optional styling

const GRID_SIZE = 3; // Number of rows and columns
const PIECE_SIZE = 100; // Size of each puzzle piece (in pixels)

export default function App() {
  const [image, setImage] = useState(null);
  const [pieces, setPieces] = useState([]);
  const [shuffledPieces, setShuffledPieces] = useState([]);
  const [selectedPiece, setSelectedPiece] = useState(null);
  const [thumbnail, setThumbnail] = useState(null);

  // Load the image and prepare puzzle pieces
  const handleImageUpload = (e) => {
    const file = e.target.files[0];
    if (file) {
      const img = new Image();
      img.src = URL.createObjectURL(file);
      img.onload = () => {
        const canvas = document.createElement("canvas");
        canvas.width = GRID_SIZE * PIECE_SIZE;
        canvas.height = GRID_SIZE * PIECE_SIZE;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

        const piecesArray = [];
        for (let row = 0; row < GRID_SIZE; row++) {
          for (let col = 0; col < GRID_SIZE; col++) {
            const pieceCanvas = document.createElement("canvas");
            pieceCanvas.width = PIECE_SIZE;
            pieceCanvas.height = PIECE_SIZE;
            const pieceCtx = pieceCanvas.getContext("2d");
            pieceCtx.drawImage(
              canvas,
              col * PIECE_SIZE,
              row * PIECE_SIZE,
              PIECE_SIZE,
              PIECE_SIZE,
              0,
              0,
              PIECE_SIZE,
              PIECE_SIZE
            );
            piecesArray.push({
              id: row * GRID_SIZE + col,
              img: pieceCanvas.toDataURL(),
              originalPos: { row, col },
            });
          }
        }

        setPieces(piecesArray);
        setShuffledPieces(shuffleArray([...piecesArray]));
        setThumbnail(canvas.toDataURL());
        setImage(canvas.toDataURL());
      };
    }
  };

  // Shuffle array
  const shuffleArray = (array) => {
    return array.sort(() => Math.random() - 0.5);
  };

  // Swap two pieces
  const swapPieces = (index1, index2) => {
    const newPieces = [...shuffledPieces];
    [newPieces[index1], newPieces[index2]] = [newPieces[index2], newPieces[index1]];
    setShuffledPieces(newPieces);
  };

  // Check if the puzzle is solved
  const isSolved = () => {
    return shuffledPieces.every((piece, index) => piece.id === pieces[index].id);
  };

  return (
    <div style={{ textAlign: "center", padding: "20px" }}>
      <h1>React Puzzle Game</h1>
      {!image && (
        <div>
          <input type="file" accept="image/*" onChange={handleImageUpload} />
        </div>
      )}

      {image && (
        <div>
          <div style={{ display: "flex", justifyContent: "center", marginBottom: "20px" }}>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: `repeat(${GRID_SIZE}, ${PIECE_SIZE}px)`,
                gap: "5px",
              }}
            >
              {shuffledPieces.map((piece, index) => (
                <div
                  key={index}
                  onClick={() => {
                    if (selectedPiece === null) {
                      setSelectedPiece(index);
                    } else {
                      swapPieces(selectedPiece, index);
                      setSelectedPiece(null);
                    }
                  }}
                  style={{
                    width: PIECE_SIZE,
                    height: PIECE_SIZE,
                    backgroundImage: `url(${piece.img})`,
                    border: selectedPiece === index ? "2px solid red" : "1px solid black",
                    cursor: "pointer",
                  }}
                ></div>
              ))}
            </div>
          </div>

          <div>
            <h2>Thumbnail</h2>
            <img
              src={thumbnail}
              alt="Thumbnail"
              style={{ width: "150px", height: "150px", border: "1px solid black" }}
            />
          </div>

          {isSolved() && <h2>🎉 Puzzle Solved! 🎉</h2>}
        </div>
      )}
    </div>
  );
}
