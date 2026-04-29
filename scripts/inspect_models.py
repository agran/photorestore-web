"""Print expected input/output shapes for each face-detect ONNX model.

Use this to verify what resolution the model expects vs. what the JS pipeline
feeds it (always 640x640 padded after our recent global-pass change).
"""

import sys
from pathlib import Path

import onnx

MODELS_DIR = Path(r"L:\var\www\html\models")

TARGETS = [
    "scrfd_10g_gnkps-nochceil.onnx",
    "scrfd_10g_gnkps.onnx",
    "scrfd_500m.onnx",
    "face_detection_yunet_2023mar.onnx",
    "retinaface_mbn025.onnx",
]


def shape_str(value_info):
    dims = []
    for d in value_info.type.tensor_type.shape.dim:
        if d.dim_value > 0:
            dims.append(str(d.dim_value))
        elif d.dim_param:
            dims.append(d.dim_param)
        else:
            dims.append("?")
    return "[" + ",".join(dims) + "]"


def main() -> int:
    for name in TARGETS:
        path = MODELS_DIR / name
        if not path.exists():
            print(f"\n{name}: NOT FOUND")
            continue
        try:
            model = onnx.load(str(path))
        except Exception as e:
            print(f"\n{name}: load failed: {e}")
            continue

        print(f"\n=== {name} ===")
        print("inputs:")
        for inp in model.graph.input:
            dtype = inp.type.tensor_type.elem_type
            print(f"  {inp.name}  shape={shape_str(inp)}  dtype={dtype}")
        print("outputs:")
        for out in model.graph.output:
            print(f"  {out.name}  shape={shape_str(out)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
