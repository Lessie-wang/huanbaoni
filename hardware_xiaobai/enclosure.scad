// ============================================================
// 知愈·Ring「环抱你」演示外壳  enclosure.scad
// —— 小白人形版 (chubby humanoid「小白」) ——
// 前后对开抽壳身体 + 小头 + 两只香槟环抱手臂 + 两只脚
//   · 正面(+Y) : MAX30102 心率 工字开口(卡入胸口) + 「环抱你」凹刻
//   · 背面(-Y) : MPU6050 运动 一字开口 + 2 圆形出线孔
//   · 脚底(-Z) : 双 Type-C
// 缝在 y=0 前后对开: 前壳=body_front(+Y) 后壳=body_back(-Y)
//
// 用法:
//   openscad -o lid.stl  -D 'show="body_front"' enclosure.scad   (前壳, 兼容旧名 lid)
//   openscad -o tray.stl -D 'show="body_back"'  enclosure.scad   (后壳, 兼容旧名 tray)
//   openscad -o arms.stl -D 'show="arms"'       enclosure.scad
//   openscad -o print_all.stl -D 'show="print"' enclosure.scad
//   预览: -D 'show="assembled"'
//   校核: show="wall_check"(空=壁不侵占电子腔) / "cavity_check"
// 基调: 圆润莫兰迪、含蓄有机、肥嘟嘟好抱。
// ============================================================

show = "assembled";
$fn  = 64;

// ---------- 身体(躯干椭球) ----------
torso_rx = 54;   // 半宽 → 宽 108
torso_ry = 40;   // 半深 → 深 80 (肥嘟嘟, 最大瘦身杠杆)
torso_rz = 64;   // 半高 → 躯干高 128
torso_cz = 64;   // 中心高(底≈0)

// 抽壳内腔(缩放躯干) —— 薄壁省打印时间, 电子腔仍够
inner_sx = 0.95; // 壁≈2.7mm
inner_sy = 0.935;// 壁≈2.6mm (腹深方向)
inner_sz = 0.95;

// ---------- 头 ----------
head_c   = [0, -2, 128];
head_ro  = [20, 17, 15];   // 外
head_ri  = [16, 13, 11.5]; // 内(中空, 与躯干连通)

// ---------- 脚 ----------
foot_dx  = 20;   // 左右脚中心距中线
foot_c_z = 3;
foot_r   = [13, 16, 7];

// ---------- 正面 MAX30102 心率 (工字) ----------
max_z        = 72;    // 胸口高度
max_bw       = 15.5;  max_bl = 20;   // 板 宽×长
max_open_w   = 17;    // 两排针总开口宽
max_bridge_w = 4.5;   // 中间支撑柱宽
max_slot_l   = 20;    // 单侧通槽长
max_recess_d = 1.4;   // 板嵌入浅槽深

// ---------- 背面 MPU6050 运动 (一字) ----------
mpu_z        = 82;
mpu_bw       = 16;   mpu_bl = 21;
mpu_slot_w   = 5;    mpu_slot_l = 22;
mpu_edge_off = 5;    // 槽中心偏到一条边
mpu_recess_d = 1.4;

// boss(凸台)外/内 y 平面(足够穿越腹壁, 保证凸出+通透)
front_boss_out = 47;  front_boss_in = 26;
back_boss_out  = -47; back_boss_in  = -26;

// ---------- 背面出线孔 ×2 (GSR + 马达) ----------
wire_d   = 9;
wire_z   = 34;
wire_gap = 14;

// ---------- 脚底双 Type-C ----------
usb_w = 11; usb_h = 6; usb_gap = 13; usb_z = 12; usb_y = 14;

// ---------- 刻字 ----------
font_cn   = "Heiti SC";
hero_txt  = "环抱你";
hero_size = 5.5;
hero_z    = 52;      // 胸口 MAX 下方
engrave_d = 1.5;

// ---------- 手臂(分体, 香槟色) ----------
arm_z0    = 88;      // 肩根高
$fn_arm   = 40;

// ============================================================
// 基元
module ellipsoid(c, r) { translate(c) scale(r) sphere(r = 1, $fn = $fn); }

module rounded_box(sz, r = 3) {
  hull() for (x = [-1,1]) for (y = [-1,1]) for (z = [-1,1])
    translate([x*(sz[0]/2 - r), y*(sz[1]/2 - r), z*(sz[2]/2 - r)])
      sphere(r = r, $fn = 24);
}

// 前/后凸台(从腹内穿到腹外, 保证凸出且可开通槽)
module front_boss() {
  translate([0, (front_boss_out + front_boss_in)/2, max_z])
    rounded_box([24, front_boss_out - front_boss_in, 30], 4);
}
module back_boss() {
  translate([0, (back_boss_out + back_boss_in)/2, mpu_z])
    rounded_box([26, back_boss_in - back_boss_out, 31], 4);
}

// ---------- 身体实体(外) ----------
module body_outer() {
  union() {
    ellipsoid([0,0,torso_cz], [torso_rx, torso_ry, torso_rz]);
    ellipsoid(head_c, head_ro);
    for (s = [-1,1]) ellipsoid([s*foot_dx, 0, foot_c_z], foot_r);   // 脚居中跨缝(前后各半, 不留浮件)
    front_boss();
    back_boss();
  }
}
// ---------- 身体内腔(中空) ----------
module body_inner() {
  union() {
    ellipsoid([0,0,torso_cz], [torso_rx*inner_sx, torso_ry*inner_sy, torso_rz*inner_sz]);
    ellipsoid(head_c, head_ri);
  }
}

