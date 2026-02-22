import hljs from 'highlight.js/lib/core';
import plaintext from 'highlight.js/lib/languages/plaintext';
import javascript from 'highlight.js/lib/languages/javascript';
import typescript from 'highlight.js/lib/languages/typescript';
import json from 'highlight.js/lib/languages/json';
import xml from 'highlight.js/lib/languages/xml';
import css from 'highlight.js/lib/languages/css';
import markdown from 'highlight.js/lib/languages/markdown';
import python from 'highlight.js/lib/languages/python';
import java from 'highlight.js/lib/languages/java';
import c from 'highlight.js/lib/languages/c';
import cpp from 'highlight.js/lib/languages/cpp';
import csharp from 'highlight.js/lib/languages/csharp';
import go from 'highlight.js/lib/languages/go';
import rust from 'highlight.js/lib/languages/rust';
import php from 'highlight.js/lib/languages/php';
import ruby from 'highlight.js/lib/languages/ruby';
import bash from 'highlight.js/lib/languages/bash';
import sql from 'highlight.js/lib/languages/sql';
import yaml from 'highlight.js/lib/languages/yaml';
import diff from 'highlight.js/lib/languages/diff';

interface MonacoDetectionResult {
  detectedLabel: string;
  languageId: string | null;
}

const MAX_DETECTION_CHARS = 20000;

const registerLanguage = (name: string, languageModule: unknown) => {
  hljs.registerLanguage(name, languageModule as Parameters<typeof hljs.registerLanguage>[1]);
};

registerLanguage('plaintext', plaintext);
registerLanguage('javascript', javascript);
registerLanguage('typescript', typescript);
registerLanguage('json', json);
registerLanguage('html', xml);
registerLanguage('xml', xml);
registerLanguage('css', css);
registerLanguage('markdown', markdown);
registerLanguage('python', python);
registerLanguage('java', java);
registerLanguage('c', c);
registerLanguage('cpp', cpp);
registerLanguage('csharp', csharp);
registerLanguage('go', go);
registerLanguage('rust', rust);
registerLanguage('php', php);
registerLanguage('ruby', ruby);
registerLanguage('shell', bash);
registerLanguage('sql', sql);
registerLanguage('yaml', yaml);
registerLanguage('diff', diff);

const detectorToMonacoLanguage: Record<string, string> = {
  csharp: 'csharp',
  html: 'html',
  plaintext: 'plaintext',
  shell: 'shell',
};

const resolveMonacoLanguage = (label: string, availableLanguageIds: Set<string>) => {
  if (availableLanguageIds.has(label)) {
    return label;
  }

  const mapped = detectorToMonacoLanguage[label];
  if (mapped && availableLanguageIds.has(mapped)) {
    return mapped;
  }

  return null;
};

const buildDetectionInput = (text: string) => {
  if (text.length <= MAX_DETECTION_CHARS) {
    return text;
  }

  return text.slice(0, MAX_DETECTION_CHARS);
};

const DETECTION_LANGUAGE_SET = [
  'plaintext',
  'javascript',
  'typescript',
  'json',
  'html',
  'css',
  'markdown',
  'python',
  'java',
  'c',
  'cpp',
  'csharp',
  'go',
  'rust',
  'php',
  'ruby',
  'shell',
  'sql',
  'yaml',
  'xml',
  'diff',
];

export const detectMonacoLanguage = async (text: string, availableLanguageIds: Set<string>): Promise<MonacoDetectionResult> => {
  const result = hljs.highlightAuto(buildDetectionInput(text), DETECTION_LANGUAGE_SET);
  const detectedLabel = String(result.language ?? 'plaintext').toLowerCase();
  const languageId = resolveMonacoLanguage(detectedLabel, availableLanguageIds);

  return {
    detectedLabel,
    languageId,
  };
};

export const disposeLanguageDetection = async () => Promise.resolve();
