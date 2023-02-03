import { exec } from 'child_process';
import { dirname } from 'path';
import * as vscode from 'vscode';
import { getFileExtension, getFunctionNameRange, isDefined } from './utils';

// Cache the results of the 'cs check' command so that we don't have to run it again
// We store the promise so that even if a call hasn't completed yet, we can still return the same promise.
// That way there is only one 'cs check' command running at a time for the same document version.
interface CheckCacheItem {
  documentVersion: number;
  diagnostics: Promise<vscode.Diagnostic[]>;
}

const checkCache = new Map<string, CheckCacheItem>();

/**
 * Parse one line of output from the 'cs check' command and return a diagnostic.
 */
function parseLine(line: string, document: vscode.TextDocument) {
  // The first line has the following format:
  // info: src/extension:1: Code health score: 9,75
  const codeHealthMatch = line.match(/info: (.+):1: Code health score: (.+)/);
  if (codeHealthMatch) {
    const [_, _filename, score] = codeHealthMatch;
    const range = new vscode.Range(0, 0, 0, 0);
    return produceDiagnostic('info', range, `Code health score: ${score}`);
  }

  // Each line contains severity, filename, line, function name and message
  // Example: info: src/extension.ts:22:bad-fn:complex-fn Complex function (cc: 10)
  const match = line.match(/(\w+): (.+):(\d+):([^\s]+):([^\s]+) (.+)/);

  if (match) {
    const [_, severity, _filename, line, functionName, issueCode, message] = match;
    const lineNumber = Number(line) - 1;

    const [startColumn, endColumn] = getFunctionNameRange(document.lineAt(lineNumber).text, functionName);

    // Produce the diagnostic
    const range = new vscode.Range(lineNumber, startColumn, lineNumber, endColumn);
    return produceDiagnostic(severity, range, message, issueCode);
  }
}

export function check(cliPath: string, document: vscode.TextDocument, skipCache = false) {
  if (!skipCache) {
    const cachedResults = checkCache.get(document.fileName);
    if (cachedResults && cachedResults.documentVersion === document.version) {
      console.log('CodeScene: returning cached diagnostics for ' + document.fileName);
      return cachedResults.diagnostics;
    }
  }

  const completedPromise = new Promise<vscode.Diagnostic[]>((resolve, reject) => {
    console.log('CodeScene: running "cs check" on ' + document.fileName);

    const fileExtension = getFileExtension(document.fileName);

    // Get the fsPath of the current document because we want to execute the 'cs check' command
    // in the same directory as the current document (to pick up on any .codescene/code-health-config.json file)
    const documentPath = document.uri.fsPath;
    const documentDirectory = dirname(documentPath);

    // Execute the CodeScene 'check' command and parse out the results,
    // and convert them to VS Code diagnostics
    const childProcess = exec(
      `"${cliPath}" check -f ${fileExtension}`,
      { cwd: documentDirectory },
      (error, stdout, stderr) => {
        if (error) {
          console.error(`exec error: ${error}`);
          reject(error);
          return;
        }

        const lines = stdout.split('\n');
        const diagnostics = lines.map((line) => parseLine(line, document)).filter(isDefined);

        resolve(diagnostics);
      }
    );

    if (childProcess.stdin) {
      childProcess.stdin.write(document.getText(), () => {
        if (childProcess.stdin) {
          childProcess.stdin.end();
        }
      });
    } else {
      reject('Error: cannot write to stdin of the CodeScene process');
    }
  });

  // Store result in cache.
  checkCache.set(document.fileName, { documentVersion: document.version, diagnostics: completedPromise });

  return completedPromise;
}

function produceDiagnostic(severity: string, range: vscode.Range, message: string, issueCode?: string) {
  let diagnosticSeverity: vscode.DiagnosticSeverity;
  switch (severity) {
    case 'info':
      diagnosticSeverity = vscode.DiagnosticSeverity.Information;
      break;
    case 'warning':
      diagnosticSeverity = vscode.DiagnosticSeverity.Warning;
      break;
    case 'error':
      diagnosticSeverity = vscode.DiagnosticSeverity.Error;
      break;
    default:
      diagnosticSeverity = vscode.DiagnosticSeverity.Error;
  }

  const diagnostic = new vscode.Diagnostic(range, message, diagnosticSeverity);
  diagnostic.source = 'CodeScene';

  if (issueCode) {
    const args = [vscode.Uri.parse(`csdoc:${issueCode}.md`)];
    const openDocCommandUri = vscode.Uri.parse(
          `command:markdown.showPreviewToSide?${encodeURIComponent(JSON.stringify(args))}`
    );
    diagnostic.code = {
      value: issueCode,
      target: openDocCommandUri
    };
  }

  return diagnostic;
}
