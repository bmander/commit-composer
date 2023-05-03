/* eslint-disable @typescript-eslint/naming-convention */
import * as vscode from "vscode";
import { simpleGit, SimpleGit } from "simple-git";
import fetch from "node-fetch";
import wrapAnsi from "wrap-ansi";

const API_URL = "https://api.openai.com/v1/chat/completions";
const SYSTEM_MESSAGE = `You are a commit message generator. You are given a 
diff of changes to a git repository. You must generate a commit message that 
describes the changes. The commit message must contain a subject line and a body
if the commit is not trivial. The subject line should be 50 characters or 
less, and begin with an imperative statement as if giving a command. The body 
should contain a description of the changes, focusing on "what" and "why"
instead of "how". Neither the subject line nor the body should be prefixed with 
the name of the section like "Title:" or "Body:". The commit message should 
comply with the software industry best practices as explained in 
https://chris.beams.io/posts/git-commit/.`;
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

  const end = new vscode.Position(doc.lineCount - 1, lastLine.text.length);

  editor.edit((editBuilder) => {
    editBuilder.insert(end, text);
  });
}

async function getDiff(): Promise<string | undefined> {
  const workspaceRootPath = vscode.workspace.workspaceFolders?.[0].uri.path;
  const git: SimpleGit = simpleGit(workspaceRootPath);

  const isRepo = await git.checkIsRepo();
  if (!isRepo) {
    return undefined;
  }

  return await git.diff();
}

function getApiConfig(): {
  openaiApiKey: string;
  modelName: string;
} {
  const conf = vscode.workspace.getConfiguration("commitcomposer");
  const openaiApiKey: string | undefined = conf.get("openaiApiKey");
  const modelName: string | undefined = conf.get("modelName");

  if (!openaiApiKey) {
    throw new Error("OpenAI API key not set");
  }
  if (!modelName) {
    throw new Error("OpenAI model name not set");
  }

  return { openaiApiKey, modelName };
}

async function createCommitMessageDocument(): Promise<vscode.TextEditor> {
  const commitMessageDoc = await vscode.workspace.openTextDocument({
    content: "",
    language: "commitmsg",
  });
  return vscode.window.showTextDocument(commitMessageDoc, {
    viewColumn: vscode.ViewColumn.Beside,
    preserveFocus: true,
    preview: false,
  });
}

async function fetchChatCompletionResponses(
  apiConfig: { openaiApiKey: string; modelName: string },
  diff: string
): Promise<NodeJS.ReadableStream | undefined> {
  try {
    const response = await fetch(API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiConfig.openaiApiKey}`,
      },
      body: JSON.stringify({
        model: apiConfig.modelName,
        messages: [
          { role: "system", content: SYSTEM_MESSAGE },
          { role: "user", content: diff },
        ],
        stream: true,
      }),
    });

    return response.body?.setEncoding("utf-8") ?? undefined;
  } catch (error) {
    vscode.window.showErrorMessage(
      `Error fetching chat completion responses: ${error}`
    );
    return undefined;
  }
}

function parseStreamingChatCompletionResponses(
  chunk: string
): ChatCompletionResponse[] {
  // parse chunk, which is a server-sent event starting with
  // "data: " and ending with "\n\n"
  const lines = chunk.toString().split("\n\n");

  const chatCompletionResponses = lines
    .map((line) => line.replace(/^data: /, "").trim()) // Remove the "data: " prefix
    .filter((line) => line !== "" && line !== "[DONE]") // Remove empty lines and "[DONE]"
    .map((line) => JSON.parse(line) as ChatCompletionResponse); // Parse the JSON string

  return chatCompletionResponses;
}

async function draftCommitMessage(
  progress: vscode.Progress<{ message?: string; increment?: number }>,
  token: vscode.CancellationToken
) {
  progress.report({ message: "Getting diff..." });
  const diff = await getDiff();
  if (diff === "") {
    vscode.window.showInformationMessage("No changes to commit");
    return;
  }

  if (!diff) {
    vscode.window.showErrorMessage(
      `Current working directory is not a git repository`
    );
    return;
  }

  progress.report({ message: "Getting API config..." });
  let apiConfig: { openaiApiKey: string; modelName: string };
  try {
    apiConfig = getApiConfig();
  } catch (error) {
    vscode.window.showErrorMessage(`Error getting API config: ${error}`);
    return;
  }

  const docEditor = await createCommitMessageDocument();

  progress.report({ message: "Connecting to OpenAI API..." });
  const reader = await fetchChatCompletionResponses(apiConfig, diff);

  if (!reader) {
    vscode.window.showErrorMessage(`Error getting response body`);
    return;
  }

  progress.report({ message: "Generating commit message..." });
  for await (const chunk of reader) {
    if (token.isCancellationRequested) {
      break;
    }

    const chatCompletionResponses = parseStreamingChatCompletionResponses(
      chunk.toString()
    );

    for (const chatCompletionResponse of chatCompletionResponses) {
      const word = chatCompletionResponse.choices[0].delta.content;
      if (!word) {
        continue;
      }

      appendToLastLine(docEditor, word);
    }
  }
}

async function draftCommitMessageWithProgress() {
  vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: "Drafting commit message",
      cancellable: true,
    },
    (progress, token) => {
      return new Promise((resolve, reject) => {
        draftCommitMessage(progress, token).then(resolve).catch(reject);
      });
    }
  );
}

async function copyAllAndClose() {
  const editor = vscode.window.activeTextEditor;
  if (editor) {
    const doc = editor.document;
    const text = wrapAnsi(doc.getText(), 72);

    await vscode.env.clipboard.writeText(text);

    // Close the editor
    await vscode.commands.executeCommand("workbench.action.closeActiveEditor");
  }
}

export function activate(context: vscode.ExtensionContext) {
  let disposable = vscode.commands.registerCommand(
    "commitcomposer.draftCommitMessage",
    draftCommitMessageWithProgress
  );

  context.subscriptions.push(disposable);

  context.subscriptions.push(
    vscode.commands.registerCommand(
      "commitcomposer.copyAllAndClose",
      copyAllAndClose
    )
  );
}

// This method is called when your extension is deactivated
export function deactivate() {}
