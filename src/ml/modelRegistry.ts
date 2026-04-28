export interface ModelMeta {
  id: string;
  name: string;
  /** HuggingFace / remote URL for the ONNX file */
  url: string;
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
    url: 'https://huggingface.co/onnx-community/real-esrgan-x4plus/resolve/main/model.onnx',
    sizeBytes: 67_108_864,
    sha256: '', // TODO: fill after downloading
    inputShape: [1, 3, 256, 256],
    license: 'BSD-3-Clause',
    descriptionKey: 'models.realesrgan-x4plus',
    pipeline: 'upscale',
    tags: ['upscale', 'general'],
  },
  {
    id: 'realesrgan-x4plus-anime',
    name: 'Real-ESRGAN x4plus Anime',
    url: 'https://huggingface.co/onnx-community/real-esrgan-x4plus-anime/resolve/main/model.onnx',
    sizeBytes: 67_108_864,
    sha256: '',
    inputShape: [1, 3, 256, 256],
    license: 'BSD-3-Clause',
    descriptionKey: 'models.realesrgan-x4plus-anime',
    pipeline: 'upscale',
    tags: ['upscale', 'anime'],
  },
  {
    id: 'gfpgan-v1.4',
    name: 'GFPGAN v1.4',
    url: 'https://huggingface.co/onnx-community/gfpgan-v1.4/resolve/main/model.onnx',
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
    url: 'https://huggingface.co/onnx-community/codeformer/resolve/main/model.onnx',
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
    url: 'https://huggingface.co/onnx-community/lama/resolve/main/model.onnx',
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
    url: 'https://huggingface.co/onnx-community/scunet/resolve/main/model.onnx',
    sizeBytes: 150_000_000,
    sha256: '',
    inputShape: [1, 3, 256, 256],
    license: 'Apache-2.0',
    descriptionKey: 'models.scunet',
    pipeline: 'denoise',
    tags: ['denoise'],
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
