'use client';

import React from 'react';

/**
 * 轻量级 Markdown 渲染组件
 * 支持加粗、斜体、标题、无序列表、有序列表、代码块、行内代码、分隔线
 */
export default function MarkdownRenderer({ content }: { content: string }) {
  const lines = content.split('\n');
  const elements: React.ReactNode[] = [];
  let listItems: string[] = [];
  let orderedListItems: string[] = [];
  let codeBlock: string[] | null = null;
  const getCodeBlock = (): string[] | null => codeBlock;

  function flushUnorderedList(key: string) {
    if (listItems.length > 0) {
      elements.push(
        <ul key={key} className="ml-4 my-1 space-y-0.5 list-disc">
          {listItems.map((item, i) => (
            <li key={i} dangerouslySetInnerHTML={{ __html: parseInline(item) }} />
          ))}
        </ul>
      );
      listItems = [];
    }
  }

  function flushOrderedList(key: string) {
    if (orderedListItems.length > 0) {
      elements.push(
        <ol key={key} className="ml-4 my-1 space-y-0.5 list-decimal">
          {orderedListItems.map((item, i) => (
            <li key={i} dangerouslySetInnerHTML={{ __html: parseInline(item) }} />
          ))}
        </ol>
      );
      orderedListItems = [];
    }
  }

  function parseInline(text: string): string {
    let html = text;
    // 转义 HTML
    html = html.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    // 加粗 **text** 或 __text__
    html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    html = html.replace(/__(.+?)__/g, '<strong>$1</strong>');
    // 斜体 *text* 或 _text_
    html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');
    html = html.replace(/_(.+?)_/g, '<em>$1</em>');
    // 行内代码 `code`
    html = html.replace(/`(.+?)`/g, '<code class="px-1 py-0.5 rounded bg-black/5 text-[13px]">$1</code>');
    return html;
  }

  lines.forEach((line, idx) => {
    // 代码块处理
    if (line.trim().startsWith('```')) {
      if (codeBlock) {
        elements.push(
          <pre key={`code-${idx}`} className="my-1 p-3 rounded-lg bg-black/5 overflow-x-auto text-[13px]">
            <code>{codeBlock.join('\n')}</code>
          </pre>
        );
        codeBlock = null;
      } else {
        codeBlock = [];
      }
      return;
    }
    if (codeBlock) {
      codeBlock.push(line);
      return;
    }

    // 空行
    if (line.trim() === '') {
      flushUnorderedList(`ul-${idx}`);
      flushOrderedList(`ol-${idx}`);
      return;
    }

    // 标题
    const hMatch = line.match(/^(#{1,4})\s+(.+)/);
    if (hMatch) {
      flushUnorderedList(`ul-${idx}`);
      flushOrderedList(`ol-${idx}`);
      const level = hMatch[1].length;
      const sizes = ['text-lg', 'text-base', 'text-sm', 'text-sm'];
      elements.push(
        <div key={`h-${idx}`} className={`font-bold ${sizes[level - 1]} my-1`} dangerouslySetInnerHTML={{ __html: parseInline(hMatch[2]) }} />
      );
      return;
    }

    // 分隔线
    if (/^[-*_]{3,}$/.test(line.trim())) {
      flushUnorderedList(`ul-${idx}`);
      flushOrderedList(`ol-${idx}`);
      elements.push(<hr key={`hr-${idx}`} className="my-2 border-t border-current opacity-20" />);
      return;
    }

    // 无序列表项
    const ulMatch = line.match(/^[\s]*[-*•]\s+(.+)/);
    if (ulMatch) {
      flushOrderedList(`ol-${idx}`);
      listItems.push(ulMatch[1]);
      return;
    }

    // 有序列表项
    const olMatch = line.match(/^[\s]*\d+[.)]\s+(.+)/);
    if (olMatch) {
      flushUnorderedList(`ul-${idx}`);
      orderedListItems.push(olMatch[1]);
      return;
    }

    // 普通段落
    flushUnorderedList(`ul-${idx}`);
    flushOrderedList(`ol-${idx}`);
    elements.push(
      <p key={`p-${idx}`} className="my-0.5" dangerouslySetInnerHTML={{ __html: parseInline(line) }} />
    );
  });

  // 处理末尾未关闭的列表和代码块
  flushUnorderedList('ul-end');
  flushOrderedList('ol-end');
  const finalCodeBlock = getCodeBlock();
  if (finalCodeBlock) {
    elements.push(
      <pre key="code-end" className="my-1 p-3 rounded-lg bg-black/5 overflow-x-auto text-[13px]">
        <code>{finalCodeBlock.join('\n')}</code>
      </pre>
    );
  }

  return <div className="markdown-body">{elements}</div>;
}
