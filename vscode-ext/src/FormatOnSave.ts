import type { WorkspaceConfiguration } from "vscode";

/** Native VS Code save-formatting settings take precedence over the convenience hook. */
export function shouldUseBplSaveFormatting(
  languageId: string,
  enabled: boolean,
  editor: WorkspaceConfiguration,
): boolean {
  if (languageId !== "bpl" || !enabled) return false;
  const configured = editor.inspect<boolean>("formatOnSave");
  if (
    configured &&
    [
      configured.globalValue,
      configured.workspaceValue,
      configured.workspaceFolderValue,
      configured.globalLanguageValue,
      configured.workspaceLanguageValue,
      configured.workspaceFolderLanguageValue,
    ].some((value) => value !== undefined)
  )
    return false;
  // If enabled by an editor/language default, VS Code already handles it.
  return !editor.get<boolean>("formatOnSave", false);
}
