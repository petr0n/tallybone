// app/src/upload.js
// File-input fallback for when camera access is denied/unavailable
// (build-plan-v2.md §9.0 hard constraint: this is not optional). Produces
// the same {data, width, height} shape captureFrame() does, so both paths
// feed one shared scan-and-render pipeline.

export async function fileToImageData(file, canvasFactory) {
  const bitmap = await createImageBitmap(file);
  const { ctx } = canvasFactory(bitmap.width, bitmap.height);
  ctx.drawImage(bitmap, 0, 0);
  return ctx.getImageData(0, 0, bitmap.width, bitmap.height);
}
