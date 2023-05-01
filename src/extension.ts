// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import { simpleGit, SimpleGit, CleanOptions } from 'simple-git';
const { Configuration, OpenAIApi } = require("openai");

// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {

	// The command has been defined in the package.json file
	// Now provide the implementation of the command with registerCommand
	// The commandId parameter must match the command field in package.json
	let disposable = vscode.commands.registerCommand('commitcomposer.draftCommitMessage', async () => {
		const workspaceRootPath = vscode.workspace.workspaceFolders?.[0].uri.path;
		const git: SimpleGit = simpleGit(workspaceRootPath);

		const isRepo = await git.checkIsRepo();
		if (!isRepo) {
			vscode.window.showErrorMessage(`Current working directory is not a git repository`);

			return;
		}

		const diff = await git.diff();

		// open up new tab and fill it with diff
		const diffDoc = await vscode.workspace.openTextDocument({
			content: diff,
			language: 'diff'
		});

		await vscode.window.showTextDocument(diffDoc, {
			viewColumn: vscode.ViewColumn.Beside,
			preserveFocus: true,
			preview: false
		});


	});

	context.subscriptions.push(disposable);
}

// This method is called when your extension is deactivated
export function deactivate() { }
