// ============================================================
// 知愈·Ring「环抱你」演示外壳  enclosure.scad
// 参数化模型：底座盒(tray) + 上盖(lid)
// 尺寸依据 docs/硬件规格与外壳.md
//
// 用法：
//   1) 改下面 show 选择要导出的部件： "tray" / "lid" / "both"
//   2) 顶部参数区按实测微调（尤其 usb_center_spacing / usb_center_z）
//   3) 已装 OpenSCAD：
//        openscad -o tray.stl -D 'show="tray"' enclosure.scad
//        openscad -o lid.stl  -D 'show="lid"'  enclosure.scad
//
// 设计基调：圆润莫兰迪、多留白、禁硬直角（知愈调性）。
//   · 盒体四角竖向圆角，边缘柔和
//   · 盖顶左上角 logo（知愈·FeelingMosaic / Ring 真系列）
//   · 盖顶中部只留 hero「环抱你」+ 环抱它的一圈浅刻(呼应“环抱”)
// ⚠️ 最需核对：ESP32 两 Type-C 中心间距 usb_center_spacing(默认13)。
// ============================================================

show = "both";          // "tray" | "lid" | "both"
$fn = 64;

// ---------- 壁厚/公差/圆角 ----------
wall     = 2.0;
floor_t  = 2.0;
lid_t    = 3.0;
tol      = 0.4;
corner_r = 8;           // 盒体四角圆角(越大越柔和)
top_chamf= 1.8;         // 顶沿柔化倒角(含蓄有机曲面, 去硬边)

// ---------- 内腔(面包板56x165x8.5 + ESP32 + 走线) ----------
in_w = 62;
in_l = 172;
in_h = 32;

out_w  = in_w + 2*wall;
out_l  = in_l + 2*wall;
tray_h = floor_t + in_h;

// ---------- 双 Type-C 独立孔(端墙 y=0 面) ----------
usb_port_w        = 11;
usb_port_h        = 6;
usb_center_spacing= 13;   // ★两孔中心间距(最需核对)
usb_center_z      = 14;

// ---------- 侧面出线孔 ×2 (GSR电极线 + 马达线) ----------
wire_hole_d   = 9;
wire_hole_z   = 22;          // 抬高: 原10被面包板(顶≈z10.5)挡住一半 → 抬到22完全露出
wire_hole_y   = out_l*0.7;   // 沿长轴位置
wire_hole_gap = 14;          // 两孔间距(GSR线 + 马达线各一个)

// ---------- 盖顶：MAX30102(工字托盘) + MPU6050(单边L横槽) ----------
// MAX30102 心率：排针在左右两边(4+4)，连接器朝下 → 中间托起 + 两侧下沉通槽(工字)
max_bw = 15.5;  max_bl = 20;   // 板 宽×长
max_recess_d = 1.2;            // 定位浅槽深(板嵌入, 传感器朝上供手指按)
max_open_w   = 17;            // 横跨两排针的总开口宽(到板两边)
max_bridge_w = 4.5;          // 中间支撑柱宽(原8.5的一半, 让出板底元件+排针空间)
max_slot_l   = 20;            // 单侧下沉槽长(沿排针方向, 加长少留边距)
max_pos_from_end = 160;        // 聚到远端, 让出中部留白给 hero

// MPU6050 运动：排针只在一条边(L) → 一条大横槽给单排针
mpu_bw = 16;   mpu_bl = 21;
mpu_recess_d = 1.2;
mpu_slot_w   = 5;              // 横槽宽
mpu_slot_l   = 22;           // 横槽长(沿排针方向): 加长到满板长, 上下不留边距(原19排针卡住)
mpu_edge_off = 5;             // 横槽中心距板中心(移到一条边下)
mpu_pos_from_end = 133;

// ---------- 刻字(凹刻) ----------
engrave       = true;
engrave_depth = 0.8;
font_cn       = "Heiti SC";  // OpenSCAD2021可读；备选 Songti SC / Hiragino Sans GB。⚠️PingFang/Noto会豆腐块

// logo（左上角，两行）
logo_l1   = "知愈·FeelingMosaic";
logo_l2   = "Ring 真系列";
logo_size = 3.2;
logo_x    = corner_r + 3;    // 距左边
logo_y    = 16;              // 距 y=0 端(在 MAX 之前的留白区)

// hero（中部，仅「环抱你」）+ 环抱浅圈
hero_txt   = "「环抱你」";
hero_size  = 9;
hero_y     = 80;            // 中部整块留白的中心(传感器已聚到远端)
hero_ring  = true;         // 是否刻一圈“环抱”它
hero_ring_r= 27;           // 圈半径
hero_ring_w= 1.4;          // 圈线宽

