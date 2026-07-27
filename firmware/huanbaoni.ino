/**********************************************************************
 * 环抱你 · 情绪戒指固件  huanbaoni.ino
 * 主控: ESP32-S3   传感: MAX30102(心率/HRV)   执行: 震动马达
 *
 * 功能:
 *   1) MAX30102 读脉搏 → 算心率 BPM 与 RR 间隔 → 算 HRV(RMSSD)
 *   2) 通过 BLE Notify 把 HR / HRV 实时发给 H5 网页
 *   3) H5 发来字符串 "VIBRATE" → 马达震 1.5s (私密告警)
 *   4) (可选) GSR 皮肤电模拟量，取消注释即可上报
 *
 * ── 需要在 Arduino IDE 安装的库 (库管理器搜索安装) ──
 *   · SparkFun MAX3010x Pulse and Proximity Sensor Library
 *   (BLE 用 ESP32 板级自带的 BLEDevice，无需额外装)
 *
 * ── 开发板设置 ──
 *   开发板: "ESP32S3 Dev Module"    上传卡在 Connecting… 时按住 BOOT 键
 *
 * ── 接线图 (针脚号按需改, 改这里的 #define 即可) ──
 *   MAX30102        ESP32-S3
 *     VIN/3.3V  ->   3V3
 *     GND       ->   GND
 *     SDA       ->   GPIO8   (I2C 数据)
 *     SCL       ->   GPIO9   (I2C 时钟)
 *
 *   震动马达模块(带驱动)   ESP32-S3
 *     VCC       ->   3V3 (或 5V, 看模块)
 *     GND       ->   GND
 *     IN/SIG    ->   GPIO5
 *
 *   GSR 皮肤电(可选)      ESP32-S3
 *     VCC->3V3  GND->GND  SIG(AO) -> GPIO4 (ADC)
 **********************************************************************/

#include <Wire.h>
#include "MAX30105.h"        // SparkFun 库(兼容 MAX30102)
#include "heartRate.h"       // SparkFun 的心跳检测算法
#include <BLEDevice.h>
#include <BLEServer.h>
#include <BLEUtils.h>
#include <BLE2902.h>

// ---------- 引脚 (按你的实际接线改) ----------
#define PIN_SDA    8
#define PIN_SCL    9
#define PIN_MOTOR  5
#define PIN_GSR    4        // 可选

// ---------- BLE 契约 UUID (必须与 H5 完全一致, 见 docs/接口契约.md) ----------
#define SERVICE_UUID  "19b10000-e8f2-537e-4f6c-d104768a1214"
#define HR_UUID       "19b10003-e8f2-537e-4f6c-d104768a1214"
#define HRV_UUID      "19b10005-e8f2-537e-4f6c-d104768a1214"
#define GSR_UUID      "19b10006-e8f2-537e-4f6c-d104768a1214"
#define CMD_UUID      "19b10008-e8f2-537e-4f6c-d104768a1214"
#define DEVICE_NAME   "HuanbaoNi"

MAX30105 sensor;

// ---------- 心率 / HRV 计算 ----------
const byte RATE_SIZE = 8;
byte rates[RATE_SIZE];
byte rateSpot = 0;
long lastBeat = 0;
float beatsPerMinute = 0;
int beatAvg = 0;

// RR 间隔缓冲, 用于 RMSSD
const int RR_SIZE = 12;
long rrIntervals[RR_SIZE];
int rrCount = 0;
float hrvRMSSD = 0;

// ---------- BLE ----------
BLEServer* pServer = nullptr;
BLECharacteristic *chHR, *chHRV, *chGSR;
bool deviceConnected = false;

// 马达非阻塞控制
unsigned long motorOffAt = 0;

// 上报节流
unsigned long lastNotify = 0;

// ================= BLE 回调 =================
class ServerCB : public BLEServerCallbacks {
  void onConnect(BLEServer* s) override { deviceConnected = true; Serial.println("[BLE] 已连接"); }
  void onDisconnect(BLEServer* s) override {
    deviceConnected = false;
    Serial.println("[BLE] 断开, 重新广播");
    BLEDevice::startAdvertising();
  }
};

