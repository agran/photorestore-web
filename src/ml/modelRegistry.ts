export interface ModelMeta {
  id: string;
  name: string;
  /** Local path relative to public/ (e.g. models/realesrgan-x4plus.onnx) */
  url: string;
  /** Remote download URL */
  downloadUrl: string;
  sizeBytes: number;
  sha256: string;
  /** Expected input tensor shape [N, C, H, W] */
  inputShape: [number, number, number, number];
  license: string;
  /** i18n key for description */
  descriptionKey: string;
  pipeline: 'upscale' | 'faceRestore' | 'inpaint' | 'denoise';
  tags: string[];
}

const MODELS: ModelMeta[] = [
  {
    id: 'realesrgan-x4plus',
    name: 'Real-ESRGAN x4plus',
    url: 'models/realesrgan-x4plus.onnx',
    downloadUrl: 'https://www.erudit23.ru/models/realesrgan-x4plus.onnx',
    sizeBytes: 89_128_960,
    sha256: '',
    inputShape: [1, 3, 64, 64],
    license: 'BSD-3-Clause',
    descriptionKey: 'models.realesrgan-x4plus',
    pipeline: 'upscale',
    tags: ['upscale', 'general'],
  },
  {
    id: 'realesrgan-x4plus-anime',
    name: 'Real-ESRGAN x4plus Anime',
    url: 'models/realesrgan-x4plus.onnx',
    downloadUrl: 'https://www.erudit23.ru/models/realesrgan-x4plus-anime.onnx',
    sizeBytes: 89_128_960,
    sha256: '',
    inputShape: [1, 3, 64, 64],
    license: 'BSD-3-Clause',
    descriptionKey: 'models.realesrgan-x4plus-anime',
    pipeline: 'upscale',
    tags: ['upscale', 'anime'],
  },
  {
    id: 'cugan-up4x',
    name: 'Real-CUGAN Up×4',
    url: 'models/cugan-up4x.onnx',
    downloadUrl: 'https://www.erudit23.ru/models/cugan-up4x.onnx',
    sizeBytes: 2_097_152,
    sha256: '',
    inputShape: [1, 3, 64, 64],
    license: 'MIT',
    descriptionKey: 'models.cugan-up4x',
    pipeline: 'upscale',
    tags: ['upscale', 'general'],
  },
  {
    id: 'cugan-up4x-denoise',
    name: 'Real-CUGAN Up×4 Denoise',
    url: 'models/cugan-up4x-denoise.onnx',
    downloadUrl: 'https://www.erudit23.ru/models/cugan-up4x-denoise.onnx',
    sizeBytes: 2_097_152,
    sha256: '',
    inputShape: [1, 3, 64, 64],
    license: 'MIT',
    descriptionKey: 'models.cugan-up4x-denoise',
    pipeline: 'upscale',
    tags: ['upscale', 'denoise'],
  },
  {
    id: 'gfpgan-v1.4',
    name: 'GFPGAN v1.4',
    url: 'models/gfpgan-v1.4.onnx',
    downloadUrl: 'https://www.erudit23.ru/models/gfpgan-v1.4.onnx',
    sizeBytes: 348_000_000,
    sha256: '',
    inputShape: [1, 3, 512, 512],
    license: 'Apache-2.0',
    descriptionKey: 'models.gfpgan-v1.4',
    pipeline: 'faceRestore',
    tags: ['face', 'restore'],
  },
  {
    id: 'codeformer',
    name: 'CodeFormer',
    url: 'models/codeformer.onnx',
    downloadUrl: 'https://www.erudit23.ru/models/codeformer.onnx',
    sizeBytes: 375_000_000,
    sha256: '',
    inputShape: [1, 3, 512, 512],
    license: 'S-Lab License 1.0',
    descriptionKey: 'models.codeformer',
    pipeline: 'faceRestore',
    tags: ['face', 'restore'],
  },
  {
    id: 'lama',
    name: 'LaMa',
    url: 'models/lama.onnx',
    downloadUrl: 'https://www.erudit23.ru/models/lama.onnx',
    sizeBytes: 210_000_000,
    sha256: '',
    inputShape: [1, 4, 512, 512],
    license: 'Apache-2.0',
    descriptionKey: 'models.lama',
    pipeline: 'inpaint',
    tags: ['inpaint'],
  },
  {
    id: 'scunet',
    name: 'SCUNet',
    url: 'models/scunet.onnx',
    downloadUrl: 'https://www.erudit23.ru/models/scunet.onnx',
    sizeBytes: 150_000_000,
    sha256: '',
    inputShape: [1, 3, 256, 256],
    license: 'Apache-2.0',
    descriptionKey: 'models.scunet',
    pipeline: 'denoise',
    tags: ['denoise'],
  },
  {
    id: 'drunet',
    name: 'DRUNet',
    url: 'models/drunet_color.onnx',
    downloadUrl: 'https://www.erudit23.ru/models/drunet_color.onnx',
    sizeBytes: 18_000_000,
    sha256: '',
    inputShape: [1, 3, 256, 256],
    license: 'Apache-2.0',
    descriptionKey: 'models.drunet',
    pipeline: 'denoise',
    tags: ['denoise'],
  },
  {
    id: 'drunet-deblock',
    name: 'DRUNet Deblock',
    url: 'models/drunet_deblocking_color.onnx',
    downloadUrl: 'https://www.erudit23.ru/models/drunet_deblocking_color.onnx',
    sizeBytes: 18_000_000,
    sha256: '',
    inputShape: [1, 3, 256, 256],
    license: 'Apache-2.0',
    descriptionKey: 'models.drunet-deblock',
    pipeline: 'denoise',
    tags: ['denoise', 'deblock'],
  },
];

/** Get all registered models */
export function getAllModels(): ModelMeta[] {
  return MODELS;
}

/** Get a model by id */
export function getModel(id: string): ModelMeta | undefined {
  return MODELS.find((m) => m.id === id);
}

/** Get models by pipeline */
export function getModelsByPipeline(pipeline: ModelMeta['pipeline']): ModelMeta[] {
  return MODELS.filter((m) => m.pipeline === pipeline);
}
