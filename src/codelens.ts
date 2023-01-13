import * as vscode from 'vscode';

/**
 * A CS CodeLens is a CodeLens that is associated with a Diagnostic.
 */
export class CsCodeLens extends vscode.CodeLens {
  readonly diagnostic: vscode.Diagnostic;

  constructor(range: vscode.Range, diagnostic: vscode.Diagnostic, command?: vscode.Command) {
    super(range, command);
    this.diagnostic = diagnostic;
  }
}

export class CsCodeLensProvider implements vscode.CodeLensProvider<CsCodeLens> {
  private onDidChangeCodeLensesEmitter = new vscode.EventEmitter<void>();

  constructor(private readonly diagnosticCollection: vscode.DiagnosticCollection) {
    console.log('Creating CodeLens provider');
  }

  get onDidChangeCodeLenses(): vscode.Event<void> {
    return this.onDidChangeCodeLensesEmitter.event;
  }

  provideCodeLenses(
    document: vscode.TextDocument,
    token: vscode.CancellationToken
  ): vscode.ProviderResult<CsCodeLens[]> {
    const diagnostics = this.diagnosticCollection.get(document.uri);
    if (!diagnostics || diagnostics.length === 0) {
      return [];
    }

    const lenses = [];
    for (const diagnostic of diagnostics) {
      const range = diagnostic.range;
      const lens = new CsCodeLens(range, diagnostic);
      lenses.push(lens);
    }

    return lenses;
  }

  resolveCodeLens?(codeLens: CsCodeLens, token: vscode.CancellationToken): vscode.ProviderResult<CsCodeLens> {
    codeLens.command = {
      title: codeLens.diagnostic.message,
      command: 'helloworld.helloWorld',
    };

    return codeLens;
  }

  update() {
    this.onDidChangeCodeLensesEmitter.fire();
  }
}