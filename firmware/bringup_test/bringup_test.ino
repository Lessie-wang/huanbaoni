/**********************************************************************
 * 环抱你 · 点火测试固件  bringup_test.ino
 * 目的: 心率传感器(MAX30102)还没到货时, 先验证:
 *   ① 开发板能烧录  ② 震动马达能震  ③ 蓝牙能被 Mac/H5 连上
 *   ④ H5 发 "VIBRATE" → 马达震  ⑤ 上报"假心率"给 H5 看仪表盘动
 * 不需要 MAX30102, 也不需要装 SparkFun 库, 直接就能编译。
 *
 * 只接一样东西: 震动马达模块
 *   VCC -> 3V3(或5V, 看模块)   GND -> GND   IN/SIG -> GPIO5
 * (开发板本身自带蓝牙, 不用接任何蓝牙模块)
 *
 * 开发板选 "ESP32S3 Dev Module"; 卡在 Connecting… 时按住 BOOT 键再松.
 **********************************************************************/

#include <BLEDevice.h>
#include <BLEServer.h>
#include <BLEUtils.h>
#include <BLE2902.h>

#define PIN_MOTOR 5

// —— BLE 契约 UUID(与 H5、正式固件完全一致) ——
#define SERVICE_UUID "19b10000-e8f2-537e-4f6c-d104768a1214"
#define HR_UUID      "19b10003-e8f2-537e-4f6c-d104768a1214"
#define HRV_UUID     "19b10005-e8f2-537e-4f6c-d104768a1214"
#define CMD_UUID     "19b10008-e8f2-537e-4f6c-d104768a1214"
#define DEVICE_NAME  "HuanbaoNi"

BLECharacteristic *chHR, *chHRV;
bool connected = false;
unsigned long motorOffAt = 0, lastNotify = 0;
int fakeHr = 72; int dir = 1;   // 假心率, 上下浮动让仪表盘动起来

class ServerCB : public BLEServerCallbacks {
  void onConnect(BLEServer* s) override { connected = true; Serial.println("[BLE] H5 已连接"); }
  void onDisconnect(BLEServer* s) override { connected = false; Serial.println("[BLE] 断开, 重新广播"); BLEDevice::startAdvertising(); }
};

class CmdCB : public BLECharacteristicCallbacks {
  void onWrite(BLECharacteristic* c) override {
    String v = c->getValue().c_str();
    Serial.print("[CMD] 收到: "); Serial.println(v);
    if (v.startsWith("VIBRATE")) { digitalWrite(PIN_MOTOR, HIGH); motorOffAt = millis() + 1500; }
  }
};

void blipMotor() {   // 开机自检: 震两下, 证明马达接对了
  for (int i = 0; i < 2; i++) { digitalWrite(PIN_MOTOR, HIGH); delay(200); digitalWrite(PIN_MOTOR, LOW); delay(200); }
}

void setup() {
  Serial.begin(115200); delay(300);
  Serial.println("\n=== 环抱你 点火测试 ===");
  pinMode(PIN_MOTOR, OUTPUT); digitalWrite(PIN_MOTOR, LOW);
  blipMotor();   // 上电震两下

  BLEDevice::init(DEVICE_NAME);
  BLEServer* srv = BLEDevice::createServer();
  srv->setCallbacks(new ServerCB());
  BLEService* svc = srv->createService(SERVICE_UUID);

  chHR = svc->createCharacteristic(HR_UUID, BLECharacteristic::PROPERTY_NOTIFY);
  chHR->addDescriptor(new BLE2902());
  chHRV = svc->createCharacteristic(HRV_UUID, BLECharacteristic::PROPERTY_NOTIFY);
  chHRV->addDescriptor(new BLE2902());
  BLECharacteristic* chCmd = svc->createCharacteristic(CMD_UUID, BLECharacteristic::PROPERTY_WRITE);
  chCmd->setCallbacks(new CmdCB());

  svc->start();
  BLEAdvertising* adv = BLEDevice::getAdvertising();
  adv->addServiceUUID(SERVICE_UUID); adv->setScanResponse(true);
  BLEDevice::startAdvertising();
  Serial.println("[OK] 蓝牙广播中, 设备名: " DEVICE_NAME "  (可用 Chrome/H5 连接)");
}

void loop() {
  if (motorOffAt && millis() > motorOffAt) { digitalWrite(PIN_MOTOR, LOW); motorOffAt = 0; }

  if (millis() - lastNotify > 1000) {
    lastNotify = millis();
    // 假心率在 65~95 之间来回走, 让 H5 仪表盘有动静
    fakeHr += dir * 2; if (fakeHr > 95) dir = -1; if (fakeHr < 65) dir = 1;
    float fakeHrv = 60 - (fakeHr - 65) * 1.2;   // 心率高时 HRV 低

    Serial.printf("假HR=%d  假HRV=%.1f  连接=%d\n", fakeHr, fakeHrv, connected);
    if (connected) {
      char b1[8];  snprintf(b1, sizeof(b1), "%d", fakeHr);       chHR->setValue((uint8_t*)b1, strlen(b1));  chHR->notify();
      char b2[12]; snprintf(b2, sizeof(b2), "%.1f", fakeHrv);    chHRV->setValue((uint8_t*)b2, strlen(b2)); chHRV->notify();
    }
  }
}
