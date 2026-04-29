"""Convert ESRGAN-style ONNX models to fp16 for ORT WebGPU EP.

Internal weights/activations -> fp16, IO stays fp32 (keep_io_types=True),
so the JS pipeline (Float32Array tensors) needs no change. fp16 dodges
the broken NHWC Conv kernel codegen in onnxruntime-web 1.25.x.
"""

import sys
from pathlib import Path

import onnx
from onnxconverter_common import float16

MODELS_DIR = Path(r"L:\var\www\html\models")

TARGETS = [
    "nmkd-superscale.onnx",
    "nomos8ksc.onnx",
    "lsdir-dat.onnx",
]


def convert(name: str) -> None:
    src = MODELS_DIR / name
    dst = MODELS_DIR / name.replace(".onnx", "-fp16.onnx")

    if not src.exists():
        print(f"  [skip] {src} not found")
        return

    print(f"  loading {src.name} ({src.stat().st_size:,} B)")
    model = onnx.load(str(src))

    print("  converting fp32 -> fp16 (keep_io_types=True)...")
    model_fp16 = float16.convert_float_to_float16(
        model,
        keep_io_types=True,
        disable_shape_infer=False,
    )

    print(f"  saving {dst.name}")
    onnx.save(model_fp16, str(dst))
    print(f"  -> {dst.stat().st_size:,} B")


def main() -> int:
    for name in TARGETS:
        print(f"\n=== {name} ===")
        try:
            convert(name)
        except Exception as e:
            print(f"  FAILED: {e}")
            return 1
    print("\nDone.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
