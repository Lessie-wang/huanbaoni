/**********************************************************************
 * 环抱你 · 心率模块测试  hrtest.ino
 * 模块: MH-ET LIVE MAX30102 (I2C 光学心率/血氧传感器)
 * 目的: 独立验证心率传感器工作, 打印 IR 值 + 实时 BPM + HRV。
 *       (确认 OK 后再烧主固件 huanbaoni.ino, 避免卡死循环排查困难)
 *
 * 接线 (MAX30102 -> ESP32-S3):
 *   VIN -> 3V3         (模块自带稳压, 接 3.3V, 不要接 5V)
 *   GND -> GND
 *   SDA -> GPIO8       (I2C 数据)
 *   SCL -> GPIO9       (I2C 时钟)
 *   RD/IRD/INT/1V8/3V3 不接
 *
 * 需要库 (库管理器安装): SparkFun MAX3010x Pulse and Proximity Sensor Library
 * 烧录: 线插 A 口; 看串口: 线插 B 口, 115200。
 * 手指轻贴传感器亮红光那一面, 别用力压, 几秒后 BPM 稳定。
 **********************************************************************/

#include <Wire.h>
#include "MAX30105.h"        // SparkFun 库 (兼容 MAX30102)
#include "heartRate.h"       // 心跳检测算法
#include <math.h>

#define PIN_SDA 8
#define PIN_SCL 9

MAX30105 sensor;

const byte RATE_SIZE = 8;
byte rates[RATE_SIZE];
byte rateSpot = 0;
long lastBeat = 0;
float beatsPerMinute = 0;
int beatAvg = 0;

// RR 间隔缓冲, 算 HRV(RMSSD)
const int RR_SIZE = 12;
long rrIntervals[RR_SIZE];
int rrCount = 0;
float hrvRMSSD = 0;

unsigned long lastPrint = 0;

void computeRMSSD() {
  if (rrCount < 3) { hrvRMSSD = 0; return; }
  double sumSq = 0; int n = 0;
  for (int i = 1; i < rrCount; i++) {
    long d = rrIntervals[i] - rrIntervals[i - 1];
    sumSq += (double)d * d; n++;
  }
  hrvRMSSD = (n > 0) ? sqrt(sumSq / n) : 0;
}

void setup() {
  Serial.begin(115200);
  delay(300);
  Serial.println("\n=== 心率模块测试 hrtest ===");

  Wire.begin(PIN_SDA, PIN_SCL);
  if (!sensor.begin(Wire, I2C_SPEED_FAST)) {
    Serial.println("[错误] 找不到 MAX30102! 检查: VIN=3V3, SDA=8, SCL=9, GND 接好。");
    while (1) { delay(1000); }
  }
  sensor.setup();                    // 默认配置
  sensor.setPulseAmplitudeRed(0x0A); // 红光弱亮 = 存在指示
  sensor.setPulseAmplitudeGreen(0);
  Serial.println("[OK] MAX30102 就绪。手指轻贴亮红光那一面, 别压太紧~");
}

void loop() {
  long irValue = sensor.getIR();

  if (irValue > 50000) {             // 有手指贴上
    if (checkForBeat(irValue)) {
      long now = millis();
      long delta = now - lastBeat;
      lastBeat = now;
      beatsPerMinute = 60.0 / (delta / 1000.0);
      if (beatsPerMinute > 20 && beatsPerMinute < 255) {
        rates[rateSpot++] = (byte)beatsPerMinute;
        rateSpot %= RATE_SIZE;
        int sum = 0; for (byte i = 0; i < RATE_SIZE; i++) sum += rates[i];
        beatAvg = sum / RATE_SIZE;

        if (rrCount < RR_SIZE) rrIntervals[rrCount++] = delta;
        else { for (int i = 1; i < RR_SIZE; i++) rrIntervals[i-1] = rrIntervals[i]; rrIntervals[RR_SIZE-1] = delta; }
        computeRMSSD();
      }
    }
  } else {
    beatAvg = 0;                      // 没手指
  }

  if (millis() - lastPrint > 1000) {
    lastPrint = millis();
    if (irValue <= 50000) {
      Serial.printf("[无手指] IR=%ld  (把手指轻贴到亮红光的一面)\n", irValue);
    } else {
      Serial.printf("HR=%d bpm  HRV(RMSSD)=%.1fms  IR=%ld\n", beatAvg, hrvRMSSD, irValue);
    }
  }
}
