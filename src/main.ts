import './style.css';
import { Magika } from 'magika';
import * as monaco from 'monaco-editor';
import cssWorker from 'monaco-editor/esm/vs/language/css/css.worker?worker';
import htmlWorker from 'monaco-editor/esm/vs/language/html/html.worker?worker';
import jsonWorker from 'monaco-editor/esm/vs/language/json/json.worker?worker';
import tsWorker from 'monaco-editor/esm/vs/language/typescript/ts.worker?worker';
import editorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker';

const HIGH_CONFIDENCE_THRESHOLD = 0.84;
const DETECTION_DEBOUNCE_MS = 500;

type MonacoWorkerFactory = new () => Worker;

interface MonacoEnvironmentShape {
  getWorker(_: unknown, label: string): Worker;
}

interface GlobalScopeWithMonacoEnvironment {
  MonacoEnvironment: MonacoEnvironmentShape;
}

(self as unknown as GlobalScopeWithMonacoEnvironment).MonacoEnvironment = {
  getWorker(_, label) {
    const workers: Record<string, MonacoWorkerFactory> = {
      css: cssWorker,
      html: htmlWorker,
      json: jsonWorker,
      javascript: tsWorker,
      typescript: tsWorker,
    };
    const WorkerFactory = workers[label] ?? editorWorker;
    return new WorkerFactory();
  },
};

const app = document.querySelector<HTMLDivElement>('#app');

if (!app) {
  throw new Error('Missing #app root element');
}

app.innerHTML = `
  <main class="page">
    <section class="editor-shell">
      <div id="editor" class="editor" aria-label="Diff editor"></div>
    </section>
    <footer class="footer">
      <label for="language-select">Syntax mode</label>
      <select id="language-select" aria-label="Choose syntax mode"></select>
      <span id="mode-status" class="pill">Auto</span>
      <span id="detect-status" class="detect-status">Initializing...</span>
    </footer>
  </main>
`;

const editorContainer = document.querySelector<HTMLDivElement>('#editor');
const languageSelect = document.querySelector<HTMLSelectElement>('#language-select');
const modeStatus = document.querySelector<HTMLSpanElement>('#mode-status');
const detectStatus = document.querySelector<HTMLSpanElement>('#detect-status');

if (!editorContainer || !languageSelect || !modeStatus || !detectStatus) {
  throw new Error('Failed to initialize UI elements');
}

const allLanguageIds = monaco.languages
  .getLanguages()
  .map((language) => language.id)
  .filter((languageId, index, all) => all.indexOf(languageId) === index)
  .sort((a, b) => a.localeCompare(b));

const selectableLanguageIds = [
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
].filter((languageId) => allLanguageIds.includes(languageId));

languageSelect.innerHTML = [
  '<option value="auto" selected>Auto</option>',
  ...selectableLanguageIds.map((languageId) => `<option value="${languageId}">${languageId}</option>`),
].join('');

const tsLanguageDefaults = (monaco.languages as unknown as {
  typescript: {
    typescriptDefaults: {
      setDiagnosticsOptions(options: unknown): void;
      setCompilerOptions(options: unknown): void;
      setEagerModelSync(value: boolean): void;
    };
    javascriptDefaults: {
      setDiagnosticsOptions(options: unknown): void;
      setCompilerOptions(options: unknown): void;
      setEagerModelSync(value: boolean): void;
    };
  };
}).typescript;

tsLanguageDefaults.typescriptDefaults.setDiagnosticsOptions({
  noSemanticValidation: true,
  noSyntaxValidation: true,
  noSuggestionDiagnostics: true,
});

tsLanguageDefaults.javascriptDefaults.setDiagnosticsOptions({
  noSemanticValidation: true,
  noSyntaxValidation: true,
  noSuggestionDiagnostics: true,
});

tsLanguageDefaults.typescriptDefaults.setCompilerOptions({
  allowNonTsExtensions: true,
  noLib: true,
  noResolve: true,
  moduleResolution: 1,
});

tsLanguageDefaults.javascriptDefaults.setCompilerOptions({
  allowNonTsExtensions: true,
  noLib: true,
  noResolve: true,
  checkJs: false,
  moduleResolution: 1,
});

tsLanguageDefaults.typescriptDefaults.setEagerModelSync(false);
tsLanguageDefaults.javascriptDefaults.setEagerModelSync(false);

const originalModel = monaco.editor.createModel('', 'plaintext');
const modifiedModel = monaco.editor.createModel('', 'plaintext');

const diffEditor = monaco.editor.createDiffEditor(editorContainer, {
  originalEditable: true,
  renderSideBySide: true,
  diffAlgorithm: 'advanced',
  ignoreTrimWhitespace: false,
  automaticLayout: true,
  theme: 'vs-dark',
  minimap: { enabled: false },
  wordWrap: 'on',
  renderOverviewRuler: true,
  scrollBeyondLastLine: false,
});

