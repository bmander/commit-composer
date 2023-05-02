// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import { simpleGit, SimpleGit, CleanOptions } from 'simple-git';
import fetch from 'node-fetch';

const SYSTEM_MESSAGE = "You are a commit message generator. You are given a diff of changes" +
	"to a git repository. You must generate a commit message that describes the changes. " +
	"The commit message must contain a subject line and, if the commit is not trivial, a " +
	"body. The subject line should be 50 characters or less, and begin with an imperative " +
	"statement, as if giving a command. The body should contain a description of the changes.";

interface Message {
	role: string;
	content: string;
}

interface Choice {
	delta: Message;
	index: number;
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

function appendToLastLine(editor: vscode.TextEditor, text: string) {
	const doc = editor.document;
	const lastLine = doc.lineAt(doc.lineCount - 1);
	const end = new vscode.Position(doc.lineCount - 1, lastLine.text.length);

	editor.edit(editBuilder => {
		editBuilder.insert(end, text);
	});
}

export function activate(context: vscode.ExtensionContext) {

	let disposable = vscode.commands.registerCommand('commitcomposer.draftCommitMessage', async () => {
		const workspaceRootPath = vscode.workspace.workspaceFolders?.[0].uri.path;
		const git: SimpleGit = simpleGit(workspaceRootPath);

		const isRepo = await git.checkIsRepo();
		if (!isRepo) {
			vscode.window.showErrorMessage(`Current working directory is not a git repository`);

			return;
		}

		const diff = await git.diff();

		// get API key from settings
		const openaiApiKey: string | undefined = vscode.workspace.getConfiguration('commitcomposer').get('openaiApiKey');
		if (!openaiApiKey) {
			vscode.window.showErrorMessage(`OpenAI API key not set`);

			return;
		}

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

		const generate = async (docEditor: vscode.TextEditor) => {

			try {
				const response = fetch(API_URL, {
					method: "POST",
					headers: {
						"Content-Type": "application/json",
						"Authorization": `Bearer ${openaiApiKey}`
					},
					body: JSON.stringify({
						model: "gpt-4",
						messages: [
							{ role: "system", content: SYSTEM_MESSAGE },
							{ role: "user", content: diff },
						],
						stream: true
					})
				});

				const reader = (await response).body?.setEncoding("utf-8");

				if (!reader) {
					vscode.window.showErrorMessage(`Error getting response body`);
					return;
				}

				for await (const chunk of reader) {
					// parse chunk, which is a server-sent event starting with
					// "data: " and ending with "\n\n"
					const lines = chunk.toString().split("\n\n");

					const parsedLines = lines
						.map((line) => line.replace(/^data: /, "").trim()) // Remove the "data: " prefix
						.filter((line) => line !== "" && line !== "[DONE]") // Remove empty lines and "[DONE]"
						.map((line) => JSON.parse(line) as ChatCompletionResponse); // Parse the JSON string

					for (const line of parsedLines) {
						const word = line.choices[0].delta.content;
						if (!word) {
							continue;
						}

						appendToLastLine(docEditor, word);
					}
				}

			} catch (error) {
				vscode.window.showErrorMessage(`Error generating commit message: ${error}`);
			}
		};

		generate(docEditor);

	});

	context.subscriptions.push(disposable);
}

// This method is called when your extension is deactivated
export function deactivate() { }
