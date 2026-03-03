import { Hands, type Results } from '@mediapipe/hands';
import { Camera } from '@mediapipe/camera_utils';
import { drawConnectors, drawLandmarks } from '@mediapipe/drawing_utils';
import { HAND_CONNECTIONS } from '@mediapipe/hands';

let cameraInstance: Camera | null = null;

export async function initCamera(
  videoElement: HTMLVideoElement,
  canvasElement: HTMLCanvasElement,
  onResults: (results: Results) => void,
  onError: (err: Error) => void
): Promise<void> {
  const canvasCtx = canvasElement.getContext('2d')!;

  const hands = new Hands({
    locateFile: (file) =>
      `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`,
  });

  hands.setOptions({
    maxNumHands: 1,
    modelComplexity: 1,
    minDetectionConfidence: 0.5,
    minTrackingConfidence: 0.5,
  });

  hands.onResults((results) => {
    canvasCtx.save();
    canvasCtx.clearRect(0, 0, canvasElement.width, canvasElement.height);
    canvasCtx.drawImage(results.image, 0, 0, canvasElement.width, canvasElement.height);

    if (results.multiHandLandmarks) {
      for (const landmarks of results.multiHandLandmarks) {
        drawConnectors(canvasCtx, landmarks, HAND_CONNECTIONS, {
          color: '#00FF00',
          lineWidth: 3,
        });
        drawLandmarks(canvasCtx, landmarks, {
          color: '#FF0000',
          lineWidth: 1,
          radius: 3,
        });
      }
    }
    canvasCtx.restore();
    onResults(results);
  });

  try {
    cameraInstance = new Camera(videoElement, {
      onFrame: async () => {
        await hands.send({ image: videoElement });
      },
      width: 640,
      height: 480,
    });
    await cameraInstance.start();
  } catch (err) {
    onError(err as Error);
  }
}

export function stopCamera(): void {
  if (cameraInstance) {
    cameraInstance.stop();
    cameraInstance = null;
  }
}
