import * as vscode from "vscode";
import { simpleGit, SimpleGit, CleanOptions } from "simple-git";
import fetch from "node-fetch";
import internal = require("stream");

const API_URL = "https://api.openai.com/v1/chat/completions";
const SYSTEM_MESSAGE =
  "You are a commit message generator. You are given a diff of changes" +
  "to a git repository. You must generate a commit message that describes the changes. " +
  "The commit message must contain a subject line and, if the commit is not trivial, a " +
  "body. The subject line should be 50 characters or less, and begin with an imperative " +
  "statement, as if giving a command. The body should contain a description of the changes.";
const GIT_BODY_MAX_LENGTH = 72;

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
  };
}

function appendToLastLine(editor: vscode.TextEditor, text: string) {
  const doc = editor.document;
  const lastLine = doc.lineAt(doc.lineCount - 1);

  let cursorRow: number;
  let cursorCol: number;
  if (lastLine.text.length + text.length > GIT_BODY_MAX_LENGTH) {
    cursorRow = doc.lineCount;
    cursorCol = 0;
  } else {
    cursorRow = doc.lineCount - 1;
    cursorCol = lastLine.text.length;
  }
  const end = new vscode.Position(cursorRow, cursorCol);

  editor.edit((editBuilder) => {
    editBuilder.insert(end, text);
  });
}

export function activate(context: vscode.ExtensionContext) {
  let disposable = vscode.commands.registerCommand(
    "commitcomposer.draftCommitMessage",
    async () => {
      const workspaceRootPath = vscode.workspace.workspaceFolders?.[0].uri.path;
      const git: SimpleGit = simpleGit(workspaceRootPath);

      const isRepo = await git.checkIsRepo();
      if (!isRepo) {
        vscode.window.showErrorMessage(
          `Current working directory is not a git repository`
        );

        return;
      }

      const diff = await git.diff();

      const conf = vscode.workspace.getConfiguration("commitcomposer");
      // get API key from settings
      const openaiApiKey: string | undefined = conf.get("openaiApiKey");
      if (!openaiApiKey) {
        vscode.window.showErrorMessage(`OpenAI API key not set`);

        return;
      }

      const modelName: string | undefined = conf.get("modelName");

      // create a blank new next window
      const commitMessageDoc = await vscode.workspace.openTextDocument({
        content: "",
        language: "plaintext",
      });
      const docEditor = await vscode.window.showTextDocument(commitMessageDoc, {
        viewColumn: vscode.ViewColumn.Beside,
        preserveFocus: true,
        preview: false,
      });

      try {
        const response = fetch(API_URL, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${openaiApiKey}`,
          },
          body: JSON.stringify({
            model: modelName,
            messages: [
              { role: "system", content: SYSTEM_MESSAGE },
              { role: "user", content: diff },
            ],
            stream: true,
          }),
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
        vscode.window.showErrorMessage(
          `Error generating commit message: ${error}`
        );
      }
    }
  );

  context.subscriptions.push(disposable);
}

// This method is called when your extension is deactivated
export function deactivate() {}
