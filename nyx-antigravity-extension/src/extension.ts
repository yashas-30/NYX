import * as vscode from 'vscode';
import { AntigravitySDK } from 'antigravity-sdk';

export function activate(context: vscode.ExtensionContext) {
  console.log('NYX Antigravity Companion is now active!');

  // Initialize the official Antigravity SDK within the Extension Host context
  // This provides read-only local state access via sql.js as per the docs
  const sdk = new AntigravitySDK(context);

  // Example Usage: Retrieve local cascade sessions
  try {
    const sessions = sdk.cascade.getSessions();
    console.log(`Found ${sessions.length} Cascade sessions.`);
  } catch (e) {
    console.error('Failed to get cascade sessions:', e);
  }

  // Example Usage: Integrate into the Antigravity IDE Top Bar
  try {
    sdk.integration.addTopBarButton({
      id: 'nyx-antigravity-btn',
      title: 'NYX Workspace',
      icon: 'nyx-icon',
      onClick: () => {
        vscode.window.showInformationMessage('NYX Companion Workspace activated!');
      },
    });
  } catch (e) {
    console.error('Failed to add top bar button:', e);
  }
}

export function deactivate() {}
