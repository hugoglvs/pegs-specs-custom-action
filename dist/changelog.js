"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.getChangelog = getChangelog;
exports.generateChangelogAdoc = generateChangelogAdoc;
const exec = __importStar(require("@actions/exec"));
async function getChangelog() {
    const entries = [];
    let output = '';
    const options = {
        listeners: {
            stdout: (data) => {
                output += data.toString();
            }
        },
        silent: true,
        ignoreReturnCode: true // Don't fail if no tags
    };
    // Format: Version|Date|Subject
    // Use --sort=-creatordate to get newest first
    // Note: %(contents:subject) works for annotated tags. For lightweight tags, it might be empty.
    // We try to capture standard tag usage.
    try {
        await exec.exec('git', ['tag', '-n1', '--sort=-creatordate', '--format=%(refname:short)|%(creatordate:short)|%(contents:subject)'], options);
    }
    catch (error) {
        console.warn('Failed to fetch tags for changelog:', error);
        return [];
    }
    const lines = output.trim().split('\n');
    for (const line of lines) {
        if (!line)
            continue;
        const parts = line.split('|');
        if (parts.length >= 3) {
            entries.push({
                version: parts[0].trim(),
                date: parts[1].trim(),
                comment: parts.slice(2).join('|').trim() // Rejoin in case pipe in comment
            });
        }
    }
    return entries;
}
function generateChangelogAdoc(entries) {
    if (entries.length === 0) {
        return '';
    }
    let content = '== Changelog\n\n';
    content += '[cols="1,1,3", options="header"]\n';
    content += '|===\n';
    content += '| Version | Date | Description\n';
    for (const entry of entries) {
        content += `| ${entry.version} | ${entry.date} | ${entry.comment}\n`;
    }
    content += '|===\n';
    return content;
}
