/**********************************************************************
 * 环抱你 · 情绪戒指固件  huanbaoni.ino
 * 主控: ESP32-S3   传感: MAX30102(心率/HRV) + GSR + MPU6050   执行: 震动马达
 *
 * 功能:
 *   1) MAX30102 读脉搏 → 算心率 BPM 与 RR 间隔 → 算 HRV(RMSSD)
 *   2) GSR 皮肤电导 (GPIO10 ADC) → 上报唤醒水平
 *   3) MPU6050 六轴 → 算运动量 motion (给 H5 做运动伪迹闸门 + 坐立不安信号)
 *   4) MPU6050 检测"双击戒指"手势 → 上报 GESTURE=DBLTAP (H5 敲一下开始说话)
 *   5) 通过 BLE Notify 把 HR / HRV / GSR / MOTION / GESTURE 实时发给 H5 网页
 *   6) H5 发来 "VIBRATE:INTERCEPT/ANCHOR/RETREAT" → 三档干预触觉 (PWM 非阻塞)
 *        INTERCEPT 轻促短震 | ANCHOR 共振呼吸吸4呼6渐强渐弱x3 | RETREAT 两下长震
 *
 * ── 需要在 Arduino IDE 安装的库 (库管理器搜索安装) ──
 *   · SparkFun MAX3010x Pulse and Proximity Sensor Library
 *   (BLE 用 ESP32 板级自带的 BLEDevice；MPU6050 直接读寄存器免装库)
 *
 * ── 开发板设置 ──
 *   开发板: "ESP32S3 Dev Module"    上传卡在 Connecting… 时按住 BOOT 键
 *
 * ── 整机接线图 (针脚号按需改, 改下面的 #define 即可) ──
 *   MAX30102     ESP32-S3        MPU6050(GY-521)  ESP32-S3
 *     VIN  ->    3V3               VCC  ->  3V3
 *     GND  ->    GND               GND  ->  GND
 *     SDA  ->    GPIO8 (I2C)       SDA  ->  GPIO8 (并联)
 *     SCL  ->    GPIO9 (I2C)       SCL  ->  GPIO9 (并联)
 *                                  AD0  ->  GND
 *   震动马达(带驱动) ESP32-S3       GSR Sensor      ESP32-S3
 *     VCC  ->    3V3               VCC  ->  3V3
 *     GND  ->    GND               GND  ->  GND
 *     IN   ->    GPIO5             OUT  ->  GPIO10 (ADC1)
 *   (3V3 只有两个针脚 → 用面包板 +/− 电源轨给各模块分电)
 **********************************************************************/

#include <Wire.h>
#include "MAX30105.h"        // SparkFun 库(兼容 MAX30102)
#include "heartRate.h"       // SparkFun 的心跳检测算法
#include <BLEDevice.h>
#include <BLEServer.h>
#include <BLEUtils.h>
#include <BLE2902.h>
#include <math.h>

// ---------- 引脚 (按你的实际接线改) ----------
#define PIN_SDA    8         // I2C 数据 (心率 MAX30102 + 六轴 MPU6050 共用)
#define PIN_SCL    9         // I2C 时钟
#define PIN_MOTOR  5         // 震动马达
#define PIN_GSR    10        // 皮肤电 GSR 模拟输出 (必须 ADC1: GPIO1~10)

#define MPU_ADDR   0x68      // MPU6050 (GY-521) I2C 地址

// ---------- BLE 契约 UUID (必须与 H5 完全一致, 见 docs/接口契约.md) ----------
#define SERVICE_UUID  "19b10000-e8f2-537e-4f6c-d104768a1214"
#define HR_UUID       "19b10003-e8f2-537e-4f6c-d104768a1214"
#define HRV_UUID      "19b10005-e8f2-537e-4f6c-d104768a1214"
#define GSR_UUID      "19b10006-e8f2-537e-4f6c-d104768a1214"
#define MOTION_UUID   "19b10007-e8f2-537e-4f6c-d104768a1214"   // 运动量上行(六轴)
#define CMD_UUID      "19b10008-e8f2-537e-4f6c-d104768a1214"
#define GESTURE_UUID  "19b10009-e8f2-537e-4f6c-d104768a1214"   // 手势上行(敲击唤醒)
#define DEVICE_NAME   "HuanbaoNi"

