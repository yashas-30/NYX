import simpleGit from 'simple-git';

export async function autoCommit(workspacePath: string, message: string) {
  const git = simpleGit(workspacePath);
  await git.add('.');
  await git.commit(message, [], { '--no-verify': null });
}

export async function createBranch(workspacePath: string, branchName: string) {
  const git = simpleGit(workspacePath);
  await git.checkoutLocalBranch(branchName);
}

export async function generatePrTitle(changes: string): Promise<string> {
  // Uses AI to generate a title
  return "feat: AI generated changes";
}
