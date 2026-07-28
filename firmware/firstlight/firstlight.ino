/**********************************************************************
 * 环抱你 · 第一束光  firstlight.ino
 * 用途: 你的第一次烧录, 验证"能烧录 + 串口能通"。
 * 这块板(ESP32-S3-N16R8)的用户灯是 GPIO48 上的 RGB 彩灯,
 * 所以用彩灯循环变色来确认烧录成功(普通 Blink 看不到)。
 *
 * 不用接任何线, 只要板子插着 USB 就行。
 *
 * Arduino IDE 设置(Tools 菜单):
 *   Board: "ESP32S3 Dev Module"
 *   Port : /dev/cu.usbmodem5CBC3861781
 *   USB CDC On Boot: "Enabled"   ← 必须开, 否则串口看不到字
 *   Flash Size: "16MB (128Mb)"
 *   PSRAM: "OPI PSRAM"
 * 上传卡在 Connecting… 就按住板上 BOOT 键不放, 等开始上传再松。
 **********************************************************************/

#define RGB_PIN 48   // 板载 RGB 灯在 GPIO48

void setup() {
  Serial.begin(115200);
  delay(300);
  Serial.println("\n=== 环抱你 firstlight 启动成功! ===");
}

void loop() {
  Serial.println("我还活着~ (串口正常)");

  rgbLedWrite(RGB_PIN, 30, 0, 0);   delay(400);  // 红
  rgbLedWrite(RGB_PIN, 0, 30, 0);   delay(400);  // 绿
  rgbLedWrite(RGB_PIN, 0, 0, 30);   delay(400);  // 蓝
  rgbLedWrite(RGB_PIN, 0, 0, 0);    delay(400);  // 灭
}
