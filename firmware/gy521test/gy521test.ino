/**********************************************************************
 * 环抱你 · 六轴测试  gy521test.ino
 * 模块: GY-521 (MPU6050, 3轴加速度 + 3轴陀螺仪)
 * 目的: 验证六轴工作, 打印加速度/角速度 + "动作强度"。
 *       戴在手上时的抖动/摩挲/小动作 → 动作强度上升 (紧张行为信号)。
 *
 * 接线 (GY-521 -> ESP32-S3):
 *   VCC -> 3V3
 *   GND -> GND
 *   SDA -> GPIO8    (I2C, 与心率共用)
 *   SCL -> GPIO9
 *   AD0 -> GND(或不接)  INT/XCL/XDA 不接
 *
 * 免装库: 直接读 MPU6050 寄存器。
 * 烧录: 线插 A 口; 看串口: 线插 B 口, 115200。
 * 拿起来晃/敲桌子 → 动作强度数字和长条变大。
 **********************************************************************/

#include <Wire.h>

#define PIN_SDA 8
#define PIN_SCL 9
#define MPU_ADDR 0x68

int16_t ax, ay, az, gx, gy, gz;

// 静态基线(重力)与动作强度平滑
float motion = 0;
unsigned long lastPrint = 0;

bool mpuWrite(uint8_t reg, uint8_t val) {
  Wire.beginTransmission(MPU_ADDR);
  Wire.write(reg); Wire.write(val);
  return Wire.endTransmission() == 0;
}

void setup() {
  Serial.begin(115200);
  delay(300);
  Serial.println("\n=== 六轴测试 gy521test (MPU6050) ===");

  Wire.begin(PIN_SDA, PIN_SCL);

  // 探测是否在总线上
  Wire.beginTransmission(MPU_ADDR);
  if (Wire.endTransmission() != 0) {
    Serial.println("[错误] 找不到 MPU6050(0x68)! 检查 VCC=3V3, SDA=8, SCL=9, AD0=GND。");
    while (1) delay(1000);
  }

  mpuWrite(0x6B, 0x00);   // 电源管理: 唤醒(退出睡眠)
  delay(100);
  Serial.println("[OK] MPU6050 就绪。晃动/敲桌子试试~");
}

void loop() {
  // 从 0x3B 连读 14 字节: accel(6) + temp(2) + gyro(6)
  Wire.beginTransmission(MPU_ADDR);
  Wire.write(0x3B);
  Wire.endTransmission(false);
  Wire.requestFrom(MPU_ADDR, 14, true);
  if (Wire.available() < 14) { delay(20); return; }

  ax = (Wire.read() << 8) | Wire.read();
  ay = (Wire.read() << 8) | Wire.read();
  az = (Wire.read() << 8) | Wire.read();
  Wire.read(); Wire.read();          // 温度, 跳过
  gx = (Wire.read() << 8) | Wire.read();
  gy = (Wire.read() << 8) | Wire.read();
  gz = (Wire.read() << 8) | Wire.read();

  // 动作强度: 用陀螺仪(角速度)幅度, 静止≈0, 动起来变大
  float g = (fabs((float)gx) + fabs((float)gy) + fabs((float)gz)) / 131.0; // °/s
  motion = motion * 0.8 + g * 0.2;

  if (millis() - lastPrint > 200) {
    lastPrint = millis();
    int lvl = (int)(motion / 300.0 * 40); if (lvl > 40) lvl = 40; if (lvl < 0) lvl = 0;
    char bar[41]; for (int i = 0; i < 40; i++) bar[i] = (i < lvl) ? '#' : '.'; bar[40] = 0;
    Serial.printf("动作强度 %3.0f |%s|  a[%d,%d,%d]\n", motion, bar, ax, ay, az);
  }
  delay(20);
}
