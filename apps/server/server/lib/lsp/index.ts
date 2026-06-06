export class LSPManager {
  public async initializeWorkspace(workspaceId: string) {
    // stub to spin up language servers
    return { initialized: true };
  }

  public async getDiagnostics(fileUri: string) {
    return []; // returning stubbed errors/warnings
  }

  public async provideHover(fileUri: string, line: number, char: number) {
    return { contents: 'Hover documentation stub' };
  }
}
