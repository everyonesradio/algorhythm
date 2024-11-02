// ** React/Next.js Imports
import React, { useRef, useEffect, useState } from "react";

// ** Third-Party Imports
import * as tf from "@tensorflow/tfjs";
import * as cocossd from "@tensorflow-models/coco-ssd";
import Webcam from "react-webcam";

// ** Custom Components, Hooks, Utils, etc.
import SpotifyAPI from "@lib/spotify";
import { drawRect } from "@/utils/draw-rectangle";

const VinylScan = () => {
  const webcamRef = useRef<Webcam | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [lastDetectedVinyl, setLastDetectedVinyl] = useState<string | null>(null);
  const processedVinyls = useRef<Set<string>>(new Set());

  // Search for Spotify album
  const searchSpotify = async (detectedVinyl: string): Promise<any> => {
    try {
      // Split the detected string into artist and album
      const [artist, album] = detectedVinyl.split('_');
      
      // Create a search query that combines artist and album
      const searchQuery = `artist:${artist} album:${album}`;
      
      // Perform a combined search for both artist and album
      const response = await SpotifyAPI.search(
        searchQuery,
        ['artist', 'album'],
        undefined, // market
        50, // limit
        0 // offset
      );

      return response;
    } catch (error) {
      console.error("Failed to fetch album:", error);
      return null;
    }
  };

  // Object detection function
  const runCocoModel = async () => {
    try {
      tf.backend();
      const net = await cocossd.load();

      const detectFrame = async () => {
        await detect(net);
        requestAnimationFrame(detectFrame);
      };

      requestAnimationFrame(detectFrame);
    } catch (error) {
      console.error("Error loading COCO-SSD model:", error);
    }
  };

  const detect = async (net: cocossd.ObjectDetection) => {
    // Check if data is available
    if (
      typeof webcamRef.current !== "undefined" &&
      webcamRef.current !== null &&
      webcamRef.current.video !== null &&
      webcamRef.current.video.readyState === 4 &&
      canvasRef.current !== null
    ) {
      // Get video properties
      const video = webcamRef.current.video;
      const videoWidth = webcamRef.current.video.videoWidth;
      const videoHeight = webcamRef.current.video.videoHeight;

      // Set video width
      webcamRef.current.video.width = videoWidth;
      webcamRef.current.video.height = videoHeight;

      // Set canvas height and width
      canvasRef.current.width = videoWidth;
      canvasRef.current.height = videoHeight;

      // Make Detections
      const obj = await net.detect(video);

      // Draw mesh
      const ctx = canvasRef.current.getContext("2d");
      drawRect(obj, ctx!);

      // After successful detection
      const detectedVinyl = "amaarae_the angel you dont know"; // Adjust based on your model's output === obj[0]?.class
      
      if (detectedVinyl && !processedVinyls.current.has(detectedVinyl)) {
        processedVinyls.current.add(detectedVinyl);
        setLastDetectedVinyl(detectedVinyl);
        const spotifyResults = await searchSpotify(detectedVinyl);

        // Handle spotify results here
        console.log("Spotify Results:", spotifyResults);
      }
    }
  };

  useEffect(() => {
    runCocoModel();
  }, []);

  return (
    <div className='flex min-h-screen items-center justify-center'>
      <Webcam
        ref={webcamRef}
        muted={true}
        className='absolute left-0 right-0 mx-auto text-center z-10 w-[640px] h-[480px]'
      />
      <canvas
        ref={canvasRef}
        className='absolute left-0 right-0 mx-auto text-center z-10 w-[640px] h-[480px]'
      />
    </div>
  );
};

export default VinylScan;
