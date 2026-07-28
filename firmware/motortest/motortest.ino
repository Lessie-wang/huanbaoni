/**********************************************************************
 * 环抱你 · 马达测试  motortest.ino
 * 用途: 验证震动马达接线正确。不涉及蓝牙。
 *
 * 接线(震动马达模块 -> ESP32-S3):
 *   IN  -> GPIO5   (板边丝印 "5")
 *   VCC -> 3V3
 *   GND -> GND
 *
 * 现象: 马达每 2 秒震 0.6 秒, 串口打印 "buzz!" / "rest"。
 * 串口看输出: 线插 B 口(usbmodem7CE8...), 115200。
 * 烧录: 线插 A 口(usbmodem5CBC...)。
 **********************************************************************/

#define MOTOR_PIN 5

void setup() {
  Serial.begin(115200);
  delay(300);
  Serial.println("\n=== motortest 启动 ===");
  pinMode(MOTOR_PIN, OUTPUT);
  digitalWrite(MOTOR_PIN, LOW);
}

void loop() {
  Serial.println("buzz! (震动中)");
  digitalWrite(MOTOR_PIN, HIGH);
  delay(600);

  Serial.println("rest  (停)");
  digitalWrite(MOTOR_PIN, LOW);
  delay(1400);
}
