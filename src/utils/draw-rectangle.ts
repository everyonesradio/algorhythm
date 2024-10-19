/**
 * Draws rectangles and labels around detected objects on a canvas.
 * @param {any[]} detections - An array of object detection results.
 * @param {CanvasRenderingContext2D} ctx - The canvas rendering context.
 * @returns {void}
 */

export const drawRect = (detections: any[], ctx: CanvasRenderingContext2D) => {
  detections.forEach((prediction) => {
    // Get predictions
    const [x, y, width, height] = prediction["bbox"];
    const text = prediction["class"];

    // Set styling
    const color = "#FF0000";
    ctx.strokeStyle = color;
    ctx.font = "18px Arial";
    ctx.lineWidth = 2;
    ctx.fillStyle = color;

    // Draw rectangles and text
    ctx.beginPath();
    ctx.fillText(text, x, y);
    ctx.rect(x, y, width, height);
    ctx.stroke();
  });
};
