/**
 * lib/markdown.js — 轻量级 Markdown → HTML（浏览器版）
 * 对齐小程序 utils/markdown.js 的能力，供 webapp 里「小知」的回复用真正的富文本显示：
 *   **加粗** / *斜体* / # 标题 / 有序·无序列表 / 表格 / `行内代码` / [链接] / 换行
 * 只把结果塞进「小知」气泡（本机生成的可信内容），用户输入始终用 textContent，避免 XSS。
 * 注册到 window.MD = { toHtml }。
 */
(function (global) {
  'use strict';

  function escapeHtml(text) {
    return String(text)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  // 行内格式：先转义，再逐个还原为标签。顺序：代码 → 加粗 → 斜体 → 链接
  function processInline(raw) {
    let text = escapeHtml(raw);
    // 行内代码 `code`（先处理，避免里面的 * _ 被误当成格式）
    text = text.replace(/`([^`]+?)`/g, '<code class="md-code">$1</code>');
    // 加粗 **x** / __x__
    text = text
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/__(.+?)__/g, '<strong>$1</strong>');
    // 斜体 *x* / _x_（避开已成对的 **）
    text = text
      .replace(/(?<!\*)\*(?!\*)([^*]+?)\*(?!\*)/g, '<em>$1</em>')
      .replace(/(?<!_)_(?!_)([^_]+?)_(?!_)/g, '<em>$1</em>');
    // 链接 [文字](http…)
    text = text.replace(/\[([^\]]+?)\]\((https?:\/\/[^\s)]+)\)/g,
      '<a href="$2" target="_blank" rel="noopener">$1</a>');
    return text;
  }

  function isTableRow(line) {
    const t = line.trim();
    return t.indexOf('|') !== -1 && t.charAt(0) === '|';
  }
  function isSeparatorRow(line) {
    return /^\|[\s\-:|]+\|$/.test(line.trim());
  }
  function parseCells(line) {
    const cells = line.split('|');
    if (cells.length && cells[0].trim() === '') cells.shift();
    if (cells.length && cells[cells.length - 1].trim() === '') cells.pop();
    return cells.map(function (c) { return c.trim(); });
  }
  function renderTable(tableLines) {
    const hasSep = tableLines.length > 1 && isSeparatorRow(tableLines[1]);
    const bodyStart = hasSep ? 2 : 1;
    let html = '<table class="md-table"><thead><tr>';
    parseCells(tableLines[0]).forEach(function (cell) {
      html += '<th>' + processInline(cell) + '</th>';
    });
    html += '</tr></thead><tbody>';
    for (let i = bodyStart; i < tableLines.length; i++) {
      if (isSeparatorRow(tableLines[i])) continue;
      const cells = parseCells(tableLines[i]);
      if (!cells.length) continue;
      html += '<tr>';
      cells.forEach(function (cell) { html += '<td>' + processInline(cell) + '</td>'; });
      html += '</tr>';
    }
    html += '</tbody></table>';
    return html;
  }

  function toHtml(text) {
    if (!text) return '';
    const lines = String(text).split('\n');
    const out = [];
    let i = 0;

    while (i < lines.length) {
      const line = lines[i];
      const trimmed = line.trim();

      // 空行
      if (trimmed === '') { i++; continue; }

      // 标题 # ~ ######
      const h = trimmed.match(/^(#{1,6})\s+(.+)$/);
      if (h) {
        const lv = h[1].length;
        out.push('<div class="md-h md-h' + lv + '">' + processInline(h[2]) + '</div>');
        i++;
        continue;
      }

      // 引用 >
      if (/^>\s?/.test(trimmed)) {
        const quote = [];
        while (i < lines.length && /^>\s?/.test(lines[i].trim())) {
          quote.push(lines[i].trim().replace(/^>\s?/, ''));
          i++;
        }
        out.push('<blockquote class="md-quote">' + processInline(quote.join(' ')) + '</blockquote>');
        continue;
      }

      // 表格
      if (isTableRow(line)) {
        const tbl = [];
        while (i < lines.length && isTableRow(lines[i])) { tbl.push(lines[i]); i++; }
        out.push(renderTable(tbl));
        continue;
      }

      // 无序列表
      if (/^[-*]\s+(.+)$/.test(trimmed)) {
        let ul = '<ul class="md-ul">';
        while (i < lines.length) {
          const m = lines[i].trim().match(/^[-*]\s+(.+)$/);
          if (!m) break;
          ul += '<li>' + processInline(m[1]) + '</li>';
          i++;
        }
        ul += '</ul>';
        out.push(ul);
        continue;
      }

      // 有序列表
      if (/^\d+\.\s+(.+)$/.test(trimmed)) {
        let ol = '<ol class="md-ol">';
        while (i < lines.length) {
          const m = lines[i].trim().match(/^\d+\.\s+(.+)$/);
          if (!m) break;
          ol += '<li>' + processInline(m[1]) + '</li>';
          i++;
        }
        ol += '</ol>';
        out.push(ol);
        continue;
      }

      // 普通段落：把连续的非空、非块级行合并为一段（软换行 → <br/>）
      const para = [];
      while (i < lines.length) {
        const t = lines[i].trim();
        if (t === '' || /^(#{1,6})\s/.test(t) || /^>\s?/.test(t) ||
            isTableRow(lines[i]) || /^[-*]\s+/.test(t) || /^\d+\.\s+/.test(t)) break;
        para.push(processInline(t));
        i++;
      }
      out.push('<p class="md-p">' + para.join('<br/>') + '</p>');
    }

    return out.join('');
  }

  global.MD = { toHtml: toHtml };
})(typeof window !== 'undefined' ? window : globalThis);
