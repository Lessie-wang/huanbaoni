/**********************************************************************
 * 环抱你 · 麦克风测试  mictest.ino
 * 模块: INMP441 (I2S 数字 MEMS 麦克风)
 * 目的: 验证麦克风工作, 实时打印环境响度 (社交氛围感知的基础)。
 *
 * 接线 (INMP441 -> ESP32-S3):
 *   VDD  -> 3V3
 *   GND  -> GND
 *   L/R  -> GND        (拉低=左声道)
 *   WS   -> GPIO16     (LRCL / LRC)
 *   SCK  -> GPIO15     (BCLK / CLK)
 *   SD   -> GPIO17     (DOUT / DO)
 *
 * 需要 esp32 开发板包 v3.x (含 ESP_I2S 库, 随核心自带, 不用额外装)。
 * 烧录: 线插 A 口; 看串口: 线插 B 口, 115200。
 * 对着麦克风说话/拍手, 响度数字和长条会变长。
 **********************************************************************/

#include <ESP_I2S.h>
#include <math.h>

#define I2S_SCK 15   // BCLK
#define I2S_WS  16   // LRCL
#define I2S_SD  17   // DOUT

I2SClass I2S;

void setup() {
  Serial.begin(115200);
  delay(300);
  Serial.println("\n=== 麦克风测试 mictest ===");

  // setPins(bclk, ws, dout=-1(不发), din=SD, mclk=-1)
  I2S.setPins(I2S_SCK, I2S_WS, -1, I2S_SD, -1);

  // INMP441: 标准 I2S, 32bit, 单声道左
  if (!I2S.begin(I2S_MODE_STD, 16000, I2S_DATA_BIT_WIDTH_32BIT, I2S_SLOT_MODE_MONO, I2S_STD_SLOT_LEFT)) {
    Serial.println("[错误] I2S 初始化失败! 检查接线/引脚。");
    while (1) delay(1000);
  }
  Serial.println("[OK] I2S 就绪, 对着麦克风说话试试~");
}

void loop() {
  const int N = 256;
  int32_t buf[N];
  size_t bytes = I2S.readBytes((char*)buf, sizeof(buf));
  int n = bytes / 4;
  if (n <= 0) { delay(20); return; }

  double sumsq = 0;
  for (int i = 0; i < n; i++) {
    int32_t s = buf[i] >> 8;   // INMP441 是 24bit 数据, 高位对齐, 右移 8 位取有效值
    sumsq += (double)s * (double)s;
  }
  double rms = sqrt(sumsq / n);

  // 映射到 0~100 的响度 (对数, 经验缩放)
  int level = 0;
  if (rms > 1) level = (int)((20.0 * log10(rms) - 40.0) * 3.0);
  if (level < 0) level = 0; if (level > 100) level = 100;

  // 画个简单的响度条
  char bar[41];
  int filled = level * 40 / 100;
  for (int i = 0; i < 40; i++) bar[i] = (i < filled) ? '#' : '.';
  bar[40] = 0;

  Serial.printf("响度 %3d |%s| RMS=%.0f\n", level, bar, rms);
  delay(100);
}