// ---------- 环抱手臂(分体打印, 莫兰迪肤色) ----------
// 两只手臂从长边升起, 翻过盖沿, 双手在顶部十指相扣扣住盖子(兼当卡扣)。
arm_on     = true;         // 组装/预览时是否显示手臂
embrace_y  = out_l/2;      // 环抱中心(沿长轴), 与 hero 呼应
hand_yoff  = 3.2;          // 左右手在 y 上错开 → 十指相扣的交错感
foot_w     = 15;           // (旧矩形脚参数, 保留兼容)
foot_h     = 18;
foot_recess= 1.2;          // 墙上圆形凹座深(手臂圆根嵌入; 墙厚2mm, 余0.8mm)
foot_out   = 2.5;          // 安装脚凸出墙外的厚度(供限位blend进手臂)
foot_z0    = 5;            // 肩根参考 z
socket_d   = 13;           // ★圆形凹座直径(匹配圆形手臂根部, 圆对圆自对位)
foot_cz    = 13;           // 圆形凹座中心高 z
$fn_arm    = 40;           // 手臂球体细分(平衡出图速度)

// ============================================================
// 圆角矩形(2D)
module rrect(w, l, r) {
  hull() for (x = [r, w-r]) for (y = [r, l-r]) translate([x, y]) circle(r = r);
}

// ============================================================
// 有机肢体：沿路径的相邻控制点做球体 hull → 光滑锥形手臂
module limb(pts, rads) {
  for (i = [0:len(pts)-2])
    hull() {
      translate(pts[i])   sphere(r = rads[i],   $fn = $fn_arm);
      translate(pts[i+1]) sphere(r = rads[i+1], $fn = $fn_arm);
    }
}

// 圆润手掌(连指手套式, 无脆弱手指, 好打印) + 拇指
// s: +1 右手 / -1 左手 (决定拇指朝向)
module hand(pos, r, s) {
  translate(pos) {
    scale([1.35, 1.0, 0.62]) sphere(r = r, $fn = $fn_arm);          // 手掌扁球
    translate([s*r*0.55, -r*0.35, 0])
      scale([0.65, 0.9, 0.55]) sphere(r = r*0.62, $fn = $fn_arm);   // 拇指
  }
}

// 一只环抱手臂 (s=+1 右侧墙 x=out_w / s=-1 左侧墙 x=0)
module arm(s) {
  rx = (s > 0) ? out_w : 0;         // 根部所在墙面
  yb = embrace_y;
  yo = (s > 0) ? -hand_yoff : hand_yoff;   // 手部错位, 形成交错相扣
  pts = [
    [rx + s*0.2,  yb,          foot_z0 + 4],   // 肩根(贴墙, 融入安装脚)
    [rx + s*3.0,  yb,          17],            // 上臂外鼓(收窄, 抱得更紧)
    [rx + s*2.5,  yb,          27],            // 肘
    [rx - s*3.0,  yb + yo*0.4, 37.5],          // 前臂翻过盖沿, 落到盖顶(z37)之上
    [rx - s*15,   yb + yo*0.7, 40],            // 腕(轻搭盖顶)
    [rx - s*26,   yb + yo,     39],            // 接近中心, 准备相扣
  ];
  rads = [5.6, 6.0, 5.2, 4.2, 3.6, 3.2];
  union() {
    // 圆形安装脚(匹配圆形手臂根部, 插入盒壁圆形凹座; 榫深foot_recess + 凸出foot_out)
    translate([(s > 0) ? out_w - foot_recess : -foot_out, yb, foot_cz])
      rotate([0, 90, 0]) cylinder(h = foot_recess + foot_out, d = socket_d - 0.6, $fn = $fn_arm);
    limb(pts, rads);
    hand([rx - s*31, yb + yo, 40], 6, s);      // 手掌轻搭盖顶(右x≈35 左x≈31, 中心相扣)
  }
}

// ============================================================
module tray() {
  difference() {
    // 盒体：主体 + 顶沿内收倒角(柔化硬边, 含蓄有机感)
    union() {
      linear_extrude(tray_h - top_chamf) rrect(out_w, out_l, corner_r);
      translate([out_w/2, out_l/2, tray_h - top_chamf])
        linear_extrude(top_chamf,
                       scale = [(out_w - 2*top_chamf)/out_w, (out_l - 2*top_chamf)/out_l])
          translate([-out_w/2, -out_l/2]) rrect(out_w, out_l, corner_r);
    }
    // 内腔
    translate([wall, wall, floor_t])
      linear_extrude(in_h + 1) rrect(in_w, in_l, corner_r - wall);
    // 端墙两个 Type-C 独立孔
    for (dx = [-usb_center_spacing/2, usb_center_spacing/2])
      translate([out_w/2 + dx - usb_port_w/2, -1, usb_center_z - usb_port_h/2])
        cube([usb_port_w, wall + 2, usb_port_h]);
    // 侧墙出线孔 ×2 (GSR电极线 + 马达线), 抬高避开面包板
    for (dy = [0, wire_hole_gap])
      translate([-1, wire_hole_y + dy, wire_hole_z])
        rotate([0, 90, 0]) cylinder(h = wall + 2, d = wire_hole_d);
    // 两长边 手臂圆形安装脚定位凹座(圆对圆自对位, 匹配圆手臂根)
    for (s = [1, -1])
      translate([(s > 0) ? out_w - foot_recess : 0, embrace_y, foot_cz])
        rotate([0, 90, 0]) cylinder(h = foot_recess + 0.02, d = socket_d, $fn = $fn_arm);
  }
}

