/** Download a URL as a file */
export function downloadUrl(url: string, filename: string) {
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

/** Download a canvas as PNG */
export function downloadCanvas(canvas: HTMLCanvasElement, filename = 'result.png') {
  canvas.toBlob((blob) => {
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    downloadUrl(url, filename);
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
  }, 'image/png');
}

/** Download an image URL as a PNG */
export function downloadImageUrl(imageUrl: string, filename = 'result.png') {
  downloadUrl(imageUrl, filename);
}
