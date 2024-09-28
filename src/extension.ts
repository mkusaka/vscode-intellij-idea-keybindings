import * as vscode from 'vscode';
import { KeybindingsJsonGenerator } from './importer/generator/KeybindingsJsonGenerator';
import { ImporterType } from './importer/model/ImporterType';
import { IntelliJKeymapXML } from './importer/model/intellij/implement/IntelliJKeymapXML';
import { OS } from './importer/model/OS';
import { ActionIdCommandMapping } from './importer/model/resource/ActionIdCommandMapping';
import { KeystrokeKeyMapping } from './importer/model/resource/KeystrokeKeyMapping';
import { VSCodeKeybinding } from './importer/model/vscode/VSCodeKeybinding';
import { ActionIdCommandMappingJsonParser } from './importer/parser/ActionIdCommandMappingJsonParser';
import { IntelliJXMLParser } from './importer/parser/IntelliJXmlParser';
import { KeystrokeKeyMappingJsonParser } from './importer/parser/KeystrokeKeyMappingJsonParser';
import { VSCodeJsonParser } from './importer/parser/VSCodeJsonParser';
import { FileOpenDialog, USE_DEFAULT_FILE } from './importer/reader/FileOpenDialog';
import { FileReaderDefault } from './importer/reader/FileReaderDefault';
import { Picker, UNSELECT } from './importer/reader/Picker';
import { IntelliJSyntaxAnalyzer } from './importer/syntax-analyzer/IntelliJSyntaxAnalyzer';
import { FileOpen } from './importer/writer/FileOpen';
import { IntelliJExtension } from './importer/extension/IntelliJExtension';

export function activate(context: vscode.ExtensionContext) {
    context.subscriptions.push(
        vscode.commands.registerCommand('intellij.importKeyMapsSchema', async () => await importKeyMapsSchema(context)),
        vscode.commands.registerCommand('intellij.openInOppositeGroup', async () => await IntelliJExtension.openInOppositeGroup())
    );
}

export async function importKeyMapsSchema(context: vscode.ExtensionContext) {
    /*---------------------------------------------------------------------
     * Reader
     *-------------------------------------------------------------------*/
    const importerType: ImporterType | UNSELECT = await Picker.pickImporterType();
    if (!importerType) {
        return;
    }

    const os: { src: OS; dst: OS } | UNSELECT = await Picker.pickOSDestionation();
    if (!os) {
        return;
    }

    let intellijXmlCustom: string | USE_DEFAULT_FILE;
    if (importerType === 'XmlFile') {
        intellijXmlCustom = await FileOpenDialog.showXml();
        if (!intellijXmlCustom) {
            return;
        }
    }

    const intellijXmlDefault: string = await FileReaderDefault.readIntelliJ(os.src, context);
    const vscodeJsonDefault: string = await FileReaderDefault.readVSCode(os.src, context);
    const actionIdCommandMappingJson: string = await FileReaderDefault.readActionIdCommandMapping(context);
    const keystrokeKeyMappingJson: string = await FileReaderDefault.readKeystrokeKeyMapping(context);

    /*---------------------------------------------------------------------
     * Parser
     *-------------------------------------------------------------------*/
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const intellijJsonCustom: any | USE_DEFAULT_FILE = await IntelliJXMLParser.parseToJson(intellijXmlCustom);
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const intellijJsonDefault: any | USE_DEFAULT_FILE = await IntelliJXMLParser.parseToJson(intellijXmlDefault);
    const intellijCustoms: IntelliJKeymapXML[] = IntelliJXMLParser.desirialize(intellijJsonCustom);
    const intellijDefaults: IntelliJKeymapXML[] = IntelliJXMLParser.desirialize(intellijJsonDefault);
    const vscodeDefaults: VSCodeKeybinding[] = VSCodeJsonParser.desirialize(vscodeJsonDefault);
    const actionIdCommandMappings: ActionIdCommandMapping[] = ActionIdCommandMappingJsonParser.desirialize(
        actionIdCommandMappingJson
    );
    const keystrokeKeyMappings: KeystrokeKeyMapping[] = KeystrokeKeyMappingJsonParser.desirialize(
        keystrokeKeyMappingJson
    );

    /*---------------------------------------------------------------------
     * Semantic Analyzer
     *-------------------------------------------------------------------*/
    const syntaxAnalyzer = new IntelliJSyntaxAnalyzer(
        os.dst,
        actionIdCommandMappings,
        keystrokeKeyMappings,
        vscodeDefaults,
        intellijDefaults,
        intellijCustoms
    );
    let keybindings: VSCodeKeybinding[] = syntaxAnalyzer.convert();

    /*---------------------------------------------------------------------
     * 重複チェックとフィルタリング
     *-------------------------------------------------------------------*/
    // VSCodeの既存のキーマップを取得
    const existingKeybindings = vscode.workspace.getConfiguration('keybindings');
    
    // 既存のキーと比較して重複がないものだけ残す
    keybindings = keybindings.filter(kb => {
        return !existingKeybindings.some(existingKb => existingKb.key === kb.key && existingKb.command !== kb.command);
    });

    /*---------------------------------------------------------------------
     * Code Generator
     *-------------------------------------------------------------------*/
    const keybindingsJson = KeybindingsJsonGenerator.gene(keybindings);

    /*---------------------------------------------------------------------
     * Writer
     *-------------------------------------------------------------------*/
    const untitledKeybindingsJson = await FileOpen.openText(keybindingsJson);
    await FileOpen.showKeybindingsJson(untitledKeybindingsJson);
}