// ---------- 功能开口 ----------
// 正面 MAX 工字: 板浅槽 + 中柱两侧通槽
module max_cuts() {
  sw = (max_open_w - max_bridge_w)/2;
  // 板嵌入浅槽(从外表面下沉)
  translate([0, front_boss_out - max_recess_d/2, max_z])
    rounded_box([max_bw + 2, max_recess_d + 0.1, max_bl + 2], 0.8);
  // 两侧穿透通槽
  for (side = [-1,1]) {
    cx = side*(max_bridge_w/2 + sw/2);
    translate([cx, (front_boss_out + front_boss_in)/2, max_z])
      cube([sw, (front_boss_out - front_boss_in) + 30, max_slot_l], center = true);
  }
}
// 背面 MPU 一字: 板浅槽 + 单边通槽
module mpu_cuts() {
  translate([0, back_boss_out + mpu_recess_d/2, mpu_z])
    rounded_box([mpu_bw + 2, mpu_recess_d + 0.1, mpu_bl + 2], 0.8);
  translate([mpu_edge_off, (back_boss_out + back_boss_in)/2, mpu_z])
    cube([mpu_slot_w, (back_boss_in - back_boss_out) + 30, mpu_slot_l], center = true);
}
// 背面出线孔
module wire_holes() {
  for (dx = [-wire_gap/2, wire_gap/2])
    translate([dx, 0, wire_z]) rotate([90,0,0]) cylinder(h = 120, d = wire_d, center = true);
}
// 脚底双 Type-C(竖直穿底)
module usb_holes() {
  for (dx = [-usb_gap/2, usb_gap/2])
    translate([dx, usb_y, usb_z]) rotate([0,0,0])
      cube([usb_w, usb_h, 40], center = true);
}
// 正面胸口刻字(镜像修正朝外正读)
module engrave_text() {
  translate([0, front_boss_out - 6, hero_z]) rotate([90,0,0])
    linear_extrude(height = engrave_d + 4)
      mirror([1,0,0]) text(hero_txt, size = hero_size, font = font_cn,
                           halign = "center", valign = "center", spacing = 1.05);
}

// ============================================================
// 前壳 / 后壳 (y=0 对开)
module body_hollow() { difference() { body_outer(); body_inner(); } }

module body_front() {
  difference() {
    intersection() {
      body_hollow();
      translate([-200, 0, -60]) cube([400, 300, 320]);   // 保留 y>=0
    }
    max_cuts();
    engrave_text();
    usb_holes();      // Type-C 在前底
  }
}
module body_back() {
  difference() {
    intersection() {
      body_hollow();
      translate([-200, -300, -60]) cube([400, 300, 320]); // 保留 y<=0
    }
    mpu_cuts();
    wire_holes();
  }
}

// ============================================================
// 手臂: 沿路径球体 hull → 光滑锥形; 连指手套手掌
module limb(pts, rads) {
  for (i = [0:len(pts)-2])
    hull() {
      translate(pts[i])   sphere(r = rads[i],   $fn = $fn_arm);
      translate(pts[i+1]) sphere(r = rads[i+1], $fn = $fn_arm);
    }
}
module hand(pos, r, s) {
  translate(pos) {
    scale([1.35, 1.0, 0.62]) sphere(r = r, $fn = $fn_arm);
    translate([-s*r*0.4, r*0.35, 0]) scale([0.65,0.9,0.55]) sphere(r = r*0.62, $fn = $fn_arm);
  }
}
// s=+1 右臂(从 +x 肩), s=-1 左臂; 翻到正面(+Y)相拥
module arm(s) {
  sx = s*torso_rx*0.82;
  pts = [
    [sx,          6,   arm_z0],       // 肩根(贴体侧, 略偏前)
    [sx + s*3,    20,  arm_z0-4],     // 上臂外鼓
    [s*38,        36,  arm_z0-14],    // 肘(向前包)
    [s*20,        46,  arm_z0-24],    // 前臂
    [s*7,         49,  arm_z0-30],    // 腕
  ];
  rads = [6.4, 6.0, 5.2, 4.4, 3.8];
  union() {
    limb(pts, rads);
    hand([s*2, 50, arm_z0-31], 6, s); // 双手在正中相扣
  }
}
module arms() { arm(1); arm(-1); }

// ============================================================
module assembled() {
  color("#FBFAF7") body_front();
  color("#FBFAF7") body_back();
  color("#E3D0A0") arms();          // 香槟色手臂
}

// 手臂平躺(便于无支撑打印)
module arm_flat(s) { translate([0, 34, -(arm_z0-31)]) rotate([90,0,0]) arm(s); }

// 打印排版: 前壳开口朝上 + 后壳开口朝上 + 两臂侧躺, 间距≥18
module print_layout() {
  rotate([-90,0,0]) body_back();                 // 后壳躺平(腔朝上)
  translate([130,0,0]) rotate([90,0,0]) body_front();
  translate([60, 100, 0]) arm_flat(1);
  translate([60, 130, 0]) arm_flat(-1);
}

// ============================================================
if      (show == "body_front")  body_front();
else if (show == "body_back")   body_back();
else if (show == "arm")         arm(1);
else if (show == "arm_l")       arm(-1);
else if (show == "arms")        arms();
else if (show == "assembled")   assembled();
else if (show == "print")       print_layout();
else if (show == "wall_check")
  // 内腔壳应不侵占电子腔: 内壳 与 电子包络 的交集应为空
  intersection() {
    difference() { body_outer(); body_inner(); }              // 壳体
    ellipsoid([0,0,torso_cz], [27.5, 4.5, 45]);               // 立式面包板+ESP 包络(半尺寸)
  }
else if (show == "cavity_check")
  intersection() {
    body_inner();
    translate([-100, -100, -60]) cube([200, 100, 320]);       // 剖开看腔
  }
else assembled();
