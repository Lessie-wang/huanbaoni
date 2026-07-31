/*
 * i2c_scan.ino — I2C 扫描 + MAX30102 原始 IR 探测（排查"心率时准时不准"）
 * 主控: ESP32-S3   引脚与主固件一致: SDA=GPIO8  SCL=GPIO9   波特率: 115200
 *
 * 用法:
 *   1) Arduino IDE 打开本文件 → 选对开发板/端口 → 上传
 *   2) 工具 → 串口监视器, 波特率选 115200
 *   3) 看输出:
 *      · 扫到 0x57  → MAX30102 模块 + I2C 线都是好的（问题在佩戴/PPG算法层）
 *      · 扫到 0x68  → MPU6050 六轴也在（顺带确认）
 *      · 一个都扫不到 → 线松 / 供电(必须3.3V) / 虚焊 / 模块问题
 *   4) 手指轻贴传感器, 看 IR 值:
 *      · 稳定 > 50000 且平滑变化 → 传感器工作正常
 *      · 掉到 0/几百、乱跳 → 边看边轻晃每根杜邦线, 哪根一碰就跳就是它
 *
 * 只依赖 Arduino 自带的 Wire 库, 无需装任何第三方库。
 */
#include <Wire.h>

#define PIN_SDA 8
#define PIN_SCL 9

#define MAX30102_ADDR 0x57   // 心率模块固定地址
#define MPU6050_ADDR  0x68   // 六轴固定地址

// MAX30102 读 IR 需要的寄存器（不依赖 SparkFun 库，直接裸读）
#define REG_INTR_STATUS_1 0x00
#define REG_FIFO_WR_PTR   0x04
#define REG_FIFO_RD_PTR   0x06
#define REG_FIFO_DATA     0x07
#define REG_MODE_CONFIG   0x09
#define REG_SPO2_CONFIG   0x0A
#define REG_LED1_PA       0x0C   // Red
#define REG_LED2_PA       0x0D   // IR
#define REG_PART_ID       0xFF

bool max30102Found = false;

void writeReg(uint8_t reg, uint8_t val) {
  Wire.beginTransmission(MAX30102_ADDR);
  Wire.write(reg);
  Wire.write(val);
  Wire.endTransmission();
}

uint8_t readReg(uint8_t reg) {
  Wire.beginTransmission(MAX30102_ADDR);
  Wire.write(reg);
  Wire.endTransmission(false);
  Wire.requestFrom(MAX30102_ADDR, 1);
  return Wire.available() ? Wire.read() : 0;
}

// 简单初始化 MAX30102 到 SpO2 模式（会点亮 Red+IR LED），便于读 IR
void initMax30102() {
  writeReg(REG_MODE_CONFIG, 0x40);   // reset
  delay(100);
  writeReg(REG_MODE_CONFIG, 0x03);   // SpO2 模式（Red + IR）
  writeReg(REG_SPO2_CONFIG, 0x27);   // 100Hz, 411us 脉宽, 18bit
  writeReg(REG_LED1_PA, 0x24);       // Red LED 电流 ~7mA
  writeReg(REG_LED2_PA, 0x24);       // IR  LED 电流 ~7mA
  writeReg(REG_FIFO_WR_PTR, 0x00);
  writeReg(REG_FIFO_RD_PTR, 0x00);
}

// 读一个 FIFO 采样，返回 IR 通道值（18bit）
long readIR() {
  Wire.beginTransmission(MAX30102_ADDR);
  Wire.write(REG_FIFO_DATA);
  Wire.endTransmission(false);
  Wire.requestFrom(MAX30102_ADDR, 6);   // 一次采样 = Red(3) + IR(3)
  if (Wire.available() < 6) return -1;
  // 前 3 字节 Red，后 3 字节 IR
  Wire.read(); Wire.read(); Wire.read();               // 丢弃 Red
  long ir = 0;
  ir = (long)Wire.read() << 16;
  ir |= (long)Wire.read() << 8;
  ir |= (long)Wire.read();
  ir &= 0x03FFFF;   // 18bit 掩码
  return ir;
}

void scan() {
  Serial.println("\n----- I2C 扫描开始 -----");
  int count = 0;
  for (uint8_t addr = 1; addr < 127; addr++) {
    Wire.beginTransmission(addr);
    if (Wire.endTransmission() == 0) {
      count++;
      Serial.printf("  找到设备 @ 0x%02X", addr);
      if (addr == MAX30102_ADDR) Serial.print("   <- MAX30102 心率模块 ✓");
      if (addr == MPU6050_ADDR)  Serial.print("   <- MPU6050 六轴 ✓");
      Serial.println();
    }
  }
  if (count == 0) {
    Serial.println("  ✗ 没扫到任何 I2C 设备！");
    Serial.println("    → 查: VIN必须接3.3V(别接5V) / GND共地 / SDA=8 SCL=9 / 杜邦线松动或虚焊");
  } else {
    Serial.printf("  共 %d 个设备\n", count);
  }
  Serial.println("----- 扫描结束 -----");
}

void setup() {
  Serial.begin(115200);
  delay(500);
  Serial.println("\n=== I2C 扫描 + MAX30102 IR 探测 (SDA=8 SCL=9) ===");

  Wire.begin(PIN_SDA, PIN_SCL);
  Wire.setClock(100000);   // 100kHz，排查时用慢速更稳

  scan();

  // 若扫到心率模块，读 PART_ID 并初始化，方便后面看 IR
  Wire.beginTransmission(MAX30102_ADDR);
  if (Wire.endTransmission() == 0) {
    max30102Found = true;
    uint8_t pid = readReg(REG_PART_ID);
    Serial.printf("MAX30102 PART_ID = 0x%02X (正常应为 0x15)\n", pid);
    initMax30102();
    Serial.println("已初始化 MAX30102，下面开始每秒打印 IR 值：");
    Serial.println("  手指轻贴传感器 → IR 应 > 50000 且平滑；掉0/乱跳 = 接触或线的问题");
  } else {
    Serial.println("未找到 MAX30102，无法读 IR。请先解决接线/供电后重试。");
  }
}

void loop() {
  if (!max30102Found) {
    // 没找到就每 3 秒重扫一次，便于你边插拔边看
    delay(3000);
    scan();
    Wire.beginTransmission(MAX30102_ADDR);
    if (Wire.endTransmission() == 0) { max30102Found = true; initMax30102(); }
    return;
  }

  // 读几个采样取最大（FIFO 里可能有多个）
  long irMax = 0;
  for (int i = 0; i < 8; i++) {
    long v = readIR();
    if (v > irMax) irMax = v;
    delay(5);
  }
  const char *hint = (irMax > 50000) ? "手指贴好、信号稳"
                    : (irMax > 5000)  ? "有信号但偏弱(贴紧点/手别动)"
                                      : "几乎无信号(没贴/接触松/线松)";
  Serial.printf("IR = %ld   %s\n", irMax, hint);
  delay(1000);
}
