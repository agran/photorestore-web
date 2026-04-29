export interface ModelMeta {
  id: string;
  name: string;
  url: string;
  sizeBytes: number;
  sha256: string;
  /** Expected input tensor shape [N, C, H, W] */
  inputShape: [number, number, number, number];
  license: string;
  /** i18n key for description */
  descriptionKey: string;
  pipeline: 'upscale' | 'faceRestore' | 'inpaint' | 'denoise' | 'anonymize';
  tags: string[];
  forceWasm?: boolean;
}

function modelUrl(filename: string): string {
  if (import.meta.env.DEV) {
    return `models/${filename}`;
  }
  return `https://www.erudit23.ru/models/${filename}`;
}

const MODELS: ModelMeta[] = [
  {
    id: 'realesrgan-x4plus',
    name: 'Real-ESRGAN x4plus',
    url: modelUrl('realesrgan-x4plus-128.onnx'),
    sizeBytes: 67_160_311,
    sha256: '6a6f4a3d58553d40fdd443d9e5f4b2deb9b52bef1ec2947700fc2167ac876c7d',
    inputShape: [1, 3, 128, 128],
    license: 'BSD-3-Clause',
    descriptionKey: 'models.realesrgan-x4plus',
    pipeline: 'upscale',
    tags: ['upscale', 'general'],
  },
  {
    id: 'cugan-up4x',
    name: 'Real-CUGAN Up×4',
    url: modelUrl('cugan-up4x.onnx'),
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
    url: modelUrl('cugan-up4x-denoise.onnx'),
    sizeBytes: 2_097_152,
    sha256: '',
    inputShape: [1, 3, 64, 64],
    license: 'MIT',
    descriptionKey: 'models.cugan-up4x-denoise',
    pipeline: 'upscale',
    tags: ['upscale', 'denoise'],
  },
  {
    id: 'nmkd-superscale',
    name: 'NMKD Superscale',
    url: modelUrl('nmkd-superscale.onnx'),
    sizeBytes: 67_049_472,
    sha256: '',
    inputShape: [1, 3, 128, 128],
    license: 'BSD-3-Clause',
    descriptionKey: 'models.nmkd-superscale',
    pipeline: 'upscale',
    tags: ['upscale', 'general', 'photo'],
    forceWasm: true,
  },
  {
    id: 'nomos8ksc',
    name: '4xNomos8kSC',
    url: modelUrl('nomos8ksc.onnx'),
    sizeBytes: 67_003_044,
    sha256: '',
    inputShape: [1, 3, 128, 128],
    license: 'MIT',
    descriptionKey: 'models.nomos8ksc',
    pipeline: 'upscale',
    tags: ['upscale', 'general', 'photo'],
    forceWasm: true,
  },
  {
    id: 'lsdir-dat',
    name: '4xLSDIR-DAT',
    url: modelUrl('lsdir-dat.onnx'),
    sizeBytes: 64_531_231,
    sha256: '',
    inputShape: [1, 3, 256, 256],
    license: 'MIT',
    descriptionKey: 'models.lsdir-dat',
    pipeline: 'upscale',
    tags: ['upscale', 'general', 'photo'],
    forceWasm: true,
  },
  {
    id: 'gfpgan-v1.4',
    name: 'GFPGAN v1.4',
    url: modelUrl('gfpgan-v1.4.onnx'),
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
    url: modelUrl('codeformer.onnx'),
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
    url: modelUrl('lama.onnx'),
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
    url: modelUrl('scunet.onnx'),
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
    url: modelUrl('drunet_color.onnx'),
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
    url: modelUrl('drunet_deblocking_color.onnx'),
    sizeBytes: 18_000_000,
    sha256: '',
    inputShape: [1, 3, 256, 256],
    license: 'Apache-2.0',
    descriptionKey: 'models.drunet-deblock',
    pipeline: 'denoise',
    tags: ['denoise', 'deblock'],
  },
  {
    id: 'scrfd-10g',
    name: 'SCRFD-10G-KPS',
    url: modelUrl('scrfd_10g_gnkps.onnx'),
    sizeBytes: 16_273_449,
    sha256: '',
    inputShape: [1, 3, 640, 640],
    license: 'Apache-2.0',
    descriptionKey: 'models.scrfd-10g',
    pipeline: 'anonymize',
    tags: ['face', 'detect', 'kps', 'quality'],
    forceWasm: true,
  },
  {
    id: 'scrfd-500m',
    name: 'SCRFD-500M',
    url: modelUrl('scrfd_500m.onnx'),
    sizeBytes: 2_527_360,
    sha256: '',
    inputShape: [1, 3, 640, 640],
    license: 'MIT',
    descriptionKey: 'models.scrfd-500m',
    pipeline: 'anonymize',
    tags: ['face', 'detect', 'lightweight'],
  },
  {
    id: 'yunet-2023',
    name: 'YuNet 2023',
    url: modelUrl('face_detection_yunet_2023mar.onnx'),
    sizeBytes: 230_686,
    sha256: '',
    inputShape: [1, 3, 640, 640],
    license: 'MIT',
    descriptionKey: 'models.yunet-2023',
    pipeline: 'anonymize',
    tags: ['face', 'detect', 'lightweight'],
  },
  {
    id: 'retinaface-mbn025',
    name: 'RetinaFace-MobileNet0.25',
    url: modelUrl('retinaface_mbn025.onnx'),
    sizeBytes: 1_740_576,
    sha256: '',
    inputShape: [1, 3, 640, 640],
    license: 'MIT',
    descriptionKey: 'models.retinaface-mbn025',
    pipeline: 'anonymize',
    tags: ['face', 'detect'],
  },
  {
    id: 'blazeface',
    name: 'BlazeFace',
    url: modelUrl('blazeface.onnx'),
    sizeBytes: 534_720,
    sha256: '',
    inputShape: [1, 3, 128, 128],
    license: 'Apache-2.0',
    descriptionKey: 'models.blazeface',
    pipeline: 'anonymize',
    tags: ['face', 'detect', 'lightweight'],
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

export function formatModelSize(bytes: number): string {
  if (bytes >= 1_000_000) return `${(bytes / 1_000_000).toFixed(1)} MB`;
  if (bytes >= 1_000) return `${(bytes / 1_000).toFixed(0)} KB`;
  return `${bytes} B`;
}

export function modelRuntimeLabel(model: ModelMeta): string {
  return model.forceWasm ? '💻 CPU' : '⚡ GPU';
}