MAX30105 sensor;
bool mpuOk = false;         // MPU6050 是否在线 (缺了不影响主流程)

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

// ---------- MPU6050 六轴: 运动量 + 敲击手势 ----------
float motionSmooth = 0;          // 平滑后的运动量(°/s 级)
float accBaseline  = 1.0;        // 加速度幅度基线(g), 慢跟随重力
// 双击检测状态机
unsigned long lastTapMs = 0;     // 上一次单击时刻
unsigned long tapRefractoryUntil = 0;  // 单击不应期, 防抖
bool  pendingGesture = false;    // 有待上报的双击

// ---------- BLE ----------
BLEServer* pServer = nullptr;
BLECharacteristic *chHR, *chHRV, *chGSR, *chMotion, *chGesture;
bool deviceConnected = false;

// ========== 三档干预触觉引擎 (非阻塞, PWM 步进) ==========
// 见 docs/接口契约.md §1:
//   HAP_INTERCEPT 档三·早期拦截: 单次轻促短震 ~150ms (低强度)
//   HAP_ANCHOR    档二·实时锚点: 共振呼吸 吸4·呼6 (无屏息), 吸气渐强/呼气渐弱, 循环 3 轮 (中强度)
//   HAP_RETREAT   档一·撤退许可: 两下长震 长-停-长, each ~600ms (最强度)
enum { HAP_NONE = 0, HAP_INTERCEPT, HAP_ANCHOR, HAP_RETREAT };

// LEDC (PWM) 配置: 用占空比模拟震动强度渐变
#define MOTOR_PWM_CH    0
#define MOTOR_PWM_FREQ  200      // Hz, 马达可跟随的低频
#define MOTOR_PWM_RES   8        // 8bit → 占空 0..255

int   hapMode  = HAP_NONE;       // 当前正在播放的档位
int   hapStep  = 0;              // 当前处于序列的第几步
int   hapCycle = 0;              // anchor: 已完成的呼吸轮数
unsigned long hapStepUntil = 0;  // 当前步的结束时刻

// 呼吸参数 (共振呼吸 吸4·呼6, 单位 ms)
const int BR_IN_MS   = 4000;     // 吸气 4s (渐强)
const int BR_OUT_MS  = 6000;     // 呼气 6s (渐弱)
const int BR_CYCLES  = 3;        // 循环 3 轮
const int BR_MAX_DUTY = 200;     // 呼吸档峰值强度 (中强度)

void motorDuty(int duty) {       // duty 0..255
  if (duty < 0) duty = 0; if (duty > 255) duty = 255;
  ledcWrite(PIN_MOTOR, duty);    // core v3.x: 按引脚写占空
}

// 启动某一档触觉 (会打断上一次未播完的序列)
void startHaptic(int mode) {
  hapMode = mode; hapStep = 0; hapCycle = 0;
  hapStepUntil = 0;             // 立即在 updateHaptic 里进入第 0 步
  Serial.print("[HAPTIC] start mode="); Serial.println(mode);
}

// 每次 loop 调一次: 按当前档位推进非阻塞序列
void updateHaptic() {
  if (hapMode == HAP_NONE) return;
  unsigned long now = millis();

  // 呼吸档: 在一步内做连续渐变, 每 tick 都要刷新占空, 不能只在切步时刷
  if (hapMode == HAP_ANCHOR) {
    if (hapStep == 0) {          // 吸气渐强
      if (hapStepUntil == 0) hapStepUntil = now + BR_IN_MS;
      long remain = (long)hapStepUntil - (long)now;
      if (remain <= 0) { hapStep = 1; hapStepUntil = now + BR_OUT_MS; }
      else {
        float p = 1.0f - (float)remain / BR_IN_MS;   // 0→1
        motorDuty((int)(BR_MAX_DUTY * p));
      }
      return;
    } else {                      // 呼气渐弱
      long remain = (long)hapStepUntil - (long)now;
      if (remain <= 0) {
        hapCycle++;
        if (hapCycle >= BR_CYCLES) { motorDuty(0); hapMode = HAP_NONE; Serial.println("[HAPTIC] anchor done"); }
        else { hapStep = 0; hapStepUntil = now + BR_IN_MS; }
      } else {
        float p = (float)remain / BR_OUT_MS;         // 1→0
        motorDuty((int)(BR_MAX_DUTY * p));
      }
      return;
    }
  }

  // 拦截档 / 撤退档: 离散的开-关序列, 只在切步时改占空
  if (now < hapStepUntil) return;  // 当前步还没走完
  switch (hapMode) {
    case HAP_INTERCEPT:            // 单次轻促短震
      if (hapStep == 0) { motorDuty(120); hapStepUntil = now + 150; hapStep = 1; }
      else              { motorDuty(0);   hapMode = HAP_NONE; }
      break;
    case HAP_RETREAT:             // 长-停-长, 最强度
      switch (hapStep) {
        case 0: motorDuty(255); hapStepUntil = now + 600; hapStep = 1; break; // 长震1
        case 1: motorDuty(0);   hapStepUntil = now + 300; hapStep = 2; break; // 停
        case 2: motorDuty(255); hapStepUntil = now + 600; hapStep = 3; break; // 长震2
        default: motorDuty(0);  hapMode = HAP_NONE; break;
      }
      break;
    default: motorDuty(0); hapMode = HAP_NONE; break;
  }
}

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

