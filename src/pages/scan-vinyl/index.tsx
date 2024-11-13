// ** React/Next.js Imports
import React, { useRef, useEffect, useState } from "react";

// ** Third-Party Imports
import * as tf from "@tensorflow/tfjs";
import * as cocossd from "@tensorflow-models/coco-ssd";
import Camera from 'react-html5-camera-photo';

// ** Custom Components, Hooks, Utils, etc.
import DigitalAlbum from "@/components/digital-album";
import { useBoolean } from "@/hooks/use-boolean";
import SpotifyAPI from "@lib/spotify";
import { drawRect } from "@/utils/draw-rectangle";

const VinylScan = () => {
  const albumModal = useBoolean();
  const webcamRef = useRef<typeof Camera | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const _processedVinyls = useRef<Set<string>>(new Set());
  const [spotifyResults, setSpotifyResults] = useState<any>(null);
  const [lastDetectedVinyl, setLastDetectedVinyl] = useState<string | null>(
    null
  );

  /**
    Notes:
    - Vinyl covers can be detected by mainly two methods: 
      a) cover art has to be labelled by artist and album metadata
      b) model must be trained on the shape of a vinyl cover, this way cover art could be mapped on it
      
    - Need a labelled dataset of vinyl cover art

  // Object detection function
  const runCocoModel = async () => {
    try {
      tf.backend();
      const net = await cocossd.load(); // Use custom vinyl model here === tf.loadLayersModel('/model/custom_model.json')

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

      // TODO: Fix this logic so that it doesn't store instances of the vinyls
      //       Instead, it should handle one vinyl at a time
      if (detectedVinyl && !processedVinyls.current.has(detectedVinyl)) {
        processedVinyls.current.add(detectedVinyl);
        setLastDetectedVinyl(detectedVinyl);
        const response = await searchSpotify(detectedVinyl);

        if (response) {
          setSpotifyResults(response);
          albumModal.setTrue();
        }
      }
    }
  };
  **/

  const searchSpotify = async (detectedVinyl: string): Promise<any> => {
    try {
      // Split the detected string into artist and album
      const [artist, album] = detectedVinyl.split("_");

      // Create a search query that combines artist and album
      const searchQuery = `artist:${artist} album:${album}`;

      const response = await SpotifyAPI.search(
        searchQuery,
        ["album"],
        undefined, // market
        50, // limit
        0 // offset
      );

      setSpotifyResults(response);
    } catch (error) {
      console.error("Failed to fetch album:", error);
      return null;
    }
  };

  useEffect(() => {
    const timer = setTimeout(() => {
      const detectedVinyl = "amaarae_the angel you dont know";
      setLastDetectedVinyl(detectedVinyl);
      searchSpotify(detectedVinyl).then(() => {
        albumModal.setTrue();
      });
    }, 5000);

    return () => clearTimeout(timer);
  }, []);

  return (
    <div className='flex w-full min-h-screen min-w-screen items-center justify-center p-4'>
      <Camera
        isFullscreen={true}
      />
      <canvas
        ref={canvasRef}
        className='absolute left-0 right-0 mx-auto text-center z-10 w-[360px] sm:w-[640px] h-[480px]'
      />
      {spotifyResults && albumModal.value && (
        <DigitalAlbum
          isOpen={albumModal.value}
          handleClose={albumModal.setFalse}
          albumData={spotifyResults}
          vinyl={lastDetectedVinyl!}
        />
      )}
    </div>
  );
};

export default VinylScan;
