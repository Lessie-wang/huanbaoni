/**********************************************************************
 * 环抱你 · 皮肤电测试  gsrtest.ino
 * 模块: GSR Sensor V2.0 (皮肤电导 / 情绪唤醒模拟传感器)
 * 目的: 验证 GSR 工作, 打印原始 ADC 值 + 平滑值。
 *       压力/紧张/深呼吸时手心出汗 → 电导变化 → 数值变化。
 *
 * 接线 (GSR -> ESP32-S3):
 *   VCC -> 3V3
 *   GND -> GND
 *   OUT -> GPIO10   (必须是 ADC1 引脚: GPIO1~10, 不能用 ADC2 否则和 BLE 冲突)
 *
 * 指套: 黑线插模块 3.5mm 孔; 两个电极缠在同一只手的食指+中指指腹。
 * 烧录: 线插 A 口; 看串口: 线插 B 口, 115200。
 *
 * 玩法: 静置看基线 → 深吸一口气憋住 / 用力想件紧张的事 → 数值应缓慢上升;
 *       放松后缓慢回落。GSR 反应慢(几秒级), 是正常的。
 **********************************************************************/

#define PIN_GSR 10        // ADC1 引脚

// 指数平滑, 去掉抖动
float smooth = 0;
bool  inited = false;

// 记录一段时间的最小/最大, 方便看动态范围
int gsrMin = 4095, gsrMax = 0;
unsigned long lastPrint = 0;

void setup() {
  Serial.begin(115200);
  delay(300);
  Serial.println("\n=== 皮肤电测试 gsrtest ===");
  analogReadResolution(12);              // 0~4095
  analogSetPinAttenuation(PIN_GSR, ADC_11db);  // 量程拉到 ~0-3.1V
  Serial.println("[OK] 指套缠好食指+中指, 先静置几秒看基线~");
}

void loop() {
  int raw = analogRead(PIN_GSR);

  if (!inited) { smooth = raw; inited = true; }
  smooth = smooth * 0.9 + raw * 0.1;     // 平滑

  if (raw < gsrMin) gsrMin = raw;
  if (raw > gsrMax) gsrMax = raw;

  if (millis() - lastPrint > 300) {
    lastPrint = millis();
    // 简单可视化条 (按当前观察到的动态范围归一化)
    int range = gsrMax - gsrMin; if (range < 1) range = 1;
    int lvl = (int)((smooth - gsrMin) * 40 / range);
    if (lvl < 0) lvl = 0; if (lvl > 40) lvl = 40;
    char bar[41]; for (int i = 0; i < 40; i++) bar[i] = (i < lvl) ? '#' : '.'; bar[40] = 0;

    Serial.printf("GSR 原始=%4d  平滑=%4.0f  |%s|  (min=%d max=%d)\n",
                  raw, smooth, bar, gsrMin, gsrMax);
  }
  delay(20);
}