// 前置声明：触发三档触觉
void startHaptic(int mode);

// 收到 H5 指令 (下行)
class CmdCB : public BLECharacteristicCallbacks {
  void onWrite(BLECharacteristic* c) override {
    String v = c->getValue().c_str();
    Serial.print("[CMD] 收到: "); Serial.println(v);
    if (v.startsWith("VIBRATE")) {
      // 三档干预触觉 (见 docs/接口契约.md §1)
      if      (v.indexOf("INTERCEPT") >= 0) startHaptic(HAP_INTERCEPT);
      else if (v.indexOf("RETREAT")   >= 0) startHaptic(HAP_RETREAT);
      else                                  startHaptic(HAP_ANCHOR); // ANCHOR / 无参兼容
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

// ========== MPU6050 (六轴): 运动量 + 敲击手势 ==========
bool mpuWrite(uint8_t reg, uint8_t val) {
  Wire.beginTransmission(MPU_ADDR);
  Wire.write(reg); Wire.write(val);
  return Wire.endTransmission() == 0;
}

// 探测并唤醒 MPU6050; 缺失也不影响主流程
void mpuInit() {
  Wire.beginTransmission(MPU_ADDR);
  if (Wire.endTransmission() != 0) { mpuOk = false; Serial.println("[warn] 未检测到 MPU6050, 跳过六轴/手势"); return; }
  mpuWrite(0x6B, 0x00);   // 退出睡眠
  delay(50);
  mpuOk = true;
  Serial.println("[OK] MPU6050 就绪 (运动量 + 敲击唤醒)");
}

// 每次 loop 调: 读六轴 → 更新 motionSmooth + 检测双击 → pendingGesture
void mpuUpdate() {
  if (!mpuOk) return;
  Wire.beginTransmission(MPU_ADDR);
  Wire.write(0x3B);
  if (Wire.endTransmission(false) != 0) return;
  Wire.requestFrom(MPU_ADDR, 14, true);
  if (Wire.available() < 14) return;
  int16_t ax = (Wire.read() << 8) | Wire.read();
  int16_t ay = (Wire.read() << 8) | Wire.read();
  int16_t az = (Wire.read() << 8) | Wire.read();
  Wire.read(); Wire.read();                 // 温度跳过
  int16_t gx = (Wire.read() << 8) | Wire.read();
  int16_t gy = (Wire.read() << 8) | Wire.read();
  int16_t gz = (Wire.read() << 8) | Wire.read();

  // 运动量: 陀螺仪角速度幅度 (°/s), 静止≈0
  float gmag = (fabs((float)gx) + fabs((float)gy) + fabs((float)gz)) / 131.0f;
  motionSmooth = motionSmooth * 0.8f + gmag * 0.2f;

  // 敲击检测: 加速度幅度相对基线的突增(jerk)
  float amag = sqrtf((float)ax*ax + (float)ay*ay + (float)az*az) / 16384.0f; // g
  accBaseline = accBaseline * 0.95f + amag * 0.05f;   // 慢跟随(重力+姿态)
  float jerk = fabs(amag - accBaseline);

  unsigned long now = millis();
  const float TAP_JERK = 0.9f;        // 敲击阈值(g), 需明显磕一下
  const unsigned long REFRACTORY = 60;    // 单次敲击不应期(ms), 防一击多计
  const unsigned long DBL_MIN = 80, DBL_MAX = 600; // 双击间隔窗口(ms)

  if (jerk > TAP_JERK && now > tapRefractoryUntil) {
    tapRefractoryUntil = now + REFRACTORY;
    unsigned long gap = now - lastTapMs;
    if (gap > DBL_MIN && gap < DBL_MAX) {
      pendingGesture = true;          // 命中双击
      lastTapMs = 0;                  // 复位, 避免三击连锁
      Serial.println("[GESTURE] 双击 DBLTAP");
    } else {
      lastTapMs = now;                // 记为第一击
    }
  }
}

void setup() {
  Serial.begin(115200);
  delay(1500);          // 等 ESP32-S3 的 USB-CDC 枚举完, 否则开机自检的串口打印会被吞掉
  Serial.println("\n=== 环抱你 戒指启动 ===");

  // 马达用 LEDC(PWM) 驱动, 支持强度渐变(呼吸档渐强渐弱)
  // ESP32 Arduino core v3.x API: ledcAttach(pin, freq, resolution)
  ledcAttach(PIN_MOTOR, MOTOR_PWM_FREQ, MOTOR_PWM_RES);
  motorDuty(0);

  // 开机自检: 震两下, 独立于传感器/BLE 验证马达线是否通
  // (看不到震动 = GPIO5/GND/VCC 接线或驱动板问题, 与 BLE/手指无关)
  Serial.println("[自检] 马达震两下...");
  motorDuty(200); delay(250); motorDuty(0); delay(200);
  motorDuty(200); delay(250); motorDuty(0);

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

  // MPU6050 六轴 (运动量 + 敲击唤醒); 与 MAX30102 共用 I2C 总线
  mpuInit();

  // GSR 皮肤电 ADC
  analogReadResolution(12);
  analogSetPinAttenuation(PIN_GSR, ADC_11db);

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
  chMotion = svc->createCharacteristic(MOTION_UUID, BLECharacteristic::PROPERTY_NOTIFY);
  chMotion->addDescriptor(new BLE2902());
  chGesture = svc->createCharacteristic(GESTURE_UUID, BLECharacteristic::PROPERTY_NOTIFY);
  chGesture->addDescriptor(new BLE2902());

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
  // 三档触觉引擎: 非阻塞推进当前震动序列
  updateHaptic();

  // 六轴: 更新运动量 + 检测双击 (高频, 每 loop 都读, 才抓得住敲击)
  mpuUpdate();

  // 双击手势即时上报 (不等 1s 节流, 保证"敲一下"低延迟)
  if (pendingGesture) {
    pendingGesture = false;
    if (deviceConnected) {
      const char* g = "DBLTAP";
      chGesture->setValue((uint8_t*)g, strlen(g));
      chGesture->notify();
    }
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

  // 每 1s 上报一次生理/运动信号
  if (millis() - lastNotify > 1000) {
    lastNotify = millis();

    int gsr = analogRead(PIN_GSR);
    Serial.printf("HR=%d  HRV=%.1fms  GSR=%d  MOTION=%.0f  IR=%ld\n",
                  beatAvg, hrvRMSSD, gsr, motionSmooth, irValue);

    if (deviceConnected) {
      // HR: int → 字符串上报 (H5 端按文本解析, 简单可靠)
      char bufHr[8];  snprintf(bufHr, sizeof(bufHr), "%d", beatAvg);
      chHR->setValue((uint8_t*)bufHr, strlen(bufHr));
      chHR->notify();

      char bufHrv[12]; snprintf(bufHrv, sizeof(bufHrv), "%.1f", hrvRMSSD);
      chHRV->setValue((uint8_t*)bufHrv, strlen(bufHrv));
      chHRV->notify();

      // GSR 皮肤电 (0-4095 原始值)
      char bufG[8]; snprintf(bufG, sizeof(bufG), "%d", gsr);
      chGSR->setValue((uint8_t*)bufG, strlen(bufG));
      chGSR->notify();

      // MOTION 运动量 (给 H5 做运动伪迹门控 + 坐立不安信号)
      if (mpuOk) {
        char bufM[8]; snprintf(bufM, sizeof(bufM), "%d", (int)motionSmooth);
        chMotion->setValue((uint8_t*)bufM, strlen(bufM));
        chMotion->notify();
      }
    }
  }
}
