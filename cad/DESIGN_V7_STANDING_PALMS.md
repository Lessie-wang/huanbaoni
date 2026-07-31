# FeelingMosaic 立掌环抱开口戒指 V7

## 这版修正

- V6 的手虽然伸向内圆，但掌片仍然平躺在戒指平面中。
- V7 以左右戒圈端点的局部切线为旋转轴，将整只手旋转 90°。
- 掌心、三根几何手指和拇指作为完整整体一起立起，没有重新拼成独立装饰片。
- 两只手原本朝上的掌面旋转后都朝向戒指内圆，形成相对收拢的环抱姿态。

## 几何与佩戴

- 默认内径为 19.5 mm，另提供 18.5 mm 和 20.5 mm。
- 默认模型外形约为 31.3 × 31.0 × 6.0 mm。
- 默认模型两手最小顶点间隙约 2.87 mm，适合保留清晰开口。
- 所有尺寸版本的导出网格均无退化三角形、边界边或非流形边。
- 手掌立起后会比平掌版本更容易接触相邻手指，试戴前需要打磨掌缘和指尖。

## 输出文件

路径：`cad/output/standing_palms_v7/`

- `feelingmosaic_standing_palms_ring_18.5mm.stl`
- `feelingmosaic_standing_palms_ring_19.5mm.stl`（默认）
- `feelingmosaic_standing_palms_ring_20.5mm.stl`

每个 STL 同时提供 OBJ。

## 预览

- `cad/previews/standing_palms_ring_v7_gap.png`：从内圆看两只相对掌心。
- `cad/previews/standing_palms_ring_v7_isometric.png`：整体立体效果。
- `cad/previews/standing_palms_ring_v7_top.png`：确认掌片已不再平躺。
- `cad/previews/standing_palms_ring_v7_front.png`：确认手部高度与戒圈关系。

## 打印建议

- 现场展示优先使用 PLA 或 PLA Silk，层高 0.12–0.16 mm，4 道墙。
- 建议让戒圈侧面贴平台或倾斜 30–45°，避免立掌悬空面直接横向打印。
- 开启树状支撑，仅从热床生成，并重点检查掌心背面和指尖下方。
- 切片时合并重叠体；若切片器未自动合并，先在 Blender 中做体素重构或布尔并集。

V7 取代 V6 作为当前立掌方向版本。