diffEditor.setModel({
  original: originalModel,
  modified: modifiedModel,
});

const magikaToMonacoLanguage: Record<string, string> = {
  c: 'c',
  clojure: 'clojure',
  coffeescript: 'coffeescript',
  cpp: 'cpp',
  csharp: 'csharp',
  css: 'css',
  dart: 'dart',
  diff: 'diff',
  dockerfile: 'dockerfile',
  go: 'go',
  handlebars: 'handlebars',
  hcl: 'hcl',
  html: 'html',
  ini: 'ini',
  java: 'java',
  javascript: 'javascript',
  json: 'json',
  jsonc: 'json',
  jsx: 'javascript',
  kotlin: 'kotlin',
  less: 'less',
  lua: 'lua',
  makefile: 'makefile',
  markdown: 'markdown',
  objectivec: 'objective-c',
  perl: 'perl',
  php: 'php',
  powershell: 'powershell',
  protobuf: 'protobuf',
  python: 'python',
  r: 'r',
  ruby: 'ruby',
  rust: 'rust',
  scala: 'scala',
  shell: 'shell',
  solidity: 'sol',
  sql: 'sql',
  swift: 'swift',
  toml: 'ini',
  tsx: 'typescript',
  typescript: 'typescript',
  vue: 'vue',
  xml: 'xml',
  yaml: 'yaml',
};

const encoder = new TextEncoder();
let magikaPromise: Promise<Magika> | null = null;
let currentLanguage = 'plaintext';
let detectionTimer: number | null = null;
let latestDetectionRequestId = 0;
let isManualMode = false;

const getMagika = () => {
  if (!magikaPromise) {
    magikaPromise = Magika.create();
  }
  return magikaPromise;
};

const resolveMonacoLanguage = (label: string) => {
  if (allLanguageIds.includes(label)) {
    return label;
  }
  const mapped = magikaToMonacoLanguage[label];
  if (mapped && allLanguageIds.includes(mapped)) {
    return mapped;
  }
  return null;
};

const setStatusText = (text: string) => {
  detectStatus.textContent = text;
};

const applyLanguage = (languageId: string) => {
  if (currentLanguage === languageId) {
    return;
  }

  currentLanguage = languageId;
  monaco.editor.setModelLanguage(originalModel, languageId);
  monaco.editor.setModelLanguage(modifiedModel, languageId);
};

const getDetectionInput = () => {
  const left = originalModel.getValue();
  const right = modifiedModel.getValue();
  return left.length >= right.length ? left : right;
};

const runDetection = async () => {
  if (isManualMode) {
    return;
  }

  const text = getDetectionInput();
  const requestId = ++latestDetectionRequestId;

  if (!text.trim()) {
    applyLanguage('plaintext');
    setStatusText('No content. Defaulting to plaintext.');
    return;
  }

  setStatusText('Detecting syntax with Magika...');

  try {
    const magika = await getMagika();
    const result = await magika.identifyBytes(encoder.encode(text));

    if (isManualMode || requestId !== latestDetectionRequestId) {
      return;
    }

    const confidence = result.prediction.score;
    const magikaLabel = result.prediction.output.label;
    const languageId = resolveMonacoLanguage(magikaLabel);

    if (confidence >= HIGH_CONFIDENCE_THRESHOLD && languageId) {
      applyLanguage(languageId);
      setStatusText(`Auto detected ${magikaLabel} (${Math.round(confidence * 100)}%).`);
      return;
    }

    applyLanguage('plaintext');
    setStatusText(`Low confidence (${Math.round(confidence * 100)}%). Fallback to plaintext.`);
  } catch {
    if (!isManualMode && requestId === latestDetectionRequestId) {
      applyLanguage('plaintext');
      setStatusText('Magika failed to detect syntax. Fallback to plaintext.');
    }
  }
};

const scheduleDetection = () => {
  if (isManualMode) {
    return;
  }

  if (detectionTimer) {
    window.clearTimeout(detectionTimer);
  }

  detectionTimer = window.setTimeout(() => {
    void runDetection();
  }, DETECTION_DEBOUNCE_MS);
};

originalModel.onDidChangeContent(() => {
  scheduleDetection();
});

modifiedModel.onDidChangeContent(() => {
  scheduleDetection();
});

languageSelect.addEventListener('change', () => {
  const selected = languageSelect.value;

  if (selected === 'auto') {
    isManualMode = false;
    modeStatus.textContent = 'Auto';
    setStatusText('Auto detection enabled.');
    scheduleDetection();
    return;
  }

  isManualMode = true;
  modeStatus.textContent = 'Manual';
  applyLanguage(selected);
  setStatusText(`Manual override: ${selected}. Magika paused.`);
});

scheduleDetection();

window.addEventListener('beforeunload', () => {
  if (detectionTimer) {
    window.clearTimeout(detectionTimer);
  }
  originalModel.dispose();
  modifiedModel.dispose();
  diffEditor.dispose();
});
