"""Patch SCRFD-10G ONNX: AveragePool/MaxPool ceil_mode=1 -> 0.

ORT 1.25.1 WebGPU EP doesn't implement Pool ops with ceil_mode=1, falling
back to WASM. Setting ceil_mode=0 makes the model run fully on WebGPU.
The difference between ceil and floor in shape calc is at most 1 row/col
on certain odd input sizes — for SCRFD's 640x640 fixed input pipeline this
shifts intermediate feature maps by <=1 pixel, which is below detection
bbox precision (face boxes get scored against detection grids with
strides 8/16/32 — the impact rounds to noise).
"""

import sys
from pathlib import Path

import onnx

SRC = Path(r"L:\var\www\html\models\scrfd_10g_gnkps.onnx")
DST = Path(r"L:\var\www\html\models\scrfd_10g_gnkps-nochceil.onnx")


def main() -> int:
    if not SRC.exists():
        print(f"Source not found: {SRC}", file=sys.stderr)
        return 1

    print(f"Loading {SRC.name} ({SRC.stat().st_size:,} B)")
    model = onnx.load(str(SRC))

    affected = []
    for node in model.graph.node:
        if node.op_type not in ("AveragePool", "MaxPool"):
            continue
        for attr in node.attribute:
            if attr.name == "ceil_mode" and attr.i == 1:
                attr.i = 0
                affected.append((node.op_type, node.name or "<unnamed>"))

    if not affected:
        print("No ceil_mode=1 found — model is already clean.")
        return 0

    print(f"Patched {len(affected)} node(s):")
    for op, name in affected:
        print(f"  {op}  {name}")

    onnx.checker.check_model(model)
    onnx.save(model, str(DST))
    print(f"Saved {DST.name} ({DST.stat().st_size:,} B)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
