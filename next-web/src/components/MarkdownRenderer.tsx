'use client';

import React from 'react';

/**
 * 安全的 Markdown 渲染组件
 *
 * 安全要点：
 * 1. 完全使用 React 节点(JSX),不生成 HTML 字符串再 dangerouslySetInnerHTML
 * 2. React 自动转义所有文本内容
 * 3. 行内解析只支持 markdown 语法(粗体/斜体/行内代码),不支持 HTML
 * 4. 对输入文本先做 XSS 黑名单过滤(防御 LLM 投毒)
 * 5. 不输出 href(防 javascript: 伪协议),如需链接单独处理
 */

interface MarkdownRendererProps {
  content: string;
}

// XSS 黑名单：检测常见攻击模式
function detectXss(text: string): boolean {
  // 1. <script> 标签
  if (/<script[\s>]/i.test(text)) return true;
  // 2. <iframe> 标签
  if (/<iframe[\s>]/i.test(text)) return true;
  // 3. on* 事件处理器 (onerror, onload, onclick 等)
  if (/\bon[a-z]+\s*=/i.test(text)) return true;
  // 4. javascript: 伪协议
  if (/javascript\s*:/i.test(text)) return true;
  // 5. data:text/html (可执行 HTML)
  if (/data\s*:\s*text\/html/i.test(text)) return true;
  // 6. <embed>/<object>/<svg> 标签
  if (/<(embed|object|svg|use)[\s>]/i.test(text)) return true;
  return false;
}

// 解析行内 markdown:返回 React 节点数组
// 支持: **粗体** *斜体* `行内代码`
// 不支持 HTML——所有 < > 都会被 React 自动转义
function renderInline(text: string, keyPrefix: string): React.ReactNode[] {
  const nodes: React.ReactNode[] = [];
  // 用正则拆分出 token 类型
  // 优先级:行内代码 > 粗体 > 斜体
  const re = /(`[^`]+`|\*\*[^*]+\*\*|__[^_]+__|\*[^*]+\*|_[^_]+_)/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let idx = 0;
  while ((match = re.exec(text)) !== null) {
    // 前面的纯文本
    if (match.index > lastIndex) {
      nodes.push(<React.Fragment key={`${keyPrefix}-t-${idx++}`}>{text.slice(lastIndex, match.index)}</React.Fragment>);
    }
    const token = match[0];
    if (token.startsWith('`')) {
      const content = token.slice(1, -1);
      nodes.push(
        <code key={`${keyPrefix}-c-${idx++}`} className="px-1 py-0.5 rounded bg-black/5 text-[13px]">
          {content}
        </code>
      );
    } else if (token.startsWith('**') || token.startsWith('__')) {
      const content = token.slice(2, -2);
      nodes.push(<strong key={`${keyPrefix}-b-${idx++}`}>{content}</strong>);
    } else if (token.startsWith('*') || token.startsWith('_')) {
      const content = token.slice(1, -1);
      nodes.push(<em key={`${keyPrefix}-i-${idx++}`}>{content}</em>);
    }
    lastIndex = match.index + token.length;
  }
  // 剩余文本
  if (lastIndex < text.length) {
    nodes.push(<React.Fragment key={`${keyPrefix}-t-${idx}`}>{text.slice(lastIndex)}</React.Fragment>);
  }
  return nodes;
}

export default function MarkdownRenderer({ content }: MarkdownRendererProps) {
  // 第一道防线:检测 XSS,命中则返回安全降级内容
  if (detectXss(content)) {
    return (
      <div className="markdown-body text-red-500 text-sm">
        [已过滤:检测到不安全内容]
      </div>
    );
  }

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
            <li key={i}>{renderInline(item, `ul-${key}-${i}`)}</li>
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
            <li key={i}>{renderInline(item, `ol-${key}-${i}`)}</li>
          ))}
        </ol>
      );
      orderedListItems = [];
    }
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
        <div key={`h-${idx}`} className={`font-bold ${sizes[level - 1]} my-1`}>
          {renderInline(hMatch[2], `h-${idx}`)}
        </div>
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
      <p key={`p-${idx}`} className="my-0.5">
        {renderInline(line, `p-${idx}`)}
      </p>
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