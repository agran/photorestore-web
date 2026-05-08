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
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    // Revoke on the next macrotask — by then the browser has already grabbed
    // the blob data for the download. Earlier revoke (before click() returns)
    // is unsafe; later revoke (setTimeout 10s) races a slow Save-as dialog.
    // requestAnimationFrame survives both.
    requestAnimationFrame(() => URL.revokeObjectURL(url));
  }, 'image/png');
}

/** Download an image URL as a PNG */
export function downloadImageUrl(imageUrl: string, filename = 'result.png') {
  downloadUrl(imageUrl, filename);
}
