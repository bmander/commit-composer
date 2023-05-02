// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import { simpleGit, SimpleGit, CleanOptions } from 'simple-git';
import { cachedDataVersionTag } from 'v8';
import { fetchInsiderVersions } from '@vscode/test-electron/out/download';
import { resourceLimits } from 'worker_threads';
const { Configuration, OpenAIApi } = require("openai");
import fetch from 'node-fetch';

interface Message {
	role: string;
	content: string;
}

interface Choice {
	index: number;
	message: Message;
	finish_reason: string;
}

interface ChatCompletionResponse {
	id: string;
	object: string;
	created: number;
	choices: Choice[];
	usage: {
		prompt_tokens: number;
		completion_tokens: number;
		total_tokens: number;
	}

}

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

		// get API key from settings
		const openaiApiKey: string | undefined = vscode.workspace.getConfiguration('commitcomposer').get('openaiApiKey');
		if (!openaiApiKey) {
			vscode.window.showErrorMessage(`OpenAI API key not set`);

			return;
		}

		const configuration = new Configuration({
			apiKey: openaiApiKey,
		});
		const openai = new OpenAIApi(configuration);

		// create a blank new next window
		const commitMessageDoc = await vscode.workspace.openTextDocument({
			content: "",
			language: 'plaintext'
		});
		const docEditor = await vscode.window.showTextDocument(commitMessageDoc, {
			viewColumn: vscode.ViewColumn.Beside,
			preserveFocus: true,
			preview: false
		});

		const API_URL = "https://api.openai.com/v1/chat/completions"

		const generate = async () => {
			vscode.window.showInformationMessage("Generating commit message...");

			try {
				const response = await fetch(API_URL, {
					method: "POST",
					headers: {
						"Content-Type": "application/json",
						"Authorization": `Bearer ${openaiApiKey}`
					},
					body: JSON.stringify({
						model: "gpt-3.5-turbo",
						messages: [
							{ role: "user", content: "To be or not to be, " },
						]
					})
				});

				vscode.window.showInformationMessage("Commit message generated!");

				// check if response is ok
				if (!response.ok) {
					vscode.window.showErrorMessage(`Error generating commit message: ${response.statusText}`);
					return;
				}

				const data = await response.json() as ChatCompletionResponse;
				const content = data.choices[0].message.content;

				docEditor.edit(editBuilder => {
					editBuilder.insert(new vscode.Position(0, 0), content);
				});

			} catch (error) {
				vscode.window.showInformationMessage("Error generating commit message!");
				vscode.window.showErrorMessage(`Error generating commit message: ${error}`);
			}
		};

		generate();


		// // use OpenAI chat api to generate commit message
		// try {
		// 	vscode.window.showInformationMessage(`OpenAI API key set to ${openaiApiKey}`);
		// 	vscode.window.showInformationMessage("Generating commit message...");

		// 	const chatCompletion = await openai.chatCompletion.create({
		// 		model: "gpt-4",
		// 		messages: [
		// 			{
		// 				role: "system",
		// 				content: "You are a helpful assistant. You will receive messages " +
		// 					"in the format of a diff file created by git. You will respond " +
		// 					"with a git commit message that obeys call best practices set by " +
		// 					"the software development community."
		// 			},
		// 			{
		// 				role: "user",
		// 				content: diff
		// 			}
		// 		]
		// 	});


		// 	vscode.window.showInformationMessage("Commit message generated!");
		// 	vscode.window.showInformationMessage(chatCompletion);

		// 	// show chatCompletion
		// 	const commitMessage = chatCompletion.messages[1].content;
		// 	const commitMessageDoc = await vscode.workspace.openTextDocument({
		// 		content: commitMessage,
		// 		language: 'plaintext'
		// 	});
		// 	await vscode.window.showTextDocument(commitMessageDoc, {
		// 		viewColumn: vscode.ViewColumn.Beside,
		// 		preserveFocus: true,
		// 		preview: false
		// 	});
		// } catch (error: any) {
		// 	if (error.message) {
		// 		vscode.window.showErrorMessage(error.response.status);
		// 		vscode.window.showErrorMessage(error.response.data);
		// 	} else {
		// 		vscode.window.showErrorMessage(error);
		// 	}
		// }


	});

	context.subscriptions.push(disposable);
}

// This method is called when your extension is deactivated
export function deactivate() { }
