// ** React/Next.js Imports
import React, { useRef, useEffect } from "react";

// ** Third-Party Imports
import * as tf from "@tensorflow/tfjs";
import * as cocossd from "@tensorflow-models/coco-ssd";
import Webcam from "react-webcam";

// ** Custom Components, Hooks, Utils, etc.
import { drawRect } from "@/utils/draw-rectangle";

const Demo = () => {
  const webcamRef = useRef<Webcam | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // Main function
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
    // Check data is available
    if (
      typeof webcamRef.current !== "undefined" &&
      webcamRef.current !== null &&
      webcamRef.current.video !== null &&
      webcamRef.current.video.readyState === 4 &&
      canvasRef.current !== null
    ) {
      // Get Video Properties
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

export default Demo;
