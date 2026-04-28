import exifr from 'exifr';

export interface ExifData {
  make?: string;
  model?: string;
  dateTaken?: Date;
  gps?: { latitude: number; longitude: number };
  width?: number;
  height?: number;
  orientation?: number;
  iso?: number;
  focalLength?: number;
  aperture?: number;
  shutterSpeed?: number;
}

interface RawExif {
  Make?: string;
  Model?: string;
  DateTimeOriginal?: Date;
  latitude?: number;
  longitude?: number;
  ImageWidth?: number;
  ImageHeight?: number;
  Orientation?: number;
  ISO?: number;
  FocalLength?: number;
  FNumber?: number;
  ExposureTime?: number;
}

/** Read EXIF metadata from a File or Blob */
export async function readExif(file: File | Blob): Promise<ExifData> {
  try {
    const raw = (await exifr.parse(file, {
      tiff: true,
      gps: true,
      icc: false,
      iptc: false,
    })) as RawExif | null;
    if (!raw) return {};
    return {
      make: raw.Make,
      model: raw.Model,
      dateTaken: raw.DateTimeOriginal,
      gps:
        raw.latitude !== undefined && raw.longitude !== undefined
          ? { latitude: raw.latitude, longitude: raw.longitude }
          : undefined,
      width: raw.ImageWidth,
      height: raw.ImageHeight,
      orientation: raw.Orientation,
      iso: raw.ISO,
      focalLength: raw.FocalLength,
      aperture: raw.FNumber,
      shutterSpeed: raw.ExposureTime,
    };
  } catch {
    return {};
  }
}
