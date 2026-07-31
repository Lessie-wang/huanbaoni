// ============================================================
// 环抱你 · 硬件可视化 (for demo video)
//   模块按真实安装位摆进壳里 + 剖面 / 爆炸图
//   use enclosure.scad 的壳体, 这里只加简化模块 + 渲染编排
//   mode = ext | cut | explode
// ============================================================
use </Users/wangjiayi14/Downloads/知愈-ring真系列/huanbaoni/hardware_xiaobai/enclosure.scad>

mode = "cut";
spin = 0;    // 绕竖直轴旋转（转台动画用）
$fn = 64;

// 配色
C_WHITE = "#FBFAF7";
C_PINK  = "#E7C6AC";   // 鎏光 silk 香槟粉（手臂）
C_PCB_G = "#2E7D52";   // 面包板绿
C_PCB_K = "#1C1C22";   // ESP32 黑
C_PCB_R = "#8E2F4C";   // MAX30102 暗红
C_PCB_B = "#274B8E";   // MPU6050 蓝
C_GOLD  = "#C9A24B";   // 排针/触点金
C_COP   = "#B06B3A";   // 电极铜

// ---------- 通用零件 ----------
module pcb(w, l, t, col) {                 // 以中心为原点, 厚度沿 Y
  color(col) translate([0, -t/2, 0])
    rotate([-90,0,0]) linear_extrude(t)
      offset(r=0.8) offset(delta=-0.8) square([w, l], center=true);
}
module header(n, col=C_GOLD) {             // 一排排针, 沿 X, 朝 +Y
  color(col) for (i=[0:n-1])
    translate([(i-(n-1)/2)*2.54, 0, 0]) rotate([-90,0,0]) cylinder(h=4, d=0.9);
}

// ---------- 各模块 (原点=模块中心, 面朝 +Y 或 -Y 由摆放决定) ----------
module m_breadboard() {                     // 面包板 82x55x8.5, 竖装, 背贴后壳
  color("#EDE7D6") translate([0,-24,62]) rotate([-90,0,0])
    linear_extrude(8.5) offset(r=2) offset(delta=-2) square([55,82], center=true);
}
module m_esp32() {                          // ESP32-S3 27.9x57.2, 竖装, 前下, Type-C 朝下
  translate([0,20,30]) {
    pcb(27.9, 57.2, 1.6, C_PCB_K);
    // 双 Type-C 朝下
    color("#888") for (dx=[-6.5,6.5]) translate([dx,0,-30]) cube([8.5,3.2,6], center=true);
    // USB 屏蔽罩 + 芯片
    color("#3a3a44") translate([0,1.2,8]) cube([16,2.5,18], center=true);
  }
}
module m_max30102() {                        // 心率/HRV, 前凸台 z72, 朝 +Y
  translate([0,40,72]) {
    pcb(15.5,20,1.2,C_PCB_R);
    color("#111") translate([0,0.9,0]) cube([5.6,1.4,3.4], center=true);   // 光学窗
    translate([0,-0.9,-8]) rotate([180,0,0]) header(5);                    // 排针朝内
  }
}
module m_mpu6050() {                         // 敲击/运动, 后凸台 z82, 朝 -Y
  translate([0,-34,82]) rotate([0,0,180]) {
    pcb(16,21,1.2,C_PCB_B);
    color("#222") translate([0,-0.9,0]) cube([3,1.2,3], center=true);
    translate([0,-0.9,-9]) rotate([180,0,0]) header(8);
  }
}
module m_gsr() {                             // 皮肤电模块, 壳内(挂面包板前)
  translate([16,-14,40]) { pcb(20,32,1.2,"#3E6B8E"); }
}
module m_mic() {                             // INMP441 麦克风
  translate([-18,-14,44]) { pcb(14,18,1.2,"#4A4A55"); }
}

// ---------- 外接指套 (GSR 正负极板 + 振动马达) ----------
module finger_cuff(open=0) {
  // C 形指套, 放在盒子前方
  translate([0, 78 + open, 40]) {
    color(C_WHITE) rotate([90,0,0])
      rotate_extrude(angle=280, $fn=64) translate([12,0]) circle(d=9);
    // 正负极板
    color(C_COP) translate([-6,0,-11]) cube([9,5,1.2], center=true);   // +
    color("#9AA0A6") translate([6,0,-11]) cube([9,5,1.2], center=true); // -
    // 振动马达 coin
    color("#5b5b66") translate([0,0,12]) rotate([90,0,0]) cylinder(h=2.7,d=10, center=true);
  }
}

// ---------- 线缆 (背面孔 -> 指套) ----------
module wires() {
  color("#C86B7A") for (dx=[-7,7])
    translate([dx,-44,50]) rotate([-90,0,0]) cylinder(h=6,d=2.4);
}

// ---------- 内部模块合集 ----------
module internals() {
  m_breadboard(); m_esp32(); m_max30102(); m_mpu6050(); m_gsr(); m_mic();
}

// ---------- 渲染编排 ----------
module shell_front(a=1) { color(C_WHITE, a) body_front(); }
module shell_back(a=1)  { color(C_WHITE, a) body_back(); }
module the_arms(a=1)    { color(C_PINK, a) arms(); }

rotate([0,0,spin]) scene();
module scene() {
if (mode == "ext") {
  shell_front(); shell_back(); the_arms();
} else if (mode == "cut") {
  // 开壳剖切: 后半壳作碗底(实), 手臂淡出作框, 内部模块实心露出
  shell_back();
  the_arms(0.4);
  internals();
  wires();
  finger_cuff();
} else if (mode == "cut_wedge") {
  difference() {
    union() { shell_front(); shell_back(); the_arms(); }
    translate([0, 0, -20]) cube([140, 140, 340]);
  }
  internals();
  wires();
  finger_cuff();
} else if (mode == "explode") {
  shell_back();  the_arms();
  translate([0,  80, 0]) shell_front();
  translate([0, 150, 0]) m_max30102();
  translate([0,-110, 0]) m_mpu6050();
  m_breadboard();
  translate([0,  55, -6]) m_esp32();
  translate([ 70, 6, 0]) m_gsr();
  translate([-70, 6, 0]) m_mic();
  finger_cuff(140);
  wires();
} else if (mode == "explode_old") {
  shell_back();  the_arms();
  translate([0, 60, 0]) shell_front();
  translate([0, 90, 0]) m_max30102();
  translate([0,-70, 0]) m_mpu6050();
  m_breadboard();
  translate([0, 40, 0]) m_esp32();
  translate([40,10,0]) m_gsr();
  translate([-40,10,0]) m_mic();
  finger_cuff(60);
  wires();
}
}