// 收到 H5 指令 (下行)
class CmdCB : public BLECharacteristicCallbacks {
  void onWrite(BLECharacteristic* c) override {
    String v = c->getValue().c_str();
    Serial.print("[CMD] 收到: "); Serial.println(v);
    if (v.startsWith("VIBRATE")) {
      digitalWrite(PIN_MOTOR, HIGH);
      motorOffAt = millis() + 1500;   // 震 1.5s
    }
  }
};

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
  Serial.println("\n=== 环抱你 戒指启动 ===");

  pinMode(PIN_MOTOR, OUTPUT);
  digitalWrite(PIN_MOTOR, LOW);

  // I2C + MAX30102
  Wire.begin(PIN_SDA, PIN_SCL);
  if (!sensor.begin(Wire, I2C_SPEED_FAST)) {
    Serial.println("[ERR] 找不到 MAX30102, 检查接线/供电(3.3V)!");
    while (1) { delay(1000); }
  }
  sensor.setup();                 // 默认配置
  sensor.setPulseAmplitudeRed(0x0A);
  sensor.setPulseAmplitudeGreen(0);
  Serial.println("[OK] MAX30102 就绪, 手指请轻贴传感器");

  // BLE
  BLEDevice::init(DEVICE_NAME);
  pServer = BLEDevice::createServer();
  pServer->setCallbacks(new ServerCB());
  BLEService* svc = pServer->createService(SERVICE_UUID);

  chHR = svc->createCharacteristic(HR_UUID, BLECharacteristic::PROPERTY_NOTIFY);
  chHR->addDescriptor(new BLE2902());
  chHRV = svc->createCharacteristic(HRV_UUID, BLECharacteristic::PROPERTY_NOTIFY);
  chHRV->addDescriptor(new BLE2902());
  chGSR = svc->createCharacteristic(GSR_UUID, BLECharacteristic::PROPERTY_NOTIFY);
  chGSR->addDescriptor(new BLE2902());

  BLECharacteristic* chCmd = svc->createCharacteristic(CMD_UUID, BLECharacteristic::PROPERTY_WRITE);
  chCmd->setCallbacks(new CmdCB());

  svc->start();
  BLEAdvertising* adv = BLEDevice::getAdvertising();
  adv->addServiceUUID(SERVICE_UUID);
  adv->setScanResponse(true);
  BLEDevice::startAdvertising();
  Serial.println("[OK] BLE 广播中, 设备名: " DEVICE_NAME);
}

void loop() {
  // 马达自动关闭 (非阻塞)
  if (motorOffAt && millis() > motorOffAt) {
    digitalWrite(PIN_MOTOR, LOW);
    motorOffAt = 0;
  }

  // 读一次 IR, 检测心跳
  long irValue = sensor.getIR();
  if (irValue > 50000) {                 // 有手指
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

        // 记 RR 间隔算 HRV
        if (rrCount < RR_SIZE) rrIntervals[rrCount++] = delta;
        else { for (int i = 1; i < RR_SIZE; i++) rrIntervals[i-1] = rrIntervals[i]; rrIntervals[RR_SIZE-1] = delta; }
        computeRMSSD();
      }
    }
  } else {
    beatAvg = 0;   // 没手指
  }

  // 每 1s 上报一次
  if (millis() - lastNotify > 1000) {
    lastNotify = millis();

    Serial.printf("HR=%d  HRV(RMSSD)=%.1fms  IR=%ld\n", beatAvg, hrvRMSSD, irValue);

    if (deviceConnected) {
      // HR: int → 字符串上报 (H5 端按文本解析, 简单可靠)
      char bufHr[8];  snprintf(bufHr, sizeof(bufHr), "%d", beatAvg);
      chHR->setValue((uint8_t*)bufHr, strlen(bufHr));
      chHR->notify();

      char bufHrv[12]; snprintf(bufHrv, sizeof(bufHrv), "%.1f", hrvRMSSD);
      chHRV->setValue((uint8_t*)bufHrv, strlen(bufHrv));
      chHRV->notify();

      // ---- 可选: GSR 皮肤电 ----
      // int gsr = analogRead(PIN_GSR);
      // char bufG[8]; snprintf(bufG, sizeof(bufG), "%d", gsr);
      // chGSR->setValue((uint8_t*)bufG, strlen(bufG));
      // chGSR->notify();
    }
  }
}
