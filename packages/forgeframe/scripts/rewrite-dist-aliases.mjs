import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const distRoot = path.join(packageRoot, 'dist');

function walk(dirPath) {
  const entries = fs.readdirSync(dirPath, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      files.push(...walk(fullPath));
      continue;
    }

    if (entry.isFile() && fullPath.endsWith('.d.ts')) {
      files.push(fullPath);
    }
  }

  return files;
}

function toPosix(value) {
  return value.split(path.sep).join('/');
}

function toRelativeSpecifier(filePath, aliasSpecifier) {
  const targetPath = path.resolve(distRoot, aliasSpecifier.slice(2));
  const relativePath = toPosix(path.relative(path.dirname(filePath), targetPath));
  return relativePath.startsWith('.') ? relativePath : `./${relativePath}`;
}

function collectEdits(sourceFile, filePath) {
  const edits = [];

  function addEdit(specifierNode) {
    if (!ts.isStringLiteralLike(specifierNode)) {
      return;
    }

    const specifier = specifierNode.text;
    if (!specifier.startsWith('@/')) {
      return;
    }

    edits.push({
      start: specifierNode.getStart(sourceFile) + 1,
      end: specifierNode.getEnd() - 1,
      text: toRelativeSpecifier(filePath, specifier),
    });
  }

  function visit(node) {
    if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier) {
      addEdit(node.moduleSpecifier);
    }

    if (ts.isImportTypeNode(node) && ts.isLiteralTypeNode(node.argument)) {
      addEdit(node.argument.literal);
    }

    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return edits;
}

if (fs.existsSync(distRoot)) {
  for (const filePath of walk(distRoot)) {
    const sourceText = fs.readFileSync(filePath, 'utf8');
    const sourceFile = ts.createSourceFile(filePath, sourceText, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
    const edits = collectEdits(sourceFile, filePath);

    if (edits.length === 0) {
      continue;
    }

    edits.sort((a, b) => b.start - a.start);

    let nextText = sourceText;
    for (const edit of edits) {
      nextText = `${nextText.slice(0, edit.start)}${edit.text}${nextText.slice(edit.end)}`;
    }

    if (nextText !== sourceText) {
      fs.writeFileSync(filePath, nextText);
    }
  }
}
