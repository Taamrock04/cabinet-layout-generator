"""Render a DXF to PNG for eyeballing — run with the SPIKE venv (has matplotlib)."""
import sys
import ezdxf
from ezdxf.addons.drawing.matplotlib import qsave

src = sys.argv[1] if len(sys.argv) > 1 else "out_service.dxf"
out = sys.argv[2] if len(sys.argv) > 2 else "out_service.png"
doc = ezdxf.readfile(src)
qsave(doc.modelspace(), out, dpi=130, bg="#ffffff")
print("wrote", out)