// ============================================================
module lid() {
  lip_h = 6;
  difference() {
    union() {
      linear_extrude(lid_t) rrect(out_w, out_l, corner_r);
      // 下沉定位唇
      translate([wall + tol/2, wall + tol/2, -lip_h])
        linear_extrude(lip_h) rrect(in_w - tol, in_l - tol, corner_r - wall);
    }

    // ---- MAX30102 工字托盘：中间托起板身，两侧排针通槽 ----
    // 定位浅槽(从盖顶下沉，板嵌入，传感器朝上供手指按)
    translate([out_w/2 - (max_bw + 1.5)/2, max_pos_from_end - (max_bl + 1.5)/2, lid_t - max_recess_d])
      linear_extrude(max_recess_d + 1) rrect(max_bw + 1.5, max_bl + 1.5, 1.5);
    // 两侧排针下沉通槽(工字：中间支撑柱 max_bridge_w, 两侧到板边的通槽)
    // 每侧槽宽 = (总开口 - 中柱)/2, 位于两侧边缘
    for (side = [-1, 1]) {
      sw = (max_open_w - max_bridge_w) / 2;
      cx = side * (max_bridge_w/2 + sw/2);      // 该侧槽中心 x(相对盖中心)
      translate([out_w/2 + cx - sw/2, max_pos_from_end - max_slot_l/2, -lip_h - 1])
        cube([sw, max_slot_l, lid_t + lip_h + 2]);
    }

    // ---- MPU6050 单边L横槽：定位浅槽 + 一条边排针通槽 ----
    // 定位浅槽
    translate([out_w/2 - (mpu_bw + 1.5)/2, mpu_pos_from_end - (mpu_bl + 1.5)/2, lid_t - mpu_recess_d])
      linear_extrude(mpu_recess_d + 1) rrect(mpu_bw + 1.5, mpu_bl + 1.5, 1.5);
    // 单边排针通槽(L：仅一条边穿透)
    translate([out_w/2 + mpu_edge_off - mpu_slot_w/2, mpu_pos_from_end - mpu_slot_l/2, -lip_h - 1])
      cube([mpu_slot_w, mpu_slot_l, lid_t + lip_h + 2]);

    // 刻字
    if (engrave) {
      // 左上角 logo 两行
      translate([logo_x, logo_y + logo_size*0.75, lid_t - engrave_depth])
        linear_extrude(engrave_depth + 0.1)
          text(logo_l1, size = logo_size, font = font_cn, halign = "left", valign = "center");
      translate([logo_x, logo_y - logo_size*0.75, lid_t - engrave_depth])
        linear_extrude(engrave_depth + 0.1)
          text(logo_l2, size = logo_size, font = font_cn, halign = "left", valign = "center");

      // 中部 hero「环抱你」
      translate([out_w/2, hero_y, lid_t - engrave_depth])
        linear_extrude(engrave_depth + 0.1)
          text(hero_txt, size = hero_size, font = font_cn, halign = "center", valign = "center");

      // 环抱浅圈(呼应“环抱”)
      if (hero_ring)
        translate([out_w/2, hero_y, lid_t - engrave_depth])
          linear_extrude(engrave_depth + 0.1)
            difference() {
              circle(r = hero_ring_r);
              circle(r = hero_ring_r - hero_ring_w);
            }
    }
  }
}

// ============================================================
// 装配预览：盒 + 盖(在顶) + 双臂环抱
module assembled() {
  color("#FAF9F7") tray();
  color("#FAF9F7") translate([0, 0, tray_h]) lid();
  color("#D4B8A5") { arm(1); arm(-1); }
}

// 手臂平躺(侧卧)以便无支撑打印：绕X转90°后落到床面
module arm_flat(s) {
  translate([0, 39, -78.8]) rotate([90, 0, 0]) arm(s);
}

// 打印排版(单板一次打完, 全部落在 z=0 床面, 零件间留≥18mm 间距防粘连)
// 盒体正放(开口朝上) + 盖子翻面(顶面朝下,唇朝上) + 两臂侧躺
module print_layout() {
  tray();                                                    // x[0,66]   y[0,176]
  translate([86, out_l, lid_t]) rotate([180, 0, 0]) lid();   // x[86,152] y[0,176] (距盒20)
  translate([139, 5, 0])  arm_flat(1);                       // x[170,215] y[0,40]  (距盖18)
  translate([180, 60, 0]) arm_flat(-1);                      // x[170,215] y[55,96] (距右臂15)
}

// ============================================================
if      (show == "tray")      tray();
else if (show == "lid")       lid();
else if (show == "arm")       arm(1);
else if (show == "arm_l")     arm(-1);
else if (show == "arms")      { arm(1); arm(-1); }
else if (show == "assembled") assembled();
else if (show == "section")
  // 在 embrace 平面切薄片, 验证 脚↔浅槽 / 手↔盖 配合
  intersection() {
    assembled();
    translate([-20, embrace_y - 3, -12]) cube([130, 6, 80]);
  }
else if (show == "print")     print_layout();
else { tray(); translate([out_w + 15, 0, 0]) lid(); }
