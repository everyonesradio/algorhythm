// ** React/Next.js Imports
import React, { useRef, useEffect, useState } from "react";

// ** Third-Party Imports
import * as tf from "@tensorflow/tfjs";
import * as cocossd from "@tensorflow-models/coco-ssd";
import MobileDetect from "mobile-detect";
import { Camera, CameraType } from "react-camera-pro";

// ** Custom Components, Hooks, Utils, etc.
import DigitalAlbum from "@/components/digital-album";
import { useBoolean } from "@/hooks/use-boolean";
import SpotifyAPI from "@lib/spotify";
import { drawRect } from "@/utils/draw-rectangle";
import { api } from "@/utils/trpc";

const VinylScan = () => {
  const albumModal = useBoolean();
  const cameraRef = useRef<CameraType | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const _processedVinyls = useRef<Set<string>>(new Set());
  const [spotifyResult, setSpotifyResult] = useState<any>(null);
  const [lastDetectedVinyl, setLastDetectedVinyl] = useState<string | null>(
    null
  );

  const { mutateAsync: musicIDXEntry } = api.musicIDX.add.useMutation();

  /**  TODO: Train custom vinyl recognition model
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
      typeof cameraRef.current !== "undefined" &&
      cameraRef.current !== null &&
      cameraRef.current.video !== null &&
      cameraRef.current.video.readyState === 4 &&
      canvasRef.current !== null
    ) {
      // Get video properties
      const video = cameraRef.current.video;
      const videoWidth = cameraRef.current.video.videoWidth;
      const videoHeight = cameraRef.current.video.videoHeight;

      // Set video width
      cameraRef.current.video.width = videoWidth;
      cameraRef.current.video.height = videoHeight;

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


      if (detectedVinyl && !_processedVinyls.current.has(detectedVinyl)) {
        _processedVinyls.current.add(detectedVinyl);
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

  // Searches Spotify API for album using artist and album name
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

      // Early validation of album existence
      const foundAlbum = response?.albums?.items?.[0];
      if (!foundAlbum) {
        console.log("Album not found");
        return null;
      }

      // Validate artist match
      const foundArtist = foundAlbum.artists?.[0];
      if (foundArtist.name.toLowerCase() !== artist.toLowerCase()) {
        console.log("Artist mismatch");
        return null;
      }

      // Only set results and process if we have valid data
      setSpotifyResult(foundAlbum);
      await processSpotifyAlbum(foundAlbum);
    } catch (error) {
      console.error("Failed to fetch album:", error);
      return null;
    }
  };

  const processSpotifyAlbum = async (album: any) => {
    const artist = album.artists?.[0];
    const spotifyArtistUrlRegex = /^https:\/\/open\.spotify\.com\/artist\/.+$/;
    const spotifyAlbumUrlRegex = /^https:\/\/open\.spotify\.com\/album\/.+$/;

    const artistLink = artist.external_urls?.spotify;
    const albumLink = album.external_urls?.spotify;

    await musicIDXEntry({
      artistName: artist.name,
      artistLink: spotifyArtistUrlRegex.test(artistLink)
        ? artistLink
        : undefined,
      albumLink: spotifyAlbumUrlRegex.test(albumLink) ? albumLink : undefined,
      spotifyId: artist.id,
    });
  };

  // Simulate a vinyl detection after 5 seconds
  useEffect(() => {
    const timer = setTimeout(() => {
      const detectedVinyl = "navy blue_memoirs in armour";
      setLastDetectedVinyl(detectedVinyl);
      searchSpotify(detectedVinyl).then(() => {
        albumModal.setTrue();
      });
    }, 1000);

    return () => clearTimeout(timer);
  }, []);

  // Determines the camera facing mode based on device type
  const getCameraMode = () => {
    if (typeof window === "undefined") return "user";

    const md = new MobileDetect(window.navigator.userAgent);
    const isMobile = md.mobile();

    return isMobile ? "environment" : "user";
  };

  return (
    <div className='flex min-h-screen w-full items-center justify-center p-4'>
      <Camera ref={cameraRef} facingMode={getCameraMode()} errorMessages={{}} />
      <canvas
        ref={canvasRef}
        className='absolute left-0 right-0 mx-auto text-center z-10 w-[360px] sm:w-[640px] h-[480px]'
      />
      {spotifyResult && albumModal.value && (
        <DigitalAlbum
          isOpen={albumModal.value}
          handleClose={albumModal.setFalse}
          album={spotifyResult}
          vinyl={lastDetectedVinyl!}
        />
      )}
    </div>
  );
};
export default VinylScan;
